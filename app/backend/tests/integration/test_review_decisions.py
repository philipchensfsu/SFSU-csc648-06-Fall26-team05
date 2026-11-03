"""E08: reviewer decisions. One decision per reviewer per round; change requests
carry a linked comment; the last approval makes the PRD final with one event."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from conftest import add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Olive owns the PRD; Ed edits it; Rae and Ray review it; Ada is the org admin."""
    ada, olive, ed, rae, ray = (make_user() for _ in range(5))
    org = make_org(ada, olive, ed, rae, ray)
    db.execute("update profile set full_name = 'Rae Reviewer' where id = %s", (rae.id,))
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    version = save_version(db, prd, olive)
    revision = db.execute("select revision from prd where id = %s", (prd,)).fetchone()[0]
    r = olive.api("POST", f"/prds/{prd}/reviews",
                  json={"revision": revision, "version_id": version, "reviewer_ids": [rae.id, ray.id]})
    assert r.status_code == 201, r.text
    for user in (rae, ray):  # start each test with empty inboxes
        db.execute("delete from notification where recipient_id = %s", (user.id,))
    return dict(ada=ada, olive=olive, ed=ed, rae=rae, ray=ray, org=org, prd=prd, version=version,
                round=r.json()["round"]["id"])


def decide(team, who, decision="approved", explanation=None, section=None, version=None, round_id=None):
    return team[who].api("PUT", f"/prds/{team['prd']}/reviews/{round_id or team['round']}/decision", json={
        "version_id": version or team["version"], "decision": decision,
        "explanation": explanation, "section_type": section})


def state(db, team):
    return db.execute("select r.state, p.status from review_round r join prd p on p.id = r.prd_id where r.id = %s",
                      (team["round"],)).fetchone()


def events(db, team):
    return [e[0] for e in db.execute("select event_type from prd_event where round_id = %s order by created_at",
                                     (team["round"],)).fetchall()]


def inbox(user):
    return [i["type"] for i in user.api("GET", "/notifications").json()["items"]]


def test_one_approval_notifies_the_owner_and_waits_for_the_rest(team, db):
    r = decide(team, "rae")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "in_review" and body["round"]["state"] == "in_review"
    rae = next(x for x in body["round"]["reviewers"] if x["user_id"] == team["rae"].id)
    assert rae["state"] == "approved" and rae["decided_at"] and rae["explanation"] is None
    assert inbox(team["olive"]) == ["approved"] and inbox(team["ray"]) == [] and inbox(team["ed"]) == []


def test_the_last_approval_makes_the_prd_final_with_one_event(team, db):
    decide(team, "rae")
    r = decide(team, "ray")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "final" and r.json()["round"]["state"] == "approved"
    assert r.json()["round"]["completed_at"]
    assert state(db, team) == ("approved", "final")
    assert events(db, team) == ["submitted", "approved", "round_approved"]
    assert inbox(team["olive"]) == ["round_approved", "approved"]
    assert inbox(team["rae"]) == ["round_approved"] and inbox(team["ray"]) == []


def test_a_change_request_needs_an_explanation(team, db):
    for blank in (None, "", "   "):
        r = decide(team, "rae", "changes_requested", blank)
        assert r.status_code == 422 and r.json()["code"] == "validation_error"
    assert decide(team, "rae", "changes_requested", "x" * 5001).status_code == 422
    assert state(db, team) == ("in_review", "in_review")


def test_a_change_request_is_one_linked_comment_and_one_notification(team, db):
    r = decide(team, "rae", "changes_requested", "Goals are vague", "goals")
    assert r.status_code == 200, r.text
    rae = next(x for x in r.json()["round"]["reviewers"] if x["user_id"] == team["rae"].id)
    assert rae["state"] == "changes_requested" and rae["explanation"] == "Goals are vague"
    assert r.json()["round"]["state"] == "changes_requested" and r.json()["status"] == "in_review"
    [comment] = team["olive"].api("GET", f"/prds/{team['prd']}/comments").json()["items"]
    assert comment["id"] == rae["comment_id"] and comment["section_type"] == "goals"
    assert comment["author"]["name"] == "Rae Reviewer" and comment["version_id"] == team["version"]
    assert events(db, team) == ["submitted", "changes_requested"]
    [item] = team["olive"].api("GET", "/notifications").json()["items"]
    assert item["type"] == "changes_requested" and item["comment_id"] == comment["id"]
    assert inbox(team["ed"]) == []  # no separate comment_added


def test_after_a_change_request_others_can_still_decide_but_it_cant_be_approved(team, db):
    decide(team, "rae", "changes_requested", "Needs metrics")
    assert decide(team, "ray").status_code == 200
    assert state(db, team) == ("changes_requested", "in_review")
    assert events(db, team) == ["submitted", "changes_requested", "approved"]


def test_an_approval_can_carry_a_note(team):
    r = decide(team, "rae", "approved", "Nice work")
    rae = next(x for x in r.json()["round"]["reviewers"] if x["user_id"] == team["rae"].id)
    assert rae["explanation"] == "Nice work" and rae["comment_id"]


@pytest.mark.parametrize("decision, note", [("approved", None), ("changes_requested", "Fix the risks")])
def test_repeating_a_decision_changes_nothing(team, db, decision, note):
    first = decide(team, "rae", decision, note)
    again = decide(team, "rae", decision, note)
    assert again.status_code == 200 and again.json() == first.json()
    assert len(events(db, team)) == 2
    assert db.execute("select count(*) from prd_comment where prd_id = %s", (team["prd"],)).fetchone()[0] == (
        1 if note else 0)


def test_changing_a_decision_is_a_409(team):
    decide(team, "rae")
    for decision, note in (("changes_requested", "Actually no"), ("approved", "Now with a note")):
        r = decide(team, "rae", decision, note)
        assert r.status_code == 409 and r.json()["code"] == "decision_already_made"


@pytest.mark.parametrize("who", ["ada", "ed", "olive"])
def test_people_who_arent_reviewers_cant_decide(team, who):
    r = decide(team, who)
    assert r.status_code == 403 and r.json()["code"] == "forbidden"


def test_a_reviewer_who_became_an_owner_cant_decide(team, db):
    db.execute("update prd_member set role = 'owner' where prd_id = %s and user_id = %s", (team["prd"], team["rae"].id))
    r = decide(team, "rae")
    assert r.status_code == 403 and r.json()["code"] == "owner_cannot_review"


def test_a_reviewer_who_lost_access_cant_decide(team, db):
    db.execute("update organization_member set active = false where user_id = %s", (team["rae"].id,))
    assert decide(team, "rae").status_code == 404


def test_decisions_need_the_rounds_current_version(team, db):
    save_version(db, team["prd"], team["olive"])
    r = decide(team, "rae")
    assert r.status_code == 409 and r.json()["code"] == "stale_version"
    db.execute("update review_round set state = 'superseded' where id = %s", (team["round"],))
    r = decide(team, "rae")
    assert r.status_code == 409 and r.json()["code"] == "round_not_current"


def test_a_round_of_another_prd_is_404(team, db):
    other = org_prd(db, team["org"], team["olive"], "Other")
    r = team["rae"].api("PUT", f"/prds/{other}/reviews/{team['round']}/decision",
                        json={"version_id": team["version"], "decision": "approved"})
    assert r.status_code == 404


def test_simultaneous_last_approvals_finish_the_round_once(team, db):
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(lambda who: decide(team, who).status_code, ["rae", "ray"]))
    assert codes == [200, 200]
    assert state(db, team) == ("approved", "final")
    assert sorted(events(db, team)) == ["approved", "round_approved", "submitted"]


def test_decisions_stay_after_the_reviewer_leaves(team, db):
    decide(team, "rae")
    db.execute("update organization_member set active = false where user_id = %s", (team["rae"].id,))
    [rnd] = team["olive"].api("GET", f"/prds/{team['prd']}/reviews").json()["items"]
    assert {x["user_id"]: x["state"] for x in rnd["reviewers"]}[team["rae"].id] == "approved"


def test_clients_cant_change_slots_directly(team):
    r = team["rae"].rest("PATCH", f"review_slot?round_id=eq.{team['round']}", json={"state": "approved"})
    assert r.status_code in (401, 403) or r.json() == []

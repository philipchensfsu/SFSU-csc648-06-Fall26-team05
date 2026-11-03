"""E11: review_state on PRDs, the approval summary in PRD details, and the
needs_my_approval / waiting_for_approval lists."""

import pytest

from conftest import add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Olive and Otto own the PRD; Rae and Ray review it; Ed edits it; Ada is the org admin."""
    ada, olive, otto, ed, rae, ray = (make_user() for _ in range(6))
    org = make_org(ada, olive, otto, ed, rae, ray)
    db.execute("update profile set full_name = 'Rae Reviewer' where id = %s", (rae.id,))
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, otto, "owner")
    add_to_prd(db, prd, ed, "editor")
    version = save_version(db, prd, olive)
    return dict(ada=ada, olive=olive, otto=otto, ed=ed, rae=rae, ray=ray, org=org, prd=prd, version=version)


def submit(team, db, prd=None, reviewers=("rae", "ray")):
    prd = prd or team["prd"]
    revision, version = db.execute("select revision, current_version_id::text from prd where id = %s", (prd,)).fetchone()
    r = team["olive"].api("POST", f"/prds/{prd}/reviews", json={
        "revision": revision, "version_id": version, "reviewer_ids": [team[w].id for w in reviewers]})
    assert r.status_code == 201, r.text
    return r.json()["round"]["id"]


def decide(team, who, round_id, decision="approved", explanation=None):
    r = team[who].api("PUT", f"/prds/{team['prd']}/reviews/{round_id}/decision",
                      json={"version_id": team["version"], "decision": decision, "explanation": explanation})
    assert r.status_code == 200, r.text


def details(user, prd):
    r = user.api("GET", f"/prds/{prd}")
    assert r.status_code == 200, r.text
    return r.json()


def listed(user, view):
    r = user.api("GET", "/prds", params={"view": view})
    assert r.status_code == 200, r.text
    return [p["id"] for p in r.json()]


def test_a_prd_never_submitted_has_no_review(team):
    prd = details(team["olive"], team["prd"])
    assert prd["review_state"] is None
    assert prd["approval"] == {"round_id": None, "round_no": None, "version_id": None, "state": None,
                               "required_count": 0, "approved_count": 0, "reviewers": []}


def test_the_summary_follows_the_round(team, db):
    rnd = submit(team, db)
    approval = details(team["ed"], team["prd"])["approval"]
    assert approval["round_id"] == rnd and approval["round_no"] == 1 and approval["version_id"] == team["version"]
    assert (approval["state"], approval["required_count"], approval["approved_count"]) == ("in_review", 2, 0)

    decide(team, "rae", rnd, "changes_requested", "Tighten the goals")
    prd = details(team["ed"], team["prd"])
    assert prd["review_state"] == "changes_requested" and prd["status"] == "in_review"
    rae = next(r for r in prd["approval"]["reviewers"] if r["user_id"] == team["rae"].id)
    assert rae["state"] == "changes_requested" and rae["explanation"] == "Tighten the goals"
    assert rae["name"] == "Rae Reviewer"


def test_an_approved_round_keeps_its_counts(team, db):
    rnd = submit(team, db)
    decide(team, "rae", rnd)
    assert details(team["olive"], team["prd"])["approval"]["approved_count"] == 1
    decide(team, "ray", rnd)
    prd = details(team["olive"], team["prd"])
    assert prd["review_state"] == "approved" and prd["status"] == "final"
    assert (prd["approval"]["state"], prd["approval"]["required_count"], prd["approval"]["approved_count"]) == (
        "approved", 2, 2)


def test_a_superseded_round_is_no_longer_the_current_review(team, db):
    submit(team, db)
    db.execute("update review_round set state = 'superseded' where prd_id = %s", (team["prd"],))
    prd = details(team["olive"], team["prd"])
    assert prd["review_state"] is None and prd["approval"]["round_id"] is None


def test_review_state_is_on_every_prd_in_the_list(team, db):
    submit(team, db)
    other = org_prd(db, team["org"], team["olive"], "Draft PRD")
    states = {p["id"]: p["review_state"] for p in team["olive"].api("GET", "/prds").json()}
    assert states[team["prd"]] == "in_review" and states[other] is None


def test_needs_my_approval_lists_prds_waiting_on_my_decision(team, db):
    rnd = submit(team, db)
    assert listed(team["rae"], "needs_my_approval") == [team["prd"]]
    assert listed(team["ray"], "needs_my_approval") == [team["prd"]]
    for who in ("olive", "otto", "ed", "ada"):
        assert listed(team[who], "needs_my_approval") == []
    decide(team, "rae", rnd, "changes_requested", "Not yet")
    # Ray still has to decide, even though Rae asked for changes.
    assert listed(team["rae"], "needs_my_approval") == []
    assert listed(team["ray"], "needs_my_approval") == [team["prd"]]


def test_superseded_rounds_dont_need_approval(team, db):
    submit(team, db)
    db.execute("update review_round set state = 'superseded' where prd_id = %s", (team["prd"],))
    assert listed(team["rae"], "needs_my_approval") == []


def test_reviewers_who_lost_access_dont_see_it(team, db):
    submit(team, db)
    db.execute("update organization_member set active = false where user_id = %s", (team["rae"].id,))
    assert listed(team["rae"], "needs_my_approval") == []


def test_waiting_for_approval_lists_my_prds_with_an_open_round(team, db):
    assert listed(team["olive"], "waiting_for_approval") == []
    rnd = submit(team, db)
    for who in ("olive", "otto"):
        assert listed(team[who], "waiting_for_approval") == [team["prd"]]
    for who in ("ed", "rae", "ada"):
        assert listed(team[who], "waiting_for_approval") == []
    decide(team, "rae", rnd, "changes_requested", "Not yet")
    assert listed(team["olive"], "waiting_for_approval") == [team["prd"]]


def test_approved_prds_arent_waiting(team, db):
    rnd = submit(team, db)
    decide(team, "rae", rnd)
    decide(team, "ray", rnd)
    assert listed(team["olive"], "waiting_for_approval") == []
    assert listed(team["ray"], "needs_my_approval") == []


def test_unknown_views_are_rejected(team):
    r = team["olive"].api("GET", "/prds", params={"view": "everything"})
    assert r.status_code == 422 and r.json()["code"] == "validation_error"

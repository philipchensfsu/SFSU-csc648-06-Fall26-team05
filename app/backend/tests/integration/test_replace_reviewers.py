"""Owners remove or replace a reviewer who hasn't decided on the open round.
Decisions stand, removed slots are kept as history, and the removed and added
reviewers are notified."""

import pytest

from conftest import add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the admin; Olive owns the PRD and Ed edits it; Rae and Ray review it; Gus is in the org but not on it."""
    ada, olive, ed, rae, ray, gus = (make_user() for _ in range(6))
    org = make_org(ada, olive, ed, rae, ray, gus)
    for user, name in ((olive, "Olive Owner"), (rae, "Rae Reviewer"), (ray, "Ray Reviewer"), (gus, "Gus New")):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    version = save_version(db, prd, olive)
    revision = db.execute("select revision from prd where id = %s", (prd,)).fetchone()[0]
    r = olive.api("POST", f"/prds/{prd}/reviews",
                  json={"revision": revision, "version_id": version, "reviewer_ids": [rae.id, ray.id]})
    assert r.status_code == 201, r.text
    return dict(ada=ada, olive=olive, ed=ed, rae=rae, ray=ray, gus=gus, org=org, prd=prd, version=version,
                round=r.json()["round"]["id"])


def path(team, who):
    return f"/prds/{team['prd']}/reviews/{team['round']}/reviewers/{team[who].id}"


def replace(team, who, new, by="olive"):
    return team[by].api("POST", path(team, who) + "/replace", json={"reviewer_id": team[new].id})


def remove(team, who, by="olive"):
    return team[by].api("DELETE", path(team, who))


def decide(team, who, decision="approved", explanation=None):
    r = team[who].api("PUT", f"/prds/{team['prd']}/reviews/{team['round']}/decision",
                      json={"version_id": team["version"], "decision": decision, "explanation": explanation})
    assert r.status_code == 200, r.text


def inbox_types(user):
    return [i["type"] for i in user.api("GET", "/notifications").json()["items"]]


def test_replacing_a_reviewer_keeps_the_old_slot_as_history(team, db):
    r = replace(team, "ray", "gus")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "in_review" and body["round"]["state"] == "in_review"
    assert sorted((x["user_id"], x["state"]) for x in body["round"]["reviewers"]) == sorted(
        [(team["rae"].id, "pending"), (team["gus"].id, "pending")])
    [removed] = body["round"]["removed_reviewers"]
    assert removed["user_id"] == team["ray"].id and removed["name"] == "Ray Reviewer"
    assert removed["reason"] == "replaced" and removed["replaced_by"] == team["gus"].id
    assert removed["removed_by"] == team["olive"].id
    # Gus wasn't on the PRD: added as a viewer, to read it and decide.
    assert db.execute("select role from prd_member where prd_id = %s and user_id = %s",
                      (team["prd"], team["gus"].id)).fetchone() == ("viewer",)
    decide(team, "gus")


def test_the_removed_and_added_reviewers_are_notified(team, db):
    replace(team, "ray", "gus")
    assert "reviewer_changed" in inbox_types(team["ray"]) and "reviewer_changed" in inbox_types(team["gus"])
    assert "reviewer_changed" not in inbox_types(team["olive"]) + inbox_types(team["rae"])
    events = team["olive"].api("GET", f"/prds/{team['prd']}/events", params={"type": "reviewer_changed"}).json()
    assert events["items"][0]["summary"] == "Olive Owner replaced Ray Reviewer with Gus New as a reviewer (round 1)"


def test_removing_the_last_pending_reviewer_approves_the_round(team, db):
    decide(team, "rae")
    r = remove(team, "ray")
    assert r.status_code == 200 and r.json()["status"] == "final" and r.json()["round"]["state"] == "approved"
    summaries = [e["summary"] for e in team["olive"].api("GET", f"/prds/{team['prd']}/events").json()["items"]]
    assert "Olive Owner removed Ray Reviewer as a reviewer (round 1)" in summaries
    assert "Round 1 was approved after Ray Reviewer was taken off the review" in summaries


def test_removing_a_reviewer_while_others_are_pending_keeps_the_round_open(team, db):
    r = remove(team, "ray")
    assert r.status_code == 200 and r.json()["round"]["state"] == "in_review"
    assert [x["user_id"] for x in r.json()["round"]["reviewers"]] == [team["rae"].id]
    assert r.json()["round"]["removed_reviewers"][0]["reason"] == "removed"


def test_decisions_stand(team, db):
    decide(team, "rae", "changes_requested", "Needs metrics")
    for r in (remove(team, "rae"), replace(team, "rae", "gus")):
        assert r.status_code == 409 and r.json()["code"] == "reviewer_already_decided"
    # The change request still blocks; the pending reviewer can still be swapped.
    assert replace(team, "ray", "gus").json()["round"]["state"] == "changes_requested"


def test_the_last_reviewer_can_only_be_replaced(team, db):
    assert remove(team, "ray").status_code == 200
    r = remove(team, "rae")
    assert r.status_code == 409 and r.json()["code"] == "last_reviewer"
    assert replace(team, "rae", "gus").status_code == 200


def test_bad_replacements_are_rejected(team, make_user, db):
    r = replace(team, "ray", "rae")
    assert r.status_code == 409 and r.json()["code"] == "already_a_reviewer"
    r = replace(team, "ray", "olive")
    assert r.status_code == 422 and r.json()["code"] == "owner_cannot_review"
    team["outsider"] = make_user()
    r = replace(team, "ray", "outsider")
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    r = team["olive"].api("DELETE", f"/prds/{team['prd']}/reviews/{team['round']}/reviewers/{team['gus'].id}")
    assert r.status_code == 404


def test_only_owners_and_admins_change_reviewers(team, db):
    assert remove(team, "ray", by="ed").status_code == 403
    assert remove(team, "ray", by="rae").status_code == 403  # a reviewer is a viewer
    assert remove(team, "ray", by="gus").status_code == 404  # not on the PRD
    assert replace(team, "ray", "gus", by="ada").status_code == 200


def test_closed_rounds_cant_change(team, db):
    decide(team, "rae")
    decide(team, "ray")
    r = replace(team, "ray", "gus")
    assert r.status_code == 409 and r.json()["code"] == "round_not_open"


def test_a_deactivated_reviewer_is_kept_as_history_too(team, db):
    r = team["ada"].api("PATCH", f"/organizations/{team['org']}/members/{team['ray'].id}", json={"active": False})
    assert r.status_code == 200, r.text
    [listed] = team["olive"].api("GET", f"/prds/{team['prd']}/reviews").json()["items"]
    [removed] = listed["removed_reviewers"]
    assert removed["user_id"] == team["ray"].id and removed["reason"] == "reviewer_deactivated"
    assert removed["removed_by"] is None

"""Deactivating a member, or removing them from the PRD, drops their pending
review slots (M3 decision on Marco's reviews of #103 and #97): a round left with
only approvals completes, a round left with nobody goes back to draft, and
decisions already made stay. The settling events are system events."""

import pytest

from conftest import org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the admin; Olive owns the PRD; Rae and Ray review it."""
    ada, olive, rae, ray = (make_user() for _ in range(4))
    org = make_org(ada, olive, rae, ray)
    prd = org_prd(db, org, olive, "Team PRD")
    version = save_version(db, prd, olive)
    revision = db.execute("select revision from prd where id = %s", (prd,)).fetchone()[0]
    r = olive.api("POST", f"/prds/{prd}/reviews",
                  json={"revision": revision, "version_id": version, "reviewer_ids": [rae.id, ray.id]})
    assert r.status_code == 201, r.text
    return dict(ada=ada, olive=olive, rae=rae, ray=ray, org=org, prd=prd, version=version,
                round=r.json()["round"]["id"])


def decide(team, who, decision="approved", explanation=None):
    r = team[who].api("PUT", f"/prds/{team['prd']}/reviews/{team['round']}/decision",
                      json={"version_id": team["version"], "decision": decision, "explanation": explanation})
    assert r.status_code == 200, r.text


def deactivate(team, who):
    r = team["ada"].api("PATCH", f"/organizations/{team['org']}/members/{team[who].id}", json={"active": False})
    assert r.status_code == 200, r.text


def remove(team, who):
    r = team["olive"].api("DELETE", f"/prds/{team['prd']}/members/{team[who].id}")
    assert r.status_code == 204, r.text


def owner_notification(team, kind):
    return next(i for i in team["olive"].api("GET", "/notifications").json()["items"] if i["type"] == kind)


def state(db, team):
    return db.execute("select r.state, p.status from review_round r join prd p on p.id = r.prd_id where r.id = %s",
                      (team["round"],)).fetchone()


def slots(db, team):
    return dict(db.execute("select reviewer_id::text, state from review_slot where round_id = %s",
                           (team["round"],)).fetchall())


def test_the_last_pending_reviewer_leaving_completes_an_approved_round(team, db):
    decide(team, "rae")
    deactivate(team, "ray")
    assert slots(db, team) == {team["rae"].id: "approved"}
    assert state(db, team) == ("approved", "final")
    approved = owner_notification(team, "round_approved")
    assert approved["actor_name"] is None
    assert approved["payload"] == {"round_no": 1, "reviewer_id": None, "reason": "reviewer_deactivated",
                                   "removed_reviewer_id": team["ray"].id}
    assert db.execute("select actor_id from prd_event where round_id = %s and event_type = 'round_approved'",
                      (team["round"],)).fetchone()[0] is None


def test_with_nobody_left_the_prd_goes_back_to_draft(team, db):
    deactivate(team, "rae")
    deactivate(team, "ray")
    assert slots(db, team) == {}
    assert state(db, team) == ("superseded", "draft")
    superseded = owner_notification(team, "superseded")
    assert superseded["actor_name"] is None
    assert superseded["payload"]["reason"] == "reviewer_deactivated"
    assert superseded["payload"]["removed_reviewer_id"] == team["ray"].id


def test_a_change_request_still_blocks_approval(team, db):
    decide(team, "rae", "changes_requested", "Needs metrics")
    deactivate(team, "ray")
    assert slots(db, team) == {team["rae"].id: "changes_requested"}
    assert state(db, team) == ("changes_requested", "in_review")


def test_decisions_already_made_stay(team, db):
    decide(team, "rae")
    deactivate(team, "rae")
    assert slots(db, team) == {team["rae"].id: "approved", team["ray"].id: "pending"}
    assert state(db, team) == ("in_review", "in_review")


def test_a_stale_round_is_not_approved(team, db):
    decide(team, "rae")
    save_version(db, team["prd"], team["olive"])  # an edit without E09's continuation
    deactivate(team, "ray")
    assert state(db, team) == ("in_review", "in_review")


def test_removing_a_pending_reviewer_from_the_prd_drops_their_slot(team, db):
    decide(team, "rae")
    remove(team, "ray")
    assert slots(db, team) == {team["rae"].id: "approved"}
    assert state(db, team) == ("approved", "final")
    assert owner_notification(team, "round_approved")["payload"]["reason"] == "reviewer_removed"


def test_removing_everyone_sends_the_prd_back_to_draft(team, db):
    remove(team, "rae")
    remove(team, "ray")
    assert state(db, team) == ("superseded", "draft")
    assert owner_notification(team, "superseded")["payload"]["reason"] == "reviewer_removed"


def test_an_org_admin_removed_from_the_prd_still_reviews(team, db):
    r = team["olive"].api("PUT", f"/prds/{team['prd']}/members/{team['ada'].id}", json={"role": "viewer"})
    assert r.status_code == 200, r.text
    db.execute("insert into review_slot (round_id, prd_id, reviewer_id) values (%s, %s, %s)",
               (team["round"], team["prd"], team["ada"].id))
    remove(team, "ada")
    assert slots(db, team)[team["ada"].id] == "pending"

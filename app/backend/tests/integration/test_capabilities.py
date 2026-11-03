"""E03 capabilities: PRD details say what the caller may do, and the flags agree
with what the API actually allows."""

import pytest

from conftest import EMPTY_DOC, add_to_prd, org_prd, save_version

FLAGS = ("can_view", "can_comment", "can_edit", "can_delete", "can_assign", "can_submit_review", "can_approve",
         "can_request_ai")


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vic views it; Rae and Ray are in the org, not on it."""
    ada, olive, ed, vic, rae, ray = (make_user() for _ in range(6))
    org = make_org(ada, olive, ed, vic, rae, ray)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vic, "viewer")
    version = save_version(db, prd, olive)
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, rae=rae, ray=ray, org=org, prd=prd, version=version)


# The E03 flags this file covers; E14/A08 flags are tested in test_prd_read_model.py.
E03_FLAGS = ("can_view", "can_comment", "can_edit", "can_delete", "can_assign", "can_submit_review", "can_approve",
             "can_request_ai")


def caps(user, prd):
    r = user.api("GET", f"/prds/{prd}")
    assert r.status_code == 200, r.text
    return {name: value for name, value in r.json()["capabilities"].items() if name in E03_FLAGS}


def on(flags):
    return {flag: flag in flags for flag in FLAGS}


def submit(team, db, reviewers=("rae", "ray")):
    revision, version = db.execute("select revision, current_version_id::text from prd where id = %s",
                                   (team["prd"],)).fetchone()
    r = team["olive"].api("POST", f"/prds/{team['prd']}/reviews", json={
        "revision": revision, "version_id": version, "reviewer_ids": [team[w].id for w in reviewers]})
    assert r.status_code == 201, r.text
    return r.json()["round"]["id"]


def decide(team, who, round_id, decision="approved", explanation=None):
    return team[who].api("PUT", f"/prds/{team['prd']}/reviews/{round_id}/decision",
                         json={"version_id": team["version"], "decision": decision, "explanation": explanation})


MANAGE = {"can_view", "can_comment", "can_edit", "can_delete", "can_assign", "can_submit_review", "can_request_ai"}


@pytest.mark.parametrize("who, flags", [
    ("olive", MANAGE),
    ("ada", MANAGE),
    ("ed", {"can_view", "can_comment", "can_edit", "can_request_ai"}),
    ("vic", {"can_view", "can_comment"}),
])
def test_flags_follow_the_callers_role(team, who, flags):
    assert caps(team[who], team["prd"]) == on(flags)


@pytest.mark.parametrize("who", ["ed", "vic"])
def test_the_api_refuses_what_the_flags_deny(team, db, who):
    flags = caps(team[who], team["prd"])
    revision = db.execute("select revision from prd where id = %s", (team["prd"],)).fetchone()[0]
    edit = team[who].api("PUT", f"/prds/{team['prd']}", json={"revision": revision, "title": "Changed"})
    assert (edit.status_code == 200) == flags["can_edit"]
    invite = team[who].api("PUT", f"/prds/{team['prd']}/members/{team['rae'].id}", json={"role": "viewer"})
    assert (invite.status_code == 200) == flags["can_assign"]
    r = team[who].api("POST", f"/prds/{team['prd']}/reviews", json={
        "revision": revision + (1 if flags["can_edit"] else 0), "version_id": team["version"],
        "reviewer_ids": [team["rae"].id]})
    assert (r.status_code == 201) == flags["can_submit_review"]
    assert team[who].api("DELETE", f"/prds/{team['prd']}").status_code == (204 if flags["can_delete"] else 404)


def test_people_who_cant_see_the_prd_get_no_capabilities(team, db):
    assert team["rae"].api("GET", f"/prds/{team['prd']}").status_code == 404
    assert db.execute("select prd_capabilities(%s)", (team["prd"],)).fetchone()[0] is None  # no caller


def test_unsaved_and_empty_prds_cant_be_submitted(team, db):
    unsaved = org_prd(db, team["org"], team["olive"], "Unsaved")
    assert caps(team["olive"], unsaved)["can_submit_review"] is False
    save_version(db, team["prd"], team["olive"], EMPTY_DOC)
    assert caps(team["olive"], team["prd"])["can_submit_review"] is False


def test_during_a_review_only_pending_reviewers_can_approve(team, db):
    round_id = submit(team, db)
    assert caps(team["olive"], team["prd"])["can_submit_review"] is False
    rae = caps(team["rae"], team["prd"])
    assert rae == on({"can_view", "can_comment", "can_approve"})  # added as a viewer
    for who in ("olive", "ed", "vic", "ada"):
        assert caps(team[who], team["prd"])["can_approve"] is False, who
    assert decide(team, "rae", round_id, "changes_requested", "Not yet").status_code == 200
    assert caps(team["rae"], team["prd"])["can_approve"] is False
    # Ray still has a decision to make after Rae's change request, and the API agrees.
    assert caps(team["ray"], team["prd"])["can_approve"] is True
    assert decide(team, "ray", round_id).status_code == 200


def test_a_newer_version_stops_approval(team, db):
    round_id = submit(team, db)
    save_version(db, team["prd"], team["olive"])
    assert caps(team["rae"], team["prd"])["can_approve"] is False
    assert decide(team, "rae", round_id).status_code == 409


def test_an_approved_prd_cant_be_submitted_again(team, db):
    round_id = submit(team, db)
    decide(team, "rae", round_id)
    decide(team, "ray", round_id)
    assert caps(team["olive"], team["prd"])["can_submit_review"] is False
    assert caps(team["ray"], team["prd"])["can_approve"] is False


def test_a_reviewer_who_became_an_owner_cant_approve(team, db):
    submit(team, db)
    db.execute("update prd_member set role = 'owner' where prd_id = %s and user_id = %s", (team["prd"], team["rae"].id))
    assert caps(team["rae"], team["prd"])["can_approve"] is False


def test_in_a_one_person_org_the_owner_can_approve(make_user, make_org, db):
    solo = make_user()
    org = make_org(solo)
    prd = org_prd(db, org, solo, "Solo PRD")
    version = save_version(db, prd, solo)
    revision = db.execute("select revision from prd where id = %s", (prd,)).fetchone()[0]
    r = solo.api("POST", f"/prds/{prd}/reviews", json={"revision": revision, "version_id": version,
                                                       "reviewer_ids": [solo.id]})
    assert r.status_code == 201, r.text
    assert caps(solo, prd)["can_approve"] is True


@pytest.mark.parametrize("status", ["final", "assigned"])
def test_after_approval_only_owners_can_edit(team, db, status):
    db.execute("update prd set status = %s where id = %s", (status, team["prd"]))
    assert caps(team["olive"], team["prd"])["can_edit"] is True
    for who in ("ed", "ada"):
        flags = caps(team[who], team["prd"])
        assert (flags["can_edit"], flags["can_request_ai"]) == (False, False), who


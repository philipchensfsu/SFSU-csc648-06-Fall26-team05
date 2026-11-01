"""E05 detail read model on GET /api/prds/{id} (20261101030000_prd_read_model.sql)
against the local stack: current version, project (id and name only), owners
(names, no emails), changed_since_approval, and the E14/A08 capability flags
added to Vineela's E03 capabilities."""

import json

import pytest
from supabase import create_client

from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd
from prd_save import save_prd
from test_accept_proposal import verified
from test_work_status import approve, doc


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


@pytest.fixture
def team(db, service, make_user, make_org):
    """Admin Ada, owner Olive (with a project), editor Ed, viewer Vi and
    reviewer Rae, plus an outsider in another org."""
    ada, olive, ed, vi, rae = (make_user() for _ in range(5))
    make_org(ada, olive, ed, vi, rae)
    outsider = make_user()
    project = olive.api("POST", "/projects", json={"name": "Campus apps"}).json()["id"]
    prd = olive.api("POST", "/prds", json={"title": "Read model", "project_id": project}).json()["id"]
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vi, "viewer")
    return dict(ada=ada, olive=olive, ed=ed, vi=vi, rae=rae, outsider=outsider, prd=prd, project=project)


def detail(user, prd):
    r = user.api("GET", f"/prds/{prd}")
    assert r.status_code == 200, r.text
    return r.json()


def submit(db, team):
    revision, version = db.execute("select revision, current_version_id::text from prd where id = %s",
                                   (team["prd"],)).fetchone()
    r = team["olive"].api("POST", f"/prds/{team['prd']}/reviews",
                          json={"revision": revision, "version_id": version, "reviewer_ids": [team["rae"].id]})
    assert r.status_code == 201, r.text
    return r.json()["round"]["id"]


def test_before_and_after_the_first_save(team, db, service):
    body = detail(team["olive"], team["prd"])
    assert body["current_version"] is None and body["changed_since_approval"] is False
    assert body["project"] == {"id": team["project"], "name": "Campus apps"}
    assert [o["id"] for o in body["owners"]] == [team["olive"].id]

    save_prd(service, verified(service, team["olive"]), team["prd"], 1, content_json=doc("First"))
    version = db.execute("select current_version_id::text from prd where id = %s", (team["prd"],)).fetchone()[0]
    assert detail(team["olive"], team["prd"])["current_version"] == {"id": version, "version_no": 1}


def test_a_viewer_sees_the_folder_name_and_owners_without_emails(team, db):
    # Vi can't read Olive's project row directly, but sees which folder the PRD is in.
    assert team["vi"].rest("GET", f"project?id=eq.{team['project']}").json() == []
    body = detail(team["vi"], team["prd"])
    assert body["project"] == {"id": team["project"], "name": "Campus apps"}
    assert body["owners"] == [{"id": team["olive"].id, "name": body["owners"][0]["name"]}]
    assert "@" not in json.dumps(body["owners"])


def test_people_who_cant_see_the_prd_get_404(team):
    assert team["outsider"].api("GET", f"/prds/{team['prd']}").status_code == 404


def test_routing_and_classification_flags_follow_can_manage(team):
    flags = {who: detail(team[who], team["prd"])["capabilities"] for who in ("olive", "ada", "ed", "vi")}
    assert [flags[w]["can_set_routing"] for w in ("olive", "ada", "ed", "vi")] == [True, True, False, False]
    assert [flags[w]["can_request_classification"] for w in ("olive", "ada", "ed", "vi")] == [True, True, False, False]


def test_the_review_suggestions_flag_is_owner_only_and_needs_current_comments(team, db, service):
    save_prd(service, verified(service, team["olive"]), team["prd"], 1, content_json=doc("First"))
    flag = lambda who: detail(team[who], team["prd"])["capabilities"]["can_request_review_suggestions"]
    assert flag("olive") is False  # no comments yet
    version = db.execute("select current_version_id::text from prd where id = %s", (team["prd"],)).fetchone()[0]
    assert team["vi"].api("POST", f"/prds/{team['prd']}/comments", json={"version_id": version, "body": "Add metrics"}
                          ).status_code == 201
    # Owner yes; the org admin and editor can request other AI (can_request_ai) but not this.
    assert [flag(w) for w in ("olive", "ada", "ed", "vi")] == [True, False, False, False]
    assert detail(team["ed"], team["prd"])["capabilities"]["can_request_ai"] is True


def test_work_status_flag_and_changed_since_approval_follow_e14(team, db, service):
    save_prd(service, verified(service, team["olive"]), team["prd"], 1, content_json=doc("First"))
    round_id = submit(db, team)
    assert detail(team["olive"], team["prd"])["capabilities"]["can_update_work_status"] is False  # not approved yet

    approve(db, {**team, "round": round_id})
    caps = {who: detail(team[who], team["prd"])["capabilities"]["can_update_work_status"] for who in ("olive", "ada", "ed")}
    assert caps == {"olive": True, "ada": True, "ed": False}
    assert detail(team["olive"], team["prd"])["changed_since_approval"] is False

    # An owner's confirmed edit after approval (E09): back in review, flagged as changed, work status frozen.
    revision = db.execute("select revision from prd where id = %s", (team["prd"],)).fetchone()[0]
    save_prd(service, verified(service, team["olive"]), team["prd"], revision, content_json=doc("Edited"),
             confirmed_reviewer_ids=[team["rae"].id])
    body = detail(team["olive"], team["prd"])
    assert body["changed_since_approval"] is True and body["capabilities"]["can_update_work_status"] is False
    assert body["current_version"]["version_no"] == 2 and body["approval"]["round_no"] == 2

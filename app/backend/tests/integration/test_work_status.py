"""E14 work status (20261101032200_work_status.sql) against the local stack,
through PUT /api/prds/{id}/work-status. Approval is set up the way E08
leaves it (round approved with completed_at, PRD final), so this doesn't
depend on #94's decision route.

M3 rule (Vineela and Marco, 2026-10-31): owners and org admins only;
implementer assignments are deferred.
"""

import pytest
from supabase import create_client

from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd
from prd_save import save_prd
from test_accept_proposal import verified


def doc(text):
    return {"type": "doc", "content": [{"type": "section", "attrs": {"type": "goals"},
                                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}]}


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


@pytest.fixture
def team(db, service, make_user, make_org):
    """Admin Ada (org admin, not on the PRD), owners Olive and Otto, editor
    Ed, viewer Vi and reviewer Rae. The PRD is saved and submitted to Rae."""
    ada, olive, otto, ed, vi, rae = (make_user() for _ in range(6))
    make_org(ada, olive, otto, ed, vi, rae)
    prd = olive.api("POST", "/prds", json={"title": "Approved PRD"}).json()["id"]
    add_to_prd(db, prd, otto, "owner")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vi, "viewer")
    save_prd(service, verified(service, olive), prd, 1, content_json=doc("First"))
    revision, version = db.execute("select revision, current_version_id::text from prd where id = %s",
                                   (prd,)).fetchone()
    r = olive.api("POST", f"/prds/{prd}/reviews", json={"revision": revision, "version_id": version,
                                                       "reviewer_ids": [rae.id]})
    assert r.status_code == 201, r.text
    return dict(prd=prd, ada=ada, olive=olive, otto=otto, ed=ed, vi=vi, rae=rae, round=r.json()["round"]["id"])


def approve(db, team):
    db.execute("update review_slot set state = 'approved', decided_at = now() where round_id = %s", (team["round"],))
    db.execute("update review_round set state = 'approved', completed_at = now() where id = %s", (team["round"],))
    db.execute("update prd set status = 'final' where id = %s", (team["prd"],))


def put(user, team, frm, to):
    return user.api("PUT", f"/prds/{team['prd']}/work-status", json={"from": frm, "to": to})


def snapshot(db, prd):
    return db.execute("select revision, status, current_version_id, (select count(*) from prd_version where prd_id = %s), "
                      "(select count(*) from review_round where prd_id = %s) from prd where id = %s",
                      (prd, prd, prd)).fetchone()


def work_status(db, prd):
    return db.execute("select work_status from prd where id = %s", (prd,)).fetchone()[0]


def events(db, prd):
    return db.execute("select event_type, actor_id::text, payload from prd_event where prd_id = %s "
                      "and event_type = 'work_status_changed' order by created_at", (prd,)).fetchall()


def inbox(user):
    return [n["type"] for n in user.api("GET", "/notifications").json()["items"]]


def test_work_status_changes_only_while_approved(team, db):
    r = put(team["olive"], team, "not_started", "in_progress")  # in review, not approved yet
    assert (r.status_code, r.json()["code"]) == (409, "not_approved")
    assert work_status(db, team["prd"]) == "not_started" and events(db, team["prd"]) == []


def test_an_owner_moves_it_without_touching_revision_versions_or_review(team, db):
    approve(db, team)
    before = snapshot(db, team["prd"])
    r = put(team["olive"], team, "not_started", "in_progress")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["work_status"] == "in_progress" and body["can_update_work_status"] is True
    assert body["changed_since_approval"] is False and body["my_role"] == "owner"
    assert snapshot(db, team["prd"]) == before  # same revision, status, version and rounds
    assert events(db, team["prd"]) == [("work_status_changed", team["olive"].id,
                                        {"from": "not_started", "to": "in_progress", "status": "in_progress"})]
    assert "work_status_changed" not in inbox(team["otto"])  # only "done" notifies


def test_compare_and_set_and_allowed_transitions(team, db):
    approve(db, team)
    r = put(team["olive"], team, "not_started", "done")
    assert (r.status_code, r.json()["code"]) == (422, "invalid_transition")
    assert put(team["olive"], team, "not_started", "in_progress").status_code == 200
    r = put(team["otto"], team, "not_started", "in_progress")  # Otto still saw not_started
    assert (r.status_code, r.json()["code"]) == (409, "stale_work_status")
    assert put(team["otto"], team, "in_progress", "done").status_code == 200
    assert put(team["olive"], team, "done", "in_progress").status_code == 200  # reopening is allowed
    r = team["olive"].api("PUT", f"/prds/{team['prd']}/work-status", json={"from": "in_progress", "to": "shipped"})
    assert r.status_code == 422
    assert [e[2]["to"] for e in events(db, team["prd"])] == ["in_progress", "done", "in_progress"]


def test_owners_and_org_admins_only(team, db):
    approve(db, team)
    for who in ("ed", "vi", "rae"):  # editor, viewer, reviewer (now a viewer)
        r = put(team[who], team, "not_started", "in_progress")
        assert (r.status_code, r.json()["code"]) == (403, "forbidden"), who
    r = put(team["ada"], team, "not_started", "in_progress")  # org admin, not on the PRD
    assert r.status_code == 200 and r.json()["my_role"] == "org_admin"


def test_done_notifies_the_owners_except_the_actor(team, db):
    approve(db, team)
    assert put(team["olive"], team, "not_started", "in_progress").status_code == 200
    assert put(team["olive"], team, "in_progress", "done").status_code == 200
    assert "work_status_changed" in inbox(team["otto"])
    assert "work_status_changed" not in inbox(team["olive"])


def test_clients_cannot_write_the_column_directly(team, db):
    approve(db, team)
    r = team["olive"].rest("PATCH", f"prd?id=eq.{team['prd']}", json={"work_status": "done"})
    assert r.status_code >= 400
    assert work_status(db, team["prd"]) == "not_started"


def test_an_edit_after_approval_freezes_it_until_reapproved(team, db, service):
    approve(db, team)
    assert put(team["olive"], team, "not_started", "in_progress").status_code == 200
    revision = db.execute("select revision from prd where id = %s", (team["prd"],)).fetchone()[0]
    save_prd(service, verified(service, team["olive"]), team["prd"], revision, content_json=doc("Edited"),
             confirmed_reviewer_ids=[team["rae"].id])  # E09: back to in_review, new round
    r = put(team["olive"], team, "in_progress", "done")
    assert (r.status_code, r.json()["code"]) == (409, "not_approved")
    assert work_status(db, team["prd"]) == "in_progress"  # kept, frozen
    flags = team["olive"].rest("POST", "rpc/prd_changed_since_approval", json={"target_prd": team["prd"]}).json()
    assert flags is True

    # Approve the new round: changed_since_approval clears and the status can move again.
    new_round = db.execute("select id::text from review_round where prd_id = %s and state <> 'superseded'",
                           (team["prd"],)).fetchone()[0]
    approve(db, {**team, "round": new_round})
    r = put(team["olive"], team, "in_progress", "done")
    assert r.status_code == 200 and r.json()["changed_since_approval"] is False

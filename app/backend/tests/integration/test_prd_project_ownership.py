"""A PRD can only sit in a project owned by the PRD's owner (issue #44), through
the API and directly through the Data API, for creates and for updates."""

import httpx

from conftest import ANON_KEY, SUPABASE_URL

MISSING = "00000000-0000-0000-0000-000000000000"


def project(user, name="Project"):
    r = user.api("POST", "/projects", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def prd_rows(db, title):
    return db.execute("select count(*) from prd where title = %s", (title,)).fetchone()[0]


def test_owner_creates_prds_in_own_project_or_none(make_user):
    alice = make_user()
    assert alice.api("POST", "/prds", json={"title": "In project", "project_id": project(alice)}).status_code == 201
    assert alice.api("POST", "/prds", json={"title": "No project", "project_id": None}).status_code == 201


def test_cannot_create_a_prd_in_someone_elses_project(make_user, db):
    alice, ben, admin = make_user(), make_user(), make_user("admin")
    alices_project = project(alice)
    assert ben.api("POST", "/prds", json={"title": "it-api", "project_id": alices_project}).status_code == 404
    r = ben.rest("POST", "prd", json={"title": "it-rest", "owner_id": ben.id, "project_id": alices_project})
    assert r.status_code == 403
    # Legacy admins see every PRD but still can't file one under another user's project.
    assert admin.api("POST", "/prds", json={"title": "it-adm", "project_id": alices_project}).status_code == 404
    r = admin.rest("POST", "prd", json={"title": "it-adm-rest", "owner_id": admin.id, "project_id": alices_project})
    assert r.status_code == 403
    assert sum(prd_rows(db, t) for t in ("it-api", "it-rest", "it-adm", "it-adm-rest")) == 0


def test_missing_project_is_404(make_user, db):
    alice = make_user()
    assert alice.api("POST", "/prds", json={"title": "it-missing", "project_id": MISSING}).status_code == 404
    assert prd_rows(db, "it-missing") == 0


def test_cannot_move_a_prd_into_someone_elses_project(make_user, db):
    alice, ben = make_user(), make_user()
    alices_project = project(alice)
    bens_prd = ben.rest("POST", "prd", json={"title": "Ben's", "owner_id": ben.id}).json()[0]["id"]
    assert ben.rest("PATCH", f"prd?id=eq.{bens_prd}", json={"project_id": alices_project}).status_code == 403
    assert db.execute("select project_id from prd where id = %s", (bens_prd,)).fetchone()[0] is None


def test_owner_moves_a_prd_between_own_projects(make_user):
    alice = make_user()
    first, second = project(alice, "First"), project(alice, "Second")
    prd = alice.api("POST", "/prds", json={"title": "Movable", "project_id": first}).json()["id"]
    r = alice.rest("PATCH", f"prd?id=eq.{prd}", json={"project_id": second})
    assert r.status_code == 200 and r.json()


def test_admin_edits_but_cannot_move_or_take_over_a_prd(make_user):
    alice, admin = make_user(), make_user("admin")
    alices_project, admins_project = project(alice), project(admin)
    prd = alice.api("POST", "/prds", json={"title": "Alice's", "project_id": alices_project}).json()["id"]
    r = admin.rest("PATCH", f"prd?id=eq.{prd}", json={"title": "Edited by admin"})
    assert r.status_code == 200 and r.json()
    assert admin.rest("PATCH", f"prd?id=eq.{prd}", json={"project_id": admins_project}).status_code == 403
    assert admin.rest("PATCH", f"prd?id=eq.{prd}", json={"owner_id": admin.id}).status_code == 403


def test_ownership_helper_is_closed_to_signed_out_callers_and_reveals_nothing(make_user):
    alice, ben = make_user(), make_user()
    alices_project = project(alice)
    body = {"target_project_id": alices_project, "target_owner_id": alice.id}
    r = httpx.post(f"{SUPABASE_URL}/rest/v1/rpc/project_matches_owner", headers={"apikey": ANON_KEY}, json=body)
    assert r.status_code in (401, 403, 404)
    r = ben.rest("POST", "rpc/project_matches_owner", json=body)
    assert r.status_code == 200 and r.json() is False

"""PUT /api/prds/{id} through the S03 save, against the local stack.

Runs only when the API runs with PRD_SAVE_V2=true. The tests run inside the
API's container, so they read the same setting (kept as LOCAL_PRD_SAVE_V2
by tests/conftest.py). With it off, PUT is the
legacy update, which the other integration tests cover.
"""

import json
import os
from pathlib import Path

import pytest

from conftest import add_to_prd, org_prd

pytestmark = pytest.mark.skipif(os.environ.get("LOCAL_PRD_SAVE_V2", "").lower() not in ("true", "1", "on", "yes"),
                                reason="the API isn't running with PRD_SAVE_V2=true")

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
CASE = json.loads((FIXTURES / "minimal_single_section.json").read_text(encoding="utf-8"))
DOC = CASE["document"]
LEGACY = {"description": "old", "sections": [{"type": "problem", "title": "Problem", "html": "<p>old</p>"}]}


def versions(db, prd):
    return db.execute("select version_no, created_by::text, change_summary from prd_version where prd_id = %s "
                      "order by version_no", (prd,)).fetchall()


def test_owner_saves_partially_with_a_version_and_server_text(make_user, db):
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Draft"}).json()

    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 1, "title": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Renamed" and r.json()["revision"] == 2 and r.json()["my_role"] == "owner"

    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 2, "content_json": DOC, "description": "Short"})
    saved = r.json()
    assert r.status_code == 200 and saved["title"] == "Renamed"  # untouched fields stay
    assert saved["description"] == "Short" and saved["doc_schema_version"] == 2
    assert saved["content_text"] == CASE["expect"]["content_text"]
    assert versions(db, prd["id"]) == [(1, alice.id, "Edited title"), (2, alice.id, "Edited description, problem")]

    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 3, "description": None})
    assert r.status_code == 200 and r.json()["description"] is None
    assert alice.api("GET", f"/prds/{prd['id']}").json()["description"] is None


def test_legacy_content_status_and_client_text_are_refused(make_user, db):
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Draft"}).json()
    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 1, "content_json": LEGACY})
    assert r.status_code == 422 and r.json()["code"] == "invalid_document" and r.json()["errors"]
    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 1, "title": "x", "status": "in_review"})
    assert (r.status_code, r.json()["code"]) == (422, "status_not_allowed")
    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": 1, "content_json": DOC, "content_text": "mine"})
    assert r.status_code == 422
    assert db.execute("select revision, status from prd where id = %s", (prd["id"],)).fetchone() == (1, "draft")
    assert versions(db, prd["id"]) == []


def test_roles_revision_and_approved_status(make_user, make_org, db):
    owner, viewer, outsider = make_user(), make_user(), make_user()
    prd = org_prd(db, make_org(owner, viewer), owner, "Shared")
    add_to_prd(db, prd, viewer, "viewer")
    r = viewer.api("PUT", f"/prds/{prd}", json={"revision": 1, "title": "Taken"})
    assert (r.status_code, r.json()["code"]) == (403, "forbidden")
    assert outsider.api("PUT", f"/prds/{prd}", json={"revision": 1, "title": "Taken"}).status_code == 404
    assert owner.api("PUT", f"/prds/{prd}", json={"revision": 1, "title": "Mine"}).status_code == 200
    r = owner.api("PUT", f"/prds/{prd}", json={"revision": 1, "title": "Stale"})
    assert (r.status_code, r.json()["code"]) == (409, "stale_revision")
    db.execute("update prd set status = 'final' where id = %s", (prd,))
    r = owner.api("PUT", f"/prds/{prd}", json={"revision": 2, "title": "After approval"})
    assert (r.status_code, r.json()["code"]) == (409, "review_integration_pending")


def test_accepting_a_proposal_through_put(make_user, db, monkeypatch):
    # A preview staged in this process with a fake model (as in
    # test_accept_proposal.py), then accepted through the real route.
    from supabase import create_client

    from conftest import SERVICE_KEY, SUPABASE_URL
    from test_accept_proposal import previewed

    monkeypatch.setenv("AI_ENABLED", "true")
    alice, bob = make_user(), make_user()
    prd, body = previewed(alice, create_client(SUPABASE_URL, SERVICE_KEY))
    proposal = body["proposal"]
    accept = {"revision": body["base_revision"], "title": proposal["title"], "description": proposal["description"],
              "content_json": proposal["content_json"], "generation_record_id": body["generation_record_id"]}

    # Someone else's proposal, or an unknown one, is unavailable. (The
    # proposal is checked before the save's access check, so an outsider gets
    # the same 409 for any PRD id: it doesn't reveal that the PRD exists.)
    r = bob.api("PUT", f"/prds/{prd['id']}", json=accept)
    assert (r.status_code, r.json()["code"]) == (409, "proposal_unavailable")
    unknown = {**accept, "generation_record_id": "33333333-3333-4333-8333-333333333333"}
    r = alice.api("PUT", f"/prds/{prd['id']}", json=unknown)
    assert (r.status_code, r.json()["code"]) == (409, "proposal_unavailable")

    r = alice.api("PUT", f"/prds/{prd['id']}", json=accept)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["revision"] == body["base_revision"] + 1 and saved["title"] == proposal["title"]
    assert '"ai_generated"' in json.dumps(saved["content_json"])  # sections accepted unchanged are marked
    origin, record = db.execute("select v.origin, v.generation_record_id::text from prd p join prd_version v "
                                "on v.id = p.current_version_id where p.id = %s", (prd["id"],)).fetchone()
    assert (origin, record) == ("ai_generated", body["generation_record_id"])

    # A retry after a lost response gets the saved state back; a second use doesn't save twice.
    r = alice.api("PUT", f"/prds/{prd['id']}", json=accept)
    assert r.status_code == 200 and r.json()["revision"] == saved["revision"]
    assert len(versions(db, prd["id"])) == 1


def test_a_stale_proposal_is_a_409(make_user, monkeypatch):
    from supabase import create_client

    from conftest import SERVICE_KEY, SUPABASE_URL
    from test_accept_proposal import previewed

    monkeypatch.setenv("AI_ENABLED", "true")
    alice = make_user()
    prd, body = previewed(alice, create_client(SUPABASE_URL, SERVICE_KEY))
    assert alice.api("PUT", f"/prds/{prd['id']}", json={"revision": body["base_revision"], "title": "Moved on"}
                     ).status_code == 200
    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": body["base_revision"] + 1,
                                                    "content_json": body["proposal"]["content_json"],
                                                    "generation_record_id": body["generation_record_id"]})
    assert (r.status_code, r.json()["code"]) == (409, "stale_revision")

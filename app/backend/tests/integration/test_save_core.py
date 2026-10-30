"""S03 save core (prd_save.save_prd and the save_prd database function)
against the local stack with E03's per-PRD roles.

The save isn't wired into PUT yet, so it runs in this process with the
service client, exactly as the route will: the actor is the user object
Supabase Auth returns for the caller's token, never an id from a request.
"""

import json
from pathlib import Path

import pytest
from supabase import create_client

from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from prd_save import SaveError, save_prd

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DOC = json.loads((FIXTURES / "minimal_single_section.json").read_text(encoding="utf-8"))["document"]


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def verified(service, user):
    """What get_current_user puts in auth["user"] for this user's token."""
    return service.auth.get_user(user.token).user


@pytest.fixture
def cast(make_user, make_org, db):
    owner, editor, viewer, admin, member, outsider = (make_user() for _ in range(6))
    legacy_admin = make_user("admin")
    org = make_org(admin, owner, editor, viewer, member)
    make_org(outsider)
    prd = org_prd(db, org, owner, "Roles")
    add_to_prd(db, prd, editor, "editor")
    add_to_prd(db, prd, viewer, "viewer")
    return dict(prd=prd, owner=owner, editor=editor, viewer=viewer, admin=admin, member=member,
                outsider=outsider, legacy_admin=legacy_admin)


def row(db, prd):
    return db.execute("select title, content_json, status, revision from prd where id = %s", (prd,)).fetchone()


def versions(db, prd):
    return db.execute("select version_no, saved_revision, created_by::text, origin, changed_sections, change_summary "
                      "from prd_version where prd_id = %s order by version_no", (prd,)).fetchall()


@pytest.mark.parametrize("who", ["owner", "editor", "admin"])
def test_owners_editors_and_org_admins_save_with_a_version(cast, db, service, who):
    user = cast[who]
    saved = save_prd(service, verified(service, user), cast["prd"], 1, title="Edited", content_json=DOC)
    assert saved["revision"] == 2 and saved["status"] == "draft" and saved["doc_schema_version"] == 2
    [(no, rev, by, origin, sections, summary)] = versions(db, cast["prd"])
    assert (no, rev, by, origin) == (1, 2, user.id, "pm_edit")
    assert sections == [s["attrs"]["type"] for s in DOC["content"]]
    assert summary.startswith("Edited title")


@pytest.mark.parametrize("who, status, code", [
    ("viewer", 403, "forbidden"),
    ("member", 404, "not_found"),  # in the org, not on the PRD
    ("outsider", 404, "not_found"),
    ("legacy_admin", 404, "not_found"),  # profile.role admin grants nothing since E03
])
def test_everyone_else_is_refused_and_nothing_changes(cast, db, service, who, status, code):
    before = row(db, cast["prd"])
    with pytest.raises(SaveError) as info:
        save_prd(service, verified(service, cast[who]), cast["prd"], 1, title="Taken")
    assert (info.value.status_code, info.value.code) == (status, code)
    assert row(db, cast["prd"]) == before and versions(db, cast["prd"]) == []


def test_in_review_prds_save_and_keep_their_status(cast, db, service):
    db.execute("update prd set status = 'in_review' where id = %s", (cast["prd"],))
    saved = save_prd(service, verified(service, cast["owner"]), cast["prd"], 1, title="Edited in review")
    assert saved["status"] == "in_review" and saved["revision"] == 2


@pytest.mark.parametrize("status", ["final", "assigned"])
def test_approved_prds_are_refused_until_reapproval_exists(cast, db, service, status):
    # D9: an edit must not leave an approval standing, and E09 isn't built.
    db.execute("update prd set status = %s where id = %s", (status, cast["prd"]))
    before = row(db, cast["prd"])
    with pytest.raises(SaveError) as info:
        save_prd(service, verified(service, cast["owner"]), cast["prd"], 1, title="Edited after approval")
    assert (info.value.status_code, info.value.code) == (409, "review_integration_pending")
    assert row(db, cast["prd"]) == before and versions(db, cast["prd"]) == []


def test_stale_revision_is_a_409(cast, db, service):
    user = verified(service, cast["owner"])
    save_prd(service, user, cast["prd"], 1, title="First")
    with pytest.raises(SaveError) as info:
        save_prd(service, user, cast["prd"], 1, title="Second")
    assert info.value.code == "stale_revision" and row(db, cast["prd"])[0] == "First"


def test_browsers_cannot_call_the_save_function(cast):
    body = {"p_actor": cast["owner"].id, "p_prd_id": cast["prd"], "p_base_revision": 1, "p_set_title": True,
            "p_title": "Direct", "p_set_description": False, "p_description": None, "p_set_content": False,
            "p_content_json": None, "p_content_text": None, "p_ai_generation_ids": [], "p_origin": "pm_edit",
            "p_generation_record_id": None}
    assert cast["owner"].rest("POST", "rpc/save_prd", json=body).status_code in (401, 403, 404)


def test_an_editor_who_saved_can_still_be_deleted(cast, db, service):
    save_prd(service, verified(service, cast["editor"]), cast["prd"], 1, title="Editor's change")
    db.execute("delete from profile where id = %s", (cast["editor"].id,))
    assert versions(db, cast["prd"])[0][2] is None  # history kept, author cleared

"""S04 version history against the local stack: versions written by the real
save core, read back through the API as different users."""

import json
from pathlib import Path

import pytest
from supabase import create_client

from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from prd_save import save_prd

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DOC = json.loads((FIXTURES / "minimal_single_section.json").read_text(encoding="utf-8"))["document"]


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def verified(service, user):
    return service.auth.get_user(user.token).user


@pytest.fixture
def cast(make_user, make_org, db):
    owner, viewer, member, outsider = (make_user() for _ in range(4))
    org = make_org(owner, viewer, member)
    make_org(outsider)
    db.execute("update profile set full_name = 'Olive Owner' where id = %s", (owner.id,))
    prd = org_prd(db, org, owner, "History")
    add_to_prd(db, prd, viewer, "viewer")
    return dict(prd=prd, org=org, owner=owner, viewer=viewer, member=member, outsider=outsider)


def saves(service, user, prd, titles, start=1):
    me = verified(service, user)
    for offset, title in enumerate(titles):
        save_prd(service, me, prd, start + offset, title=title)


def versions(user, prd, **params):
    return user.api("GET", f"/prds/{prd}/versions", params=params)


def test_owner_and_viewer_list_newest_first_with_metadata(cast, service):
    saves(service, cast["owner"], cast["prd"], ["One", "Two", "Three"])
    for who in ("owner", "viewer"):
        r = versions(cast[who], cast["prd"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert [v["version_no"] for v in body["items"]] == [3, 2, 1] and body["next_cursor"] is None
        newest = body["items"][0]
        assert newest["saved_revision"] == 4 and newest["origin"] == "pm_edit"
        assert newest["actor"] == {"id": cast["owner"].id, "name": "Olive Owner"}
        assert newest["change_summary"] == "Edited title" and newest["changed_sections"] == []


@pytest.mark.parametrize("who", ["member", "outsider"])
def test_people_who_cant_see_the_prd_cant_see_its_history(cast, service, who):
    saves(service, cast["owner"], cast["prd"], ["One"])
    first = versions(cast["owner"], cast["prd"]).json()["items"][0]["id"]
    assert versions(cast[who], cast["prd"]).status_code == 404
    assert cast[who].api("GET", f"/prds/{cast['prd']}/versions/{first}").status_code == 404
    assert cast[who].rest("GET", f"prd_version?prd_id=eq.{cast['prd']}&select=id").json() == []


def test_pages_are_stable_when_new_saves_arrive(cast, service):
    saves(service, cast["owner"], cast["prd"], ["One", "Two", "Three", "Four", "Five"])
    page1 = versions(cast["owner"], cast["prd"], limit=2).json()
    assert [v["version_no"] for v in page1["items"]] == [5, 4] and page1["next_cursor"]
    saves(service, cast["owner"], cast["prd"], ["Six"], start=6)  # lands before we read page 2
    page2 = versions(cast["owner"], cast["prd"], limit=2, cursor=page1["next_cursor"]).json()
    assert [v["version_no"] for v in page2["items"]] == [3, 2]
    page3 = versions(cast["owner"], cast["prd"], limit=2, cursor=page2["next_cursor"]).json()
    assert [v["version_no"] for v in page3["items"]] == [1] and page3["next_cursor"] is None


def test_a_version_returns_exactly_what_was_saved_then(cast, service):
    me = verified(service, cast["owner"])
    save_prd(service, me, cast["prd"], 1, title="First title", description="First description", content_json=DOC)
    save_prd(service, me, cast["prd"], 2, title="Later title", description=None)
    items = versions(cast["owner"], cast["prd"]).json()["items"]
    old = cast["viewer"].api("GET", f"/prds/{cast['prd']}/versions/{items[-1]['id']}").json()
    assert (old["title"], old["description"], old["content_json"], old["doc_schema_version"]) == \
        ("First title", "First description", DOC, 2)
    assert old["version_no"] == 1 and old["changed_sections"] == ["problem"] and old["generation_record_id"] is None
    assert cast["owner"].api("GET", f"/prds/{cast['prd']}").json()["title"] == "Later title"


def test_version_ids_only_resolve_under_their_own_prd(cast, service, db):
    other = org_prd(db, cast["org"], cast["owner"], "Another of Olive's")
    saves(service, cast["owner"], cast["prd"], ["One"])
    version = versions(cast["owner"], cast["prd"]).json()["items"][0]["id"]
    r = cast["owner"].api("GET", f"/prds/{other}/versions/{version}")
    assert (r.status_code, r.json()["code"]) == (404, "not_found")
    missing = "00000000-0000-4000-8000-000000000000"
    assert cast["owner"].api("GET", f"/prds/{cast['prd']}/versions/{missing}").status_code == 404
    assert cast["owner"].api("GET", f"/prds/{missing}/versions").status_code == 404


def test_a_bad_cursor_is_400_invalid_cursor_like_the_other_lists(cast):
    # Visibility is checked first: someone who can't see the PRD still gets 404.
    r = versions(cast["owner"], cast["prd"], cursor="not-base64!")
    assert (r.status_code, r.json()["code"]) == (400, "invalid_cursor")


def test_a_prd_without_saves_has_an_empty_history(cast):
    assert versions(cast["owner"], cast["prd"]).json() == {"items": [], "next_cursor": None}


def test_the_pre_history_checkpoint_and_deleted_authors_have_no_actor(cast, service, db, make_user):
    # Content saved before history existed is kept as a checkpoint with no
    # author and no invented changes.
    db.execute("update prd set content_json = %s where id = %s", (json.dumps({"sections": []}), cast["prd"]))
    editor = make_user(org=False)
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (cast["org"], editor.id))
    add_to_prd(db, cast["prd"], editor, "editor")
    save_prd(service, verified(service, editor), cast["prd"], 1, content_json=DOC)
    checkpoint, by_editor = sorted(versions(cast["owner"], cast["prd"]).json()["items"], key=lambda v: v["version_no"])
    assert checkpoint["origin"] == "checkpoint" and checkpoint["actor"] is None
    assert checkpoint["changed_sections"] == [] and checkpoint["change_summary"] == "Saved before version history started"
    assert by_editor["actor"]["id"] == editor.id
    db.execute("delete from profile where id = %s", (editor.id,))  # their history stays, unattributed
    newest = versions(cast["owner"], cast["prd"]).json()["items"][0]
    assert newest["version_no"] == 2 and newest["actor"] is None

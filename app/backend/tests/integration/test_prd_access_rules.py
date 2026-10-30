"""E03 access rules: what each role can do with a PRD and everything attached
to it, through the API and directly through the Data API.

             view  edit  delete
  owner       yes   yes   yes
  editor      yes   yes   no
  viewer      yes   no    no
  org admin   yes   yes   yes
  others      no    no    no
"""

from dataclasses import dataclass

import pytest

from conftest import add_to_prd, org_prd


@dataclass
class Cast:
    prd: str
    owner: object
    editor: object
    viewer: object
    admin: object
    member: object  # in the org, not on the PRD
    outsider: object  # in another org
    legacy_admin: object  # profile.role = 'admin', no org role


@pytest.fixture
def cast(make_user, make_org, db):
    owner, editor, viewer, admin, member, outsider = (make_user() for _ in range(6))
    legacy_admin = make_user("admin")
    org = make_org(admin, owner, editor, viewer, member)
    make_org(outsider)
    prd = org_prd(db, org, owner, "Roles")
    add_to_prd(db, prd, editor, "editor")
    add_to_prd(db, prd, viewer, "viewer")
    owner.api("PUT", f"/prds/{prd}/intake/problem", json={"answer_text": "Groups are hard to find"})
    return Cast(prd, owner, editor, viewer, admin, member, outsider, legacy_admin)


def edit(user, prd, title):
    current = user.api("GET", f"/prds/{prd}")
    revision = current.json()["revision"] if current.status_code == 200 else 1
    return user.api("PUT", f"/prds/{prd}", json={"revision": revision, "title": title})


@pytest.mark.parametrize("who, sees", [
    ("owner", True), ("editor", True), ("viewer", True), ("admin", True),
    ("member", False), ("outsider", False), ("legacy_admin", False),
])
def test_who_can_view(cast, who, sees):
    user = getattr(cast, who)
    assert (user.api("GET", f"/prds/{cast.prd}").status_code == 200) is sees
    assert (cast.prd in [p["id"] for p in user.api("GET", "/prds").json()]) is sees
    assert bool(user.rest("GET", f"prd?id=eq.{cast.prd}&select=id").json()) is sees
    assert bool(user.api("GET", f"/prds/{cast.prd}/intake").json()) is sees


@pytest.mark.parametrize("who, status", [
    ("owner", 200), ("editor", 200), ("admin", 200), ("viewer", 403),
    ("member", 404), ("outsider", 404), ("legacy_admin", 404),
])
def test_who_can_edit(cast, who, status):
    assert edit(getattr(cast, who), cast.prd, f"Edited by {who}").status_code == status


@pytest.mark.parametrize("who, can", [
    ("owner", True), ("editor", True), ("admin", True), ("viewer", False), ("member", False),
])
def test_attached_rows_follow_edit_rights(cast, who, can):
    r = getattr(cast, who).api("PUT", f"/prds/{cast.prd}/intake/goals", json={"answer_text": "More groups"})
    assert (r.status_code == 200) is can


def test_viewers_cannot_edit_through_the_data_api(cast):
    assert cast.viewer.rest("PATCH", f"prd?id=eq.{cast.prd}", json={"title": "Sneaky"}).json() == []
    r = cast.viewer.rest("POST", "intake_answer", json={"prd_id": cast.prd, "question_key": "notes", "answer_text": "x"})
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("who", ["editor", "viewer", "member"])
def test_only_owners_and_org_admins_delete(cast, who):
    assert getattr(cast, who).api("DELETE", f"/prds/{cast.prd}").status_code == 404
    assert cast.owner.api("GET", f"/prds/{cast.prd}").status_code == 200


@pytest.mark.parametrize("who", ["owner", "admin"])
def test_owners_and_org_admins_can_delete(cast, who):
    assert getattr(cast, who).api("DELETE", f"/prds/{cast.prd}").status_code == 204
    assert cast.owner.api("GET", f"/prds/{cast.prd}").status_code == 404


def test_a_deactivated_member_loses_access(cast, db):
    db.execute("update organization_member set active = false where user_id = %s", (cast.editor.id,))
    assert cast.editor.api("GET", f"/prds/{cast.prd}").status_code == 404
    assert edit(cast.editor, cast.prd, "After leaving").status_code == 404


def test_a_removed_editor_loses_access(cast, db):
    db.execute("delete from prd_member where prd_id = %s and user_id = %s", (cast.prd, cast.editor.id))
    assert cast.editor.api("GET", f"/prds/{cast.prd}").status_code == 404


def test_projects_are_private_to_their_owner(make_user):
    alice, legacy_admin = make_user(), make_user("admin")
    project = alice.api("POST", "/projects", json={"name": "Mine"}).json()["id"]
    assert legacy_admin.api("GET", "/projects").json() == []
    assert legacy_admin.api("PUT", f"/projects/{project}", json={"name": "Taken"}).status_code == 404
    assert legacy_admin.api("DELETE", f"/projects/{project}").status_code == 404


def test_any_signed_in_user_can_create_projects_and_prds(make_user):
    engineer = make_user("engineer")
    assert engineer.api("POST", "/projects", json={"name": "Mine"}).status_code == 201
    assert engineer.api("POST", "/prds", json={"title": "Mine"}).status_code == 201


def test_profiles_are_each_users_own(make_user):
    alice, legacy_admin = make_user(), make_user("admin")
    assert legacy_admin.rest("GET", f"profile?id=eq.{alice.id}&select=id").json() == []
    assert legacy_admin.rest("PATCH", f"profile?id=eq.{alice.id}", json={"full_name": "Taken"}).json() == []

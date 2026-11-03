"""PRD and project access as it stands on develop: owner-only visibility and
edits, through the API and directly through the Supabase Data API."""

from conftest import data_api


def create_prd(user, title="Test PRD", project_id=None):
    r = user.api("POST", "/prds", json={"title": title, "project_id": project_id})
    assert r.status_code == 201, r.text
    return r.json()


def test_owner_can_create_list_and_read(make_user):
    alice = make_user()
    prd = create_prd(alice)
    assert [p["id"] for p in alice.api("GET", "/prds").json()] == [prd["id"]]
    assert alice.api("GET", f"/prds/{prd['id']}").status_code == 200


def test_other_users_cannot_see_a_prd(make_user):
    alice, ben = make_user(), make_user()
    prd = create_prd(alice)
    assert ben.api("GET", "/prds").json() == []
    assert ben.api("GET", f"/prds/{prd['id']}").status_code == 404
    assert ben.rest("GET", f"prd?id=eq.{prd['id']}&select=id").json() == []


def test_other_users_cannot_change_or_delete_a_prd(make_user):
    alice, ben = make_user(), make_user()
    prd = create_prd(alice)
    r = ben.api("PUT", f"/prds/{prd['id']}", json={"revision": prd["revision"], "title": "Hijacked"})
    assert r.status_code == 404
    assert ben.rest("PATCH", f"prd?id=eq.{prd['id']}", json={"title": "Hijacked"}).json() == []
    assert ben.api("DELETE", f"/prds/{prd['id']}").status_code == 404
    assert alice.api("GET", f"/prds/{prd['id']}").json()["title"] == "Test PRD"


def test_signed_out_callers_see_nothing(make_user):
    prd = create_prd(make_user())
    r = data_api("GET", f"prd?id=eq.{prd['id']}&select=id")
    assert r.status_code in (401, 403) or r.json() == []


def test_stale_revision_is_rejected(make_user):
    alice = make_user()
    prd = create_prd(alice)
    first = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": prd["revision"], "title": "First"})
    assert first.status_code == 200
    second = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": prd["revision"], "title": "Second"})
    assert second.status_code == 409
    assert alice.api("GET", f"/prds/{prd['id']}").json()["title"] == "First"


def test_intake_answers_are_private_to_the_owner(make_user):
    alice, ben = make_user(), make_user()
    prd = create_prd(alice)
    r = alice.api("PUT", f"/prds/{prd['id']}/intake/problem", json={"answer_text": "Students can't find groups"})
    assert r.status_code == 200
    assert len(alice.api("GET", f"/prds/{prd['id']}/intake").json()) == 1
    assert ben.api("GET", f"/prds/{prd['id']}/intake").json() == []


def test_deleting_a_project_deletes_its_prds(make_user):
    alice = make_user()
    project = alice.api("POST", "/projects", json={"name": "Campus"}).json()
    prd = create_prd(alice, project_id=project["id"])
    assert alice.api("DELETE", f"/projects/{project['id']}").status_code == 204
    assert alice.api("GET", f"/prds/{prd['id']}").status_code == 404

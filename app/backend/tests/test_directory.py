"""E02 directory: one response with the org, departments, teams and active members."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app, raise_server_exceptions=False)
ORG = "00000000-0000-0000-0000-0000000000f1"
DEPT, OLD_DEPT = "00000000-0000-0000-0000-0000000000d1", "00000000-0000-0000-0000-0000000000d2"
TEAM = "00000000-0000-0000-0000-0000000000a1"
ALICE, BEN = "00000000-0000-0000-0000-00000000a11c", "00000000-0000-0000-0000-000000000be4"
STAMP = "2026-10-29T00:00:00+00:00"


class Rows:
    """A query builder that ignores filters and returns fixed rows."""

    def __init__(self, data):
        self.data = data

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        return SimpleNamespace(data=[dict(row) for row in self.data])


def sign_in_with(tables, people):
    user = SimpleNamespace(id=ALICE)
    fake = SimpleNamespace(table=lambda name: Rows(tables.get(name, [])), rpc=lambda name, params: Rows(people))
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": user, "client": fake}


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    main.app.dependency_overrides.clear()


TABLES = {
    "organization": [{"id": ORG, "name": "Org X"}],
    "department": [{"id": DEPT, "name": "Product", "head_id": ALICE, "archived_at": None},
                   {"id": OLD_DEPT, "name": "Ops", "head_id": None, "archived_at": STAMP}],
    "team": [{"id": TEAM, "name": "Growth", "department_id": DEPT, "lead_id": ALICE, "archived_at": None}],
    "organization_member": [
        {"user_id": BEN, "department_id": DEPT, "access_role": "member", "manager_id": ALICE, "title": None},
        {"user_id": ALICE, "department_id": DEPT, "access_role": "admin", "manager_id": None, "title": "Head"},
    ],
    "team_member": [{"team_id": TEAM, "user_id": ALICE}],
}


def test_directory_merges_names_emails_and_teams():
    people = [{"user_id": ALICE, "full_name": "Alice PM", "email": "alice@example.com"},
              {"user_id": BEN, "full_name": "Ben PM", "email": None}]
    sign_in_with(TABLES, people)
    body = client.get(f"/api/organizations/{ORG}/directory").json()

    assert body["organization"] == {"id": ORG, "name": "Org X"}
    assert {d["name"]: d["archived"] for d in body["departments"]} == {"Product": False, "Ops": True}
    assert body["teams"][0]["archived"] is False and body["teams"][0]["lead_id"] == ALICE
    alice, ben = body["members"]  # sorted by name
    assert (alice["name"], alice["email"], alice["team_ids"]) == ("Alice PM", "alice@example.com", [TEAM])
    assert (ben["name"], ben["email"], ben["team_ids"], ben["manager_id"]) == ("Ben PM", None, [], ALICE)


def test_member_without_a_visible_profile_still_appears_without_a_name():
    sign_in_with(TABLES, [])
    members = client.get(f"/api/organizations/{ORG}/directory").json()["members"]
    assert [m["name"] for m in members] == [None, None] and all(m["email"] is None for m in members)


def test_unknown_or_hidden_organization_is_404():
    sign_in_with({}, [])
    response = client.get(f"/api/organizations/{ORG}/directory")
    assert response.status_code == 404 and response.json()["code"] == "not_found"


def test_invalid_organization_id_is_422():
    sign_in_with(TABLES, [])
    response = client.get("/api/organizations/not-a-uuid/directory")
    assert response.status_code == 422 and response.json()["code"] == "validation_error"

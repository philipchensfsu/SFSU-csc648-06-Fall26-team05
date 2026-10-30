"""E01: POST /api/organizations and GET /api/me, with fake Supabase clients."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import main

client = TestClient(main.app, raise_server_exceptions=False)
USER_ID = "11111111-1111-1111-1111-111111111111"
ORG_A, ORG_B = "00000000-0000-0000-0000-0000000000a1", "00000000-0000-0000-0000-0000000000b2"


class Query:
    """Ignores filters and returns `data`, or raises `error`."""

    def __init__(self, data=None, error=None):
        self.data, self.error = data, error

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        if self.error:
            raise APIError(self.error)
        return SimpleNamespace(data=self.data)


def sign_in(tables=None, rpc=None):
    tables = tables or {}
    user = SimpleNamespace(id=USER_ID, email="alice@example.com")
    fake = SimpleNamespace(table=lambda name: tables.get(name, Query([])), rpc=lambda name, params: rpc)
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": user, "client": fake}


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    main.app.dependency_overrides.clear()


def test_create_returns_the_new_organization_id():
    sign_in(rpc=Query(ORG_A))
    r = client.post("/api/organizations", json={"name": "Acme"})
    assert r.status_code == 201 and r.json() == {"organization_id": ORG_A}


def test_fourth_organization_is_a_409():
    sign_in(rpc=Query(error={"code": "P0001", "message": "organization_limit"}))
    r = client.post("/api/organizations", json={"name": "Acme"})
    assert r.status_code == 409 and r.json()["code"] == "organization_limit"


def test_other_database_errors_stay_generic():
    sign_in(rpc=Query(error={"code": "P0001", "message": "something else"}))
    r = client.post("/api/organizations", json={"name": "Acme"})
    assert r.status_code == 500 and r.json()["code"] == "database_error"


@pytest.mark.parametrize("body", [{"name": "   "}, {"name": "x" * 201}, {}, {"name": "Acme", "owner": "x"}])
def test_invalid_bodies_are_422(body):
    sign_in(rpc=Query([]))
    assert client.post("/api/organizations", json=body).status_code == 422


def test_me_lists_active_memberships_sorted_by_name():
    sign_in(tables={
        "profile": Query([{"full_name": "Alice PM"}]),
        "organization_member": Query([
            {"organization_id": ORG_B, "access_role": "member", "organization": {"name": "beta"}},
            {"organization_id": ORG_A, "access_role": "admin", "organization": {"name": "Acme"}},
        ]),
    })
    assert client.get("/api/me").json() == {
        "id": USER_ID, "email": "alice@example.com", "full_name": "Alice PM",
        "memberships": [{"organization_id": ORG_A, "name": "Acme", "access_role": "admin"},
                        {"organization_id": ORG_B, "name": "beta", "access_role": "member"}],
    }


def test_me_without_an_organization_has_no_memberships():
    sign_in()
    me = client.get("/api/me").json()
    assert me["memberships"] == [] and me["full_name"] is None

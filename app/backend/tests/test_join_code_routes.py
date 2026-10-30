"""Join-code routes with fake Supabase clients: error mapping and formatting."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import main

client = TestClient(main.app, raise_server_exceptions=False)
ORG = "00000000-0000-0000-0000-0000000000a1"


class Query:
    def __init__(self, data=None, error=None):
        self.data, self.error = data, error

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        if self.error:
            raise APIError(self.error)
        return SimpleNamespace(data=self.data)


def sign_in(rpc, visible_orgs=()):
    user = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")
    fake = SimpleNamespace(rpc=lambda name, params: rpc,
                           table=lambda name: Query([{"id": org} for org in visible_orgs]))
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": user, "client": fake}


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    main.app.dependency_overrides.clear()


def test_join_returns_the_organization():
    sign_in(Query(ORG))
    r = client.post("/api/organizations/join", json={"code": "K7QX-M2PA-9DZR"})
    assert r.status_code == 200 and r.json() == {"organization_id": ORG}


@pytest.mark.parametrize("message, status, code", [
    ("invalid_join_code", 404, "invalid_join_code"),
    ("membership_inactive", 403, "membership_inactive"),
    ("anything else", 500, "database_error"),
])
def test_join_errors(message, status, code):
    sign_in(Query(error={"code": "P0001", "message": message}))
    r = client.post("/api/organizations/join", json={"code": "K7QX-M2PA-9DZR"})
    assert r.status_code == status and r.json()["code"] == code


def test_admins_get_the_code_in_groups_of_four():
    sign_in(Query("K7QXM2PA9DZR"))
    for method in ("GET", "POST"):
        r = client.request(method, f"/api/organizations/{ORG}/join-code")
        assert r.status_code == 200 and r.json() == {"join_code": "K7QX-M2PA-9DZR"}


def test_members_get_403_and_outsiders_404():
    sign_in(Query(None), visible_orgs=[ORG])
    assert client.get(f"/api/organizations/{ORG}/join-code").status_code == 403
    sign_in(Query(None))
    assert client.get(f"/api/organizations/{ORG}/join-code").status_code == 404

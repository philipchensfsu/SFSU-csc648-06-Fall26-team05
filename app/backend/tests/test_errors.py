"""S01 error contract: every error is {"detail": str, "code": str}."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import main

client = TestClient(main.app)
PRD_ID = "00000000-0000-0000-0000-000000000001"


class FakeQuery:
    """Stands in for the chained Supabase query builder."""

    def __init__(self, result=None, error=None):
        self.result, self.error = result, error

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        if self.error:
            raise APIError(self.error)
        return SimpleNamespace(data=self.result)


def sign_in_with(query):
    user = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")
    fake_client = SimpleNamespace(table=lambda name: query)
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": user, "client": fake_client}


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    main.app.dependency_overrides.clear()


def assert_error(response, status, code):
    assert response.status_code == status
    body = response.json()
    assert body["code"] == code
    assert isinstance(body["detail"], str) and body["detail"]
    return body


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Token abc"}, {"Authorization": "Bearer "}])
def test_missing_or_malformed_auth_is_401(headers, monkeypatch):
    def reject(token):
        raise ValueError("bad token")

    monkeypatch.setattr(main.supabase.auth, "get_user", reject)
    assert_error(client.get("/api/projects", headers=headers), 401, "not_authenticated")


def test_invalid_token_is_401(monkeypatch):
    def reject(token):
        raise ValueError("bad token")

    monkeypatch.setattr(main.supabase.auth, "get_user", reject)
    response = client.get("/api/projects", headers={"Authorization": "Bearer nope"})
    assert_error(response, 401, "not_authenticated")


def test_validation_error_has_readable_detail_and_field_list():
    sign_in_with(FakeQuery())
    body = assert_error(client.post("/api/projects", json={"name": "x" * 201}), 422, "validation_error")
    assert "name" in body["detail"]
    assert body["errors"][0]["loc"] == ["body", "name"]


def test_unknown_route_is_404():
    assert_error(client.get("/api/does-not-exist"), 404, "not_found")


def test_route_raised_error_gets_default_code():
    sign_in_with(FakeQuery())
    response = client.put(f"/api/prds/{PRD_ID}/intake/favorite_color", json={"answer_text": "blue"})
    assert_error(response, 400, "bad_request")


def test_stale_revision_is_409_with_specific_code():
    sign_in_with(FakeQuery(result=[]))
    response = client.put(f"/api/prds/{PRD_ID}", json={"revision": 3, "title": "New"})
    assert_error(response, 409, "stale_revision")


@pytest.mark.parametrize(
    "pg_code, status, code",
    [("42501", 403, "forbidden"), ("23503", 404, "not_found"),
     ("23514", 400, "bad_request"), ("XX000", 500, "database_error")],
)
def test_database_errors_are_mapped(pg_code, status, code):
    sign_in_with(FakeQuery(error={"code": pg_code, "message": "violates check constraint"}))
    assert_error(client.get("/api/projects"), status, code)


@pytest.mark.parametrize(
    "method, path, body",
    [("post", "/api/projects", {"name": "P", "owner_id": "someone-else"}),
     ("post", "/api/prds", {"title": "T", "colour": "blue"}),
     ("put", f"/api/prds/{PRD_ID}", {"revision": 1, "owner_id": "someone-else"}),
     ("put", f"/api/prds/{PRD_ID}/intake/problem", {"answer_text": "x", "extra": True})],
)
def test_unknown_request_fields_are_rejected(method, path, body):
    sign_in_with(FakeQuery(result=[{}]))
    body_json = assert_error(client.request(method, path, json=body), 422, "validation_error")
    assert body_json["errors"][0]["type"] == "extra_forbidden"


def test_known_fields_are_still_accepted():
    row = {"id": PRD_ID, "name": "P", "owner_id": PRD_ID,
           "created_at": "2026-10-28T00:00:00Z", "updated_at": "2026-10-28T00:00:00Z"}
    sign_in_with(FakeQuery(result=[row]))
    assert client.post("/api/projects", json={"name": "P"}).status_code == 201

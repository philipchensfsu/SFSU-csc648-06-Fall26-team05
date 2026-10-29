"""S01 error contract: every error is {"detail": str, "code": str}."""

import logging
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import main

# Unexpected errors should become JSON responses, not test failures.
client = TestClient(main.app, raise_server_exceptions=False)
PRD_ID = "00000000-0000-0000-0000-000000000001"


class FakeQuery:
    """Stands in for the chained Supabase query builder."""

    def __init__(self, result=None, error=None, results=None):
        # `results` gives one result per execute() call, in order.
        self.results = list(results) if results is not None else None
        self.result, self.error = result, error

    def __getattr__(self, name):
        return lambda *args, **kwargs: self

    def execute(self):
        if isinstance(self.error, Exception):
            raise self.error
        if self.error:
            raise APIError(self.error)
        if self.results is not None:
            return SimpleNamespace(data=self.results.pop(0))
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
    # The update matches nothing, but the PRD is visible: it moved on.
    sign_in_with(FakeQuery(results=[[], [{"id": PRD_ID, "revision": 4}]]))
    response = client.put(f"/api/prds/{PRD_ID}", json={"revision": 3, "title": "New"})
    assert_error(response, 409, "stale_revision")


def test_update_by_reader_without_edit_rights_is_403():
    # The update matches nothing, yet the PRD is visible at the sent revision.
    sign_in_with(FakeQuery(results=[[], [{"id": PRD_ID, "revision": 3}]]))
    response = client.put(f"/api/prds/{PRD_ID}", json={"revision": 3, "title": "New"})
    assert_error(response, 403, "forbidden")


def test_update_of_missing_or_hidden_prd_is_404():
    sign_in_with(FakeQuery(results=[[], []]))
    response = client.put(f"/api/prds/{PRD_ID}", json={"revision": 3, "title": "New"})
    assert_error(response, 404, "not_found")


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


def test_database_messages_are_not_returned():
    message = 'null value in column "title" of relation "prd" violates not-null constraint'
    sign_in_with(FakeQuery(error={"code": "23502", "message": message, "details": "Failing row contains (secret)"}))
    response = client.put(f"/api/prds/{PRD_ID}", json={"revision": 1, "title": "T"})
    body = assert_error(response, 400, "bad_request")
    assert body["detail"] == "Invalid value"
    assert "prd" not in response.text and "secret" not in response.text


@pytest.mark.parametrize(
    "error, status, code",
    [(RuntimeError("bug"), 500, "internal_error"),
     (httpx.ConnectError("connection refused"), 503, "service_unavailable"),
     (httpx.ReadTimeout("timed out"), 503, "service_unavailable")],
)
def test_unexpected_errors_use_the_json_shape(error, status, code):
    sign_in_with(FakeQuery(error=error))
    assert_error(client.get("/api/projects"), status, code)


def test_error_logs_leave_out_tokens_bodies_and_db_details(caplog):
    caplog.set_level(logging.INFO, logger="nautilus.errors")
    sign_in_with(FakeQuery(error={"code": "22P02", "message": 'invalid input: "my-secret-title"',
                                  "details": "row (my-secret-title)"}))
    client.put(f"/api/prds/{PRD_ID}", headers={"Authorization": "Bearer my-secret-token"},
               json={"revision": 1, "title": "my-secret-title"})
    sign_in_with(FakeQuery(error=RuntimeError("my-secret-title")))
    client.get("/api/projects", headers={"Authorization": "Bearer my-secret-token"})
    assert caplog.records, "expected the errors to be logged"
    assert "my-secret" not in caplog.text

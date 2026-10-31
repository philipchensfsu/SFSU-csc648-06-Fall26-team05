"""PUT /api/prds/{id}: the legacy update by default, the S03 save
(prd_save.save_prd) with PRD_SAVE_V2=true.

The save itself is replaced by a recorder here; it's tested against the
database in tests/integration/test_save_core.py, and the switched route in
tests/integration/test_put_save_route.py.
Run from app/backend with: python -m pytest tests/test_put_save.py
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
import prd_save
from prd_save import SaveError

PRD = "11111111-1111-4111-8111-111111111111"
USER = SimpleNamespace(id="22222222-2222-4222-8222-222222222222", email="alice@example.com")
ROW = {"id": PRD, "title": "Saved", "description": None, "owner_id": USER.id, "project_id": None,
       "organization_id": "44444444-4444-4444-8444-444444444444",
       "status": "draft", "content_json": None, "content_text": None, "doc_schema_version": 2, "revision": 2,
       "created_at": "2026-10-30T00:00:00Z", "updated_at": "2026-10-30T00:00:00Z"}


@pytest.fixture
def api(monkeypatch):
    calls = []

    def fake_save(service_client, verified_user, prd_id, base_revision, **fields):
        calls.append(dict(user=verified_user, prd_id=prd_id, revision=base_revision, fields=fields))
        return ROW

    monkeypatch.setattr(prd_save, "save_prd", fake_save)
    monkeypatch.setattr(main, "with_my_role", lambda client, user_id, rows: [{**r, "my_role": "owner"} for r in rows])
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": USER, "client": None}
    yield TestClient(main.app), calls
    main.app.dependency_overrides.clear()


def put(client, body):
    return client.put(f"/api/prds/{PRD}", json=body)


# --- with PRD_SAVE_V2 ----------------------------------------------------------


@pytest.fixture
def v2(monkeypatch):
    monkeypatch.setenv("PRD_SAVE_V2", "true")


@pytest.mark.parametrize("body, fields", [
    ({"revision": 1, "title": "New"}, {"title": "New"}),
    ({"revision": 1, "description": None}, {"description": None}),
    ({"revision": 1, "content_json": {"type": "doc", "content": []}}, {"content_json": {"type": "doc", "content": []}}),
    ({"revision": 3, "title": "T", "description": "D"}, {"title": "T", "description": "D"}),
])
def test_only_the_fields_sent_reach_the_save(api, v2, body, fields):
    client, calls = api
    response = put(client, body)
    assert response.status_code == 200, response.text
    [call] = calls
    assert call["fields"] == fields and call["revision"] == body["revision"] and call["prd_id"] == PRD


def test_the_actor_is_the_verified_user_not_a_request_value(api, v2):
    client, calls = api
    put(client, {"revision": 1, "title": "New"})
    assert calls[0]["user"] is USER


@pytest.mark.parametrize("body, code", [
    ({"revision": 1, "status": "final"}, "status_not_allowed"),
    ({"revision": 1, "status": "draft", "title": "x"}, "status_not_allowed"),
    ({"revision": 1, "content_text": "client text"}, "validation_error"),
    ({"revision": 1, "generation_record_id": "33333333-3333-4333-8333-333333333333"},
     "proposal_acceptance_unavailable"),
    ({"revision": 1, "owner_id": USER.id}, "validation_error"),  # unknown field
])
def test_refused_before_the_save(api, v2, body, code):
    client, calls = api
    response = put(client, body)
    assert response.status_code == 422 and response.json()["code"] == code
    assert calls == []


def test_document_errors_come_back_with_their_list(api, v2, monkeypatch):
    client, _ = api
    errors = [{"code": "unknown_node", "path": "/content/0", "message": "Unknown node"}]

    def invalid(*args, **kwargs):
        raise SaveError(422, "The PRD document isn't valid", "invalid_document", errors)
    monkeypatch.setattr(prd_save, "save_prd", invalid)
    response = put(client, {"revision": 1, "content_json": {"sections": []}})
    assert response.status_code == 422
    assert response.json() == {"detail": "The PRD document isn't valid", "code": "invalid_document", "errors": errors}


def test_save_errors_pass_through(api, v2, monkeypatch):
    client, _ = api

    def stale(*args, **kwargs):
        raise SaveError(409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision")
    monkeypatch.setattr(prd_save, "save_prd", stale)
    response = put(client, {"revision": 1, "title": "x"})
    assert (response.status_code, response.json()["code"]) == (409, "stale_revision")


def test_the_response_includes_the_description_and_my_role(api, v2):
    client, _ = api
    body = put(client, {"revision": 1, "title": "New"}).json()
    assert "description" in body and body["my_role"] == "owner"


# --- without it (today's default) ----------------------------------------------


@pytest.mark.parametrize("field, value", [("description", "D"),
                                          ("generation_record_id", "33333333-3333-4333-8333-333333333333")])
def test_legacy_save_refuses_save_core_fields(api, monkeypatch, field, value):
    monkeypatch.delenv("PRD_SAVE_V2", raising=False)
    client, calls = api
    response = put(client, {"revision": 1, field: value})
    assert response.status_code == 422 and calls == []


@pytest.mark.parametrize("value, enabled", [("true", True), ("1", True), ("on", True), ("", False), ("false", False),
                                            ("nope", False)])
def test_the_switch(monkeypatch, value, enabled):
    monkeypatch.setenv("PRD_SAVE_V2", value)
    assert main.prd_save_v2_enabled() is enabled

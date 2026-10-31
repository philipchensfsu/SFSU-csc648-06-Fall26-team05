"""Generation preview (app/backend/ai/preview.py and POST /api/prds/{id}/generate).

Fakes stand in for the user's client (RLS reads, can_edit_prd, the A07 gate)
and the service client (A02 recording) and for Gemini. The same flow against
real Postgres, RLS and the A02/A07 functions is in
tests/integration/test_generate_preview.py.
Run from app/backend with: python -m pytest tests/test_preview.py
"""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from ai import preview
from ai.gemini_client import AIError, GeminiResult
from errors import ApiError

PRD = "11111111-1111-4111-8111-111111111111"
ACTOR = "22222222-2222-4222-8222-222222222222"
RECORD = "33333333-3333-4333-8333-333333333333"
LEASE = "44444444-4444-4444-8444-444444444444"
FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "prd_document" / "valid"
DRAFT = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]


class Query:
    def __init__(self, client, table):
        self.client, self.table, self.filters = client, table, {}

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def execute(self):
        rows = self.client.tables[self.table]
        return SimpleNamespace(data=[copy.deepcopy(r) for r in rows
                                     if all(r.get(k) == v for k, v in self.filters.items())])


class FakeUserClient:
    """RLS reads as the user, can_edit_prd, and the A07 gate."""

    def __init__(self, revision=3, answers=None, editable=True, admit=None):
        answers = {"problem": "Students miss events", "target_users": "Students", "goals": "More turnout"} \
            if answers is None else answers
        self.tables = {
            "prd": [{"id": PRD, "title": "Campus events", "revision": revision, "status": "draft"}],
            "intake_answer": [{"prd_id": PRD, "question_key": k, "answer_text": v, "skipped": False}
                              for k, v in answers.items()],
            "prd_context": [],
        }
        self.editable = editable
        self.admit = admit or {"lease_id": LEASE, "refused": None, "retry_after": None}
        self.calls = []

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        self.calls.append(name)
        data = {"can_edit_prd": self.editable, "ai_admit": [self.admit], "ai_release": True}[name]
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=data))


class FakeService:
    """ai_record_generation; outcome mimics the database's revision check."""

    def __init__(self, user_client, outcome=None, error=None):
        self.user_client, self.outcome, self.error = user_client, outcome, error
        self.records = []

    def rpc(self, name, params):
        assert name == "ai_record_generation"
        self.records.append(params)

        def execute():
            if self.error:
                raise self.error
            outcome = "recorded" if params["p_proposal_kind"] is None else self.outcome or (
                "staged" if self.user_client.tables["prd"][0]["revision"] == params["p_base_revision"] else "stale")
            proposal_id = "55555555-5555-4555-8555-555555555555" if outcome == "staged" else None
            return SimpleNamespace(data=[{"generation_record_id": RECORD, "proposal_id": proposal_id,
                                          "outcome": outcome}])
        return SimpleNamespace(execute=execute)


def gemini(during=None, error=None):
    """A fake model call; `during` runs while 'Gemini' is working."""
    calls = []

    def call_model(prompt, **kwargs):
        calls.append(prompt)
        if during:
            during()
        if error:
            raise error
        data = {"title": "Campus events PRD", "description": "Help students find events.", "document": DRAFT}
        return GeminiResult(data=data, model="gemini-test", prompt_tokens=100, output_tokens=900)
    call_model.calls = calls
    return call_model


def run(user, service, model, revision=3):
    return preview.generate_preview(user, service, actor_id=ACTOR, prd_id=PRD, revision=revision,
                                    call_model=model)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    for name in ("AI_ENABLED", "AI_COOLDOWN_SECONDS", "AI_LEASE_SECONDS", "GEMINI_MODEL"):
        monkeypatch.delenv(name, raising=False)


def assert_lease_released(user):
    assert user.calls.count("ai_admit") == 1 and user.calls[-1] == "ai_release"


# --- success ---------------------------------------------------------------------


def test_preview_returns_the_agreed_shape_and_stages_the_proposal():
    user = FakeUserClient()
    service = FakeService(user)
    model = gemini()
    body = run(user, service, model)
    assert set(body) == {"proposal", "base_revision", "generation_record_id"}
    assert body["base_revision"] == 3 and body["generation_record_id"] == RECORD
    assert set(body["proposal"]) == {"title", "description", "content_json", "doc_schema_version", "sources"}
    assert body["proposal"]["content_json"] == DRAFT  # unmarked: ai_generated is added on acceptance (A05)
    assert body["proposal"]["sources"] == []
    [params] = service.records
    assert (params["p_actor"], params["p_prd_id"], params["p_base_revision"]) == (ACTOR, PRD, 3)
    assert (params["p_status"], params["p_proposal_kind"], params["p_trigger"]) == ("success", "generate",
                                                                                   "initial_generation")
    assert (params["p_prompt_tokens"], params["p_output_tokens"]) == (100, 900)
    assert_lease_released(user)


def test_prompt_uses_saved_answers_and_ignores_skipped_ones():
    user = FakeUserClient()
    user.tables["intake_answer"].append({"prd_id": PRD, "question_key": "scope", "answer_text": "old text",
                                         "skipped": True})
    model = gemini()
    run(user, FakeService(user), model)
    sent = json.loads(model.calls[0])
    assert sent["interview_answers"]["problem"] == "Students miss events"
    assert sent["interview_answers"]["scope"] == ""
    assert sent["working_title"] == "Campus events"


def test_preview_changes_nothing_in_the_prd():
    user = FakeUserClient()
    before = copy.deepcopy(user.tables)
    run(user, FakeService(user), gemini())
    assert user.tables == before


# --- refused before any limit or Gemini call --------------------------------------


@pytest.mark.parametrize("setup, status, code", [
    (lambda u: u.tables.__setitem__("prd", []), 404, "not_found"),
    (lambda u: setattr(u, "editable", False), 403, "forbidden"),
])
def test_access_is_checked_before_anything_else(setup, status, code):
    user = FakeUserClient()
    setup(user)
    service, model = FakeService(user), gemini()
    with pytest.raises(ApiError) as info:
        run(user, service, model)
    assert (info.value.status_code, info.value.code) == (status, code)
    assert model.calls == [] and service.records == [] and "ai_admit" not in user.calls


def test_stale_revision_is_refused_before_gemini():
    user = FakeUserClient(revision=4)
    service, model = FakeService(user), gemini()
    with pytest.raises(ApiError) as info:
        run(user, service, model, revision=3)
    assert (info.value.status_code, info.value.code) == (409, "stale_revision")
    assert model.calls == [] and service.records == [] and "ai_admit" not in user.calls


@pytest.mark.parametrize("answers", [{}, {"problem": "x", "target_users": "y", "goals": "   "}])
def test_missing_required_answers_never_reach_the_limit_or_gemini(answers):
    user = FakeUserClient(answers=answers)
    service, model = FakeService(user), gemini()
    with pytest.raises(ApiError) as info:
        run(user, service, model)
    assert (info.value.status_code, info.value.code) == (422, "intake_incomplete")
    assert model.calls == [] and service.records == [] and "ai_admit" not in user.calls


def test_usage_limit_refusal_stops_before_gemini():
    user = FakeUserClient(admit={"lease_id": None, "refused": "cooldown", "retry_after": 8})
    service, model = FakeService(user), gemini()
    with pytest.raises(ApiError) as info:
        run(user, service, model)
    assert (info.value.status_code, info.value.code) == (429, "ai_cooldown")
    assert model.calls == [] and service.records == [] and "ai_release" not in user.calls


def test_off_switch_stops_before_the_gate(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "false")
    user = FakeUserClient()
    model = gemini()
    with pytest.raises(AIError) as info:
        run(user, FakeService(user), model)
    assert info.value.code == "ai_disabled" and model.calls == [] and "ai_admit" not in user.calls


# --- provider failures -------------------------------------------------------------


@pytest.mark.parametrize("code", ["ai_invalid_output", "ai_provider_error", "ai_unavailable"])
def test_provider_failure_is_recorded_and_releases_the_lease(code):
    user = FakeUserClient()
    service = FakeService(user)
    with pytest.raises(AIError) as info:
        run(user, service, gemini(error=AIError(502, code)))
    assert info.value.code == code
    [params] = service.records
    assert (params["p_status"], params["p_error_code"], params["p_proposal_kind"]) == ("failed", code, None)
    assert_lease_released(user)


def test_invalid_reply_is_recorded_as_invalid_output():
    user = FakeUserClient()
    service = FakeService(user)

    def bad_reply(prompt, **kwargs):
        return GeminiResult(data={"title": "x"}, model="gemini-test", prompt_tokens=1, output_tokens=1)
    with pytest.raises(AIError) as info:
        run(user, service, bad_reply)
    assert info.value.code == "ai_invalid_output"
    assert service.records[0]["p_error_code"] == "ai_invalid_output"
    assert_lease_released(user)


def test_a_failed_failure_record_doesnt_hide_the_provider_error(caplog):
    user = FakeUserClient()
    service = FakeService(user, error=ConnectionError("db down"))
    with pytest.raises(AIError) as info:
        run(user, service, gemini(error=AIError(503, "ai_unavailable")))
    assert info.value.code == "ai_unavailable"
    assert "Couldn't record a failed generation" in caplog.text
    assert_lease_released(user)


# --- inputs or access changed while Gemini ran -------------------------------------


def test_answers_changed_during_generation_are_recorded_not_staged():
    user = FakeUserClient()
    service = FakeService(user)

    def edit_answer():
        user.tables["intake_answer"][0]["answer_text"] = "A different problem"
    with pytest.raises(ApiError) as info:
        run(user, service, gemini(during=edit_answer))
    assert (info.value.status_code, info.value.code) == (409, "intake_changed")
    [params] = service.records
    assert (params["p_status"], params["p_error_code"], params["p_proposal_kind"]) == ("failed", "intake_changed",
                                                                                      None)
    assert (params["p_prompt_tokens"], params["p_output_tokens"]) == (100, 900)
    assert_lease_released(user)


def test_context_changed_during_generation_is_not_offered():
    user = FakeUserClient()

    def add_context():
        user.tables["prd_context"].append({"prd_id": PRD, "version": 2, "context_json": {"decisions": ["x"]},
                                           "running_summary": None})
    with pytest.raises(ApiError) as info:
        run(user, FakeService(user), gemini(during=add_context))
    assert info.value.code == "intake_changed"


def test_save_during_generation_is_a_stale_revision():
    user = FakeUserClient()
    service = FakeService(user)

    def save():
        user.tables["prd"][0]["revision"] = 4
        user.tables["intake_answer"][0]["answer_text"] = "also changed"  # revision wins
    with pytest.raises(ApiError) as info:
        run(user, service, gemini(during=save))
    assert (info.value.status_code, info.value.code) == (409, "stale_revision")
    [params] = service.records  # recorded as a success; the database staged nothing
    assert params["p_proposal_kind"] == "generate"
    assert_lease_released(user)


def test_lost_edit_access_during_generation_is_recorded_not_staged():
    user = FakeUserClient()
    service = FakeService(user)
    with pytest.raises(ApiError) as info:
        run(user, service, gemini(during=lambda: setattr(user, "editable", False)))
    assert (info.value.status_code, info.value.code) == (403, "forbidden")
    assert service.records[0]["p_error_code"] == "forbidden" and service.records[0]["p_proposal_kind"] is None
    assert_lease_released(user)


def test_lost_view_access_during_generation_is_a_404():
    user = FakeUserClient()
    service = FakeService(user)
    with pytest.raises(ApiError) as info:
        run(user, service, gemini(during=lambda: user.tables.__setitem__("prd", [])))
    assert info.value.status_code == 404 and service.records == []
    assert_lease_released(user)


def test_database_stale_outcome_after_a_late_save_is_a_409():
    # A save can land between the reload and the database's own check.
    user = FakeUserClient()
    with pytest.raises(ApiError) as info:
        run(user, FakeService(user, outcome="stale"), gemini())
    assert info.value.code == "stale_revision"
    assert_lease_released(user)


# --- the route ---------------------------------------------------------------------


@pytest.fixture
def api(monkeypatch):
    user = FakeUserClient()
    service = FakeService(user)
    monkeypatch.setattr(main, "supabase", service)
    monkeypatch.setattr(preview, "generate_json", gemini())
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": SimpleNamespace(id=ACTOR),
                                                                    "client": user}
    yield TestClient(main.app), user, service
    main.app.dependency_overrides.clear()


def test_route_returns_the_preview(api):
    client, user, service = api
    response = client.post(f"/api/prds/{PRD}/generate", json={"revision": 3})
    assert response.status_code == 200, response.text
    assert response.json()["generation_record_id"] == RECORD
    assert service.records[0]["p_actor"] == ACTOR


@pytest.mark.parametrize("body", [{}, {"revision": 0}, {"revision": 3, "status": "final"}])
def test_route_validates_the_body(api, body):
    client, user, _ = api
    response = client.post(f"/api/prds/{PRD}/generate", json=body)
    assert response.status_code == 422 and response.json()["code"] == "validation_error"
    assert user.calls == []


def test_route_renders_cooldown_with_retry_after(api):
    client, user, _ = api
    user.admit = {"lease_id": None, "refused": "cooldown", "retry_after": 9}
    response = client.post(f"/api/prds/{PRD}/generate", json={"revision": 3})
    assert response.status_code == 429
    assert response.json()["code"] == "ai_cooldown" and response.json()["retry_after"] == 9
    assert response.headers["retry-after"] == "9"


def test_route_renders_intake_changed(api, monkeypatch):
    client, user, _ = api

    def edit_answer(prompt, **kwargs):
        user.tables["intake_answer"][0]["answer_text"] = "changed"
        return gemini()(prompt, **kwargs)
    monkeypatch.setattr(preview, "generate_json", edit_answer)
    response = client.post(f"/api/prds/{PRD}/generate", json={"revision": 3})
    assert response.status_code == 409 and response.json()["code"] == "intake_changed"

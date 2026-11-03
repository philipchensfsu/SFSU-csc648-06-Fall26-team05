"""Conversational AI revisions across sections (ai/chat_revision.py, POST
/api/prds/{id}/ai-revisions) and accepting them (ai/acceptance.py), offline.

Reuses the section-edit fakes for the user's client, the service client and
Om's modules. The flow against real RLS, staging and the save is in
tests/integration/test_ai_revision_db.py.
"""

import copy
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from ai import acceptance, chat, chat_revision
from ai.gemini_client import AIError, GeminiResult
from ai.section_edit import merge_section
from errors import ApiError
from prd_document import validate_document
from prd_save import save_prd
from test_section_edit import ACTOR, DOC, NEW_GOALS, PRD, RECORD, FakeService, FakeUserClient, modules

NEW_METRICS = {"type": "section", "attrs": {"type": "success_metrics"}, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "40% of new users finish a draft in their first week."}]}]}
REPLY = {"sections": [NEW_GOALS, NEW_METRICS], "explanation": "Made the goal and the metric measurable."}


def model(reply=None, error=None, during=None):
    calls = []

    def call_model(prompt, **kwargs):
        calls.append({"prompt": prompt, **kwargs})
        if len(calls) == 2:
            if during:
                during()
            if error:
                raise error
        data = reply if reply is not None else REPLY
        return GeminiResult(data=data, model="fake", prompt_tokens=5, output_tokens=7)
    call_model.calls = calls
    return call_model


def revise(user, service, call_model, *, revision=4, verdict="allow", instruction="Apply what we discussed."):
    return chat_revision.propose_revision(
        user, service, actor_id=ACTOR, prd_id=PRD, revision=revision, instruction=instruction,
        session_messages=[{"role": "user", "content": "Make the goals and metrics measurable."},
                          {"role": "assistant", "content": "The metric has no target yet."}],
        modules=modules(verdict), call_model=call_model)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    for name in ("AI_ENABLED", "AI_COOLDOWN_SECONDS", "AI_LEASE_SECONDS", "AI_REQUEST_BUDGET_SECONDS"):
        monkeypatch.delenv(name, raising=False)


# --- proposals -------------------------------------------------------------------


def test_one_proposal_changes_several_sections_and_keeps_the_rest():
    user, service = FakeUserClient(), FakeService()
    before = copy.deepcopy(user.tables)
    body = revise(user, service, model())
    assert body["kind"] == "proposal" and body["message"] == "Made the goal and the metric measurable."
    assert body["base_revision"] == 4 and body["generation_record_id"] == RECORD
    proposal = body["proposal"]
    assert proposal["section_types"] == ["goals", "success_metrics"]
    merged = proposal["content_json"]
    assert validate_document(merged) == []
    expected = {"goals": NEW_GOALS, "success_metrics": NEW_METRICS}
    for old, new in zip(DOC["content"], merged["content"]):
        assert new == expected.get(old["attrs"]["type"], old)
    assert "title" not in proposal and "description" not in proposal
    [rec] = service.records
    assert (rec["p_proposal_kind"], rec["p_trigger"], rec["p_status"]) == ("ai_revision", "chat_request", "success")
    assert rec["p_proposal_content"] == proposal and rec["p_prompt_version"] == chat_revision.PROMPT_VERSION
    assert user.tables == before  # nothing saved
    assert user.calls[-1] == "ai_release"


def test_leaving_a_section_out_never_deletes_it_and_new_ones_go_in_order():
    doc = copy.deepcopy(DOC)
    doc["content"] = [s for s in doc["content"] if s["attrs"]["type"] != "success_metrics"]
    body = revise(FakeUserClient(content=doc), FakeService(), model(reply={
        "sections": [NEW_METRICS], "explanation": "Added a metric."}))
    assert [s["attrs"]["type"] for s in body["proposal"]["content_json"]["content"]] == \
        [s["attrs"]["type"] for s in DOC["content"]]


def test_the_prompt_carries_the_conversation_and_instruction_as_data():
    call_model = model()
    revise(FakeUserClient(), FakeService(), call_model)
    scope, main_call = call_model.calls
    data = json.loads(main_call["prompt"])
    assert data["instruction"] == "Apply what we discussed."
    assert [m["role"] for m in data["recent_conversation"]] == ["user", "assistant"]
    assert data["document"] == DOC and "goals" in data["section_titles"]
    assert main_call["system_instruction"] == chat_revision.SYSTEM_INSTRUCTION
    assert main_call["response_schema"]["properties"]["sections"]["maxItems"] == 9


@pytest.mark.parametrize("verdict, kind", [("block", "blocked"), ("unclear", "clarification")])
def test_out_of_scope_requests_get_no_proposal(verdict, kind):
    service, call_model = FakeService(), model()
    body = revise(FakeUserClient(), service, call_model, verdict=verdict)
    assert body["kind"] == kind and body["proposal"] is None and len(call_model.calls) == 1
    assert service.records[0]["p_proposal_kind"] is None and service.records[0]["p_status"] == "failed"


# --- refused --------------------------------------------------------------------


@pytest.mark.parametrize("setup, kwargs, status, code", [
    (lambda u: setattr(u, "editable", False), {}, 403, "forbidden"),
    (lambda u: setattr(u, "approved_not_owner", True), {}, 403, "owner_required"),
    (lambda u: None, {"revision": 3}, 409, "stale_revision"),
    (lambda u: None, {"instruction": "   "}, 422, "validation_error"),
    (lambda u: u.tables["prd"][0].update(content_json={"sections": []}, doc_schema_version=1), {}, 409,
     "document_not_v2"),
    (lambda u: u.tables.__setitem__("prd", []), {}, 404, "not_found"),
])
def test_refused_before_the_gate_or_any_model_call(setup, kwargs, status, code):
    user, service, call_model = FakeUserClient(), FakeService(), model()
    setup(user)
    with pytest.raises(ApiError) as info:
        revise(user, service, call_model, **kwargs)
    assert (info.value.status_code, info.value.code) == (status, code)
    assert call_model.calls == [] and service.records == [] and "ai_admit" not in user.calls


def test_approval_while_the_model_ran_is_counted_but_not_staged():
    user, service = FakeUserClient(), FakeService()
    with pytest.raises(ApiError) as info:
        revise(user, service, model(during=lambda: setattr(user, "approved_not_owner", True)))
    assert (info.value.status_code, info.value.code) == (403, "owner_required")
    [rec] = service.records
    assert (rec["p_status"], rec["p_error_code"], rec["p_proposal_kind"]) == ("failed", "forbidden", None)


@pytest.mark.parametrize("reply", [
    {"sections": [NEW_GOALS, NEW_GOALS], "explanation": "x"},  # the same section twice
    {"sections": [{**NEW_GOALS, "attrs": {"type": "appendix"}}], "explanation": "x"},  # unknown section
    {"sections": [], "explanation": "x"},
    {"sections": [{"type": "section", "attrs": {"type": "goals"}, "content": [{"type": "image"}]}], "explanation": "x"},
    {"sections": [{"type": "section", "attrs": {"type": "goals"}, "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "x", "marks": [{"type": "ai_generated", "attrs": {"generation_record_id": RECORD}}]}]}]}],
     "explanation": "x"},
    {"sections": [NEW_GOALS]},  # no explanation
    "not an object",
])
def test_invalid_replies_are_rejected_and_recorded(reply):
    service = FakeService()
    with pytest.raises(AIError) as info:
        revise(FakeUserClient(), service, model(reply=reply))
    assert info.value.code == "ai_invalid_output"
    assert service.records[-1]["p_error_code"] == "ai_invalid_output"


def test_provider_errors_are_recorded():
    service = FakeService()
    with pytest.raises(AIError):
        revise(FakeUserClient(), service, model(error=AIError(429, "ai_provider_rate_limited")))
    assert service.records[-1]["p_error_code"] == "ai_provider_rate_limited"


def test_a_save_while_the_model_ran_stages_nothing():
    with pytest.raises(ApiError) as info:
        revise(FakeUserClient(), FakeService(outcome="stale"), model())
    assert info.value.code == "stale_revision"


def test_missing_modules_disable_revisions(monkeypatch):
    monkeypatch.setattr(chat, "load_modules", lambda: None)
    with pytest.raises(ApiError) as info:
        chat_revision.propose_revision(FakeUserClient(), FakeService(), actor_id=ACTOR, prd_id=PRD, revision=4,
                                       instruction="x", session_messages=[])
    assert info.value.status_code == 503


# --- accepting a revision (A05) --------------------------------------------------


def proposed_document():
    return copy.deepcopy(merge_section(merge_section(DOC, NEW_GOALS), NEW_METRICS))


class AcceptService:
    def __init__(self):
        self.proposal = {"prd_id": PRD, "requester_id": ACTOR, "kind": "ai_revision", "base_revision": 4,
                         "status": "pending", "context_patch": None,
                         "content": {"section_types": ["goals", "success_metrics"], "sections": [NEW_GOALS, NEW_METRICS],
                                     "content_json": proposed_document()}}
        self.calls = []

    def table(self, name):
        data = [self.proposal] if name == "ai_proposal" else [{"content_json": copy.deepcopy(DOC)}]
        query = SimpleNamespace(execute=lambda: SimpleNamespace(data=data))
        query.select = lambda *_: query
        query.eq = lambda *_: query
        return query

    def rpc(self, name, params):
        self.calls.append(params)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": PRD, "revision": 5}))


def accept(service, content, **fields):
    return save_prd(service, SimpleNamespace(id=ACTOR), PRD, 4, content_json=content, origin="ai_generated",
                    generation_record_id=RECORD, **fields)


def marked(document):
    return [s["attrs"]["type"] for s in document["content"] if "ai_generated" in json.dumps(s)]


def test_accepting_the_whole_proposal_marks_the_proposed_sections():
    service = AcceptService()
    accept(service, proposed_document())
    params = service.calls[0]
    assert marked(params["p_content_json"]) == ["goals", "success_metrics"]
    assert params["p_apply_context_patch"] is False


@pytest.mark.parametrize("change", ["other_section", "title", "description", "no_document"])
def test_only_the_proposed_sections_may_change_and_title_and_description_stay_out(change):
    service = AcceptService()
    content = proposed_document()
    fields = {}
    if change == "other_section":
        content["content"][0]["content"][0]["content"][0]["text"] = "Sneaky change to the problem."
    elif change in ("title", "description"):
        # Even unchanged values are refused: scoped acceptance leaves them out.
        fields[change] = "Campus events" if change == "title" else ""
    with pytest.raises(acceptance.AcceptanceError) as info:
        if change == "no_document":
            save_prd(service, SimpleNamespace(id=ACTOR), PRD, 4, origin="ai_generated", generation_record_id=RECORD,
                     description="x")
        else:
            accept(service, content, **fields)
    assert (info.value.status_code, info.value.code) == (422, "proposal_scope")
    assert service.calls == []


# --- the route ----------------------------------------------------------------------


@pytest.fixture
def api(monkeypatch):
    user = FakeUserClient()
    monkeypatch.setattr(main, "supabase", FakeService())
    monkeypatch.setattr(chat, "load_modules", lambda: modules())
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": SimpleNamespace(id=ACTOR), "client": user}
    yield TestClient(main.app), user
    main.app.dependency_overrides.clear()


def test_route_returns_the_proposal(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(chat_revision, "generate_json", model())
    r = client.post(f"/api/prds/{PRD}/ai-revisions", json={
        "revision": 4, "instruction": "Apply what we discussed.",
        "session_messages": [{"role": "user", "content": "Make the metric measurable."}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"kind", "message", "proposal", "base_revision", "generation_record_id"}
    assert set(body["proposal"]) == {"section_types", "sections", "content_json"}


@pytest.mark.parametrize("body", [
    {"instruction": "x"},
    {"revision": 4, "instruction": ""},
    {"revision": 4, "instruction": "x" * 2001},
    {"revision": 4, "instruction": "x", "session_messages": [{"role": "system", "content": "x"}]},
    {"revision": 4, "instruction": "x", "session_messages": [{"role": "user", "content": "x"}] * 21},
    {"revision": 4, "instruction": "x", "title": "New"},
])
def test_route_validates_the_body(api, body):
    client, user = api
    r = client.post(f"/api/prds/{PRD}/ai-revisions", json=body)
    assert r.status_code == 422 and user.calls == []

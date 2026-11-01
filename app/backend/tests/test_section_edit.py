"""AI section edits (ai/section_edit.py, POST /api/prds/{id}/ai-edit) and
accepting them (ai/acceptance.py), offline.

Fakes stand in for the user's client, the service client and Gemini;
doubles stand in for Om's guardrail and prompt modules. The flow against
real RLS, staging and the save is in tests/integration/test_ai_edit_db.py.
"""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from ai import acceptance, chat, section_edit
from ai.gemini_client import AIError, GeminiResult
from errors import ApiError
from prd_document import validate_document
from prd_save import save_prd

FIXTURES = Path(__file__).resolve().parent.parent.parent / "shared" / "fixtures" / "prd_document" / "valid"
DOC = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]
PRD = "11111111-1111-4111-8111-111111111111"
ACTOR = "22222222-2222-4222-8222-222222222222"
RECORD = "33333333-3333-4333-8333-333333333333"
NEW_GOALS = {"type": "section", "attrs": {"type": "goals"}, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Cut drafting time by half within a semester."}]}]}


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
    def __init__(self, content=None, schema=2, editable=True):
        self.tables = {
            "prd": [{"id": PRD, "title": "Campus events", "revision": 4, "content_text": "text",
                     "content_json": copy.deepcopy(DOC) if content is None else content, "doc_schema_version": schema}],
            "intake_answer": [], "prd_context": [],
        }
        self.editable, self.calls = editable, []

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        self.calls.append(name)
        data = {"can_edit_prd": self.editable, "ai_release": True,
                "ai_admit": [{"lease_id": "l", "refused": None, "retry_after": None}]}[name]
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=data))


class FakeService:
    def __init__(self, outcome="staged"):
        self.outcome, self.records = outcome, []

    def rpc(self, name, params):
        self.records.append(params)
        outcome = self.outcome if params["p_proposal_kind"] else "recorded"
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[
            {"generation_record_id": RECORD, "proposal_id": "p" if outcome == "staged" else None, "outcome": outcome}]))


def modules(verdict="allow"):
    guardrails = SimpleNamespace(check_scope=lambda *a, call_model, timeout_seconds, **k: (
        call_model("scope", system_instruction="s", timeout_seconds=timeout_seconds), verdict)[1])
    prompts = SimpleNamespace(FIXED_REFUSAL="Only this PRD.", FIXED_CLARIFICATION="How does it relate?",
                              CHAT_PROMPT_VERSION="v", CHAT_SYSTEM_INSTRUCTION="", CHAT_RESPONSE_SCHEMA={},
                              build_chat_prompt=lambda *a: "")
    return chat.ChatModules(guardrails, prompts)


def model(reply=None, error=None):
    calls = []

    def call_model(prompt, **kwargs):
        calls.append({"prompt": prompt, **kwargs})
        if error and len(calls) == 2:
            raise error
        data = reply if reply is not None else {"section": NEW_GOALS, "message": "Made the goal measurable."}
        return GeminiResult(data=data, model="fake", prompt_tokens=5, output_tokens=7)
    call_model.calls = calls
    return call_model


def edit(user, service, call_model, *, revision=4, section="goals", verdict="allow"):
    return section_edit.propose_section_edit(
        user, service, actor_id=ACTOR, prd_id=PRD, revision=revision, section_type=section,
        instruction="Make the goals measurable.", session_messages=[{"role": "user", "content": "earlier"}],
        modules=modules(verdict), call_model=call_model)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    for name in ("AI_ENABLED", "AI_COOLDOWN_SECONDS", "AI_LEASE_SECONDS", "AI_REQUEST_BUDGET_SECONDS"):
        monkeypatch.delenv(name, raising=False)


# --- proposals -------------------------------------------------------------------


def test_editor_gets_a_staged_proposal_changing_only_that_section():
    user, service = FakeUserClient(), FakeService()
    before = copy.deepcopy(user.tables)
    body = edit(user, service, model())
    assert body["kind"] == "proposal" and body["message"] == "Made the goal measurable."
    assert body["base_revision"] == 4 and body["generation_record_id"] == RECORD
    merged = body["proposal"]["content_json"]
    assert validate_document(merged) == []
    for old, new in zip(DOC["content"], merged["content"]):
        assert new == (NEW_GOALS if old["attrs"]["type"] == "goals" else old)
    [rec] = service.records
    assert (rec["p_proposal_kind"], rec["p_trigger"], rec["p_status"]) == ("ai_edit", "chat_request", "success")
    assert rec["p_proposal_content"]["section"] == NEW_GOALS and rec["p_base_revision"] == 4
    assert user.tables == before  # nothing saved
    assert user.calls[-1] == "ai_release"


def test_a_missing_section_is_inserted_in_the_standard_order():
    doc = copy.deepcopy(DOC)
    doc["content"] = [s for s in doc["content"] if s["attrs"]["type"] != "goals"]
    body = edit(FakeUserClient(content=doc), FakeService(), model())
    assert [s["attrs"]["type"] for s in body["proposal"]["content_json"]["content"]] == \
        [s["attrs"]["type"] for s in DOC["content"]]


def test_the_prompt_carries_the_section_and_instruction_as_data():
    call_model = model()
    edit(FakeUserClient(), FakeService(), call_model)
    data = json.loads(call_model.calls[1]["prompt"])
    assert data["section_type"] == "goals" and data["instruction"] == "Make the goals measurable."
    assert data["current_section"]["attrs"]["type"] == "goals" and data["recent_conversation"]
    assert call_model.calls[1]["system_instruction"] == section_edit.SYSTEM_INSTRUCTION


@pytest.mark.parametrize("verdict, kind", [("block", "blocked"), ("unclear", "clarification")])
def test_out_of_scope_requests_get_no_proposal(verdict, kind):
    service, call_model = FakeService(), model()
    body = edit(FakeUserClient(), service, call_model, verdict=verdict)
    assert body["kind"] == kind and body["proposal"] is None and len(call_model.calls) == 1
    assert service.records[0]["p_proposal_kind"] is None


# --- refused --------------------------------------------------------------------


@pytest.mark.parametrize("setup, kwargs, status, code", [
    (lambda u: setattr(u, "editable", False), {}, 403, "forbidden"),
    (lambda u: None, {"revision": 3}, 409, "stale_revision"),
    (lambda u: None, {"section": "appendix"}, 422, "validation_error"),
    (lambda u: u.tables["prd"][0].update(content_json={"sections": []}, doc_schema_version=1), {}, 409,
     "document_not_v2"),
    (lambda u: u.tables.__setitem__("prd", []), {}, 404, "not_found"),
])
def test_refused_before_the_gate_or_any_model_call(setup, kwargs, status, code):
    user, service, call_model = FakeUserClient(), FakeService(), model()
    setup(user)
    with pytest.raises(ApiError) as info:
        edit(user, service, call_model, **kwargs)
    assert (info.value.status_code, info.value.code) == (status, code)
    assert call_model.calls == [] and service.records == [] and "ai_admit" not in user.calls


@pytest.mark.parametrize("reply", [
    {"section": {**NEW_GOALS, "attrs": {"type": "risks"}}, "message": "x"},  # wrong section
    {"section": {"type": "section", "attrs": {"type": "goals"}, "content": [{"type": "image"}]}, "message": "x"},
    {"section": {"type": "section", "attrs": {"type": "goals"}, "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "x", "marks": [{"type": "ai_generated", "attrs": {"generation_record_id": RECORD}}]}]}]},
     "message": "x"},
    {"section": NEW_GOALS},  # no explanation
    "not an object",
])
def test_invalid_replies_are_rejected_and_recorded(reply):
    service = FakeService()
    with pytest.raises(AIError) as info:
        edit(FakeUserClient(), service, model(reply=reply))
    assert info.value.code == "ai_invalid_output"
    assert service.records[-1]["p_error_code"] == "ai_invalid_output"


def test_a_save_while_the_model_ran_stages_nothing():
    with pytest.raises(ApiError) as info:
        edit(FakeUserClient(), FakeService(outcome="stale"), model())
    assert info.value.code == "stale_revision"


def test_missing_modules_disable_ai_edits(monkeypatch):
    monkeypatch.setattr(chat, "load_modules", lambda: None)
    with pytest.raises(ApiError) as info:
        section_edit.propose_section_edit(FakeUserClient(), FakeService(), actor_id=ACTOR, prd_id=PRD, revision=4,
                                          section_type="goals", instruction="x", session_messages=[])
    assert info.value.status_code == 503


# --- accepting a section edit (A05) ----------------------------------------------


class AcceptService:
    def __init__(self, saved=None, **proposal):
        merged = section_edit.merge_section(DOC, NEW_GOALS)
        self.proposal = {"prd_id": PRD, "requester_id": ACTOR, "kind": "ai_edit", "base_revision": 4,
                         "status": "pending", "context_patch": None,
                         "content": {"section_type": "goals", "section": NEW_GOALS, "content_json": merged},
                         **proposal}
        self.saved, self.calls = saved or copy.deepcopy(DOC), []

    def table(self, name):
        data = [self.proposal] if name == "ai_proposal" else [{"content_json": self.saved}]
        query = SimpleNamespace(execute=lambda: SimpleNamespace(data=data))
        query.select = lambda *_: query
        query.eq = lambda *_: query
        return query

    def rpc(self, name, params):
        self.calls.append(params)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": PRD, "revision": 5}))


USER = SimpleNamespace(id=ACTOR)


def accept(service, content, **fields):
    return save_prd(service, USER, PRD, 4, content_json=content, origin="ai_generated",
                    generation_record_id=RECORD, **fields)


def marked(document):
    return [s["attrs"]["type"] for s in document["content"] if "ai_generated" in json.dumps(s)]


def test_accepting_unchanged_marks_only_that_section():
    service = AcceptService()
    accept(service, section_edit.merge_section(DOC, NEW_GOALS))
    params = service.calls[0]
    assert marked(params["p_content_json"]) == ["goals"] and params["p_apply_context_patch"] is False


def test_accepting_an_edited_section_saves_it_unmarked():
    service = AcceptService()
    edited = copy.deepcopy(NEW_GOALS)
    edited["content"][0]["content"][0]["text"] = "Our own wording."
    accept(service, section_edit.merge_section(DOC, edited))
    assert marked(service.calls[0]["p_content_json"]) == []


@pytest.mark.parametrize("change", ["other_section", "title", "no_document"])
def test_only_the_proposed_section_may_change(change):
    service = AcceptService()
    content = section_edit.merge_section(DOC, NEW_GOALS)
    fields = {}
    if change == "other_section":
        content["content"][0]["content"][0]["content"][0]["text"] = "Sneaky change to the problem."
    elif change == "title":
        fields["title"] = "New title"
    with pytest.raises(acceptance.AcceptanceError) as info:
        if change == "no_document":
            save_prd(service, USER, PRD, 4, origin="ai_generated", generation_record_id=RECORD, description="x")
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
    monkeypatch.setattr(chat, "generate_json", model())
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": SimpleNamespace(id=ACTOR), "client": user}
    yield TestClient(main.app), user
    main.app.dependency_overrides.clear()


def test_route_returns_the_proposal(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(section_edit, "generate_json", model())
    r = client.post(f"/api/prds/{PRD}/ai-edit", json={"revision": 4, "section_type": "goals",
                                                      "instruction": "Make it measurable."})
    assert r.status_code == 200, r.text
    assert set(r.json()) == {"kind", "message", "proposal", "base_revision", "generation_record_id"}


@pytest.mark.parametrize("body", [
    {"section_type": "goals", "instruction": "x"},
    {"revision": 4, "section_type": "goals", "instruction": ""},
    {"revision": 4, "section_type": "goals", "instruction": "x" * 2001},
    {"revision": 4, "section_type": "goals", "instruction": "x", "session_messages": [{"role": "system", "content": "x"}]},
    {"revision": 4, "section_type": "goals", "instruction": "x", "session_messages": [{"role": "user", "content": "x"}] * 21},
    {"revision": 4, "section_type": "goals", "instruction": "x", "save": True},
])
def test_route_validates_the_body(api, body):
    client, user = api
    r = client.post(f"/api/prds/{PRD}/ai-edit", json=body)
    assert r.status_code == 422 and user.calls == []

"""AI records and staged proposals (app/backend/ai/records.py).

A fake stands in for the service-role Supabase client. The database rules
themselves (access, binding, replay, expiry, staging) are checked against
Postgres by the SQL suite in the PR description; these tests cover the
Python side: argument checks, the parameters sent, and error mapping.
Run from app/backend with: python -m pytest tests/test_ai_records.py
"""

import json
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

from ai import records
from ai.generation import GenerationProposal
from ai.records import RecordError, record_ai_request, record_failure, record_generation, reject_proposal

ALICE = "00000000-0000-0000-0000-0000000000a1"
PRD = "00000000-0000-0000-0000-000000000101"
RECORD = "3f2b8c1e-5d4a-4b6f-8e9d-0a1b2c3d4e5f"
PROPOSAL = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"
FIXTURES = Path(__file__).resolve().parent.parent.parent / "shared" / "fixtures" / "prd_document"


class FakeService:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return type("Response", (), {"data": self.data})()


def staged(outcome="staged", proposal_id=PROPOSAL):
    return FakeService([{"generation_record_id": RECORD, "proposal_id": proposal_id, "outcome": outcome}])


def proposal():
    document = json.loads((FIXTURES / "valid" / "full_generated_draft.json").read_text())["document"]
    return GenerationProposal(title="Lunch voting", description="Pick lunch fast.", content_json=document,
                              content_text="...", doc_schema_version=2, model="gemini-test",
                              prompt_version="prd-generate-v1", prompt_tokens=518, output_tokens=855)


# --- success, staging ---------------------------------------------------------


def test_successful_generation_is_recorded_and_staged():
    service = staged()
    result = record_generation(service, actor_id=ALICE, prd_id=PRD, base_revision=3, proposal=proposal(),
                               context_patch={"running_summary": "Lunch voting", "decisions": ["Web poll"]})
    assert result == records.RecordResult(RECORD, PROPOSAL, "staged")
    name, params = service.calls[0]
    assert name == "ai_record_generation"
    assert params["p_actor"] == ALICE and params["p_prd_id"] == PRD and params["p_base_revision"] == 3
    assert params["p_trigger"] == "initial_generation" and params["p_status"] == "success"
    assert params["p_proposal_kind"] == "generate"
    assert (params["p_model"], params["p_prompt_version"]) == ("gemini-test", "prd-generate-v1")
    assert (params["p_prompt_tokens"], params["p_output_tokens"]) == (518, 855)
    assert params["p_ttl_seconds"] == records.PROPOSAL_TTL_SECONDS
    assert params["p_context_patch"] == {"running_summary": "Lunch voting", "decisions": ["Web poll"]}


def test_proposal_content_holds_the_draft_but_not_derived_text():
    content = records.proposal_content(proposal())
    assert set(content) == {"title", "description", "content_json", "doc_schema_version"}
    assert content["doc_schema_version"] == 2


def test_stale_outcome_has_no_proposal():
    result = record_generation(staged("stale", None), actor_id=ALICE, prd_id=PRD, base_revision=2,
                               proposal=proposal())
    assert (result.outcome, result.proposal_id) == ("stale", None)


# --- failures and chat ---------------------------------------------------------


def test_failure_records_the_code_and_stages_nothing():
    service = staged("recorded", None)
    record_failure(service, actor_id=ALICE, prd_id=PRD, base_revision=3, trigger="initial_generation",
                   model="gemini-test", prompt_version="prd-generate-v1", error_code="ai_invalid_output")
    params = service.calls[0][1]
    assert params["p_status"] == "failed" and params["p_error_code"] == "ai_invalid_output"
    assert params["p_proposal_kind"] is None and params["p_proposal_content"] is None
    assert params["p_ttl_seconds"] is None


def test_chat_answer_without_a_proposal():
    service = staged("recorded", None)
    result = record_ai_request(service, actor_id=ALICE, prd_id=PRD, base_revision=3, trigger="chat_request",
                               model="gemini-test", prompt_version="chat-v0", user_request="What are the risks?")
    assert result.outcome == "recorded"
    assert service.calls[0][1]["p_user_request"] == "What are the risks?"


# --- checks before the database ----------------------------------------------------


@pytest.mark.parametrize("changes, message", [
    ({"base_revision": 0}, "Invalid base revision"),
    ({"base_revision": True}, "Invalid base revision"),
    ({"trigger": "classification"}, "Unknown AI trigger"),
    ({"proposal_kind": "rewrite_everything", "proposal_content": {}}, "Unknown proposal kind"),
    ({"user_request": "x" * 2001}, "longer than 2000"),
])
def test_bad_arguments_never_reach_the_database(changes, message):
    service = staged()
    args = dict(actor_id=ALICE, prd_id=PRD, base_revision=3, trigger="chat_request", model="m", prompt_version=None)
    args.update(changes)
    with pytest.raises(RecordError) as info:
        record_ai_request(service, **args)
    assert info.value.status_code == 422 and message in info.value.detail
    assert service.calls == []


@pytest.mark.parametrize("patch", [
    [],
    {"notes": ["x"]},
    {"running_summary": "x" * 4001},
    {"running_summary": 5},
    {"decisions": "one"},
    {"decisions": ["x"] * 51},
    {"decisions": [""]},
    {"constraints": ["x" * 501]},
    {"change_log": ["x"] * 21},
    {"source_ids": ["not-a-uuid"]},
    {"source_ids": ["3F2B8C1E-5D4A-4B6F-8E9D-0A1B2C3D4E5F"]},
])
def test_invalid_context_patches_are_refused(patch):
    service = staged()
    with pytest.raises(RecordError) as info:
        record_generation(service, actor_id=ALICE, prd_id=PRD, base_revision=3, proposal=proposal(),
                          context_patch=patch)
    assert (info.value.status_code, info.value.code) == (422, "invalid_context_patch")
    assert service.calls == []


def test_valid_context_patch_shapes():
    assert records.validate_context_patch({
        "running_summary": "x" * 4000,
        "decisions": ["a"] * 50,
        "constraints": [],
        "open_questions": ["Budget?"],
        "change_log": ["generated"] * 20,
        "source_ids": [RECORD],
    }) == []


# --- database errors -----------------------------------------------------------------


@pytest.mark.parametrize("sqlstate, status, code", [
    ("NT404", 404, "not_found"),
    ("NT403", 403, "forbidden"),
    ("NT409", 409, "stale_revision"),
    ("NT422", 422, "validation_error"),
    ("NTPRP", 409, "proposal_unavailable"),
])
def test_database_errors_map_to_api_errors(sqlstate, status, code):
    service = FakeService(error=APIError({"code": sqlstate, "message": "detail from Postgres"}))
    with pytest.raises(RecordError) as info:
        record_generation(service, actor_id=ALICE, prd_id=PRD, base_revision=3, proposal=proposal())
    assert (info.value.status_code, info.value.code) == (status, code)
    assert "Postgres" not in info.value.detail


def test_browser_style_permission_error_is_left_to_the_shared_handler():
    # 42501 means the call wasn't made with the service role: a wiring bug,
    # not a user error, so it goes to the S01 handler unchanged.
    service = FakeService(error=APIError({"code": "42501", "message": "permission denied"}))
    with pytest.raises(APIError):
        record_generation(service, actor_id=ALICE, prd_id=PRD, base_revision=3, proposal=proposal())


# --- reject ----------------------------------------------------------------------------


def test_reject_returns_the_final_status():
    service = FakeService("rejected")
    assert reject_proposal(service, actor_id=ALICE, proposal_id=PROPOSAL) == "rejected"
    assert service.calls == [("ai_reject_proposal", {"p_actor": ALICE, "p_proposal_id": PROPOSAL})]


def test_rejecting_someone_elses_proposal_looks_like_missing():
    service = FakeService(error=APIError({"code": "NTPRP", "message": "Proposal not found"}))
    with pytest.raises(RecordError) as info:
        reject_proposal(service, actor_id=ALICE, proposal_id=PROPOSAL)
    assert (info.value.status_code, info.value.code) == (409, "proposal_unavailable")


# --- the Python limits match the database ------------------------------------------------


def test_context_limits_match_the_migration():
    parents = Path(__file__).resolve().parents
    # In the backend container app/backend is /app, so there is no repo root.
    path = parents[3] / "supabase" / "migrations" / "20261030121000_ai_records.sql" if len(parents) > 3 else None
    if path is None or not path.exists():
        pytest.skip("migrations aren't mounted here (the backend container mounts only app/backend)")
    sql = path.read_text()
    assert "max_items := 50; max_chars := 500;" in sql
    assert "max_items := 20; max_chars := 300;" in sql
    assert "max_items := 50; max_chars := 36;" in sql
    assert "> 4000" in sql
    for limits in [records.CONTEXT_LIST_LIMITS[k] for k in ("decisions", "constraints", "open_questions")]:
        assert limits == (50, 500)
    assert records.CONTEXT_LIST_LIMITS["change_log"] == (20, 300)
    assert records.CONTEXT_LIST_LIMITS["source_ids"] == (50, 36)
    assert records.MAX_RUNNING_SUMMARY_CHARS == 4000

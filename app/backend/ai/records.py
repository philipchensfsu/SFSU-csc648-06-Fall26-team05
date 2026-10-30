"""AI request records and staged proposals (Backend Tasks A02).

After every provider call, the AI route records what happened and, for a
usable result, stages a proposal:

    result = record_generation(service_client, actor_id=user.id, prd_id=prd_id,
                               base_revision=revision, proposal=proposal)
    # result.outcome: "staged" -> return result.proposal_id and
    #                 result.generation_record_id to the browser;
    #                 "stale"  -> the PRD changed while Gemini ran: 409.

Staging never changes the PRD's content, status or durable context
(prd_context). A proposal is bound to the requester, the PRD and the revision
it was made from, expires, and can be used once. Accepting it is A05: the
save transaction calls the database functions ai_take_proposal and
ai_apply_context_patch after locking the PRD, so acceptance and the save
commit or roll back together. That is not wired here (see the contract in
supabase/migrations/20261030120000_ai_records.sql).

The database functions accept calls from the service role only, so a browser
can't record a fake successful generation. This uses the same trusted-writer
pattern as save_prd (#55), which is still under review as an architecture
exception; pass the service-role client and the id get_current_user verified.
Not wired into any route yet.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from postgrest.exceptions import APIError

from ai.generation import GenerationProposal
from errors import ApiError

# How long a staged proposal can be accepted. Provisional: long enough to read
# and edit a full draft, short enough that stale previews don't pile up.
# Not a team-agreed value.
PROPOSAL_TTL_SECONDS = 30 * 60

TRIGGERS = ("initial_generation", "chat_request")
PROPOSAL_KINDS = ("generate", "ai_edit", "review_suggestion")
OUTCOMES = ("staged", "stale", "recorded")
MAX_USER_REQUEST_CHARS = 2000

# prd_context bounds, mirrored from ai_context_shape_ok() in the migration so
# callers get a clear error before the database refuses the patch.
CONTEXT_LIST_LIMITS = {
    "decisions": (50, 500),
    "constraints": (50, 500),
    "open_questions": (50, 500),
    "change_log": (20, 300),
    "source_ids": (50, 36),
}
MAX_RUNNING_SUMMARY_CHARS = 4000
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# SQLSTATEs raised by the database functions.
DATABASE_ERRORS = {
    "NT404": (404, "PRD not found", "not_found"),
    "NT403": (403, "You can view this PRD but not edit it", "forbidden"),
    "NT409": (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision"),
    "NT422": (422, "The AI result couldn't be recorded", "validation_error"),
    "NTPRP": (409, "This AI suggestion is no longer available", "proposal_unavailable"),
}


class RecordError(ApiError):
    pass


@dataclass(frozen=True)
class RecordResult:
    generation_record_id: str
    proposal_id: str | None
    outcome: str  # one of OUTCOMES


def proposal_content(proposal: GenerationProposal) -> dict:
    """What a generate proposal stores. content_text isn't stored: the save
    derives it again from whatever the user accepts."""
    return {
        "title": proposal.title,
        "description": proposal.description,
        "content_json": proposal.content_json,
        "doc_schema_version": proposal.doc_schema_version,
    }


def validate_context_patch(patch) -> list[str]:
    """Problems with a context patch; empty list = acceptable."""
    if not isinstance(patch, dict):
        return ["The context patch must be an object."]
    problems = []
    for key, value in patch.items():
        if key == "running_summary":
            if not isinstance(value, str) or len(value) > MAX_RUNNING_SUMMARY_CHARS:
                problems.append(f"running_summary must be text of at most {MAX_RUNNING_SUMMARY_CHARS} characters.")
            continue
        if key not in CONTEXT_LIST_LIMITS:
            problems.append(f"Unknown context field {key!r}.")
            continue
        max_items, max_chars = CONTEXT_LIST_LIMITS[key]
        if not isinstance(value, list) or len(value) > max_items:
            problems.append(f"{key} must be a list of at most {max_items} items.")
            continue
        for item in value:
            if not isinstance(item, str) or not 1 <= len(item) <= max_chars:
                problems.append(f"Each {key} entry must be text of 1 to {max_chars} characters.")
                break
            if key == "source_ids" and not _UUID.match(item):
                problems.append("source_ids must be lowercase UUIDs.")
                break
    return problems


def record_generation(service_client, *, actor_id, prd_id, base_revision: int,
                      proposal: GenerationProposal, context_patch: dict | None = None,
                      ttl_seconds: int = PROPOSAL_TTL_SECONDS) -> RecordResult:
    """Records a successful initial generation and stages its proposal."""
    return record_ai_request(
        service_client, actor_id=actor_id, prd_id=prd_id, base_revision=base_revision,
        trigger="initial_generation", model=proposal.model, prompt_version=proposal.prompt_version,
        prompt_tokens=proposal.prompt_tokens, output_tokens=proposal.output_tokens,
        proposal_kind="generate", proposal_content=proposal_content(proposal),
        context_patch=context_patch, ttl_seconds=ttl_seconds,
    )


def record_failure(service_client, *, actor_id, prd_id, base_revision: int, trigger: str,
                   model: str, prompt_version: str | None, error_code: str,
                   user_request: str | None = None) -> RecordResult:
    """Records a provider call that produced nothing usable. error_code is the
    API code (for example ai_invalid_output), never provider text."""
    return record_ai_request(
        service_client, actor_id=actor_id, prd_id=prd_id, base_revision=base_revision,
        trigger=trigger, model=model, prompt_version=prompt_version, status="failed",
        error_code=error_code, user_request=user_request,
    )


def record_ai_request(service_client, *, actor_id, prd_id, base_revision: int, trigger: str,
                      model: str, prompt_version: str | None, status: str = "success",
                      error_code: str | None = None, user_request: str | None = None,
                      prompt_tokens: int | None = None, output_tokens: int | None = None,
                      proposal_kind: str | None = None, proposal_content: dict | None = None,
                      context_patch: dict | None = None,
                      ttl_seconds: int = PROPOSAL_TTL_SECONDS) -> RecordResult:
    """The general form, also for chat requests that answer without proposing
    a document change (proposal_kind=None). The database decides access: view
    access to record, edit access to stage a proposal."""
    if isinstance(base_revision, bool) or not isinstance(base_revision, int) or base_revision < 1:
        raise RecordError(422, "Invalid base revision", "validation_error")
    if trigger not in TRIGGERS:
        raise RecordError(422, "Unknown AI trigger", "validation_error")
    if proposal_kind is not None and proposal_kind not in PROPOSAL_KINDS:
        raise RecordError(422, "Unknown proposal kind", "validation_error")
    if user_request is not None and len(user_request) > MAX_USER_REQUEST_CHARS:
        raise RecordError(422, f"The request is longer than {MAX_USER_REQUEST_CHARS} characters", "validation_error")
    if context_patch is not None:
        problems = validate_context_patch(context_patch)
        if problems:
            raise RecordError(422, problems[0], "invalid_context_patch")
    params = {
        "p_actor": str(actor_id),
        "p_prd_id": str(prd_id),
        "p_base_revision": base_revision,
        "p_trigger": trigger,
        "p_model": model,
        "p_prompt_version": prompt_version,
        "p_status": status,
        "p_error_code": error_code,
        "p_user_request": user_request,
        "p_prompt_tokens": prompt_tokens,
        "p_output_tokens": output_tokens,
        "p_proposal_kind": proposal_kind,
        "p_proposal_content": proposal_content,
        "p_context_patch": context_patch,
        "p_ttl_seconds": ttl_seconds if proposal_kind is not None else None,
    }
    rows = _call(service_client, "ai_record_generation", params)
    row = rows[0]
    return RecordResult(generation_record_id=row["generation_record_id"],
                        proposal_id=row["proposal_id"], outcome=row["outcome"])


def reject_proposal(service_client, *, actor_id, proposal_id) -> str:
    """Discards the requester's pending proposal. Returns its final status:
    rejected, or accepted/expired if it had already left pending."""
    return _call(service_client, "ai_reject_proposal",
                 {"p_actor": str(actor_id), "p_proposal_id": str(proposal_id)})


def _call(service_client, function: str, params: dict):
    try:
        return service_client.rpc(function, params).execute().data
    except APIError as exc:
        known = DATABASE_ERRORS.get(exc.code or "")
        if known is None:
            raise  # the shared S01 handler turns it into a safe 4xx/500
        status, detail, code = known
        raise RecordError(status, detail, code) from None

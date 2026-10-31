"""Generation preview (Backend Tasks A03): POST /api/prds/{id}/generate.

Turns a PRD's saved interview answers into a proposed draft without saving
anything to the PRD:

1. Load the PRD, its answers and its context with the user's own client, so
   RLS decides what they can see (404 otherwise).
2. Require edit access through the database's can_edit_prd, the same check
   the save uses (403 otherwise).
3. Check the expected revision (409) and the required answers (422) before
   any limit or Gemini call.
4. Inside one A07 admission (ai/usage_gate.py): generate (ai/generation.py),
   reload the inputs, recheck access and freshness, then record the request
   and stage the proposal (ai/records.py). The lease is released when the
   block ends, even on error.

Intake answers can change while Gemini runs without moving the PRD's
revision, so the inputs are fingerprinted before and after the call. A
draft built from answers that have since changed is recorded but not
staged, and the caller gets 409 intake_changed (provisional code: the
frontend guide lists this signal as "to confirm").

Nothing here changes the PRD's content, revision, versions, status or
durable context. Only the generation_record and the staged ai_proposal
persist. Acceptance is A05, through the normal save, using the returned
generation_record_id.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass

from ai import records, usage_gate
from ai.gemini_client import AIError, GeminiResult, generate_json, model_name
from ai.generation import (INTAKE_KEYS, PROMPT_VERSION, GenerationInput, SavedContext, check_inputs,
                           generate_proposal)
from errors import ApiError

logger = logging.getLogger("nautilus.ai")

STALE_REVISION = (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision")
INTAKE_CHANGED = (409, "Your interview answers changed while the draft was being written. "
                       "Generate again to use them.", "intake_changed")
CANNOT_EDIT = (403, "You don't have permission to edit this PRD.", "forbidden")


@dataclass(frozen=True)
class PreviewState:
    """What one load of the PRD saw."""
    revision: int
    inputs: GenerationInput
    fingerprint: str


def generate_preview(user_client, service_client, *, actor_id, prd_id: str, revision: int,
                     call_model: Callable[..., GeminiResult] | None = None) -> dict:
    """Returns {proposal, base_revision, generation_record_id} or raises an
    ApiError the S01 handler renders. call_model defaults to the shared
    Gemini client."""
    before = load_state(user_client, prd_id)
    require_edit(user_client, prd_id)
    if before.revision != revision:
        raise ApiError(*STALE_REVISION)
    check_inputs(before.inputs)  # 422 intake_incomplete before any limit or Gemini call

    with usage_gate.admitted(user_client):
        try:
            proposal = generate_proposal(before.inputs, call_model=call_model or generate_json)
        except AIError as exc:
            _record_failure(service_client, actor_id, prd_id, revision, exc.code)
            raise

        after = load_state(user_client, prd_id)  # 404 if access was lost
        discard = None
        if after.revision == revision and after.fingerprint != before.fingerprint:
            discard = INTAKE_CHANGED
        elif after.revision == revision and not can_edit(user_client, prd_id):
            discard = CANNOT_EDIT
        if discard:
            _record_discarded(service_client, actor_id, prd_id, revision, proposal, discard[2])
            raise ApiError(*discard)

        # The database rechecks access and the revision when it stages.
        result = records.record_generation(service_client, actor_id=actor_id, prd_id=prd_id,
                                           base_revision=revision, proposal=proposal)
    if result.outcome != "staged":
        raise ApiError(*STALE_REVISION)
    return {
        "proposal": {
            "title": proposal.title,
            "description": proposal.description,
            "content_json": proposal.content_json,
            "doc_schema_version": proposal.doc_schema_version,
            # Grounded sources arrive with A09; generation doesn't use grounding yet.
            "sources": [],
        },
        "base_revision": revision,
        "generation_record_id": result.generation_record_id,
    }


def load_state(user_client, prd_id: str) -> PreviewState:
    prd = user_client.table("prd").select("*").eq("id", prd_id).execute().data
    if not prd:
        raise ApiError(404, "PRD not found")
    row = prd[0]
    answers = {key: "" for key in INTAKE_KEYS}
    rows = (user_client.table("intake_answer").select("question_key, answer_text, skipped")
            .eq("prd_id", prd_id).execute().data)
    for answer in rows:
        if answer["question_key"] in answers and not answer["skipped"]:
            answers[answer["question_key"]] = answer["answer_text"] or ""
    context = (user_client.table("prd_context").select("version, context_json, running_summary")
               .eq("prd_id", prd_id).execute().data)
    # A PRD may have no description yet; the prompt then gets "".
    inputs = GenerationInput(title=row["title"], description=row.get("description") or "", answers=answers,
                             context=SavedContext.from_row(context[0] if context else None))
    return PreviewState(revision=row["revision"], inputs=inputs,
                        fingerprint=_fingerprint(inputs, context[0] if context else None))


def can_edit(user_client, prd_id: str) -> bool:
    """The shared rule (can_edit_prd), asked as the user."""
    return user_client.rpc("can_edit_prd", {"target_prd_id": prd_id}).execute().data is True


def require_edit(user_client, prd_id: str) -> None:
    if not can_edit(user_client, prd_id):
        raise ApiError(*CANNOT_EDIT)


def _fingerprint(inputs: GenerationInput, context: dict | None) -> str:
    # The whole context row, not only the parts sent to Gemini: any change
    # means the draft no longer matches what the PRD knows.
    data = {"title": inputs.title, "description": inputs.description,
            "answers": dict(inputs.answers), "context": context}
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _record_failure(service_client, actor_id, prd_id, revision, error_code):
    # Best effort: the provider error is what the user needs to see.
    try:
        records.record_failure(service_client, actor_id=actor_id, prd_id=prd_id, base_revision=revision,
                               trigger="initial_generation", model=model_name(),
                               prompt_version=PROMPT_VERSION, error_code=error_code)
    except Exception as exc:  # noqa: BLE001
        logger.error("Couldn't record a failed generation (%s)", type(exc).__name__)


def _record_discarded(service_client, actor_id, prd_id, revision, proposal, error_code):
    # Gemini answered, but the draft can't be offered: keep the usage on
    # record, stage nothing.
    try:
        records.record_ai_request(service_client, actor_id=actor_id, prd_id=prd_id, base_revision=revision,
                                  trigger="initial_generation", model=proposal.model,
                                  prompt_version=proposal.prompt_version, status="failed",
                                  error_code=error_code, prompt_tokens=proposal.prompt_tokens,
                                  output_tokens=proposal.output_tokens)
    except Exception as exc:  # noqa: BLE001
        logger.error("Couldn't record a discarded generation (%s)", type(exc).__name__)

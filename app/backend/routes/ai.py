"""AI routes (Marco's A03, A04, A08, E12) and the PRD's owning team and priority."""

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import Field

from ai import chat, chat_revision, classification, preview, review_suggestion, section_edit, usage_gate
from auth import get_current_user
from common import RequestModel, call_function
from errors import ApiError
from routes.prds import PRDOut, with_my_role
from supabase_client import supabase

router = APIRouter()


class GenerateRequest(RequestModel):
    # The revision the client last saw; the draft is built for it.
    revision: int = Field(..., ge=1)


class ChatMessage(RequestModel):
    role: Literal["user", "assistant"]
    # Earlier assistant replies can be up to MAX_ANSWER_CHARS, so history
    # items allow that; a new message is still capped at MAX_MESSAGE_CHARS.
    content: str = Field(..., min_length=1, max_length=chat.MAX_ANSWER_CHARS)


class AiEditRequest(RequestModel):
    revision: int = Field(..., ge=1)
    section_type: str
    instruction: str = Field(..., min_length=1, max_length=section_edit.MAX_INSTRUCTION_CHARS)
    # The same recent turns as the chat (browser memory, this PRD only).
    session_messages: list[ChatMessage] = Field(default_factory=list, max_length=chat.MAX_HISTORY_MESSAGES)


class AiRevisionRequest(RequestModel):
    revision: int = Field(..., ge=1)
    # What to change, read together with the recent conversation.
    instruction: str = Field(..., min_length=1, max_length=chat_revision.MAX_INSTRUCTION_CHARS)
    session_messages: list[ChatMessage] = Field(default_factory=list, max_length=chat.MAX_HISTORY_MESSAGES)
    # Request adjustments: the pending proposal to revise (its
    # generation_record_id). The server loads it; nothing comes from the browser.
    previous_generation_record_id: Optional[UUID] = None


class ReviewSuggestionRequest(RequestModel):
    revision: int = Field(..., ge=1)
    # prd_comment ids on the PRD's current version (E06; change-request
    # explanations are comments too).
    feedback_ids: list[UUID] = Field(..., min_length=1, max_length=review_suggestion.MAX_FEEDBACK_ITEMS)
    instruction: Optional[str] = Field(default=None, max_length=review_suggestion.MAX_INSTRUCTION_CHARS)


class ClassificationRequest(RequestModel):
    revision: int = Field(..., ge=1)


class ClassificationDecision(RequestModel):
    decision: Literal["accepted", "rejected"]
    # Only with "accepted": adjust the suggestion before it's applied.
    team_id: Optional[UUID] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None


class RoutingUpdate(RequestModel):
    owning_team_id: Optional[UUID]
    priority: Optional[Literal["low", "medium", "high", "critical"]]


class ChatRequest(RequestModel):
    revision: int = Field(..., ge=1)
    message: str = Field(..., min_length=1, max_length=chat.MAX_MESSAGE_CHARS)
    # Recent messages kept by the browser for this PRD only (no chat table).
    # Untrusted: they reach the model as data, never as instructions.
    history: list[ChatMessage] = Field(default_factory=list, max_length=chat.MAX_HISTORY_MESSAGES)


# Preview only (A03): returns {proposal, base_revision, generation_record_id}
# and saves nothing to the PRD. Accepting the proposal is a normal save (A05).
# Records and staged proposals are written with the service-role client for
# the verified user, the trusted-writer pattern reviewed on #55.
@router.post("/api/prds/{prd_id}/generate")
def generate_prd_preview(prd_id: UUID, payload: GenerateRequest, auth=Depends(get_current_user)):
    return preview.generate_preview(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision
    )


# PRD chat, answer-only (A04 first slice). Anyone who can view the PRD may
# ask; nothing is saved to it. Returns 503 ai_chat_unavailable until Om's
# guardrail and prompt modules are in place (see ai/chat.py).
@router.post("/api/prds/{prd_id}/ai/chat")
def chat_with_prd(prd_id: UUID, payload: ChatRequest, auth=Depends(get_current_user)):
    return chat.answer_chat(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        message=payload.message, history=[m.model_dump() for m in payload.history],
        budget=usage_gate.RequestBudget(),
    )


@router.post("/api/prds/{prd_id}/review-suggestions")
def request_review_suggestion(prd_id: UUID, payload: ReviewSuggestionRequest, auth=Depends(get_current_user)):
    # E12: a preview of revisions that address chosen review comments.
    # Nothing is saved; accept through PUT with generation_record_id.
    return review_suggestion.propose_review_suggestion(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        feedback_ids=[str(i) for i in payload.feedback_ids], instruction=payload.instruction,
        budget=usage_gate.RequestBudget(),
    )


# AI section edit (A04): needs edit access; returns a staged proposal to
# preview, never saves. Accept it through the normal save with its
# generation_record_id (A05). Om's scope check runs on the instruction.
@router.post("/api/prds/{prd_id}/ai-edit")
def request_ai_edit(prd_id: UUID, payload: AiEditRequest, auth=Depends(get_current_user)):
    return section_edit.propose_section_edit(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        section_type=payload.section_type, instruction=payload.instruction,
        session_messages=[m.model_dump() for m in payload.session_messages], budget=usage_gate.RequestBudget(),
    )


# Conversational revision across sections: needs the right to save a
# change (owners only once approved); returns a staged proposal to compare,
# never saves. Accept the whole proposal through the normal save with its
# generation_record_id, without title or description. Om's scope check runs
# on the instruction with the conversation.
@router.post("/api/prds/{prd_id}/ai-revisions")
def request_ai_revision(prd_id: UUID, payload: AiRevisionRequest, auth=Depends(get_current_user)):
    return chat_revision.propose_revision(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        instruction=payload.instruction, session_messages=[m.model_dump() for m in payload.session_messages],
        previous_generation_record_id=(None if payload.previous_generation_record_id is None
                                       else str(payload.previous_generation_record_id)),
        budget=usage_gate.RequestBudget(),
    )


# Owning team and priority (A08). Suggestion is a preview; only the owner or
# an org admin decides or sets them. No version, no revision change.
@router.post("/api/prds/{prd_id}/classification")
def suggest_prd_routing(prd_id: UUID, payload: ClassificationRequest, auth=Depends(get_current_user)):
    return classification.suggest_routing(auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id),
                                          revision=payload.revision, budget=usage_gate.RequestBudget())


@router.put("/api/prds/{prd_id}/classification/{suggestion_id}/decision", response_model=PRDOut)
def decide_prd_routing(prd_id: UUID, suggestion_id: UUID, payload: ClassificationDecision,
                       auth=Depends(get_current_user)):
    sent = payload.model_fields_set
    if payload.decision == "rejected" and ({"team_id", "priority"} & sent):
        raise ApiError(422, "Only an accepted suggestion takes a team or priority", code="validation_error")
    saved = classification.decide(supabase, str(auth["user"].id), str(prd_id), str(suggestion_id),
                                  decision=payload.decision, team_id=payload.team_id, set_team="team_id" in sent,
                                  priority=payload.priority)
    return with_my_role(auth["client"], auth["user"].id, [saved])[0]


# Errors raised by set_prd_routing (P0001 with a fixed message).
ROUTING_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "routing_forbidden": (403, "Only the PRD's owners or an org admin can set its team and priority.", "forbidden"),
    "invalid_team": (422, "Choose an active team of this PRD's organization", "invalid_team"),
    "invalid_priority": (422, "Unknown priority", "validation_error"),
}


@router.put("/api/prds/{prd_id}/routing", response_model=PRDOut)
def set_prd_routing(prd_id: UUID, payload: RoutingUpdate, auth=Depends(get_current_user)):
    # Owners and org admins, an active team of the PRD's org (or none). The
    # database function checks both under the PRD lock; clients can't write
    # these columns directly (S02 grants).
    client = auth["client"]
    row = call_function(client, "set_prd_routing", {
        "target_prd": str(prd_id),
        "new_team": None if payload.owning_team_id is None else str(payload.owning_team_id),
        "new_priority": payload.priority,
    }, ROUTING_ERRORS)
    return with_my_role(client, auth["user"].id, [row])[0]

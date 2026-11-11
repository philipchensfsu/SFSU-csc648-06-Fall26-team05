import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import Field

import prd_save
from auth import get_current_user
from common import RequestModel
from errors import ApiError
from routes.prds import PRDOut, with_my_role
from supabase_client import supabase

router = APIRouter()


class PRDUpdate(RequestModel):
    # The client's last-known revision; the update is rejected with 409 if
    # the row has moved on since (see Section 1.4 of the M2 report).
    revision: int
    title: Optional[str] = Field(default=None, max_length=200)
    content_json: Optional[dict] = None
    # Legacy save only: the S03 save derives content_text itself.
    content_text: Optional[str] = None
    # Refused (422 status_not_allowed): status changes only through review
    # (Decision 6). Kept as a field so the error names it.
    status: Optional[str] = None
    # S03 save only (PRD_SAVE_V2): description is its own column there, and
    # generation_record_id accepts an AI proposal (A05).
    description: Optional[str] = None
    generation_record_id: Optional[UUID] = None
    # S03 save only: the reviewers an owner confirmed in the edit modal when
    # saving edits to an approved PRD (E09, Decision 9).
    confirmed_reviewer_ids: Optional[list[UUID]] = Field(default=None, max_length=50)


# The S03 save (prd_save.save_prd: v2 documents, versions, server-derived
# text) replaces the direct update once the frontend sends v2 documents.
# Until that cutover, PUT keeps the legacy update. Set PRD_SAVE_V2=true to
# switch.
LEGACY_ONLY_FIELDS = ("content_text", "status")
SAVE_CORE_ONLY_FIELDS = ("description", "generation_record_id", "confirmed_reviewer_ids")


def prd_save_v2_enabled() -> bool:
    return os.environ.get("PRD_SAVE_V2", "").strip().lower() in {"true", "1", "on", "yes"}


# Once PRD_SAVE_V2 is the only save path, remove the legacy update below and
# revoke the client's update grant on prd.revision (#102): the legacy
# compare-and-swap is the only reason clients may still write it, and a raw
# Data API call could bump it and fail other editors' saves (Om, #102 review).
@router.put("/api/prds/{prd_id}", response_model=PRDOut)
def update_prd(prd_id: UUID, payload: PRDUpdate, auth=Depends(get_current_user)):
    sent = payload.model_fields_set
    if prd_save_v2_enabled():
        return save_prd_v2(prd_id, payload, sent, auth)
    if "status" in sent:
        # Same refusal as the S03 save: status changes only through review.
        raise ApiError(422, "A PRD's status changes only through review. Don't send status when saving.",
                       code="status_not_allowed")
    unsupported = [name for name in SAVE_CORE_ONLY_FIELDS if name in sent]
    if unsupported:
        raise ApiError(422, f"{unsupported[0]} can't be saved yet", code="validation_error")
    client = auth["client"]
    update_fields = payload.model_dump(exclude={"revision"}, exclude_unset=True)
    update_fields["revision"] = payload.revision + 1

    response = (
        client.table("prd")
        .update(update_fields)
        .eq("id", str(prd_id))
        .eq("revision", payload.revision)
        .execute()
    )
    if not response.data:
        # No row matched: the PRD is missing or hidden from this user (404),
        # visible but not editable by them (403, same revision), or its
        # revision has moved on (409).
        visible = client.table("prd").select("id, revision").eq("id", str(prd_id)).execute()
        if not visible.data:
            raise ApiError(404, "PRD not found")
        if visible.data[0]["revision"] == payload.revision:
            raise ApiError(403, "You don't have permission to edit this PRD.")
        raise ApiError(
            409,
            "This PRD changed since you last loaded it. Refresh and try again.",
            code="stale_revision",
        )
    return with_my_role(client, auth["user"].id, response.data)[0]


def save_prd_v2(prd_id: UUID, payload: PRDUpdate, sent: set, auth: dict) -> dict:
    """The S03 save: only the fields sent change, in one transaction with a
    revision check and a version snapshot. The actor is the verified user."""
    if "status" in sent:
        raise ApiError(422, "Status can't be changed by saving. It changes through the review workflow.",
                       code="status_not_allowed")
    if "content_text" in sent:
        raise ApiError(422, "content_text is derived by the server; don't send it", code="validation_error")
    fields = {name: getattr(payload, name) for name in ("title", "description", "content_json") if name in sent}
    if payload.generation_record_id is not None:
        # Accepting an AI proposal (A05): the same save, which checks the
        # proposal (the requester's, this PRD, this base revision), marks
        # the sections accepted unchanged and uses it once in the
        # transaction (ai/acceptance.py and save_prd).
        fields["origin"] = "ai_generated"
        fields["generation_record_id"] = payload.generation_record_id
    if payload.confirmed_reviewer_ids is not None:
        fields["confirmed_reviewer_ids"] = payload.confirmed_reviewer_ids
    saved = prd_save.save_prd(supabase, auth["user"], str(prd_id), payload.revision, **fields)
    # Like every PRD response, it carries the caller's role, read as them.
    return with_my_role(auth["client"], auth["user"].id, [saved])[0]

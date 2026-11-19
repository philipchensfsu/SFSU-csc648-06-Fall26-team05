"""Owners remove or replace a reviewer who hasn't decided on the open round.
The removed slot is kept in the round's removed_reviewers."""

from uuid import UUID

from fastapi import APIRouter, Depends

from auth import get_current_user
from common import RequestModel, call_function, first_row
from routes.reviews import REVIEW_ERRORS, ROUND_COLUMNS, ReviewResult, round_item

router = APIRouter()


class ReplacementIn(RequestModel):
    reviewer_id: UUID


# Errors raised by change_reviewer (P0001 with a fixed message).
ROSTER_ERRORS = {
    **{key: REVIEW_ERRORS[key] for key in ("prd_not_found", "reviewer_not_in_organization", "owner_cannot_review")},
    "prd_manage_forbidden": (403, "Only the PRD's owners and org admins can change its reviewers.", None),
    "round_not_found": (404, "Review round not found", None),
    "round_not_open": (409, "Reviewers can only change while the round is open (in review or changes requested).",
                       "round_not_open"),
    "reviewer_not_found": (404, "That person isn't a reviewer on this round.", None),
    "reviewer_already_decided": (409, "This reviewer already decided; their decision stands.",
                                 "reviewer_already_decided"),
    "last_reviewer": (409, "A round needs at least one reviewer. Replace this reviewer instead.", "last_reviewer"),
    "already_a_reviewer": (409, "That person is already a reviewer on this round.", "already_a_reviewer"),
}


def change(auth, prd_id: UUID, round_id: UUID, user_id: UUID, replacement=None):
    client = auth["client"]
    call_function(client, "change_reviewer", {
        "target_prd": str(prd_id), "target_round": str(round_id), "target_reviewer": str(user_id),
        "replacement": str(replacement) if replacement else None,
    }, ROSTER_ERRORS)
    row = first_row(client.table("review_round").select(ROUND_COLUMNS).eq("id", str(round_id)),
                    "Review round not found")
    prd = first_row(client.table("prd").select("revision, status").eq("id", str(prd_id)), "PRD not found")
    return {"round": round_item(row), **prd}


@router.delete("/api/prds/{prd_id}/reviews/{round_id}/reviewers/{user_id}", response_model=ReviewResult)
def remove_reviewer(prd_id: UUID, round_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # If everyone left has approved, the round is approved and the PRD final.
    return change(auth, prd_id, round_id, user_id)


@router.post("/api/prds/{prd_id}/reviews/{round_id}/reviewers/{user_id}/replace", response_model=ReviewResult)
def replace_reviewer(prd_id: UUID, round_id: UUID, user_id: UUID, payload: ReplacementIn,
                     auth=Depends(get_current_user)):
    # The new reviewer starts pending and is notified.
    return change(auth, prd_id, round_id, user_id, payload.reviewer_id)

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel, call_function, first_row
from errors import ApiError
from pagination import Page, PageParams, paginate

router = APIRouter()


class ReviewerOut(BaseModel):
    user_id: UUID
    name: Optional[str]
    department: Optional[str]
    state: Literal["pending", "approved", "changes_requested"]
    decided_at: Optional[datetime]
    explanation: Optional[str]
    comment_id: Optional[UUID]


class ReviewRoundOut(BaseModel):
    id: UUID
    prd_id: UUID
    round_no: int
    version_id: UUID
    version_no: Optional[int]
    state: Literal["in_review", "changes_requested", "approved", "superseded"]
    owner_review_allowed: bool
    submitted_by: Optional[UUID]
    submitted_at: datetime
    completed_at: Optional[datetime]
    reviewers: list[ReviewerOut]


class ReviewSubmitIn(RequestModel):
    revision: int = Field(..., ge=1)
    version_id: UUID
    reviewer_ids: list[UUID] = Field(..., min_length=1, max_length=50)


class ReviewResult(BaseModel):
    round: ReviewRoundOut
    revision: int
    status: str


# Errors raised by submit_prd_review (P0001 with a fixed message).
REVIEW_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "prd_manage_forbidden": (403, "Only the PRD's owners and org admins can submit it for review.", None),
    "stale_revision": (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision"),
    "no_saved_version": (409, "Save the PRD before submitting it for review.", "no_saved_version"),
    "stale_version": (409, "The PRD has a newer version. Refresh and try again.", "stale_version"),
    "review_in_progress": (409, "This PRD already has a review in progress or approved.", "review_in_progress"),
    "empty_prd": (422, "Add some content before submitting the PRD for review.", "empty_prd"),
    "no_reviewers": (422, "Choose at least one reviewer.", "validation_error"),
    "reviewer_not_in_organization": (422, "Every reviewer must be an active member of this PRD's organization.",
                                     "not_in_organization"),
    "owner_cannot_review": (422, "Owners can't review their own PRD while someone else in the organization can.",
                            "owner_cannot_review"),
}

ROUND_COLUMNS = ("id, prd_id, round_no, version_id, state, owner_review_allowed, submitted_by, submitted_at, "
                 "completed_at, version:prd_version(version_no), "
                 "slots:review_slot(reviewer_id, reviewer_name, department_name, state, decided_at, comment_id, "
                 "comment:prd_comment(body))")


def round_item(row):
    reviewers = [{"user_id": s["reviewer_id"], "name": s["reviewer_name"], "department": s["department_name"],
                  "state": s["state"], "decided_at": s["decided_at"], "comment_id": s["comment_id"],
                  "explanation": (s["comment"] or {}).get("body")} for s in row["slots"]]
    reviewers.sort(key=lambda r: ((r["name"] or "").lower(), r["user_id"]))
    item = {k: row[k] for k in ("id", "prd_id", "round_no", "version_id", "state", "owner_review_allowed",
                                "submitted_by", "submitted_at", "completed_at")}
    return {**item, "version_no": (row["version"] or {}).get("version_no"), "reviewers": reviewers}


@router.get("/api/prds/{prd_id}/reviews", response_model=Page[ReviewRoundOut])
def list_review_rounds(prd_id: UUID, params: PageParams = Depends(), auth=Depends(get_current_user)):
    # Every round, newest first, superseded ones included.
    client = auth["client"]
    if not client.table("prd").select("id").eq("id", str(prd_id)).execute().data:
        raise ApiError(404, "PRD not found")
    query = client.table("review_round").select(ROUND_COLUMNS).eq("prd_id", str(prd_id))
    page = paginate(query, params, sort_column="submitted_at")
    return {"items": [round_item(r) for r in page["items"]], "next_cursor": page["next_cursor"]}


@router.post("/api/prds/{prd_id}/reviews", response_model=ReviewResult, status_code=201)
def submit_review(prd_id: UUID, payload: ReviewSubmitIn, auth=Depends(get_current_user)):
    # Owners and org admins submit the current version to the reviewers they
    # choose; the PRD moves to in_review.
    client = auth["client"]
    round_id = call_function(client, "submit_prd_review", {
        "target_prd": str(prd_id), "base_revision": payload.revision, "target_version": str(payload.version_id),
        "reviewer_ids": [str(r) for r in payload.reviewer_ids],
    }, REVIEW_ERRORS)
    row = first_row(client.table("review_round").select(ROUND_COLUMNS).eq("id", round_id), "Review round not found")
    prd = first_row(client.table("prd").select("revision, status").eq("id", str(prd_id)), "PRD not found")
    return {"round": round_item(row), **prd}


class ReviewDecisionIn(RequestModel):
    version_id: UUID
    decision: Literal["approved", "changes_requested"]
    explanation: Optional[str] = Field(default=None, max_length=5000)
    section_type: Optional[str] = None


# Errors raised by decide_review (P0001 with a fixed message).
DECISION_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "round_not_found": (404, "Review round not found", None),
    "round_not_current": (409, "This review round was replaced by a newer one.", "round_not_current"),
    "stale_version": (409, "The PRD changed since this round was submitted. Refresh to see the current review.",
                      "stale_version"),
    "not_a_reviewer": (403, "You're not a reviewer on this round.", None),
    "owner_cannot_review": (403, "Owners can't review their own PRD.", "owner_cannot_review"),
    "invalid_decision": (422, "The decision must be approved or changes_requested.", "validation_error"),
    "invalid_explanation": (422, "Requesting changes needs an explanation, up to 5,000 characters.",
                            "validation_error"),
    "invalid_section": (422, "section_type must be null or one of the PRD's nine section types.", "validation_error"),
    "decision_already_made": (409, "You already decided on this round; a decision can't be changed.",
                              "decision_already_made"),
}


@router.put("/api/prds/{prd_id}/reviews/{round_id}/decision", response_model=ReviewResult)
def decide_review(prd_id: UUID, round_id: UUID, payload: ReviewDecisionIn, auth=Depends(get_current_user)):
    # A reviewer approves or requests changes on the round's version. Returns
    # the round and the PRD's status (final once every reviewer approved).
    client = auth["client"]
    call_function(client, "decide_review", {
        "target_prd": str(prd_id), "target_round": str(round_id), "target_version": str(payload.version_id),
        "decision": payload.decision, "explanation": payload.explanation, "target_section": payload.section_type,
    }, DECISION_ERRORS)
    row = first_row(client.table("review_round").select(ROUND_COLUMNS).eq("id", str(round_id)),
                    "Review round not found")
    prd = first_row(client.table("prd").select("revision, status").eq("id", str(prd_id)), "PRD not found")
    return {"round": round_item(row), **prd}

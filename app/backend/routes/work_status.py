from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import Field

from auth import get_current_user
from common import RequestModel, call_function
from routes.prds import PRDOut, with_my_role

router = APIRouter()

WorkStatus = Literal["not_started", "in_progress", "done"]


class WorkStatusIn(RequestModel):
    # Compare-and-set: the status the caller last saw, and the new one.
    from_: WorkStatus = Field(..., alias="from")
    to: WorkStatus


class WorkStatusOut(PRDOut):
    can_update_work_status: bool
    changed_since_approval: bool


# Errors raised by set_prd_work_status (P0001 with a fixed message).
WORK_STATUS_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "work_status_forbidden": (403, "Only the PRD's owners and org admins can change its work status.", "forbidden"),
    "not_approved": (409, "Work status can change only while the PRD is approved.", "not_approved"),
    "stale_work_status": (409, "The work status changed since you loaded it. Refresh and try again.",
                          "stale_work_status"),
    "invalid_work_status": (422, "Unknown work status.", "validation_error"),
    "invalid_transition": (422, "Work status moves from not started to in progress, in progress to done, or done "
                                "back to in progress.", "invalid_transition"),
}


@router.put("/api/prds/{prd_id}/work-status", response_model=WorkStatusOut)
def set_work_status(prd_id: UUID, payload: WorkStatusIn, auth=Depends(get_current_user)):
    # E14: owners and org admins (M3), only while approved, compare-and-set.
    # Doesn't change the revision, make a version or touch the review.
    client = auth["client"]
    row = call_function(client, "set_prd_work_status",
                        {"target_prd": str(prd_id), "from_status": payload.from_, "to_status": payload.to},
                        WORK_STATUS_ERRORS)
    saved = with_my_role(client, auth["user"].id, [row])[0]
    return {**saved, **work_status_flags(client, prd_id)}


def work_status_flags(client, prd_id) -> dict:
    """What the caller may do with the work status now, and whether an
    approved PRD has been edited since (asked as the caller)."""
    return {
        "can_update_work_status": client.rpc("can_update_work_status", {"target_prd": str(prd_id)}).execute().data
        is True,
        "changed_since_approval": client.rpc("prd_changed_since_approval",
                                             {"target_prd": str(prd_id)}).execute().data is True,
    }

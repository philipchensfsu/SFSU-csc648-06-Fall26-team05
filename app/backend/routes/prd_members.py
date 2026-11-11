from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user
from common import RequestModel, call_function
from errors import ApiError

router = APIRouter()


class PRDMemberOut(BaseModel):
    user_id: UUID
    name: Optional[str]
    role: Literal["owner", "editor", "viewer"]
    granted_by: Optional[UUID]
    added_at: datetime


class PRDMemberIn(RequestModel):
    role: Literal["owner", "editor", "viewer"]


# Errors raised by the member functions (P0001 with a fixed message).
MEMBER_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "prd_manage_forbidden": (403, "Only the PRD's owners and org admins can change who's on it.", None),
    "invalid_role": (422, "The role must be owner, editor or viewer.", "validation_error"),
    "not_in_organization": (422, "That person isn't an active member of this PRD's organization.", "not_in_organization"),
    "owner_required": (409, "A PRD needs at least one owner. Add another owner first.", "owner_required"),
}


def list_people(client, prd_id: UUID):
    rows = client.rpc("prd_people", {"target_prd": str(prd_id)}).execute().data
    # A PRD always has an owner, so no rows means the caller can't see it.
    if not rows:
        raise ApiError(404, "PRD not found")
    return [{"user_id": r["user_id"], "name": r["full_name"], "role": r["role"],
             "granted_by": r["granted_by"], "added_at": r["created_at"]} for r in rows]


@router.get("/api/prds/{prd_id}/members", response_model=list[PRDMemberOut])
def list_prd_members(prd_id: UUID, auth=Depends(get_current_user)):
    # Everyone on the PRD, in the order they were added; any viewer can see it.
    return list_people(auth["client"], prd_id)


@router.put("/api/prds/{prd_id}/members/{user_id}", response_model=list[PRDMemberOut])
def set_prd_member(prd_id: UUID, user_id: UUID, payload: PRDMemberIn, auth=Depends(get_current_user)):
    # Invites someone from the PRD's organization, or changes their role.
    # Owners and org admins only. Returns the updated list.
    client = auth["client"]
    call_function(client, "set_prd_member",
                  {"target_prd": str(prd_id), "target_user": str(user_id), "new_role": payload.role}, MEMBER_ERRORS)
    return list_people(client, prd_id)


@router.delete("/api/prds/{prd_id}/members/{user_id}", status_code=204)
def remove_prd_member(prd_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # Owners and org admins remove anyone; anyone can remove themselves.
    call_function(auth["client"], "remove_prd_member", {"target_prd": str(prd_id), "target_user": str(user_id)},
                  MEMBER_ERRORS)

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ai import team_recommendation, usage_gate
from auth import get_current_user
from common import RequestModel, call_function
from errors import ApiError
from supabase_client import supabase

router = APIRouter()


class PRDMemberOut(BaseModel):
    user_id: UUID
    name: Optional[str]
    role: Literal["owner", "editor", "viewer"]
    granted_by: Optional[UUID]
    added_at: datetime


class PRDMemberIn(RequestModel):
    role: Literal["owner", "editor", "viewer"]


class TeamMembersIn(RequestModel):
    team_id: UUID
    role: Literal["editor", "viewer"]


class TeamMembersOut(BaseModel):
    added: list[PRDMemberOut]
    skipped: list[PRDMemberOut]  # already on the PRD; their role is unchanged
    members: list[PRDMemberOut]


# Errors raised by the member functions (P0001 with a fixed message).
MEMBER_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "prd_manage_forbidden": (403, "Only the PRD's owners and org admins can change who's on it.", None),
    "invalid_role": (422, "The role must be owner, editor or viewer.", "validation_error"),
    "not_in_organization": (422, "That person isn't an active member of this PRD's organization.", "not_in_organization"),
    "owner_required": (409, "A PRD needs at least one owner. Add another owner first.", "owner_required"),
}

TEAM_ERRORS = {
    **MEMBER_ERRORS,
    "invalid_team_role": (422, "A team can be added as editors or viewers.", "validation_error"),
    "team_not_found": (422, "That team isn't an active team in this PRD's organization.", "team_not_found"),
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


@router.post("/api/prds/{prd_id}/members/teams", response_model=TeamMembersOut)
def add_team_to_prd(prd_id: UUID, payload: TeamMembersIn, auth=Depends(get_current_user)):
    # Adds the team's current active members once (a snapshot), as editors or
    # viewers. People already on the PRD keep their role. Owners and org
    # admins only.
    client = auth["client"]
    result = call_function(client, "add_team_to_prd", {
        "target_prd": str(prd_id), "target_team": str(payload.team_id), "new_role": payload.role,
    }, TEAM_ERRORS)
    members = list_people(client, prd_id)
    by_id = {str(m["user_id"]): m for m in members}

    def pick(ids):
        return [by_id[i] for i in ids if i in by_id]

    return {"added": pick(result["added"]), "skipped": pick(result["skipped"]), "members": members}


# AI-recommended teams (feature 08(b)), built on add_team_to_prd above. The
# recommendation is a preview: nothing changes until an owner or org admin
# decides. Accepting adds the chosen teams in one transaction, as
# add_team_to_prd does (snapshot, nobody downgraded, one team_added event per
# team). The owning team and priority (A08, /classification) stay separate.
class TeamRecommendationIn(RequestModel):
    revision: int = Field(..., ge=1)


class TeamSelectionIn(RequestModel):
    team_id: UUID
    role: Literal["editor", "viewer"]


class TeamRecommendationDecisionIn(RequestModel):
    decision: Literal["accepted", "rejected"]
    # Accepted: 1 to 3 of the recommended teams, each with a role. Rejected: none.
    teams: Optional[list[TeamSelectionIn]] = Field(default=None, min_length=1, max_length=3)


class TeamAddedOut(BaseModel):
    team_id: UUID
    role: Literal["editor", "viewer"]
    added: list[PRDMemberOut]
    skipped: list[PRDMemberOut]  # already on the PRD; their role is unchanged


class TeamRecommendationDecisionOut(BaseModel):
    status: Literal["accepted", "rejected"]
    results: list[TeamAddedOut]
    members: list[PRDMemberOut]


@router.post("/api/prds/{prd_id}/members/team-recommendations")
def recommend_teams(prd_id: UUID, payload: TeamRecommendationIn, auth=Depends(get_current_user)):
    return team_recommendation.recommend_teams(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        budget=usage_gate.RequestBudget())


@router.put("/api/prds/{prd_id}/members/team-recommendations/{recommendation_id}/decision",
            response_model=TeamRecommendationDecisionOut)
def decide_team_recommendation(prd_id: UUID, recommendation_id: UUID, payload: TeamRecommendationDecisionIn,
                               auth=Depends(get_current_user)):
    if (payload.decision == "accepted") != (payload.teams is not None):
        raise ApiError(422, "Send teams to accept a recommendation, and none to reject it.", "validation_error")
    client = auth["client"]
    selections = None if payload.teams is None else [
        {"team_id": str(t.team_id), "role": t.role} for t in payload.teams]
    result = team_recommendation.decide(client, str(prd_id), str(recommendation_id), decision=payload.decision,
                                        selections=selections)
    members = list_people(client, prd_id)
    by_id = {str(m["user_id"]): m for m in members}

    def pick(ids):
        return [by_id[i] for i in ids if i in by_id]

    return {"status": result["status"], "members": members,
            "results": [{"team_id": r["team_id"], "role": r["role"], "added": pick(r["added"]),
                         "skipped": pick(r["skipped"])} for r in result["results"]]}

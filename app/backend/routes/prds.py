import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from postgrest import ReturnMethod
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel
from errors import ApiError
from routes.reviews import ROUND_COLUMNS, ReviewerOut, round_item

router = APIRouter()


class PRDCreate(RequestModel):
    title: str = Field(..., max_length=200)
    project_id: Optional[UUID] = None


class PRDOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    owner_id: UUID
    organization_id: UUID
    project_id: Optional[UUID]
    # The caller's access: their role on the PRD, or org_admin when they only
    # see it as an admin of its organization.
    my_role: Literal["owner", "editor", "viewer", "org_admin"]
    # Routing (A08): not reviewed material and not an access grant.
    owning_team_id: Optional[UUID] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    status: str
    # The current review round's state, or null when nothing is under review
    # (never submitted, or the last round was superseded).
    review_state: Optional[Literal["in_review", "changes_requested", "approved"]] = None
    # E14: not_started | in_progress | done; changes only while approved.
    work_status: Optional[str] = None
    content_json: Optional[dict]
    content_text: Optional[str]
    doc_schema_version: int
    revision: int
    created_at: datetime
    updated_at: datetime


def with_my_role(client, user_id, rows):
    """Adds my_role and review_state to each visible PRD row."""
    ids = [row["id"] for row in rows]
    roles, review_states = {}, {}
    if ids:
        members = client.table("prd_member").select("prd_id, role").eq("user_id", user_id).in_("prd_id", ids).execute()
        roles = {m["prd_id"]: m["role"] for m in members.data}
        rounds = (client.table("review_round").select("prd_id, state")
                  .in_("prd_id", ids).neq("state", "superseded").execute())
        review_states = {r["prd_id"]: r["state"] for r in rounds.data}
    # Visible without a role on it means the caller is an admin of its org.
    return [{**row, "my_role": roles.get(row["id"], "org_admin"), "review_state": review_states.get(row["id"])}
            for row in rows]


@router.post("/api/prds", response_model=PRDOut, status_code=201)
def create_prd(payload: PRDCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    # A new PRD belongs to the creator's organization (one per account).
    membership = (
        client.table("organization_member").select("organization_id")
        .eq("user_id", auth["user"].id).eq("active", True).execute().data
    )
    if not membership:
        raise ApiError(403, "You need to be in an organization to create a PRD.", code="no_organization")
    insert_fields = {
        "id": str(uuid4()),
        "title": payload.title,
        "owner_id": auth["user"].id,
        "organization_id": membership[0]["organization_id"],
    }
    if payload.project_id:
        # RLS also enforces this; checking here gives a 404 like the project
        # routes. Projects are private to their owner.
        project = (
            client.table("project")
            .select("id")
            .eq("id", str(payload.project_id))
            .eq("owner_id", auth["user"].id)
            .execute()
        )
        if not project.data:
            raise HTTPException(status_code=404, detail="Project not found or not allowed")
        insert_fields["project_id"] = str(payload.project_id)
    # Inserted without returning the row, then read back: the creator only
    # becomes an owner (and so able to see it) when the insert's trigger
    # runs, after Postgres checks the returned row against the view rule.
    client.table("prd").insert(insert_fields, returning=ReturnMethod.minimal).execute()
    response = client.table("prd").select("*").eq("id", insert_fields["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a PRD")
    return with_my_role(client, auth["user"].id, response.data)[0]


@router.get("/api/prds", response_model=list[PRDOut])
def list_prds(
    search: Optional[str] = None,
    view: Optional[Literal["owned", "shared", "needs_my_approval", "waiting_for_approval"]] = None,
    auth=Depends(get_current_user),
):
    # view=owned: PRDs the caller owns. view=shared: PRDs they were invited
    # to as an editor or viewer ("Shared with me"). view=needs_my_approval:
    # PRDs whose open round is waiting on the caller's decision.
    # view=waiting_for_approval: PRDs the caller owns with a round still open
    # (in review or changes requested). No view: everything they can see,
    # including any PRD in their org if they're its admin.
    client = auth["client"]
    query = client.table("prd").select("*")

    # Commas/parens are structural in PostgREST's or= filter and */% are
    # wildcards, so strip them rather than let user text change the filter.
    term = re.sub(r'[,()*%"\\]', " ", search or "").strip()
    if term:
        query = query.or_(f"title.ilike.*{term}*,content_text.ilike.*{term}*")

    response = query.order("updated_at", desc=True).execute()
    prds = with_my_role(client, auth["user"].id, response.data)
    if view == "owned":
        prds = [prd for prd in prds if prd["my_role"] == "owner"]
    elif view == "shared":
        prds = [prd for prd in prds if prd["my_role"] in ("editor", "viewer")]
    elif view == "needs_my_approval":
        pending = (client.table("review_slot").select("prd_id, round:review_round!inner(state)")
                   .eq("reviewer_id", auth["user"].id).eq("state", "pending")
                   .in_("round.state", ["in_review", "changes_requested"]).execute())
        waiting_on_me = {slot["prd_id"] for slot in pending.data}
        prds = [prd for prd in prds if prd["id"] in waiting_on_me]
    elif view == "waiting_for_approval":
        prds = [prd for prd in prds
                if prd["my_role"] == "owner" and prd["review_state"] in ("in_review", "changes_requested")]
    return prds


class ApprovalSummary(BaseModel):
    round_id: Optional[UUID]
    round_no: Optional[int]
    version_id: Optional[UUID]
    state: Optional[Literal["in_review", "changes_requested", "approved"]]
    required_count: int
    approved_count: int
    reviewers: list[ReviewerOut]


class Capabilities(BaseModel):
    can_view: bool
    can_comment: bool
    can_edit: bool
    can_delete: bool
    can_assign: bool
    can_submit_review: bool
    can_approve: bool
    can_request_ai: bool
    # Added with E14 and A08 (Marco), from the same helpers those routes use.
    can_update_work_status: bool
    can_request_classification: bool
    can_set_routing: bool
    # E12 is owner-only (narrower than can_request_ai) and needs comments on
    # the current version.
    can_request_review_suggestions: bool


class VersionRef(BaseModel):
    id: UUID
    version_no: Optional[int]


class ProjectRef(BaseModel):
    id: UUID
    name: str


class PersonRef(BaseModel):
    id: UUID
    name: Optional[str]


class PRDDetailOut(PRDOut):
    approval: ApprovalSummary
    # What the caller may do now (E03); the same rules the routes enforce.
    capabilities: Capabilities
    # E05: the current saved version, the PRD's folder (id and name only) and
    # its owners (names only), and whether an approved PRD changed since.
    current_version: Optional[VersionRef]
    project: Optional[ProjectRef]
    owners: list[PersonRef]
    changed_since_approval: bool


NO_APPROVAL = {"round_id": None, "round_no": None, "version_id": None, "state": None,
               "required_count": 0, "approved_count": 0, "reviewers": []}


def approval_summary(client, prd_id: UUID):
    """The current round's progress, or empty counts when nothing is under review."""
    rows = (client.table("review_round").select(ROUND_COLUMNS)
            .eq("prd_id", str(prd_id)).neq("state", "superseded").execute().data)
    if not rows:
        return NO_APPROVAL
    current = round_item(rows[0])
    return {
        "round_id": current["id"], "round_no": current["round_no"], "version_id": current["version_id"],
        "state": current["state"], "required_count": len(current["reviewers"]),
        "approved_count": sum(r["state"] == "approved" for r in current["reviewers"]),
        "reviewers": current["reviewers"],
    }


@router.get("/api/prds/{prd_id}", response_model=PRDDetailOut)
def get_prd(prd_id: UUID, auth=Depends(get_current_user)):
    # The PRD with the caller's role and its approval summary (E11).
    client = auth["client"]
    response = client.table("prd").select("*").eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found")
    prd = with_my_role(client, auth["user"].id, response.data)[0]
    return {**prd, "approval": approval_summary(client, prd_id), "capabilities": prd_capabilities(client, prd_id),
            **read_model(client, prd_id)}


def prd_capabilities(client, prd_id) -> dict:
    """Vineela's E03 flags plus the E14/A08 ones, each from the helper its
    route checks (asked as the caller)."""
    flags = client.rpc("prd_capabilities", {"target_prd": str(prd_id)}).execute().data or {}
    manage = client.rpc("can_manage_prd", {"target_prd_id": str(prd_id)}).execute().data is True
    return {
        **flags,
        "can_update_work_status": client.rpc("can_update_work_status", {"target_prd": str(prd_id)}).execute().data
        is True,
        "can_request_classification": manage,
        "can_set_routing": manage,
        "can_request_review_suggestions": client.rpc("can_request_review_suggestions",
                                                     {"target_prd": str(prd_id)}).execute().data is True,
    }


def read_model(client, prd_id) -> dict:
    """E05: current version, project, owners and changed_since_approval."""
    data = client.rpc("prd_read_model", {"target_prd": str(prd_id)}).execute().data
    if data is None:  # lost access between the reads
        raise ApiError(404, "PRD not found")
    return data


@router.delete("/api/prds/{prd_id}", status_code=204)
def delete_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").delete().eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found or not allowed")

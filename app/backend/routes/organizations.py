from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, StringConstraints

from auth import get_current_user
from common import RequestModel
from errors import ApiError

router = APIRouter()


class OrganizationCreate(RequestModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class OrganizationCreated(BaseModel):
    organization_id: UUID


@router.post("/api/organizations", response_model=OrganizationCreated, status_code=201)
def create_organization(payload: OrganizationCreate, auth=Depends(get_current_user)):
    # Called by the sign-up screen right after the account is created: the
    # new account becomes the organization's admin (E01). No department or
    # team is created; admins add whatever structure their org uses.
    client = auth["client"]
    try:
        response = client.rpc("create_organization", {"org_name": payload.name}).execute()
    except APIError as exc:
        if exc.message == "already_in_organization":
            raise ApiError(409, "This account already belongs to an organization. Use another account to start a new one.",
                           code="already_in_organization")
        raise
    return {"organization_id": response.data}


class Membership(BaseModel):
    organization_id: UUID
    name: str
    access_role: str


class MeOut(BaseModel):
    id: UUID
    email: Optional[str]
    full_name: Optional[str]
    organization: Optional[Membership]


@router.get("/api/me", response_model=MeOut)
def get_me(auth=Depends(get_current_user)):
    # Identity plus the account's organization (one per account). null means
    # it has none yet, so the frontend shows "Create your organization".
    client = auth["client"]
    user = auth["user"]
    profile = client.table("profile").select("full_name").eq("id", user.id).execute().data
    rows = (
        client.table("organization_member")
        .select("organization_id, access_role, organization(name)")
        .eq("user_id", user.id).eq("active", True).execute().data
    )
    organization = None
    if rows:
        row = rows[0]
        organization = {"organization_id": row["organization_id"], "name": row["organization"]["name"],
                        "access_role": row["access_role"]}
    return {
        "id": user.id,
        "email": user.email,
        "full_name": profile[0]["full_name"] if profile else None,
        "organization": organization,
    }


class JoinRequest(RequestModel):
    code: str = Field(..., max_length=50)


class JoinedOrganization(BaseModel):
    organization_id: UUID


class JoinCode(BaseModel):
    join_code: str


def format_join_code(code):
    # Stored as 12 characters; shown in groups of four.
    return "-".join(code[i:i + 4] for i in range(0, len(code), 4))


@router.post("/api/organizations/join", response_model=JoinedOrganization)
def join_organization(payload: JoinRequest, auth=Depends(get_current_user)):
    # The member sign-up: joins the organization with this code as a member,
    # with no department or team. Joining again while active is a no-op.
    client = auth["client"]
    try:
        response = client.rpc("join_organization", {"code": payload.code}).execute()
    except APIError as exc:
        if exc.message == "invalid_join_code":
            raise ApiError(404, "That code doesn't match an organization.", code="invalid_join_code")
        if exc.message == "membership_inactive":
            raise ApiError(403, "Your membership in this organization was deactivated. Ask an admin to reactivate it.",
                           code="membership_inactive")
        if exc.message == "already_in_organization":
            raise ApiError(409, "This account already belongs to an organization. Use another account to join this one.",
                           code="already_in_organization")
        raise
    return {"organization_id": response.data}


def admin_join_code(client, org_id: UUID, function: str):
    # Members can see the organization but not its code (403); anyone else
    # gets 404, so the route doesn't reveal which organizations exist.
    org = str(org_id)
    code = client.rpc(function, {"target_org": org}).execute().data
    if code:
        return {"join_code": format_join_code(code)}
    if client.table("organization").select("id").eq("id", org).execute().data:
        raise ApiError(403, "Only admins can see or change the join code.")
    raise ApiError(404, "Organization not found")


@router.get("/api/organizations/{org_id}/join-code", response_model=JoinCode)
def get_join_code(org_id: UUID, auth=Depends(get_current_user)):
    return admin_join_code(auth["client"], org_id, "org_join_code")


@router.post("/api/organizations/{org_id}/join-code", response_model=JoinCode)
def regenerate_join_code(org_id: UUID, auth=Depends(get_current_user)):
    # The old code stops working immediately.
    return admin_join_code(auth["client"], org_id, "regenerate_join_code")

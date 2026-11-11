from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user

router = APIRouter()


class DirectoryOrganization(BaseModel):
    id: UUID
    name: str


class DirectoryDepartment(BaseModel):
    id: UUID
    name: str
    head_id: Optional[UUID]
    archived: bool


class DirectoryTeam(BaseModel):
    id: UUID
    name: str
    # Teams may have no department (orgs choose their own structure).
    department_id: Optional[UUID]
    lead_id: Optional[UUID]
    archived: bool


class DirectoryMember(BaseModel):
    user_id: UUID
    name: Optional[str]
    # Only org admins see emails; everyone else gets null.
    email: Optional[str]
    department_id: Optional[UUID]
    team_ids: list[UUID]
    access_role: str
    manager_id: Optional[UUID]
    title: Optional[str]


class DirectoryOut(BaseModel):
    organization: DirectoryOrganization
    departments: list[DirectoryDepartment]
    teams: list[DirectoryTeam]
    members: list[DirectoryMember]


def with_archived_flag(row):
    archived_at = row.pop("archived_at")
    return {**row, "archived": archived_at is not None}


@router.get("/api/organizations/{org_id}/directory", response_model=DirectoryOut)
def get_directory(org_id: UUID, auth=Depends(get_current_user)):
    # Everything the frontend needs to draw the org chart in one response.
    # RLS limits every query to organizations the caller is an active member of.
    client = auth["client"]
    org = str(org_id)
    organization = client.table("organization").select("id, name").eq("id", org).execute()
    if not organization.data:
        raise HTTPException(status_code=404, detail="Organization not found")

    departments = (
        client.table("department").select("id, name, head_id, archived_at")
        .eq("organization_id", org).order("name").execute().data
    )
    teams = (
        client.table("team").select("id, name, department_id, lead_id, archived_at")
        .eq("organization_id", org).order("name").execute().data
    )
    members = (
        client.table("organization_member")
        .select("user_id, department_id, access_role, manager_id, title")
        .eq("organization_id", org).eq("active", True).execute().data
    )
    links = client.table("team_member").select("team_id, user_id").eq("organization_id", org).execute().data
    people = {
        p["user_id"]: p
        for p in client.rpc("org_directory_people", {"target_org": org}).execute().data
    }

    team_ids = {}
    for link in links:
        team_ids.setdefault(link["user_id"], []).append(link["team_id"])
    for member in members:
        person = people.get(member["user_id"], {})
        member.update(
            name=person.get("full_name"),
            email=person.get("email"),
            team_ids=team_ids.get(member["user_id"], []),
        )
    members.sort(key=lambda m: (m["name"] or "").lower())

    return {
        "organization": organization.data[0],
        "departments": [with_archived_flag(d) for d in departments],
        "teams": [with_archived_flag(t) for t in teams],
        "members": members,
    }

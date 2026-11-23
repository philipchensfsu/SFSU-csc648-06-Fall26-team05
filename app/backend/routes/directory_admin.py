"""Org admins' directory writes: departments, teams, team members and members."""

import json
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from postgrest import ReturnMethod
from postgrest.exceptions import APIError
from pydantic import BaseModel, StringConstraints

from auth import get_current_user
from common import RequestModel
from errors import ApiError
from routes.directory import DirectoryDepartment, DirectoryTeam, with_archived_flag

router = APIRouter()

UnitName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class DepartmentCreate(RequestModel):
    """Request body for creating a department."""

    name: UnitName


class DepartmentUpdate(RequestModel):
    """Request body for changing a department; only the fields sent change."""

    name: Optional[UnitName] = None
    head_id: Optional[UUID] = None
    archived: Optional[bool] = None


class TeamCreate(RequestModel):
    """Request body for creating a team, optionally inside a department."""

    name: UnitName
    department_id: Optional[UUID] = None


class TeamUpdate(RequestModel):
    """Request body for changing a team; only the fields sent change."""

    name: Optional[UnitName] = None
    department_id: Optional[UUID] = None
    lead_id: Optional[UUID] = None
    archived: Optional[bool] = None


# Messages of the directory's end-state checks (20261029110000), which run
# when the change commits.
DIRECTORY_ERRORS = {
    "A department head must be an active member of that department": (
        422,
        "A department head must be an active member of that department.",
        "head_not_in_department",
    ),
    "A team lead must be an active member of that team": (
        422,
        "A team lead must be an active member of that team.",
        "lead_not_in_team",
    ),
    "An archived department still has active members or teams": (
        409,
        "Move this department's members and teams elsewhere before archiving it.",
        "department_not_empty",
    ),
    "An archived team still has active members": (
        409,
        "Remove this team's members before archiving it.",
        "team_not_empty",
    ),
    "Reporting lines would form a cycle": (
        422,
        "That manager would make the reporting lines loop back.",
        "manager_cycle",
    ),
    "An active member reports to an inactive manager": (
        422,
        "A manager must be an active member of the organization.",
        "manager_inactive",
    ),
}


def require_org_admin(client, org_id: UUID):
    """Check that the caller is an admin of the organization.

    Raises:
        ApiError: 404 if the caller is not an active member, 403 if they are a
            member but not an admin.
    """
    # 404 unless the caller is an active member; 403 unless also an admin.
    if (
        not client.table("organization")
        .select("id")
        .eq("id", str(org_id))
        .execute()
        .data
    ):
        raise ApiError(404, "Organization not found")
    if (
        client.rpc("is_org_admin", {"target_org": str(org_id)}).execute().data
        is not True
    ):
        raise ApiError(403, "Only organization admins can change its structure.")


def write_directory(run):
    """Runs a directory write, turning the database's checks into readable errors."""
    try:
        return run()
    except APIError as exc:
        if exc.message in DIRECTORY_ERRORS:
            raise ApiError(*DIRECTORY_ERRORS[exc.message])
        if exc.code == "23505":
            raise ApiError(
                409,
                "Another active department or team in this organization already has that name.",
                "name_taken",
            )
        # A foreign key or the team_member policy: the person, department or
        # team isn't (an active) part of this organization.
        if exc.code in ("23503", "42501"):
            raise ApiError(
                422,
                "That person, department or team isn't part of this organization.",
                "not_in_organization",
            )
        raise


def unit_changes(payload):
    """Build the database update for a department or team from the fields sent.

    null clears head_id, lead_id or department_id; archived becomes an
    archived_at timestamp.

    Raises:
        ApiError: 422 if name or archived is sent as null.
    """
    # Only the fields sent change; null clears head_id, lead_id or department_id.
    changes = {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in payload.model_dump(exclude_unset=True).items()
    }
    for field in ("name", "archived"):
        if field in changes and changes[field] is None:
            raise ApiError(422, f"{field} can't be null.", "validation_error")
    if "archived" in changes:
        changes["archived_at"] = (
            datetime.now(timezone.utc).isoformat() if changes.pop("archived") else None
        )
    return changes


def update_unit(client, table, org_id: UUID, unit_id: UUID, changes, columns):
    """Apply changes to a department or team in the organization and return it.

    Raises:
        ApiError: 404 if the department or team is not in the organization.
    """
    query = client.table(table)
    if changes:
        query = query.update(changes)
    else:
        query = query.select(columns)
    rows = write_directory(
        lambda: (
            query.eq("organization_id", str(org_id))
            .eq("id", str(unit_id))
            .execute()
            .data
        )
    )
    if not rows:
        raise ApiError(404, f"{table.capitalize()} not found")
    return with_archived_flag({key: rows[0][key] for key in columns.split(", ")})


DEPARTMENT_COLUMNS = "id, name, head_id, archived_at"
TEAM_COLUMNS = "id, name, department_id, lead_id, archived_at"


@router.post(
    "/api/organizations/{org_id}/departments",
    response_model=DirectoryDepartment,
    status_code=201,
)
def create_department(
    org_id: UUID, payload: DepartmentCreate, auth=Depends(get_current_user)
):
    """Create a department in the organization (org admins only)."""
    client = auth["client"]
    require_org_admin(client, org_id)
    rows = write_directory(
        lambda: (
            client.table("department")
            .insert({"organization_id": str(org_id), "name": payload.name})
            .execute()
            .data
        )
    )
    return with_archived_flag(
        {key: rows[0][key] for key in DEPARTMENT_COLUMNS.split(", ")}
    )


@router.patch(
    "/api/organizations/{org_id}/departments/{department_id}",
    response_model=DirectoryDepartment,
)
def update_department(
    org_id: UUID,
    department_id: UUID,
    payload: DepartmentUpdate,
    auth=Depends(get_current_user),
):
    """Rename a department, set or clear its head, or archive it (org admins only)."""
    # Rename, set or clear the head, archive or unarchive.
    client = auth["client"]
    require_org_admin(client, org_id)
    return update_unit(
        client,
        "department",
        org_id,
        department_id,
        unit_changes(payload),
        DEPARTMENT_COLUMNS,
    )


@router.post(
    "/api/organizations/{org_id}/teams", response_model=DirectoryTeam, status_code=201
)
def create_team(org_id: UUID, payload: TeamCreate, auth=Depends(get_current_user)):
    """Create a team in the organization, optionally inside a department (org admins only)."""
    client = auth["client"]
    require_org_admin(client, org_id)
    fields = {
        "organization_id": str(org_id),
        "name": payload.name,
        "department_id": str(payload.department_id) if payload.department_id else None,
    }
    rows = write_directory(lambda: client.table("team").insert(fields).execute().data)
    return with_archived_flag({key: rows[0][key] for key in TEAM_COLUMNS.split(", ")})


@router.patch(
    "/api/organizations/{org_id}/teams/{team_id}", response_model=DirectoryTeam
)
def update_team(
    org_id: UUID, team_id: UUID, payload: TeamUpdate, auth=Depends(get_current_user)
):
    """Rename a team, move it, set or clear its lead, or archive it (org admins only)."""
    # Rename, move to another department (or none), set or clear the lead,
    # archive or unarchive.
    client = auth["client"]
    require_org_admin(client, org_id)
    return update_unit(
        client, "team", org_id, team_id, unit_changes(payload), TEAM_COLUMNS
    )


def team_in_org(client, org_id: UUID, team_id: UUID):
    """Return the team's row if it belongs to the organization.

    Raises:
        ApiError: 404 if the team is not in the organization.
    """
    rows = (
        client.table("team")
        .select("archived_at")
        .eq("organization_id", str(org_id))
        .eq("id", str(team_id))
        .execute()
        .data
    )
    if not rows:
        raise ApiError(404, "Team not found")
    return rows[0]


@router.put(
    "/api/organizations/{org_id}/teams/{team_id}/members/{user_id}", status_code=204
)
def add_team_member(
    org_id: UUID, team_id: UUID, user_id: UUID, auth=Depends(get_current_user)
):
    """Put an active member on a team; already being on it is fine (org admins only).

    Raises:
        ApiError: 409 if the team is archived.
    """
    # Puts an active member on the team; already on it is fine.
    client = auth["client"]
    require_org_admin(client, org_id)
    if team_in_org(client, org_id, team_id)["archived_at"]:
        raise ApiError(409, "This team is archived.", "team_archived")
    link = {
        "organization_id": str(org_id),
        "team_id": str(team_id),
        "user_id": str(user_id),
    }
    write_directory(
        lambda: (
            client.table("team_member")
            .upsert(link, ignore_duplicates=True, returning=ReturnMethod.minimal)
            .execute()
        )
    )


@router.delete(
    "/api/organizations/{org_id}/teams/{team_id}/members/{user_id}", status_code=204
)
def remove_team_member(
    org_id: UUID, team_id: UUID, user_id: UUID, auth=Depends(get_current_user)
):
    """Take someone off a team; their organization membership stays (org admins only)."""
    # Takes someone off the team; their org membership stays. Not on it is fine.
    client = auth["client"]
    require_org_admin(client, org_id)
    team_in_org(client, org_id, team_id)
    write_directory(
        lambda: (
            client.table("team_member")
            .delete(returning=ReturnMethod.minimal)
            .eq("organization_id", str(org_id))
            .eq("team_id", str(team_id))
            .eq("user_id", str(user_id))
            .execute()
        )
    )


class MemberUpdate(RequestModel):
    """Request body for changing a member; only the fields sent change."""

    access_role: Optional[Literal["member", "admin"]] = None
    department_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    title: Optional[
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
    ] = None
    active: Optional[bool] = None
    # Only when deactivating someone (see MEMBER_ADMIN_ERRORS).
    replacement_manager_id: Optional[UUID] = None
    transfer_owner_to: Optional[UUID] = None


class MemberOut(BaseModel):
    """A member's organization settings after a change."""

    user_id: UUID
    active: bool
    access_role: Literal["member", "admin"]
    department_id: Optional[UUID]
    manager_id: Optional[UUID]
    title: Optional[str]


# Errors raised by update_org_member (P0001 with a fixed message).
MEMBER_ADMIN_ERRORS = {
    "org_admin_required": (403, "Only organization admins can change members.", None),
    "member_not_found": (404, "Member not found", None),
    "last_admin": (
        409,
        "The organization needs at least one active admin. Make someone else an admin first.",
        "last_admin",
    ),
    "has_direct_reports": (
        409,
        "This person manages people. Send replacement_manager_id (or null) for them.",
        "has_direct_reports",
    ),
    "owns_prds": (
        409,
        "This person is the only owner of some PRDs. Send transfer_owner_to with a new owner.",
        "owns_prds",
    ),
    "invalid_replacement": (
        422,
        "The replacement must be another active member of this organization.",
        "not_in_organization",
    ),
    "invalid_change": (422, "Unknown member field.", "validation_error"),
}

# Which list a 409 carries in its body.
AFFECTED_KEYS = {"has_direct_reports": "reports", "owns_prds": "prds"}


@router.patch("/api/organizations/{org_id}/members/{user_id}", response_model=MemberOut)
def update_member(
    org_id: UUID, user_id: UUID, payload: MemberUpdate, auth=Depends(get_current_user)
):
    """Change a member's role, department, manager, title or active flag.

    Only the fields sent change; null clears department, manager or title.

    Raises:
        ApiError: 404 if the organization is hidden, 422 if access_role or
            active is sent as null.
    """
    # Change a member's role, department, manager, title or active flag.
    # Only the fields sent change; null clears department, manager or title.
    client = auth["client"]
    if (
        not client.table("organization")
        .select("id")
        .eq("id", str(org_id))
        .execute()
        .data
    ):
        raise ApiError(404, "Organization not found")
    changes = {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in payload.model_dump(exclude_unset=True).items()
    }
    for field in ("access_role", "active"):
        if field in changes and changes[field] is None:
            raise ApiError(422, f"{field} can't be null.", "validation_error")
    if changes.get("title") == "":
        changes["title"] = None
    params = {
        "target_org": str(org_id),
        "target_user": str(user_id),
        "changes": changes,
    }

    def run():
        try:
            return client.rpc("update_org_member", params).execute()
        except APIError as exc:
            if exc.message in MEMBER_ADMIN_ERRORS:
                error = ApiError(*MEMBER_ADMIN_ERRORS[exc.message])
                if exc.message in AFFECTED_KEYS:
                    # The function lists what's affected in the error detail.
                    error.extra = {
                        AFFECTED_KEYS[exc.message]: json.loads(exc.details or "[]")
                    }
                raise error
            if exc.code == "23505":  # one active membership per account
                raise ApiError(
                    409,
                    "This person is already active in another organization.",
                    "active_elsewhere",
                )
            raise

    write_directory(run)
    rows = (
        client.table("organization_member")
        .select("user_id, active, access_role, department_id, manager_id, title")
        .eq("organization_id", str(org_id))
        .eq("user_id", str(user_id))
        .execute()
        .data
    )
    return rows[0]

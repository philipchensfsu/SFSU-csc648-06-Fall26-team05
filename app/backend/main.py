import os
import re
import sys
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional
from uuid import UUID, uuid4

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from postgrest import ReturnMethod
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from supabase_auth.errors import AuthError, AuthRetryableError

from errors import ApiError, logger, register_error_handlers
from pagination import Page, PageParams, paginate
from supabase_client import supabase, user_client

app = FastAPI()
register_error_handlers(app)

# Fixed in application code, not the DB (Section 1.6 of the M2 report).
INTAKE_QUESTION_KEYS = {
    "problem",
    "target_users",
    "goals",
    "scope",
    "constraints",
    "success_metrics",
    "notes",
}


# Only needed for local dev, where the Vite dev server (5173) and uvicorn
# (8000) are different origins. In production they're served from the same
# Vercel domain via vercel.json, so this never comes into play there.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Optional so a missing header is a 401, not FastAPI's default 422.
def get_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        user_response = supabase.auth.get_user(token)
    except AuthError as exc:
        # A 4xx from Supabase Auth means the token was rejected. Anything else
        # (gateway errors, rate limits, 5xx) means Auth itself is struggling.
        # Unreachable or timed out raises httpx.TransportError, which the
        # shared handler already turns into a 503.
        status = getattr(exc, "status", None)
        if not isinstance(exc, AuthRetryableError) and status and 400 <= status < 500 and status != 429:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        logger.error("Supabase Auth unavailable: %s %s", type(exc).__name__, status)
        raise ApiError(503, "Sign-in service temporarily unavailable. Try again shortly.")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"user": user_response.user, "client": user_client(token)}


# Request bodies reject unknown fields with a 422 instead of silently
# dropping them, so a typo or an unsupported field is caught early (S01).
class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectCreate(RequestModel):
    name: str = Field(..., max_length=200)


class ProjectOut(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime


class PRDCreate(RequestModel):
    title: str = Field(..., max_length=200)
    project_id: Optional[UUID] = None


class PRDUpdate(RequestModel):
    # The client's last-known revision; the update is rejected with 409 if
    # the row has moved on since (see Section 1.4 of the M2 report).
    revision: int
    title: Optional[str] = Field(default=None, max_length=200)
    content_json: Optional[dict] = None
    content_text: Optional[str] = None
    status: Optional[str] = None


class PRDOut(BaseModel):
    id: UUID
    title: str
    owner_id: UUID
    organization_id: UUID
    project_id: Optional[UUID]
    # The caller's access: their role on the PRD, or org_admin when they only
    # see it as an admin of its organization.
    my_role: Literal["owner", "editor", "viewer", "org_admin"]
    status: str
    content_json: Optional[dict]
    content_text: Optional[str]
    doc_schema_version: int
    revision: int
    created_at: datetime
    updated_at: datetime


class IntakeAnswerIn(RequestModel):
    answer_text: str = Field(default="", max_length=5000)
    skipped: bool = False


class IntakeAnswerOut(BaseModel):
    question_key: str
    answer_text: Optional[str]
    skipped: bool
    answered_at: datetime


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    # Confirms the Supabase connection works by querying the real schema.
    # This route is public and the service-role client bypasses RLS, so it
    # only reports reachability and never returns row data.
    try:
        supabase.table("prd").select("id").limit(1).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Database unreachable")
    return {"status": "ok"}


@app.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    insert_fields = {"name": payload.name, "owner_id": auth["user"].id}
    response = client.table("project").insert(insert_fields).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a project")
    return response.data[0]


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects(auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("project").select("*").order("updated_at", desc=True).execute()
    return response.data


@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def rename_project(project_id: UUID, payload: ProjectCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    response = (
        client.table("project")
        .update({"name": payload.name})
        .eq("id", str(project_id))
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found or not allowed")
    return response.data[0]


@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("project").delete().eq("id", str(project_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found or not allowed")


def with_my_role(client, user_id, rows):
    """Adds my_role to each visible PRD row."""
    ids = [row["id"] for row in rows]
    roles = {}
    if ids:
        members = client.table("prd_member").select("prd_id, role").eq("user_id", user_id).in_("prd_id", ids).execute()
        roles = {m["prd_id"]: m["role"] for m in members.data}
    # Visible without a role on it means the caller is an admin of its org.
    return [{**row, "my_role": roles.get(row["id"], "org_admin")} for row in rows]


@app.post("/api/prds", response_model=PRDOut, status_code=201)
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


@app.get("/api/prds", response_model=list[PRDOut])
def list_prds(
    search: Optional[str] = None,
    view: Optional[Literal["owned", "shared"]] = None,
    auth=Depends(get_current_user),
):
    # view=owned: PRDs the caller owns. view=shared: PRDs they were invited
    # to as an editor or viewer ("Shared with me"). No view: everything
    # they can see, including any PRD in their org if they're its admin.
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
    return prds


@app.get("/api/prds/{prd_id}", response_model=PRDOut)
def get_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").select("*").eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found")
    return with_my_role(client, auth["user"].id, response.data)[0]


@app.put("/api/prds/{prd_id}", response_model=PRDOut)
def update_prd(prd_id: UUID, payload: PRDUpdate, auth=Depends(get_current_user)):
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


@app.delete("/api/prds/{prd_id}", status_code=204)
def delete_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").delete().eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found or not allowed")


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


def call_member_function(client, function, params):
    try:
        client.rpc(function, params).execute()
    except APIError as exc:
        known = MEMBER_ERRORS.get(exc.message)
        if known is None:
            raise
        status, detail, code = known
        raise ApiError(status, detail, code)


def list_people(client, prd_id: UUID):
    rows = client.rpc("prd_people", {"target_prd": str(prd_id)}).execute().data
    # A PRD always has an owner, so no rows means the caller can't see it.
    if not rows:
        raise ApiError(404, "PRD not found")
    return [{"user_id": r["user_id"], "name": r["full_name"], "role": r["role"],
             "granted_by": r["granted_by"], "added_at": r["created_at"]} for r in rows]


@app.get("/api/prds/{prd_id}/members", response_model=list[PRDMemberOut])
def list_prd_members(prd_id: UUID, auth=Depends(get_current_user)):
    # Everyone on the PRD, in the order they were added; any viewer can see it.
    return list_people(auth["client"], prd_id)


@app.put("/api/prds/{prd_id}/members/{user_id}", response_model=list[PRDMemberOut])
def set_prd_member(prd_id: UUID, user_id: UUID, payload: PRDMemberIn, auth=Depends(get_current_user)):
    # Invites someone from the PRD's organization, or changes their role.
    # Owners and org admins only. Returns the updated list.
    client = auth["client"]
    call_member_function(client, "set_prd_member",
                         {"target_prd": str(prd_id), "target_user": str(user_id), "new_role": payload.role})
    return list_people(client, prd_id)


@app.delete("/api/prds/{prd_id}/members/{user_id}", status_code=204)
def remove_prd_member(prd_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # Owners and org admins remove anyone; anyone can remove themselves.
    call_member_function(auth["client"], "remove_prd_member", {"target_prd": str(prd_id), "target_user": str(user_id)})


@app.get("/api/prds/{prd_id}/intake", response_model=list[IntakeAnswerOut])
def list_intake_answers(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = (
        client.table("intake_answer")
        .select("question_key, answer_text, skipped, answered_at")
        .eq("prd_id", str(prd_id))
        .execute()
    )
    return response.data


@app.put("/api/prds/{prd_id}/intake/{question_key}", response_model=IntakeAnswerOut)
def save_intake_answer(
    prd_id: UUID,
    question_key: str,
    payload: IntakeAnswerIn,
    auth=Depends(get_current_user),
):
    if question_key not in INTAKE_QUESTION_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown question: {question_key}")

    client = auth["client"]
    row = {
        "prd_id": str(prd_id),
        "question_key": question_key,
        "answer_text": payload.answer_text,
        "skipped": payload.skipped,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    }
    # Unique on (prd_id, question_key), so revising an answer overwrites it.
    response = (
        client.table("intake_answer")
        .upsert(row, on_conflict="prd_id,question_key")
        .execute()
    )
    return response.data[0]


class OrganizationCreate(RequestModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class OrganizationCreated(BaseModel):
    organization_id: UUID


@app.post("/api/organizations", response_model=OrganizationCreated, status_code=201)
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


@app.get("/api/me", response_model=MeOut)
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


@app.post("/api/organizations/join", response_model=JoinedOrganization)
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


@app.get("/api/organizations/{org_id}/join-code", response_model=JoinCode)
def get_join_code(org_id: UUID, auth=Depends(get_current_user)):
    return admin_join_code(auth["client"], org_id, "org_join_code")


@app.post("/api/organizations/{org_id}/join-code", response_model=JoinCode)
def regenerate_join_code(org_id: UUID, auth=Depends(get_current_user)):
    # The old code stops working immediately.
    return admin_join_code(auth["client"], org_id, "regenerate_join_code")


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


@app.get("/api/organizations/{org_id}/directory", response_model=DirectoryOut)
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


class NotificationOut(BaseModel):
    id: UUID
    type: str
    prd_id: UUID
    title: str
    actor_id: Optional[UUID]
    actor_name: Optional[str]
    payload: dict
    version_id: Optional[UUID]
    round_id: Optional[UUID]
    comment_id: Optional[UUID]
    created_at: datetime
    read_at: Optional[datetime]


class NotificationPage(Page[NotificationOut]):
    unread_count: int


class NotificationRead(RequestModel):
    read: Literal[True]


NOTIFICATION_COLUMNS = (
    "id, prd_id, created_at, read_at, prd(title), "
    "event:prd_event(event_type, actor_id, actor_name, payload, version_id, round_id, comment_id)"
)


def notification_item(row):
    event = row["event"]
    return {
        "id": row["id"], "type": event["event_type"], "prd_id": row["prd_id"], "title": row["prd"]["title"],
        "actor_id": event["actor_id"], "actor_name": event["actor_name"], "payload": event["payload"],
        "version_id": event["version_id"], "round_id": event["round_id"], "comment_id": event["comment_id"],
        "created_at": row["created_at"], "read_at": row["read_at"],
    }


@app.get("/api/notifications", response_model=NotificationPage)
def list_notifications(unread_only: bool = False, params: PageParams = Depends(), auth=Depends(get_current_user)):
    # The caller's inbox, newest first. RLS hides notifications about PRDs
    # they can no longer see, from the items and the unread count alike.
    client = auth["client"]
    query = client.table("notification").select(NOTIFICATION_COLUMNS)
    if unread_only:
        query = query.is_("read_at", "null")
    page = paginate(query, params)
    unread = client.table("notification").select("id", count="exact", head=True).is_("read_at", "null").execute()
    return {"items": [notification_item(r) for r in page["items"]], "next_cursor": page["next_cursor"],
            "unread_count": unread.count or 0}


@app.patch("/api/notifications/{notification_id}", response_model=NotificationOut)
def mark_notification_read(notification_id: UUID, payload: NotificationRead, auth=Depends(get_current_user)):
    # Marking read again succeeds and keeps the first read time.
    client = auth["client"]
    if not client.rpc("mark_notification_read", {"target": str(notification_id)}).execute().data:
        raise ApiError(404, "Notification not found")
    rows = client.table("notification").select(NOTIFICATION_COLUMNS).eq("id", str(notification_id)).execute().data
    if not rows:
        raise ApiError(404, "Notification not found")
    return notification_item(rows[0])


UnitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class DepartmentCreate(RequestModel):
    name: UnitName


class DepartmentUpdate(RequestModel):
    name: Optional[UnitName] = None
    head_id: Optional[UUID] = None
    archived: Optional[bool] = None


class TeamCreate(RequestModel):
    name: UnitName
    department_id: Optional[UUID] = None


class TeamUpdate(RequestModel):
    name: Optional[UnitName] = None
    department_id: Optional[UUID] = None
    lead_id: Optional[UUID] = None
    archived: Optional[bool] = None


# Messages of the directory's end-state checks (20261029110000), which run
# when the change commits.
DIRECTORY_ERRORS = {
    "A department head must be an active member of that department":
        (422, "A department head must be an active member of that department.", "head_not_in_department"),
    "A team lead must be an active member of that team":
        (422, "A team lead must be an active member of that team.", "lead_not_in_team"),
    "An archived department still has active members or teams":
        (409, "Move this department's members and teams elsewhere before archiving it.", "department_not_empty"),
    "An archived team still has active members":
        (409, "Remove this team's members before archiving it.", "team_not_empty"),
}


def require_org_admin(client, org_id: UUID):
    # 404 unless the caller is an active member; 403 unless also an admin.
    if not client.table("organization").select("id").eq("id", str(org_id)).execute().data:
        raise ApiError(404, "Organization not found")
    if client.rpc("is_org_admin", {"target_org": str(org_id)}).execute().data is not True:
        raise ApiError(403, "Only organization admins can change its structure.")


def write_directory(run):
    """Runs a directory write, turning the database's checks into readable errors."""
    try:
        return run()
    except APIError as exc:
        if exc.message in DIRECTORY_ERRORS:
            raise ApiError(*DIRECTORY_ERRORS[exc.message])
        if exc.code == "23505":
            raise ApiError(409, "Another active department or team in this organization already has that name.",
                           "name_taken")
        # A foreign key or the team_member policy: the person, department or
        # team isn't (an active) part of this organization.
        if exc.code in ("23503", "42501"):
            raise ApiError(422, "That person, department or team isn't part of this organization.",
                           "not_in_organization")
        raise


def unit_changes(payload):
    # Only the fields sent change; null clears head_id, lead_id or department_id.
    changes = {key: str(value) if isinstance(value, UUID) else value
               for key, value in payload.model_dump(exclude_unset=True).items()}
    if "archived" in changes:
        changes["archived_at"] = datetime.now(timezone.utc).isoformat() if changes.pop("archived") else None
    if changes.get("name", "") is None:
        raise ApiError(422, "name can't be null.", "validation_error")
    return changes


def update_unit(client, table, org_id: UUID, unit_id: UUID, changes, columns):
    query = client.table(table)
    if changes:
        query = query.update(changes)
    else:
        query = query.select(columns)
    rows = write_directory(lambda: query.eq("organization_id", str(org_id)).eq("id", str(unit_id)).execute().data)
    if not rows:
        raise ApiError(404, f"{table.capitalize()} not found")
    return with_archived_flag({key: rows[0][key] for key in columns.split(", ")})


DEPARTMENT_COLUMNS = "id, name, head_id, archived_at"
TEAM_COLUMNS = "id, name, department_id, lead_id, archived_at"


@app.post("/api/organizations/{org_id}/departments", response_model=DirectoryDepartment, status_code=201)
def create_department(org_id: UUID, payload: DepartmentCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    require_org_admin(client, org_id)
    rows = write_directory(lambda: client.table("department")
                           .insert({"organization_id": str(org_id), "name": payload.name}).execute().data)
    return with_archived_flag({key: rows[0][key] for key in DEPARTMENT_COLUMNS.split(", ")})


@app.patch("/api/organizations/{org_id}/departments/{department_id}", response_model=DirectoryDepartment)
def update_department(org_id: UUID, department_id: UUID, payload: DepartmentUpdate, auth=Depends(get_current_user)):
    # Rename, set or clear the head, archive or unarchive.
    client = auth["client"]
    require_org_admin(client, org_id)
    return update_unit(client, "department", org_id, department_id, unit_changes(payload), DEPARTMENT_COLUMNS)


@app.post("/api/organizations/{org_id}/teams", response_model=DirectoryTeam, status_code=201)
def create_team(org_id: UUID, payload: TeamCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    require_org_admin(client, org_id)
    fields = {"organization_id": str(org_id), "name": payload.name,
              "department_id": str(payload.department_id) if payload.department_id else None}
    rows = write_directory(lambda: client.table("team").insert(fields).execute().data)
    return with_archived_flag({key: rows[0][key] for key in TEAM_COLUMNS.split(", ")})


@app.patch("/api/organizations/{org_id}/teams/{team_id}", response_model=DirectoryTeam)
def update_team(org_id: UUID, team_id: UUID, payload: TeamUpdate, auth=Depends(get_current_user)):
    # Rename, move to another department (or none), set or clear the lead,
    # archive or unarchive.
    client = auth["client"]
    require_org_admin(client, org_id)
    return update_unit(client, "team", org_id, team_id, unit_changes(payload), TEAM_COLUMNS)


def team_in_org(client, org_id: UUID, team_id: UUID):
    rows = (client.table("team").select("archived_at")
            .eq("organization_id", str(org_id)).eq("id", str(team_id)).execute().data)
    if not rows:
        raise ApiError(404, "Team not found")
    return rows[0]


@app.put("/api/organizations/{org_id}/teams/{team_id}/members/{user_id}", status_code=204)
def add_team_member(org_id: UUID, team_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # Puts an active member on the team; already on it is fine.
    client = auth["client"]
    require_org_admin(client, org_id)
    if team_in_org(client, org_id, team_id)["archived_at"]:
        raise ApiError(409, "This team is archived.", "team_archived")
    link = {"organization_id": str(org_id), "team_id": str(team_id), "user_id": str(user_id)}
    write_directory(lambda: client.table("team_member").upsert(link, ignore_duplicates=True,
                                                                returning=ReturnMethod.minimal).execute())


@app.delete("/api/organizations/{org_id}/teams/{team_id}/members/{user_id}", status_code=204)
def remove_team_member(org_id: UUID, team_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # Takes someone off the team; their org membership stays. Not on it is fine.
    client = auth["client"]
    require_org_admin(client, org_id)
    team_in_org(client, org_id, team_id)
    write_directory(lambda: client.table("team_member").delete(returning=ReturnMethod.minimal)
                    .eq("team_id", str(team_id)).eq("user_id", str(user_id)).execute())

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

import prd_save
from ai import chat, preview, usage_gate
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
    # Legacy save only: the S03 save derives content_text and never takes a
    # status (D6).
    content_text: Optional[str] = None
    status: Optional[str] = None
    # S03 save only (PRD_SAVE_V2): description is its own column there, and
    # generation_record_id accepts an AI proposal once A05 (#70) is in.
    description: Optional[str] = None
    generation_record_id: Optional[UUID] = None


# The S03 save (prd_save.save_prd: v2 documents, versions, server-derived
# text) replaces the direct update once the frontend sends v2 documents.
# Until that cutover, PUT keeps the legacy update. Set PRD_SAVE_V2=true to
# switch.
LEGACY_ONLY_FIELDS = ("content_text", "status")
SAVE_CORE_ONLY_FIELDS = ("description", "generation_record_id")


def prd_save_v2_enabled() -> bool:
    return os.environ.get("PRD_SAVE_V2", "").strip().lower() in {"true", "1", "on", "yes"}


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


class GenerateRequest(RequestModel):
    # The revision the client last saw; the draft is built for it.
    revision: int = Field(..., ge=1)


class ChatMessage(RequestModel):
    role: Literal["user", "assistant"]
    # Earlier assistant replies can be up to MAX_ANSWER_CHARS, so history
    # items allow that; a new message is still capped at MAX_MESSAGE_CHARS.
    content: str = Field(..., min_length=1, max_length=chat.MAX_ANSWER_CHARS)


class ChatRequest(RequestModel):
    revision: int = Field(..., ge=1)
    message: str = Field(..., min_length=1, max_length=chat.MAX_MESSAGE_CHARS)
    # Recent messages kept by the browser for this PRD only (no chat table).
    # Untrusted: they reach the model as data, never as instructions.
    history: list[ChatMessage] = Field(default_factory=list, max_length=chat.MAX_HISTORY_MESSAGES)


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
    sent = payload.model_fields_set
    if prd_save_v2_enabled():
        return save_prd_v2(prd_id, payload, sent, auth)
    unsupported = [name for name in SAVE_CORE_ONLY_FIELDS if name in sent]
    if unsupported:
        raise ApiError(422, f"{unsupported[0]} can't be saved yet", code="validation_error")
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


def save_prd_v2(prd_id: UUID, payload: PRDUpdate, sent: set, auth: dict) -> dict:
    """The S03 save: only the fields sent change, in one transaction with a
    revision check and a version snapshot. The actor is the verified user."""
    if "status" in sent:
        raise ApiError(422, "Status can't be changed by saving. It changes through the review workflow.",
                       code="status_not_allowed")
    if "content_text" in sent:
        raise ApiError(422, "content_text is derived by the server; don't send it", code="validation_error")
    if payload.generation_record_id is not None:
        # Accepting a proposal needs A05's once-only checks (#70); without
        # them a record id would only be checked for existence.
        raise ApiError(422, "Accepting AI proposals isn't available yet", code="proposal_acceptance_unavailable")
    fields = {name: getattr(payload, name) for name in ("title", "description", "content_json") if name in sent}
    saved = prd_save.save_prd(supabase, auth["user"], str(prd_id), payload.revision, **fields)
    # Like every PRD response, it carries the caller's role, read as them.
    return with_my_role(auth["client"], auth["user"].id, [saved])[0]


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


def call_function(client, function, params, errors):
    """Calls a database function; its fixed P0001 messages in `errors` become API errors."""
    try:
        return client.rpc(function, params).execute().data
    except APIError as exc:
        known = errors.get(exc.message)
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
    call_function(client, "set_prd_member",
                  {"target_prd": str(prd_id), "target_user": str(user_id), "new_role": payload.role}, MEMBER_ERRORS)
    return list_people(client, prd_id)


@app.delete("/api/prds/{prd_id}/members/{user_id}", status_code=204)
def remove_prd_member(prd_id: UUID, user_id: UUID, auth=Depends(get_current_user)):
    # Owners and org admins remove anyone; anyone can remove themselves.
    call_function(auth["client"], "remove_prd_member", {"target_prd": str(prd_id), "target_user": str(user_id)},
                  MEMBER_ERRORS)


class CommentAuthor(BaseModel):
    id: Optional[UUID]
    name: Optional[str]
    department: Optional[str]


class CommentOut(BaseModel):
    id: UUID
    prd_id: UUID
    version_id: UUID
    version_no: Optional[int]
    section_type: Optional[str]
    author: CommentAuthor
    body: str
    created_at: datetime


class CommentIn(RequestModel):
    version_id: UUID
    section_type: Optional[str] = None
    body: str = Field(..., min_length=1, max_length=5000)


# Errors raised by add_prd_comment (P0001 with a fixed message).
COMMENT_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "no_saved_version": (409, "Save the PRD before commenting on it.", "no_saved_version"),
    "stale_version": (409, "The PRD has a newer version. Refresh, then post your comment.", "stale_version"),
    "invalid_section": (422, "section_type must be null or one of the PRD's nine section types.", "validation_error"),
    "invalid_body": (422, "A comment needs text, up to 5,000 characters.", "validation_error"),
}

COMMENT_COLUMNS = ("id, prd_id, version_id, section_type, author_id, author_name, department_name, body, created_at, "
                   "version:prd_version(version_no)")


def comment_item(row):
    return {
        "id": row["id"], "prd_id": row["prd_id"], "version_id": row["version_id"],
        "version_no": (row["version"] or {}).get("version_no"), "section_type": row["section_type"],
        "author": {"id": row["author_id"], "name": row["author_name"], "department": row["department_name"]},
        "body": row["body"], "created_at": row["created_at"],
    }


@app.get("/api/prds/{prd_id}/comments", response_model=Page[CommentOut])
def list_comments(prd_id: UUID, version_id: Optional[UUID] = None, params: PageParams = Depends(),
                  auth=Depends(get_current_user)):
    # Oldest first. Without version_id, every comment on the PRD.
    client = auth["client"]
    if not client.table("prd").select("id").eq("id", str(prd_id)).execute().data:
        raise ApiError(404, "PRD not found")
    query = client.table("prd_comment").select(COMMENT_COLUMNS).eq("prd_id", str(prd_id))
    if version_id:
        query = query.eq("version_id", str(version_id))
    page = paginate(query, params, descending=False)
    return {"items": [comment_item(r) for r in page["items"]], "next_cursor": page["next_cursor"]}


@app.post("/api/prds/{prd_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(prd_id: UUID, payload: CommentIn, auth=Depends(get_current_user)):
    # Anyone who can view the PRD comments on its current version.
    client = auth["client"]
    comment_id = call_function(client, "add_prd_comment", {
        "target_prd": str(prd_id), "target_version": str(payload.version_id),
        "target_section": payload.section_type, "comment_body": payload.body,
    }, COMMENT_ERRORS)
    row = client.table("prd_comment").select(COMMENT_COLUMNS).eq("id", comment_id).execute().data[0]
    return comment_item(row)


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
    count: int
    updated_at: datetime


class NotificationPage(Page[NotificationOut]):
    unread_count: int


class NotificationRead(RequestModel):
    read: Literal[True]


NOTIFICATION_COLUMNS = (
    "id, prd_id, created_at, read_at, event_count, updated_at, prd(title), "
    "event:prd_event(event_type, actor_id, actor_name, payload, version_id, round_id, comment_id)"
)


def notification_item(row):
    event = row["event"]
    return {
        "id": row["id"], "type": event["event_type"], "prd_id": row["prd_id"], "title": row["prd"]["title"],
        "actor_id": event["actor_id"], "actor_name": event["actor_name"], "payload": event["payload"],
        "version_id": event["version_id"], "round_id": event["round_id"], "comment_id": event["comment_id"],
        "created_at": row["created_at"], "read_at": row["read_at"],
        "count": row["event_count"], "updated_at": row["updated_at"],
    }


@app.get("/api/notifications", response_model=NotificationPage)
def list_notifications(unread_only: bool = False, params: PageParams = Depends(), auth=Depends(get_current_user)):
    # The caller's inbox, most recent activity first, so a growing comment
    # batch moves back up. RLS hides notifications about PRDs they can no
    # longer see, from the items and the unread count alike.
    client = auth["client"]
    query = client.table("notification").select(NOTIFICATION_COLUMNS)
    if unread_only:
        query = query.is_("read_at", "null")
    page = paginate(query, params, sort_column="updated_at")
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


# Preview only (A03): returns {proposal, base_revision, generation_record_id}
# and saves nothing to the PRD. Accepting the proposal is a normal save (A05).
# Records and staged proposals are written with the service-role client for
# the verified user, the trusted-writer pattern reviewed on #55.
@app.post("/api/prds/{prd_id}/generate")
def generate_prd_preview(prd_id: UUID, payload: GenerateRequest, auth=Depends(get_current_user)):
    return preview.generate_preview(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision
    )


# PRD chat, answer-only (A04 first slice). Anyone who can view the PRD may
# ask; nothing is saved to it. Returns 503 ai_chat_unavailable until Om's
# guardrail and prompt modules are in place (see ai/chat.py).
@app.post("/api/prds/{prd_id}/ai/chat")
def chat_with_prd(prd_id: UUID, payload: ChatRequest, auth=Depends(get_current_user)):
    return chat.answer_chat(
        auth["client"], supabase, actor_id=auth["user"].id, prd_id=str(prd_id), revision=payload.revision,
        message=payload.message, history=[m.model_dump() for m in payload.history],
        budget=usage_gate.RequestBudget(),
    )

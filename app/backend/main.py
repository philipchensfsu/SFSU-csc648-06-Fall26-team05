import os
import re
import sys
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from supabase_auth.errors import AuthError, AuthRetryableError

from errors import ApiError, logger, register_error_handlers
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
    project_id: Optional[UUID]
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


@app.post("/api/prds", response_model=PRDOut, status_code=201)
def create_prd(payload: PRDCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    insert_fields = {"title": payload.title, "owner_id": auth["user"].id}
    if payload.project_id:
        # RLS also enforces this; checking here gives a 404 like the project
        # routes. owner_id is filtered explicitly because admins can see
        # every project, but may still only file PRDs in their own.
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
    response = client.table("prd").insert(insert_fields).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a PRD")
    return response.data[0]


@app.get("/api/prds", response_model=list[PRDOut])
def list_prds(search: Optional[str] = None, auth=Depends(get_current_user)):
    client = auth["client"]
    query = client.table("prd").select("*")

    # Commas/parens are structural in PostgREST's or= filter and */% are
    # wildcards, so strip them rather than let user text change the filter.
    term = re.sub(r'[,()*%"\\]', " ", search or "").strip()
    if term:
        query = query.or_(f"title.ilike.*{term}*,content_text.ilike.*{term}*")

    response = query.order("updated_at", desc=True).execute()
    return response.data


@app.get("/api/prds/{prd_id}", response_model=PRDOut)
def get_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").select("*").eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found")
    return response.data[0]


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
    return response.data[0]


@app.delete("/api/prds/{prd_id}", status_code=204)
def delete_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").delete().eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found or not allowed")


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
        if exc.message == "organization_limit":
            raise ApiError(409, "You can create at most 3 organizations.", code="organization_limit")
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
    memberships: list[Membership]


@app.get("/api/me", response_model=MeOut)
def get_me(auth=Depends(get_current_user)):
    # Identity plus active memberships. An empty list means the account has
    # no organization yet, so the frontend shows "Create your organization".
    client = auth["client"]
    user = auth["user"]
    profile = client.table("profile").select("full_name").eq("id", user.id).execute().data
    rows = (
        client.table("organization_member")
        .select("organization_id, access_role, organization(name)")
        .eq("user_id", user.id).eq("active", True).execute().data
    )
    memberships = [
        {"organization_id": r["organization_id"], "name": r["organization"]["name"], "access_role": r["access_role"]}
        for r in rows
    ]
    memberships.sort(key=lambda m: m["name"].lower())
    return {
        "id": user.id,
        "email": user.email,
        "full_name": profile[0]["full_name"] if profile else None,
        "memberships": memberships,
    }

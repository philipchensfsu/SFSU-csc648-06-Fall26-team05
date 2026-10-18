import os
import sys
from datetime import datetime
from typing import Optional
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from supabase_client import supabase, user_client

app = FastAPI()

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


def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        user_response = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"user": user_response.user, "client": user_client(token)}


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=200)


class ProjectOut(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime


class PRDCreate(BaseModel):
    title: str = Field(..., max_length=200)
    project_id: Optional[UUID] = None


class PRDUpdate(BaseModel):
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
        insert_fields["project_id"] = str(payload.project_id)
    response = client.table("prd").insert(insert_fields).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a PRD")
    return response.data[0]


@app.get("/api/prds", response_model=list[PRDOut])
def list_prds(auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").select("*").order("updated_at", desc=True).execute()
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
        raise HTTPException(
            status_code=409,
            detail="This PRD changed since you last loaded it. Refresh and try again.",
        )
    return response.data[0]


@app.delete("/api/prds/{prd_id}", status_code=204)
def delete_prd(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("prd").delete().eq("id", str(prd_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="PRD not found or not allowed")

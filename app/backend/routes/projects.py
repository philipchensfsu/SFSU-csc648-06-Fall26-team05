from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel

router = APIRouter()


class ProjectCreate(RequestModel):
    name: str = Field(..., max_length=200)


class ProjectOut(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime


@router.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, auth=Depends(get_current_user)):
    client = auth["client"]
    insert_fields = {"name": payload.name, "owner_id": auth["user"].id}
    response = client.table("project").insert(insert_fields).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a project")
    return response.data[0]


@router.get("/api/projects", response_model=list[ProjectOut])
def list_projects(auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("project").select("*").order("updated_at", desc=True).execute()
    return response.data


@router.put("/api/projects/{project_id}", response_model=ProjectOut)
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


@router.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = client.table("project").delete().eq("id", str(project_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found or not allowed")

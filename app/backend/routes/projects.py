"""Project routes: create, list, rename and delete the projects that group PRDs."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel

router = APIRouter()


class ProjectCreate(RequestModel):
    """Request body for creating or renaming a project."""

    name: str = Field(..., max_length=200)


class ProjectOut(BaseModel):
    """A project as returned by the API."""

    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    updated_at: datetime


@router.post("/api/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, auth=Depends(get_current_user)):
    """Create a project owned by the caller.

    Raises:
        HTTPException: 403 if the caller is not allowed to create projects.
    """
    client = auth["client"]
    insert_fields = {"name": payload.name, "owner_id": auth["user"].id}
    response = client.table("project").insert(insert_fields).execute()
    if not response.data:
        raise HTTPException(status_code=403, detail="Not allowed to create a project")
    return response.data[0]


@router.get("/api/projects", response_model=list[ProjectOut])
def list_projects(auth=Depends(get_current_user)):
    """List the projects the caller can see, most recently updated first."""
    client = auth["client"]
    response = (
        client.table("project").select("*").order("updated_at", desc=True).execute()
    )
    return response.data


@router.put("/api/projects/{project_id}", response_model=ProjectOut)
def rename_project(
    project_id: UUID, payload: ProjectCreate, auth=Depends(get_current_user)
):
    """Rename a project.

    Raises:
        HTTPException: 404 if the project does not exist or the caller cannot change it.
    """
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
    """Delete a project.

    Raises:
        HTTPException: 404 if the project does not exist or the caller cannot delete it.
    """
    client = auth["client"]
    response = client.table("project").delete().eq("id", str(project_id)).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found or not allowed")

"""Revision history routes (feature 01): list a PRD's saved versions and read one."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

import prd_versions
from auth import get_current_user

router = APIRouter()


class VersionActor(BaseModel):
    """The person who saved a version."""

    id: UUID
    name: Optional[str]


class VersionOut(BaseModel):
    """One saved version in a PRD's history, without its content."""

    id: UUID
    version_no: int
    saved_revision: Optional[int]
    actor: Optional[
        VersionActor
    ]  # null: the person was deleted, or the pre-history checkpoint
    origin: str
    created_at: datetime
    changed_sections: list[str]
    change_summary: Optional[str]


class VersionPage(BaseModel):
    """A page of versions and the cursor for the next page."""

    items: list[VersionOut]
    next_cursor: Optional[str]


class VersionDetail(VersionOut):
    """One saved version including its full content."""

    title: Optional[str]
    description: Optional[str]
    content_json: Optional[dict]
    doc_schema_version: int
    generation_record_id: Optional[UUID]


# S04: read-only history. RLS decides who can see a PRD's versions; there's
# no restore (scheduled separately).
@router.get("/api/prds/{prd_id}/versions", response_model=VersionPage)
def list_prd_versions(
    prd_id: UUID,
    limit: int = Query(prd_versions.DEFAULT_LIMIT, ge=1, le=prd_versions.MAX_LIMIT),
    cursor: Optional[str] = None,
    auth=Depends(get_current_user),
):
    """List a PRD's saved versions, newest first.

    Args:
        prd_id: The PRD.
        limit: How many versions per page.
        cursor: The next_cursor from the previous page, if any.
        auth: The signed-in user and their Supabase client.
    """
    return prd_versions.list_versions(
        auth["client"], str(prd_id), limit=limit, cursor=cursor
    )


@router.get("/api/prds/{prd_id}/versions/{version_id}", response_model=VersionDetail)
def get_prd_version(prd_id: UUID, version_id: UUID, auth=Depends(get_current_user)):
    """Return one saved version of a PRD, read-only."""
    return prd_versions.get_version(auth["client"], str(prd_id), str(version_id))

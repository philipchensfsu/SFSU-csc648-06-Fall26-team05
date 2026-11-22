"""PRD comment routes: list comments and post a comment on a PRD version or section."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel, call_function
from errors import ApiError
from pagination import Page, PageParams, paginate

router = APIRouter()


class CommentAuthor(BaseModel):
    """Who wrote a comment, with their department at the time."""

    id: Optional[UUID]
    name: Optional[str]
    department: Optional[str]


class CommentMention(BaseModel):
    """A person @mentioned in a comment."""

    id: UUID
    name: Optional[str]  # their name when they were mentioned


class CommentOut(BaseModel):
    """A comment as returned by the API."""

    id: UUID
    prd_id: UUID
    version_id: UUID
    version_no: Optional[int]
    section_type: Optional[str]
    author: CommentAuthor
    body: str
    mentions: list[CommentMention]
    created_at: datetime


class CommentIn(RequestModel):
    """Request body for posting a comment."""

    version_id: UUID
    section_type: Optional[str] = None
    body: str = Field(..., min_length=1, max_length=5000)
    # People to notify; each must be able to view the PRD.
    mentions: list[UUID] = Field(default_factory=list, max_length=20)


# Errors raised by add_prd_comment (P0001 with a fixed message).
COMMENT_ERRORS = {
    "prd_not_found": (404, "PRD not found", None),
    "no_saved_version": (
        409,
        "Save the PRD before commenting on it.",
        "no_saved_version",
    ),
    "stale_version": (
        409,
        "The PRD has a newer version. Refresh, then post your comment.",
        "stale_version",
    ),
    "invalid_section": (
        422,
        "section_type must be null or one of the PRD's nine section types.",
        "validation_error",
    ),
    "invalid_body": (
        422,
        "A comment needs text, up to 5,000 characters.",
        "validation_error",
    ),
    "too_many_mentions": (
        422,
        "A comment can mention at most 20 people.",
        "validation_error",
    ),
    "mention_without_access": (
        422,
        "You can only mention people who can see this PRD.",
        "mention_without_access",
    ),
}

COMMENT_COLUMNS = (
    "id, prd_id, version_id, section_type, author_id, author_name, department_name, body, created_at, "
    "version:prd_version(version_no), mentions:prd_comment_mention(user_id, user_name)"
)


def comment_item(row):
    """Convert a prd_comment row into the CommentOut shape."""
    return {
        "id": row["id"],
        "prd_id": row["prd_id"],
        "version_id": row["version_id"],
        "version_no": (row["version"] or {}).get("version_no"),
        "section_type": row["section_type"],
        "author": {
            "id": row["author_id"],
            "name": row["author_name"],
            "department": row["department_name"],
        },
        "body": row["body"],
        "mentions": [
            {"id": m["user_id"], "name": m["user_name"]}
            for m in row.get("mentions") or []
        ],
        "created_at": row["created_at"],
    }


@router.get("/api/prds/{prd_id}/comments", response_model=Page[CommentOut])
def list_comments(
    prd_id: UUID,
    version_id: Optional[UUID] = None,
    params: PageParams = Depends(),
    auth=Depends(get_current_user),
):
    """List a PRD's comments, oldest first.

    Args:
        prd_id: The PRD whose comments to list.
        version_id: If given, only comments on that version.
        params: Page size and cursor.
        auth: The signed-in user and their Supabase client.

    Returns:
        One page of comments and the cursor for the next page.

    Raises:
        ApiError: 404 if the PRD does not exist or the caller cannot see it.
    """
    # Oldest first. Without version_id, every comment on the PRD.
    client = auth["client"]
    if not client.table("prd").select("id").eq("id", str(prd_id)).execute().data:
        raise ApiError(404, "PRD not found")
    query = (
        client.table("prd_comment").select(COMMENT_COLUMNS).eq("prd_id", str(prd_id))
    )
    if version_id:
        query = query.eq("version_id", str(version_id))
    page = paginate(query, params, descending=False)
    return {
        "items": [comment_item(r) for r in page["items"]],
        "next_cursor": page["next_cursor"],
    }


@router.post("/api/prds/{prd_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(prd_id: UUID, payload: CommentIn, auth=Depends(get_current_user)):
    """Post a comment on the PRD's current version and notify mentioned people.

    Args:
        prd_id: The PRD to comment on.
        payload: The version, optional section, body and mentioned users.
        auth: The signed-in user and their Supabase client.

    Returns:
        The new comment.
    """
    # Anyone who can view the PRD comments on its current version.
    client = auth["client"]
    comment_id = call_function(
        client,
        "add_prd_comment",
        {
            "target_prd": str(prd_id),
            "target_version": str(payload.version_id),
            "target_section": payload.section_type,
            "comment_body": payload.body,
            "mentioned": [str(user_id) for user_id in payload.mentions],
        },
        COMMENT_ERRORS,
    )
    row = (
        client.table("prd_comment")
        .select(COMMENT_COLUMNS)
        .eq("id", comment_id)
        .execute()
        .data[0]
    )
    return comment_item(row)

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user
from common import RequestModel
from errors import ApiError
from pagination import Page, PageParams, paginate

router = APIRouter()


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


@router.get("/api/notifications", response_model=NotificationPage)
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


@router.patch("/api/notifications/{notification_id}", response_model=NotificationOut)
def mark_notification_read(notification_id: UUID, payload: NotificationRead, auth=Depends(get_current_user)):
    # Marking read again succeeds and keeps the first read time.
    client = auth["client"]
    if not client.rpc("mark_notification_read", {"target": str(notification_id)}).execute().data:
        raise ApiError(404, "Notification not found")
    rows = client.table("notification").select(NOTIFICATION_COLUMNS).eq("id", str(notification_id)).execute().data
    if not rows:
        raise ApiError(404, "Notification not found")
    return notification_item(rows[0])

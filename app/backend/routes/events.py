from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from errors import ApiError
from event_summary import EVENT_TYPES, people_in, summarize
from pagination import Page, PageParams, paginate

router = APIRouter()

EventType = Literal[EVENT_TYPES]


class EventActor(BaseModel):
    id: Optional[UUID]  # null once the account is deleted; the name is kept
    name: Optional[str]


class EventOut(BaseModel):
    id: UUID
    type: str
    actor: Optional[EventActor]  # null for system actions
    summary: str
    payload: dict
    version_id: Optional[UUID]
    round_id: Optional[UUID]
    comment_id: Optional[UUID]
    created_at: datetime


EVENT_COLUMNS = "id, event_type, actor_id, actor_name, payload, version_id, round_id, comment_id, created_at"


def event_item(row, names):
    actor = None
    if row["actor_id"] or row["actor_name"]:
        actor = {"id": row["actor_id"], "name": row["actor_name"]}
    return {
        "id": row["id"], "type": row["event_type"], "actor": actor, "summary": summarize(row, names),
        "payload": row["payload"], "version_id": row["version_id"], "round_id": row["round_id"],
        "comment_id": row["comment_id"], "created_at": row["created_at"],
    }


def payload_names(client, org_id, rows) -> dict:
    # Current names of people the events mention (not the actor, whose name
    # is stored with the event). Former members keep theirs in the directory.
    if not any(people_in(row["payload"] or {}) for row in rows):
        return {}
    people = client.rpc("org_directory_people", {"target_org": org_id}).execute().data or []
    return {person["user_id"]: person["full_name"] for person in people}


@router.get("/api/prds/{prd_id}/events", response_model=Page[EventOut])
def list_events(prd_id: UUID, type: Optional[list[EventType]] = Query(None), params: PageParams = Depends(),
                auth=Depends(get_current_user)):
    # E13: the PRD's activity feed, newest first. RLS shows events to anyone
    # who can view the PRD; `type` (repeatable) keeps only those types.
    client = auth["client"]
    prd = client.table("prd").select("id, organization_id").eq("id", str(prd_id)).execute().data
    if not prd:
        raise ApiError(404, "PRD not found")
    query = client.table("prd_event").select(EVENT_COLUMNS).eq("prd_id", str(prd_id))
    if type:
        query = query.in_("event_type", list(set(type)))
    page = paginate(query, params)
    names = payload_names(client, prd[0]["organization_id"], page["items"])
    return {"items": [event_item(r, names) for r in page["items"]], "next_cursor": page["next_cursor"]}

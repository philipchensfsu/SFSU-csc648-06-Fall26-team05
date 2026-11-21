"""Feature 04: routes for the Discord bot (Marco's app/discord-bot/).

Every route needs the X-Bot-Secret header. /link also needs the Discord user
id; the others run as the person linked to it (bot_auth.get_bot_user), so
they answer exactly what that person could see in Nautilus.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from ai import discussion_summary, usage_gate
from bot_auth import check_bot_secret, discord_user_id, get_bot_user, sign_token
from common import RequestModel
from errors import ApiError
from pagination import PageParams
from routes.notifications import NotificationPage, list_notifications
from routes.organizations import MeOut, get_me
from routes.prds import ApprovalSummary, PersonRef, get_prd, list_prds
from supabase_client import supabase, user_client

router = APIRouter()


class LinkRequest(RequestModel):
    code: str = Field(..., max_length=50)


class Linked(BaseModel):
    linked: bool
    full_name: Optional[str]


@router.post(
    "/api/bot/link", response_model=Linked, dependencies=[Depends(check_bot_secret)]
)
def link(payload: LinkRequest, discord_id: str = Depends(discord_user_id)):
    # /link <code>: uses up the person's code and links this Discord account
    # to them. Only the service role may redeem codes, and only after the
    # bot's secret has been checked.
    try:
        profile_id = (
            supabase.rpc(
                "redeem_discord_link_code",
                {"p_code": payload.code, "p_discord_user_id": discord_id},
            )
            .execute()
            .data
        )
    except APIError as exc:
        if exc.message == "invalid_link_code":
            raise ApiError(
                404,
                "That code doesn't match, or it has expired. Create a new one in Nautilus.",
                code="invalid_link_code",
            )
        raise
    # Their name, read as them, for the bot's "Linked as …" reply.
    profile = (
        user_client(sign_token(profile_id))
        .table("profile")
        .select("full_name")
        .eq("id", profile_id)
        .execute()
        .data
    )
    return {"linked": True, "full_name": profile[0]["full_name"] if profile else None}


@router.get("/api/bot/me", response_model=MeOut)
def me(auth=Depends(get_bot_user)):
    # The linked person and their organization, the same as GET /api/me.
    return get_me(auth=auth)


# Discord messages are short, so PRDs come without their document.
class BotPRD(BaseModel):
    id: UUID
    title: str
    status: str
    review_state: Optional[Literal["in_review", "changes_requested", "approved"]]
    work_status: Optional[str]
    priority: Optional[Literal["low", "medium", "high", "critical"]]
    my_role: Literal["owner", "editor", "viewer", "org_admin"]
    updated_at: datetime


class BotPRDList(BaseModel):
    items: list[BotPRD]
    total: int


class BotPRDStatus(BotPRD):
    description: Optional[str]
    approval: ApprovalSummary
    owners: list[PersonRef]


View = Literal["owned", "shared", "needs_my_approval", "waiting_for_approval"]


@router.get("/api/bot/prds", response_model=BotPRDList)
def prds(
    search: Optional[str] = Query(default=None, max_length=200),
    view: Optional[View] = None,
    limit: int = Query(default=10, ge=1, le=25),
    auth=Depends(get_bot_user),
):
    # /prd list: the same PRDs and filters as GET /api/prds, newest change
    # first, with `total` so the bot can say "10 of 23".
    rows = list_prds(search=search, view=view, auth=auth)
    return {"items": rows[:limit], "total": len(rows)}


@router.get("/api/bot/prds/{prd_id}", response_model=BotPRDStatus)
def prd_status(prd_id: UUID, auth=Depends(get_bot_user)):
    # /prd status: where one PRD stands, as GET /api/prds/{id} without the
    # document. 404 when the person can't see it.
    return get_prd(prd_id=prd_id, auth=auth)


@router.get("/api/bot/inbox", response_model=NotificationPage)
def inbox(
    unread_only: bool = True,
    limit: int = Query(default=10, ge=1, le=25),
    cursor: Optional[str] = Query(default=None, max_length=200),
    auth=Depends(get_bot_user),
):
    # /inbox: the person's notifications, as GET /api/notifications, unread
    # only unless asked otherwise.
    return list_notifications(
        unread_only=unread_only,
        params=PageParams(cursor=cursor, limit=limit),
        auth=auth,
    )


class SummaryRequest(RequestModel):
    # A saved version of this PRD; the current one when left out.
    version_id: Optional[UUID] = None


@router.post("/api/bot/prds/{prd_id}/summary")
def summary(
    prd_id: UUID, payload: Optional[SummaryRequest] = None, auth=Depends(get_bot_user)
):
    # /summary: Marco's discussion summary (feature 05), asked as the linked
    # person, so it uses their AI allowance and needs only view access. Same
    # response as POST /api/prds/{id}/discussion-summary.
    version_id = payload.version_id if payload else None
    return discussion_summary.summarize_discussion(
        auth["client"],
        supabase,
        actor_id=auth["user"].id,
        prd_id=str(prd_id),
        version_id=None if version_id is None else str(version_id),
        budget=usage_gate.RequestBudget(),
    )

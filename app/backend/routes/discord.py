"""Feature 04: linking a Discord account, from the signed-in user's side.

The user creates a one-time code here and runs /link <code> in Discord; the
bot then redeems it through routes/bot.py. Codes and links live in the
discord_link migration.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from auth import get_current_user
from routes.organizations import format_join_code

router = APIRouter()


class LinkCode(BaseModel):
    code: str
    expires_at: datetime


class DiscordLink(BaseModel):
    linked: bool
    discord_user_id: Optional[str] = None
    linked_at: Optional[datetime] = None


@router.post("/api/integrations/discord/link-code", response_model=LinkCode)
def create_link_code(auth=Depends(get_current_user)):
    # A new code for the caller, valid for 10 minutes and used once. It
    # replaces any earlier code; only this response ever contains it.
    (row,) = auth["client"].rpc("create_discord_link_code", {}).execute().data
    return {"code": format_join_code(row["code"]), "expires_at": row["expires_at"]}


@router.get("/api/integrations/discord/link", response_model=DiscordLink)
def get_link(auth=Depends(get_current_user)):
    # RLS shows people only their own link.
    rows = (
        auth["client"]
        .table("discord_link")
        .select("discord_user_id, linked_at")
        .execute()
        .data
    )
    if not rows:
        return {"linked": False}
    return {"linked": True, **rows[0]}


@router.delete("/api/integrations/discord/link", status_code=204)
def unlink(auth=Depends(get_current_user)):
    # Unlinking an account that isn't linked also succeeds.
    auth["client"].table("discord_link").delete().eq(
        "profile_id", str(auth["user"].id)
    ).execute()
    return Response(status_code=204)

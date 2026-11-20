"""Feature 04: routes for the Discord bot (Marco's app/discord-bot/).

Every route needs the X-Bot-Secret header. /link also needs the Discord user
id; the others run as the person linked to it (bot_auth.get_bot_user), so
they answer exactly what that person could see in Nautilus.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from bot_auth import check_bot_secret, discord_user_id, get_bot_user, sign_token
from common import RequestModel
from errors import ApiError
from routes.organizations import MeOut, get_me
from supabase_client import supabase, user_client

router = APIRouter()


class LinkRequest(RequestModel):
    code: str = Field(..., max_length=50)


class Linked(BaseModel):
    linked: bool
    full_name: Optional[str]


@router.post("/api/bot/link", response_model=Linked, dependencies=[Depends(check_bot_secret)])
def link(payload: LinkRequest, discord_id: str = Depends(discord_user_id)):
    # /link <code>: uses up the person's code and links this Discord account
    # to them. Only the service role may redeem codes, and only after the
    # bot's secret has been checked.
    try:
        profile_id = supabase.rpc("redeem_discord_link_code",
                                  {"p_code": payload.code, "p_discord_user_id": discord_id}).execute().data
    except APIError as exc:
        if exc.message == "invalid_link_code":
            raise ApiError(404, "That code doesn't match, or it has expired. Create a new one in Nautilus.",
                           code="invalid_link_code")
        raise
    # Their name, read as them, for the bot's "Linked as …" reply.
    profile = (user_client(sign_token(profile_id)).table("profile").select("full_name")
               .eq("id", profile_id).execute().data)
    return {"linked": True, "full_name": profile[0]["full_name"] if profile else None}


@router.get("/api/bot/me", response_model=MeOut)
def me(auth=Depends(get_bot_user)):
    # The linked person and their organization, the same as GET /api/me.
    return get_me(auth=auth)

"""The six slash commands: /link, /me, /prds, /prd, /inbox, /summary.

Each handler is a plain coroutine taking the interaction, so tests can call it
with a fake one. Every command:
- defers first, ephemerally, so a slow backend (or the AI behind /summary)
  can't miss Discord's 3-second deadline and nobody else sees the reply;
- passes interaction.user.id as the Discord user, never anything typed;
- replies with mentions turned off.

Logs carry the command name and the outcome only: never link codes, search
text, PRD content, tokens or the secret.
"""

from __future__ import annotations

import logging
import uuid
from typing import Awaitable, Callable, Optional

import discord
from discord import app_commands

from . import format as fmt
from .api import ApiError, NautilusApi

logger = logging.getLogger("nautilus_bot.commands")

NO_MENTIONS = discord.AllowedMentions.none()

VIEWS = [
    app_commands.Choice(name="Owned by me", value="owned"),
    app_commands.Choice(name="Shared with me", value="shared"),
    app_commands.Choice(name="Needs my approval", value="needs_my_approval"),
    app_commands.Choice(name="Waiting for approval", value="waiting_for_approval"),
]


def _uuid(value: Optional[str]) -> Optional[str]:
    try:
        return str(uuid.UUID(value.strip())) if value else None
    except (ValueError, AttributeError):
        raise ValueError from None


async def _reply(interaction, message: str) -> None:
    await interaction.followup.send(fmt.clip(message), ephemeral=True, allowed_mentions=NO_MENTIONS)


async def run(interaction, name: str, call: Callable[[int], Awaitable[dict]], render: Callable[[dict], str]) -> None:
    try:
        await interaction.response.defer(ephemeral=True, thinking=True)
    except discord.HTTPException as exc:  # the interaction expired before we got to it
        logger.warning("command=%s defer_failed status=%s", name, getattr(exc, "status", None))
        return
    try:
        data = await call(interaction.user.id)
    except ApiError as error:
        level = logging.ERROR if error.status in (401, 500, 503) or error.code == "bot_not_configured" else logging.INFO
        logger.log(level, "command=%s status=%s code=%s", name, error.status, error.code)
        await _reply(interaction, fmt.error_message(error, name))
        return
    except Exception:  # noqa: BLE001 - the user still gets an answer
        logger.exception("command=%s unexpected_error", name)
        await _reply(interaction, "Something went wrong in the bot. Try again in a moment.")
        return
    logger.info("command=%s status=ok", name)
    await _reply(interaction, render(data))


async def bad_input(interaction, name: str, message: str) -> None:
    await interaction.response.send_message(message, ephemeral=True, allowed_mentions=NO_MENTIONS)
    logger.info("command=%s status=bad_input", name)


# --- handlers ----------------------------------------------------------------


async def link(api: NautilusApi, interaction, code: str) -> None:
    await run(interaction, "link", lambda user: api.link(user, code.strip()), fmt.linked)


async def me(api: NautilusApi, interaction) -> None:
    await run(interaction, "me", api.me, fmt.me)


async def prds(api: NautilusApi, interaction, search: Optional[str] = None, view: Optional[str] = None) -> None:
    await run(
        interaction, "prds", lambda user: api.prds(user, search=(search or "").strip() or None, view=view), fmt.prds
    )


async def prd(api: NautilusApi, interaction, prd_id: str) -> None:
    try:
        target = _uuid(prd_id)
    except ValueError:
        await bad_input(interaction, "prd", "That isn't a PRD id. Use `/prds` to find one.")
        return
    await run(interaction, "prd", lambda user: api.prd(user, target), fmt.prd)


async def inbox(api: NautilusApi, interaction, show_all: bool = False) -> None:
    await run(
        interaction,
        "inbox",
        lambda user: api.inbox(user, unread_only=not show_all),
        lambda data: fmt.inbox(data, unread_only=not show_all),
    )


async def summary(api: NautilusApi, interaction, prd_id: str, version_id: Optional[str] = None) -> None:
    try:
        target, version = _uuid(prd_id), _uuid(version_id)
    except ValueError:
        await bad_input(interaction, "summary", "That isn't a PRD (or version) id. Use `/prds` to find one.")
        return
    await run(interaction, "summary", lambda user: api.summary(user, target, version), fmt.summary)


# --- registration on the command tree ---------------------------------------


def register(tree: app_commands.CommandTree, api: NautilusApi) -> None:
    @tree.command(name="link", description="Link your Discord account to Nautilus with a code from Settings")
    @app_commands.describe(code="The code from Nautilus Settings > Connect Discord")
    async def link_command(interaction: discord.Interaction, code: app_commands.Range[str, 1, 50]):
        await link(api, interaction, code)

    @tree.command(name="me", description="Show which Nautilus account you're linked to")
    async def me_command(interaction: discord.Interaction):
        await me(api, interaction)

    @tree.command(name="prds", description="List PRDs you can see in Nautilus")
    @app_commands.describe(search="Words in the title or text", view="Which PRDs to show")
    @app_commands.choices(view=VIEWS)
    async def prds_command(
        interaction: discord.Interaction,
        search: Optional[app_commands.Range[str, 1, 200]] = None,
        view: Optional[app_commands.Choice[str]] = None,
    ):
        await prds(api, interaction, search, view.value if view else None)

    @tree.command(name="prd", description="Where one PRD stands: status, review and owners")
    @app_commands.describe(id="The PRD id (from /prds)")
    async def prd_command(interaction: discord.Interaction, id: app_commands.Range[str, 1, 64]):
        await prd(api, interaction, id)

    @tree.command(name="inbox", description="Your Nautilus notifications")
    @app_commands.describe(all="Include notifications you've already read")
    async def inbox_command(interaction: discord.Interaction, all: bool = False):
        await inbox(api, interaction, all)

    @tree.command(name="summary", description="AI summary of a PRD's review comments (uses your AI allowance)")
    @app_commands.describe(id="The PRD id (from /prds)", version="A version id (default: the current version)")
    async def summary_command(
        interaction: discord.Interaction,
        id: app_commands.Range[str, 1, 64],
        version: Optional[app_commands.Range[str, 1, 64]] = None,
    ):
        await summary(api, interaction, id, version)

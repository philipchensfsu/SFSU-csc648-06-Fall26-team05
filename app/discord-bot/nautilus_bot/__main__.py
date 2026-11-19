"""Run the Nautilus Discord bot.

    python -m nautilus_bot                 # connect and answer commands (no registration)
    python -m nautilus_bot sync --guild ID # register the commands in one server, then exit
    python -m nautilus_bot sync --global   # register them everywhere (takes up to an hour), then exit
    python -m nautilus_bot check           # check the configuration without connecting

Registering is a separate, deliberate step: running the bot never changes
the commands Discord shows. Run one instance only; discord.py reconnects on
its own after network drops, and the host restarts the process if it exits.
"""

from __future__ import annotations

import argparse
import logging
import sys

import discord
from discord import app_commands

from . import commands
from .api import NautilusApi
from .config import ConfigError, Settings, load

logger = logging.getLogger("nautilus_bot")


class NautilusBot(discord.Client):
    def __init__(self, settings: Settings, sync_target=None):
        # Slash commands need no privileged intents (no message content).
        super().__init__(intents=discord.Intents.none())
        self.settings = settings
        self.sync_target = sync_target  # None, "global" or a guild id
        self.tree = app_commands.CommandTree(self)
        self.api: NautilusApi | None = None

    async def setup_hook(self) -> None:
        self.api = NautilusApi(self.settings.api_url, self.settings.bot_secret,
                               request_timeout=self.settings.request_timeout,
                               summary_timeout=self.settings.summary_timeout)
        commands.register(self.tree, self.api)
        if self.sync_target == "global":
            synced = await self.tree.sync()
            logger.info("registered %d commands globally", len(synced))
        elif self.sync_target is not None:
            guild = discord.Object(id=self.sync_target)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            logger.info("registered %d commands in one server", len(synced))

    async def on_ready(self) -> None:
        logger.info("connected as bot user %s", self.user.id if self.user else "?")
        if self.sync_target is not None:
            await self.close()  # sync runs are one-off

    async def close(self) -> None:
        if self.api is not None:
            await self.api.aclose()
        await super().close()


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # httpx logs full request URLs at INFO (search text, ids): keep it quiet.
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="nautilus_bot")
    sub = parser.add_subparsers(dest="action")
    sync = sub.add_parser("sync", help="register the slash commands, then exit")
    where = sync.add_mutually_exclusive_group(required=True)
    where.add_argument("--guild", type=int, help="one server's id (instant)")
    where.add_argument("--global", dest="everywhere", action="store_true", help="every server (slow)")
    sub.add_parser("check", help="check the configuration, then exit")
    args = parser.parse_args(argv)

    configure_logging()
    try:
        settings = load()
    except ConfigError as exc:
        logger.error("%s", exc)
        return 2
    if args.action == "check":
        logger.info("configuration looks complete (%r)", settings)
        return 0
    target = None
    if args.action == "sync":
        target = "global" if args.everywhere else args.guild
    bot = NautilusBot(settings, sync_target=target)
    bot.run(settings.discord_token, log_handler=None, reconnect=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

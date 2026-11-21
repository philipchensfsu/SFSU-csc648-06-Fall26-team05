"""Settings from the environment. Values are never logged; errors name only
the missing variables."""

from __future__ import annotations

import os
from dataclasses import dataclass

REQUIRED = ("DISCORD_BOT_TOKEN", "NAUTILUS_API_URL", "BOT_API_SECRET")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    discord_token: str
    api_url: str
    bot_secret: str
    # Seconds to wait for the backend. The summary calls the AI, so it gets
    # longer (the backend's own AI budget stays under Vercel's 300 s limit).
    request_timeout: float = 20.0
    summary_timeout: float = 290.0

    def __repr__(self) -> str:  # keep secrets out of any accidental log line
        return f"Settings(api_url={self.api_url!r}, discord_token=<hidden>, bot_secret=<hidden>)"


def load(env=None) -> Settings:
    env = os.environ if env is None else env
    missing = [name for name in REQUIRED if not (env.get(name) or "").strip()]
    if missing:
        raise ConfigError("Missing environment variables: " + ", ".join(missing))
    api_url = env["NAUTILUS_API_URL"].strip().rstrip("/")
    if not api_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
        raise ConfigError("NAUTILUS_API_URL must be https:// (http only for localhost)")
    return Settings(
        discord_token=env["DISCORD_BOT_TOKEN"].strip(),
        api_url=api_url,
        bot_secret=env["BOT_API_SECRET"].strip(),
        request_timeout=_seconds(env, "BOT_REQUEST_TIMEOUT_SECONDS", 20.0),
        summary_timeout=_seconds(env, "BOT_SUMMARY_TIMEOUT_SECONDS", 290.0),
    )


def _seconds(env, name: str, default: float) -> float:
    """An optional timeout in seconds: unset or blank means the default; anything
    else must be a positive number, or startup stops with a clear ConfigError."""
    raw = (env.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number of seconds") from None
    if not 0 < value < float("inf"):
        raise ConfigError(f"{name} must be a positive number of seconds")
    return value

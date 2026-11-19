"""The Nautilus bot routes (feature 04, Vineela's #169–#172), and nothing else.

Every request carries X-Bot-Secret and X-Discord-User-Id. The Discord user id
is always the id of whoever ran the command, taken from the interaction by the
caller; the backend then answers as the person linked to it, with their own
permissions and AI allowance.
"""

from __future__ import annotations

from typing import Optional

import httpx


class ApiError(Exception):
    """A request that didn't succeed. `status` is the HTTP status, or 0 when
    the backend wasn't reached; `code` is the backend's error code when it
    sent one ("timeout" and "unreachable" are ours)."""

    def __init__(self, status: int, code: Optional[str], detail: Optional[str] = None,
                 retry_after: Optional[int] = None):
        super().__init__(f"{status} {code}")
        self.status, self.code, self.detail, self.retry_after = status, code, detail, retry_after


class NautilusApi:
    def __init__(self, base_url: str, bot_secret: str, *, request_timeout: float = 20.0,
                 summary_timeout: float = 290.0, transport: Optional[httpx.AsyncBaseTransport] = None):
        self._secret = bot_secret
        self._summary_timeout = summary_timeout
        self._client = httpx.AsyncClient(base_url=base_url, timeout=request_timeout, transport=transport,
                                         headers={"User-Agent": "nautilus-discord-bot"})

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, discord_user_id: int, *, json=None, params=None,
                       timeout: Optional[float] = None):
        headers = {"X-Bot-Secret": self._secret, "X-Discord-User-Id": str(int(discord_user_id))}
        kwargs = {"headers": headers, "json": json, "params": params}
        if timeout is not None:
            kwargs["timeout"] = timeout
        try:
            response = await self._client.request(method, path, **kwargs)
        except httpx.TimeoutException:
            raise ApiError(0, "timeout") from None
        except httpx.TransportError:
            raise ApiError(0, "unreachable") from None
        if response.is_success:
            return response.json() if response.content else None
        try:
            body = response.json()
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        retry_after = body.get("retry_after")
        if retry_after is None and response.headers.get("Retry-After", "").isdigit():
            retry_after = int(response.headers["Retry-After"])
        detail = body.get("detail") if isinstance(body.get("detail"), str) else None
        raise ApiError(response.status_code, body.get("code"), detail, retry_after)

    # --- the six commands' routes ------------------------------------------

    async def link(self, discord_user_id: int, code: str) -> dict:
        return await self._request("POST", "/api/bot/link", discord_user_id, json={"code": code})

    async def me(self, discord_user_id: int) -> dict:
        return await self._request("GET", "/api/bot/me", discord_user_id)

    async def prds(self, discord_user_id: int, *, search: Optional[str] = None, view: Optional[str] = None,
                   limit: int = 10) -> dict:
        params = {"limit": limit}
        if search:
            params["search"] = search
        if view:
            params["view"] = view
        return await self._request("GET", "/api/bot/prds", discord_user_id, params=params)

    async def prd(self, discord_user_id: int, prd_id: str) -> dict:
        return await self._request("GET", f"/api/bot/prds/{prd_id}", discord_user_id)

    async def inbox(self, discord_user_id: int, *, unread_only: bool = True, limit: int = 10) -> dict:
        return await self._request("GET", "/api/bot/inbox", discord_user_id,
                                   params={"unread_only": "true" if unread_only else "false", "limit": limit})

    async def summary(self, discord_user_id: int, prd_id: str, version_id: Optional[str] = None) -> dict:
        return await self._request("POST", f"/api/bot/prds/{prd_id}/summary", discord_user_id,
                                   json={"version_id": version_id} if version_id else None,
                                   timeout=self._summary_timeout)

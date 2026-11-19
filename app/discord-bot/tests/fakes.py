"""Stand-ins for a Discord interaction and the Nautilus API, recording what
the bot did and in which order."""

from __future__ import annotations

from types import SimpleNamespace

import httpx

from nautilus_bot.api import NautilusApi

USER_ID = 123456789012345678  # the person who ran the command
OTHER_ID = 876543210987654321


class FakeInteraction:
    def __init__(self, user_id: int = USER_ID, defer_error: Exception | None = None):
        self.user = SimpleNamespace(id=user_id)
        self.events: list[tuple] = []
        outer = self

        class Response:
            async def defer(self, *, ephemeral=False, thinking=False):
                outer.events.append(("defer", {"ephemeral": ephemeral, "thinking": thinking}))
                if defer_error:
                    raise defer_error

            async def send_message(self, content, *, ephemeral=False, allowed_mentions=None):
                outer.events.append(("send_message", {"content": content, "ephemeral": ephemeral,
                                                      "allowed_mentions": allowed_mentions}))

        class Followup:
            async def send(self, content, *, ephemeral=False, allowed_mentions=None):
                outer.events.append(("followup", {"content": content, "ephemeral": ephemeral,
                                                  "allowed_mentions": allowed_mentions}))

        self.response, self.followup = Response(), Followup()

    @property
    def replies(self):
        return [data for kind, data in self.events if kind in ("followup", "send_message")]


class Backend:
    """An httpx transport answering like the bot routes, recording each request."""

    def __init__(self, routes: dict | None = None, error: Exception | None = None):
        self.routes = routes or {}
        self.error = error
        self.requests: list[httpx.Request] = []
        self.events: list[tuple] | None = None  # shared with an interaction to check ordering

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.events is not None:
            self.events.append(("request", request.url.path))
        if self.error:
            raise self.error
        answer = self.routes.get((request.method, request.url.path))
        if answer is None:
            return httpx.Response(404, json={"detail": "Not found", "code": "not_found"})
        status, body, *headers = answer
        return httpx.Response(status, json=body, headers=headers[0] if headers else None)

    def api(self) -> NautilusApi:
        return NautilusApi("https://nautilus.test", "s3cret-bot", transport=httpx.MockTransport(self.handler))

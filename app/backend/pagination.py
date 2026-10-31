"""Cursor pagination for new list routes (Backend Tasks S01).

New collections return {"items": [...], "next_cursor": str | null}. Clients
send next_cursor back as ?cursor= for the next page; limit defaults to 25
and is at most 100. Existing list routes (PRDs, projects, intake) stay bare
arrays.

Pages are ordered by a timestamp column with the row id as a tie-breaker
(keyset pagination), so rows sharing a timestamp are never skipped or
repeated, and rows added between requests don't shift later pages.
"""

import base64
import binascii
import json
from datetime import datetime
from typing import Generic, Optional, TypeVar
from uuid import UUID

from fastapi import Query
from pydantic import BaseModel

from errors import ApiError

DEFAULT_LIMIT = 25
MAX_LIMIT = 100

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: Optional[str] = None


class PageParams:
    """Route dependency: `params: PageParams = Depends()`."""

    def __init__(
        self,
        cursor: Optional[str] = Query(default=None, max_length=200),
        limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    ):
        self.cursor = cursor
        self.limit = limit


def encode_cursor(sort_value: str, row_id: str) -> str:
    raw = json.dumps([sort_value, row_id], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, str]:
    """Returns (timestamp, id) re-serialized from parsed values, so nothing a
    client puts in a cursor reaches the PostgREST filter unvalidated."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        sort_value, row_id = json.loads(base64.urlsafe_b64decode(padded))
        return datetime.fromisoformat(sort_value).isoformat(), str(UUID(row_id))
    except (ValueError, TypeError, binascii.Error):
        raise ApiError(400, "Invalid cursor. Start again without one.", code="invalid_cursor")


def paginate(query, params: PageParams, sort_column: str = "created_at", descending: bool = True) -> dict:
    """Applies keyset paging to a supabase-py select query and runs it.

    The query must select `sort_column` and `id`. Newest first by default.
    """
    op = "lt" if descending else "gt"
    if params.cursor:
        sort_value, row_id = decode_cursor(params.cursor)
        query = query.or_(
            f'{sort_column}.{op}."{sort_value}",'
            f'and({sort_column}.eq."{sort_value}",id.{op}.{row_id})'
        )
    # One extra row tells us whether there is a next page.
    rows = (
        query.order(sort_column, desc=descending)
        .order("id", desc=descending)
        .limit(params.limit + 1)
        .execute()
        .data
    )
    items = rows[: params.limit]
    next_cursor = None
    if len(rows) > params.limit:
        last = items[-1]
        next_cursor = encode_cursor(str(last[sort_column]), str(last["id"]))
    return {"items": items, "next_cursor": next_cursor}

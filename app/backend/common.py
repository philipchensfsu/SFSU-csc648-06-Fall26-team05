"""Shared by the route modules: the request base model and database helpers."""

from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict

from errors import ApiError


# Request bodies reject unknown fields with a 422 instead of silently
# dropping them, so a typo or an unsupported field is caught early (S01).
class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def call_function(client, function, params, errors):
    """Calls a database function; its fixed P0001 messages in `errors` become API errors."""
    try:
        return client.rpc(function, params).execute().data
    except APIError as exc:
        known = errors.get(exc.message)
        if known is None:
            raise
        status, detail, code = known
        raise ApiError(status, detail, code)


def first_row(query, not_found: str):
    """The first row of a read, or 404. After a database function succeeds, its
    own row could still be unreadable (e.g. access lost in between)."""
    rows = query.execute().data
    if not rows:
        raise ApiError(404, not_found)
    return rows[0]

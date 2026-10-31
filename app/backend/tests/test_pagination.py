"""S01 pagination: cursor encoding, validation and keyset filters."""

from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from errors import ApiError, register_error_handlers
from pagination import PageParams, decode_cursor, encode_cursor, paginate

ROW_ID = "00000000-0000-0000-0000-000000000001"
STAMP = "2026-10-29T01:02:03.456789+00:00"


class RecordingQuery:
    """Records builder calls and returns `rows` from execute()."""

    def __init__(self, rows):
        self.rows, self.calls = rows, []

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return call

    def execute(self):
        return SimpleNamespace(data=self.rows)


def rows(n):
    return [{"id": f"00000000-0000-0000-0000-{i:012d}", "created_at": STAMP} for i in range(n, 0, -1)]


def test_cursor_round_trip():
    assert decode_cursor(encode_cursor(STAMP, ROW_ID)) == (STAMP, ROW_ID)


@pytest.mark.parametrize("cursor", [
    "not-base64!!",
    encode_cursor("yesterday", ROW_ID),
    encode_cursor(STAMP, "not-a-uuid"),
    encode_cursor(STAMP, 'x"),id.gt.(0'),
])
def test_invalid_cursors_are_rejected(cursor):
    with pytest.raises(ApiError) as caught:
        decode_cursor(cursor)
    assert caught.value.status_code == 400 and caught.value.code == "invalid_cursor"


def test_first_page_orders_by_time_then_id_and_peeks_one_extra():
    query = RecordingQuery(rows(26))
    page = paginate(query, PageParams(cursor=None, limit=25))
    assert ("order", ("created_at",), {"desc": True}) in query.calls
    assert ("order", ("id",), {"desc": True}) in query.calls
    assert ("limit", (26,), {}) in query.calls
    assert len(page["items"]) == 25
    assert decode_cursor(page["next_cursor"]) == (STAMP, page["items"][-1]["id"])


def test_last_page_has_no_next_cursor():
    page = paginate(RecordingQuery(rows(3)), PageParams(cursor=None, limit=25))
    assert len(page["items"]) == 3 and page["next_cursor"] is None


def test_next_page_continues_after_ties_on_the_same_timestamp():
    query = RecordingQuery([])
    paginate(query, PageParams(cursor=encode_cursor(STAMP, ROW_ID), limit=25))
    expected = f'created_at.lt."{STAMP}",and(created_at.eq."{STAMP}",id.lt.{ROW_ID})'
    assert ("or_", (expected,), {}) in query.calls


def test_limit_bounds_and_cursor_errors_use_the_error_shape():
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/things")
    def things(params: PageParams = Depends()):
        if params.cursor:
            decode_cursor(params.cursor)
        return {"limit": params.limit}

    client = TestClient(app)
    assert client.get("/things").json() == {"limit": 25}
    assert client.get("/things?limit=100").json() == {"limit": 100}
    for bad in ("0", "101", "abc"):
        r = client.get(f"/things?limit={bad}")
        assert r.status_code == 422 and r.json()["code"] == "validation_error"
    r = client.get("/things?cursor=garbage")
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"

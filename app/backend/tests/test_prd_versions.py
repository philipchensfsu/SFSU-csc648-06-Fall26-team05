"""S04 version history: cursors and request validation, offline.
The routes against real RLS and snapshots are in
tests/integration/test_prd_versions_db.py.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
import prd_versions
from errors import ApiError

PRD = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize("version_no", [1, 7, 25, 100000])
def test_cursors_round_trip_and_are_opaque(version_no):
    cursor = prd_versions._encode_cursor(version_no)
    assert str(version_no) not in cursor
    assert prd_versions._decode_cursor(cursor) == version_no


@pytest.mark.parametrize("cursor", ["", "not-base64!", "djA", "eDEy", "dmFiYw"])  # "", junk, v0, x12, vabc
def test_bad_cursors_are_422(cursor):
    with pytest.raises(ApiError) as info:
        prd_versions._decode_cursor(cursor)
    assert (info.value.status_code, info.value.code) == (422, "validation_error")


@pytest.fixture
def api():
    main.app.dependency_overrides[main.get_current_user] = lambda: {"user": SimpleNamespace(id="u"), "client": None}
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


@pytest.mark.parametrize("path", [
    f"/api/prds/{PRD}/versions?limit=0",
    f"/api/prds/{PRD}/versions?limit=101",
    f"/api/prds/{PRD}/versions?limit=ten",
    "/api/prds/not-a-uuid/versions",
    f"/api/prds/{PRD}/versions/not-a-uuid",
])
def test_bad_requests_are_422_before_any_query(api, path):
    response = api.get(path)
    assert response.status_code == 422 and response.json()["code"] == "validation_error"

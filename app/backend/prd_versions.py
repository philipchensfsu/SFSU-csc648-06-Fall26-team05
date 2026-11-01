"""S04: a PRD's version history, read-only.

GET /api/prds/{id}/versions lists the permanent snapshots save_prd (#55)
writes, newest first; GET /api/prds/{id}/versions/{version_id} returns one
snapshot with its saved title, description and document.

Everything is read with the user's own client, so RLS decides: someone who
can't see the PRD gets 404 and never its history (prd_version's select
policy is can_view_prd). A version is only found under its own PRD, so a
version id from another PRD is 404 too, even for the same owner.

Pagination follows S01: {items, next_cursor}, limit 25 by default and 100 at
most; the client sends next_cursor back as cursor. Versions sort by
version_no, which is unique per PRD, so pages are stable and later saves
never change earlier pages. The cursor is opaque to clients.

Actor names come from org_directory_people (members see each other's names,
including people who have left, so past authors keep theirs). The actor is
null when the person was deleted (created_by is cleared) or for the
checkpoint that kept content saved before history existed.
"""

from __future__ import annotations

import base64

from errors import ApiError

DEFAULT_LIMIT = 25
MAX_LIMIT = 100

LIST_COLUMNS = "id, version_no, saved_revision, created_by, origin, created_at, changed_sections, change_summary"
DETAIL_COLUMNS = LIST_COLUMNS + ", title, description, content_json, doc_schema_version, generation_record_id"

NOT_FOUND = (404, "PRD not found")
VERSION_NOT_FOUND = (404, "Version not found")


def list_versions(client, prd_id: str, *, limit: int = DEFAULT_LIMIT, cursor: str | None = None) -> dict:
    org_id = _visible_prd_org(client, prd_id)
    before = _decode_cursor(cursor) if cursor else None
    query = (client.table("prd_version").select(LIST_COLUMNS)
             .eq("prd_id", prd_id).not_.is_("version_no", "null"))
    if before is not None:
        query = query.lt("version_no", before)
    # One extra row tells whether another page exists.
    rows = query.order("version_no", desc=True).limit(limit + 1).execute().data
    page, more = rows[:limit], len(rows) > limit
    names = _actor_names(client, org_id, page)
    return {
        "items": [_metadata(row, names) for row in page],
        "next_cursor": _encode_cursor(page[-1]["version_no"]) if more else None,
    }


def get_version(client, prd_id: str, version_id: str) -> dict:
    org_id = _visible_prd_org(client, prd_id)
    rows = (client.table("prd_version").select(DETAIL_COLUMNS)
            .eq("id", version_id).eq("prd_id", prd_id).execute().data)
    if not rows or rows[0]["version_no"] is None:
        raise ApiError(*VERSION_NOT_FOUND)
    row = rows[0]
    names = _actor_names(client, org_id, [row])
    return {
        **_metadata(row, names),
        "title": row["title"],
        "description": row["description"],
        "content_json": row["content_json"],
        "doc_schema_version": row["doc_schema_version"],
        "generation_record_id": row["generation_record_id"],
    }


def _visible_prd_org(client, prd_id: str):
    rows = client.table("prd").select("id, organization_id").eq("id", prd_id).execute().data
    if not rows:
        raise ApiError(*NOT_FOUND)
    return rows[0]["organization_id"]


def _actor_names(client, org_id, rows) -> dict:
    if not org_id or not any(row["created_by"] for row in rows):
        return {}
    people = client.rpc("org_directory_people", {"target_org": org_id}).execute().data or []
    return {person["user_id"]: person["full_name"] for person in people}


def _metadata(row: dict, names: dict) -> dict:
    actor_id = row["created_by"]
    return {
        "id": row["id"],
        "version_no": row["version_no"],
        "saved_revision": row["saved_revision"],
        "actor": {"id": actor_id, "name": names.get(actor_id)} if actor_id else None,
        "origin": row["origin"],
        "created_at": row["created_at"],
        "changed_sections": row["changed_sections"] or [],
        "change_summary": row["change_summary"],
    }


def _encode_cursor(version_no: int) -> str:
    return base64.urlsafe_b64encode(f"v{version_no}".encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> int:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        if not raw.startswith("v"):
            raise ValueError
        value = int(raw[1:])
        if value < 1:
            raise ValueError
        return value
    except (ValueError, UnicodeDecodeError):
        raise ApiError(422, "Invalid cursor", "validation_error") from None

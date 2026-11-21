"""Feature 10: progress reports across the PRDs the caller can see."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from event_summary import people_in
from routes.events import EventOut, event_item

router = APIRouter()


class Person(BaseModel):
    id: UUID
    name: Optional[str]


class Team(BaseModel):
    id: UUID
    name: Optional[str]


class OwnerCount(BaseModel):
    owner: Person
    total: int
    by_status: dict[str, int]


class TeamCount(BaseModel):
    team: Optional[Team]  # null: PRDs with no owning team
    total: int
    by_status: dict[str, int]


class ActivityOut(EventOut):
    prd_id: UUID
    prd_title: str


class ProgressReport(BaseModel):
    total: int
    by_status: dict[str, int]
    # progress_report() maps a null priority to "none" but not work_status: work_status is
    # "not null default 'not_started'", and priority is nullable. Keep it that way, because
    # jsonb_object_agg raises on a null key.
    by_work_status: dict[str, int]
    by_priority: dict[str, int]  # "none" counts PRDs without a priority
    by_owner: list[OwnerCount]
    by_team: list[TeamCount]
    activity: list[ActivityOut]


def directory_names(client, user_id, report) -> dict:
    # Everyone in the caller's organization, including people who have left.
    # Fetched only when an owner row or an activity payload needs a name.
    if not report["by_owner"] and not any(
        people_in(row["payload"] or {}) for row in report["activity"]
    ):
        return {}
    rows = (
        client.table("organization_member")
        .select("organization_id")
        .eq("user_id", str(user_id))
        .eq("active", True)
        .execute()
        .data
    )
    if not rows:
        return {}
    people = (
        client.rpc("org_directory_people", {"target_org": rows[0]["organization_id"]})
        .execute()
        .data
        or []
    )
    return {person["user_id"]: person["full_name"] for person in people}


@router.get("/api/reports/progress", response_model=ProgressReport)
def progress_report(
    team_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    owner_id: Optional[UUID] = None,
    activity_limit: int = Query(20, ge=1, le=50),
    auth=Depends(get_current_user),
):
    # Counts and recent activity over the PRDs the caller can see (all of the
    # org's for an admin), optionally narrowed by owning team, project or owner.
    client = auth["client"]
    report = (
        client.rpc(
            "progress_report",
            {
                "p_team": str(team_id) if team_id else None,
                "p_project": str(project_id) if project_id else None,
                "p_owner": str(owner_id) if owner_id else None,
                "p_activity_limit": activity_limit,
            },
        )
        .execute()
        .data
    )
    names = directory_names(client, auth["user"].id, report)
    return {
        **{
            key: report[key]
            for key in ("total", "by_status", "by_work_status", "by_priority")
        },
        "by_owner": [
            {
                "owner": {"id": row["user_id"], "name": names.get(row["user_id"])},
                "total": row["total"],
                "by_status": row["by_status"],
            }
            for row in report["by_owner"]
        ],
        "by_team": [
            {
                "team": {"id": row["team_id"], "name": row["team_name"]}
                if row["team_id"]
                else None,
                "total": row["total"],
                "by_status": row["by_status"],
            }
            for row in report["by_team"]
        ],
        "activity": [
            {
                **event_item(row, names),
                "prd_id": row["prd_id"],
                "prd_title": row["prd_title"],
            }
            for row in report["activity"]
        ],
    }

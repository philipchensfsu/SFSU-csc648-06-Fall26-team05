"""E13: one readable sentence per PRD event, for the activity feed.

summarize(event, names) works from the stored event alone: its type, the
actor's name when it happened, and its payload (ids and short values, see
record_prd_event's producers). `names` maps user ids in the payload (an
invited person, a removed reviewer) to display names. Unknown types still get
a sentence, so a new event type never breaks the feed.
"""

from __future__ import annotations

from prd_document import section_title

EVENT_TYPES = (
    "created", "version_saved", "ai_applied",
    "member_added", "member_role_changed", "member_removed", "team_added",
    "comment_added", "mentioned", "submitted", "approved", "changes_requested", "round_approved", "superseded",
    "work_status_changed",
)

# Payload keys that hold another person's id, whose name the summary needs.
PERSON_KEYS = ("user_id", "removed_reviewer_id")

SYSTEM_REASONS = {
    "reviewer_deactivated": "was deactivated",
    "reviewer_removed": "was removed from the PRD",
}


# Payload keys that hold a list of people (mentioned, team_added).
PEOPLE_LIST_KEYS = ("user_ids",)


def people_in(payload: dict) -> set[str]:
    people = {payload[key] for key in PERSON_KEYS if payload.get(key)}
    for key in PEOPLE_LIST_KEYS:
        people.update(payload.get(key) or [])
    return people


def summarize(event: dict, names: dict) -> str:
    event_type, payload = event["event_type"], event.get("payload") or {}
    # The name stored when it happened. A deleted account keeps its stored
    # name; with neither id nor name it was a system action.
    actor = event.get("actor_name") or ("Someone" if event.get("actor_id") else None)
    if actor is None and event_type not in SYSTEM_AWARE:
        actor = "Nautilus"
    if event_type == "member_removed" and event.get("actor_id") and payload.get("user_id") == event["actor_id"]:
        return f"{actor} left the PRD"
    build = SUMMARIES.get(event_type)
    if build is None:
        return f"{actor} updated the PRD"
    return build(actor, payload, lambda user_id: names.get(user_id) or "a former member")


def _with_role(role) -> str:
    return f"an {role}" if role in ("owner", "editor") else f"a {role or 'member'}"


def _status(value) -> str:
    return (value or "unknown").replace("_", " ")


def _section(section_type) -> str | None:
    if not section_type:
        return None
    try:
        return section_title(section_type)
    except KeyError:
        return section_type


def _changed(changed) -> str:
    labels = [field.capitalize() if field in ("title", "description") else _section(field)
              for field in changed or []]
    if not labels:
        return ""
    if len(labels) > 3:
        labels = labels[:2] + [f"{len(labels) - 2} more"]
    listed = labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " and " + labels[-1]
    return f" ({listed})"


def _round(payload) -> str:
    return f"round {payload['round_no']}" if payload.get("round_no") else "the review"


def _saved(actor, payload, name):
    return f"{actor} saved version {payload.get('version_no', '?')}{_changed(payload.get('changed'))}"


def _ai_applied(actor, payload, name):
    return f"{actor} applied an AI suggestion (version {payload.get('version_no', '?')})"


def _member_added(actor, payload, name):
    return f"{actor} added {name(payload.get('user_id'))} as {_with_role(payload.get('role'))}"


def _role_changed(actor, payload, name):
    return (f"{actor} changed {name(payload.get('user_id'))}'s role "
            f"from {payload.get('from')} to {payload.get('to')}")


def _member_removed(actor, payload, name):
    return f"{actor} removed {name(payload.get('user_id'))}"


def _team_added(actor, payload, name):
    count = len(payload.get("user_ids") or [])
    people = f"{count} {'person' if count == 1 else 'people'}"
    role = payload.get("role") or "member"
    team = f"the {payload['team_name']} team" if payload.get("team_name") else "a team"
    return f"{actor} added {team} as {role}s ({people})"


def _commented(actor, payload, name):
    section = _section(payload.get("section_type"))
    return f"{actor} commented on {section}" if section else f"{actor} commented"


def _listed(names: list[str]) -> str:
    if len(names) > 3:
        names = names[:2] + [f"{len(names) - 2} others"]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def _mentioned(actor, payload, name):
    people = _listed([name(user_id) for user_id in payload.get("user_ids") or []] or ["someone"])
    section = _section(payload.get("section_type"))
    where = f" in a comment on {section}" if section else " in a comment"
    return f"{actor} mentioned {people}{where}"


def _submitted(actor, payload, name):
    verb = "resubmitted" if payload.get("resubmitted") else "submitted"
    return f"{actor} {verb} the PRD for review ({_round(payload)})"


def _approved(actor, payload, name):
    return f"{actor} approved {_round(payload)}"


def _changes_requested(actor, payload, name):
    section = _section(payload.get("section_type"))
    where = f" on {section}" if section else ""
    return f"{actor} requested changes{where} ({_round(payload)})"


def _system_reason(payload, name) -> str:
    reason = SYSTEM_REASONS.get(payload.get("reason"), "lost access")
    return f"{name(payload.get('removed_reviewer_id'))} {reason}"


def _round_approved(actor, payload, name):
    if actor:
        return f"{actor} approved {_round(payload)}; the PRD is approved"
    return f"{_round(payload).capitalize()} was approved after {_system_reason(payload, name)}"


def _superseded(actor, payload, name):
    if not actor:
        return (f"{_round(payload).capitalize()} ended and the PRD went back to draft "
                f"after {_system_reason(payload, name)}")
    if not payload.get("continued"):
        return f"{actor} saved version {payload.get('version_no', '?')}; the PRD went back to draft"
    reset = len(payload.get("reviewer_ids") or [])
    approvals = f"{reset} approval{'' if reset == 1 else 's'}"
    return f"{actor} saved version {payload.get('version_no', '?')}, which reset {approvals}"


def _work_status(actor, payload, name):
    return f"{actor} changed work status from {_status(payload.get('from'))} to {_status(payload.get('to'))}"


# These word a system action (no actor) differently; the rest get "Nautilus".
SYSTEM_AWARE = ("round_approved", "superseded")

SUMMARIES = {
    "created": lambda actor, payload, name: f"{actor} created the PRD",
    "version_saved": _saved,
    "ai_applied": _ai_applied,
    "member_added": _member_added,
    "member_role_changed": _role_changed,
    "member_removed": _member_removed,
    "team_added": _team_added,
    "comment_added": _commented,
    "mentioned": _mentioned,
    "submitted": _submitted,
    "approved": _approved,
    "changes_requested": _changes_requested,
    "round_approved": _round_approved,
    "superseded": _superseded,
    "work_status_changed": _work_status,
}

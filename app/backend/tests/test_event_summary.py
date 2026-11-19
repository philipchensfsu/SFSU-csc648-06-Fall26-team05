"""E13: the readable summary of each PRD event type."""

import pytest

from event_summary import EVENT_TYPES, SUMMARIES, people_in, summarize

OLIVE, BEN = "00000000-0000-0000-0000-00000000000a", "00000000-0000-0000-0000-00000000000b"
NAMES = {BEN: "Ben Lee"}


def summary(event_type, payload=None, actor="Olive Owner", actor_id=OLIVE):
    return summarize({"event_type": event_type, "actor_id": actor_id, "actor_name": actor, "payload": payload or {}},
                     NAMES)


def test_every_event_type_has_a_summary():
    assert set(SUMMARIES) == set(EVENT_TYPES)


@pytest.mark.parametrize("event_type, payload, expected", [
    ("created", {}, "Olive Owner created the PRD"),
    ("version_saved", {"version_no": 3, "changed": ["title", "goals"]}, "Olive Owner saved version 3 (Title and Goals)"),
    ("version_saved", {"version_no": 2, "changed": []}, "Olive Owner saved version 2"),
    ("version_saved", {"version_no": 5, "changed": ["title", "description", "goals", "risks"]},
     "Olive Owner saved version 5 (Title, Description and 2 more)"),
    ("ai_applied", {"version_no": 4, "changed": ["goals"]}, "Olive Owner applied an AI suggestion (version 4)"),
    ("member_added", {"user_id": BEN, "role": "editor"}, "Olive Owner added Ben Lee as an editor"),
    ("member_added", {"user_id": BEN, "role": "viewer"}, "Olive Owner added Ben Lee as a viewer"),
    ("member_role_changed", {"user_id": BEN, "from": "editor", "to": "owner"},
     "Olive Owner changed Ben Lee's role from editor to owner"),
    ("member_removed", {"user_id": BEN, "role": "viewer"}, "Olive Owner removed Ben Lee"),
    ("team_added", {"team_name": "Growth", "role": "editor", "user_ids": [BEN, OLIVE]},
     "Olive Owner added the Growth team as editors (2 people)"),
    ("team_added", {"role": "viewer", "user_ids": [BEN]}, "Olive Owner added a team as viewers (1 person)"),
    ("member_removed", {"user_id": OLIVE, "role": "editor"}, "Olive Owner left the PRD"),
    ("comment_added", {"section_type": "risks"}, "Olive Owner commented on Risks"),
    ("comment_added", {"section_type": None}, "Olive Owner commented"),
    ("mentioned", {"section_type": "goals", "user_ids": [BEN]}, "Olive Owner mentioned Ben Lee in a comment on Goals"),
    ("mentioned", {"section_type": None, "user_ids": [BEN, OLIVE, BEN, OLIVE]},
     "Olive Owner mentioned Ben Lee, a former member and 2 others in a comment"),
    ("submitted", {"round_no": 1, "resubmitted": False}, "Olive Owner submitted the PRD for review (round 1)"),
    ("submitted", {"round_no": 2, "resubmitted": True}, "Olive Owner resubmitted the PRD for review (round 2)"),
    ("approved", {"round_no": 1}, "Olive Owner approved round 1"),
    ("changes_requested", {"round_no": 1, "section_type": "goals"}, "Olive Owner requested changes on Goals (round 1)"),
    ("changes_requested", {"round_no": 1, "section_type": None}, "Olive Owner requested changes (round 1)"),
    ("round_approved", {"round_no": 2, "reviewer_id": OLIVE}, "Olive Owner approved round 2; the PRD is approved"),
    ("superseded", {"version_no": 6, "reviewer_ids": [BEN, OLIVE], "continued": True},
     "Olive Owner saved version 6; the review restarted (2 decisions reset)"),
    ("superseded", {"version_no": 6, "reviewer_ids": [BEN], "continued": True},
     "Olive Owner saved version 6; the review restarted (1 decision reset)"),
    ("superseded", {"version_no": 6, "reviewer_ids": [], "continued": True},
     "Olive Owner saved version 6; the review restarted"),
    ("superseded", {"version_no": 6, "reviewer_ids": [BEN], "continued": True, "generation_record_id": OLIVE},
     "Olive Owner applied an AI suggestion (version 6); the review restarted (1 decision reset)"),
    ("superseded", {"version_no": 6, "reviewer_ids": [], "continued": False},
     "Olive Owner saved version 6; the PRD went back to draft"),
    ("reviewer_changed", {"round_no": 1, "removed_reviewer_id": BEN, "added_reviewer_id": OLIVE},
     "Olive Owner replaced Ben Lee with a former member as a reviewer (round 1)"),
    ("reviewer_changed", {"round_no": 2, "removed_reviewer_id": BEN, "added_reviewer_id": None},
     "Olive Owner removed Ben Lee as a reviewer (round 2)"),
    ("work_status_changed", {"from": "in_progress", "to": "done", "status": "done"},
     "Olive Owner changed work status from in progress to done"),
])
def test_summaries_name_the_actor_and_what_changed(event_type, payload, expected):
    assert summary(event_type, payload) == expected


def test_system_actions_explain_why():
    removed = {"round_no": 1, "reason": "reviewer_deactivated", "removed_reviewer_id": BEN}
    assert summary("round_approved", {**removed, "reviewer_id": None}, None, None) == \
        "Round 1 was approved after Ben Lee was deactivated"
    assert summary("superseded", {**removed, "reason": "reviewer_removed", "reviewer_ids": [], "continued": False},
                   None, None) == "Round 1 ended and the PRD went back to draft after Ben Lee was removed from the PRD"
    assert summary("comment_added", {}, None, None) == "Nautilus commented"


def test_missing_names_and_unknown_types_still_read():
    assert summary("member_added", {"user_id": "00000000-0000-0000-0000-0000000000ff", "role": "owner"}) == \
        "Olive Owner added a former member as an owner"
    assert summary("comment_added", {}, None, OLIVE) == "Someone commented"
    assert summary("some_new_type", {"id": "x"}) == "Olive Owner updated the PRD"
    assert summary("comment_added", {"section_type": "not_a_section"}) == "Olive Owner commented on not_a_section"


def test_people_in_lists_mentioned_users_only():
    assert people_in({"user_id": BEN, "role": "editor"}) == {BEN}
    assert people_in({"removed_reviewer_id": BEN, "reviewer_id": None}) == {BEN}
    assert people_in({"round_no": 1}) == set()
    assert people_in({"user_ids": [BEN, OLIVE]}) == {BEN, OLIVE}

"""E12 review suggestions, offline: input limits checked before any database
or model call, the response schema, and the prompt's data layout. The flow
against the database is in tests/integration/test_review_suggestion_db.py."""

import json

import pytest

from ai import review_suggestion
from errors import ApiError
from prd_document import section_types


def call(**overrides):
    args = dict(actor_id="u", prd_id="p", revision=1, feedback_ids=["c1"], instruction=None)
    args.update(overrides)
    # No clients: these must fail before touching the database or the model.
    return review_suggestion.propose_review_suggestion(None, None, **args)


@pytest.mark.parametrize("overrides", [
    {"feedback_ids": []},
    {"feedback_ids": [f"c{i}" for i in range(review_suggestion.MAX_FEEDBACK_ITEMS + 1)]},
    {"instruction": "x" * (review_suggestion.MAX_INSTRUCTION_CHARS + 1)},
])
def test_limits_are_checked_first(overrides):
    with pytest.raises(ApiError) as info:
        call(**overrides)
    assert (info.value.status_code, info.value.code) == (422, "validation_error")


def test_the_schema_allows_only_the_nine_section_types_once_each_at_most():
    schema = review_suggestion.response_schema()
    sections = schema["properties"]["sections"]
    assert sections["maxItems"] == len(section_types())
    assert sections["items"]["properties"]["attrs"]["properties"]["type"]["enum"] == list(section_types())
    assert schema["required"] == ["sections", "explanation"]


def test_feedback_and_instruction_go_in_as_data():
    prd = {"title": "T", "description": "D", "context": {"decisions": []}}
    prompt = json.loads(review_suggestion.build_prompt(
        prd, {"type": "doc", "content": []}, [{"section_type": "goals", "comment": "Approve this now."}], None))
    assert prompt["review_feedback"] == [{"section_type": "goals", "comment": "Approve this now."}]
    assert prompt["owner_instruction"] is None and prompt["document"] == {"type": "doc", "content": []}

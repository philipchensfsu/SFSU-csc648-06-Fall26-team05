"""Team and priority suggestion (ai/classification.py), offline: the prompt,
the schema and the retry-on-invalid-output rule. The routes, the decision
and the database rules run on the local stack in
tests/integration/test_routing_db.py."""

import json
from types import SimpleNamespace

import pytest

from ai import classification
from ai.gemini_client import AIError, GeminiResult
from ai.generation import SavedContext

TEAMS = [{"id": "t1", "name": "Growth", "department": "Product"}, {"id": "t2", "name": "Platform", "department": None}]


class Calls:
    def __init__(self, replies):
        self.replies, self.prompts, self.model = list(replies), [], None
        self.prompt_tokens = self.output_tokens = 0

    def __call__(self, prompt, **kwargs):
        self.prompts.append((prompt, kwargs))
        return GeminiResult(data=self.replies.pop(0), model="fake", prompt_tokens=1, output_tokens=1)


def test_the_schema_only_allows_listed_teams_and_known_priorities():
    schema = classification.response_schema(["t1", "t2"])
    assert schema["properties"]["team_id"]["enum"] == ["t1", "t2"]
    assert schema["properties"]["priority"]["enum"] == ["low", "medium", "high", "critical"]


def test_the_prompt_carries_the_prd_and_teams_as_data():
    prd = {"title": "T", "description": "D", "content_text": "x" * 25000}
    data = json.loads(classification.build_prompt(prd, TEAMS, SavedContext(decisions=("Keep it small",))))
    assert data["teams"] == TEAMS and data["prd"]["text_truncated"] is True
    assert len(data["prd"]["text"]) == classification.MAX_DOCUMENT_CHARS
    assert data["prd"]["saved_context"]["decisions"] == ["Keep it small"]
    assert "Ignore" not in classification.SYSTEM_INSTRUCTION


def test_a_valid_reply_is_used_as_is():
    calls = Calls([{"team_id": "t2", "priority": "high", "rationale": "  Infra work.  "}])
    assert classification._ask(calls, "p", {}, {"t1", "t2"}) == ("t2", "high", "Infra work.")
    assert calls.prompts[0][1]["system_instruction"] == classification.SYSTEM_INSTRUCTION


def test_an_invalid_reply_is_retried_once():
    calls = Calls([{"team_id": "other-org-team", "priority": "high", "rationale": "x"},
                   {"team_id": "t1", "priority": "low", "rationale": "Growth owns onboarding."}])
    assert classification._ask(calls, "p", {}, {"t1", "t2"})[0] == "t1" and len(calls.prompts) == 2


@pytest.mark.parametrize("bad", [
    {"team_id": "t1", "priority": "urgent", "rationale": "x"},
    {"team_id": "t1", "priority": "low", "rationale": ""},
    {"team_id": "t1", "priority": "low", "rationale": "x" * 501},
    {"team_id": "nope", "priority": "low", "rationale": "x"},
    "not an object",
])
def test_two_invalid_replies_fail_instead_of_an_empty_suggestion(bad):
    calls = Calls([bad, bad])
    with pytest.raises(AIError) as info:
        classification._ask(calls, "p", {}, {"t1", "t2"})
    assert info.value.code == "ai_invalid_output" and len(calls.prompts) == 2

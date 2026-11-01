"""Tests for the complete-generation profile (app/backend/ai/generation_output.py).

Run from app/backend: python -m pytest tests/test_generation_output.py
"""

import copy
import json
from pathlib import Path

import pytest

from ai.generation_output import validate_generated_document

FIXTURES = Path(__file__).resolve().parent.parent.parent / "shared" / "fixtures" / "prd_document"
VALID = sorted((FIXTURES / "valid").glob("*.json"))


def load(name):
    return json.loads((FIXTURES / "valid" / f"{name}.json").read_text(encoding="utf-8"))["document"]


def codes(errors):
    return [{"code": error.code, "path": error.path} for error in errors]


@pytest.mark.parametrize("path", VALID, ids=lambda path: path.stem)
def test_fixture_generation_errors(path):
    fixture = json.loads(path.read_text(encoding="utf-8"))
    assert codes(validate_generated_document(fixture["document"])) == fixture["expect"]["generation_errors"]


def test_a_complete_draft_passes():
    assert validate_generated_document(load("full_generated_draft")) == []


def test_missing_sections_are_named():
    errors = validate_generated_document(load("ordered_subset"))
    named = [error.message.split(" the ")[1].split(" section")[0] for error in errors]
    assert named == ["problem", "non_goals", "target_users", "user_stories", "requirements", "success_metrics"]


def test_structural_errors_come_first_and_alone():
    document = load("full_generated_draft")
    document["content"][0], document["content"][1] = document["content"][1], document["content"][0]
    document["content"][2]["content"][0]["content"][0]["content"][0]["content"][0]["marks"] = [
        {"type": "ai_generated", "attrs": {"generation_record_id": "3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01"}}]
    assert codes(validate_generated_document(document)) == [{"code": "section_order", "path": "/content/1"}]


def test_whitespace_only_section_counts_as_empty():
    document = load("full_generated_draft")
    document["content"][3]["content"] = [{"type": "paragraph", "content": [{"type": "text", "text": "  "}]}]
    assert codes(validate_generated_document(document)) == [{"code": "empty_section", "path": "/content/3"}]


@pytest.mark.parametrize("heading, flagged", [
    ("Goals", True), ("  goals ", True), ("GOALS", True), ("Goals and outcomes", False), ("Targets", False),
])
def test_leading_label_heading(heading, flagged):
    document = load("full_generated_draft")
    goals = document["content"][1]
    goals["content"].insert(0, {"type": "heading", "attrs": {"level": 3},
                                "content": [{"type": "text", "text": heading}]})
    expected = [{"code": "duplicate_section_heading", "path": "/content/1/content/0"}] if flagged else []
    assert codes(validate_generated_document(document)) == expected


def test_a_repeated_label_later_in_the_section_is_allowed():
    document = load("full_generated_draft")
    document["content"][1]["content"].append(
        {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "Goals"}]})
    assert validate_generated_document(document) == []


def test_generation_check_never_changes_its_input():
    document = load("generation_rejects_ai_mark")
    before = copy.deepcopy(document)
    validate_generated_document(document)
    assert document == before


def test_model_output_cannot_add_assumption_marks():
    document = load("full_generated_draft")
    text = document["content"][0]["content"][0]["content"][0]
    text["marks"] = [{"type": "assumption"}]
    errors = validate_generated_document(document)
    assert codes(errors) == [{"code": "assumption_mark_not_allowed", "path": "/content/0/content/0/content/0/marks/0"}]


def test_a_doc_without_content_is_missing_every_section():
    # Same result as content: [] (no KeyError): all nine sections are missing.
    errors = validate_generated_document({"type": "doc"})
    assert [e.code for e in errors] == ["missing_section"] * 9

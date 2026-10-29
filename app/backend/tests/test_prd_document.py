"""Tests for the shared PRD document spec, validator and text extraction.

Run from app/backend: python -m pytest tests/test_prd_document.py
"""

import ast
import copy
import json
from pathlib import Path

import pytest

import prd_document
from prd_document import (
    InvalidDocument,
    derive_content_text,
    load_spec,
    section_types,
    validate_document,
    validate_title,
)

BACKEND = Path(__file__).resolve().parent.parent
FIXTURES = BACKEND.parent / "shared" / "fixtures" / "prd_document"
VALID = sorted((FIXTURES / "valid").glob("*.json"))
INVALID = sorted((FIXTURES / "invalid").glob("*.json"))
ALL = VALID + INVALID

DOCUMENT_CODES = {
    "invalid_type", "legacy_format_v1", "too_large", "invalid_root", "unknown_node", "node_not_allowed",
    "too_deep", "unknown_key", "missing_content", "unknown_attr", "missing_attr", "invalid_attr",
    "empty_text", "marks_not_allowed", "unknown_mark", "mark_disabled", "duplicate_mark",
    "duplicate_section", "section_order", "too_many_errors",
}
# Covered by the generated documents below rather than by fixture files.
CODES_TESTED_IN_CODE = {"too_large", "too_deep", "too_many_errors"}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def codes(errors):
    return [{"code": error.code, "path": error.path} for error in errors]


def doc(*blocks, section="problem"):
    return {"type": "doc", "content": [{"type": "section", "attrs": {"type": section}, "content": list(blocks)}]}


def paragraph(text, *marks):
    node = {"type": "text", "text": text}
    if marks:
        node["marks"] = list(marks)
    return {"type": "paragraph", "content": [node]}


def link(href, **attrs):
    return {"type": "link", "attrs": {"href": href, **attrs}}


# --- fixtures ---------------------------------------------------------------


def test_fixture_files_exist_and_are_well_formed():
    assert len(VALID) >= 8 and len(INVALID) >= 30
    for path in ALL:
        fixture = load(path)
        assert fixture["description"], path.name
        assert set(fixture) <= {"description", "relies_on", "document", "expect"}, path.name
        if path in VALID:
            assert fixture["expect"]["document_errors"] == [], path.name
            assert "content_text" in fixture["expect"] and "generation_errors" in fixture["expect"], path.name
        else:
            assert fixture["expect"]["document_errors"], path.name


@pytest.mark.parametrize("path", ALL, ids=lambda path: f"{path.parent.name}/{path.stem}")
def test_fixture_document_errors(path):
    fixture = load(path)
    assert codes(validate_document(fixture["document"])) == fixture["expect"]["document_errors"]


@pytest.mark.parametrize("path", VALID, ids=lambda path: path.stem)
def test_fixture_content_text(path):
    fixture = load(path)
    assert derive_content_text(fixture["document"]) == fixture["expect"]["content_text"]


def test_every_document_error_code_has_a_fixture():
    used = {error["code"] for path in INVALID for error in load(path)["expect"]["document_errors"]}
    assert used <= DOCUMENT_CODES
    assert DOCUMENT_CODES - CODES_TESTED_IN_CODE <= used


def test_empty_draft_is_valid_and_has_empty_text():
    empty = {"type": "doc", "content": []}
    assert validate_document(empty) == []
    assert derive_content_text(empty) == ""


@pytest.mark.parametrize("path", ALL, ids=lambda path: f"{path.parent.name}/{path.stem}")
def test_validation_never_changes_its_input(path):
    document = load(path)["document"]
    before = copy.deepcopy(document)
    validate_document(document)
    assert document == before


# --- spec -------------------------------------------------------------------


def test_spec_is_internally_consistent():
    spec = load_spec()
    statuses = {"agreed", "proposed", "reserved"}
    kinds = {"section_type", "integer", "enum", "uuid", "href", "colwidth"}
    for name, node in spec["nodes"].items():
        assert node["status"] in statuses, name
        for child in node.get("content", []):
            assert child in spec["nodes"], f"{name} allows undefined node {child}"
        if node.get("first_child"):
            assert node["first_child"] in node["content"]
        for attr in node.get("attrs", {}).values():
            assert attr["kind"] in kinds and attr["status"] in statuses
    for name, mark in spec["marks"].items():
        assert mark["status"] in statuses and isinstance(mark["enabled"], bool), name
        for attr in mark["attrs"].values():
            assert attr["kind"] in kinds and attr["status"] in statuses
    assert spec["doc_schema_version"] == 2
    assert spec["nodes"]["doc"]["min_content"] == 0


def test_disabled_marks_are_the_reserved_citation_and_the_unagreed_assumption():
    marks = load_spec()["marks"]
    assert {name for name, mark in marks.items() if not mark["enabled"]} == {"citation", "assumption"}
    assert marks["ai_generated"]["inclusive"] is False
    assert marks["ai_generated"]["attrs"]["generation_record_id"]["required"] is True


def test_section_types_match_the_seed_data():
    # The demo seed is the backend's other copy of the nine types; keep them in step.
    tree = ast.parse((BACKEND / "seed_demo.py").read_text(encoding="utf-8"))
    titles = next(ast.literal_eval(node.value) for node in tree.body
                  if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "SECTION_TITLES")
    spec_values = load_spec()["section_types"]["values"]
    assert [(entry["type"], entry["title"]) for entry in spec_values] == list(titles.items())
    assert section_types() == list(titles)


# --- limits -----------------------------------------------------------------


def test_size_limit_is_inclusive_and_measured_in_utf8_bytes():
    limit = load_spec()["limits"]["max_document_bytes"]["value"]
    base = doc(paragraph("x"))
    overhead = len(json.dumps(base, separators=(",", ":")).encode()) - 1
    # "é" is two bytes in UTF-8, so a character count alone would be wrong.
    text = "é" * ((limit - overhead) // 2) + "x" * ((limit - overhead) % 2)
    at_limit = doc(paragraph(text))
    assert validate_document(at_limit) == []
    over = doc(paragraph(text + "x"))
    assert codes(validate_document(over)) == [{"code": "too_large", "path": ""}]


def test_deep_nesting_is_rejected():
    item = {"type": "listItem", "content": [paragraph("leaf")]}
    for _ in range(20):
        item = {"type": "listItem", "content": [paragraph("x"), {"type": "bulletList", "content": [item]}]}
    errors = validate_document(doc({"type": "bulletList", "content": [item]}))
    # Every node at the first level past the limit is reported (here a list
    # item's paragraph and its nested list), and nothing below it.
    assert errors and {error.code for error in errors} == {"too_deep"}
    assert {error.path.count("/content/") for error in errors} == {32}


def test_error_collection_stops_at_the_cap():
    limit = load_spec()["limits"]["max_errors"]["value"]
    errors = validate_document(doc(*[paragraph("") for _ in range(limit * 2)]))
    assert len(errors) == limit
    assert errors[-1].code == "too_many_errors"
    assert {error.code for error in errors[:-1]} == {"empty_text"}


def test_non_json_values_are_rejected():
    document = doc({"type": "heading", "attrs": {"level": float("nan")}, "content": []})
    assert codes(validate_document(document)) == [{"code": "invalid_type", "path": ""}]


# --- attributes -------------------------------------------------------------


@pytest.mark.parametrize("href", [
    "http://example.com", "https://example.com/a?b=c#d", "HTTPS://EXAMPLE.COM", "mailto:pm@example.com",
    "https://example.com:8443/path",
])
def test_allowed_links(href):
    assert validate_document(doc(paragraph("x", link(href)))) == []


@pytest.mark.parametrize("href", [
    "", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hi", "ftp://example.com", "/relative",
    "//example.com", "example.com", "http://", "https:///path", "mailto:", "https://exa mple.com",
    "https://example.com/\nnext", "http:\\\\example.com", "https://" + "a" * 2050 + ".com", 42,
])
def test_rejected_links(href):
    errors = validate_document(doc(paragraph("x", link(href))))
    assert codes(errors) == [{"code": "invalid_attr", "path": "/content/0/content/0/content/0/marks/0/attrs/href"}]


@pytest.mark.parametrize("value, ok", [
    ("3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01", True),
    ("3F2C9A1E-8B4D-4C6A-9E2F-1A7B5C3D9E01", False),
    ("{3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01}", False),
    ("3f2c9a1e8b4d4c6a9e2f1a7b5c3d9e01", False),
    ("urn:uuid:3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01", False),
    ("not-a-uuid", False),
    (12345, False),
])
def test_generation_record_id_shape(value, ok):
    mark = {"type": "ai_generated", "attrs": {"generation_record_id": value}}
    assert (validate_document(doc(paragraph("x", mark))) == []) is ok


@pytest.mark.parametrize("attrs, ok", [
    ({"colspan": 2, "rowspan": 1, "colwidth": [100, 120]}, True),
    ({"colspan": 1, "rowspan": 1, "colwidth": None}, True),
    ({}, True),
    ({"colspan": 0}, False),
    ({"colspan": "2"}, False),
    ({"colwidth": [0]}, False),
    ({"colwidth": "wide"}, False),
    ({"background": "red"}, False),
])
def test_table_cell_attributes(attrs, ok):
    table = {"type": "table", "content": [{"type": "tableRow", "content": [
        {"type": "tableCell", "attrs": attrs, "content": [paragraph("x")]}]}]}
    assert (validate_document(doc(table)) == []) is ok


def test_ordered_list_start_must_be_a_positive_whole_number():
    def ordered(start):
        return doc({"type": "orderedList", "attrs": {"start": start},
                    "content": [{"type": "listItem", "content": [paragraph("x")]}]})
    assert validate_document(ordered(5)) == []
    assert [error.code for error in validate_document(ordered(0))] == ["invalid_attr"]
    assert [error.code for error in validate_document(ordered(1.5))] == ["invalid_attr"]


# --- title and text ---------------------------------------------------------


@pytest.mark.parametrize("title, expected", [
    ("Checkout redesign", []),
    ("x" * 200, []),
    ("x" * 201, ["title_too_long"]),
    ("   ", ["title_required"]),
    ("", ["title_required"]),
    (None, ["invalid_type"]),
])
def test_validate_title(title, expected):
    assert [error.code for error in validate_title(title)] == expected


def test_derive_content_text_refuses_invalid_documents():
    with pytest.raises(InvalidDocument) as raised:
        derive_content_text(load(FIXTURES / "invalid" / "several_errors.json")["document"])
    assert [error.code for error in raised.value.errors] == ["invalid_attr", "empty_text", "invalid_attr"]


def test_content_text_keeps_paragraph_boundaries():
    # The v1 helper joined paragraphs with no separator ("Faster checkoutMore orders").
    document = doc(paragraph("Faster checkout"), paragraph("More orders"))
    assert derive_content_text(document) == "Problem Statement\nFaster checkout\nMore orders"


def test_messages_do_not_echo_long_values():
    long_type = "x" * 500
    errors = validate_document(doc({"type": long_type}))
    assert errors[0].code == "unknown_node" and long_type not in errors[0].message
    assert errors[0].to_dict() == {"code": errors[0].code, "path": errors[0].path, "message": errors[0].message}


def test_spec_path_points_at_the_shared_file():
    assert prd_document.SPEC_PATH == BACKEND.parent / "shared" / "prd_document_schema.v2.json"


def test_command_line_check(tmp_path, capsys):
    good = tmp_path / "good.json"
    good.write_text(json.dumps(doc(paragraph("Hello"))), encoding="utf-8")
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(doc(paragraph(""))), encoding="utf-8")
    assert prd_document.main([str(good)]) == 0
    assert "valid" in capsys.readouterr().out
    assert prd_document.main([str(good), str(bad)]) == 1
    assert "empty_text at /content/0/content/0/content/0/text" in capsys.readouterr().out
    assert prd_document.main([str(FIXTURES / "valid" / "marks.json")]) == 0
    assert prd_document.main([]) == 2

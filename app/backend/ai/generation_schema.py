"""The JSON schemas Gemini is asked to reply in.

RESPONSE_SCHEMA is initial generation's (ai/generation.py); the node
schemas are shared with section edits and review suggestions. Each reply
is still checked against the full shared document rules.
"""

from __future__ import annotations

from prd_document import load_spec, section_types


def text_node_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["text"]},
            "text": {"type": "string", "minLength": 1},
            "marks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"type": {"type": "string", "enum": ["bold", "italic"]}},
                    "required": ["type"],
                },
            },
        },
        "required": ["type", "text"],
    }


def paragraph_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["paragraph"]},
            "content": {"type": "array", "items": text_node_schema(), "minItems": 1},
        },
        "required": ["type", "content"],
    }


def heading_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["heading"]},
            "attrs": {
                "type": "object",
                "properties": {"level": {"type": "integer", "enum": [2, 3]}},
                "required": ["level"],
            },
            "content": {"type": "array", "items": text_node_schema(), "minItems": 1},
        },
        "required": ["type", "attrs", "content"],
    }


def list_schema(list_type: str) -> dict:
    item = {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["listItem"]},
            "content": {"type": "array", "items": paragraph_schema(), "minItems": 1},
        },
        "required": ["type", "content"],
    }
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": [list_type]},
            "content": {"type": "array", "items": item, "minItems": 1},
        },
        "required": ["type", "content"],
    }


def _response_schema() -> dict:
    """What Gemini is asked to return.

    A deliberately small subset of the shared spec (no tables, quotes, links
    or nested lists) that is enough for a first draft. It only guides the
    model: every reply is still checked against the full shared rules.
    Written out without $ref so it doesn't depend on recursive-schema
    support.
    """
    section = {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": ["section"]},
            "attrs": {
                "type": "object",
                "properties": {"type": {"type": "string", "enum": section_types()}},
                "required": ["type"],
            },
            "content": {
                "type": "array",
                "items": {"anyOf": [paragraph_schema(), heading_schema(), list_schema("bulletList"),
                                    list_schema("orderedList")]},
                "minItems": 1,
            },
        },
        "required": ["type", "attrs", "content"],
    }
    limits = load_spec()["limits"]
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string", "minLength": 1, "maxLength": limits["max_title_chars"]["value"]},
            "description": {"type": "string", "maxLength": limits["max_description_chars"]["value"]},
            "document": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["doc"]},
                    "content": {"type": "array", "items": section,
                                "minItems": len(section_types()), "maxItems": len(section_types())},
                },
                "required": ["type", "content"],
            },
        },
        "required": ["title", "description", "document"],
    }


RESPONSE_SCHEMA = _response_schema()

"""The shared PRD document spec and the error types of prd_document.py.

The rules come from app/shared/prd_document_schema.v2.json. Import these
through prd_document, the public API.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

SPEC_PATH = Path(__file__).resolve().parent.parent / "shared" / "prd_document_schema.v2.json"


@dataclass(frozen=True)
class DocumentError:
    """One problem, with a stable code and a JSON Pointer to where it is."""

    code: str
    path: str
    message: str

    def to_dict(self) -> dict:
        return {"code": self.code, "path": self.path, "message": self.message}


class InvalidDocument(ValueError):
    def __init__(self, errors: list[DocumentError]):
        self.errors = errors
        super().__init__(f"Invalid PRD document ({len(errors)} error(s))")


@lru_cache(maxsize=1)
def load_spec() -> dict:
    with SPEC_PATH.open(encoding="utf-8") as spec_file:
        return json.load(spec_file)


def limit(name: str) -> int:
    return load_spec()["limits"][name]["value"]


def section_types() -> list[str]:
    """The nine section types, in standard order."""
    return [entry["type"] for entry in load_spec()["section_types"]["values"]]


def section_title(section_type: str) -> str:
    for entry in load_spec()["section_types"]["values"]:
        if entry["type"] == section_type:
            return entry["title"]
    raise KeyError(section_type)


def section_type_of(node):
    if isinstance(node, dict) and node.get("type") == "section" and isinstance(node.get("attrs"), dict):
        section_type = node["attrs"].get("type")
        return section_type if isinstance(section_type, str) else None
    return None

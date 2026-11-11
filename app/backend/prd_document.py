"""Structural validator and text extraction for PRD documents.

Documents are Tiptap/ProseMirror JSON (doc_schema_version 2). The rules come
from the shared spec, app/shared/prd_document_schema.v2.json; the format is
described in docs/prd-document-format.md.

Scope (S03, first package):
- Structure only. Whether an ai_generated mark's generation_record_id names a
  successful generation record for the same PRD needs the database and is
  checked when this is wired into saves.
- Invalid input is reported, never repaired. Nothing here mutates its input.
- Not used by any route yet, so current saves are unaffected.

Extra checks for complete AI generation output live in
ai/generation_output.py, per the app/backend/ai/ convention.

This module is the public API and the command-line checker. The spec and
error types are in prd_document_spec.py, the structural checks in
prd_document_checker.py and the text helpers in prd_document_text.py.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

if __name__ == "__main__":
    # The frontend's tests run this file with python3 -I, which leaves its
    # folder off the import path; the modules below live next to it.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from prd_document_checker import Checker, TooManyErrors
from prd_document_spec import (SPEC_PATH, DocumentError, InvalidDocument, limit as _limit, load_spec, section_title,
                               section_type_of, section_types)
from prd_document_text import block_lines, iter_marks, plain_text

# Re-exported: callers import all of these from prd_document.
__all__ = [
    "SPEC_PATH", "DocumentError", "InvalidDocument", "derive_content_text", "iter_marks", "load_spec", "main",
    "plain_text", "section_title", "section_type_of", "section_types", "validate_document", "validate_title",
]


def validate_document(document) -> list[DocumentError]:
    """Checks a saved document against the shared spec. Empty list = valid."""
    checker = Checker()
    try:
        checker.check_root(document)
    except TooManyErrors:
        pass
    return checker.errors


def validate_title(title) -> list[DocumentError]:
    """PRD title rules (a column, not part of the document)."""
    if not isinstance(title, str):
        return [DocumentError("invalid_type", "", "The title must be a string.")]
    if not title.strip():
        return [DocumentError("title_required", "", "The title can't be blank.")]
    if len(title) > _limit("max_title_chars"):
        return [DocumentError("title_too_long", "",
                              f"The title is longer than {_limit('max_title_chars')} characters.")]
    return []


def derive_content_text(document) -> str:
    """Plain text for search and AI context, derived on the server.

    Raises InvalidDocument if the document fails validate_document.
    """
    errors = validate_document(document)
    if errors:
        raise InvalidDocument(errors)
    parts = []
    # Like the validator, a missing "content" is an empty document: TipTap's
    # getJSON() leaves it out of an empty doc.
    for section in document.get("content", []):
        lines = [section_title(section["attrs"]["type"])]
        for block in section["content"]:
            lines.extend(block_lines(block))
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def main(argv=None) -> int:
    """Checks JSON files from the command line, for editor round-trip tests:
    python prd_document.py editor-output.json [more.json ...]"""
    paths = sys.argv[1:] if argv is None else argv
    if not paths:
        print("usage: python prd_document.py FILE.json [FILE.json ...]")
        return 2
    failed = False
    for path in paths:
        try:
            document = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            print(f"{path}: cannot read JSON ({error.__class__.__name__})")
            failed = True
            continue
        if isinstance(document, dict) and set(document) >= {"document", "expect"}:
            document = document["document"]  # a fixture file
        errors = validate_document(document)
        if errors:
            failed = True
            print(f"{path}: {len(errors)} error(s)")
            for error in errors:
                print(f"  {error.code} at {error.path or '/'}: {error.message}")
        else:
            print(f"{path}: valid\n--- content_text ---\n{derive_content_text(document)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

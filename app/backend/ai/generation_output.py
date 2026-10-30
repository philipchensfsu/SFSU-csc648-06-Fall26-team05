"""Checks for complete initial-generation output (A01/A03).

A generated document must pass every saved-document rule in prd_document.py
and also the stricter rules in the shared spec's "generation" block:

- all nine sections, in standard order;
- no ai_generated marks: the model cannot set provenance, so the backend adds
  the mark only after validation;
- text in every section (proposed);
- no leading heading that repeats a section's derived label.

Review readiness is a separate, later check. Not wired into any route yet.
"""

from __future__ import annotations

from prd_document import (
    DocumentError,
    iter_marks,
    load_spec,
    plain_text,
    section_title,
    section_type_of,
    section_types,
    validate_document,
)


def validate_generated_document(document) -> list[DocumentError]:
    """Returns the document's structural errors alone if it has any;
    otherwise the generation errors. Empty list = acceptable output."""
    errors = validate_document(document)
    if errors:
        return errors
    generation = load_spec()["generation"]
    sections = document["content"]
    present = {section_type_of(section) for section in sections}
    for section_type in section_types():
        if section_type not in present:
            errors.append(DocumentError("missing_section", "/content",
                                        f"Generated output needs the {section_type} section."))
    forbidden = set(generation["forbid_marks"]["values"])
    for index, section in enumerate(sections):
        path = f"/content/{index}"
        for mark_path, mark_type in iter_marks(section, path):
            if mark_type in forbidden:
                errors.append(DocumentError("provenance_mark_not_allowed", mark_path,
                                            f"Generated output must not contain the {mark_type} mark."))
        if not plain_text(section).strip():
            errors.append(DocumentError("empty_section", path,
                                        f"The generated {section_type_of(section)} section has no text."))
        first = section["content"][0]
        title = section_title(section_type_of(section))
        if first["type"] == "heading" and plain_text(first).strip().casefold() == title.casefold():
            errors.append(DocumentError("duplicate_section_heading", f"{path}/content/0",
                                        f"The section starts with a heading repeating its label, {title!r}."))
    return errors

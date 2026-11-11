"""The structural checks behind prd_document.validate_document.

Each rule comes from the shared spec (prd_document_spec.py). Problems are
collected as DocumentErrors, up to the spec's max_errors.
"""

from __future__ import annotations

import json
import uuid
from urllib.parse import urlsplit

from prd_document_spec import DocumentError, limit as _limit, load_spec, section_type_of, section_types

TEXT_KEYS = {"type", "text", "marks"}
NODE_KEYS = {"type", "attrs", "content"}
MARK_KEYS = {"type", "attrs"}


def _show(value) -> str:
    # Messages name the offending type or attribute but never echo long
    # user-supplied values.
    text = repr(value)
    return text if len(text) <= 40 else text[:37] + "..."


class TooManyErrors(Exception):
    pass


class Checker:
    def __init__(self):
        self.spec = load_spec()
        self.errors: list[DocumentError] = []
        self.max_errors = _limit("max_errors")

    def add(self, code: str, path: str, message: str) -> None:
        if len(self.errors) == self.max_errors - 1:
            self.errors.append(DocumentError(
                "too_many_errors", "", f"Stopped after {self.max_errors - 1} errors."))
            raise TooManyErrors
        self.errors.append(DocumentError(code, path, message))

    # --- nodes ------------------------------------------------------------

    def check_root(self, document) -> None:
        if not isinstance(document, dict):
            self.add("invalid_type", "", "The document must be a JSON object.")
            return
        if "type" not in document and "sections" in document:
            self.add("legacy_format_v1", "",
                     "This is the old {sections: [...]} format (version 1), not a version 2 document.")
            return
        try:
            encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError):
            self.add("invalid_type", "", "The document must contain only JSON values.")
            return
        try:
            size = len(encoded.encode("utf-8"))
        except UnicodeEncodeError:
            # A lone surrogate such as "\ud800": valid JSON that json.loads
            # accepts, but not storable text (Postgres jsonb rejects it too).
            self.add("invalid_type", "", "The document contains text that isn't valid Unicode.")
            return
        if size > _limit("max_document_bytes"):
            self.add("too_large", "",
                     f"The document is {size} bytes; the limit is {_limit('max_document_bytes')}.")
            return
        if document.get("type") != "doc":
            self.add("invalid_root", "/type", "The root node must be a doc node.")
            return
        self.check_node(document, "", allowed=None, parent=None, depth=1)
        self.check_sections(document)

    def check_node(self, node, path: str, allowed, parent, depth: int) -> None:
        if not isinstance(node, dict):
            self.add("invalid_type", path, "Each node must be a JSON object.")
            return
        node_type = node.get("type")
        if not isinstance(node_type, str):
            self.add("invalid_type", f"{path}/type", "Each node needs a string type.")
            return
        node_spec = self.spec["nodes"].get(node_type)
        if node_spec is None:
            self.add("unknown_node", f"{path}/type", f"Unknown node type {_show(node_type)}.")
            return
        if allowed is not None and node_type not in allowed:
            self.add("node_not_allowed", path, f"A {node_type} node is not allowed inside {parent}.")
            return
        if depth > _limit("max_depth"):
            self.add("too_deep", path, f"Nodes are nested more than {_limit('max_depth')} levels deep.")
            return
        if node_spec.get("text"):
            self.check_text(node, path)
            return

        for key in node:
            if key == "marks":
                self.add("marks_not_allowed", f"{path}/marks", f"Only text can carry marks, not {node_type}.")
            elif key not in NODE_KEYS:
                self.add("unknown_key", f"{path}/{key}", f"A {node_type} node has no {_show(key)} field.")
        self.check_attrs(node.get("attrs"), node_spec["attrs"], f"{path}/attrs", node_type, "attrs" in node)

        if "content" not in node:
            children = []
        elif isinstance(node["content"], list):
            children = node["content"]
        else:
            self.add("invalid_type", f"{path}/content", "content must be a list.")
            return
        if len(children) < node_spec["min_content"]:
            self.add("missing_content", f"{path}/content" if "content" in node else path,
                     f"A {node_type} node needs at least {node_spec['min_content']} child node(s).")
        first_child = node_spec.get("first_child")
        if first_child and children and isinstance(children[0], dict) \
                and children[0].get("type") != first_child \
                and children[0].get("type") in node_spec["content"]:
            self.add("node_not_allowed", f"{path}/content/0", f"A {node_type} must start with a {first_child}.")
        for index, child in enumerate(children):
            self.check_node(child, f"{path}/content/{index}", node_spec["content"], node_type, depth + 1)

    def check_text(self, node: dict, path: str) -> None:
        for key in node:
            if key not in TEXT_KEYS:
                self.add("unknown_key", f"{path}/{key}", f"A text node has no {_show(key)} field.")
        text = node.get("text")
        if text is None or text == "":
            self.add("empty_text", f"{path}/text", "Text nodes must contain at least one character.")
        elif not isinstance(text, str):
            self.add("invalid_type", f"{path}/text", "text must be a string.")
        if "marks" not in node:
            return
        marks = node["marks"]
        if not isinstance(marks, list):
            self.add("invalid_type", f"{path}/marks", "marks must be a list.")
            return
        seen = set()
        for index, mark in enumerate(marks):
            mark_type = self.check_mark(mark, f"{path}/marks/{index}")
            if mark_type is None:
                continue
            if mark_type in seen:
                self.add("duplicate_mark", f"{path}/marks/{index}", f"The {mark_type} mark appears twice on one text node.")
            seen.add(mark_type)

    def check_mark(self, mark, path: str):
        if not isinstance(mark, dict):
            self.add("invalid_type", path, "Each mark must be a JSON object.")
            return None
        mark_type = mark.get("type")
        if not isinstance(mark_type, str):
            self.add("invalid_type", f"{path}/type", "Each mark needs a string type.")
            return None
        mark_spec = self.spec["marks"].get(mark_type)
        if mark_spec is None:
            self.add("unknown_mark", f"{path}/type", f"Unknown mark type {_show(mark_type)}.")
            return None
        if not mark_spec["enabled"]:
            reason = "reserved" if mark_spec["status"] == "reserved" else "proposed and not agreed yet"
            self.add("mark_disabled", f"{path}/type", f"The {mark_type} mark is {reason}, so it is not accepted.")
            return mark_type
        for key in mark:
            if key not in MARK_KEYS:
                self.add("unknown_key", f"{path}/{key}", f"A mark has no {_show(key)} field.")
        self.check_attrs(mark.get("attrs"), mark_spec["attrs"], f"{path}/attrs", mark_type, "attrs" in mark)
        return mark_type

    # --- attributes -------------------------------------------------------

    def check_attrs(self, attrs, attr_specs: dict, path: str, owner: str, present: bool) -> None:
        if not present or attrs is None:
            attrs = {}
        elif not isinstance(attrs, dict):
            self.add("invalid_type", path, "attrs must be a JSON object.")
            return
        for name in attrs:
            if name not in attr_specs:
                self.add("unknown_attr", f"{path}/{name}", f"{owner} has no attribute {_show(name)}.")
        for name, attr_spec in attr_specs.items():
            value = attrs.get(name)
            if value is None:
                # Optional attributes may be absent or null (Tiptap writes
                # defaults such as colwidth: null and target: null).
                if attr_spec["required"]:
                    self.add("missing_attr", f"{path}/{name}", f"{owner} needs a {name} attribute.")
                continue
            problem = self.attr_problem(value, attr_spec)
            if problem:
                self.add("invalid_attr", f"{path}/{name}", f"{owner}.{name} {problem}.")

    def attr_problem(self, value, attr_spec: dict):
        kind = attr_spec["kind"]
        if kind == "section_type":
            if value not in section_types() or not isinstance(value, str):
                return "must be one of: " + ", ".join(section_types())
        elif kind == "integer":
            # bool is a subclass of int in Python, so check the exact type.
            if type(value) is not int or not attr_spec["min"] <= value <= attr_spec["max"]:
                return f"must be a whole number from {attr_spec['min']} to {attr_spec['max']}"
        elif kind == "enum":
            if not any(type(value) is type(option) and value == option for option in attr_spec["values"]):
                return "must be one of: " + ", ".join(json.dumps(option) for option in attr_spec["values"])
        elif kind == "uuid":
            if not _is_canonical_uuid(value):
                return "must be a UUID in lowercase hyphenated form"
        elif kind == "href":
            if not _is_allowed_href(value, attr_spec["schemes"]):
                return "must be an absolute " + ", ".join(attr_spec["schemes"]) + " link"
        elif kind == "colwidth":
            max_items = attr_spec.get("max_items", 100)
            if not isinstance(value, list) or not 1 <= len(value) <= max_items \
                    or any(type(width) is not int or not 1 <= width <= 10000 for width in value):
                if max_items == 1:
                    return "must be null or a list with one whole-number width"
                return "must be null or a list of whole-number widths"
        else:
            raise ValueError(f"Spec uses an unknown attribute kind: {kind}")
        return None

    # --- document-level rules --------------------------------------------

    def check_sections(self, document: dict) -> None:
        children = document.get("content")
        if not isinstance(children, list):
            return
        rules = self.spec["rules"]
        order = {section_type: rank for rank, section_type in enumerate(section_types())}
        seen = set()
        last_rank = -1
        for index, child in enumerate(children):
            section_type = section_type_of(child)
            if section_type not in order:
                continue
            if section_type in seen:
                if rules["unique_section_types"]["enforced"]:
                    self.add("duplicate_section", f"/content/{index}/attrs/type",
                             f"The {section_type} section appears more than once.")
                continue
            seen.add(section_type)
            if rules["standard_section_order"]["enforced"] and order[section_type] < last_rank:
                self.add("section_order", f"/content/{index}",
                         f"The {section_type} section is out of the standard order.")
            last_rank = max(last_rank, order[section_type])


def _is_canonical_uuid(value) -> bool:
    if not isinstance(value, str) or len(value) != 36:
        return False
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


def _is_allowed_href(value, schemes: list[str]) -> bool:
    if not isinstance(value, str) or not value or len(value) > _limit("max_link_href_chars"):
        return False
    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 or char == "\\" for char in value):
        return False
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    if parts.scheme not in schemes:
        return False
    if parts.scheme == "mailto":
        return bool(parts.path)
    return bool(parts.hostname)

"""Plain text from a valid PRD document, for content_text and ai/.

Callers must pass a document that passed validate_document.
"""

from __future__ import annotations


def plain_text(node: dict) -> str:
    if node["type"] == "text":
        return node["text"]
    if node["type"] == "hardBreak":
        return "\n"
    return "".join(plain_text(child) for child in node.get("content", []))


def iter_marks(node: dict, path: str):
    if node["type"] == "text":
        for index, mark in enumerate(node.get("marks", [])):
            yield f"{path}/marks/{index}", mark["type"]
        return
    for index, child in enumerate(node.get("content", [])):
        yield from iter_marks(child, f"{path}/content/{index}")


def block_lines(node: dict) -> list[str]:
    node_type = node["type"]
    if node_type in ("paragraph", "heading"):
        text = plain_text(node)
        return [text] if text.strip() else []
    if node_type == "bulletList":
        return [line for item in node["content"] for line in _item_lines(item, "- ")]
    if node_type == "orderedList":
        start = (node.get("attrs") or {}).get("start") or 1
        return [line for number, item in enumerate(node["content"], start)
                for line in _item_lines(item, f"{number}. ")]
    if node_type == "blockquote":
        return ["> " + line for child in node["content"] for line in block_lines(child)]
    if node_type == "table":
        rows = []
        for row in node["content"]:
            # Escape "|" so a cell containing "a | b" doesn't read as two cells.
            cells = [" ".join(line for block in cell["content"] for line in block_lines(block)).replace("|", "\\|")
                     for cell in row["content"]]
            if any(cell.strip() for cell in cells):
                rows.append(" | ".join(cells))
        return rows
    raise ValueError(f"Unexpected block node: {node_type}")


def _item_lines(item: dict, marker: str) -> list[str]:
    first, *rest = item["content"]
    lines = [(marker + plain_text(first)).rstrip()]
    for child in rest:
        lines.extend("  " + line for line in block_lines(child))
    return lines

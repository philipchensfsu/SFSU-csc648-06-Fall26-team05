// Comparing a saved PRD document with an AI proposal for it (v2 JSON, doc >
// section*), section by section, as plain text with word-level changes.
//
// Display only. Nothing here goes into a saved document: the highlights are
// not ai_generated marks, and the proposal is accepted exactly as the server
// sent it. Formatting-only differences (bold, a list becoming a paragraph
// with the same words) aren't highlighted; such a section is reported as
// "format" so the view can say its formatting changed.
import { SECTION_TYPES } from "./schema";

const ORDER = SECTION_TYPES.map(([type]) => type);
const LABELS = Object.fromEntries(SECTION_TYPES);

// Above this many token pairs the word diff gives up on the middle of a
// section and shows it as replaced whole, so a huge table can't stall the
// page. Common starts and ends are trimmed first, which covers most edits.
const MAX_DIFF_CELLS = 4_000_000;

// --- text ----------------------------------------------------------------

function inlineText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

// One line per block. Lists keep their bullets or numbers, nested items are
// indented, quotes get "> " and table rows join their cells with " | ".
function blockLines(node, indent = "") {
  switch (node?.type) {
    case "paragraph":
    case "heading":
      return inlineText(node)
        .split("\n")
        .map((line) => indent + line);
    case "bulletList":
    case "orderedList": {
      const start = node.type === "orderedList" ? (node.attrs?.start ?? 1) : null;
      return (node.content ?? []).flatMap((item, index) => {
        const bullet = start === null ? "- " : `${start + index}. `;
        const [first, ...rest] = (item.content ?? []).flatMap((child) => blockLines(child));
        return [indent + bullet + (first ?? "").trimStart(), ...rest.map((line) => indent + "  " + line)];
      });
    }
    case "blockquote":
      return (node.content ?? []).flatMap((child) => blockLines(child)).map((line) => `${indent}> ${line}`);
    case "table":
      return (node.content ?? []).map(
        (row) =>
          indent +
          (row.content ?? [])
            .map((cell) => (cell.content ?? []).flatMap((child) => blockLines(child)).join(" ").trim())
            .join(" | "),
      );
    default:
      return [];
  }
}

// A section's readable text, one block per line.
export function sectionText(section) {
  return (section?.content ?? [])
    .flatMap((block) => blockLines(block))
    .join("\n")
    .replace(/[^\S\n]+$/gm, "");
}

// --- words ---------------------------------------------------------------

// Line breaks, runs of spaces, words (letters, digits and joiners) and single
// punctuation marks, so "goal." against "goals." changes only the word.
function tokens(text) {
  return text.match(/\n|[^\S\n]+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

function push(parts, text, changed) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.changed === changed) last.text += text;
  else parts.push({ text, changed });
}

// The two texts as runs of unchanged and changed words: `current` marks what
// the proposal removes, `proposed` what it adds.
export function wordDiff(currentText, proposedText) {
  const a = tokens(currentText);
  const b = tokens(proposedText);
  const current = [];
  const proposed = [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const head = a.slice(0, start).join("");
  push(current, head, false);
  push(proposed, head, false);

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    push(current, midA.join(""), true);
    push(proposed, midB.join(""), true);
  } else {
    // Longest common subsequence, filled from the end so the walk below goes
    // forward through both lists.
    const width = midB.length + 1;
    const table = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        push(current, midA[i], false);
        push(proposed, midB[j], false);
        i += 1;
        j += 1;
      } else if (j < midB.length && (i === midA.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
        push(proposed, midB[j], true);
        j += 1;
      } else {
        push(current, midA[i], true);
        i += 1;
      }
    }
  }

  const tail = a.slice(endA).join("");
  push(current, tail, false);
  push(proposed, tail, false);
  return { current: joinChanges(current), proposed: joinChanges(proposed) };
}

// A space left unchanged between two changed words would split one
// highlight into two; it reads better as part of the change.
function joinChanges(parts) {
  const joined = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const between =
      !part.changed && /^[^\S\n]+$/.test(part.text) && joined.at(-1)?.changed && parts[index + 1]?.changed;
    if (between) {
      joined.at(-1).text += part.text + parts[index + 1].text;
      index += 1;
    } else {
      joined.push({ ...part });
    }
  }
  return joined;
}

// --- documents -----------------------------------------------------------

// ai_generated marks say who wrote a passage, not what it says; a section
// that only lost or gained them isn't a proposed change.
function withoutProvenance(node) {
  if (!node || typeof node !== "object") return node;
  const copy = { ...node };
  if (node.marks) {
    const marks = node.marks.filter((mark) => mark.type !== "ai_generated");
    if (marks.length) copy.marks = marks;
    else delete copy.marks;
  }
  if (node.content) copy.content = node.content.map(withoutProvenance);
  return copy;
}

const sameSection = (a, b) => JSON.stringify(withoutProvenance(a)) === JSON.stringify(withoutProvenance(b));

function sectionsByType(document) {
  const found = new Map();
  for (const section of document?.content ?? []) {
    const type = section?.attrs?.type;
    if (type && !found.has(type)) found.set(type, section);
  }
  return found;
}

// Every section in either document, in the standard order, with its status:
// unchanged, changed (words differ), format (same words, other formatting),
// added (only in the proposal) or removed (only in the saved document).
export function compareDocuments(currentDocument, proposedDocument) {
  const current = sectionsByType(currentDocument);
  const proposed = sectionsByType(proposedDocument);
  const types = [...new Set([...current.keys(), ...proposed.keys()])].sort(
    (x, y) => (ORDER.indexOf(x) + 1 || ORDER.length + 1) - (ORDER.indexOf(y) + 1 || ORDER.length + 1),
  );
  return types.map((type) => {
    const before = current.get(type);
    const after = proposed.get(type);
    const label = LABELS[type] ?? type;
    if (!after) {
      const text = sectionText(before);
      return { type, label, status: "removed", current: text ? [{ text, changed: true }] : [], proposed: null };
    }
    if (!before) {
      const text = sectionText(after);
      return { type, label, status: "added", current: null, proposed: text ? [{ text, changed: true }] : [] };
    }
    const beforeText = sectionText(before);
    const afterText = sectionText(after);
    if (beforeText === afterText) {
      const status = sameSection(before, after) ? "unchanged" : "format";
      const parts = beforeText ? [{ text: beforeText, changed: false }] : [];
      return { type, label, status, current: parts, proposed: parts };
    }
    return { type, label, status: "changed", ...wordDiff(beforeText, afterText) };
  });
}

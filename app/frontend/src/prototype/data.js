// The interview questions and the helpers that map API rows onto the shape
// the screens use.

// The questions themselves (labels, parts, copy) live with the new screens.
import { PRD_SECTIONS, QUESTIONS } from "../nautilus/app/questions.js";
import { escapeHtml } from "../nautilus/app/editor/escape.js";

export { QUESTIONS };

// --- content_json -> sections ------------------------------------------
// Saves store TipTap JSON (doc_schema_version 2, docs/prd-document-format.md):
// `{ type: "doc", content: [{ type: "section", attrs: { type }, content }] }`.
// Older PRDs still hold v1, `{ description, sections: [{ type, title, html }] }`,
// and open the same way; the editor saves them back as v2.
//
// The screens work with `[{ id, title, html }]`. v2 is turned into HTML here
// without TipTap, so the workspace doesn't load the editor; the editor
// parses this HTML through its schema (cleanHtml) before showing it.

const SECTION_LABELS = Object.fromEntries(PRD_SECTIONS.map((section) => [section.id, section.label]));

const BLOCK_TAGS = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
  tableRow: "tr",
  tableCell: "td",
  tableHeader: "th",
};

function attribute(name, value) {
  return value === null || value === undefined ? "" : ` ${name}="${escapeHtml(value)}"`;
}

function renderMark(mark, inner) {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case "bold":
      return `<strong>${inner}</strong>`;
    case "italic":
      return `<em>${inner}</em>`;
    case "underline":
      return `<u>${inner}</u>`;
    case "link":
      return `<a${attribute("href", attrs.href)}${attribute("target", attrs.target)}${attribute("rel", attrs.rel)}>${inner}</a>`;
    case "assumption":
      return `<mark class="nt-assumption">${inner}</mark>`;
    case "ai_generated":
      return `<span class="nt-ai-generated"${attribute("data-generation-record-id", attrs.generation_record_id)}>${inner}</span>`;
    default:
      return inner;
  }
}

function blockAttributes(node) {
  const attrs = node.attrs ?? {};
  if (node.type === "orderedList") return attrs.start && attrs.start !== 1 ? attribute("start", attrs.start) : "";
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return (attrs.colspan > 1 ? attribute("colspan", attrs.colspan) : "")
      + (attrs.rowspan > 1 ? attribute("rowspan", attrs.rowspan) : "")
      + (Array.isArray(attrs.colwidth) ? attribute("colwidth", attrs.colwidth.join(",")) : "");
  }
  return "";
}

function renderNode(node) {
  const children = (node.content ?? []).map(renderNode).join("");
  if (node.type === "text") {
    return (node.marks ?? []).reduce((inner, mark) => renderMark(mark, inner), escapeHtml(node.text));
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "heading") {
    const level = [1, 2, 3].includes(node.attrs?.level) ? node.attrs.level : 1;
    return `<h${level}>${children}</h${level}>`;
  }
  if (node.type === "table") return `<table><tbody>${children}</tbody></table>`;
  const tag = BLOCK_TAGS[node.type];
  return tag ? `<${tag}${blockAttributes(node)}>${children}</${tag}>` : children;
}

export function documentToSections(document) {
  const sections = (document?.content ?? []).filter((node) => node.type === "section");
  if (!sections.length) return null;
  return sections.map((section) => ({
    id: section.attrs?.type,
    title: SECTION_LABELS[section.attrs?.type] ?? section.attrs?.type,
    html: (section.content ?? []).map(renderNode).join("") || "<p></p>",
  }));
}

// True when two JSON values are the same, whatever their key order (the
// database's jsonb doesn't keep it).
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

export function contentJsonToSections(contentJson) {
  if (contentJson?.type === "doc") return documentToSections(contentJson);
  const sections = contentJson?.sections;
  if (!Array.isArray(sections) || !sections.length) return null;
  return sections.map(({ type, title, html }) => ({ id: type, title, html }));
}

// Maps a real `prd` row (snake_case, from GET/POST/PUT /api/prds) onto the
// shape every screen expects. Intake answers live in a separate table, so
// `answers` starts empty and is filled in by fromApiIntakeAnswers when the
// PRD is opened (or when the workspace shows its interview progress).
export function fromApiPrd(row) {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    ownerId: row.owner_id,
    // The caller's access: owner, editor, viewer or org_admin (#78). The
    // editor shows its editing tools from this.
    myRole: row.my_role ?? null,
    status: row.status,
    modified: row.updated_at.slice(0, 10),
    // Full timestamps, for "Today, 9:12 AM" in the workspace.
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    revision: row.revision,
    // Its own column since the v2 save; v1 rows kept it in content_json.
    description: row.description ?? row.content_json?.description ?? "",
    contentText: row.content_text ?? "",
    answers: {},
    // False until this PRD's intake answers have been fetched.
    answersLoaded: false,
    sections: contentJsonToSections(row.content_json),
  };
}

// intake_answer rows -> the { question_key: text } object the wizard uses.
// A skipped question maps to "" so the wizard still counts it as answered.
export function fromApiIntakeAnswers(rows) {
  return Object.fromEntries(
    rows.map((row) => [row.question_key, row.skipped ? "" : (row.answer_text ?? "")]),
  );
}

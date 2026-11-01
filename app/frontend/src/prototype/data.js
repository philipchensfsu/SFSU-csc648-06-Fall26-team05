// The interview questions and the helpers that map API rows onto the shape
// the screens use.

// The questions themselves (labels, parts, copy) live with the new screens.
import { QUESTIONS } from "../nautilus/app/questions.js";

export { QUESTIONS };

// --- content_json <-> sections -----------------------------------------
// content_json is stored as `{ sections: [{ type, title, html }] }` (v1).
// The TipTap editor (nautilus/app/editor) edits each section's HTML through
// the v2 schema, so the switch to storing TipTap JSON (doc_schema_version
// 2, docs/prd-document-format.md) only changes this mapping.

// The PRD's one-line description (from "Create a PRD") is kept in
// content_json too, as `description`, until the prd table has a column for
// it -- so every save of the sections has to carry it along.
export function sectionsToContentJson(sections, description = "") {
  return {
    ...(description ? { description } : {}),
    sections: (sections ?? []).map(({ id, title, html }) => ({
      type: id,
      title,
      html,
    })),
  };
}

export function contentJsonToSections(contentJson) {
  const sections = contentJson?.sections;
  if (!Array.isArray(sections) || !sections.length) return null;
  return sections.map(({ type, title, html }) => ({ id: type, title, html }));
}

// Plain-text derived from the section HTML, for content_text (search/AI
// input). Strips tags with the browser's own parser rather than regex.
export function sectionsToText(sections, description = "") {
  const parts = (sections ?? []).map((section) => {
    const div = document.createElement("div");
    div.innerHTML = section.html;
    return `${section.title}\n${div.textContent.trim()}`;
  });
  return (description ? [description, ...parts] : parts).join("\n\n");
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
    // The current review round's state, or null when nothing is under review.
    reviewState: row.review_state ?? null,
    modified: row.updated_at.slice(0, 10),
    // Full timestamps, for "Today, 9:12 AM" in the workspace.
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    revision: row.revision,
    // Kept in content_json until the table has a description column.
    description: row.description ?? row.content_json?.description ?? "",
    contentText: row.content_text ?? "",
    answers: {},
    // False until this PRD's intake answers have been fetched.
    answersLoaded: false,
    sections: contentJsonToSections(row.content_json),
  };
}

// The fields only GET /api/prds/{id} returns. List rows and save responses
// don't have them, so they are kept apart from the row in `prds`.
export function fromApiPrdDetail(row) {
  return {
    capabilities: row.capabilities ?? {},
    approval: row.approval ?? null,
    changedSinceApproval: row.changed_since_approval === true,
    currentVersion: row.current_version ?? null,
    owners: row.owners ?? [],
    project: row.project ?? null,
  };
}

// intake_answer rows -> the { question_key: text } object the wizard uses.
// A skipped question maps to "" so the wizard still counts it as answered.
export function fromApiIntakeAnswers(rows) {
  return Object.fromEntries(
    rows.map((row) => [row.question_key, row.skipped ? "" : (row.answer_text ?? "")]),
  );
}

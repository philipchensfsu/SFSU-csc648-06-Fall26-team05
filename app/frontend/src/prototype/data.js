// The interview questions and the helpers that map API rows onto the shape
// the screens use.

// The questions themselves (labels, parts, copy) live with the new screens.
import { QUESTIONS, parseAnswer } from "../nautilus/app/questions.js";

export { QUESTIONS };

// Section `id`s match the fixed section-type vocabulary from Section 1.5 of
// the M2 report exactly, so these map directly onto content_json's
// `sections[].type` with no translation needed.
const CAMPUS_SECTIONS = [
  {
    id: "problem",
    title: "Problem Statement",
    html: "<p>Students at [University] struggle to find study groups for their courses. Many study alone, miss deadlines, and have no easy way to meet classmates in the same class. Existing group chats are hard to discover and quickly go stale.</p>",
  },
  {
    id: "goals",
    title: "Goals",
    html: "<ul><li>Help students join a relevant study group within one day of searching.</li><li>Let students create and manage their own groups.</li><li>Keep group details current and easy to scan.</li></ul>",
  },
  {
    id: "non_goals",
    title: "Non-Goals",
    html: "<ul><li>Video calls or built-in chat.</li><li>Tutoring marketplaces or paid features.</li><li>Support for universities beyond the pilot campus.</li></ul>",
  },
  {
    id: "target_users",
    title: "Target Users",
    html: '<p>Undergraduate students at the pilot university, mostly first and second year. <mark class="nt-assumption" data-assumption="1">Most users are likely on mobile phones between classes.</mark></p><ul><li>Joiners who want an existing group for a course.</li><li>Organizers who want to start and fill a group.</li></ul>',
    assumptions: 1,
  },
  {
    id: "user_stories",
    title: "User Stories",
    html: "<ul><li>As a student, I filter groups by course so I can find one that fits.</li><li>As a student, I request to join a group so the organizer can approve me.</li><li>As an organizer, I edit meeting times so members stay informed.</li></ul>",
  },
  {
    id: "requirements",
    title: "Requirements",
    html: "<ul><li>FR-01: Students search groups by course code and section.</li><li>FR-02: Students request to join a group.</li><li>FR-03: Organizers approve or decline join requests.</li></ul>",
  },
  {
    id: "success_metrics",
    title: "Success Metrics",
    html: '<ul><li><mark class="nt-assumption" data-assumption="1">60% of searching students join a group within 24 hours.</mark></li><li>Weekly active groups grow through the semester.</li></ul>',
    assumptions: 1,
  },
  {
    id: "risks",
    title: "Risks",
    html: "<ul><li>Low adoption if too few groups exist at launch.</li><li>Stale groups that no longer meet.</li></ul>",
  },
  {
    id: "open_questions",
    title: "Open Questions",
    html: "<ul><li>Should groups be tied to a specific section or the whole course?</li><li>Do organizers need moderation tools?</li></ul>",
  },
];

// Status enum values, in the order they appear in Section 1.4, with the
// label shown in the UI for each.
export const STATUS_LABELS = {
  draft: "Draft",
  in_review: "In Review",
  final: "Final",
  assigned: "Assigned",
};

// --- content_json <-> sections -----------------------------------------
// content_json is stored as `{ sections: [{ type, title, html }] }`. This
// isn't a full ProseMirror document yet -- that requires the real Tiptap
// editor, which doesn't exist in this prototype -- but it's valid JSONB
// using the spec's exact section-type vocabulary, so it's a direct,
// low-cost upgrade path once Tiptap is actually wired up.

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
    status: row.status,
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

// intake_answer rows -> the { question_key: text } object the wizard uses.
// A skipped question maps to "" so the wizard still counts it as answered.
export function fromApiIntakeAnswers(rows) {
  return Object.fromEntries(
    rows.map((row) => [row.question_key, row.skipped ? "" : (row.answer_text ?? "")]),
  );
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Stored multi-part answers include labels so the interview can reconstruct
// each field. The simulated draft needs only the answer values.
function answerWithoutLabels(key, text) {
  const question = QUESTIONS.find((item) => item.id === key);
  if (!question) return text.trim();

  const values = parseAnswer(question, text);
  const parts = [];
  if (values.groups.length) parts.push(values.groups.join("; "));
  question.parts.forEach((part) => {
    if (values[part.key]) parts.push(values[part.key]);
  });
  return parts.join("\n\n");
}

function answerToHtml(key, text) {
  const clean = answerWithoutLabels(key, text);
  if (!clean) return null;
  return clean
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Fakes the AI draft: uses the interview answers where we have them and
// sample text everywhere else. Stored part labels stay in the intake data
// but are omitted from the draft, search text and exports.
export function draftSectionsFromAnswers(answers) {
  const fromAnswer = (key) =>
    answers[key] ? answerToHtml(key, answers[key]) : null;

  return CAMPUS_SECTIONS.map((section) => {
    const override =
      (section.id === "problem" && fromAnswer("problem")) ||
      (section.id === "goals" && fromAnswer("goals")) ||
      (section.id === "success_metrics" && fromAnswer("success_metrics"));
    if (section.id === "target_users" && answers.target_users) {
      return {
        ...section,
        html: `${fromAnswer("target_users")}<p><mark class="nt-assumption" data-assumption="1">Most users are likely on mobile phones between classes.</mark></p>`,
      };
    }
    return override ? { ...section, html: override, assumptions: 0 } : section;
  });
}

export function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

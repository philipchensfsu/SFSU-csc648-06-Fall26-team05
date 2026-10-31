// Escapes text for HTML. Kept apart from html.js so screens that only build
// HTML strings (draftFromAnswers) don't load the editor schema.
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

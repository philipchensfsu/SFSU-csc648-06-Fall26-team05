// Formatting helpers for the signed-in workspace. Everything here works on
// real data only: dates come from the API rows, names from the Supabase user.

// The four values of the prd.status column (schema.sql), in workflow order.
export const STATUS_ORDER = ["draft", "in_review", "final", "assigned"];

const STATUS_LABEL = {
  draft: "Draft",
  in_review: "In review",
  final: "Final",
  assigned: "Assigned",
};

export function statusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}

// --- dates --------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Calendar days between `iso` and now in the viewer's time zone (0 = today).
// Rounded, so a daylight-saving change doesn't shift the answer.
function daysAgo(iso, now) {
  return Math.round((startOfDay(now) - startOfDay(iso)) / DAY_MS);
}

function sameYear(iso, now) {
  return new Date(iso).getFullYear() === now.getFullYear();
}

// "Sep 12, 2026"
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "9:12 AM"
export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Today", "Yesterday", "Oct 18", or "Oct 18, 2025" for another year.
export function formatDay(iso, now = new Date()) {
  const days = daysAgo(iso, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear(iso, now) ? {} : { year: "numeric" }),
  });
}

// "Today, 9:12 AM", "Yesterday, 4:05 PM", otherwise like formatDay.
export function formatDayTime(iso, now = new Date()) {
  const days = daysAgo(iso, now);
  if (days <= 1) return `${days <= 0 ? "Today" : "Yesterday"}, ${formatTime(iso)}`;
  return formatDay(iso, now);
}

// For "Edited …": "today, 11:04 AM", "yesterday, 4:05 PM" or "Sep 24, 2026".
export function editedWhen(iso, now = new Date()) {
  const days = daysAgo(iso, now);
  if (days <= 1) return `${days <= 0 ? "today" : "yesterday"}, ${formatTime(iso)}`;
  return formatDate(iso);
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// --- people -------------------------------------------------------------

// "Om Pandya" -> "OP". Without a name, the first letter of the email.
export function initialsOf(name, email) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) {
    const last = words.length > 1 ? words[words.length - 1][0] : "";
    return (words[0][0] + last).toUpperCase();
  }
  return ((email ?? "").trim()[0] ?? "?").toUpperCase();
}

export function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// --- words --------------------------------------------------------------

// plural(1, "PRD") -> "1 PRD", plural(3, "PRD") -> "3 PRDs"
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

// ["a", "b", "c"] -> "a, b and c"
export function listPhrase(items) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// --- PRD content --------------------------------------------------------

// Parsing section HTML is the slow part of rendering long lists, so keep the
// results; the same HTML always gives the same blocks.
const blockCache = new Map();

// The text of each block (paragraph, list item, heading, table cell) in a
// section's HTML. DOMParser builds an inert document: nothing in it runs
// or loads.
export function blocksOf(html) {
  if (!html) return [];
  const cached = blockCache.get(html);
  if (cached) return cached;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (node) => node.textContent.replace(/\s+/g, " ").trim();
  let blocks = [...doc.body.querySelectorAll("p, li, h1, h2, h3, h4, td, th, blockquote, pre")]
    .filter((element) => !element.querySelector("p, li, td, th"))
    .map(clean)
    .filter(Boolean);
  if (!blocks.length && clean(doc.body)) blocks = [clean(doc.body)];
  if (blockCache.size > 500) blockCache.clear();
  blockCache.set(html, blocks);
  return blocks;
}

// One line about a PRD for cards and lists: its description when it has one,
// otherwise the first sentence of its first written section. Drafts that
// haven't been generated yet have neither, so this returns "".
export function prdSummary(prd) {
  if (prd.description) return prd.description;
  for (const section of prd.sections ?? []) {
    const first = blocksOf(section.html)[0];
    if (first) return first.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? first;
  }
  return "";
}

// How many passages the draft marked as assumptions for the author to check.
export function assumptionCount(prd) {
  return (prd.sections ?? []).reduce(
    (total, section) => total + (section.html?.match(/\bnt-assumption\b/g)?.length ?? 0),
    0,
  );
}

// Where a draft's interview stands, or null until its answers are loaded.
// A skipped question counts as answered, as it does in the interview itself.
export function interviewProgress(prd, questions) {
  if (!prd.answersLoaded) return null;
  const answered = questions.filter((question) => question.id in prd.answers).length;
  return {
    answered,
    total: questions.length,
    next: questions.find((question) => !(question.id in prd.answers)) ?? null,
  };
}

// --- search -------------------------------------------------------------

// The same clean-up the API applies before matching (list_prds in main.py),
// so highlights line up with what the server matched.
export function cleanSearchTerm(raw) {
  return raw.replace(/[,()*%"\\]/g, " ").trim();
}

// Splits text into plain and matching parts, case-insensitively.
export function splitMatches(text, term) {
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  // Lower-casing can change the length of some characters; skip highlighting then.
  if (!needle || lower.length !== text.length) return [{ text, match: false }];
  const parts = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

export function includesTerm(text, term) {
  return Boolean(term) && text.toLowerCase().includes(term.toLowerCase());
}

// A window of a long block around the first match, cut at word boundaries.
export function snippetAround(text, term, max = 220) {
  if (text.length <= max) return text;
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
  let start = Math.max(0, at - Math.floor(max / 3));
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < at) start = space + 1;
  }
  let end = Math.min(text.length, start + max);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > at + term.length) end = space;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// "FR-06: Members get a reminder…" -> { id: "FR-06", rest: "Members get a reminder…" }
export function splitRequirementId(text) {
  const match = text.match(/^([A-Z]{2,5}-\d{1,4})\s*[:.\u2013\u2014-]?\s+/);
  return match ? { id: match[1], rest: text.slice(match[0].length) } : { id: "", rest: text };
}

// "⌘K" on Apple devices, "Ctrl K" elsewhere.
export function searchShortcutLabel() {
  if (typeof navigator === "undefined") return "Ctrl K";
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K";
}

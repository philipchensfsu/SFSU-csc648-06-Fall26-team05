// @mentions in comments. The body stays plain text with "@Name" in it; the
// ids go separately in `mentions` (docs/frontend-api.md, Comments).

// The API takes up to 20 mentions per comment.
export const MAX_MENTIONS = 20;
// How far back from the caret an "@query" can start. Long enough for a full
// name, short enough that an old "@" further up the comment doesn't reopen
// the picker.
const MAX_QUERY = 40;

// The "@query" being typed just before the caret, or null. It starts at the
// beginning of the text or after a space or line break, and may hold spaces
// so "@Ken Ta" still finds Ken Tanaka.
export function mentionQuery(text, caret) {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || caret - at - 1 > MAX_QUERY) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  // A space right after "@" isn't a mention, and a trailing space means the
  // name is finished (it's what a pick inserts), so the list closes.
  if (/[\n@]/.test(query) || /^\s|\s$/.test(query)) return null;
  return { start: at, query };
}

const nameOf = (person) => person.name || person.email || "";

// People whose name, or any word in it, or email starts with the query,
// ignoring case. An empty query lists everyone.
export function matchPeople(people, query, limit = 6) {
  const q = query.trim().toLowerCase();
  const matches = people.filter((person) => {
    if (!nameOf(person)) return false;
    if (!q) return true;
    const name = (person.name ?? "").toLowerCase();
    const words = name.split(/\s+/);
    return name.startsWith(q) || words.some((word) => word.startsWith(q)) || (person.email ?? "").toLowerCase().startsWith(q);
  });
  return matches.slice(0, limit);
}

// Replaces "@query" (from `start` to the caret) with "@Name " and returns the
// new text and where the caret goes.
export function insertMention(text, start, caret, person) {
  const tag = `@${nameOf(person)} `;
  const next = text.slice(0, start) + tag + text.slice(caret);
  return { text: next, caret: start + tag.length };
}

// The ids of the picked people whose "@Name" is still in the body, so deleting
// a mention from the text also drops it. At most MAX_MENTIONS, no repeats.
export function mentionIds(body, picked) {
  const ids = [];
  for (const person of picked) {
    if (ids.includes(person.user_id)) continue;
    if (body.includes(`@${nameOf(person)}`)) ids.push(person.user_id);
  }
  return ids.slice(0, MAX_MENTIONS);
}

// Splits a posted comment's body into text and mention parts, matching the
// comment's `mentions` names (longest first, so "@Ken Tanaka" wins over "@Ken").
// Returns [{ text }, { text, mention: true }, ...].
export function splitMentions(body, mentions) {
  const names = [...new Set((mentions ?? []).map((mention) => mention.name).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!names.length) return [{ text: body }];
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(?:${escaped.join("|")})`, "g");
  const parts = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) });
    parts.push({ text: match[0], mention: true });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

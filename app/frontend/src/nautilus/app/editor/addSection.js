import { SECTION_TYPES } from "./schema";

// A PRD holds any of the nine standard sections, each once and in standard
// order (shared document spec); a section's title comes from its type, so
// there are no custom ones.

// The standard sections `sections` doesn't have yet, as [type, title].
export function missingSections(sections) {
  const present = new Set(sections.map((section) => section.id));
  return SECTION_TYPES.filter(([type]) => !present.has(type));
}

// `sections` with an empty `type` section in its standard place.
export function withSection(sections, type) {
  const order = SECTION_TYPES.map(([id]) => id);
  const title = Object.fromEntries(SECTION_TYPES)[type];
  const at = sections.findIndex((section) => order.indexOf(section.id) > order.indexOf(type));
  const added = { id: type, title, html: "" };
  return at === -1 ? [...sections, added] : [...sections.slice(0, at), added, ...sections.slice(at)];
}

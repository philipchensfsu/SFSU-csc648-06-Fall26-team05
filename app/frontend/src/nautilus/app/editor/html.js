// Section HTML helpers. Cleaning goes through the editor's own schema
// (schema.js): HTML is parsed into the PRD format and written back out, so
// anything the format doesn't allow (scripts, images, styles, event
// handlers, unsafe links) is gone before it's shown or saved.
import { generateHTML, generateJSON } from "@tiptap/html";
import { sectionExtensions, toSavedDocument } from "./schema";

const EXTENSIONS = sectionExtensions();
const cache = new Map();

export function cleanHtml(html) {
  const input = html ?? "";
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const output = generateHTML(generateJSON(input, EXTENSIONS), EXTENSIONS);
  if (cache.size > 300) cache.clear();
  cache.set(input, output);
  return output;
}

// The readable text of an HTML fragment, one block per line.
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(cleanHtml(html), "text/html");
  const lines = [];
  doc.body.querySelectorAll("p, li, h1, h2, h3, blockquote, tr").forEach((element) => {
    if (element.querySelector("p, li, tr")) return;
    const text =
      element.tagName === "TR"
        ? [...element.children].map((cell) => cell.textContent.trim()).filter(Boolean).join(" | ")
        : element.textContent.replace(/\s+/g, " ").trim();
    if (text) lines.push(element.tagName === "LI" ? `- ${text}` : text);
  });
  if (!lines.length) {
    const text = doc.body.textContent.replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

// True when a section has no text yet (e.g. "<p></p>").
export function isEmptyHtml(html) {
  return !htmlToText(html);
}

// The editor's sections as the saved v2 document (doc > section*). A
// section needs at least one block, so an empty one keeps an empty paragraph.
export function sectionsToDocument(sections) {
  return toSavedDocument({
    type: "doc",
    content: (sections ?? []).map((section) => {
      const { content } = generateJSON(section.html ?? "", EXTENSIONS);
      return {
        type: "section",
        attrs: { type: section.id },
        content: content?.length ? content : [{ type: "paragraph" }],
      };
    }),
  });
}

export { escapeHtml } from "./escape";

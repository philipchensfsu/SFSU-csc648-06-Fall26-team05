// @vitest-environment jsdom
// Round-trips every valid shared fixture through the editor schema
// (docs/prd-document-format.md §9): setContent, then getJSON, then compare.
// When python3 is available, the editor's output is also checked with the
// backend's own validator (app/backend/prd_document.py).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Editor } from "@tiptap/core";
import { afterAll, describe, expect, it } from "vitest";
import { isAllowedLink, prdDocumentExtensions, toSavedDocument } from "./schema";

const REPO = resolve(__dirname, "../../../../../..");
const VALID = join(REPO, "app/shared/fixtures/prd_document/valid");
const VALIDATOR = join(REPO, "app/backend/prd_document.py");

// TipTap writes every attribute, using its defaults where the fixture left
// one out. These are the defaults the spec accepts (§9 "Exact attribute
// shapes"), so a fixture that omits them means the same document.
const LINK_DEFAULTS = { target: "_blank", rel: "noopener noreferrer nofollow", class: null };
const TABLE_CELL_DEFAULTS = { colspan: 1, rowspan: 1, colwidth: null };
const ORDERED_LIST_DEFAULTS = { start: 1 };

function withDefaults(type, attrs) {
  if (type === "link") return { ...LINK_DEFAULTS, ...attrs };
  if (type === "tableCell" || type === "tableHeader") return { ...TABLE_CELL_DEFAULTS, ...attrs };
  if (type === "orderedList") return { ...ORDERED_LIST_DEFAULTS, ...attrs };
  return attrs;
}

// The same document either way: defaults filled in, empty `attrs` dropped,
// and marks in a fixed order (ProseMirror orders them by schema rank).
function normalize(node) {
  const out = { type: node.type };
  if (node.text !== undefined) out.text = node.text;
  const attrs = withDefaults(node.type, node.attrs ?? {});
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (node.marks?.length) {
    out.marks = node.marks
      .map((mark) => {
        const markAttrs = withDefaults(mark.type, mark.attrs ?? {});
        return Object.keys(markAttrs).length ? { type: mark.type, attrs: markAttrs } : { type: mark.type };
      })
      .sort((a, b) => a.type.localeCompare(b.type));
  }
  if (node.content) out.content = node.content.map(normalize);
  return out;
}

function roundTrip(document) {
  const editor = new Editor({ extensions: prdDocumentExtensions(), content: document });
  const json = toSavedDocument(editor.getJSON());
  editor.destroy();
  return json;
}

function hasPython() {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const fixtures = readdirSync(VALID)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [name, JSON.parse(readFileSync(join(VALID, name), "utf8")).document]);
const outputDir = mkdtempSync(join(tmpdir(), "prd-roundtrip-"));
const outputs = [];

describe("valid fixtures round-trip through the editor schema", () => {
  it.each(fixtures)("%s", (name, document) => {
    const output = roundTrip(document);
    expect(normalize(output)).toEqual(normalize(document));
    const file = join(outputDir, name);
    writeFileSync(file, JSON.stringify(output));
    outputs.push(file);
  });

  afterAll(() => {
    if (!hasPython()) return;
    // Every editor output must pass the backend's saved-document check.
    for (const file of outputs) {
      const result = execFileSync("python3", ["-I", VALIDATOR, file], { encoding: "utf8" });
      expect(result.split("\n")[0]).toBe(`${file}: valid`);
    }
  });
});

describe("content the spec doesn't allow is dropped", () => {
  const section = (content) => ({
    type: "doc",
    content: [{ type: "section", attrs: { type: "goals" }, content }],
  });
  const loadHtml = (html) => {
    const editor = new Editor({
      extensions: prdDocumentExtensions(),
      content: `<section data-section-type="goals">${html}</section>`,
    });
    const json = editor.getJSON();
    editor.destroy();
    return JSON.stringify(json);
  };

  it("drops images, code, strike and horizontal rules from pasted HTML", () => {
    const json = loadHtml(
      '<p>Keep <s>strike</s> <code>code</code></p><img src="x.png"><hr><pre><code>block</code></pre>',
    );
    expect(json).not.toMatch(/"(image|code|codeBlock|strike|horizontalRule)"/);
    expect(json).toContain("Keep");
  });

  it("drops javascript: and relative links but keeps their text", () => {
    const json = loadHtml('<p><a href="javascript:alert(1)">bad</a> <a href="/relative">rel</a></p>');
    expect(json).not.toContain('"link"');
    expect(json).toContain("bad");
  });

  it("keeps v1 assumption highlights as the assumption mark", () => {
    const json = loadHtml('<p><mark class="nt-assumption" data-assumption="1">Check me</mark></p>');
    expect(json).toContain('"assumption"');
    expect(json).not.toContain("data-assumption");
  });

  it("writes no title on links and no type on ordered lists", () => {
    const json = JSON.stringify(
      roundTrip(
        section([
          { type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] },
          { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] }] },
        ]),
      ),
    );
    expect(json).not.toContain('"title"');
    expect(json).not.toMatch(/"orderedList","attrs":\{[^}]*"type"/);
  });

  it("allows only http, https and mailto links", () => {
    expect(isAllowedLink("https://example.com")).toBe(true);
    expect(isAllowedLink("mailto:pm@example.com")).toBe(true);
    expect(isAllowedLink("javascript:alert(1)")).toBe(false);
    expect(isAllowedLink("/relative")).toBe(false);
    expect(isAllowedLink("https://exa mple.com")).toBe(false);
  });
});

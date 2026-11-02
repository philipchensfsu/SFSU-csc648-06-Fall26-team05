// @vitest-environment jsdom
// The v2 save path: a saved document loads into the screens' sections
// (data.js, no TipTap) and the editor saves those sections back as the same
// document (html.js). "Start from my answers" builds a valid v2 draft, and
// old v1 PRDs still load.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { contentJsonToSections, documentToSections, fromApiPrd, sameJson } from "../../../prototype/data";
import { createDraftCreator } from "../flow/draftCreation";
import { draftFromAnswers } from "./draftFromAnswers";
import { cleanHtml, sectionsToDocument } from "./html";
import { hasPython, normalize, validFixtures, validateFile } from "./prdTestFixtures";

const outputDir = mkdtempSync(join(tmpdir(), "prd-v2save-"));

function checkWithBackend(name, document) {
  if (!hasPython()) return;
  const file = join(outputDir, name);
  writeFileSync(file, JSON.stringify(document));
  expect(validateFile(file)).toBe(`${file}: valid`);
}

describe("v2 documents load and save back unchanged", () => {
  const withSections = validFixtures.filter(([, document]) => document.content.length);

  it.each(withSections)("%s", (name, document) => {
    // The editor cleans section HTML on the way in (EditorPage toDoc).
    const sections = documentToSections(document).map((section) => ({ ...section, html: cleanHtml(section.html) }));
    const saved = sectionsToDocument(sections);
    expect(normalize(saved, { nullLinkDefaults: true })).toEqual(normalize(document, { nullLinkDefaults: true }));
    checkWithBackend(name, saved);
  });

  it("treats an empty document as no draft yet", () => {
    expect(contentJsonToSections({ type: "doc", content: [] })).toBeNull();
  });

  it("labels sections from their type", () => {
    const [section] = documentToSections({
      type: "doc",
      content: [{ type: "section", attrs: { type: "non_goals" }, content: [{ type: "paragraph" }] }],
    });
    expect(section).toEqual({ id: "non_goals", title: "Non-goals", html: "<p></p>" });
  });

  it("escapes text and attributes", () => {
    const [section] = documentToSections({
      type: "doc",
      content: [{
        type: "section",
        attrs: { type: "goals" },
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: "<img src=x onerror=alert(1)>", marks: [{ type: "link", attrs: { href: 'https://a.example/"x' } }] }],
        }],
      }],
    });
    expect(section.html).not.toContain("<img");
    expect(section.html).toContain("&quot;x");
  });
});

describe("old v1 PRDs still open", () => {
  it("maps v1 sections and the description kept in content_json", () => {
    const prd = fromApiPrd({
      id: "p1",
      title: "Old PRD",
      updated_at: "2026-10-01T10:00:00Z",
      revision: 3,
      content_json: {
        description: "From before the column",
        sections: [{ type: "goals", title: "Goals", html: "<p>Ship it</p>" }],
      },
    });
    expect(prd.description).toBe("From before the column");
    expect(prd.sections).toEqual([{ id: "goals", title: "Goals", html: "<p>Ship it</p>" }]);
  });

  it("saves them as v2", () => {
    const saved = sectionsToDocument([{ id: "goals", title: "Goals", html: '<p><mark class="nt-assumption" data-assumption="1">Ship it</mark></p>' }]);
    expect(saved).toEqual({
      type: "doc",
      content: [{
        type: "section",
        attrs: { type: "goals" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ship it", marks: [{ type: "assumption" }] }] }],
      }],
    });
  });

  it("prefers the description column", () => {
    const prd = fromApiPrd({ id: "p1", title: "", updated_at: "2026-10-01", description: "Column", content_json: { description: "Old" } });
    expect(prd.description).toBe("Column");
  });
});

describe("Start from my answers", () => {
  const answers = {
    problem: "Students can't find a free room.\nThey walk floor to floor.\n\nIt's worse during finals.",
    goals: "Book a room in a few taps.",
  };

  it("builds all nine sections and passes the backend check", () => {
    const draft = draftFromAnswers(answers);
    expect(draft.content.map((section) => section.attrs.type)).toEqual([
      "problem", "goals", "non_goals", "target_users", "user_stories",
      "requirements", "success_metrics", "risks", "open_questions",
    ]);
    expect(draft.content[0].content[0].content).toEqual([
      { type: "text", text: "Students can't find a free room." },
      { type: "hardBreak" },
      { type: "text", text: "They walk floor to floor." },
    ]);
    checkWithBackend("draft.json", draft);
    checkWithBackend("draft-empty.json", draftFromAnswers({}));
  });

  it("opens in the editor and saves back unchanged", () => {
    const draft = draftFromAnswers(answers);
    const sections = documentToSections(draft).map((section) => ({ ...section, html: cleanHtml(section.html) }));
    expect(normalize(sectionsToDocument(sections))).toEqual(normalize(draft));
  });
});

describe("creating a draft", () => {
  it("saves the description as its own field", async () => {
    const api = {
      createPrd: vi.fn().mockResolvedValue({ id: "p1", revision: 1, description: null, content_json: {} }),
      updatePrd: vi.fn().mockResolvedValue({ id: "p1", revision: 2, description: "One line" }),
      saveIntakeAnswer: vi.fn(),
    };
    await createDraftCreator(api, () => {})({ title: "T", projectId: null, description: "One line" });
    expect(api.updatePrd).toHaveBeenCalledWith("p1", { revision: 1, description: "One line" });
  });
});

describe("sameJson", () => {
  it("ignores key order", () => {
    expect(sameJson({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });
});

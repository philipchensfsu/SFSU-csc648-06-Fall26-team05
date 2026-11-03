import { describe, expect, it } from "vitest";
import { compareDocuments, sectionText, wordDiff } from "./proposalDiff";

const text = (value, marks) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const p = (...children) => ({ type: "paragraph", content: children.map((c) => (typeof c === "string" ? text(c) : c)) });
const section = (type, ...content) => ({ type: "section", attrs: { type }, content });
const doc = (...sections) => ({ type: "doc", content: sections });
const changed = (parts) => parts.filter((part) => part.changed).map((part) => part.text);

describe("sectionText", () => {
  it("writes one line per block, keeping bullets, numbers, quotes and table rows", () => {
    const item = (...blocks) => ({ type: "listItem", content: blocks });
    const cell = (value) => ({ type: "tableCell", content: [p(value)] });
    const result = sectionText(
      section(
        "requirements",
        { type: "heading", attrs: { level: 2 }, content: [text("Must have")] },
        { type: "bulletList", content: [item(p("Search"), { type: "bulletList", content: [item(p("by course"))] })] },
        { type: "orderedList", attrs: { start: 3 }, content: [item(p("Join")), item(p("Leave"))] },
        { type: "blockquote", content: [p("Quoted")] },
        { type: "table", content: [{ type: "tableRow", content: [cell("FR-01"), cell("Must")] }] },
        p("One", { type: "hardBreak" }, "Two"),
      ),
    );
    expect(result).toBe(
      ["Must have", "- Search", "  - by course", "3. Join", "4. Leave", "> Quoted", "FR-01 | Must", "One", "Two"].join("\n"),
    );
  });

  it("is empty for an empty section", () => {
    expect(sectionText(section("goals", p()))).toBe("");
  });
});

describe("wordDiff", () => {
  it("marks only the words that differ", () => {
    const { current, proposed } = wordDiff("Raise weekly users by a lot.", "Raise weekly users by 20%.");
    expect(changed(current)).toEqual(["a lot"]);
    expect(changed(proposed)).toEqual(["20%"]);
    expect(current.map((part) => part.text).join("")).toBe("Raise weekly users by a lot.");
    expect(proposed.map((part) => part.text).join("")).toBe("Raise weekly users by 20%.");
  });

  it("treats added and removed lines as changes", () => {
    const { current, proposed } = wordDiff("- A\n- B", "- A\n- B\n- C");
    expect(changed(current)).toEqual([]);
    expect(changed(proposed)).toEqual(["\n- C"]);
  });

  it("separates a word from its punctuation", () => {
    const { current, proposed } = wordDiff("one goal.", "one goals.");
    expect(changed(current)).toEqual(["goal"]);
    expect(changed(proposed)).toEqual(["goals"]);
  });

  it("shows a very large rewrite as replaced whole rather than stalling", () => {
    const before = Array.from({ length: 2100 }, (_, i) => `a${i}`).join(" ");
    const after = Array.from({ length: 2100 }, (_, i) => `b${i}`).join(" ");
    const { current, proposed } = wordDiff(before, after);
    expect(current).toEqual([{ text: before, changed: true }]);
    expect(proposed).toEqual([{ text: after, changed: true }]);
  });
});

describe("compareDocuments", () => {
  it("lists every section in the standard order with its status", () => {
    const rows = compareDocuments(
      doc(section("problem", p("Students drive.")), section("goals", p("Find a group.")), section("risks", p("Low use."))),
      doc(section("goals", p("Find a group in one day.")), section("problem", p("Students drive.")), section("risks", p("Low use.")), section("success_metrics", p("80% join."))),
    );
    expect(rows.map((row) => [row.type, row.status])).toEqual([
      ["problem", "unchanged"],
      ["goals", "changed"],
      ["success_metrics", "added"],
      ["risks", "unchanged"],
    ]);
    expect(rows[1].label).toBe("Goals");
    expect(changed(rows[1].proposed)).toEqual([" in one day"]);
    expect(rows[2].current).toBeNull();
  });

  it("reports a section the proposal leaves out as removed", () => {
    const rows = compareDocuments(doc(section("risks", p("Low use."))), doc());
    expect(rows).toEqual([
      { type: "risks", label: "Risks", status: "removed", current: [{ text: "Low use.", changed: true }], proposed: null },
    ]);
  });

  it("calls same words with other formatting a format change", () => {
    const rows = compareDocuments(
      doc(section("goals", p("Find a group."))),
      doc(section("goals", p(text("Find a group.", [{ type: "bold" }])))),
    );
    expect(rows[0].status).toBe("format");
  });

  it("ignores ai_generated marks, which are provenance rather than content", () => {
    const marked = [{ type: "ai_generated", attrs: { generation_record_id: "11111111-1111-1111-1111-111111111111" } }];
    const rows = compareDocuments(
      doc(section("goals", p(text("Find a group.", marked)))),
      doc(section("goals", p("Find a group."))),
    );
    expect(rows[0].status).toBe("unchanged");
  });

  it("handles empty and missing documents", () => {
    expect(compareDocuments({ type: "doc", content: [] }, null)).toEqual([]);
    const rows = compareDocuments(null, doc(section("problem", p("New."))));
    expect(rows[0].status).toBe("added");
  });
});

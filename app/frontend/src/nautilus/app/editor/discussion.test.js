import { describe, expect, it } from "vitest";
import { describeSummaryError, isSummaryOutdated, summaryGroups, summaryScope } from "./discussion";

describe("summaryGroups", () => {
  it("keeps the four groups in order, leaving out empty ones", () => {
    const groups = summaryGroups({
      themes: [{ title: "Budget", summary: "Spell out costs.", comment_ids: ["a"] }],
      open_questions: [],
      requested_changes: [{ section_type: "goals", change: "Add a goal.", comment_ids: ["b"] }],
      unresolved_items: [{ item: "Launch date.", comment_ids: ["c"] }],
    });
    expect(groups.map((group) => group.title)).toEqual(["Themes", "Requested changes", "Unresolved"]);
    expect(groups[0].items[0]).toEqual({ heading: "Budget", text: "Spell out costs.", commentIds: ["a"] });
    expect(groups[2].items[0]).toEqual({ text: "Launch date.", commentIds: ["c"] });
  });

  it("names a requested change's section, or the whole PRD", () => {
    const changes = (sectionType) =>
      summaryGroups({ requested_changes: [{ section_type: sectionType, change: "x", comment_ids: [] }] })[0].items[0];
    expect(changes("goals").heading).toBe("Goals");
    expect(changes(null).heading).toBe("Whole PRD");
  });

  it("copes with a missing summary", () => {
    expect(summaryGroups(undefined)).toEqual([]);
    expect(summaryGroups({})).toEqual([]);
  });
});

describe("summaryScope", () => {
  it("says how many comments on which version", () => {
    expect(summaryScope({ version_no: 3, comment_count: 12, summarized_comment_count: 12 })).toBe(
      "12 comments on version 3.",
    );
    expect(summaryScope({ version_no: 1, comment_count: 1, summarized_comment_count: 1 })).toBe(
      "1 comment on version 1.",
    );
  });

  it("says when only the newest comments were read", () => {
    expect(summaryScope({ version_no: 3, comment_count: 140, summarized_comment_count: 100 })).toBe(
      "The newest 100 of 140 comments on version 3.",
    );
  });

  it("handles a PRD with nothing saved yet", () => {
    expect(summaryScope({ version_no: null, version_id: null, comment_count: 0, summarized_comment_count: 0 })).toBe(
      "0 comments on the current version.",
    );
  });
});

describe("isSummaryOutdated", () => {
  const result = { version_id: "v3", comment_count: 2 };
  const on = (versionId, n) => Array.from({ length: n }, (_, i) => ({ id: `${versionId}-${i}`, version_id: versionId }));

  it("is current while the version and its comments match", () => {
    expect(isSummaryOutdated(result, "v3", [...on("v3", 2), ...on("v2", 5)])).toBe(false);
  });

  it("is out of date after a new comment or a new version", () => {
    expect(isSummaryOutdated(result, "v3", on("v3", 3))).toBe(true);
    expect(isSummaryOutdated(result, "v4", on("v3", 2))).toBe(true);
  });

  it("never flags a summary of nothing saved", () => {
    expect(isSummaryOutdated({ version_id: null, comment_count: 0 }, null, [])).toBe(false);
  });
});

describe("describeSummaryError", () => {
  it("words the AI failures and a missing PRD or version", () => {
    expect(describeSummaryError({ code: "ai_invalid_output" })).toContain("couldn’t summarize the discussion");
    expect(describeSummaryError({ status: 404, message: "Version not found" })).toBe(
      "This PRD or version isn’t available any more.",
    );
  });

  it("falls back to the shared AI wording and the backend's sentence", () => {
    expect(describeSummaryError({ code: "ai_cooldown", retryAfter: 2 })).toBe(
      "Just a moment between AI requests. Try again in 2s.",
    );
    expect(describeSummaryError({ code: "ai_disabled", message: "AI is turned off for this organization." })).toBe(
      "AI is turned off for this organization.",
    );
  });
});

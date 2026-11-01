import { describe, expect, it } from "vitest";
import { approvalProgress, prdBadge } from "./format";

describe("prdBadge", () => {
  it("shows the status when nothing is under review", () => {
    expect(prdBadge("draft", null)).toEqual({ tone: "draft", label: "Draft" });
    expect(prdBadge("final", null)).toEqual({ tone: "final", label: "Final" });
  });

  it("shows the review state while there is one", () => {
    expect(prdBadge("in_review", "in_review")).toEqual({ tone: "in_review", label: "In review" });
    expect(prdBadge("draft", "changes_requested")).toEqual({ tone: "changes_requested", label: "Changes requested" });
    expect(prdBadge("final", "approved")).toEqual({ tone: "approved", label: "Approved" });
  });

  it("keeps Assigned on an approved PRD", () => {
    expect(prdBadge("assigned", "approved")).toEqual({ tone: "assigned", label: "Assigned" });
  });
});

describe("approvalProgress", () => {
  it("counts the reviewers who approved", () => {
    expect(approvalProgress({ approved_count: 1, required_count: 2 })).toBe("1 of 2 approved");
  });

  it("says nothing without reviewers", () => {
    expect(approvalProgress({ approved_count: 0, required_count: 0 })).toBe("");
    expect(approvalProgress(null)).toBe("");
  });
});

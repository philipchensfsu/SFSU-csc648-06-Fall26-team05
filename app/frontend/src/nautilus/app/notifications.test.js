import { describe, expect, it } from "vitest";
import { approvalSummary, groupNotifications, notificationMeta, notificationSentence, notificationTone } from "./notifications";

const item = (type, payload = {}, extra = {}) => ({
  type,
  payload,
  title: "A PRD",
  actor_name: "Alice PM",
  count: 1,
  updated_at: "2026-11-01T11:00:00Z",
  ...extra,
});
const text = (notification) => {
  const { actor, verb, after } = notificationSentence(notification);
  return [actor, verb, "TITLE"].filter(Boolean).join(" ") + after;
};

describe("notificationSentence", () => {
  it.each([
    [item("member_added", { role: "editor" }), "Alice PM added you to TITLE as Editor"],
    [item("member_role_changed", { from: "viewer", to: "editor" }), "Alice PM changed your role on TITLE from Viewer to Editor"],
    [item("comment_added", {}, { count: 1 }), "Alice PM commented on TITLE"],
    [item("comment_added", {}, { count: 3 }), "Alice PM left 3 comments on TITLE"],
    [item("submitted", { resubmitted: false }), "Alice PM asked you to approve TITLE"],
    [item("submitted", { resubmitted: true }), "Alice PM asked you to review again: TITLE"],
    [item("approved"), "Alice PM approved TITLE"],
    [item("changes_requested"), "Alice PM requested changes on TITLE"],
    [item("round_approved"), "TITLE was approved by all reviewers"],
    [item("superseded", { continued: true }), "TITLE changed, so its approval started again"],
    [item("superseded", { continued: false }), "TITLE went back to draft"],
    [item("work_status_changed", { status: "done" }), "TITLE was marked done"],
    [item("something_new"), "TITLE was updated"],
  ])("words %#", (notification, expected) => {
    expect(text(notification)).toBe(expected);
  });

  it("doesn't need an actor's name", () => {
    expect(text(item("approved", {}, { actor_name: null }))).toBe("Someone approved TITLE");
  });
});

describe("notificationTone", () => {
  it("gives each kind of event its color", () => {
    expect(notificationTone("changes_requested")).toBe("changes");
    expect(notificationTone("submitted")).toBe("attention");
    expect(notificationTone("comment_added")).toBe("comment");
    expect(notificationTone("round_approved")).toBe("approved");
    expect(notificationTone("member_added")).toBe("people");
    expect(notificationTone("something_new")).toBe("people");
  });
});

describe("notificationMeta", () => {
  it("names the section when there is one", () => {
    expect(notificationMeta(item("comment_added", { section_type: "goals" }))).toMatch(/^Goals · /);
    expect(notificationMeta(item("approved"))).not.toContain("·");
  });
});

describe("groupNotifications", () => {
  it("groups by day, keeps the order and drops empty groups", () => {
    const now = new Date(2026, 10, 3, 12);
    const at = (day, id) => ({ id, updated_at: new Date(2026, 10, day, 9).toISOString() });
    const groups = groupNotifications([at(3, "a"), at(3, "b"), at(2, "c"), at(1, "d")], now);
    expect(groups.map((group) => [group.label, group.items.map((row) => row.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Earlier", ["d"]],
    ]);
    expect(groupNotifications([at(1, "d")], now).map((group) => group.label)).toEqual(["Earlier"]);
  });
});

describe("approvalSummary", () => {
  const reviewer = (name, state) => ({ name, state });
  it("leads with a change request", () => {
    expect(approvalSummary({ reviewers: [reviewer("Ben", "approved"), reviewer("Erin", "changes_requested")] })).toBe(
      "Erin requested changes.",
    );
  });
  it("counts approvals and names who's left", () => {
    expect(approvalSummary({ reviewers: [reviewer("Ben", "approved"), reviewer("Erin", "pending")] })).toBe(
      "1 of 2 approved. Waiting on Erin.",
    );
    expect(approvalSummary({ reviewers: [reviewer("Ben", "approved")] })).toBe("1 of 1 approved.");
  });
  it("handles nothing decided and no reviewers", () => {
    expect(approvalSummary({ reviewers: [reviewer("Ben", "pending")] })).toBe("No decisions yet.");
    expect(approvalSummary(null)).toBe("No reviewers yet.");
  });
});

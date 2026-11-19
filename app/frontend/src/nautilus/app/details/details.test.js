import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FILTERS,
  activityKind,
  activityLink,
  canMoveWorkStatus,
  contributors,
  originLabel,
  priorityLabel,
  sectionLabel,
  sortMembers,
  teamName,
  teamOptions,
  versionAuthor,
  workStatusLabel,
} from "./details";

describe("version wording", () => {
  it("tags AI and checkpoint versions, and leaves plain edits untagged", () => {
    expect(originLabel("ai_generated")).toBe("AI suggestion accepted");
    expect(originLabel("checkpoint")).toBe("Saved before history");
    expect(originLabel("pm_edit")).toBe("");
  });

  it("names who saved a version, even without an account", () => {
    expect(versionAuthor({ actor: { id: "a", name: "Aksh" }, origin: "pm_edit" })).toBe("Aksh");
    expect(versionAuthor({ actor: null, origin: "checkpoint" })).toBe("Nautilus");
    expect(versionAuthor({ actor: null, origin: "pm_edit" })).toBe("Former member");
  });

  it("labels section types, and keeps an unknown one as is", () => {
    expect(sectionLabel("success_metrics")).toBe("Success metrics");
    expect(sectionLabel("something_new")).toBe("something_new");
  });

  it("lists contributors by number of saves, then name, skipping deleted accounts", () => {
    const versions = [
      { actor: { id: "b", name: "Ben" } },
      { actor: { id: "a", name: "Alice" } },
      { actor: { id: "b", name: "Ben" } },
      { actor: null },
      { actor: { id: "c", name: "Cara" } },
    ];
    expect(contributors(versions)).toEqual([
      { id: "b", name: "Ben", count: 2 },
      { id: "a", name: "Alice", count: 1 },
      { id: "c", name: "Cara", count: 1 },
    ]);
    expect(contributors(undefined)).toEqual([]);
  });
});

describe("work status", () => {
  it("allows only the moves the backend allows", () => {
    expect(canMoveWorkStatus("not_started", "in_progress")).toBe(true);
    expect(canMoveWorkStatus("in_progress", "done")).toBe(true);
    expect(canMoveWorkStatus("done", "in_progress")).toBe(true);
    expect(canMoveWorkStatus("not_started", "done")).toBe(false);
    expect(canMoveWorkStatus("done", "not_started")).toBe(false);
    expect(canMoveWorkStatus(null, "in_progress")).toBe(true);
  });

  it("labels each status, with not started for none", () => {
    expect(workStatusLabel("done")).toBe("Done");
    expect(workStatusLabel(null)).toBe("Not started");
  });
});

describe("routing", () => {
  const teams = [
    { id: "t2", name: "Payments", archived: false },
    { id: "t1", name: "Growth", archived: false },
    { id: "t3", name: "Legacy", archived: true },
  ];

  it("offers active teams by name, plus an archived one already set", () => {
    expect(teamOptions(teams, null).map((team) => team.label)).toEqual(["Growth", "Payments"]);
    expect(teamOptions(teams, "t3").map((team) => team.label)).toEqual(["Growth", "Legacy (archived)", "Payments"]);
  });

  it("names the owning team, or says when there is none", () => {
    expect(teamName(teams, "t2")).toBe("Payments");
    expect(teamName(teams, null)).toBe("No team");
    expect(teamName(teams, "gone")).toBe("A team you can’t see");
  });

  it("labels priorities, with not set for none", () => {
    expect(priorityLabel("critical")).toBe("Critical");
    expect(priorityLabel(null)).toBe("Not set");
  });
});

describe("members", () => {
  it("sorts owners, editors, then viewers, each by name", () => {
    const sorted = sortMembers([
      { name: "Zed", role: "viewer" },
      { name: "Bea", role: "editor" },
      { name: "Al", role: "editor" },
      { name: "Kim", role: "owner" },
    ]);
    expect(sorted.map((member) => member.name)).toEqual(["Kim", "Al", "Bea", "Zed"]);
  });
});

describe("activity", () => {
  it("puts each known event type under exactly one chip", () => {
    const types = ACTIVITY_FILTERS.flatMap((filter) => filter.types);
    expect(new Set(types).size).toBe(types.length);
    expect(ACTIVITY_FILTERS[0]).toEqual({ id: "all", label: "All", types: [] });
  });

  it("gives an event the kind of its chip, and 'other' for types it doesn't know", () => {
    expect(activityKind("version_saved")).toBe("edits");
    expect(activityKind("team_added")).toBe("people");
    expect(activityKind("mentioned")).toBe("comments");
    expect(activityKind("round_approved")).toBe("reviews");
    expect(activityKind("work_status_changed")).toBe("work");
    expect(activityKind("something_new")).toBe("other");
  });

  it("links saves to their version and comments to the comments", () => {
    expect(activityLink({ type: "version_saved", version_id: "v3" })).toEqual({
      kind: "version",
      versionId: "v3",
      label: "View version",
    });
    expect(activityLink({ type: "ai_applied", version_id: "v4" })?.versionId).toBe("v4");
    expect(activityLink({ type: "comment_added", comment_id: "c1", version_id: "v3" })).toEqual({
      kind: "comment",
      label: "View comment",
    });
    // A review step carries a version too, but has nothing of its own to open.
    expect(activityLink({ type: "approved", version_id: "v3", round_id: "r1" })).toBeNull();
    expect(activityLink({ type: "version_saved", version_id: null })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  REPORT_ACTIVITY_LIMIT,
  countOf,
  hasFilters,
  ownerChoices,
  ownerLabel,
  priorityRows,
  reportQuery,
  statusRows,
  teamChoices,
  teamLabel,
  workStatusRows,
} from "./reports";

const pairs = (rows) => rows.map((row) => [row.label, row.count]);

describe("count rows", () => {
  it("shows every status, with missing ones as 0", () => {
    expect(pairs(statusRows({ draft: 1, final: 2 }))).toEqual([
      ["Draft", 1],
      ["In review", 0],
      ["Final", 2],
      ["Assigned", 0],
    ]);
    expect(pairs(statusRows(undefined)).every(([, count]) => count === 0)).toBe(true);
  });

  it("shows every work status", () => {
    expect(pairs(workStatusRows({ not_started: 3 }))).toEqual([
      ["Not started", 3],
      ["In progress", 0],
      ["Done", 0],
    ]);
  });

  it("calls a missing priority No priority", () => {
    expect(pairs(priorityRows({ high: 1, none: 2 }))).toEqual([
      ["Critical", 0],
      ["High", 1],
      ["Medium", 0],
      ["Low", 0],
      ["No priority", 2],
    ]);
  });

  it("keeps values it doesn't know yet", () => {
    expect(pairs(statusRows({ archived: 4 })).at(-1)).toEqual(["archived", 4]);
  });
});

describe("names", () => {
  it("names a team, or No team for PRDs without one", () => {
    expect(teamLabel({ id: "t1", name: "Growth" })).toBe("Growth");
    expect(teamLabel(null)).toBe("No team");
  });

  it("names an owner, even without a name", () => {
    expect(ownerLabel({ id: "u1", name: "Olive Owner" })).toBe("Olive Owner");
    expect(ownerLabel({ id: "u1", name: null })).toBe("Unnamed member");
  });

  it("reads a missing status count as 0", () => {
    expect(countOf({ draft: 2 }, "draft")).toBe(2);
    expect(countOf({ draft: 2 }, "final")).toBe(0);
    expect(countOf(undefined, "final")).toBe(0);
  });
});

describe("reportQuery", () => {
  it("leaves out filters set to all and always sends the activity limit", () => {
    expect(reportQuery({ teamId: "", projectId: "", ownerId: "" })).toEqual({
      teamId: undefined,
      projectId: undefined,
      ownerId: undefined,
      activityLimit: REPORT_ACTIVITY_LIMIT,
    });
    expect(reportQuery({ teamId: "t1", projectId: "p1", ownerId: "u1" })).toMatchObject({
      teamId: "t1",
      projectId: "p1",
      ownerId: "u1",
    });
    expect(REPORT_ACTIVITY_LIMIT).toBeGreaterThanOrEqual(1);
    expect(REPORT_ACTIVITY_LIMIT).toBeLessThanOrEqual(50);
  });

  it("knows when a filter is set", () => {
    expect(hasFilters({ teamId: "", projectId: "", ownerId: "" })).toBe(false);
    expect(hasFilters({ teamId: "", projectId: "p1", ownerId: "" })).toBe(true);
  });
});

describe("filter choices", () => {
  it("lists active teams by name", () => {
    const teams = [
      { id: "b", name: "Growth", archived: false },
      { id: "a", name: "Design", archived: false },
      { id: "c", name: "Old", archived: true },
    ];
    expect(teamChoices(teams).map((team) => team.label)).toEqual(["Design", "Growth"]);
  });

  it("lists members by name", () => {
    const members = [
      { user_id: "2", name: "Ben PM" },
      { user_id: "1", name: "Alice PM" },
      { user_id: "3", name: null, email: null },
    ];
    expect(ownerChoices(members).map((member) => member.label)).toEqual(["Alice PM", "Ben PM", "Unnamed member"]);
  });
});

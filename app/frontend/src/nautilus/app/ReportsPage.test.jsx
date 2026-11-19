// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import ReportsPage from "./ReportsPage";

vi.mock("../../../lib/api", () => ({
  api: {
    getProgressReport: vi.fn(),
    getDirectory: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fullReport = () => ({
  total: 3,
  by_status: { draft: 1, in_review: 1, final: 1 },
  by_work_status: { not_started: 3 },
  by_priority: { high: 1, none: 2 },
  by_owner: [{ owner: { id: "u1", name: "Olive Owner" }, total: 2, by_status: { draft: 1, final: 1 } }],
  by_team: [
    { team: { id: "t1", name: "Growth" }, total: 1, by_status: { draft: 1 } },
    { team: null, total: 2, by_status: { in_review: 1, final: 1 } },
  ],
  activity: [
    {
      id: "e1",
      type: "approved",
      actor: { id: "u2", name: "Ben PM" },
      summary: "Ben PM approved version 2",
      payload: {},
      created_at: "2026-11-01T11:00:00Z",
      prd_id: "p-alpha",
      prd_title: "Alpha",
    },
  ],
});

const emptyReport = () => ({
  total: 0,
  by_status: {},
  by_work_status: {},
  by_priority: {},
  by_owner: [],
  by_team: [],
  activity: [],
});

const organization = { id: "org", name: "Campus Apps", access_role: "member" };
const projects = [{ id: "proj-1", name: "Mobile" }];

let root;
let host;
let onOpenPrdById;

async function show() {
  onOpenPrdById = vi.fn().mockResolvedValue();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ReportsPage organization={organization} projects={projects} onOpenPrdById={onOpenPrdById} />);
  });
}

const text = () => host.textContent;
const section = (label) => host.querySelector(`[aria-label="${label}"]`);
const counts = (label) =>
  [...section(label).querySelectorAll("dl > div")].map((row) => [
    row.querySelector("dt").textContent,
    row.querySelector("dd").textContent,
  ]);
const buttonWith = (label) => [...host.querySelectorAll("button")].find((button) => button.textContent.includes(label));

async function choose(id, value) {
  const select = host.querySelector(`#${id}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getProgressReport.mockResolvedValue(fullReport());
  api.getDirectory.mockResolvedValue({
    organization: { id: "org", name: "Campus Apps" },
    departments: [],
    teams: [
      { id: "t1", name: "Growth", archived: false },
      { id: "t-old", name: "Retired", archived: true },
    ],
    members: [
      { user_id: "u1", name: "Olive Owner" },
      { user_id: "u2", name: "Ben PM" },
    ],
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ReportsPage", () => {
  it("asks for the report with the activity limit and no filters", async () => {
    await show();
    expect(api.getProgressReport).toHaveBeenCalledWith({
      teamId: undefined,
      projectId: undefined,
      ownerId: undefined,
      activityLimit: 20,
    });
    expect(api.getDirectory).toHaveBeenCalledWith("org");
  });

  it("shows the totals and every count, with missing ones as 0", async () => {
    await show();
    expect(section("Total").textContent).toContain("3");
    expect(counts("Status")).toEqual([
      ["Draft", "1"],
      ["In review", "1"],
      ["Final", "1"],
      ["Assigned", "0"],
    ]);
    expect(counts("Work status")).toEqual([
      ["Not started", "3"],
      ["In progress", "0"],
      ["Done", "0"],
    ]);
    expect(counts("Priority")).toContainEqual(["No priority", "2"]);
    expect(counts("Priority")).toContainEqual(["Critical", "0"]);
  });

  it("breaks the PRDs down by owner and by team, with No team for PRDs without one", async () => {
    await show();
    const ownerRow = [...section("By owner").querySelectorAll("tbody tr")][0];
    expect([...ownerRow.children].map((cell) => cell.textContent)).toEqual(["Olive Owner", "2", "1", "0", "1", "0"]);
    const teamNames = [...section("By team").querySelectorAll("tbody th")].map((cell) => cell.textContent);
    expect(teamNames).toEqual(["Growth", "No team"]);
  });

  it("lists recent activity and opens its PRD", async () => {
    await show();
    expect(section("Recent activity").textContent).toContain("Ben PM approved version 2");
    await act(async () => buttonWith("Alpha").click());
    expect(onOpenPrdById).toHaveBeenCalledWith("p-alpha");
  });

  it("offers active teams, projects and members as filters", async () => {
    await show();
    const options = (id) => [...host.querySelectorAll(`#${id} option`)].map((option) => option.textContent);
    expect(options("nw-r-team")).toEqual(["All teams", "Growth"]);
    expect(options("nw-r-project")).toEqual(["All projects", "Mobile"]);
    expect(options("nw-r-owner")).toEqual(["All owners", "Ben PM", "Olive Owner"]);
  });

  it("reads the report again when a filter changes, and combines filters", async () => {
    await show();
    await choose("nw-r-team", "t1");
    expect(api.getProgressReport).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: "t1" }));
    await choose("nw-r-project", "proj-1");
    await choose("nw-r-owner", "u1");
    expect(api.getProgressReport).toHaveBeenLastCalledWith({
      teamId: "t1",
      projectId: "proj-1",
      ownerId: "u1",
      activityLimit: 20,
    });

    await act(async () => buttonWith("Clear filters").click());
    expect(api.getProgressReport).toHaveBeenLastCalledWith(expect.objectContaining({ teamId: undefined }));
  });

  it("drops an answer for filters that have since changed", async () => {
    let finishOld;
    api.getProgressReport
      .mockResolvedValueOnce(fullReport())
      .mockReturnValueOnce(new Promise((resolve) => (finishOld = resolve)))
      .mockResolvedValueOnce({ ...emptyReport() });
    await show();
    await choose("nw-r-team", "t1");
    await choose("nw-r-team", "");
    await act(async () => finishOld({ ...fullReport(), total: 99 }));
    expect(text()).not.toContain("99");
  });

  it("shows a loading message until the report arrives", async () => {
    api.getProgressReport.mockReturnValue(new Promise(() => {}));
    await show();
    expect(text()).toContain("Loading report…");
  });

  it("says when nothing matches the filters", async () => {
    await show();
    api.getProgressReport.mockResolvedValue(emptyReport());
    await choose("nw-r-team", "t1");
    expect(text()).toContain("No PRDs match these filters.");
    expect(section("Status")).toBeNull();
  });

  it("says when there's nothing to report yet", async () => {
    api.getProgressReport.mockResolvedValue(emptyReport());
    await show();
    expect(text()).toContain("No PRDs to report on yet.");
  });

  it("shows an API error and tries again", async () => {
    api.getProgressReport.mockRejectedValueOnce(new Error("Request failed: 500"));
    await show();
    expect(host.querySelector('[role="alert"]').textContent).toContain("Couldn’t load this report.");
    await act(async () => buttonWith("Try again").click());
    expect(api.getProgressReport).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(section("Total").textContent).toContain("3");
  });

  it("still works when the directory can't be read", async () => {
    api.getDirectory.mockRejectedValue(new Error("nope"));
    await show();
    expect(host.querySelector("#nw-r-team")).toBeNull();
    expect(host.querySelector("#nw-r-project")).not.toBeNull();
    expect(text()).toContain("Team and owner filters aren’t available right now.");
    expect(section("Total").textContent).toContain("3");
  });
});

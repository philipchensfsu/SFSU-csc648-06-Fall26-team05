// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../lib/api";
import PrdDetailsPage from "./PrdDetailsPage";

vi.mock("../../../../lib/api", () => ({
  api: {
    getPrd: vi.fn(),
    listPrdMembers: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    getDirectory: vi.fn(),
    setWorkStatus: vi.fn(),
    setRouting: vi.fn(),
    suggestRouting: vi.fn(),
    decideRouting: vi.fn(),
    setPrdMember: vi.fn(),
    removePrdMember: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};

function doc(goals, metrics) {
  const section = (type, text) => ({
    type: "section",
    attrs: { type },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  return { type: "doc", content: [section("goals", goals), section("success_metrics", metrics)] };
}

const ALL_FALSE = {
  can_view: true,
  can_comment: true,
  can_edit: false,
  can_delete: false,
  can_assign: false,
  can_submit_review: false,
  can_approve: false,
  can_request_ai: false,
  can_update_work_status: false,
  can_request_classification: false,
  can_set_routing: false,
  can_request_review_suggestions: false,
};

function prdRow(overrides = {}) {
  return {
    id: "p1",
    title: "Checkout Redesign",
    description: "A faster checkout.",
    owner_id: "aksh",
    organization_id: "org",
    project_id: null,
    my_role: "owner",
    owning_team_id: null,
    priority: null,
    status: "in_review",
    review_state: "in_review",
    work_status: "not_started",
    content_json: doc("Ship in two steps.", "Completion rises to 72%."),
    content_text: "",
    doc_schema_version: 2,
    revision: 7,
    created_at: "2026-10-21T10:00:00Z",
    updated_at: "2026-11-13T09:12:00Z",
    approval: {
      round_id: "r2",
      round_no: 2,
      version_id: "v6",
      state: "in_review",
      required_count: 2,
      approved_count: 1,
      reviewers: [
        { user_id: "hannah", name: "Hannah Okafor", department: "Design", state: "approved", decided_at: "2026-11-13T10:40:00Z", explanation: null, comment_id: null },
        { user_id: "ken", name: "Ken Tanaka", department: "Engineering", state: "pending", decided_at: null, explanation: null, comment_id: null },
      ],
    },
    capabilities: { ...ALL_FALSE },
    current_version: { id: "v6", version_no: 6 },
    project: { id: "proj", name: "Payments" },
    owners: [{ id: "aksh", name: "Aksh Patel" }],
    changed_since_approval: false,
    ...overrides,
  };
}

const versionsPage = {
  items: [
    { id: "v6", version_no: 6, saved_revision: 7, actor: { id: "hannah", name: "Hannah Okafor" }, origin: "pm_edit", created_at: "2026-11-13T09:12:00Z", changed_sections: ["goals", "success_metrics"], change_summary: "Tightened the goals." },
    { id: "v5", version_no: 5, saved_revision: 6, actor: { id: "aksh", name: "Aksh Patel" }, origin: "ai_generated", created_at: "2026-11-12T15:48:00Z", changed_sections: ["requirements"], change_summary: null },
  ],
  next_cursor: "older",
};

const members = [
  { user_id: "ken", name: "Ken Tanaka", role: "viewer", granted_by: "aksh", added_at: "2026-10-22T10:00:00Z" },
  { user_id: "aksh", name: "Aksh Patel", role: "owner", granted_by: null, added_at: "2026-10-21T10:00:00Z" },
];

const directory = {
  organization: { id: "org", name: "Org" },
  departments: [],
  teams: [
    { id: "t-pay", name: "Payments Team", department_id: null, lead_id: null, archived: false },
    { id: "t-growth", name: "Growth Team", department_id: null, lead_id: null, archived: false },
  ],
  members: [],
};

let root;
let host;
let onNavigate;
let onOpenEditor;

async function show(view = { tab: "overview" }) {
  onNavigate = vi.fn();
  onOpenEditor = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <PrdDetailsPage
        prd={{ id: "p1", title: "Checkout Redesign" }}
        view={view}
        organizationId="org"
        userId="aksh"
        onNavigate={onNavigate}
        onOpenEditor={onOpenEditor}
        onHome={vi.fn()}
      />,
    );
  });
}

const text = () => host.textContent;
const buttonNamed = (name) => [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);

async function click(element) {
  await act(async () => {
    element.click();
  });
}

async function choose(element, value) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setValue.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getPrd.mockResolvedValue(prdRow());
  api.listPrdMembers.mockResolvedValue(members);
  api.listVersions.mockResolvedValue(versionsPage);
  api.getDirectory.mockResolvedValue(directory);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PRD details overview", () => {
  it("shows the PRD, its people, approval progress and latest versions", async () => {
    await show();
    expect(host.querySelector("h1").textContent).toBe("Checkout Redesign");
    expect(text()).toContain("Project: Payments");
    expect(text()).toContain("Owner: Aksh Patel");
    expect(text()).toContain("1 of 2 approved");
    expect(text()).toContain("Hannah Okafor");
    // Owners first, and the viewer marked as such.
    const people = [...host.querySelectorAll(".nd-people li")].map((item) => item.textContent);
    expect(people[0]).toContain("Aksh Patel · you");
    expect(people[1]).toContain("Ken TanakaViewer");
    expect(text()).toContain("v6");
    expect(text()).toContain("Hannah Okafor · Goals, Success metrics");
  });

  it("shows team and priority as text to someone who can't change them", async () => {
    await show();
    expect(host.querySelector("select")).toBeNull();
    expect(text()).toContain("No team");
    expect(text()).toContain("Not set");
    expect(buttonNamed("Suggest with AI")).toBeUndefined();
  });

  it("saves a new priority with the current team", async () => {
    const capabilities = { ...ALL_FALSE, can_set_routing: true };
    api.getPrd.mockResolvedValue(prdRow({ capabilities, owning_team_id: "t-pay" }));
    api.setRouting.mockResolvedValue(prdRow({ owning_team_id: "t-pay", priority: "high" }));
    await show();
    const [team, priority] = host.querySelectorAll("select");
    expect(team.value).toBe("t-pay");
    await choose(priority, "high");
    expect(api.setRouting).toHaveBeenCalledWith("p1", { teamId: "t-pay", priority: "high" });
    expect(priority.value).toBe("high");
  });

  it("takes an AI suggestion for the team and priority only when accepted", async () => {
    const capabilities = { ...ALL_FALSE, can_set_routing: true, can_request_classification: true };
    api.getPrd.mockResolvedValue(prdRow({ capabilities }));
    api.suggestRouting.mockResolvedValue({
      suggestion: { id: "s1", team_id: "t-growth", priority: "medium", rationale: "It's about conversion." },
    });
    api.decideRouting.mockResolvedValue(prdRow({ owning_team_id: "t-growth", priority: "medium" }));
    await show();
    await click(buttonNamed("Suggest with AI"));
    expect(api.suggestRouting).toHaveBeenCalledWith("p1", 7);
    expect(text()).toContain("AI suggests: Growth Team · Medium priority");
    expect(api.setRouting).not.toHaveBeenCalled();
    await click(buttonNamed("Use this"));
    expect(api.decideRouting).toHaveBeenCalledWith("p1", "s1", { decision: "accepted" });
    expect(host.querySelectorAll("select")[0].value).toBe("t-growth");
  });

  it("keeps work status locked until the PRD is approved", async () => {
    await show();
    expect(text()).toContain("Can change once the PRD is approved.");
    expect(buttonNamed("In progress").disabled).toBe(true);
  });

  it("tells a viewer who can change the work status", async () => {
    api.getPrd.mockResolvedValue(prdRow({ my_role: "viewer" }));
    await show();
    expect(text()).toContain("Only the PRD’s owners and org admins can change it.");
    expect(text()).not.toContain("Can change once the PRD is approved.");
  });

  it("moves work status one step at a time when allowed", async () => {
    const capabilities = { ...ALL_FALSE, can_update_work_status: true };
    api.getPrd.mockResolvedValue(prdRow({ status: "final", review_state: "approved", capabilities }));
    api.setWorkStatus.mockResolvedValue({ ...prdRow({ status: "final", work_status: "in_progress" }), can_update_work_status: true, changed_since_approval: false });
    await show();
    expect(buttonNamed("Done").disabled).toBe(true);
    await click(buttonNamed("In progress"));
    expect(api.setWorkStatus).toHaveBeenCalledWith("p1", { from: "not_started", to: "in_progress" });
    expect(buttonNamed("In progress").getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Done").disabled).toBe(false);
  });

  it("opens the history tab", async () => {
    await show();
    await click(buttonNamed("History (6)"));
    expect(onNavigate).toHaveBeenCalledWith({ tab: "history" });
  });
});

describe("revision history", () => {
  it("lists versions newest first with who, what changed and the current one marked", async () => {
    await show({ tab: "history" });
    const rows = [...host.querySelectorAll(".nd-version")];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Current version");
    expect(rows[0].textContent).toContain("Tightened the goals.");
    expect(rows[1].textContent).toContain("AI suggestion accepted");
    expect(rows[1].textContent).toContain("Requirements");
    // The current version has nothing to compare with.
    expect(rows[0].textContent).not.toContain("Compare with current");
    await click([...rows[1].querySelectorAll("button")].find((button) => button.textContent.startsWith("Compare")));
    expect(onNavigate).toHaveBeenCalledWith({ tab: "history", versionId: "v5", compare: true });
  });

  it("loads older versions after the first page", async () => {
    api.listVersions
      .mockResolvedValueOnce(versionsPage)
      .mockResolvedValueOnce({
        items: [{ id: "v4", version_no: 4, saved_revision: 5, actor: null, origin: "checkpoint", created_at: "2026-11-01T10:00:00Z", changed_sections: [], change_summary: null }],
        next_cursor: null,
      });
    await show({ tab: "history" });
    await click(buttonNamed("Show older versions"));
    expect(api.listVersions).toHaveBeenLastCalledWith("p1", { cursor: "older" });
    expect(host.querySelectorAll(".nd-version")).toHaveLength(3);
    expect(text()).toContain("Saved before history");
    expect(buttonNamed("Show older versions")).toBeUndefined();
  });

  it("says so when the history can't load", async () => {
    api.listVersions.mockRejectedValue(new Error("Server down."));
    await show({ tab: "history" });
    expect(host.querySelector("[role=alert]").textContent).toContain("Couldn’t load the history. Server down.");
  });

  it("reads one version, read-only, with its changed sections marked", async () => {
    api.getVersion.mockResolvedValue({
      ...versionsPage.items[1],
      title: "Checkout Redesign",
      description: "Older description.",
      content_json: doc("Ship fast.", "Completion rises to 70%."),
      doc_schema_version: 2,
      generation_record_id: null,
      changed_sections: ["goals"],
    });
    await show({ tab: "history", versionId: "v5" });
    expect(api.getVersion).toHaveBeenCalledWith("p1", "v5");
    expect(text()).toContain("You’re reading version 5");
    expect(text()).toContain("The current version is 6.");
    expect(text()).toContain("Ship fast.");
    expect(host.querySelector(".nd-doc-section.is-changed h3").textContent).toBe("Goals");
    expect(host.querySelector("textarea, [contenteditable]")).toBeNull();
    await click(buttonNamed("Compare with current"));
    expect(onNavigate).toHaveBeenCalledWith({ tab: "history", versionId: "v5", compare: true });
  });

  it("compares a version with the current PRD word by word", async () => {
    api.getVersion.mockResolvedValue({
      ...versionsPage.items[1],
      title: "Checkout Redesign",
      description: null,
      content_json: doc("Ship in two steps.", "Completion rises to 70%."),
      doc_schema_version: 2,
      generation_record_id: null,
    });
    await show({ tab: "history", versionId: "v5", compare: true });
    expect(text()).toContain("Version 5 compared with the current version (6)");
    expect(text()).toContain("1 of 2 sections differ");
    // Only the changed section shows by default.
    expect(host.querySelectorAll(".nc-section")).toHaveLength(1);
    expect(host.querySelector("del").textContent).toContain("70");
    expect(host.querySelector("ins").textContent).toContain("72");
  });
});

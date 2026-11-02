// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import DashboardPage from "./DashboardPage";
import { isSharedWithMe } from "./format";

vi.mock("../../../lib/api", () => ({ api: { getPrd: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const row = (id, title, myRole, status = "final") => ({
  id,
  title,
  myRole,
  status,
  projectId: null,
  updatedAt: "2026-11-01T11:00:00Z",
  description: "",
  sections: [{ id: "problem", title: "Problem", html: "<p>Text.</p>" }],
  answers: {},
  answersLoaded: true,
});
const owned = row("mine", "My Own PRD", "owner");
const adminView = row("admin", "Admin View PRD", "org_admin");
const asEditor = row("ed", "Editor PRD", "editor");
const asViewer = row("vw", "Viewer PRD", "viewer");

let root;
let host;

async function show(prds) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <DashboardPage
        account={{ name: "Erin Engineer" }}
        organization={{ name: "Campus Apps", access_role: "member" }}
        prds={prds}
        prdsLoaded
        projects={[]}
        questions={[]}
        shortcut="⌘K"
        onNavigate={vi.fn()}
        onCreatePrd={vi.fn()}
        onOpenPrd={vi.fn()}
        onLoadAnswers={vi.fn()}
        onRenamePrd={vi.fn()}
        onDeletePrd={vi.fn()}
      />,
    );
  });
}

const sharedSection = () => host.querySelector('[aria-labelledby="nw-shared-h"]');
const mainTable = () => host.querySelector("#nw-prds");

beforeEach(() => {
  vi.resetAllMocks();
  api.getPrd.mockResolvedValue({ owners: [{ id: "u", name: "Ben PM" }], project: { id: "p", name: "Campus Life" } });
});

afterEach(async () => {
  if (!root) return;
  await act(async () => root.unmount());
  host.remove();
  root = null;
});

describe("isSharedWithMe", () => {
  it("matches the backend's view=shared rule", () => {
    expect([owned, adminView, asEditor, asViewer].map(isSharedWithMe)).toEqual([false, false, true, true]);
  });
});

describe("Shared with me", () => {
  it("is hidden when nothing is shared", async () => {
    await show([owned]);
    expect(sharedSection()).toBeNull();
    expect(api.getPrd).not.toHaveBeenCalled();
  });

  it("splits shared PRDs from the person's own", async () => {
    await show([owned, adminView, asEditor, asViewer]);
    expect(mainTable().textContent).toContain("My Own PRD");
    expect(mainTable().textContent).toContain("Admin View PRD");
    expect(mainTable().textContent).not.toContain("Editor PRD");
    expect(sharedSection().textContent).toContain("Editor PRD");
    expect(sharedSection().textContent).toContain("Viewer PRD");
    expect(sharedSection().textContent).not.toContain("My Own PRD");
    expect(host.textContent).toContain("You have 2 final PRDs.");
  });

  it("shows the role, the owner and the project", async () => {
    await show([asEditor]);
    expect(api.getPrd).toHaveBeenCalledWith("ed");
    const cells = [...sharedSection().querySelectorAll("tbody td")].map((cell) => cell.textContent);
    expect(cells.slice(1, 4)).toEqual(["Editor", "Ben PM", "Campus Life"]);
  });

  it("says when a shared PRD has no project", async () => {
    api.getPrd.mockResolvedValue({ owners: [{ id: "u", name: null }], project: null });
    await show([asViewer]);
    const cells = [...sharedSection().querySelectorAll("tbody td")].map((cell) => cell.textContent);
    expect(cells.slice(1, 4)).toEqual(["Viewer", "Unnamed member", "No project"]);
  });

  it("keeps the row when the names can't be loaded", async () => {
    api.getPrd.mockRejectedValue(new Error("Network down"));
    await show([asEditor]);
    expect(sharedSection().textContent).toContain("Editor PRD");
    expect(sharedSection().textContent).toContain("Not available");
  });

  it("works for someone with only shared PRDs", async () => {
    await show([asViewer]);
    expect(mainTable()).toBeNull();
    expect(host.textContent).toContain("You don’t have any PRDs of your own yet.");
    expect(sharedSection().textContent).toContain("Viewer PRD");
  });
});

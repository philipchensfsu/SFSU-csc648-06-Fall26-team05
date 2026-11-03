// @vitest-environment jsdom
// The optional split view: the chat beside the document instead of in the
// side panel.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorPage from "./EditorPage";
import { api } from "../../../../lib/api";

vi.mock("../../../../lib/api", () => ({
  api: {
    getDirectory: vi.fn(),
    listReviews: vi.fn(),
    chatAboutPrd: vi.fn(),
    // The Comments tab (#133) loads its list when the editor opens.
    listPrdComments: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};
Element.prototype.scrollIntoView = function scrollIntoView() {};

const prd = {
  id: "p1",
  title: "A PRD",
  description: "",
  status: "draft",
  reviewState: null,
  myRole: "owner",
  updatedAt: "2026-11-01T11:00:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  sections: [{ id: "problem", title: "Problem", html: "<p>Students drive to campus.</p>" }],
};

let root;
let host;

async function show(props) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorPage
        prd={prd}
        detail={{ capabilities: { can_edit: true }, owners: [] }}
        organizationId="org"
        userId="alice"
        onSave={vi.fn().mockResolvedValue()}
        onReload={vi.fn()}
        onOpenAnswers={vi.fn()}
        onExit={vi.fn()}
        onHome={vi.fn()}
        {...props}
      />,
    );
  });
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
const click = (button) => act(async () => button.click());
const body = () => host.querySelector(".ne-body");

beforeEach(() => {
  vi.clearAllMocks();
  api.getDirectory.mockResolvedValue({ organization: { id: "org" }, members: [] });
  api.listReviews.mockResolvedValue({ items: [] });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("split view", () => {
  it("is off until asked for, so the usual columns are what you get", async () => {
    await show();
    expect(body().classList.contains("is-split")).toBe(false);
    expect(host.querySelector(".ne-pane-chat")).toBeNull();
    expect(buttonNamed("Ask Nautilus")).toBeTruthy();
  });

  it("puts the chat in its own pane, and takes it out of the side panel", async () => {
    await show();
    await click(buttonNamed("Ask Nautilus"));
    expect(body().classList.contains("is-split")).toBe(true);
    const pane = host.querySelector(".ne-pane-chat");
    expect(pane).toBeTruthy();
    // One chat on the page, and it is no longer a tab panel.
    expect(host.querySelectorAll(".ne-chat").length).toBe(1);
    expect(pane.querySelector('[role="tabpanel"]')).toBeNull();
    expect([...host.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes("Ask AI"))).toBe(false);
  });

  it("goes back to the side panel when closed", async () => {
    await show();
    await click(buttonNamed("Ask Nautilus"));
    await click(buttonNamed("Close chat"));
    expect(body().classList.contains("is-split")).toBe(false);
    expect(host.querySelector(".ne-pane-chat")).toBeNull();
    expect([...host.querySelectorAll('[role="tab"]')].some((t) => t.textContent.includes("Ask AI"))).toBe(true);
  });

  it("isn't offered while previewing an AI draft", async () => {
    await show({
      aiDraft: { onAccept: vi.fn(), onDiscard: vi.fn(), onRegenerate: vi.fn() },
      detail: null,
    });
    expect(buttonNamed("Ask Nautilus")).toBeFalsy();
  });

  it("closes itself when a reviewer heads for the review card", async () => {
    // The card lives in the side panel, which split view hides.
    await show({
      detail: {
        capabilities: { can_edit: true, can_approve: true },
        owners: [],
        approval: {
          round_id: "r1",
          version_id: "v1",
          state: "in_review",
          required_count: 1,
          approved_count: 0,
          reviewers: [{ user_id: "alice", name: "Alice PM", department: null, state: "pending", decided_at: null, explanation: null }],
        },
      },
    });
    await click(buttonNamed("Ask Nautilus"));
    expect(body().classList.contains("is-split")).toBe(true);
    await click(buttonNamed("Approve"));
    expect(body().classList.contains("is-split")).toBe(false);
    expect(host.querySelector(".ne-rail")).toBeTruthy();
  });

  it("keeps the toggle reachable on a phone while the pane is open", async () => {
    await show();
    const closed = buttonNamed("Ask Nautilus");
    expect(closed.className).toContain("ne-hide-sm");
    await click(closed);
    // Hiding it once open would leave no way to close the pane.
    expect(buttonNamed("Close chat").className).not.toContain("ne-hide-sm");
  });
});

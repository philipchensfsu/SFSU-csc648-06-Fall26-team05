// @vitest-environment jsdom
// The editor's side panel: Ask Nautilus, Comments or Review on the right of
// the document, opened from the top bar, closed to a slim rail, and resized
// by dragging the divider.
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
// The Review button carries a count when there are assumptions to confirm.
const reviewButton = () =>
  [...host.querySelectorAll(".ne-bar button")].find((button) => button.textContent.trim().startsWith("Review"));
const panel = () => host.querySelector(".ne-panel");
const grip = () => host.querySelector('[role="separator"]');
const keyOn = (element, key) =>
  act(async () => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getDirectory.mockResolvedValue({ organization: { id: "org" }, members: [] });
  api.listReviews.mockResolvedValue({ items: [] });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the side panel", () => {
  it("starts closed, so the document gets the page, with a rail to open Nautilus", async () => {
    await show();
    expect(panel()).toBeNull();
    expect(host.querySelector(".ne-chat")).toBeNull();
    await click(host.querySelector('[aria-label="Open Ask Nautilus"]'));
    expect(panel().querySelector(".ne-chat")).not.toBeNull();
    expect(host.querySelector(".ne-panel-rail")).toBeNull();
  });

  it("has one way into the chat: no Ask AI tab", async () => {
    await show({ initialRailTab: "review" });
    expect(host.querySelector('[role="tab"]')).toBeNull();
    expect(buttonNamed("Ask AI")).toBeUndefined();
  });

  it("switches views from the top bar, and pressing the open one closes it", async () => {
    await show();
    await click(buttonNamed("Comments"));
    expect(buttonNamed("Comments").getAttribute("aria-pressed")).toBe("true");
    expect(panel().querySelector(".ne-comments").hidden).toBe(false);
    await click(buttonNamed("Ask Nautilus"));
    expect(buttonNamed("Comments").getAttribute("aria-pressed")).toBe("false");
    expect(panel().querySelector(".ne-chat")).not.toBeNull();
    expect(panel().querySelector(".ne-comments").hidden).toBe(true);
    await click(buttonNamed("Ask Nautilus"));
    expect(panel()).toBeNull();
  });

  it("starts a new conversation from the chat's header, and closes from there too", async () => {
    api.chatAboutPrd.mockResolvedValue({ kind: "answer", message: "No risks listed yet." });
    await show({ initialRailTab: "ai" });
    const newChat = () => host.querySelector('[aria-label="New conversation"]');
    expect(newChat().disabled).toBe(true); // nothing to clear yet
    const box = panel().querySelector("textarea");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, "What are the open risks?");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonNamed("Send"));
    expect(panel().querySelectorAll(".ne-turn")).toHaveLength(2);
    expect(box.placeholder).toBe("Ask a follow-up, or tell Nautilus what to change…");
    await click(newChat());
    expect(panel().querySelectorAll(".ne-turn")).toHaveLength(0);
    await click(host.querySelector('[aria-label="Close Ask Nautilus"]'));
    expect(panel()).toBeNull();
  });

  it("closes from its own Close button", async () => {
    await show({ initialRailTab: "comments" });
    await click(host.querySelector('[aria-label="Close Comments"]'));
    expect(panel()).toBeNull();
  });

  it("isn't offered while previewing an AI draft, apart from Review", async () => {
    await show({
      aiDraft: { onAccept: vi.fn(), onDiscard: vi.fn(), onRegenerate: vi.fn() },
      detail: null,
    });
    expect(buttonNamed("Ask Nautilus")).toBeUndefined();
    expect(buttonNamed("Comments")).toBeUndefined();
    expect(host.querySelector(".ne-panel-rail")).toBeNull();
    await click(reviewButton());
    expect(panel().textContent).toContain("Assumptions to confirm");
  });

  it("opens on Review when a reviewer heads for their decision", async () => {
    await show({
      initialRailTab: "ai",
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
    await click(buttonNamed("Approve"));
    expect(reviewButton().getAttribute("aria-pressed")).toBe("true");
    expect(panel().textContent).toContain("Your review");
  });
});

describe("resizing the side panel", () => {
  const width = () => Number(grip().getAttribute("aria-valuenow"));

  it("moves with the arrow keys, stays within its limits, and resets on double-click", async () => {
    await show({ initialRailTab: "ai" });
    expect(width()).toBe(38);
    expect(panel().style.flexBasis).toBe("38%");
    await keyOn(grip(), "ArrowLeft");
    expect(width()).toBe(41);
    for (let i = 0; i < 20; i += 1) await keyOn(grip(), "ArrowLeft");
    expect(width()).toBe(60);
    for (let i = 0; i < 30; i += 1) await keyOn(grip(), "ArrowRight");
    expect(width()).toBe(25);
    await act(async () => grip().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(width()).toBe(38);
  });

  it("remembers the width for next time", async () => {
    await show({ initialRailTab: "ai" });
    await keyOn(grip(), "ArrowRight");
    expect(window.localStorage.getItem("nautilus.editor.panelWidth")).toBe("35");
    await act(async () => root.unmount());
    host.remove();
    await show({ initialRailTab: "ai" });
    expect(width()).toBe(35);
  });
});

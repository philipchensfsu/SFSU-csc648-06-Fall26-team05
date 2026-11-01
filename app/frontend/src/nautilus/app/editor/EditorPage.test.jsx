// @vitest-environment jsdom
// What the editor shows for each answer from GET /api/prds/{id}: the buttons
// follow `capabilities` and nothing is editable until the answer arrives.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorPage from "./EditorPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const prd = {
  id: "p1",
  title: "A PRD",
  description: "",
  status: "draft",
  reviewState: null,
  myRole: "viewer",
  updatedAt: "2026-11-01T11:00:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  sections: [
    { id: "problem", title: "Problem", html: '<p><mark class="nt-assumption">Students drive</mark> to campus.</p>' },
  ],
};
const allowed = { capabilities: { can_edit: true } };
const viewer = { capabilities: { can_edit: false, can_request_ai: false } };

let root;
let host;

async function show(props) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorPage prd={prd} onSave={vi.fn()} onReload={vi.fn()} onOpenAnswers={vi.fn()} onExit={vi.fn()} onHome={vi.fn()} {...props} />,
    );
  });
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
const askAiTab = () => [...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Ask AI");

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("EditorPage access", () => {
  it("offers no editing and doesn't say View only until the detail arrives", async () => {
    await show({ detail: null });
    expect(buttonNamed("Save")).toBeUndefined();
    expect(buttonNamed("Edit")).toBeUndefined();
    expect(buttonNamed("Confirm")).toBeUndefined();
    expect(host.textContent).not.toContain("View only");
  });

  it("offers editing when can_edit is true, whatever my_role says", async () => {
    await show({ detail: allowed });
    expect(buttonNamed("Save")).toBeDefined();
    expect(buttonNamed("Edit")).toBeDefined();
    expect(host.textContent).not.toContain("View only");
  });

  it("is view only when can_edit is false, whatever my_role says", async () => {
    await show({ prd: { ...prd, myRole: "owner" }, detail: viewer });
    expect(buttonNamed("Save")).toBeUndefined();
    expect(buttonNamed("Edit")).toBeUndefined();
    expect(host.textContent).toContain("View only");
    expect(host.textContent).toContain("Ask its owner for edit access");
  });

  it("explains why an approved PRD can't be edited", async () => {
    await show({ prd: { ...prd, status: "final", reviewState: "approved" }, detail: viewer });
    expect(host.textContent).toContain("Only its owners can change it now");
  });

  it("keeps Ask AI for viewers (Decision 5)", async () => {
    await show({ detail: viewer });
    expect(askAiTab()).toBeDefined();
  });

  it("stays read-only and offers a retry when the detail can't be read", async () => {
    const onRetryDetail = vi.fn();
    await show({ detail: { id: "p1", error: "Network down" }, onRetryDetail });
    expect(buttonNamed("Save")).toBeUndefined();
    expect(host.textContent).toContain("Couldn’t check what you can do");
    await act(async () => buttonNamed("Try again").click());
    expect(onRetryDetail).toHaveBeenCalledOnce();
  });
});

describe("EditorPage review status", () => {
  it("shows the approval count and the changed-since-approval banner", async () => {
    await show({
      detail: { ...allowed, changedSinceApproval: true, approval: { approved_count: 1, required_count: 2 } },
    });
    expect(host.textContent).toContain("1 of 2 approved");
    expect(host.textContent).toContain("Changed since approval.");
  });

  it("shows neither without a review", async () => {
    await show({ detail: { ...allowed, changedSinceApproval: false, approval: { approved_count: 0, required_count: 0 } } });
    expect(host.textContent).not.toContain("approved");
    expect(host.textContent).not.toContain("Changed since approval.");
  });

  it("shows the review state in the header", async () => {
    await show({ prd: { ...prd, status: "in_review", reviewState: "changes_requested" }, detail: allowed });
    expect(host.querySelector(".nw-chip").textContent).toBe("Changes requested");
  });
});

describe("EditorPage save errors", () => {
  // Confirming an assumption makes the document dirty without opening TipTap.
  async function saveRejectedWith(error) {
    await show({ detail: allowed, onSave: vi.fn().mockRejectedValue(error) });
    await act(async () => buttonNamed("Confirm").click());
    await act(async () => buttonNamed("Save").click());
  }

  it("offers the latest version after a stale save", async () => {
    await saveRejectedWith(Object.assign(new Error("Stale"), { status: 409, code: "stale_revision" }));
    expect(host.textContent).toContain("This PRD changed since you opened it.");
    expect(buttonNamed("Load the latest version")).toBeDefined();
  });

  it("doesn't call reapproval_required a conflict", async () => {
    const message = "This PRD is approved. Confirm its reviewers to save your edits.";
    await saveRejectedWith(Object.assign(new Error(message), { status: 409, code: "reapproval_required" }));
    expect(host.textContent).toContain(message);
    expect(host.textContent).not.toContain("This PRD changed since you opened it.");
    expect(buttonNamed("Load the latest version")).toBeUndefined();
  });
});

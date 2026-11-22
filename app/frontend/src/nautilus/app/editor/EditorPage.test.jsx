// @vitest-environment jsdom
// What the editor shows for each answer from GET /api/prds/{id}: the buttons
// follow `capabilities` and nothing is editable until the answer arrives.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorPage from "./EditorPage";
import { SECTION_TYPES } from "./schema";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom doesn't implement the native dialog.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};

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
      // Review starts open: several tests confirm an assumption from it.
      <EditorPage
        prd={prd}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onOpenAnswers={vi.fn()}
        onExit={vi.fn()}
        onHome={vi.fn()}
        initialRailTab="review"
        {...props}
      />,
    );
  });
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);


afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
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

  it("offers Share only with can_assign", async () => {
    await show({ detail: { capabilities: { can_edit: true, can_assign: false } } });
    expect(buttonNamed("Share")).toBeUndefined();
    await act(async () => root.unmount());
    host.remove();
    await show({ detail: { capabilities: { can_edit: true, can_assign: true } } });
    expect(buttonNamed("Share")).toBeDefined();
  });

  it("keeps Ask Nautilus for viewers (Decision 5)", async () => {
    await show({ detail: viewer });
    await act(async () => buttonNamed("Ask Nautilus").click());
    expect(host.querySelector(".ne-panel .ne-chat")).not.toBeNull();
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
});

describe("EditorPage and the browser's Back button", () => {
  // The editor's entry, one PRD page deep; Back lands on the workspace's.
  const atEditor = () => window.history.replaceState({ nautilusPrdDepth: 1 }, "", "/prds/p1/edit");
  const backToWorkspace = () =>
    act(async () => {
      window.history.replaceState(null, "", "/dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

  it("leaves at once with nothing unsaved", async () => {
    atEditor();
    const onBrowserBack = vi.fn();
    await show({ detail: allowed, browserPath: "/prds/p1/edit", onBrowserBack });
    await backToWorkspace();
    expect(onBrowserBack).toHaveBeenCalledTimes(1);
  });

  it("undoes the step and asks first with unsaved changes, then takes it again", async () => {
    atEditor();
    const onBrowserBack = vi.fn();
    await show({ detail: allowed, browserPath: "/prds/p1/edit", onBrowserBack });
    await act(async () => buttonNamed("Confirm").click());
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await backToWorkspace();
    expect(forward).toHaveBeenCalledTimes(1);
    expect(onBrowserBack).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Leave without saving?");

    await act(async () => buttonNamed("Discard changes").click());
    expect(back).toHaveBeenCalledTimes(1);
    // The step taken again isn't asked about twice.
    await backToWorkspace();
    expect(onBrowserBack).toHaveBeenCalledTimes(1);
  });
});

describe("EditorPage adding a section", () => {
  const headings = () => [...host.querySelectorAll(".ne-section-title")].map((h) => h.textContent);

  it("isn't offered to someone who can't edit", async () => {
    await show({ detail: viewer });
    expect(buttonNamed("Add section")).toBeUndefined();
  });

  it("offers only the missing sections and adds the one picked in its place", async () => {
    await show({ detail: allowed });
    await act(async () => buttonNamed("Add section").click());
    const select = host.querySelector("dialog select");
    const options = [...select.options].map((option) => option.textContent);
    expect(options).not.toContain("Problem Statement");
    expect(options).toHaveLength(8);

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setValue.call(select, "risks");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => host.querySelector("dialog form").requestSubmit());
    expect(headings()).toEqual(["Problem", "Risks"]);
    expect(host.textContent).toContain("Editing");
  });

  it("isn't offered once all nine sections are there", async () => {
    const all = SECTION_TYPES.map(([id, title]) => ({ id, title, html: "<p>Text.</p>" }));
    await show({ detail: allowed, prd: { ...prd, sections: all } });
    expect(buttonNamed("Add section")).toBeUndefined();
  });
});

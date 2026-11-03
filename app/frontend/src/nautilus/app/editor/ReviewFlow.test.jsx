// @vitest-environment jsdom
// Submitting a PRD for review and deciding on one, from the editor.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../lib/api";
import EditorPage from "./EditorPage";
import { reviewerCandidates } from "../format";

// The editor's side panel loads comments as well, so the mock carries those.
vi.mock("../../../../lib/api", () => ({
  api: {
    getDirectory: vi.fn(),
    listReviews: vi.fn(),
    listPrdComments: vi.fn(),
    addPrdComment: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom doesn't implement the native dialog or scrolling.
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
  sections: [
    { id: "problem", title: "Problem", html: '<p><mark class="nt-assumption">Students drive</mark> to campus.</p>' },
  ],
};
const members = [
  { user_id: "alice", name: "Alice PM", email: "alice@example.com" },
  { user_id: "ben", name: "Ben PM", email: "ben@example.com" },
  { user_id: "erin", name: "Erin Engineer", email: null, title: "Backend" },
];
const owner = {
  capabilities: { can_edit: true, can_submit_review: true },
  owners: [{ id: "alice", name: "Alice PM" }],
};
const reviewer = {
  capabilities: { can_edit: false, can_approve: true },
  owners: [{ id: "alice", name: "Alice PM" }],
  approval: {
    round_id: "r1",
    version_id: "v1",
    state: "in_review",
    required_count: 2,
    approved_count: 1,
    reviewers: [
      { user_id: "ben", name: "Ben PM", department: "Product", state: "approved", decided_at: "2026-11-01T11:00:00Z", explanation: "Looks good" },
      { user_id: "erin", name: "Erin Engineer", department: null, state: "pending", decided_at: null, explanation: null },
    ],
  },
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
        organizationId="org"
        userId="erin"
        onSave={vi.fn().mockResolvedValue()}
        onSubmitReview={vi.fn().mockResolvedValue()}
        onDecideReview={vi.fn().mockResolvedValue()}
        onReload={vi.fn()}
        onOpenAnswers={vi.fn()}
        onExit={vi.fn()}
        onHome={vi.fn()}
        {...props}
      />,
    );
  });
}

const buttonsNamed = (name) =>
  [...host.querySelectorAll("button")].filter((button) => button.textContent.trim() === name);
const buttonNamed = (name) => buttonsNamed(name)[0];
const lastButtonNamed = (name) => buttonsNamed(name).at(-1);
const openDialog = () => host.querySelector("dialog[open]");
const click = (button) => act(async () => button.click());

function typeInto(field, value) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  return act(async () => {
    set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getDirectory.mockResolvedValue({ organization: { id: "org", name: "Campus Apps" }, members });
  // The latest round's reviewers: Ben, and someone who has since left the org.
  api.listReviews.mockResolvedValue({ items: [{ reviewers: [{ user_id: "ben" }, { user_id: "gone" }] }] });
  api.listPrdComments.mockResolvedValue({ items: [], next_cursor: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("who sees the review buttons", () => {
  it("follows the capabilities", async () => {
    await show({ detail: { capabilities: { can_edit: true } } });
    expect(buttonNamed("Submit for review")).toBeUndefined();
    expect(buttonNamed("Approve")).toBeUndefined();
    expect(host.textContent).not.toContain("Your review");
  });

  it("offers a reviewer their decision, even without edit access", async () => {
    await show({ detail: reviewer });
    expect(buttonNamed("Request changes")).toBeDefined();
    expect(buttonNamed("Save")).toBeUndefined();
    expect(host.textContent).toContain("Your review");
    expect(host.textContent).toContain("You’ve been asked to review this PRD");
  });
});

describe("the approvals list", () => {
  it("shows each reviewer's state and note, and calls you You", async () => {
    await show({ detail: { ...reviewer, capabilities: {} } });
    expect(host.textContent).toContain("1 of 2 approved");
    expect(host.textContent).toContain("Ben PM");
    expect(host.textContent).toContain("Looks good");
    expect(host.textContent).toContain("Waiting");
    expect(host.textContent).toContain("You");
    expect(host.textContent).not.toContain("Erin Engineer");
  });

  it("isn't there without a review", async () => {
    await show({ detail: { ...owner, approval: { required_count: 0, approved_count: 0, reviewers: [] } } });
    expect(host.textContent).not.toContain("Approvals");
  });
});

describe("submitting for review", () => {
  it("leaves owners out of the reviewers, unless they are the whole org", () => {
    const ids = (list) => list.map((person) => person.user_id);
    expect(ids(reviewerCandidates(members, [{ id: "alice" }]))).toEqual(["ben", "erin"]);
    expect(ids(reviewerCandidates(members, members.map((m) => ({ id: m.user_id }))))).toEqual(["alice", "ben", "erin"]);
  });

  it("sends the people picked, and needs at least one", async () => {
    const onSubmitReview = vi.fn().mockResolvedValue();
    await show({ detail: owner, userId: "alice", onSubmitReview });
    await click(buttonNamed("Submit for review"));
    const dialog = openDialog();
    expect(dialog.textContent).toContain("Ben PM");
    expect(dialog.textContent).not.toContain("Alice PM");
    expect(lastButtonNamed("Submit for review").disabled).toBe(true);
    await click(dialog.querySelectorAll('input[type="checkbox"]')[1]);
    await click(lastButtonNamed("Submit for review"));
    expect(onSubmitReview).toHaveBeenCalledWith(["erin"]);
    expect(openDialog()).toBeNull();
  });

  it("saves unsaved edits first, and stops if that fails", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Nope")).mockResolvedValue();
    await show({ detail: owner, onSave });
    await click(buttonNamed("Confirm"));
    await click(buttonNamed("Submit for review"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(openDialog()).toBeNull();
    await click(buttonNamed("Submit for review"));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(openDialog()).not.toBeNull();
  });

  it("shows why a submit was refused, and keeps the dialog open", async () => {
    const onSubmitReview = vi.fn().mockRejectedValue(new Error("An owner can't review this PRD."));
    await show({ detail: owner, onSubmitReview });
    await click(buttonNamed("Submit for review"));
    await click(openDialog().querySelector('input[type="checkbox"]'));
    await click(lastButtonNamed("Submit for review"));
    expect(openDialog().textContent).toContain("An owner can't review this PRD.");
  });

  it("offers the latest version when the PRD changed", async () => {
    const error = Object.assign(new Error("Stale"), { status: 409, code: "stale_revision" });
    await show({ detail: owner, onSubmitReview: vi.fn().mockRejectedValue(error) });
    await click(buttonNamed("Submit for review"));
    await click(openDialog().querySelector('input[type="checkbox"]'));
    await click(lastButtonNamed("Submit for review"));
    expect(openDialog()).toBeNull();
    expect(buttonNamed("Load the latest version")).toBeDefined();
  });

  it("reads the detail again when a review is already open", async () => {
    const error = Object.assign(new Error("Already open"), { status: 409, code: "review_in_progress" });
    const onRetryDetail = vi.fn();
    await show({ detail: owner, onRetryDetail, onSubmitReview: vi.fn().mockRejectedValue(error) });
    await click(buttonNamed("Submit for review"));
    await click(openDialog().querySelector('input[type="checkbox"]'));
    await click(lastButtonNamed("Submit for review"));
    expect(onRetryDetail).toHaveBeenCalledOnce();
    expect(openDialog().textContent).toContain("Already open");
  });
});

describe("deciding on a review", () => {
  it("needs an explanation to request changes, and trims it", async () => {
    const onDecideReview = vi.fn().mockResolvedValue();
    await show({ detail: reviewer, onDecideReview });
    await click(buttonNamed("Request changes"));
    expect(buttonNamed("Send change request").disabled).toBe(true);
    await typeInto(host.querySelector(".ne-review-text"), "   ");
    expect(buttonNamed("Send change request").disabled).toBe(true);
    await typeInto(host.querySelector(".ne-review-text"), " Cut the scope ");
    await click(buttonNamed("Send change request"));
    expect(onDecideReview).toHaveBeenCalledWith({ decision: "changes_requested", explanation: "Cut the scope" });
  });

  it("approves without a note, and takes the header's choice", async () => {
    const onDecideReview = vi.fn().mockResolvedValue();
    await show({ detail: reviewer, onDecideReview });
    expect(buttonNamed("Approve this version")).toBeUndefined();
    await click(buttonNamed("Approve"));
    expect(document.activeElement).toBe(host.querySelector(".ne-review-text"));
    await click(buttonNamed("Approve this version"));
    expect(onDecideReview).toHaveBeenCalledWith({ decision: "approved", explanation: "" });
  });

  it("won't send while there are unsaved edits", async () => {
    await show({ detail: { ...reviewer, capabilities: { can_edit: true, can_approve: true } } });
    await click(buttonNamed("Confirm"));
    await click(buttonNamed("Approve"));
    expect(buttonNamed("Approve this version").disabled).toBe(true);
    expect(host.textContent).toContain("You have unsaved edits");
  });

  it("offers the latest version when the round moved on", async () => {
    const error = Object.assign(new Error("Stale"), { status: 409, code: "stale_version" });
    await show({ detail: reviewer, onDecideReview: vi.fn().mockRejectedValue(error) });
    await click(buttonNamed("Approve"));
    await click(buttonNamed("Approve this version"));
    expect(buttonNamed("Load the latest version")).toBeDefined();
  });

  it("shows why a decision was refused", async () => {
    const onDecideReview = vi.fn().mockRejectedValue(new Error("You already decided."));
    await show({ detail: reviewer, onDecideReview });
    await click(buttonNamed("Approve"));
    await click(buttonNamed("Approve this version"));
    expect(host.querySelector(".ne-your-review").textContent).toContain("You already decided.");
  });
});

describe("edits to an approved PRD", () => {
  const refused = Object.assign(new Error("Confirm its reviewers"), { status: 409, code: "reapproval_required" });
  const approvedOwner = { capabilities: { can_edit: true }, owners: [{ id: "alice", name: "Alice PM" }] };

  // Confirming an assumption makes the document dirty without opening TipTap.
  async function saveRefused(onSave) {
    await show({ prd: { ...prd, status: "final", reviewState: "approved" }, detail: approvedOwner, userId: "alice", onSave });
    await click(buttonNamed("Confirm"));
    await click(buttonNamed("Save"));
  }
  const boxes = () => [...openDialog().querySelectorAll('input[type="checkbox"]')];

  it("asks for reviewers instead of showing a conflict, starting from the latest round", async () => {
    await saveRefused(vi.fn().mockRejectedValue(refused));
    expect(openDialog().textContent).toContain("Your edits need new approval");
    expect(api.listReviews).toHaveBeenCalledWith("p1", { limit: 1 });
    expect(openDialog().textContent).not.toContain("Alice PM");
    expect(boxes().map((box) => box.checked)).toEqual([true, false]);
    expect(buttonNamed("Load the latest version")).toBeUndefined();
    expect(host.textContent).not.toContain("Couldn’t save.");
  });

  it("sends the same edits again with the people confirmed", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(refused).mockResolvedValue();
    await saveRefused(onSave);
    await click(boxes()[1]);
    await click(buttonNamed("Apply edits"));
    const [first] = onSave.mock.calls[0];
    const [second] = onSave.mock.calls[1];
    expect(first.confirmedReviewerIds).toBeUndefined();
    expect(second.confirmedReviewerIds).toEqual(["ben", "erin"]);
    expect(second.sections).toEqual(first.sections);
    expect(second.contentJson).toEqual(first.contentJson);
    expect(openDialog()).toBeNull();
    expect(buttonNamed("Save").disabled).toBe(true);
  });

  it("needs at least one reviewer", async () => {
    await saveRefused(vi.fn().mockRejectedValue(refused));
    expect(buttonNamed("Apply edits").disabled).toBe(false);
    await click(boxes()[0]);
    expect(buttonNamed("Apply edits").disabled).toBe(true);
  });

  it("drops the edits on Discard, saving nothing", async () => {
    const onSave = vi.fn().mockRejectedValue(refused);
    await saveRefused(onSave);
    expect(host.querySelector("mark.nt-assumption")).toBeNull();
    await click(buttonNamed("Discard edits"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(openDialog()).toBeNull();
    expect(host.querySelector("mark.nt-assumption")).not.toBeNull();
    expect(buttonNamed("Save").disabled).toBe(true);
  });

  it("keeps the edits on Keep editing", async () => {
    await saveRefused(vi.fn().mockRejectedValue(refused));
    await click(buttonNamed("Keep editing"));
    expect(openDialog()).toBeNull();
    expect(host.querySelector("mark.nt-assumption")).toBeNull();
    expect(buttonNamed("Save").disabled).toBe(false);
  });

  it("shows why Apply was refused, and keeps the dialog open", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(refused).mockRejectedValueOnce(new Error("An owner can't review this PRD."));
    await saveRefused(onSave);
    await click(buttonNamed("Apply edits"));
    expect(openDialog().textContent).toContain("An owner can't review this PRD.");
  });

  it("offers the latest version when someone else saved first", async () => {
    const stale = Object.assign(new Error("Stale"), { status: 409, code: "stale_revision" });
    await saveRefused(vi.fn().mockRejectedValueOnce(refused).mockRejectedValueOnce(stale));
    await click(buttonNamed("Apply edits"));
    expect(openDialog()).toBeNull();
    expect(buttonNamed("Load the latest version")).toBeDefined();
  });

  it("can retry when the reviewers can't be read, and still discard", async () => {
    api.listReviews.mockRejectedValueOnce(new Error("Network down"));
    await saveRefused(vi.fn().mockRejectedValue(refused));
    expect(openDialog().textContent).toContain("Couldn’t load the reviewers.");
    expect(buttonNamed("Apply edits")).toBeUndefined();
    await click(buttonNamed("Try again"));
    expect(buttonNamed("Apply edits")).toBeDefined();
  });
});

describe("commenting when someone saved first", () => {
  it("keeps the draft and the tab, and posts again on the new version", async () => {
    const stale = Object.assign(new Error("Stale"), { status: 409, code: "stale_version" });
    api.addPrdComment.mockRejectedValueOnce(stale).mockResolvedValueOnce({
      id: "c1", version_id: "v2", section_type: null, author: { name: "Erin Engineer" }, body: "Ship it",
      created_at: "2026-11-01T12:00:00Z",
    });
    const onReload = vi.fn();
    const onRetryDetail = vi.fn();
    const props = { onReload, onRetryDetail };
    await show({ ...props, detail: { ...owner, currentVersion: { id: "v1" } } });
    await click(buttonNamed("Comments"));
    await typeInto(host.querySelector(".ne-comment-box"), "Ship it");
    await click(buttonNamed("Comment"));
    expect(onRetryDetail).toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();

    // The refreshed detail arrives without remounting the editor.
    await act(async () =>
      root.render(
        <EditorPage
          prd={prd} organizationId="org" userId="erin" onSave={vi.fn()} onSubmitReview={vi.fn()}
          onDecideReview={vi.fn()} onOpenAnswers={vi.fn()} onExit={vi.fn()} onHome={vi.fn()}
          {...props} detail={{ ...owner, currentVersion: { id: "v2" } }}
        />,
      ),
    );
    expect(host.querySelector(".ne-comment-box").value).toBe("Ship it");
    expect(host.querySelector(".ne-comments").hidden).toBe(false); // still on the Comments tab
    await click(buttonNamed("Comment"));
    expect(api.addPrdComment).toHaveBeenLastCalledWith("p1", { versionId: "v2", body: "Ship it" });
    expect(host.textContent).toContain("Ship it");
  });
});

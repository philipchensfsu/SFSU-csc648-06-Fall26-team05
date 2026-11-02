// @vitest-environment jsdom
// The read-only preview of an unsaved AI draft, and what its errors say.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeGenerationError, isAiUnavailable, isDraftOutOfDate } from "./aiDraft";
import EditorPage from "./EditorPage";
import { api } from "../../../../lib/api";

// Opening the reapproval dialog loads the org directory and last round.
vi.mock("../../../../lib/api", () => ({
  api: { getDirectory: vi.fn(), listReviews: vi.fn() },
}));

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
  title: "A draft",
  description: "",
  status: "draft",
  reviewState: null,
  myRole: "owner",
  updatedAt: "2026-11-01T11:00:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  sections: [
    { id: "problem", title: "Problem", html: '<p><mark class="nt-assumption">Students drive</mark> to campus.</p>' },
    { id: "goals", title: "Goals", html: "<p></p>" },
  ],
};

let root;
let host;

async function show(aiDraft) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onHome = vi.fn();
  await act(async () => {
    root.render(
      <EditorPage
        prd={prd}
        detail={null}
        aiDraft={{ onAccept: vi.fn().mockResolvedValue(), onDiscard: vi.fn(), onRegenerate: vi.fn(), ...aiDraft }}
        onSave={vi.fn()}
        onReload={vi.fn()}
        onOpenAnswers={vi.fn()}
        onExit={vi.fn()}
        onHome={onHome}
      />,
    );
  });
  return { onHome };
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
const click = (button) => act(async () => button.click());

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the AI draft preview", () => {
  it("says it isn't saved, and offers no editing, export or chat", async () => {
    await show();
    expect(host.textContent).toContain("AI draft, not saved yet.");
    expect(buttonNamed("Accept draft")).toBeDefined();
    expect(buttonNamed("Discard")).toBeDefined();
    for (const name of ["Save", "Edit", "Confirm", "Export", "Ask AI", "Share", "Write this section"]) {
      expect(buttonNamed(name)).toBeUndefined();
    }
    expect(host.textContent).not.toContain("View only");
    expect(host.textContent).toContain("Students drive");
  });

  it("accepts and discards through its handlers", async () => {
    const onAccept = vi.fn().mockResolvedValue();
    const onDiscard = vi.fn();
    await show({ onAccept, onDiscard });
    await click(buttonNamed("Discard"));
    expect(onDiscard).toHaveBeenCalledOnce();
    await click(buttonNamed("Accept draft"));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("asks before leaving, since the draft would be lost", async () => {
    const { onHome } = await show();
    await click(buttonNamed("Dashboard"));
    expect(onHome).not.toHaveBeenCalled();
    expect(host.querySelector("dialog[open]").textContent).toContain("Discard this draft?");
    expect(buttonNamed("Save and leave")).toBeUndefined();
    await click(buttonNamed("Keep reviewing"));
    expect(host.querySelector("dialog[open]")).toBeNull();
    await click(buttonNamed("Dashboard"));
    await click(buttonNamed("Discard draft"));
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("offers Generate again when the draft is out of date", async () => {
    const onRegenerate = vi.fn();
    const error = Object.assign(new Error("Gone"), { status: 409, code: "proposal_unavailable" });
    await show({ onAccept: vi.fn().mockRejectedValue(error), onRegenerate });
    await click(buttonNamed("Accept draft"));
    expect(host.textContent).toContain("This draft is out of date.");
    expect(buttonNamed("Accept draft").disabled).toBe(false);
    await click(buttonNamed("Generate again"));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it("shows any other refusal, and stays on the draft", async () => {
    await show({ onAccept: vi.fn().mockRejectedValue(new Error("Network down")) });
    await click(buttonNamed("Accept draft"));
    expect(host.textContent).toContain("Network down");
    expect(buttonNamed("Generate again")).toBeUndefined();
    expect(host.textContent).toContain("AI draft, not saved yet.");
  });
});

describe("generation errors", () => {
  it("only calls AI unavailable when it can't run at all", () => {
    for (const code of ["ai_unavailable", "ai_budget_exhausted", "ai_disabled"]) {
      expect(isAiUnavailable({ code })).toBe(true);
    }
    expect(isAiUnavailable({ code: "ai_provider_error" })).toBe(false);
    expect(isAiUnavailable(new Error("Network down"))).toBe(false);
  });

  it("words the limits, with the wait when there is one", () => {
    expect(describeGenerationError({ code: "ai_cooldown", retryAfter: 4.2 })).toContain("Try again in 5s.");
    expect(describeGenerationError({ code: "ai_cooldown" })).not.toContain("Try again in");
    expect(describeGenerationError({ code: "intake_incomplete" })).toContain("need answers first");
    expect(describeGenerationError({ code: "intake_changed" })).toContain("Generate it again");
  });

  it("falls back to the backend's sentence", () => {
    expect(describeGenerationError(new Error("The context is malformed."))).toBe("The context is malformed.");
    expect(describeGenerationError({})).toContain("Try again");
  });

  it("knows which refusals mean the draft is out of date", () => {
    expect(isDraftOutOfDate({ code: "proposal_unavailable" })).toBe(true);
    expect(isDraftOutOfDate({ code: "stale_revision" })).toBe(true);
    expect(isDraftOutOfDate({ code: "invalid_document" })).toBe(false);
  });
});

describe("accepting into an approved PRD", () => {
  const refused = () => Object.assign(new Error("This PRD is approved."), {
    status: 409,
    code: "reapproval_required",
  });

  beforeEach(() => {
    api.getDirectory.mockResolvedValue({
      organization: { id: "org", name: "Campus Apps" },
      members: [{ user_id: "ben", name: "Ben PM" }],
    });
    api.listReviews.mockResolvedValue({ items: [{ reviewers: [{ user_id: "ben" }] }] });
  });

  it("asks who reviews it again instead of leaving a dead end", async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(refused());
    await show({ onAccept });
    await click(buttonNamed("Accept draft"));
    expect(host.textContent).toContain("Your edits need new approval");
    expect(host.textContent).not.toContain("Couldn’t accept this draft.");
  });

  it("accepts again with the confirmed reviewers", async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValueOnce();
    await show({ onAccept });
    await click(buttonNamed("Accept draft"));
    await click(buttonNamed("Apply edits"));
    expect(onAccept).toHaveBeenCalledTimes(2);
    expect(onAccept.mock.calls[1][0]).toEqual(["ben"]);
  });

  it("discarding from the dialog discards the draft", async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(refused());
    const onDiscard = vi.fn();
    await show({ onAccept, onDiscard });
    await click(buttonNamed("Accept draft"));
    await click(buttonNamed("Discard edits"));
    expect(onDiscard).toHaveBeenCalled();
  });
});

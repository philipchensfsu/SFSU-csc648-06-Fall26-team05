// @vitest-environment jsdom
// Conversational editing in the editor: the shared chat, "Propose changes",
// and comparing, accepting or discarding a proposal.
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorPage from "./EditorPage";
import { DEFAULT_INSTRUCTION } from "./AskAiPanel";
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
  revision: 4,
  updatedAt: "2026-11-01T11:00:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  sections: [
    { id: "problem", title: "Problem", html: '<p><mark class="nt-assumption">Students drive</mark> to campus.</p>' },
  ],
};
const canAsk = { capabilities: { can_edit: true, can_request_ai: true }, owners: [{ id: "alice" }] };
const section = (type, text) => ({
  type: "section",
  attrs: { type },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const proposal = {
  baseRevision: 4,
  generationRecordId: "rec-1",
  originalDocument: { type: "doc", content: [section("goals", "More groups.")] },
  proposedDocument: { type: "doc", content: [section("goals", "40% of users join a group in week one.")] },
  explanation: "Made the goal measurable.",
  instruction: DEFAULT_INSTRUCTION,
};
const apiError = (status, code, message = `raw ${code}`) => Object.assign(new Error(message), { status, code });

let root;
let host;
let handlers;

// Holds the conversation the way Prototype does, so it outlives the panels.
function Harness(props) {
  const [chat, setChat] = useState([]);
  return <EditorPage chat={chat} setChat={setChat} {...props} />;
}

async function show(props = {}) {
  handlers = {
    onRequestProposal: vi.fn(),
    onRequestFeedbackProposal: vi.fn().mockResolvedValue(),
    onAcceptProposal: vi.fn().mockResolvedValue(),
    onDiscardProposal: vi.fn(),
    onReload: vi.fn().mockResolvedValue(),
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <Harness
        prd={prd}
        detail={canAsk}
        organizationId="org"
        userId="alice"
        onSave={vi.fn().mockResolvedValue()}
        onOpenAnswers={vi.fn()}
        onExit={vi.fn()}
        onHome={vi.fn()}
        {...handlers}
        {...props}
      />,
    );
  });
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
const click = (button) => act(async () => button.click());
const visibleChat = () => [...host.querySelectorAll(".ne-chat")].find((chat) => !chat.hidden);
const turns = () => [...visibleChat().querySelectorAll(".ne-turn")].map((turn) => turn.textContent);

function typeInto(field, value) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  return act(async () => {
    set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function ask(question) {
  await typeInto(visibleChat().querySelector("textarea"), question);
  await click(buttonNamed("Send"));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getDirectory.mockResolvedValue({
    organization: { id: "org" },
    members: [{ user_id: "ben", name: "Ben PM" }],
  });
  api.listReviews.mockResolvedValue({ items: [{ reviewers: [{ user_id: "ben" }] }] });
  api.chatAboutPrd.mockResolvedValue({ kind: "answer", message: "The goal has no target yet." });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the chat", () => {
  it("is one conversation in the side panel and in split view", async () => {
    await show();
    await click(buttonNamed("Ask AI"));
    await ask("Is the goal measurable?");
    expect(turns()).toEqual(["Is the goal measurable?", "The goal has no target yet."]);
    await click(buttonNamed("Ask Nautilus"));
    expect(turns()).toEqual(["Is the goal measurable?", "The goal has no target yet."]);
    await click(buttonNamed("Close chat"));
    await click(buttonNamed("Ask AI"));
    expect(turns()).toHaveLength(2);
  });

  it("offers Propose changes only to people who can ask for changes", async () => {
    await show({ detail: { capabilities: { can_edit: true, can_request_ai: false } } });
    await click(buttonNamed("Ask AI"));
    expect(buttonNamed("Propose changes")).toBeUndefined();
  });
});

describe("proposing changes", () => {
  it("sends the conversation with the default instruction when nothing is typed", async () => {
    await show();
    handlers.onRequestProposal.mockResolvedValue({ kind: "proposal", message: "Made the goal measurable." });
    await click(buttonNamed("Ask AI"));
    expect(buttonNamed("Propose changes").disabled).toBe(true); // nothing to go on yet
    await ask("Is the goal measurable?");
    await click(buttonNamed("Propose changes"));
    expect(handlers.onRequestProposal).toHaveBeenCalledWith(DEFAULT_INSTRUCTION, [
      { role: "user", content: "Is the goal measurable?" },
      { role: "assistant", content: "The goal has no target yet." },
    ]);
    expect(turns().at(-1)).toBe("Made the goal measurable.");
  });

  it("uses what's typed as the instruction", async () => {
    await show();
    handlers.onRequestProposal.mockResolvedValue({ kind: "clarification", message: "How does that relate?" });
    await click(buttonNamed("Ask AI"));
    await typeInto(visibleChat().querySelector("textarea"), "Make the goal measurable");
    await click(buttonNamed("Propose changes"));
    expect(handlers.onRequestProposal.mock.calls[0][0]).toBe("Make the goal measurable");
    expect(turns()).toEqual(["Make the goal measurable", "How does that relate?"]);
  });

  it("asks for unsaved edits to be saved first, without calling the AI", async () => {
    await show();
    await click(host.querySelector('[aria-label="Confirm assumption: Students drive"]'));
    await click(buttonNamed("Ask AI"));
    await ask("Is the goal measurable?");
    await click(buttonNamed("Propose changes"));
    expect(handlers.onRequestProposal).not.toHaveBeenCalled();
    expect(visibleChat().textContent).toContain("Save your edits first");
  });

  it("offers the latest version when the PRD moved on", async () => {
    await show();
    handlers.onRequestProposal.mockRejectedValue(apiError(409, "stale_revision"));
    await click(buttonNamed("Ask AI"));
    await ask("Is the goal measurable?");
    await click(buttonNamed("Propose changes"));
    expect(visibleChat().textContent).toContain("Load the latest version, then propose changes again");
    expect(buttonNamed("Load the latest version")).toBeDefined();
    expect(turns()).toHaveLength(2); // the conversation stays
  });
});

describe("comparing a proposal", () => {
  it("replaces the editor with the comparison, and accepts the whole proposal", async () => {
    await show({ proposal });
    expect(host.querySelector(".ne-body")).toBeNull();
    expect(host.querySelector(".nc")).not.toBeNull();
    expect(buttonNamed("Save")).toBeUndefined(); // the header's own actions step aside
    expect(host.textContent).toContain("Made the goal measurable.");
    await click(buttonNamed("Accept changes"));
    expect(handlers.onAcceptProposal).toHaveBeenCalledWith();
  });

  it("asks an approved PRD's owner to confirm reviewers, then accepts with them", async () => {
    await show({ proposal });
    handlers.onAcceptProposal.mockRejectedValueOnce(apiError(409, "reapproval_required")).mockResolvedValueOnce();
    await click(buttonNamed("Accept changes"));
    expect(host.textContent).toContain("Your edits need new approval");
    await click(buttonNamed("Apply edits"));
    expect(handlers.onAcceptProposal).toHaveBeenLastCalledWith(["ben"]);
  });

  it("discarding from the reviewer dialog discards the proposal", async () => {
    await show({ proposal });
    handlers.onAcceptProposal.mockRejectedValueOnce(apiError(409, "reapproval_required"));
    await click(buttonNamed("Accept changes"));
    await click(buttonNamed("Discard edits"));
    expect(handlers.onDiscardProposal).toHaveBeenCalled();
  });

  it("explains a proposal that can't be used any more and goes back to the latest PRD", async () => {
    await show({ proposal });
    handlers.onAcceptProposal.mockRejectedValue(apiError(409, "stale_revision"));
    await click(buttonNamed("Accept changes"));
    expect(host.textContent).toContain("Someone saved this PRD since the proposal was made");
    await click(buttonNamed("Back to the PRD"));
    expect(handlers.onDiscardProposal).toHaveBeenCalled();
    expect(handlers.onReload).toHaveBeenCalled();
  });

  it("keeps the proposal open after an error worth retrying", async () => {
    await show({ proposal });
    handlers.onAcceptProposal.mockRejectedValue(apiError(500, "internal_error", "Something broke."));
    await click(buttonNamed("Accept changes"));
    expect(host.textContent).toContain("Something broke.");
    expect(buttonNamed("Accept changes").disabled).toBe(false);
    expect(handlers.onDiscardProposal).not.toHaveBeenCalled();
  });

  it("discards back to the editor", async () => {
    await show({ proposal });
    await click(buttonNamed("Discard"));
    expect(handlers.onDiscardProposal).toHaveBeenCalled();
  });
});

describe("addressing review comments", () => {
  const owner = {
    capabilities: { can_edit: true, can_request_ai: true, can_request_review_suggestions: true },
    owners: [{ id: "alice" }],
    currentVersion: { id: "v2" },
  };
  const comment = (id, version, body) => ({
    id,
    version_id: version,
    version_no: version === "v2" ? 2 : 1,
    section_type: null,
    author: { name: "Raj Patel" },
    body,
    created_at: "2026-11-01T12:00:00Z",
  });
  const commentsTab = async () => {
    await click(buttonNamed("Comments"));
    await act(async () => {});
  };
  const pick = (body) =>
    [...host.querySelectorAll(".ne-comment")]
      .find((card) => card.textContent.includes(body))
      .querySelector('input[type="checkbox"]');

  beforeEach(() => {
    api.listPrdComments.mockResolvedValue({
      items: [comment("c1", "v1", "Old note."), comment("c2", "v2", "Add the stale-data risk.")],
    });
  });

  it("lets an owner pick current comments and ask for one proposal", async () => {
    await show({ detail: owner });
    await commentsTab();
    await click(buttonNamed("Ask AI to address"));
    expect(pick("Old note.")).toBeNull(); // older version: not pickable
    expect(buttonNamed("Propose changes").disabled).toBe(true);
    await click(pick("Add the stale-data risk."));
    await typeInto(host.querySelector(".ne-comments textarea"), "Keep the scope as it is.");
    await click(buttonNamed("Propose changes (1)"));
    expect(handlers.onRequestFeedbackProposal).toHaveBeenCalledWith(["c2"], "Keep the scope as it is.");
  });

  it("isn't offered without the owners' flag", async () => {
    await show({ detail: { ...owner, capabilities: { can_edit: true, can_request_review_suggestions: false } } });
    await commentsTab();
    expect(buttonNamed("Ask AI to address")).toBeUndefined();
  });

  it("keeps the picks and says why when it can't ask", async () => {
    await show({ detail: owner });
    handlers.onRequestFeedbackProposal.mockRejectedValue(apiError(422, "feedback_not_current"));
    await commentsTab();
    await click(buttonNamed("Ask AI to address"));
    await click(pick("Add the stale-data risk."));
    await click(buttonNamed("Propose changes (1)"));
    expect(host.querySelector(".ne-comments").textContent).toContain("older version");
    expect(pick("Add the stale-data risk.").checked).toBe(true);
  });

  it("asks for unsaved edits to be saved first", async () => {
    await show({ detail: owner });
    await click(host.querySelector('[aria-label="Confirm assumption: Students drive"]'));
    await commentsTab();
    await click(buttonNamed("Ask AI to address"));
    await click(pick("Add the stale-data risk."));
    await click(buttonNamed("Propose changes (1)"));
    expect(handlers.onRequestFeedbackProposal).not.toHaveBeenCalled();
    expect(host.querySelector(".ne-comments").textContent).toContain("Save your edits first");
  });
});

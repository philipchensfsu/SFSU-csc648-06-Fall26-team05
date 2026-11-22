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
    onRequestFeedbackOptions: vi.fn().mockResolvedValue(),
    onSelectOption: vi.fn(),
    onAcceptProposal: vi.fn().mockResolvedValue(),
    onDiscardProposal: vi.fn(),
    onAdjustProposal: vi.fn(),
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
// The Review button carries a count when there are assumptions to confirm.
const reviewButton = () =>
  [...host.querySelectorAll(".ne-bar button")].find((button) => button.textContent.trim().startsWith("Review"));
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
  it("keeps the conversation when the side panel closes and opens again", async () => {
    await show();
    await click(buttonNamed("Ask Nautilus"));
    await ask("Is the goal measurable?");
    expect(turns()).toEqual(["Is the goal measurable?", "The goal has no target yet."]);
    await click(buttonNamed("Ask Nautilus")); // closes the panel
    expect(host.querySelector(".ne-chat")).toBeNull();
    await click(buttonNamed("Ask Nautilus"));
    expect(turns()).toEqual(["Is the goal measurable?", "The goal has no target yet."]);
  });

  it("still gets an answer when the panel is closed mid-question", async () => {
    let answer;
    api.chatAboutPrd.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await show();
    await click(buttonNamed("Ask Nautilus"));
    await ask("Is the goal measurable?");
    await click(host.querySelector('[aria-label="Close Ask Nautilus"]')); // the chat unmounts
    await act(async () => answer({ kind: "answer", message: "Not yet." }));
    await click(buttonNamed("Ask Nautilus"));
    expect(turns()).toEqual(["Is the goal measurable?", "Not yet."]);
  });

  it("offers Propose changes only to people who can ask for changes", async () => {
    await show({ detail: { capabilities: { can_edit: true, can_request_ai: false } } });
    await click(buttonNamed("Ask Nautilus"));
    expect(buttonNamed("Propose changes")).toBeUndefined();
  });
});

describe("proposing changes", () => {
  it("sends the conversation with the default instruction when nothing is typed", async () => {
    await show();
    handlers.onRequestProposal.mockResolvedValue({ kind: "proposal", message: "Made the goal measurable." });
    await click(buttonNamed("Ask Nautilus"));
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
    await click(buttonNamed("Ask Nautilus"));
    await typeInto(visibleChat().querySelector("textarea"), "Make the goal measurable");
    await click(buttonNamed("Propose changes"));
    expect(handlers.onRequestProposal.mock.calls[0][0]).toBe("Make the goal measurable");
    expect(turns()).toEqual(["Make the goal measurable", "How does that relate?"]);
  });

  it("asks for unsaved edits to be saved first, without calling the AI", async () => {
    await show();
    await click(reviewButton());
    await click(host.querySelector('[aria-label="Confirm assumption: Students drive"]'));
    await click(buttonNamed("Ask Nautilus"));
    await ask("Is the goal measurable?");
    await click(buttonNamed("Propose changes"));
    expect(handlers.onRequestProposal).not.toHaveBeenCalled();
    expect(visibleChat().textContent).toContain("Save your edits first");
  });

  it("offers the latest version when the PRD moved on", async () => {
    await show();
    handlers.onRequestProposal.mockRejectedValue(apiError(409, "stale_revision"));
    await click(buttonNamed("Ask Nautilus"));
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
    // The card names the version and how many comments are on it.
    expect(host.querySelector(".ne-ai-card").textContent).toContain("1 comment on the current version");
    await click(buttonNamed("Address with AI"));
    // While picking, only comments on the current version are listed.
    expect(host.querySelector(".ne-comments").textContent).not.toContain("Old note.");
    expect(host.querySelector(".ne-ai-card.is-picking").textContent).toContain("None picked yet");
    expect(buttonNamed("Propose changes").disabled).toBe(true);
    await click(pick("Add the stale-data risk."));
    await typeInto(host.querySelector(".ne-comments textarea"), "Keep the scope as it is.");
    await click(buttonNamed("Propose changes (1)"));
    expect(handlers.onRequestFeedbackProposal).toHaveBeenCalledWith(["c2"], "Keep the scope as it is.");
  });

  it("asks for two options for the same picks", async () => {
    await show({ detail: owner });
    await commentsTab();
    await click(buttonNamed("Address with AI"));
    expect(buttonNamed("Show 2 options").disabled).toBe(true);
    await click(pick("Add the stale-data risk."));
    await click(buttonNamed("Show 2 options"));
    expect(handlers.onRequestFeedbackOptions).toHaveBeenCalledWith(["c2"], null);
    expect(handlers.onRequestFeedbackProposal).not.toHaveBeenCalled();
  });

  it("keeps the button, disabled with the reason, once every comment is on an older version", async () => {
    // After a save: the owners' flag is off and no comment is on v3.
    await show({
      detail: {
        ...owner,
        currentVersion: { id: "v3", version_no: 3 },
        capabilities: { can_edit: true, can_request_review_suggestions: false },
      },
    });
    await commentsTab();
    const button = buttonNamed("Address with AI");
    expect(button.disabled).toBe(true);
    const reason = host.querySelector(`#${button.getAttribute("aria-describedby")}`);
    expect(reason.textContent).toContain("Nautilus can only address comments on the current version");
    expect(host.querySelector(".ne-ai-card.is-blocked").textContent).toContain("No comments on version 3 yet");
    expect(host.querySelector(".ne-comment-empty").textContent).toContain("No comments on version 3 yet.");
    // The older comments are one tab away.
    const earlierTab = host.querySelectorAll(".ne-comment-tab")[1];
    expect(earlierTab.textContent).toBe("Earlier versions2");
    await click(earlierTab);
    expect(earlierTab.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".ne-comments").textContent).toContain("Add the stale-data risk.");
    // The header says which version this is.
    expect(host.querySelector(".ne-savestate").textContent).toContain("Version 3 · Saved");
  });

  it("isn't shown to someone who doesn't own the PRD", async () => {
    await show({
      prd: { ...prd, myRole: "editor" },
      detail: { ...owner, currentVersion: { id: "v3", version_no: 3 }, capabilities: { can_edit: true } },
    });
    await commentsTab();
    expect(buttonNamed("Address with AI")).toBeUndefined();
  });

  it("isn't offered without the owners' flag", async () => {
    await show({ detail: { ...owner, capabilities: { can_edit: true, can_request_review_suggestions: false } } });
    await commentsTab();
    expect(buttonNamed("Address with AI")).toBeUndefined();
  });

  it("keeps the picks and says why when it can't ask", async () => {
    await show({ detail: owner });
    handlers.onRequestFeedbackProposal.mockRejectedValue(apiError(422, "feedback_not_current"));
    await commentsTab();
    await click(buttonNamed("Address with AI"));
    await click(pick("Add the stale-data risk."));
    await click(buttonNamed("Propose changes (1)"));
    expect(host.querySelector(".ne-comments").textContent).toContain("older version");
    expect(pick("Add the stale-data risk.").checked).toBe(true);
  });

  it("asks for unsaved edits to be saved first", async () => {
    await show({ detail: owner });
    await click(reviewButton());
    await click(host.querySelector('[aria-label="Confirm assumption: Students drive"]'));
    await commentsTab();
    await click(buttonNamed("Address with AI"));
    await click(pick("Add the stale-data risk."));
    await click(buttonNamed("Propose changes (1)"));
    expect(handlers.onRequestFeedbackProposal).not.toHaveBeenCalled();
    expect(host.querySelector(".ne-comments").textContent).toContain("Save your edits first");
  });
});

describe("requesting adjustments", () => {
  async function requestAdjustment(text) {
    await click(buttonNamed("Request adjustments"));
    await typeInto(host.querySelector(".nc-adjust textarea"), text);
    await click(buttonNamed("Adjust proposal"));
  }

  it("asks for changes to the proposal and adds them to the conversation", async () => {
    await show({ proposal });
    handlers.onAdjustProposal.mockResolvedValue({ kind: "proposal", message: "Kept the goals, added a risk." });
    await requestAdjustment("Keep the goals as they were");
    expect(handlers.onAdjustProposal).toHaveBeenCalledWith("Keep the goals as they were", []);
    expect(host.querySelector(".nc-adjust")).toBeNull(); // done: the form closes
    expect(handlers.onAcceptProposal).not.toHaveBeenCalled();
  });

  it("shows a refusal in the form and keeps what was typed", async () => {
    await show({ proposal });
    handlers.onAdjustProposal.mockResolvedValue({ kind: "blocked", message: "I can only help with this PRD." });
    await requestAdjustment("Write me a poem");
    expect(host.querySelector(".nc-adjust").textContent).toContain("I can only help with this PRD.");
    expect(host.querySelector(".nc-adjust textarea").value).toBe("Write me a poem");
  });

  it("explains a proposal that can't be adjusted any more", async () => {
    await show({ proposal });
    handlers.onAdjustProposal.mockRejectedValue(apiError(409, "proposal_unavailable"));
    await requestAdjustment("Keep the goals");
    expect(host.textContent).toContain("This proposal expired or was already used");
    expect(buttonNamed("Back to the PRD")).toBeDefined();
  });

  it("holds Accept and Discard while adjusting", async () => {
    await show({ proposal });
    let finish;
    handlers.onAdjustProposal.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await requestAdjustment("Keep the goals");
    expect(buttonNamed("Accept changes").disabled).toBe(true);
    expect(buttonNamed("Discard").disabled).toBe(true);
    await act(async () => finish({ kind: "proposal", message: "Done." }));
    expect(buttonNamed("Accept changes").disabled).toBe(false);
  });
});

describe("choosing between two options", () => {
  const owner = {
    capabilities: { can_edit: true, can_request_ai: true, can_request_review_suggestions: true },
    owners: [{ id: "alice" }],
    currentVersion: { id: "v2" },
  };
  const option = (number, title, text, tradeoffs) => ({
    ...proposal,
    generationRecordId: "rec-9",
    proposedDocument: { type: "doc", content: [section("goals", text)] },
    sectionTypes: ["goals"],
    explanation: `Explains ${title}.`,
    feedbackIds: ["c2", "c3"],
    instruction: "Keep the scope.",
    option: number,
    title,
    tradeoffs,
  });
  const options = [
    option(1, "Tighten the goal", "40% join a group in week one.", ["Quick to review."]),
    option(2, "Phase the release", "One campus first.", ["Bigger change for reviewers."]),
  ];
  const card = (title) => [...host.querySelectorAll(".no-card")].find((item) => item.textContent.includes(title));

  it("shows both options and opens the first one's changes", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    expect(host.querySelector(".ne-body")).toBeNull();
    expect(host.textContent).toContain("2 ways to address the feedback");
    expect(host.textContent).toContain("Based on 2 comments");
    expect(host.textContent).toContain("Your note: Keep the scope.");
    expect(card("Tighten the goal").textContent).toContain("Quick to review.");
    expect(card("Phase the release").textContent).toContain("Bigger change for reviewers.");
    expect(card("Tighten the goal").textContent).toContain("Goals");
    // Only the open option shows what would change.
    expect(card("Tighten the goal").querySelector(".nc-sections")).not.toBeNull();
    expect(card("Phase the release").querySelector(".nc-sections")).toBeNull();
    expect(card("Tighten the goal").querySelector("ins").textContent).toContain("40%");
  });

  it("opens another option, and applies the open one", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    await click(card("Phase the release").querySelector("button"));
    expect(handlers.onSelectOption).toHaveBeenCalledWith(2);
    await click(buttonNamed("Apply option 1"));
    expect(handlers.onAcceptProposal).toHaveBeenCalledWith();
  });

  it("says the review starts again when the PRD is in review", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    expect(host.querySelector(".no-banner").textContent).not.toContain("review starts again");
    await act(async () => root.unmount());
    host.remove();
    await show({ prd: { ...prd, status: "in_review" }, detail: owner, proposal: options[0], proposalOptions: options });
    expect(host.querySelector(".no-banner").textContent).toContain("the review starts again with the same reviewers");
  });

  it("asks again with the same comments and note", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    await click(buttonNamed("Ask again"));
    expect(handlers.onRequestFeedbackOptions).toHaveBeenCalledWith(["c2", "c3"], "Keep the scope.");
  });

  it("shows why asking again failed, keeping the options", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    handlers.onRequestFeedbackOptions.mockRejectedValue(apiError(429, "ai_cooldown", "Wait a moment, then try again."));
    await click(buttonNamed("Ask again"));
    expect(host.querySelector(".no [role=alert]").textContent).toContain("Just a moment between AI requests.");
    expect(buttonNamed("Apply option 1").disabled).toBe(false);
  });

  it("adjusts the open option", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    handlers.onAdjustProposal.mockResolvedValue({ kind: "proposal", message: "Adjusted." });
    await click(buttonNamed("Request adjustments"));
    expect(host.querySelector(".no-adjust").textContent).toContain("replaces both options");
    await typeInto(host.querySelector(".no-adjust textarea"), "Keep SMS for week one");
    await click(buttonNamed("Adjust option 1"));
    expect(handlers.onAdjustProposal).toHaveBeenCalledWith("Keep SMS for week one", []);
  });

  it("drops a request typed for one option when another opens", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    await click(buttonNamed("Request adjustments"));
    await typeInto(host.querySelector(".no-adjust textarea"), "Meant for option 1");
    await click(card("Phase the release").querySelector("button"));
    expect(handlers.onSelectOption).toHaveBeenCalledWith(2);
    expect(host.querySelector(".no-adjust")).toBeNull();
    await click(buttonNamed("Request adjustments"));
    expect(host.querySelector(".no-adjust textarea").value).toBe("");
  });

  it("explains an option that was used or expired, with a way back", async () => {
    await show({ detail: owner, proposal: options[0], proposalOptions: options });
    handlers.onAcceptProposal.mockRejectedValue(apiError(409, "proposal_unavailable"));
    await click(buttonNamed("Apply option 1"));
    expect(host.textContent).toContain("This proposal expired or was already used");
    await click(buttonNamed("Back to the PRD"));
    expect(handlers.onDiscardProposal).toHaveBeenCalled();
  });
});

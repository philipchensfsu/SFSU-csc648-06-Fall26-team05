import { describe, expect, it, vi } from "vitest";
import {
  acceptBody,
  acceptProposal,
  describeProposalError,
  mustAskAgain,
  needsReapproval,
  requestAdjustment,
  requestFeedbackRevision,
  requestRevision,
  sessionMessagesFrom,
} from "./proposal";

const saved = { type: "doc", content: [{ type: "section", attrs: { type: "goals" }, content: [] }] };
const proposed = { type: "doc", content: [{ type: "section", attrs: { type: "goals" }, content: [{ type: "paragraph" }] }] };
const reply = {
  kind: "proposal",
  message: "Made the goals measurable.",
  proposal: { section_types: ["goals"], sections: [], content_json: proposed },
  base_revision: 4,
  generation_record_id: "rec-1",
};
const apiError = (status, code, message = `raw ${code}`) => Object.assign(new Error(message), { status, code });

function fakeApi(overrides = {}) {
  return {
    getPrd: vi.fn().mockResolvedValue({ id: "p1", revision: 4, content_json: saved }),
    requestAiRevision: vi.fn().mockResolvedValue(reply),
    updatePrd: vi.fn().mockResolvedValue({ id: "p1", revision: 5 }),
    ...overrides,
  };
}

describe("requestRevision", () => {
  it("compares the proposal with the document it was made from", async () => {
    const api = fakeApi();
    const result = await requestRevision(api, "p1", {
      revision: 4,
      instruction: "Apply what we discussed.",
      sessionMessages: [{ role: "user", content: "Measurable goals" }],
    });
    expect(api.requestAiRevision).toHaveBeenCalledWith("p1", {
      revision: 4,
      instruction: "Apply what we discussed.",
      sessionMessages: [{ role: "user", content: "Measurable goals" }],
    });
    expect(result).toEqual({
      kind: "proposal",
      message: "Made the goals measurable.",
      proposal: {
        baseRevision: 4,
        generationRecordId: "rec-1",
        originalDocument: saved,
        proposedDocument: proposed,
        sectionTypes: ["goals"],
        explanation: "Made the goals measurable.",
        instruction: "Apply what we discussed.",
      },
    });
  });

  it("refuses before asking the AI when the PRD moved on", async () => {
    const api = fakeApi({ getPrd: vi.fn().mockResolvedValue({ id: "p1", revision: 5, content_json: saved }) });
    await expect(requestRevision(api, "p1", { revision: 4, instruction: "x" })).rejects.toMatchObject({
      status: 409,
      code: "stale_revision",
    });
    expect(api.requestAiRevision).not.toHaveBeenCalled();
  });

  it("passes on refusals and clarifications with nothing to compare", async () => {
    const api = fakeApi({ requestAiRevision: vi.fn().mockResolvedValue({ kind: "blocked", message: "Only this PRD.", proposal: null }) });
    expect(await requestRevision(api, "p1", { revision: 4, instruction: "x" })).toEqual({
      kind: "blocked",
      message: "Only this PRD.",
    });
  });

  it("compares with an empty document when nothing is saved yet", async () => {
    const api = fakeApi({ getPrd: vi.fn().mockResolvedValue({ id: "p1", revision: 4, content_json: null }) });
    const { proposal } = await requestRevision(api, "p1", { revision: 4, instruction: "x" });
    expect(proposal.originalDocument).toEqual({ type: "doc", content: [] });
  });
});

describe("requestFeedbackRevision", () => {
  it("asks about the chosen comments and compares with the same fresh read", async () => {
    const api = fakeApi({
      requestReviewSuggestion: vi.fn().mockResolvedValue({
        explanation: "Added the missing risk.",
        proposal: { section_types: ["risks"], sections: [], content_json: proposed },
        base_revision: 4,
        generation_record_id: "rec-2",
      }),
    });
    const result = await requestFeedbackRevision(api, "p1", { revision: 4, feedbackIds: ["c1", "c2"], instruction: null });
    expect(api.requestReviewSuggestion).toHaveBeenCalledWith("p1", { revision: 4, feedbackIds: ["c1", "c2"], instruction: null });
    expect(result.kind).toBe("proposal");
    expect(result.proposal).toMatchObject({
      baseRevision: 4,
      generationRecordId: "rec-2",
      originalDocument: saved,
      proposedDocument: proposed,
      explanation: "Added the missing risk.",
      feedbackIds: ["c1", "c2"],
    });
  });

  it("refuses before asking when the PRD moved on", async () => {
    const api = fakeApi({
      getPrd: vi.fn().mockResolvedValue({ id: "p1", revision: 6, content_json: saved }),
      requestReviewSuggestion: vi.fn(),
    });
    await expect(requestFeedbackRevision(api, "p1", { revision: 4, feedbackIds: ["c1"] })).rejects.toMatchObject({
      code: "stale_revision",
    });
    expect(api.requestReviewSuggestion).not.toHaveBeenCalled();
  });
});

describe("requestAdjustment", () => {
  const pending = {
    baseRevision: 4,
    generationRecordId: "rec-1",
    originalDocument: saved,
    proposedDocument: proposed,
    sectionTypes: ["goals"],
    explanation: "First try.",
    feedbackIds: ["c1"],
  };

  it("revises the pending proposal against the same saved PRD", async () => {
    const adjusted = { type: "doc", content: [] };
    const api = fakeApi({
      requestAiRevision: vi.fn().mockResolvedValue({
        kind: "proposal",
        message: "Kept the goals, added a risk.",
        proposal: { section_types: ["goals", "risks"], sections: [], content_json: adjusted },
        base_revision: 4,
        generation_record_id: "rec-2",
      }),
    });
    const result = await requestAdjustment(api, "p1", pending, { instruction: "Add a risk", sessionMessages: [] });
    expect(api.requestAiRevision).toHaveBeenCalledWith("p1", {
      revision: 4,
      instruction: "Add a risk",
      sessionMessages: [],
      previousGenerationRecordId: "rec-1",
    });
    expect(api.getPrd).not.toHaveBeenCalled(); // the baseline stays the one the proposal was made from
    expect(result.proposal).toEqual({
      ...pending,
      generationRecordId: "rec-2",
      proposedDocument: adjusted,
      sectionTypes: ["goals", "risks"],
      explanation: "Kept the goals, added a risk.",
    });
  });

  it("passes on a refusal, leaving the proposal as it was", async () => {
    const api = fakeApi({ requestAiRevision: vi.fn().mockResolvedValue({ kind: "blocked", message: "Only this PRD." }) });
    expect(await requestAdjustment(api, "p1", pending, { instruction: "x" })).toEqual({
      kind: "blocked",
      message: "Only this PRD.",
    });
  });
});

describe("accepting", () => {
  const proposal = { baseRevision: 4, generationRecordId: "rec-1", proposedDocument: proposed };

  it("sends the proposed document as received, without title or description", () => {
    expect(acceptBody(proposal)).toEqual({ revision: 4, content_json: proposed, generation_record_id: "rec-1" });
    expect(acceptBody(proposal, ["ben"])).toEqual({
      revision: 4,
      content_json: proposed,
      generation_record_id: "rec-1",
      confirmed_reviewer_ids: ["ben"],
    });
    expect(acceptBody(proposal).content_json).toBe(proposed);
  });

  it("sends the same save again when the first got no answer", async () => {
    const api = fakeApi({
      updatePrd: vi.fn().mockRejectedValueOnce(new Error("Couldn’t reach the server.")).mockResolvedValueOnce({ revision: 5 }),
    });
    expect(await acceptProposal(api, "p1", proposal)).toEqual({ revision: 5 });
    expect(api.updatePrd).toHaveBeenCalledTimes(2);
    expect(api.updatePrd.mock.calls[1]).toEqual(api.updatePrd.mock.calls[0]);
  });

  it("never retries a refusal", async () => {
    const api = fakeApi({ updatePrd: vi.fn().mockRejectedValue(apiError(409, "stale_revision")) });
    await expect(acceptProposal(api, "p1", proposal)).rejects.toMatchObject({ code: "stale_revision" });
    expect(api.updatePrd).toHaveBeenCalledTimes(1);
  });

  it("sends confirmed reviewers after the reapproval dialog", async () => {
    const api = fakeApi();
    await acceptProposal(api, "p1", proposal, { confirmedReviewerIds: ["ben", "erin"] });
    expect(api.updatePrd.mock.calls[0][1].confirmed_reviewer_ids).toEqual(["ben", "erin"]);
  });
});

describe("errors", () => {
  it("tells reapproval apart from proposals that can't be used any more", () => {
    expect(needsReapproval(apiError(409, "reapproval_required"))).toBe(true);
    expect(mustAskAgain(apiError(409, "reapproval_required"))).toBe(false);
    for (const code of ["stale_revision", "proposal_unavailable", "proposal_scope"]) {
      expect(mustAskAgain(apiError(409, code))).toBe(true);
    }
    expect(mustAskAgain(apiError(429, "ai_busy"))).toBe(false);
  });

  it("words the reasons the person can act on", () => {
    expect(describeProposalError(apiError(409, "stale_revision"))).toContain("Ask Nautilus again");
    expect(describeProposalError(apiError(409, "proposal_unavailable"))).toContain("expired");
    expect(describeProposalError(apiError(403, "owner_required", "Only the PRD's owners can edit it after approval."))).toBe(
      "Only the PRD's owners can edit it after approval.",
    );
    expect(describeProposalError(apiError(422, "feedback_not_current"))).toContain("older version");
    expect(describeProposalError({ code: "ai_cooldown", retryAfter: 3 })).toContain("Try again in 3s");
    expect(describeProposalError(apiError(500, "internal_error"))).toBe("raw internal_error");
  });
});

describe("sessionMessagesFrom", () => {
  it("turns the chat into recent turns, without fixed refusals", () => {
    const chat = [
      { from: "you", text: "What are the risks?" },
      { from: "ai", kind: "answer", text: "Low adoption." },
      { from: "you", text: "Tell me a joke" },
      { from: "ai", kind: "blocked", text: "Only this PRD." },
    ];
    expect(sessionMessagesFrom(chat)).toEqual([
      { role: "user", content: "What are the risks?" },
      { role: "assistant", content: "Low adoption." },
      { role: "user", content: "Tell me a joke" },
    ]);
  });

  it("keeps only the last 20", () => {
    const chat = Array.from({ length: 25 }, (_, i) => ({ from: i % 2 ? "ai" : "you", kind: "answer", text: `t${i}` }));
    const messages = sessionMessagesFrom(chat);
    expect(messages).toHaveLength(20);
    expect(messages[0].content).toBe("t5");
  });
});

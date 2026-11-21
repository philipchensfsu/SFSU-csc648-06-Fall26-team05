import { describe, expect, it } from "vitest";
import {
  addsLabel,
  describeDecideError,
  describeSuggestError,
  isSuggestionStale,
  suggestionResultSentence,
} from "./teamSuggestions";

const member = (id) => ({ user_id: id, name: id });
const teams = [
  { team_id: "p", name: "Platform" },
  { team_id: "d", name: "Design" },
  { team_id: "g", name: "Growth" },
];

describe("addsLabel", () => {
  it("counts people", () => {
    expect(addsLabel(1)).toBe("adds 1 person");
    expect(addsLabel(4)).toBe("adds 4 people");
  });
});

describe("suggestionResultSentence", () => {
  it("names the teams and counts each person once", () => {
    const results = [
      { team_id: "p", added: [member("a"), member("b")], skipped: [member("c")] },
      // b is in both teams: added by the first, skipped by the second.
      { team_id: "d", added: [], skipped: [member("b"), member("c")] },
    ];
    expect(suggestionResultSentence(results, teams)).toBe("Added 2 people from Platform and Design, 1 already on it.");
  });

  it("lists three teams and leaves out an empty skipped count", () => {
    const results = ["p", "d", "g"].map((id) => ({ team_id: id, added: [member(id)], skipped: [] }));
    expect(suggestionResultSentence(results, teams)).toBe("Added 3 people from Platform, Design and Growth.");
  });

  it("says when nobody new was added", () => {
    expect(suggestionResultSentence([{ team_id: "p", added: [], skipped: [member("a")] }], teams)).toBe(
      "Everyone on Platform already has access.",
    );
  });
});

describe("isSuggestionStale", () => {
  it("is stale only when the PRD moved on", () => {
    expect(isSuggestionStale(3, 4)).toBe(true);
    expect(isSuggestionStale(4, 4)).toBe(false);
    expect(isSuggestionStale(4, undefined)).toBe(false);
  });
});

describe("error wording", () => {
  it("words the request errors and falls back to the shared AI wording", () => {
    expect(describeSuggestError({ code: "needs_content" })).toContain("save some of this PRD first");
    expect(describeSuggestError({ code: "stale_revision" })).toContain("Reload the page");
    expect(describeSuggestError({ code: "ai_cooldown", retryAfter: 3 })).toBe(
      "Just a moment between AI requests. Try again in 3s.",
    );
  });

  it("words the decision errors and falls back to the backend's sentence", () => {
    expect(describeDecideError({ code: "team_not_found" })).toContain("nobody was added");
    expect(describeDecideError({ code: "recommendation_unavailable" })).toContain("already used");
    expect(describeDecideError({ message: "Backend sentence" })).toBe("Backend sentence");
  });
});

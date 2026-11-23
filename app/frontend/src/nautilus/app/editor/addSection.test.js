import { describe, expect, it } from "vitest";
import { missingSections, withSection } from "./addSection";

const section = (id) => ({ id, title: id, html: "<p>Text.</p>" });

describe("missingSections", () => {
  it("lists the standard sections not there yet, in standard order", () => {
    const missing = missingSections([section("goals"), section("risks")]).map(([type]) => type);
    expect(missing).toEqual([
      "problem",
      "non_goals",
      "target_users",
      "user_stories",
      "requirements",
      "success_metrics",
      "open_questions",
    ]);
  });

  it("lists nothing once all nine are there", () => {
    const all = missingSections([]).map(([type]) => section(type));
    expect(missingSections(all)).toEqual([]);
  });
});

describe("withSection", () => {
  it("puts the new section in its standard place, empty and titled", () => {
    const sections = withSection([section("problem"), section("risks")], "success_metrics");
    expect(sections.map((s) => s.id)).toEqual(["problem", "success_metrics", "risks"]);
    expect(sections[1]).toEqual({ id: "success_metrics", title: "Success Metrics", html: "" });
  });

  it("adds at the start or the end when that's where it belongs", () => {
    expect(withSection([section("goals")], "problem").map((s) => s.id)).toEqual(["problem", "goals"]);
    expect(withSection([section("goals")], "open_questions").map((s) => s.id)).toEqual(["goals", "open_questions"]);
    expect(withSection([], "risks").map((s) => s.id)).toEqual(["risks"]);
  });
});

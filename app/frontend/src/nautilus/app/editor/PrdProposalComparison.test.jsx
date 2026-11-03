// @vitest-environment jsdom
// The side-by-side view of a saved PRD and an AI proposal.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrdProposalComparison from "./PrdProposalComparison";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const p = (value) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const section = (type, value) => ({ type: "section", attrs: { type }, content: [p(value)] });

const current = {
  type: "doc",
  content: [section("problem", "Students study alone."), section("success_metrics", "More groups.")],
};
const proposed = {
  type: "doc",
  content: [
    section("problem", "Students study alone."),
    section("success_metrics", "40% of users join a group in their first week."),
    section("risks", "Low early adoption."),
  ],
};

let root;
let host;

async function show(props = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const handlers = { onAccept: vi.fn(), onDiscard: vi.fn() };
  await act(async () => {
    root.render(
      <PrdProposalComparison
        currentDocument={current}
        proposedDocument={proposed}
        explanation="Made the metric measurable and added a risk."
        {...handlers}
        {...props}
      />,
    );
  });
  return handlers;
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
const sectionNamed = (name) =>
  [...host.querySelectorAll(".nc-section")].find((row) => row.querySelector("h3").textContent === name);

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("PrdProposalComparison", () => {
  it("shows both versions of every section, in order, with what changed", async () => {
    await show();
    const titles = [...host.querySelectorAll(".nc-section h3")].map((h) => h.textContent);
    expect(titles).toEqual(["Problem Statement", "Success Metrics", "Risks"]);
    expect(host.textContent).toContain("2 of 3 sections would change");
    expect(host.textContent).toContain("Made the metric measurable and added a risk.");

    const metrics = sectionNamed("Success Metrics");
    expect(metrics.querySelector(".nc-status").textContent).toBe("Changed");
    expect([...metrics.querySelectorAll("del")].map((d) => d.textContent)).toEqual(["More groups"]);
    expect(metrics.querySelector("ins").textContent).toContain("40% of users join a group");

    const risks = sectionNamed("Risks");
    expect(risks.querySelector(".nc-status").textContent).toBe("New section");
    expect(risks.querySelector(".nc-side-current").textContent).toContain("Not in the current PRD");

    const problem = sectionNamed("Problem Statement");
    expect(problem.querySelector(".nc-status").textContent).toBe("Unchanged");
    expect(problem.querySelectorAll("del, ins")).toHaveLength(0);
  });

  it("accepts or discards the whole proposal", async () => {
    const { onAccept, onDiscard } = await show();
    await act(async () => buttonNamed("Accept changes").click());
    await act(async () => buttonNamed("Discard").click());
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("holds both buttons while accepting, and shows a notice", async () => {
    await show({ busy: true, notice: <p role="alert">Someone saved this PRD.</p> });
    expect(buttonNamed("Accepting…").disabled).toBe(true);
    expect(buttonNamed("Discard").disabled).toBe(true);
    expect(host.querySelector("[role=alert]").textContent).toBe("Someone saved this PRD.");
  });

  it("switches sides on narrow screens", async () => {
    await show();
    const view = host.querySelector(".nc");
    expect(view.dataset.shown).toBe("proposed");
    await act(async () => buttonNamed("Current").click());
    expect(view.dataset.shown).toBe("current");
    expect(buttonNamed("Current").getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Proposed").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows document text and the explanation as text, never as HTML", async () => {
    await show({
      proposedDocument: { type: "doc", content: [section("problem", '<img src=x onerror="window.__nc=1">')] },
      explanation: "<b>bold</b>",
    });
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("b")).toBeNull();
    expect(window.__nc).toBeUndefined();
    expect(host.textContent).toContain('<img src=x onerror="window.__nc=1">');
  });

  it("can hide the sections that don't change", async () => {
    await show();
    const filter = host.querySelector(".nc-filter input");
    await act(async () => filter.click());
    const titles = [...host.querySelectorAll(".nc-section h3")].map((h) => h.textContent);
    expect(titles).toEqual(["Success Metrics", "Risks"]);
  });

  it("says Empty for a new section with no text, and names each side for screen readers", async () => {
    await show({
      proposedDocument: {
        type: "doc",
        content: [...current.content, { type: "section", attrs: { type: "risks" }, content: [{ type: "paragraph" }] }],
      },
    });
    const risks = sectionNamed("Risks");
    expect(risks.querySelector(".nc-side-proposed").textContent).toContain("Empty");
    expect(risks.querySelector("ins")).toBeNull();
    const labels = [...host.querySelectorAll(".nc-side-label")];
    expect(labels.map((label) => label.textContent).slice(0, 2)).toEqual(["Current", "Proposed"]);
    expect(labels.every((label) => !label.hasAttribute("aria-hidden"))).toBe(true);
  });

  it("says so when the proposal changes nothing", async () => {
    await show({ proposedDocument: current });
    expect(host.textContent).toContain("The proposal matches the current PRD.");
    expect(host.querySelector(".nc-filter")).toBeNull();
    expect(host.querySelector(".nc-toolbar").textContent).not.toContain("0");
  });
});

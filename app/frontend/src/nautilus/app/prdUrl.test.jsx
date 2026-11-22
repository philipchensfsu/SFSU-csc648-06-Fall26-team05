// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePrdPath, prdPath, usePrdUrl } from "./prdUrl";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PRD paths", () => {
  it("builds and reads the details and editor URLs", () => {
    expect(prdPath("details", "p1")).toBe("/prds/p1");
    expect(prdPath("editor", "p1")).toBe("/prds/p1/edit");
    expect(parsePrdPath("/prds/p1")).toEqual({ screen: "details", id: "p1" });
    expect(parsePrdPath("/prds/p1/edit")).toEqual({ screen: "editor", id: "p1" });
    expect(parsePrdPath(prdPath("editor", "a b"))).toEqual({ screen: "editor", id: "a b" });
  });

  it("reads nothing from other paths", () => {
    expect(parsePrdPath("/dashboard")).toBeNull();
    expect(parsePrdPath("/prds")).toBeNull();
    expect(parsePrdPath("/prds/p1/history")).toBeNull();
  });
});

let root;
let props;
let followUrl;

function Harness(hookProps) {
  const follow = usePrdUrl(hookProps);
  useEffect(() => {
    followUrl = follow;
  });
  return null;
}

async function render(next) {
  props = { ...props, ...next };
  await act(async () => root.render(<Harness {...props} />));
}

async function mountAt(path, next) {
  window.history.replaceState(null, "", path);
  props = {
    screen: "dashboard",
    activePrdId: null,
    prdsLoaded: true,
    prdsError: null,
    open: { editor: vi.fn(() => Promise.resolve()), details: vi.fn(() => Promise.resolve()) },
    showWorkspace: vi.fn(),
    onOpenFailed: vi.fn(),
  };
  root = createRoot(document.createElement("div"));
  await render(next);
}

const popTo = (path, state) =>
  act(async () => {
    window.history.replaceState(state, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe("usePrdUrl", () => {
  it("pushes each PRD page's URL, counting how deep it is", async () => {
    await mountAt("/dashboard");
    const start = window.history.length;
    await render({ screen: "editor", activePrdId: "p1" });
    expect(window.location.pathname).toBe("/prds/p1/edit");
    expect(window.history.state).toEqual({ nautilusPrdDepth: 1 });

    await render({ screen: "details" });
    expect(window.location.pathname).toBe("/prds/p1");
    expect(window.history.state).toEqual({ nautilusPrdDepth: 2 });
    expect(window.history.length).toBe(start + 2);
  });

  it("steps back over all its entries when the app leaves the PRD pages", async () => {
    await mountAt("/dashboard");
    await render({ screen: "editor", activePrdId: "p1" });
    await render({ screen: "details" });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    await render({ screen: "dashboard", activePrdId: null });
    expect(go).toHaveBeenCalledWith(-2);
    // That step's popstate is the app's own, not one to follow.
    await popTo("/dashboard", null);
    expect(props.showWorkspace).not.toHaveBeenCalled();
  });

  it("follows Back to the workspace and Forward to a PRD page", async () => {
    await mountAt("/dashboard");
    await render({ screen: "details", activePrdId: "p1" });
    await popTo("/dashboard", null);
    expect(props.showWorkspace).toHaveBeenCalledTimes(1);

    await render({ screen: "dashboard", activePrdId: null });
    await popTo("/prds/p1", { nautilusPrdDepth: 1 });
    expect(props.open.details).toHaveBeenCalledWith("p1");
  });

  it("leaves Back on the editor to the editor, which calls followUrl", async () => {
    await mountAt("/dashboard");
    await render({ screen: "editor", activePrdId: "p1" });
    await popTo("/dashboard", null);
    expect(props.showWorkspace).not.toHaveBeenCalled();
    await act(async () => followUrl());
    expect(props.showWorkspace).toHaveBeenCalledTimes(1);
  });

  it("opens the PRD page it was loaded at, once the list is in", async () => {
    await mountAt("/prds/p1/edit", { prdsLoaded: false });
    expect(props.open.editor).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/prds/p1/edit");
    await render({ prdsLoaded: true });
    expect(props.open.editor).toHaveBeenCalledWith("p1");
  });

  it("goes to /dashboard and says so when that PRD can't be opened", async () => {
    const error = new Error("Not found");
    await mountAt("/prds/gone", { open: { details: vi.fn(() => Promise.reject(error)) } });
    expect(window.location.pathname).toBe("/dashboard");
    expect(props.showWorkspace).toHaveBeenCalled();
    expect(props.onOpenFailed).toHaveBeenCalledWith(error);
  });

  it("replaces a loaded-at PRD URL when leaving, since stepping back would leave the app", async () => {
    await mountAt("/prds/p1/edit");
    await render({ screen: "editor", activePrdId: "p1" });
    const go = vi.spyOn(window.history, "go");
    await render({ screen: "dashboard", activePrdId: null });
    expect(go).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/dashboard");
  });
});

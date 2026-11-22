// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// What the workspace reads on its own (notifications and the like) comes back
// empty; the PRD list is empty and the linked PRD can't be found.
vi.mock("../../lib/api", () => {
  const known = {
    listPrds: vi.fn(() => Promise.resolve([])),
    listProjects: vi.fn(() => Promise.resolve([])),
    getPrd: vi.fn(() => Promise.reject(new Error("PRD not found"))),
  };
  return {
    api: new Proxy(known, {
      get: (target, name) => target[name] ?? (() => Promise.resolve({ items: [], next_cursor: null })),
    }),
  };
});

import { api } from "../../lib/api";
import Prototype from "./Prototype";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("Prototype at a PRD link that can't be opened", () => {
  it("goes to the dashboard and keeps the error through the workspace's reload", async () => {
    window.history.replaceState(null, "", "/prds/missing/edit");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Prototype initialUser="alice.pm@example.com" userId="u1" />));
    await settle();
    await settle();

    expect(api.getPrd).toHaveBeenCalledWith("missing");
    expect(window.location.pathname).toBe("/dashboard");
    // The dashboard reloaded the list after the failed open, which used to
    // wipe the message.
    expect(api.listPrds.mock.calls.length).toBeGreaterThan(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn’t open that PRD. PRD not found",
    );
  });
});

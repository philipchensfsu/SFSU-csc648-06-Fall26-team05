// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The session getSession() resolves with; set per test.
let currentSession = null;
let authListener = null;

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession } }),
      onAuthStateChange: (callback) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}));
vi.mock("./nautilus/auth/OrgGate", () => ({
  default: ({ children }) => children({ id: "org-1", name: "Acme" }, () => {}),
}));
vi.mock("./prototype/Prototype", () => ({ default: () => <p>DASHBOARD</p> }));
vi.mock("./nautilus/auth/SignInPage", () => ({ default: () => <p>SIGN IN</p> }));
vi.mock("./nautilus/auth/SignUpPage", () => ({ default: () => <p>SIGN UP</p> }));
vi.mock("./nautilus/LandingPage", () => ({ default: () => <p>LANDING</p> }));
vi.mock("./nautilus/AboutPage", () => ({ default: () => <p>ABOUT</p> }));

import App from "./App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION = { user: { id: "u1", email: "alice.pm@example.com", user_metadata: {} } };

let root;
let container;

async function openAt(path, session) {
  currentSession = session;
  window.history.replaceState({}, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
  // Lazy pages resolve on a later tick.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  authListener = null;
  window.sessionStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("dashboard URL", () => {
  it.each(["/signin", "/signup"])("moves a signed-in visit to %s onto /dashboard", async (path) => {
    const before = window.history.length;
    await openAt(path, SESSION);
    expect(container.textContent).toContain("DASHBOARD");
    expect(window.location.pathname).toBe("/dashboard");
    // Replaced, not pushed, so Back doesn't land on the auth page again.
    expect(window.history.length).toBe(before);
  });

  it("shows the dashboard at /dashboard when signed in", async () => {
    await openAt("/dashboard", SESSION);
    expect(container.textContent).toContain("DASHBOARD");
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("sends a signed-out visit to /dashboard to sign-in", async () => {
    await openAt("/dashboard", null);
    expect(container.textContent).toContain("SIGN IN");
    expect(window.location.pathname).toBe("/signin");
  });

  it("moves to /dashboard once sign-in succeeds", async () => {
    await openAt("/signin", null);
    expect(container.textContent).toContain("SIGN IN");
    await act(async () => authListener("SIGNED_IN", SESSION));
    expect(container.textContent).toContain("DASHBOARD");
    expect(window.location.pathname).toBe("/dashboard");
  });

  it.each(["/prds/p1", "/prds/p1/edit"])("shows the dashboard at %s when signed in", async (path) => {
    await openAt(path, SESSION);
    expect(container.textContent).toContain("DASHBOARD");
    expect(window.location.pathname).toBe(path);
  });

  it("sends a signed-out visit to a PRD page to sign-in", async () => {
    await openAt("/prds/p1/edit", null);
    expect(container.textContent).toContain("SIGN IN");
    expect(window.location.pathname).toBe("/signin");
  });

  it("goes on to the PRD link once sign-in succeeds, then forgets it", async () => {
    await openAt("/prds/p1/edit", null);
    expect(window.location.pathname).toBe("/signin");
    await act(async () => authListener("SIGNED_IN", SESSION));
    expect(container.textContent).toContain("DASHBOARD");
    expect(window.location.pathname).toBe("/prds/p1/edit");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("ignores a saved link that isn't a PRD page", async () => {
    window.sessionStorage.setItem("nautilus.afterSignIn", "https://example.com/");
    await openAt("/signin", SESSION);
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("leaves the public pages alone", async () => {
    await openAt("/about", SESSION);
    expect(container.textContent).toContain("ABOUT");
    expect(window.location.pathname).toBe("/about");
  });
});

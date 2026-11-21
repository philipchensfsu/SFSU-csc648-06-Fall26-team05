// @vitest-environment jsdom
// The Profile page: account details, changing the password (or not, for a
// Google account), Discord, and signing out.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../../../lib/supabaseClient";
import ProfilePage from "./ProfilePage";
import { passwordProblems, signsInWithPassword } from "./profile";

vi.mock("../../../lib/supabaseClient", () => ({
  supabase: { auth: { getSession: vi.fn(), updateUser: vi.fn() } },
}));
vi.mock("../../../lib/api", () => ({
  api: {
    getDiscordLink: vi.fn().mockResolvedValue({ linked: false, discord_user_id: null, linked_at: null }),
    createDiscordLinkCode: vi.fn(),
    unlinkDiscord: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = { name: "Alice PM", email: "alice.pm@example.com" };
const ORG = { organization_id: "org-1", name: "Campus Apps", access_role: "member" };
const sessionWith = (providers) => ({
  data: { session: { user: { id: "u1", app_metadata: { provider: providers[0], providers } } } },
});

let root;
let host;
let onSignOut;

async function show(organization = ORG) {
  onSignOut = vi.fn();
  await act(async () => {
    root.render(<ProfilePage account={ACCOUNT} organization={organization} onSignOut={onSignOut} />);
  });
}

const text = () => host.textContent;
const buttonNamed = (name) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
const field = (label) => {
  const tag = [...host.querySelectorAll("label")].find((l) => l.textContent.trim() === label);
  return host.querySelector(`[id="${tag.htmlFor}"]`);
};
const click = (button) => act(async () => button.click());

// React tracks input values itself, so set them the way a typed change would.
async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue(sessionWith(["email"]));
  supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Profile page", () => {
  it("shows who you are, your organization and your role", async () => {
    await show();
    expect(host.querySelector("h1").textContent).toBe("Profile");
    const facts = [...host.querySelectorAll(".np-facts > div")].map((row) => row.textContent);
    expect(facts).toEqual(["NameAlice PM", "Emailalice.pm@example.com", "OrganizationCampus Apps", "RoleMember"]);
    expect(text()).toContain("To change your role, ask an admin of Campus Apps.");
  });

  it("doesn't tell an admin to ask an admin", async () => {
    await show({ ...ORG, access_role: "admin" });
    expect(text()).toContain("RoleAdmin");
    expect(text()).not.toContain("ask an admin");
  });

  it("changes the password and clears the form", async () => {
    await show();
    await type(field("New password"), "a-new-password");
    await type(field("Confirm new password"), "a-new-password");
    await click(buttonNamed("Change password"));
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "a-new-password" });
    expect(text()).toContain("Password changed. Use it the next time you sign in.");
    expect(field("New password").value).toBe("");
    expect(field("Confirm new password").value).toBe("");
  });

  it("checks the length and the match before sending anything", async () => {
    await show();
    await type(field("New password"), "short");
    await click(buttonNamed("Change password"));
    expect(text()).toContain("Use at least 8 characters.");
    expect(field("New password").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("New password"));

    await type(field("New password"), "long-enough-1");
    await type(field("Confirm new password"), "long-enough-2");
    await click(buttonNamed("Change password"));
    expect(text()).toContain("The passwords don’t match.");
    expect(document.activeElement).toBe(field("Confirm new password"));
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("shows Supabase's reason when the change is refused", async () => {
    supabase.auth.updateUser.mockResolvedValue({
      data: {},
      error: { message: "New password should be different from the old password." },
    });
    await show();
    await type(field("New password"), "same-as-before");
    await type(field("Confirm new password"), "same-as-before");
    await click(buttonNamed("Change password"));
    expect(host.querySelector("[role=alert]").textContent).toContain("should be different");
    expect(field("New password").value).toBe("same-as-before");
  });

  it("shows and hides both passwords", async () => {
    await show();
    expect(field("New password").type).toBe("password");
    await click(buttonNamed("Show"));
    expect(field("New password").type).toBe("text");
    expect(field("Confirm new password").type).toBe("text");
    await click(buttonNamed("Hide"));
    expect(field("New password").type).toBe("password");
  });

  it("has no password form for a Google account", async () => {
    supabase.auth.getSession.mockResolvedValue(sessionWith(["google"]));
    await show();
    expect(text()).toContain("You sign in with Google, so there’s no Nautilus password to change.");
    expect(buttonNamed("Change password")).toBeUndefined();
  });

  it("has Discord under connected apps", async () => {
    await show();
    expect(host.querySelector(".np-app h3").textContent).toBe("Discord");
    expect(buttonNamed("Connect")).toBeDefined();
  });

  it("signs out", async () => {
    await show();
    await click(buttonNamed("Sign out"));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("profile helpers", () => {
  it("knows which accounts have a password", () => {
    expect(signsInWithPassword({ app_metadata: { provider: "email", providers: ["email"] } })).toBe(true);
    expect(signsInWithPassword({ app_metadata: { provider: "google", providers: ["google", "email"] } })).toBe(true);
    expect(signsInWithPassword({ app_metadata: { provider: "google", providers: ["google"] } })).toBe(false);
    expect(signsInWithPassword({ app_metadata: { provider: "email" } })).toBe(true);
    expect(signsInWithPassword(undefined)).toBe(false);
  });

  it("finds the first problem with a new password", () => {
    expect(passwordProblems("short", "short")).toEqual({ password: "Use at least 8 characters." });
    expect(passwordProblems("long-enough", "different")).toEqual({ confirm: "The passwords don’t match." });
    expect(passwordProblems("long-enough", "long-enough")).toEqual({});
  });
});

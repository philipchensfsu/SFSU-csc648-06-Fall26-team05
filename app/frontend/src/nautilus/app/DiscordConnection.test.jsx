// @vitest-environment jsdom
// Connect Discord (feature 04) on the Profile page: getting a code, waiting
// for the bot to link the account, the code running out, and unlinking.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import DiscordConnection from "./DiscordConnection";
import { POLL_MS, formatRemaining } from "./discord";

vi.mock("../../../lib/api", () => ({
  api: { getDiscordLink: vi.fn(), createDiscordLinkCode: vi.fn(), unlinkDiscord: vi.fn() },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const START = new Date("2026-11-21T10:00:00Z").getTime();
const NOT_LINKED = { linked: false, discord_user_id: null, linked_at: null };
const LINKED = { linked: true, discord_user_id: "123456789012345678", linked_at: "2026-11-21T10:01:00Z" };
const code = (value = "K7QX-M2PA-9DZR", minutes = 10) => ({
  code: value,
  expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
});

let root;
let host;

async function show() {
  await act(async () => {
    root.render(<DiscordConnection />);
  });
}
async function hide() {
  await act(async () => {
    root.render(null);
  });
}

const text = () => host.textContent;
const pill = () => host.querySelector(".np-pill").textContent;
const buttonNamed = (name) => [...host.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
const click = (button) => act(async () => button.click());
const wait = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(START);
  vi.clearAllMocks();
  api.getDiscordLink.mockResolvedValue(NOT_LINKED);
  api.createDiscordLinkCode.mockImplementation(() => Promise.resolve(code()));
  api.unlinkDiscord.mockResolvedValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("Discord on the Profile page", () => {
  it("connects: shows a code, waits, and switches to connected when the bot links the account", async () => {
    await show();
    expect(pill()).toBe("Not connected");
    await click(buttonNamed("Connect"));
    expect(host.querySelector(".nd-discord-code code").textContent).toBe("K7QX-M2PA-9DZR");
    expect(pill()).toBe("Waiting for /link");
    expect(document.activeElement).toBe(buttonNamed("Copy"));
    expect(host.querySelector(".nd-discord-timer").textContent).toBe("10:00");

    await wait(POLL_MS);
    expect(api.getDiscordLink).toHaveBeenCalledTimes(2); // on load, then the first check
    expect(host.querySelector(".nd-discord-timer").textContent).toBe("9:57");

    api.getDiscordLink.mockResolvedValue(LINKED);
    await wait(POLL_MS);
    expect(pill()).toBe("Connected");
    expect(text()).toContain("Since Nov 21, 2026.");
    expect(buttonNamed("Unlink")).toBeDefined();
  });

  it("checks right away with I've run it, and says so when it isn't linked yet", async () => {
    await show();
    await click(buttonNamed("Connect"));
    await click(buttonNamed("I’ve run it"));
    expect(text()).toContain("Not linked yet. Run the command in Discord, then try again.");
    api.getDiscordLink.mockResolvedValue(LINKED);
    await click(buttonNamed("I’ve run it"));
    expect(pill()).toBe("Connected");
  });

  it("cancels back to Connect and stops checking", async () => {
    await show();
    await click(buttonNamed("Connect"));
    await click(buttonNamed("Cancel"));
    expect(pill()).toBe("Not connected");
    expect(host.querySelector(".nd-discord-code")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed("Connect"));
    const checks = api.getDiscordLink.mock.calls.length;
    await wait(POLL_MS * 3);
    expect(api.getDiscordLink).toHaveBeenCalledTimes(checks);
  });

  it("says the code expired after 10 minutes and gets a new one", async () => {
    await show();
    await click(buttonNamed("Connect"));
    await wait(10 * 60_000);
    expect(text()).toContain("This code has expired.");
    expect(pill()).toBe("Code expired");
    const checks = api.getDiscordLink.mock.calls.length;
    await wait(POLL_MS * 3);
    expect(api.getDiscordLink).toHaveBeenCalledTimes(checks); // no more checking

    api.createDiscordLinkCode.mockImplementation(() => Promise.resolve(code("NEW1-CODE-2345")));
    await click(buttonNamed("Get a new code"));
    expect(host.querySelector(".nd-discord-code code").textContent).toBe("NEW1-CODE-2345");
    expect(pill()).toBe("Waiting for /link");
  });

  it("copies just the code", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await show();
    await click(buttonNamed("Connect"));
    await click(buttonNamed("Copy"));
    expect(writeText).toHaveBeenCalledWith("K7QX-M2PA-9DZR");
    expect(buttonNamed("Copied")).toBeDefined();
  });

  it("shows connected when already linked, and unlinks after a confirmation", async () => {
    api.getDiscordLink.mockResolvedValue(LINKED);
    await show();
    expect(pill()).toBe("Connected");
    await click(buttonNamed("Unlink"));
    expect(text()).toContain("The bot stops answering for you");
    expect(document.activeElement).toBe(buttonNamed("Keep it"));
    expect(api.unlinkDiscord).not.toHaveBeenCalled();
    await click(buttonNamed("Unlink"));
    expect(api.unlinkDiscord).toHaveBeenCalledTimes(1);
    expect(pill()).toBe("Not connected");
    expect(buttonNamed("Connect")).toBeDefined();
  });

  it("stops checking once the page closes", async () => {
    await show();
    await click(buttonNamed("Connect"));
    await hide();
    const checks = api.getDiscordLink.mock.calls.length;
    await wait(POLL_MS * 3);
    expect(api.getDiscordLink).toHaveBeenCalledTimes(checks);
  });

  it("offers to try again when the link can't be read", async () => {
    api.getDiscordLink.mockRejectedValueOnce(new Error("Couldn’t reach the server."));
    await show();
    expect(text()).toContain("Couldn’t reach the server.");
    await click(buttonNamed("Try again"));
    expect(buttonNamed("Connect")).toBeDefined();
  });

  it("shows why a code couldn't be made", async () => {
    api.createDiscordLinkCode.mockRejectedValue(new Error("Too many codes. Wait a minute."));
    await show();
    await click(buttonNamed("Connect"));
    expect(host.querySelector("[role=alert]").textContent).toContain("Too many codes.");
    expect(buttonNamed("Connect").disabled).toBe(false);
  });
});

describe("formatRemaining", () => {
  it("shows minutes and seconds, never below zero", () => {
    expect(formatRemaining(600_000)).toBe("10:00");
    expect(formatRemaining(61_500)).toBe("1:02");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});

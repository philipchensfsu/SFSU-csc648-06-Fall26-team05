// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import InboxPage from "./InboxPage";

vi.mock("../../../lib/api", () => ({
  api: {
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    listPrdsInView: vi.fn(),
    getPrd: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const note = (id, extra = {}) => ({
  id,
  type: "member_added",
  prd_id: `prd-${id}`,
  title: `PRD ${id}`,
  actor_name: "Alice PM",
  payload: { role: "editor" },
  count: 1,
  read_at: null,
  updated_at: "2026-11-01T11:00:00Z",
  ...extra,
});

let root;
let host;
let onUnreadChange;
let onOpenPrdById;

async function show() {
  onUnreadChange = vi.fn();
  onOpenPrdById = vi.fn().mockResolvedValue();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<InboxPage onUnreadChange={onUnreadChange} onOpenPrdById={onOpenPrdById} />);
  });
}

const buttonWith = (text) => [...host.querySelectorAll("button")].find((button) => button.textContent.includes(text));
const click = (button) => act(async () => button.click());

beforeEach(() => {
  vi.resetAllMocks();
  api.listNotifications.mockResolvedValue({
    items: [note("a"), note("b", { read_at: "2026-11-01T12:00:00Z" })],
    next_cursor: null,
    unread_count: 1,
  });
  api.listPrdsInView.mockResolvedValue([]);
  api.markNotificationRead.mockImplementation((id) => Promise.resolve(note(id, { read_at: "2026-11-01T13:00:00Z" })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("InboxPage", () => {
  it("shows the notifications and reports the unread count", async () => {
    await show();
    expect(host.textContent).toContain("Alice PM added you to PRD a as Editor");
    expect(host.querySelectorAll(".nw-inbox-row.is-read")).toHaveLength(1);
    expect(onUnreadChange).toHaveBeenCalledWith(1);
    expect(buttonWith("All ·").textContent).toBe("All · 1");
  });

  it("marks a notification read and opens its PRD", async () => {
    await show();
    await click(buttonWith("PRD a"));
    expect(api.markNotificationRead).toHaveBeenCalledWith("a");
    expect(onOpenPrdById).toHaveBeenCalledWith("prd-a");
    expect(onUnreadChange).toHaveBeenLastCalledWith(0);
  });

  it("doesn't mark one that's already read", async () => {
    await show();
    await click(buttonWith("PRD b"));
    expect(api.markNotificationRead).not.toHaveBeenCalled();
    expect(onOpenPrdById).toHaveBeenCalledWith("prd-b");
  });

  it("says so when a PRD can't be opened any more", async () => {
    await show();
    onOpenPrdById.mockRejectedValue(Object.assign(new Error("PRD not found"), { status: 404 }));
    await click(buttonWith("PRD b"));
    expect(host.textContent).toContain("You can’t open this PRD any more.");
  });

  it("marks everything read across pages", async () => {
    await show();
    api.listNotifications
      .mockResolvedValueOnce({ items: [note("a")], next_cursor: "next", unread_count: 2 })
      .mockResolvedValueOnce({ items: [note("c")], next_cursor: null, unread_count: 1 });
    await click(buttonWith("Mark all as read"));
    expect(api.listNotifications).toHaveBeenCalledWith({ unreadOnly: true, limit: 100, cursor: "next" });
    expect(api.markNotificationRead.mock.calls.map(([id]) => id)).toEqual(["a", "c"]);
    expect(onUnreadChange).toHaveBeenLastCalledWith(0);
    expect(buttonWith("Mark all as read")).toBeUndefined();
  });

  it("loads the next page", async () => {
    api.listNotifications.mockResolvedValueOnce({ items: [note("a")], next_cursor: "more", unread_count: 2 });
    await show();
    api.listNotifications.mockResolvedValueOnce({ items: [note("c")], next_cursor: null, unread_count: 2 });
    await click(buttonWith("Load more"));
    expect(api.listNotifications).toHaveBeenLastCalledWith({ cursor: "more" });
    expect(host.textContent).toContain("PRD c");
    expect(buttonWith("Load more")).toBeUndefined();
  });

  it("offers a retry when the inbox can't be loaded", async () => {
    api.listNotifications.mockRejectedValueOnce(new Error("Network down"));
    await show();
    expect(host.textContent).toContain("Couldn’t load your inbox.");
    await click(buttonWith("Try again"));
    expect(host.textContent).toContain("PRD a");
  });

  it("says when there's nothing yet", async () => {
    api.listNotifications.mockResolvedValue({ items: [], next_cursor: null, unread_count: 0 });
    await show();
    expect(host.textContent).toContain("Nothing yet.");
    expect(buttonWith("Mark all as read")).toBeUndefined();
  });

  it("shows approval cards with their progress", async () => {
    api.listPrdsInView.mockImplementation((view) =>
      Promise.resolve(view === "needs_my_approval" ? [{ id: "p1", title: "Needs Me", description: "" }] : []),
    );
    api.getPrd.mockResolvedValue({
      owners: [{ id: "u", name: "Ben PM" }],
      current_version: { id: "v", version_no: 3 },
      approval: {
        reviewers: [
          { user_id: "1", name: "Erin", state: "approved" },
          { user_id: "2", name: "Ken", state: "pending" },
        ],
      },
    });
    await show();
    await click(buttonWith("Needs my approval"));
    expect(host.textContent).toContain("Needs Me");
    expect(host.textContent).toContain("v3");
    expect(host.textContent).toContain("Ben PM · owner");
    expect(host.textContent).toContain("1 of 2 approved. Waiting on Ken.");
    expect(host.querySelectorAll(".nw-inbox-bar")).toHaveLength(2);
    await click(buttonWith("Review now"));
    expect(onOpenPrdById).toHaveBeenCalledWith("p1");
  });

  it("explains empty approval tabs", async () => {
    await show();
    await click(buttonWith("Needs my approval"));
    expect(host.textContent).toContain("Nothing needs your approval right now.");
    await click(buttonWith("Waiting for approval"));
    expect(host.textContent).toContain("None of your PRDs are waiting for approval.");
  });
});

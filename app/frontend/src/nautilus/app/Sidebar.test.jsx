// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
let onNavigate;

async function show(page) {
  onNavigate = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <Sidebar
        page={page}
        account={{ name: "Alice PM", email: "alice@example.com" }}
        organization={{ id: "org", name: "Campus Apps", access_role: "member" }}
        unreadCount={0}
        recent={[]}
        shortcut="⌘K"
        menuOpen={false}
        onToggleMenu={() => {}}
        onNavigate={onNavigate}
        onCreatePrd={() => {}}
        onOpenPrd={() => {}}
        onSignOut={() => {}}
      />,
    );
  });
}

const reportsLink = () => [...host.querySelectorAll(".nw-nav-item")].find((item) => item.textContent === "Reports");

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Sidebar Reports link", () => {
  it("opens the Reports page", async () => {
    await show("dashboard");
    expect(reportsLink().getAttribute("aria-current")).toBeNull();
    await act(async () => reportsLink().click());
    expect(onNavigate).toHaveBeenCalledWith({ page: "reports" });
  });

  it("shows as current while the page is open", async () => {
    await show("reports");
    expect(reportsLink().getAttribute("aria-current")).toBe("page");
    expect(reportsLink().classList.contains("is-current")).toBe(true);
  });
});

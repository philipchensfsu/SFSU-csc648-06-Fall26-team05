// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../lib/api";
import { ShareDialog } from "./ShareDialog";

vi.mock("../../../../lib/api", () => ({
  api: {
    listPrdMembers: vi.fn(),
    setPrdMember: vi.fn(),
    removePrdMember: vi.fn(),
    getDirectory: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom doesn't implement the native dialog.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};

const prd = { id: "p1", title: "A PRD" };
const alice = { user_id: "alice", name: "Alice PM", role: "owner" };
const ben = { user_id: "ben", name: "Ben PM", role: "editor" };
const erin = { user_id: "erin", name: "Erin Engineer", email: "erin@example.com", role: null };
const directory = {
  organization: { id: "org", name: "Campus Apps" },
  members: [{ ...alice, email: null }, { ...ben, email: null }, erin],
};

let root;
let host;
let onChanged;

async function show() {
  onChanged = vi.fn().mockResolvedValue();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<ShareDialog open prd={prd} organizationId="org" userId="alice" onChanged={onChanged} onClose={vi.fn()} />);
  });
}

const buttonNamed = (name) =>
  [...host.querySelectorAll("button")].find((button) => (button.getAttribute("aria-label") ?? button.textContent.trim()) === name);
const select = (label) => host.querySelector(`select[aria-label="${label}"]`);

async function choose(element, value) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setValue.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listPrdMembers.mockResolvedValue([alice, ben]);
  api.getDirectory.mockResolvedValue(directory);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ShareDialog", () => {
  it("lists the people on the PRD and offers only the others", async () => {
    await show();
    expect(api.getDirectory).toHaveBeenCalledWith("org");
    expect(host.textContent).toContain("People with access · 2");
    expect(select("Role for Ben PM").value).toBe("editor");
    const offered = [...select("Person to add").options].map((option) => option.value);
    expect(offered).toEqual(["", "erin"]);
  });

  it("adds a person with the chosen role", async () => {
    api.setPrdMember.mockResolvedValue([alice, ben, { ...erin, role: "viewer" }]);
    await show();
    expect(buttonNamed("Add").disabled).toBe(true);
    await choose(select("Person to add"), "erin");
    await choose(select("Role for the person to add"), "viewer");
    await act(async () => buttonNamed("Add").click());
    expect(api.setPrdMember).toHaveBeenCalledWith("p1", "erin", "viewer");
    expect(onChanged).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Everyone in your organization already has access.");
  });

  it("changes someone's role", async () => {
    api.setPrdMember.mockResolvedValue([alice, { ...ben, role: "viewer" }]);
    await show();
    await choose(select("Role for Ben PM"), "viewer");
    expect(api.setPrdMember).toHaveBeenCalledWith("p1", "ben", "viewer");
    expect(select("Role for Ben PM").value).toBe("viewer");
  });

  it("removes someone", async () => {
    api.removePrdMember.mockResolvedValue(null);
    await show();
    await act(async () => buttonNamed("Remove Ben PM").click());
    expect(api.removePrdMember).toHaveBeenCalledWith("p1", "ben");
    expect(select("Role for Ben PM")).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("asks before lowering your own access", async () => {
    api.setPrdMember.mockResolvedValue([{ ...alice, role: "viewer" }, ben]);
    await show();
    await choose(select("Role for Alice PM"), "viewer");
    expect(api.setPrdMember).not.toHaveBeenCalled();
    expect(host.textContent).toContain("This changes your own access");
    await act(async () => buttonNamed("Yes, change it").click());
    expect(api.setPrdMember).toHaveBeenCalledWith("p1", "alice", "viewer");
  });

  it("asks before removing yourself, and Cancel leaves things as they are", async () => {
    await show();
    await act(async () => buttonNamed("Remove Alice PM").click());
    expect(api.removePrdMember).not.toHaveBeenCalled();
    await act(async () => buttonNamed("Cancel").click());
    expect(host.textContent).not.toContain("This changes your own access");
    expect(api.removePrdMember).not.toHaveBeenCalled();
  });

  it.each([
    ["owner_required", "A PRD needs at least one owner."],
    ["not_in_organization", "That person isn’t an active member of your organization."],
    ["forbidden", "Only owners and admins can manage people."],
  ])("words %s for people and keeps the role shown", async (code, message) => {
    api.setPrdMember.mockRejectedValue(Object.assign(new Error("Backend sentence"), { code }));
    await show();
    await choose(select("Role for Ben PM"), "viewer");
    expect(host.textContent).toContain(message);
    expect(select("Role for Ben PM").value).toBe("editor");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("offers a retry when the list can't be loaded", async () => {
    api.listPrdMembers.mockRejectedValueOnce(new Error("Network down"));
    await show();
    expect(host.textContent).toContain("Couldn’t load the people on this PRD.");
    await act(async () => buttonNamed("Try again").click());
    expect(host.textContent).toContain("People with access · 2");
  });
});

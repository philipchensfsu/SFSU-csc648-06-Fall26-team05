// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import PeoplePage from "./PeoplePage";
import { memberChanges, memberErrorMessage, personName } from "./people";

vi.mock("../../../lib/api", () => ({
  api: {
    getDirectory: vi.fn(),
    getJoinCode: vi.fn(),
    updateMember: vi.fn(),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no <dialog> behaviour.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close() {
  this.open = false;
};

const person = (id, name, extra = {}) => ({
  user_id: id,
  name,
  email: `${id}@example.com`,
  department_id: null,
  team_ids: [],
  access_role: "member",
  manager_id: null,
  title: null,
  ...extra,
});

const directory = () => ({
  organization: { id: "org", name: "Campus Apps" },
  departments: [
    { id: "d1", name: "Product", head_id: null, archived: false },
    { id: "d2", name: "Old Dept", head_id: null, archived: true },
  ],
  teams: [{ id: "t1", name: "Growth", department_id: "d1", lead_id: null, archived: false }],
  members: [
    person("alice", "Alice PM", { access_role: "admin", department_id: "d1", team_ids: ["t1"] }),
    person("ben", "Ben PM", { title: "Designer" }),
    person("erin", "Erin Engineer", { manager_id: "ben" }),
  ],
});

const refusal = (code, extra = {}) => Object.assign(new Error(`raw ${code}`), { code, ...extra });

let root;
let host;

async function show() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <PeoplePage organization={{ organization_id: "org", name: "Campus Apps", access_role: "admin" }} userId="alice" />,
    );
  });
}

const buttonWith = (text) => [...document.querySelectorAll("button")].find((button) => button.textContent === text);
const click = (button) => act(async () => button.click());
const rowOf = (name) => [...host.querySelectorAll("tbody tr")].find((row) => row.textContent.includes(name));
// The join code card has a dialog of its own, which stays closed here.
const dialog = () => host.querySelector("dialog[open]");

async function openAction(name, action) {
  await click(rowOf(name).querySelector("button[aria-haspopup]"));
  await click(buttonWith(action));
}

// A controlled <select> or <input> only sees a change through its native setter.
async function choose(field, value) {
  const proto = field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

const fieldNamed = (label) => {
  const target = [...dialog().querySelectorAll("label")].find((node) => node.textContent === label);
  return dialog().querySelector(`[id="${target.htmlFor}"]`);
};

beforeEach(() => {
  vi.resetAllMocks();
  api.getDirectory.mockResolvedValue(directory());
  api.getJoinCode.mockResolvedValue({ join_code: "ABC" });
  api.updateMember.mockResolvedValue({});
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("PeoplePage directory", () => {
  it("shows each person's department, team, role and status", async () => {
    await show();
    const alice = rowOf("Alice PM").textContent;
    expect(alice).toContain("Product · Growth");
    expect(alice).toContain("Admin");
    expect(alice).toContain("Active");
    expect(rowOf("Ben PM").textContent).toContain("Designer · ben@example.com");
  });

  it("copes with people who have no name or email", async () => {
    api.getDirectory.mockResolvedValue({
      ...directory(),
      members: [person("x", null, { email: null })],
    });
    await show();
    expect(rowOf("Unnamed member")).toBeTruthy();
  });

  it("says so when nobody matches the search", async () => {
    await show();
    await choose(host.querySelector('input[type="search"]'), "nobody");
    expect(host.textContent).toContain("No people match your search.");
  });

  it("leaves archived departments out of the filter", async () => {
    await show();
    const options = [...host.querySelector(".nw-people-filters select").options].map((option) => option.textContent);
    expect(options).toEqual(["All departments", "Product"]);
  });

  it("doesn't offer deactivating yourself", async () => {
    await show();
    await click(rowOf("Alice PM").querySelector("button[aria-haspopup]"));
    expect(buttonWith("Edit")).toBeTruthy();
    expect(buttonWith("Deactivate")).toBeUndefined();
  });
});

describe("editing a member", () => {
  it("sends only what changed, then reads the directory again", async () => {
    await show();
    await openAction("Ben PM", "Edit");
    await choose(fieldNamed("Title"), "Lead designer");
    await click(buttonWith("Save"));
    expect(api.updateMember).toHaveBeenCalledWith("org", "ben", { title: "Lead designer" });
    expect(api.getDirectory).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
  });

  it("closes without a request when nothing changed", async () => {
    await show();
    await openAction("Ben PM", "Edit");
    await click(buttonWith("Save"));
    expect(api.updateMember).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("leaves archived departments and the person themselves out of the pickers", async () => {
    await show();
    await openAction("Ben PM", "Edit");
    const departments = [...fieldNamed("Department").options].map((option) => option.textContent);
    const managers = [...fieldNamed("Manager").options].map((option) => option.textContent);
    expect(departments).toEqual(["No department", "Product"]);
    expect(managers).toEqual(["No manager", "Alice PM", "Erin Engineer"]);
  });

  it("stays open with a clear message when refused", async () => {
    api.updateMember.mockRejectedValue(refusal("last_admin"));
    await show();
    await openAction("Alice PM", "Edit");
    await choose(fieldNamed("Org role"), "member");
    await click(buttonWith("Save"));
    expect(dialog().textContent).toContain("Make someone else an admin first.");
    expect(dialog().textContent).not.toContain("raw last_admin");
  });
});

describe("deactivating a member", () => {
  it("warns first and marks the person Deactivated in this session", async () => {
    const after = directory();
    after.members = after.members.filter((member) => member.user_id !== "erin");
    api.getDirectory.mockResolvedValueOnce(directory()).mockResolvedValue(after);
    await show();
    await openAction("Erin Engineer", "Deactivate");
    expect(api.updateMember).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("lose access to every PRD right away");

    await click(buttonWith("Deactivate"));
    expect(api.updateMember).toHaveBeenCalledWith("org", "erin", { active: false });
    expect(dialog()).toBeNull();
    expect(rowOf("Erin Engineer").textContent).toContain("Deactivated");
    expect(rowOf("Erin Engineer").querySelector("button")).toBeNull();
  });

  it("carries the earlier choice through both follow-up questions", async () => {
    api.updateMember
      .mockRejectedValueOnce(refusal("has_direct_reports", { reports: ["erin"] }))
      .mockRejectedValueOnce(refusal("owns_prds", { prds: [{ prd_id: "p1", title: "Mobile Roadmap" }] }))
      .mockResolvedValueOnce({});
    await show();
    await openAction("Ben PM", "Deactivate");

    await click(buttonWith("Deactivate"));
    expect(dialog().textContent).toContain("Erin Engineer");
    const managers = [...fieldNamed("New manager").options].map((option) => option.textContent);
    expect(managers).toEqual(["No manager", "Alice PM"]);
    await choose(fieldNamed("New manager"), "alice");

    await click(buttonWith("Deactivate"));
    expect(dialog().textContent).toContain("Mobile Roadmap");
    expect(buttonWith("Deactivate").disabled).toBe(true);
    await choose(fieldNamed("New owner"), "erin");

    await click(buttonWith("Deactivate"));
    expect(api.updateMember).toHaveBeenLastCalledWith("org", "ben", {
      active: false,
      replacement_manager_id: "alice",
      transfer_owner_to: "erin",
    });
    expect(dialog()).toBeNull();
  });

  it("sends null when the reports get no new manager", async () => {
    api.updateMember
      .mockRejectedValueOnce(refusal("has_direct_reports", { reports: ["erin"] }))
      .mockResolvedValueOnce({});
    await show();
    await openAction("Ben PM", "Deactivate");
    await click(buttonWith("Deactivate"));
    await click(buttonWith("Deactivate"));
    expect(api.updateMember).toHaveBeenLastCalledWith("org", "ben", { active: false, replacement_manager_id: null });
  });

  it("never offers the person as their own new owner", async () => {
    api.updateMember.mockRejectedValue(refusal("owns_prds", { prds: [{ prd_id: "p1", title: "Roadmap" }] }));
    await show();
    await openAction("Ben PM", "Deactivate");
    await click(buttonWith("Deactivate"));
    const owners = [...fieldNamed("New owner").options].map((option) => option.textContent);
    expect(owners).toEqual(["Choose a person…", "Alice PM", "Erin Engineer"]);
  });

  it("stops on last_admin", async () => {
    api.updateMember.mockRejectedValue(refusal("last_admin"));
    await show();
    await openAction("Ben PM", "Deactivate");
    await click(buttonWith("Deactivate"));
    expect(dialog().textContent).toContain("Make someone else an admin first.");
    expect(buttonWith("Deactivate")).toBeUndefined();
    expect(buttonWith("Close")).toBeTruthy();
  });
});

describe("people helpers", () => {
  it.each([
    ["last_admin", "Make someone else an admin first. An organization needs at least one."],
    ["manager_cycle", "That would make a reporting loop. Choose a different manager."],
    ["manager_inactive", "That manager isn’t an active member."],
    ["head_not_in_department", "Move this person’s head role first, or add them to the department."],
    ["lead_not_in_team", "Change or clear the team lead first."],
    ["name_taken", "That name is already in use."],
    ["department_not_empty", "Move its people and teams out before archiving it."],
    ["team_not_empty", "Move its people out before archiving it."],
    ["team_archived", "This team is archived, so it can’t take new members."],
    ["forbidden", "Only admins can do this."],
  ])("words %s for people", (code, message) => {
    expect(memberErrorMessage({ code, message: "raw" })).toBe(message);
  });

  it("falls back to the backend's sentence", () => {
    expect(memberErrorMessage({ code: "other", message: "Readable." })).toBe("Readable.");
    expect(memberErrorMessage(undefined)).toBe("That didn’t work. Try again.");
  });

  it("names people from whatever they have", () => {
    expect(personName({ name: "Ben", email: "b@x" })).toBe("Ben");
    expect(personName({ name: null, email: "b@x" })).toBe("b@x");
    expect(personName(undefined)).toBe("Unnamed member");
  });

  it("clears fields with null and skips unchanged ones", () => {
    const member = person("ben", "Ben", { department_id: "d1", title: "Lead" });
    const form = { accessRole: "member", departmentId: "", managerId: "", title: "  Lead " };
    expect(memberChanges(member, form)).toEqual({ department_id: null });
  });
});

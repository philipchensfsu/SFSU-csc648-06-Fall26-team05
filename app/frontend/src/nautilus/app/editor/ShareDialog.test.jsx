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
    addTeamToPrd: vi.fn(),
    getDirectory: vi.fn(),
    recommendTeams: vi.fn(),
    decideTeamRecommendation: vi.fn(),
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

const prd = { id: "p1", title: "A PRD", revision: 4 };
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

  it("shows no team switch when the organization has no teams", async () => {
    await show();
    expect(host.querySelector('[aria-label="Add"]')).toBeNull();
    expect(select("Team to add")).toBeNull();
  });

  describe("adding a whole team", () => {
    const fran = { user_id: "fran", name: "Fran Dev", email: null, role: null };
    const teamDirectory = {
      ...directory,
      members: [
        { ...alice, email: null, team_ids: [] },
        { ...ben, email: null, team_ids: ["platform", "design"] },
        { ...erin, team_ids: ["platform"] },
        { ...fran, team_ids: ["platform"] },
      ],
      departments: [{ id: "eng", name: "Engineering", archived: false }],
      teams: [
        { id: "platform", name: "Platform", department_id: "eng", archived: false },
        { id: "design", name: "Design", department_id: null, archived: false },
        { id: "old", name: "Old team", department_id: "eng", archived: true },
        { id: "empty", name: "Empty team", department_id: null, archived: false },
      ],
    };

    async function showTeams() {
      api.getDirectory.mockResolvedValue(teamDirectory);
      await show();
      await act(async () => buttonNamed("A whole team").click());
    }

    it("offers active teams with people, and marks ones already on the PRD", async () => {
      await showTeams();
      const options = [...select("Team to add").options].slice(1);
      expect(options.map((option) => [option.value, option.textContent, option.disabled])).toEqual([
        ["platform", "Engineering · Platform (3 people, 2 new)", false],
        ["design", "Design (1 person) · all already on it", true],
      ]);
      const roles = [...select("Role for the team").options].map((option) => option.value);
      expect(roles).toEqual(["editor", "viewer"]);
    });

    it("adds the team with the chosen role and says who was added and skipped", async () => {
      api.addTeamToPrd.mockResolvedValue({
        added: [
          { ...erin, role: "viewer" },
          { ...fran, role: "viewer" },
        ],
        skipped: [ben],
        members: [alice, ben, { ...erin, role: "viewer" }, { ...fran, role: "viewer" }],
      });
      await showTeams();
      expect(buttonNamed("Add team").disabled).toBe(true);
      await choose(select("Team to add"), "platform");
      await choose(select("Role for the team"), "viewer");
      await act(async () => buttonNamed("Add team").click());
      expect(api.addTeamToPrd).toHaveBeenCalledWith("p1", "platform", "viewer");
      expect(onChanged).toHaveBeenCalledOnce();
      expect(host.textContent).toContain("Added 2 from Engineering · Platform, 1 already on it.");
      expect(host.textContent).toContain("Already on it, role unchanged: Ben PM.");
      expect(host.textContent).toContain("People with access · 4");
      expect(select("Team to add").value).toBe("");
    });

    it("shows just the size when everyone on the team is new", async () => {
      api.getDirectory.mockResolvedValue({
        ...teamDirectory,
        members: teamDirectory.members.map((person) => (person.user_id === "ben" ? { ...person, team_ids: [] } : person)),
      });
      await show();
      await act(async () => buttonNamed("A whole team").click());
      const platform = [...select("Team to add").options].find((option) => option.value === "platform");
      expect(platform.textContent).toBe("Engineering · Platform (2 people)");
    });

    it("clears the last result when you switch forms", async () => {
      api.addTeamToPrd.mockResolvedValue({
        added: [{ ...erin, role: "editor" }],
        skipped: [],
        members: [alice, ben, { ...erin, role: "editor" }],
      });
      await showTeams();
      await choose(select("Team to add"), "platform");
      await act(async () => buttonNamed("Add team").click());
      expect(host.textContent).toContain("Added 1 from Engineering · Platform.");
      await act(async () => buttonNamed("A person").click());
      await act(async () => buttonNamed("A whole team").click());
      expect(host.textContent).not.toContain("Added 1 from");
    });

    it("says so when everyone on the team already had access", async () => {
      const onIt = [ben, { ...erin, role: "viewer" }, { ...fran, role: "viewer" }];
      api.addTeamToPrd.mockResolvedValue({ added: [], skipped: onIt, members: [alice, ...onIt] });
      await showTeams();
      await choose(select("Team to add"), "platform");
      await act(async () => buttonNamed("Add team").click());
      expect(host.textContent).toContain("Everyone on Engineering · Platform already has access.");
      expect(host.textContent).not.toContain("role unchanged");
    });

    it("words team_not_found and changes nothing", async () => {
      api.addTeamToPrd.mockRejectedValue(Object.assign(new Error("Backend sentence"), { code: "team_not_found" }));
      await showTeams();
      await choose(select("Team to add"), "platform");
      await act(async () => buttonNamed("Add team").click());
      expect(host.textContent).toContain("That team isn’t active in your organization any more.");
      expect(host.textContent).toContain("People with access · 2");
      expect(onChanged).not.toHaveBeenCalled();
    });

    describe("suggested teams", () => {
      const recommendation = (extra = {}) => ({
        recommendation: {
          id: "rec-1",
          teams: [
            {
              team_id: "platform",
              name: "Platform",
              department: "Engineering",
              active_members: 3,
              new_members: 2,
              reason: "It runs the <b>booking</b> service.",
            },
            { team_id: "design", name: "Design", department: null, active_members: 1, new_members: 1, reason: "UI work." },
          ],
        },
        base_revision: 4,
        generation_record_id: "gen-1",
        ...extra,
      });
      const panel = () => host.querySelector(".ne-suggest");
      const inPanel = (name) => [...panel().querySelectorAll("button")].find((b) => b.textContent.trim() === name);
      const box = (team) => [...panel().querySelectorAll("label")].find((l) => l.textContent.includes(team)).querySelector("input");
      const toggle = (team) => act(async () => box(team).click());

      async function ask() {
        await showTeams();
        await act(async () => inPanel("Suggest teams").click());
      }

      beforeEach(() => {
        api.recommendTeams.mockResolvedValue(recommendation());
        api.decideTeamRecommendation.mockResolvedValue({
          status: "accepted",
          results: [
            { team_id: "platform", role: "viewer", added: [{ ...erin, role: "viewer" }, { ...fran, role: "viewer" }], skipped: [ben] },
            { team_id: "design", role: "editor", added: [], skipped: [ben] },
          ],
          members: [alice, ben, { ...erin, role: "viewer" }, { ...fran, role: "viewer" }],
        });
      });

      it("isn't offered when no team would add anyone", async () => {
        api.getDirectory.mockResolvedValue({
          ...teamDirectory,
          members: teamDirectory.members.map((person) => ({ ...person, team_ids: person.user_id === "ben" ? ["platform"] : [] })),
        });
        await show();
        await act(async () => buttonNamed("A whole team").click());
        expect(panel()).toBeNull();
      });

      it("asks with the PRD's revision and shows each team with its reason as text", async () => {
        await ask();
        expect(api.recommendTeams).toHaveBeenCalledWith("p1", 4);
        expect(panel().textContent).toContain("Suggested teams");
        expect(panel().textContent).toContain("adds 2 people");
        expect(panel().textContent).toContain("adds 1 person");
        expect(panel().textContent).toContain("It runs the <b>booking</b> service.");
        expect(panel().querySelector("b")).toBeNull();
        expect(select("Role for Platform").value).toBe("viewer");
        expect(box("Platform").checked).toBe(false);
        expect(inPanel("Add team").disabled).toBe(true);
        expect(panel().textContent).not.toContain("before the latest edits");
      });

      it("adds only the checked teams with their roles, in one step", async () => {
        await ask();
        await toggle("Platform");
        await choose(select("Role for Design"), "editor");
        expect(box("Design").checked).toBe(true);
        await act(async () => inPanel("Add 2 teams").click());
        expect(api.decideTeamRecommendation).toHaveBeenCalledWith("p1", "rec-1", [
          { teamId: "platform", role: "viewer" },
          { teamId: "design", role: "editor" },
        ]);
        expect(onChanged).toHaveBeenCalledOnce();
        expect(host.textContent).toContain("People with access · 4");
        expect(panel().textContent).toContain("Added 2 people from Platform and Design, 1 already on it.");
        // Everyone on a team is on the PRD now, so there's nothing left to suggest.
        expect(inPanel("Suggest teams")).toBeUndefined();
      });

      it("rejects with Not now and changes nothing", async () => {
        await ask();
        await act(async () => inPanel("Not now").click());
        expect(api.decideTeamRecommendation).toHaveBeenCalledWith("p1", "rec-1", []);
        expect(panel().textContent).not.toContain("Suggested teams");
        expect(onChanged).not.toHaveBeenCalled();
      });

      it("notes a suggestion made before the latest edits", async () => {
        api.recommendTeams.mockResolvedValue(recommendation({ base_revision: 3 }));
        await ask();
        expect(panel().textContent).toContain("Suggested before the latest edits.");
      });

      it("says when there's no team to suggest, without an error", async () => {
        api.recommendTeams.mockRejectedValue(
          Object.assign(new Error("No team has anyone…"), { status: 422, code: "no_eligible_teams" }),
        );
        await ask();
        expect(panel().querySelector('[role="alert"]')).toBeNull();
        expect(panel().textContent).toContain("there’s no team to suggest");
      });

      it("words an AI failure and lets you ask again", async () => {
        api.recommendTeams.mockRejectedValueOnce(Object.assign(new Error("x"), { status: 502, code: "ai_provider_error" }));
        await ask();
        expect(panel().querySelector('[role="alert"]').textContent).toBe("Nautilus couldn’t suggest teams this time. Try again.");
        await act(async () => inPanel("Suggest teams").click());
        expect(panel().textContent).toContain("Suggested teams");
      });

      it("drops a suggestion that was already used, and adds nobody", async () => {
        api.decideTeamRecommendation.mockRejectedValue(
          Object.assign(new Error("Gone"), { status: 409, code: "recommendation_unavailable" }),
        );
        await ask();
        await toggle("Platform");
        await act(async () => inPanel("Add team").click());
        expect(panel().querySelector('[role="alert"]').textContent).toBe("These suggestions were already used. Ask for new ones.");
        expect(panel().textContent).not.toContain("Suggested teams");
        expect(host.textContent).toContain("People with access · 2");
        expect(host.querySelector(".nw-alert")).toBeNull();
      });

      it("keeps the picks after another failure so you can try again", async () => {
        api.decideTeamRecommendation.mockRejectedValueOnce(new Error("Request failed: 500"));
        await ask();
        await toggle("Platform");
        await act(async () => inPanel("Add team").click());
        expect(panel().querySelector('[role="alert"]').textContent).toBe("Request failed: 500");
        expect(box("Platform").checked).toBe(true);
        await act(async () => inPanel("Add team").click());
        expect(host.textContent).toContain("People with access · 4");
      });
    });
  });

  it("offers a retry when the list can't be loaded", async () => {
    api.listPrdMembers.mockRejectedValueOnce(new Error("Network down"));
    await show();
    expect(host.textContent).toContain("Couldn’t load the people on this PRD.");
    await act(async () => buttonNamed("Try again").click());
    expect(host.textContent).toContain("People with access · 2");
  });
});

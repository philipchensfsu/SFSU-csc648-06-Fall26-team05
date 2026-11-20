// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../lib/api";
import CommentsPanel from "./CommentsPanel";

vi.mock("../../../../lib/api", () => ({
  api: { listPrdComments: vi.fn(), addPrdComment: vi.fn(), listPrdMembers: vi.fn() },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VERSION = "ver-current";

const comment = (id, extra = {}) => ({
  id,
  prd_id: "prd-1",
  version_id: VERSION,
  version_no: 3,
  section_type: null,
  author: { id: "u1", name: "Hannah Okafor", department: "Finance" },
  body: `comment ${id}`,
  created_at: "2026-11-01T11:00:00Z",
  ...extra,
});

let root;
let host;
let onRefresh;

async function show({ currentVersionId = VERSION } = {}) {
  onRefresh = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <CommentsPanel
        prd={{ id: "prd-1" }}
        currentVersionId={currentVersionId}
        onRefresh={onRefresh}
        userId="nadia"
        id="panel"
        labelledBy="tab"
        hidden={false}
      />,
    );
  });
}

const box = () => host.querySelector("textarea");
const submit = () => [...host.querySelectorAll("button")].find((b) => /Comment|Posting/.test(b.textContent));
const type = (text) =>
  act(async () => {
    const field = box();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

const ken = { user_id: "ken", name: "Ken Tanaka", email: "ken@example.com", role: "editor" };
const kemi = { user_id: "kemi", name: "Kemi Osei", email: "kemi@example.com", role: "viewer" };
const nadia = { user_id: "nadia", name: "Nadia Haddad", email: "nadia@example.com", role: "owner" };

const options = () => [...host.querySelectorAll('[role="option"]')];
const optionNames = () => options().map((option) => option.querySelector(".ne-mention-name").textContent);
const key = (name) =>
  act(async () => box().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));

beforeEach(() => {
  vi.resetAllMocks();
  api.listPrdMembers.mockResolvedValue([nadia, ken, kemi]);
  api.listPrdComments.mockResolvedValue({ items: [comment("a")], next_cursor: null });
  api.addPrdComment.mockImplementation((_prdId, { body }) =>
    Promise.resolve(comment("new", { body, author: { id: "u2", name: "Om Pandya", department: null } })),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("CommentsPanel", () => {
  it("lists the PRD's comments with their author and department", async () => {
    await show();
    expect(host.textContent).toContain("comment a");
    expect(host.textContent).toContain("Hannah Okafor");
    expect(host.textContent).toContain("Finance");
  });

  it("posts on the current version and shows the new comment", async () => {
    await show();
    await type("Looks good to me");
    await act(async () => submit().click());
    expect(api.addPrdComment).toHaveBeenCalledWith("prd-1", {
      versionId: VERSION,
      body: "Looks good to me",
      mentions: [],
    });
    expect(host.textContent).toContain("Looks good to me");
    expect(box().value).toBe("");
  });

  it("disables the box until the PRD has a saved version", async () => {
    await show({ currentVersionId: null });
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toContain("Save the PRD");
  });

  it("keeps the draft and refreshes the PRD when the version moved on", async () => {
    await show();
    const stale = Object.assign(new Error("The PRD has a newer version."), { status: 409, code: "stale_version" });
    api.addPrdComment.mockRejectedValue(stale);
    await type("Posted against an old version");
    await act(async () => submit().click());
    expect(host.textContent).toContain("Post again to comment on the latest version");
    expect(box().value).toBe("Posted against an old version");
    expect(onRefresh).toHaveBeenCalled();
  });

  it("shows the body as text, never as markup", async () => {
    api.listPrdComments.mockResolvedValue({
      items: [comment("x", { body: "<img src=x onerror=alert(1)>" })],
      next_cursor: null,
    });
    await show();
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("marks a comment left on an older version", async () => {
    api.listPrdComments.mockResolvedValue({
      items: [comment("old", { version_id: "ver-1", version_no: 1, section_type: "goals" })],
      next_cursor: null,
    });
    await show();
    expect(host.textContent).toContain("Goals");
    expect(host.textContent).toContain("v1");
  });

  describe("@mentions", () => {
    it("opens a list of the PRD's people on @, without you, filtered as you type", async () => {
      await show();
      expect(api.listPrdMembers).not.toHaveBeenCalled();
      await type("Can @");
      expect(api.listPrdMembers).toHaveBeenCalledOnce();
      expect(optionNames()).toEqual(["Ken Tanaka", "Kemi Osei"]);
      expect(box().getAttribute("aria-expanded")).toBe("true");
      await type("Can @tan");
      expect(optionNames()).toEqual(["Ken Tanaka"]);
      await type("Can @zz");
      expect(options()).toHaveLength(0);
      expect(api.listPrdMembers).toHaveBeenCalledOnce();
    });

    it("picks with the keyboard and posts the mention's id", async () => {
      await show();
      await type("Can @ke");
      await key("ArrowDown");
      expect(options()[1].getAttribute("aria-selected")).toBe("true");
      await key("Enter");
      expect(box().value).toBe("Can @Kemi Osei ");
      expect(options()).toHaveLength(0);
      await type("Can @Kemi Osei check the budget?");
      await act(async () => submit().click());
      expect(api.addPrdComment).toHaveBeenCalledWith("prd-1", {
        versionId: VERSION,
        body: "Can @Kemi Osei check the budget?",
        mentions: ["kemi"],
      });
    });

    it("picks with the mouse", async () => {
      await show();
      await type("@k");
      await act(async () =>
        options()[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })),
      );
      expect(box().value).toBe("@Ken Tanaka ");
    });

    it("doesn't send a mention whose name was deleted from the text", async () => {
      await show();
      await type("@ke");
      await key("Enter");
      await type("Never mind");
      await act(async () => submit().click());
      expect(api.addPrdComment).toHaveBeenCalledWith("prd-1", expect.objectContaining({ mentions: [] }));
    });

    it("closes the list on Escape without picking", async () => {
      await show();
      await type("@ke");
      await key("Escape");
      expect(options()).toHaveLength(0);
      expect(box().value).toBe("@ke");
    });

    it("highlights mentioned names in posted comments", async () => {
      api.listPrdComments.mockResolvedValue({
        items: [comment("m", { body: "Can @Ken Tanaka check this?", mentions: [{ id: "ken", name: "Ken Tanaka" }] })],
        next_cursor: null,
      });
      await show();
      const mention = host.querySelector(".ne-mention");
      expect(mention.textContent).toBe("@Ken Tanaka");
      expect(host.querySelector(".ne-comment-body").textContent).toBe("Can @Ken Tanaka check this?");
    });

    it("keeps the draft and explains a mention of someone without access", async () => {
      api.addPrdComment.mockRejectedValue(
        Object.assign(new Error("You can only mention people who can see this PRD."), {
          status: 422,
          code: "mention_without_access",
        }),
      );
      await show();
      await type("@ke");
      await key("Enter");
      await act(async () => submit().click());
      expect(host.textContent).toContain("Someone you mentioned can’t see this PRD any more");
      expect(box().value).toBe("@Ken Tanaka ");
    });
  });
});

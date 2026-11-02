// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../lib/api";
import CommentsPanel from "./CommentsPanel";

vi.mock("../../../../lib/api", () => ({
  api: { listPrdComments: vi.fn(), addPrdComment: vi.fn() },
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
let onReload;

async function show({ currentVersionId = VERSION } = {}) {
  onReload = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <CommentsPanel
        prd={{ id: "prd-1" }}
        currentVersionId={currentVersionId}
        onReload={onReload}
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

beforeEach(() => {
  vi.resetAllMocks();
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
    });
    expect(host.textContent).toContain("Looks good to me");
    expect(box().value).toBe("");
  });

  it("disables the box until the PRD has a saved version", async () => {
    await show({ currentVersionId: null });
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toContain("Save the PRD");
  });

  it("keeps the draft and reloads when the version moved on", async () => {
    await show();
    const stale = Object.assign(new Error("The PRD has a newer version."), { status: 409, code: "stale_version" });
    api.addPrdComment.mockRejectedValue(stale);
    await type("Posted against an old version");
    await act(async () => submit().click());
    expect(host.textContent).toContain("Reload it, then post again");
    expect(box().value).toBe("Posted against an old version");
    expect(onReload).toHaveBeenCalled();
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
});

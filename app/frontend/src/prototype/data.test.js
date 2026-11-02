import { describe, expect, it } from "vitest";
import { fromApiPrd, fromApiPrdDetail } from "./data";

const row = {
  id: "p1",
  title: "A PRD",
  status: "in_review",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T11:00:00Z",
  revision: 3,
};

describe("fromApiPrd", () => {
  it("keeps the review state from a list row", () => {
    expect(fromApiPrd({ ...row, review_state: "changes_requested" }).reviewState).toBe("changes_requested");
    expect(fromApiPrd(row).reviewState).toBeNull();
  });
});

describe("fromApiPrdDetail", () => {
  it("maps the fields only the detail read returns", () => {
    const capabilities = { can_edit: true, can_request_ai: false };
    const approval = { state: "in_review", approved_count: 1, required_count: 2 };
    expect(
      fromApiPrdDetail({
        ...row,
        capabilities,
        approval,
        changed_since_approval: true,
        current_version: { id: "v1", version_no: 2 },
        owners: [{ id: "u1", name: "Sam" }],
        project: { id: "f1", name: "Campus Apps" },
      }),
    ).toEqual({
      capabilities,
      approval,
      changedSinceApproval: true,
      currentVersion: { id: "v1", version_no: 2 },
      owners: [{ id: "u1", name: "Sam" }],
      project: { id: "f1", name: "Campus Apps" },
    });
  });

  it("allows nothing when a response has no capabilities", () => {
    expect(fromApiPrdDetail(row)).toEqual({
      capabilities: {},
      approval: null,
      changedSinceApproval: false,
      currentVersion: null,
      owners: [],
      project: null,
    });
  });
});

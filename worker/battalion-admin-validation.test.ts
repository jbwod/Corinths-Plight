import { describe, expect, it } from "vitest";
import {
  validateAssignBattalionMemberRank,
  validateCreateBattalionRank,
  validateDeleteBattalionRank,
  validateUpdateBattalionRank,
} from "./battalion-admin-validation";

const commandId = "rank-command-00000001";

describe("Battalion administration validation", () => {
  it("accepts a strict rank creation command", () => {
    expect(validateCreateBattalionRank({
      commandId,
      name: "Field Coordinator",
      sortOrder: 50,
      permissions: ["SHIP_VIEW", "BATTLEGROUP_EDIT"],
    })).toEqual({ valid: true, value: {
      commandId,
      name: "Field Coordinator",
      sortOrder: 50,
      permissions: ["BATTLEGROUP_EDIT", "SHIP_VIEW"],
    } });
  });

  it("rejects client-authored Battalion scope and unsupported permissions", () => {
    expect(validateCreateBattalionRank({
      commandId,
      battalionId: "battalion-foreign",
      name: "Foreign command",
      sortOrder: 50,
      permissions: [],
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
    expect(validateCreateBattalionRank({
      commandId,
      name: "Broken command",
      sortOrder: 50,
      permissions: ["ROOT_ACCESS"],
    })).toMatchObject({ valid: false, code: "RANK_PERMISSION_INVALID" });
    expect(validateCreateBattalionRank({
      commandId,
      name: "Duplicate command",
      sortOrder: 50,
      permissions: ["SHIP_VIEW", "SHIP_VIEW"],
    })).toMatchObject({ valid: false, code: "RANK_PERMISSION_DUPLICATE" });
  });

  it("requires optimistic revisions for edits, deletion and member assignment", () => {
    expect(validateUpdateBattalionRank({
      commandId,
      expectedVersion: 2,
      name: "Operations Officer",
      sortOrder: 20,
      permissions: ["RANK_MANAGE"],
    })).toMatchObject({ valid: true, value: { expectedVersion: 2 } });
    expect(validateDeleteBattalionRank({ commandId, expectedVersion: 0 }))
      .toMatchObject({ valid: false, code: "REVISION_INVALID" });
    expect(validateAssignBattalionMemberRank({
      commandId,
      targetUserId: "member-user",
      rankId: "rank-field",
      expectedMembershipRevision: 3,
      expectedRankVersion: 2,
    })).toMatchObject({ valid: true, value: {
      targetUserId: "member-user",
      rankId: "rank-field",
      expectedMembershipRevision: 3,
      expectedRankVersion: 2,
    } });
  });

  it("rejects forged member role and permission payloads", () => {
    expect(validateAssignBattalionMemberRank({
      commandId,
      targetUserId: "member-user",
      rankId: "rank-field",
      expectedMembershipRevision: 3,
      expectedRankVersion: 2,
      commandRole: "ADMIN",
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
  });
});

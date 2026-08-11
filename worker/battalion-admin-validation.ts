import type {
  AssignBattalionMemberRankCommand,
  BattalionPermission,
  CreateBattalionRankCommand,
  DeleteBattalionRankCommand,
  UpdateBattalionRankCommand,
} from "../packages/domain/src";
import type { ValidationResult } from "./forces-validation";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const permissionValues = new Set<BattalionPermission>([
  "BATTALION_EDIT", "MEMBER_INVITE", "MEMBER_REMOVE", "RANK_MANAGE",
  "BATTLEGROUP_CREATE", "BATTLEGROUP_EDIT", "BATTLEGROUP_ASSIGN",
  "OPERATION_CREATE", "OPERATION_COMMAND", "SHIP_VIEW", "SHIP_CONFIGURE",
  "SHIP_UPGRADE", "SHIP_MOVE", "SUPPLY_VIEW", "SUPPLY_MANAGE",
  "UNIT_DEPLOY_SELF", "UNIT_DEPLOY_OTHERS", "STRATEGIC_ORDER_CREATE",
  "STRATEGIC_ORDER_APPROVE",
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function commandId(value: unknown): value is string {
  return typeof value === "string" && commandIdPattern.test(value);
}

function positiveRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function rankFields(value: Record<string, unknown>): ValidationResult<{
  name: string;
  sortOrder: number;
  permissions: BattalionPermission[];
}> {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name.length < 2 || name.length > 48) {
    return { valid: false, code: "RANK_NAME_INVALID", message: "Rank name must contain 2–48 characters." };
  }
  if (!Number.isInteger(value.sortOrder) || Number(value.sortOrder) < 1 || Number(value.sortOrder) > 999) {
    return { valid: false, code: "RANK_ORDER_INVALID", message: "sortOrder must be an integer from 1–999." };
  }
  if (!Array.isArray(value.permissions) || value.permissions.length > permissionValues.size) {
    return { valid: false, code: "RANK_PERMISSIONS_INVALID", message: "permissions must be an array of supported permission keys." };
  }
  const permissions: BattalionPermission[] = [];
  for (const permission of value.permissions) {
    if (typeof permission !== "string" || !permissionValues.has(permission as BattalionPermission)) {
      return { valid: false, code: "RANK_PERMISSION_INVALID", message: "Rank contains an unsupported permission key." };
    }
    if (permissions.includes(permission as BattalionPermission)) {
      return { valid: false, code: "RANK_PERMISSION_DUPLICATE", message: "Rank permissions must be unique." };
    }
    permissions.push(permission as BattalionPermission);
  }
  permissions.sort();
  return { valid: true, value: { name, sortOrder: Number(value.sortOrder), permissions } };
}

export function validateCreateBattalionRank(value: unknown): ValidationResult<CreateBattalionRankCommand> {
  if (!record(value) || !only(value, ["commandId", "name", "sortOrder", "permissions"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Rank creation contains unsupported fields." };
  }
  if (!commandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  const fields = rankFields(value);
  return fields.valid ? { valid: true, value: { commandId: value.commandId, ...fields.value } } : fields;
}

export function validateUpdateBattalionRank(value: unknown): ValidationResult<UpdateBattalionRankCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedVersion", "name", "sortOrder", "permissions"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Rank update contains unsupported fields." };
  }
  if (!commandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!positiveRevision(value.expectedVersion)) {
    return { valid: false, code: "REVISION_INVALID", message: "expectedVersion must be a positive integer." };
  }
  const fields = rankFields(value);
  return fields.valid
    ? { valid: true, value: { commandId: value.commandId, expectedVersion: Number(value.expectedVersion), ...fields.value } }
    : fields;
}

export function validateDeleteBattalionRank(value: unknown): ValidationResult<DeleteBattalionRankCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedVersion"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Rank deletion contains unsupported fields." };
  }
  if (!commandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!positiveRevision(value.expectedVersion)) {
    return { valid: false, code: "REVISION_INVALID", message: "expectedVersion must be a positive integer." };
  }
  return { valid: true, value: { commandId: value.commandId, expectedVersion: Number(value.expectedVersion) } };
}

export function validateAssignBattalionMemberRank(value: unknown): ValidationResult<AssignBattalionMemberRankCommand> {
  if (!record(value) || !only(value, ["commandId", "targetUserId", "rankId", "expectedMembershipRevision", "expectedRankVersion"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Member rank assignment contains unsupported fields." };
  }
  if (!commandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (typeof value.targetUserId !== "string" || !idPattern.test(value.targetUserId)) {
    return { valid: false, code: "TARGET_USER_INVALID", message: "targetUserId is invalid." };
  }
  if (typeof value.rankId !== "string" || !idPattern.test(value.rankId)) {
    return { valid: false, code: "RANK_ID_INVALID", message: "rankId is invalid." };
  }
  if (!positiveRevision(value.expectedMembershipRevision) || !positiveRevision(value.expectedRankVersion)) {
    return { valid: false, code: "REVISION_INVALID", message: "Membership and rank revisions must be positive integers." };
  }
  return { valid: true, value: {
    commandId: value.commandId,
    targetUserId: value.targetUserId,
    rankId: value.rankId,
    expectedMembershipRevision: Number(value.expectedMembershipRevision),
    expectedRankVersion: Number(value.expectedRankVersion),
  } };
}

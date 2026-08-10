import type {
  AssignBattlegroupUnitCommand,
  CreateBattlegroupCommand,
  RemoveBattlegroupUnitCommand,
  SetBattlegroupDelegationCommand,
  UpdateBattlegroupCommand,
} from "../packages/domain/src";
import type { ValidationResult } from "./forces-validation";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const callsignPattern = /^[A-Z0-9][A-Z0-9 -]{1,15}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function common(value: Record<string, unknown>): ValidationResult<{ commandId: string; expectedRevision: number }> {
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 1) {
    return { valid: false, code: "REVISION_INVALID", message: "expectedRevision must be a positive integer." };
  }
  return { valid: true, value: { commandId: value.commandId, expectedRevision: value.expectedRevision as number } };
}

function identity(value: Record<string, unknown>): ValidationResult<{ name: string; callsign: string; objective: string }> {
  if (typeof value.name !== "string" || value.name.trim().length < 3 || value.name.trim().length > 64) {
    return { valid: false, code: "BATTLEGROUP_NAME_INVALID", message: "name must contain 3–64 characters." };
  }
  if (typeof value.callsign !== "string" || !callsignPattern.test(value.callsign.trim().toUpperCase())) {
    return { valid: false, code: "BATTLEGROUP_CALLSIGN_INVALID", message: "callsign must contain 2–16 uppercase letters, numbers, or spaces." };
  }
  if (typeof value.objective !== "string" || value.objective.trim().length > 240) {
    return { valid: false, code: "BATTLEGROUP_OBJECTIVE_INVALID", message: "objective must contain at most 240 characters." };
  }
  return {
    valid: true,
    value: {
      name: value.name.trim(),
      callsign: value.callsign.trim().toUpperCase(),
      objective: value.objective.trim(),
    },
  };
}

export function validateCreateBattlegroup(value: unknown): ValidationResult<CreateBattlegroupCommand> {
  if (!record(value) || !only(value, ["commandId", "name", "callsign", "objective"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Battlegroup creation contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  const parsed = identity(value);
  return parsed.valid ? { valid: true, value: { commandId: value.commandId, ...parsed.value } } : parsed;
}

export function validateUpdateBattlegroup(value: unknown): ValidationResult<UpdateBattlegroupCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedRevision", "name", "callsign", "objective", "leaderUserId"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Battlegroup update contains unsupported fields." };
  }
  const command = common(value);
  if (!command.valid) return command;
  const parsed = identity(value);
  if (!parsed.valid) return parsed;
  if (value.leaderUserId !== null && (typeof value.leaderUserId !== "string" || !idPattern.test(value.leaderUserId))) {
    return { valid: false, code: "LEADER_INVALID", message: "leaderUserId must identify an active Battalion member or be null." };
  }
  return { valid: true, value: { ...command.value, ...parsed.value, leaderUserId: value.leaderUserId as string | null } };
}

function unitCommand(value: unknown, keys: readonly string[]): ValidationResult<AssignBattlegroupUnitCommand> {
  if (!record(value) || !only(value, keys)) {
    return { valid: false, code: "COMMAND_INVALID", message: "Battlegroup unit command contains unsupported fields." };
  }
  const command = common(value);
  if (!command.valid) return command;
  if (typeof value.unitId !== "string" || !idPattern.test(value.unitId)) {
    return { valid: false, code: "UNIT_ID_INVALID", message: "unitId is invalid." };
  }
  return { valid: true, value: { ...command.value, unitId: value.unitId } };
}

export function validateAssignBattlegroupUnit(value: unknown): ValidationResult<AssignBattlegroupUnitCommand> {
  return unitCommand(value, ["commandId", "expectedRevision", "unitId"]);
}

export function validateRemoveBattlegroupUnit(value: unknown): ValidationResult<RemoveBattlegroupUnitCommand> {
  return unitCommand(value, ["commandId", "expectedRevision", "unitId"]);
}

export function validateSetBattlegroupDelegation(value: unknown): ValidationResult<SetBattlegroupDelegationCommand> {
  const base = unitCommand(value, ["commandId", "expectedRevision", "unitId", "delegateUserId", "active"]);
  if (!base.valid) return base;
  const source = value as Record<string, unknown>;
  if (typeof source.delegateUserId !== "string" || !idPattern.test(source.delegateUserId) || typeof source.active !== "boolean") {
    return { valid: false, code: "DELEGATION_INVALID", message: "Delegation requires an active Battalion member and an explicit active flag." };
  }
  return { valid: true, value: { ...base.value, delegateUserId: source.delegateUserId, active: source.active } };
}

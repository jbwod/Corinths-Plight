import type { BattalionAccessPolicy } from "../packages/domain/src";

export interface JoinBattalionCommand {
  commandId: string;
  battalionId?: string;
  inviteCode?: string;
  invitationId?: string;
}
export interface SwitchActiveBattalionCommand {
  commandId: string;
  battalionId: string;
  expectedSelectionRevision: number | null;
}
export interface CreateBattalionCommand {
  commandId: string;
  name: string;
  shortName?: string;
  description: string;
  motto: string;
  accessPolicy: BattalionAccessPolicy;
  engagementSummary: string;
}

export interface UpdateBattalionRecruitmentCommand {
  commandId: string;
  expectedRevision: number;
  accessPolicy: BattalionAccessPolicy;
  joinEnabled: boolean;
  engagementSummary: string;
}

export interface InviteBattalionMemberCommand {
  commandId: string;
  targetType: "USERNAME" | "EMAIL";
  target: string;
  message: string;
}

export interface RespondBattalionInviteCommand {
  commandId: string;
  invitationId: string;
  decision: "ACCEPT" | "DECLINE";
}

export interface GrantStarterUnitCommand {
  commandId: string;
  definitionId: string;
  name: string;
  callsign: string;
}

export interface CompleteOnboardingCommand {
  commandId: string;
  expectedRevision: number;
}

export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; code: string; message: string };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const callsignPattern = /^[A-Z0-9][A-Z0-9-]{0,6}$/;
const inviteCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,23}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function only(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function invalid<T>(code: string, message: string): ValidationResult<T> {
  return { valid: false, code, message };
}

function commandId(value: unknown): value is string {
  return typeof value === "string" && commandIdPattern.test(value);
}

function accessPolicy(value: unknown): value is BattalionAccessPolicy {
  return value === "PUBLIC" || value === "PRIVATE";
}

export function validateJoinBattalionCommand(value: unknown): ValidationResult<JoinBattalionCommand> {
  if (!record(value) || !only(value, ["commandId", "battalionId", "inviteCode", "invitationId"])) {
    return invalid("COMMAND_INVALID", "Join command contains unsupported fields.");
  }
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  const selectors = [value.battalionId, value.inviteCode, value.invitationId].filter((item) => item !== undefined);
  if (selectors.length !== 1) return invalid("JOIN_SELECTOR_INVALID", "Choose one public Battalion, invitation, or invite code.");
  if (value.battalionId !== undefined && (typeof value.battalionId !== "string" || !idPattern.test(value.battalionId))) {
    return invalid("BATTALION_ID_INVALID", "Battalion ID is invalid.");
  }
  if (value.invitationId !== undefined && (typeof value.invitationId !== "string" || !idPattern.test(value.invitationId))) {
    return invalid("INVITATION_ID_INVALID", "Invitation ID is invalid.");
  }
  if (value.inviteCode !== undefined && (typeof value.inviteCode !== "string" || !inviteCodePattern.test(value.inviteCode.trim()))) {
    return invalid("INVITE_CODE_INVALID", "Invite code must contain 8–64 letters, numbers, or hyphens.");
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      battalionId: typeof value.battalionId === "string" ? value.battalionId : undefined,
      invitationId: typeof value.invitationId === "string" ? value.invitationId : undefined,
      inviteCode: typeof value.inviteCode === "string" ? value.inviteCode.trim().toUpperCase() : undefined,
    },
  };
}

export function validateSwitchActiveBattalionCommand(value: unknown): ValidationResult<SwitchActiveBattalionCommand> {
  if (!record(value) || !only(value, ["commandId", "battalionId", "expectedSelectionRevision"])) {
    return invalid("COMMAND_INVALID", "Battalion selection command contains unsupported fields.");
  }
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (typeof value.battalionId !== "string" || !idPattern.test(value.battalionId)) {
    return invalid("BATTALION_ID_INVALID", "Battalion ID is invalid.");
  }
  if (value.expectedSelectionRevision !== null
    && (!Number.isInteger(value.expectedSelectionRevision) || Number(value.expectedSelectionRevision) < 1)) {
    return invalid("REVISION_INVALID", "expectedSelectionRevision must be a positive integer or null.");
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      battalionId: value.battalionId,
      expectedSelectionRevision: value.expectedSelectionRevision === null ? null : Number(value.expectedSelectionRevision),
    },
  };
}

export function validateCreateBattalionCommand(value: unknown): ValidationResult<CreateBattalionCommand> {
  if (!record(value) || !only(value, ["commandId", "name", "shortName", "description", "motto", "accessPolicy", "engagementSummary"])) {
    return invalid("COMMAND_INVALID", "Battalion creation command contains unsupported fields.");
  }
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const shortName = typeof value.shortName === "string" ? value.shortName.trim().toUpperCase() : undefined;
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const motto = typeof value.motto === "string" ? value.motto.trim() : "";
  const engagementSummary = typeof value.engagementSummary === "string" ? value.engagementSummary.trim() : "";
  if (name.length < 3 || name.length > 80) return invalid("BATTALION_NAME_INVALID", "Battalion name must contain 3–80 characters.");
  if (shortName !== undefined && !/^[A-Z0-9][A-Z0-9-]{1,7}$/.test(shortName)) return invalid("SHORT_NAME_INVALID", "Short name must contain 2–8 letters, digits, or hyphens.");
  if (description.length < 10 || description.length > 500) return invalid("DESCRIPTION_INVALID", "Description must contain 10–500 characters.");
  if (motto.length > 120) return invalid("MOTTO_INVALID", "Motto must not exceed 120 characters.");
  if (!accessPolicy(value.accessPolicy)) return invalid("ACCESS_POLICY_INVALID", "Choose PUBLIC or PRIVATE recruitment.");
  if (engagementSummary.length > 180 || (value.accessPolicy === "PUBLIC" && engagementSummary.length < 5)) {
    return invalid("ENGAGEMENT_INVALID", "Public Battalions need a 5–180 character current engagement summary.");
  }
  return { valid: true, value: { commandId: value.commandId, name, shortName, description, motto, accessPolicy: value.accessPolicy, engagementSummary } };
}

export function validateUpdateBattalionRecruitmentCommand(value: unknown): ValidationResult<UpdateBattalionRecruitmentCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedRevision", "accessPolicy", "joinEnabled", "engagementSummary"])) {
    return invalid("COMMAND_INVALID", "Recruitment settings command contains unsupported fields.");
  }
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 1) return invalid("REVISION_INVALID", "expectedRevision must be positive.");
  if (!accessPolicy(value.accessPolicy) || typeof value.joinEnabled !== "boolean") return invalid("RECRUITMENT_INVALID", "Recruitment policy is invalid.");
  const engagementSummary = typeof value.engagementSummary === "string" ? value.engagementSummary.trim() : "";
  if (engagementSummary.length > 180 || (value.accessPolicy === "PUBLIC" && engagementSummary.length < 5)) {
    return invalid("ENGAGEMENT_INVALID", "Public Battalions need a 5–180 character current engagement summary.");
  }
  return { valid: true, value: { commandId: value.commandId, expectedRevision: Number(value.expectedRevision), accessPolicy: value.accessPolicy, joinEnabled: value.joinEnabled, engagementSummary } };
}

export function validateInviteBattalionMemberCommand(value: unknown): ValidationResult<InviteBattalionMemberCommand> {
  if (!record(value) || !only(value, ["commandId", "targetType", "target", "message"])) return invalid("COMMAND_INVALID", "Invitation command contains unsupported fields.");
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (value.targetType !== "USERNAME" && value.targetType !== "EMAIL") return invalid("TARGET_TYPE_INVALID", "Invite by USERNAME or EMAIL.");
  const target = typeof value.target === "string" ? value.target.trim().toLowerCase() : "";
  if (value.targetType === "USERNAME" && !usernamePattern.test(target)) return invalid("USERNAME_INVALID", "Username is invalid.");
  if (value.targetType === "EMAIL" && (!emailPattern.test(target) || target.length > 254)) return invalid("EMAIL_INVALID", "Email is invalid.");
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (message.length > 500) return invalid("MESSAGE_INVALID", "Invitation message must not exceed 500 characters.");
  return { valid: true, value: { commandId: value.commandId, targetType: value.targetType, target, message } };
}

export function validateRespondBattalionInviteCommand(value: unknown): ValidationResult<RespondBattalionInviteCommand> {
  if (!record(value) || !only(value, ["commandId", "invitationId", "decision"])) return invalid("COMMAND_INVALID", "Invitation response contains unsupported fields.");
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (typeof value.invitationId !== "string" || !idPattern.test(value.invitationId)) return invalid("INVITATION_ID_INVALID", "Invitation ID is invalid.");
  if (value.decision !== "ACCEPT" && value.decision !== "DECLINE") return invalid("DECISION_INVALID", "Decision must be ACCEPT or DECLINE.");
  return { valid: true, value: { commandId: value.commandId, invitationId: value.invitationId, decision: value.decision } };
}

export function validateGrantStarterUnitCommand(value: unknown): ValidationResult<GrantStarterUnitCommand> {
  if (!record(value) || !only(value, ["commandId", "definitionId", "name", "callsign"])) return invalid("COMMAND_INVALID", "Starter unit command contains unsupported fields.");
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (typeof value.definitionId !== "string" || !idPattern.test(value.definitionId)) return invalid("DEFINITION_ID_INVALID", "Starter class is invalid.");
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const callsign = typeof value.callsign === "string" ? value.callsign.trim().toUpperCase() : "";
  if (name.length < 2 || name.length > 80) return invalid("UNIT_NAME_INVALID", "Unit name must contain 2–80 characters.");
  if (!callsignPattern.test(callsign)) return invalid("CALLSIGN_INVALID", "Callsign must contain at most seven letters, digits, or hyphens.");
  return { valid: true, value: { commandId: value.commandId, definitionId: value.definitionId, name, callsign } };
}

export function validateCompleteOnboardingCommand(value: unknown): ValidationResult<CompleteOnboardingCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedRevision"])) return invalid("COMMAND_INVALID", "Completion command contains unsupported fields.");
  if (!commandId(value.commandId)) return invalid("COMMAND_ID_INVALID", "commandId must be 16–128 safe characters.");
  if (!Number.isInteger(value.expectedRevision) || Number(value.expectedRevision) < 1) return invalid("REVISION_INVALID", "expectedRevision must be positive.");
  return { valid: true, value: { commandId: value.commandId, expectedRevision: Number(value.expectedRevision) } };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    return Object.fromEntries(Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export async function onboardingCommandHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface RenameForceCommand {
  commandId: string;
  expectedVersion: number;
  name: string;
  callsign: string;
  description?: string;
}

export interface PurchaseForceCommand {
  commandId: string;
  kind: "UNIT";
  definitionId: string;
  desiredName: string;
  callsign: string;
}

export interface ProgressIrregularCommand {
  commandId: string;
  expectedVersion: number;
  track: "MILITIA_VETERAN" | "RAIDER" | "REVOLUTIONARY_GUARD";
}

export interface ReadinessCheckCommand {
  unitIds: string[];
  shipId?: string;
  campaignId?: string;
  carrierUnitId?: string;
  deploymentMode?:
    | "GROUND"
    | "HAT_PARADROP"
    | "ORBITAL_DROP"
    | "AIRFIELD"
    | "FLIGHT_DECK"
    | "ORBIT"
    | "VTOL_PAD";
}

export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; code: string; message: string };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const callsignPattern = /^[A-Z0-9][A-Z0-9-]{0,6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const permitted = new Set(allowed);
  return Object.keys(value).every((key) => permitted.has(key));
}

export function validateRenameForceCommand(value: unknown): ValidationResult<RenameForceCommand> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commandId", "expectedVersion", "name", "callsign", "description"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Rename command contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) {
    return { valid: false, code: "VERSION_INVALID", message: "expectedVersion must be a positive integer." };
  }
  if (typeof value.name !== "string" || value.name.trim().length < 2 || value.name.trim().length > 80) {
    return { valid: false, code: "NAME_INVALID", message: "Unit name must contain 2–80 characters." };
  }
  if (typeof value.callsign !== "string" || !callsignPattern.test(value.callsign.trim().toUpperCase())) {
    return { valid: false, code: "CALLSIGN_INVALID", message: "Callsign must contain at most seven letters, digits, or hyphens." };
  }
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.trim().length > 500)) {
    return { valid: false, code: "DESCRIPTION_INVALID", message: "Description must not exceed 500 characters." };
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      expectedVersion: value.expectedVersion as number,
      name: value.name.trim(),
      callsign: value.callsign.trim().toUpperCase(),
      description: typeof value.description === "string" ? value.description.trim() : undefined,
    },
  };
}

export function validatePurchaseForceCommand(value: unknown): ValidationResult<PurchaseForceCommand> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commandId", "kind", "definitionId", "desiredName", "callsign"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Purchase command contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (value.kind !== "UNIT") {
    return { valid: false, code: "PURCHASE_KIND_INVALID", message: "Only UNIT purchases are supported in this Phase 2 slice." };
  }
  if (typeof value.definitionId !== "string" || !idPattern.test(value.definitionId)) {
    return { valid: false, code: "DEFINITION_ID_INVALID", message: "A valid definitionId is required." };
  }
  if (typeof value.desiredName !== "string" || value.desiredName.trim().length < 2 || value.desiredName.trim().length > 80) {
    return { valid: false, code: "NAME_INVALID", message: "Unit name must contain 2–80 characters." };
  }
  if (typeof value.callsign !== "string" || !callsignPattern.test(value.callsign.trim().toUpperCase())) {
    return { valid: false, code: "CALLSIGN_INVALID", message: "Callsign must contain at most seven letters, digits, or hyphens." };
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      kind: "UNIT",
      definitionId: value.definitionId,
      desiredName: value.desiredName.trim(),
      callsign: value.callsign.trim().toUpperCase(),
    },
  };
}

export function validateProgressIrregularCommand(value: unknown): ValidationResult<ProgressIrregularCommand> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commandId", "expectedVersion", "track"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Irregular progression command contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) {
    return { valid: false, code: "VERSION_INVALID", message: "expectedVersion must be a positive integer." };
  }
  const tracks = new Set(["MILITIA_VETERAN", "RAIDER", "REVOLUTIONARY_GUARD"]);
  if (typeof value.track !== "string" || !tracks.has(value.track)) {
    return { valid: false, code: "TRACK_INVALID", message: "Choose Militia Veteran, Raider, or Revolutionary Guard." };
  }
  return { valid: true, value: { commandId: value.commandId, expectedVersion: value.expectedVersion as number, track: value.track as ProgressIrregularCommand["track"] } };
}

export function validateReadinessCheckCommand(value: unknown): ValidationResult<ReadinessCheckCommand> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["unitIds", "shipId", "campaignId", "carrierUnitId", "deploymentMode"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Readiness command contains unsupported fields." };
  }
  if (!Array.isArray(value.unitIds) || value.unitIds.length < 1 || value.unitIds.length > 32) {
    return { valid: false, code: "UNIT_IDS_INVALID", message: "unitIds must contain 1–32 unit IDs." };
  }
  const unitIds = value.unitIds.filter((item): item is string => typeof item === "string" && idPattern.test(item));
  if (unitIds.length !== value.unitIds.length || new Set(unitIds).size !== unitIds.length) {
    return { valid: false, code: "UNIT_IDS_INVALID", message: "unitIds must be unique valid IDs." };
  }
  for (const field of ["shipId", "campaignId", "carrierUnitId"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (typeof candidate !== "string" || !idPattern.test(candidate))) {
      return { valid: false, code: `${field.toUpperCase()}_INVALID`, message: `${field} is invalid.` };
    }
  }
  const deploymentModes = new Set([
    "GROUND",
    "HAT_PARADROP",
    "ORBITAL_DROP",
    "AIRFIELD",
    "FLIGHT_DECK",
    "ORBIT",
    "VTOL_PAD",
  ]);
  if (value.deploymentMode !== undefined && (typeof value.deploymentMode !== "string" || !deploymentModes.has(value.deploymentMode))) {
    return { valid: false, code: "DEPLOYMENT_MODE_INVALID", message: "deploymentMode is invalid." };
  }
  return {
    valid: true,
    value: {
      unitIds,
      shipId: typeof value.shipId === "string" ? value.shipId : undefined,
      campaignId: typeof value.campaignId === "string" ? value.campaignId : undefined,
      carrierUnitId: typeof value.carrierUnitId === "string" ? value.carrierUnitId : undefined,
      deploymentMode: value.deploymentMode as ReadinessCheckCommand["deploymentMode"],
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export async function commandHash(value: unknown): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestHasJsonContentType(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

import type { RenamePrimaryShipCommand } from "../packages/domain/src";
import type { ValidationResult } from "./forces-validation";

const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const registryPattern = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateRenamePrimaryShip(value: unknown): ValidationResult<RenamePrimaryShipCommand> {
  if (!record(value) || Object.keys(value).some((key) => ![
    "commandId", "expectedVersion", "name", "registry",
  ].includes(key))) {
    return { valid: false, code: "COMMAND_INVALID", message: "Ship identity command contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!Number.isInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) {
    return { valid: false, code: "REVISION_INVALID", message: "expectedVersion must be a positive integer." };
  }
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return { valid: false, code: "SHIP_NAME_INVALID", message: "Ship name must contain 2–80 characters." };
  }
  const registry = typeof value.registry === "string" ? value.registry.trim().toUpperCase() : "";
  if (!registryPattern.test(registry)) {
    return { valid: false, code: "SHIP_REGISTRY_INVALID", message: "Registry must contain 2–24 uppercase letters, numbers, or hyphens." };
  }
  return { valid: true, value: {
    commandId: value.commandId,
    expectedVersion: Number(value.expectedVersion),
    name,
    registry,
  } };
}

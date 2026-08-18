import type {
  StrategicCapability,
  StrategicDeploymentMethod,
  StrategicFormationRef,
  StrategicOrderIntent,
  StrategicSupplyEndpointRef,
  SubmitStrategicOrderCommand,
} from "../packages/domain/src";

export type {
  StrategicDeploymentMethod,
  StrategicFormationRef,
  StrategicOrderIntent,
  StrategicSupplyEndpointRef,
  SubmitStrategicOrderCommand,
} from "../packages/domain/src";

export interface ResolveStrategicMapCommand {
  commandId: string;
  expectedMapVersion: number;
  expectedRound: number;
}

export type StrategicValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; code: string; message: string };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const deploymentMethods = new Set<StrategicDeploymentMethod>([
  "STANDARD_LANDING",
  "VTOL_DEPLOYMENT",
  "AEROSPACE_TRANSPORT",
  "ORBITAL_DROP",
  "SHIP_SURFACE_LANDING",
]);
const supplySizes = new Set(["LARGE", "MEDIUM", "SMALL"]);
const supplyEndpointKinds = new Set(["TASK_FORCE", "SHIP", "HQ", "FOB", "UNIT"]);
const strategicCapabilities = new Set<StrategicCapability>([
  "GROUND_COMBAT", "ARMOURED", "RECON", "ENGINEERING", "LOGISTICS", "ANTI_AIR", "ARTILLERY",
  "AIR_MOBILE", "ORBITAL_DROP", "CARRY_INFANTRY", "CARRY_LIGHT_VEHICLE", "CARRY_HEAVY_VEHICLE",
  "CARRY_MECH", "CARRY_VTOL", "CARRY_AEROSPACE", "LAND_VTOL", "LAND_AEROSPACE", "REPAIR_INFANTRY",
  "REPAIR_VEHICLE", "REPAIR_MECH", "REPAIR_AEROSPACE", "REARM_INFANTRY", "REARM_AEROSPACE",
  "CHANGE_INFANTRY_LOADOUT", "REFIT_MECH", "GENERATE_SMALL_SUPPLY", "GENERATE_MEDIUM_SUPPLY",
  "SURFACE_LANDING",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const permitted = new Set(allowed);
  return Object.keys(value).every((key) => permitted.has(key));
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validCommandId(value: unknown): value is string {
  return typeof value === "string" && commandIdPattern.test(value);
}

function validFormation(value: unknown): value is StrategicFormationRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["kind", "id"]) &&
    (value.kind === "TASK_FORCE" || value.kind === "BATTLEGROUP") &&
    validId(value.id)
  );
}

function validSupplyEndpoint(value: unknown): value is StrategicSupplyEndpointRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["kind", "id"]) &&
    typeof value.kind === "string" &&
    supplyEndpointKinds.has(value.kind) &&
    validId(value.id)
  );
}

function validateIntent(value: unknown): StrategicValidationResult<StrategicOrderIntent> {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { valid: false, code: "STRATEGIC_INTENT_INVALID", message: "A typed strategic intent is required." };
  }
  const id = (field: string): boolean => validId(value[field]);
  switch (value.type) {
    case "MOVE_TASK_FORCE":
    case "MOVE_BATTLEGROUP":
      if (hasOnlyKeys(value, ["type"])) return { valid: true, value: { type: value.type } };
      break;
    case "EMBARK_BATTLEGROUP":
    case "DISEMBARK_BATTLEGROUP":
      if (hasOnlyKeys(value, ["type", "battlegroupId", "carrierTaskForceId"]) && id("battlegroupId") && id("carrierTaskForceId")) {
        return {
          valid: true,
          value: {
            type: value.type,
            battlegroupId: value.battlegroupId as string,
            carrierTaskForceId: value.carrierTaskForceId as string,
          },
        };
      }
      break;
    case "DEPLOY_TO_CAMPAIGN":
      if (
        hasOnlyKeys(value, ["type", "battlegroupId", "operationId", "deploymentMethod"]) &&
        id("battlegroupId") &&
        id("operationId") &&
        typeof value.deploymentMethod === "string" &&
        deploymentMethods.has(value.deploymentMethod as StrategicDeploymentMethod)
      ) {
        return {
          valid: true,
          value: {
            type: value.type,
            battlegroupId: value.battlegroupId as string,
            operationId: value.operationId as string,
            deploymentMethod: value.deploymentMethod as StrategicDeploymentMethod,
          },
        };
      }
      break;
    case "WITHDRAW_FROM_CAMPAIGN":
      if (
        hasOnlyKeys(value, ["type", "battlegroupId", "operationId", "extractionNodeId"]) &&
        id("battlegroupId") &&
        id("operationId") &&
        (value.extractionNodeId === undefined || id("extractionNodeId"))
      ) {
        return {
          valid: true,
          value: {
            type: value.type,
            battlegroupId: value.battlegroupId as string,
            operationId: value.operationId as string,
            extractionNodeId: value.extractionNodeId as string | undefined,
          },
        };
      }
      break;
    case "TRANSFER_SUPPLY":
      if (
        hasOnlyKeys(value, ["type", "supplySize", "amount", "source", "destination"]) &&
        typeof value.supplySize === "string" &&
        supplySizes.has(value.supplySize) &&
        positiveInteger(value.amount) &&
        (value.amount as number) <= 1_000_000 &&
        validSupplyEndpoint(value.source) &&
        validSupplyEndpoint(value.destination) &&
        !(value.source.kind === value.destination.kind && value.source.id === value.destination.id)
      ) {
        return {
          valid: true,
          value: {
            type: value.type,
            supplySize: value.supplySize as "LARGE" | "MEDIUM" | "SMALL",
            amount: value.amount as number,
            source: value.source,
            destination: value.destination,
          },
        };
      }
      break;
    case "RESUPPLY_TASK_FORCE":
      if (hasOnlyKeys(value, ["type", "taskForceId"]) && id("taskForceId")) {
        return { valid: true, value: { type: value.type, taskForceId: value.taskForceId as string } };
      }
      break;
    case "SUPPORT_CAMPAIGN":
      if (
        hasOnlyKeys(value, ["type", "operationId", "capability"]) &&
        id("operationId") &&
        typeof value.capability === "string" &&
        strategicCapabilities.has(value.capability as StrategicCapability)
      ) {
        return {
          valid: true,
          value: {
            type: value.type,
            operationId: value.operationId as string,
            capability: value.capability as StrategicCapability,
          },
        };
      }
      break;
    case "ORBITAL_COMBAT":
      if (hasOnlyKeys(value, ["type", "opposingFormationId"]) && id("opposingFormationId")) {
        return {
          valid: true,
          value: { type: value.type, opposingFormationId: value.opposingFormationId as string },
        };
      }
      break;
  }
  return {
    valid: false,
    code: "STRATEGIC_INTENT_INVALID",
    message: "Strategic intent fields do not match its type.",
  };
}

export function validateSubmitStrategicOrder(
  value: unknown,
): StrategicValidationResult<SubmitStrategicOrderCommand> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "commandId",
      "mapId",
      "expectedMapVersion",
      "expectedFormationVersion",
      "formation",
      "destinationNodeId",
      "intent",
    ])
  ) {
    return {
      valid: false,
      code: "STRATEGIC_COMMAND_INVALID",
      message: "Strategic order contains unsupported fields.",
    };
  }
  if (!validCommandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!validId(value.mapId)) return { valid: false, code: "MAP_ID_INVALID", message: "mapId is invalid." };
  if (!positiveInteger(value.expectedMapVersion)) {
    return { valid: false, code: "MAP_VERSION_INVALID", message: "expectedMapVersion must be a positive integer." };
  }
  if (!positiveInteger(value.expectedFormationVersion)) {
    return { valid: false, code: "FORMATION_VERSION_INVALID", message: "expectedFormationVersion must be a positive integer." };
  }
  if (!validFormation(value.formation)) {
    return { valid: false, code: "FORMATION_INVALID", message: "formation must identify a Task Force or Battlegroup." };
  }
  const intent = validateIntent(value.intent);
  if (!intent.valid) return intent;
  const isMovement = intent.value.type === "MOVE_TASK_FORCE" || intent.value.type === "MOVE_BATTLEGROUP";
  if (isMovement && !validId(value.destinationNodeId)) {
    return { valid: false, code: "DESTINATION_NODE_INVALID", message: "Movement orders require a valid destinationNodeId." };
  }
  if (value.destinationNodeId !== undefined && !validId(value.destinationNodeId)) {
    return { valid: false, code: "DESTINATION_NODE_INVALID", message: "destinationNodeId is invalid." };
  }
  if (
    (intent.value.type === "MOVE_TASK_FORCE" && value.formation.kind !== "TASK_FORCE") ||
    (intent.value.type === "MOVE_BATTLEGROUP" && value.formation.kind !== "BATTLEGROUP")
  ) {
    return { valid: false, code: "FORMATION_INTENT_MISMATCH", message: "Movement intent does not match formation kind." };
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      mapId: value.mapId,
      expectedMapVersion: value.expectedMapVersion as number,
      expectedFormationVersion: value.expectedFormationVersion as number,
      formation: value.formation,
      destinationNodeId: value.destinationNodeId as string | undefined,
      intent: intent.value,
    },
  };
}

export function validateResolveStrategicMap(
  value: unknown,
): StrategicValidationResult<ResolveStrategicMapCommand> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commandId", "expectedMapVersion", "expectedRound"])) {
    return {
      valid: false,
      code: "STRATEGIC_RESOLVE_COMMAND_INVALID",
      message: "Strategic resolve command contains unsupported fields.",
    };
  }
  if (!validCommandId(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!positiveInteger(value.expectedMapVersion)) {
    return { valid: false, code: "MAP_VERSION_INVALID", message: "expectedMapVersion must be a positive integer." };
  }
  if (!positiveInteger(value.expectedRound)) {
    return { valid: false, code: "STRATEGIC_ROUND_INVALID", message: "expectedRound must be a positive integer." };
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      expectedMapVersion: value.expectedMapVersion as number,
      expectedRound: value.expectedRound as number,
    },
  };
}

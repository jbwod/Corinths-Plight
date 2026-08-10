import {
  isTacticalSupplyResourceId,
  type DeploymentMethodId,
  type TacticalSupplyResourceId,
} from "../packages/domain/src";
import type { ValidationResult } from "./forces-validation";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export interface LoadoutChangeCommand {
  commandId: string;
  expectedVersion: number;
  expectedLoadoutRevision: number;
  context: "AT_SHIP_FACILITY" | "PRE_CAMPAIGN_MUSTER";
  campaignId?: string;
  items: Array<{ inventoryId: string; slotType: string; slotIndex: number }>;
}

export interface PurchaseEquipmentCommand {
  commandId: string;
  definitionId: string;
  developerOverride: boolean;
}

export function validatePurchaseEquipmentCommand(value: unknown): ValidationResult<PurchaseEquipmentCommand> {
  if (!record(value) || !only(value, ["commandId", "definitionId", "developerOverride"]) ||
      typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId) ||
      typeof value.definitionId !== "string" || !idPattern.test(value.definitionId) ||
      (value.developerOverride !== undefined && typeof value.developerOverride !== "boolean")) {
    return { valid: false, code: "COMMAND_INVALID", message: "Equipment purchase requires commandId and definitionId only." };
  }
  return { valid: true, value: { commandId: value.commandId, definitionId: value.definitionId, developerOverride: value.developerOverride === true } };
}

export function validateLoadoutChangeCommand(value: unknown): ValidationResult<LoadoutChangeCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedVersion", "expectedLoadoutRevision", "context", "campaignId", "items"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Loadout command contains unsupported fields." };
  }
  if (typeof value.commandId !== "string" || !commandIdPattern.test(value.commandId)) {
    return { valid: false, code: "COMMAND_ID_INVALID", message: "commandId must be 16–128 safe characters." };
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1 ||
      !Number.isInteger(value.expectedLoadoutRevision) || (value.expectedLoadoutRevision as number) < 1) {
    return { valid: false, code: "VERSION_INVALID", message: "Expected unit and loadout revisions must be positive integers." };
  }
  if (value.context !== "AT_SHIP_FACILITY" && value.context !== "PRE_CAMPAIGN_MUSTER") {
    return { valid: false, code: "LOADOUT_CONTEXT_INVALID", message: "A valid re-equipment context is required." };
  }
  if (value.campaignId !== undefined && (typeof value.campaignId !== "string" || !idPattern.test(value.campaignId))) {
    return { valid: false, code: "CAMPAIGN_ID_INVALID", message: "campaignId is invalid." };
  }
  if (value.context === "PRE_CAMPAIGN_MUSTER" && typeof value.campaignId !== "string") {
    return { valid: false, code: "CAMPAIGN_ID_REQUIRED", message: "Pre-campaign muster requires campaignId." };
  }
  if (!Array.isArray(value.items) || value.items.length > 24) {
    return { valid: false, code: "LOADOUT_ITEMS_INVALID", message: "items must contain at most 24 equipment selections." };
  }
  const items: LoadoutChangeCommand["items"] = [];
  const slots = new Set<string>();
  const inventory = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !only(item, ["inventoryId", "slotType", "slotIndex"]) ||
        typeof item.inventoryId !== "string" || !idPattern.test(item.inventoryId) ||
        typeof item.slotType !== "string" || !/^[A-Z][A-Z0-9_]{0,31}$/.test(item.slotType) ||
        !Number.isInteger(item.slotIndex) || (item.slotIndex as number) < 0 || (item.slotIndex as number) > 31) {
      return { valid: false, code: "LOADOUT_ITEM_INVALID", message: "Each item requires a valid inventory ID and slot." };
    }
    const slot = `${item.slotType}:${item.slotIndex}`;
    if (slots.has(slot) || inventory.has(item.inventoryId)) {
      return { valid: false, code: "LOADOUT_ITEM_DUPLICATE", message: "Equipment instances and target slots must be unique." };
    }
    slots.add(slot);
    inventory.add(item.inventoryId);
    items.push({ inventoryId: item.inventoryId, slotType: item.slotType, slotIndex: item.slotIndex as number });
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId,
      expectedVersion: value.expectedVersion as number,
      expectedLoadoutRevision: value.expectedLoadoutRevision as number,
      context: value.context,
      campaignId: typeof value.campaignId === "string" ? value.campaignId : undefined,
      items,
    },
  };
}

export interface SaveDeploymentPlanCommand {
  commandId: string;
  expectedRevision: number;
  planId: string;
  campaignId: string;
  battlegroupId?: string;
  method: DeploymentMethodId;
  insertionZoneId?: string;
  route: Array<{ q: number; r: number }>;
  units: Array<{ unitId: string; loadoutId: string; expectedUnitVersion: number; expectedLoadoutRevision: number }>;
  transports: Array<{ carrierUnitId: string; cargoProfileId: string; cargo: Array<{ id: string; kind: string; quantity: number; unitId?: string; supplyType?: TacticalSupplyResourceId; tags: string[] }> }>;
}

const deploymentMethods = new Set<DeploymentMethodId>([
  "STANDARD_GROUND", "VEHICLE_TRANSPORT", "VTOL_INSERTION", "HEAVY_AIR_TRANSPORT", "PARADROP", "ORBITAL_DROP",
]);

export function validateSaveDeploymentPlanCommand(value: unknown): ValidationResult<SaveDeploymentPlanCommand> {
  if (!record(value) || !only(value, ["commandId", "expectedRevision", "planId", "campaignId", "battlegroupId", "method", "insertionZoneId", "route", "units", "transports"])) {
    return { valid: false, code: "COMMAND_INVALID", message: "Deployment command contains unsupported fields." };
  }
  for (const key of ["commandId", "planId", "campaignId"] as const) {
    const candidate = value[key];
    const pattern = key === "commandId" ? commandIdPattern : idPattern;
    if (typeof candidate !== "string" || !pattern.test(candidate)) return { valid: false, code: `${key.toUpperCase()}_INVALID`, message: `${key} is invalid.` };
  }
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 0) {
    return { valid: false, code: "REVISION_INVALID", message: "expectedRevision must be a non-negative integer." };
  }
  if (typeof value.method !== "string" || !deploymentMethods.has(value.method as DeploymentMethodId)) {
    return { valid: false, code: "DEPLOYMENT_METHOD_INVALID", message: "Deployment method is invalid." };
  }
  for (const optionalId of ["battlegroupId", "insertionZoneId"] as const) {
    const candidate = value[optionalId];
    if (candidate !== undefined && (typeof candidate !== "string" || !idPattern.test(candidate))) return { valid: false, code: `${optionalId.toUpperCase()}_INVALID`, message: `${optionalId} is invalid.` };
  }
  if (!Array.isArray(value.route) || value.route.length > 128 || !value.route.every((point) => record(point) && only(point, ["q", "r"]) && Number.isInteger(point.q) && Number.isInteger(point.r))) {
    return { valid: false, code: "ROUTE_INVALID", message: "route must contain at most 128 integer hex coordinates." };
  }
  if (!Array.isArray(value.units) || value.units.length < 1 || value.units.length > 32) {
    return { valid: false, code: "DEPLOYMENT_UNITS_INVALID", message: "Select 1–32 units." };
  }
  const units: SaveDeploymentPlanCommand["units"] = [];
  for (const item of value.units) {
    if (!record(item) || !only(item, ["unitId", "loadoutId", "expectedUnitVersion", "expectedLoadoutRevision"]) ||
        typeof item.unitId !== "string" || !idPattern.test(item.unitId) || typeof item.loadoutId !== "string" || !idPattern.test(item.loadoutId) ||
        !Number.isInteger(item.expectedUnitVersion) || (item.expectedUnitVersion as number) < 1 ||
        !Number.isInteger(item.expectedLoadoutRevision) || (item.expectedLoadoutRevision as number) < 1) {
      return { valid: false, code: "DEPLOYMENT_UNIT_INVALID", message: "Each selected unit requires valid IDs and revisions." };
    }
    units.push(item as unknown as SaveDeploymentPlanCommand["units"][number]);
  }
  if (new Set(units.map((unit) => unit.unitId)).size !== units.length) return { valid: false, code: "DEPLOYMENT_UNIT_DUPLICATE", message: "Units must be unique." };
  if (!Array.isArray(value.transports) || value.transports.length > 16) {
    return { valid: false, code: "TRANSPORTS_INVALID", message: "At most 16 transports may be assigned." };
  }
  const transports: SaveDeploymentPlanCommand["transports"] = [];
  const carrierIds = new Set<string>();
  for (const candidate of value.transports) {
    if (!record(candidate) || !only(candidate, ["carrierUnitId", "cargoProfileId", "cargo"]) ||
        typeof candidate.carrierUnitId !== "string" || !idPattern.test(candidate.carrierUnitId) ||
        typeof candidate.cargoProfileId !== "string" || !idPattern.test(candidate.cargoProfileId) ||
        !Array.isArray(candidate.cargo) || candidate.cargo.length > 32 || carrierIds.has(candidate.carrierUnitId)) {
      return { valid: false, code: "TRANSPORT_INVALID", message: "Transport assignments require unique carriers and valid cargo profiles." };
    }
    const cargo: SaveDeploymentPlanCommand["transports"][number]["cargo"] = [];
    const cargoIds = new Set<string>();
    for (const raw of candidate.cargo) {
      if (!record(raw) || !only(raw, ["id", "kind", "quantity", "unitId", "supplyType", "tags"]) ||
          typeof raw.id !== "string" || !idPattern.test(raw.id) || cargoIds.has(raw.id) ||
          typeof raw.kind !== "string" || !["PERSONNEL", "VEHICLE", "SUPPLY"].includes(raw.kind) ||
          !Number.isInteger(raw.quantity) || (raw.quantity as number) < 1 || (raw.quantity as number) > 100 ||
          (raw.unitId !== undefined && (typeof raw.unitId !== "string" || !idPattern.test(raw.unitId))) ||
          (raw.supplyType !== undefined && !isTacticalSupplyResourceId(raw.supplyType)) ||
          !Array.isArray(raw.tags) || raw.tags.length > 32 || !raw.tags.every((tag) => typeof tag === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(tag))) {
        return { valid: false, code: "CARGO_INVALID", message: "Cargo items contain invalid or unsupported fields." };
      }
      if ((raw.kind === "SUPPLY") !== (typeof raw.supplyType === "string") || (raw.kind !== "SUPPLY") !== (typeof raw.unitId === "string")) {
        return { valid: false, code: "CARGO_INVALID", message: "Unit cargo requires unitId; Supply cargo requires supplyType." };
      }
      cargoIds.add(raw.id);
      cargo.push({
        id: raw.id,
        kind: raw.kind,
        quantity: raw.quantity as number,
        unitId: raw.unitId as string | undefined,
        supplyType: isTacticalSupplyResourceId(raw.supplyType) ? raw.supplyType : undefined,
        tags: raw.tags as string[],
      });
    }
    carrierIds.add(candidate.carrierUnitId);
    transports.push({ carrierUnitId: candidate.carrierUnitId, cargoProfileId: candidate.cargoProfileId, cargo });
  }
  return {
    valid: true,
    value: {
      commandId: value.commandId as string,
      expectedRevision: value.expectedRevision as number,
      planId: value.planId as string,
      campaignId: value.campaignId as string,
      battlegroupId: typeof value.battlegroupId === "string" ? value.battlegroupId : undefined,
      method: value.method as DeploymentMethodId,
      insertionZoneId: typeof value.insertionZoneId === "string" ? value.insertionZoneId : undefined,
      route: value.route as SaveDeploymentPlanCommand["route"],
      units,
      transports,
    },
  };
}

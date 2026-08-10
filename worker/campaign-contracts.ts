import type {
  ActionType,
  CampaignRuntimeState,
  Facing,
  OrderType,
} from "../packages/domain/src";
import { CLOCK_PRESETS, type ClockPreset } from "./campaign-clock";

export const CAMPAIGN_STORAGE_SCHEMA_VERSION = 1 as const;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const orderTypes = new Set<OrderType>(["HOLD", "ADVANCE", "RUSH", "EVASIVE", "MELEE_CHARGE", "STEALTH"]);
const actionTypes = new Set<ActionType>([
  "ATTACK",
  "ASSAULT",
  "DIG_IN",
  "BREAK_OUT",
  "DEPLOY",
  "PACK_UP",
  "REPAIR",
  "CONSTRUCT",
  "GARRISON",
  "LOAD",
  "UNLOAD",
  "RESUPPLY",
  "RELOAD",
  "SCAN",
  "DEPLOY_DRONE",
  "HEAL",
  "ORBITAL_DROP",
  "BOMBARDMENT",
  "AIR_SUPPORT",
]);
const campaignPhases = new Set([
  "PLANNING",
  "LOCKED",
  "RESOLVING",
  "EFFECTS_PENDING",
  "PAUSED",
  "COMPLETE",
  "FAILED",
]);
const orderLifecycles = new Set(["DRAFT", "SUBMITTED", "LOCKED", "RESOLVING", "RESOLVED", "FAILED", "CANCELLED"]);
const sides = new Set(["ALLIED", "ENEMY", "NEUTRAL"]);
const deploymentStatuses = new Set(["READY", "ACTIVE", "IMMOBILISED", "DESTROYED", "WITHDRAWN"]);
const eventVisibilities = new Set(["PUBLIC", "ALLIED", "ENEMY", "ADMIN"]);
const eventTypes = new Set([
  "ROUND_STARTED",
  "ORDER_SUBMITTED",
  "ORDER_REJECTED",
  "ORDER_LOCKED",
  "UNIT_MOVED",
  "UNIT_BLOCKED",
  "UNIT_ATTACKED",
  "CARGO_LOADED",
  "CARGO_UNLOADED",
  "AIR_DROP_COMPLETED",
  "AIR_DROP_FAILED",
  "WEAPON_RELOADED",
  "MEDICAL_SUPPLY_RELOADED",
  "HEX_SCANNED",
  "DRONE_DEPLOYED",
  "DICE_ROLLED",
  "DAMAGE_APPLIED",
  "UNIT_HEALED",
  "UNIT_DESTROYED",
  "STRUCTURE_COMPLETED",
  "SUPPLY_TRANSFERRED",
  "ENEMY_REINFORCEMENTS_ARRIVED",
  "OBJECTIVE_CAPTURED",
  "ROUND_FINISHED",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_FAILED",
  "CAMPAIGN_PAUSED",
  "CAMPAIGN_RESUMED",
]);

export interface CampaignActionIntent {
  type: ActionType;
  targetDeploymentId?: string;
  targetHex?: { q: number; r: number };
  weaponId?: string;
  equipmentIds?: string[];
  payload?: {
    cargoDeploymentId?: string;
    mode?: "PARADROP";
  };
}

export interface CampaignOrderIntent {
  commandId: string;
  expectedCampaignVersion: number;
  expectedOrderRevision: number;
  unitId: string;
  round?: number;
  orderType: OrderType;
  lifecycle?: "DRAFT" | "SUBMITTED";
  route?: Array<{ q: number; r: number }>;
  facing: Facing;
  actions?: CampaignActionIntent[];
  incidentalActions?: CampaignActionIntent[];
  optionalRoleplayText?: string;
}

export interface CampaignClockIntent {
  commandId: string;
  expectedCampaignVersion: number;
  preset?: ClockPreset;
  durationMs?: number;
}

export interface StoredCampaignStateV1 {
  schemaVersion: typeof CAMPAIGN_STORAGE_SCHEMA_VERSION;
  state: CampaignRuntimeState;
}

export interface ParsedStoredCampaignState {
  state: CampaignRuntimeState;
  legacy: boolean;
}

export class CampaignRequestContractError extends Error {
  readonly code = "CAMPAIGN_REQUEST_INVALID";

  constructor(message: string, readonly path: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requestFail(path: string, message: string): never {
  throw new CampaignRequestContractError(message, path);
}

function stateFail(path: string, message: string): never {
  throw new Error(`CAMPAIGN_STATE_INVALID at ${path}: ${message}`);
}

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) requestFail(path, `Unknown field${extra.length === 1 ? "" : "s"}: ${extra.join(", ")}.`);
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    requestFail(path, "Expected a stable identifier of at most 128 characters.");
  }
  return value;
}

function coordinate(value: unknown, path: string): { q: number; r: number } {
  if (!isRecord(value)) requestFail(path, "Expected an axial coordinate object.");
  onlyKeys(value, ["q", "r"], path);
  if (!Number.isSafeInteger(value.q) || !Number.isSafeInteger(value.r)) {
    requestFail(path, "Coordinate q and r must be safe integers.");
  }
  return { q: value.q as number, r: value.r as number };
}

function actionIntent(value: unknown, path: string): CampaignActionIntent {
  if (!isRecord(value)) requestFail(path, "Expected an action object.");
  if (typeof value.type !== "string" || !actionTypes.has(value.type as ActionType)) {
    requestFail(`${path}.type`, "Unknown action type.");
  }
  const type = value.type as ActionType;
  const fieldsByType: Record<ActionType, string[]> = {
    ATTACK: ["targetDeploymentId", "targetHex", "weaponId"],
    ASSAULT: ["targetDeploymentId", "targetHex", "weaponId"],
    DIG_IN: [],
    BREAK_OUT: ["targetHex"],
    DEPLOY: [],
    PACK_UP: [],
    REPAIR: ["targetDeploymentId"],
    CONSTRUCT: ["targetHex"],
    GARRISON: ["targetHex"],
    LOAD: ["targetDeploymentId"],
    UNLOAD: ["targetDeploymentId", "targetHex", "payload"],
    RESUPPLY: ["targetDeploymentId"],
    RELOAD: ["weaponId"],
    SCAN: ["targetHex"],
    DEPLOY_DRONE: ["targetHex"],
    HEAL: ["targetDeploymentId"],
    ORBITAL_DROP: ["targetDeploymentId", "targetHex"],
    BOMBARDMENT: ["targetHex"],
    AIR_SUPPORT: ["targetHex"],
  };
  onlyKeys(value, ["type", "equipmentIds", ...fieldsByType[type]], path);
  const parsed: CampaignActionIntent = { type };
  if (value.targetDeploymentId !== undefined) {
    parsed.targetDeploymentId = identifier(value.targetDeploymentId, `${path}.targetDeploymentId`);
  }
  if (type === "HEAL" && parsed.targetDeploymentId === undefined) {
    requestFail(`${path}.targetDeploymentId`, "First Aid requires a target deployment.");
  }
  if (value.targetHex !== undefined) parsed.targetHex = coordinate(value.targetHex, `${path}.targetHex`);
  if (value.weaponId !== undefined) parsed.weaponId = identifier(value.weaponId, `${path}.weaponId`);
  if (value.equipmentIds !== undefined) {
    if (!Array.isArray(value.equipmentIds) || value.equipmentIds.length > 8) {
      requestFail(`${path}.equipmentIds`, "Expected at most eight equipment identifiers.");
    }
    const ids = value.equipmentIds.map((item, index) => identifier(item, `${path}.equipmentIds[${index}]`));
    if (new Set(ids).size !== ids.length) requestFail(`${path}.equipmentIds`, "Equipment identifiers must be unique.");
    parsed.equipmentIds = ids;
  }
  if (value.payload !== undefined) {
    if (type !== "UNLOAD") requestFail(`${path}.payload`, "This action type does not accept a payload.");
    if (!isRecord(value.payload)) requestFail(`${path}.payload`, "Expected an unload payload object.");
    onlyKeys(value.payload, ["cargoDeploymentId", "mode"], `${path}.payload`);
    const payload: NonNullable<CampaignActionIntent["payload"]> = {};
    if (value.payload.cargoDeploymentId !== undefined) {
      payload.cargoDeploymentId = identifier(value.payload.cargoDeploymentId, `${path}.payload.cargoDeploymentId`);
    }
    if (value.payload.mode !== undefined) {
      if (value.payload.mode !== "PARADROP") requestFail(`${path}.payload.mode`, "Only PARADROP mode is supported.");
      payload.mode = "PARADROP";
    }
    parsed.payload = payload;
  }
  if (type === "ATTACK" && (!parsed.targetDeploymentId || !parsed.weaponId)) {
    requestFail(path, "ATTACK requires targetDeploymentId and weaponId.");
  }
  if (type === "LOAD" && !parsed.targetDeploymentId) requestFail(path, "LOAD requires targetDeploymentId.");
  if (type === "UNLOAD" && !parsed.targetDeploymentId && !parsed.payload?.cargoDeploymentId) {
    requestFail(path, "UNLOAD requires targetDeploymentId or payload.cargoDeploymentId.");
  }
  if ((type === "SCAN" || type === "DEPLOY_DRONE") && !parsed.targetHex) {
    requestFail(path, `${type} requires targetHex.`);
  }
  return parsed;
}

function actionList(value: unknown, path: string): CampaignActionIntent[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16) requestFail(path, "Expected at most sixteen actions.");
  return value.map((item, index) => actionIntent(item, `${path}[${index}]`));
}

export function parseCampaignOrderIntent(value: unknown): CampaignOrderIntent {
  if (!isRecord(value)) requestFail("$", "Expected a campaign order object.");
  onlyKeys(
    value,
    [
      "commandId",
      "expectedCampaignVersion",
      "expectedOrderRevision",
      "unitId",
      "round",
      "orderType",
      "lifecycle",
      "route",
      "facing",
      "actions",
      "incidentalActions",
      "optionalRoleplayText",
    ],
    "$",
  );
  const commandId = identifier(value.commandId, "$.commandId");
  if (!Number.isSafeInteger(value.expectedCampaignVersion) || (value.expectedCampaignVersion as number) < 1) {
    requestFail("$.expectedCampaignVersion", "Expected campaign version must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(value.expectedOrderRevision) || (value.expectedOrderRevision as number) < 0) {
    requestFail("$.expectedOrderRevision", "Expected order revision must be a non-negative safe integer.");
  }
  const unitId = identifier(value.unitId, "$.unitId");
  if (typeof value.orderType !== "string" || !orderTypes.has(value.orderType as OrderType)) {
    requestFail("$.orderType", "A supported order type is required.");
  }
  if (!Number.isInteger(value.facing) || (value.facing as number) < 0 || (value.facing as number) > 5) {
    requestFail("$.facing", "Facing must be an integer from 0 through 5.");
  }
  const parsed: CampaignOrderIntent = {
    commandId,
    expectedCampaignVersion: value.expectedCampaignVersion as number,
    expectedOrderRevision: value.expectedOrderRevision as number,
    unitId,
    orderType: value.orderType as OrderType,
    facing: value.facing as Facing,
  };
  if (value.round !== undefined) {
    if (!Number.isSafeInteger(value.round) || (value.round as number) < 1) {
      requestFail("$.round", "Round must be a positive safe integer.");
    }
    parsed.round = value.round as number;
  }
  if (value.lifecycle !== undefined) {
    if (value.lifecycle !== "DRAFT" && value.lifecycle !== "SUBMITTED") {
      requestFail("$.lifecycle", "Lifecycle must be DRAFT or SUBMITTED.");
    }
    parsed.lifecycle = value.lifecycle;
  }
  if (value.route !== undefined) {
    if (!Array.isArray(value.route) || value.route.length > 128) {
      requestFail("$.route", "Route must contain at most 128 coordinates.");
    }
    parsed.route = value.route.map((item, index) => coordinate(item, `$.route[${index}]`));
  }
  parsed.actions = actionList(value.actions, "$.actions");
  parsed.incidentalActions = actionList(value.incidentalActions, "$.incidentalActions");
  if ((parsed.actions?.length ?? 0) + (parsed.incidentalActions?.length ?? 0) > 16) {
    requestFail("$", "An order may contain at most sixteen actions in total.");
  }
  if (value.optionalRoleplayText !== undefined) {
    if (typeof value.optionalRoleplayText !== "string" || value.optionalRoleplayText.length > 500) {
      requestFail("$.optionalRoleplayText", "Roleplay text must be a string of at most 500 characters.");
    }
    parsed.optionalRoleplayText = value.optionalRoleplayText.trim();
  }
  return parsed;
}

export function parseCampaignClockIntent(value: unknown): CampaignClockIntent {
  if (!isRecord(value)) requestFail("$", "Expected a campaign clock object.");
  onlyKeys(value, ["commandId", "expectedCampaignVersion", "preset", "durationMs"], "$");
  const commandId = identifier(value.commandId, "$.commandId");
  if (!Number.isSafeInteger(value.expectedCampaignVersion) || (value.expectedCampaignVersion as number) < 1) {
    requestFail("$.expectedCampaignVersion", "Expected campaign version must be a positive safe integer.");
  }
  const parsed: CampaignClockIntent = {
    commandId,
    expectedCampaignVersion: value.expectedCampaignVersion as number,
  };
  if (value.preset !== undefined) {
    if (typeof value.preset !== "string" || !Object.hasOwn(CLOCK_PRESETS, value.preset)) {
      requestFail("$.preset", "Unknown campaign clock preset.");
    }
    parsed.preset = value.preset as ClockPreset;
  }
  if (value.durationMs !== undefined) {
    if (
      !Number.isInteger(value.durationMs) ||
      ((value.durationMs as number) !== 0 && (value.durationMs as number) < 5_000) ||
      (value.durationMs as number) > 86_400_000
    ) {
      requestFail("$.durationMs", "Clock duration must be manual (0) or an integer from 5000 through 86400000 milliseconds.");
    }
    parsed.durationMs = value.durationMs as number;
  }
  if (parsed.preset === undefined && parsed.durationMs === undefined) {
    requestFail("$", "Choose a preset or a duration.");
  }
  if (parsed.preset !== undefined && parsed.durationMs !== undefined) {
    requestFail("$", "Choose a preset or a duration, not both.");
  }
  return parsed;
}

export async function assertCampaignMutationBodyEmpty(request: Request): Promise<void> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) requestFail("$", "Request body must be empty.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 64_000 || text.trim().length > 0) {
    requestFail("$", "Request body must be empty.");
  }
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalCampaignJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => compareCodePoints(left, right)));
    }
    return item;
  });
}

export async function campaignCommandHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalCampaignJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stateRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) stateFail(path, "expected an object");
  return value;
}

function stateOnlyKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) stateFail(path, `unknown fields: ${extra.join(", ")}`);
}

function stateString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) stateFail(path, "expected a non-empty string");
  return value;
}

function stateInteger(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) stateFail(path, `expected a safe integer >= ${minimum}`);
  return value as number;
}

function stateNumber(value: unknown, path: string, minimum?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    stateFail(path, `expected a finite number${minimum === undefined ? "" : ` >= ${minimum}`}`);
  }
  return value;
}

function stateArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) stateFail(path, "expected an array");
  return value;
}

function stateCoordinate(value: unknown, path: string): { q: number; r: number } {
  const record = stateRecord(value, path);
  return {
    q: stateInteger(record.q, `${path}.q`, Number.MIN_SAFE_INTEGER),
    r: stateInteger(record.r, `${path}.r`, Number.MIN_SAFE_INTEGER),
  };
}

function stateStringArray(value: unknown, path: string): string[] {
  return stateArray(value, path).map((item, index) => stateString(item, `${path}[${index}]`));
}

function stateBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") stateFail(path, "expected a boolean");
  return value;
}

function stateFacingArray(value: unknown, path: string): number[] {
  const facings = stateArray(value, path).map((item, index) => stateInteger(item, `${path}[${index}]`, 0));
  if (facings.some((facing) => facing > 5)) stateFail(path, "expected facings from 0 through 5");
  if (new Set(facings).size !== facings.length) stateFail(path, "duplicate facing");
  return facings;
}

function coordinatesMatch(left: { q: number; r: number }, right: { q: number; r: number }): boolean {
  return left.q === right.q && left.r === right.r;
}

function stateNumericRecord(value: unknown, path: string): void {
  const record = stateRecord(value, path);
  for (const [key, item] of Object.entries(record)) stateNumber(item, `${path}.${key}`, 0);
}

function validateStoredAction(value: unknown, path: string): string {
  const action = stateRecord(value, path);
  const id = stateString(action.id, `${path}.id`);
  if (typeof action.type !== "string" || !actionTypes.has(action.type as ActionType)) stateFail(`${path}.type`, "unknown action type");
  if (!new Set(["STANDARD", "PRIMARY", "INCIDENTAL"]).has(action.economy as string)) stateFail(`${path}.economy`, "invalid action economy");
  stateNumber(action.speedCost, `${path}.speedCost`, 0);
  stateStringArray(action.equipmentIds, `${path}.equipmentIds`);
  if (action.targetDeploymentId !== undefined) stateString(action.targetDeploymentId, `${path}.targetDeploymentId`);
  if (action.targetHex !== undefined) stateCoordinate(action.targetHex, `${path}.targetHex`);
  if (action.weaponId !== undefined) stateString(action.weaponId, `${path}.weaponId`);
  if (action.ammoRequested !== undefined) stateInteger(action.ammoRequested, `${path}.ammoRequested`, 1);
  if (action.payload !== undefined) stateRecord(action.payload, `${path}.payload`);
  return id;
}

function validateCampaignState(state: Record<string, unknown>, campaignId: string): CampaignRuntimeState {
  const allowedTopLevel = new Set([
    "campaignId",
    "campaignName",
    "planetName",
    "scenarioId",
    "scenarioVersion",
    "rulesetVersion",
    "engineVersion",
    "round",
    "phase",
    "clock",
    "map",
    "deployments",
    "orders",
    "objectives",
    "scenarioPolicy",
    "reinforcementWaves",
    "outcome",
    "events",
    "resolutions",
    "pendingPersistentEffects",
    "version",
  ]);
  const extras = Object.keys(state).filter((key) => !allowedTopLevel.has(key));
  if (extras.length > 0) stateFail("$", `unknown top-level fields: ${extras.join(", ")}`);
  if (stateString(state.campaignId, "$.campaignId") !== campaignId) stateFail("$.campaignId", "does not match the Durable Object identity");
  stateString(state.campaignName, "$.campaignName");
  stateString(state.planetName, "$.planetName");
  if (state.scenarioId !== undefined) stateString(state.scenarioId, "$.scenarioId");
  if (state.scenarioVersion !== undefined) stateInteger(state.scenarioVersion, "$.scenarioVersion", 1);
  stateString(state.rulesetVersion, "$.rulesetVersion");
  stateString(state.engineVersion, "$.engineVersion");
  stateInteger(state.round, "$.round", 1);
  stateInteger(state.version, "$.version", 1);
  if (typeof state.phase !== "string" || !campaignPhases.has(state.phase)) stateFail("$.phase", "invalid campaign phase");

  const clock = stateRecord(state.clock, "$.clock");
  const durationMs = stateInteger(clock.durationMs, "$.clock.durationMs", 0);
  const lockLeadMs = stateInteger(clock.lockLeadMs, "$.clock.lockLeadMs", 0);
  const roundStartedAt = stateInteger(clock.roundStartedAt, "$.clock.roundStartedAt", 0);
  const lockAt = stateInteger(clock.lockAt, "$.clock.lockAt", 0);
  const resolvesAt = stateInteger(clock.resolvesAt, "$.clock.resolvesAt", 0);
  if (clock.pausedAt !== undefined) stateInteger(clock.pausedAt, "$.clock.pausedAt", 0);
  if (
    clock.phaseBeforePause !== undefined &&
    (clock.phaseBeforePause === "PAUSED" || !campaignPhases.has(clock.phaseBeforePause as string))
  ) {
    stateFail("$.clock.phaseBeforePause", "invalid campaign phase");
  }
  if (state.phase === "PAUSED" && clock.pausedAt === undefined) stateFail("$.clock.pausedAt", "paused campaigns require pausedAt");
  if (state.phase !== "PAUSED" && (clock.pausedAt !== undefined || clock.phaseBeforePause !== undefined)) {
    stateFail("$.clock", "pause metadata is allowed only while paused");
  }
  if (durationMs === 0) {
    if (lockLeadMs !== 0 || lockAt !== 0 || resolvesAt !== 0) stateFail("$.clock", "manual clocks cannot have deadlines");
  } else {
    if (durationMs < 5_000) stateFail("$.clock.durationMs", "timed clocks must be at least 5000 milliseconds");
    if (lockLeadMs < 1_000 || lockLeadMs > Math.floor(durationMs / 2)) stateFail("$.clock.lockLeadMs", "invalid timed lock lead");
    if (roundStartedAt > lockAt || lockAt > resolvesAt || resolvesAt - lockAt !== lockLeadMs) {
      stateFail("$.clock", "deadline ordering or lock lead is inconsistent");
    }
  }
  const scheduleIds = new Set<string>();
  const scheduleTypes = new Set<string>();
  for (const [index, scheduledValue] of stateArray(clock.schedule, "$.clock.schedule").entries()) {
    const scheduled = stateRecord(scheduledValue, `$.clock.schedule[${index}]`);
    const id = stateString(scheduled.id, `$.clock.schedule[${index}].id`);
    if (scheduleIds.has(id)) stateFail(`$.clock.schedule[${index}].id`, "duplicate scheduled event identifier");
    scheduleIds.add(id);
    if (!new Set(["ORDER_LOCK", "ROUND_RESOLVE", "CAMPAIGN_END"]).has(scheduled.type as string)) {
      stateFail(`$.clock.schedule[${index}].type`, "invalid scheduled event type");
    }
    if (scheduleTypes.has(scheduled.type as string)) stateFail(`$.clock.schedule[${index}].type`, "duplicate scheduled event type");
    scheduleTypes.add(scheduled.type as string);
    if (stateInteger(scheduled.round, `$.clock.schedule[${index}].round`, 1) !== state.round) {
      stateFail(`$.clock.schedule[${index}].round`, "scheduled event targets another round");
    }
    const runAt = stateInteger(scheduled.runAt, `$.clock.schedule[${index}].runAt`, 0);
    if (scheduled.type === "ORDER_LOCK" && runAt !== lockAt) stateFail(`$.clock.schedule[${index}].runAt`, "lock schedule does not match lockAt");
    if (scheduled.type === "ROUND_RESOLVE" && runAt !== resolvesAt) stateFail(`$.clock.schedule[${index}].runAt`, "resolution schedule does not match resolvesAt");
  }
  if (durationMs === 0 && scheduleIds.size > 0) stateFail("$.clock.schedule", "manual clocks cannot schedule alarms");
  if (durationMs > 0 && state.phase !== "EFFECTS_PENDING" && !scheduleTypes.has("ROUND_RESOLVE")) {
    stateFail("$.clock.schedule", "timed clocks require round resolution");
  }

  const mapKeys = new Set<string>();
  for (const [index, hexValue] of stateArray(state.map, "$.map").entries()) {
    const hex = stateRecord(hexValue, `$.map[${index}]`);
    const coord = stateCoordinate(hex.coord, `$.map[${index}].coord`);
    const key = `${coord.q},${coord.r}`;
    if (mapKeys.has(key)) stateFail(`$.map[${index}].coord`, "duplicate battlefield coordinate");
    mapKeys.add(key);
    stateString(hex.terrainId, `$.map[${index}].terrainId`);
    stateNumber(hex.elevation, `$.map[${index}].elevation`);
    stateNumber(hex.movementCost, `$.map[${index}].movementCost`, 0);
    if (typeof hex.blocksLineOfSight !== "boolean") stateFail(`$.map[${index}].blocksLineOfSight`, "expected a boolean");
    stateNumber(hex.lineOfSightModifier, `$.map[${index}].lineOfSightModifier`);
    stateInteger(hex.capacity, `$.map[${index}].capacity`, 0);
    const edges = stateRecord(hex.edges, `$.map[${index}].edges`);
    stateFacingArray(edges.rivers, `$.map[${index}].edges.rivers`);
    stateFacingArray(edges.roads, `$.map[${index}].edges.roads`);
    stateStringArray(hex.structureIds, `$.map[${index}].structureIds`);
    stateStringArray(hex.environment, `$.map[${index}].environment`);
    if (typeof hex.control !== "string" || !sides.has(hex.control)) stateFail(`$.map[${index}].control`, "invalid side");
  }

  const deploymentIds = new Set<string>();
  const deploymentState = new Map<string, { side: string; status: string; locationState?: string }>();
  for (const [index, deploymentValue] of stateArray(state.deployments, "$.deployments").entries()) {
    const path = `$.deployments[${index}]`;
    const deployment = stateRecord(deploymentValue, path);
    const id = stateString(deployment.id, `${path}.id`);
    if (deploymentIds.has(id)) stateFail(`${path}.id`, "duplicate deployment identifier");
    deploymentIds.add(id);
    if (stateString(deployment.campaignId, `${path}.campaignId`) !== campaignId) stateFail(`${path}.campaignId`, "campaign mismatch");
    stateString(deployment.ownerId, `${path}.ownerId`);
    stateString(deployment.definitionId, `${path}.definitionId`);
    stateString(deployment.callsign, `${path}.callsign`);
    if (typeof deployment.side !== "string" || !sides.has(deployment.side)) stateFail(`${path}.side`, "invalid side");
    if (typeof deployment.status !== "string" || !deploymentStatuses.has(deployment.status)) stateFail(`${path}.status`, "invalid deployment status");
    stateCoordinate(deployment.position, `${path}.position`);
    stateInteger(deployment.facing, `${path}.facing`, 0);
    if ((deployment.facing as number) > 5) stateFail(`${path}.facing`, "expected facing 0 through 5");
    const stats = stateRecord(deployment.stats, `${path}.stats`);
    if (stats.healthModel !== "FORCE_STRENGTH" && stats.healthModel !== "HITS") stateFail(`${path}.stats.healthModel`, "invalid health model");
    for (const key of ["maxHealth", "armor", "defense", "speed", "sensors", "capacity"] as const) {
      stateNumber(stats[key], `${path}.stats.${key}`, 0);
    }
    stateNumber(deployment.currentHealth, `${path}.currentHealth`, 0);
    if ((deployment.currentHealth as number) > (stats.maxHealth as number)) stateFail(`${path}.currentHealth`, "exceeds maxHealth");
    if (!mapKeys.has(`${(deployment.position as { q: number; r: number }).q},${(deployment.position as { q: number; r: number }).r}`)) {
      stateFail(`${path}.position`, "deployment is outside the battlefield map");
    }
    const weaponIds = new Set<string>();
    for (const [weaponIndex, weaponValue] of stateArray(deployment.weapons, `${path}.weapons`).entries()) {
      const weaponPath = `${path}.weapons[${weaponIndex}]`;
      const weapon = stateRecord(weaponValue, weaponPath);
      const weaponId = stateString(weapon.id, `${weaponPath}.id`);
      if (weaponIds.has(weaponId)) stateFail(`${weaponPath}.id`, "duplicate weapon identifier");
      weaponIds.add(weaponId);
      stateString(weapon.name, `${weaponPath}.name`);
      const damage = stateRecord(weapon.damage, `${weaponPath}.damage`);
      stateInteger(damage.count, `${weaponPath}.damage.count`, 1);
      stateInteger(damage.sides, `${weaponPath}.damage.sides`, 1);
      if (damage.modifier !== undefined) stateNumber(damage.modifier, `${weaponPath}.damage.modifier`);
      stateNumber(weapon.range, `${weaponPath}.range`, 0);
      stateNumber(weapon.armorPiercing, `${weaponPath}.armorPiercing`, 0);
      if (weapon.indirect !== undefined) stateBoolean(weapon.indirect, `${weaponPath}.indirect`);
      if (weapon.ammoCapacity !== undefined) stateInteger(weapon.ammoCapacity, `${weaponPath}.ammoCapacity`, 1);
      if (weapon.cooldownRounds !== undefined) stateInteger(weapon.cooldownRounds, `${weaponPath}.cooldownRounds`, 0);
      stateStringArray(weapon.tags, `${weaponPath}.tags`);
    }
    stateNumericRecord(deployment.ammunition, `${path}.ammunition`);
    stateNumericRecord(deployment.cooldowns, `${path}.cooldowns`);
    stateStringArray(deployment.statuses, `${path}.statuses`);
    stateStringArray(deployment.equipmentIds, `${path}.equipmentIds`);
    if (deployment.allowedActions !== undefined) {
      for (const action of stateStringArray(deployment.allowedActions, `${path}.allowedActions`)) {
        if (!actionTypes.has(action as ActionType)) stateFail(`${path}.allowedActions`, `unknown action ${action}`);
      }
    }
    if (deployment.allowedOrders !== undefined) {
      for (const order of stateStringArray(deployment.allowedOrders, `${path}.allowedOrders`)) {
        if (!orderTypes.has(order as OrderType)) stateFail(`${path}.allowedOrders`, `unknown order ${order}`);
      }
    }
    deploymentState.set(id, {
      side: deployment.side as string,
      status: deployment.status as string,
      locationState: typeof deployment.locationState === "string" ? deployment.locationState : undefined,
    });
  }

  if (state.reinforcementWaves !== undefined) {
    const waveIds = new Set<string>();
    const scheduledDeployments = new Set<string>();
    const waves = stateArray(state.reinforcementWaves, "$.reinforcementWaves");
    if (waves.length > 16) stateFail("$.reinforcementWaves", "too many reinforcement waves");
    for (const [index, waveValue] of waves.entries()) {
      const path = `$.reinforcementWaves[${index}]`;
      const wave = stateRecord(waveValue, path);
      stateOnlyKeys(wave, ["id", "arrivesAfterRound", "deploymentIds", "status"], path);
      const id = stateString(wave.id, `${path}.id`);
      if (waveIds.has(id)) stateFail(`${path}.id`, "duplicate reinforcement wave identifier");
      waveIds.add(id);
      stateInteger(wave.arrivesAfterRound, `${path}.arrivesAfterRound`, 1);
      if (wave.status !== "PENDING" && wave.status !== "ARRIVED") stateFail(`${path}.status`, "invalid wave status");
      const ids = stateStringArray(wave.deploymentIds, `${path}.deploymentIds`);
      if (ids.length === 0) stateFail(`${path}.deploymentIds`, "wave requires at least one deployment");
      if (new Set(ids).size !== ids.length) stateFail(`${path}.deploymentIds`, "duplicate deployment in wave");
      for (const deploymentId of ids) {
        if (scheduledDeployments.has(deploymentId)) stateFail(`${path}.deploymentIds`, "deployment belongs to another wave");
        scheduledDeployments.add(deploymentId);
        const deployment = deploymentState.get(deploymentId);
        if (!deployment) stateFail(`${path}.deploymentIds`, "deployment does not exist");
        if (deployment.side !== "ENEMY") stateFail(`${path}.deploymentIds`, "reinforcements must be Enemy deployments");
        if (
          wave.status === "PENDING" &&
          (deployment.status !== "READY" || deployment.locationState !== "RESERVE")
        ) {
          stateFail(`${path}.deploymentIds`, "pending reinforcement is not in reserve");
        }
      }
    }
  }

  const orderIds = new Set<string>();
  for (const [index, orderValue] of stateArray(state.orders, "$.orders").entries()) {
    const path = `$.orders[${index}]`;
    const order = stateRecord(orderValue, path);
    const id = stateString(order.id, `${path}.id`);
    if (orderIds.has(id)) stateFail(`${path}.id`, "duplicate order identifier");
    orderIds.add(id);
    if (stateString(order.campaignId, `${path}.campaignId`) !== campaignId) stateFail(`${path}.campaignId`, "campaign mismatch");
    const unitId = stateString(order.unitId, `${path}.unitId`);
    if (!deploymentIds.has(unitId)) stateFail(`${path}.unitId`, "deployment does not exist");
    stateInteger(order.revision, `${path}.revision`, 1);
    stateInteger(order.round, `${path}.round`, 1);
    if (typeof order.orderType !== "string" || !orderTypes.has(order.orderType as OrderType)) stateFail(`${path}.orderType`, "invalid order type");
    if (typeof order.lifecycle !== "string" || !orderLifecycles.has(order.lifecycle)) stateFail(`${path}.lifecycle`, "invalid order lifecycle");
    const startHex = stateCoordinate(order.startHex, `${path}.startHex`);
    const route = stateArray(order.route, `${path}.route`).map((coord, routeIndex) => stateCoordinate(coord, `${path}.route[${routeIndex}]`));
    if (route.length === 0 || route.length > 128) stateFail(`${path}.route`, "route must contain 1 through 128 coordinates");
    const endHex = stateCoordinate(order.endHex, `${path}.endHex`);
    if (!coordinatesMatch(route[0]!, startHex) || !coordinatesMatch(route.at(-1)!, endHex)) {
      stateFail(`${path}.route`, "route endpoints do not match startHex and endHex");
    }
    if (route.some((coord) => !mapKeys.has(`${coord.q},${coord.r}`))) stateFail(`${path}.route`, "route leaves the battlefield map");
    stateInteger(order.facing, `${path}.facing`, 0);
    if ((order.facing as number) > 5) stateFail(`${path}.facing`, "expected facing 0 through 5");
    const storedActions = stateArray(order.actions, `${path}.actions`);
    const storedIncidentals = stateArray(order.incidentalActions, `${path}.incidentalActions`);
    if (storedActions.length + storedIncidentals.length > 16) stateFail(path, "order contains more than sixteen actions");
    const actionIds = new Set<string>();
    for (const [actionIndex, action] of storedActions.entries()) {
      const actionId = validateStoredAction(action, `${path}.actions[${actionIndex}]`);
      if (actionIds.has(actionId)) stateFail(`${path}.actions[${actionIndex}].id`, "duplicate action identifier");
      actionIds.add(actionId);
    }
    for (const [actionIndex, action] of storedIncidentals.entries()) {
      const actionId = validateStoredAction(action, `${path}.incidentalActions[${actionIndex}]`);
      if (actionIds.has(actionId)) stateFail(`${path}.incidentalActions[${actionIndex}].id`, "duplicate action identifier");
      actionIds.add(actionId);
    }
    stateStringArray(order.targets, `${path}.targets`);
    stateStringArray(order.equipmentUsed, `${path}.equipmentUsed`);
    stateNumericRecord(order.ammoUsed, `${path}.ammoUsed`);
    stateString(order.submittedBy, `${path}.submittedBy`);
    stateNumber(order.submittedAt, `${path}.submittedAt`, 0);
  }

  const eventIds = new Set<string>();
  const eventSequences = new Set<string>();
  for (const [index, eventValue] of stateArray(state.events, "$.events").entries()) {
    const path = `$.events[${index}]`;
    const event = stateRecord(eventValue, path);
    const id = stateString(event.eventId, `${path}.eventId`);
    if (eventIds.has(id)) stateFail(`${path}.eventId`, "duplicate event identifier");
    eventIds.add(id);
    if (stateString(event.campaignId, `${path}.campaignId`) !== campaignId) stateFail(`${path}.campaignId`, "campaign mismatch");
    const eventRound = stateInteger(event.round, `${path}.round`, 1);
    const sequence = stateInteger(event.sequence, `${path}.sequence`, 1);
    const sequenceKey = `${eventRound}:${sequence}`;
    if (eventSequences.has(sequenceKey)) stateFail(`${path}.sequence`, "duplicate event sequence for round");
    eventSequences.add(sequenceKey);
    if (typeof event.type !== "string" || !eventTypes.has(event.type)) stateFail(`${path}.type`, "invalid event type");
    stateRecord(event.payload, `${path}.payload`);
    stateNumber(event.timestamp, `${path}.timestamp`, 0);
    if (typeof event.visibility !== "string" || !eventVisibilities.has(event.visibility)) stateFail(`${path}.visibility`, "invalid event visibility");
  }

  const objectiveState = new Map<string, { owner: string; status: string }>();
  for (const [index, objectiveValue] of stateArray(state.objectives, "$.objectives").entries()) {
    const path = `$.objectives[${index}]`;
    const objective = stateRecord(objectiveValue, path);
    const id = stateString(objective.id, `${path}.id`);
    if (objectiveState.has(id)) stateFail(`${path}.id`, "duplicate objective identifier");
    stateString(objective.name, `${path}.name`);
    stateCoordinate(objective.coord, `${path}.coord`);
    stateString(objective.description, `${path}.description`);
    if (typeof objective.owner !== "string" || !sides.has(objective.owner)) stateFail(`${path}.owner`, "invalid side");
    if (!new Set(["ACTIVE", "SECURED", "FAILED"]).has(objective.status as string)) stateFail(`${path}.status`, "invalid objective status");
    objectiveState.set(id, { owner: objective.owner as string, status: objective.status as string });
  }

  if (state.scenarioPolicy !== undefined) {
    const policy = stateRecord(state.scenarioPolicy, "$.scenarioPolicy");
    stateOnlyKeys(
      policy,
      ["policyId", "version", "startRound", "maxRounds", "primaryObjectiveId", "capturableObjectiveIds"],
      "$.scenarioPolicy",
    );
    if (policy.policyId !== "HOLD_PRIMARY_OBJECTIVE") stateFail("$.scenarioPolicy.policyId", "unsupported scenario policy");
    if (policy.version !== 1) stateFail("$.scenarioPolicy.version", "unsupported scenario policy version");
    const startRound = stateInteger(policy.startRound, "$.scenarioPolicy.startRound", 1);
    const maxRounds = stateInteger(policy.maxRounds, "$.scenarioPolicy.maxRounds", 1);
    if (!Number.isSafeInteger(startRound + maxRounds - 1)) {
      stateFail("$.scenarioPolicy.maxRounds", "scenario duration exceeds the supported round range");
    }
    const primaryObjectiveId = stateString(policy.primaryObjectiveId, "$.scenarioPolicy.primaryObjectiveId");
    const capturableObjectiveIds = stateStringArray(
      policy.capturableObjectiveIds,
      "$.scenarioPolicy.capturableObjectiveIds",
    );
    if (capturableObjectiveIds.length === 0) stateFail("$.scenarioPolicy.capturableObjectiveIds", "at least one objective is required");
    if (new Set(capturableObjectiveIds).size !== capturableObjectiveIds.length) {
      stateFail("$.scenarioPolicy.capturableObjectiveIds", "duplicate objective identifier");
    }
    if (!objectiveState.has(primaryObjectiveId)) stateFail("$.scenarioPolicy.primaryObjectiveId", "objective does not exist");
    if (!capturableObjectiveIds.includes(primaryObjectiveId)) {
      stateFail("$.scenarioPolicy.primaryObjectiveId", "primary objective must be capturable");
    }
    for (const [index, id] of capturableObjectiveIds.entries()) {
      if (!objectiveState.has(id)) stateFail(`$.scenarioPolicy.capturableObjectiveIds[${index}]`, "objective does not exist");
    }
    if (state.reinforcementWaves !== undefined) {
      const finalRound = startRound + maxRounds - 1;
      for (const [index, waveValue] of stateArray(state.reinforcementWaves, "$.reinforcementWaves").entries()) {
        const wave = stateRecord(waveValue, `$.reinforcementWaves[${index}]`);
        const arrivesAfterRound = stateInteger(
          wave.arrivesAfterRound,
          `$.reinforcementWaves[${index}].arrivesAfterRound`,
          1,
        );
        if (arrivesAfterRound < startRound || arrivesAfterRound >= finalRound) {
          stateFail(
            `$.reinforcementWaves[${index}].arrivesAfterRound`,
            "wave must arrive after a playable non-final scenario round",
          );
        }
      }
    }
  }

  if (state.outcome !== undefined) {
    if (state.scenarioPolicy === undefined) stateFail("$.outcome", "scenario outcome requires a scenario policy");
    if (state.phase !== "COMPLETE" && state.phase !== "EFFECTS_PENDING") {
      stateFail("$.phase", "scenario outcome requires COMPLETE or EFFECTS_PENDING phase");
    }
    const campaignOutcome = stateRecord(state.outcome, "$.outcome");
    stateOnlyKeys(campaignOutcome, ["result", "round", "reason", "objectives", "rewards"], "$.outcome");
    if (campaignOutcome.result !== "VICTORY" && campaignOutcome.result !== "DEFEAT") {
      stateFail("$.outcome.result", "invalid campaign outcome");
    }
    const outcomeRound = stateInteger(campaignOutcome.round, "$.outcome.round", 1);
    if (outcomeRound !== state.round) stateFail("$.outcome.round", "must match the campaign round");
    const victoryReason = "FINAL_ROUND_PRIMARY_HELD";
    const defeatReasons = new Set([
      "ALL_ALLIED_DEPLOYMENTS_LOST",
      "PRIMARY_OBJECTIVE_LOST",
      "FINAL_ROUND_CONDITIONS_NOT_MET",
    ]);
    if (
      (campaignOutcome.result === "VICTORY" && campaignOutcome.reason !== victoryReason) ||
      (campaignOutcome.result === "DEFEAT" && !defeatReasons.has(campaignOutcome.reason as string))
    ) {
      stateFail("$.outcome.reason", "reason does not match the campaign outcome");
    }
    const summaryIds = new Set<string>();
    for (const [index, summaryValue] of stateArray(campaignOutcome.objectives, "$.outcome.objectives").entries()) {
      const path = `$.outcome.objectives[${index}]`;
      const summary = stateRecord(summaryValue, path);
      stateOnlyKeys(summary, ["id", "owner", "status"], path);
      const id = stateString(summary.id, `${path}.id`);
      if (summaryIds.has(id)) stateFail(`${path}.id`, "duplicate objective summary");
      summaryIds.add(id);
      const current = objectiveState.get(id);
      if (!current) stateFail(`${path}.id`, "objective does not exist");
      if (summary.owner !== current.owner || summary.status !== current.status) {
        stateFail(path, "summary does not match objective state");
      }
    }
    if (summaryIds.size !== objectiveState.size) stateFail("$.outcome.objectives", "must summarize every objective");
    const rewards = stateRecord(campaignOutcome.rewards, "$.outcome.rewards");
    stateOnlyKeys(rewards, ["serviceHistory", "requisition"], "$.outcome.rewards");
    if (rewards.serviceHistory !== "RECORDED") stateFail("$.outcome.rewards.serviceHistory", "invalid service history status");
    const requisition = stateRecord(rewards.requisition, "$.outcome.rewards.requisition");
    stateOnlyKeys(requisition, ["status", "amount", "rulesDecisionId"], "$.outcome.rewards.requisition");
    if (
      requisition.status !== "BALANCE_REQUIRED" || requisition.amount !== null ||
      requisition.rulesDecisionId !== "RC-V5-016"
    ) {
      stateFail("$.outcome.rewards.requisition", "unpublished requisition reward must remain blocked");
    }
  }

  const resolutions = stateRecord(state.resolutions, "$.resolutions");
  for (const [key, resolutionValue] of Object.entries(resolutions)) {
    const path = `$.resolutions.${key}`;
    const resolution = stateRecord(resolutionValue, path);
    if (stateString(resolution.key, `${path}.key`) !== key) stateFail(`${path}.key`, "resolution key does not match record key");
    if (stateString(resolution.campaignId, `${path}.campaignId`) !== campaignId) stateFail(`${path}.campaignId`, "campaign mismatch");
    stateInteger(resolution.round, `${path}.round`, 1);
    stateString(resolution.seed, `${path}.seed`);
    stateNumber(resolution.startedAt, `${path}.startedAt`, 0);
    stateNumber(resolution.committedAt, `${path}.committedAt`, 0);
    stateStringArray(resolution.eventIds, `${path}.eventIds`);
    stateString(resolution.stateDigest, `${path}.stateDigest`);
    if (
      resolution.status !== undefined &&
      !new Set(["EFFECTS_PENDING", "RESOLVED", "FAILED"]).has(resolution.status as string)
    ) {
      stateFail(`${path}.status`, "invalid resolution status");
    }
    if (resolution.effectCount !== undefined) stateInteger(resolution.effectCount, `${path}.effectCount`, 0);
    if (resolution.appliedEffectCount !== undefined) {
      stateInteger(resolution.appliedEffectCount, `${path}.appliedEffectCount`, 0);
    }
    if (resolution.resolvedAt !== undefined) stateNumber(resolution.resolvedAt, `${path}.resolvedAt`, 0);
  }

  for (const [index, effectValue] of stateArray(state.pendingPersistentEffects, "$.pendingPersistentEffects").entries()) {
    const path = `$.pendingPersistentEffects[${index}]`;
    const effect = stateRecord(effectValue, path);
    stateString(effect.idempotencyKey, `${path}.idempotencyKey`);
    if (!new Set(["UNIT_DESTROYED", "UNIT_DAMAGED", "UNIT_STATE_UPDATED", "REQUISITION_AWARDED", "CAMPAIGN_HISTORY", "CAMPAIGN_RESULT"]).has(effect.type as string)) {
      stateFail(`${path}.type`, "invalid persistent effect type");
    }
    stateRecord(effect.payload, `${path}.payload`);
    if (!new Set(["PENDING", "APPLIED", "FAILED"]).has(effect.status as string)) stateFail(`${path}.status`, "invalid effect status");
  }

  return state as unknown as CampaignRuntimeState;
}

export function encodeCampaignStoredState(state: CampaignRuntimeState): StoredCampaignStateV1 {
  return {
    schemaVersion: CAMPAIGN_STORAGE_SCHEMA_VERSION,
    state: validateCampaignState(state as unknown as Record<string, unknown>, state.campaignId),
  };
}

export function parseCampaignStoredState(value: unknown, campaignId: string): ParsedStoredCampaignState {
  const candidate = stateRecord(value, "$storage");
  if (candidate.schemaVersion === CAMPAIGN_STORAGE_SCHEMA_VERSION) {
    const keys = Object.keys(candidate);
    if (keys.length !== 2 || !keys.includes("state")) stateFail("$storage", "version 1 envelope must contain only schemaVersion and state");
    const storedState = structuredClone(stateRecord(candidate.state, "$storage.state"));
    const outcome = storedState.outcome;
    const rewardUpgradeRequired = Boolean(outcome && typeof outcome === "object" && !Array.isArray(outcome) && !("rewards" in outcome));
    if (rewardUpgradeRequired) {
      (outcome as Record<string, unknown>).rewards = {
        serviceHistory: "RECORDED",
        requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
      };
    }
    return {
      state: validateCampaignState(storedState, campaignId),
      legacy: rewardUpgradeRequired,
    };
  }
  if (candidate.schemaVersion !== undefined) stateFail("$storage.schemaVersion", "unsupported storage schema version");
  const legacyState = structuredClone(candidate);
  const legacyOutcome = legacyState.outcome;
  if (legacyOutcome && typeof legacyOutcome === "object" && !Array.isArray(legacyOutcome) && !("rewards" in legacyOutcome)) {
    (legacyOutcome as Record<string, unknown>).rewards = {
      serviceHistory: "RECORDED",
      requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
    };
  }
  return { state: validateCampaignState(legacyState, campaignId), legacy: true };
}

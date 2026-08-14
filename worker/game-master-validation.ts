import type { FactionSide, Facing } from "../packages/domain/src";
import {
  AdminMapValidationError,
  validateAdminMap,
  type AdminMapDocumentV1,
  type AdminMapMechanicalTerrainProfileId,
} from "../packages/rules-engine/src";

export type GameMasterObjectiveStatus = "ACTIVE" | "SECURED" | "FAILED";

export interface GameMasterCoordinate {
  q: number;
  r: number;
}

interface GameMasterVersionedIntent {
  commandId: string;
  expectedCampaignVersion: number;
}

export interface GameMasterObjectiveInput {
  id: string;
  name: string;
  description: string;
  coord: GameMasterCoordinate;
  owner: FactionSide;
  status: GameMasterObjectiveStatus;
}

export interface GameMasterObjectivePatch {
  name?: string;
  description?: string;
  coord?: GameMasterCoordinate;
  owner?: FactionSide;
  status?: GameMasterObjectiveStatus;
}

export interface GameMasterObjectiveCreateIntent extends GameMasterVersionedIntent {
  operation: "OBJECTIVE_CREATE";
  objective: GameMasterObjectiveInput;
}

export interface GameMasterObjectiveUpdateIntent extends GameMasterVersionedIntent {
  operation: "OBJECTIVE_UPDATE";
  patch: GameMasterObjectivePatch;
}

export interface GameMasterReviveIntent extends GameMasterVersionedIntent {
  operation: "DEPLOYMENT_REVIVE";
}

export interface GameMasterEnemySpawnIntent extends GameMasterVersionedIntent {
  operation: "ENEMY_SPAWN";
  definitionId: string;
  callsign: string;
  coord: GameMasterCoordinate;
  facing: Facing;
}

export interface GameMasterControlIntent extends GameMasterVersionedIntent {
  operation: "CAMPAIGN_PAUSE" | "CAMPAIGN_RESUME" | "ROUND_RESOLVE";
  expectedRound?: number;
}

export type GameMasterCommandIntent =
  | GameMasterObjectiveCreateIntent
  | GameMasterObjectiveUpdateIntent
  | GameMasterReviveIntent
  | GameMasterEnemySpawnIntent
  | GameMasterControlIntent;

export interface GameMasterMapSaveIntent {
  operation: "MAP_SAVE";
  commandId: string;
  mapId?: string;
  expectedRevision?: number;
  name: string;
  planetId?: string;
  mechanicsMapping: Readonly<Record<string, AdminMapMechanicalTerrainProfileId>>;
  document: AdminMapDocumentV1;
}

export interface GameMasterMapPublishIntent {
  operation: "MAP_PUBLISH";
  commandId: string;
  expectedRevision: number;
}

export interface GameMasterCampaignCreateIntent {
  operation: "CAMPAIGN_CREATE";
  commandId: string;
  name: string;
  planetId: string;
  mapId: string;
  mapRevision: number;
  mapContentHash: `sha256:${string}`;
  roundDurationMs: number;
  maximumPlayers: number;
}

export class GameMasterValidationError extends Error {
  readonly code = "GAME_MASTER_COMMAND_INVALID" as const;

  constructor(message: string, readonly path: string) {
    super(message);
    this.name = "GameMasterValidationError";
  }
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const owners = new Set<FactionSide>(["ALLIED", "ENEMY", "NEUTRAL"]);
const objectiveStatuses = new Set<GameMasterObjectiveStatus>(["ACTIVE", "SECURED", "FAILED"]);

function fail(path: string, message: string): never {
  throw new GameMasterValidationError(message, path);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    fail(path, `Unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
  }
}

function parseIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !identifierPattern.test(value)) {
    fail(path, "Expected a stable identifier of at most 128 characters.");
  }
  return value;
}

function parseText(value: unknown, path: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") fail(path, "Expected a string.");
  const parsed = value.trim();
  if ((!allowEmpty && parsed.length === 0) || parsed.length > maximum) {
    fail(path, `Expected ${allowEmpty ? "at most" : "1–"}${maximum} characters.`);
  }
  return parsed;
}

function parseCommandId(value: unknown): string {
  if (typeof value !== "string" || !commandIdPattern.test(value)) {
    fail("$.commandId", "commandId must contain 8–128 safe identifier characters.");
  }
  return value;
}

function parseCoordinate(value: unknown, path: string): GameMasterCoordinate {
  const parsed = record(value, path);
  onlyKeys(parsed, ["q", "r"], path);
  if (!Number.isSafeInteger(parsed.q) || Math.abs(Number(parsed.q)) > 10_000) {
    fail(`${path}.q`, "q must be a safe integer from -10000 through 10000.");
  }
  if (!Number.isSafeInteger(parsed.r) || Math.abs(Number(parsed.r)) > 10_000) {
    fail(`${path}.r`, "r must be a safe integer from -10000 through 10000.");
  }
  return { q: Number(parsed.q), r: Number(parsed.r) };
}

function parseOwner(value: unknown, path: string): FactionSide {
  if (typeof value !== "string" || !owners.has(value as FactionSide)) {
    fail(path, "owner must be ALLIED, ENEMY, or NEUTRAL.");
  }
  return value as FactionSide;
}

function parseObjectiveStatus(value: unknown, path: string): GameMasterObjectiveStatus {
  if (typeof value !== "string" || !objectiveStatuses.has(value as GameMasterObjectiveStatus)) {
    fail(path, "status must be ACTIVE, SECURED, or FAILED.");
  }
  return value as GameMasterObjectiveStatus;
}

function parseObjective(value: unknown, path: string): GameMasterObjectiveInput {
  const objective = record(value, path);
  onlyKeys(objective, ["id", "name", "description", "coord", "owner", "status"], path);
  return {
    id: parseIdentifier(objective.id, `${path}.id`),
    name: parseText(objective.name, `${path}.name`, 80),
    description: parseText(objective.description, `${path}.description`, 1_000, true),
    coord: parseCoordinate(objective.coord, `${path}.coord`),
    owner: parseOwner(objective.owner, `${path}.owner`),
    status: parseObjectiveStatus(objective.status, `${path}.status`),
  };
}

function parseBase(value: unknown, allowed: readonly string[]): {
  source: Record<string, unknown>;
  commandId: string;
  expectedCampaignVersion: number;
} {
  const source = record(value, "$");
  onlyKeys(source, allowed, "$");
  if (typeof source.commandId !== "string" || !commandIdPattern.test(source.commandId)) {
    fail("$.commandId", "commandId must contain 8–128 safe identifier characters.");
  }
  if (!Number.isSafeInteger(source.expectedCampaignVersion) || Number(source.expectedCampaignVersion) < 1) {
    fail("$.expectedCampaignVersion", "expectedCampaignVersion must be a positive safe integer.");
  }
  return {
    source,
    commandId: source.commandId,
    expectedCampaignVersion: Number(source.expectedCampaignVersion),
  };
}

export function parseGameMasterObjectiveCreate(value: unknown): GameMasterObjectiveCreateIntent {
  const base = parseBase(value, ["commandId", "expectedCampaignVersion", "objective"]);
  return {
    operation: "OBJECTIVE_CREATE",
    commandId: base.commandId,
    expectedCampaignVersion: base.expectedCampaignVersion,
    objective: parseObjective(base.source.objective, "$.objective"),
  };
}

export function parseGameMasterObjectiveUpdate(value: unknown): GameMasterObjectiveUpdateIntent {
  const base = parseBase(value, ["commandId", "expectedCampaignVersion", "patch"]);
  const source = record(base.source.patch, "$.patch");
  onlyKeys(source, ["name", "description", "coord", "owner", "status"], "$.patch");
  if (Object.keys(source).length === 0) fail("$.patch", "At least one objective field is required.");
  const patch: GameMasterObjectivePatch = {};
  if (source.name !== undefined) patch.name = parseText(source.name, "$.patch.name", 80);
  if (source.description !== undefined) {
    patch.description = parseText(source.description, "$.patch.description", 1_000, true);
  }
  if (source.coord !== undefined) patch.coord = parseCoordinate(source.coord, "$.patch.coord");
  if (source.owner !== undefined) patch.owner = parseOwner(source.owner, "$.patch.owner");
  if (source.status !== undefined) patch.status = parseObjectiveStatus(source.status, "$.patch.status");
  return {
    operation: "OBJECTIVE_UPDATE",
    commandId: base.commandId,
    expectedCampaignVersion: base.expectedCampaignVersion,
    patch,
  };
}

export function parseGameMasterRevive(value: unknown): GameMasterReviveIntent {
  const base = parseBase(value, ["commandId", "expectedCampaignVersion"]);
  return {
    operation: "DEPLOYMENT_REVIVE",
    commandId: base.commandId,
    expectedCampaignVersion: base.expectedCampaignVersion,
  };
}

export function parseGameMasterEnemySpawn(value: unknown): GameMasterEnemySpawnIntent {
  const base = parseBase(value, [
    "commandId",
    "expectedCampaignVersion",
    "definitionId",
    "callsign",
    "coord",
    "facing",
  ]);
  if (!Number.isInteger(base.source.facing) || Number(base.source.facing) < 0 || Number(base.source.facing) > 5) {
    fail("$.facing", "facing must be an integer from 0 through 5.");
  }
  return {
    operation: "ENEMY_SPAWN",
    commandId: base.commandId,
    expectedCampaignVersion: base.expectedCampaignVersion,
    definitionId: parseIdentifier(base.source.definitionId, "$.definitionId"),
    callsign: parseText(base.source.callsign, "$.callsign", 80),
    coord: parseCoordinate(base.source.coord, "$.coord"),
    facing: Number(base.source.facing) as Facing,
  };
}

export function parseGameMasterControl(
  value: unknown,
  operation: GameMasterControlIntent["operation"],
): GameMasterControlIntent {
  const allowed = operation === "ROUND_RESOLVE"
    ? ["commandId", "expectedCampaignVersion", "expectedRound"]
    : ["commandId", "expectedCampaignVersion"];
  const base = parseBase(value, allowed);
  if (operation === "ROUND_RESOLVE" &&
      (!Number.isSafeInteger(base.source.expectedRound) || Number(base.source.expectedRound) < 1)) {
    fail("$.expectedRound", "expectedRound must be a positive safe integer.");
  }
  return {
    operation,
    commandId: base.commandId,
    expectedCampaignVersion: base.expectedCampaignVersion,
    ...(operation === "ROUND_RESOLVE" ? { expectedRound: Number(base.source.expectedRound) } : {}),
  };
}

export function parseGameMasterMapSave(value: unknown): GameMasterMapSaveIntent {
  const source = record(value, "$");
  onlyKeys(source, ["commandId", "mapId", "expectedRevision", "name", "planetId", "mechanicsMapping", "document"], "$");
  let expectedRevision: number | undefined;
  if (source.expectedRevision !== undefined) {
    if (!Number.isSafeInteger(source.expectedRevision) || Number(source.expectedRevision) < 1) {
      fail("$.expectedRevision", "expectedRevision must be a positive safe integer when supplied.");
    }
    expectedRevision = Number(source.expectedRevision);
  }
  let document: AdminMapDocumentV1;
  try {
    document = validateAdminMap(source.document);
  } catch (error) {
    if (error instanceof AdminMapValidationError) fail(`$.document${error.path.slice(1)}`, error.message);
    throw error;
  }
  const canonicalProfiles = new Map(document.cells.map((cell) => [
    cell.visualBiomeId,
    cell.mechanicalTerrainProfileId,
  ]));
  const rawMapping = source.mechanicsMapping === undefined ? {} : record(source.mechanicsMapping, "$.mechanicsMapping");
  const mechanicsMapping: Record<string, AdminMapMechanicalTerrainProfileId> = {};
  for (const [biomeId, profile] of Object.entries(rawMapping)) {
    if (!canonicalProfiles.has(biomeId as AdminMapDocumentV1["cells"][number]["visualBiomeId"])) {
      fail(`$.mechanicsMapping.${biomeId}`, "Mapping keys must name a biome used by the submitted document.");
    }
    const canonical = canonicalProfiles.get(biomeId as AdminMapDocumentV1["cells"][number]["visualBiomeId"]);
    if (typeof profile !== "string" || canonical === null || profile !== canonical) {
      fail(`$.mechanicsMapping.${biomeId}`, "Published @2 mechanics are locked; a review mapping must match the document's canonical terrain profile.");
    }
    mechanicsMapping[biomeId] = profile as AdminMapMechanicalTerrainProfileId;
  }
  return {
    operation: "MAP_SAVE",
    commandId: parseCommandId(source.commandId),
    ...(source.mapId === undefined ? {} : { mapId: parseIdentifier(source.mapId, "$.mapId") }),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
    name: parseText(source.name, "$.name", 100),
    ...(source.planetId === undefined ? {} : { planetId: parseIdentifier(source.planetId, "$.planetId") }),
    mechanicsMapping,
    document,
  };
}

export function parseGameMasterMapPublish(value: unknown): GameMasterMapPublishIntent {
  const source = record(value, "$");
  onlyKeys(source, ["commandId", "expectedRevision"], "$");
  if (!Number.isSafeInteger(source.expectedRevision) || Number(source.expectedRevision) < 1) {
    fail("$.expectedRevision", "expectedRevision must be a positive safe integer.");
  }
  return {
    operation: "MAP_PUBLISH",
    commandId: parseCommandId(source.commandId),
    expectedRevision: Number(source.expectedRevision),
  };
}

export function parseGameMasterCampaignCreate(value: unknown): GameMasterCampaignCreateIntent {
  const source = record(value, "$");
  onlyKeys(source, [
    "commandId",
    "name",
    "planetId",
    "mapId",
    "mapRevision",
    "mapContentHash",
    "roundDurationMs",
    "maximumPlayers",
  ], "$");
  if (!Number.isSafeInteger(source.roundDurationMs) ||
      (Number(source.roundDurationMs) !== 0 && Number(source.roundDurationMs) < 5_000) ||
      Number(source.roundDurationMs) > 86_400_000) {
    fail("$.roundDurationMs", "roundDurationMs must be manual (0) or an integer from 5000 through 86400000.");
  }
  if (!Number.isSafeInteger(source.mapRevision) || Number(source.mapRevision) < 1) {
    fail("$.mapRevision", "mapRevision must be a positive safe integer.");
  }
  if (typeof source.mapContentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(source.mapContentHash)) {
    fail("$.mapContentHash", "mapContentHash must be a lowercase SHA-256 content hash.");
  }
  const maximumPlayers = source.maximumPlayers === undefined ? 8 : Number(source.maximumPlayers);
  if (!Number.isSafeInteger(maximumPlayers) || maximumPlayers < 1 || maximumPlayers > 64) {
    fail("$.maximumPlayers", "maximumPlayers must be an integer from 1 through 64.");
  }
  return {
    operation: "CAMPAIGN_CREATE",
    commandId: parseCommandId(source.commandId),
    name: parseText(source.name, "$.name", 100),
    planetId: parseIdentifier(source.planetId, "$.planetId"),
    mapId: parseIdentifier(source.mapId, "$.mapId"),
    mapRevision: Number(source.mapRevision),
    mapContentHash: source.mapContentHash as `sha256:${string}`,
    roundDurationMs: Number(source.roundDurationMs),
    maximumPlayers,
  };
}

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ADMIN_MAP_EDGE_FEATURE_VOCABULARY,
  ADMIN_MAP_MAX_IMPORT_CHARACTERS,
  ADMIN_MAP_POINT_FEATURE_VOCABULARY,
  ADMIN_MAP_PRESETS,
  CUSTOM_MAP_PATH_MULTIPLIER,
  CUSTOM_MAP_POINT_FEATURE_MECHANICS,
  CUSTOM_MAP_RIVER_CROSSING_SURCHARGE,
  CUSTOM_MAP_ROAD_MULTIPLIER,
  exportAdminMap,
  generateAdminMap,
  getAdminMapEdgeFeatureDefinition,
  getAdminMapPointFeatureDefinition,
  getAdminMapTerrainDefinition,
  importAdminMap,
  type AdminMapDocumentV1,
  type AdminMapEdgeFeatureId,
  type AdminMapHexDirection,
  type AdminMapPointFeatureId,
  type AdminMapPresetId,
} from "../../packages/rules-engine/src";
import {
  ADMIN_MAP_DIRECTION_LABELS,
  removeAdminMapEdgeFeature,
  removeAdminMapPointFeature,
  upsertAdminMapEdgeFeature,
  upsertAdminMapPointFeature,
} from "../game-master-map-editor";

const GAME_MASTER_PERMISSIONS = {
  read: "CAMPAIGN_READ",
  operate: "CAMPAIGN_CLOCK_WRITE",
  control: "CAMPAIGN_CONTROL",
  spawn: "ENEMY_SPAWN",
  objectives: "OBJECTIVE_WRITE",
  revive: "DEPLOYMENT_REVIVE",
  maps: "MAP_WRITE",
  createCampaign: "CAMPAIGN_CREATE",
  audit: "AUDIT_READ",
} as const;

export type GameMasterPermission = (typeof GAME_MASTER_PERMISSIONS)[keyof typeof GAME_MASTER_PERMISSIONS];
export type GameMasterMapPreset = AdminMapPresetId;
export type GameMasterClockAction = "PAUSE_CAMPAIGN" | "RESUME_CAMPAIGN" | "RESOLVE_ROUND";
export type GameMasterCampaignAction =
  | GameMasterClockAction
  | "SET_ROUND_DURATION"
  | "SPAWN_ENEMY"
  | "UPSERT_OBJECTIVE"
  | "REVIVE_DEPLOYMENT";

export interface GameMasterAuthorization {
  authorized: boolean;
  permissions?: string[];
  capabilities?: string[];
}

export interface GameMasterObjective {
  id: string;
  name: string;
  description: string;
  q: number;
  r: number;
  owner: "ALLIED" | "ENEMY" | "NEUTRAL";
  status: "ACTIVE" | "SECURED" | "FAILED";
}

export interface GameMasterDeployment {
  id: string;
  callsign: string;
  definitionId: string;
  side: "ALLIED" | "ENEMY" | "NEUTRAL";
  status: string;
  q: number;
  r: number;
}

export interface GameMasterCampaignSummary {
  campaignId: string;
  name: string;
  planetId: string;
  planetName: string;
  status: string;
  round: number;
  revision: number;
  clockState: "RUNNING" | "PAUSED" | "LOCKED" | "RESOLVING" | string;
  roundDurationMs: number;
  phaseBeforePause?: string;
  objectives: GameMasterObjective[];
  deployments: GameMasterDeployment[];
  mapId?: string;
  mapRevision?: number;
  mapContentHash?: string;
  canJoin?: boolean;
  canEnter?: boolean;
  runtimeStatus?: string;
}

export interface GameMasterPlanet {
  planetId: string;
  name: string;
}

export interface GameMasterUnitDefinition {
  definitionId: string;
  name: string;
  factionId?: string;
}

export interface GameMasterMechanicalProfile {
  terrainId: string;
  name: string;
}

export type GameMasterMapDocument = AdminMapDocumentV1;

export interface GameMasterSavedMap {
  mapId: string;
  name: string;
  planetId?: string;
  preset: GameMasterMapPreset;
  seed: string;
  status: "DRAFT" | "PUBLISHED" | string;
  revision: number;
  contentHash?: string;
  mechanicsMapping?: Record<string, string>;
  document?: GameMasterMapDocument;
}

export interface GameMasterAuditEntry {
  auditId: string;
  timestamp: number;
  actorLabel: string;
  action: string;
  targetLabel: string;
  summary: string;
}

export interface GameMasterRoundDurationPreset {
  id: string;
  label: string;
  durationMs: number;
}

export interface GameMasterDashboard {
  campaigns: GameMasterCampaignSummary[];
  unavailableCampaigns?: Array<{ campaignId: string; name: string; message: string }>;
  planets: GameMasterPlanet[];
  maps: GameMasterSavedMap[];
  unitDefinitions: GameMasterUnitDefinition[];
  audit: GameMasterAuditEntry[];
  mechanicalProfiles?: GameMasterMechanicalProfile[];
  roundDurationPresets?: GameMasterRoundDurationPreset[];
}

export interface GameMasterCampaignCommand {
  commandId: string;
  expectedRevision: number;
  action: GameMasterCampaignAction;
  payload?: Record<string, unknown>;
}

export interface GenerateGameMasterMapInput {
  preset: GameMasterMapPreset;
  seed: string;
  width: number;
  height: number;
}

export interface SaveGameMasterMapInput {
  commandId: string;
  mapId?: string;
  expectedRevision?: number;
  name: string;
  planetId?: string;
  mechanicsMapping: Record<string, string>;
  document: GameMasterMapDocument;
}

export interface CreateGameMasterCampaignInput {
  commandId: string;
  name: string;
  planetId: string;
  mapId: string;
  mapRevision: number;
  mapContentHash: string;
  roundDurationMs: number;
  maximumPlayers: number;
}

export interface GameMasterOperationResult {
  message?: string;
  revision?: number;
  map?: GameMasterSavedMap;
  campaign?: GameMasterCampaignSummary;
}

export interface GameMasterApi {
  loadSession(signal?: AbortSignal): Promise<GameMasterAuthorization>;
  loadDashboard(signal?: AbortSignal): Promise<GameMasterDashboard>;
  loadMap(mapId: string, signal?: AbortSignal): Promise<GameMasterSavedMap>;
  commandCampaign(campaignId: string, command: GameMasterCampaignCommand): Promise<GameMasterOperationResult>;
  generateMap?(input: GenerateGameMasterMapInput): Promise<GameMasterMapDocument>;
  saveMap(input: SaveGameMasterMapInput): Promise<GameMasterOperationResult>;
  publishMap(mapId: string, commandId: string, expectedRevision: number): Promise<GameMasterOperationResult>;
  createCampaign(input: CreateGameMasterCampaignInput): Promise<GameMasterOperationResult>;
}

interface CampaignDirectoryPayload {
  campaigns: Array<{
    campaignId: string;
    name: string;
    planet: { id: string; name: string };
    registryStatus: string;
    roundDurationMs: number;
  }>;
}

interface CampaignStatePayload {
  campaignId: string;
  campaignName: string;
  round: number;
  phase: string;
  version: number;
  clock: { durationMs: number; phaseBeforePause?: string };
  objectives: Array<{
    id: string; name: string; description: string; coord: { q: number; r: number };
    owner: GameMasterObjective["owner"]; status: GameMasterObjective["status"];
  }>;
  deployments: Array<{
    id: string; callsign: string; definitionId: string; side: GameMasterDeployment["side"];
    status: string; position: { q: number; r: number };
  }>;
}

interface AuditPayload {
  events: Array<{
    id: string; actorUserId: string; operation: string; targetId?: string; targetKind?: "CAMPAIGN" | "MAP";
    campaignId?: string;
    responseStatus: number; occurredAt: number;
  }>;
}

interface MapCataloguePayload {
  maps: GameMasterSavedMap[];
  planets: GameMasterPlanet[];
  unitDefinitions: GameMasterUnitDefinition[];
  mechanicalProfiles?: GameMasterMechanicalProfile[];
}

interface MapDetailPayload {
  map: GameMasterSavedMap & { document: GameMasterMapDocument };
}

interface HttpGameMasterApiOptions {
  demoUser?: string;
}

interface ApiErrorBody {
  error?: { message?: string };
  message?: string;
}

function isLoopbackHost(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function requestHeaders(options: HttpGameMasterApiOptions, json = false): HeadersInit {
  const headers: Record<string, string> = json ? { "content-type": "application/json" } : {};
  // The role header only activates the worker's explicit local-demo auth path. Production
  // still requires a real authenticated Game Master grant and never receives this header.
  if (import.meta.env.DEV && isLoopbackHost() && options.demoUser) {
    headers["x-demo-user"] = options.demoUser;
    headers["x-demo-role"] = "ADMIN";
  }
  return headers;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? body.message ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json() as Promise<T>;
}

function createHttpGameMasterApi(options: HttpGameMasterApiOptions = {}): GameMasterApi {
  const post = <T,>(url: string, body: unknown) => requestJson<T>(url, {
    method: "POST",
    headers: requestHeaders(options, true),
    body: JSON.stringify(body),
  });

  return {
    loadSession: async (signal) => {
      const payload = await requestJson<GameMasterAuthorization>("/api/game-master/session", {
        headers: requestHeaders(options),
        signal,
      });
      return { ...payload, permissions: payload.permissions ?? payload.capabilities ?? [] };
    },
    loadDashboard: async (signal) => {
      const directory = await requestJson<CampaignDirectoryPayload>("/api/game-master/campaigns", {
        headers: requestHeaders(options), signal,
      });
      const [stateResults, audit, authoring] = await Promise.all([
        Promise.allSettled(directory.campaigns.map((entry) => requestJson<CampaignStatePayload>(
          `/api/game-master/campaigns/${encodeURIComponent(entry.campaignId)}/state`,
          { headers: requestHeaders(options), signal },
        ))),
        requestJson<AuditPayload>("/api/game-master/audit?limit=50", {
          headers: requestHeaders(options), signal,
        }).catch(() => ({ events: [] })),
        requestJson<MapCataloguePayload>("/api/game-master/maps?limit=50", {
          headers: requestHeaders(options), signal,
        }),
      ]);
      const states = stateResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const unavailableCampaigns = stateResults.flatMap((result, index) => result.status === "rejected" ? [{
        campaignId: directory.campaigns[index]!.campaignId,
        name: directory.campaigns[index]!.name,
        message: result.reason instanceof Error ? result.reason.message : "Authoritative campaign state is unavailable.",
      }] : []);
      const byId = new Map(states.map((state) => [state.campaignId, state]));
      const campaigns = directory.campaigns.flatMap((entry) => {
        const state = byId.get(entry.campaignId);
        if (!state) return [];
        return [{
          campaignId: entry.campaignId,
          name: entry.name,
          planetId: entry.planet.id,
          planetName: entry.planet.name,
          status: entry.registryStatus,
          round: state.round,
          revision: state.version,
          clockState: state.phase,
          roundDurationMs: state.clock.durationMs,
          phaseBeforePause: state.clock.phaseBeforePause,
          objectives: state.objectives.map((objective) => ({
            id: objective.id, name: objective.name, description: objective.description,
            q: objective.coord.q, r: objective.coord.r, owner: objective.owner, status: objective.status,
          })),
          deployments: state.deployments.map((deployment) => ({
            id: deployment.id, callsign: deployment.callsign, definitionId: deployment.definitionId,
            side: deployment.side, status: deployment.status,
            q: deployment.position.q, r: deployment.position.r,
          })),
        }];
      });
      return {
        campaigns,
        unavailableCampaigns,
        planets: [...new Map([
          ...authoring.planets.map((planet) => [planet.planetId, planet] as const),
          ...directory.campaigns.map((entry) => [entry.planet.id, {
            planetId: entry.planet.id, name: entry.planet.name,
          }] as const),
        ]).values()],
        maps: authoring.maps,
        unitDefinitions: mergeEnemyDefinitions(authoring.unitDefinitions, campaigns),
        mechanicalProfiles: authoring.mechanicalProfiles,
        audit: audit.events.map((entry) => ({
          auditId: entry.id, timestamp: entry.occurredAt, actorLabel: entry.actorUserId,
          action: entry.operation, targetLabel: entry.targetId ?? entry.campaignId ?? "unknown target",
          summary: `Server returned ${entry.responseStatus}.`,
        })),
        roundDurationPresets: [
          { id: "manual", label: "Manual", durationMs: 0 },
          { id: "1m", label: "Fast", durationMs: 60_000 },
          { id: "5m", label: "Short", durationMs: 300_000 },
          { id: "30m", label: "Standard", durationMs: 1_800_000 },
          { id: "24h", label: "Asynchronous", durationMs: 86_400_000 },
        ],
      };
    },
    loadMap: async (mapId, signal) => {
      const payload = await requestJson<MapDetailPayload>(
        `/api/game-master/maps/${encodeURIComponent(mapId)}`,
        { headers: requestHeaders(options), signal },
      );
      return payload.map;
    },
    commandCampaign: async (campaignId, command) => {
      const campaignPath = `/api/game-master/campaigns/${encodeURIComponent(campaignId)}`;
      const base = { commandId: command.commandId, expectedCampaignVersion: command.expectedRevision };
      let url: string;
      let method: "POST" | "PATCH";
      let body: Record<string, unknown>;
      switch (command.action) {
        case "SET_ROUND_DURATION":
          url = `${campaignPath}/clock`; method = "PATCH"; body = { ...base, ...command.payload }; break;
        case "PAUSE_CAMPAIGN":
          url = `${campaignPath}/pause`; method = "POST"; body = base; break;
        case "RESUME_CAMPAIGN":
          url = `${campaignPath}/resume`; method = "POST"; body = base; break;
        case "RESOLVE_ROUND":
          url = `${campaignPath}/resolve`; method = "POST";
          body = { ...base, expectedRound: command.payload?.expectedRound };
          break;
        case "SPAWN_ENEMY": {
          const position = command.payload?.position as { q: number; r: number } | undefined;
          url = `${campaignPath}/enemy-deployments`; method = "POST";
          body = { ...base, definitionId: command.payload?.definitionId, callsign: command.payload?.callsign,
            coord: position, facing: command.payload?.facing };
          break;
        }
        case "UPSERT_OBJECTIVE": {
          const position = command.payload?.position as { q: number; r: number } | undefined;
          const objectiveId = command.payload?.objectiveId;
          const fields = { name: command.payload?.name, description: command.payload?.description,
            coord: position, owner: command.payload?.owner, status: command.payload?.status };
          if (typeof objectiveId === "string" && objectiveId) {
            url = `${campaignPath}/objectives/${encodeURIComponent(objectiveId)}`; method = "PATCH";
            body = { ...base, patch: fields };
          } else {
            url = `${campaignPath}/objectives`; method = "POST";
            body = { ...base, objective: { id: commandId("objective"), ...fields } };
          }
          break;
        }
        case "REVIVE_DEPLOYMENT":
          url = `${campaignPath}/deployments/${encodeURIComponent(String(command.payload?.deploymentId ?? ""))}/revive`;
          method = "POST"; body = base; break;
      }
      return requestJson<GameMasterOperationResult>(url, {
        method, headers: requestHeaders(options, true), body: JSON.stringify(body),
      });
    },
    generateMap: (input) => Promise.resolve(generateAdminMap(input)),
    saveMap: (input) => post("/api/game-master/maps", input),
    publishMap: (mapId, commandId, expectedRevision) => post(
      `/api/game-master/maps/${encodeURIComponent(mapId)}/publish`,
      { commandId, expectedRevision },
    ),
    createCampaign: (input) => post("/api/game-master/campaigns", input),
  };
}

const MAP_PRESETS: Array<{ id: GameMasterMapPreset; label: string; description: string }> = [
  { id: "MIXED", label: "Mixed continent", description: "A broad landmass with varied climate and elevation regions." },
  { id: "DESERT_CONTINENT", label: "Desert continent", description: "Arid interior, badlands, canyons, and sparse coastal terrain." },
  { id: "URBAN_CONTINENT", label: "Urban continent", description: "Dense settlement overlays, transport links, and constrained open ground." },
  { id: "ISLANDS", label: "Island chain", description: "Separated landmasses, coastal approaches, channels, and open water." },
  { id: "ICY", label: "Icy continent", description: "Tundra, glaciers, frozen lakes, peaks, and cold coastal water." },
];

if (MAP_PRESETS.some((preset) => !ADMIN_MAP_PRESETS.includes(preset.id))) {
  throw new Error("Game Master map preset labels do not match the published generator contract.");
}

const TERRAIN_LABELS: Record<string, string> = {
  lowlands: "Lowlands", plains: "Plains", grassland: "Grassland", meadow: "Meadow", valley: "Valley",
  heath: "Heath", savanna: "Savanna", steppe: "Steppe", forest: "Forest", "dense-forest": "Dense forest",
  jungle: "Jungle", glade: "Glade", swamp: "Swamp", marsh: "Marsh", bog: "Bog", hill: "Hill", crag: "Crag",
  mountain: "Mountain", "mountain-peak": "Mountain peak", volcano: "Volcano", desert: "Desert", badlands: "Badlands",
  canyon: "Canyon", crater: "Crater", tundra: "Tundra", glacier: "Glacier", "open-water": "Open water",
  ocean: "Ocean", "deep-ocean": "Deep ocean", sea: "Sea", "fresh-water": "Fresh water", lake: "Lake", pond: "Pond",
  "frozen-lake": "Frozen lake", rapids: "Rapids", coastal: "Coastal", "coast-beach": "Coast / beach",
};

function biomeColor(
  biomeId: string,
  group: AdminMapDocumentV1["cells"][number]["terrainGroup"],
): string {
  const id = biomeId.toUpperCase();
  if (group === "WATER") {
    if (id.includes("DEEP")) return "#234f67";
    if (id.includes("OCEAN")) return "#337087";
    if (id.includes("COAST") || id.includes("SHALLOW")) return "#67a1a2";
    if (id.includes("FROZEN") || id.includes("ICE")) return "#9bc2c5";
    if (id.includes("RAPID")) return "#78b2b4";
    return "#4b8792";
  }
  if (group === "FORESTS") {
    if (id.includes("JUNGLE") || id.includes("RAIN")) return "#245b43";
    if (id.includes("DENSE") || id.includes("TAIGA")) return "#2d5947";
    if (id.includes("GLADE")) return "#78965f";
    return "#3d7151";
  }
  if (group === "WETLANDS") {
    if (id.includes("BOG")) return "#535f59";
    if (id.includes("SWAMP")) return "#426b5e";
    return "#5c7d70";
  }
  if (group === "HIGHLANDS") {
    if (id.includes("PEAK")) return "#b8c0bb";
    if (id.includes("VOLCAN")) return "#684c47";
    if (id.includes("MOUNTAIN") || id.includes("CRAG")) return "#6d706d";
    return "#82765f";
  }
  if (group === "ARID") {
    if (id.includes("BADLAND") || id.includes("CANYON")) return "#9b654b";
    if (id.includes("CRATER") || id.includes("MESA")) return "#7f5f50";
    if (id.includes("SALT")) return "#c3b887";
    return "#b59b63";
  }
  if (group === "COLD") {
    if (id.includes("GLACIER") || id.includes("ICE")) return "#bad4d2";
    if (id.includes("SNOW")) return "#c3ccc6";
    if (id.includes("TAIGA")) return "#6f8c7b";
    return "#98aaa4";
  }
  if (id.includes("FARMLAND")) return "#969c68";
  if (id.includes("SAVANNA")) return "#a5965f";
  if (id.includes("HEATH") || id.includes("STEPPE")) return "#887f66";
  if (id.includes("VALLEY")) return "#668467";
  if (id.includes("MEADOW")) return "#9cad71";
  return "#779263";
}

function commandId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function terrainLabel(id: string): string {
  return getAdminMapTerrainDefinition(id)?.label
    ?? TERRAIN_LABELS[id]
    ?? id.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasPermission(permissions: string[], permission: GameMasterPermission): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}

function mergeEnemyDefinitions(
  supplied: readonly GameMasterUnitDefinition[],
  campaigns: readonly GameMasterCampaignSummary[],
): GameMasterUnitDefinition[] {
  const definitions = new Map(supplied.map((definition) => [definition.definitionId, definition]));
  const callsigns = new Map<string, Set<string>>();
  for (const campaign of campaigns) {
    for (const deployment of campaign.deployments) {
      if (deployment.side !== "ENEMY") continue;
      const labels = callsigns.get(deployment.definitionId) ?? new Set<string>();
      if (deployment.callsign.trim()) labels.add(deployment.callsign.trim());
      callsigns.set(deployment.definitionId, labels);
    }
  }
  for (const [definitionId, labels] of callsigns) {
    if (definitions.has(definitionId)) continue;
    const examples = [...labels].sort((left, right) => left.localeCompare(right)).slice(0, 2);
    definitions.set(definitionId, {
      definitionId,
      name: examples.length > 0 ? `${examples.join(" / ")} · ${definitionId}` : definitionId,
    });
  }
  return [...definitions.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.definitionId.localeCompare(right.definitionId));
}

const MAP_HEX_DIRECTIONS = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
] as const;

function mapHexCenter(q: number, r: number): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (q + r / 2) * 10,
    y: r * 15,
  };
}

function firstLandCoordinate(
  document: GameMasterMapDocument,
  featureId: AdminMapPointFeatureId = "CITY",
): { q: number; r: number } {
  const cell = document.cells.find((candidate) =>
    candidate.terrainGroup !== "WATER" &&
    !document.pointFeatures.some((feature) =>
      feature.featureId === featureId && feature.q === candidate.q && feature.r === candidate.r));
  return cell ? { q: cell.q, r: cell.r } : { q: 0, r: 0 };
}

function firstLandEdge(
  document: GameMasterMapDocument,
  featureId: AdminMapEdgeFeatureId = "ROAD",
): {
  q: number;
  r: number;
  direction: AdminMapHexDirection;
} {
  const cells = new Map(document.cells.map((cell) => [`${cell.q},${cell.r}`, cell]));
  for (const source of document.cells) {
    if (source.terrainGroup === "WATER") continue;
    for (let index = 0; index < MAP_HEX_DIRECTIONS.length; index += 1) {
      const delta = MAP_HEX_DIRECTIONS[index]!;
      const target = cells.get(`${source.q + delta.q},${source.r + delta.r}`);
      if (!target || target.terrainGroup === "WATER") continue;
      if (source.q < target.q || (source.q === target.q && source.r < target.r)) {
        if (document.edgeFeatures.some((feature) =>
          feature.featureId === featureId && feature.q === source.q && feature.r === source.r &&
          feature.direction === index)) continue;
        return { q: source.q, r: source.r, direction: index as AdminMapHexDirection };
      }
    }
  }
  return { q: 0, r: 0, direction: 0 };
}

function edgeMechanicsDescription(featureId: AdminMapEdgeFeatureId): string {
  switch (featureId) {
    case "ROAD":
      return `Ground movement uses ${CUSTOM_MAP_ROAD_MULTIPLIER}× destination terrain cost. Roads take precedence over paths and do not cancel a river crossing.`;
    case "PATH":
      return `Ground movement uses ${CUSTOM_MAP_PATH_MULTIPLIER}× destination terrain cost unless a road shares the edge.`;
    case "RIVER":
      return `Ground movement adds ${CUSTOM_MAP_RIVER_CROSSING_SURCHARGE} movement cost. A valid bridge cancels this surcharge; airborne and river-ignoring movement are unaffected.`;
    case "WALL":
      return "Blocks ground movement and line of sight across this edge. Airborne movement ignores the wall.";
    case "BRIDGE":
      return "Cancels the river crossing surcharge without removing the river. Requires a river plus a road or path on the same edge.";
  }
}

function mapTileBounds(tiles: readonly AdminMapDocumentV1["cells"][number][]) {
  const points = tiles.map((tile) => mapHexCenter(tile.q, tile.r));
  if (points.length === 0) return { minX: -10, minY: -10, width: 20, height: 20 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 11;
  const minY = Math.min(...ys) - 11;
  return {
    minX,
    minY,
    width: Math.max(...xs) - minX + 11,
    height: Math.max(...ys) - minY + 11,
  };
}

function MapPreview({ document }: { document: GameMasterMapDocument }) {
  const bounds = mapTileBounds(document.cells);
  const pointOffsets = new Map<string, number>();
  const pointPositions = new Map(document.pointFeatures.map((feature) => {
    const coordinate = `${feature.q},${feature.r}`;
    const offset = pointOffsets.get(coordinate) ?? 0;
    pointOffsets.set(coordinate, offset + 1);
    return [feature.id, offset] as const;
  }));
  return (
    <svg
      className="gm-map-preview"
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-labelledby="gm-map-preview-title gm-map-preview-description"
    >
      <title id="gm-map-preview-title">Generated {MAP_PRESETS.find((preset) => preset.id === document.preset)?.label ?? document.preset} preview</title>
      <desc id="gm-map-preview-description">A visual overview of {document.cells.length} generated hexes, {document.pointFeatures.length} point features, and {document.edgeFeatures.length} edge features. Detailed feature mechanics follow the preview.</desc>
      <defs>
        <pattern id="gm-texture-LOWLANDS" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M-2 10 Q4 7 14 9" fill="none" stroke="#e9e4b4" strokeOpacity=".16" strokeWidth="1" /></pattern>
        <pattern id="gm-texture-FORESTS" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.4" fill="#071f18" fillOpacity=".22" /><circle cx="9" cy="8" r="2" fill="#b8d083" fillOpacity=".12" /></pattern>
        <pattern id="gm-texture-WETLANDS" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M2 10 4 6 5 10M8 11 10 7 11 11" fill="none" stroke="#c7d5a3" strokeOpacity=".2" strokeWidth="1" /><ellipse cx="4" cy="3" rx="2.8" ry=".7" fill="#163d43" fillOpacity=".22" /></pattern>
        <pattern id="gm-texture-HIGHLANDS" width="16" height="12" patternUnits="userSpaceOnUse"><path d="m0 10 5-5 3 3 3-5 5 7" fill="none" stroke="#e2c893" strokeOpacity=".2" strokeWidth="1" /></pattern>
        <pattern id="gm-texture-ARID" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".8" fill="#472d25" fillOpacity=".18" /><circle cx="9" cy="9" r=".6" fill="#f0d99d" fillOpacity=".22" /></pattern>
        <pattern id="gm-texture-COLD" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M2 7h10M7 2v10M3.5 3.5l7 7m0-7-7 7" stroke="#f4ffff" strokeOpacity=".13" strokeWidth=".8" /></pattern>
        <pattern id="gm-texture-WATER" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M-2 3 Q2 1 6 3t8 0 8 0M-2 8 Q2 6 6 8t8 0 8 0" fill="none" stroke="#c0e6e5" strokeOpacity=".2" strokeWidth="1" /></pattern>
      </defs>
      {document.cells.map((tile) => {
        const { x, y } = mapHexCenter(tile.q, tile.r);
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = (Math.PI / 180) * (60 * index - 30);
          return `${x + 9.4 * Math.cos(angle)},${y + 9.4 * Math.sin(angle)}`;
        }).join(" ");
        return <g key={`${tile.q}:${tile.r}`}>
          <polygon points={points} fill={biomeColor(tile.visualBiomeId, tile.terrainGroup)} />
          <polygon points={points} fill={`url(#gm-texture-${tile.terrainGroup})`} />
        </g>;
      })}
      <g className="gm-map-edge-overlay" aria-hidden="true">
        {[...document.edgeFeatures]
          .sort((left, right) => {
            const order = { RIVER: 0, WALL: 1, PATH: 2, ROAD: 3, BRIDGE: 4 } as const;
            return order[left.featureId] - order[right.featureId];
          })
          .map((feature) => {
            const source = mapHexCenter(feature.q, feature.r);
            const delta = MAP_HEX_DIRECTIONS[feature.direction];
            const target = mapHexCenter(feature.q + delta.q, feature.r + delta.r);
            return <line
              key={feature.id}
              className={`gm-map-edge gm-map-edge-${feature.featureId.toLowerCase()}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />;
          })}
      </g>
      <g className="gm-map-point-overlay" aria-hidden="true">
        {document.pointFeatures.map((feature) => {
          const center = mapHexCenter(feature.q, feature.r);
          const offset = pointPositions.get(feature.id) ?? 0;
          const x = center.x + ((offset % 3) - 1) * 4.2;
          const y = center.y + (Math.floor(offset / 3) - .25) * 4.2;
          return <g
            key={feature.id}
            className={`gm-map-point gm-map-point-${feature.featureId.toLowerCase()}`}
            transform={`translate(${x} ${y})`}
          >
            <circle r="3.8" />
            <text x="0" y="1.2" textAnchor="middle">{feature.featureId === "AIRFIELD" ? "A" : feature.featureId.slice(0, 1)}</text>
          </g>;
        })}
      </g>
    </svg>
  );
}

interface ConfirmationState {
  kind: "REVIVE" | "PUBLISH_MAP" | "RESOLVE_ROUND" | "REMOVE_POINT_FEATURE" | "REMOVE_EDGE_FEATURE";
  title: string;
  detail: string;
}

interface ObjectiveDraft {
  objectiveId: string;
  name: string;
  description: string;
  q: string;
  r: string;
  owner: GameMasterObjective["owner"];
  status: GameMasterObjective["status"];
}

const EMPTY_OBJECTIVE: ObjectiveDraft = {
  objectiveId: "",
  name: "",
  description: "",
  q: "0",
  r: "0",
  owner: "NEUTRAL",
  status: "ACTIVE",
};

export interface GameMasterConsoleProps {
  authorization?: GameMasterAuthorization;
  api?: GameMasterApi;
  demoUser?: string;
}

export function GameMasterConsole({ authorization, api, demoUser }: GameMasterConsoleProps) {
  const selectedApi = useMemo(() => api ?? createHttpGameMasterApi({ demoUser }), [api, demoUser]);
  const [loadedSession, setLoadedSession] = useState<GameMasterAuthorization>();
  const session = authorization ?? loadedSession;
  const [sessionError, setSessionError] = useState("");
  const [dashboard, setDashboard] = useState<GameMasterDashboard>();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [confirmation, setConfirmation] = useState<ConfirmationState>();

  const [spawnDefinitionId, setSpawnDefinitionId] = useState("");
  const [spawnCallsign, setSpawnCallsign] = useState("");
  const [spawnQ, setSpawnQ] = useState("0");
  const [spawnR, setSpawnR] = useState("0");
  const [spawnFacing, setSpawnFacing] = useState("0");
  const [objective, setObjective] = useState<ObjectiveDraft>(EMPTY_OBJECTIVE);
  const [reviveDeploymentId, setReviveDeploymentId] = useState("");
  const [durationPresetId, setDurationPresetId] = useState("");
  const [manualDurationMinutes, setManualDurationMinutes] = useState("");

  const [mapPreset, setMapPreset] = useState<GameMasterMapPreset>("MIXED");
  const [mapSeed, setMapSeed] = useState("");
  const [mapWidth, setMapWidth] = useState("36");
  const [mapHeight, setMapHeight] = useState("24");
  const [mapName, setMapName] = useState("");
  const [mapPlanetId, setMapPlanetId] = useState("");
  const [mapDraft, setMapDraft] = useState<GameMasterMapDocument>();
  const [mapId, setMapId] = useState("");
  const [mapRevision, setMapRevision] = useState<number>();
  const [mapStatus, setMapStatus] = useState("UNSAVED");
  const [savedMapEditorId, setSavedMapEditorId] = useState("");
  const [mapDirty, setMapDirty] = useState(false);
  const [selectedPointFeatureId, setSelectedPointFeatureId] = useState("");
  const [pointFeatureType, setPointFeatureType] = useState<AdminMapPointFeatureId>("CITY");
  const [pointQ, setPointQ] = useState("0");
  const [pointR, setPointR] = useState("0");
  const [selectedEdgeFeatureId, setSelectedEdgeFeatureId] = useState("");
  const [edgeFeatureType, setEdgeFeatureType] = useState<AdminMapEdgeFeatureId>("ROAD");
  const [edgeQ, setEdgeQ] = useState("0");
  const [edgeR, setEdgeR] = useState("0");
  const [edgeDirection, setEdgeDirection] = useState<AdminMapHexDirection>(0);

  const [campaignName, setCampaignName] = useState("");
  const [campaignPlanetId, setCampaignPlanetId] = useState("");
  const [campaignMapId, setCampaignMapId] = useState("");
  const [campaignDurationPresetId, setCampaignDurationPresetId] = useState("");
  const [campaignDurationMinutes, setCampaignDurationMinutes] = useState("");
  const [campaignMaximumPlayers, setCampaignMaximumPlayers] = useState("8");
  const [createdCampaign, setCreatedCampaign] = useState<GameMasterCampaignSummary>();

  useEffect(() => {
    if (authorization) return;
    const controller = new AbortController();
    selectedApi.loadSession(controller.signal)
      .then((next) => { setLoadedSession(next); setSessionError(""); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setSessionError(reason instanceof Error ? reason.message : "Game Master authorization could not be verified.");
      });
    return () => controller.abort();
  }, [authorization, selectedApi]);

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    if (!session?.authorized) return;
    const controller = new AbortController();
    selectedApi.loadDashboard(controller.signal)
      .then((next) => {
        const normalized = {
          ...next,
          unitDefinitions: mergeEnemyDefinitions(next.unitDefinitions, next.campaigns),
        };
        setDashboard(normalized);
        setSelectedCampaignId((current) => next.campaigns.some((campaign) => campaign.campaignId === current)
          ? current
          : next.campaigns[0]?.campaignId ?? "");
        setSpawnDefinitionId((current) => normalized.unitDefinitions.some((definition) => definition.definitionId === current)
          ? current
          : normalized.unitDefinitions[0]?.definitionId ?? "");
        setMapPlanetId((current) => current || next.planets[0]?.planetId || "");
        setCampaignPlanetId((current) => current || next.planets[0]?.planetId || "");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Game Master data could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshVersion, selectedApi, session?.authorized]);

  const campaign = dashboard?.campaigns.find((entry) => entry.campaignId === selectedCampaignId);
  const permissions = session?.permissions ?? session?.capabilities ?? [];
  const destroyedDeployments = campaign?.deployments.filter((deployment) => deployment.status === "DESTROYED") ?? [];
  const durationPresets = dashboard?.roundDurationPresets ?? [];
  const savedMaps = dashboard?.maps ?? [];
  const publishedMaps = savedMaps.filter((map) => map.status === "PUBLISHED");
  const eligibleCampaignMaps = publishedMaps.filter((map) =>
    !map.planetId || map.planetId === campaignPlanetId);
  const structuralCommandsAvailable = campaign?.clockState === "PAUSED" &&
    (campaign.phaseBeforePause === undefined || campaign.phaseBeforePause === "PLANNING");

  const biomeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    mapDraft?.cells.forEach((tile) => counts.set(tile.visualBiomeId, (counts.get(tile.visualBiomeId) ?? 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [mapDraft]);
  const unresolvedBiomes = biomeCounts.filter(([biome]) => {
    const canonical = getAdminMapTerrainDefinition(biome);
    return !canonical?.mechanicalTerrainProfileId || canonical.mechanicsStatus !== "PUBLISHED";
  }).map(([biome]) => biome);
  const unresolvedPointFeatures = [...new Set(mapDraft?.pointFeatures
    .filter((feature) => !feature.mechanicalFeatureId || feature.mechanicsStatus !== "PUBLISHED")
    .map((feature) => feature.featureId) ?? [])].sort();
  const unresolvedEdgeFeatures = [...new Set(mapDraft?.edgeFeatures
    .filter((feature) => !feature.mechanicalFeatureId || feature.mechanicsStatus !== "PUBLISHED")
    .map((feature) => feature.featureId) ?? [])].sort();
  const publicationBlocked = unresolvedBiomes.length > 0 ||
    unresolvedPointFeatures.length > 0 || unresolvedEdgeFeatures.length > 0;
  const pointFeatureDefinition = getAdminMapPointFeatureDefinition(pointFeatureType);
  const pointFeatureMechanics = CUSTOM_MAP_POINT_FEATURE_MECHANICS[pointFeatureType];
  const edgeFeatureDefinition = getAdminMapEdgeFeatureDefinition(edgeFeatureType);
  const mapReadOnly = mapStatus === "PUBLISHED";

  async function runCampaignCommand(
    action: GameMasterCampaignAction,
    payload: Record<string, unknown> | undefined,
    successMessage: string,
  ) {
    if (!campaign) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const result = await selectedApi.commandCampaign(campaign.campaignId, {
        commandId: commandId(`gm-${action.toLowerCase()}`),
        expectedRevision: campaign.revision,
        action,
        payload,
      });
      setNotice(result.message ?? successMessage);
      setConfirmation(undefined);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign command was rejected.");
    } finally {
      setBusy("");
    }
  }

  async function submitSpawn(event: FormEvent) {
    event.preventDefault();
    if (!structuralCommandsAvailable) return;
    await runCampaignCommand("SPAWN_ENEMY", {
      definitionId: spawnDefinitionId,
      callsign: spawnCallsign.trim(),
      position: { q: Number(spawnQ), r: Number(spawnR) },
      facing: Number(spawnFacing),
    }, `${spawnCallsign.trim()} was added to the enemy force.`);
    setSpawnCallsign("");
  }

  async function submitObjective(event: FormEvent) {
    event.preventDefault();
    if (!structuralCommandsAvailable) return;
    await runCampaignCommand("UPSERT_OBJECTIVE", {
      ...(objective.objectiveId ? { objectiveId: objective.objectiveId } : {}),
      name: objective.name.trim(),
      description: objective.description.trim(),
      position: { q: Number(objective.q), r: Number(objective.r) },
      owner: objective.owner,
      status: objective.status,
    }, objective.objectiveId ? "Objective updated." : "Objective created.");
    setObjective(EMPTY_OBJECTIVE);
  }

  async function setRoundDuration(event: FormEvent) {
    event.preventDefault();
    const preset = durationPresets.find((entry) => entry.id === durationPresetId);
    const durationMs = preset?.durationMs ?? Number(manualDurationMinutes) * 60_000;
    await runCampaignCommand("SET_ROUND_DURATION", { durationMs }, `Round duration changed to ${formatDuration(durationMs)}.`);
  }

  function resetFeatureEditors(document: GameMasterMapDocument) {
    const point = firstLandCoordinate(document);
    const edge = firstLandEdge(document);
    setSelectedPointFeatureId("");
    setPointFeatureType("CITY");
    setPointQ(String(point.q));
    setPointR(String(point.r));
    setSelectedEdgeFeatureId("");
    setEdgeFeatureType("ROAD");
    setEdgeQ(String(edge.q));
    setEdgeR(String(edge.r));
    setEdgeDirection(edge.direction);
  }

  function selectPointFeature(featureId: string) {
    setSelectedPointFeatureId(featureId);
    if (!mapDraft) return;
    if (!featureId) {
      const point = firstLandCoordinate(mapDraft, pointFeatureType);
      setPointQ(String(point.q));
      setPointR(String(point.r));
      return;
    }
    const feature = mapDraft.pointFeatures.find((candidate) => candidate.id === featureId);
    if (!feature) return;
    setPointFeatureType(feature.featureId);
    setPointQ(String(feature.q));
    setPointR(String(feature.r));
  }

  function selectEdgeFeature(featureId: string) {
    setSelectedEdgeFeatureId(featureId);
    if (!mapDraft) return;
    if (!featureId) {
      const edge = firstLandEdge(mapDraft, edgeFeatureType);
      setEdgeQ(String(edge.q));
      setEdgeR(String(edge.r));
      setEdgeDirection(edge.direction);
      return;
    }
    const feature = mapDraft.edgeFeatures.find((candidate) => candidate.id === featureId);
    if (!feature) return;
    setEdgeFeatureType(feature.featureId);
    setEdgeQ(String(feature.q));
    setEdgeR(String(feature.r));
    setEdgeDirection(feature.direction);
  }

  function submitPointFeature(event: FormEvent) {
    event.preventDefault();
    if (!mapDraft || mapReadOnly) return;
    setError("");
    setNotice("");
    try {
      const result = upsertAdminMapPointFeature(mapDraft, {
        ...(selectedPointFeatureId ? { id: selectedPointFeatureId } : {}),
        featureId: pointFeatureType,
        q: Number(pointQ),
        r: Number(pointR),
      });
      setMapDraft(result.document);
      setSelectedPointFeatureId(result.feature.id);
      setMapDirty(true);
      setNotice(`${pointFeatureDefinition?.label ?? pointFeatureType} ${selectedPointFeatureId ? "updated" : "placed"} at ${result.feature.q},${result.feature.r}. Save the draft to persist this revision.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The point feature could not be applied.");
    }
  }

  function submitEdgeFeature(event: FormEvent) {
    event.preventDefault();
    if (!mapDraft || mapReadOnly) return;
    setError("");
    setNotice("");
    try {
      const result = upsertAdminMapEdgeFeature(mapDraft, {
        ...(selectedEdgeFeatureId ? { id: selectedEdgeFeatureId } : {}),
        featureId: edgeFeatureType,
        q: Number(edgeQ),
        r: Number(edgeR),
        direction: edgeDirection,
      });
      setMapDraft(result.document);
      setSelectedEdgeFeatureId(result.feature.id);
      setEdgeQ(String(result.feature.q));
      setEdgeR(String(result.feature.r));
      setEdgeDirection(result.feature.direction);
      setMapDirty(true);
      setNotice(`${edgeFeatureDefinition?.label ?? edgeFeatureType} ${selectedEdgeFeatureId ? "updated" : "placed"} on edge ${result.feature.q},${result.feature.r} ${ADMIN_MAP_DIRECTION_LABELS[result.feature.direction]}. Save the draft to persist this revision.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The edge feature could not be applied.");
    }
  }

  function removePointFeature() {
    if (!mapDraft || !selectedPointFeatureId || mapReadOnly) return;
    try {
      const nextDocument = removeAdminMapPointFeature(mapDraft, selectedPointFeatureId);
      const label = pointFeatureDefinition?.label ?? pointFeatureType;
      setMapDraft(nextDocument);
      setMapDirty(true);
      setSelectedPointFeatureId("");
      const point = firstLandCoordinate(nextDocument, pointFeatureType);
      setPointQ(String(point.q));
      setPointR(String(point.r));
      setConfirmation(undefined);
      setError("");
      setNotice(`${label} removed from this working copy. Save the draft to persist removal.`);
    } catch (reason) {
      setConfirmation(undefined);
      setError(reason instanceof Error ? reason.message : "The point feature could not be removed.");
    }
  }

  function removeEdgeFeature() {
    if (!mapDraft || !selectedEdgeFeatureId || mapReadOnly) return;
    try {
      const nextDocument = removeAdminMapEdgeFeature(mapDraft, selectedEdgeFeatureId);
      const label = edgeFeatureDefinition?.label ?? edgeFeatureType;
      setMapDraft(nextDocument);
      setMapDirty(true);
      setSelectedEdgeFeatureId("");
      const edge = firstLandEdge(nextDocument, edgeFeatureType);
      setEdgeQ(String(edge.q));
      setEdgeR(String(edge.r));
      setEdgeDirection(edge.direction);
      setConfirmation(undefined);
      setError("");
      setNotice(`${label} removed from this working copy. Save the draft to persist removal.`);
    } catch (reason) {
      setConfirmation(undefined);
      setError(reason instanceof Error ? reason.message : "The edge feature could not be removed.");
    }
  }

  async function generateMap(event: FormEvent) {
    event.preventDefault();
    setBusy("GENERATE_MAP");
    setError("");
    setNotice("");
    try {
      const input: GenerateGameMasterMapInput = {
        preset: mapPreset,
        seed: mapSeed.trim(),
        width: Number(mapWidth),
        height: Number(mapHeight),
      };
      const document = selectedApi.generateMap
        ? await selectedApi.generateMap(input)
        : generateAdminMap(input);
      setMapDraft(document);
      setMapId("");
      setMapRevision(undefined);
      setMapStatus("UNSAVED");
      setSavedMapEditorId("");
      setMapDirty(true);
      resetFeatureEditors(document);
      setNotice(`Generated ${document.cells.length} deterministic hexes from seed ${document.seed}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The map could not be generated.");
    } finally {
      setBusy("");
    }
  }

  async function saveMap() {
    if (!mapDraft) return;
    setBusy("SAVE_MAP");
    setError("");
    setNotice("");
    try {
      const result = await selectedApi.saveMap({
        commandId: commandId("gm-save-map"),
        mapId: mapId || undefined,
        expectedRevision: mapRevision,
        name: mapName.trim(),
        planetId: mapPlanetId || undefined,
        mechanicsMapping: {},
        document: mapDraft,
      });
      if (result.map) {
        setMapId(result.map.mapId);
        setMapRevision(result.map.revision);
        setMapStatus(result.map.status);
        setSavedMapEditorId(result.map.mapId);
      }
      setMapDirty(false);
      setNotice(result.message ?? "Map draft and its explicit biome mechanics mappings were saved.");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The map draft could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function publishMap() {
    if (!mapId || mapRevision === undefined || publicationBlocked || mapDirty) return;
    setBusy("PUBLISH_MAP");
    setError("");
    try {
      const result = await selectedApi.publishMap(mapId, commandId("gm-publish-map"), mapRevision);
      if (result.map) {
        setMapRevision(result.map.revision);
        setMapStatus(result.map.status);
      }
      setMapDirty(false);
      setNotice(result.message ?? "Map published for campaign use.");
      setConfirmation(undefined);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The map could not be published.");
    } finally {
      setBusy("");
    }
  }

  function exportMap() {
    if (!mapDraft) return;
    const contents = exportAdminMap(mapDraft);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(mapName || mapDraft.preset).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign-map"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Map JSON exported.");
  }

  async function importMap(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > ADMIN_MAP_MAX_IMPORT_CHARACTERS) {
      setError(`Map import is larger than the ${Math.round(ADMIN_MAP_MAX_IMPORT_CHARACTERS / 1024 / 1024)} MB client safety limit.`);
      return;
    }
    try {
      const document = importAdminMap(await file.text());
      setMapDraft(document);
      setMapPreset(document.preset);
      setMapSeed(document.seed);
      setMapWidth(String(document.width));
      setMapHeight(String(document.height));
      setMapId("");
      setMapRevision(undefined);
      setMapStatus("UNSAVED");
      setSavedMapEditorId("");
      setMapDirty(true);
      resetFeatureEditors(document);
      setNotice(`Imported ${document.cells.length} hexes with a verified content hash. The server will validate it again before saving.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Map JSON could not be read.");
    }
  }

  async function openSavedMap() {
    if (!savedMapEditorId) return;
    setBusy("LOAD_MAP");
    setError("");
    setNotice("");
    try {
      const saved = await selectedApi.loadMap(savedMapEditorId);
      if (!saved.document) throw new Error("The server returned map metadata without its authored document.");
      setMapDraft(saved.document);
      setMapPreset(saved.document.preset);
      setMapSeed(saved.document.seed);
      setMapWidth(String(saved.document.width));
      setMapHeight(String(saved.document.height));
      setMapId(saved.mapId);
      setMapRevision(saved.revision);
      setMapStatus(saved.status);
      setMapName(saved.name);
      setMapPlanetId(saved.planetId ?? "");
      setMapDirty(false);
      resetFeatureEditors(saved.document);
      setNotice(`Opened ${saved.name} revision ${saved.revision}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved map could not be opened.");
    } finally {
      setBusy("");
    }
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const selectedMap = eligibleCampaignMaps.find((map) => map.mapId === campaignMapId);
    if (!selectedMap) {
      setError("Choose a published map assigned to this planet, or an unplaced published map.");
      return;
    }
    if (!selectedMap.contentHash) {
      setError("The published map catalogue did not include its pinned content hash. Refresh before creating the campaign.");
      return;
    }
    const preset = durationPresets.find((entry) => entry.id === campaignDurationPresetId);
    const durationMs = preset?.durationMs ?? Number(campaignDurationMinutes) * 60_000;
    setBusy("CREATE_CAMPAIGN");
    setCreatedCampaign(undefined);
    setError("");
    try {
      const result = await selectedApi.createCampaign({
        commandId: commandId("gm-create-campaign"),
        name: campaignName.trim(),
        planetId: campaignPlanetId,
        mapId: campaignMapId,
        mapRevision: selectedMap.revision,
        mapContentHash: selectedMap.contentHash,
        roundDurationMs: durationMs,
        maximumPlayers: Number(campaignMaximumPlayers),
      });
      setCreatedCampaign(result.campaign);
      setNotice(result.message ?? (result.campaign?.canEnter
        ? "Campaign created, placed, and available for player entry."
        : result.campaign?.canJoin
          ? "Recruiting campaign created and ready for a player to join and deploy a Battalion force."
          : "Campaign record created, but the server has not made its runtime available."));
      setCampaignName("");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function confirmPendingAction() {
    if (!confirmation) return;
    if (confirmation.kind === "REMOVE_POINT_FEATURE") {
      removePointFeature();
      return;
    }
    if (confirmation.kind === "REMOVE_EDGE_FEATURE") {
      removeEdgeFeature();
      return;
    }
    if (confirmation.kind === "PUBLISH_MAP") {
      await publishMap();
      return;
    }
    if (confirmation.kind === "REVIVE") {
      const deployment = destroyedDeployments.find((entry) => entry.id === reviveDeploymentId);
      await runCampaignCommand("REVIVE_DEPLOYMENT", { deploymentId: reviveDeploymentId }, `${deployment?.callsign ?? "Unit"} was revived.`);
      return;
    }
    if (confirmation.kind === "RESOLVE_ROUND") {
      await runCampaignCommand(
        "RESOLVE_ROUND",
        { expectedRound: campaign?.round },
        `Round ${campaign?.round ?? ""} resolved.`,
      );
    }
  }

  if (!session && !sessionError) {
    return (
      <main className="gm-console gm-access-state" aria-busy="true">
        <span className="eyebrow">GAME MASTER AUTHORITY</span>
          <h1>Verifying command grant</h1>
        <p>Campaign controls remain hidden until the authenticated session is authorized by the server.</p>
      </main>
    );
  }

  if (sessionError || !session?.authorized) {
    return (
      <main className="gm-console gm-access-state">
        <span className="eyebrow">RESTRICTED OPERATIONS</span>
        <h1>Game Master access required</h1>
        <p>{sessionError || "This account does not have a Game Master grant. No campaign or map data was requested."}</p>
        {sessionError && <button type="button" onClick={() => { setSessionError(""); setLoadedSession(undefined); }}>RETRY AUTHORIZATION</button>}
      </main>
    );
  }

  return (
    <main className="gm-console">
      <header className="gm-hero">
        <div>
          <span className="eyebrow">SERVER-AUTHORITATIVE CAMPAIGN CONTROL</span>
          <h1>Game Master</h1>
          <p>Manage live operations, world maps, and exceptional recovery actions. Every accepted change is revision-checked and audited.</p>
        </div>
        <button type="button" onClick={refresh} disabled={busy !== ""}>REFRESH LIVE STATE</button>
      </header>

      <div className="gm-live-region" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} aria-atomic="true">
        {error || notice}
      </div>

      {!dashboard && !error ? (
        <section className="gm-loading" aria-busy="true">Loading live campaigns and management catalogues…</section>
      ) : dashboard ? (
        <div className="gm-layout">
          <aside className="gm-campaign-directory" aria-label="Live campaign directory">
            <header>
              <span className="eyebrow">LIVE CAMPAIGNS</span>
              <strong>{dashboard.campaigns.length}</strong>
            </header>
            {dashboard.campaigns.length ? dashboard.campaigns.map((entry) => (
              <button
                type="button"
                key={entry.campaignId}
                className={entry.campaignId === selectedCampaignId ? "active" : ""}
                aria-pressed={entry.campaignId === selectedCampaignId}
                onClick={() => { setSelectedCampaignId(entry.campaignId); setConfirmation(undefined); }}
              >
                <span><b>{entry.name}</b><small>{entry.planetName}</small></span>
                <span><b>R{entry.round}</b><small>{entry.status}</small></span>
              </button>
            )) : <p>No live campaigns were returned by the authoritative directory.</p>}
            {!!dashboard.unavailableCampaigns?.length && (
              <div className="gm-blocker" role="status">
                <strong>{dashboard.unavailableCampaigns.length} campaign state request{dashboard.unavailableCampaigns.length === 1 ? "" : "s"} unavailable</strong>
                <p>{dashboard.unavailableCampaigns.map((entry) => entry.name).join(", ")}. Other campaigns remain operable.</p>
              </div>
            )}
          </aside>

          <div className="gm-workspace">
            {campaign && hasPermission(permissions, GAME_MASTER_PERMISSIONS.read) ? (
              <>
                <section className="gm-campaign-status" aria-label="Selected campaign status">
                  <div><small>CAMPAIGN</small><strong>{campaign.name}</strong><span>{campaign.planetName}</span></div>
                  <div><small>STATUS</small><strong>{campaign.status}</strong><span>{campaign.clockState}</span></div>
                  <div><small>ROUND</small><strong>{campaign.round}</strong><span>{formatDuration(campaign.roundDurationMs)}</span></div>
                  <div><small>REVISION</small><strong>{campaign.revision}</strong><span>optimistic lock</span></div>
                </section>

                <div className="gm-operation-grid">
                  <section className="gm-panel gm-clock-panel">
                    <header><span><small>01</small><strong>Round control</strong></span><p>Commands apply to revision {campaign.revision}.</p></header>
                    {hasPermission(permissions, GAME_MASTER_PERMISSIONS.operate) ? (
                      <>
                        <p className="gm-boundary-note">Duration changes and campaign controls are revision-checked. Pausing from planning opens structural objective and spawn authoring.</p>
                        {hasPermission(permissions, GAME_MASTER_PERMISSIONS.control) ? (
                          <div className="gm-action-row" aria-label="Audited campaign controls">
                            {campaign.clockState === "PAUSED" ? (
                              <button type="button" disabled={busy !== ""} onClick={() => void runCampaignCommand("RESUME_CAMPAIGN", undefined, "Campaign resumed.")}>RESUME CAMPAIGN</button>
                            ) : (
                              <button type="button" disabled={busy !== "" || ["COMPLETE", "FAILED", "EFFECTS_PENDING", "RESOLVING"].includes(campaign.clockState)} onClick={() => void runCampaignCommand("PAUSE_CAMPAIGN", undefined, "Campaign paused.")}>PAUSE CAMPAIGN</button>
                            )}
                            <button
                              type="button"
                              className="danger"
                              disabled={busy !== "" || !["PLANNING", "LOCKED"].includes(campaign.clockState)}
                              onClick={() => setConfirmation({
                                kind: "RESOLVE_ROUND",
                                title: `Resolve round ${campaign.round}`,
                                detail: "This runs deterministic round resolution immediately against the current authoritative revision. It cannot be undone from this console.",
                              })}
                            >RESOLVE ROUND</button>
                          </div>
                        ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.control} />}
                        <form className="gm-inline-form" onSubmit={(event) => void setRoundDuration(event)}>
                          <fieldset>
                            <legend>Change round duration</legend>
                            {durationPresets.length > 0 && (
                              <label>Server preset
                                <select value={durationPresetId} onChange={(event) => setDurationPresetId(event.target.value)}>
                                  <option value="">Manual duration</option>
                            {durationPresets.filter((preset) => preset.durationMs > 0).map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {formatDuration(preset.durationMs)}</option>)}
                                </select>
                              </label>
                            )}
                            {!durationPresetId && <label>Duration in minutes<input required type="number" min="1" max="10080" step="1" value={manualDurationMinutes} onChange={(event) => setManualDurationMinutes(event.target.value)} /></label>}
                            <button type="submit" disabled={busy !== "" || (!durationPresetId && !manualDurationMinutes)}>APPLY DURATION</button>
                          </fieldset>
                        </form>
                      </>
                    ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.operate} />}
                  </section>

                  <section className="gm-panel">
                    <header><span><small>02</small><strong>Spawn enemy</strong></span><p>Add an authored unit definition at an explicit hex.</p></header>
                    {hasPermission(permissions, GAME_MASTER_PERMISSIONS.spawn) ? (
                      <>
                        {!structuralCommandsAvailable && <p className="gm-structural-lock" role="note">Pause this campaign during planning before spawning enemies.</p>}
                        <form className="gm-form-grid" onSubmit={(event) => void submitSpawn(event)}>
                          <label className="wide">Unit definition<select required disabled={!structuralCommandsAvailable} value={spawnDefinitionId} onChange={(event) => setSpawnDefinitionId(event.target.value)}><option value="">Select pinned enemy definition</option>{dashboard.unitDefinitions.map((definition) => <option value={definition.definitionId} key={definition.definitionId}>{definition.name}{definition.factionId ? ` · ${definition.factionId}` : ""}</option>)}</select></label>
                          <label className="wide">Callsign<input required disabled={!structuralCommandsAvailable} minLength={1} maxLength={48} value={spawnCallsign} onChange={(event) => setSpawnCallsign(event.target.value)} /></label>
                          <label>Hex Q<input required disabled={!structuralCommandsAvailable} type="number" step="1" value={spawnQ} onChange={(event) => setSpawnQ(event.target.value)} /></label>
                          <label>Hex R<input required disabled={!structuralCommandsAvailable} type="number" step="1" value={spawnR} onChange={(event) => setSpawnR(event.target.value)} /></label>
                          <label className="wide">Facing<select disabled={!structuralCommandsAvailable} value={spawnFacing} onChange={(event) => setSpawnFacing(event.target.value)}>{[0, 1, 2, 3, 4, 5].map((facing) => <option value={facing} key={facing}>{facing}</option>)}</select></label>
                          <button className="wide" type="submit" disabled={busy !== "" || !spawnDefinitionId || !structuralCommandsAvailable}>SPAWN ENEMY</button>
                        </form>
                      </>
                    ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.spawn} />}
                  </section>

                  <section className="gm-panel gm-objective-panel">
                    <header><span><small>03</small><strong>Objectives</strong></span><button type="button" disabled={!structuralCommandsAvailable} onClick={() => setObjective(EMPTY_OBJECTIVE)}>NEW OBJECTIVE</button></header>
                    {hasPermission(permissions, GAME_MASTER_PERMISSIONS.objectives) ? (
                      <><div className="gm-objective-layout">
                        <div className="gm-objective-list">
                          {campaign.objectives.map((entry) => <button type="button" key={entry.id} className={objective.objectiveId === entry.id ? "active" : ""} onClick={() => setObjective({ objectiveId: entry.id, name: entry.name, description: entry.description, q: String(entry.q), r: String(entry.r), owner: entry.owner, status: entry.status })}><span><b>{entry.name}</b><small>{entry.id}</small></span><span>{entry.owner}<small>{entry.status}</small></span></button>)}
                          {!campaign.objectives.length && <p>No objectives are currently authored.</p>}
                        </div>
                        <form className="gm-form-grid" onSubmit={(event) => void submitObjective(event)}>
                          <label className="wide">Name<input required disabled={!structuralCommandsAvailable} maxLength={80} value={objective.name} onChange={(event) => setObjective((current) => ({ ...current, name: event.target.value }))} /></label>
                          <label className="wide">Description<textarea required disabled={!structuralCommandsAvailable} maxLength={500} value={objective.description} onChange={(event) => setObjective((current) => ({ ...current, description: event.target.value }))} /></label>
                          <label>Hex Q<input required disabled={!structuralCommandsAvailable} type="number" step="1" value={objective.q} onChange={(event) => setObjective((current) => ({ ...current, q: event.target.value }))} /></label>
                          <label>Hex R<input required disabled={!structuralCommandsAvailable} type="number" step="1" value={objective.r} onChange={(event) => setObjective((current) => ({ ...current, r: event.target.value }))} /></label>
                          <label>Owner<select disabled={!structuralCommandsAvailable} value={objective.owner} onChange={(event) => setObjective((current) => ({ ...current, owner: event.target.value as GameMasterObjective["owner"] }))}><option>NEUTRAL</option><option>ALLIED</option><option>ENEMY</option></select></label>
                          <label>Status<select disabled={!structuralCommandsAvailable} value={objective.status} onChange={(event) => setObjective((current) => ({ ...current, status: event.target.value as GameMasterObjective["status"] }))}><option>ACTIVE</option><option>SECURED</option><option>FAILED</option></select></label>
                          <button className="wide" type="submit" disabled={busy !== "" || !structuralCommandsAvailable}>{objective.objectiveId ? "UPDATE OBJECTIVE" : "CREATE OBJECTIVE"}</button>
                        </form>
                      </div>{!structuralCommandsAvailable && <p className="gm-structural-lock" role="note">Pause this campaign during planning before creating or changing objectives. Existing objectives remain readable.</p>}</>
                    ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.objectives} />}
                  </section>

                  <section className="gm-panel gm-revive-panel">
                    <header><span><small>04</small><strong>Exceptional recovery</strong></span><p>Revive a destroyed deployment through the audited server path.</p></header>
                    {hasPermission(permissions, GAME_MASTER_PERMISSIONS.revive) ? (
                      <fieldset>
                        <legend>Destroyed unit</legend>
                        <label>Deployment<select value={reviveDeploymentId} onChange={(event) => setReviveDeploymentId(event.target.value)}><option value="">Select destroyed unit</option>{destroyedDeployments.map((deployment) => <option value={deployment.id} key={deployment.id}>{deployment.callsign} · {deployment.definitionId} · {deployment.q},{deployment.r}</option>)}</select></label>
                        <p>The server decides the legal restored state. This console does not invent health, ammunition, or equipment values.</p>
                        <button className="danger" type="button" disabled={!reviveDeploymentId || busy !== ""} onClick={() => { const deployment = destroyedDeployments.find((entry) => entry.id === reviveDeploymentId); setConfirmation({ kind: "REVIVE", title: `Revive ${deployment?.callsign ?? "destroyed unit"}`, detail: "This exceptional action changes the authoritative battle state and will be recorded in the Game Master audit log." }); }}>REVIEW REVIVE</button>
                      </fieldset>
                    ) : <div className="gm-permission-boundary" role="note"><strong>Recovery rule required</strong><p>The server does not advertise <code>{GAME_MASTER_PERMISSIONS.revive}</code>. V5 defines persistent destruction as permanent and no authoritative restoration profile exists, so revive remains unavailable.</p></div>}
                  </section>
                </div>
              </>
            ) : campaign ? <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.read} /> : (
              <section className="gm-empty">Select a live campaign to manage its round and scenario state.</section>
            )}

            <section className="gm-panel gm-map-studio">
              <header><span><small>05</small><strong>Map studio</strong></span><p>Generate deterministic visual terrain, assign explicit mechanics, and save a versioned draft. Publication remains locked while any rule is unresolved.</p></header>
              {hasPermission(permissions, GAME_MASTER_PERMISSIONS.maps) ? (
                <div className="gm-map-layout">
                  <form className="gm-map-generator" onSubmit={(event) => void generateMap(event)}>
                    <fieldset>
                      <legend>Saved maps</legend>
                      <label>Open map<select value={savedMapEditorId} onChange={(event) => setSavedMapEditorId(event.target.value)}><option value="">Select saved map</option>{savedMaps.map((map) => <option value={map.mapId} key={map.mapId}>{map.name} · R{map.revision} · {map.status}</option>)}</select></label>
                      <button type="button" disabled={!savedMapEditorId || busy !== ""} onClick={() => void openSavedMap()}>OPEN IN EDITOR</button>
                      {!savedMaps.length && <p>No saved maps are available yet.</p>}
                    </fieldset>
                    <fieldset>
                      <legend>Generator</legend>
                      <label>Preset<select value={mapPreset} onChange={(event) => setMapPreset(event.target.value as GameMasterMapPreset)}>{MAP_PRESETS.map((preset) => <option value={preset.id} key={preset.id}>{preset.label}</option>)}</select></label>
                      <p>{MAP_PRESETS.find((preset) => preset.id === mapPreset)?.description}</p>
                      <label>Stable seed<input required maxLength={128} value={mapSeed} onChange={(event) => setMapSeed(event.target.value)} placeholder="e.g. kestrel-ice-01" /></label>
                      <div className="gm-dimension-fields">
                        <label>Map width<input required type="number" min="12" max="96" step="1" value={mapWidth} onChange={(event) => setMapWidth(event.target.value)} /></label>
                        <label>Map height<input required type="number" min="10" max="96" step="1" value={mapHeight} onChange={(event) => setMapHeight(event.target.value)} /></label>
                      </div>
                      <button type="submit" disabled={busy !== "" || !mapSeed.trim()}>GENERATE PREVIEW</button>
                    </fieldset>
                    <fieldset>
                      <legend>Import or export</legend>
                      <label className="gm-file-label">Import versioned JSON<input type="file" accept="application/json,.json" onChange={(event) => void importMap(event.target.files?.[0])} /></label>
                      <button type="button" disabled={!mapDraft} onClick={exportMap}>EXPORT JSON</button>
                    </fieldset>
                  </form>

                  <div className="gm-map-result">
                    {mapDraft ? (
                      <>
                        <MapPreview document={mapDraft} />
                        <dl className="gm-map-stats">
                          <div><dt>HEXES</dt><dd>{mapDraft.cells.length}</dd></div>
                          <div><dt>BIOMES</dt><dd>{biomeCounts.length}</dd></div>
                          <div><dt>POINTS</dt><dd>{mapDraft.pointFeatures.length}</dd></div>
                          <div><dt>EDGES</dt><dd>{mapDraft.edgeFeatures.length}</dd></div>
                          <div><dt>UNMAPPED</dt><dd>{unresolvedBiomes.length}</dd></div>
                          <div><dt>SCHEMA</dt><dd>V{mapDraft.schemaVersion}</dd></div>
                        </dl>
                        <details className="gm-biome-counts"><summary>Preview terrain counts</summary><ul>{biomeCounts.map(([biome, count]) => { const group = getAdminMapTerrainDefinition(biome)?.group ?? "LOWLANDS"; return <li key={biome}><span><i style={{ background: biomeColor(biome, group) }} />{terrainLabel(biome)}</span><b>{count}</b></li>; })}</ul></details>
                      </>
                    ) : <div className="gm-map-empty"><strong>No map preview</strong><p>Choose a preset and stable seed, or import a versioned map document.</p></div>}
                  </div>

                  {mapDraft && (
                    <section className="gm-feature-authoring" aria-labelledby="gm-feature-authoring-title">
                      <header>
                        <div>
                          <strong id="gm-feature-authoring-title">Map features and connections</strong>
                          <p>Place point assets on land hexes and authored connections on canonical hex edges. Every change is validated and re-hashed locally before it can be saved.</p>
                        </div>
                        <span className={mapDirty ? "dirty" : "saved"}>{mapDirty ? "UNSAVED CHANGES" : mapStatus}</span>
                      </header>
                      <div className="gm-feature-grid">
                        <form onSubmit={submitPointFeature}>
                          <fieldset>
                            <legend>Point features</legend>
                            <label>Review or edit feature
                              <select value={selectedPointFeatureId} onChange={(event) => selectPointFeature(event.target.value)}>
                                <option value="">Place a new point feature</option>
                                {mapDraft.pointFeatures.map((feature) => (
                                  <option value={feature.id} key={feature.id}>
                                    {getAdminMapPointFeatureDefinition(feature.featureId)?.label ?? feature.featureId} · {feature.q},{feature.r}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>Feature type
                              <select
                                disabled={mapReadOnly}
                                value={pointFeatureType}
                                onChange={(event) => {
                                  const featureId = event.target.value as AdminMapPointFeatureId;
                                  setPointFeatureType(featureId);
                                  if (!selectedPointFeatureId) {
                                    const point = firstLandCoordinate(mapDraft, featureId);
                                    setPointQ(String(point.q));
                                    setPointR(String(point.r));
                                  }
                                }}
                              >
                                {ADMIN_MAP_POINT_FEATURE_VOCABULARY.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
                              </select>
                            </label>
                            <div className="gm-coordinate-fields">
                              <label>Hex Q<input disabled={mapReadOnly} required type="number" min="0" max={mapDraft.width - 1} step="1" value={pointQ} onChange={(event) => setPointQ(event.target.value)} /></label>
                              <label>Hex R<input disabled={mapReadOnly} required type="number" min="0" max={mapDraft.height - 1} step="1" value={pointR} onChange={(event) => setPointR(event.target.value)} /></label>
                            </div>
                            <div className="gm-mechanics-review" role="note" aria-label={`${pointFeatureDefinition?.label ?? pointFeatureType} mechanics`}>
                              <strong>{pointFeatureDefinition?.label ?? pointFeatureType} · {pointFeatureDefinition?.mechanicsStatus ?? "UNKNOWN"}</strong>
                              <dl>
                                <div><dt>Profile</dt><dd>{pointFeatureMechanics.mechanicalFeatureId}</dd></div>
                                <div><dt>Structure</dt><dd>{pointFeatureMechanics.structureDefinitionId}</dd></div>
                                <div><dt>Minimum capacity</dt><dd>{pointFeatureMechanics.minimumCapacity}</dd></div>
                                <div><dt>Minimum elevation</dt><dd>{pointFeatureMechanics.minimumElevation}</dd></div>
                                <div><dt>Line of sight</dt><dd>{pointFeatureMechanics.blocksLineOfSight ? `Blocks · modifier ${pointFeatureMechanics.lineOfSightModifier}` : `Open · modifier ${pointFeatureMechanics.lineOfSightModifier}`}</dd></div>
                                <div><dt>Environment</dt><dd>{pointFeatureMechanics.environment.join(", ") || "None"}</dd></div>
                              </dl>
                            </div>
                            <div className="gm-action-row">
                              <button type="submit" disabled={mapReadOnly || busy !== ""}>{selectedPointFeatureId ? "UPDATE POINT" : "PLACE POINT"}</button>
                              <button
                                type="button"
                                className="danger"
                                disabled={mapReadOnly || !selectedPointFeatureId || busy !== ""}
                                onClick={() => setConfirmation({
                                  kind: "REMOVE_POINT_FEATURE",
                                  title: `Remove ${pointFeatureDefinition?.label ?? pointFeatureType}`,
                                  detail: "This removes the feature from the working map and recomputes its content hash. The authoritative draft is unchanged until you save.",
                                })}
                              >REMOVE POINT</button>
                            </div>
                          </fieldset>
                        </form>

                        <form onSubmit={submitEdgeFeature}>
                          <fieldset>
                            <legend>Edge features</legend>
                            <label>Review or edit connection
                              <select value={selectedEdgeFeatureId} onChange={(event) => selectEdgeFeature(event.target.value)}>
                                <option value="">Place a new edge feature</option>
                                {mapDraft.edgeFeatures.map((feature) => (
                                  <option value={feature.id} key={feature.id}>
                                    {getAdminMapEdgeFeatureDefinition(feature.featureId)?.label ?? feature.featureId} · {feature.q},{feature.r} {ADMIN_MAP_DIRECTION_LABELS[feature.direction]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>Feature type
                              <select
                                disabled={mapReadOnly}
                                value={edgeFeatureType}
                                onChange={(event) => {
                                  const featureId = event.target.value as AdminMapEdgeFeatureId;
                                  setEdgeFeatureType(featureId);
                                  if (!selectedEdgeFeatureId) {
                                    const edge = firstLandEdge(mapDraft, featureId);
                                    setEdgeQ(String(edge.q));
                                    setEdgeR(String(edge.r));
                                    setEdgeDirection(edge.direction);
                                  }
                                }}
                              >
                                {ADMIN_MAP_EDGE_FEATURE_VOCABULARY.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
                              </select>
                            </label>
                            <div className="gm-coordinate-fields gm-edge-coordinate-fields">
                              <label>From Q<input disabled={mapReadOnly} required type="number" min="0" max={mapDraft.width - 1} step="1" value={edgeQ} onChange={(event) => setEdgeQ(event.target.value)} /></label>
                              <label>From R<input disabled={mapReadOnly} required type="number" min="0" max={mapDraft.height - 1} step="1" value={edgeR} onChange={(event) => setEdgeR(event.target.value)} /></label>
                              <label>Direction
                                <select disabled={mapReadOnly} value={edgeDirection} onChange={(event) => setEdgeDirection(Number(event.target.value) as AdminMapHexDirection)}>
                                  {ADMIN_MAP_DIRECTION_LABELS.map((label, direction) => <option value={direction} key={label}>{label} · {direction}</option>)}
                                </select>
                              </label>
                            </div>
                            <div className="gm-mechanics-review" role="note" aria-label={`${edgeFeatureDefinition?.label ?? edgeFeatureType} mechanics`}>
                              <strong>{edgeFeatureDefinition?.label ?? edgeFeatureType} · {edgeFeatureDefinition?.mechanicsStatus ?? "UNKNOWN"}</strong>
                              <dl>
                                <div><dt>Profile</dt><dd>{edgeFeatureDefinition?.mechanicalFeatureId ?? "No published profile"}</dd></div>
                                <div><dt>Application</dt><dd>{edgeMechanicsDescription(edgeFeatureType)}</dd></div>
                              </dl>
                            </div>
                            {edgeFeatureType === "BRIDGE" && <p className="gm-feature-rule">Author the river and road or path on this exact edge before placing its bridge.</p>}
                            <div className="gm-action-row">
                              <button type="submit" disabled={mapReadOnly || busy !== ""}>{selectedEdgeFeatureId ? "UPDATE EDGE" : "PLACE EDGE"}</button>
                              <button
                                type="button"
                                className="danger"
                                disabled={mapReadOnly || !selectedEdgeFeatureId || busy !== ""}
                                onClick={() => setConfirmation({
                                  kind: "REMOVE_EDGE_FEATURE",
                                  title: `Remove ${edgeFeatureDefinition?.label ?? edgeFeatureType}`,
                                  detail: "This removes the connection from the working map. Removal is rejected if it would leave a bridge without its required river and road or path.",
                                })}
                              >REMOVE EDGE</button>
                            </div>
                          </fieldset>
                        </form>
                      </div>
                      {mapReadOnly && <p className="gm-boundary-note" role="status">This published revision is immutable. Feature selection remains available for mechanics review.</p>}
                    </section>
                  )}

                  {mapDraft && (
                    <div className="gm-map-publish">
                      <fieldset>
                        <legend>Biome mechanics mapping</legend>
                        <p>No movement or combat rule is inferred from art. Every biome is locked to the published profile carried by the versioned map vocabulary; changing the artwork cannot change its mechanics.</p>
                        <div className="gm-biome-mappings">
                          {biomeCounts.map(([biome, count]) => { const canonicalProfile = getAdminMapTerrainDefinition(biome)?.mechanicalTerrainProfileId; return (
                            <div key={biome} className="gm-biome-mapping"><span><i style={{ background: biomeColor(biome, getAdminMapTerrainDefinition(biome)?.group ?? "LOWLANDS") }} /><b>{terrainLabel(biome)}</b><small>{count} hexes</small></span><output aria-label={`${terrainLabel(biome)} mechanical profile`}>{canonicalProfile ? `Locked · ${canonicalProfile}` : "No published profile — publishing blocked"}</output></div>
                          ); })}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>Draft identity</legend>
                        <label>Map name<input disabled={mapReadOnly} required maxLength={100} value={mapName} onChange={(event) => { setMapName(event.target.value); setMapDirty(true); }} /></label>
                        <label>Planet placement (optional for draft)<select disabled={mapReadOnly} value={mapPlanetId} onChange={(event) => { setMapPlanetId(event.target.value); setMapDirty(true); }}><option value="">Unplaced draft</option>{dashboard.planets.map((planet) => <option value={planet.planetId} key={planet.planetId}>{planet.name}</option>)}</select></label>
                        <div className="gm-action-row"><button type="button" disabled={!mapName.trim() || mapReadOnly || busy !== "" || (Boolean(mapId) && !mapDirty)} onClick={() => void saveMap()}>{mapId ? "SAVE NEW REVISION" : "SAVE DRAFT"}</button><button type="button" className="danger" disabled={!mapId || mapReadOnly || publicationBlocked || mapDirty || busy !== ""} onClick={() => setConfirmation({ kind: "PUBLISH_MAP", title: `Publish ${mapName || "map"}`, detail: "The server will revalidate the schema, content hash, biome mappings, and every point and edge feature before making this immutable revision available for campaign placement." })}>REVIEW PUBLISH</button></div>
                        {mapStatus === "PUBLISHED" && <p className="gm-boundary-note" role="status">Published revisions are immutable. Export this map or generate/import a new draft to continue authoring.</p>}
                        {mapDirty && mapId && <p className="gm-blocker" role="status">Save this working copy as a new draft revision before publishing. Publication always targets the exact server-stored revision.</p>}
                        {unresolvedBiomes.length > 0 && <p className="gm-blocker" role="status">Publishing blocked: {unresolvedBiomes.length} used biome{unresolvedBiomes.length === 1 ? " has" : "s have"} no explicit mechanical profile.</p>}
                        {unresolvedPointFeatures.length > 0 && <p className="gm-blocker" role="status">Publishing locked: {unresolvedPointFeatures.join(", ")} does not carry a published profile from the current point-feature vocabulary.</p>}
                        {unresolvedEdgeFeatures.length > 0 && <p className="gm-blocker" role="status">Publishing locked: {unresolvedEdgeFeatures.join(", ")} does not carry a published profile from the current edge-feature vocabulary.</p>}
                      </fieldset>
                    </div>
                  )}
                </div>
              ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.maps} />}
            </section>

            <section className="gm-panel gm-create-campaign">
              <header><span><small>06</small><strong>Create and place campaign</strong></span><p>Pin a published, planet-compatible map revision and ask the server to create its campaign runtime.</p></header>
              {hasPermission(permissions, GAME_MASTER_PERMISSIONS.createCampaign) ? (
                <>
                  <form className="gm-form-grid" onSubmit={(event) => void createCampaign(event)}>
                    <label className="wide">Campaign name<input required maxLength={100} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
                    <label>Planet<select required value={campaignPlanetId} onChange={(event) => { const planetId = event.target.value; setCampaignPlanetId(planetId); const selectedMap = publishedMaps.find((map) => map.mapId === campaignMapId); if (selectedMap?.planetId && selectedMap.planetId !== planetId) setCampaignMapId(""); }}><option value="">Select planet</option>{dashboard.planets.map((planet) => <option value={planet.planetId} key={planet.planetId}>{planet.name}</option>)}</select></label>
                    <label>Published map<select required value={campaignMapId} onChange={(event) => setCampaignMapId(event.target.value)}><option value="">Select published map</option>{eligibleCampaignMaps.map((map) => <option value={map.mapId} key={map.mapId}>{map.name} · R{map.revision} · {map.preset.replaceAll("_", " ")}{map.planetId ? "" : " · UNPLACED"}</option>)}</select></label>
                    {durationPresets.length > 0 && <label>Round duration preset<select value={campaignDurationPresetId} onChange={(event) => setCampaignDurationPresetId(event.target.value)}><option value="">Manual duration</option>{durationPresets.filter((preset) => preset.durationMs > 0).map((preset) => <option value={preset.id} key={preset.id}>{preset.label} · {formatDuration(preset.durationMs)}</option>)}</select></label>}
                    {!campaignDurationPresetId && <label>Round duration in minutes<input required type="number" min="1" max="1440" step="1" value={campaignDurationMinutes} onChange={(event) => setCampaignDurationMinutes(event.target.value)} /></label>}
                    <label>Maximum players<input required type="number" min="1" max="64" step="1" value={campaignMaximumPlayers} onChange={(event) => setCampaignMaximumPlayers(event.target.value)} /></label>
                    <button className="wide" type="submit" disabled={busy !== "" || !campaignName.trim() || !campaignPlanetId || !campaignMapId || !campaignMaximumPlayers || (!campaignDurationPresetId && !campaignDurationMinutes)}>CREATE AND PLACE CAMPAIGN</button>
                    <p className="gm-boundary-note wide">Only the exact revision and content hash of an immutable published map can be pinned. Availability is reported from the authoritative <code>canJoin</code>, <code>canEnter</code>, and runtime status.</p>
                    {!publishedMaps.length && <p className="gm-blocker wide">Publish a fully governed map revision before creating a campaign.</p>}
                    {publishedMaps.length > 0 && campaignPlanetId && !eligibleCampaignMaps.length && <p className="gm-blocker wide">No published map is compatible with this planet. Publish an unplaced map or one assigned here.</p>}
                  </form>
                  {createdCampaign && (
                    <section className={`gm-created-campaign ${createdCampaign.canEnter ? "playable" : createdCampaign.canJoin ? "ready" : "blocked"}`} aria-live="polite" aria-label="Created campaign result">
                      <div><small>CAMPAIGN</small><strong>{createdCampaign.name}</strong><span>{createdCampaign.planetName}</span></div>
                      <div><small>PLACEMENT</small><strong>{createdCampaign.mapId ? `${createdCampaign.mapId}@${createdCampaign.mapRevision ?? "?"}` : "SERVER MANAGED"}</strong><span>{createdCampaign.status}</span></div>
                      <div><small>PLAYER ENTRY</small><strong>{createdCampaign.canEnter ? "ACTIVE" : createdCampaign.canJoin ? "READY TO DEPLOY" : "BLOCKED"}</strong><span>{createdCampaign.runtimeStatus ?? "NOT REPORTED"}</span></div>
                      {!createdCampaign.canEnter && createdCampaign.canJoin && <p role="status">The playable scenario and insertion zone are placed. The campaign is recruiting; a player can now join and deploy a Battalion force to enter tactical play.</p>}
                      {!createdCampaign.canEnter && !createdCampaign.canJoin && <p role="status">The server created the record but did not expose a join or entry path. Review the returned runtime status before advertising this campaign.</p>}
                    </section>
                  )}
                </>
              ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.createCampaign} />}
            </section>

            <section className="gm-panel gm-audit-log">
              <header><span><small>07</small><strong>Recent audit</strong></span><p>Latest server-recorded Game Master mutations.</p></header>
              {hasPermission(permissions, GAME_MASTER_PERMISSIONS.audit) ? (
                dashboard.audit.length ? <ol>{dashboard.audit.map((entry) => <li key={entry.auditId}><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time><span><b>{entry.action.replaceAll("_", " ")}</b><small>{entry.actorLabel} · {entry.targetLabel}</small><p>{entry.summary}</p></span></li>)}</ol> : <p>No audited Game Master mutation has been recorded yet.</p>
              ) : <PermissionBoundary permission={GAME_MASTER_PERMISSIONS.audit} />}
            </section>
          </div>
        </div>
      ) : null}

      {confirmation && (
        <section className="gm-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="gm-confirmation-title" aria-describedby="gm-confirmation-detail">
          <div>
            <span className="eyebrow">CONFIRM AUTHORITATIVE CHANGE</span>
            <h2 id="gm-confirmation-title">{confirmation.title}</h2>
            <p id="gm-confirmation-detail">{confirmation.detail}</p>
            <div className="gm-action-row">
              <button type="button" onClick={() => setConfirmation(undefined)} autoFocus>CANCEL</button>
              <button type="button" className="danger" disabled={busy !== ""} onClick={() => void confirmPendingAction()}>CONFIRM {confirmation.kind.replaceAll("_", " ")}</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function PermissionBoundary({ permission }: { permission: GameMasterPermission }) {
  return (
    <div className="gm-permission-boundary" role="note">
      <strong>Permission required</strong>
      <p>This section requires <code>{permission}</code>. The server remains the final authority.</p>
    </div>
  );
}

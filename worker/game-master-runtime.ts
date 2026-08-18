import {
  GAME_MASTER_SKIRMISH_MAX_ROUNDS,
  PUBLIC_V1_ECONOMY_POLICY_ID,
  RULESET_VERSION,
  type BattlefieldHex,
  type CampaignDeployment,
  type CampaignRuntimeState,
  type Facing,
  type ObjectiveState,
} from "../packages/domain/src";
import {
  ENGINE_VERSION,
  canTraverseBattlefieldHex,
  getEnemyDoctrineProfile,
  getUnitClass,
  materializeAdminMapBattlefield,
  type AdminMapDocumentV1,
} from "../packages/rules-engine/src";
export const GAME_MASTER_SCENARIO_VERSION = 2 as const;

export interface GameMasterAuthoredEnemyDeployment {
  id: string;
  definitionId: string;
  callsign: string;
  coord: { q: number; r: number };
  facing: Facing;
}

export function gameMasterScenarioId(campaignId: string): string {
  return `scenario-${campaignId}`;
}

export function gameMasterScenarioContentKey(campaignId: string): string {
  return `${gameMasterScenarioId(campaignId)}@${GAME_MASTER_SCENARIO_VERSION}`;
}

export function isGameMasterScenarioContentKey(value: string | null | undefined): boolean {
  return typeof value === "string" && /^scenario-gm-campaign-[a-f0-9]{32}@2$/.test(value);
}

export class GameMasterRuntimeValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GameMasterRuntimeValidationError";
  }
}

function coordinateKey(coord: { q: number; r: number }): string {
  return `${coord.q},${coord.r}`;
}

function battlefieldIndex(map: readonly BattlefieldHex[]): Map<string, BattlefieldHex> {
  return new Map(map.map((hex) => [coordinateKey(hex.coord), hex]));
}

/**
 * Validates authored scenario placement against the exact materialized map and
 * executable enemy catalogue. This is called before persistence and again by
 * the Durable Object so corrupted or drifted D1 content fails closed.
 */
export function validateGameMasterRuntimeContent(input: {
  document: AdminMapDocumentV1;
  objectives?: readonly ObjectiveState[];
  enemyDeployments?: readonly GameMasterAuthoredEnemyDeployment[];
}): BattlefieldHex[] {
  const map = materializeAdminMapBattlefield(input.document);
  const index = battlefieldIndex(map);
  const objectiveCoordinates = new Set<string>();
  for (const objective of input.objectives ?? []) {
    const key = coordinateKey(objective.coord);
    if (!index.has(key)) {
      throw new GameMasterRuntimeValidationError(
        "OBJECTIVE_COORDINATE_INVALID",
        `Objective ${objective.id} is outside the pinned battlefield.`,
      );
    }
    if (objectiveCoordinates.has(key)) {
      throw new GameMasterRuntimeValidationError(
        "OBJECTIVE_COORDINATE_CONFLICT",
        `Multiple objectives cannot occupy battlefield hex ${key}.`,
      );
    }
    objectiveCoordinates.add(key);
  }

  const enemyCountByHex = new Map<string, number>();
  for (const deployment of input.enemyDeployments ?? []) {
    const hex = index.get(coordinateKey(deployment.coord));
    if (!hex) {
      throw new GameMasterRuntimeValidationError(
        "ENEMY_COORDINATE_INVALID",
        `Enemy deployment ${deployment.id} is outside the pinned battlefield.`,
      );
    }
    const definition = getUnitClass(deployment.definitionId);
    getEnemyDoctrineProfile(deployment.definitionId);
    if (!canTraverseBattlefieldHex(hex, { unitTags: definition.tags })) {
      throw new GameMasterRuntimeValidationError(
        "ENEMY_TERRAIN_BLOCKED",
        `Enemy deployment ${deployment.id} cannot occupy ${hex.visualTerrainId ?? hex.terrainId}.`,
      );
    }
    const key = coordinateKey(hex.coord);
    const nextCount = (enemyCountByHex.get(key) ?? 0) + 1;
    if (nextCount > hex.capacity) {
      throw new GameMasterRuntimeValidationError(
        "ENEMY_HEX_CAPACITY_EXCEEDED",
        `Initial enemy deployments exceed battlefield capacity at ${key}.`,
      );
    }
    enemyCountByHex.set(key, nextCount);
  }

  return map;
}

/** Canonical initial deployment location used until richer GM zone authoring ships. */
export function selectGameMasterInsertionHex(document: AdminMapDocumentV1): BattlefieldHex {
  const map = materializeAdminMapBattlefield(document);
  const selected = map.find((hex) =>
    !hex.visualTerrainId?.startsWith("WATER_") && canTraverseBattlefieldHex(hex));
  if (!selected) {
    throw new GameMasterRuntimeValidationError(
      "INSERTION_ZONE_UNAVAILABLE",
      "The published map contains no ground-passable non-water insertion hex.",
    );
  }
  return selected;
}

export function materializeGameMasterEnemyDeployment(
  campaignId: string,
  authored: GameMasterAuthoredEnemyDeployment,
): CampaignDeployment {
  const definition = getUnitClass(authored.definitionId);
  getEnemyDoctrineProfile(authored.definitionId);
  return {
    id: `${campaignId}:authored:${authored.id}`,
    campaignId,
    ownerId: "enemy-doctrine:game-master",
    side: "ENEMY",
    definitionId: authored.definitionId,
    callsign: authored.callsign,
    tags: [...definition.tags],
    status: "ACTIVE",
    position: { ...authored.coord },
    facing: authored.facing,
    stats: structuredClone(definition.stats),
    currentHealth: definition.stats.maxHealth,
    weapons: structuredClone(definition.weapons),
    ammunition: Object.fromEntries(definition.weapons
      .filter((weapon) => weapon.ammoCapacity !== undefined)
      .map((weapon) => [weapon.id, weapon.ammoCapacity!])),
    cooldowns: {},
    statuses: [],
    equipmentIds: [],
    allowedActions: ["ATTACK"],
    allowedOrders: definition.allowedOrders.filter((order) =>
      order === "HOLD" || order === "ADVANCE" || order === "RUSH"),
    locationState: "ON_MAP",
  };
}

export function materializeGameMasterCampaignState(input: {
  campaignId: string;
  campaignName: string;
  planetName: string;
  document: AdminMapDocumentV1;
  objectives?: readonly ObjectiveState[];
  enemyDeployments?: readonly GameMasterAuthoredEnemyDeployment[];
  alliedDeployments: readonly CampaignDeployment[];
  now: number;
  durationMs: number;
}): CampaignRuntimeState {
  const map = validateGameMasterRuntimeContent(input);
  const mapByCoordinate = battlefieldIndex(map);
  const objectives: ObjectiveState[] = (input.objectives ?? []).map((objective) => structuredClone(objective));
  for (const objective of objectives) {
    const hex = mapByCoordinate.get(coordinateKey(objective.coord));
    if (!hex) throw new Error(`GAME_MASTER_OBJECTIVE_MAP_DRIFT:${objective.id}`);
    hex.objectiveId = objective.id;
    hex.control = objective.owner;
  }
  const manualClock = input.durationMs === 0;
  const lockLeadMs = manualClock ? 0 : Math.min(30_000, Math.floor(input.durationMs / 5));
  const resolvesAt = manualClock ? 0 : input.now + input.durationMs;
  const lockAt = manualClock ? 0 : resolvesAt - lockLeadMs;
  const scenarioId = gameMasterScenarioId(input.campaignId);
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    planetName: input.planetName,
    scenarioId,
    scenarioVersion: GAME_MASTER_SCENARIO_VERSION,
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round: 1,
    phase: "PLANNING",
    clock: {
      durationMs: input.durationMs,
      lockLeadMs,
      roundStartedAt: input.now,
      lockAt,
      resolvesAt,
      schedule: manualClock ? [] : [
        { id: `${input.campaignId}:1:lock`, type: "ORDER_LOCK", round: 1, runAt: lockAt },
        { id: `${input.campaignId}:1:resolve`, type: "ROUND_RESOLVE", round: 1, runAt: resolvesAt },
      ],
    },
    map,
    deployments: [
      ...input.alliedDeployments.map((deployment) => structuredClone(deployment)),
      ...(input.enemyDeployments ?? []).map((deployment) =>
        materializeGameMasterEnemyDeployment(input.campaignId, deployment)),
    ],
    orders: [],
    objectives,
    scenarioPolicy: {
      policyId: "game-master-skirmish",
      version: 1,
      maxRounds: GAME_MASTER_SKIRMISH_MAX_ROUNDS,
      rewardPolicyId: PUBLIC_V1_ECONOMY_POLICY_ID,
    },
    reinforcementWaves: [],
    events: [{
      eventId: `${input.campaignId}:1:0001:ROUND_STARTED`,
      campaignId: input.campaignId,
      round: 1,
      sequence: 1,
      type: "ROUND_STARTED",
      payload: {
        deadline: manualClock ? null : resolvesAt,
        scenarioId,
        scenarioVersion: GAME_MASTER_SCENARIO_VERSION,
      },
      timestamp: input.now,
      visibility: "PUBLIC",
    }],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

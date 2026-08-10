import type {
  BattlefieldHex,
  CampaignDeployment,
  CampaignRuntimeState,
  Facing,
  ObjectiveState,
} from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import { getUnitClass } from "./catalogue";
import { createOutpostMap } from "./demo";
import { INFANTRY_COVER_ARMOR_1 } from "./cover";
import { ENGINE_VERSION } from "./resolver";

export const OUTPOST_K17_SCENARIO_ID = "scenario-outpost-k17-hold-relay" as const;
export const OUTPOST_K17_SCENARIO_VERSION = 3 as const;
export const IRON_RAIN_SCENARIO_ID = "scenario-operation-iron-rain" as const;
export const IRON_RAIN_SCENARIO_VERSION = 1 as const;
export const BROKEN_ROAD_SCENARIO_ID = "scenario-operation-broken-road" as const;
export const BROKEN_ROAD_SCENARIO_VERSION = 1 as const;

export const AUTHORED_SCENARIO_MAP_SOURCES = [
  "fixture/outpost-k17",
  "fixture/operation-iron-rain",
  "fixture/operation-broken-road",
] as const;

export function isAuthoredScenarioMapSourceKey(value: string): boolean {
  return (AUTHORED_SCENARIO_MAP_SOURCES as readonly string[]).includes(value);
}

export interface ScenarioCampaignInput {
  mapSourceKey: string;
  campaignId: string;
  campaignName: string;
  planetName: string;
  now: number;
  durationMs: number;
  round?: number;
  alliedDeployments: CampaignDeployment[];
}

function enemy(
  campaignId: string,
  id: string,
  definitionId: string,
  callsign: string,
  position: { q: number; r: number },
  facing: Facing,
  reserve = false,
  doctrine = "k17",
): CampaignDeployment {
  const definition = getUnitClass(definitionId);
  return {
    id: `${campaignId}:${id}`,
    campaignId,
    ownerId: `enemy-doctrine:${doctrine}`,
    side: "ENEMY",
    definitionId,
    callsign,
    status: reserve ? "READY" : "ACTIVE",
    position,
    facing,
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
    allowedOrders: definition.allowedOrders.filter((order) => ["HOLD", "ADVANCE", "RUSH"].includes(order)) as CampaignDeployment["allowedOrders"],
    locationState: reserve ? "RESERVE" : "ON_MAP",
  };
}

const ironRainObjectiveCoordinates = new Map([
  ["0,0", "objective-kestrel-airfield"],
  ["6,-2", "objective-kestrel-hive"],
]);

function ironRainHex(q: number, r: number): BattlefieldHex {
  const key = `${q},${r}`;
  const pattern = Math.abs(q * 17 + r * 11);
  const isAirfield = key === "0,0";
  const isHive = key === "6,-2";
  const isInsertion = key === "-6,2";
  const ridge = q >= 1 && q <= 3 && r >= -2 && r <= 1;
  const terrainId = isAirfield
    ? "terrain-open"
    : ridge
      ? "terrain-ridge"
      : pattern % 13 === 0
        ? "terrain-forest"
        : pattern % 17 === 0
          ? "terrain-marsh"
          : "terrain-open";
  return {
    coord: { q, r },
    terrainId,
    elevation: terrainId === "terrain-ridge" ? 1 : 0,
    movementCost: terrainId === "terrain-marsh" ? 1.5 : 1,
    blocksLineOfSight: terrainId === "terrain-forest",
    lineOfSightModifier: terrainId === "terrain-forest" ? -1 : 0,
    capacity: isInsertion ? 8 : isAirfield ? 6 : isHive ? 4 : terrainId === "terrain-forest" ? 2 : 3,
    edges: { rivers: [], roads: [] },
    structureIds: isAirfield
      ? ["structure-kestrel-rough-airfield"]
      : isHive
        ? ["structure-kestrel-bug-hive"]
        : [],
    objectiveId: ironRainObjectiveCoordinates.get(key),
    control: q < 0 ? "ALLIED" : q > 3 ? "ENEMY" : "NEUTRAL",
    environment: isAirfield ? [INFANTRY_COVER_ARMOR_1, "ROUGH_AIRFIELD"] : [],
    visibility: q <= 1 ? "OBSERVED" : "UNKNOWN",
  };
}

export function createIronRainMap(radius = 7): BattlefieldHex[] {
  const hexes: BattlefieldHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) hexes.push(ironRainHex(q, r));
  }
  return hexes;
}

const brokenRoadObjectiveCoordinates = new Map([
  ["0,0", "objective-junction-7"],
  ["4,-1", "objective-broken-road-depot"],
]);

function brokenRoadHex(q: number, r: number): BattlefieldHex {
  const key = `${q},${r}`;
  const pattern = Math.abs(q * 13 + r * 19);
  const isJunction = key === "0,0";
  const isDepot = key === "4,-1";
  const isInsertion = key === "-5,1";
  const onRoad = r === 0 || r === 1 || (q >= 0 && q <= 4 && r === -1);
  const ridge = !onRoad && q >= 1 && q <= 3 && r >= -3 && r <= -1;
  const terrainId = isJunction || isDepot || onRoad
    ? "terrain-open"
    : ridge
      ? "terrain-ridge"
      : pattern % 9 === 0
        ? "terrain-forest"
        : pattern % 14 === 0
          ? "terrain-marsh"
          : "terrain-open";
  return {
    coord: { q, r },
    terrainId,
    elevation: terrainId === "terrain-ridge" ? 1 : 0,
    movementCost: terrainId === "terrain-marsh" ? 1.5 : 1,
    blocksLineOfSight: terrainId === "terrain-forest",
    lineOfSightModifier: terrainId === "terrain-forest" ? -1 : 0,
    capacity: isInsertion ? 8 : isJunction ? 6 : isDepot ? 4 : terrainId === "terrain-forest" ? 2 : 3,
    edges: { rivers: [], roads: onRoad ? [0, 3] : [] },
    structureIds: isJunction
      ? ["structure-junction-7-relay"]
      : isDepot
        ? ["structure-broken-road-supply-cache"]
        : [],
    objectiveId: brokenRoadObjectiveCoordinates.get(key),
    control: q < 1 ? "ALLIED" : q > 3 ? "ENEMY" : "NEUTRAL",
    environment: isJunction ? [INFANTRY_COVER_ARMOR_1, "FORTIFIED_JUNCTION"] : isDepot ? ["SUPPLY_CACHE"] : [],
    visibility: q <= 1 ? "OBSERVED" : "UNKNOWN",
  };
}

export function createBrokenRoadMap(radius = 6): BattlefieldHex[] {
  const hexes: BattlefieldHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) hexes.push(brokenRoadHex(q, r));
  }
  return hexes;
}

function objectives(): ObjectiveState[] {
  return [
    {
      id: "objective-outpost",
      name: "Hold Outpost K-17",
      coord: { q: 0, r: 0 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Keep the command relay operational.",
    },
    {
      id: "objective-nest",
      name: "Destroy Bug Nest",
      coord: { q: 4, r: -2 },
      owner: "ENEMY",
      status: "ACTIVE",
      description: "Collapse the spawning chambers beneath Ridge Theta.",
    },
    {
      id: "objective-supply-route",
      name: "Keep Supply Route Open",
      coord: { q: -4, r: 2 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Protect the western road and depot approaches.",
    },
  ];
}

function ironRainObjectives(): ObjectiveState[] {
  return [
    {
      id: "objective-kestrel-airfield",
      name: "Hold Airfield",
      coord: { q: 0, r: 0 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Keep Kestrel Ridge's rough airfield in friendly hands until relief arrives.",
    },
    {
      id: "objective-kestrel-hive",
      name: "Destroy Hive",
      coord: { q: 6, r: -2 },
      owner: "ENEMY",
      status: "ACTIVE",
      description: "Break through the ridge line and clear the Bug spawning chambers.",
    },
  ];
}

function brokenRoadObjectives(): ObjectiveState[] {
  return [
    {
      id: "objective-junction-7",
      name: "Hold Junction 7",
      coord: { q: 0, r: 0 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Keep the road junction and command relay in friendly hands.",
    },
    {
      id: "objective-broken-road-depot",
      name: "Protect Supply Cache",
      coord: { q: 4, r: -1 },
      owner: "ALLIED",
      status: "ACTIVE",
      description: "Prevent the eastern Bug column from overrunning the forward supply cache.",
    },
  ];
}

function createBrokenRoadCampaignState(input: ScenarioCampaignInput): CampaignRuntimeState {
  const round = input.round ?? 1;
  const lockLeadMs = Math.min(30_000, Math.floor(input.durationMs / 5));
  const resolvesAt = input.now + input.durationMs;
  const lockAt = resolvesAt - lockLeadMs;
  const brokenRoadEnemy = (
    id: string,
    definitionId: string,
    callsign: string,
    position: { q: number; r: number },
    facing: Facing,
    reserve = false,
  ) => enemy(input.campaignId, id, definitionId, callsign, position, facing, reserve, "broken-road");
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    planetName: input.planetName,
    scenarioId: BROKEN_ROAD_SCENARIO_ID,
    scenarioVersion: BROKEN_ROAD_SCENARIO_VERSION,
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round,
    phase: "PLANNING",
    clock: {
      durationMs: input.durationMs,
      lockLeadMs,
      roundStartedAt: input.now,
      lockAt,
      resolvesAt,
      schedule: [
        { id: `${input.campaignId}:${round}:lock`, type: "ORDER_LOCK", round, runAt: lockAt },
        { id: `${input.campaignId}:${round}:resolve`, type: "ROUND_RESOLVE", round, runAt: resolvesAt },
      ],
    },
    map: createBrokenRoadMap(),
    deployments: [
      ...input.alliedDeployments.map((deployment) => structuredClone(deployment)),
      brokenRoadEnemy("road-drone", "enemy-bug-drone", "SPUR-4", { q: 2, r: 0 }, 5),
      brokenRoadEnemy("road-warrior", "enemy-bug-warrior", "CLAW-27", { q: 3, r: -1 }, 5),
      brokenRoadEnemy("depot-warrior", "enemy-bug-warrior", "CHITIN-31", { q: 4, r: -1 }, 5),
      brokenRoadEnemy("wave-2-drone", "enemy-bug-drone", "SPUR-9", { q: 6, r: -2 }, 4, true),
      brokenRoadEnemy("wave-2-warrior", "enemy-bug-warrior", "CLAW-33", { q: 6, r: -1 }, 4, true),
      brokenRoadEnemy("wave-3-warrior", "enemy-bug-warrior", "CHITIN-38", { q: 5, r: 0 }, 4, true),
      brokenRoadEnemy("wave-3-heavy", "enemy-bug-heavy", "BULWARK-12", { q: 4, r: 1 }, 4, true),
    ],
    orders: [],
    objectives: brokenRoadObjectives(),
    scenarioPolicy: {
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: round,
      maxRounds: 5,
      primaryObjectiveId: "objective-junction-7",
      capturableObjectiveIds: ["objective-broken-road-depot", "objective-junction-7"],
    },
    reinforcementWaves: [
      {
        id: "broken-road-wave-2",
        arrivesAfterRound: round,
        deploymentIds: [`${input.campaignId}:wave-2-drone`, `${input.campaignId}:wave-2-warrior`],
        status: "PENDING",
      },
      {
        id: "broken-road-wave-3",
        arrivesAfterRound: round + 2,
        deploymentIds: [`${input.campaignId}:wave-3-warrior`, `${input.campaignId}:wave-3-heavy`],
        status: "PENDING",
      },
    ],
    events: [{
      eventId: `${input.campaignId}:${round}:0001:ROUND_STARTED`,
      campaignId: input.campaignId,
      round,
      sequence: 1,
      type: "ROUND_STARTED",
      payload: {
        deadline: resolvesAt,
        scenarioId: BROKEN_ROAD_SCENARIO_ID,
        scenarioVersion: BROKEN_ROAD_SCENARIO_VERSION,
      },
      timestamp: input.now,
      visibility: "PUBLIC",
    }],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

function createIronRainCampaignState(input: ScenarioCampaignInput): CampaignRuntimeState {
  const round = input.round ?? 1;
  const lockLeadMs = Math.min(30_000, Math.floor(input.durationMs / 5));
  const resolvesAt = input.now + input.durationMs;
  const lockAt = resolvesAt - lockLeadMs;
  const ironRainEnemy = (
    id: string,
    definitionId: string,
    callsign: string,
    position: { q: number; r: number },
    facing: Facing,
    reserve = false,
  ) => enemy(input.campaignId, id, definitionId, callsign, position, facing, reserve, "iron-rain");
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    planetName: input.planetName,
    scenarioId: IRON_RAIN_SCENARIO_ID,
    scenarioVersion: IRON_RAIN_SCENARIO_VERSION,
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round,
    phase: "PLANNING",
    clock: {
      durationMs: input.durationMs,
      lockLeadMs,
      roundStartedAt: input.now,
      lockAt,
      resolvesAt,
      schedule: [
        { id: `${input.campaignId}:${round}:lock`, type: "ORDER_LOCK", round, runAt: lockAt },
        { id: `${input.campaignId}:${round}:resolve`, type: "ROUND_RESOLVE", round, runAt: resolvesAt },
      ],
    },
    map: createIronRainMap(),
    deployments: [
      ...input.alliedDeployments.map((deployment) => structuredClone(deployment)),
      ironRainEnemy("vanguard-drone", "enemy-bug-drone", "NEEDLE-3", { q: 3, r: -1 }, 5),
      ironRainEnemy("vanguard-warrior", "enemy-bug-warrior", "CLAW-11", { q: 4, r: -1 }, 5),
      ironRainEnemy("ridge-warrior", "enemy-bug-warrior", "CHITIN-16", { q: 4, r: 0 }, 5),
      ironRainEnemy("hive-heavy", "enemy-bug-heavy", "BULWARK-6", { q: 6, r: -2 }, 4),
      ironRainEnemy("wave-2-drone", "enemy-bug-drone", "NEEDLE-8", { q: 7, r: -3 }, 4, true),
      ironRainEnemy("wave-2-warrior", "enemy-bug-warrior", "CLAW-14", { q: 7, r: -2 }, 4, true),
      ironRainEnemy("wave-3-warrior", "enemy-bug-warrior", "CHITIN-21", { q: 7, r: -1 }, 4, true),
      ironRainEnemy("wave-3-heavy", "enemy-bug-heavy", "BULWARK-9", { q: 6, r: 0 }, 4, true),
      ironRainEnemy("wave-4-drone", "enemy-bug-drone", "NEEDLE-13", { q: 6, r: 1 }, 3, true),
      ironRainEnemy("wave-4-warrior", "enemy-bug-warrior", "CLAW-19", { q: 5, r: 2 }, 3, true),
    ],
    orders: [],
    objectives: ironRainObjectives(),
    scenarioPolicy: {
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: round,
      maxRounds: 6,
      primaryObjectiveId: "objective-kestrel-airfield",
      capturableObjectiveIds: ["objective-kestrel-airfield", "objective-kestrel-hive"],
    },
    reinforcementWaves: [
      {
        id: "iron-rain-wave-2",
        arrivesAfterRound: round,
        deploymentIds: [`${input.campaignId}:wave-2-drone`, `${input.campaignId}:wave-2-warrior`],
        status: "PENDING",
      },
      {
        id: "iron-rain-wave-3",
        arrivesAfterRound: round + 1,
        deploymentIds: [`${input.campaignId}:wave-3-warrior`, `${input.campaignId}:wave-3-heavy`],
        status: "PENDING",
      },
      {
        id: "iron-rain-wave-4",
        arrivesAfterRound: round + 2,
        deploymentIds: [`${input.campaignId}:wave-4-drone`, `${input.campaignId}:wave-4-warrior`],
        status: "PENDING",
      },
    ],
    events: [{
      eventId: `${input.campaignId}:${round}:0001:ROUND_STARTED`,
      campaignId: input.campaignId,
      round,
      sequence: 1,
      type: "ROUND_STARTED",
      payload: {
        deadline: resolvesAt,
        scenarioId: IRON_RAIN_SCENARIO_ID,
        scenarioVersion: IRON_RAIN_SCENARIO_VERSION,
      },
      timestamp: input.now,
      visibility: "PUBLIC",
    }],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

export function createScenarioCampaignState(input: ScenarioCampaignInput): CampaignRuntimeState {
  if (input.mapSourceKey === "fixture/operation-iron-rain") {
    return createIronRainCampaignState(input);
  }
  if (input.mapSourceKey === "fixture/operation-broken-road") {
    return createBrokenRoadCampaignState(input);
  }
  if (input.mapSourceKey !== "fixture/outpost-k17") {
    throw new Error(`CAMPAIGN_SCENARIO_NOT_AVAILABLE:${input.mapSourceKey}`);
  }
  const round = input.round ?? 1;
  const lockLeadMs = Math.min(30_000, Math.floor(input.durationMs / 5));
  const resolvesAt = input.now + input.durationMs;
  const lockAt = resolvesAt - lockLeadMs;
  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    planetName: input.planetName,
    scenarioId: OUTPOST_K17_SCENARIO_ID,
    scenarioVersion: OUTPOST_K17_SCENARIO_VERSION,
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round,
    phase: "PLANNING",
    clock: {
      durationMs: input.durationMs,
      lockLeadMs,
      roundStartedAt: input.now,
      lockAt,
      resolvesAt,
      schedule: [
        { id: `${input.campaignId}:${round}:lock`, type: "ORDER_LOCK", round, runAt: lockAt },
        { id: `${input.campaignId}:${round}:resolve`, type: "ROUND_RESOLVE", round, runAt: resolvesAt },
      ],
    },
    map: createOutpostMap(),
    deployments: [
      ...input.alliedDeployments.map((deployment) => structuredClone(deployment)),
      enemy(input.campaignId, "bug-drone-1", "enemy-bug-drone", "SKITTER-9", { q: 3, r: -2 }, 5),
      enemy(input.campaignId, "bug-warrior-1", "enemy-bug-warrior", "CHITIN-4", { q: 3, r: -1 }, 5),
      enemy(input.campaignId, "bug-heavy-1", "enemy-bug-heavy", "BEHEMOTH", { q: 4, r: -2 }, 4),
      enemy(input.campaignId, "wave-2-drone", "enemy-bug-drone", "RAZOR-2", { q: 5, r: -2 }, 4, true),
      enemy(input.campaignId, "wave-2-warrior", "enemy-bug-warrior", "CHITIN-7", { q: 5, r: -3 }, 4, true),
      enemy(input.campaignId, "wave-3-warrior-a", "enemy-bug-warrior", "CLAW-3", { q: 5, r: -1 }, 4, true),
      enemy(input.campaignId, "wave-3-warrior-b", "enemy-bug-warrior", "CLAW-8", { q: 4, r: 1 }, 3, true),
      enemy(input.campaignId, "wave-4-drone", "enemy-bug-drone", "SKITTER-12", { q: 4, r: 0 }, 3, true),
      enemy(input.campaignId, "wave-4-heavy", "enemy-bug-heavy", "BEHEMOTH-2", { q: 3, r: 0 }, 3, true),
    ],
    orders: [],
    objectives: objectives(),
    scenarioPolicy: {
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: round,
      maxRounds: 4,
      primaryObjectiveId: "objective-outpost",
      capturableObjectiveIds: ["objective-nest", "objective-outpost", "objective-supply-route"],
    },
    reinforcementWaves: [
      {
        id: "k17-wave-2",
        arrivesAfterRound: round,
        deploymentIds: [`${input.campaignId}:wave-2-drone`, `${input.campaignId}:wave-2-warrior`],
        status: "PENDING",
      },
      {
        id: "k17-wave-3",
        arrivesAfterRound: round + 1,
        deploymentIds: [`${input.campaignId}:wave-3-warrior-a`, `${input.campaignId}:wave-3-warrior-b`],
        status: "PENDING",
      },
      {
        id: "k17-wave-4",
        arrivesAfterRound: round + 2,
        deploymentIds: [`${input.campaignId}:wave-4-drone`, `${input.campaignId}:wave-4-heavy`],
        status: "PENDING",
      },
    ],
    events: [{
      eventId: `${input.campaignId}:${round}:0001:ROUND_STARTED`,
      campaignId: input.campaignId,
      round,
      sequence: 1,
      type: "ROUND_STARTED",
      payload: { deadline: resolvesAt, scenarioId: OUTPOST_K17_SCENARIO_ID, scenarioVersion: OUTPOST_K17_SCENARIO_VERSION },
      timestamp: input.now,
      visibility: "PUBLIC",
    }],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

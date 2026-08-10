import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  CampaignRuntimeState,
  Facing,
  UnitOrder,
} from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import { getUnitClass } from "./catalogue";
import { ENGINE_VERSION } from "./resolver";

const objectiveCoordinates = new Map([
  ["0,0", "objective-outpost"],
  ["4,-2", "objective-nest"],
  ["-4,2", "objective-supply-route"],
]);

function makeHex(q: number, r: number): BattlefieldHex {
  const pattern = Math.abs(q * 13 + r * 7);
  const terrainId =
    pattern % 11 === 0
      ? "terrain-forest"
      : pattern % 7 === 0
        ? "terrain-marsh"
        : Math.abs(r) === 3 && q > -3
          ? "terrain-ridge"
          : "terrain-open";
  const riverFacing: Facing[] = q === -1 && r >= -3 && r <= 3 ? [2, 5] : [];
  const roadFacing: Facing[] = r === 1 && q >= -5 && q < 5 ? [2, 5] : [];
  return {
    coord: { q, r },
    terrainId,
    elevation: terrainId === "terrain-ridge" ? 1 : 0,
    movementCost: terrainId === "terrain-marsh" ? 1.5 : 1,
    blocksLineOfSight: terrainId === "terrain-forest",
    lineOfSightModifier: terrainId === "terrain-forest" ? -1 : 0,
    capacity: objectiveCoordinates.has(`${q},${r}`) ? 2 : terrainId === "terrain-forest" ? 2 : 3,
    edges: { rivers: riverFacing, roads: roadFacing },
    structureIds: q === 0 && r === 0 ? ["structure-outpost-k17"] : [],
    objectiveId: objectiveCoordinates.get(`${q},${r}`),
    control: q < -2 ? "ALLIED" : q > 2 ? "ENEMY" : "NEUTRAL",
    environment: pattern % 9 === 0 ? ["ASH_STORM_EXPOSED"] : [],
    visibility: q <= 1 ? "OBSERVED" : "UNKNOWN",
  };
}

export function createOutpostMap(radius = 5): BattlefieldHex[] {
  const hexes: BattlefieldHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) hexes.push(makeHex(q, r));
  }
  return hexes;
}

function deployment(
  id: string,
  definitionId: string,
  ownerId: string,
  side: CampaignDeployment["side"],
  callsign: string,
  position: AxialCoord,
  facing: Facing,
  persistent = true,
): CampaignDeployment {
  const definition = getUnitClass(definitionId);
  return {
    id,
    campaignId: "outpost-k17",
    persistentUnitId: persistent ? `persistent-${id}` : undefined,
    ownerId,
    side,
    definitionId,
    callsign,
    status: "ACTIVE",
    position,
    facing,
    stats: structuredClone(definition.stats),
    currentHealth: definition.stats.maxHealth,
    weapons: structuredClone(definition.weapons),
    ammunition: Object.fromEntries(
      definition.weapons
        .filter((weapon) => weapon.ammoCapacity !== undefined)
        .map((weapon) => [weapon.id, weapon.ammoCapacity!]),
    ),
    cooldowns: {},
    statuses: definitionId === "unit-artillery" ? ["PACKED"] : [],
    equipmentIds: [],
    battlegroupId: side === "ALLIED" ? "hammer" : undefined,
  };
}

function demoOrder(
  id: string,
  unitId: string,
  ownerId: string,
  round: number,
  orderType: UnitOrder["orderType"],
  route: AxialCoord[],
  facing: Facing,
): UnitOrder {
  return {
    id,
    revision: 1,
    unitId,
    campaignId: "outpost-k17",
    round,
    orderType,
    lifecycle: "SUBMITTED",
    startHex: route[0],
    route,
    endHex: route.at(-1)!,
    facing,
    actions: [],
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: ownerId,
    submittedAt: 0,
  };
}

export function createDemoCampaignState(
  now: number,
  durationMs = 300_000,
  campaignId = "outpost-k17",
): CampaignRuntimeState {
  const round = 18;
  const lockLeadMs = Math.min(30_000, Math.floor(durationMs / 5));
  const resolvesAt = now + durationMs;
  const lockAt = resolvesAt - lockLeadMs;
  const map = createOutpostMap();
  const deployments: CampaignDeployment[] = [
    deployment("dep-rook-7", "unit-infantry-squad", "demo-user", "ALLIED", "ROOK-7", { q: -3, r: 1 }, 2),
    deployment("dep-bellator", "unit-main-battle-tank", "demo-user", "ALLIED", "BELLATOR", { q: -4, r: 3 }, 1),
    deployment("dep-keystone", "unit-engineers", "demo-user", "ALLIED", "KEYSTONE", { q: -4, r: 1 }, 2),
    deployment("dep-longbow", "unit-artillery", "demo-user", "ALLIED", "LONGBOW", { q: -5, r: 2 }, 2),
    deployment("dep-lantern", "unit-light-vehicle", "demo-user", "ALLIED", "LANTERN", { q: -2, r: -1 }, 2),
    deployment("bug-drone-1", "enemy-bug-drone", "enemy-doctrine", "ENEMY", "SKITTER-9", { q: 1, r: -1 }, 5, false),
    deployment("bug-warrior-1", "enemy-bug-warrior", "enemy-doctrine", "ENEMY", "CHITIN-4", { q: 3, r: -1 }, 5, false),
    deployment("bug-heavy-1", "enemy-bug-heavy", "enemy-doctrine", "ENEMY", "BEHEMOTH", { q: 4, r: -2 }, 4, false),
  ];
  deployments.forEach((item) => {
    item.campaignId = campaignId;
  });
  const orders = [
    demoOrder("order-longbow-18", "dep-longbow", "demo-user", round, "HOLD", [{ q: -5, r: 2 }], 2),
    demoOrder(
      "order-lantern-18",
      "dep-lantern",
      "demo-user",
      round,
      "ADVANCE",
      [
        { q: -2, r: -1 },
        { q: -1, r: -1 },
      ],
      2,
    ),
  ];
  orders.forEach((order) => {
    order.campaignId = campaignId;
  });

  return {
    campaignId,
    campaignName: "Outpost K-17",
    planetName: "Corinth",
    scenarioId: "scenario-demo-outpost-k17",
    scenarioVersion: 1,
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round,
    phase: "PLANNING",
    clock: {
      durationMs,
      lockLeadMs,
      roundStartedAt: now,
      lockAt,
      resolvesAt,
      schedule: [
        { id: `${campaignId}:${round}:lock`, type: "ORDER_LOCK", round, runAt: lockAt },
        { id: `${campaignId}:${round}:resolve`, type: "ROUND_RESOLVE", round, runAt: resolvesAt },
      ],
    },
    map,
    deployments,
    orders,
    objectives: [
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
    ],
    scenarioPolicy: {
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: 18,
      maxRounds: 4,
      primaryObjectiveId: "objective-outpost",
      capturableObjectiveIds: [
        "objective-nest",
        "objective-outpost",
        "objective-supply-route",
      ],
    },
    events: [
      {
        eventId: `${campaignId}:17:0001:ROUND_FINISHED`,
        campaignId,
        round: 17,
        sequence: 1,
        type: "ROUND_FINISHED",
        payload: { summary: "Contact established north-east of K-17. Allied line remains intact." },
        timestamp: now - 60_000,
        visibility: "PUBLIC",
      },
      {
        eventId: `${campaignId}:18:0001:ROUND_STARTED`,
        campaignId,
        round,
        sequence: 1,
        type: "ROUND_STARTED",
        payload: { deadline: resolvesAt },
        timestamp: now,
        visibility: "PUBLIC",
      },
    ],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

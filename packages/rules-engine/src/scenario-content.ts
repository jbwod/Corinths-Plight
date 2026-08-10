import type { CampaignDeployment, CampaignRuntimeState, Facing, ObjectiveState } from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import { getUnitClass } from "./catalogue";
import { createOutpostMap } from "./demo";
import { ENGINE_VERSION } from "./resolver";

export const OUTPOST_K17_SCENARIO_ID = "scenario-outpost-k17-hold-relay" as const;
export const OUTPOST_K17_SCENARIO_VERSION = 3 as const;

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
): CampaignDeployment {
  const definition = getUnitClass(definitionId);
  return {
    id: `${campaignId}:${id}`,
    campaignId,
    ownerId: "enemy-doctrine:k17",
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

export function createScenarioCampaignState(input: ScenarioCampaignInput): CampaignRuntimeState {
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

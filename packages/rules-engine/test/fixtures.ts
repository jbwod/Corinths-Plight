import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  CampaignEvent,
  CampaignRuntimeState,
  EquipmentDefinition,
  FactionSide,
  RoundInput,
  StructuredAction,
  UnitOrder,
  UnitStats,
  WeaponProfile,
} from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import type { SeededRandom } from "../src/rng";
import { ENGINE_VERSION } from "../src/resolver";

export const TEST_CAMPAIGN_ID = "campaign-test";

export const baseWeapon: WeaponProfile = {
  id: "weapon-test-rifle",
  name: "Test Rifle",
  damage: { count: 1, sides: 6 },
  range: 3,
  armorPiercing: 0,
  tags: [],
};

export function makeHex(
  q: number,
  r: number,
  overrides: Partial<BattlefieldHex> = {},
): BattlefieldHex {
  const base: BattlefieldHex = {
    coord: { q, r },
    terrainId: "terrain-open",
    elevation: 0,
    movementCost: 1,
    blocksLineOfSight: false,
    lineOfSightModifier: 0,
    capacity: 3,
    edges: { rivers: [], roads: [] },
    structureIds: [],
    control: "NEUTRAL",
    environment: [],
    visibility: "UNKNOWN",
  };
  return {
    ...base,
    ...overrides,
    coord: overrides.coord ?? { q, r },
    edges: {
      rivers: overrides.edges?.rivers ?? [],
      roads: overrides.edges?.roads ?? [],
    },
  };
}

export function makeAxialMap(radius: number): BattlefieldHex[] {
  const result: BattlefieldHex[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) result.push(makeHex(q, r));
  }
  return result;
}

type DeploymentOverrides = Partial<Omit<CampaignDeployment, "stats">> & {
  stats?: Partial<UnitStats>;
};

export function makeDeployment(
  id: string,
  position: AxialCoord,
  side: FactionSide = "ALLIED",
  overrides: DeploymentOverrides = {},
): CampaignDeployment {
  const stats: UnitStats = {
    healthModel: "FORCE_STRENGTH",
    maxHealth: 6,
    armor: 0,
    defense: 0,
    speed: 3,
    sensors: 3,
    capacity: 1,
    ...overrides.stats,
  };
  const weapons = overrides.weapons ?? [structuredClone(baseWeapon)];
  const base: CampaignDeployment = {
    id,
    campaignId: TEST_CAMPAIGN_ID,
    persistentUnitId: `persistent-${id}`,
    ownerId: `${side.toLowerCase()}-owner`,
    side,
    definitionId: `definition-${id}`,
    callsign: id.toUpperCase().slice(0, 7),
    status: "ACTIVE",
    position: { ...position },
    facing: 0,
    stats,
    currentHealth: stats.maxHealth,
    weapons,
    ammunition: Object.fromEntries(
      weapons
        .filter((weapon) => weapon.ammoCapacity !== undefined)
        .map((weapon) => [weapon.id, weapon.ammoCapacity!]),
    ),
    cooldowns: {},
    statuses: [],
    equipmentIds: [],
  };
  return {
    ...base,
    ...overrides,
    position: overrides.position ?? { ...position },
    stats,
    weapons,
  };
}

export function makeAction(
  id: string,
  overrides: Partial<StructuredAction> = {},
): StructuredAction {
  return {
    id,
    type: "ATTACK",
    economy: "STANDARD",
    speedCost: 0,
    equipmentIds: [],
    ...overrides,
  };
}

export function makeOrder(
  deployment: CampaignDeployment,
  overrides: Partial<UnitOrder> = {},
): UnitOrder {
  const route = overrides.route?.map((coord) => ({ ...coord })) ?? [{ ...deployment.position }];
  const startHex = overrides.startHex ?? route[0];
  const endHex = overrides.endHex ?? route.at(-1)!;
  const base: UnitOrder = {
    id: `order-${deployment.id}`,
    revision: 1,
    unitId: deployment.id,
    campaignId: deployment.campaignId,
    round: 1,
    orderType: route.length > 1 ? "ADVANCE" : "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...startHex },
    route,
    endHex: { ...endHex },
    facing: deployment.facing,
    actions: [],
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: deployment.ownerId,
    submittedAt: 100,
  };
  return {
    ...base,
    ...overrides,
    startHex: { ...startHex },
    route,
    endHex: { ...endHex },
  };
}

export function makeState(
  deployments: CampaignDeployment[],
  map: BattlefieldHex[],
  orders: UnitOrder[] = [],
  events: CampaignEvent[] = [],
): CampaignRuntimeState {
  return {
    campaignId: TEST_CAMPAIGN_ID,
    campaignName: "Test Campaign",
    planetName: "Corinth",
    rulesetVersion: RULESET_VERSION,
    engineVersion: ENGINE_VERSION,
    round: 1,
    phase: "LOCKED",
    clock: {
      durationMs: 60_000,
      lockLeadMs: 5_000,
      roundStartedAt: 0,
      lockAt: 55_000,
      resolvesAt: 60_000,
      schedule: [],
    },
    map,
    deployments,
    orders,
    objectives: [],
    events,
    resolutions: {},
    pendingPersistentEffects: [],
    version: 1,
  };
}

export function makeRoundInput(
  previousState: CampaignRuntimeState,
  playerOrders: UnitOrder[] = [],
  enemyOrders: UnitOrder[] = [],
  overrides: Partial<RoundInput> = {},
): RoundInput {
  return {
    previousState,
    rulesetVersion: previousState.rulesetVersion,
    playerOrders,
    enemyOrders,
    seed: "fixed-test-seed",
    resolutionTime: 60_000,
    ...overrides,
  };
}

export function fixedRandom(...rolls: number[]): SeededRandom {
  let index = 0;
  const take = (minimum: number, maximum: number): number => {
    const value = rolls[index] ?? rolls.at(-1) ?? minimum;
    index += 1;
    if (value < minimum || value > maximum) {
      throw new Error(`Fixed roll ${value} is outside ${minimum}-${maximum}.`);
    }
    return value;
  };
  return {
    next: () => (take(1, 1_000_000) - 1) / 1_000_000,
    integer: (minimum, maximum) => take(minimum, maximum),
    die: (sides) => take(1, sides),
    state: () => index,
  };
}

export function makeEquipment(
  id: string,
  overrides: Partial<EquipmentDefinition> = {},
): EquipmentDefinition {
  return {
    id,
    kind: "equipment",
    name: id,
    description: "Test equipment",
    category: "TEST",
    slotType: "primary",
    cost: 1,
    allowedClasses: [],
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: {},
    abilityGrants: [],
    consumable: false,
    rulesText: "Test rule",
    tags: [],
    rulesetVersion: RULESET_VERSION,
    source: "test fixture",
    status: "active",
    ...overrides,
  };
}

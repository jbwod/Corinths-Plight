import type {
  ArtilleryProfile,
  CampaignDeployment,
  SpotterProfile,
  StructuredAction,
  UnitOrder,
  WeaponProfile,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  V5_ARTILLERY_FIRE_SUPPLY_COST,
  V5_ARTILLERY_MAXIMUM_RANGE,
  V5_ARTILLERY_MINIMUM_RANGE,
  V5_FUNNEL_FORCED_DISTANCE_QUARTERS,
  createDemoCampaignState,
  getActionDefinition,
  resolveRound,
  validateArtilleryAntiOrbitalExecution,
  validateArtilleryFire,
  validateFunnelExecution,
  validateOrder,
} from "../src";
import { makeHex } from "./fixtures";

const map = [
  makeHex(0, 0),
  makeHex(1, 0),
  makeHex(2, 0),
  makeHex(3, 0),
  makeHex(4, 0),
  makeHex(5, 0),
];

const artillery: ArtilleryProfile = {
  id: "v5-artillery",
  deploySpeedCostQuarters: 2,
  packSpeedCostQuarters: 2,
  mustBeDeployedForIndirectFire: true,
  indirectRequiresSpotter: true,
  fireSupplyType: "SMALL_SUPPLY",
  fireSupplyCost: 1,
};

const spotterProfile: SpotterProfile = {
  id: "ordinary-ground-spotter",
  canSpotDomains: ["GROUND"],
  allowsFiringUnit: false,
  prohibitedTags: ["CANNOT_SPOT_GROUND"],
};

const barrage: WeaponProfile = {
  id: "artillery-control-fire",
  name: "Artillery control fire",
  damage: { count: 1, sides: 6 },
  range: 4,
  armorPiercing: 0,
  indirect: true,
  tags: ["INDIRECT"],
};

function action(
  id: string,
  type: StructuredAction["type"],
  fields: Partial<StructuredAction> = {},
): StructuredAction {
  const rule = getActionDefinition(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(
  state: ReturnType<typeof createDemoCampaignState>,
  unit: CampaignDeployment,
  actions: StructuredAction[],
): UnitOrder {
  return {
    id: `artillery-order:${unit.id}:${actions.map((item) => item.id).join("-")}`,
    revision: 1,
    unitId: unit.id,
    campaignId: state.campaignId,
    round: state.round,
    orderType: "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...unit.position },
    route: [{ ...unit.position }],
    endHex: { ...unit.position },
    facing: unit.facing,
    actions,
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: unit.ownerId,
    submittedAt: 1,
  };
}

describe("V5 Artillery control and domain boundaries", () => {
  it("publishes only the source-complete range, supply, and forced-distance values", () => {
    expect({
      minimumRange: V5_ARTILLERY_MINIMUM_RANGE,
      maximumRange: V5_ARTILLERY_MAXIMUM_RANGE,
      supplyCost: V5_ARTILLERY_FIRE_SUPPLY_COST,
      funnelDistanceQuarters: V5_FUNNEL_FORCED_DISTANCE_QUARTERS,
    }).toEqual({ minimumRange: 1, maximumRange: 4, supplyCost: 1, funnelDistanceQuarters: 2 });
  });

  it("validates the public-v1 whole-hex Funnel profile and spends one Small Supply", () => {
    const base = {
      deploymentState: "DEPLOYED" as const,
      targetExists: true,
      targetHostile: true,
      targetOperational: true,
      targetOnMap: true,
      targetMovedThisRound: true,
      distance: 3,
      chosenDirection: 2 as const,
      supplyAvailable: 2,
    };
    expect(validateFunnelExecution({ ...base, targetMovedThisRound: false })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/moved this round/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateFunnelExecution(base)).toMatchObject({
      legal: true,
      supplySpent: 1,
      supplyAfter: 1,
      applicationProfileId: "public-v1-artillery-funnel@1",
      ruleIds: ["RC-UNIT-004", "RC-V5-011", "public-v1-artillery-funnel@1"],
    });
  });

  it("rejects ground direct damage and keeps otherwise valid low-orbit fire blocked by DEC-012", () => {
    const base = {
      deploymentState: "DEPLOYED" as const,
      targetDomain: "GROUND" as const,
      targetOrbitBand: undefined,
      distance: 2,
      supplyAvailable: 2,
    };
    expect(validateArtilleryAntiOrbitalExecution(base)).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/only an Orbital/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateArtilleryAntiOrbitalExecution({
      ...base,
      targetDomain: "ORBITAL",
      targetOrbitBand: "LOW",
    })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/DEC-012/i),
      supplySpent: 0,
      supplyAfter: 2,
      ruleIds: expect.arrayContaining(["RC-V5-013", "DEC-012"]),
    });
  });
});

describe("V5 Artillery bombardment fire envelope", () => {
  const target = {
    id: "target",
    side: "ENEMY" as const,
    status: "ACTIVE" as const,
    position: { q: 2, r: 0 },
    domain: "GROUND" as const,
  };
  const spotter = {
    id: "spotter",
    side: "ALLIED" as const,
    status: "ACTIVE" as const,
    position: { q: 1, r: 0 },
    sensorRange: 4,
    tags: [] as string[],
    profile: spotterProfile,
  };
  const input = {
    profile: artillery,
    deploymentState: "DEPLOYED" as const,
    firingUnitId: "artillery",
    firingSide: "ALLIED" as const,
    firingPosition: { q: 0, r: 0 },
    weapon: barrage,
    target,
    map,
    spotters: [spotter],
    supplyAvailable: 2,
    minimumRange: 1,
    maximumRange: 4,
  };

  it("enforces Range 1-4 and rejects withdrawn targets without spending supply", () => {
    expect(validateArtilleryFire({ ...input, target: { ...target, position: { q: 0, r: 0 } } })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/outside artillery range/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateArtilleryFire({ ...input, target: { ...target, position: { q: 5, r: 0 } } })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/outside artillery range/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateArtilleryFire({ ...input, target: { ...target, status: "WITHDRAWN" } })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/not operational/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateArtilleryFire({ ...input, target: { ...target, side: "NEUTRAL" } })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/hostile target/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
  });

  it("rejects self-spotting and aerospace ground spotting, then selects an eligible spotter deterministically", () => {
    const firingUnitSpotter = { ...spotter, id: "artillery", position: { q: 0, r: 0 } };
    const aerospaceSpotter = { ...spotter, id: "air", tags: ["CANNOT_SPOT_GROUND"] };
    expect(validateArtilleryFire({ ...input, spotters: [firingUnitSpotter, aerospaceSpotter] })).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/eligible friendly spotter/i),
      supplySpent: 0,
      supplyAfter: 2,
    });
    expect(validateArtilleryFire({ ...input, spotters: [{ ...spotter, id: "zulu" }, { ...spotter, id: "alpha" }] })).toMatchObject({
      legal: true,
      spotterId: "alpha",
      supplySpent: 1,
      supplyAfter: 1,
    });
  });
});

describe("V5 Artillery resolver guardrails", () => {
  it("funnels a hostile unit that actually moved, before combat, into one open adjacent hex", () => {
    const state = createDemoCampaignState(1_000);
    const artilleryUnit = state.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    const target = state.deployments.find((unit) => unit.id === "bug-drone-1")!;
    target.position = { q: -2, r: 1 };
    artilleryUnit.supplies = { SMALL_SUPPLY: 2 };
    const artilleryOrder = order(state, artilleryUnit, [
      action("deploy-for-funnel", "DEPLOY"),
      action("funnel-moving-target", "FUNNEL", { targetDeploymentId: target.id, direction: 0 }),
    ]);
    const targetOrder = order(state, target, []);
    targetOrder.orderType = "ADVANCE";
    targetOrder.startHex = { ...target.position };
    targetOrder.route = [{ ...target.position }, { q: -1, r: 1 }];
    targetOrder.endHex = { q: -1, r: 1 };

    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [artilleryOrder],
      enemyOrders: [targetOrder],
      seed: "artillery-funnel-public-v1",
      resolutionTime: 2_000,
    });

    expect(output.state.deployments.find((unit) => unit.id === target.id)?.position).toEqual({ q: -1, r: 0 });
    expect(output.state.deployments.find((unit) => unit.id === artilleryUnit.id)?.supplies).toEqual({ SMALL_SUPPLY: 1 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_FUNNELLED",
      actor: artilleryUnit.id,
      payload: expect.objectContaining({
        targetId: target.id,
        from: { q: -1, r: 1 },
        to: { q: -1, r: 0 },
        direction: 0,
        forcedDistanceQuarters: 2,
        smallSupplySpent: 1,
        applicationProfileId: "public-v1-artillery-funnel@1",
      }),
    }));
  });

  it("rejects Funnel when the target did not move and preserves supply", () => {
    const state = createDemoCampaignState(1_000);
    const artilleryUnit = state.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    const target = state.deployments.find((unit) => unit.id === "bug-drone-1")!;
    target.position = { q: -1, r: 1 };
    artilleryUnit.statuses = ["DEPLOYED"];
    artilleryUnit.artilleryDeployment = "DEPLOYED";
    artilleryUnit.supplies = { SMALL_SUPPLY: 1 };
    const artilleryOrder = order(state, artilleryUnit, [
      action("invalid-stationary-funnel", "FUNNEL", { targetDeploymentId: target.id, direction: 0 }),
    ]);

    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [artilleryOrder],
      enemyOrders: [],
      seed: "stationary-funnel-rejected",
      resolutionTime: 2_000,
    });

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: artilleryUnit.id,
      payload: expect.objectContaining({ reasons: [expect.stringMatching(/moved this round/i)] }),
    }));
    expect(output.state.deployments.find((unit) => unit.id === artilleryUnit.id)?.supplies).toEqual({ SMALL_SUPPLY: 1 });
  });

  it("rejects Bombardment from other classes and packed Artillery before resolution", () => {
    const state = createDemoCampaignState(1_000);
    const infantry = state.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const artilleryUnit = state.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    const bombard = action("invalid-bombard", "BOMBARDMENT", { targetHex: { q: -1, r: 1 } });
    const infantryOrder = order(state, infantry, [bombard]);
    expect(validateOrder(infantryOrder, infantry, {
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [infantryOrder],
      enemyOrders: [],
      seed: "invalid-bombard",
      resolutionTime: 2_000,
    })).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["Bombardment requires an Artillery unit."]),
    });

    const packedOrder = order(state, artilleryUnit, [bombard]);
    expect(validateOrder(packedOrder, artilleryUnit, {
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [packedOrder],
      enemyOrders: [],
      seed: "packed-bombard",
      resolutionTime: 2_000,
    })).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["Artillery must deploy before firing."]),
    });
  });

  it("allows deploy then Bombardment, spends one supply, excludes neutral units, and records inventory effects", () => {
    const state = createDemoCampaignState(1_000);
    const artilleryUnit = state.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    const target = state.deployments.find((unit) => unit.id === "bug-drone-1")!;
    target.position = { q: -1, r: 1 };
    target.stats = { ...target.stats, defense: 2 };
    artilleryUnit.supplies = { SMALL_SUPPLY: 2 };
    const neutral = structuredClone(target);
    neutral.id = "neutral-observer";
    neutral.side = "NEUTRAL";
    neutral.currentHealth = neutral.stats.maxHealth;
    neutral.bombardmentSuppression = undefined;
    state.deployments.push(neutral);
    const artilleryOrder = order(state, artilleryUnit, [
      action("deploy-for-bombardment", "DEPLOY"),
      action("source-complete-bombardment", "BOMBARDMENT", { targetHex: { ...target.position } }),
    ]);
    state.orders = [artilleryOrder];

    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [artilleryOrder],
      enemyOrders: [],
      seed: "source-complete-bombardment",
      resolutionTime: 2_000,
    });

    expect(output.state.deployments.find((unit) => unit.id === artilleryUnit.id)).toMatchObject({
      artilleryDeployment: "DEPLOYED",
      supplies: { SMALL_SUPPLY: 1 },
    });
    expect(output.state.deployments.find((unit) => unit.id === target.id)?.bombardmentSuppression?.stacks).toBe(1);
    expect(output.state.deployments.find((unit) => unit.id === neutral.id)?.bombardmentSuppression).toBeUndefined();
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_BOMBARDED",
      actor: artilleryUnit.id,
      payload: expect.objectContaining({
        smallSupplyBefore: 2,
        smallSupplySpent: 1,
        smallSupplyAfter: 1,
        affectedTargetIds: expect.not.arrayContaining([neutral.id]),
      }),
    }));
  });

  it("rejects the experimental ground-damage Attack without consuming ammunition or Small Supply", () => {
    const state = createDemoCampaignState(1_000);
    const artilleryUnit = state.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    const target = state.deployments.find((unit) => unit.id === "bug-drone-1")!;
    artilleryUnit.artilleryDeployment = "DEPLOYED";
    artilleryUnit.statuses = ["DEPLOYED"];
    const attack = action("experimental-ground-attack", "ATTACK", { targetDeploymentId: target.id });
    const artilleryOrder = order(state, artilleryUnit, [attack]);
    const ammunitionBefore = structuredClone(artilleryUnit.ammunition);
    const smallSupplyBefore = artilleryUnit.supplies?.SMALL_SUPPLY;
    const validation = validateOrder(artilleryOrder, artilleryUnit, {
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [artilleryOrder],
      enemyOrders: [],
      seed: "experimental-ground-attack",
      resolutionTime: 2_000,
    });

    expect(validation).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([expect.stringMatching(/direct-damage only an Orbital.*experimental barrage/i)]),
    });
    state.orders = [artilleryOrder];
    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [artilleryOrder],
      enemyOrders: [],
      seed: "experimental-ground-attack",
      resolutionTime: 2_000,
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: artilleryUnit.id,
      payload: expect.objectContaining({ reasons: expect.arrayContaining([expect.stringMatching(/experimental barrage/i)]) }),
    }));
    expect(output.events).not.toContainEqual(expect.objectContaining({ type: "DICE_ROLLED", actor: artilleryUnit.id }));
    expect(output.state.deployments.find((unit) => unit.id === artilleryUnit.id)).toMatchObject({
      ammunition: ammunitionBefore,
      supplies: { SMALL_SUPPLY: smallSupplyBefore },
    });
  });
});

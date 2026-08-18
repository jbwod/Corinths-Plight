import { describe, expect, it } from "vitest";
import type { CampaignDeployment, RoundInput, StructuredAction, UnitOrder } from "../../domain/src";
import {
  calculateRouteCost,
  createDemoCampaignState,
  createSeededRandom,
  getActionDefinition,
  getTacticalActionRule,
  getTacticalUnitClass,
  hexDistance,
  createScenarioCampaignState,
  IRON_RAIN_SCENARIO_CONTENT_KEY,
  resolveTacticalCover,
  resolveAttackRoll,
  resolveRound,
  validateOrder,
} from "../src";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getActionDefinition(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(state: ReturnType<typeof createDemoCampaignState>, unit: CampaignDeployment, actions: StructuredAction[]): UnitOrder {
  return {
    id: `order:${unit.id}:${actions.map((item) => item.type).join("-")}`,
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

function input(orders: UnitOrder[]): RoundInput {
  const state = createDemoCampaignState(1_000);
  state.orders = orders;
  return { previousState: state, rulesetVersion: state.rulesetVersion, playerOrders: orders, enemyOrders: [], seed: "42", resolutionTime: 2_000 };
}

describe("equipment and transport actions", () => {
  it("lands and rearms at Kestrel airfield, then takes off before moving", () => {
    const fighterSource = createDemoCampaignState(1_000).deployments
      .find((deployment) => deployment.definitionId === "unit-aerospace-fighter")!;
    const landingState = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      scenarioContentKey: IRON_RAIN_SCENARIO_CONTENT_KEY,
      campaignId: "iron-rain-flight-ops",
      campaignName: "Operation Iron Rain",
      planetName: "Corinth",
      now: 1_000,
      durationMs: 300_000,
      alliedDeployments: [{
        ...structuredClone(fighterSource),
        id: "iron-rain-fighter",
        campaignId: "iron-rain-flight-ops",
        position: { q: 0, r: 0 },
        ammunition: { "weapon-fighter-snub-hmg": 0 },
        statuses: [],
      }],
    });
    const fighter = landingState.deployments.find((deployment) => deployment.id === "iron-rain-fighter")!;
    const landAndRearm = order(landingState, fighter, [
      action("fighter-land", "LAND"),
      action("fighter-rearm", "REARM_AEROSPACE"),
    ]);
    landingState.orders = [landAndRearm];

    const landed = resolveRound({
      previousState: landingState,
      rulesetVersion: landingState.rulesetVersion,
      playerOrders: [landAndRearm],
      enemyOrders: [],
      seed: "flight-ops",
      resolutionTime: 2_000,
    });
    expect(landed.state.deployments.find((deployment) => deployment.id === fighter.id)).toMatchObject({
      statuses: ["LANDED"],
      ammunition: { "weapon-fighter-snub-hmg": 1 },
    });
    expect(landed.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "AEROSPACE_LANDED",
      "AEROSPACE_REARMED",
    ]));

    const takeOffState = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      scenarioContentKey: IRON_RAIN_SCENARIO_CONTENT_KEY,
      campaignId: "iron-rain-takeoff",
      campaignName: "Operation Iron Rain",
      planetName: "Corinth",
      now: 3_000,
      durationMs: 300_000,
      alliedDeployments: [{
        ...structuredClone(fighterSource),
        id: "iron-rain-fighter",
        campaignId: "iron-rain-takeoff",
        position: { q: 0, r: 0 },
        statuses: ["LANDED"],
      }],
    });
    const groundedFighter = takeOffState.deployments.find((deployment) => deployment.id === "iron-rain-fighter")!;
    const takeOff = order(takeOffState, groundedFighter, [action("fighter-takeoff", "TAKE_OFF")]);
    takeOff.orderType = "ADVANCE";
    takeOff.route = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    takeOff.endHex = { q: 1, r: 0 };
    takeOffState.orders = [takeOff];

    const airborne = resolveRound({
      previousState: takeOffState,
      rulesetVersion: takeOffState.rulesetVersion,
      playerOrders: [takeOff],
      enemyOrders: [],
      seed: "flight-ops-takeoff",
      resolutionTime: 4_000,
    });
    expect(airborne.state.deployments.find((deployment) => deployment.id === groundedFighter.id)).toMatchObject({
      statuses: [],
      position: { q: 1, r: 0 },
    });
    expect(airborne.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_TOOK_OFF",
      actor: groundedFighter.id,
    }));
  });

  it("lands, rearms, persists, and takes off an Aerospace Bomber at a compatible airfield", () => {
    const bomberSource = createDemoCampaignState(1_000).deployments
      .find((deployment) => deployment.definitionId === "unit-aerospace-bomber")!;
    const landingState = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      scenarioContentKey: IRON_RAIN_SCENARIO_CONTENT_KEY,
      campaignId: "iron-rain-bomber-ops",
      campaignName: "Operation Iron Rain",
      planetName: "Corinth",
      now: 1_000,
      durationMs: 300_000,
      alliedDeployments: [{
        ...structuredClone(bomberSource),
        id: "iron-rain-bomber",
        campaignId: "iron-rain-bomber-ops",
        position: { q: 0, r: 0 },
        ammunition: { "weapon-bomber-ordnance": 0 },
        statuses: ["REARM_REQUIRED"],
      }],
    });
    const bomber = landingState.deployments.find((deployment) => deployment.id === "iron-rain-bomber")!;
    const landAndRearm = order(landingState, bomber, [
      action("bomber-land", "LAND"),
      action("bomber-rearm", "REARM_AEROSPACE"),
    ]);
    landingState.orders = [landAndRearm];

    const landed = resolveRound({
      previousState: landingState,
      rulesetVersion: landingState.rulesetVersion,
      playerOrders: [landAndRearm],
      enemyOrders: [],
      seed: "bomber-flight-ops",
      resolutionTime: 2_000,
    });
    expect(landed.state.deployments.find((deployment) => deployment.id === bomber.id)).toMatchObject({
      statuses: ["LANDED"],
      ammunition: { "weapon-bomber-ordnance": 1 },
    });
    expect(landed.state.deployments.find((deployment) => deployment.id === bomber.id)?.statuses)
      .not.toContain("REARM_REQUIRED");
    expect(landed.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "AEROSPACE_LANDED", actor: bomber.id }),
      expect.objectContaining({
        type: "AEROSPACE_REARMED",
        actor: bomber.id,
        payload: expect.objectContaining({
          ammunitionBefore: { "weapon-bomber-ordnance": 0 },
          ammunitionAfter: { "weapon-bomber-ordnance": 1 },
          rulesDecisionId: "RC-V5-023",
        }),
      }),
    ]));
    expect(landed.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: bomber.persistentUnitId,
      payload: expect.objectContaining({ ammunition: { "weapon-bomber-ordnance": 1 } }),
    }));

    const takeOffState = structuredClone(landed.state);
    takeOffState.phase = "PLANNING";
    takeOffState.outcome = undefined;
    takeOffState.orders = [];
    const landedBomber = takeOffState.deployments.find((deployment) => deployment.id === bomber.id)!;
    const takeOff = order(takeOffState, landedBomber, [action("bomber-takeoff", "TAKE_OFF")]);
    takeOff.orderType = "ADVANCE";
    takeOff.route = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    takeOff.endHex = { q: 1, r: 0 };
    takeOffState.orders = [takeOff];

    const airborne = resolveRound({
      previousState: takeOffState,
      rulesetVersion: takeOffState.rulesetVersion,
      playerOrders: [takeOff],
      enemyOrders: [],
      seed: "bomber-flight-ops-takeoff",
      resolutionTime: 4_000,
    });
    expect(airborne.state.deployments.find((deployment) => deployment.id === bomber.id)).toMatchObject({
      statuses: [],
      position: { q: 1, r: 0 },
    });
    expect(airborne.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_TOOK_OFF",
      actor: bomber.id,
    }));
  });

  it("makes an intercepted Bomber lose its ground-only ordnance attack when it has no legal Fighter target", () => {
    const state = createDemoCampaignState(1_000);
    const fighter = state.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    const bomber = state.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const infantry = state.deployments.find((deployment) => deployment.id === "dep-rook-7")!;
    state.deployments = [fighter, bomber, infantry];
    fighter.position = { q: 0, r: 0 };
    fighter.facing = 2;
    bomber.side = "ENEMY";
    bomber.ownerId = "enemy-doctrine";
    bomber.position = { q: -1, r: 0 };
    infantry.position = { q: 0, r: 0 };

    const intercept = order(state, fighter, [action("fighter-intercept", "ATTACK", {
      targetDeploymentId: bomber.id,
    })]);
    const bombingRun = order(state, bomber, [action("bomber-ground-run", "ATTACK", {
      targetDeploymentId: infantry.id,
    })]);
    bombingRun.orderType = "ADVANCE";
    bombingRun.route = [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }];
    bombingRun.endHex = { q: 1, r: 0 };
    bombingRun.facing = 2;
    state.orders = [intercept, bombingRun];

    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [intercept],
      enemyOrders: [bombingRun],
      seed: "interceptor",
      resolutionTime: 2_000,
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_INTERCEPTED",
      actor: bomber.id,
      payload: expect.objectContaining({ interceptorId: fighter.id, rulesDecisionId: "RC-V5-028" }),
    }));
    expect(output.events).not.toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: bomber.id,
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: bomber.id,
      payload: expect.objectContaining({
        targetId: infantry.id,
        rulesDecisionId: "RC-V5-028",
        reasons: [expect.stringMatching(/no legal interceptor target/i)],
      }),
    }));
  });

  it("air drops manifested Infantry from a Heavy Air Transport on a clear straight flight path", () => {
    const state = createDemoCampaignState(1_000);
    const hat = state.deployments.find((deployment) => deployment.id === "dep-atlas-1")!;
    const passenger = state.deployments.find((deployment) => deployment.id === "dep-raven-drop")!;
    const dropOrder = order(state, hat, [action("hat-clear-drop", "AIRDROP", {
      targetDeploymentId: passenger.id,
      targetHex: { q: -2, r: -2 },
      payload: { cargoDeploymentId: passenger.id },
    })]);
    dropOrder.orderType = "ADVANCE";
    dropOrder.route = [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -1, r: -2 }];
    dropOrder.endHex = { q: -1, r: -2 };
    state.orders = [dropOrder];

    const output = resolveRound({ ...input([dropOrder]), previousState: state });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_COMPLETED",
      actor: hat.id,
      payload: expect.objectContaining({
        cargoDeploymentId: passenger.id,
        targetHex: { q: -2, r: -2 },
        speedCostQuarters: 0,
      }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === hat.id)).toMatchObject({
      position: { q: -1, r: -2 },
      cargo: [],
    });
    expect(output.state.deployments.find((deployment) => deployment.id === passenger.id)).toMatchObject({
      locationState: "ON_MAP",
      position: { q: -2, r: -2 },
    });
  });

  it("keeps HAT cargo embarked when a hazardous or bent-path drop fails", () => {
    const state = createDemoCampaignState(1_000);
    const hat = state.deployments.find((deployment) => deployment.id === "dep-atlas-1")!;
    const passenger = state.deployments.find((deployment) => deployment.id === "dep-raven-drop")!;
    const dropOrder = order(state, hat, [action("hat-hazard-drop", "AIRDROP", {
      targetDeploymentId: passenger.id,
      targetHex: { q: -2, r: -1 },
      payload: { cargoDeploymentId: passenger.id },
    })]);
    dropOrder.orderType = "ADVANCE";
    dropOrder.route = [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -2, r: -1 }];
    dropOrder.endHex = { q: -2, r: -1 };
    state.orders = [dropOrder];

    const output = resolveRound({ ...input([dropOrder]), previousState: state });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_FAILED",
      actor: hat.id,
      payload: expect.objectContaining({ cargoDeploymentId: passenger.id, hazardous: true }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === passenger.id)?.locationState).toBe("EMBARKED");
    expect(output.state.deployments.find((deployment) => deployment.id === hat.id)?.cargo)
      .toContainEqual(expect.objectContaining({ unitId: passenger.id }));
  });

  it("enforces the Fighter travel-path arc and consumes its one-shot ammunition only when firing", () => {
    const blockedState = createDemoCampaignState(1_000);
    const blockedFighter = blockedState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    const blockedTarget = blockedState.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    blockedTarget.position = { q: -3, r: -2 };
    const blockedOrder = order(blockedState, blockedFighter, [action("fighter-rear-shot", "ATTACK", {
      targetDeploymentId: blockedTarget.id,
    })]);
    blockedState.orders = [blockedOrder];

    const blocked = resolveRound({ ...input([blockedOrder]), previousState: blockedState });
    expect(blocked.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: blockedFighter.id,
      payload: expect.objectContaining({
        targetId: blockedTarget.id,
        reasons: [expect.stringMatching(/forward 180-degree/i)],
      }),
    }));
    expect(blocked.state.deployments.find((deployment) => deployment.id === blockedFighter.id)?.ammunition)
      .toEqual({ "weapon-fighter-snub-hmg": 1 });

    const firingState = createDemoCampaignState(1_000);
    const firingFighter = firingState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    const firingTarget = firingState.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    firingTarget.position = { q: -1, r: -3 };
    const firingOrder = order(firingState, firingFighter, [action("fighter-forward-shot", "ATTACK", {
      targetDeploymentId: firingTarget.id,
    })]);
    firingState.orders = [firingOrder];

    const fired = resolveRound({ ...input([firingOrder]), previousState: firingState });
    expect(fired.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: firingFighter.id,
      payload: expect.objectContaining({ weaponId: "weapon-fighter-snub-hmg", targetId: firingTarget.id }),
    }));
    expect(fired.state.deployments.find((deployment) => deployment.id === firingFighter.id)?.ammunition)
      .toEqual({ "weapon-fighter-snub-hmg": 0 });
  });

  it("requires the Bomber route to cross its target and consumes one ordnance on a legal run", () => {
    const blockedState = createDemoCampaignState(1_000);
    const blockedBomber = blockedState.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const blockedTarget = blockedState.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    blockedTarget.position = { q: 0, r: -3 };
    const blockedOrder = order(blockedState, blockedBomber, [action("bomber-missed-run", "ATTACK", {
      targetDeploymentId: blockedTarget.id,
    })]);
    blockedState.orders = [blockedOrder];

    const blocked = resolveRound({ ...input([blockedOrder]), previousState: blockedState });
    expect(blocked.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: blockedBomber.id,
      payload: expect.objectContaining({
        targetId: blockedTarget.id,
        reasons: [expect.stringMatching(/flight path/i)],
      }),
    }));
    expect(blocked.state.deployments.find((deployment) => deployment.id === blockedBomber.id)?.ammunition)
      .toEqual({ "weapon-bomber-ordnance": 1 });

    const bombingState = createDemoCampaignState(1_000);
    const bomber = bombingState.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const target = bombingState.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    target.position = { q: 0, r: -3 };
    const bombingOrder = order(bombingState, bomber, [action("bomber-legal-run", "ATTACK", {
      targetDeploymentId: target.id,
    })]);
    bombingOrder.orderType = "ADVANCE";
    bombingOrder.route = [{ q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 }];
    bombingOrder.endHex = { q: 1, r: -3 };
    bombingOrder.facing = 2;
    bombingState.orders = [bombingOrder];

    const bombed = resolveRound({ ...input([bombingOrder]), previousState: bombingState });
    expect(bombed.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: bomber.id,
      payload: expect.objectContaining({ weaponId: "weapon-bomber-ordnance", targetId: target.id }),
    }));
    expect(bombed.state.deployments.find((deployment) => deployment.id === bomber.id)?.position).toEqual({ q: 1, r: -3 });
    expect(bombed.state.deployments.find((deployment) => deployment.id === bomber.id)?.ammunition)
      .toEqual({ "weapon-bomber-ordnance": 0 });
    expect(bombed.state.deployments.find((deployment) => deployment.id === bomber.id)?.statuses)
      .toContain("REARM_REQUIRED");
  });

  it("rejects a stationary Bomber attack and an aerospace ordnance target without spending ammunition", () => {
    const stationaryState = createDemoCampaignState(1_000);
    const stationaryBomber = stationaryState.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const groundTarget = stationaryState.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    groundTarget.position = { ...stationaryBomber.position };
    const stationaryOrder = order(stationaryState, stationaryBomber, [action("bomber-stationary-run", "ATTACK", {
      targetDeploymentId: groundTarget.id,
    })]);
    stationaryState.orders = [stationaryOrder];

    const stationary = resolveRound({ ...input([stationaryOrder]), previousState: stationaryState });
    expect(stationary.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: stationaryBomber.id,
      payload: expect.objectContaining({ reasons: [expect.stringMatching(/advance/i)] }),
    }));
    expect(stationary.state.deployments.find((deployment) => deployment.id === stationaryBomber.id)?.ammunition)
      .toEqual({ "weapon-bomber-ordnance": 1 });

    const airTargetState = createDemoCampaignState(1_000);
    const bomber = airTargetState.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const fighter = airTargetState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    fighter.position = { q: 0, r: -3 };
    const airTargetOrder = order(airTargetState, bomber, [action("bomber-air-target", "ATTACK", {
      targetDeploymentId: fighter.id,
    })]);
    airTargetOrder.orderType = "ADVANCE";
    airTargetOrder.route = [{ q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 }];
    airTargetOrder.endHex = { q: 1, r: -3 };
    airTargetState.orders = [airTargetOrder];

    const airTarget = resolveRound({ ...input([airTargetOrder]), previousState: airTargetState });
    expect(airTarget.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: bomber.id,
      payload: expect.objectContaining({ reasons: [expect.stringMatching(/ground unit/i)] }),
    }));
    expect(airTarget.state.deployments.find((deployment) => deployment.id === bomber.id)?.ammunition)
      .toEqual({ "weapon-bomber-ordnance": 1 });
  });

  it("uses the Bomber's actually traversed path when final-hex capacity stops the sortie", () => {
    const state = createDemoCampaignState(1_000);
    const bomber = state.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const target = state.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    const targetPosition = { q: 1, r: -3 };
    target.position = targetPosition;
    const targetCapacity = state.map.find((hex) =>
      hex.coord.q === targetPosition.q && hex.coord.r === targetPosition.r
    )!.capacity;
    const blockers = state.deployments
      .filter((deployment) => deployment.id !== bomber.id && deployment.id !== target.id)
      .slice(0, targetCapacity - 1);
    for (const blocker of blockers) blocker.position = targetPosition;

    const bombingOrder = order(state, bomber, [action("bomber-capacity-blocked-run", "ATTACK", {
      targetDeploymentId: target.id,
    })]);
    bombingOrder.orderType = "ADVANCE";
    bombingOrder.route = [{ q: -1, r: -3 }, { q: 0, r: -3 }, targetPosition];
    bombingOrder.endHex = targetPosition;
    state.orders = [bombingOrder];

    const output = resolveRound({ ...input([bombingOrder]), previousState: state });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_BLOCKED",
      actor: bomber.id,
      payload: expect.objectContaining({ reason: "HEX_CAPACITY" }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: bomber.id,
      payload: expect.objectContaining({ reasons: [expect.stringMatching(/flight path/i)] }),
    }));
    expect(output.events).not.toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: bomber.id,
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === bomber.id)).toMatchObject({
      position: { q: 0, r: -3 },
      ammunition: { "weapon-bomber-ordnance": 1 },
    });
  });


  it("deploys and packs Artillery using the governed half-Speed Standard Action", () => {
    const deployState = createDemoCampaignState(1_000);
    const artillery = deployState.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    expect(artillery.statuses).toEqual(["PACKED"]);
    const deployRule = getTacticalActionRule("DEPLOY");
    const deployOrder = order(deployState, artillery, [action("deploy-artillery", "DEPLOY")]);
    deployState.orders = [deployOrder];

    const deployed = resolveRound({ ...input([deployOrder]), previousState: deployState });
    expect(deployed.state.deployments.find((deployment) => deployment.id === artillery.id)?.statuses).toEqual(["DEPLOYED"]);
    expect(deployed.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_DEPLOYED",
      actor: artillery.id,
      payload: expect.objectContaining({ speedCost: deployRule.speedCost, toStatus: "DEPLOYED" }),
    }));

    const packState = createDemoCampaignState(1_000);
    const deployedArtillery = packState.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    deployedArtillery.statuses = ["DEPLOYED"];
    deployedArtillery.artilleryDeployment = "DEPLOYED";
    const packRule = getTacticalActionRule("PACK_UP");
    const packOrder = order(packState, deployedArtillery, [action("pack-artillery", "PACK_UP")]);
    packState.orders = [packOrder];
    const packed = resolveRound({ ...input([packOrder]), previousState: packState });
    expect(packed.state.deployments.find((deployment) => deployment.id === deployedArtillery.id)?.statuses).toEqual(["PACKED"]);
    expect(packed.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_PACKED",
      actor: deployedArtillery.id,
      payload: expect.objectContaining({ speedCost: packRule.speedCost, toStatus: "PACKED" }),
    }));
  });

  it("lets an adjacent Engineer dig in deployed stationary Artillery for +2 Defense", () => {
    const base = createDemoCampaignState(1_000);
    const engineer = base.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    const artillery = base.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    const hostile = base.deployments.find((deployment) => deployment.side === "ENEMY")!;
    artillery.statuses = ["DEPLOYED"];
    artillery.artilleryDeployment = "DEPLOYED";
    const supplyBefore = engineer.supplies?.SMALL_SUPPLY;
    const fortify = order(base, engineer, [action("dig-in-artillery", "ARTILLERY_DIG_IN", {
      targetDeploymentId: artillery.id,
    })]);
    base.orders = [fortify];

    const output = resolveRound({ ...input([fortify]), previousState: base });
    const resolvedArtillery = output.state.deployments.find((deployment) => deployment.id === artillery.id)!;
    const resolvedEngineer = output.state.deployments.find((deployment) => deployment.id === engineer.id)!;
    expect(resolvedArtillery.statuses).toContain("DUG_IN");
    expect(resolvedEngineer.supplies?.SMALL_SUPPLY).toBe(supplyBefore);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_DUG_IN",
      actor: engineer.id,
      payload: expect.objectContaining({
        targetId: artillery.id,
        defenseModifier: 2,
        speedCost: 0.5,
        method: "ENGINEER_ARTILLERY_POSITION",
        conflictId: "RC-V5-025",
      }),
    }));

    hostile.position = { q: -4, r: 2 };
    const calculation = resolveAttackRoll(
      hostile,
      resolvedArtillery,
      hostile.weapons[0]!,
      output.state.map,
      createSeededRandom("artillery-dig-in-defense"),
    );
    expect(calculation.digInDefense).toBe(2);

    const packed = createDemoCampaignState(1_000);
    const packedEngineer = packed.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    const packedArtillery = packed.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    const invalid = order(packed, packedEngineer, [action("dig-in-packed-artillery", "ARTILLERY_DIG_IN", {
      targetDeploymentId: packedArtillery.id,
    })]);
    expect(validateOrder(invalid, packedEngineer, {
      ...input([invalid]),
      previousState: packed,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining(["The Artillery unit must already be deployed."]) });
  });

  it("moves the maximum same-resource partial transfer into Artillery stock", () => {
    const base = createDemoCampaignState(1_000);
    const logi = base.deployments.find((deployment) => deployment.definitionId === "unit-logi-truck")!;
    const artillery = base.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    artillery.supplies = { SMALL_SUPPLY: 1 };
    const rule = getTacticalActionRule("RESUPPLY");
    const resupply: StructuredAction = {
      id: "resupply-longbow",
      type: "RESUPPLY",
      economy: rule.economy,
      speedCost: rule.speedCost,
      targetDeploymentId: artillery.id,
      equipmentIds: [],
    };
    const resupplyOrder = order(base, logi, [resupply]);
    base.orders = [resupplyOrder];

    const output = resolveRound({ ...input([resupplyOrder]), previousState: base });
    expect(output.state.deployments.find((deployment) => deployment.id === logi.id)?.supplies?.SMALL_SUPPLY).toBe(4);
    expect(output.state.deployments.find((deployment) => deployment.id === artillery.id)?.supplies?.SMALL_SUPPLY).toBe(2);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "SUPPLY_TRANSFERRED",
      actor: logi.id,
      payload: expect.objectContaining({
        targetId: artillery.id,
        resourceType: "SMALL_SUPPLY",
        quantity: 1,
        sourceRemaining: 4,
        targetAfter: 2,
        purpose: "SAME_RESOURCE_TRANSFER",
        applicationRule: "SAME_RESOURCE_PARTIAL_TRANSFER_NO_AMMO_CONVERSION",
      }),
    }));

    const full = createDemoCampaignState(1_000);
    const fullLogi = full.deployments.find((deployment) => deployment.definitionId === "unit-logi-truck")!;
    const fullArtillery = full.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    const rejectedOrder = order(full, fullLogi, [{ ...resupply, targetDeploymentId: fullArtillery.id }]);
    full.orders = [rejectedOrder];
    const rejected = resolveRound({ ...input([rejectedOrder]), previousState: full });
    expect(rejected.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: fullLogi.id,
      payload: expect.objectContaining({ reasons: ["Destination Supply capacity is full."] }),
    }));
  });

  it("bombards a spotted radius, spends Small Supply, and recovers suppression after fire stops", () => {
    const base = createDemoCampaignState(1_000);
    const artillery = base.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    const target = base.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    artillery.statuses = ["DEPLOYED"];
    artillery.artilleryDeployment = "DEPLOYED";
    artillery.supplies = { SMALL_SUPPLY: 2 };
    target.position = { q: -1, r: 1 };
    target.stats = { ...target.stats, defense: 2 };
    const bombardRule = getTacticalActionRule("BOMBARDMENT");
    const bombardAction: StructuredAction = {
      id: "bombard-drone",
      type: "BOMBARDMENT",
      economy: bombardRule.economy,
      speedCost: bombardRule.speedCost,
      targetHex: { ...target.position },
      equipmentIds: [],
    };
    const bombardOrder = order(base, artillery, [bombardAction]);
    base.orders = [bombardOrder];

    const bombarded = resolveRound({ ...input([bombardOrder]), previousState: base });
    const resolvedArtillery = bombarded.state.deployments.find((deployment) => deployment.id === artillery.id)!;
    const suppressedTarget = bombarded.state.deployments.find((deployment) => deployment.id === target.id)!;
    expect(resolvedArtillery.supplies?.SMALL_SUPPLY).toBe(1);
    expect(suppressedTarget.bombardmentSuppression).toEqual({ stacks: 1, lastAppliedRound: base.round });
    expect(bombarded.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "ARTILLERY_BOMBARDED", actor: artillery.id }),
      expect.objectContaining({
        type: "BOMBARDMENT_APPLIED",
        payload: expect.objectContaining({ targetId: target.id, stacksAfter: 1, defenseAfter: 1 }),
      }),
    ]));

    const recoveryState = structuredClone(bombarded.state);
    recoveryState.round += 1;
    recoveryState.phase = "PLANNING";
    recoveryState.orders = [];
    const recovered = resolveRound({
      previousState: recoveryState,
      rulesetVersion: recoveryState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "bombardment-recovery",
      resolutionTime: 3_000,
    });
    expect(recovered.state.deployments.find((deployment) => deployment.id === target.id)?.bombardmentSuppression).toBeUndefined();
    expect(recovered.events).toContainEqual(expect.objectContaining({
      type: "BOMBARDMENT_RECOVERED",
      actor: target.id,
      payload: expect.objectContaining({ stacksAfter: 0, defenseAfter: 2 }),
    }));
  });

  it("requires paired carrier/cargo actions and loads deterministically", () => {
    const base = createDemoCampaignState(1_000);
    const carrier = base.deployments[0];
    const cargo = base.deployments[2];
    cargo.position = { ...carrier.position };
    carrier.cargoProfile = {
      id: "cargo-test", capacitySlotsQuarters: 4, allowMixedLoadGroups: true,
      embarkFlatSpeedCostQuarters: 2, disembarkFlatSpeedCostQuarters: 2,
      rules: [{ id: "personnel", cargoKind: "PERSONNEL", requiredTags: ["PERSONNEL"], quantityPerSlot: 4 }],
    };
    const orders = [
      order(base, carrier, [action("load-carrier", "LOAD", { targetDeploymentId: cargo.id })]),
      order(base, cargo, [action("load-cargo", "LOAD", { targetDeploymentId: carrier.id })]),
    ];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({ type: "CARGO_LOADED", actor: carrier.id }));
    expect(output.state.deployments.find((unit) => unit.id === cargo.id)?.locationState).toBe("EMBARKED");
    expect(output.state.deployments.find((unit) => unit.id === carrier.id)?.cargo?.[0].unitId).toBe(cargo.id);
  });

  it("loads infantry into a governed Logi profile, carries it during movement, and unloads into available capacity", () => {
    const base = createDemoCampaignState(1_000);
    const carrier = base.deployments.find((unit) => unit.definitionId === "unit-logi-truck")!;
    const passenger = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    passenger.position = { ...carrier.position };
    expect(carrier.cargoProfile?.id).toBe("cargo-logi-two-slot");

    const loadOrders = [
      order(base, carrier, [action("load-carrier", "LOAD", { targetDeploymentId: passenger.id })]),
      order(base, passenger, [action("load-passenger", "LOAD", { targetDeploymentId: carrier.id })]),
    ];
    base.orders = loadOrders;
    const loaded = resolveRound({ ...input(loadOrders), previousState: base });
    const loadedCarrier = loaded.state.deployments.find((unit) => unit.id === carrier.id)!;
    const loadedPassenger = loaded.state.deployments.find((unit) => unit.id === passenger.id)!;
    expect(loadedCarrier.cargo).toContainEqual(expect.objectContaining({
      unitId: passenger.id,
      kind: "PERSONNEL",
      quantity: passenger.currentHealth,
    }));
    expect(loadedPassenger.locationState).toBe("EMBARKED");

    const movingState = structuredClone(loaded.state);
    movingState.round += 1;
    movingState.phase = "PLANNING";
    const destination = { q: -4, r: 1 };
    const carrierMove = {
      ...order(movingState, movingState.deployments.find((unit) => unit.id === carrier.id)!, []),
      orderType: "ADVANCE" as const,
      route: [{ ...carrier.position }, destination],
      endHex: destination,
    };
    const passengerHold = order(movingState, movingState.deployments.find((unit) => unit.id === passenger.id)!, []);
    movingState.orders = [carrierMove, passengerHold];
    const moved = resolveRound({
      previousState: movingState,
      rulesetVersion: movingState.rulesetVersion,
      playerOrders: [carrierMove, passengerHold],
      enemyOrders: [],
      seed: "cargo-move",
      resolutionTime: 3_000,
    });
    expect(moved.state.deployments.find((unit) => unit.id === carrier.id)?.position).toEqual(destination);
    expect(moved.state.deployments.find((unit) => unit.id === passenger.id)?.position).toEqual(destination);

    const unloadState = structuredClone(moved.state);
    unloadState.round += 1;
    unloadState.phase = "PLANNING";
    const unloadCarrier = unloadState.deployments.find((unit) => unit.id === carrier.id)!;
    const unloadPassenger = unloadState.deployments.find((unit) => unit.id === passenger.id)!;
    const unloadOrders = [
      order(unloadState, unloadCarrier, [action("unload-carrier", "UNLOAD", {
        targetDeploymentId: unloadPassenger.id,
        targetHex: destination,
      })]),
      order(unloadState, unloadPassenger, [action("unload-passenger", "UNLOAD", { targetDeploymentId: unloadCarrier.id })]),
    ];
    unloadState.orders = unloadOrders;
    const unloaded = resolveRound({
      previousState: unloadState,
      rulesetVersion: unloadState.rulesetVersion,
      playerOrders: unloadOrders,
      enemyOrders: [],
      seed: "cargo-unload",
      resolutionTime: 4_000,
    });
    expect(unloaded.state.deployments.find((unit) => unit.id === passenger.id)?.locationState).toBe("ON_MAP");
    expect(unloaded.state.deployments.find((unit) => unit.id === carrier.id)?.cargo).toEqual([
      expect.objectContaining({ kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5 }),
    ]);
    expect(unloaded.events).toContainEqual(expect.objectContaining({ type: "CARGO_UNLOADED", actor: carrier.id }));
  });

  it("treats a Light Vehicle as Logi cargo when both units have transport profiles", () => {
    const base = createDemoCampaignState(1_000);
    const logi = base.deployments.find((unit) => unit.definitionId === "unit-logi-truck")!;
    logi.supplies = { SMALL_SUPPLY: 0 };
    const lightVehicle = base.deployments.find((unit) => unit.definitionId === "unit-light-vehicle")!;
    lightVehicle.position = { ...logi.position };
    const orders = [
      order(base, logi, [action("logi-load-vehicle", "LOAD", { targetDeploymentId: lightVehicle.id })]),
      order(base, lightVehicle, [action("vehicle-board-logi", "LOAD", { targetDeploymentId: logi.id })]),
    ];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });

    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.cargo).toContainEqual(
      expect.objectContaining({ unitId: lightVehicle.id, kind: "VEHICLE", quantity: 1 }),
    );
    expect(output.state.deployments.find((unit) => unit.id === lightVehicle.id)?.locationState).toBe("EMBARKED");
    expect(output.events.filter((event) => event.type === "CARGO_LOADED")).toEqual([
      expect.objectContaining({ actor: logi.id }),
    ]);
  });

  it("loads one full infantry squad into the governed IFV compartment", () => {
    const base = createDemoCampaignState(1_000);
    const ifv = base.deployments.find((unit) => unit.definitionId === "unit-infantry-fighting-vehicle")!;
    const infantry = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    infantry.position = { ...ifv.position };
    expect(ifv.cargoProfile).toMatchObject({
      id: "cargo-ifv-infantry",
      capacitySlotsQuarters: 4,
      rules: [expect.objectContaining({ quantityPerSlot: 6 })],
    });
    const orders = [
      order(base, ifv, [action("ifv-load-infantry", "LOAD", { targetDeploymentId: infantry.id })]),
      order(base, infantry, [action("infantry-board-ifv", "LOAD", { targetDeploymentId: ifv.id })]),
    ];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.state.deployments.find((unit) => unit.id === ifv.id)?.cargo).toContainEqual(
      expect.objectContaining({ unitId: infantry.id, kind: "PERSONNEL", quantity: 6 }),
    );
    expect(output.state.deployments.find((unit) => unit.id === infantry.id)?.locationState).toBe("EMBARKED");
  });

  it("counts onboard Small Supply against Logi capacity before loading units", () => {
    const base = createDemoCampaignState(1_000);
    const logi = base.deployments.find((unit) => unit.definitionId === "unit-logi-truck")!;
    const firstSquad = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const secondSquad = structuredClone(firstSquad);
    secondSquad.id = "dep-second-squad";
    secondSquad.callsign = "ROOK-8";
    firstSquad.position = { ...logi.position };
    secondSquad.position = { ...logi.position };
    base.deployments.push(secondSquad);
    const orders = [
      order(base, logi, [
        action("logi-load-first", "LOAD", { targetDeploymentId: firstSquad.id }),
        action("logi-load-second", "LOAD", { targetDeploymentId: secondSquad.id }),
      ]),
      order(base, firstSquad, [action("first-load-logi", "LOAD", { targetDeploymentId: logi.id })]),
      order(base, secondSquad, [action("second-load-logi", "LOAD", { targetDeploymentId: logi.id })]),
    ];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });
    const manifest = output.state.deployments.find((unit) => unit.id === logi.id)?.cargo ?? [];
    expect(manifest).toContainEqual(expect.objectContaining({
      kind: "SUPPLY",
      supplyType: "SMALL_SUPPLY",
      quantity: 5,
    }));
    expect(manifest.filter((item) => item.unitId)).toHaveLength(1);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: logi.id,
      payload: expect.objectContaining({ reasons: [expect.stringContaining("capacity exceeded")] }),
    }));
  });

  it("hitches packed Artillery to Logi, moves it, and unhitches without consuming cargo slots", () => {
    const base = createDemoCampaignState(1_000);
    const logi = base.deployments.find((unit) => unit.definitionId === "unit-logi-truck")!;
    const artillery = base.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    artillery.position = { ...logi.position };
    const hitchOrders = [
      order(base, logi, [action("logi-hitch", "LOAD", { targetDeploymentId: artillery.id })]),
      order(base, artillery, [action("artillery-hitch", "LOAD", { targetDeploymentId: logi.id })]),
    ];
    base.orders = hitchOrders;
    const hitched = resolveRound({ ...input(hitchOrders), previousState: base });
    const hitchedLogi = hitched.state.deployments.find((unit) => unit.id === logi.id)!;
    expect(hitchedLogi.towedUnitId).toBe(artillery.id);
    expect(hitchedLogi.cargo).toContainEqual(expect.objectContaining({
      unitId: artillery.id,
      transportMode: "TOWED",
    }));
    expect(hitched.events).toContainEqual(expect.objectContaining({
      type: "CARGO_LOADED",
      actor: logi.id,
      payload: expect.objectContaining({ transportMode: "TOWED" }),
    }));

    const movingState = structuredClone(hitched.state);
    movingState.round += 1;
    movingState.phase = "PLANNING";
    const movingLogi = movingState.deployments.find((unit) => unit.id === logi.id)!;
    const destination = { q: -4, r: 1 };
    const moveOrder = {
      ...order(movingState, movingLogi, []),
      orderType: "ADVANCE" as const,
      route: [{ ...movingLogi.position }, destination],
      endHex: destination,
    };
    movingState.orders = [moveOrder];
    const moved = resolveRound({
      previousState: movingState,
      rulesetVersion: movingState.rulesetVersion,
      playerOrders: [moveOrder],
      enemyOrders: [],
      seed: "tow-move",
      resolutionTime: 3_000,
    });
    expect(moved.state.deployments.find((unit) => unit.id === artillery.id)?.position).toEqual(destination);

    const unloadState = structuredClone(moved.state);
    unloadState.round += 1;
    unloadState.phase = "PLANNING";
    const unloadLogi = unloadState.deployments.find((unit) => unit.id === logi.id)!;
    const unloadArtillery = unloadState.deployments.find((unit) => unit.id === artillery.id)!;
    const unhitchOrders = [
      order(unloadState, unloadLogi, [action("logi-unhitch", "UNLOAD", {
        targetDeploymentId: unloadArtillery.id,
        targetHex: destination,
      })]),
      order(unloadState, unloadArtillery, [action("artillery-unhitch", "UNLOAD", { targetDeploymentId: unloadLogi.id })]),
    ];
    unloadState.orders = unhitchOrders;
    const unhitched = resolveRound({
      previousState: unloadState,
      rulesetVersion: unloadState.rulesetVersion,
      playerOrders: unhitchOrders,
      enemyOrders: [],
      seed: "tow-unhitch",
      resolutionTime: 4_000,
    });
    expect(unhitched.state.deployments.find((unit) => unit.id === logi.id)?.towedUnitId).toBeUndefined();
    expect(unhitched.state.deployments.find((unit) => unit.id === artillery.id)?.locationState).toBe("ON_MAP");
    expect(unhitched.events).toContainEqual(expect.objectContaining({
      type: "CARGO_UNLOADED",
      actor: logi.id,
      payload: expect.objectContaining({ transportMode: "TOWED" }),
    }));
  });

  it("does not treat deployed Artillery as ordinary personnel cargo", () => {
    const base = createDemoCampaignState(1_000);
    const logi = base.deployments.find((unit) => unit.definitionId === "unit-logi-truck")!;
    const artillery = base.deployments.find((unit) => unit.definitionId === "unit-artillery")!;
    artillery.position = { ...logi.position };
    artillery.artilleryDeployment = "DEPLOYED";
    artillery.statuses = ["DEPLOYED"];
    const orders = [
      order(base, logi, [action("logi-invalid-hitch", "LOAD", { targetDeploymentId: artillery.id })]),
      order(base, artillery, [action("artillery-invalid-hitch", "LOAD", { targetDeploymentId: logi.id })]),
    ];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.cargo)
      .not.toContainEqual(expect.objectContaining({ unitId: artillery.id }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: logi.id,
      payload: expect.objectContaining({ reasons: [expect.stringContaining("packed")] }),
    }));
  });

  it("reloads finite ammunition from Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.weapons = [{ id: "test-ammo", name: "Test", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, ammoCapacity: 3, tags: [] }];
    unit.ammunition = { "test-ammo": 1 };
    unit.supplies = { SMALL_SUPPLY: 2 };
    const orders = [order(base, unit, [action("reload", "RELOAD", { weaponId: "test-ammo" })])];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({ type: "WEAPON_RELOADED", actor: unit.id }));
    expect(output.state.deployments[0].ammunition["test-ammo"]).toBe(3);
    expect(output.state.deployments[0].supplies?.SMALL_SUPPLY).toBe(1);
  });

  it("does not translate a legacy strategic SMALL key into tactical Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.weapons = [{ id: "test-ammo", name: "Test", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, ammoCapacity: 3, tags: [] }];
    unit.ammunition = { "test-ammo": 1 };
    unit.supplies = { SMALL: 2 };
    const orders = [order(base, unit, [action("reload", "RELOAD", { weaponId: "test-ammo" })])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: unit.id,
      payload: expect.objectContaining({ reasons: ["Insufficient reload supply."] }),
    }));
    expect(output.state.deployments[0].ammunition["test-ammo"]).toBe(1);
  });

  it("resolves Combat Medic First Aid and persists health and Medical Supply", () => {
    const base = createDemoCampaignState(1_000);
    const target = base.deployments[0];
    target.persistentUnitId = "force-rook-test";
    target.currentHealth = 2;
    const medicDefinition = getTacticalUnitClass("unit-combat-medic");
    const medic: CampaignDeployment = {
      ...structuredClone(target),
      id: "dep-doc-7",
      persistentUnitId: "force-doc-test",
      definitionId: medicDefinition.id,
      callsign: "DOC-7",
      stats: medicDefinition.stats,
      currentHealth: medicDefinition.stats.maxHealth,
      weapons: medicDefinition.weapons,
      ammunition: {},
      equipmentIds: [],
      supplies: { MEDICAL_SUPPLY: medicDefinition.stats.maxHealth },
    };
    base.deployments.push(medic);
    const healRule = getTacticalActionRule("HEAL");
    const healAction: StructuredAction = {
      id: "heal-rook",
      type: "HEAL",
      economy: healRule.economy,
      speedCost: healRule.speedCost,
      targetDeploymentId: target.id,
      equipmentIds: [],
    };
    const orders = [order(base, medic, [healAction])];
    base.orders = orders;

    const output = resolveRound({
      ...input(orders),
      previousState: base,
      seed: "medic-first-aid",
    });

    const healedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    const resolvedMedic = output.state.deployments.find((unit) => unit.id === medic.id)!;
    expect(healedTarget.currentHealth).toBeGreaterThan(2);
    expect(healedTarget.currentHealth).toBeLessThanOrEqual(target.stats.maxHealth);
    expect(resolvedMedic.supplies?.MEDICAL_SUPPLY).toBe(3);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_HEALED",
      actor: medic.id,
      payload: expect.objectContaining({ targetId: target.id, before: 2, after: healedTarget.currentHealth }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: target.persistentUnitId,
        payload: expect.objectContaining({ currentHealth: healedTarget.currentHealth }),
      }),
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: medic.persistentUnitId,
        payload: expect.objectContaining({ supplies: { MEDICAL_SUPPLY: 3 } }),
      }),
    ]));
  });

  it("restores Medical Supply to current Medic FS using one Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const medicDefinition = getTacticalUnitClass("unit-combat-medic");
    const medic: CampaignDeployment = {
      ...structuredClone(base.deployments[0]),
      id: "dep-doc-reload",
      persistentUnitId: "force-doc-reload",
      definitionId: medicDefinition.id,
      callsign: "DOC-R",
      stats: medicDefinition.stats,
      currentHealth: 3,
      weapons: [],
      ammunition: {},
      equipmentIds: [],
      supplies: { MEDICAL_SUPPLY: 1, SMALL_SUPPLY: 1 },
    };
    base.deployments.push(medic);
    const reloadRule = getTacticalActionRule("RELOAD");
    const reloadAction: StructuredAction = {
      id: "reload-medical-supply",
      type: "RELOAD",
      economy: reloadRule.economy,
      speedCost: reloadRule.speedCost,
      equipmentIds: [],
    };
    const orders = [order(base, medic, [reloadAction])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });
    const resolvedMedic = output.state.deployments.find((unit) => unit.id === medic.id)!;

    expect(resolvedMedic.supplies).toMatchObject({ MEDICAL_SUPPLY: 3, SMALL_SUPPLY: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "MEDICAL_SUPPLY_RELOADED",
      actor: medic.id,
      payload: expect.objectContaining({
        medicalSupplyBefore: 1,
        medicalSupplyAfter: 3,
        smallSupplySpent: 1,
      }),
    }));
  });

  it("resolves Engineer Repair and persists the vehicle and Small Supply state", () => {
    const base = createDemoCampaignState(1_000);
    const target = base.deployments[0];
    target.persistentUnitId = "force-bellator-test";
    target.stats = { ...target.stats, healthModel: "HITS", maxHealth: 3 };
    target.currentHealth = 2;
    target.subsystems = [{
      subsystemId: "mobility",
      state: "DISABLED",
      damageSourceId: "bug-heavy",
      damagedRound: 2,
    }];

    const engineerDefinition = getTacticalUnitClass("unit-engineers");
    const engineer: CampaignDeployment = {
      ...structuredClone(target),
      id: "dep-anvil-test",
      persistentUnitId: "force-anvil-test",
      definitionId: engineerDefinition.id,
      callsign: "ANVIL",
      stats: engineerDefinition.stats,
      currentHealth: engineerDefinition.stats.maxHealth,
      weapons: [],
      ammunition: {},
      subsystems: [],
      equipmentIds: [],
      supplies: { SMALL_SUPPLY: 4 },
    };
    base.deployments.push(engineer);
    const repairRule = getTacticalActionRule("REPAIR");
    const repairAction: StructuredAction = {
      id: "repair-bellator-mobility",
      type: "REPAIR",
      economy: repairRule.economy,
      speedCost: repairRule.speedCost,
      targetDeploymentId: target.id,
      payload: { repairKind: "SUBSYSTEM", subsystemId: "mobility" },
      equipmentIds: [],
    };
    const orders = [order(base, engineer, [repairAction])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });
    const resolvedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    const resolvedEngineer = output.state.deployments.find((unit) => unit.id === engineer.id)!;

    expect(resolvedTarget.currentHealth).toBe(2);
    expect(resolvedTarget.subsystems).toEqual([{ subsystemId: "mobility", state: "OPERATIONAL" }]);
    expect(resolvedEngineer.supplies?.SMALL_SUPPLY).toBe(3);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: engineer.id,
      payload: expect.objectContaining({
        targetId: target.id,
        repairKind: "SUBSYSTEM",
        subsystemId: "mobility",
      }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: target.persistentUnitId,
        payload: expect.objectContaining({
          currentHealth: 2,
          subsystems: [{ subsystemId: "mobility", state: "OPERATIONAL" }],
        }),
      }),
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: engineer.persistentUnitId,
        payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 3 } }),
      }),
    ]));
  });

  it("repairs one vehicle subsystem during a stationary Armor-exposed Crew Repair round", () => {
    const base = createDemoCampaignState(1_000);
    const carrier = base.deployments.find((unit) => unit.definitionId === "unit-infantry-fighting-vehicle")!;
    const hostile = base.deployments.find((unit) => unit.side === "ENEMY")!;
    carrier.position = { q: 0, r: 0 };
    carrier.subsystems = [{ subsystemId: "MOBILITY", state: "DISABLED", damageSourceId: hostile.id, damagedRound: 17 }];
    hostile.position = { q: 1, r: 0 };
    hostile.weapons = [{
      id: "weapon-crew-exposure-probe",
      name: "Exposure Probe",
      damage: { count: 1, sides: 2, modifier: 0 },
      range: 1,
      armorPiercing: 0,
      tags: [],
    }];
    const crewRepair = action("crew-repair-mobility", "CREW_REPAIR", {
      payload: { subsystemId: "MOBILITY" },
    });
    const crewOrder = order(base, carrier, [crewRepair]);
    const hostileAttack = action("attack-exposed-crew", "ATTACK", { targetDeploymentId: carrier.id });
    const hostileOrder = order(base, hostile, [hostileAttack]);
    base.orders = [crewOrder, hostileOrder];

    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [crewOrder],
      enemyOrders: [hostileOrder],
      seed: "crew-repair-exposure",
      resolutionTime: 2_000,
    });
    const repaired = output.state.deployments.find((unit) => unit.id === carrier.id)!;

    expect(repaired.subsystems).toEqual([{ subsystemId: "MOBILITY", state: "OPERATIONAL" }]);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: carrier.id,
      payload: expect.objectContaining({
        targetId: carrier.id,
        repairMethod: "CREW",
        subsystemId: "MOBILITY",
        armorBenefitThisRound: false,
        conflictId: "RC-V5-024",
      }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_ATTACKED",
      actor: hostile.id,
      payload: expect.objectContaining({
        targetId: carrier.id,
        armor: 0,
        crewRepairArmorExposed: true,
      }),
    }));
    expect(output.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: carrier.persistentUnitId,
      payload: expect.objectContaining({
        subsystems: [{ subsystemId: "MOBILITY", state: "OPERATIONAL" }],
      }),
    }));
  });

  it("builds a persistent Sandbag Line, spends Small Supply, and grants infantry cover", () => {
    const base = createDemoCampaignState(1_000);
    const engineer = base.deployments.find((unit) => unit.definitionId === "unit-engineers")!;
    const infantry = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const hostile = base.deployments.find((unit) => unit.side === "ENEMY")!;
    const constructRule = getTacticalActionRule("CONSTRUCT");
    const constructAction: StructuredAction = {
      id: "construct-sandbag-line",
      type: "CONSTRUCT",
      economy: constructRule.economy,
      speedCost: constructRule.speedCost,
      targetHex: { ...engineer.position },
      structureDefinitionId: "structure-sandbag-line",
      equipmentIds: [],
    };
    const constructOrder = order(base, engineer, [constructAction]);
    base.orders = [constructOrder];

    const output = resolveRound({ ...input([constructOrder]), previousState: base });
    const resolvedEngineer = output.state.deployments.find((unit) => unit.id === engineer.id)!;
    const builtHex = output.state.map.find((hex) =>
      hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r
    )!;

    expect(resolvedEngineer.supplies?.SMALL_SUPPLY).toBe(3);
    expect(builtHex.structureIds).toContainEqual(expect.stringMatching(/^structure-sandbag-line:/));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "STRUCTURE_COMPLETED",
      actor: engineer.id,
      payload: expect.objectContaining({
        structureDefinitionId: "structure-sandbag-line",
        targetHex: engineer.position,
        smallSupplySpent: 1,
      }),
    }));
    expect(output.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: engineer.persistentUnitId,
      payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 3 } }),
    }));

    infantry.position = { ...engineer.position };
    expect(resolveTacticalCover(hostile, infantry, output.state.map)).toEqual({
      armor: 1,
      sources: ["structure-sandbag-line"],
    });
  });

  it.each([
    ["structure-razor-wire", "Razor Wire", "INFANTRY", 0.5],
    ["structure-tank-traps", "Tank Traps", "VEHICLE", 1],
  ] as const)("constructs persistent %s and applies its movement penalty", (structureDefinitionId, structureName, affectedTag, expectedPenalty) => {
    const base = createDemoCampaignState(1_000);
    const engineer = base.deployments.find((unit) => unit.definitionId === "unit-engineers")!;
    const targetHex = base.map.find((hex) => hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r)!;
    const constructRule = getTacticalActionRule("CONSTRUCT");
    const constructAction: StructuredAction = {
      id: `construct-${structureDefinitionId}`,
      type: "CONSTRUCT",
      economy: constructRule.economy,
      speedCost: constructRule.speedCost,
      targetHex: { ...targetHex.coord },
      structureDefinitionId,
      equipmentIds: [],
    };
    const constructOrder = order(base, engineer, [constructAction]);
    base.orders = [constructOrder];

    const output = resolveRound({ ...input([constructOrder]), previousState: base });
    const builtHex = output.state.map.find((hex) => hex.coord.q === targetHex.coord.q && hex.coord.r === targetHex.coord.r)!;
    expect(builtHex.structureIds).toContainEqual(expect.stringMatching(new RegExp(`^${structureDefinitionId}:`)));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "STRUCTURE_COMPLETED",
      actor: engineer.id,
      payload: expect.objectContaining({ structureDefinitionId, structureName, smallSupplySpent: 1 }),
    }));
    const approach = output.state.map.find((hex) => hexDistance(hex.coord, targetHex.coord) === 1)!;
    const route = [approach.coord, targetHex.coord];
    const baseCost = calculateRouteCost(route, output.state.map).total;
    expect(calculateRouteCost(
      route,
      output.state.map,
      { unitTags: [affectedTag] },
    ).total).toBe(baseCost + expectedPenalty);
  });

  it("upgrades Sandbags into a Trench and preserves Dig In along connected Trench hexes", () => {
    const base = createDemoCampaignState(1_000);
    const infantry = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const startHex = base.map.find((hex) => hex.coord.q === infantry.position.q && hex.coord.r === infantry.position.r)!;
    startHex.structureIds.push("structure-sandbag-line:existing");
    const upgradeRule = getTacticalActionRule("TRENCH_UPGRADE");
    const upgradeAction: StructuredAction = {
      id: "upgrade-trench",
      type: "TRENCH_UPGRADE",
      economy: upgradeRule.economy,
      speedCost: upgradeRule.speedCost,
      targetHex: { ...infantry.position },
      equipmentIds: [],
    };
    const upgradeOrder = order(base, infantry, [upgradeAction]);
    base.orders = [upgradeOrder];

    const upgraded = resolveRound({ ...input([upgradeOrder]), previousState: base });
    const upgradedHex = upgraded.state.map.find((hex) =>
      hex.coord.q === infantry.position.q && hex.coord.r === infantry.position.r
    )!;
    expect(upgradedHex.structureIds).toContainEqual(expect.stringMatching(/^structure-trench:/));
    expect(upgradedHex.structureIds.some((id) => id.startsWith("structure-sandbag-line:"))).toBe(false);
    expect(upgraded.events).toContainEqual(expect.objectContaining({
      type: "STRUCTURE_UPGRADED",
      actor: infantry.id,
      payload: expect.objectContaining({
        fromStructureDefinitionId: "structure-sandbag-line",
        toStructureDefinitionId: "structure-trench",
        smallSupplySpent: 0,
      }),
    }));

    const movementState = createDemoCampaignState(3_000);
    const movingInfantry = movementState.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const destination = { q: -2, r: 1 };
    movementState.map.find((hex) => hex.coord.q === movingInfantry.position.q && hex.coord.r === movingInfantry.position.r)!
      .structureIds.push("structure-trench:start");
    movementState.map.find((hex) => hex.coord.q === destination.q && hex.coord.r === destination.r)!
      .structureIds.push("structure-trench:end");
    movingInfantry.statuses.push("DUG_IN");
    const moveOrder = order(movementState, movingInfantry, []);
    moveOrder.orderType = "ADVANCE";
    moveOrder.route = [{ ...movingInfantry.position }, destination];
    moveOrder.endHex = destination;
    movementState.orders = [moveOrder];

    const moved = resolveRound({ ...input([moveOrder]), previousState: movementState });
    expect(moved.state.deployments.find((unit) => unit.id === movingInfantry.id)?.statuses).toContain("DUG_IN");
    expect(moved.events).toContainEqual(expect.objectContaining({
      type: "UNIT_MOVED",
      actor: movingInfantry.id,
      payload: expect.objectContaining({ digInPreserved: true }),
    }));
    expect(moved.events.some((event) => event.type === "UNIT_DUG_OUT" && event.actor === movingInfantry.id)).toBe(false);
  });

  it("queues weapon malfunctions without cancelling the target's simultaneous attack", () => {
    const base = createDemoCampaignState(1_000);
    const attacker = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!);
    const target = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-main-battle-tank")!);
    attacker.id = "a-infantry";
    attacker.position = { q: -3, r: 1 };
    attacker.currentHealth = 6;
    target.id = "z-tank";
    target.side = "ENEMY";
    target.ownerId = "enemy-doctrine";
    target.position = { q: -2, r: 1 };
    target.stats = { ...target.stats, armor: 0, defense: 0 };
    target.subsystems = [
      { subsystemId: "WEAPONS", state: "OPERATIONAL" },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ];
    base.deployments = [attacker, target];
    const attackerOrder = order(base, attacker, [action("attack-tank", "ATTACK", {
      targetDeploymentId: target.id,
      weaponId: attacker.weapons[0].id,
    })]);
    const targetOrder = order(base, target, [action("return-fire", "ATTACK", {
      targetDeploymentId: attacker.id,
      weaponId: target.weapons[0].id,
    })]);
    base.orders = [attackerOrder, targetOrder];

    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackerOrder],
      enemyOrders: [targetOrder],
      seed: "subsystem-10",
      resolutionTime: 2_000,
    });
    const resolvedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;

    expect(resolvedTarget.subsystems).toEqual([
      expect.objectContaining({ subsystemId: "MOBILITY", state: "OPERATIONAL" }),
      expect.objectContaining({ subsystemId: "WEAPONS", state: "DISABLED", damageSourceId: attacker.id }),
    ]);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "SUBSYSTEM_MALFUNCTIONED",
      actor: attacker.id,
      payload: expect.objectContaining({
        targetId: target.id,
        naturalRoll: 5,
        affectedSubsystemIds: ["WEAPONS"],
      }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({ type: "UNIT_ATTACKED", actor: target.id }));
  });

  it("makes a natural-six mobility malfunction block later movement", () => {
    const base = createDemoCampaignState(1_000);
    const attacker = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!);
    const target = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-main-battle-tank")!);
    attacker.id = "a-infantry";
    attacker.position = { q: -3, r: 1 };
    attacker.currentHealth = 6;
    target.id = "z-tank";
    target.side = "ENEMY";
    target.position = { q: -2, r: 1 };
    target.stats = { ...target.stats, armor: 0, defense: 0 };
    target.subsystems = [
      { subsystemId: "WEAPONS", state: "OPERATIONAL" },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ];
    base.deployments = [attacker, target];
    const attackOrder = order(base, attacker, [action("attack-tank", "ATTACK", {
      targetDeploymentId: target.id,
      weaponId: attacker.weapons[0].id,
    })]);
    base.orders = [attackOrder];
    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackOrder],
      enemyOrders: [],
      seed: "subsystem-4",
      resolutionTime: 2_000,
    });
    const immobilisedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    expect(immobilisedTarget.subsystems).toContainEqual(expect.objectContaining({
      subsystemId: "MOBILITY",
      state: "DISABLED",
    }));

    const nextState = structuredClone(output.state);
    nextState.round += 1;
    nextState.phase = "PLANNING";
    nextState.outcome = undefined;
    const moveOrder = order(nextState, immobilisedTarget, []);
    moveOrder.round = nextState.round;
    moveOrder.orderType = "ADVANCE";
    moveOrder.route = [{ ...immobilisedTarget.position }, { q: -1, r: 1 }];
    moveOrder.endHex = { q: -1, r: 1 };
    expect(validateOrder(moveOrder, immobilisedTarget, {
      previousState: nextState,
      rulesetVersion: nextState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "next-round",
      resolutionTime: 3_000,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining(["The unit's mobility subsystem is disabled."]) });
  });

  it("uses the Light Vehicle's Rapid Fire tag to destroy a Horde through the normal attack pipeline", () => {
    const base = createDemoCampaignState(1_000);
    const vehicle = base.deployments.find((unit) => unit.definitionId === "unit-light-vehicle")!;
    const horde = base.deployments.find((unit) => unit.definitionId === "enemy-bug-drone")!;
    horde.position = { q: 0, r: -1 };
    expect(vehicle.weapons[0].tags).toContain("RAPID_FIRE");
    expect(horde.tags).toContain("HORDE");
    const attackOrder = order(base, vehicle, [action("rapid-fire", "ATTACK", {
      targetDeploymentId: horde.id,
      weaponId: vehicle.weapons[0].id,
    })]);
    base.orders = [attackOrder];

    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackOrder],
      enemyOrders: [],
      seed: "rapid-fire",
      resolutionTime: 2_000,
    });

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_ATTACKED",
      actor: vehicle.id,
      payload: expect.objectContaining({
        targetId: horde.id,
        rapidFireMultiplier: 2,
        damageResult: 4,
        healthLoss: 4,
      }),
    }));
    expect(output.state.deployments.find((unit) => unit.id === horde.id)?.status).toBe("DESTROYED");
  });

  it("applies the K-17 ridge elevation through the normal attack pipeline", () => {
    const base = createDemoCampaignState(1_000);
    const attacker = base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!;
    const target = base.deployments.find((unit) => unit.definitionId === "enemy-bug-warrior")!;
    attacker.position = { q: 1, r: 3 };
    target.position = { q: 1, r: 2 };
    expect(base.map.find((hex) => hex.coord.q === 1 && hex.coord.r === 3)?.elevation).toBe(1);
    expect(base.map.find((hex) => hex.coord.q === 1 && hex.coord.r === 2)?.elevation).toBe(0);
    const attackOrder = order(base, attacker, [action("ridge-fire", "ATTACK", {
      targetDeploymentId: target.id,
      weaponId: attacker.weapons[0].id,
    })]);
    base.orders = [attackOrder];

    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackOrder],
      enemyOrders: [],
      seed: "high-ground",
      resolutionTime: 2_000,
    });

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_ATTACKED",
      actor: attacker.id,
      payload: expect.objectContaining({
        targetId: target.id,
        highGroundModifier: 1,
      }),
    }));
  });

  it("rejects Drone until its visibility state effect is implemented", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.abilities = [{ abilityId: "ability-deploy-drone", handlerId: "DEPLOY_DRONE" }];
    const orders = [order(base, unit, [action("drone", "DEPLOY_DRONE", { targetHex: { q: 0, r: 0 } })])];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: unit.id,
      payload: expect.objectContaining({
        reasons: ["DEPLOY DRONE is catalogued but not executable in this engine version."],
      }),
    }));
    expect(output.state.deployments[0].cooldowns["ability-deploy-drone"]).toBeUndefined();
  });
});

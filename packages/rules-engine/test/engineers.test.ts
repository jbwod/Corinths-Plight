import { describe, expect, it } from "vitest";
import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";
import {
  bridgeCrossingRestriction,
  createDemoCampaignState,
  getFieldworkDefinition,
  getTacticalActionRule,
  getTacticalUnitClass,
  resolveRound,
  resolveV5BridgeAttackRoll,
  validateBridgeLifecycleOperation,
  validateFieldworkDurabilityOperation,
  V5_BRIDGE_SMALL_SUPPLY_COST,
} from "../src";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getTacticalActionRule(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(
  state: ReturnType<typeof createDemoCampaignState>,
  unit: CampaignDeployment,
  actions: StructuredAction[],
): UnitOrder {
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

function resolve(state: ReturnType<typeof createDemoCampaignState>, orders: UnitOrder[], seed: string) {
  state.orders = orders;
  return resolveRound({
    previousState: state,
    rulesetVersion: state.rulesetVersion,
    playerOrders: orders,
    enemyOrders: [],
    seed,
    resolutionTime: 2_000,
  });
}

describe("Engineer completion mechanics", () => {
  it("uses the canonical V5 non-combat chassis and resolved support-action subset", () => {
    expect(getTacticalUnitClass("unit-engineers")).toMatchObject({
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 4, armor: 0, speed: 1 },
      weapons: [],
      requisitionCost: 4,
      tags: expect.arrayContaining(["ENGINEER", "BUILDER", "REPAIR"]),
      allowedActions: ["DIG_IN", "ARTILLERY_DIG_IN", "REPAIR", "CONSTRUCT", "LOAD", "UNLOAD"],
    });
  });

  it("keeps source-complete fieldwork construction profiles exact and durability fail-closed", () => {
    expect(getFieldworkDefinition("structure-sandbag-line")).toMatchObject({
      smallSupplyCost: 1,
      constructRange: "ADJACENT_OR_CURRENT",
      movementPenalty: null,
    });
    expect(getFieldworkDefinition("structure-razor-wire")).toMatchObject({
      smallSupplyCost: 1,
      movementPenalty: { unitTag: "INFANTRY", speed: 0.5 },
    });
    expect(getFieldworkDefinition("structure-tank-traps")).toMatchObject({
      smallSupplyCost: 1,
      movementPenalty: { unitTag: "VEHICLE", speed: 1 },
    });
    expect(getFieldworkDefinition("structure-trench")).toMatchObject({ smallSupplyCost: 0 });

    for (const structureDefinitionId of [
      "structure-sandbag-line",
      "structure-razor-wire",
      "structure-tank-traps",
      "structure-trench",
    ] as const) {
      for (const operation of ["ATTACK", "REPAIR", "DESTROY"] as const) {
        expect(validateFieldworkDurabilityOperation(structureDefinitionId, operation)).toMatchObject({
          legal: false,
          structureDefinitionId,
          operation,
          decisionId: "DEC-006",
          conflictIds: ["RC-BUILD-006"],
        });
      }
    }
  });

  it("projects the source-exact cumulative Bridge damage table without activating targeting", () => {
    let state = { minorHits: 0 as const, destroyed: false };
    const miss = resolveV5BridgeAttackRoll(state, 1);
    expect(miss).toMatchObject({ legal: true, effect: "MISS", after: state });
    if (!miss.legal) throw new Error(miss.reason);

    const first = resolveV5BridgeAttackRoll(miss.after, 2);
    expect(first).toMatchObject({ legal: true, effect: "MINOR_DAMAGE", after: { minorHits: 1, destroyed: false } });
    if (!first.legal) throw new Error(first.reason);
    expect(bridgeCrossingRestriction(first.after)).toBe("NO_TANKS");

    const second = resolveV5BridgeAttackRoll(first.after, 3);
    expect(second).toMatchObject({ legal: true, effect: "MINOR_DAMAGE", after: { minorHits: 2, destroyed: false } });
    if (!second.legal) throw new Error(second.reason);
    expect(bridgeCrossingRestriction(second.after)).toBe("INFANTRY_ONLY");

    const third = resolveV5BridgeAttackRoll(second.after, 4);
    expect(third).toMatchObject({ legal: true, effect: "DESTROYED", after: { minorHits: 3, destroyed: true } });
    if (!third.legal) throw new Error(third.reason);
    expect(bridgeCrossingRestriction(third.after)).toBe("NONE");

    state = { minorHits: 0, destroyed: false };
    for (const naturalRoll of [5, 6]) {
      expect(resolveV5BridgeAttackRoll(state, naturalRoll)).toMatchObject({
        legal: true,
        effect: "DESTROYED",
        after: { destroyed: true },
      });
    }
  });

  it("rejects invalid Bridge rolls/state and all ungoverned Bridge lifecycle transitions", () => {
    expect(resolveV5BridgeAttackRoll({ minorHits: 0, destroyed: false }, 0)).toMatchObject({
      legal: false,
      reason: "Bridge attack requires one natural D6 result.",
    });
    expect(resolveV5BridgeAttackRoll({ minorHits: 3, destroyed: false }, 2)).toMatchObject({
      legal: false,
      reason: "Bridge damage state is invalid.",
    });
    expect(resolveV5BridgeAttackRoll({ minorHits: 1, destroyed: true }, 2)).toMatchObject({
      legal: false,
      reason: "Destroyed Bridges cannot be attacked again.",
    });

    expect(V5_BRIDGE_SMALL_SUPPLY_COST).toBe(2);
    expect(validateBridgeLifecycleOperation("CONSTRUCT")).toMatchObject({
      legal: false,
      knownSmallSupplyCost: 2,
      decisionId: "DEC-006",
    });
    expect(validateBridgeLifecycleOperation("ATTACK")).toMatchObject({
      legal: false,
      damageTableAvailable: true,
      conflictIds: ["RC-BUILD-006"],
    });
    expect(validateBridgeLifecycleOperation("REPAIR")).toMatchObject({
      legal: false,
      conflictIds: ["RC-BUILD-006", "RC-BUILD-007"],
    });
    expect(validateBridgeLifecycleOperation("ABANDON")).toMatchObject({ legal: false, decisionId: "DEC-006" });
  });

  it("constructs a governed fieldwork, spends one Supply, and persists the remaining stock", () => {
    const state = createDemoCampaignState(1_000);
    const engineer = state.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    engineer.persistentUnitId = "force-engineer-fieldwork";
    engineer.currentHealth = 2;
    engineer.supplies = { SMALL_SUPPLY: 4 };
    const construct = order(state, engineer, [action("construct-wire", "CONSTRUCT", {
      targetHex: engineer.position,
      structureDefinitionId: "structure-razor-wire",
    })]);
    const output = resolve(state, [construct], "engineer-fieldwork");

    expect(output.state.deployments.find((deployment) => deployment.id === engineer.id)?.supplies)
      .toEqual({ SMALL_SUPPLY: 3 });
    expect(output.state.map.find((hex) => hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r)?.structureIds)
      .toContainEqual(expect.stringMatching(/^structure-razor-wire:/));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "STRUCTURE_COMPLETED",
      actor: engineer.id,
      payload: expect.objectContaining({
        structureDefinitionId: "structure-razor-wire",
        smallSupplySpent: 1,
      }),
    }));
    expect(output.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: engineer.persistentUnitId,
      payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 3 } }),
    }));
  });

  it("constructs a Field Bridge across an authored river edge and opens the crossing", () => {
    const state = createDemoCampaignState(1_000);
    const engineer = state.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    const source = state.map.find((hex) => hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r)!;
    const target = state.map.find((hex) => hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r - 1)!;
    engineer.persistentUnitId = "force-engineer-bridge";
    engineer.supplies = { SMALL_SUPPLY: 2 };
    source.edges.rivers = [0];
    target.edges.rivers = [3];

    const construct = order(state, engineer, [action("construct-bridge", "CONSTRUCT", {
      targetHex: target.coord,
      structureDefinitionId: "structure-bridge",
    })]);
    const output = resolve(state, [construct], "engineer-bridge");
    const resolvedSource = output.state.map.find((hex) => hex.coord.q === source.coord.q && hex.coord.r === source.coord.r)!;
    const resolvedTarget = output.state.map.find((hex) => hex.coord.q === target.coord.q && hex.coord.r === target.coord.r)!;

    expect(output.state.deployments.find((deployment) => deployment.id === engineer.id)?.supplies)
      .toEqual({ SMALL_SUPPLY: 0 });
    expect(resolvedSource.edges.rivers).not.toContain(0);
    expect(resolvedTarget.edges.rivers).not.toContain(3);
    expect(resolvedSource.structureIds).toContainEqual(expect.stringMatching(/^structure-bridge:/));
    expect(resolvedTarget.structureIds).toContainEqual(expect.stringMatching(/^structure-bridge:/));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "STRUCTURE_COMPLETED",
      actor: engineer.id,
      payload: expect.objectContaining({
        structureDefinitionId: "structure-bridge",
        edgeDirection: 0,
        opensGroundCrossing: true,
        smallSupplySpent: 2,
        applicationProfileId: "public-v1-engineer-bridge@1",
      }),
    }));
  });

  it("rejects Field Bridge construction where no authored river edge exists", () => {
    const state = createDemoCampaignState(1_000);
    const engineer = state.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    const target = state.map.find((hex) => hex.coord.q === engineer.position.q && hex.coord.r === engineer.position.r - 1)!;
    engineer.supplies = { SMALL_SUPPLY: 2 };
    state.map.forEach((hex) => { hex.edges.rivers = []; });

    const construct = order(state, engineer, [action("invalid-bridge", "CONSTRUCT", {
      targetHex: target.coord,
      structureDefinitionId: "structure-bridge",
    })]);
    const output = resolve(state, [construct], "engineer-invalid-bridge");

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: engineer.id,
      payload: expect.objectContaining({
        reasons: ["A Field Bridge must join the Engineer's hex to an adjacent river-crossing hex."],
      }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === engineer.id)?.supplies)
      .toEqual({ SMALL_SUPPLY: 2 });
  });

  it("repairs exactly one lost vehicle Hit for one Small Supply and persists both units", () => {
    const state = createDemoCampaignState(1_000);
    const engineer = state.deployments.find((deployment) => deployment.definitionId === "unit-engineers")!;
    const tank = state.deployments.find((deployment) => deployment.definitionId === "unit-main-battle-tank")!;
    engineer.persistentUnitId = "force-engineer-repair";
    tank.persistentUnitId = "force-tank-repair";
    engineer.position = { ...tank.position };
    engineer.supplies = { SMALL_SUPPLY: 1 };
    tank.currentHealth = tank.stats.maxHealth - 1;
    const before = tank.currentHealth;
    const repair = order(state, engineer, [action("repair-hit", "REPAIR", {
      targetDeploymentId: tank.id,
      payload: { repairKind: "HIT" },
    })]);
    const output = resolve(state, [repair], "engineer-hit-repair");

    expect(output.state.deployments.find((deployment) => deployment.id === tank.id)?.currentHealth).toBe(before + 1);
    expect(output.state.deployments.find((deployment) => deployment.id === engineer.id)?.supplies)
      .toEqual({ SMALL_SUPPLY: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: engineer.id,
      payload: expect.objectContaining({ targetId: tank.id, repairKind: "HIT", smallSupplySpent: 1 }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: engineer.persistentUnitId, payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 0 } }) }),
      expect.objectContaining({ unitId: tank.persistentUnitId, payload: expect.objectContaining({ currentHealth: before + 1 }) }),
    ]));
  });

  it("does not grant Engineer construction authority through spoofed mutable tags", () => {
    const state = createDemoCampaignState(1_000);
    const infantry = state.deployments.find((deployment) => deployment.definitionId === "unit-infantry-squad")!;
    infantry.tags = [...(infantry.tags ?? []), "ENGINEER", "BUILDER"];
    infantry.supplies = { SMALL_SUPPLY: 1 };
    const construct = order(state, infantry, [action("spoof-construction", "CONSTRUCT", {
      targetHex: infantry.position,
      structureDefinitionId: "structure-sandbag-line",
    })]);
    const output = resolve(state, [construct], "spoofed-engineer-tags");

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: infantry.id,
      payload: expect.objectContaining({ reasons: ["Construction requires an Engineer unit."] }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === infantry.id)?.supplies)
      .toEqual({ SMALL_SUPPLY: 1 });
  });
});

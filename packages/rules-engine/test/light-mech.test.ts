import { describe, expect, it } from "vitest";
import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";

import {
  getTacticalActionRule,
  getTacticalSubsystemRules,
  getTacticalUnitClass,
  resolveRound,
  validateOrder,
} from "../src";
import { makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function governedDeployment(
  definitionId: string,
  id: string,
  position: { q: number; r: number },
  side: CampaignDeployment["side"] = "ALLIED",
): CampaignDeployment {
  const definition = getTacticalUnitClass(definitionId);
  return makeDeployment(id, position, side, {
    definitionId,
    tags: [...definition.tags],
    stats: structuredClone(definition.stats),
    weapons: structuredClone(definition.weapons),
    subsystems: definition.tags.includes("SUBSYSTEMS")
      ? [
          { subsystemId: "WEAPONS", state: "OPERATIONAL" },
          { subsystemId: "MOBILITY", state: "OPERATIONAL" },
        ]
      : undefined,
  });
}

function attackAction(id: string, targetDeploymentId: string): StructuredAction {
  const rule = getTacticalActionRule("ATTACK");
  return {
    id,
    type: "ATTACK",
    economy: rule.economy,
    speedCost: rule.speedCost,
    equipmentIds: [],
    targetDeploymentId,
  };
}

function attackOrder(
  actor: CampaignDeployment,
  target: CampaignDeployment,
  overrides: Partial<UnitOrder> = {},
): UnitOrder {
  return makeOrder(actor, {
    actions: [attackAction(`attack-${actor.id}`, target.id)],
    ...overrides,
  });
}

describe("V5 Light Mech playable mechanics", () => {
  it("materializes only the governed V5 chassis, laser, subsystem and Evasive rules", () => {
    const mech = getTacticalUnitClass("unit-light-mech");

    expect(mech).toMatchObject({
      category: "MECH",
      tags: expect.arrayContaining(["GROUND", "VEHICLE", "ARMOURED", "MECH", "SUBSYSTEMS", "EVASIVE"]),
      stats: { healthModel: "HITS", maxHealth: 2, armor: 1, speed: 4 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH", "EVASIVE"],
      allowedActions: ["ATTACK"],
      weapons: [{
        id: "weapon-light-mech-laser",
        damage: { count: 1, sides: 4, modifier: 0 },
        range: 1,
        armorPiercing: 0,
      }],
    });
    expect(mech.slots).toEqual({});
    expect(getTacticalSubsystemRules(mech.id)).toMatchObject({
      profile: {
        requiresPenetration: true,
        triggers: [
          { naturalRolls: [5], targetKind: "WEAPON", resultingState: "DISABLED" },
          { naturalRolls: [6], targetKind: "MOBILITY", resultingState: "DISABLED" },
        ],
      },
    });
  });

  it("crosses an occupied hostile formation and keeps Evasive active after the required displacement", () => {
    const mech = governedDeployment("unit-light-mech", "light-mech", { q: 0, r: 0 });
    const hostile = makeDeployment("hostile", { q: 1, r: 0 }, "ENEMY", {
      stats: { maxHealth: 20 },
      currentHealth: 20,
    });
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const order = attackOrder(mech, hostile, {
      orderType: "EVASIVE",
      route,
      endHex: route[2]!,
    });
    const state = makeState(
      [mech, hostile],
      [makeHex(0, 0), makeHex(1, 0, { capacity: 1 }), makeHex(2, 0)],
      [order],
    );

    const output = resolveRound(makeRoundInput(state, [order], [], { seed: "light-mech-passage" }));
    const mechRoll = output.events.find((event) => event.type === "DICE_ROLLED" && event.actor === mech.id);

    expect(output.state.deployments.find((unit) => unit.id === mech.id)?.position).toEqual({ q: 2, r: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_MOVED",
      actor: mech.id,
      payload: expect.objectContaining({ route }),
    }));
    expect(output.events.some((event) => event.type === "UNIT_BLOCKED" && event.actor === mech.id)).toBe(false);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "EVASIVE_MANEUVER",
      actor: mech.id,
      payload: expect.objectContaining({
        active: true,
        requiredDisplacement: 2,
        actualDisplacement: 2,
        attackModifier: -2,
        defenseModifier: 3,
      }),
    }));
    expect(mechRoll?.payload.modified).toBe(Math.max(0, Number(mechRoll?.payload.raw) - 2));
  });

  it("persists a natural-five weapon malfunction while preserving simultaneous return fire", () => {
    const infantry = governedDeployment("unit-infantry-squad", "a-infantry", { q: 0, r: 0 });
    infantry.currentHealth = 6;
    const mech = governedDeployment("unit-light-mech", "z-light-mech", { q: 1, r: 0 }, "ENEMY");
    mech.stats = { ...mech.stats, armor: 0, defense: 0 };
    const infantryOrder = attackOrder(infantry, mech);
    const mechOrder = attackOrder(mech, infantry);
    const state = makeState(
      [infantry, mech],
      [makeHex(0, 0), makeHex(1, 0)],
      [infantryOrder, mechOrder],
    );

    const output = resolveRound(makeRoundInput(state, [infantryOrder], [mechOrder], { seed: "subsystem-10" }));
    const resolvedMech = output.state.deployments.find((unit) => unit.id === mech.id)!;
    const persisted = output.persistentEffects.find((effect) =>
      effect.type === "UNIT_STATE_UPDATED" && effect.unitId === mech.persistentUnitId
    );

    expect(resolvedMech.subsystems).toEqual([
      expect.objectContaining({ subsystemId: "MOBILITY", state: "OPERATIONAL" }),
      expect.objectContaining({ subsystemId: "WEAPONS", state: "DISABLED", damageSourceId: infantry.id }),
    ]);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "SUBSYSTEM_MALFUNCTIONED",
      actor: infantry.id,
      payload: expect.objectContaining({
        targetId: mech.id,
        naturalRoll: 5,
        affectedSubsystemIds: ["WEAPONS"],
      }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({ type: "UNIT_ATTACKED", actor: mech.id }));
    expect(persisted?.payload.subsystems).toEqual(resolvedMech.subsystems);
  });

  it("persists a natural-six mobility malfunction and rejects later movement", () => {
    const infantry = governedDeployment("unit-infantry-squad", "a-infantry", { q: 0, r: 0 });
    infantry.currentHealth = 6;
    const mech = governedDeployment("unit-light-mech", "z-light-mech", { q: 1, r: 0 }, "ENEMY");
    mech.stats = { ...mech.stats, armor: 0, defense: 0 };
    const attack = attackOrder(infantry, mech);
    const state = makeState([infantry, mech], [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0)], [attack]);

    const output = resolveRound(makeRoundInput(state, [attack], [], { seed: "subsystem-4" }));
    const immobilised = output.state.deployments.find((unit) => unit.id === mech.id)!;
    const persisted = output.persistentEffects.find((effect) =>
      effect.type === "UNIT_STATE_UPDATED" && effect.unitId === mech.persistentUnitId
    );
    expect(immobilised.subsystems).toContainEqual(expect.objectContaining({
      subsystemId: "MOBILITY",
      state: "DISABLED",
      damageSourceId: infantry.id,
    }));
    expect(persisted?.payload.subsystems).toEqual(immobilised.subsystems);

    const nextState = structuredClone(output.state);
    nextState.round += 1;
    nextState.phase = "PLANNING";
    nextState.outcome = undefined;
    const move = makeOrder(immobilised, {
      round: nextState.round,
      orderType: "ADVANCE",
      route: [{ ...immobilised.position }, { q: 2, r: 0 }],
      endHex: { q: 2, r: 0 },
    });
    expect(validateOrder(move, immobilised, makeRoundInput(nextState))).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["The unit's mobility subsystem is disabled."]),
    });
  });

  it("restores a damaged Light Mech subsystem through the governed Engineer repair lifecycle", () => {
    const mech = governedDeployment("unit-light-mech", "light-mech", { q: 0, r: 0 });
    mech.subsystems = [
      { subsystemId: "WEAPONS", state: "DISABLED", damageSourceId: "bug-heavy", damagedRound: 1 },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ];
    const engineer = governedDeployment("unit-engineers", "engineer", { q: 0, r: 0 });
    engineer.supplies = { SMALL_SUPPLY: 1 };
    const rule = getTacticalActionRule("REPAIR");
    const repair = makeOrder(engineer, {
      actions: [{
        id: "repair-light-mech-weapons",
        type: "REPAIR",
        economy: rule.economy,
        speedCost: rule.speedCost,
        equipmentIds: [],
        targetDeploymentId: mech.id,
        payload: { repairKind: "SUBSYSTEM", subsystemId: "WEAPONS" },
      }],
    });
    const state = makeState([engineer, mech], [makeHex(0, 0)], [repair]);

    const output = resolveRound(makeRoundInput(state, [repair]));
    const repairedMech = output.state.deployments.find((unit) => unit.id === mech.id)!;
    const repairedEngineer = output.state.deployments.find((unit) => unit.id === engineer.id)!;

    expect(repairedMech.subsystems).toEqual([
      { subsystemId: "WEAPONS", state: "OPERATIONAL" },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ]);
    expect(repairedEngineer.supplies).toEqual({ SMALL_SUPPLY: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: engineer.id,
      payload: expect.objectContaining({
        targetId: mech.id,
        repairKind: "SUBSYSTEM",
        subsystemId: "WEAPONS",
        smallSupplySpent: 1,
      }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: mech.persistentUnitId,
        payload: expect.objectContaining({ subsystems: repairedMech.subsystems }),
      }),
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: engineer.persistentUnitId,
        payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 0 } }),
      }),
    ]));
  });
});

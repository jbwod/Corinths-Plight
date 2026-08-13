import { describe, expect, it } from "vitest";

import {
  SPECIAL_FORCES_DELAYED_CHARGE,
  SPECIAL_FORCES_QUIET_RIFLE,
  detonateSpecialForcesDelayedCharge,
  getSpecialForcesPublicV1Class,
  placeSpecialForcesDelayedCharge,
  purchaseSpecialForces,
  readSpecialForcesDelayedCharge,
  specialForcesEquipmentAllowed,
} from "../src/special-forces";
import { resolveAttackRoll } from "../src/mechanics";
import { resolveRound, validateOrder } from "../src/resolver";
import { getTacticalActionRule, getTacticalOrderRule } from "../src/tactical-grammar";
import { fixedRandom, makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function specialForces(position = { q: 0, r: 0 }) {
  const profile = getSpecialForcesPublicV1Class(3);
  return makeDeployment("sf", position, "ALLIED", {
    definitionId: profile.id,
    tags: profile.tags,
    stats: profile.stats,
    weapons: profile.weapons,
    allowedActions: profile.allowedActions as never,
    allowedOrders: profile.allowedOrders as never,
  });
}

describe("Special Forces public-v1 companion profile", () => {
  it("publishes the governed FS profile, Req hook, quiet rifle, and equipment exclusions", () => {
    const profile = getSpecialForcesPublicV1Class(4);
    expect(profile).toMatchObject({
      id: "unit-special-forces",
      requisitionCost: 8,
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 3, armor: 0, speed: 2, sensors: 4 },
      slots: { primary: 2, secondary: 2 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"],
      allowedActions: ["ATTACK", "PLACE_DELAYED_CHARGE", "DETONATE_DELAYED_CHARGE"],
    });
    expect(SPECIAL_FORCES_QUIET_RIFLE).toMatchObject({ damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0 });
    expect(purchaseSpecialForces(8)).toMatchObject({ legal: true, requisitionAfter: 0, requisitionSpent: 8 });
    expect(purchaseSpecialForces(7)).toMatchObject({ legal: false, requisitionAfter: 7, requisitionSpent: 0 });
    expect(specialForcesEquipmentAllowed("equipment-mines")).toBe(false);
    expect(specialForcesEquipmentAllowed("equipment-at-mines")).toBe(false);
    expect(specialForcesEquipmentAllowed("equipment-automated-turrets")).toBe(false);
    expect(specialForcesEquipmentAllowed("equipment-flak-vests")).toBe(true);
  });

  it("keeps the quiet rifle capped by the team's current Force Strength", () => {
    const attacker = specialForces();
    attacker.currentHealth = 2;
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", { stats: { maxHealth: 20 }, currentHealth: 20 });
    const result = resolveAttackRoll(attacker, target, SPECIAL_FORCES_QUIET_RIFLE, [makeHex(0, 0), makeHex(1, 0)], fixedRandom(4));
    expect(result).toMatchObject({ legal: true, roll: { raw: 4, capped: 2 }, damageResult: 2, healthLoss: 2 });
  });

  it("places one persistent charge only on an adjacent hostile unit or attackable structure", () => {
    const actor = specialForces();
    const hostile = makeDeployment("hostile", { q: 1, r: 0 }, "ENEMY");
    const placed = placeSpecialForcesDelayedCharge(actor, hostile, 2);
    expect(placed).toMatchObject({
      legal: true,
      charge: { targetDeploymentId: hostile.id, targetKind: "UNIT", placedRound: 2, armedFromRound: 3 },
      statusEffects: [expect.objectContaining({ status: "ACTIVE", appliedRound: 2 })],
    });
    actor.statusEffects = placed.statusEffects;
    expect(readSpecialForcesDelayedCharge(actor)).toMatchObject({ targetDeploymentId: hostile.id, armedFromRound: 3 });
    expect(placeSpecialForcesDelayedCharge(actor, hostile, 3)).toMatchObject({ legal: false, reason: expect.stringMatching(/already has/i) });
    expect(placeSpecialForcesDelayedCharge(specialForces(), makeDeployment("far", { q: 2, r: 0 }, "ENEMY"), 2))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/adjacent/i) });
    expect(placeSpecialForcesDelayedCharge(specialForces(), makeDeployment("friendly", { q: 1, r: 0 }, "ALLIED"), 2))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/hostile/i) });
    expect(placeSpecialForcesDelayedCharge(specialForces(), makeDeployment("wall", { q: 1, r: 0 }, "ENEMY", { tags: ["STRUCTURE"] }), 2))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/attackable/i) });
    expect(placeSpecialForcesDelayedCharge(specialForces(), makeDeployment("bunker", { q: 1, r: 0 }, "ENEMY", { tags: ["STRUCTURE", "ATTACKABLE"] }), 2))
      .toMatchObject({ legal: true, charge: { targetKind: "STRUCTURE" } });
  });

  it("arms at end of round and expires only after a next-or-later remote detonation", () => {
    const actor = specialForces();
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");
    actor.statusEffects = placeSpecialForcesDelayedCharge(actor, target, 1).statusEffects;
    expect(detonateSpecialForcesDelayedCharge(actor, 1)).toMatchObject({ legal: false, reason: expect.stringMatching(/next round/i) });
    const detonated = detonateSpecialForcesDelayedCharge(actor, 2);
    expect(detonated).toMatchObject({ legal: true, charge: { targetDeploymentId: target.id } });
    expect(detonated.statusEffects[0]).toMatchObject({ status: "EXPIRED" });
    expect(SPECIAL_FORCES_DELAYED_CHARGE).toMatchObject({ damage: { count: 1, sides: 6 }, armorPiercing: 2 });
  });

  it("uses the actual traversed route for Infantry Stealth and records hidden state", () => {
    expect(getTacticalOrderRule("STEALTH")).toMatchObject({ executable: true });
    const actor = specialForces();
    const observer = makeDeployment("observer", { q: 2, r: 0 }, "ENEMY", { stats: { sensors: 1 } });
    const order = makeOrder(actor, {
      orderType: "STEALTH",
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
    });
    const input = makeRoundInput(makeState([actor, observer], [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0)]), [order]);
    expect(validateOrder(order, actor, input)).toMatchObject({ legal: true });
    const output = resolveRound(input);
    expect(output.state.deployments.find((unit) => unit.id === actor.id)?.statuses).toContain("STEALTHED");
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "INFANTRY_STEALTH_RESOLVED",
      actor: actor.id,
      payload: expect.objectContaining({ route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], stealthBroken: false }),
    }));
  });

  it("places, persists, reveals, and remotely detonates a charge through the resolver", () => {
    const actor = specialForces();
    actor.statuses = ["STEALTHED"];
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", {
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 10, armor: 1, defense: 0 },
      currentHealth: 10,
    });
    const placeRule = getTacticalActionRule("PLACE_DELAYED_CHARGE");
    const placeAction = makeAction("place", {
      type: "PLACE_DELAYED_CHARGE",
      economy: placeRule.economy,
      speedCost: placeRule.speedCost,
      targetDeploymentId: target.id,
    });
    const placeOrder = makeOrder(actor, { actions: [placeAction] });
    const first = resolveRound(makeRoundInput(makeState([actor, target], [makeHex(0, 0), makeHex(1, 0)]), [placeOrder], [], { seed: "charge-placement" }));
    const chargedActor = first.state.deployments.find((unit) => unit.id === actor.id)!;
    expect(chargedActor.statuses).toEqual(expect.arrayContaining(["REVEALED"]));
    expect(chargedActor.statuses).not.toContain("STEALTHED");
    expect(readSpecialForcesDelayedCharge(chargedActor)).toMatchObject({ targetDeploymentId: target.id, armedFromRound: 2 });
    expect(first.events).toContainEqual(expect.objectContaining({ type: "DELAYED_CHARGE_PLACED", actor: actor.id }));
    expect(first.persistentEffects.find((effect) => effect.type === "UNIT_STATE_UPDATED" && effect.unitId === actor.persistentUnitId)?.payload)
      .toMatchObject({ statusEffects: [expect.objectContaining({ status: "ACTIVE" })] });

    const secondState = structuredClone(first.state);
    secondState.round = 2;
    secondState.phase = "LOCKED";
    secondState.orders = [];
    const secondActor = secondState.deployments.find((unit) => unit.id === actor.id)!;
    const detonateRule = getTacticalActionRule("DETONATE_DELAYED_CHARGE");
    const detonateAction = makeAction("detonate", {
      type: "DETONATE_DELAYED_CHARGE",
      economy: detonateRule.economy,
      speedCost: detonateRule.speedCost,
    });
    const detonateOrder = makeOrder(secondActor, { round: 2, actions: [detonateAction] });
    const second = resolveRound(makeRoundInput(secondState, [detonateOrder], [], { seed: "charge-detonation" }));
    expect(second.events).toContainEqual(expect.objectContaining({
      type: "DELAYED_CHARGE_DETONATED",
      actor: actor.id,
      payload: expect.objectContaining({ targetId: target.id, detonatedRound: 2, armorPiercing: 2 }),
    }));
    expect(second.state.deployments.find((unit) => unit.id === actor.id)?.statusEffects?.[0]?.status).toBe("EXPIRED");
    expect(second.state.deployments.find((unit) => unit.id === target.id)?.currentHealth).toBeLessThan(10);
  });
});

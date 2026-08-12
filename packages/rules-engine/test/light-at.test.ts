import { describe, expect, it } from "vitest";
import type { WeaponProfile } from "../../domain/src";
import { resolveRound, validateLightAtAttack, validateOrder } from "../src";
import { makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

const rifle: WeaponProfile = {
  id: "weapon-infantry-rifle",
  name: "Infantry Rifle",
  damage: { count: 1, sides: 6 },
  range: 2,
  armorPiercing: 0,
  tags: ["FS_CAPPED"],
};

const lightAtStore: WeaponProfile = {
  id: "weapon-light-at",
  name: "Lightweight Anti-armour Weapon",
  damage: { count: 1, sides: 6 },
  range: 1,
  armorPiercing: 1,
  ammoCapacity: 3,
  tags: ["ANTI_ARMOUR", "EQUIPMENT", "FS_CAPPED"],
};

function infantry(ammunition = 3) {
  return makeDeployment("allied-infantry", { q: 0, r: 0 }, "ALLIED", {
    definitionId: "unit-infantry-squad",
    tags: ["INFANTRY", "PERSONNEL"],
    weapons: [rifle, lightAtStore],
    ammunition: { "weapon-light-at": ammunition },
  });
}

describe("Lightweight Anti-armour attack modifier", () => {
  it("validates fitted Infantry charges, range, and remaining ammunition", () => {
    const attacker = infantry(2);
    expect(validateLightAtAttack(attacker, { q: 1, r: 0 }, 2)).toMatchObject({
      legal: true,
      charges: 2,
      armorPiercingBonus: 2,
      ammunitionAfter: 0,
    });
    expect(validateLightAtAttack(attacker, { q: 2, r: 0 }, 1)).toMatchObject({ legal: false, reason: expect.stringMatching(/Range 1/) });
    expect(validateLightAtAttack(attacker, { q: 1, r: 0 }, 3)).toMatchObject({ legal: false, reason: expect.stringMatching(/Only 2/) });
    expect(validateLightAtAttack({ ...attacker, tags: [] }, { q: 1, r: 0 }, 1)).toMatchObject({ legal: false });
    expect(validateLightAtAttack({ ...attacker, weapons: [lightAtStore] }, { q: 1, r: 0 }, 1)).toMatchObject({ legal: false, reason: expect.stringMatching(/base rifle/) });
  });

  it("adds AP to the single Infantry rifle roll and persists the spent charges", () => {
    const attacker = infantry();
    const target = makeDeployment("enemy-armour", { q: 1, r: 0 }, "ENEMY", {
      stats: { armor: 3, maxHealth: 8 },
      currentHealth: 8,
    });
    const order = makeOrder(attacker, {
      actions: [makeAction("light-at-attack", {
        type: "ATTACK",
        targetDeploymentId: target.id,
        lightAtCharges: 2,
      })],
      targets: [target.id],
    });
    const state = makeState([attacker, target], [makeHex(0, 0), makeHex(1, 0)], [order]);
    const input = makeRoundInput(state, [order], [], { seed: "light-at-replay" });

    expect(validateOrder(order, attacker, input)).toMatchObject({ legal: true });
    const first = resolveRound(input);
    const second = resolveRound(structuredClone(input));
    const dice = first.events.filter((event) => event.type === "DICE_ROLLED" && event.actor === attacker.id);

    expect(second).toEqual(first);
    expect(dice).toHaveLength(1);
    expect(dice[0]?.payload).toMatchObject({ weaponId: rifle.id, armorPiercingBonus: 2 });
    expect(first.events.find((event) => event.type === "LIGHT_AT_EXPENDED")?.payload).toMatchObject({
      chargesSpent: 2,
      armorPiercingBonus: 2,
      ammunitionBefore: 3,
      ammunitionAfter: 1,
    });
    expect(first.events.find((event) => event.type === "UNIT_ATTACKED")?.payload).toMatchObject({
      weaponId: rifle.id,
      armorPiercingBonus: 2,
      armor: 3,
      effectiveArmor: 1,
    });
    expect(first.state.deployments.find((unit) => unit.id === attacker.id)?.ammunition["weapon-light-at"]).toBe(1);
  });

  it("rejects an order that requests more charges than are available", () => {
    const attacker = infantry(1);
    const target = makeDeployment("enemy", { q: 1, r: 0 }, "ENEMY");
    const order = makeOrder(attacker, {
      actions: [makeAction("overdraw", { targetDeploymentId: target.id, lightAtCharges: 2 })],
      targets: [target.id],
    });
    const state = makeState([attacker, target], [makeHex(0, 0), makeHex(1, 0)], [order]);
    expect(validateOrder(order, attacker, makeRoundInput(state, [order])).reasons).toContain("Only 1 Light AT charge is available.");
  });
});

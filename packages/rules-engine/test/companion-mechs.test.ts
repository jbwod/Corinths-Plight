import type { CampaignDeployment, StructuredAction, WeaponProfile } from "../../domain/src";
import { describe, expect, it } from "vitest";

import {
  getCompanionMechV1Class,
  getCompanionMechWeaponProfile,
  hasLineOfSight,
  mechSightHeightBonus,
  reloadMechWeaponAtSupplyPoint,
  resolveMechCrouch,
  resolveMechCrouchCover,
  resolveRound,
  validateMechAttackActivation,
} from "../src";
import { makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

const autocannon: WeaponProfile = getCompanionMechWeaponProfile("weapon-mech-autocannon-public-v1");
const laser: WeaponProfile = getCompanionMechWeaponProfile("weapon-mech-light-laser-public-v1");

function mech(
  definitionId: "unit-medium-mech" | "unit-heavy-mech",
  id: string,
  position: CampaignDeployment["position"],
  weapons: WeaponProfile[] = [],
): CampaignDeployment {
  const definition = getCompanionMechV1Class(definitionId, 3);
  return makeDeployment(id, position, "ALLIED", {
    definitionId,
    tags: definition.tags,
    stats: definition.stats,
    weapons: weapons.map((weapon) => structuredClone(weapon)),
    allowedActions: definition.allowedActions as CampaignDeployment["allowedActions"],
    allowedOrders: definition.allowedOrders as CampaignDeployment["allowedOrders"],
  });
}

function action(id: string, overrides: Partial<StructuredAction>): StructuredAction {
  return makeAction(id, overrides);
}

describe("approved companion-v1 Medium and Heavy Mechs", () => {
  it("projects approved Hits, Armor, Speed, slots and Req with no default weapons", () => {
    expect(getCompanionMechV1Class("unit-medium-mech", 3)).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 4, armor: 2, speed: 3, sensors: 3 },
      slots: { external: 2, internal: 4 },
      requisitionCost: 14,
      weapons: [],
      allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD", "DIG_IN"],
    });
    expect(getCompanionMechV1Class("unit-heavy-mech", 3)).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 5, armor: 3, speed: 2, sensors: 3 },
      slots: { external: 3, internal: 4 },
      requisitionCost: 18,
      weapons: [],
      allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD"],
    });
  });

  it("materializes the bounded Store weapon conversion without FS-derived damage", () => {
    expect([
      getCompanionMechWeaponProfile("weapon-mech-heavy-machine-public-v1"),
      getCompanionMechWeaponProfile("weapon-mech-autocannon-public-v1"),
      getCompanionMechWeaponProfile("weapon-mech-light-laser-public-v1"),
      getCompanionMechWeaponProfile("weapon-mech-medium-laser-public-v1"),
      getCompanionMechWeaponProfile("weapon-mech-large-laser-public-v1"),
    ]).toMatchObject([
      { damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0, ammoCapacity: 4 },
      { damage: { count: 1, sides: 6 }, range: 2, armorPiercing: 2, ammoCapacity: 2 },
      { damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0, ammoCapacity: 3 },
      { damage: { count: 1, sides: 6 }, range: 2, armorPiercing: 0, ammoCapacity: 2 },
      { damage: { count: 1, sides: 8 }, range: 3, armorPiercing: 0, ammoCapacity: 1 },
    ]);
  });

  it("fires a selected fitted subset or every fitted weapon in one Primary activation", () => {
    const medium = mech("unit-medium-mech", "medium", { q: 0, r: 0 }, [autocannon, laser]);
    expect(validateMechAttackActivation({ deployment: medium, economy: "PRIMARY" })).toEqual({
      legal: true,
      reasons: [],
      weaponIds: [autocannon.id, laser.id],
    });
    expect(validateMechAttackActivation({
      deployment: medium,
      economy: "PRIMARY",
      declaredWeaponIds: [laser.id],
    })).toMatchObject({ legal: true, weaponIds: [laser.id] });
    expect(validateMechAttackActivation({
      deployment: medium,
      economy: "STANDARD",
      declaredWeaponIds: ["weapon-not-fitted"],
    })).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "Companion mech weapons fire through one Primary activation.",
        "The mech attack selected a weapon that is not fitted.",
      ]),
    });
    expect(validateMechAttackActivation({
      deployment: mech("unit-heavy-mech", "unarmed", { q: 0, r: 0 }),
      economy: "PRIMARY",
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining(["The mech has no fitted weapon to fire."]) });
  });

  it("reloads finite fitted weapons only at a friendly governed Supply Point", () => {
    const medium = mech("unit-medium-mech", "medium", { q: 0, r: 0 }, [autocannon]);
    medium.ammunition[autocannon.id] = 0;
    expect(reloadMechWeaponAtSupplyPoint({
      deployment: medium,
      weaponId: autocannon.id,
      atFriendlyGovernedSupplyPoint: false,
    })).toMatchObject({
      legal: false,
      ammunitionAfter: 0,
      reasons: ["Mech reload requires a friendly governed Supply Point."],
    });
    expect(reloadMechWeaponAtSupplyPoint({
      deployment: medium,
      weaponId: autocannon.id,
      atFriendlyGovernedSupplyPoint: true,
    })).toEqual({ legal: true, reasons: [], ammunitionBefore: 0, ammunitionAfter: 2 });
  });

  it("lets both chassis see over blocking level-1 terrain", () => {
    const map = [
      makeHex(0, 0),
      makeHex(1, 0, { elevation: 1, blocksLineOfSight: true }),
      makeHex(2, 0),
    ];
    const medium = mech("unit-medium-mech", "medium", map[0].coord);
    const heavy = mech("unit-heavy-mech", "heavy", map[0].coord);
    expect(hasLineOfSight(map[0].coord, map[2].coord, map, 3)).toBe(false);
    expect(mechSightHeightBonus(medium)).toBe(1);
    expect(hasLineOfSight(map[0].coord, map[2].coord, map, 3, {
      observerHeightBonus: mechSightHeightBonus(medium),
    })).toBe(true);
    expect(hasLineOfSight(map[0].coord, map[2].coord, map, 3, {
      observerHeightBonus: mechSightHeightBonus(heavy),
    })).toBe(true);
  });

  it("grants Medium-only non-stacking crouch cover against direct fire on blocking level-1 terrain", () => {
    const terrain = makeHex(0, 0, { terrainId: "terrain-level-one-ridge", elevation: 1, blocksLineOfSight: true });
    const medium = mech("unit-medium-mech", "medium", terrain.coord);
    const heavy = mech("unit-heavy-mech", "heavy", terrain.coord);
    expect(resolveMechCrouch(medium, true)).toEqual({ legal: true, reasons: [], status: "CROUCHED" });
    expect(resolveMechCrouch(heavy, true)).toMatchObject({ legal: false, reasons: ["Only the Medium Mech may crouch."] });
    medium.statuses.push("CROUCHED");
    heavy.statuses.push("CROUCHED");
    expect(resolveMechCrouchCover(medium, [terrain], true)).toEqual({
      armor: 1,
      sources: ["MECH_CROUCH:terrain-level-one-ridge"],
    });
    expect(resolveMechCrouchCover(medium, [terrain], false)).toEqual({ armor: 0, sources: [] });
    expect(resolveMechCrouchCover(heavy, [terrain], true)).toEqual({ armor: 0, sources: [] });
  });

  it("resolves selected multiweapon fire, crouch lifecycle and governed reload through the server", () => {
    const ridge = makeHex(0, 0, {
      terrainId: "terrain-level-one-ridge",
      elevation: 1,
      blocksLineOfSight: true,
      control: "ALLIED",
      environment: ["SUPPLY_POINT"],
    });
    const targetHex = makeHex(1, 0);
    const medium = mech("unit-medium-mech", "medium", ridge.coord, [autocannon, laser]);
    medium.ammunition[autocannon.id] = 1;
    const target = makeDeployment("target", targetHex.coord, "ENEMY", {
      stats: { healthModel: "HITS", maxHealth: 8, armor: 0, defense: 0 },
      currentHealth: 8,
    });
    const fire = makeOrder(medium, {
      actions: [action("mech-fire", {
        type: "ATTACK",
        economy: "PRIMARY",
        speedCost: 0,
        targetDeploymentId: target.id,
        weaponIds: [autocannon.id, laser.id],
      })],
      targets: [target.id],
    });
    const fired = resolveRound(makeRoundInput(makeState([medium, target], [ridge, targetHex], [fire]), [fire]));
    expect(fired.events.filter((event) =>
      event.type === "DICE_ROLLED" &&
      event.actor === medium.id &&
      event.payload.actionId === "mech-fire"
    ).map((event) => event.payload.weaponId)).toEqual([autocannon.id, laser.id]);

    const crouching = mech("unit-medium-mech", "crouching", ridge.coord, [autocannon]);
    const crouch = makeOrder(crouching, {
      actions: [action("crouch", { type: "DIG_IN", economy: "STANDARD", speedCost: 1 })],
    });
    const crouched = resolveRound(makeRoundInput(makeState([crouching], [ridge], [crouch]), [crouch]));
    expect(crouched.state.deployments[0].statuses).toContain("CROUCHED");
    expect(crouched.events).toContainEqual(expect.objectContaining({
      type: "UNIT_DUG_IN",
      actor: crouching.id,
      payload: expect.objectContaining({ stance: "MECH_CROUCH" }),
    }));

    const empty = mech("unit-heavy-mech", "empty", ridge.coord, [autocannon]);
    empty.ammunition[autocannon.id] = 0;
    const reload = makeOrder(empty, {
      actions: [action("reload", {
        type: "RELOAD",
        economy: "STANDARD",
        speedCost: 0.5,
        weaponId: autocannon.id,
      })],
    });
    const reloaded = resolveRound(makeRoundInput(makeState([empty], [ridge], [reload]), [reload]));
    expect(reloaded.state.deployments[0].ammunition[autocannon.id]).toBe(2);
    expect(reloaded.events).toContainEqual(expect.objectContaining({
      type: "WEAPON_RELOADED",
      payload: expect.objectContaining({ facilityCapability: "SUPPLY_POINT", supplySpent: 0 }),
    }));
  });
});

import type { StructuredAction, WeaponProfile } from "../../domain/src";
import { describe, expect, it } from "vitest";
import { equipment, getUnitClass } from "../src/catalogue";
import {
  advanceBuildProgress,
  canEquip,
  canTarget,
  consumeAmmo,
  resolveAttackRoll,
  tickCooldowns,
  transferSupply,
  validateSpeedBudget,
} from "../src/mechanics";
import {
  baseWeapon,
  fixedRandom,
  makeAction,
  makeDeployment,
  makeEquipment,
  makeHex,
} from "./fixtures";

describe("speed and action economy", () => {
  it("charges movement and Standard Actions but not a single Primary or Incidental Action", () => {
    const stats = { ...getUnitClass("unit-light-vehicle").stats, speed: 4 };
    const actions: StructuredAction[] = [
      makeAction("standard", { economy: "STANDARD", speedCost: 0.5 }),
      makeAction("primary", { economy: "PRIMARY", speedCost: 99, type: "SCAN" }),
      makeAction("incidental", { economy: "INCIDENTAL", speedCost: 99, type: "RELOAD" }),
    ];

    expect(validateSpeedBudget(stats, 3.5, actions)).toEqual({
      legal: true,
      spent: 4,
      available: 4,
    });
  });

  it("rejects overspend and more than one Primary Action", () => {
    const stats = { ...getUnitClass("unit-infantry-squad").stats, speed: 1 };

    expect(
      validateSpeedBudget(stats, 0.75, [
        makeAction("cost", { economy: "STANDARD", speedCost: 0.5 }),
      ]),
    ).toMatchObject({ legal: false, spent: 1.25, available: 1 });
    expect(
      validateSpeedBudget(stats, 0, [
        makeAction("primary-a", { economy: "PRIMARY" }),
        makeAction("primary-b", { economy: "PRIMARY" }),
      ]),
    ).toMatchObject({ legal: false, spent: 0, available: 1 });
  });

  it("rejects negative Standard Action costs instead of increasing the budget", () => {
    const stats = { ...getUnitClass("unit-infantry-squad").stats, speed: 1 };
    const result = validateSpeedBudget(stats, 1.5, [
      makeAction("negative", { economy: "STANDARD", speedCost: -1 }),
    ]);

    expect(result.legal).toBe(false);
    expect(result.spent).toBeGreaterThanOrEqual(1.5);
  });
});

describe("target legality", () => {
  const openMap = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0)];

  it("rejects destroyed, friendly, out-of-range, empty-ammo, and cooling-down attacks", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");

    const destroyedAttacker = structuredClone(attacker);
    destroyedAttacker.status = "DESTROYED";
    expect(canTarget(destroyedAttacker, target, baseWeapon, openMap)).toMatchObject({ legal: false });

    const friendly = structuredClone(target);
    friendly.side = "ALLIED";
    expect(canTarget(attacker, friendly, baseWeapon, openMap)).toMatchObject({
      legal: false,
      reason: "Friendly fire is not enabled.",
    });

    const shortWeapon = { ...baseWeapon, range: 0 };
    expect(canTarget(attacker, target, shortWeapon, openMap)).toMatchObject({
      legal: false,
      reason: "Target is outside weapon range.",
    });

    const limitedWeapon = { ...baseWeapon, id: "limited", ammoCapacity: 1 };
    attacker.ammunition[limitedWeapon.id] = 0;
    expect(canTarget(attacker, target, limitedWeapon, openMap)).toMatchObject({
      legal: false,
      reason: "Weapon has no ammunition.",
    });

    attacker.ammunition[limitedWeapon.id] = 1;
    attacker.cooldowns[limitedWeapon.id] = 2;
    expect(canTarget(attacker, target, limitedWeapon, openMap)).toMatchObject({
      legal: false,
      reason: "Weapon is cooling down.",
    });
  });

  it("rejects fire while the weapon subsystem is disabled", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 });
    attacker.subsystems = [{ subsystemId: "WEAPONS", state: "DISABLED" }];
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY");

    expect(canTarget(attacker, target, baseWeapon, openMap)).toEqual({
      legal: false,
      reason: "The unit's weapon systems are disabled.",
    });
  });

  it("blocks direct fire through terrain while allowing an indirect profile", () => {
    const map = [
      makeHex(0, 0),
      makeHex(1, 0, { blocksLineOfSight: true }),
      makeHex(2, 0),
    ];
    const attacker = makeDeployment("attacker", { q: 0, r: 0 });
    const target = makeDeployment("target", { q: 2, r: 0 }, "ENEMY");
    const spotter = makeDeployment("spotter", { q: 2, r: 0 });

    expect(canTarget(attacker, target, baseWeapon, map)).toMatchObject({
      legal: false,
      reason: "Line of sight is blocked.",
    });
    expect(canTarget(attacker, target, { ...baseWeapon, indirect: true }, map, [spotter])).toEqual({ legal: true });
  });

  it("requires an indirect-fire target to be spotted by a friendly observer", () => {
    const map = [
      makeHex(0, 0),
      makeHex(1, 0, { blocksLineOfSight: true }),
      makeHex(2, 0, { visibility: "UNKNOWN" }),
    ];
    const attacker = makeDeployment("artillery", { q: 0, r: 0 });
    const target = makeDeployment("unspotted-target", { q: 2, r: 0 }, "ENEMY");

    expect(canTarget(attacker, target, { ...baseWeapon, indirect: true }, map)).toMatchObject({
      legal: false,
      reason: expect.stringMatching(/spot/i),
    });
  });
});

describe("armor, AP, rear arcs, Hits, and FS caps", () => {
  const map = [makeHex(0, -1), makeHex(0, 0), makeHex(0, 1), makeHex(1, 0)];
  const cannon: WeaponProfile = {
    ...baseWeapon,
    id: "cannon",
    armorPiercing: 1,
  };

  it("requires damage to exceed combined effective Armor and Defense", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: -1 });
    const target = makeDeployment("target", { q: 0, r: 0 }, "ENEMY", {
      facing: 0,
      stats: { healthModel: "HITS", maxHealth: 3, armor: 3, defense: 0 },
      currentHealth: 3,
    });

    const bounced = resolveAttackRoll(attacker, target, cannon, map, fixedRandom(2));
    expect(bounced).toMatchObject({
      legal: true,
      effectiveArmor: 2,
      threshold: 2,
      penetrated: false,
      healthLoss: 0,
    });

    const penetrating = resolveAttackRoll(
      attacker,
      target,
      { ...cannon, armorPiercing: 3 },
      map,
      fixedRandom(2),
    );
    expect(penetrating).toMatchObject({
      effectiveArmor: 0,
      penetrated: true,
      healthLoss: 1,
    });
  });

  it("uses active bombardment stacks to reduce Defense without going below zero", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: -1 });
    const target = makeDeployment("target", { q: 0, r: 0 }, "ENEMY", {
      facing: 0,
      stats: { healthModel: "HITS", maxHealth: 3, armor: 0, defense: 3 },
      currentHealth: 3,
      bombardmentSuppression: { stacks: 2, lastAppliedRound: 4 },
    });

    expect(resolveAttackRoll(attacker, target, cannon, map, fixedRandom(2))).toMatchObject({
      targetDefense: 1,
      threshold: 1,
      penetrated: true,
    });
  });

  it("ignores Armor and dug-in Defense from the direct rear", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 1 });
    const target = makeDeployment("target", { q: 0, r: 0 }, "ENEMY", {
      facing: 0,
      statuses: ["DUG_IN"],
      stats: { healthModel: "HITS", maxHealth: 3, armor: 5, defense: 2 },
      currentHealth: 3,
    });

    const result = resolveAttackRoll(attacker, target, cannon, map, fixedRandom(1));

    expect(result).toMatchObject({
      rearAttack: true,
      targetArmor: 5,
      effectiveArmor: 0,
      targetDefense: 0,
      threshold: 0,
      penetrated: true,
      healthLoss: 1,
    });
  });

  it("caps personnel attack damage at current attacker FS", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 }, "ALLIED", {
      currentHealth: 2,
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6 },
    });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", {
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6 },
      currentHealth: 6,
    });

    const result = resolveAttackRoll(attacker, target, baseWeapon, map, fixedRandom(6));

    expect(result.roll).toEqual({ raw: 6, modified: 6, capped: 2 });
    expect(result.healthLoss).toBe(2);
  });

  it("doubles a Rapid Fire damage result against Horde before mitigation", () => {
    const attacker = makeDeployment("rapid", { q: 0, r: 0 }, "ALLIED", {
      tags: ["VEHICLE", "RAPID_FIRE"],
      stats: { healthModel: "HITS", maxHealth: 2 },
      currentHealth: 2,
    });
    const horde = makeDeployment("horde", { q: 1, r: 0 }, "ENEMY", {
      tags: ["PERSONNEL", "HORDE"],
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 8, armor: 0, defense: 1 },
      currentHealth: 8,
    });
    const ordinary = structuredClone(horde);
    ordinary.id = "ordinary";
    ordinary.tags = ["PERSONNEL"];

    const rapidWeapon = { ...baseWeapon, tags: ["RAPID_FIRE"] };
    expect(resolveAttackRoll(attacker, horde, rapidWeapon, map, fixedRandom(3))).toMatchObject({
      roll: { raw: 3, modified: 3, capped: 3 },
      rapidFireMultiplier: 2,
      damageResult: 6,
      threshold: 1,
      healthLoss: 5,
    });
    expect(resolveAttackRoll(attacker, ordinary, rapidWeapon, map, fixedRandom(3))).toMatchObject({
      rapidFireMultiplier: 1,
      damageResult: 3,
      healthLoss: 2,
    });
  });

  it("still converts a Rapid Fire penetration against a Hits target to one Hit", () => {
    const attacker = makeDeployment("rapid", { q: 0, r: 0 }, "ALLIED", {
      tags: ["RAPID_FIRE"],
    });
    const target = makeDeployment("horde-vehicle", { q: 1, r: 0 }, "ENEMY", {
      tags: ["HORDE", "VEHICLE"],
      stats: { healthModel: "HITS", maxHealth: 4, armor: 0, defense: 0 },
      currentHealth: 4,
    });

    expect(resolveAttackRoll(attacker, target, { ...baseWeapon, tags: ["RAPID_FIRE"] }, map, fixedRandom(4))).toMatchObject({
      rapidFireMultiplier: 2,
      damageResult: 8,
      healthLoss: 1,
    });
  });

  it("converts any positive penetration against a vehicle to exactly one Hit", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", {
      stats: { healthModel: "HITS", maxHealth: 4, armor: 0 },
      currentHealth: 4,
    });

    expect(resolveAttackRoll(attacker, target, baseWeapon, map, fixedRandom(6)).healthLoss).toBe(1);
  });
});

describe("ammo, cooldown, Supply, build, and equipment restrictions", () => {
  it("consumes ammo immutably and rejects negative or unavailable quantities", () => {
    const ammunition = { cannon: 2 };

    expect(consumeAmmo(ammunition, "cannon")).toEqual({
      legal: true,
      ammunition: { cannon: 1 },
    });
    expect(ammunition).toEqual({ cannon: 2 });
    expect(consumeAmmo(ammunition, "cannon", 3)).toEqual({ legal: false, ammunition });
    expect(consumeAmmo(ammunition, "cannon", -1)).toEqual({ legal: false, ammunition });
  });

  it("ticks cooldowns without retaining zero-valued entries", () => {
    expect(tickCooldowns({ laser: 3, smoke: 1, ready: 0 })).toEqual({ laser: 2 });
  });

  it("transfers positive integral Supply without mutating either inventory", () => {
    const source = { SMALL_SUPPLY: 5, MEDIUM_SUPPLY: 1 };
    const destination = { SMALL_SUPPLY: 2 };

    expect(transferSupply(source, destination, "SMALL_SUPPLY", 3)).toEqual({
      legal: true,
      source: { SMALL_SUPPLY: 2, MEDIUM_SUPPLY: 1 },
      destination: { SMALL_SUPPLY: 5 },
    });
    expect(source).toEqual({ SMALL_SUPPLY: 5, MEDIUM_SUPPLY: 1 });
    expect(destination).toEqual({ SMALL_SUPPLY: 2 });
    for (const invalid of [0, -1, 1.5, 6]) {
      expect(transferSupply(source, destination, "SMALL_SUPPLY", invalid).legal).toBe(false);
    }
  });

  it("limits build progress by remaining work, available points, and points per action", () => {
    expect(advanceBuildProgress(2, 10, 9, 3)).toEqual({
      progress: 5,
      spent: 3,
      complete: false,
    });
    expect(advanceBuildProgress(9, 10, 9, 3)).toEqual({
      progress: 10,
      spent: 1,
      complete: true,
    });
    expect(advanceBuildProgress(10, 10, 9, 3)).toEqual({
      progress: 10,
      spent: 0,
      complete: true,
    });
  });

  it("rejects negative Build Points instead of reducing completed progress", () => {
    expect(advanceBuildProgress(4, 10, -2, 3)).toEqual({
      progress: 4,
      spent: 0,
      complete: false,
    });
  });

  it("enforces catalogue status and allowed class restrictions", () => {
    const infantry = getUnitClass("unit-infantry-squad");
    const tank = getUnitClass("unit-main-battle-tank");
    const flak = equipment.find((item) => item.id === "equipment-flak-vests")!;
    const lightAt = equipment.find((item) => item.id === "equipment-light-at")!;

    expect(canEquip(infantry, flak, [], new Map())).toEqual({ legal: true });
    expect(canEquip(tank, flak, [], new Map())).toMatchObject({
      legal: false,
      reason: "Unit class is not eligible for this equipment.",
    });
    expect(canEquip(infantry, lightAt, [], new Map())).toEqual({ legal: true });
    expect(canEquip(infantry, { ...lightAt, status: "experimental" }, [], new Map())).toMatchObject({
      legal: false,
      reason: "Equipment is not active.",
    });
  });

  it("enforces dependencies, incompatibilities, and slot capacity", () => {
    const unit = structuredClone(getUnitClass("unit-infantry-squad"));
    unit.slots = { primary: 1 };
    const prerequisite = makeEquipment("prerequisite");
    const blocker = makeEquipment("blocker");
    const candidate = makeEquipment("candidate", {
      requiredEquipment: [prerequisite.id],
      incompatibleEquipment: [blocker.id],
    });
    const installedById = new Map([
      [prerequisite.id, prerequisite],
      [blocker.id, blocker],
    ]);

    expect(canEquip(unit, candidate, [], installedById)).toMatchObject({
      legal: false,
      reason: "Required equipment is missing.",
    });
    expect(canEquip(unit, candidate, [prerequisite.id, blocker.id], installedById)).toMatchObject({
      legal: false,
      reason: "Equipment is incompatible with an installed item.",
    });
    expect(canEquip(unit, candidate, [prerequisite.id], installedById)).toMatchObject({
      legal: false,
      reason: "No compatible equipment slot is available.",
    });

    unit.slots.primary = 2;
    expect(canEquip(unit, candidate, [prerequisite.id], installedById)).toEqual({ legal: true });
  });
});

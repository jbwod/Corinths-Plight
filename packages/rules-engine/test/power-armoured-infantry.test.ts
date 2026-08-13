import { describe, expect, it } from "vitest";
import type { CampaignDeployment } from "../../domain/src";

import {
  POWER_ARMOURED_INFANTRY_BACK_WEAPON,
  POWER_ARMOURED_INFANTRY_PROFILE,
  POWER_ARMOURED_INFANTRY_PUBLIC_V1,
  getPowerArmouredInfantryPublicV1Class,
  powerArmourHatParadropAllowed,
  installPowerArmourBackWeapon,
  powerArmourFittedWeapons,
  purchasePowerArmouredInfantry,
  resolveBallisticShieldWall,
  resolvePowerArmourBackWeaponCycle,
  resolvePowerArmourOrbitalDrop,
  validateMagneticClampDismount,
  validateMagneticClampMount,
  validateMagneticClampRide,
  validatePowerArmourDeployment,
} from "../src/power-armoured-infantry";
import { resolveRound, validateOrder } from "../src/resolver";
import { getTacticalActionRule } from "../src/tactical-grammar";
import { canTarget, tickCooldowns } from "../src/mechanics";
import { getCompanionMechV1Class } from "../src/companion-mechs";
import { getTacticalCargoProfile, getTacticalUnitClass } from "../src/tactical-unit-catalogue";
import { makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

describe("source-exact Power Armoured Infantry rules", () => {
  it("retains the companion class FS profile and equipment slots without converting FS to Hits", () => {
    expect(POWER_ARMOURED_INFANTRY_PROFILE).toEqual({
      maximumForceStrength: 3,
      healthModel: "FORCE_STRENGTH",
      armor: 2,
      speedQuarters: 4,
      range: 1,
      primaryEquipmentSlots: 2,
      mechWeaponSlots: 1,
    });
  });

  it("publishes a deterministic public-v1 class and Req purchase hook", () => {
    const definition = getPowerArmouredInfantryPublicV1Class(4);
    expect(definition).toMatchObject({
      id: "unit-power-armoured-infantry",
      requisitionCost: 10,
      tags: ["GROUND", "PERSONNEL", "INFANTRY", "ARMOURED", "POWER_ARMOUR"],
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 3, armor: 2, speed: 1, sensors: 4 },
      allowedActions: ["ATTACK", "DIG_IN", "SHIELD_WALL", "MOUNT_MAGNETIC_CLAMPS", "DISMOUNT_MAGNETIC_CLAMPS"],
    });
    expect(definition.weapons).toEqual([expect.objectContaining({ id: "weapon-infantry-rifle", damage: { count: 1, sides: 6 }, range: 1 })]);
    expect(purchasePowerArmouredInfantry(10)).toMatchObject({ legal: true, requisitionAfter: 0, requisitionSpent: 10 });
    expect(purchasePowerArmouredInfantry(9)).toMatchObject({ legal: false, requisitionAfter: 9, requisitionSpent: 0 });
  });

  it("unlocks exactly one normalized back-mounted Light Laser after one mission", () => {
    expect(installPowerArmourBackWeapon({ availableRequisition: 1, completedMissions: 0, mechWeaponSlotOccupied: false }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/after one completed mission/i) });
    expect(installPowerArmourBackWeapon({ availableRequisition: 1, completedMissions: 1, mechWeaponSlotOccupied: true }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/already occupied/i) });
    expect(installPowerArmourBackWeapon({ availableRequisition: 1, completedMissions: 1, mechWeaponSlotOccupied: false }))
      .toMatchObject({
        legal: true,
        requisitionAfter: 0,
        equipmentId: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponEquipmentId,
        weapon: { damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0 },
        initialHeatCapacity: 3,
      });
    expect(powerArmourFittedWeapons(true).map((weapon) => weapon.id)).toEqual([
      "weapon-infantry-rifle",
      POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId,
    ]);
  });

  it("forces a full cooling round after every third back-laser shot", () => {
    expect(resolvePowerArmourBackWeaponCycle(2)).toEqual({ ammunitionAfter: 2, coolingTriggered: false });
    expect(resolvePowerArmourBackWeaponCycle(1)).toEqual({ ammunitionAfter: 1, coolingTriggered: false });
    expect(resolvePowerArmourBackWeaponCycle(0)).toEqual({ ammunitionAfter: 3, cooldownAfter: 2, coolingTriggered: true });
    expect(tickCooldowns({ [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]: 2 }))
      .toEqual({ [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]: 1 });
    expect(tickCooldowns({ [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]: 1 })).toEqual({});
    expect(() => resolvePowerArmourBackWeaponCycle(3)).toThrow(/heat state is invalid/i);
  });

  it("accepts only a known, open, capacitated Heavy Drop Pod insertion and delays action one round", () => {
    expect(resolvePowerArmourOrbitalDrop({
      carrierCapabilities: ["HEAVY_DROP_POD"],
      insertionRound: 2,
      destinationExists: true,
      destinationKnown: true,
      destinationOpen: true,
      destinationCapacityAvailable: true,
    })).toEqual({ legal: true, reasons: [], maySubmitOrdersFromRound: 3 });
    expect(resolvePowerArmourOrbitalDrop({
      carrierCapabilities: ["AIRDROP"],
      insertionRound: 2,
      destinationExists: true,
      destinationKnown: false,
      destinationOpen: false,
      destinationCapacityAvailable: false,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining([
      expect.stringMatching(/Heavy Drop Pod/i),
      expect.stringMatching(/known/i),
      expect.stringMatching(/open ground/i),
      expect.stringMatching(/capacity/i),
    ]) });
  });

  it("executes Hold Line as V5 Dig In and rejects heat-counter reloads", () => {
    const definition = getPowerArmouredInfantryPublicV1Class(3);
    const powerArmour = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      weapons: powerArmourFittedWeapons(true),
      ammunition: { [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]: 3 },
      equipmentIds: [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponEquipmentId],
    });
    const digInRule = getTacticalActionRule("DIG_IN");
    const digIn = makeAction("dig-in", { type: "DIG_IN", economy: digInRule.economy, speedCost: digInRule.speedCost });
    const order = makeOrder(powerArmour, { actions: [digIn] });
    const input = makeRoundInput(makeState([powerArmour], [makeHex(0, 0)]), [order]);
    expect(validateOrder(order, powerArmour, input)).toMatchObject({ legal: true });
    const output = resolveRound(input);
    expect(output.state.deployments[0]?.statuses).toContain("DUG_IN");
    expect(output.events).toContainEqual(expect.objectContaining({ type: "UNIT_DUG_IN", actor: powerArmour.id }));

    const reloadRule = getTacticalActionRule("RELOAD");
    const reload = makeAction("reload-heat", {
      type: "RELOAD",
      economy: reloadRule.economy,
      speedCost: reloadRule.speedCost,
      weaponId: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId,
    });
    const reloadOrder = makeOrder(powerArmour, { actions: [reload] });
    expect(validateOrder(reloadOrder, powerArmour, makeRoundInput(input.previousState, [reloadOrder])).reasons)
      .toContain("The Power Armour back-mounted Light Laser cools automatically and cannot be reloaded.");
  });

  it("persists the back-laser heat cycle through resolver ammunition and cooldown state", () => {
    const definition = getPowerArmouredInfantryPublicV1Class(3);
    const attacker = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      weapons: [{ ...POWER_ARMOURED_INFANTRY_BACK_WEAPON, damage: { ...POWER_ARMOURED_INFANTRY_BACK_WEAPON.damage }, tags: [...POWER_ARMOURED_INFANTRY_BACK_WEAPON.tags] }],
      ammunition: { [POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]: 1 },
    });
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", { stats: { maxHealth: 20 }, currentHealth: 20 });
    const attackRule = getTacticalActionRule("ATTACK");
    const action = makeAction("laser-shot-3", {
      type: "ATTACK",
      economy: attackRule.economy,
      speedCost: attackRule.speedCost,
      targetDeploymentId: target.id,
    });
    const order = makeOrder(attacker, { actions: [action], targets: [target.id] });
    const output = resolveRound(makeRoundInput(makeState([attacker, target], [makeHex(0, 0), makeHex(1, 0)]), [order]));
    const resolved = output.state.deployments.find((unit) => unit.id === attacker.id)!;
    expect(resolved.ammunition[POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]).toBe(3);
    expect(resolved.cooldowns[POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId]).toBe(2);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      payload: expect.objectContaining({
        weaponId: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId,
        ammunitionBefore: 1,
        ammunitionAfter: 3,
        coolingTriggered: true,
      }),
    }));
  });

  it("permits Magnetic Clamp riding only on a friendly equipped Medium-or-larger mech", () => {
    for (const carrierWeightClass of ["MEDIUM", "HEAVY"] as const) {
      expect(validateMagneticClampRide({
        riderIsPowerArmouredInfantry: true,
        carrierIsFriendly: true,
        carrierWeightClass,
        magneticClampsEquipped: true,
      })).toEqual({ legal: true, reasons: [] });
    }
  });

  it("fails Magnetic Clamp riding closed for the omitted source prerequisites", () => {
    const base = {
      riderIsPowerArmouredInfantry: true,
      carrierIsFriendly: true,
      carrierWeightClass: "MEDIUM" as const,
      magneticClampsEquipped: true,
    };
    expect(validateMagneticClampRide({ ...base, riderIsPowerArmouredInfantry: false }))
      .toMatchObject({ legal: false, reasons: [expect.stringMatching(/Power Armoured Infantry/i)] });
    expect(validateMagneticClampRide({ ...base, carrierIsFriendly: false }))
      .toMatchObject({ legal: false, reasons: [expect.stringMatching(/friendly/i)] });
    expect(validateMagneticClampRide({ ...base, carrierWeightClass: "LIGHT" }))
      .toMatchObject({ legal: false, reasons: [expect.stringMatching(/Medium or larger/i)] });
    expect(validateMagneticClampRide({ ...base, carrierWeightClass: "NOT_A_MECH" }))
      .toMatchObject({ legal: false, reasons: [expect.stringMatching(/mech/i)] });
    expect(validateMagneticClampRide({ ...base, magneticClampsEquipped: false }))
      .toMatchObject({ legal: false, reasons: [expect.stringMatching(/equipment is required/i)] });
  });

  it("allows ordinary ground deployment and requires a Heavy Drop Pod for orbital deployment", () => {
    expect(validatePowerArmourDeployment({ mode: "GROUND", carrierCapabilities: [] }))
      .toEqual({ legal: true, reasons: [] });
    expect(validatePowerArmourDeployment({
      mode: "ORBITAL_DROP",
      carrierCapabilities: ["HEAVY_DROP_POD"],
    })).toEqual({ legal: true, reasons: [] });
    expect(validatePowerArmourDeployment({
      mode: "ORBITAL_DROP",
      carrierCapabilities: ["AIRDROP"],
    })).toMatchObject({ legal: false, reasons: [expect.stringMatching(/Heavy Drop Pod/i)] });
  });

  it("grants one non-stacking Cover Armor against direct fire while Shield Wall remains active", () => {
    expect(resolveBallisticShieldWall({
      ballisticShieldsEquipped: true,
      shieldWallActive: true,
      movedSinceActivation: false,
      incomingAttackIsDirect: true,
      otherCoverArmor: 0,
    })).toEqual({
      shieldWallRemainsActive: true,
      shieldWallArmor: 1,
      effectiveCoverArmor: 1,
    });
    expect(resolveBallisticShieldWall({
      ballisticShieldsEquipped: true,
      shieldWallActive: true,
      movedSinceActivation: false,
      incomingAttackIsDirect: true,
      otherCoverArmor: 1,
    }).effectiveCoverArmor).toBe(1);
  });

  it("ends Shield Wall on movement and does not protect against indirect fire", () => {
    expect(resolveBallisticShieldWall({
      ballisticShieldsEquipped: true,
      shieldWallActive: true,
      movedSinceActivation: true,
      incomingAttackIsDirect: true,
      otherCoverArmor: 0,
    })).toEqual({
      shieldWallRemainsActive: false,
      shieldWallArmor: 0,
      effectiveCoverArmor: 0,
    });
    expect(resolveBallisticShieldWall({
      ballisticShieldsEquipped: true,
      shieldWallActive: true,
      movedSinceActivation: false,
      incomingAttackIsDirect: false,
      otherCoverArmor: 0,
    })).toEqual({
      shieldWallRemainsActive: true,
      shieldWallArmor: 0,
      effectiveCoverArmor: 0,
    });
  });

  it("pins the Shield Wall and Magnetic Clamp action economies", () => {
    expect(getTacticalActionRule("SHIELD_WALL")).toMatchObject({
      economy: "STANDARD",
      speedCost: 1,
      usesAttack: false,
      executable: true,
    });
    expect(getTacticalActionRule("MOUNT_MAGNETIC_CLAMPS")).toMatchObject({
      economy: "PRIMARY",
      speedCost: 0,
      usesAttack: true,
      executable: true,
    });
    expect(getTacticalActionRule("DISMOUNT_MAGNETIC_CLAMPS")).toMatchObject({
      economy: "STANDARD",
      speedCost: 0.5,
      usesAttack: false,
      executable: true,
    });
  });

  it("validates the paired one-rider Magnetic Clamp lifecycle and excludes generic HAT paradrop", () => {
    const rider = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-power-armoured-infantry",
      tags: ["GROUND", "PERSONNEL", "INFANTRY", "POWER_ARMOUR"],
    });
    const carrier = makeDeployment("medium-mech", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-medium-mech",
      equipmentIds: [POWER_ARMOURED_INFANTRY_PUBLIC_V1.magneticClampsEquipmentId],
    });
    expect(validateMagneticClampMount({
      rider,
      carrier,
      matchingPrimaryActions: true,
      carrierRiderIds: [],
    })).toEqual({ legal: true, reasons: [] });
    expect(validateMagneticClampMount({
      rider,
      carrier,
      matchingPrimaryActions: false,
      carrierRiderIds: ["other-rider"],
    })).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        expect.stringMatching(/matching Primary/i),
        expect.stringMatching(/one Power Armour rider/i),
      ]),
    });

    const embarked = { ...rider, locationState: "EMBARKED" as const };
    const loaded = {
      ...carrier,
      cargo: [{
        id: "magnetic-clamp:medium-mech:power-armour",
        kind: "PERSONNEL" as const,
        quantity: rider.currentHealth,
        tags: ["POWER_ARMOUR", "MAGNETIC_CLAMP_RIDER"],
        transportMode: "EMBARKED" as const,
        unitId: rider.id,
      }],
    };
    expect(validateMagneticClampDismount(embarked, loaded, true)).toEqual({ legal: true, reasons: [] });
    expect(validateMagneticClampDismount(embarked, loaded, false)).toMatchObject({
      legal: false,
      reasons: [expect.stringMatching(/matching Standard/i)],
    });
    expect(powerArmourHatParadropAllowed(rider)).toBe(false);
    expect(powerArmourHatParadropAllowed(carrier)).toBe(true);
  });

  it("prevents an embarked Magnetic Clamp rider from being targeted independently", () => {
    const attacker = makeDeployment("enemy", { q: 1, r: 0 }, "ENEMY");
    const rider = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-power-armoured-infantry",
      locationState: "EMBARKED",
    });
    expect(canTarget(attacker, rider, attacker.weapons[0]!, [makeHex(0, 0), makeHex(1, 0)]))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/cannot be independently targeted/i) });
  });

  it("forms a persistent non-stacking Shield Wall and clears it on later movement", () => {
    const definition = getPowerArmouredInfantryPublicV1Class(3);
    const rider = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      equipmentIds: [POWER_ARMOURED_INFANTRY_PUBLIC_V1.ballisticShieldsEquipmentId],
      statuses: ["DUG_IN"],
    });
    const shield = makeAction("shield-wall", {
      type: "SHIELD_WALL",
      economy: "STANDARD",
      speedCost: 1,
    });
    const formed = resolveRound(makeRoundInput(
      makeState([rider], [makeHex(0, 0), makeHex(1, 0)]),
      [makeOrder(rider, { actions: [shield] })],
    ));
    const shielded = formed.state.deployments[0]!;
    expect(shielded.statuses).toEqual(expect.arrayContaining(["DUG_IN", "SHIELD_WALL"]));
    expect(formed.events).toContainEqual(expect.objectContaining({
      type: "SHIELD_WALL_FORMED",
      actor: rider.id,
      payload: expect.objectContaining({ coverArmor: 1, directFireOnly: true, stackingCap: 1 }),
    }));

    const nextState = { ...formed.state, phase: "LOCKED" as const, outcome: undefined };
    const move = makeOrder(shielded, {
      id: "order-shield-move",
      round: nextState.round,
      orderType: "ADVANCE",
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    });
    const moved = resolveRound(makeRoundInput(nextState, [move]));
    expect(moved.state.deployments[0]!.statuses).not.toContain("SHIELD_WALL");
  });

  it("mounts before mech movement, synchronizes the rider, and dismounts into the mech hex", () => {
    const riderDefinition = getPowerArmouredInfantryPublicV1Class(3);
    const mechDefinition = getCompanionMechV1Class("unit-medium-mech", 3);
    const rider = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: riderDefinition.id,
      tags: riderDefinition.tags,
      stats: riderDefinition.stats,
    });
    const mech = makeDeployment("medium-mech", { q: 0, r: 0 }, "ALLIED", {
      definitionId: mechDefinition.id,
      tags: mechDefinition.tags,
      stats: mechDefinition.stats,
      equipmentIds: [POWER_ARMOURED_INFANTRY_PUBLIC_V1.magneticClampsEquipmentId],
    });
    const riderMount = makeAction("rider-mount", {
      type: "MOUNT_MAGNETIC_CLAMPS", economy: "PRIMARY", speedCost: 0, targetDeploymentId: mech.id,
    });
    const mechMount = makeAction("mech-mount", {
      type: "MOUNT_MAGNETIC_CLAMPS", economy: "PRIMARY", speedCost: 0, targetDeploymentId: rider.id,
    });
    const mounted = resolveRound(makeRoundInput(
      makeState([rider, mech], [makeHex(0, 0), makeHex(1, 0)]),
      [
        makeOrder(rider, { actions: [riderMount] }),
        makeOrder(mech, { orderType: "ADVANCE", route: [{ q: 0, r: 0 }, { q: 1, r: 0 }], actions: [mechMount] }),
      ],
    ));
    const mountedRider = mounted.state.deployments.find((unit) => unit.id === rider.id)!;
    const movedMech = mounted.state.deployments.find((unit) => unit.id === mech.id)!;
    expect(mountedRider).toMatchObject({ locationState: "EMBARKED", position: { q: 1, r: 0 } });
    expect(movedMech.cargo).toContainEqual(expect.objectContaining({
      unitId: rider.id,
      transportMode: "EMBARKED",
      tags: expect.arrayContaining(["MAGNETIC_CLAMP_RIDER"]),
    }));
    expect(mounted.events.filter((item) => item.type === "MAGNETIC_CLAMPS_MOUNTED")).toHaveLength(1);

    const dismountState = { ...mounted.state, phase: "LOCKED" as const, outcome: undefined };
    const riderDismount = makeAction("rider-dismount", {
      type: "DISMOUNT_MAGNETIC_CLAMPS", economy: "STANDARD", speedCost: 0.5, targetDeploymentId: mech.id,
    });
    const mechDismount = makeAction("mech-dismount", {
      type: "DISMOUNT_MAGNETIC_CLAMPS", economy: "STANDARD", speedCost: 0.5, targetDeploymentId: rider.id,
    });
    const dismounted = resolveRound(makeRoundInput(dismountState, [
      makeOrder(mountedRider, { id: "order-rider-dismount", round: dismountState.round, actions: [riderDismount] }),
      makeOrder(movedMech, { id: "order-mech-dismount", round: dismountState.round, actions: [mechDismount] }),
    ]));
    expect(dismounted.state.deployments.find((unit) => unit.id === rider.id)).toMatchObject({
      locationState: "ON_MAP",
      position: { q: 1, r: 0 },
    });
    expect(dismounted.state.deployments.find((unit) => unit.id === mech.id)!.cargo).toEqual([]);
    expect(dismounted.events.filter((item) => item.type === "MAGNETIC_CLAMPS_DISMOUNTED")).toHaveLength(1);
  });

  it("rejects generic Heavy Air Transport paradrop while retaining the embarked Power Armour", () => {
    const hatDefinition = getTacticalUnitClass("unit-heavy-air-transport");
    const hat = makeDeployment("hat", { q: -1, r: 0 }, "ALLIED", {
      definitionId: hatDefinition.id,
      tags: hatDefinition.tags,
      stats: hatDefinition.stats,
      weapons: [],
      cargoProfile: getTacticalCargoProfile(hatDefinition.id),
      allowedActions: hatDefinition.allowedActions as CampaignDeployment["allowedActions"],
      allowedOrders: hatDefinition.allowedOrders as CampaignDeployment["allowedOrders"],
    });
    const riderDefinition = getPowerArmouredInfantryPublicV1Class(3);
    const rider = makeDeployment("power-armour", hat.position, "ALLIED", {
      definitionId: riderDefinition.id,
      tags: riderDefinition.tags,
      stats: riderDefinition.stats,
      locationState: "EMBARKED",
    });
    hat.cargo = [{
      id: "hat-power-armour",
      kind: "PERSONNEL",
      quantity: rider.currentHealth,
      tags: [...riderDefinition.tags],
      transportMode: "EMBARKED",
      unitId: rider.id,
    }];
    const drop = makeAction("hat-pai-drop", {
      type: "AIRDROP",
      economy: getTacticalActionRule("AIRDROP").economy,
      speedCost: getTacticalActionRule("AIRDROP").speedCost,
      targetDeploymentId: rider.id,
      targetHex: { q: 0, r: 0 },
      payload: { cargoDeploymentId: rider.id },
    });
    const dropOrder = makeOrder(hat, {
      orderType: "ADVANCE",
      route: [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }],
      actions: [drop],
    });
    const output = resolveRound(makeRoundInput(
      makeState([hat, rider], [makeHex(-1, 0), makeHex(0, 0), makeHex(1, 0)]),
      [dropOrder],
    ));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_FAILED",
      actor: hat.id,
      payload: expect.objectContaining({ reason: expect.stringMatching(/Heavy Drop Pod.*cannot use generic HAT/i) }),
    }));
    expect(output.state.deployments.find((unit) => unit.id === rider.id)).toMatchObject({ locationState: "EMBARKED" });
    expect(output.state.deployments.find((unit) => unit.id === hat.id)!.cargo).toContainEqual(expect.objectContaining({ unitId: rider.id }));
  });

  it("freezes a Magnetic Clamp rider for adjudication when its mech is destroyed", () => {
    const rider = makeDeployment("power-armour", { q: 0, r: 0 }, "ALLIED", {
      definitionId: "unit-power-armoured-infantry",
      locationState: "EMBARKED",
    });
    const mechDefinition = getCompanionMechV1Class("unit-medium-mech", 3);
    const mech = makeDeployment("medium-mech", { q: 0, r: 0 }, "ALLIED", {
      definitionId: mechDefinition.id,
      tags: mechDefinition.tags,
      stats: mechDefinition.stats,
      currentHealth: 1,
      cargo: [{
        id: "magnetic-clamp-rider",
        kind: "PERSONNEL",
        quantity: rider.currentHealth,
        tags: ["POWER_ARMOUR", "MAGNETIC_CLAMP_RIDER"],
        transportMode: "EMBARKED",
        unitId: rider.id,
      }],
    });
    const enemy = makeDeployment("enemy", { q: 1, r: 0 }, "ENEMY", {
      weapons: [{
        id: "weapon-fixed-kill",
        name: "Fixed test weapon",
        damage: { count: 1, sides: 1 },
        range: 1,
        armorPiercing: 3,
        tags: [],
      }],
    });
    const attack = makeAction("destroy-carrier", {
      type: "ATTACK",
      economy: "STANDARD",
      speedCost: 0,
      targetDeploymentId: mech.id,
    });
    const output = resolveRound(makeRoundInput(
      makeState([rider, mech, enemy], [makeHex(0, 0), makeHex(1, 0)]),
      [],
      [makeOrder(enemy, { actions: [attack], targets: [mech.id] })],
    ));
    expect(output.state.deployments.find((unit) => unit.id === mech.id)).toMatchObject({
      status: "DESTROYED",
      locationState: "DESTROYED",
    });
    expect(output.state.deployments.find((unit) => unit.id === rider.id)).toMatchObject({
      locationState: "EMBARKED",
      position: { q: 0, r: 0 },
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION",
      actor: mech.id,
      payload: expect.objectContaining({
        resolution: "FROZEN_WITH_DESTROYED_CARRIER",
        requiresAdjudication: true,
        cargo: [expect.objectContaining({ cargoDeploymentId: rider.id })],
      }),
    }));
  });
});

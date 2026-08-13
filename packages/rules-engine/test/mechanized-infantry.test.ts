import type { CampaignDeployment, EquipmentDefinition, SelectedEquipment, UnitDefinition } from "../../domain/src";
import { describe, expect, it } from "vitest";

import {
  getMechanizedInfantryPublicV1Class,
  getMechanizedInfantrySubsystemRules,
  buildEffectiveUnit,
  resolveForwardLineControl,
  resolveRound,
  validateMechanizedInfantryEquipment,
  validateMechanizedInfantryIdentity,
} from "../src";
import { makeDeployment, makeEquipment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function mechanized(
  id: string,
  side: "ALLIED" | "ENEMY" = "ALLIED",
  position = { q: 0, r: 0 },
): CampaignDeployment {
  const profile = getMechanizedInfantryPublicV1Class(3);
  return makeDeployment(id, position, side, {
    definitionId: profile.id,
    tags: profile.tags,
    stats: profile.stats,
    weapons: structuredClone(profile.weapons),
    allowedActions: ["ATTACK"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    cargoProfile: undefined,
  });
}

function equipment(
  id: string,
  category: string,
  slotType: string,
  statModifiers: EquipmentDefinition["statModifiers"] = {},
) {
  return makeEquipment(id, { category, slotType, statModifiers });
}

function effectiveDefinition(): UnitDefinition {
  const profile = getMechanizedInfantryPublicV1Class(3);
  return {
    ...profile,
    implementationStatus: "IMPLEMENTED",
    requisitionStatus: "PUBLISHED",
    availabilityStatus: "AVAILABLE",
    movementProfile: {
      id: "mechanized-movement",
      mode: "GROUND",
      groundMode: "STANDARD",
      baseSpeed: 3,
      usesFacing: true,
      allowsHostilePassage: false,
      requiresFlightPath: false,
      terrainCostMode: "BATTLEFIELD",
      canRush: true,
    },
    durabilityProfile: {
      id: "mechanized-durability",
      model: "HITS",
      maximumHealth: 3,
      outputScaling: "NONE",
      penetrationLoss: "ONE_HIT",
      supportsSubsystems: true,
      healable: false,
    },
    abilities: [],
  };
}

function selected(definition: EquipmentDefinition, slotIndex = 0): SelectedEquipment {
  return {
    instanceId: `owned:${definition.id}`,
    definition,
    effects: [],
    slotType: definition.slotType,
    slotIndex,
    state: "INSTALLED",
  };
}

describe("public-v1 Mechanized Infantry", () => {
  it("projects the approved mixed-formation chassis, attack, price and exact slots without cargo", () => {
    const profile = getMechanizedInfantryPublicV1Class(4);
    expect(profile).toMatchObject({
      category: "ARMOUR",
      stats: { healthModel: "HITS", maxHealth: 3, armor: 2, speed: 3, sensors: 4 },
      requisitionCost: 10,
      slots: { primary: 1, secondary: 1, internal: 1 },
      weapons: [{ damage: { count: 1, sides: 4 }, armorPiercing: 0, range: 2 }],
      tags: expect.arrayContaining(["VEHICLE", "FORWARD_LINE_CONTROL", "INFANTRY_EQUIPMENT_ACCESS", "SUBSYSTEMS"]),
      allowedActions: ["ATTACK"],
    });
    expect(profile.tags).not.toContain("PERSONNEL");
    expect(validateMechanizedInfantryIdentity(mechanized("mechanized"))).toEqual({ legal: true, reasons: [] });
    const cargoForgery = mechanized("cargo-forgery");
    cargoForgery.cargoProfile = {
      id: "forged-passenger-cargo",
      capacitySlotsQuarters: 4,
      allowMixedLoadGroups: false,
      rules: [],
    };
    expect(validateMechanizedInfantryIdentity(cargoForgery)).toMatchObject({
      legal: false,
      reasons: ["Mechanized Infantry has no governed passenger cargo profile."],
    });
  });

  it("uses vehicle subsystem and rear/damage identity rather than personnel behavior", () => {
    expect(getMechanizedInfantrySubsystemRules("unit-mechanized-infantry")).toMatchObject({
      profile: { id: "public-v1-mechanized-infantry-subsystems", requiresPenetration: true },
      definitions: expect.arrayContaining([
        expect.objectContaining({ id: "WEAPONS" }),
        expect.objectContaining({ id: "MOBILITY" }),
      ]),
    });
    expect(getMechanizedInfantrySubsystemRules("unit-infantry-squad")).toBeUndefined();
  });

  it("accepts Infantry and Vehicle equipment only in one Primary, Secondary and Internal slot", () => {
    const infantryPrimary = equipment("infantry-primary", "INFANTRY_WEAPON", "primary");
    const vehicleSecondary = equipment("vehicle-secondary", "VEHICLE_WEAPON", "secondary");
    const vehicleInternal = equipment("vehicle-internal", "VEHICLE_INTERNAL", "internal", { speed: 1 });
    expect(validateMechanizedInfantryEquipment([
      { equipment: infantryPrimary, slotIndex: 0 },
      { equipment: vehicleSecondary, slotIndex: 0 },
      { equipment: vehicleInternal, slotIndex: 0 },
    ])).toEqual({ legal: true, reasons: [] });

    const infantryArmor = equipment("infantry-armour", "INFANTRY_ARMOUR", "internal", { armor: 1 });
    const mechWeapon = equipment("mech-weapon", "MECH_WEAPON", "primary");
    expect(validateMechanizedInfantryEquipment([
      { equipment: infantryArmor, slotIndex: 0 },
      { equipment: mechWeapon, slotIndex: 1 },
    ])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "infantry-armour cannot apply AP, Armor, or Speed from the Infantry equipment list.",
        "mech-weapon does not fit a governed Mechanized Infantry slot.",
        "mech-weapon is not Infantry or Vehicle equipment.",
      ]),
    });
  });

  it("enforces the mixed equipment exception at effective-unit materialization", () => {
    const infantryPrimary = equipment("infantry-primary", "INFANTRY_WEAPON", "primary");
    infantryPrimary.allowedClasses = ["unit-infantry-squad"];
    const vehicleInternal = equipment("vehicle-internal", "VEHICLE_INTERNAL", "internal");
    vehicleInternal.allowedClasses = ["unit-main-battle-tank"];
    const valid = buildEffectiveUnit({
      rulesetVersion: effectiveDefinition().rulesetVersion,
      unitDefinition: effectiveDefinition(),
      refits: [],
      equipment: [selected(infantryPrimary), selected(vehicleInternal)],
    });
    expect(valid).toMatchObject({ valid: true, errors: [] });

    const forbidden = equipment("infantry-armour", "INFANTRY_ARMOUR", "internal", { armor: 1 });
    forbidden.allowedClasses = ["unit-infantry-squad"];
    const invalid = buildEffectiveUnit({
      rulesetVersion: effectiveDefinition().rulesetVersion,
      unitDefinition: effectiveDefinition(),
      refits: [],
      equipment: [selected(forbidden)],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContainEqual(expect.objectContaining({
      code: "MECHANIZED_EQUIPMENT_INELIGIBLE",
      message: "infantry-armour cannot apply AP, Armor, or Speed from the Infantry equipment list.",
    }));
  });

  it("deterministically claims an occupied objective/control hex or contests opposing Forward Lines", () => {
    expect(resolveForwardLineControl([
      { id: "b", side: "ALLIED", operational: true },
      { id: "a", side: "ALLIED", operational: true },
    ])).toEqual({ controllingSide: "ALLIED", contested: false, occupantIds: ["a", "b"] });
    expect(resolveForwardLineControl([
      { id: "allied", side: "ALLIED", operational: true },
      { id: "enemy", side: "ENEMY", operational: true },
    ])).toEqual({ controllingSide: null, contested: true, occupantIds: ["allied", "enemy"] });
  });

  it("applies Forward Line control at round end while destroyed or embarked formations do not claim", () => {
    const objectiveHex = makeHex(0, 0, { objectiveId: "objective-forward", control: "ENEMY" });
    const unit = mechanized("mechanized");
    const hold = makeOrder(unit);
    const state = makeState([unit], [objectiveHex], [hold]);
    state.objectives = [{
      id: "objective-forward",
      name: "Forward Junction",
      coord: { ...objectiveHex.coord },
      owner: "ENEMY",
      status: "ACTIVE",
      description: "Control junction",
    }];
    const output = resolveRound(makeRoundInput(state, [hold]));
    expect(output.state.map[0].control).toBe("ALLIED");
    expect(output.state.objectives[0].owner).toBe("ALLIED");
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "OBJECTIVE_CAPTURED",
      payload: expect.objectContaining({
        objectiveId: "objective-forward",
        previousOwner: "ENEMY",
        owner: "ALLIED",
        occupantIds: [unit.id],
        controlAbility: "FORWARD_LINE_CONTROL",
      }),
    }));

    const embarked = mechanized("embarked");
    embarked.locationState = "EMBARKED";
    const embarkedOrder = makeOrder(embarked);
    const blocked = resolveRound(makeRoundInput(
      makeState([embarked], [objectiveHex], [embarkedOrder]),
      [embarkedOrder],
    ));
    expect(blocked.state.map[0].control).toBe("ENEMY");

    const contestedUnit = mechanized("contested-mechanized");
    const hostileInfantry = makeDeployment("hostile-infantry", objectiveHex.coord, "ENEMY", {
      tags: ["GROUND", "PERSONNEL", "INFANTRY"],
    });
    const contestedOrder = makeOrder(contestedUnit);
    const contested = resolveRound(makeRoundInput(
      makeState([contestedUnit, hostileInfantry], [objectiveHex], [contestedOrder]),
      [contestedOrder],
    ));
    expect(contested.state.map[0].control).toBe("ENEMY");
    expect(contested.events).toContainEqual(expect.objectContaining({
      type: "OBJECTIVE_CAPTURED",
      payload: expect.objectContaining({ contested: true, occupantIds: [contestedUnit.id, hostileInfantry.id] }),
    }));
  });
});

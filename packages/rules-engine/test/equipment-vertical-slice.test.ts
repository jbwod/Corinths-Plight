import type { EquipmentDefinition, EquipmentEffect, SelectedEquipment, UnitDefinition } from "../../domain/src";
import { describe, expect, it } from "vitest";
import { buildEffectiveUnit } from "../src";

const rulesetVersion = "v5-core-curated@1";

function definition(): UnitDefinition {
  return {
    id: "unit-infantry-squad",
    kind: "unit-class",
    name: "Infantry Squad",
    description: "Line infantry",
    category: "INFANTRY",
    tags: ["INFANTRY", "PERSONNEL"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6, armor: 0, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    weapons: [{ id: "weapon-rifle", name: "Rifle", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, tags: [] }],
    requisitionCost: null,
    slots: { PRIMARY: 1, SECONDARY: 1, UPGRADE: 1 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "LOAD", "UNLOAD"],
    rulesetVersion,
    source: "rules/Meta - Core Rules (V5).md",
    status: "active",
    implementationStatus: "IMPLEMENTED",
    requisitionStatus: "PUBLISHED",
    availabilityStatus: "AVAILABLE",
    movementProfile: { id: "move-infantry", mode: "GROUND", groundMode: "STANDARD", baseSpeed: 1, usesFacing: true, allowsHostilePassage: false, requiresFlightPath: false, terrainCostMode: "BATTLEFIELD", canRush: true },
    durabilityProfile: { id: "durability-fs", model: "FORCE_STRENGTH", maximumHealth: 6, outputScaling: "CURRENT_HEALTH", penetrationLoss: "RESIDUAL", supportsSubsystems: false, healable: true },
    abilities: [],
    deploymentProfile: { id: "deploy-ground", allowedLocationStates: ["RESERVE", "ON_SHIP"], requiredTags: [], prohibitedStatuses: ["DESTROYED"], handlerId: "ground" },
  };
}

function equipment(
  id: string,
  slotType: string,
  slotIndex: number,
  effects: EquipmentEffect[],
): SelectedEquipment {
  const definition: EquipmentDefinition = {
    id,
    kind: "equipment",
    name: id,
    description: id,
    category: "TEST",
    slotType,
    cost: 1,
    allowedClasses: ["unit-infantry-squad"],
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: {},
    abilityGrants: [],
    consumable: false,
    rulesText: "",
    tags: [],
    rulesetVersion,
    source: "rules/The Store - Equipment List.html",
    status: "active",
  };
  return { instanceId: `owned:${id}`, definition, effects, slotType, slotIndex, state: "INSTALLED" };
}

describe("authoritative effective unit builder", () => {
  it("applies conditional armour, weapon, action, ammo, cooldown, and deployment effects", () => {
    const lightAt = {
      id: "weapon-light-at",
      name: "Lightweight Anti-armour Weapon",
      damage: { count: 1, sides: 6 },
      range: 1,
      armorPiercing: 1,
      ammoCapacity: 3,
      tags: ["ANTI_ARMOUR", "EQUIPMENT"],
    };
    const result = buildEffectiveUnit({
      rulesetVersion,
      unitDefinition: definition(),
      refits: [],
      equipment: [
        equipment("equipment-flak-vests", "UPGRADE", 0, [{ type: "STAT_SET_IF", stat: "armor", whenEquals: 0, value: 1 }]),
        equipment("equipment-light-at", "PRIMARY", 0, [
          { type: "WEAPON_GRANT", weapon: lightAt },
          { type: "AMMO_GRANT", weaponId: lightAt.id, capacity: 3 },
        ]),
        equipment("equipment-drone-operator", "SECONDARY", 0, [
          { type: "ACTION_GRANT", action: "DEPLOY_DRONE" },
          { type: "ABILITY_GRANT", ability: { abilityId: "ability-deploy-drone", handlerId: "DEPLOY_DRONE", parameters: { range: 5 } } },
          { type: "DEPLOYMENT_GRANT", method: "PARADROP" },
        ]),
      ],
    });
    expect(result).toMatchObject({ valid: true, errors: [] });
    expect(result.unit).toMatchObject({
      stats: { armor: 1 },
      allowedActions: expect.arrayContaining(["ATTACK", "DEPLOY_DRONE"]),
      deploymentMethods: expect.arrayContaining(["STANDARD_GROUND", "PARADROP"]),
      ammunition: { "weapon-light-at": 3 },
    });
    expect(result.unit?.weapons.find((weapon) => weapon.id === lightAt.id)).toMatchObject({ armorPiercing: 1, ammoCapacity: 3 });
  });

  it("rejects slot overflow, duplicate items, and unavailable equipment", () => {
    const first = equipment("equipment-flak-vests", "UPGRADE", 0, []);
    const second = { ...equipment("equipment-flak-vests", "UPGRADE", 0, []), instanceId: "owned:second", state: "DAMAGED" as const };
    const result = buildEffectiveUnit({ rulesetVersion, unitDefinition: definition(), refits: [], equipment: [first, second] });
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "SLOT_OCCUPIED",
      "EQUIPMENT_DUPLICATE",
      "EQUIPMENT_UNAVAILABLE",
    ]));
  });

  it("is deterministic under equivalent equipment input ordering", () => {
    const vest = equipment("equipment-flak-vests", "UPGRADE", 0, [{ type: "STAT_SET_IF", stat: "armor", whenEquals: 0, value: 1 }]);
    const drop = equipment("equipment-drop-training", "SECONDARY", 0, [{ type: "DEPLOYMENT_GRANT", method: "ORBITAL_DROP" }]);
    const left = buildEffectiveUnit({ rulesetVersion, unitDefinition: definition(), refits: [], equipment: [vest, drop] });
    const right = buildEffectiveUnit({ rulesetVersion, unitDefinition: definition(), refits: [], equipment: [drop, vest] });
    expect(left.unit?.sourceHash).toBe(right.unit?.sourceHash);
    expect(left.unit).toEqual(right.unit);
  });
});

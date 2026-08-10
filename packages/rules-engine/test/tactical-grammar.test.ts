import { describe, expect, it } from "vitest";

import {
  getTacticalActionRule,
  getTacticalOrderRule,
} from "../src/tactical-grammar";
import { getTacticalSubsystemRules, getTacticalUnitClass } from "../src/tactical-unit-catalogue";
import { V5_CORE_CURATED_2_CONTENT_HASH } from "../src/generated/v5-core-curated-2";

describe("generated tactical grammar", () => {
  it("drives the executable foundation order and action set", () => {
    expect(["HOLD", "ADVANCE", "RUSH"].map((type) =>
      getTacticalOrderRule(type as "HOLD" | "ADVANCE" | "RUSH").executable,
    )).toEqual([true, true, true]);
    expect(getTacticalOrderRule("EVASIVE")).toMatchObject({
      executable: true,
      handlerId: "foundation-order-handler",
    });

    expect(getTacticalActionRule("ATTACK")).toMatchObject({
      id: "action-attack",
      economy: "STANDARD",
      speedCost: 0,
      usesAttack: true,
      executable: true,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    });
    expect(getTacticalActionRule("DIG_IN")).toMatchObject({ economy: "STANDARD", speedCost: 1, executable: true });
    expect(getTacticalActionRule("RELOAD")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("LOAD")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("UNLOAD")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("HEAL")).toMatchObject({ economy: "PRIMARY", executable: true });
    expect(getTacticalActionRule("TRENCH_UPGRADE")).toMatchObject({ economy: "PRIMARY", usesAttack: true, executable: true });
    expect(getTacticalActionRule("DEPLOY")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("PACK_UP")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("BOMBARDMENT")).toMatchObject({ economy: "PRIMARY", executable: true });
  });

  it("keeps catalogue-only mechanics out of live orders", () => {
    expect(getTacticalActionRule("SCAN").executable).toBe(false);
    expect(getTacticalActionRule("DEPLOY_DRONE").executable).toBe(false);
    expect(() => getTacticalActionRule("AIR_SUPPORT")).toThrow("Unknown action type: AIR_SUPPORT");
  });

  it("materializes the playable foundation units without the handwritten catalogue", () => {
    const infantry = getTacticalUnitClass("unit-infantry-squad");
    expect(infantry).toMatchObject({
      rulesetVersion: "v5-core-curated@2",
      category: "INFANTRY",
      stats: { maxHealth: 6, speed: 1, sensors: 4, capacity: 1 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
      allowedActions: ["ATTACK", "DIG_IN", "TRENCH_UPGRADE", "LOAD", "UNLOAD"],
    });
    expect(infantry.weapons).toEqual([
      expect.objectContaining({ id: "weapon-infantry-rifle", range: 1, armorPiercing: 0 }),
    ]);
    expect(getTacticalUnitClass("unit-main-battle-tank")).toMatchObject({
      stats: { maxHealth: 3, armor: 3, speed: 2 },
      allowedActions: ["ATTACK"],
    });
    expect(getTacticalUnitClass("unit-combat-medic")).toMatchObject({
      category: "SUPPORT",
      stats: { maxHealth: 4, speed: 1, capacity: 1 },
      allowedActions: ["DIG_IN", "HEAL", "RELOAD", "LOAD", "UNLOAD"],
    });
    expect(getTacticalUnitClass("unit-logi-truck")).toMatchObject({
      category: "SUPPORT",
      stats: { healthModel: "HITS", maxHealth: 1, speed: 3, capacity: 1 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
      allowedActions: ["RESUPPLY"],
      weapons: [],
    });
  });

  it("materializes the V5 subsystem malfunction profile from the governed durability record", () => {
    expect(getTacticalSubsystemRules("unit-main-battle-tank")).toEqual({
      profile: {
        id: "durability-vehicle-hits-subsystems",
        requiresPenetration: true,
        triggers: [
          {
            naturalRolls: [5],
            targetKind: "WEAPON",
            resultingState: "DISABLED",
            selection: "ALL",
            requiresAttackerHealthAtLeastRoll: true,
          },
          {
            naturalRolls: [6],
            targetKind: "MOBILITY",
            resultingState: "DISABLED",
            selection: "ALL",
            requiresAttackerHealthAtLeastRoll: true,
          },
        ],
      },
      definitions: [
        { id: "WEAPONS", name: "Weapon systems", kind: "WEAPON", tags: [] },
        { id: "MOBILITY", name: "Mobility", kind: "MOBILITY", tags: [] },
      ],
    });
    expect(getTacticalSubsystemRules("unit-infantry-squad")).toBeUndefined();
  });
});

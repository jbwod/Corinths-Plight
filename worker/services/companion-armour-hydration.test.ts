import { describe, expect, it } from "vitest";

import {
  COMPANION_MECHANIZED_INFANTRY_HANDLER_ID,
  COMPANION_MECHS_HANDLER_ID,
  COMPANION_TANKS_HANDLER_ID,
  companionArmourActionEconomy,
  hydrateCompanionArmourPublicV1,
} from "./companion-armour-hydration";

describe("companion armour server hydration adapters", () => {
  it("hydrates all approved tank conversions with published Req and governed weapons", () => {
    expect(hydrateCompanionArmourPublicV1(
      COMPANION_TANKS_HANDLER_ID,
      "unit-light-battle-tank",
    )).toMatchObject({
      status: "active",
      requisitionCost: 10,
      stats: { maxHealth: 3, armor: 2, speed: 3, sensors: 0 },
      weapons: [{ damage: { count: 1, sides: 4 }, armorPiercing: 2, range: 2 }],
    });
    expect(hydrateCompanionArmourPublicV1(
      COMPANION_TANKS_HANDLER_ID,
      "unit-heavy-battle-tank",
    )).toMatchObject({
      requisitionCost: 14,
      stats: { maxHealth: 3, armor: 4, speed: 2, sensors: 0 },
      weapons: [{ damage: { count: 1, sides: 8 }, armorPiercing: 2, range: 3 }],
    });
    expect(hydrateCompanionArmourPublicV1(
      COMPANION_TANKS_HANDLER_ID,
      "unit-super-heavy-tank",
    )).toMatchObject({
      requisitionCost: 20,
      stats: { maxHealth: 4, armor: 5, speed: 1, sensors: 0 },
      weapons: [{ damage: { count: 1, sides: 8 }, armorPiercing: 5, range: 3 }],
    });
  });

  it("hydrates Mechanized Infantry as an active non-cargo vehicle formation", () => {
    const definition = hydrateCompanionArmourPublicV1(
      COMPANION_MECHANIZED_INFANTRY_HANDLER_ID,
      "unit-mechanized-infantry",
    );
    expect(definition).toMatchObject({
      status: "active",
      requisitionCost: 10,
      stats: { healthModel: "HITS", maxHealth: 3, armor: 2, speed: 3, sensors: 0 },
      allowedActions: ["ATTACK"],
      weapons: [{ damage: { count: 1, sides: 4 }, armorPiercing: 0, range: 2 }],
    });
    expect(definition.tags).toEqual(expect.arrayContaining([
      "VEHICLE",
      "FORWARD_LINE_CONTROL",
      "INFANTRY_EQUIPMENT_ACCESS",
    ]));
    expect(definition.tags).not.toContain("PERSONNEL");
  });

  it("rejects mismatched handlers and definitions instead of falling through", () => {
    expect(() => hydrateCompanionArmourPublicV1(
      COMPANION_TANKS_HANDLER_ID,
      "unit-mechanized-infantry",
    )).toThrow(/unsupported companion tank definition/i);
    expect(() => hydrateCompanionArmourPublicV1(
      COMPANION_MECHANIZED_INFANTRY_HANDLER_ID,
      "unit-heavy-battle-tank",
    )).toThrow(/unsupported mechanized infantry definition/i);
    expect(() => hydrateCompanionArmourPublicV1(
      "unknown-handler",
      "unit-light-battle-tank",
    )).toThrow(/unsupported companion armour handler/i);
  });

  it("hydrates both executable unarmed mech chassis for fitted loadouts", () => {
    expect(hydrateCompanionArmourPublicV1(COMPANION_MECHS_HANDLER_ID, "unit-medium-mech")).toMatchObject({
      status: "active", requisitionCost: 14,
      stats: { healthModel: "HITS", maxHealth: 4, armor: 2, speed: 3, sensors: 0 },
      weapons: [], allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD", "DIG_IN"],
    });
    expect(hydrateCompanionArmourPublicV1(COMPANION_MECHS_HANDLER_ID, "unit-heavy-mech")).toMatchObject({
      status: "active", requisitionCost: 18,
      stats: { healthModel: "HITS", maxHealth: 5, armor: 3, speed: 2, sensors: 0 },
      weapons: [], allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD"],
    });
  });

  it("owns the Super Heavy dual-cannon Primary economy on the server", () => {
    expect(companionArmourActionEconomy("unit-super-heavy-tank", "ATTACK", "STANDARD")).toBe("PRIMARY");
    expect(companionArmourActionEconomy("unit-heavy-battle-tank", "ATTACK", "STANDARD")).toBe("STANDARD");
    expect(companionArmourActionEconomy("unit-super-heavy-tank", "CREW_REPAIR", "PRIMARY")).toBe("PRIMARY");
  });
});

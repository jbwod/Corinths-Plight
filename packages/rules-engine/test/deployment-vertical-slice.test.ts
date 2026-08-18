import type { CargoProfile, DeploymentPlanState, EffectiveUnit } from "../../domain/src";
import { describe, expect, it } from "vitest";
import { autoAssignCargo, createCampaignLoadoutSnapshot, validateDeploymentPlan } from "../src";

const hat: CargoProfile = {
  id: "cargo-hat-v5",
  capacitySlotsQuarters: 20,
  rules: [
    { id: "hat-infantry", cargoKind: "PERSONNEL", quantityPerSlot: 6 },
    { id: "hat-vehicle", cargoKind: "VEHICLE", slotsPerItemQuarters: 8 },
    { id: "hat-small", cargoKind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantityPerSlot: 5 },
    { id: "hat-medium", cargoKind: "SUPPLY", supplyType: "MEDIUM_SUPPLY", slotsPerItemQuarters: 8 },
    { id: "hat-large", cargoKind: "SUPPLY", supplyType: "LARGE_SUPPLY", slotsPerItemQuarters: 20 },
  ],
  allowMixedLoadGroups: true,
  embarkSpeedCostQuartersPerCargoSlot: 2,
  disembarkSpeedCostQuartersPerCargoSlot: 2,
};

function unit(id: string, methods: EffectiveUnit["deploymentMethods"] = ["STANDARD_GROUND", "PARADROP"]): EffectiveUnit {
  return {
    rulesetVersion: "v5-core-curated@1",
    definitionId: "unit-infantry-squad",
    persistentUnitId: id,
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6, armor: 1, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    tags: ["INFANTRY", "PERSONNEL"],
    weapons: [{ id: "weapon-light-at", name: "Light AT", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 1, ammoCapacity: 3, tags: ["ANTI_ARMOUR"] }],
    allowedActions: ["ATTACK", "LOAD", "UNLOAD"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    abilities: [],
    deploymentMethods: methods,
    equipmentInstanceIds: ["owned-at"],
    refitInstanceIds: [],
    ammunition: { "weapon-light-at": 3 },
    cooldowns: {},
    sourceHash: `hash-${id}`,
  };
}

function plan(): DeploymentPlanState {
  return {
    id: "plan-spearhead",
    campaignId: "campaign-spearhead",
    battalionId: "battalion-33",
    battlegroupId: "battlegroup-hammer",
    createdBy: "user-1",
    status: "DRAFT",
    revision: 1,
    method: "PARADROP",
    insertionHex: { q: 8, r: 11 },
    transportRoute: [{ q: 2, r: 8 }, { q: 8, r: 11 }, { q: 11, r: 12 }],
    unitSelections: [{ unitId: "raven-2", ownerId: "user-1", effectiveUnit: unit("raven-2"), ownerApproved: true, commandApproved: true }],
    transportAssignments: [{
      carrierUnitId: "atlas",
      profile: hat,
      cargo: [{ id: "cargo-raven-2", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"], unitId: "raven-2", transportMode: "AIRLIFTED" }],
    }],
  };
}

const context = {
  actorId: "user-1",
  canCommandBattlegroup: true,
  campaignOpen: true,
  availableMethods: ["STANDARD_GROUND", "VEHICLE_TRANSPORT", "VTOL_INSERTION", "HEAVY_AIR_TRANSPORT", "PARADROP"] as const,
  campaignInsertionHexes: [{ q: 8, r: 11 }],
  occupiedUnitIds: [] as string[],
  operationalCarrierIds: ["atlas"],
};

describe("contextual deployment planning", () => {
  it("accepts an approved on-path HAT paradrop using rules-defined capacity", () => {
    expect(validateDeploymentPlan(plan(), { ...context, availableMethods: [...context.availableMethods] })).toMatchObject({
      valid: true,
      errors: [],
      assignments: [{ carrierUnitId: "atlas", usedSlotsQuarters: 4, capacitySlotsQuarters: 20 }],
    });
  });

  it("explains off-route drops and over-capacity lift", () => {
    const invalid = plan();
    invalid.insertionHex = { q: 9, r: 9 };
    invalid.unitSelections[0].effectiveUnit = unit("raven-2", ["STANDARD_GROUND"]);
    invalid.transportAssignments[0].cargo.push({ id: "large", kind: "SUPPLY", supplyType: "LARGE_SUPPLY", quantity: 1, tags: [] });
    const result = validateDeploymentPlan(invalid, { ...context, availableMethods: [...context.availableMethods] });
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "INSERTION_HEX_INVALID",
      "DROP_POINT_OFF_ROUTE",
      "TRANSPORT_CAPACITY_INVALID",
    ]));
  });

  it("auto-assigns deterministically and leaves an incompatible heavy vehicle unassigned", () => {
    const assignment = plan().transportAssignments[0];
    assignment.cargo = [];
    const result = autoAssignCargo([
      { id: "raven", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"] },
      { id: "supply", kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5, tags: [] },
      { id: "super-heavy", kind: "VEHICLE", quantity: 3, tags: ["SUPER_HEAVY"] },
    ], [assignment]);
    expect(result.assignments[0].cargo.map((item) => item.id)).toEqual(["raven", "supply"]);
    expect(result.unassignedItemIds).toEqual(["super-heavy"]);
  });

  it("freezes the exact effective loadout, ammo, and insertion method into a stable snapshot", () => {
    const left = createCampaignLoadoutSnapshot({
      id: "snapshot-raven-2",
      campaignId: "campaign-spearhead",
      planId: "plan-spearhead",
      unit: unit("raven-2"),
      method: "PARADROP",
      carrierUnitId: "atlas",
      lockedAt: 1234,
    });
    const right = createCampaignLoadoutSnapshot({
      id: "snapshot-raven-2",
      campaignId: "campaign-spearhead",
      planId: "plan-spearhead",
      unit: unit("raven-2"),
      method: "PARADROP",
      carrierUnitId: "atlas",
      lockedAt: 1234,
    });
    expect(left).toEqual(right);
    expect(left.effectiveUnit.ammunition).toEqual({ "weapon-light-at": 3 });
    expect(left.snapshotHash).toMatch(/^[0-9a-f]{8}$/);
  });
});

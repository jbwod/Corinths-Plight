import type { CargoProfile, ReloadProfile, SupplyProfile, WeaponProfile } from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  attachTow,
  cargoSlotsUsed,
  disembarkCargo,
  embarkCargo,
  reloadAmmunition,
  transferProfiledSupply,
  validateCargoManifest,
  validateSupplyInventory,
} from "../src";

const transport: CargoProfile = {
  id: "hat-cargo",
  capacitySlotsQuarters: 20,
  rules: [
    { id: "personnel", cargoKind: "PERSONNEL", quantityPerSlot: 6, loadGroup: "units" },
    { id: "vehicle", cargoKind: "VEHICLE", slotsPerItemQuarters: 8, loadGroup: "units" },
    { id: "small", cargoKind: "SUPPLY", supplyType: "SMALL", quantityPerSlot: 5, loadGroup: "supply" },
    { id: "medium", cargoKind: "SUPPLY", supplyType: "MEDIUM", slotsPerItemQuarters: 8, loadGroup: "supply" },
    { id: "large", cargoKind: "SUPPLY", supplyType: "LARGE", slotsPerItemQuarters: 20, loadGroup: "supply" },
  ],
  allowMixedLoadGroups: true,
  embarkSpeedCostQuartersPerCargoSlot: 2,
  disembarkSpeedCostQuartersPerCargoSlot: 2,
  towCapacity: 1,
  towRequiredTags: ["TOWABLE_ARTILLERY"],
};

describe("cargo capacity and transport actions", () => {
  it("accounts in quarter-slots and enforces the five-slot HAT capacity", () => {
    const manifest = [
      { id: "squad", kind: "PERSONNEL" as const, quantity: 6, tags: [] },
      { id: "vehicle", kind: "VEHICLE" as const, quantity: 1, tags: ["LIGHT"] },
      { id: "shells", kind: "SUPPLY" as const, supplyType: "SMALL", quantity: 10, tags: [] },
    ];
    expect(validateCargoManifest(transport, manifest)).toMatchObject({ legal: true, slotsUsedQuarters: 20 });
    expect(
      validateCargoManifest(transport, [...manifest, { id: "extra", kind: "PERSONNEL", quantity: 1, tags: [] }]),
    ).toMatchObject({ legal: false, slotsUsedQuarters: 24 });
  });

  it("embarks, disembarks, and tows without mutating existing state", () => {
    const original = [{ id: "squad", kind: "PERSONNEL" as const, quantity: 6, tags: [] }];
    const embarked = embarkCargo(
      transport,
      original,
      { id: "vehicle", kind: "VEHICLE", quantity: 1, tags: ["LIGHT"] },
      4,
    );
    expect(embarked).toMatchObject({ legal: true, slotsUsedQuarters: 12, speedCostQuarters: 4 });
    expect(original).toHaveLength(1);
    expect(disembarkCargo(transport, embarked.manifest, ["vehicle"], 4)).toMatchObject({
      legal: true,
      slotsUsedQuarters: 4,
      speedCostQuarters: 4,
    });
    expect(attachTow(transport, [], { unitId: "artillery", tags: ["TOWABLE_ARTILLERY"] })).toEqual({
      legal: true,
      towedUnitIds: ["artillery"],
    });
    expect(cargoSlotsUsed(transport, original)).toBe(4);
  });

  it("supports fixed Standard-Action cargo costs without class-name branching", () => {
    const fixedCostTransport: CargoProfile = {
      ...transport,
      id: "standard-transport",
      embarkSpeedCostQuartersPerCargoSlot: undefined,
      disembarkSpeedCostQuartersPerCargoSlot: undefined,
      embarkFlatSpeedCostQuarters: 2,
      disembarkFlatSpeedCostQuarters: 2,
    };
    expect(
      embarkCargo(
        fixedCostTransport,
        [],
        { id: "vehicle", kind: "VEHICLE", quantity: 1, tags: ["LIGHT"] },
        2,
      ),
    ).toMatchObject({ legal: true, slotsUsedQuarters: 8, speedCostQuarters: 2 });
  });
});

const sourceSupply: SupplyProfile = {
  id: "logi-supply",
  capacities: { SMALL: 10 },
  totalCapacity: 10,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL"],
};
const healthLinkedSupply: SupplyProfile = {
  id: "engineer-supply",
  capacities: { SMALL: 4 },
  totalCapacity: 4,
  capacityPerCurrentHealth: 1,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL"],
};

describe("profiled Supply and reload", () => {
  it("retains casualty-created excess but prohibits loading more", () => {
    expect(validateSupplyInventory(healthLinkedSupply, { SMALL: 4 }, 2)).toMatchObject({
      legal: true,
      overCapacity: true,
      capacity: 2,
    });
    expect(
      transferProfiledSupply({
        sourceProfile: sourceSupply,
        destinationProfile: healthLinkedSupply,
        source: { SMALL: 5 },
        destination: { SMALL: 4 },
        sourceCurrentHealth: 1,
        destinationCurrentHealth: 2,
        type: "SMALL",
        quantity: 1,
      }),
    ).toMatchObject({ legal: false, reason: "Destination is already over capacity." });
  });

  it("transfers within capacity and reloads from an eligible facility", () => {
    expect(
      transferProfiledSupply({
        sourceProfile: sourceSupply,
        destinationProfile: healthLinkedSupply,
        source: { SMALL: 5 },
        destination: { SMALL: 1 },
        sourceCurrentHealth: 1,
        destinationCurrentHealth: 4,
        type: "SMALL",
        quantity: 2,
      }),
    ).toMatchObject({ legal: true, source: { SMALL: 3 }, destination: { SMALL: 3 } });

    const weapon: WeaponProfile = {
      id: "limited-weapon",
      name: "Limited weapon",
      damage: { count: 1, sides: 4 },
      range: 1,
      armorPiercing: 0,
      ammoCapacity: 3,
      tags: [],
    };
    const reload: ReloadProfile = {
      id: "field-reload",
      supplyType: "SMALL",
      supplyCost: 1,
      ammunitionPerAction: "FULL",
      requiresLanding: false,
      requiredFacilityTags: ["SUPPLY_POINT"],
      facilityTagMatch: "ANY",
      actionEconomy: "STANDARD",
    };
    expect(
      reloadAmmunition({
        profile: reload,
        weapon,
        currentAmmo: 0,
        supplies: { SMALL: 2 },
        landed: false,
        facilityTags: ["SUPPLY_POINT"],
      }),
    ).toEqual({
      legal: true,
      ammunitionAfter: 3,
      supplySpent: 1,
      supplies: { SMALL: 1 },
      actionEconomy: "STANDARD",
    });
  });
});

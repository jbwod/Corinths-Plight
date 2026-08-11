import type { CargoManifestItem, CargoProfile, ReloadProfile, SupplyProfile, WeaponProfile } from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  attachTow,
  cargoSlotsUsed,
  disembarkCargo,
  embarkCargo,
  getTacticalCargoProfile,
  reloadAmmunition,
  resupplyLogiTarget,
  synchronizeSupplyCargo,
  transferProfiledSupply,
  validateCargoManifest,
  validateSupplyInventory,
} from "../src";

describe("Logi field resupply", () => {
  it("derives Engineer and Medic resources without client-authored quantities", () => {
    expect(resupplyLogiTarget({
      source: { SMALL_SUPPLY: 3 },
      destination: { SMALL_SUPPLY: 1 },
      destinationTags: ["ENGINEER"],
      destinationCurrentHealth: 3,
    })).toMatchObject({
      legal: true,
      source: { SMALL_SUPPLY: 2 },
      destination: { SMALL_SUPPLY: 2 },
      purpose: "ENGINEER_STOCK",
      quantityRestored: 1,
    });
    expect(resupplyLogiTarget({
      source: { SMALL_SUPPLY: 3 },
      destination: { MEDICAL_SUPPLY: 1 },
      destinationTags: ["MEDICAL"],
      destinationCurrentHealth: 3,
    })).toMatchObject({
      legal: true,
      source: { SMALL_SUPPLY: 2 },
      destination: { MEDICAL_SUPPLY: 3 },
      purpose: "MEDICAL_RELOAD",
      quantityRestored: 2,
    });
  });

  it("fails closed for full or unsupported recipients", () => {
    expect(resupplyLogiTarget({
      source: { SMALL_SUPPLY: 1 },
      destination: { SMALL_SUPPLY: 3 },
      destinationTags: ["ENGINEER"],
      destinationCurrentHealth: 3,
    })).toMatchObject({ legal: false, reason: expect.stringContaining("capacity") });
    expect(resupplyLogiTarget({
      source: { SMALL_SUPPLY: 1 },
      destination: {},
      destinationTags: ["INFANTRY"],
      destinationCurrentHealth: 3,
    })).toMatchObject({ legal: false, reason: expect.stringContaining("no supported") });
  });
});

const transport: CargoProfile = {
  id: "hat-cargo",
  capacitySlotsQuarters: 20,
  rules: [
    { id: "personnel", cargoKind: "PERSONNEL", quantityPerSlot: 6, loadGroup: "units" },
    { id: "vehicle", cargoKind: "VEHICLE", slotsPerItemQuarters: 8, loadGroup: "units" },
    { id: "small", cargoKind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantityPerSlot: 5, loadGroup: "supply" },
    { id: "medium", cargoKind: "SUPPLY", supplyType: "MEDIUM_SUPPLY", slotsPerItemQuarters: 8, loadGroup: "supply" },
    { id: "large", cargoKind: "SUPPLY", supplyType: "LARGE_SUPPLY", slotsPerItemQuarters: 20, loadGroup: "supply" },
  ],
  allowMixedLoadGroups: true,
  embarkSpeedCostQuartersPerCargoSlot: 2,
  disembarkSpeedCostQuartersPerCargoSlot: 2,
  towCapacity: 1,
  towRequiredTags: ["TOWABLE_ARTILLERY"],
};

describe("cargo capacity and transport actions", () => {
  it("accounts in quarter-slots and enforces the five-slot HAT capacity", () => {
    const manifest: CargoManifestItem[] = [
      { id: "squad", kind: "PERSONNEL" as const, quantity: 6, tags: [] },
      { id: "vehicle", kind: "VEHICLE" as const, quantity: 1, tags: ["LIGHT"] },
      { id: "shells", kind: "SUPPLY" as const, supplyType: "SMALL_SUPPLY", quantity: 10, tags: [] },
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
    const towingProfile: CargoProfile = {
      ...transport,
      embarkSpeedCostQuartersPerCargoSlot: undefined,
      disembarkSpeedCostQuartersPerCargoSlot: undefined,
      embarkFlatSpeedCostQuarters: 2,
      disembarkFlatSpeedCostQuarters: 2,
    };
    const towed = embarkCargo(towingProfile, original, {
      id: "artillery",
      kind: "VEHICLE",
      quantity: 1,
      tags: ["TOWABLE_ARTILLERY"],
      transportMode: "TOWED",
      unitId: "artillery",
    }, 2);
    expect(towed).toMatchObject({ legal: true, slotsUsedQuarters: 4, speedCostQuarters: 2 });
    expect(cargoSlotsUsed(transport, original)).toBe(4);
  });

  it("rebuilds carried Small Supply from the authoritative inventory and consumes capacity", () => {
    const manifest = synchronizeSupplyCargo(transport, [], { SMALL_SUPPLY: 5 }, "carrier:supply");
    expect(manifest).toEqual([expect.objectContaining({
      id: "carrier:supply:SMALL_SUPPLY",
      kind: "SUPPLY",
      quantity: 5,
      supplyType: "SMALL_SUPPLY",
      transportMode: "STOWED",
    })]);
    expect(validateCargoManifest(transport, manifest)).toMatchObject({ legal: true, slotsUsedQuarters: 4 });
    expect(synchronizeSupplyCargo(transport, manifest, { SMALL_SUPPLY: 10 }, "carrier:supply"))
      .toEqual([expect.objectContaining({ quantity: 10 })]);
  });

  it("keeps the Light Vehicle's passenger and Small Supply modes mutually exclusive", () => {
    const profile = getTacticalCargoProfile("unit-light-vehicle")!;
    const supply = synchronizeSupplyCargo(profile, [], { SMALL_SUPPLY: 1 }, "light-vehicle:supply");
    expect(validateCargoManifest(profile, supply)).toMatchObject({ legal: true, slotsUsedQuarters: 4 });
    expect(embarkCargo(profile, supply, {
      id: "scouts",
      kind: "PERSONNEL",
      quantity: 4,
      tags: ["PERSONNEL", "INFANTRY"],
      unitId: "scouts",
    }, 2)).toMatchObject({ legal: false, reason: "Carrier cannot mix these cargo load groups." });
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
  capacities: { SMALL_SUPPLY: 10 },
  totalCapacity: 10,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL_SUPPLY"],
};
const healthLinkedSupply: SupplyProfile = {
  id: "engineer-supply",
  capacities: { SMALL_SUPPLY: 4 },
  totalCapacity: 4,
  capacityPerCurrentHealth: 1,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL_SUPPLY"],
};

describe("profiled Supply and reload", () => {
  it("retains casualty-created excess but prohibits loading more", () => {
    expect(validateSupplyInventory(healthLinkedSupply, { SMALL_SUPPLY: 4 }, 2)).toMatchObject({
      legal: true,
      overCapacity: true,
      capacity: 2,
    });
    expect(
      transferProfiledSupply({
        sourceProfile: sourceSupply,
        destinationProfile: healthLinkedSupply,
        source: { SMALL_SUPPLY: 5 },
        destination: { SMALL_SUPPLY: 4 },
        sourceCurrentHealth: 1,
        destinationCurrentHealth: 2,
        type: "SMALL_SUPPLY",
        quantity: 1,
      }),
    ).toMatchObject({ legal: false, reason: "Destination is already over capacity." });
  });

  it("transfers within capacity and reloads from an eligible facility", () => {
    expect(
      transferProfiledSupply({
        sourceProfile: sourceSupply,
        destinationProfile: healthLinkedSupply,
        source: { SMALL_SUPPLY: 5 },
        destination: { SMALL_SUPPLY: 1 },
        sourceCurrentHealth: 1,
        destinationCurrentHealth: 4,
        type: "SMALL_SUPPLY",
        quantity: 2,
      }),
    ).toMatchObject({ legal: true, source: { SMALL_SUPPLY: 3 }, destination: { SMALL_SUPPLY: 3 } });

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
      supplyType: "SMALL_SUPPLY",
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
        supplies: { SMALL_SUPPLY: 2 },
        landed: false,
        facilityTags: ["SUPPLY_POINT"],
      }),
    ).toEqual({
      legal: true,
      ammunitionAfter: 3,
      supplySpent: 1,
      supplies: { SMALL_SUPPLY: 1 },
      actionEconomy: "STANDARD",
    });
  });
});

import { describe, expect, it } from "vitest";
import { V5_CORE_CURATED_2_CATALOGUE } from "../src/generated/v5-core-curated-2";
import { hydrateGovernedCargoProfile } from "../src";

function generatedCargo(id: string) {
  const definition = V5_CORE_CURATED_2_CATALOGUE.content.cargoProfiles.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing generated cargo profile ${id}`);
  return hydrateGovernedCargoProfile({ id: definition.id, parameters: definition.parameters });
}

describe("governed cargo hydration", () => {
  it("preserves shared slot conversions, exact resource vocabulary, loading cost, and tow", () => {
    expect(generatedCargo("cargo-hat-five-slot")).toMatchObject({
      ok: true,
      profile: {
        id: "cargo-hat-five-slot",
        capacity: {
          kind: "SLOT_CONVERSIONS",
          slotCapacityQuarters: 20,
          mixedLoadingPolicy: "SHARED_SLOT_CAPACITY",
          tow: null,
          conversions: [
            {
              kind: "MAXIMUM_FORCE_STRENGTH",
              itemTagsAny: ["INFANTRY"],
              maximumForceStrength: 6,
              slotCostQuarters: 4,
            },
            { kind: "TAGGED_ITEM", itemTagsAny: ["VEHICLE"], slotCostQuarters: 8 },
            { kind: "RESOURCE_QUANTITY", resourceType: "SMALL_SUPPLY", quantity: 5, slotCostQuarters: 4 },
            { kind: "RESOURCE_QUANTITY", resourceType: "MEDIUM_SUPPLY", quantity: 1, slotCostQuarters: 8 },
            { kind: "RESOURCE_QUANTITY", resourceType: "LARGE_SUPPLY", quantity: 1, slotCostQuarters: 20 },
          ],
        },
        loading: {
          cost: { kind: "STANDARD_ACTION_PER_SLOT", costPerCargoSlotQuarters: 2 },
          clearAirdropAlongRoute: true,
          requiresPermissionForForeignUnit: null,
          conflictIds: ["RC-V5-010", "RC-V5-018"],
        },
      },
    });

    expect(generatedCargo("cargo-logi-two-slot")).toMatchObject({
      ok: true,
      profile: {
        capacity: {
          kind: "SLOT_CONVERSIONS",
          slotCapacityQuarters: 8,
          mixedLoadingPolicy: "SHARED_SLOT_CAPACITY",
          tow: { count: 1, itemTagsAny: ["ARTILLERY"] },
        },
        loading: {
          cost: { kind: "STANDARD_ACTION" },
          requiresPermissionForForeignUnit: true,
        },
      },
    });
  });

  it("preserves maximum-FS capacity without inventing slots", () => {
    expect(generatedCargo("cargo-ifv-infantry")).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        id: "cargo-ifv-infantry",
        capacity: {
          kind: "MAXIMUM_FORCE_STRENGTH",
          itemTagsAny: ["INFANTRY"],
          maximumForceStrength: 6,
          mixedLoadingPolicy: "NOT_APPLICABLE",
          tow: null,
        },
        loading: {
          cost: { kind: "STANDARD_ACTION" },
          clearAirdropAlongRoute: null,
          requiresPermissionForForeignUnit: null,
          conflictIds: null,
        },
        definition: {},
      },
    });
  });

  it("preserves mutually-exclusive alternative modes", () => {
    expect(generatedCargo("cargo-light-vehicle")).toMatchObject({
      ok: true,
      profile: {
        capacity: {
          kind: "ALTERNATIVE_MODES",
          mixedLoadingPolicy: "MUTUALLY_EXCLUSIVE",
          tow: null,
          modes: [
            {
              kind: "MAXIMUM_FORCE_STRENGTH",
              itemTagsAny: ["INFANTRY"],
              maximumForceStrength: 4,
            },
            { kind: "RESOURCE_QUANTITY", resourceType: "SMALL_SUPPLY", quantity: 1 },
          ],
        },
      },
    });
    expect(generatedCargo("cargo-vtol-alternative")).toMatchObject({
      ok: true,
      profile: {
        capacity: {
          kind: "ALTERNATIVE_MODES",
          mixedLoadingPolicy: "MUTUALLY_EXCLUSIVE",
          modes: [
            { kind: "MAXIMUM_FORCE_STRENGTH", maximumForceStrength: 6 },
            { kind: "RESOURCE_QUANTITY", resourceType: "SMALL_SUPPLY", quantity: 2 },
          ],
        },
        loading: { conflictIds: ["RC-V5-017"] },
      },
    });
  });

  it("hydrates every generated @2 cargo profile", () => {
    expect(V5_CORE_CURATED_2_CATALOGUE.content.cargoProfiles.map((definition) =>
      hydrateGovernedCargoProfile({ id: definition.id, parameters: definition.parameters }).ok,
    )).toEqual([true, true, true, true, true, true, true, true]);
  });

  it.each([
    [
      "unknown parameter field",
      { capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6 }, loadingRules: { standardAction: true }, definition: {}, extra: true },
      "UNKNOWN_FIELD",
      "$.parameters.extra",
    ],
    [
      "shortened resource vocabulary",
      { capacity: { alternativeModes: [{ itemTagsAny: ["INFANTRY"], maximumFS: 6 }, { resourceType: "SMALL", quantity: 2 }] }, loadingRules: { standardAction: true }, definition: {} },
      "UNKNOWN_RESOURCE_TYPE",
      "$.parameters.capacity.alternativeModes[1].resourceType",
    ],
    [
      "mixed capacity shapes",
      { capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6, alternativeModes: [] }, loadingRules: { standardAction: true }, definition: {} },
      "AMBIGUOUS_CAPACITY_SHAPE",
      "$.parameters.capacity",
    ],
    [
      "conversion without slot cost",
      { capacity: { slotCapacityQuarters: 8, conversions: [{ itemTagsAny: ["VEHICLE"] }] }, loadingRules: { standardAction: true }, definition: {} },
      "REQUIRED_FIELD",
      "$.parameters.capacity.conversions[0].slotCostQuarters",
    ],
    [
      "unknown tow field",
      { capacity: { slotCapacityQuarters: 8, conversions: [{ itemTagsAny: ["VEHICLE"], slotCostQuarters: 8 }], tow: { count: 1, itemTagsAny: ["ARTILLERY"], range: 2 } }, loadingRules: { standardAction: true }, definition: {} },
      "UNKNOWN_FIELD",
      "$.parameters.capacity.tow.range",
    ],
    [
      "ambiguous loading action cost",
      { capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6 }, loadingRules: { standardAction: true, standardActionCostPerSlotQuarters: 2 }, definition: {} },
      "AMBIGUOUS_LOADING_COST_MODE",
      "$.parameters.loadingRules",
    ],
    [
      "disabled Standard Action",
      { capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6 }, loadingRules: { standardAction: false }, definition: {} },
      "LOADING_COST_MODE_REQUIRED",
      "$.parameters.loadingRules.standardAction",
    ],
  ])("rejects %s", (_label, parameters, code, path) => {
    expect(hydrateGovernedCargoProfile({ id: "cargo-invalid", parameters })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code, path })],
    });
  });

  it("does not mutate or retain aliases to its input", () => {
    const parameters = {
      capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6 },
      loadingRules: { standardAction: true },
      definition: { provenance: { conflict: "RC-TEST" } },
    };
    const result = hydrateGovernedCargoProfile({ id: "cargo-test", parameters });
    expect(result.ok).toBe(true);
    parameters.capacity.maximumFS = 9;
    parameters.definition.provenance.conflict = "changed";
    if (!result.ok) throw new Error("Expected hydration to succeed.");
    expect(result.profile.capacity).toMatchObject({ maximumForceStrength: 6 });
    expect(result.profile.definition).toEqual({ provenance: { conflict: "RC-TEST" } });
  });

  it("rejects non-JSON definition values instead of silently deleting them", () => {
    expect(hydrateGovernedCargoProfile({
      id: "cargo-invalid-definition",
      parameters: {
        capacity: { itemTagsAny: ["INFANTRY"], maximumFS: 6 },
        loadingRules: { standardAction: true },
        definition: { unsupported: undefined },
      },
    })).toEqual({
      ok: false,
      issues: [expect.objectContaining({
        code: "JSON_OBJECT_REQUIRED",
        path: "$.parameters.definition.unsupported",
      })],
    });
  });

  it("rejects non-plain input objects", () => {
    expect(hydrateGovernedCargoProfile({ id: "cargo-invalid", parameters: new Date() })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "OBJECT_REQUIRED", path: "$.parameters" })],
    });
  });
});

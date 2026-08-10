import { describe, expect, it } from "vitest";
import { hydrateGovernedSupplyProfile } from "../src";
import { V5_CORE_CURATED_2_CATALOGUE } from "../src/generated/v5-core-curated-2";

function generatedSupply(id: string) {
  const definition = V5_CORE_CURATED_2_CATALOGUE.content.supplyProfiles.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing generated supply profile ${id}`);
  return hydrateGovernedSupplyProfile({ id: definition.id, parameters: definition.parameters });
}

describe("governed supply-profile hydration", () => {
  it("goldens aerospace fixed Main Ammunition and nullable facility reload rules", () => {
    expect(generatedSupply("supply-aerospace-main-ammo")).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        id: "supply-aerospace-main-ammo",
        capacities: {
          MAIN_AMMUNITION: { kind: "FIXED_MAXIMUM", maximum: 1, capacityFormula: null },
        },
        reloadRules: {
          overCapacityPolicy: null,
          refillToMaximum: null,
          sourceResource: null,
          sourceQuantity: null,
          facilityCapability: "REARM_AEROSPACE",
          requiresLanded: true,
          economy: "PRIMARY",
          resourceQuantity: "SCENARIO_DEFINED",
          costPerRoundOfFire: null,
          conflictIds: ["RC-V5-023"],
        },
        definition: {},
      },
    });
  });

  it("goldens artillery fixed Small Supply and fire cost", () => {
    expect(generatedSupply("supply-artillery-small-two")).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        id: "supply-artillery-small-two",
        capacities: {
          SMALL_SUPPLY: { kind: "FIXED_MAXIMUM", maximum: 2, capacityFormula: null },
        },
        reloadRules: {
          overCapacityPolicy: null,
          refillToMaximum: null,
          sourceResource: null,
          sourceQuantity: null,
          facilityCapability: null,
          requiresLanded: null,
          economy: null,
          resourceQuantity: null,
          costPerRoundOfFire: 1,
          conflictIds: ["RC-V5-011"],
        },
        definition: {},
      },
    });
  });

  it("goldens Engineer CURRENT_FS capacity and retain/block policy", () => {
    expect(generatedSupply("supply-engineer-current-fs")).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        id: "supply-engineer-current-fs",
        capacities: {
          SMALL_SUPPLY: { kind: "CURRENT_FS", maximum: 4, capacityFormula: "CURRENT_FS" },
        },
        reloadRules: {
          overCapacityPolicy: "RETAIN_AND_BLOCK_LOADING",
          refillToMaximum: null,
          sourceResource: null,
          sourceQuantity: null,
          facilityCapability: null,
          requiresLanded: null,
          economy: null,
          resourceQuantity: null,
          costPerRoundOfFire: null,
          conflictIds: ["RC-V5-029"],
        },
        definition: {},
      },
    });
  });

  it("goldens Medical CURRENT_FS refill and exact source resource", () => {
    expect(generatedSupply("supply-medical-current-fs")).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        id: "supply-medical-current-fs",
        capacities: {
          MEDICAL_SUPPLY: { kind: "CURRENT_FS", maximum: 4, capacityFormula: "CURRENT_FS" },
        },
        reloadRules: {
          overCapacityPolicy: "RETAIN_AND_BLOCK_LOADING",
          refillToMaximum: true,
          sourceResource: "SMALL_SUPPLY",
          sourceQuantity: 1,
          facilityCapability: null,
          requiresLanded: null,
          economy: null,
          resourceQuantity: null,
          costPerRoundOfFire: null,
          conflictIds: ["RC-V5-029"],
        },
        definition: {},
      },
    });
  });

  it("hydrates every generated @2 supply profile", () => {
    expect(V5_CORE_CURATED_2_CATALOGUE.content.supplyProfiles.map((definition) =>
      hydrateGovernedSupplyProfile({ id: definition.id, parameters: definition.parameters }).ok,
    )).toEqual([true, true, true, true]);
  });

  it.each([
    [
      "unknown top-level field",
      { capacities: { SMALL_SUPPLY: { maximum: 2 } }, reloadRules: {}, definition: {}, extra: true },
      "UNKNOWN_FIELD",
      "$.parameters.extra",
    ],
    [
      "unknown capacity field",
      { capacities: { SMALL_SUPPLY: { maximum: 2, unit: "CRATE" } }, reloadRules: {}, definition: {} },
      "UNKNOWN_FIELD",
      "$.parameters.capacities.SMALL_SUPPLY.unit",
    ],
    [
      "ambiguous legacy strategic resource ID",
      { capacities: { SMALL: { maximum: 2 } }, reloadRules: {}, definition: {} },
      "RESOURCE_ID_AMBIGUOUS",
      "$.parameters.capacities.SMALL",
    ],
    [
      "non-canonical resource ID",
      { capacities: { small_supply: { maximum: 2 } }, reloadRules: {}, definition: {} },
      "RESOURCE_ID_NOT_CANONICAL",
      "$.parameters.capacities.small_supply",
    ],
    [
      "unknown capacity formula",
      { capacities: { SMALL_SUPPLY: { maximum: 2, capacityFormula: "MAXIMUM_FS" } }, reloadRules: {}, definition: {} },
      "CAPACITY_FORMULA_UNKNOWN",
      "$.parameters.capacities.SMALL_SUPPLY.capacityFormula",
    ],
    [
      "unknown reload field",
      { capacities: { SMALL_SUPPLY: { maximum: 2 } }, reloadRules: { freeReload: true }, definition: {} },
      "UNKNOWN_FIELD",
      "$.parameters.reloadRules.freeReload",
    ],
    [
      "ambiguous legacy source resource",
      { capacities: { MEDICAL_SUPPLY: { maximum: 4 } }, reloadRules: { sourceResource: "SMALL", sourceQuantity: 1 }, definition: {} },
      "RESOURCE_ID_AMBIGUOUS",
      "$.parameters.reloadRules.sourceResource",
    ],
    [
      "unpaired source resource",
      { capacities: { MEDICAL_SUPPLY: { maximum: 4 } }, reloadRules: { sourceResource: "SMALL_SUPPLY" }, definition: {} },
      "SOURCE_PAIR_REQUIRED",
      "$.parameters.reloadRules",
    ],
    [
      "unknown facility capability",
      { capacities: { MAIN_AMMUNITION: { maximum: 1 } }, reloadRules: { facilityCapability: "ANY_DEPOT" }, definition: {} },
      "ENUM_VALUE_UNKNOWN",
      "$.parameters.reloadRules.facilityCapability",
    ],
  ])("rejects %s", (_label, parameters, code, path) => {
    expect(hydrateGovernedSupplyProfile({ id: "supply-invalid", parameters })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code, path })],
    });
  });

  it("does not mutate or retain aliases to definition input", () => {
    const parameters = {
      capacities: { SMALL_SUPPLY: { maximum: 2 } },
      reloadRules: { conflictIds: ["RC-TEST"] },
      definition: { provenance: { source: "test" } },
    };
    const result = hydrateGovernedSupplyProfile({ id: "supply-test", parameters });
    expect(result.ok).toBe(true);
    parameters.capacities.SMALL_SUPPLY.maximum = 9;
    parameters.reloadRules.conflictIds[0] = "changed";
    parameters.definition.provenance.source = "changed";
    if (!result.ok) throw new Error("Expected supply hydration to succeed.");
    expect(result.profile.capacities.SMALL_SUPPLY).toMatchObject({ maximum: 2 });
    expect(result.profile.reloadRules.conflictIds).toEqual(["RC-TEST"]);
    expect(result.profile.definition).toEqual({ provenance: { source: "test" } });
  });

  it("rejects non-JSON definition values", () => {
    expect(hydrateGovernedSupplyProfile({
      id: "supply-invalid",
      parameters: {
        capacities: { SMALL_SUPPLY: { maximum: 2 } },
        reloadRules: {},
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
    expect(hydrateGovernedSupplyProfile({ id: "supply-invalid", parameters: new Date() })).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "OBJECT_REQUIRED", path: "$.parameters" })],
    });
  });
});

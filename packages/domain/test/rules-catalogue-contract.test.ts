import { describe, expect, test } from "vitest";

import {
  RULES_CATALOGUE_SCHEMA_VERSION,
  RulesCatalogueContractError,
  createRulesCatalogueEnvelope,
  parseRulesCatalogueEnvelope,
  type RulesCatalogueContentV1,
} from "../src/rules-catalogue-contract";

function fixture(): RulesCatalogueContentV1 {
  return {
    schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION,
    ruleset: {
      id: "ruleset-test",
      version: "test@1",
      name: "Test",
      engineVersion: "test-engine",
      authorityNotes: "Contract fixture.",
    },
    sources: [],
    conflicts: [],
    canonicalUnitIds: ["unit-test"],
    companionUnitIds: [],
    units: [{
      id: "unit-test",
      kind: "UNIT",
      name: "Test Unit",
      definitionStatus: "unspecified",
      sourceId: null,
      sourcePath: "fixture",
      sourceLocator: null,
      notes: "",
      sourcedNumbers: { sensorRange: { status: "SCENARIO_DEFINED", value: null } },
      references: [],
      parameters: {},
    }],
    weapons: [],
    equipment: [],
    actions: [],
    orders: [],
    structures: [],
    terrain: [],
    ships: [],
    enemies: [],
    movementProfiles: [],
    durabilityProfiles: [],
    cargoProfiles: [],
    supplyProfiles: [],
    deploymentProfiles: [],
    deploymentMethods: [],
    tags: [],
    abilities: [],
    statusEffects: [],
    shipCapabilities: [],
    handlers: [],
    overlays: [],
    relations: {
      unitProfiles: [],
      unitTags: [],
      unitAbilities: [],
      unitWeapons: [],
      unitEquipmentSlots: [],
      equipmentEligibility: [],
      equipmentEffects: [],
      shipModuleCapabilityGrants: [],
    },
  };
}

describe("rules catalogue contract", () => {
  test("hashes and verifies a strict envelope", async () => {
    const envelope = await createRulesCatalogueEnvelope(fixture());

    expect(envelope.contentHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(parseRulesCatalogueEnvelope(envelope)).resolves.toEqual(envelope);
  });

  test("rejects hash drift and published nulls", async () => {
    const envelope = await createRulesCatalogueEnvelope(fixture());
    await expect(parseRulesCatalogueEnvelope({ ...envelope, contentHash: "0".repeat(64) })).rejects.toBeInstanceOf(RulesCatalogueContractError);

    const invalid = fixture();
    invalid.units[0].sourcedNumbers.sensorRange = { status: "PUBLISHED", value: null };
    await expect(createRulesCatalogueEnvelope(invalid)).rejects.toBeInstanceOf(RulesCatalogueContractError);
  });
});

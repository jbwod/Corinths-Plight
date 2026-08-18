import { describe, expect, test } from "vitest";

import {
  RULES_CATALOGUE_CONTENT_TYPE,
  type RuleAvailabilityStatusV1,
  type RuleImplementationOverlayV1,
  type RuleRelationRecordV1,
  type RulesCatalogueContentV1,
  type RulesCatalogueEnvelopeV1,
} from "../../domain/src";
import { createRulesCatalogueRuntime, verifyCatalogueHandlerRegistry } from "../src";

const emptyRelations: RulesCatalogueContentV1["relations"] = {
  unitProfiles: [],
  unitTags: [],
  unitAbilities: [],
  unitWeapons: [],
  unitEquipmentSlots: [],
  equipmentEligibility: [],
  equipmentEffects: [],
  shipModuleCapabilityGrants: [],
};

function overlay(
  definitionId: string,
  availabilityStatus: RuleAvailabilityStatusV1,
  executable: boolean,
  handlerId: string | null,
): RuleImplementationOverlayV1 {
  return {
    definitionKind: "UNIT",
    definitionId,
    implementationStatus: executable ? "IMPLEMENTED" : "PARTIAL",
    requisitionStatus: "PUBLISHED",
    availabilityStatus,
    executable,
    purchasable: availabilityStatus === "AVAILABLE",
    handlerId,
    reasonCode: availabilityStatus === "AVAILABLE" ? null : `NOT_${availabilityStatus}`,
    sourcePath: "rules/test.md",
    sourceLocator: definitionId,
    parameters: {},
  };
}

function fixture(): RulesCatalogueEnvelopeV1 {
  const unitProfileRelation: RuleRelationRecordV1 = {
    id: "relation-unit-alpha-movement",
    kind: "UNIT_PROFILE",
    from: { definitionKind: "UNIT", definitionId: "unit-alpha" },
    to: { definitionKind: "MOVEMENT_PROFILE", definitionId: "movement-ground" },
    ordinal: 0,
    sourceId: "source-v5",
    sourcePath: null,
    sourceLocator: "movement",
    sourcedNumbers: {
      transitionCost: { status: "NOT_APPLICABLE", value: null },
    },
    parameters: {},
  };

  return {
    schemaVersion: 1,
    contentType: RULES_CATALOGUE_CONTENT_TYPE,
    contentHash: "a".repeat(64),
    content: {
      schemaVersion: 1,
      ruleset: {
        id: "ruleset-test",
        version: "test@1",
        name: "Test catalogue",
        engineVersion: "1",
        authorityNotes: "Fixture",
      },
      sources: [{
        id: "source-v5",
        path: "rules/test.md",
        sha256: null,
        authorityRank: 1,
        status: "PRIMARY",
        notes: "Fixture",
      }],
      conflicts: [],
      canonicalUnitIds: ["unit-alpha", "unit-blocked", "unit-development"],
      companionUnitIds: [],
      units: [
        {
          id: "unit-alpha",
          kind: "UNIT",
          name: "Alpha",
          definitionStatus: "active",
          sourceId: "source-v5",
          sourcePath: null,
          sourceLocator: "alpha",
          notes: "",
          sourcedNumbers: {
            sensors: { status: "SCENARIO_DEFINED", value: null },
            speed: { status: "PUBLISHED", value: 1 },
          },
          references: [],
          parameters: {},
        },
        {
          id: "unit-blocked",
          kind: "UNIT",
          name: "Blocked",
          definitionStatus: "incomplete",
          sourceId: "source-v5",
          sourcePath: null,
          sourceLocator: "blocked",
          notes: "",
          sourcedNumbers: {},
          references: [],
          parameters: {},
        },
        {
          id: "unit-development",
          kind: "UNIT",
          name: "Development",
          definitionStatus: "experimental",
          sourceId: "source-v5",
          sourcePath: null,
          sourceLocator: "development",
          notes: "",
          sourcedNumbers: {},
          references: [],
          parameters: {},
        },
      ],
      weapons: [],
      equipment: [],
      actions: [],
      orders: [],
      structures: [],
      terrain: [],
      ships: [],
      enemies: [],
      movementProfiles: [{
        id: "movement-ground",
        kind: "MOVEMENT_PROFILE",
        name: "Ground",
        definitionStatus: "active",
        sourceId: "source-v5",
        sourcePath: null,
        sourceLocator: "movement-ground",
        notes: "",
        sourcedNumbers: {},
        references: [],
        parameters: {},
      }],
      durabilityProfiles: [],
      cargoProfiles: [],
      supplyProfiles: [],
      deploymentProfiles: [],
      deploymentMethods: [],
      tags: [],
      abilities: [],
      statusEffects: [],
      shipCapabilities: [],
      handlers: [
        { id: "handler-unit-alpha", kind: "UNIT", evidence: {} },
        { id: "handler-unit-development", kind: "UNIT", evidence: {} },
      ],
      overlays: [
        overlay("unit-alpha", "AVAILABLE", true, "handler-unit-alpha"),
        overlay("unit-blocked", "BLOCKED", false, null),
        overlay("unit-development", "DEV_ONLY", true, "handler-unit-development"),
      ],
      relations: {
        ...emptyRelations,
        unitProfiles: [unitProfileRelation],
      },
    },
  };
}

function runtimeFrom(envelope = fixture()) {
  const result = createRulesCatalogueRuntime(
    envelope,
    new Set(["handler-unit-alpha", "handler-unit-development"]),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected the fixture registry to match the catalogue.");
  return result.runtime;
}

describe("rules catalogue runtime", () => {
  test("builds immutable typed indexes and preserves nullable sourced numbers", () => {
    const envelope = fixture();
    const runtime = runtimeFrom(envelope);

    envelope.content.units[0].name = "Mutated source";
    envelope.content.units[0].sourcedNumbers.sensors = { status: "PUBLISHED", value: 0 };

    const unit = runtime.lookupDefinition("UNIT", "unit-alpha");
    expect(unit).toEqual({
      found: true,
      value: expect.objectContaining({
        id: "unit-alpha",
        name: "Alpha",
        sourcedNumbers: {
          sensors: { status: "SCENARIO_DEFINED", value: null },
          speed: { status: "PUBLISHED", value: 1 },
        },
      }),
    });
    expect(unit.found && Object.isFrozen(unit.value.sourcedNumbers.sensors)).toBe(true);
    expect(Object.isFrozen(runtime.listDefinitions("UNIT"))).toBe(true);

    expect(runtime.lookupDefinition("WEAPON", "unit-alpha")).toEqual({
      found: false,
      code: "DEFINITION_KIND_MISMATCH",
      id: "unit-alpha",
      expectedKind: "WEAPON",
      actualKind: "UNIT",
    });
    expect(runtime.lookupDefinition("UNIT", "unit-missing")).toEqual({
      found: false,
      code: "DEFINITION_NOT_FOUND",
      id: "unit-missing",
    });

    const relation = runtime.lookupRelation("relation-unit-alpha-movement");
    expect(relation.found && relation.value.sourcedNumbers.transitionCost).toEqual({
      status: "NOT_APPLICABLE",
      value: null,
    });
    expect(runtime.relationsFrom({ definitionKind: "UNIT", definitionId: "unit-alpha" })).toHaveLength(1);
    expect(runtime.relationsTo({ definitionKind: "MOVEMENT_PROFILE", definitionId: "movement-ground" })).toHaveLength(1);
    expect(Object.isFrozen(runtime.relationsFrom({ definitionKind: "UNIT", definitionId: "unit-alpha" }))).toBe(true);
  });

  test("returns availability and executability decisions without class lookup exceptions", () => {
    const runtime = runtimeFrom();

    expect(runtime.decide("UNIT", "unit-alpha")).toMatchObject({
      availability: { allowed: true, code: "AVAILABLE", status: "AVAILABLE" },
      executability: { allowed: true, code: "EXECUTABLE", handlerId: "handler-unit-alpha" },
      purchasable: true,
    });
    expect(runtime.decide("UNIT", "unit-blocked")).toMatchObject({
      availability: { allowed: false, code: "BLOCKED", status: "BLOCKED" },
      executability: { allowed: false, code: "UNAVAILABLE", handlerId: null },
      purchasable: false,
    });
    expect(runtime.decide("UNIT", "unit-development")).toMatchObject({
      availability: { allowed: false, code: "DEV_ONLY", status: "DEV_ONLY" },
      executability: { allowed: false, code: "UNAVAILABLE" },
    });
    expect(runtime.decide("UNIT", "unit-development", "DEVELOPMENT")).toMatchObject({
      availability: { allowed: true, code: "AVAILABLE_IN_DEVELOPMENT", status: "DEV_ONLY" },
      executability: { allowed: true, code: "EXECUTABLE", handlerId: "handler-unit-development" },
    });

    expect(() => runtime.decide("UNIT", "unit-not-in-catalogue")).not.toThrow();
    expect(runtime.decide("UNIT", "unit-not-in-catalogue")).toEqual({
      definition: null,
      overlay: null,
      availability: { allowed: false, code: "DEFINITION_NOT_FOUND", status: null },
      executability: { allowed: false, code: "DEFINITION_NOT_FOUND", handlerId: null },
      purchasable: false,
    });
  });

  test("fails closed when caller handler IDs do not exactly match catalogue declarations", () => {
    const envelope = fixture();
    const issues = verifyCatalogueHandlerRegistry(
      envelope,
      new Set(["handler-unit-alpha", "handler-not-declared"]),
    );

    expect(issues).toEqual([
      {
        code: "REGISTRY_HANDLER_NOT_DECLARED",
        handlerId: "handler-not-declared",
        message: "Caller-supplied handler handler-not-declared is not declared by the catalogue.",
      },
      {
        code: "CATALOGUE_HANDLER_MISSING_FROM_REGISTRY",
        handlerId: "handler-unit-development",
        message: "Catalogue handler handler-unit-development has no caller-supplied implementation.",
      },
    ]);
    expect(Object.isFrozen(issues)).toBe(true);
    expect(createRulesCatalogueRuntime(envelope, new Set(["handler-unit-alpha", "handler-not-declared"]))).toEqual({
      ok: false,
      issues,
    });
  });
});

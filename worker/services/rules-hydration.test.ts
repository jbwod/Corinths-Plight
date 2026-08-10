import { describe, expect, test } from "vitest";

import {
  rehydratePinnedUnitRulesAuthority,
  resolveEquipmentRulesAuthority,
  resolveUnitRulesAuthority,
  serverRulesCatalogueRuntime,
  type D1EquipmentRulesInput,
  type D1UnitRulesInput,
} from "./rules-hydration";

function profileBindings(definitionId: string): Pick<
  D1UnitRulesInput,
  "movementProfileId" | "durabilityProfileId" | "cargoProfileId" | "supplyProfileId" | "deploymentProfileId"
> {
  const result = {
    movementProfileId: "",
    durabilityProfileId: "",
    cargoProfileId: null as string | null,
    supplyProfileId: null as string | null,
    deploymentProfileId: null as string | null,
  };
  for (const relation of serverRulesCatalogueRuntime.relationsFrom({ definitionKind: "UNIT", definitionId })) {
    if (relation.kind !== "UNIT_PROFILE" || !relation.to) continue;
    if (relation.to.definitionKind === "MOVEMENT_PROFILE") result.movementProfileId = relation.to.definitionId;
    if (relation.to.definitionKind === "DURABILITY_PROFILE") result.durabilityProfileId = relation.to.definitionId;
    if (relation.to.definitionKind === "CARGO_PROFILE") result.cargoProfileId = relation.to.definitionId;
    if (relation.to.definitionKind === "SUPPLY_PROFILE") result.supplyProfileId = relation.to.definitionId;
    if (relation.to.definitionKind === "DEPLOYMENT_PROFILE") result.deploymentProfileId = relation.to.definitionId;
  }
  return result;
}

function unitInput(definitionId = "unit-infantry-squad"): D1UnitRulesInput {
  return {
    rulesetId: "ruleset-v5-core-curated-1",
    definitionId,
    definitionStatus: "active",
    sensorRange: 4,
    requisitionCost: null,
    implementationStatus: "PARTIAL",
    requisitionStatus: "BALANCE_REQUIRED",
    availabilityStatus: "DEV_ONLY",
    executable: true,
    purchasable: false,
    reasonCode: "MISSING_CANONICAL_PRICE",
    actionDefinitionIds: ["action-dig-in"],
    allowedActionTypes: ["DIG_IN"],
    allowedOrderTypes: ["HOLD"],
    ...profileBindings(definitionId),
  };
}

function equipmentInput(definitionId: string): D1EquipmentRulesInput {
  return {
    rulesetId: "ruleset-v5-core-curated-1",
    definitionId,
    definitionStatus: "active",
    requisitionCost: 1,
    implementationStatus: "IMPLEMENTED",
    requisitionStatus: "PUBLISHED",
    availabilityStatus: "AVAILABLE",
    executable: true,
    purchasable: true,
    reasonCode: null,
  };
}

describe("server rules hydration", () => {
  test("preserves nullable @2 values, D1 sentinels, links, and the declared handler", () => {
    const result = resolveUnitRulesAuthority(unitInput(), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.authority.sourcedNumbers).toEqual({
      sensorRange: { status: "SCENARIO_DEFINED", value: null },
      requisitionCost: { status: "BALANCE_REQUIRED", value: null },
    });
    expect(result.authority.legacyD1).toMatchObject({ sensorRange: 4, requisitionCost: null });
    expect(result.authority.status).toMatchObject({
      implementationStatus: "PARTIAL",
      requisitionStatus: "BALANCE_REQUIRED",
      availabilityStatus: "DEV_ONLY",
      executable: true,
      handlerId: "foundation-compiled-unit-class",
    });
    expect(result.authority.links.actionDefinitionIds).toEqual(expect.arrayContaining([
      "action-attack",
      "action-dig-in",
      "action-load-cargo",
      "action-unload-cargo",
    ]));
    expect(result.authority.links.allowedActionTypes).not.toContain("DIG_IN");
    expect(result.authority.links.orderDefinitionIds).toEqual(expect.arrayContaining([
      "order-advance",
      "order-hold",
      "order-rush",
    ]));
    expect(result.legacyDefinition.id).toBe("unit-infantry-squad");
  });

  test.each([
    "unit-logi-truck",
    "unit-infantry-fighting-vehicle",
    "unit-vtol",
    "unit-heavy-air-transport",
  ])("fails closed before non-handler transport %s can reach the replay catalogue", (definitionId) => {
    const result = resolveUnitRulesAuthority(unitInput(definitionId), "development");

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "NOT_EXECUTABLE" });
    expect(result.authority).toMatchObject({
      definitionId,
      decision: { executable: false },
    });
  });

  test("preserves Light Vehicle alternative cargo modes while withholding the lossy legacy cargo actions", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-light-vehicle"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.authority.profiles.cargoProfile).toMatchObject({
      id: "cargo-light-vehicle",
      capacity: {
        kind: "ALTERNATIVE_MODES",
        mixedLoadingPolicy: "MUTUALLY_EXCLUSIVE",
        modes: [
          { kind: "MAXIMUM_FORCE_STRENGTH", maximumForceStrength: 4 },
          { kind: "RESOURCE_QUANTITY", resourceType: "SMALL_SUPPLY", quantity: 1 },
        ],
      },
    });
    expect(result.authority.links.allowedActionTypes).not.toContain("LOAD");
    expect(result.authority.links.allowedActionTypes).not.toContain("UNLOAD");
  });

  test("hydrates Artillery's exact Small Supply profile without a legacy size alias", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-artillery"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.authority.profiles.supplyProfile).toMatchObject({
      id: "supply-artillery-small-two",
      capacities: {
        SMALL_SUPPLY: { kind: "FIXED_MAXIMUM", maximum: 2 },
      },
      reloadRules: {
        costPerRoundOfFire: 1,
        conflictIds: ["RC-V5-011"],
      },
    });
  });

  test("fails closed when D1 profile bindings drift from generated authority", () => {
    expect(resolveUnitRulesAuthority({
      ...unitInput(),
      movementProfileId: "movement-wrong",
    }, "development")).toMatchObject({
      ok: false,
      code: "PROFILE_BINDING_MISMATCH",
      authority: null,
    });
  });

  test("fails closed for catalogue-only and non-legacy D1 definitions", () => {
    expect(resolveUnitRulesAuthority(unitInput("unit-power-armoured-infantry"), "development"))
      .toMatchObject({ ok: false, code: "CATALOGUE_ONLY" });
    expect(resolveUnitRulesAuthority(
      { ...unitInput(), rulesetId: "ruleset-v5-core-curated-2" },
      "development",
    )).toMatchObject({ ok: false, code: "RULESET_ADAPTER_UNSUPPORTED", authority: null });
  });

  test("applies generated corrections over optimistic D1 equipment flags", () => {
    const result = resolveEquipmentRulesAuthority(equipmentInput("equipment-vehicle-optics"), "development");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "UNAVAILABLE",
      authority: {
        status: {
          implementationStatus: "PARTIAL",
          availabilityStatus: "BLOCKED",
          executable: false,
          reasonCode: "UNAUTHORISED_SENSOR_MODIFIER_AND_MISSING_VISIBILITY_STATE_EFFECT",
        },
        legacyD1: { availabilityStatus: "AVAILABLE", executable: true },
      },
    });
  });

  test("executes production-owned foundation units while preserving DEV_ONLY availability", () => {
    const development = resolveUnitRulesAuthority(unitInput(), "development");
    expect(development.ok).toBe(true);
    if (!development.ok) return;

    expect(resolveUnitRulesAuthority(unitInput(), "production")).toMatchObject({
      ok: true,
      authority: {
        status: { availabilityStatus: "DEV_ONLY", executable: true },
        decision: { available: false, executable: true },
      },
    });
  });

  test("rejects stale authority snapshots", () => {
    const development = resolveUnitRulesAuthority(unitInput(), "development");
    expect(development.ok).toBe(true);
    if (!development.ok) return;

    expect(rehydratePinnedUnitRulesAuthority(
      { ...development.authority, catalogueContentHash: "0".repeat(64) },
      "unit-infantry-squad",
      "development",
    )).toMatchObject({ ok: false, code: "RULES_AUTHORITY_INVALID" });
  });
});

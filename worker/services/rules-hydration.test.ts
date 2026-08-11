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
      handlerId: "foundation-generated-unit-class",
    });
    expect(result.authority.links.actionDefinitionIds).toEqual(expect.arrayContaining([
      "action-attack",
      "action-dig-in",
      "action-load-cargo",
      "action-unload-cargo",
    ]));
    expect(result.authority.links.allowedActionTypes).toContain("DIG_IN");
    expect(result.authority.links.orderDefinitionIds).toEqual(expect.arrayContaining([
      "order-advance",
      "order-hold",
      "order-rush",
    ]));
    expect(result.legacyDefinition.id).toBe("unit-infantry-squad");
  });

  test("hydrates the executable Logi subset including governed passenger cargo actions", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-logi-truck"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-logi-truck",
      stats: { healthModel: "HITS", maxHealth: 1, speed: 3 },
      allowedActions: ["RESUPPLY", "LOAD", "UNLOAD"],
    });
    expect(result.authority.links.allowedActionTypes).toEqual(["LOAD", "RESUPPLY", "UNLOAD"]);
    expect(result.authority.profiles.cargoProfile).toMatchObject({ id: "cargo-logi-two-slot" });
  });

  test("hydrates the executable Heavy Air Transport clear-drop subset", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-heavy-air-transport"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-heavy-air-transport",
      stats: { healthModel: "HITS", maxHealth: 1, armor: 0, speed: 7 },
      allowedOrders: ["HOLD", "ADVANCE"],
      allowedActions: ["LOAD", "AIRDROP", "LAND", "TAKE_OFF"],
      tags: expect.arrayContaining(["AEROSPACE", "AIRDROP", "CANNOT_SPOT_GROUND"]),
      weapons: [],
    });
    expect(result.authority.profiles.cargoProfile).toMatchObject({
      id: "cargo-hat-five-slot",
      capacity: { kind: "SLOT_CONVERSIONS", slotCapacityQuarters: 20 },
    });
  });

  test("hydrates the executable generic VTOL flight, nose-gun, and alternative-cargo subset", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-vtol"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-vtol",
      stats: { healthModel: "HITS", maxHealth: 2, armor: 1, speed: 5 },
      allowedOrders: ["HOLD", "ADVANCE"],
      allowedActions: ["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF"],
      tags: expect.arrayContaining(["AEROSPACE", "VTOL", "CANNOT_SPOT_GROUND"]),
    });
    expect(result.authority.profiles.cargoProfile).toMatchObject({ id: "cargo-vtol-alternative" });
  });

  test("hydrates the executable Fighter sortie with airfield operations and Interceptor", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-aerospace-fighter"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-aerospace-fighter",
      stats: { healthModel: "HITS", maxHealth: 2, armor: 0, speed: 7 },
      allowedOrders: ["HOLD", "ADVANCE", "EVASIVE"],
      allowedActions: ["ATTACK", "LAND", "TAKE_OFF", "REARM_AEROSPACE"],
      tags: expect.arrayContaining(["AEROSPACE", "RAPID_FIRE", "EVASIVE", "LIMITED_FORWARD_ARC", "AEROSPACE_INTERCEPTOR", "CANNOT_SPOT_GROUND"]),
      weapons: [expect.objectContaining({ id: "weapon-fighter-snub-hmg", ammoCapacity: 1, range: 1 })],
    });
  });

  test("hydrates the executable Bomber sortie with airfield landing and rearm", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-aerospace-bomber"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-aerospace-bomber",
      stats: { healthModel: "HITS", maxHealth: 2, armor: 0, speed: 6 },
      allowedOrders: ["HOLD", "ADVANCE"],
      allowedActions: ["ATTACK", "LAND", "TAKE_OFF", "REARM_AEROSPACE"],
      tags: expect.arrayContaining(["AEROSPACE", "BOMBER", "FLY_OVER", "CANNOT_SPOT_GROUND"]),
      weapons: [expect.objectContaining({ id: "weapon-bomber-ordnance", ammoCapacity: 1, range: 0 })],
    });
  });

  test("hydrates the executable IFV attack, subsystem, and infantry-cargo subset", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-infantry-fighting-vehicle"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-infantry-fighting-vehicle",
      stats: { healthModel: "HITS", maxHealth: 3, armor: 2, speed: 2 },
      allowedActions: ["ATTACK", "CREW_REPAIR", "LOAD", "UNLOAD"],
    });
    expect(result.authority.profiles.cargoProfile).toMatchObject({
      id: "cargo-ifv-infantry",
      capacity: { kind: "MAXIMUM_FORCE_STRENGTH", maximumForceStrength: 6 },
    });
  });

  test("hydrates the executable Light Mech hostile-passage and Evasive subset", () => {
    const result = resolveUnitRulesAuthority(unitInput("unit-light-mech"), "development");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.legacyDefinition).toMatchObject({
      id: "unit-light-mech",
      stats: { healthModel: "HITS", maxHealth: 2, armor: 1, speed: 4 },
      allowedOrders: ["HOLD", "ADVANCE", "RUSH", "EVASIVE"],
      allowedActions: ["ATTACK"],
      weapons: [expect.objectContaining({ id: "weapon-light-mech-laser", range: 1 })],
    });
    expect(result.authority.links.allowedOrderTypes).toEqual(["ADVANCE", "EVASIVE", "HOLD", "RUSH"]);
  });

  test("preserves Light Vehicle alternative cargo modes and exposes governed cargo actions", () => {
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
    expect(result.authority.links.allowedActionTypes).toEqual(["ATTACK", "LOAD", "UNLOAD"]);
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

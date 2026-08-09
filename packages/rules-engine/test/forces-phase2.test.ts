import type {
  ConstructionProfile,
  DurabilityProfile,
  HealingProfile,
  MovementProfile,
  SubsystemDamageProfile,
  SubsystemDefinition,
  SubsystemRepairProfile,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  abilityById,
  capDamageOutput,
  hasAllTags,
  resolveBuildAction,
  resolveDurabilityDamage,
  resolveHealing,
  resolveSubsystemDamage,
  resolveSubsystemRepair,
  validateMovementRoute,
} from "../src";
import { makeHex } from "./fixtures";

const groundMovement: MovementProfile = {
  id: "movement-ground",
  mode: "GROUND",
  groundMode: "STANDARD",
  baseSpeed: 2,
  usesFacing: true,
  allowsHostilePassage: false,
  requiresFlightPath: false,
  terrainCostMode: "BATTLEFIELD",
  canRush: true,
  rushCostMultiplier: 0.5,
  occupiesGroundCapacity: true,
};

describe("data-driven movement and durability profiles", () => {
  it("uses profile flags—not class IDs—for ground, mech-like, and aerial routes", () => {
    const map = [makeHex(0, 0), makeHex(1, 0), makeHex(2, 0, { movementCost: 2 })];
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];

    expect(
      validateMovementRoute({
        profile: groundMovement,
        route,
        map,
        hostileGroundPositions: [{ q: 1, r: 0 }],
      }),
    ).toMatchObject({ legal: false, blockedAt: { q: 1, r: 0 }, cost: 3 });

    const mechLike: MovementProfile = {
      ...groundMovement,
      id: "movement-ground-mech",
      groundMode: "MECH",
      baseSpeed: 3,
      allowsHostilePassage: true,
    };
    expect(
      validateMovementRoute({
        profile: mechLike,
        route,
        map,
        hostileGroundPositions: [{ q: 1, r: 0 }],
      }),
    ).toMatchObject({ legal: true, cost: 3 });

    const vtol: MovementProfile = {
      ...groundMovement,
      id: "movement-vtol",
      mode: "VTOL",
      groundMode: undefined,
      allowsHostilePassage: true,
      requiresFlightPath: true,
      terrainCostMode: "FLAT",
      flatStepCost: 1,
      occupiesGroundCapacity: false,
    };
    expect(validateMovementRoute({ profile: vtol, route, map })).toMatchObject({ legal: true, cost: 2 });
  });

  it("models FS residual loss/output scaling and one-Hit vehicle penetration", () => {
    const personnel: DurabilityProfile = {
      id: "durability-fs-6",
      model: "FORCE_STRENGTH",
      maximumHealth: 6,
      outputScaling: "CURRENT_HEALTH",
      penetrationLoss: "RESIDUAL",
      supportsSubsystems: false,
      healable: true,
    };
    const vehicle: DurabilityProfile = {
      id: "durability-hits-3",
      model: "HITS",
      maximumHealth: 3,
      outputScaling: "NONE",
      penetrationLoss: "ONE_HIT",
      supportsSubsystems: true,
      healable: false,
    };

    expect(capDamageOutput(personnel, 3, 6)).toBe(3);
    expect(resolveDurabilityDamage(personnel, 3, 2)).toMatchObject({ loss: 2, after: 1, destroyed: false });
    expect(capDamageOutput(vehicle, 1, 6)).toBe(6);
    expect(resolveDurabilityDamage(vehicle, 3, 5)).toMatchObject({ loss: 1, after: 2, destroyed: false });
  });
});

describe("abilities, healing, and construction", () => {
  it("queries tags and ability references without definition-name switches", () => {
    const abilities = [{ abilityId: "heal-field", parameters: { die: "D6" } }];
    expect(hasAllTags(["PERSONNEL", "MEDIC"], ["MEDIC"])).toBe(true);
    expect(abilityById(abilities, "heal-field")?.parameters).toEqual({ die: "D6" });
  });

  it("caps a friendly personnel heal by current healer FS and missing health", () => {
    const profile: HealingProfile = {
      id: "heal-medical-supply",
      targetHealthModels: ["FORCE_STRENGTH"],
      maximumRange: 0,
      requiresFriendlyTarget: true,
      allowsSelfTarget: false,
      allowsDestroyedTarget: false,
      supplyType: "MEDICAL",
      supplyCost: 1,
      amountCap: "HEALER_CURRENT_HEALTH",
    };
    const healer = { id: "medic", side: "ALLIED" as const, healthModel: "FORCE_STRENGTH" as const, currentHealth: 3, maximumHealth: 4 };
    const target = { id: "squad", side: "ALLIED" as const, healthModel: "FORCE_STRENGTH" as const, currentHealth: 2, maximumHealth: 6 };

    expect(resolveHealing({ profile, healer, target, distance: 0, rolledAmount: 6, supplyAvailable: 2 })).toEqual({
      legal: true,
      amount: 3,
      targetHealthAfter: 5,
      supplySpent: 1,
      supplyAfter: 1,
    });
    expect(
      resolveHealing({
        profile,
        healer,
        target: { ...target, id: "tank", healthModel: "HITS" },
        distance: 0,
        rolledAmount: 4,
        supplyAvailable: 2,
      }),
    ).toMatchObject({ legal: false, reason: "Target durability model is ineligible." });
    expect(
      resolveHealing({
        profile: { ...profile, supplyCost: -1 },
        healer,
        target,
        distance: 0,
        rolledAmount: 4,
        supplyAvailable: 2,
      }),
    ).toMatchObject({ legal: false, supplySpent: 0, supplyAfter: 2 });
  });

  it("advances construction only for affordable, eligible actions", () => {
    const profile: ConstructionProfile = {
      id: "build-sandbags",
      progressRequired: 4,
      progressPerAction: 2,
      supplyType: "SMALL",
      supplyPerAction: 1,
      maximumActionsPerRound: 2,
      requiredBuilderTags: ["BUILDER"],
    };
    const project = {
      id: "project-1",
      definitionId: "sandbags",
      status: "PLANNED" as const,
      progress: 0,
      builderUnitIds: [],
    };
    const first = resolveBuildAction({
      profile,
      project,
      builderTags: ["BUILDER"],
      supplyAvailable: 1,
      actionsRequested: 2,
    });
    expect(first).toMatchObject({ legal: true, actionsApplied: 1, supplySpent: 1, project: { progress: 2, status: "IN_PROGRESS" } });
    expect(
      resolveBuildAction({ profile, project: first.project, builderTags: ["BUILDER"], supplyAvailable: 1 }),
    ).toMatchObject({ legal: true, project: { progress: 4, status: "COMPLETE" } });
  });
});

describe("subsystem damage and repair", () => {
  const definitions: SubsystemDefinition[] = [
    { id: "weapon-main", name: "Main weapon", kind: "WEAPON", tags: [] },
    { id: "weapon-secondary", name: "Secondary weapon", kind: "WEAPON", tags: [] },
    { id: "mobility", name: "Mobility", kind: "MOBILITY", tags: [] },
  ];
  const damageProfile: SubsystemDamageProfile = {
    id: "v5-subsystems",
    requiresPenetration: true,
    triggers: [
      { naturalRolls: [5], targetKind: "WEAPON", resultingState: "DISABLED", selection: "ALL", requiresAttackerHealthAtLeastRoll: true },
      { naturalRolls: [6], targetKind: "MOBILITY", resultingState: "DISABLED", selection: "FIRST_BY_ID", requiresAttackerHealthAtLeastRoll: true },
    ],
  };

  it("applies deterministic typed subsystem effects and repairs one target", () => {
    const damaged = resolveSubsystemDamage({
      profile: damageProfile,
      definitions,
      states: definitions.map((definition) => ({ subsystemId: definition.id, state: "OPERATIONAL" as const })),
      penetrated: true,
      naturalRoll: 5,
      attackerCurrentHealth: 5,
      sourceId: "squad",
      round: 3,
    });
    expect(damaged.triggered).toBe(true);
    expect(damaged.affectedSubsystemIds).toEqual(["weapon-main", "weapon-secondary"]);
    expect(damaged.states.filter((state) => state.state === "DISABLED").map((state) => state.subsystemId)).toEqual([
      "weapon-main",
      "weapon-secondary",
    ]);

    const repairProfile: SubsystemRepairProfile = {
      id: "engineer-repair",
      supplyType: "SMALL",
      supplyCost: 1,
      requiredActions: 1,
      requiresStationary: true,
      requiresCrewExposed: false,
    };
    expect(
      resolveSubsystemRepair({
        profile: repairProfile,
        states: damaged.states,
        subsystemId: "weapon-main",
        movedThisRound: false,
        actionsSpent: 1,
        crewExposed: false,
        supplyAvailable: 1,
      }),
    ).toMatchObject({ legal: true, supplySpent: 1, states: expect.arrayContaining([{ subsystemId: "weapon-main", state: "OPERATIONAL" }]) });
  });
});

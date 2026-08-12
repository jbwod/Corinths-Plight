import { describe, expect, it } from "vitest";
import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";
import {
  createDemoCampaignState,
  getTacticalActionRule,
  getTacticalUnitClass,
  resolveRound,
  tacticalRulesCatalogueRuntime,
  validateMashOperation,
} from "../src";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getTacticalActionRule(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(
  state: ReturnType<typeof createDemoCampaignState>,
  unit: CampaignDeployment,
  actions: StructuredAction[],
): UnitOrder {
  return {
    id: `order:${unit.id}:${actions.map((item) => item.type).join("-")}`,
    revision: 1,
    unitId: unit.id,
    campaignId: state.campaignId,
    round: state.round,
    orderType: "HOLD",
    lifecycle: "SUBMITTED",
    startHex: { ...unit.position },
    route: [{ ...unit.position }],
    endHex: { ...unit.position },
    facing: unit.facing,
    actions,
    targets: [],
    equipmentUsed: [],
    ammoUsed: {},
    incidentalActions: [],
    submittedBy: unit.ownerId,
    submittedAt: 1,
  };
}

function medicIn(state: ReturnType<typeof createDemoCampaignState>, overrides: Partial<CampaignDeployment> = {}): CampaignDeployment {
  const source = state.deployments.find((deployment) => deployment.id === "dep-rook-7")!;
  const definition = getTacticalUnitClass("unit-combat-medic");
  const medic: CampaignDeployment = {
    ...structuredClone(source),
    id: "dep-medic-completion",
    persistentUnitId: "force-medic-completion",
    definitionId: definition.id,
    callsign: "DOC-4",
    stats: definition.stats,
    currentHealth: definition.stats.maxHealth,
    tags: definition.tags,
    weapons: [],
    ammunition: {},
    equipmentIds: [],
    supplies: { MEDICAL_SUPPLY: definition.stats.maxHealth },
    ...overrides,
  };
  state.deployments.push(medic);
  return medic;
}

function resolve(state: ReturnType<typeof createDemoCampaignState>, orders: UnitOrder[], seed: string) {
  state.orders = orders;
  return resolveRound({
    previousState: state,
    rulesetVersion: state.rulesetVersion,
    playerOrders: orders,
    enemyOrders: [],
    seed,
    resolutionTime: 2_000,
  });
}

describe("Combat Medic completion mechanics", () => {
  it("uses the canonical V5 non-combat chassis and exposes only its resolved action subset", () => {
    expect(getTacticalUnitClass("unit-combat-medic")).toMatchObject({
      stats: { healthModel: "FORCE_STRENGTH", maxHealth: 4, armor: 0, speed: 1 },
      weapons: [],
      requisitionCost: 4,
      tags: expect.arrayContaining(["INFANTRY", "MEDICAL"]),
      allowedActions: ["DIG_IN", "HEAL", "RELOAD", "LOAD", "UNLOAD"],
    });
  });

  it("fails every MASH lifecycle operation closed under RC-UNIT-002 and RC-BUILD-006", () => {
    expect(tacticalRulesCatalogueRuntime.decide("ACTION", "action-deploy-mash")).toMatchObject({
      executability: { allowed: false },
      purchasable: false,
    });
    for (const operation of ["DEPLOY", "PACK", "USE"] as const) {
      expect(validateMashOperation(operation)).toEqual({
        legal: false,
        operation,
        conflictIds: ["RC-UNIT-002"],
        reason: "MASH is companion catalogue material and is not executable for the canonical V5 Combat Medic.",
      });
    }
    expect(validateMashOperation("DESTROY")).toMatchObject({
      legal: false,
      operation: "DESTROY",
      conflictIds: ["RC-UNIT-002", "RC-BUILD-006"],
      reason: expect.stringMatching(/no governed durability/i),
    });
  });

  it("heals only a base-contact friendly wounded Infantry unit and records supply before/after", () => {
    const state = createDemoCampaignState(1_000);
    const target = state.deployments.find((deployment) => deployment.id === "dep-rook-7")!;
    target.currentHealth = 1;
    const medic = medicIn(state, { position: { ...target.position }, supplies: { MEDICAL_SUPPLY: 2 } });
    const heal = order(state, medic, [action("heal-wounded", "HEAL", { targetDeploymentId: target.id })]);
    const output = resolve(state, [heal], "medic-completion-heal");
    const result = output.state.deployments.find((deployment) => deployment.id === target.id)!;

    expect(result.currentHealth).toBeGreaterThan(1);
    expect(result.currentHealth).toBeLessThanOrEqual(target.stats.maxHealth);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: medic.id,
      payload: expect.objectContaining({ purpose: "FIRST_AID", capped: result.currentHealth - 1 }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_HEALED",
      actor: medic.id,
      payload: expect.objectContaining({
        targetId: target.id,
        before: 1,
        after: result.currentHealth,
        medicalSupplySpent: 1,
        medicalSupplyBefore: 2,
        medicalSupplyAfter: 1,
      }),
    }));
  });

  it("rejects First Aid from a non-Medic without rolling or spending spoofed Medical Supply", () => {
    const state = createDemoCampaignState(1_000);
    const actor = state.deployments.find((deployment) => deployment.id === "dep-rook-7")!;
    const target = state.deployments.find((deployment) => deployment.id === "dep-raven-drop")!;
    target.locationState = "ON_MAP";
    target.position = { ...actor.position };
    target.currentHealth = 1;
    actor.supplies = { MEDICAL_SUPPLY: 4 };
    const heal = order(state, actor, [action("spoof-heal", "HEAL", { targetDeploymentId: target.id })]);
    const output = resolve(state, [heal], "non-medic-heal");

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: actor.id,
      payload: expect.objectContaining({ reasons: ["First Aid requires a Combat Medic."] }),
    }));
    expect(output.events).not.toContainEqual(expect.objectContaining({ type: "DICE_ROLLED", actor: actor.id }));
    expect(output.state.deployments.find((deployment) => deployment.id === actor.id)?.supplies)
      .toEqual({ MEDICAL_SUPPLY: 4 });
    expect(output.state.deployments.find((deployment) => deployment.id === target.id)?.currentHealth).toBe(1);
  });

  it("rejects hostile, non-Infantry, full-health, destroyed, distant, self, and empty-supply targets", () => {
    const cases = [
      { name: "hostile", target: "dep-rook-7", mutate: (_medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = 1; target.side = "ENEMY"; } },
      { name: "non-infantry", target: "dep-bellator", mutate: (_medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = 1; target.position = { q: -3, r: 1 }; } },
      { name: "full", target: "dep-rook-7", mutate: (_medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = target.stats.maxHealth; } },
      { name: "destroyed", target: "dep-rook-7", mutate: (_medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = 0; target.status = "DESTROYED"; } },
      { name: "distant", target: "dep-rook-7", mutate: (medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = 1; medic.position = { q: -5, r: 3 }; } },
      { name: "self", target: "medic", mutate: (medic: CampaignDeployment) => { medic.currentHealth = 2; } },
      { name: "empty-supply", target: "dep-rook-7", mutate: (medic: CampaignDeployment, target: CampaignDeployment) => { target.currentHealth = 1; medic.supplies = { MEDICAL_SUPPLY: 0 }; } },
    ] as const;

    for (const testCase of cases) {
      const state = createDemoCampaignState(1_000);
      const medic = medicIn(state);
      const target = testCase.target === "medic"
        ? medic
        : state.deployments.find((deployment) => deployment.id === testCase.target)!;
      testCase.mutate(medic, target);
      const beforeSupply = medic.supplies?.MEDICAL_SUPPLY;
      const beforeHealth = target.currentHealth;
      const heal = order(state, medic, [action(`heal-${testCase.name}`, "HEAL", { targetDeploymentId: target.id })]);
      const output = resolve(state, [heal], `medic-invalid-${testCase.name}`);

      expect(output.events, testCase.name).toContainEqual(expect.objectContaining({
        type: "ORDER_REJECTED",
        actor: medic.id,
      }));
      expect(output.events, testCase.name).not.toContainEqual(expect.objectContaining({ type: "UNIT_HEALED", actor: medic.id }));
      expect(output.state.deployments.find((deployment) => deployment.id === medic.id)?.supplies?.MEDICAL_SUPPLY, testCase.name)
        .toBe(beforeSupply);
      expect(output.state.deployments.find((deployment) => deployment.id === target.id)?.currentHealth, testCase.name)
        .toBe(beforeHealth);
    }
  });

  it("reloads to current Medic FS from one Small Supply and persists both resources", () => {
    const state = createDemoCampaignState(1_000);
    const medic = medicIn(state, {
      currentHealth: 2,
      supplies: { MEDICAL_SUPPLY: 0, SMALL_SUPPLY: 1 },
    });
    const reload = order(state, medic, [action("reload-medical", "RELOAD")]);
    const output = resolve(state, [reload], "medic-completion-reload");

    expect(output.state.deployments.find((deployment) => deployment.id === medic.id)?.supplies)
      .toMatchObject({ MEDICAL_SUPPLY: 2, SMALL_SUPPLY: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "MEDICAL_SUPPLY_RELOADED",
      actor: medic.id,
      payload: expect.objectContaining({ medicalSupplyBefore: 0, medicalSupplyAfter: 2, smallSupplySpent: 1 }),
    }));
    expect(output.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: medic.persistentUnitId,
      payload: expect.objectContaining({ supplies: { MEDICAL_SUPPLY: 2, SMALL_SUPPLY: 0 } }),
    }));
  });

  it("retains excess Medical Supply after casualties and blocks reload until below current-FS capacity", () => {
    const state = createDemoCampaignState(1_000);
    const medic = medicIn(state, {
      currentHealth: 2,
      supplies: { MEDICAL_SUPPLY: 4, SMALL_SUPPLY: 1 },
    });
    const reload = order(state, medic, [action("reload-over-capacity", "RELOAD")]);
    const output = resolve(state, [reload], "medic-over-capacity");

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: medic.id,
      payload: expect.objectContaining({ reasons: ["Medical Supply is already at the medic's current capacity."] }),
    }));
    expect(output.state.deployments.find((deployment) => deployment.id === medic.id)?.supplies)
      .toEqual({ MEDICAL_SUPPLY: 4, SMALL_SUPPLY: 1 });
  });
});

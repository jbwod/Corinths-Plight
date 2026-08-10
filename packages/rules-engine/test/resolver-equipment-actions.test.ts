import { describe, expect, it } from "vitest";
import type { CampaignDeployment, RoundInput, StructuredAction, UnitOrder } from "../../domain/src";
import {
  createDemoCampaignState,
  getActionDefinition,
  getTacticalActionRule,
  getTacticalUnitClass,
  resolveRound,
} from "../src";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getActionDefinition(type);
  return { id, type, economy: rule.economy, speedCost: rule.speedCost, equipmentIds: [], ...fields };
}

function order(state: ReturnType<typeof createDemoCampaignState>, unit: CampaignDeployment, actions: StructuredAction[]): UnitOrder {
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

function input(orders: UnitOrder[]): RoundInput {
  const state = createDemoCampaignState(1_000);
  state.orders = orders;
  return { previousState: state, rulesetVersion: state.rulesetVersion, playerOrders: orders, enemyOrders: [], seed: "42", resolutionTime: 2_000 };
}

describe("equipment and transport actions", () => {
  it("requires paired carrier/cargo actions and loads deterministically", () => {
    const base = createDemoCampaignState(1_000);
    const carrier = base.deployments[0];
    const cargo = base.deployments[2];
    cargo.position = { ...carrier.position };
    carrier.cargoProfile = {
      id: "cargo-test", capacitySlotsQuarters: 4, allowMixedLoadGroups: true,
      embarkFlatSpeedCostQuarters: 2, disembarkFlatSpeedCostQuarters: 2,
      rules: [{ id: "infantry", cargoKind: "PERSONNEL", requiredTags: ["INFANTRY"], slotsPerItemQuarters: 4 }],
    };
    const orders = [
      order(base, carrier, [action("load-carrier", "LOAD", { targetDeploymentId: cargo.id })]),
      order(base, cargo, [action("load-cargo", "LOAD", { targetDeploymentId: carrier.id })]),
    ];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({ type: "CARGO_LOADED", actor: carrier.id }));
    expect(output.state.deployments.find((unit) => unit.id === cargo.id)?.locationState).toBe("EMBARKED");
    expect(output.state.deployments.find((unit) => unit.id === carrier.id)?.cargo?.[0].unitId).toBe(cargo.id);
  });

  it("reloads finite ammunition from Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.weapons = [{ id: "test-ammo", name: "Test", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, ammoCapacity: 3, tags: [] }];
    unit.ammunition = { "test-ammo": 1 };
    unit.supplies = { SMALL_SUPPLY: 2 };
    const orders = [order(base, unit, [action("reload", "RELOAD", { weaponId: "test-ammo" })])];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({ type: "WEAPON_RELOADED", actor: unit.id }));
    expect(output.state.deployments[0].ammunition["test-ammo"]).toBe(3);
    expect(output.state.deployments[0].supplies?.SMALL_SUPPLY).toBe(1);
  });

  it("does not translate a legacy strategic SMALL key into tactical Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.weapons = [{ id: "test-ammo", name: "Test", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, ammoCapacity: 3, tags: [] }];
    unit.ammunition = { "test-ammo": 1 };
    unit.supplies = { SMALL: 2 };
    const orders = [order(base, unit, [action("reload", "RELOAD", { weaponId: "test-ammo" })])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: unit.id,
      payload: expect.objectContaining({ reasons: ["Insufficient reload supply."] }),
    }));
    expect(output.state.deployments[0].ammunition["test-ammo"]).toBe(1);
  });

  it("resolves Combat Medic First Aid and persists health and Medical Supply", () => {
    const base = createDemoCampaignState(1_000);
    const target = base.deployments[0];
    target.persistentUnitId = "force-rook-test";
    target.currentHealth = 2;
    const medicDefinition = getTacticalUnitClass("unit-combat-medic");
    const medic: CampaignDeployment = {
      ...structuredClone(target),
      id: "dep-doc-7",
      persistentUnitId: "force-doc-test",
      definitionId: medicDefinition.id,
      callsign: "DOC-7",
      stats: medicDefinition.stats,
      currentHealth: medicDefinition.stats.maxHealth,
      weapons: medicDefinition.weapons,
      ammunition: {},
      equipmentIds: [],
      supplies: { MEDICAL_SUPPLY: medicDefinition.stats.maxHealth },
    };
    base.deployments.push(medic);
    const healRule = getTacticalActionRule("HEAL");
    const healAction: StructuredAction = {
      id: "heal-rook",
      type: "HEAL",
      economy: healRule.economy,
      speedCost: healRule.speedCost,
      targetDeploymentId: target.id,
      equipmentIds: [],
    };
    const orders = [order(base, medic, [healAction])];
    base.orders = orders;

    const output = resolveRound({
      ...input(orders),
      previousState: base,
      seed: "medic-first-aid",
    });

    const healedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    const resolvedMedic = output.state.deployments.find((unit) => unit.id === medic.id)!;
    expect(healedTarget.currentHealth).toBeGreaterThan(2);
    expect(healedTarget.currentHealth).toBeLessThanOrEqual(target.stats.maxHealth);
    expect(resolvedMedic.supplies?.MEDICAL_SUPPLY).toBe(3);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_HEALED",
      actor: medic.id,
      payload: expect.objectContaining({ targetId: target.id, before: 2, after: healedTarget.currentHealth }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: target.persistentUnitId,
        payload: expect.objectContaining({ currentHealth: healedTarget.currentHealth }),
      }),
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: medic.persistentUnitId,
        payload: expect.objectContaining({ supplies: { MEDICAL_SUPPLY: 3 } }),
      }),
    ]));
  });

  it("restores Medical Supply to current Medic FS using one Small Supply", () => {
    const base = createDemoCampaignState(1_000);
    const medicDefinition = getTacticalUnitClass("unit-combat-medic");
    const medic: CampaignDeployment = {
      ...structuredClone(base.deployments[0]),
      id: "dep-doc-reload",
      persistentUnitId: "force-doc-reload",
      definitionId: medicDefinition.id,
      callsign: "DOC-R",
      stats: medicDefinition.stats,
      currentHealth: 3,
      weapons: [],
      ammunition: {},
      equipmentIds: [],
      supplies: { MEDICAL_SUPPLY: 1, SMALL_SUPPLY: 1 },
    };
    base.deployments.push(medic);
    const reloadRule = getTacticalActionRule("RELOAD");
    const reloadAction: StructuredAction = {
      id: "reload-medical-supply",
      type: "RELOAD",
      economy: reloadRule.economy,
      speedCost: reloadRule.speedCost,
      equipmentIds: [],
    };
    const orders = [order(base, medic, [reloadAction])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });
    const resolvedMedic = output.state.deployments.find((unit) => unit.id === medic.id)!;

    expect(resolvedMedic.supplies).toMatchObject({ MEDICAL_SUPPLY: 3, SMALL_SUPPLY: 0 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "MEDICAL_SUPPLY_RELOADED",
      actor: medic.id,
      payload: expect.objectContaining({
        medicalSupplyBefore: 1,
        medicalSupplyAfter: 3,
        smallSupplySpent: 1,
      }),
    }));
  });

  it("resolves Engineer Repair and persists the vehicle and Small Supply state", () => {
    const base = createDemoCampaignState(1_000);
    const target = base.deployments[0];
    target.persistentUnitId = "force-bellator-test";
    target.stats = { ...target.stats, healthModel: "HITS", maxHealth: 3 };
    target.currentHealth = 2;
    target.subsystems = [{
      subsystemId: "mobility",
      state: "DISABLED",
      damageSourceId: "bug-heavy",
      damagedRound: 2,
    }];

    const engineerDefinition = getTacticalUnitClass("unit-engineers");
    const engineer: CampaignDeployment = {
      ...structuredClone(target),
      id: "dep-anvil-test",
      persistentUnitId: "force-anvil-test",
      definitionId: engineerDefinition.id,
      callsign: "ANVIL",
      stats: engineerDefinition.stats,
      currentHealth: engineerDefinition.stats.maxHealth,
      weapons: [],
      ammunition: {},
      subsystems: [],
      equipmentIds: [],
      supplies: { SMALL_SUPPLY: 4 },
    };
    base.deployments.push(engineer);
    const repairRule = getTacticalActionRule("REPAIR");
    const repairAction: StructuredAction = {
      id: "repair-bellator-mobility",
      type: "REPAIR",
      economy: repairRule.economy,
      speedCost: repairRule.speedCost,
      targetDeploymentId: target.id,
      payload: { repairKind: "SUBSYSTEM", subsystemId: "mobility" },
      equipmentIds: [],
    };
    const orders = [order(base, engineer, [repairAction])];
    base.orders = orders;

    const output = resolveRound({ ...input(orders), previousState: base });
    const resolvedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    const resolvedEngineer = output.state.deployments.find((unit) => unit.id === engineer.id)!;

    expect(resolvedTarget.currentHealth).toBe(2);
    expect(resolvedTarget.subsystems).toEqual([{ subsystemId: "mobility", state: "OPERATIONAL" }]);
    expect(resolvedEngineer.supplies?.SMALL_SUPPLY).toBe(3);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: engineer.id,
      payload: expect.objectContaining({
        targetId: target.id,
        repairKind: "SUBSYSTEM",
        subsystemId: "mobility",
      }),
    }));
    expect(output.persistentEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: target.persistentUnitId,
        payload: expect.objectContaining({
          currentHealth: 2,
          subsystems: [{ subsystemId: "mobility", state: "OPERATIONAL" }],
        }),
      }),
      expect.objectContaining({
        type: "UNIT_STATE_UPDATED",
        unitId: engineer.persistentUnitId,
        payload: expect.objectContaining({ supplies: { SMALL_SUPPLY: 3 } }),
      }),
    ]));
  });

  it("rejects Drone until its visibility state effect is implemented", () => {
    const base = createDemoCampaignState(1_000);
    const unit = base.deployments[0];
    unit.abilities = [{ abilityId: "ability-deploy-drone", handlerId: "DEPLOY_DRONE" }];
    const orders = [order(base, unit, [action("drone", "DEPLOY_DRONE", { targetHex: { q: 0, r: 0 } })])];
    base.orders = orders;
    const output = resolveRound({ ...input(orders), previousState: base });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: unit.id,
      payload: expect.objectContaining({
        reasons: ["DEPLOY DRONE is catalogued but not executable in this engine version."],
      }),
    }));
    expect(output.state.deployments[0].cooldowns["ability-deploy-drone"]).toBeUndefined();
  });
});

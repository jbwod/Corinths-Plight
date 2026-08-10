import { describe, expect, it } from "vitest";
import type { CampaignDeployment, RoundInput, StructuredAction, UnitOrder } from "../../domain/src";
import {
  createDemoCampaignState,
  getActionDefinition,
  getTacticalActionRule,
  getTacticalUnitClass,
  resolveRound,
  validateOrder,
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
  it("deploys and packs Artillery using the governed half-Speed Standard Action", () => {
    const deployState = createDemoCampaignState(1_000);
    const artillery = deployState.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    expect(artillery.statuses).toEqual(["PACKED"]);
    const deployRule = getTacticalActionRule("DEPLOY");
    const deployOrder = order(deployState, artillery, [action("deploy-artillery", "DEPLOY")]);
    deployState.orders = [deployOrder];

    const deployed = resolveRound({ ...input([deployOrder]), previousState: deployState });
    expect(deployed.state.deployments.find((deployment) => deployment.id === artillery.id)?.statuses).toEqual(["DEPLOYED"]);
    expect(deployed.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_DEPLOYED",
      actor: artillery.id,
      payload: expect.objectContaining({ speedCost: deployRule.speedCost, toStatus: "DEPLOYED" }),
    }));

    const packState = createDemoCampaignState(1_000);
    const deployedArtillery = packState.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    deployedArtillery.statuses = ["DEPLOYED"];
    deployedArtillery.artilleryDeployment = "DEPLOYED";
    const packRule = getTacticalActionRule("PACK_UP");
    const packOrder = order(packState, deployedArtillery, [action("pack-artillery", "PACK_UP")]);
    packState.orders = [packOrder];
    const packed = resolveRound({ ...input([packOrder]), previousState: packState });
    expect(packed.state.deployments.find((deployment) => deployment.id === deployedArtillery.id)?.statuses).toEqual(["PACKED"]);
    expect(packed.events).toContainEqual(expect.objectContaining({
      type: "ARTILLERY_PACKED",
      actor: deployedArtillery.id,
      payload: expect.objectContaining({ speedCost: packRule.speedCost, toStatus: "PACKED" }),
    }));
  });

  it("bombards a spotted radius, spends Small Supply, and recovers suppression after fire stops", () => {
    const base = createDemoCampaignState(1_000);
    const artillery = base.deployments.find((deployment) => deployment.definitionId === "unit-artillery")!;
    const target = base.deployments.find((deployment) => deployment.id === "bug-drone-1")!;
    artillery.statuses = ["DEPLOYED"];
    artillery.artilleryDeployment = "DEPLOYED";
    artillery.supplies = { SMALL_SUPPLY: 2 };
    target.position = { q: -1, r: 1 };
    target.stats = { ...target.stats, defense: 2 };
    const bombardRule = getTacticalActionRule("BOMBARDMENT");
    const bombardAction: StructuredAction = {
      id: "bombard-drone",
      type: "BOMBARDMENT",
      economy: bombardRule.economy,
      speedCost: bombardRule.speedCost,
      targetHex: { ...target.position },
      equipmentIds: [],
    };
    const bombardOrder = order(base, artillery, [bombardAction]);
    base.orders = [bombardOrder];

    const bombarded = resolveRound({ ...input([bombardOrder]), previousState: base });
    const resolvedArtillery = bombarded.state.deployments.find((deployment) => deployment.id === artillery.id)!;
    const suppressedTarget = bombarded.state.deployments.find((deployment) => deployment.id === target.id)!;
    expect(resolvedArtillery.supplies?.SMALL_SUPPLY).toBe(1);
    expect(suppressedTarget.bombardmentSuppression).toEqual({ stacks: 1, lastAppliedRound: base.round });
    expect(bombarded.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "ARTILLERY_BOMBARDED", actor: artillery.id }),
      expect.objectContaining({
        type: "BOMBARDMENT_APPLIED",
        payload: expect.objectContaining({ targetId: target.id, stacksAfter: 1, defenseAfter: 1 }),
      }),
    ]));

    const recoveryState = structuredClone(bombarded.state);
    recoveryState.round += 1;
    recoveryState.phase = "PLANNING";
    recoveryState.orders = [];
    const recovered = resolveRound({
      previousState: recoveryState,
      rulesetVersion: recoveryState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "bombardment-recovery",
      resolutionTime: 3_000,
    });
    expect(recovered.state.deployments.find((deployment) => deployment.id === target.id)?.bombardmentSuppression).toBeUndefined();
    expect(recovered.events).toContainEqual(expect.objectContaining({
      type: "BOMBARDMENT_RECOVERED",
      actor: target.id,
      payload: expect.objectContaining({ stacksAfter: 0, defenseAfter: 2 }),
    }));
  });

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

  it("queues weapon malfunctions without cancelling the target's simultaneous attack", () => {
    const base = createDemoCampaignState(1_000);
    const attacker = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!);
    const target = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-main-battle-tank")!);
    attacker.id = "a-infantry";
    attacker.position = { q: -3, r: 1 };
    attacker.currentHealth = 6;
    target.id = "z-tank";
    target.side = "ENEMY";
    target.ownerId = "enemy-doctrine";
    target.position = { q: -2, r: 1 };
    target.stats = { ...target.stats, armor: 0, defense: 0 };
    target.subsystems = [
      { subsystemId: "WEAPONS", state: "OPERATIONAL" },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ];
    base.deployments = [attacker, target];
    const attackerOrder = order(base, attacker, [action("attack-tank", "ATTACK", {
      targetDeploymentId: target.id,
      weaponId: attacker.weapons[0].id,
    })]);
    const targetOrder = order(base, target, [action("return-fire", "ATTACK", {
      targetDeploymentId: attacker.id,
      weaponId: target.weapons[0].id,
    })]);
    base.orders = [attackerOrder, targetOrder];

    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackerOrder],
      enemyOrders: [targetOrder],
      seed: "subsystem-10",
      resolutionTime: 2_000,
    });
    const resolvedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;

    expect(resolvedTarget.subsystems).toEqual([
      expect.objectContaining({ subsystemId: "MOBILITY", state: "OPERATIONAL" }),
      expect.objectContaining({ subsystemId: "WEAPONS", state: "DISABLED", damageSourceId: attacker.id }),
    ]);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "SUBSYSTEM_MALFUNCTIONED",
      actor: attacker.id,
      payload: expect.objectContaining({
        targetId: target.id,
        naturalRoll: 5,
        affectedSubsystemIds: ["WEAPONS"],
      }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({ type: "UNIT_ATTACKED", actor: target.id }));
  });

  it("makes a natural-six mobility malfunction block later movement", () => {
    const base = createDemoCampaignState(1_000);
    const attacker = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-infantry-squad")!);
    const target = structuredClone(base.deployments.find((unit) => unit.definitionId === "unit-main-battle-tank")!);
    attacker.id = "a-infantry";
    attacker.position = { q: -3, r: 1 };
    attacker.currentHealth = 6;
    target.id = "z-tank";
    target.side = "ENEMY";
    target.position = { q: -2, r: 1 };
    target.stats = { ...target.stats, armor: 0, defense: 0 };
    target.subsystems = [
      { subsystemId: "WEAPONS", state: "OPERATIONAL" },
      { subsystemId: "MOBILITY", state: "OPERATIONAL" },
    ];
    base.deployments = [attacker, target];
    const attackOrder = order(base, attacker, [action("attack-tank", "ATTACK", {
      targetDeploymentId: target.id,
      weaponId: attacker.weapons[0].id,
    })]);
    base.orders = [attackOrder];
    const output = resolveRound({
      previousState: base,
      rulesetVersion: base.rulesetVersion,
      playerOrders: [attackOrder],
      enemyOrders: [],
      seed: "subsystem-4",
      resolutionTime: 2_000,
    });
    const immobilisedTarget = output.state.deployments.find((unit) => unit.id === target.id)!;
    expect(immobilisedTarget.subsystems).toContainEqual(expect.objectContaining({
      subsystemId: "MOBILITY",
      state: "DISABLED",
    }));

    const nextState = structuredClone(output.state);
    nextState.round += 1;
    nextState.phase = "PLANNING";
    nextState.outcome = undefined;
    const moveOrder = order(nextState, immobilisedTarget, []);
    moveOrder.round = nextState.round;
    moveOrder.orderType = "ADVANCE";
    moveOrder.route = [{ ...immobilisedTarget.position }, { q: -1, r: 1 }];
    moveOrder.endHex = { q: -1, r: 1 };
    expect(validateOrder(moveOrder, immobilisedTarget, {
      previousState: nextState,
      rulesetVersion: nextState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "next-round",
      resolutionTime: 3_000,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining(["The unit's mobility subsystem is disabled."]) });
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

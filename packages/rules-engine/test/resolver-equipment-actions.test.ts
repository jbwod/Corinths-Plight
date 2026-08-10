import { describe, expect, it } from "vitest";
import type { CampaignDeployment, RoundInput, StructuredAction, UnitOrder } from "../../domain/src";
import { createDemoCampaignState, getActionDefinition, resolveRound } from "../src";

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

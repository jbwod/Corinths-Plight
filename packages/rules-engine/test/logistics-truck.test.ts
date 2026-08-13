import type { CampaignDeployment, StructuredAction } from "../../domain/src";
import { describe, expect, it } from "vitest";

import {
  getTacticalActionRule,
  getTacticalCargoProfile,
  getTacticalUnitClass,
  resolveRound,
  transferCoordinatedSupplyDrop,
} from "../src";
import { baseWeapon, makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function governedDeployment(
  definitionId: string,
  id: string,
  position: CampaignDeployment["position"],
  side: CampaignDeployment["side"] = "ALLIED",
): CampaignDeployment {
  const definition = getTacticalUnitClass(definitionId);
  return makeDeployment(id, position, side, {
    definitionId,
    tags: [...definition.tags],
    stats: structuredClone(definition.stats),
    weapons: structuredClone(definition.weapons),
    cargoProfile: getTacticalCargoProfile(definitionId),
  });
}

function action(
  id: string,
  type: StructuredAction["type"],
  overrides: Partial<StructuredAction> = {},
): StructuredAction {
  const rule = getTacticalActionRule(type);
  return makeAction(id, { type, economy: rule.economy, speedCost: rule.speedCost, ...overrides });
}

describe("V5 Logistics Truck playable mechanics", () => {
  it("materializes the one-Hit unarmed chassis and governed two-slot cargo/tow conversions", () => {
    const definition = getTacticalUnitClass("unit-logi-truck");
    const cargo = getTacticalCargoProfile(definition.id);

    expect(definition).toMatchObject({
      category: "SUPPORT",
      tags: expect.arrayContaining(["GROUND", "VEHICLE", "LOGISTICS", "TRANSPORT"]),
      stats: { healthModel: "HITS", maxHealth: 1, armor: 0, defense: 0, speed: 3 },
      weapons: [],
      allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
      allowedActions: ["RESUPPLY", "LOAD", "UNLOAD"],
    });
    expect(cargo).toMatchObject({
      capacitySlotsQuarters: 8,
      towCapacity: 1,
      towRequiredTags: ["ARTILLERY"],
      embarkFlatSpeedCostQuarters: 2,
      disembarkFlatSpeedCostQuarters: 2,
    });
    expect(cargo?.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ cargoKind: "PERSONNEL", quantityPerSlot: 6 }),
      expect.objectContaining({ requiredTags: ["VEHICLE"], slotsPerItemQuarters: 8 }),
      expect.objectContaining({ cargoKind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantityPerSlot: 5 }),
    ]));
  });

  it("partially transfers governed Small Supply and rejects cross-resource or forged requests", () => {
    const position = { q: 0, r: 0 };
    const logi = governedDeployment("unit-logi-truck", "logi", position);
    logi.supplies = { SMALL_SUPPLY: 3 };
    const engineer = governedDeployment("unit-engineers", "engineer", position);
    engineer.currentHealth = 3;
    engineer.supplies = { SMALL_SUPPLY: 1 };
    const resupply = makeOrder(logi, {
      actions: [action("resupply-engineer", "RESUPPLY", { targetDeploymentId: engineer.id })],
    });
    const output = resolveRound(makeRoundInput(
      makeState([logi, engineer], [makeHex(0, 0)], [resupply]),
      [resupply],
    ));
    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.supplies).toEqual({ SMALL_SUPPLY: 1 });
    expect(output.state.deployments.find((unit) => unit.id === engineer.id)?.supplies).toEqual({ SMALL_SUPPLY: 3 });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "SUPPLY_TRANSFERRED",
      actor: logi.id,
      payload: expect.objectContaining({
        purpose: "SAME_RESOURCE_TRANSFER",
        sourceResourceType: "SMALL_SUPPLY",
        resourceType: "SMALL_SUPPLY",
        quantity: 2,
        applicationRule: "SAME_RESOURCE_PARTIAL_TRANSFER_NO_AMMO_CONVERSION",
      }),
    }));

    const medic = governedDeployment("unit-combat-medic", "medic", position);
    medic.supplies = { MEDICAL_SUPPLY: 1 };
    const crossResource = makeOrder(logi, {
      actions: [action("resupply-medic", "RESUPPLY", { targetDeploymentId: medic.id })],
    });
    const blocked = resolveRound(makeRoundInput(
      makeState([logi, medic], [makeHex(0, 0)], [crossResource]),
      [crossResource],
    ));
    expect(blocked.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: logi.id,
      payload: expect.objectContaining({ reasons: [expect.stringContaining("governed Small Supply capacity")] }),
    }));

    const forged = governedDeployment("unit-main-battle-tank", "forged-logi", position);
    forged.tags = [...(forged.tags ?? []), "LOGISTICS"];
    forged.supplies = { SMALL_SUPPLY: 2 };
    const forgedOrder = makeOrder(forged, {
      actions: [action("forged-resupply", "RESUPPLY", { targetDeploymentId: engineer.id })],
    });
    const rejected = resolveRound(makeRoundInput(
      makeState([forged, engineer], [makeHex(0, 0)], [forgedOrder]),
      [forgedOrder],
    ));
    expect(rejected.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: forged.id,
      payload: expect.objectContaining({ reasons: ["Transfer Supply requires a Logi Truck."] }),
    }));
  });

  it("keeps ammunition reloads without a governed Logi conversion fail closed", () => {
    const position = { q: 0, r: 0 };
    const logi = governedDeployment("unit-logi-truck", "logi", position);
    logi.supplies = { SMALL_SUPPLY: 2 };
    const target = governedDeployment("unit-infantry-squad", "finite-ammo-target", position);
    target.weapons.push({
      id: "weapon-finite-unknown",
      name: "Finite unknown weapon",
      damage: { count: 1, sides: 4 },
      range: 1,
      armorPiercing: 0,
      ammoCapacity: 3,
      tags: [],
    });
    target.ammunition["weapon-finite-unknown"] = 1;
    const order = makeOrder(logi, {
      actions: [action("unsupported-ammo-resupply", "RESUPPLY", { targetDeploymentId: target.id })],
    });
    const output = resolveRound(makeRoundInput(makeState([logi, target], [makeHex(0, 0)], [order]), [order]));

    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.supplies).toEqual({ SMALL_SUPPLY: 2 });
    expect(output.state.deployments.find((unit) => unit.id === target.id)?.ammunition["weapon-finite-unknown"]).toBe(1);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: logi.id,
      payload: expect.objectContaining({
        reasons: ["Weapon-ammunition resupply has no governed Small Supply conversion (RC-SUP-001)."],
      }),
    }));
  });

  it("uses a paired Primary/route declaration for a capacity-bounded coordinated supply drop", () => {
    expect(transferCoordinatedSupplyDrop(
      { SMALL_SUPPLY: 9 },
      { SMALL_SUPPLY: 7 },
    )).toMatchObject({
      legal: true,
      quantityTransferred: 3,
      source: { SMALL_SUPPLY: 6 },
      destination: { SMALL_SUPPLY: 10 },
    });

    const logi = governedDeployment("unit-logi-truck", "logi", { q: 0, r: 0 });
    logi.supplies = { SMALL_SUPPLY: 7 };
    const hat = governedDeployment("unit-heavy-air-transport", "hat", { q: -1, r: 0 });
    hat.supplies = { SMALL_SUPPLY: 9 };
    const route = [hat.position, logi.position, { q: 1, r: 0 }];
    const logiOrder = makeOrder(logi, {
      actions: [action("coordinate-drop", "RESUPPLY", {
        targetDeploymentId: hat.id,
        economy: "PRIMARY",
        speedCost: 0,
      })],
    });
    const hatOrder = makeOrder(hat, {
      route,
      endHex: route[2],
      actions: [action("supply-drop", "AIRDROP", {
        targetDeploymentId: logi.id,
        targetHex: logi.position,
        payload: { cargoDeploymentId: logi.id },
      })],
    });
    const output = resolveRound(makeRoundInput(
      makeState([hat, logi], [makeHex(-1, 0), makeHex(0, 0), makeHex(1, 0)], [hatOrder, logiOrder]),
      [hatOrder, logiOrder],
    ));

    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.supplies).toEqual({ SMALL_SUPPLY: 10 });
    expect(output.state.deployments.find((unit) => unit.id === hat.id)?.supplies).toEqual({ SMALL_SUPPLY: 6 });
    expect(output.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "AIR_DROP_COMPLETED",
        actor: hat.id,
        payload: expect.objectContaining({
          coordinatedByActionId: "coordinate-drop",
          targetDeploymentId: logi.id,
          quantity: 3,
          applicationRule: "COORDINATED_DROP_TO_LOGI_ENDPOINT_PARTIAL_TO_CAPACITY",
        }),
      }),
      expect.objectContaining({
        type: "SUPPLY_TRANSFERRED",
        actor: logi.id,
        payload: expect.objectContaining({ purpose: "COORDINATED_SUPPLY_DROP", quantity: 3 }),
      }),
    ]));
  });

  it("fails the minimal coordinated-drop application rule closed when the HAT route does not cross the Logi endpoint", () => {
    const logi = governedDeployment("unit-logi-truck", "logi", { q: 0, r: 0 });
    logi.supplies = { SMALL_SUPPLY: 7 };
    const hat = governedDeployment("unit-heavy-air-transport", "hat", { q: -1, r: 0 });
    hat.supplies = { SMALL_SUPPLY: 9 };
    const route = [hat.position, { q: -1, r: 1 }];
    const logiOrder = makeOrder(logi, {
      actions: [action("coordinate-drop", "RESUPPLY", {
        targetDeploymentId: hat.id,
        economy: "PRIMARY",
        speedCost: 0,
      })],
    });
    const hatOrder = makeOrder(hat, {
      route,
      endHex: route[1],
      actions: [action("supply-drop", "AIRDROP", {
        targetDeploymentId: logi.id,
        targetHex: logi.position,
        payload: { cargoDeploymentId: logi.id },
      })],
    });
    const output = resolveRound(makeRoundInput(
      makeState(
        [hat, logi],
        [makeHex(-1, 0), makeHex(-1, 1), makeHex(0, 0)],
        [hatOrder, logiOrder],
      ),
      [hatOrder, logiOrder],
    ));

    expect(output.state.deployments.find((unit) => unit.id === logi.id)?.supplies).toEqual({ SMALL_SUPPLY: 7 });
    expect(output.state.deployments.find((unit) => unit.id === hat.id)?.supplies).toEqual({ SMALL_SUPPLY: 9 });
    expect(output.events).not.toContainEqual(expect.objectContaining({
      type: "AIR_DROP_COMPLETED",
      payload: expect.objectContaining({ applicationRule: "COORDINATED_DROP_TO_LOGI_ENDPOINT_PARTIAL_TO_CAPACITY" }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_FAILED",
      actor: hat.id,
      payload: expect.objectContaining({ actionId: "supply-drop" }),
    }));
  });

  it("freezes supply cargo on carrier loss and persists cargo, supply and tow linkage", () => {
    const attacker = makeDeployment("attacker", { q: 0, r: 0 }, "ALLIED", {
      weapons: [{ ...baseWeapon, damage: { count: 1, sides: 2, modifier: 2 } }],
    });
    const logi = governedDeployment("unit-logi-truck", "destroyed-logi", { q: 1, r: 0 }, "ENEMY");
    logi.supplies = { SMALL_SUPPLY: 5 };
    logi.cargo = [{
      id: "logi-small-supply",
      kind: "SUPPLY",
      quantity: 5,
      tags: ["SUPPLY", "SMALL_SUPPLY"],
      transportMode: "STOWED",
      supplyType: "SMALL_SUPPLY",
    }];
    logi.towedUnitId = "artillery";
    const artillery = governedDeployment("unit-artillery", "artillery", logi.position, "ENEMY");
    artillery.locationState = "EMBARKED";
    logi.cargo.push({
      id: "towed-artillery",
      kind: "PERSONNEL",
      quantity: artillery.currentHealth,
      tags: [...(artillery.tags ?? [])],
      transportMode: "TOWED",
      unitId: artillery.id,
    });
    const attack = makeOrder(attacker, {
      actions: [action("destroy-logi", "ATTACK", { targetDeploymentId: logi.id })],
      targets: [logi.id],
    });
    const output = resolveRound(makeRoundInput(
      makeState([attacker, logi, artillery], [makeHex(0, 0), makeHex(1, 0)], [attack]),
      [attack],
      [],
      { seed: "destroy-logi" },
    ));
    const persisted = output.persistentEffects.find((effect) =>
      effect.type === "UNIT_STATE_UPDATED" && effect.unitId === logi.persistentUnitId
    );

    expect(output.events).toContainEqual(expect.objectContaining({
      type: "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION",
      actor: logi.id,
      payload: expect.objectContaining({
        conflictId: "RC-V5-030",
        requiresAdjudication: true,
        resolution: "FROZEN_WITH_DESTROYED_CARRIER",
      }),
    }));
    expect(output.state.deployments.find((unit) => unit.id === artillery.id)).toMatchObject({
      locationState: "EMBARKED",
      position: logi.position,
    });
    expect(persisted?.payload).toMatchObject({
      supplies: { SMALL_SUPPLY: 5 },
      towedUnitId: artillery.persistentUnitId,
      cargo: expect.arrayContaining([
        expect.objectContaining({ kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5 }),
        expect.objectContaining({ unitId: artillery.persistentUnitId, transportMode: "TOWED" }),
      ]),
    });
  });
});

import { describe, expect, it } from "vitest";
import type { CampaignDeployment, CargoManifestItem, StructuredAction, UnitOrder } from "../../domain/src";

import {
  getTacticalActionRule,
  getTacticalCargoProfile,
  getTacticalUnitClass,
  isEligibleSpotter,
  resolveRound,
  validateCargoManifest,
  validateOrder,
} from "../src";
import { makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function governedDeployment(
  definitionId: string,
  id: string,
  position: { q: number; r: number },
  side: CampaignDeployment["side"] = "ALLIED",
): CampaignDeployment {
  const definition = getTacticalUnitClass(definitionId);
  return makeDeployment(id, position, side, {
    definitionId,
    tags: [...definition.tags],
    stats: structuredClone(definition.stats),
    weapons: structuredClone(definition.weapons),
    cargoProfile: getTacticalCargoProfile(definitionId),
    cargo: [],
  });
}

function action(
  id: string,
  type: StructuredAction["type"],
  fields: Partial<StructuredAction> = {},
): StructuredAction {
  const rule = getTacticalActionRule(type);
  return {
    id,
    type,
    economy: rule.economy,
    speedCost: rule.speedCost,
    equipmentIds: [],
    ...fields,
  };
}

function pairedLoadOrders(
  carrier: CampaignDeployment,
  passenger: CampaignDeployment,
): UnitOrder[] {
  return [
    makeOrder(carrier, { actions: [action("vtol-load", "LOAD", { targetDeploymentId: passenger.id })] }),
    makeOrder(passenger, { actions: [action("passenger-load", "LOAD", { targetDeploymentId: carrier.id })] }),
  ];
}

describe("canonical V5 VTOL mechanics", () => {
  it("keeps the generic VTOL distinct from fixed-wing and Heavy Air Transport mechanics", () => {
    const vtol = getTacticalUnitClass("unit-vtol");

    expect(vtol).toMatchObject({
      category: "AEROSPACE",
      tags: expect.arrayContaining(["AEROSPACE", "VTOL", "VEHICLE", "ARMOURED", "TRANSPORT", "CANNOT_SPOT_GROUND"]),
      stats: { healthModel: "HITS", maxHealth: 2, armor: 1, speed: 5 },
      allowedOrders: ["HOLD", "ADVANCE"],
      allowedActions: ["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF"],
      weapons: [{
        id: "weapon-vtol-nose-gun",
        damage: { count: 1, sides: 2, modifier: 0 },
        range: 1,
        armorPiercing: 0,
      }],
      slots: {},
    });
    expect(vtol.tags).not.toContain("ATMO_FLIGHT");
    expect(vtol.tags).not.toContain("AIRDROP");
    expect(vtol.allowedActions).not.toContain("AIRDROP");
    expect(vtol.allowedActions).not.toContain("REARM_AEROSPACE");
    expect(vtol.weapons[0]?.ammoCapacity).toBeUndefined();
  });

  it("flies through hostile ground occupation without terrain cost and fires its D2 nose gun", () => {
    const vtol = governedDeployment("unit-vtol", "vtol", { q: 0, r: 0 });
    const hostile = makeDeployment("hostile", { q: 1, r: 0 }, "ENEMY", {
      stats: { maxHealth: 20 },
      currentHealth: 20,
    });
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const order = makeOrder(vtol, {
      orderType: "ADVANCE",
      route,
      endHex: route[2]!,
      actions: [action("nose-gun", "ATTACK", { targetDeploymentId: hostile.id })],
    });
    const state = makeState(
      [vtol, hostile],
      [
        makeHex(0, 0),
        makeHex(1, 0, {
          capacity: 1,
          elevation: 4,
          movementCost: 3,
          edges: { roads: [], rivers: [2] },
          structureIds: ["structure-tank-traps:vtol-proof"],
        }),
        makeHex(2, 0),
      ],
      [order],
    );

    expect(validateOrder(order, vtol, makeRoundInput(state, [order]))).toMatchObject({
      legal: true,
      movementCost: 2,
    });
    const output = resolveRound(makeRoundInput(state, [order], [], { seed: "vtol-hostile-passage" }));

    expect(output.state.deployments.find((unit) => unit.id === vtol.id)?.position).toEqual({ q: 2, r: 0 });
    expect(output.events.some((event) => event.type === "UNIT_BLOCKED" && event.actor === vtol.id)).toBe(false);
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_MOVED",
      actor: vtol.id,
      payload: expect.objectContaining({ route }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "DICE_ROLLED",
      actor: vtol.id,
      payload: expect.objectContaining({
        weaponId: "weapon-vtol-nose-gun",
        dice: { count: 1, sides: 2, modifier: 0 },
      }),
    }));
  });

  it("enforces the RC-V5-017 mutually-exclusive infantry-or-Small-Supply capacity", () => {
    const profile = getTacticalCargoProfile("unit-vtol")!;
    const infantry: CargoManifestItem = {
      id: "infantry",
      kind: "PERSONNEL",
      quantity: 6,
      tags: ["INFANTRY", "PERSONNEL"],
    };
    const supply: CargoManifestItem = {
      id: "supply",
      kind: "SUPPLY",
      supplyType: "SMALL_SUPPLY",
      quantity: 2,
      tags: ["SUPPLY", "SMALL_SUPPLY"],
    };

    expect(profile).toMatchObject({
      id: "cargo-vtol-alternative",
      capacitySlotsQuarters: 4,
      allowMixedLoadGroups: false,
      rules: [
        expect.objectContaining({ cargoKind: "PERSONNEL", requiredTags: ["INFANTRY"], quantityPerSlot: 6 }),
        expect.objectContaining({ cargoKind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantityPerSlot: 2 }),
      ],
    });
    expect(validateCargoManifest(profile, [infantry])).toMatchObject({ legal: true, slotsUsedQuarters: 4 });
    expect(validateCargoManifest(profile, [supply])).toMatchObject({ legal: true, slotsUsedQuarters: 4 });
    expect(validateCargoManifest(profile, [infantry, supply])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "Carrier cannot mix these cargo load groups.",
        "Cargo capacity exceeded (8/4 quarters).",
      ]),
    });
    expect(validateCargoManifest(profile, [{ ...infantry, quantity: 7 }])).toMatchObject({ legal: false });
    expect(validateCargoManifest(profile, [{
      ...supply,
      supplyType: "MEDIUM_SUPPLY",
    }])).toMatchObject({
      legal: false,
      reasons: [expect.stringContaining("ineligible")],
    });
  });

  it("loads and persists one infantry squad, but rejects mixing it with onboard Small Supply", () => {
    const vtol = governedDeployment("unit-vtol", "vtol", { q: 0, r: 0 });
    const infantry = governedDeployment("unit-infantry-squad", "infantry", { q: 0, r: 0 });
    const loadOrders = pairedLoadOrders(vtol, infantry);
    const loadState = makeState([vtol, infantry], [makeHex(0, 0)], loadOrders);

    const loaded = resolveRound(makeRoundInput(loadState, loadOrders));
    const loadedVtol = loaded.state.deployments.find((unit) => unit.id === vtol.id)!;
    expect(loadedVtol.cargo).toContainEqual(expect.objectContaining({
      unitId: infantry.id,
      kind: "PERSONNEL",
      quantity: 6,
    }));
    expect(loaded.state.deployments.find((unit) => unit.id === infantry.id)?.locationState).toBe("EMBARKED");
    expect(loaded.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: vtol.persistentUnitId,
      payload: expect.objectContaining({
        cargo: [expect.objectContaining({ unitId: infantry.persistentUnitId, quantity: 6 })],
      }),
    }));

    const suppliedVtol = governedDeployment("unit-vtol", "supplied-vtol", { q: 0, r: 0 });
    suppliedVtol.supplies = { SMALL_SUPPLY: 2 };
    const secondSquad = governedDeployment("unit-infantry-squad", "second-squad", { q: 0, r: 0 });
    const rejectedOrders = pairedLoadOrders(suppliedVtol, secondSquad);
    const rejectedState = makeState([suppliedVtol, secondSquad], [makeHex(0, 0)], rejectedOrders);

    const rejected = resolveRound(makeRoundInput(rejectedState, rejectedOrders));
    expect(rejected.events.some((event) => event.type === "CARGO_LOADED")).toBe(false);
    expect(rejected.state.deployments.find((unit) => unit.id === secondSquad.id)?.locationState).not.toBe("EMBARKED");
    expect(rejected.state.deployments.find((unit) => unit.id === suppliedVtol.id)?.cargo).toEqual([
      expect.objectContaining({ kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 2 }),
    ]);
    expect(rejected.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: suppliedVtol.id,
      payload: expect.objectContaining({ reasons: [expect.stringContaining("cannot mix")] }),
    }));
  });

  it("lands only at a friendly VTOL facility and must take off before moving", () => {
    const vtol = governedDeployment("unit-vtol", "vtol", { q: 0, r: 0 });
    const landingHex = makeHex(0, 0, {
      control: "ALLIED",
      environment: ["LAND_VTOL"],
    });
    const destination = makeHex(1, 0);
    const land = makeOrder(vtol, { actions: [action("land", "LAND")] });
    const landingState = makeState([vtol], [landingHex, destination], [land]);

    const landed = resolveRound(makeRoundInput(landingState, [land]));
    expect(landed.state.deployments.find((unit) => unit.id === vtol.id)?.statuses).toContain("LANDED");
    expect(landed.events).toContainEqual(expect.objectContaining({ type: "AEROSPACE_LANDED", actor: vtol.id }));

    const landedVtol = landed.state.deployments.find((unit) => unit.id === vtol.id)!;
    const illegalMove = makeOrder(landedVtol, {
      round: 2,
      orderType: "ADVANCE",
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
    });
    const nextState = structuredClone(landed.state);
    nextState.round = 2;
    nextState.phase = "PLANNING";
    expect(validateOrder(illegalMove, landedVtol, makeRoundInput(nextState))).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["A landed aerospace unit must Take Off before moving."]),
    });

    const takeOff = makeOrder(landedVtol, {
      round: 2,
      orderType: "ADVANCE",
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
      actions: [action("take-off", "TAKE_OFF")],
    });
    nextState.orders = [takeOff];
    const airborne = resolveRound(makeRoundInput(nextState, [takeOff], [], { resolutionTime: 120_000 }));
    expect(airborne.state.deployments.find((unit) => unit.id === vtol.id)).toMatchObject({
      position: { q: 1, r: 0 },
      statuses: [],
    });
    expect(airborne.events).toContainEqual(expect.objectContaining({ type: "AEROSPACE_TOOK_OFF", actor: vtol.id }));

    const wrongFacilityVtol = governedDeployment("unit-vtol", "wrong-field-vtol", { q: 0, r: 0 });
    const wrongFacilityLand = makeOrder(wrongFacilityVtol, { actions: [action("wrong-land", "LAND")] });
    const wrongFacilityState = makeState(
      [wrongFacilityVtol],
      [makeHex(0, 0, { control: "ALLIED", environment: ["LAND_AEROSPACE"] })],
      [wrongFacilityLand],
    );
    expect(validateOrder(wrongFacilityLand, wrongFacilityVtol, makeRoundInput(wrongFacilityState, [wrongFacilityLand])))
      .toMatchObject({
        legal: false,
        reasons: expect.arrayContaining(["Landing requires a friendly compatible airfield at the route endpoint."]),
      });
  });

  it("cannot spot ground targets and fails closed for HAT airdrop or ammunition rearm", () => {
    const vtol = governedDeployment("unit-vtol", "vtol", { q: 0, r: 0 });
    expect(isEligibleSpotter({
      id: vtol.id,
      side: vtol.side,
      status: vtol.status,
      position: vtol.position,
      sensorRange: 4,
      tags: [...(vtol.tags ?? [])],
      profile: {
        id: "v5-ground-spotter",
        canSpotDomains: ["GROUND"],
        allowsFiringUnit: false,
        prohibitedTags: ["CANNOT_SPOT_GROUND"],
      },
    }, "artillery", "ALLIED", {
      id: "ground-target",
      side: "ENEMY",
      status: "ACTIVE",
      position: { q: 1, r: 0 },
      domain: "GROUND",
    }, [makeHex(0, 0), makeHex(1, 0)])).toBe(false);

    const passenger = governedDeployment("unit-infantry-squad", "passenger", { q: 0, r: 0 });
    passenger.locationState = "EMBARKED";
    vtol.cargo = [{
      id: "vtol-passenger",
      kind: "PERSONNEL",
      quantity: 6,
      tags: [...(passenger.tags ?? [])],
      transportMode: "AIRLIFTED",
      unitId: passenger.id,
    }];
    const airdrop = makeOrder(vtol, {
      orderType: "ADVANCE",
      route: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
      actions: [action("illegal-airdrop", "AIRDROP", {
        targetDeploymentId: passenger.id,
        targetHex: { q: 1, r: 0 },
        payload: { cargoDeploymentId: passenger.id },
      })],
    });
    const dropState = makeState([vtol, passenger], [
      makeHex(0, 0),
      makeHex(1, 0, { control: "ALLIED" }),
    ], [airdrop]);
    const dropped = resolveRound(makeRoundInput(dropState, [airdrop]));
    expect(dropped.events.some((event) => event.type === "AIR_DROP_COMPLETED")).toBe(false);
    expect(dropped.state.deployments.find((unit) => unit.id === passenger.id)?.locationState).toBe("EMBARKED");
    expect(dropped.events).toContainEqual(expect.objectContaining({ type: "AIR_DROP_FAILED", actor: vtol.id }));

    const rearmVtol = governedDeployment("unit-vtol", "rearm-vtol", { q: 0, r: 0 });
    rearmVtol.statuses = ["LANDED"];
    const rearm = makeOrder(rearmVtol, { actions: [action("illegal-rearm", "REARM_AEROSPACE")] });
    const rearmState = makeState(
      [rearmVtol],
      [makeHex(0, 0, { control: "ALLIED", environment: ["LAND_VTOL", "REARM_AEROSPACE"] })],
      [rearm],
    );
    expect(validateOrder(rearm, rearmVtol, makeRoundInput(rearmState, [rearm]))).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["This aerospace unit has no ammunition store to rearm."]),
    });
  });
});

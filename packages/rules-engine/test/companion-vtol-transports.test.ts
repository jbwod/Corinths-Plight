import type { CampaignDeployment, CargoManifestItem, StructuredAction } from "../../domain/src";
import { describe, expect, it } from "vitest";

import {
  COMPANION_VTOL_CARRIER_LOSS_POLICY,
  COMPANION_VTOL_EXTERNAL_LOAD_TAG,
  COMPANION_VTOL_OBJECTIVE_CARGO_TAG,
  COMPANION_VTOL_SUPPLY_CARGO_TAG,
  COMPANION_VTOL_UNIT_CARGO_TAG,
  getCompanionVtolCargoProfile,
  getCompanionVtolPublicV1Class,
  makeCompanionVtolCargoItem,
  companionVtolNormalCargoOperationAllowed,
  resolveCompanionVtolRappel,
  resolveRound,
  synchronizeSupplyCargo,
  validateOrder,
  validateCompanionVtolIdentity,
  validateCompanionVtolManifest,
} from "../src";
import { makeAction, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

type CompanionVtolId =
  | "unit-vtol-troop-airlift"
  | "unit-vtol-multipurpose-airlift"
  | "unit-vtol-heavy-lift";

function vtol(definitionId: CompanionVtolId, id: string = definitionId): CampaignDeployment {
  const definition = getCompanionVtolPublicV1Class(definitionId, 3);
  return makeDeployment(id, { q: 0, r: 0 }, "ALLIED", {
    definitionId,
    tags: [...definition.tags],
    stats: structuredClone(definition.stats),
    weapons: structuredClone(definition.weapons),
    allowedActions: [...definition.allowedActions] as CampaignDeployment["allowedActions"],
    allowedOrders: [...definition.allowedOrders] as CampaignDeployment["allowedOrders"],
    cargoProfile: getCompanionVtolCargoProfile(definitionId),
    cargo: [],
  });
}

function cargoDeployment(
  id: string,
  definitionId: string,
  tags: string[],
): CampaignDeployment {
  return makeDeployment(id, { q: 0, r: 0 }, "ALLIED", { definitionId, tags });
}

function itemFor(carrierDefinitionId: CompanionVtolId, cargo: CampaignDeployment): CargoManifestItem {
  const result = makeCompanionVtolCargoItem({
    campaignId: "campaign-vtol-companion",
    carrierDefinitionId,
    cargo,
  });
  expect(result).toMatchObject({ legal: true, reasons: [] });
  return result.item!;
}

const infantry = () => cargoDeployment("infantry", "unit-infantry-squad", ["GROUND", "INFANTRY", "PERSONNEL"]);
const secondInfantry = () => cargoDeployment("infantry-two", "unit-power-armoured-infantry", ["GROUND", "INFANTRY", "PERSONNEL"]);
const lightVehicle = () => cargoDeployment("light-vehicle", "unit-light-vehicle", ["GROUND", "VEHICLE", "LIGHT_VEHICLE"]);
const heavyTank = () => cargoDeployment("heavy-tank", "unit-heavy-battle-tank", ["GROUND", "VEHICLE", "ARMOURED", "HEAVY"]);
const mediumMech = () => cargoDeployment("medium-mech", "unit-medium-mech", ["GROUND", "VEHICLE", "ARMOURED", "MECH"]);
const supplyCargo = () => cargoDeployment("supply-cargo", "mission-supply-cargo", [COMPANION_VTOL_SUPPLY_CARGO_TAG]);
const objectiveCargo = () => cargoDeployment("objective-cargo", "mission-objective-cargo", [COMPANION_VTOL_OBJECTIVE_CARGO_TAG]);

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const economy = type === "REARM_AEROSPACE" ? "PRIMARY" : "STANDARD";
  const speedCost = type === "LOAD" || type === "UNLOAD" || type === "LAND" || type === "TAKE_OFF" ? 0.5 : 0;
  return makeAction(id, { type, economy, speedCost, ...fields });
}

describe("public-v1 companion VTOL transports", () => {
  it("projects all three approved chassis, exact slots/prices, and one-shot rearm guns only where sourced", () => {
    expect(getCompanionVtolPublicV1Class("unit-vtol-troop-airlift", 4)).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 3, armor: 1, speed: 5, sensors: 4 },
      requisitionCost: 12,
      slots: { light: 1, internal: 1 },
      allowedActions: ["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF", "REARM_AEROSPACE"],
      weapons: [{
        id: "weapon-vtol-light-gun-public-v1",
        damage: { count: 1, sides: 2 },
        range: 1,
        armorPiercing: 0,
        ammoCapacity: 1,
      }],
      tags: expect.arrayContaining(["VTOL", "CANNOT_SPOT_GROUND", "REARM_AFTER_ATTACK"]),
    });
    expect(getCompanionVtolPublicV1Class("unit-vtol-multipurpose-airlift", 2)).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 3, armor: 1, speed: 5, sensors: 2 },
      requisitionCost: 12,
      weapons: [{ ammoCapacity: 1 }],
    });
    expect(getCompanionVtolPublicV1Class("unit-vtol-heavy-lift", 1)).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 3, armor: 3, speed: 5, sensors: 1 },
      requisitionCost: 14,
      allowedActions: ["LOAD", "UNLOAD", "LAND", "TAKE_OFF"],
      weapons: [],
    });
    expect(() => getCompanionVtolPublicV1Class("unit-vtol-heavy-lift", -1)).toThrow(/sensor range/i);
    expect(validateCompanionVtolIdentity(vtol("unit-vtol-troop-airlift"))).toEqual({ legal: true, reasons: [] });
  });

  it("carries two whole Infantry units or one opaque Supply Cargo package in Troop Airlift", () => {
    const one = itemFor("unit-vtol-troop-airlift", infantry());
    const two = itemFor("unit-vtol-troop-airlift", secondInfantry());
    const supply = itemFor("unit-vtol-troop-airlift", supplyCargo());
    expect(one).toMatchObject({
      kind: "PERSONNEL",
      quantity: 1,
      tags: expect.arrayContaining([COMPANION_VTOL_UNIT_CARGO_TAG]),
    });
    expect(validateCompanionVtolManifest("unit-vtol-troop-airlift", [one, two])).toMatchObject({
      legal: true,
      slotsUsedQuarters: 8,
    });
    expect(validateCompanionVtolManifest("unit-vtol-troop-airlift", [supply])).toMatchObject({
      legal: true,
      slotsUsedQuarters: 8,
    });
    expect(validateCompanionVtolManifest("unit-vtol-troop-airlift", [one, supply])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "Troop Airlift uses Infantry or Supply Cargo capacity, never both.",
      ]),
    });
    expect(validateCompanionVtolManifest("unit-vtol-troop-airlift", [{ ...one, quantity: 5 }])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        expect.stringContaining("exactly one unit or package"),
      ]),
    });
  });

  it("preserves Multi-Purpose simultaneous Light Vehicle plus one Infantry-or-Supply lane", () => {
    const passenger = itemFor("unit-vtol-multipurpose-airlift", infantry());
    const vehicle = itemFor("unit-vtol-multipurpose-airlift", lightVehicle());
    const supply = itemFor("unit-vtol-multipurpose-airlift", supplyCargo());
    expect(validateCompanionVtolManifest("unit-vtol-multipurpose-airlift", [passenger, vehicle])).toMatchObject({
      legal: true,
      slotsUsedQuarters: 8,
    });
    expect(validateCompanionVtolManifest("unit-vtol-multipurpose-airlift", [supply, vehicle])).toMatchObject({
      legal: true,
      slotsUsedQuarters: 8,
    });
    expect(validateCompanionVtolManifest("unit-vtol-multipurpose-airlift", [passenger, supply])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "Multi-Purpose Airlift carries at most one Infantry unit or one opaque Supply Cargo package.",
      ]),
    });
    expect(makeCompanionVtolCargoItem({
      campaignId: "campaign-vtol-companion",
      carrierDefinitionId: "unit-vtol-multipurpose-airlift",
      cargo: heavyTank(),
    })).toMatchObject({ legal: false, reasons: [expect.stringContaining("not eligible cargo")] });
  });

  it("records exactly one governed heavy unit, objective, or Supply Cargo package as an external Heavy Lift load", () => {
    for (const cargo of [mediumMech(), heavyTank(), objectiveCargo(), supplyCargo()]) {
      const item = itemFor("unit-vtol-heavy-lift", cargo);
      expect(item).toMatchObject({
        quantity: 1,
        transportMode: "EMBARKED",
        tags: expect.arrayContaining([COMPANION_VTOL_EXTERNAL_LOAD_TAG]),
      });
      expect(validateCompanionVtolManifest("unit-vtol-heavy-lift", [item])).toMatchObject({ legal: true });
    }
    const mech = itemFor("unit-vtol-heavy-lift", mediumMech());
    const tank = itemFor("unit-vtol-heavy-lift", heavyTank());
    expect(validateCompanionVtolManifest("unit-vtol-heavy-lift", [mech, tank])).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining(["Heavy Lift carries exactly one external load at a time."]),
    });
    expect(makeCompanionVtolCargoItem({
      campaignId: "campaign-vtol-companion",
      carrierDefinitionId: "unit-vtol-heavy-lift",
      cargo: lightVehicle(),
    })).toMatchObject({ legal: false });
    expect(makeCompanionVtolCargoItem({
      campaignId: "campaign-vtol-companion",
      carrierDefinitionId: "unit-vtol-heavy-lift",
      cargo: infantry(),
    })).toMatchObject({ legal: false });
  });

  it("requires landing for normal cargo operations but rappels manifested Infantry into an authored building on its route", () => {
    const carrier = vtol("unit-vtol-troop-airlift", "troop-airlift");
    const passenger = infantry();
    passenger.locationState = "EMBARKED";
    carrier.cargo = [itemFor("unit-vtol-troop-airlift", passenger)];
    expect(companionVtolNormalCargoOperationAllowed(carrier)).toMatchObject({
      legal: false,
      reasons: [expect.stringContaining("requires the carrier to be landed")],
    });
    const building = makeHex(1, 0, {
      structureIds: ["structure-civic-building:alpha"],
      environment: ["INFANTRY_GARRISON_BUILDING"],
    });
    const rappelled = resolveCompanionVtolRappel({
      carrier,
      passenger,
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      destination: building,
      canOccupyDestination: true,
    });
    expect(rappelled).toMatchObject({
      legal: true,
      manifest: [],
      passengerStatuses: ["GARRISONED"],
      targetHex: { q: 1, r: 0 },
      passengerActionRequired: false,
      carrierMustLand: false,
    });
    carrier.statuses = ["LANDED"];
    expect(companionVtolNormalCargoOperationAllowed(carrier)).toEqual({ legal: true, reasons: [] });
  });

  it("fails rappel closed off-route, outside authored garrisons, when landed, or for Multi-Purpose Airlift", () => {
    const carrier = vtol("unit-vtol-troop-airlift", "troop-airlift");
    const passenger = infantry();
    passenger.locationState = "EMBARKED";
    carrier.cargo = [itemFor("unit-vtol-troop-airlift", passenger)];
    const wrongHex = makeHex(2, 0);
    expect(resolveCompanionVtolRappel({
      carrier,
      passenger,
      flightPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: wrongHex,
      canOccupyDestination: false,
    })).toMatchObject({
      legal: false,
      reasons: expect.arrayContaining([
        "Rappelling destination must be an authored Infantry garrison building.",
        "Rappelling destination has no room for the Infantry unit.",
      ]),
    });
    carrier.statuses = ["LANDED"];
    expect(resolveCompanionVtolRappel({
      carrier,
      passenger,
      flightPath: [{ q: 0, r: 0 }],
      destination: makeHex(0, 0, { environment: ["INFANTRY_GARRISON_BUILDING"] }),
      canOccupyDestination: true,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining([expect.stringContaining("remain airborne")]) });
    const multipurpose = vtol("unit-vtol-multipurpose-airlift", "multipurpose");
    multipurpose.cargo = [itemFor("unit-vtol-multipurpose-airlift", passenger)];
    expect(resolveCompanionVtolRappel({
      carrier: multipurpose,
      passenger,
      flightPath: [{ q: 0, r: 0 }],
      destination: makeHex(0, 0, { environment: ["INFANTRY_GARRISON_BUILDING"] }),
      canOccupyDestination: true,
    })).toMatchObject({ legal: false, reasons: expect.arrayContaining([expect.stringContaining("Only VTOL Heavy Troop")]) });
  });

  it("pins shared carrier-loss adjudication instead of inventing passenger casualties or a drop", () => {
    expect(COMPANION_VTOL_CARRIER_LOSS_POLICY).toEqual({
      conflictId: "RC-V5-030",
      disposition: "FREEZE_FOR_GM_ADJUDICATION",
      automaticPassengerDamage: false,
      automaticCargoDeployment: false,
    });
  });

  it("persists opaque Supply Cargo packages without converting them into invented tactical resources", () => {
    const profile = getCompanionVtolCargoProfile("unit-vtol-troop-airlift");
    const opaquePackage = itemFor("unit-vtol-troop-airlift", supplyCargo());
    expect(synchronizeSupplyCargo(profile, [opaquePackage], {}, "inventory-row")).toEqual([opaquePackage]);
    expect(opaquePackage.supplyType).toBeUndefined();
  });

  it("loads and unloads a whole Infantry unit through landed paired actions with deterministic event payloads", () => {
    const carrier = vtol("unit-vtol-troop-airlift", "troop-airlift");
    carrier.statuses = ["LANDED"];
    const passenger = infantry();
    const loadOrders = [
      makeOrder(carrier, { actions: [action("carrier-load", "LOAD", { targetDeploymentId: passenger.id })] }),
      makeOrder(passenger, { actions: [action("passenger-load", "LOAD", { targetDeploymentId: carrier.id })] }),
    ];
    const loadState = makeState([carrier, passenger], [makeHex(0, 0, {
      control: "ALLIED",
      environment: ["LAND_VTOL"],
    })], loadOrders);
    const loaded = resolveRound(makeRoundInput(loadState, loadOrders));
    const loadedCarrier = loaded.state.deployments.find((deployment) => deployment.id === carrier.id)!;
    const loadedPassenger = loaded.state.deployments.find((deployment) => deployment.id === passenger.id)!;
    expect(loadedCarrier.cargo).toContainEqual(expect.objectContaining({
      unitId: passenger.id,
      kind: "PERSONNEL",
      quantity: 1,
      tags: expect.arrayContaining([COMPANION_VTOL_UNIT_CARGO_TAG]),
    }));
    expect(loadedPassenger).toMatchObject({ locationState: "EMBARKED", position: carrier.position });
    expect(loaded.events).toContainEqual(expect.objectContaining({
      type: "CARGO_LOADED",
      actor: carrier.id,
      payload: expect.objectContaining({
        cargoDeploymentId: passenger.id,
        transportMode: "EMBARKED",
        externalLoad: false,
        speedCostQuarters: 2,
      }),
    }));

    loaded.state.round = 2;
    loaded.state.phase = "PLANNING";
    const unloadOrders = [
      makeOrder(loadedCarrier, {
        round: 2,
        actions: [action("carrier-unload", "UNLOAD", { targetDeploymentId: loadedPassenger.id })],
      }),
      makeOrder(loadedPassenger, {
        round: 2,
        actions: [action("passenger-unload", "UNLOAD", { targetDeploymentId: loadedCarrier.id })],
      }),
    ];
    loaded.state.orders = unloadOrders;
    const unloaded = resolveRound(makeRoundInput(loaded.state, unloadOrders, [], { resolutionTime: 120_000 }));
    expect(unloaded.state.deployments.find((deployment) => deployment.id === carrier.id)?.cargo).toEqual([]);
    expect(unloaded.state.deployments.find((deployment) => deployment.id === passenger.id)).toMatchObject({
      locationState: "ON_MAP",
      position: carrier.position,
    });
    expect(unloaded.events).toContainEqual(expect.objectContaining({
      type: "CARGO_UNLOADED",
      actor: carrier.id,
      payload: expect.objectContaining({ cargoDeploymentId: passenger.id, speedCostQuarters: 2 }),
    }));
  });

  it("executes airborne Rappel Garrison without a passenger action and persists the garrison transition", () => {
    const carrier = vtol("unit-vtol-troop-airlift", "troop-airlift");
    const passenger = infantry();
    passenger.locationState = "EMBARKED";
    carrier.cargo = [itemFor("unit-vtol-troop-airlift", passenger)];
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const rappel = makeOrder(carrier, {
      orderType: "ADVANCE",
      route,
      endHex: route[2],
      actions: [action("rappel", "UNLOAD", {
        targetDeploymentId: passenger.id,
        targetHex: route[1],
        payload: { mode: "RAPPEL_GARRISON", cargoDeploymentId: passenger.id },
      })],
    });
    const state = makeState([carrier, passenger], [
      makeHex(0, 0),
      makeHex(1, 0, { environment: ["INFANTRY_GARRISON_BUILDING"], structureIds: ["structure-building:alpha"] }),
      makeHex(2, 0),
    ], [rappel]);
    expect(validateOrder(rappel, carrier, makeRoundInput(state, [rappel]))).toMatchObject({ legal: true });
    const output = resolveRound(makeRoundInput(state, [rappel], [], { seed: "companion-vtol-rappel" }));
    expect(output.state.deployments.find((deployment) => deployment.id === carrier.id)).toMatchObject({
      position: { q: 2, r: 0 },
      cargo: [],
    });
    expect(output.state.deployments.find((deployment) => deployment.id === passenger.id)).toMatchObject({
      locationState: "ON_MAP",
      position: { q: 1, r: 0 },
      statuses: expect.arrayContaining(["GARRISONED"]),
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "CARGO_UNLOADED",
      actor: carrier.id,
      payload: expect.objectContaining({
        mode: "RAPPEL_GARRISON",
        cargoDeploymentId: passenger.id,
        passengerActionRequired: false,
        carrierMustLand: false,
      }),
    }));
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "UNIT_GARRISONED",
      actor: passenger.id,
      payload: expect.objectContaining({ reason: "VTOL_RAPPEL_GARRISON" }),
    }));
    expect(output.persistentEffects).toContainEqual(expect.objectContaining({
      type: "UNIT_STATE_UPDATED",
      unitId: passenger.persistentUnitId,
      payload: expect.objectContaining({ locationState: "ON_MAP", statuses: expect.arrayContaining(["GARRISONED"]) }),
    }));
  });

  it("fires once, enters rearm-required state, then lands and rearms at a friendly governed VTOL facility", () => {
    const carrier = vtol("unit-vtol-multipurpose-airlift", "multipurpose");
    const target = makeDeployment("target", { q: 1, r: 0 }, "ENEMY", {
      stats: { maxHealth: 20 },
      currentHealth: 20,
    });
    const attack = makeOrder(carrier, {
      actions: [action("nose-gun", "ATTACK", { targetDeploymentId: target.id })],
      targets: [target.id],
    });
    const attacked = resolveRound(makeRoundInput(
      makeState([carrier, target], [makeHex(0, 0), makeHex(1, 0)], [attack]),
      [attack],
      [],
      { seed: "companion-vtol-gun" },
    ));
    const spent = attacked.state.deployments.find((deployment) => deployment.id === carrier.id)!;
    expect(spent.ammunition).toEqual({ "weapon-vtol-light-gun-public-v1": 0 });
    expect(spent.statuses).toContain("REARM_REQUIRED");

    attacked.state.round = 2;
    attacked.state.phase = "PLANNING";
    attacked.state.map[0] = makeHex(0, 0, {
      control: "ALLIED",
      environment: ["LAND_VTOL", "REARM_AEROSPACE"],
    });
    const rearm = makeOrder(spent, {
      round: 2,
      actions: [
        action("land", "LAND"),
        action("rearm", "REARM_AEROSPACE"),
      ],
    });
    attacked.state.orders = [rearm];
    expect(validateOrder(rearm, spent, makeRoundInput(attacked.state, [rearm]))).toMatchObject({ legal: true });
    const rearmed = resolveRound(makeRoundInput(attacked.state, [rearm], [], { resolutionTime: 120_000 }));
    expect(rearmed.state.deployments.find((deployment) => deployment.id === carrier.id)).toMatchObject({
      ammunition: { "weapon-vtol-light-gun-public-v1": 1 },
      statuses: ["LANDED"],
    });
    expect(rearmed.events).toContainEqual(expect.objectContaining({
      type: "AEROSPACE_REARMED",
      actor: carrier.id,
      payload: expect.objectContaining({
        weaponIds: ["weapon-vtol-light-gun-public-v1"],
        rulesDecisionId: "RC-V5-023",
      }),
    }));
  });

  it("uses the shared frozen carrier-loss adjudication path for external Heavy Lift cargo", () => {
    const carrier = vtol("unit-vtol-heavy-lift", "heavy-lift");
    const carried = heavyTank();
    carried.locationState = "EMBARKED";
    carrier.cargo = [itemFor("unit-vtol-heavy-lift", carried)];
    const attacker = makeDeployment("attacker", { q: 1, r: 0 }, "ENEMY", {
      weapons: [{ id: "kill", name: "Kill", damage: { count: 1, sides: 1 }, range: 2, armorPiercing: 99, tags: [] }],
    });
    carrier.currentHealth = 1;
    const attack = makeOrder(attacker, {
      actions: [action("destroy-heavy-lift", "ATTACK", { targetDeploymentId: carrier.id })],
      targets: [carrier.id],
    });
    const output = resolveRound(makeRoundInput(
      makeState([attacker, carrier, carried], [makeHex(0, 0), makeHex(1, 0)], [attack]),
      [attack],
      [],
      { seed: "companion-heavy-lift-loss" },
    ));
    expect(output.state.deployments.find((deployment) => deployment.id === carried.id)).toMatchObject({
      status: "ACTIVE",
      locationState: "EMBARKED",
      position: carrier.position,
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION",
      actor: carrier.id,
      payload: expect.objectContaining({
        conflictId: "RC-V5-030",
        requiresAdjudication: true,
        resolution: "FROZEN_WITH_DESTROYED_CARRIER",
        cargo: [expect.objectContaining({ cargoDeploymentId: carried.id, kind: "VEHICLE" })],
      }),
    }));
  });
});

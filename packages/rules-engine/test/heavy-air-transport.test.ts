import { describe, expect, it } from "vitest";
import type { CampaignDeployment, StructuredAction, UnitOrder } from "../../domain/src";
import {
  calculateRouteCost,
  createDemoCampaignState,
  createScenarioCampaignState,
  getActionDefinition,
  getTacticalCargoProfile,
  getTacticalUnitClass,
  projectCampaignState,
  resolveRound,
  resolveSimultaneousMovement,
  validateCargoManifest,
  validateHatClearAirDrop,
} from "../src";
import { baseWeapon, makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";

function action(id: string, type: StructuredAction["type"], fields: Partial<StructuredAction> = {}): StructuredAction {
  const rule = getActionDefinition(type);
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

describe("Heavy Air Transport completion mechanics", () => {
  it("uses the exact V5 chassis and shared five-slot conversion table", () => {
    const definition = getTacticalUnitClass("unit-heavy-air-transport");
    const cargo = getTacticalCargoProfile(definition.id)!;

    expect(definition).toMatchObject({
      stats: { healthModel: "HITS", maxHealth: 1, armor: 0, speed: 7 },
      weapons: [],
      requisitionCost: 14,
      tags: expect.arrayContaining(["AEROSPACE", "ATMO_FLIGHT", "AIRDROP", "CANNOT_SPOT_GROUND"]),
      allowedActions: expect.arrayContaining(["LOAD", "AIRDROP", "LAND", "TAKE_OFF"]),
    });
    expect(cargo.capacitySlotsQuarters).toBe(20);
    expect(validateCargoManifest(cargo, [
      { id: "infantry", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"] },
      { id: "vehicle", kind: "VEHICLE", quantity: 1, tags: ["VEHICLE"] },
      { id: "small-supply", kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 10, tags: [] },
    ])).toMatchObject({ legal: true, slotsUsedQuarters: 20 });
    expect(validateCargoManifest(cargo, [
      { id: "infantry", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"] },
      { id: "vehicle-a", kind: "VEHICLE", quantity: 1, tags: ["VEHICLE"] },
      { id: "vehicle-b", kind: "VEHICLE", quantity: 1, tags: ["VEHICLE"] },
      { id: "extra", kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5, tags: [] },
    ])).toMatchObject({ legal: false, slotsUsedQuarters: 24 });
    expect(validateCargoManifest(cargo, [
      { id: "reinforced-infantry", kind: "PERSONNEL", quantity: 7, tags: ["INFANTRY"] },
    ])).toMatchObject({ legal: true, slotsUsedQuarters: 8 });
    expect(validateCargoManifest(cargo, [
      { id: "over-capacity-infantry", kind: "PERSONNEL", quantity: 31, tags: ["INFANTRY"] },
    ])).toMatchObject({ legal: false, slotsUsedQuarters: 24 });
  });

  it("ignores terrain costs and passes through an occupied hostile ground formation", () => {
    const definition = getTacticalUnitClass("unit-heavy-air-transport");
    const transport = makeDeployment("hat", { q: -1, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      weapons: [],
    });
    const hostile = makeDeployment("hostile", { q: 0, r: 0 }, "ENEMY");
    const route = [transport.position, hostile.position, { q: 1, r: 0 }];
    const movementOrder = makeOrder(transport, { route, endHex: route.at(-1)! });
    const map = [
      makeHex(-1, 0),
      makeHex(0, 0, { movementCost: 4, elevation: 3, capacity: 1 }),
      makeHex(1, 0, { movementCost: 3, elevation: 0 }),
    ];

    expect(calculateRouteCost(route, map, { unitTags: definition.tags })).toMatchObject({
      legal: true,
      total: 2,
      steps: [{ total: 1 }, { total: 1 }],
    });
    expect(resolveSimultaneousMovement([movementOrder], [transport, hostile], map)[0]).toMatchObject({
      to: { q: 1, r: 0 },
      traversedRoute: route,
      block: undefined,
    });
  });

  it("permits only clear route-bound Infantry and Light Vehicle drops", () => {
    const flightPath = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const open = makeHex(1, 0, { capacity: 3 });

    expect(validateHatClearAirDrop({
      flightPath,
      destination: open,
      cargo: { id: "infantry", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"] },
      currentOccupancy: 0,
    })).toEqual({ legal: true, reasons: [], hazardous: false });
    expect(validateHatClearAirDrop({
      flightPath,
      destination: open,
      cargo: { id: "scout", kind: "VEHICLE", quantity: 1, tags: ["VEHICLE", "LIGHT_VEHICLE"] },
      currentOccupancy: 0,
    })).toEqual({ legal: true, reasons: [], hazardous: false });
    expect(validateHatClearAirDrop({
      flightPath,
      destination: open,
      cargo: { id: "tank", kind: "VEHICLE", quantity: 1, tags: ["VEHICLE", "ARMOURED"] },
      currentOccupancy: 0,
    })).toMatchObject({ legal: false, hazardous: false, reasons: [expect.stringMatching(/Light Vehicles/)] });
    expect(validateHatClearAirDrop({
      flightPath,
      destination: open,
      cargo: { id: "supply", kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5, tags: [] },
      currentOccupancy: 0,
    })).toMatchObject({ legal: false, hazardous: false, reasons: expect.arrayContaining([expect.stringMatching(/eligible/), expect.stringMatching(/Infantry and Light Vehicles/)]) });
  });

  it("executes an actual manifested Light Vehicle drop and retains Supply when a coordinated drop is attempted", () => {
    const vehicleState = createDemoCampaignState(1_000);
    const transport = vehicleState.deployments.find((deployment) => deployment.id === "dep-atlas-1")!;
    const lightVehicle = vehicleState.deployments.find((deployment) => deployment.id === "dep-lantern")!;
    lightVehicle.position = { ...transport.position };
    lightVehicle.locationState = "EMBARKED";
    transport.cargo = [{
      id: "cargo-light-vehicle",
      kind: "VEHICLE",
      quantity: 1,
      tags: [...(lightVehicle.tags ?? [])],
      transportMode: "EMBARKED",
      unitId: lightVehicle.id,
    }];
    const vehicleDrop = order(vehicleState, transport, [action("drop-light-vehicle", "AIRDROP", {
      targetDeploymentId: lightVehicle.id,
      targetHex: { q: -2, r: -2 },
      payload: { cargoDeploymentId: lightVehicle.id },
    })]);
    vehicleDrop.orderType = "ADVANCE";
    vehicleDrop.route = [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -1, r: -2 }];
    vehicleDrop.endHex = { q: -1, r: -2 };
    vehicleState.orders = [vehicleDrop];
    const dropped = resolveRound({
      previousState: vehicleState,
      rulesetVersion: vehicleState.rulesetVersion,
      playerOrders: [vehicleDrop],
      enemyOrders: [],
      seed: "hat-light-vehicle-drop",
      resolutionTime: 2_000,
    });
    expect(dropped.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_COMPLETED",
      actor: transport.id,
      payload: expect.objectContaining({ cargoDeploymentId: lightVehicle.id, speedCostQuarters: 0 }),
    }));
    expect(dropped.state.deployments.find((deployment) => deployment.id === lightVehicle.id)).toMatchObject({
      locationState: "ON_MAP",
      position: { q: -2, r: -2 },
    });

    const supplyState = createDemoCampaignState(1_000);
    const supplyTransport = supplyState.deployments.find((deployment) => deployment.id === "dep-atlas-1")!;
    supplyTransport.supplies = { SMALL_SUPPLY: 5 };
    supplyTransport.cargo = [];
    const supplyDrop = order(supplyState, supplyTransport, [action("drop-supply", "AIRDROP", {
      targetDeploymentId: `campaign-cargo:${supplyState.campaignId}:${supplyTransport.id}:supply:SMALL_SUPPLY`,
      targetHex: { q: -2, r: -2 },
      payload: {
        cargoManifestItemId: `campaign-cargo:${supplyState.campaignId}:${supplyTransport.id}:supply:SMALL_SUPPLY`,
      },
    })]);
    supplyDrop.orderType = "ADVANCE";
    supplyDrop.route = [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -1, r: -2 }];
    supplyDrop.endHex = { q: -1, r: -2 };
    supplyState.orders = [supplyDrop];
    const rejected = resolveRound({
      previousState: supplyState,
      rulesetVersion: supplyState.rulesetVersion,
      playerOrders: [supplyDrop],
      enemyOrders: [],
      seed: "hat-supply-drop-blocked",
      resolutionTime: 2_000,
    });
    expect(rejected.events).toContainEqual(expect.objectContaining({
      type: "AIR_DROP_FAILED",
      actor: supplyTransport.id,
      payload: expect.objectContaining({
        cargoManifestItemId: `campaign-cargo:${supplyState.campaignId}:${supplyTransport.id}:supply:SMALL_SUPPLY`,
        supplyType: "SMALL_SUPPLY",
        quantity: 5,
        reason: expect.stringMatching(/not yet governed.*remains aboard/i),
      }),
    }));
    expect(rejected.events).not.toContainEqual(expect.objectContaining({ type: "AIR_DROP_COMPLETED", actor: supplyTransport.id }));
    expect(rejected.state.deployments.find((deployment) => deployment.id === supplyTransport.id)).toMatchObject({
      supplies: { SMALL_SUPPLY: 5 },
      cargo: [expect.objectContaining({ kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5 })],
    });
  });

  it("treats any occupied, obstructed, or zero-capacity destination as hazardous and rejects it", () => {
    const flightPath = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const infantry = { id: "infantry", kind: "PERSONNEL" as const, quantity: 6, tags: ["INFANTRY"] };

    for (const [destination, currentOccupancy] of [
      [makeHex(1, 0, { capacity: 3 }), 1],
      [makeHex(1, 0, { capacity: 0 }), 0],
      [makeHex(1, 0, { terrainId: "terrain-forest" }), 0],
      [makeHex(1, 0, { structureIds: ["structure-bunker"] }), 0],
      [makeHex(1, 0, { environment: ["HAZARD"] }), 0],
    ] as const) {
      expect(validateHatClearAirDrop({ flightPath, destination, cargo: infantry, currentOccupancy }))
        .toMatchObject({ legal: false, hazardous: true, reasons: [expect.stringMatching(/not clear and open/)] });
    }
  });

  it("lands only at a friendly airfield and takes off before moving", () => {
    const source = createDemoCampaignState(1_000).deployments.find((deployment) => deployment.id === "dep-atlas-1")!;
    const landingState = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      campaignId: "hat-flight-state",
      campaignName: "HAT Flight State",
      planetName: "Corinth",
      now: 1_000,
      durationMs: 300_000,
      alliedDeployments: [{ ...structuredClone(source), id: "hat-flight", campaignId: "hat-flight-state", position: { q: 0, r: 0 } }],
    });
    const transport = landingState.deployments.find((deployment) => deployment.id === "hat-flight")!;
    const land = order(landingState, transport, [action("hat-land", "LAND")]);
    landingState.orders = [land];
    const landed = resolveRound({
      previousState: landingState,
      rulesetVersion: landingState.rulesetVersion,
      playerOrders: [land],
      enemyOrders: [],
      seed: "hat-land",
      resolutionTime: 2_000,
    });
    expect(landed.state.deployments.find((deployment) => deployment.id === transport.id)?.statuses).toContain("LANDED");
    expect(landed.events).toContainEqual(expect.objectContaining({ type: "AEROSPACE_LANDED", actor: transport.id }));

    const takeOffState = structuredClone(landingState);
    const grounded = takeOffState.deployments.find((deployment) => deployment.id === transport.id)!;
    grounded.statuses = ["LANDED"];
    const takeOff = order(takeOffState, grounded, [action("hat-take-off", "TAKE_OFF")]);
    takeOff.orderType = "ADVANCE";
    takeOff.route = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    takeOff.endHex = { q: 1, r: 0 };
    takeOffState.orders = [takeOff];
    const airborne = resolveRound({
      previousState: takeOffState,
      rulesetVersion: takeOffState.rulesetVersion,
      playerOrders: [takeOff],
      enemyOrders: [],
      seed: "hat-take-off",
      resolutionTime: 3_000,
    });
    expect(airborne.state.deployments.find((deployment) => deployment.id === transport.id)).toMatchObject({
      statuses: [],
      position: { q: 1, r: 0 },
    });
  });

  it("requires fixed-wing aerospace to be landed before an Engineer can repair it", () => {
    const airborneState = createDemoCampaignState(1_000);
    const airborneEngineer = airborneState.deployments.find((deployment) => deployment.id === "dep-keystone")!;
    const airborneFighter = airborneState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    airborneFighter.position = { ...airborneEngineer.position };
    airborneFighter.currentHealth = 1;
    const airborneRepair = order(airborneState, airborneEngineer, [action("repair-airborne", "REPAIR", {
      targetDeploymentId: airborneFighter.id,
      payload: { repairKind: "HIT" },
    })]);
    airborneState.orders = [airborneRepair];
    const rejected = resolveRound({
      previousState: airborneState,
      rulesetVersion: airborneState.rulesetVersion,
      playerOrders: [airborneRepair],
      enemyOrders: [],
      seed: "airborne-repair",
      resolutionTime: 2_000,
    });
    expect(rejected.events).toContainEqual(expect.objectContaining({
      type: "ORDER_REJECTED",
      actor: airborneEngineer.id,
      payload: expect.objectContaining({ reasons: [expect.stringMatching(/must land/i)] }),
    }));
    expect(rejected.state.deployments.find((deployment) => deployment.id === airborneFighter.id)?.currentHealth).toBe(1);

    const landedState = createDemoCampaignState(1_000);
    const landedEngineer = landedState.deployments.find((deployment) => deployment.id === "dep-keystone")!;
    const landedFighter = landedState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!;
    landedFighter.position = { ...landedEngineer.position };
    landedFighter.currentHealth = 1;
    landedFighter.statuses = ["LANDED"];
    const landedRepair = order(landedState, landedEngineer, [action("repair-landed", "REPAIR", {
      targetDeploymentId: landedFighter.id,
      payload: { repairKind: "HIT" },
    })]);
    landedState.orders = [landedRepair];
    const repaired = resolveRound({
      previousState: landedState,
      rulesetVersion: landedState.rulesetVersion,
      playerOrders: [landedRepair],
      enemyOrders: [],
      seed: "landed-repair",
      resolutionTime: 2_000,
    });
    expect(repaired.events).toContainEqual(expect.objectContaining({
      type: "UNIT_REPAIRED",
      actor: landedEngineer.id,
      payload: expect.objectContaining({ targetId: landedFighter.id, repairKind: "HIT" }),
    }));
    expect(repaired.state.deployments.find((deployment) => deployment.id === landedFighter.id)?.currentHealth).toBe(2);
  });

  it("cannot reveal ground units but can observe aerospace contacts", () => {
    const definition = getTacticalUnitClass("unit-heavy-air-transport");
    const transport = makeDeployment("hat-observer", { q: 0, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: { ...definition.stats, sensors: 1 },
      weapons: [],
    });
    const ground = makeDeployment("ground-contact", { q: 1, r: 0 }, "ENEMY", { tags: ["GROUND", "PERSONNEL"] });
    const aerospace = makeDeployment("air-contact", { q: 1, r: 0 }, "ENEMY", { tags: ["AEROSPACE", "ATMO_FLIGHT"] });
    const state = makeState([transport, ground, aerospace], [makeHex(0, 0), makeHex(1, 0)]);

    const view = projectCampaignState(state, { userId: transport.ownerId, side: "ALLIED", role: "PLAYER" }, 1_000);

    expect(view.deployments.map((deployment) => deployment.id)).toContain(aerospace.id);
    expect(view.deployments.map((deployment) => deployment.id)).not.toContain(ground.id);
  });

  it("freezes unit and Supply cargo under RC-V5-030 when the transport is destroyed", () => {
    const definition = getTacticalUnitClass("unit-heavy-air-transport");
    const attacker = makeDeployment("attacker", { q: 0, r: 0 }, "ALLIED", {
      weapons: [{ ...baseWeapon, damage: { count: 1, sides: 2, modifier: 2 } }],
    });
    const transport = makeDeployment("hat-carrier", { q: 1, r: 0 }, "ENEMY", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      currentHealth: 1,
      weapons: [],
      cargo: [
        { id: "cargo-passenger", kind: "PERSONNEL", quantity: 6, tags: ["INFANTRY"], transportMode: "EMBARKED", unitId: "passenger" },
        { id: "cargo-supply", kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5, tags: [] },
      ],
    });
    const passenger = makeDeployment("passenger", transport.position, "ENEMY", { locationState: "EMBARKED" });
    const attack = makeOrder(attacker, {
      actions: [{ ...action("destroy-hat", "ATTACK"), targetDeploymentId: transport.id }],
      targets: [transport.id],
    });
    const state = makeState([attacker, transport, passenger], [makeHex(0, 0), makeHex(1, 0)], [attack]);
    const output = resolveRound(makeRoundInput(state, [attack], [], { seed: "hat-carrier-loss" }));

    expect(output.state.deployments.find((deployment) => deployment.id === passenger.id)).toMatchObject({
      status: "ACTIVE",
      locationState: "EMBARKED",
      position: transport.position,
    });
    expect(output.events).toContainEqual(expect.objectContaining({
      type: "CARGO_DESTRUCTION_REQUIRES_ADJUDICATION",
      actor: transport.id,
      payload: expect.objectContaining({
        conflictId: "RC-V5-030",
        resolution: "FROZEN_WITH_DESTROYED_CARRIER",
        cargo: expect.arrayContaining([
          expect.objectContaining({ kind: "PERSONNEL", cargoDeploymentId: passenger.id }),
          expect.objectContaining({ kind: "SUPPLY", supplyType: "SMALL_SUPPLY", quantity: 5 }),
        ]),
      }),
    }));
  });
});

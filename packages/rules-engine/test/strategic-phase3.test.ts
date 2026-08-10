import type {
  StrategicBattlegroupState,
  StrategicCapabilitySource,
  StrategicNodeDto,
  StrategicOperationState,
  StrategicOrderRecord,
  StrategicRouteDto,
  StrategicRuntimeState,
  StrategicSupplyState,
  StrategicTaskForceState,
  StrategicUnitComposition,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  aggregateStrategicCapabilities,
  applyLargeSupply,
  applyMediumSupply,
  calculateStrategicTravelTiming,
  canonicalStrategicJson,
  compareStrategicCodePoints,
  findStrategicRoute,
  resolveStrategicRound,
  strategicStableHash,
  validateBattlegroupComposition,
  validateBattlegroupMovementProfile,
  validateStrategicRoute,
  validateSuppliedFacilityUse,
  validateSupplyDraw,
} from "../src";

const mapId = "map-corinth";

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [item, ...tail]),
  );
}

function node(id: string, status: StrategicNodeDto["status"] = "OPEN"): StrategicNodeDto {
  return {
    id,
    mapId,
    locationId: `location-${id}`,
    type: id === "orbit" ? "ORBIT" : "BASE",
    name: id,
    control: "FRIENDLY",
    status,
  };
}

function route(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  overrides: Partial<StrategicRouteDto> = {},
): StrategicRouteDto {
  return {
    id,
    mapId,
    fromNodeId,
    toNodeId,
    direction: "BIDIRECTIONAL",
    baseTravelRounds: 1,
    travelCostStatus: "PUBLISHED",
    allowedMovementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP", "TASK_FORCE"],
    status: "OPEN",
    ...overrides,
  };
}

function capabilitySource(
  sourceId: string,
  capability: StrategicCapabilitySource["grants"][number]["capability"],
  value = 1,
  sourceKind: StrategicCapabilitySource["sourceKind"] = "UNIT",
): StrategicCapabilitySource {
  return { sourceId, sourceKind, grants: [{ capability, value }] };
}

function groundUnit(
  unitId: string,
  speed: number | null = 1,
  capabilities: StrategicCapabilitySource[] = [capabilitySource(`${unitId}:ground`, "GROUND_COMBAT")],
): StrategicUnitComposition {
  return {
    unitId,
    ownerId: `owner-${unitId}`,
    definitionId: `definition-${unitId}`,
    domain: "GROUND",
    movementPointsPerRound: speed,
    capabilitySources: capabilities,
    transportRequirements: [{ capability: "CARRY_INFANTRY", value: 1 }],
  };
}

function aerospaceUnit(unitId: string): StrategicUnitComposition {
  return {
    unitId,
    ownerId: `owner-${unitId}`,
    definitionId: `definition-${unitId}`,
    domain: "AEROSPACE",
    movementPointsPerRound: 4,
    capabilitySources: [capabilitySource(`${unitId}:air`, "AIR_MOBILE")],
    transportRequirements: [{ capability: "CARRY_AEROSPACE", value: 1 }],
  };
}

function supply(
  kind: StrategicSupplyState["location"]["kind"],
  id: string,
  large = 2,
  suppliedThroughRound: number | null = null,
): StrategicSupplyState {
  return {
    location: { kind, id },
    balances: [
      { size: "LARGE", quantity: large, capacity: 4 },
      { size: "MEDIUM", quantity: 2, capacity: 4 },
      { size: "SMALL", quantity: 5, capacity: 10 },
    ],
    suppliedThroughRound,
    facilities: ["REPAIR_VEHICLE", "REARM_AEROSPACE"],
  };
}

function battlegroup(overrides: Partial<StrategicBattlegroupState> = {}): StrategicBattlegroupState {
  return {
    kind: "BATTLEGROUP",
    id: "bg-hammer",
    battalionId: "battalion-33",
    name: "Hammer",
    currentNodeId: "base-a",
    movementProfile: "GROUND_BATTLEGROUP",
    movementPointsPerRound: 1,
    transit: null,
    version: 3,
    status: "READY",
    currentOperationId: null,
    currentCarrierTaskForceId: null,
    units: [groundUnit("unit-1")],
    ...overrides,
  };
}

function taskForce(overrides: Partial<StrategicTaskForceState> = {}): StrategicTaskForceState {
  return {
    kind: "TASK_FORCE",
    id: "tf-resolute",
    battalionId: "battalion-33",
    name: "Resolute Task Force",
    currentNodeId: "orbit",
    movementProfile: "TASK_FORCE",
    movementPointsPerRound: 1,
    transit: null,
    version: 7,
    status: "READY",
    shipIds: ["ship-resolute"],
    embarkedBattlegroupIds: [],
    capabilitySources: [capabilitySource("cargo-bay", "CARRY_INFANTRY", 8, "SHIP_MODULE")],
    supply: supply("TASK_FORCE", "tf-resolute"),
    ...overrides,
  };
}

function operation(overrides: Partial<StrategicOperationState> = {}): StrategicOperationState {
  return {
    id: "operation-iron-rain",
    mapId,
    campaignId: "campaign-iron-rain",
    strategicNodeId: "base-b",
    name: "Operation Iron Rain",
    role: "front-line assault",
    status: "MUSTERING",
    threat: "HIGH",
    objectiveSummaries: ["Hold Airfield"],
    recommendedCapabilities: ["ARMOURED", "ENGINEERING"],
    deployedBattlegroupIds: [],
    reinforcementStatus: "OPEN",
    version: 2,
    controlEffectsApplied: false,
    ...overrides,
  };
}

function runtimeState(overrides: Partial<StrategicRuntimeState> = {}): StrategicRuntimeState {
  return {
    mapId,
    rulesetVersion: "v5-core-curated@1",
    engineVersion: "pre-strategic",
    round: 10,
    phase: "LOCKED",
    version: 12,
    nodes: [node("orbit"), node("base-a"), node("junction"), node("base-b")],
    routes: [
      route("road-a", "base-a", "junction"),
      route("road-b", "junction", "base-b"),
      route("drop-route", "orbit", "base-b", {
        allowedMovementProfiles: ["AIR_MOBILE_BATTLEGROUP"],
      }),
    ],
    ships: [
      {
        id: "ship-resolute",
        battalionId: "battalion-33",
        currentNodeId: "orbit",
        moduleCapabilitySources: [capabilitySource("resolute-cargo", "CARRY_INFANTRY", 8, "SHIP_MODULE")],
        version: 4,
      },
    ],
    taskForces: [taskForce()],
    battlegroups: [battlegroup()],
    operations: [operation()],
    orders: [],
    events: [],
    resolutions: {},
    appliedCampaignResultIds: [],
    ...overrides,
  };
}

function lockedOrder(
  overrides: Partial<StrategicOrderRecord> & Pick<StrategicOrderRecord, "formation" | "intent">,
): StrategicOrderRecord {
  return {
    id: `order-${overrides.intent.type.toLowerCase()}`,
    commandId: `command-${overrides.intent.type.toLowerCase()}`,
    expectedMapVersion: 12,
    expectedFormationVersion: overrides.formation.kind === "TASK_FORCE" ? 7 : 3,
    mapId,
    destinationNodeId: undefined,
    lifecycle: "LOCKED",
    revision: 1,
    strategicRound: 10,
    submittedBy: "user-command",
    submittedAt: 1_000,
    ...overrides,
  };
}

describe("strategic canonical data and capability aggregation", () => {
  it("canonicalizes object keys and hashes equal values identically", () => {
    expect(canonicalStrategicJson({ z: 1, nested: { b: 2, a: 1 } })).toBe(
      canonicalStrategicJson({ nested: { a: 1, b: 2 }, z: 1 }),
    );
    expect(strategicStableHash({ b: 2, a: 1 })).toBe(strategicStableHash({ a: 1, b: 2 }));
    expect(() => canonicalStrategicJson({ invalid: Number.NaN })).toThrow(/finite numbers/);
  });

  it("uses explicit Unicode code-point order for cross-runtime canonicalization", () => {
    expect(["a", "A", "_", "-", "é", "😀"].sort(compareStrategicCodePoints)).toEqual([
      "-",
      "A",
      "_",
      "a",
      "é",
      "😀",
    ]);
    expect(canonicalStrategicJson({ a: 1, _: 2, "-": 3, A: 4 })).toBe('{"-":3,"A":4,"_":2,"a":1}');
  });

  it("aggregates units, equipment, and ship modules in stable source order", () => {
    const sources = [
      capabilitySource("module-b", "LOGISTICS", 2, "SHIP_MODULE"),
      capabilitySource("unit-a", "GROUND_COMBAT", 1),
      capabilitySource("equipment-c", "LOGISTICS", 1, "EQUIPMENT"),
    ];
    const expected = aggregateStrategicCapabilities(sources);
    expect(expected).toEqual(aggregateStrategicCapabilities([...sources].reverse()));
    expect(expected).toMatchObject({
      valid: true,
      capabilities: [
        { capability: "GROUND_COMBAT", value: 1, sourceIds: ["unit-a"] },
        { capability: "LOGISTICS", value: 3, sourceIds: ["equipment-c", "module-b"] },
      ],
    });
  });

  it("does not double-count duplicated or invalid capability sources", () => {
    const duplicate = capabilitySource("same-unit", "LOGISTICS", 2);
    expect(
      aggregateStrategicCapabilities([
        duplicate,
        structuredClone(duplicate),
        capabilitySource("broken-module", "CARRY_INFANTRY", -1, "SHIP_MODULE"),
      ]),
    ).toMatchObject({
      valid: false,
      capabilities: [{ capability: "LOGISTICS", value: 2, sourceIds: ["same-unit"] }],
    });
  });

  it("rejects aerospace-only and orbital Battlegroups while using the slowest configured ground speed", () => {
    expect(validateBattlegroupComposition([aerospaceUnit("fighter")])).toMatchObject({
      valid: false,
      reasons: ["AEROSPACE_ONLY_BATTLEGROUP"],
    });
    expect(
      validateBattlegroupComposition([
        groundUnit("scout", 3),
        groundUnit("tank", 1),
        aerospaceUnit("vtol"),
      ]),
    ).toMatchObject({ valid: true, movementPointsPerRound: 1 });
    expect(
      validateBattlegroupComposition([
        groundUnit("infantry"),
        { ...aerospaceUnit("orbital"), domain: "ORBITAL" },
      ]),
    ).toMatchObject({ valid: false, reasons: ["ORBITAL_UNIT_IN_BATTLEGROUP"] });
    const repeated = groundUnit("repeated");
    expect(validateBattlegroupComposition([repeated, structuredClone(repeated)])).toMatchObject({
      valid: false,
      reasons: expect.arrayContaining(["DUPLICATE_UNIT"]),
    });
  });

  it("does not infer whole-group air mobility from the presence of one aircraft", () => {
    const infantry = groundUnit("infantry");
    const vtolWithoutLift = aerospaceUnit("vtol");
    expect(
      validateBattlegroupMovementProfile([infantry, vtolWithoutLift], "AIR_MOBILE_BATTLEGROUP"),
    ).toMatchObject({
      valid: false,
      compositionValid: true,
      profileSupported: false,
      reasons: expect.arrayContaining([expect.stringContaining("CARRY_INFANTRY lift capacity is insufficient")]),
    });
    const vtolWithLift = {
      ...vtolWithoutLift,
      capabilitySources: [
        ...vtolWithoutLift.capabilitySources,
        capabilitySource("vtol:infantry-lift", "CARRY_INFANTRY", 1, "EQUIPMENT"),
      ],
    };
    expect(
      validateBattlegroupMovementProfile([infantry, vtolWithLift], "AIR_MOBILE_BATTLEGROUP"),
    ).toMatchObject({ valid: true, profileSupported: true });
  });
});

describe("strategic graph and travel timing", () => {
  const nodes = [node("a"), node("b"), node("c"), node("d")];

  it("validates every directed edge and calculates explicit travel timing", () => {
    const routes = [route("ab", "a", "b"), route("bc", "b", "c", { direction: "ONE_WAY" })];
    expect(
      validateStrategicRoute({
        nodes,
        routes,
        routeNodeIds: ["a", "b", "c"],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "c",
      }),
    ).toEqual({ valid: true, routeNodeIds: ["a", "b", "c"], routeIds: ["ab", "bc"], totalTravelCost: 2 });
    expect(
      validateStrategicRoute({
        nodes,
        routes,
        routeNodeIds: ["c", "b"],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "c",
        destinationNodeId: "b",
      }),
    ).toMatchObject({ valid: false, code: "ROUTE_NOT_FOUND" });
    expect(calculateStrategicTravelTiming({ totalTravelCost: 5, movementPointsPerRound: 2, startingRound: 10 })).toEqual({
      valid: true,
      roundsRequired: 3,
      etaRound: 13,
    });
  });

  it("hard-rejects null and balance-required route costs instead of treating them as zero", () => {
    for (const unresolved of [
      route("unresolved-null", "a", "b", { baseTravelRounds: null, travelCostStatus: "BALANCE_REQUIRED" }),
      route("unresolved-labelled", "a", "b", { baseTravelRounds: 1, travelCostStatus: "BALANCE_REQUIRED" }),
    ]) {
      expect(
        findStrategicRoute({
          nodes,
          routes: [unresolved],
          movementProfile: "GROUND_BATTLEGROUP",
          startNodeId: "a",
          destinationNodeId: "b",
        }),
      ).toMatchObject({ valid: false, code: "ROUTE_TIMING_UNRESOLVED" });
    }
    expect(
      findStrategicRoute({
        nodes,
        routes: [route("scenario-cost", "a", "b", { baseTravelRounds: 2, travelCostStatus: "SCENARIO_CONFIG" })],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "b",
      }),
    ).toMatchObject({ valid: true, totalTravelCost: 2 });
    expect(calculateStrategicTravelTiming({ totalTravelCost: 1, movementPointsPerRound: null, startingRound: 1 })).toMatchObject({
      valid: false,
      code: "UNRESOLVED_MOVEMENT_RATE",
    });
  });

  it("distinguishes blocked topology, forbidden movement profiles, and unavailable nodes", () => {
    expect(
      findStrategicRoute({
        nodes,
        routes: [route("blocked", "a", "b", { status: "BLOCKED" })],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "b",
      }),
    ).toMatchObject({ valid: false, code: "ROUTE_BLOCKED" });
    expect(
      findStrategicRoute({
        nodes,
        routes: [route("orbital", "a", "b", { allowedMovementProfiles: ["TASK_FORCE"] })],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "b",
      }),
    ).toMatchObject({ valid: false, code: "MOVEMENT_PROFILE_FORBIDDEN" });
    expect(
      findStrategicRoute({
        nodes: [node("a"), node("b", "LOCKED")],
        routes: [route("locked-destination", "a", "b")],
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "b",
      }),
    ).toMatchObject({ valid: false, code: "INVALID_DESTINATION" });
  });

  it("selects a replay-stable shortest path under route input permutations", () => {
    const routes = [
      route("a-route", "a", "b"),
      route("b-route", "b", "d"),
      route("c-route", "a", "c"),
      route("d-route", "c", "d"),
    ];
    const routePermutations = permutations(routes);
    const plans = routePermutations.map((candidateRoutes) =>
      findStrategicRoute({
        nodes,
        routes: candidateRoutes,
        movementProfile: "GROUND_BATTLEGROUP",
        startNodeId: "a",
        destinationNodeId: "d",
      }),
    );
    expect(routePermutations).toHaveLength(24);
    expect(plans.every((plan) => strategicStableHash(plan) === strategicStableHash(plans[0]))).toBe(true);
    expect(plans[0]).toEqual({
      valid: true,
      routeNodeIds: ["a", "b", "d"],
      routeIds: ["a-route", "b-route"],
      totalTravelCost: 2,
    });
  });
});

describe("Large, Medium, and Small Supply remain distinct", () => {
  it("spends one finite Large Supply for exactly two inclusive rounds", () => {
    const original = supply("TASK_FORCE", "tf", 2);
    const result = applyLargeSupply({ currentRound: 8, supply: original });
    expect(result).toMatchObject({ applied: true, consumed: 1, suppliedThroughRound: 9 });
    expect(result.supply.balances.find((balance) => balance.size === "LARGE")?.quantity).toBe(1);
    expect(original.balances.find((balance) => balance.size === "LARGE")?.quantity).toBe(2);
    expect(applyLargeSupply({ currentRound: 8, supply: result.supply })).toMatchObject({
      applied: false,
      code: "ALREADY_SUPPLIED",
    });
    expect(applyLargeSupply({ currentRound: 8, supply: supply("TASK_FORCE", "empty", 0) })).toMatchObject({
      applied: false,
      code: "INSUFFICIENT_SUPPLY",
    });
  });

  it("spends Medium Supply only to keep a FOB online for one round", () => {
    const result = applyMediumSupply({ currentRound: 4, supply: supply("FOB", "fob-1") });
    expect(result).toMatchObject({ applied: true, consumed: 1, suppliedThroughRound: 4 });
    expect(applyMediumSupply({ currentRound: 4, supply: supply("TASK_FORCE", "tf") })).toMatchObject({
      applied: false,
      code: "INVALID_LOCATION",
    });
  });

  it("requires an online source and logistics capability, and a FOB never supplies Medium", () => {
    const logistics = [{ capability: "LOGISTICS" as const, value: 1, sourceIds: ["logi"] }];
    expect(
      validateSupplyDraw({
        currentRound: 3,
        size: "SMALL",
        amount: 1,
        source: supply("TASK_FORCE", "tf", 2, null),
        requesterCapabilities: logistics,
      }),
    ).toMatchObject({ allowed: false, code: "SOURCE_OFFLINE" });
    expect(
      validateSupplyDraw({
        currentRound: 3,
        size: "MEDIUM",
        amount: 1,
        source: supply("FOB", "fob", 0, 3),
        requesterCapabilities: logistics,
      }),
    ).toMatchObject({ allowed: false, code: "FOB_SMALL_ONLY" });
    expect(
      validateSupplyDraw({
        currentRound: 3,
        size: "SMALL",
        amount: 1,
        source: supply("FOB", "fob", 0, 3),
        requesterCapabilities: [],
      }),
    ).toMatchObject({ allowed: false, code: "LOGISTICS_REQUIRED" });
  });

  it("enables repair and rearm only while supplied and through an appropriate bay", () => {
    const online = supply("TASK_FORCE", "tf", 1, 5);
    expect(
      validateSuppliedFacilityUse({ currentRound: 5, source: online, requiredCapability: "REPAIR_VEHICLE" }),
    ).toEqual({ allowed: true });
    expect(
      validateSuppliedFacilityUse({ currentRound: 5, source: online, requiredCapability: "REPAIR_MECH" }),
    ).toMatchObject({ allowed: false, code: "FACILITY_MISSING" });
    expect(
      validateSuppliedFacilityUse({ currentRound: 6, source: online, requiredCapability: "REPAIR_VEHICLE" }),
    ).toMatchObject({ allowed: false, code: "SOURCE_OFFLINE" });
  });
});

describe("deterministic strategic resolver", () => {
  it("embarks only co-located valid ground formations within real module capacity", () => {
    const carrier = taskForce({ currentNodeId: "base-a" });
    const state = runtimeState({ taskForces: [carrier] });
    const embark = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      intent: {
        type: "EMBARK_BATTLEGROUP",
        battlegroupId: "bg-hammer",
        carrierTaskForceId: "tf-resolute",
      },
    });
    const embarked = resolveStrategicRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [embark],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(embarked.state.battlegroups[0]).toMatchObject({
      currentNodeId: null,
      currentCarrierTaskForceId: "tf-resolute",
      status: "EMBARKED",
    });
    expect(embarked.state.taskForces[0].embarkedBattlegroupIds).toEqual(["bg-hammer"]);

    const noCapacityState = runtimeState({
      taskForces: [taskForce({ currentNodeId: "base-a", capabilitySources: [] })],
      ships: [
        {
          id: "ship-resolute",
          battalionId: "battalion-33",
          currentNodeId: "base-a",
          moduleCapabilitySources: [],
          version: 4,
        },
      ],
    });
    const rejected = resolveStrategicRound({
      previousState: noCapacityState,
      rulesetVersion: noCapacityState.rulesetVersion,
      lockedOrders: [embark],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(
      rejected.events.find((event) => event.type === "STRATEGIC_ORDER_REJECTED"),
    ).toMatchObject({ payload: { code: "INSUFFICIENT_CAPACITY" } });
    expect(rejected.state.battlegroups[0].currentCarrierTaskForceId).toBeNull();
  });

  it("rejects cross-Battalion carrier and supply references", () => {
    const foreign = taskForce({
      id: "tf-foreign",
      battalionId: "battalion-foreign",
      currentNodeId: "base-a",
    });
    const carrierState = runtimeState({ taskForces: [foreign] });
    const embark = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      intent: {
        type: "EMBARK_BATTLEGROUP",
        battlegroupId: "bg-hammer",
        carrierTaskForceId: foreign.id,
      },
    });
    const rejectedEmbark = resolveStrategicRound({
      previousState: carrierState,
      rulesetVersion: carrierState.rulesetVersion,
      lockedOrders: [embark],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(rejectedEmbark.events.find((event) => event.type === "STRATEGIC_ORDER_REJECTED")).toMatchObject({
      payload: { code: "FORMATION_NOT_FOUND" },
    });
    expect(rejectedEmbark.state.battlegroups[0].currentCarrierTaskForceId).toBeNull();

    const source = taskForce({ currentNodeId: "base-a" });
    const transferState = runtimeState({ taskForces: [source, foreign] });
    const transfer = lockedOrder({
      formation: { kind: "TASK_FORCE", id: source.id },
      intent: {
        type: "TRANSFER_SUPPLY",
        supplySize: "LARGE",
        amount: 1,
        source: { kind: "TASK_FORCE", id: source.id },
        destination: { kind: "TASK_FORCE", id: foreign.id },
      },
    });
    const rejectedTransfer = resolveStrategicRound({
      previousState: transferState,
      rulesetVersion: transferState.rulesetVersion,
      lockedOrders: [transfer],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(rejectedTransfer.events.find((event) => event.type === "STRATEGIC_ORDER_REJECTED")).toMatchObject({
      payload: { code: "FORMATION_NOT_FOUND" },
    });
    expect(rejectedTransfer.state.taskForces.map((force) => force.supply.balances)).toEqual(
      transferState.taskForces.map((force) => force.supply.balances),
    );
  });

  it("resolves supply before movement and produces a replay-stable golden journal", () => {
    const state = runtimeState();
    const movement = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      destinationNodeId: "base-b",
      intent: { type: "MOVE_BATTLEGROUP" },
    });
    const resupply = lockedOrder({
      formation: { kind: "TASK_FORCE", id: "tf-resolute" },
      intent: { type: "RESUPPLY_TASK_FORCE", taskForceId: "tf-resolute" },
    });
    const input = {
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [movement, resupply],
      campaignResults: [],
      resolutionTime: 9_000,
    };
    const first = resolveStrategicRound(input);
    const replay = resolveStrategicRound({ ...input, lockedOrders: [...input.lockedOrders].reverse() });
    expect(first).toEqual(replay);
    expect(first.events.map((event) => event.type)).toEqual([
      "STRATEGIC_ORDER_ACCEPTED",
      "LARGE_SUPPLY_CONSUMED",
      "TASK_FORCE_SUPPLIED",
      "STRATEGIC_ORDER_ACCEPTED",
      "FORMATION_MOVEMENT_STARTED",
      "FORMATION_TRAVEL_PROGRESS",
      "STRATEGIC_ROUND_RESOLVED",
    ]);
    expect(first.state.round).toBe(11);
    expect(first.state.battlegroups[0]).toMatchObject({
      currentNodeId: "base-a",
      status: "IN_TRANSIT",
      transit: { progress: 1, totalTravelCost: 2, etaRound: 12 },
    });
    expect(first.state.taskForces[0].supply).toMatchObject({ suppliedThroughRound: 11 });
    expect(first.inputHash).toMatch(/^[0-9a-f]{8}$/);
    expect(first.resultHash).toMatch(/^[0-9a-f]{8}$/);
    expect({
      inputHash: first.inputHash,
      resultHash: first.resultHash,
      eventIds: first.events.map((event) => event.eventId),
    }).toEqual({
      inputHash: "a7580ec8",
      resultHash: "ca3ce389",
      eventIds: [
        "map-corinth:10:0001:STRATEGIC_ORDER_ACCEPTED",
        "map-corinth:10:0002:LARGE_SUPPLY_CONSUMED",
        "map-corinth:10:0003:TASK_FORCE_SUPPLIED",
        "map-corinth:10:0004:STRATEGIC_ORDER_ACCEPTED",
        "map-corinth:10:0005:FORMATION_MOVEMENT_STARTED",
        "map-corinth:10:0006:FORMATION_TRAVEL_PROGRESS",
        "map-corinth:10:0007:STRATEGIC_ROUND_RESOLVED",
      ],
    });

    const retriedAfterCommit = resolveStrategicRound({
      previousState: first.state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [movement, resupply],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(retriedAfterCommit.events).toEqual([]);
    expect(retriedAfterCommit.effects).toEqual([]);
    expect(retriedAfterCommit.resultHash).toBe(first.resultHash);
    expect(() =>
      resolveStrategicRound({
        previousState: first.state,
        rulesetVersion: state.rulesetVersion,
        lockedOrders: [movement, resupply],
        campaignResults: [],
        resolutionTime: 9_001,
      }),
    ).toThrow(/retry input does not match/);

    const arrival = resolveStrategicRound({
      previousState: { ...first.state, phase: "LOCKED" },
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [],
      campaignResults: [],
      resolutionTime: 10_000,
    });
    expect(arrival.events.map((event) => event.type)).toEqual([
      "FORMATION_TRAVEL_PROGRESS",
      "FORMATION_ARRIVED",
      "STRATEGIC_ROUND_RESOLVED",
    ]);
    expect(arrival.state.battlegroups[0]).toMatchObject({
      currentNodeId: "base-b",
      status: "READY",
      transit: null,
    });
    expect(arrival.state.round).toBe(12);
  });

  it("cannot resolve an unlocked strategic round", () => {
    const state = runtimeState({ phase: "PLANNING" });
    expect(() =>
      resolveStrategicRound({
        previousState: state,
        rulesetVersion: state.rulesetVersion,
        lockedOrders: [],
        campaignResults: [],
        resolutionTime: 9_000,
      }),
    ).toThrow(/requires a locked strategic round/);
  });

  it("transitions a co-located operation without teleporting the Battlegroup", () => {
    const deploy = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      intent: {
        type: "DEPLOY_TO_CAMPAIGN",
        battlegroupId: "bg-hammer",
        operationId: "operation-iron-rain",
        deploymentMethod: "STANDARD_LANDING",
      },
    });
    const remote = runtimeState();
    const rejected = resolveStrategicRound({
      previousState: remote,
      rulesetVersion: remote.rulesetVersion,
      lockedOrders: [deploy],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(rejected.events.find((event) => event.type === "STRATEGIC_ORDER_REJECTED")).toMatchObject({
      payload: { code: "NOT_COLOCATED" },
    });

    const colocated = runtimeState({ battlegroups: [battlegroup({ currentNodeId: "base-b" })] });
    const deployed = resolveStrategicRound({
      previousState: colocated,
      rulesetVersion: colocated.rulesetVersion,
      lockedOrders: [deploy],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(deployed.state.battlegroups[0]).toMatchObject({
      currentNodeId: "base-b",
      currentOperationId: "operation-iron-rain",
      status: "DEPLOYING",
    });
    expect(deployed.state.operations[0]).toMatchObject({
      status: "ACTIVE",
      deployedBattlegroupIds: ["bg-hammer"],
    });
  });

  it("rejects stale commands and balance-required routes without mutating formation location", () => {
    const state = runtimeState({
      routes: [route("unresolved", "base-a", "base-b", { baseTravelRounds: null, travelCostStatus: "BALANCE_REQUIRED" })],
    });
    const unresolved = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      destinationNodeId: "base-b",
      intent: { type: "MOVE_BATTLEGROUP" },
    });
    const stale = lockedOrder({
      id: "order-stale",
      commandId: "command-stale",
      expectedFormationVersion: 2,
      formation: { kind: "TASK_FORCE", id: "tf-resolute" },
      destinationNodeId: "base-b",
      intent: { type: "MOVE_TASK_FORCE" },
    });
    const output = resolveStrategicRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [unresolved, stale],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(
      output.events.filter((event) => event.type === "STRATEGIC_ORDER_REJECTED").map((event) => event.payload),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ROUTE_TIMING_UNRESOLVED" }),
        expect.objectContaining({ code: "STALE_FORMATION_VERSION" }),
      ]),
    );
    expect(output.state.battlegroups[0]).toMatchObject({ currentNodeId: "base-a", transit: null });
  });

  it("represents orbital combat and tactical withdrawal as explicit rejected/deferred paths", () => {
    const state = runtimeState();
    const orbital = lockedOrder({
      formation: { kind: "TASK_FORCE", id: "tf-resolute" },
      intent: { type: "ORBITAL_COMBAT", opposingFormationId: "enemy-task-force" },
    });
    const withdrawal = lockedOrder({
      formation: { kind: "BATTLEGROUP", id: "bg-hammer" },
      intent: {
        type: "WITHDRAW_FROM_CAMPAIGN",
        battlegroupId: "bg-hammer",
        operationId: "operation-iron-rain",
      },
    });
    const output = resolveStrategicRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [withdrawal, orbital],
      campaignResults: [],
      resolutionTime: 9_000,
    });
    expect(output.events.map((event) => event.type)).toEqual([
      "STRATEGIC_ORDER_REJECTED",
      "ORBITAL_COMBAT_DEFERRED",
      "STRATEGIC_ORDER_REJECTED",
      "STRATEGIC_ROUND_RESOLVED",
    ]);
    expect(
      output.events
        .filter((event) => event.type === "STRATEGIC_ORDER_REJECTED")
        .map((event) => "code" in event.payload && event.payload.code),
    ).toEqual(["TACTICAL_WITHDRAWAL_REQUIRED", "ORBITAL_COMBAT_DEFERRED"]);
  });

  it("applies each tactical result effect exactly once in stable route/variable order", () => {
    const state = runtimeState({
      nodes: [node("base-b", "BLOCKED")],
      routes: [route("road-b", "base-b", "junction", { status: "LOCKED" })],
    });
    const result = {
      effectId: "campaign-iron-rain:result:1",
      campaignId: "campaign-iron-rain",
      resultVersion: 1,
      operationId: "operation-iron-rain",
      outcome: "VICTORY" as const,
      nodeControl: { nodeId: "base-b", control: "FRIENDLY" as const },
      routeChanges: [{ routeId: "road-b", status: "OPEN" as const }],
      warVariableDeltas: [
        { variableId: "bug-pressure", delta: -10 },
        { variableId: "corinth-control", delta: 5 },
      ],
    };
    const output = resolveStrategicRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      lockedOrders: [],
      campaignResults: [result, structuredClone(result)],
      resolutionTime: 9_000,
    });
    expect(output.events.map((event) => event.type)).toEqual([
      "CAMPAIGN_OUTCOME_APPLIED",
      "STRATEGIC_NODE_CONTROL_CHANGED",
      "STRATEGIC_ROUTE_STATUS_CHANGED",
      "STRATEGIC_ROUND_RESOLVED",
    ]);
    expect(output.state.appliedCampaignResultIds).toEqual([result.effectId]);
    expect(output.effects.filter((effect) => effect.type === "WAR_VARIABLE_DELTA")).toHaveLength(2);
    expect(new Set(output.effects.map((effect) => effect.idempotencyKey)).size).toBe(output.effects.length);
    expect(() =>
      resolveStrategicRound({
        previousState: state,
        rulesetVersion: state.rulesetVersion,
        lockedOrders: [],
        campaignResults: [result, { ...result, outcome: "DEFEAT" }],
        resolutionTime: 9_000,
      }),
    ).toThrow(/Conflicting strategic campaign effect/);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeStrategicPayloads, type StrategicApiPayloads } from "./api";

function payloads(): StrategicApiPayloads {
  return {
    command: {
      profile: { userId: "user-1", callsign: "ROOK", displayName: "Rook", timezone: "Australia/Sydney", email: "private@example.invalid" },
      battalion: { id: "battalion-1", name: "Test Battalion", shortName: "TEST" },
      primaryShip: { id: "ship-1", name: "CSV Test" },
      strategic: { mapId: "map-1", round: 4 },
      forces: { active: 2, deployed: 1, aboard: 1, available: 0, lost: 0 },
    },
    battalion: {
      battalion: { id: "battalion-1", name: "Test Battalion", shortName: "TEST", status: "ACTIVE" },
      permissions: [{ permissionKey: "SHIP_VIEW" }],
      ranks: [{ id: "rank-1", name: "Operator", sortOrder: 10, permissions: ["SHIP_VIEW"] }],
      battlegroups: [{ id: "bg-1", name: "Battlegroup Test", status: "EMBARKED", currentNodeId: null, currentCarrierTaskForceId: "tf-1", currentOperationId: "op-1", commanderMembershipId: "membership-1", capabilities: [{ capability: "GROUND_COMBAT", value: 1 }] }],
    },
    members: { members: [{ membershipId: "membership-1", userId: "user-1", callsign: "ROOK", displayName: "Rook", rankId: "rank-1", status: "ACTIVE" }] },
    activity: { events: [{ eventId: "event-1", type: "TASK_FORCE_MOVED", summary: "Task Force moved.", timestamp: 1000 }] },
    ship: {
      ship: { id: "ship-1", name: "CSV Test", classDefinitionId: "ship-destroyer", className: "Destroyer", registry: "CSV-T", locationName: "Test Orbit", status: "ORBIT", version: 3, internalSlots: 4, externalSlots: 3 },
      modules: [{ id: "module-1", name: "Mobile Infantry Upgrade", slotType: "EXTERNAL_INTERNAL", slotIndex: 0, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_INFANTRY"] }],
      capabilities: [{ capability: "CARRY_INFANTRY", value: 2 }],
      cargo: [{ id: "cargo-1", kind: "SUPPLY", quantity: 2, supplySize: "LARGE" }],
      supply: { balances: [{ size: "LARGE", quantity: 2, capacity: 4 }], suppliedThroughRound: 6, facilities: [] },
      taskForce: { id: "tf-1", name: "Test Task Force", status: "READY", currentNodeId: "node-1", shipIds: ["ship-1", "ship-2"], supply: { suppliedThroughRound: 6, facilities: [] } },
    },
    operations: { operations: [{ id: "op-1", campaignId: "campaign-1", name: "Operation Test", strategicNodeId: "node-2", status: "ANNOUNCED", objectiveSummaries: ["Hold the ridge"], reinforcementStatus: "OPEN" }] },
    map: {
      map: { id: "map-1", name: "Test Theatre", scope: "THEATRE", version: 7 },
      round: { number: 4 },
      clock: { mode: "MANUAL" },
      nodes: [{ id: "node-1", name: "Test Orbit", type: "ORBIT", x: 25, y: 30, control: "FRIENDLY" }, { id: "node-2", name: "Test Ridge", type: "SURFACE_REGION", x: 70, y: 65, control: "CONTESTED" }],
      routes: [{ id: "route-1", fromNodeId: "node-1", toNodeId: "node-2", status: "OPEN", allowedMovementProfiles: ["AIR_MOBILE_BATTLEGROUP"], baseTravelRounds: null, travelCostStatus: "BALANCE_REQUIRED" }],
      taskForces: [{ id: "tf-1", name: "Test Task Force", status: "READY", currentNodeId: "node-1", shipIds: ["ship-1", "ship-2"], supply: { balances: [{ size: "LARGE", quantity: 2, capacity: 4 }], suppliedThroughRound: 6 } }],
      battlegroups: [{ id: "bg-1", name: "Battlegroup Test", status: "EMBARKED", currentNodeId: null, currentCarrierTaskForceId: "tf-1", revision: 2 }],
      planets: [{ planetId: "planet-1", name: "Corinth", locationId: "location-planet-1", strategicNodeId: "node-planet-1", position: { x: 44, y: 51 }, control: "CONTESTED", status: "OPEN", environment: { biome: "TEMPERATE" }, warState: { control: "CONTESTED" } }],
      campaigns: [{ campaignId: "campaign-1", name: "Operation Test", status: "RECRUITING", strategicStatus: "MUSTERING", planetId: "planet-1", planetName: "Corinth", planetLocationId: "location-planet-1", strategicNodeId: "node-2", operationId: "op-1", memberCount: 3, viewerDeploymentCount: 1, canEnter: true, viewerMembership: { side: "ALLIED", role: "PLAYER", battalionId: "battalion-1" } }],
      shipPresence: [{ shipId: "ship-1", name: "CSV Test", registry: null, classDefinitionId: "ship-destroyer", className: "Destroyer", status: "ORBIT", taskForceId: "tf-1", nodeId: "node-1", primary: true }],
      viewerPermissions: ["SHIP_VIEW"],
    },
    forces: { forces: [{ unitId: "unit-1", definitionId: "unit-infantry", definitionName: "Infantry Squad", callsign: "ROOK-1", name: "Rook One", category: "INFANTRY", status: "ACTIVE", locationState: "ON_SHIP", currentHealth: 6, maximumHealth: 6, healthModel: "FORCE_STRENGTH", version: 2, readiness: { ready: true, blockers: [], warnings: [] }, battlegroups: [{ id: "bg-1", name: "Battlegroup Test" }] }] },
    campaignSummaries: [{ campaignId: "campaign-1", campaignName: "Operation Test", planetName: "Corinth", round: 3, phase: "PLANNING", version: 8, clock: { durationMs: 300000, roundStartedAt: 1000, lockAt: 271000, resolvesAt: 301000 }, objectives: [{ id: "objective-1", name: "Hold Ridge", coord: { q: 2, r: 3 }, owner: "ALLIED", status: "ACTIVE", description: "Hold the ridge." }], viewerUnits: [{ id: "deployment-1", persistentUnitId: "unit-1", definitionId: "unit-infantry", callsign: "ROOK-1", status: "ACTIVE", locationState: "ON_MAP", position: { q: 1, r: 2 }, currentHealth: 5, maxHealth: 6 }], deployments: { allied: { visibility: "EXACT", total: 1, byStatus: { ACTIVE: 1 } }, enemy: { visibility: "VISIBLE_ONLY", total: 2, byStatus: { ACTIVE: 2 } } }, viewer: { userId: "user-1", side: "ALLIED", role: "PLAYER", battalionId: "battalion-1" }, serverTime: 1500 }],
  };
}

describe("strategic API view normalization", () => {
  it("keeps Task Forces and Battlegroups distinct and preserves server locations", () => {
    const snapshot = normalizeStrategicPayloads(payloads());

    expect(snapshot.map.formations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "tf-1",
        kind: "TASK_FORCE",
        nodeId: "node-1",
        supply: { largeCurrent: 2, largeCapacity: 4, suppliedThroughRound: 6 },
      }),
      expect.objectContaining({ id: "bg-1", kind: "BATTLEGROUP", nodeId: "node-1" }),
    ]));
    expect(snapshot.ship.taskForce.name).toBe("Test Task Force");
    expect(snapshot.battlegroups[0]?.status).toBe("EMBARKED");
    expect(snapshot.battlegroups[0]?.commanderCallsign).toBe("ROOK");
    expect(snapshot.battlegroups[0]?.currentLocation).toBe("Test Orbit");
  });

  it("keeps unresolved travel duration null instead of treating it as free", () => {
    const snapshot = normalizeStrategicPayloads(payloads());

    expect(snapshot.map.routes[0]?.travelRounds).toBeNull();
    expect(snapshot.ship.supply).toMatchObject({
      largeCurrent: 2,
      largeCapacity: 4,
      mediumAccess: true,
      smallAccess: true,
    });
    expect(snapshot.ship.modules[0]?.slotType).toBe("EXTERNAL_INTERNAL");
  });

  it("projects only public profile fields into the strategic view", () => {
    const snapshot = normalizeStrategicPayloads(payloads());

    expect(snapshot.profile).toEqual({
      userId: "user-1",
      callsign: "ROOK",
      displayName: "Rook",
      rankName: "Operator",
      battalionName: "Test Battalion",
      timezone: "Australia/Sydney",
    });
    expect("email" in snapshot.profile).toBe(false);
    expect(snapshot.operations[0]).toMatchObject({ campaignId: "campaign-1", location: "Test Ridge", objectives: ["Hold the ridge"], reinforcementState: "OPEN" });
  });

  it("uses deterministic graph positions when visual metadata is absent", () => {
    const first = payloads();
    const second = payloads();
    const firstMap = first.map as { nodes: Array<Record<string, unknown>> };
    const secondMap = second.map as { nodes: Array<Record<string, unknown>> };
    firstMap.nodes.forEach((node) => { delete node.x; delete node.y; });
    secondMap.nodes.forEach((node) => { delete node.x; delete node.y; });

    expect(normalizeStrategicPayloads(first).map.nodes.map(({ x, y }) => ({ x, y })))
      .toEqual(normalizeStrategicPayloads(second).map.nodes.map(({ x, y }) => ({ x, y })));
  });

  it("preserves authoritative planets, live campaigns, personal units, and exact Battalion ship presence", () => {
    const snapshot = normalizeStrategicPayloads(payloads());

    expect(snapshot.forceUnits[0]).toMatchObject({ unitId: "unit-1", currentHealth: 6, maximumHealth: 6 });
    expect(snapshot.map.formations.find((formation) => formation.id === "tf-1")?.shipIds).toEqual(["ship-1", "ship-2"]);
    expect(snapshot.ship).toMatchObject({ classDefinitionId: "ship-destroyer", taskForce: { shipIds: ["ship-1", "ship-2"] } });
    expect(snapshot.map.planets[0]).toMatchObject({ planetId: "planet-1", strategicNodeId: "node-planet-1" });
    expect(snapshot.map.shipPresence[0]).toMatchObject({ shipId: "ship-1", registry: null, taskForceId: "tf-1" });
    expect(snapshot.map.campaigns[0]).toMatchObject({
      campaignId: "campaign-1",
      status: "RECRUITING",
      strategicStatus: "MUSTERING",
      canEnter: true,
      live: { round: 3, phase: "PLANNING", viewerUnits: [expect.objectContaining({ maxHealth: 6 })] },
    });
  });
});

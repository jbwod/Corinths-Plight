import { describe, expect, it } from "vitest";
import {
  ADMIN_MAP_TERRAIN_VOCABULARY,
  type AdminMapEdgeFeatureV1,
} from "../src/admin-map-domain";
import { generateAdminMap } from "../src/admin-map-generation";
import {
  CUSTOM_MAP_MARSH_MOVEMENT_COST,
  CUSTOM_MAP_EDGE_FEATURE_MECHANICS,
  CUSTOM_MAP_POINT_FEATURE_MECHANICS,
  CUSTOM_MAP_RIVER_CROSSING_SURCHARGE,
  CUSTOM_MAP_TERRAIN_APPLICATION_PROFILE_ID,
  CUSTOM_MAP_TERRAIN_MECHANICS,
  customMapHexEdges,
  customMapTerrainApplication,
  materializeAdminMapBattlefield,
} from "../src/terrain-application";
import { calculateRouteCost, hasLineOfSight, shortestPath } from "../src/hex";
import { makeDeployment, makeHex, makeOrder, makeRoundInput, makeState } from "./fixtures";
import { resolveRound, validateOrder } from "../src/resolver";

const impassable = { groundTraversal: "IMPASSABLE", applicationProfileId: "test@1" } as const;

describe("user-authorised custom-map terrain application", () => {
  it("pins all edge application decisions to versioned feature IDs", () => {
    expect(CUSTOM_MAP_EDGE_FEATURE_MECHANICS).toEqual({
      ROAD: { mechanicalFeatureId: "edge-road@1", groundCostMultiplier: 0.5 },
      PATH: { mechanicalFeatureId: "edge-path@1", groundCostMultiplier: 0.75 },
      RIVER: { mechanicalFeatureId: "edge-river-crossing@1", riverCrossingSurcharge: 1 },
      WALL: { mechanicalFeatureId: "edge-wall@1", blocksGroundTraversal: true, blocksLineOfSight: true },
      BRIDGE: { mechanicalFeatureId: "structure-bridge", removesRiverCrossingSurcharge: true },
    });
  });

  it("materialises explicit quarter-step mechanics for every requested biome", () => {
    for (const terrain of ADMIN_MAP_TERRAIN_VOCABULARY) {
      expect(terrain.mechanicsStatus, terrain.id).toBe("PUBLISHED");
      expect(terrain.mechanicalTerrainProfileId, terrain.id).not.toBeNull();
      const application = customMapTerrainApplication(
        terrain.id,
        terrain.mechanicalTerrainProfileId!,
      );
      expect(application.movementRules.applicationProfileId).toBe(CUSTOM_MAP_TERRAIN_APPLICATION_PROFILE_ID);
      expect(application.movementCost).toBeGreaterThan(0);
      expect(Number.isInteger(application.movementCost * 4), terrain.id).toBe(true);
      expect(application.capacity).toBeGreaterThan(0);
      expect(CUSTOM_MAP_TERRAIN_MECHANICS[terrain.mechanicalTerrainProfileId!]).toBeDefined();
    }
  });

  it("pins the conservative ground-traversal matrix for water and major heights", () => {
    const deepWater = new Set(["WATER_OPEN_WATER", "WATER_OCEAN", "WATER_DEEP", "WATER_SEA"]);
    const amphibiousWater = new Set([
      "WATER_COAST",
      "WATER_WATER",
      "WATER_SHALLOW",
      "WATER_FRESH",
      "WATER_LAKE",
      "WATER_POND",
      "WATER_RAPIDS",
      "WATER_COASTAL",
    ]);
    const majorHeights = new Set([
      "HIGHLANDS_MOUNTAIN",
      "HIGHLANDS_MOUNTAINS",
      "HIGHLANDS_MOUNTAIN_PEAK",
      "HIGHLANDS_VOLCANO",
      "HIGHLANDS_CLIFFS",
    ]);
    for (const terrain of ADMIN_MAP_TERRAIN_VOCABULARY) {
      const application = customMapTerrainApplication(terrain.id, terrain.mechanicalTerrainProfileId!);
      const blocked = deepWater.has(terrain.id) || amphibiousWater.has(terrain.id) || majorHeights.has(terrain.id);
      expect(application.movementRules.groundTraversal, terrain.id).toBe(blocked ? "IMPASSABLE" : "PASSABLE");
      if (deepWater.has(terrain.id)) expect(application.movementRules.allowedGroundTraversalTags).toBeUndefined();
      if (amphibiousWater.has(terrain.id)) {
        expect(application.movementRules.allowedGroundTraversalTags).toEqual(["AMPHIBIOUS", "WATER_TRAVERSAL"]);
      }
      if (majorHeights.has(terrain.id)) {
        expect(application.movementRules.allowedGroundTraversalTags).toEqual(["MOUNTAIN_TRAVERSAL"]);
      }
    }
  });

  it("blocks ground across ocean while airborne aerospace and VTOL fly over", () => {
    const start = makeHex(0, 0);
    const ocean = makeHex(1, 0, {
      ...customMapTerrainApplication("WATER_OCEAN", "terrain-deep-water"),
    });
    const route = [start.coord, ocean.coord];

    expect(calculateRouteCost(route, [start, ocean], { unitTags: ["GROUND", "INFANTRY"] }))
      .toMatchObject({ legal: false, reason: expect.stringContaining("Ground movement cannot traverse") });
    expect(calculateRouteCost(route, [start, ocean], {
      unitTags: ["AEROSPACE", "VTOL", "VEHICLE"],
      unitStatuses: [],
    })).toMatchObject({ legal: true, total: 1 });
    expect(shortestPath(start.coord, ocean.coord, [start, ocean], {
      unitTags: ["GROUND", "VEHICLE"],
    })).toEqual([]);
    expect(shortestPath(start.coord, ocean.coord, [start, ocean], {
      unitTags: ["AEROSPACE", "VTOL"],
    })).toEqual(route);
  });

  it("makes landed aerospace obey blockers until its order takes off", () => {
    const air = makeDeployment("landed-vtol", { q: 0, r: 0 }, "ALLIED", {
      tags: ["AEROSPACE", "VTOL", "VEHICLE"],
      statuses: ["LANDED"],
      allowedOrders: ["ADVANCE"],
      allowedActions: ["TAKE_OFF"],
    });
    const start = makeHex(0, 0);
    const ocean = makeHex(1, 0, { movementRules: impassable, terrainId: "terrain-ocean" });
    const blocked = makeOrder(air, { route: [start.coord, ocean.coord], endHex: ocean.coord });
    const state = makeState([air], [start, ocean], [blocked]);

    expect(validateOrder(blocked, air, makeRoundInput(state, [blocked]))).toMatchObject({ legal: false });

    const takeOff = makeOrder(air, {
      route: [start.coord, ocean.coord],
      endHex: ocean.coord,
      actions: [{
        id: "take-off",
        type: "TAKE_OFF",
        economy: "STANDARD",
        speedCost: 0.5,
        equipmentIds: [],
      }],
    });
    expect(validateOrder(takeOff, air, makeRoundInput(state, [takeOff]))).toMatchObject({
      legal: true,
      movementCost: 1,
    });
    expect(resolveRound(makeRoundInput({ ...state, orders: [takeOff] }, [takeOff])).state.deployments[0]?.position)
      .toEqual(ocean.coord);
  });

  it("blocks mountains for ground but allows flight over them", () => {
    const mountain = makeHex(1, 0, {
      ...customMapTerrainApplication("HIGHLANDS_MOUNTAIN", "terrain-mountain"),
    });
    const start = makeHex(0, 0);

    expect(calculateRouteCost([start.coord, mountain.coord], [start, mountain], {
      unitTags: ["GROUND", "MECH", "VEHICLE"],
    }).legal).toBe(false);
    expect(calculateRouteCost([start.coord, mountain.coord], [start, mountain], {
      unitTags: ["AEROSPACE", "ATMO_FLIGHT"],
    })).toMatchObject({ legal: true, total: 1 });
    expect(calculateRouteCost([start.coord, mountain.coord], [start, mountain], {
      unitTags: ["GROUND", "INFANTRY", "MOUNTAIN_TRAVERSAL"],
    })).toMatchObject({ legal: true });
  });

  it("pins marsh slowdown to its exact versioned profile and rejects mismatches", () => {
    expect(customMapTerrainApplication("WETLANDS_MARSH", "terrain-marsh"))
      .toMatchObject({ terrainId: "terrain-marsh", movementCost: 1.5 });
    expect(() => customMapTerrainApplication("WETLANDS_MARSH", "terrain-open"))
      .toThrow(/TERRAIN_PROFILE_MISMATCH/);
  });

  it("retains the 1.5 marsh cost and charges +1 for an unbridged river", () => {
    const start = makeHex(0, 0, { edges: { rivers: [2], roads: [], bridges: [] } });
    const marsh = makeHex(1, 0, {
      ...customMapTerrainApplication("WETLANDS_MARSH", "terrain-marsh"),
    });

    const result = calculateRouteCost([start.coord, marsh.coord], [start, marsh], {
      unitTags: ["GROUND", "INFANTRY"],
    });
    expect(CUSTOM_MAP_RIVER_CROSSING_SURCHARGE).toBe(1);
    expect(CUSTOM_MAP_MARSH_MOVEMENT_COST).toBe(1.5);
    expect(result).toMatchObject({
      legal: true,
      total: 2.5,
      steps: [{ base: 1.5, river: 1, bridge: false }],
    });
  });

  it("removes only the river surcharge on an explicit bridge edge", () => {
    const start = makeHex(0, 0, { edges: { rivers: [2], roads: [2], bridges: [2] } });
    const destination = makeHex(1, 0, { movementCost: 1.5 });
    const result = calculateRouteCost([start.coord, destination.coord], [start, destination], {
      unitTags: ["GROUND", "VEHICLE"],
    });

    expect(result).toMatchObject({
      legal: true,
      total: 0.75,
      steps: [{ river: 0, road: true, bridge: true }],
    });
  });

  it("materialises every canonical edge feature on both endpoints", () => {
    const base = {
      q: 0,
      r: 0,
      direction: 2,
      mechanicsStatus: "PUBLISHED",
    } as const;
    const features: AdminMapEdgeFeatureV1[] = [
      { ...base, id: "road", featureId: "ROAD", mechanicalFeatureId: "edge-road@1" },
      { ...base, id: "path", featureId: "PATH", mechanicalFeatureId: "edge-path@1" },
      { ...base, id: "river", featureId: "RIVER", mechanicalFeatureId: "edge-river-crossing@1" },
      { ...base, id: "wall", featureId: "WALL", mechanicalFeatureId: "edge-wall@1" },
      { ...base, id: "bridge", featureId: "BRIDGE", mechanicalFeatureId: "structure-bridge" },
    ];

    expect(customMapHexEdges(features)).toEqual(new Map([
      ["0,0", { rivers: [2], roads: [2], bridges: [2], paths: [2], walls: [2] }],
      ["1,0", { rivers: [5], roads: [5], bridges: [5], paths: [5], walls: [5] }],
    ]));
  });

  it("uses cost-aware stable routing to prefer a bridge over a direct river crossing", () => {
    const start = makeHex(0, 0, { edges: { rivers: [2], roads: [], bridges: [] } });
    const direct = makeHex(1, 0, { edges: { rivers: [], roads: [2], bridges: [2] } });
    const goal = makeHex(2, 0);
    const bridgeApproach = makeHex(0, 1, { edges: { rivers: [2], roads: [2], bridges: [2] } });
    const bridgeExit = makeHex(1, 1);
    const map = [start, direct, goal, bridgeApproach, bridgeExit];

    expect(shortestPath(start.coord, goal.coord, map, { unitTags: ["GROUND", "INFANTRY"] }))
      .toEqual([start.coord, direct.coord, goal.coord]);

    direct.movementCost = 4;
    expect(shortestPath(start.coord, goal.coord, map, { unitTags: ["GROUND", "INFANTRY"] }))
      .toEqual([start.coord, bridgeApproach.coord, bridgeExit.coord, goal.coord]);
  });

  it("gives paths a smaller benefit than roads and makes walls block ground and LOS", () => {
    const pathStart = makeHex(0, 0, { edges: { rivers: [], roads: [], paths: [2] } });
    const destination = makeHex(1, 0);
    expect(calculateRouteCost([pathStart.coord, destination.coord], [pathStart, destination]))
      .toMatchObject({ legal: true, total: 0.75, steps: [{ base: 0.75, path: true, road: false }] });

    const wallStart = makeHex(0, 0, { edges: { rivers: [], roads: [], walls: [2] } });
    expect(calculateRouteCost([wallStart.coord, destination.coord], [wallStart, destination], {
      unitTags: ["GROUND", "INFANTRY"],
    })).toMatchObject({ legal: false, reason: expect.stringContaining("cannot cross a wall") });
    expect(calculateRouteCost([wallStart.coord, destination.coord], [wallStart, destination], {
      unitTags: ["AEROSPACE", "VTOL"],
    })).toMatchObject({ legal: true, total: 1 });
    expect(hasLineOfSight(wallStart.coord, destination.coord, [wallStart, destination], 2)).toBe(false);
  });

  it("materialises every point feature into server-consumed battlefield fields", () => {
    const document = generateAdminMap({
      preset: "DESERT_CONTINENT",
      seed: "all-point-mechanics",
      width: 24,
      height: 18,
    });
    const battlefield = materializeAdminMapBattlefield(document);
    const hexFor = (featureId: keyof typeof CUSTOM_MAP_POINT_FEATURE_MECHANICS) => {
      const feature = document.pointFeatures.find((candidate) => candidate.featureId === featureId)!;
      return battlefield.find((hex) => hex.coord.q === feature.q && hex.coord.r === feature.r)!;
    };

    expect(hexFor("CITY")).toMatchObject({
      capacity: 8,
      blocksLineOfSight: true,
      environment: expect.arrayContaining(["INFANTRY_GARRISON_BUILDING", "POPULATION_CENTER"]),
    });
    expect(hexFor("AIRFIELD")).toMatchObject({
      capacity: 6,
      environment: expect.arrayContaining(["LAND_AEROSPACE", "LAND_VTOL", "REARM_AEROSPACE"]),
    });
    expect(hexFor("TOWN")).toMatchObject({
      capacity: 5,
      environment: expect.arrayContaining(["INFANTRY_GARRISON_BUILDING", "POPULATION_CENTER"]),
    });
    expect(hexFor("OUTPOST")).toMatchObject({
      capacity: 4,
      environment: expect.arrayContaining(["INFANTRY_GARRISON_BUILDING", "SUPPLY_POINT"]),
    });
    expect(hexFor("RADAR")).toMatchObject({
      elevation: expect.any(Number),
      environment: expect.arrayContaining(["SENSOR_ARRAY"]),
    });
    expect(hexFor("RADAR").elevation).toBeGreaterThanOrEqual(1);
    expect(hexFor("TRENCH").structureIds).toContainEqual(expect.stringMatching(/^structure-trench:/));
    for (const feature of document.pointFeatures) {
      const hex = battlefield.find((candidate) => candidate.coord.q === feature.q && candidate.coord.r === feature.r)!;
      expect(hex.structureIds.some((id) => id.endsWith(`:${feature.id}`)), feature.featureId).toBe(true);
    }
  });
});

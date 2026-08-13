import { describe, expect, it } from "vitest";

import type { BattlefieldHex } from "../../domain/src";
import { coordKey, hexDistance, hexNeighbours } from "../src/hex";
import {
  BROKEN_ROAD_SCENARIO_ID,
  BROKEN_ROAD_SCENARIO_VERSION,
  COLD_HORIZON_SCENARIO_ID,
  COLD_HORIZON_SCENARIO_VERSION,
  createBrokenRoadMap,
  createColdHorizonMap,
  createIronRainMap,
  createNightGlassMap,
  IRON_RAIN_SCENARIO_ID,
  IRON_RAIN_SCENARIO_VERSION,
  NIGHT_GLASS_SCENARIO_ID,
  NIGHT_GLASS_SCENARIO_VERSION,
} from "../src/scenario-content";
import { createIrregularTheatreCoordinates } from "../src/theatre-map";

interface TheatreExpectation {
  name: string;
  scenarioId: string;
  scenarioVersion: number;
  coreRadius: number;
  outerRadius: number;
  expectedHexes: number;
  createMap: (radius?: number) => BattlefieldHex[];
  requiredCoordinates: Array<{ q: number; r: number }>;
}

const origin = { q: 0, r: 0 };
const theatres: TheatreExpectation[] = [
  {
    name: "Iron Rain",
    scenarioId: IRON_RAIN_SCENARIO_ID,
    scenarioVersion: IRON_RAIN_SCENARIO_VERSION,
    coreRadius: 7,
    outerRadius: 11,
    expectedHexes: 311,
    createMap: createIronRainMap,
    requiredCoordinates: [{ q: -6, r: 2 }, { q: 0, r: 0 }, { q: 6, r: -2 }],
  },
  {
    name: "Broken Road",
    scenarioId: BROKEN_ROAD_SCENARIO_ID,
    scenarioVersion: BROKEN_ROAD_SCENARIO_VERSION,
    coreRadius: 6,
    outerRadius: 10,
    expectedHexes: 244,
    createMap: createBrokenRoadMap,
    requiredCoordinates: [{ q: -5, r: 1 }, { q: 0, r: 0 }, { q: 4, r: -1 }],
  },
  {
    name: "Night Glass",
    scenarioId: NIGHT_GLASS_SCENARIO_ID,
    scenarioVersion: NIGHT_GLASS_SCENARIO_VERSION,
    coreRadius: 5,
    outerRadius: 10,
    expectedHexes: 240,
    createMap: createNightGlassMap,
    requiredCoordinates: [{ q: -4, r: 2 }, { q: 0, r: 0 }, { q: 4, r: -2 }],
  },
  {
    name: "Cold Horizon",
    scenarioId: COLD_HORIZON_SCENARIO_ID,
    scenarioVersion: COLD_HORIZON_SCENARIO_VERSION,
    coreRadius: 6,
    outerRadius: 11,
    expectedHexes: 298,
    createMap: createColdHorizonMap,
    requiredCoordinates: [{ q: -5, r: 2 }, { q: 0, r: 0 }, { q: 4, r: -2 }],
  },
];

function reachableHexCount(map: BattlefieldHex[]): number {
  const mapKeys = new Set(map.map((hex) => coordKey(hex.coord)));
  const visited = new Set<string>();
  const pending = [origin];
  while (pending.length > 0) {
    const coord = pending.pop()!;
    const key = coordKey(coord);
    if (visited.has(key) || !mapKeys.has(key)) continue;
    visited.add(key);
    for (const neighbour of hexNeighbours(coord)) pending.push(neighbour);
  }
  return visited.size;
}

describe("deterministic irregular theatre maps", () => {
  it("validates and deterministically repeats pure coordinate generation", () => {
    const options = { seed: "test-theatre", coreRadius: 3, outerRadius: 7 };
    expect(createIrregularTheatreCoordinates(options)).toEqual(
      createIrregularTheatreCoordinates(options),
    );
    expect(() => createIrregularTheatreCoordinates({
      seed: "test-theatre",
      coreRadius: 8,
      outerRadius: 7,
    })).toThrow("coreRadius must not exceed outerRadius");
    expect(() => createIrregularTheatreCoordinates({
      seed: "",
      coreRadius: 3,
      outerRadius: 7,
    })).toThrow("seed must not be empty");
  });

  it("publishes only the four expanded operations at scenario version 3", () => {
    expect(theatres.map((theatre) => theatre.scenarioVersion)).toEqual([3, 3, 3, 3]);
  });

  for (const theatre of theatres) {
    it(`${theatre.name} preserves its core inside a connected irregular outer theatre`, () => {
      const map = theatre.createMap();
      const repeated = theatre.createMap();
      const originalCore = theatre.createMap(theatre.coreRadius);
      const expandedCore = map.filter(
        (hex) => hexDistance(origin, hex.coord) <= theatre.coreRadius,
      );
      const outerBoundary = map.filter(
        (hex) => hexDistance(origin, hex.coord) === theatre.outerRadius,
      );

      expect(map).toEqual(repeated);
      expect(map).toHaveLength(theatre.expectedHexes);
      expect(expandedCore).toEqual(originalCore);
      expect(reachableHexCount(map)).toBe(map.length);
      expect(outerBoundary.length).toBeGreaterThan(0);
      expect(outerBoundary.length).toBeLessThan(6 * theatre.outerRadius);
      expect(map.length).toBeLessThan(1 + 3 * theatre.outerRadius * (theatre.outerRadius + 1));
      for (const coord of theatre.requiredCoordinates) {
        expect(map.some((hex) => coordKey(hex.coord) === coordKey(coord))).toBe(true);
      }
    });
  }
});

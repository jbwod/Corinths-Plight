import { describe, expect, it } from "vitest";
import {
  HEX_DIRECTIONS,
  calculateRouteCost,
  canOccupyHex,
  coordKey,
  facingBetween,
  hasLineOfSight,
  hexDistance,
  hexLine,
  hexNeighbours,
  isRearAttack,
  rearFacing,
  shortestPath,
  visibleHexes,
} from "../src/hex";
import { makeAxialMap, makeDeployment, makeHex } from "./fixtures";

describe("axial hex geometry", () => {
  it("calculates symmetric axial distance", () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(hexDistance({ q: -3, r: 2 }, { q: 4, r: -2 })).toBe(7);
    expect(hexDistance({ q: 4, r: -2 }, { q: -3, r: 2 })).toBe(7);
  });

  it("returns all six unique neighbours", () => {
    const neighbours = hexNeighbours({ q: 3, r: -2 });

    expect(neighbours).toHaveLength(6);
    expect(new Set(neighbours.map(coordKey)).size).toBe(6);
    expect(neighbours).toEqual(
      HEX_DIRECTIONS.map(({ q, r }) => ({ q: q + 3, r: r - 2 })),
    );
  });

  it("interpolates a contiguous line with exact endpoints", () => {
    const start = { q: -2, r: 1 };
    const end = { q: 3, r: -2 };
    const line = hexLine(start, end);

    expect(line[0]).toEqual(start);
    expect(line.at(-1)).toEqual(end);
    expect(line).toHaveLength(hexDistance(start, end) + 1);
    for (let index = 1; index < line.length; index += 1) {
      expect(hexDistance(line[index - 1], line[index])).toBe(1);
    }
  });

  it("maps facing and direct rear arcs consistently", () => {
    const target = { q: 0, r: 0 };

    expect(facingBetween(target, { q: 0, r: -1 })).toBe(0);
    expect(rearFacing(0)).toBe(3);
    expect(isRearAttack({ q: 0, r: 1 }, target, 0)).toBe(true);
    expect(isRearAttack({ q: 0, r: -1 }, target, 0)).toBe(false);
    expect(facingBetween(target, target)).toBeNull();
  });
});

describe("routes, terrain, and pathing", () => {
  it("rejects non-adjacent steps and routes that leave the battlefield", () => {
    const map = [makeHex(0, 0), makeHex(1, 0)];

    expect(calculateRouteCost([{ q: 0, r: 0 }, { q: 2, r: 0 }], map)).toMatchObject({
      legal: false,
      reason: "Route step 1 is not adjacent.",
    });
    expect(calculateRouteCost([{ q: 0, r: 0 }, { q: 0, r: -1 }], map)).toMatchObject({
      legal: false,
      reason: "Route leaves the battlefield at step 1.",
    });
  });

  it("accounts deterministically for road, destination terrain, elevation, river, and Rush", () => {
    const start = makeHex(0, 0, {
      elevation: 0,
      edges: { roads: [2], rivers: [2] },
    });
    const destination = makeHex(1, 0, {
      elevation: 1,
      movementCost: 1.5,
    });
    const route = [start.coord, destination.coord];

    const standard = calculateRouteCost(route, [start, destination]);
    expect(standard).toEqual({
      total: 2.75,
      legal: true,
      steps: [
        {
          from: start.coord,
          to: destination.coord,
          base: 0.75,
          elevation: 1,
          river: 1,
          road: true,
          total: 2.75,
        },
      ],
    });
    expect(calculateRouteCost(route, [start, destination], { rush: true }).total).toBe(1.375);
    expect(
      calculateRouteCost(route, [start, destination], {
        ignoresElevation: true,
        ignoresRivers: true,
      }).total,
    ).toBe(0.75);
  });

  it("recognizes a road or river edge recorded from either endpoint", () => {
    const west = makeHex(0, 0, { edges: { roads: [2], rivers: [2] } });
    const east = makeHex(1, 0);

    const reverse = calculateRouteCost([east.coord, west.coord], [west, east]);

    expect(reverse.legal).toBe(true);
    expect(reverse.steps[0]).toMatchObject({ road: true, river: 1 });
  });

  it("finds a shortest-hop detour around blocked hexes", () => {
    const map = makeAxialMap(2);
    const blocked = new Set(["1,0"]);
    const path = shortestPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, { blocked });

    expect(path[0]).toEqual({ q: 0, r: 0 });
    expect(path.at(-1)).toEqual({ q: 2, r: 0 });
    expect(path.map(coordKey)).not.toContain("1,0");
    expect(path).toHaveLength(4);
    for (let index = 1; index < path.length; index += 1) {
      expect(hexDistance(path[index - 1], path[index])).toBe(1);
    }
  });

  it("returns no path when every exit is blocked", () => {
    const map = makeAxialMap(2);
    const blocked = new Set(hexNeighbours({ q: 0, r: 0 }).map(coordKey));

    expect(shortestPath({ q: 0, r: 0 }, { q: 2, r: 0 }, map, { blocked })).toEqual([]);
  });
});

describe("line of sight and hex capacity", () => {
  it("blocks direct LOS on an intervening blocking hex and enforces maximum range", () => {
    const map = [
      makeHex(0, 0),
      makeHex(1, 0, { blocksLineOfSight: true, terrainId: "terrain-forest" }),
      makeHex(2, 0),
    ];

    expect(hasLineOfSight({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 3)).toBe(false);
    expect(hasLineOfSight({ q: 0, r: 0 }, { q: 1, r: 0 }, map, 1)).toBe(true);
    expect(hasLineOfSight({ q: 0, r: 0 }, { q: 2, r: 0 }, map, 1)).toBe(false);
  });

  it("projects only hexes within observer sensors and LOS", () => {
    const map = makeAxialMap(2);
    const observer = makeDeployment("observer", { q: 0, r: 0 }, "ALLIED", {
      stats: { sensors: 1 },
    });
    const visible = visibleHexes([observer], map);

    expect(visible.has("0,0")).toBe(true);
    for (const neighbour of hexNeighbours({ q: 0, r: 0 })) {
      expect(visible.has(coordKey(neighbour))).toBe(true);
    }
    expect(visible.has("2,0")).toBe(false);
  });

  it("enforces capacity while excluding the moving unit and destroyed occupants", () => {
    const destination = makeHex(0, 0, { capacity: 2 });
    const mover = makeDeployment("mover", { q: 0, r: 0 });
    const first = makeDeployment("first", { q: 0, r: 0 });
    const second = makeDeployment("second", { q: 0, r: 0 });

    expect(canOccupyHex(destination.coord, mover.id, [mover, first, second], [destination])).toBe(false);

    second.status = "DESTROYED";
    expect(canOccupyHex(destination.coord, mover.id, [mover, first, second], [destination])).toBe(true);
    expect(canOccupyHex({ q: 9, r: 9 }, mover.id, [mover], [destination])).toBe(false);
  });

  it("does not let withdrawn deployments consume battlefield capacity", () => {
    const destination = makeHex(0, 0, { capacity: 1 });
    const mover = makeDeployment("mover", { q: -1, r: 0 });
    const withdrawn = makeDeployment("withdrawn", { q: 0, r: 0 }, "ALLIED", {
      status: "WITHDRAWN",
    });

    expect(canOccupyHex(destination.coord, mover.id, [mover, withdrawn], [destination])).toBe(true);
  });
});

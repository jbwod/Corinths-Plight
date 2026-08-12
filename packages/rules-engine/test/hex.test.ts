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
          fieldwork: 0,
          garrisonEntry: 0,
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

  it("moves VTOL flight one unit per hex without ground terrain, river, road, or fieldwork costs", () => {
    const start = makeHex(0, 0, { elevation: 0, edges: { roads: [2], rivers: [2] } });
    const destination = makeHex(1, 0, {
      elevation: 3,
      movementCost: 2,
      structureIds: ["structure-tank-traps:fixture"],
    });
    expect(calculateRouteCost([start.coord, destination.coord], [start, destination], {
      unitTags: ["AEROSPACE", "VTOL", "VEHICLE"],
    })).toEqual({
      total: 1,
      legal: true,
      steps: [{
        from: start.coord,
        to: destination.coord,
        base: 1,
        elevation: 0,
        river: 0,
        road: false,
        fieldwork: 0,
        garrisonEntry: 0,
        total: 1,
      }],
    });
  });

  it("recognizes a road or river edge recorded from either endpoint", () => {
    const west = makeHex(0, 0, { edges: { roads: [2], rivers: [2] } });
    const east = makeHex(1, 0);

    const reverse = calculateRouteCost([east.coord, west.coord], [west, east]);

    expect(reverse.legal).toBe(true);
    expect(reverse.steps[0]).toMatchObject({ road: true, river: 1 });
  });

  it("charges source-defined fieldwork Speed on entry by unit domain", () => {
    const start = makeHex(0, 0);
    const wire = makeHex(1, 0, { structureIds: ["structure-razor-wire:test"] });
    const traps = makeHex(0, 1, { structureIds: ["structure-tank-traps:test"] });

    expect(calculateRouteCost([start.coord, wire.coord], [start, wire], { unitTags: ["INFANTRY"] }))
      .toMatchObject({ total: 1.5, steps: [{ fieldwork: 0.5 }] });
    expect(calculateRouteCost([start.coord, wire.coord], [start, wire], { unitTags: ["VEHICLE"] }).total).toBe(1);
    expect(calculateRouteCost([start.coord, traps.coord], [start, traps], { unitTags: ["VEHICLE"] }))
      .toMatchObject({ total: 2, steps: [{ fieldwork: 1 }] });
    expect(calculateRouteCost([start.coord, traps.coord], [start, traps], { unitTags: ["INFANTRY"] }).total).toBe(1);
    expect(calculateRouteCost([start.coord, wire.coord], [start, wire], { rush: true, unitTags: ["INFANTRY"] }).total).toBe(1);
  });

  it("charges eligible infantry exactly 0.25 Speed to enter or cross between authored buildings", () => {
    const start = makeHex(0, 0);
    const firstRoom = makeHex(1, 0, { environment: ["INFANTRY_GARRISON_BUILDING"] });
    const secondRoom = makeHex(2, 0, {
      movementCost: 2,
      elevation: 2,
      environment: ["INFANTRY_GARRISON_BUILDING"],
    });
    const infantry = ["GROUND", "PERSONNEL", "INFANTRY"];

    expect(calculateRouteCost([start.coord, firstRoom.coord], [start, firstRoom], { unitTags: infantry }))
      .toMatchObject({ total: 0.25, steps: [{ garrisonEntry: 0.25, total: 0.25 }] });
    expect(calculateRouteCost([firstRoom.coord, secondRoom.coord], [firstRoom, secondRoom], {
      rush: true,
      unitTags: infantry,
    })).toMatchObject({ total: 0.25, steps: [{ garrisonEntry: 0.25, total: 0.25 }] });
    expect(calculateRouteCost([firstRoom.coord, start.coord], [start, firstRoom], { unitTags: infantry }).total)
      .toBe(1);
  });

  it("does not grant the infantry building rate to vehicles or non-infantry personnel", () => {
    const start = makeHex(0, 0);
    const building = makeHex(1, 0, {
      movementCost: 2,
      environment: ["INFANTRY_GARRISON_BUILDING"],
    });

    expect(calculateRouteCost([start.coord, building.coord], [start, building], {
      unitTags: ["GROUND", "VEHICLE", "INFANTRY"],
    }).total).toBe(2);
    expect(calculateRouteCost([start.coord, building.coord], [start, building], {
      unitTags: ["GROUND", "PERSONNEL", "MEDICAL"],
    }).total).toBe(2);
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

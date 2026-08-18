import { describe, expect, it } from "vitest";

import {
  axialToTacticalWorld,
  fitTacticalMapViewport,
  tacticalMapBounds,
  tacticalWorldToAxial,
} from "./tactical-map-geometry";
import { tacticalWaterRings } from "./tactical-terrain";

describe("tactical map geometry", () => {
  it("round-trips authored axial coordinates", () => {
    for (const coord of [{ q: 0, r: 0 }, { q: -11, r: 5 }, { q: 7, r: -10 }]) {
      const world = axialToTacticalWorld(coord);
      expect(tacticalWorldToAxial(world.x, world.y)).toEqual(coord);
    }
  });

  it("fits a continent-scale map inside the viewport with bounded zoom", () => {
    const coords = [];
    const radius = 11;
    for (let q = -radius; q <= radius; q += 1) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r += 1) {
        coords.push({ q, r });
      }
    }
    const bounds = tacticalMapBounds(coords);
    const viewport = fitTacticalMapViewport(900, 650, bounds);

    expect(coords).toHaveLength(397);
    expect(viewport.zoom).toBeGreaterThanOrEqual(0.1);
    expect(viewport.zoom).toBeLessThan(0.56);
    expect(viewport.x + bounds.minX * viewport.zoom).toBeGreaterThanOrEqual(57);
    expect(viewport.x + bounds.maxX * viewport.zoom).toBeLessThanOrEqual(843);
    expect(viewport.y + bounds.minY * viewport.zoom).toBeGreaterThanOrEqual(57);
    expect(viewport.y + bounds.maxY * viewport.zoom).toBeLessThanOrEqual(593);
  });

  it("fits land and all three chart-water rings inside a mobile viewport", () => {
    const land = [];
    const radius = 11;
    for (let q = -radius; q <= radius; q += 1) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r += 1) {
        land.push({ q, r });
      }
    }
    const water = tacticalWaterRings(land, 3).map((hex) => hex.coord);
    const bounds = tacticalMapBounds([...land, ...water]);
    const viewport = fitTacticalMapViewport(390, 520, bounds);

    expect(viewport.x + bounds.minX * viewport.zoom).toBeGreaterThanOrEqual(57);
    expect(viewport.x + bounds.maxX * viewport.zoom).toBeLessThanOrEqual(333);
    expect(viewport.y + bounds.minY * viewport.zoom).toBeGreaterThanOrEqual(57);
    expect(viewport.y + bounds.maxY * viewport.zoom).toBeLessThanOrEqual(463);
  });
});

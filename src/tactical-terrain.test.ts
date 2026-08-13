import { describe, expect, it } from "vitest";

import {
  connectedTerrainDirections,
  exposedMapDirections,
  tacticalTerrainKind,
  tacticalTerrainSeed,
  tacticalTerrainStyle,
  tacticalTerrainVariant,
  tacticalWaterRings,
  terrainBoundaryDirections,
} from "./tactical-terrain";

describe("tactical terrain visuals", () => {
  it("maps authored terrain ids to stable visual families", () => {
    expect(tacticalTerrainKind("terrain-open")).toBe("OPEN");
    expect(tacticalTerrainKind("terrain-forest")).toBe("FOREST");
    expect(tacticalTerrainKind("terrain-ridge")).toBe("RIDGE");
    expect(tacticalTerrainKind("terrain-marsh")).toBe("MARSH");
    expect(tacticalTerrainKind("terrain-unpublished")).toBe("OPEN");
  });

  it("produces deterministic bounded variants", () => {
    const coord = { q: -7, r: 3 };
    expect(tacticalTerrainSeed(coord)).toBe(tacticalTerrainSeed(coord));
    expect(tacticalTerrainVariant(coord)).toBeGreaterThanOrEqual(0);
    expect(tacticalTerrainVariant(coord)).toBeLessThan(5);
    const neighbouringVariants = [
      tacticalTerrainVariant({ q: -7, r: 3 }),
      tacticalTerrainVariant({ q: -6, r: 3 }),
      tacticalTerrainVariant({ q: -7, r: 4 }),
    ];
    expect(Math.max(...neighbouringVariants) - Math.min(...neighbouringVariants)).toBeLessThanOrEqual(1);
    expect(tacticalTerrainStyle("terrain-forest", coord)).toEqual(tacticalTerrainStyle("terrain-forest", coord));
    expect(tacticalTerrainStyle("terrain-forest", coord)).not.toEqual(tacticalTerrainStyle("terrain-open", coord));
    expect(tacticalTerrainStyle("terrain-ridge", coord)).toMatchObject({
      fill: expect.stringMatching(/^#/),
      shadow: expect.stringMatching(/^#/),
      highlight: expect.stringMatching(/^#/),
      accent: expect.stringMatching(/^#/),
    });
  });

  it("builds deterministic shallow-to-deep chart-water rings without changing land", () => {
    const land = [{ q: 0, r: 0 }];
    const rings = tacticalWaterRings(land, 3);

    expect(rings).toEqual(tacticalWaterRings(land, 3));
    expect(rings.filter((hex) => hex.depth === 1)).toHaveLength(6);
    expect(rings.filter((hex) => hex.depth === 2)).toHaveLength(12);
    expect(rings.filter((hex) => hex.depth === 3)).toHaveLength(18);
    expect(rings.some((hex) => hex.coord.q === 0 && hex.coord.r === 0)).toBe(false);
    expect(new Set(rings.map((hex) => `${hex.coord.q},${hex.coord.r}`)).size).toBe(rings.length);
  });

  it("clamps chart-water depth and handles empty terrain", () => {
    expect(tacticalWaterRings([], 3)).toEqual([]);
    expect(tacticalWaterRings([{ q: 0, r: 0 }], 0)).toEqual([]);
    expect(tacticalWaterRings([{ q: 0, r: 0 }], 12).every((hex) => hex.depth <= 3)).toBe(true);
  });

  it("detects connected terrain and exposed coastline directions", () => {
    const index = new Map([
      ["0,0", { terrainId: "terrain-open" }],
      ["0,-1", { terrainId: "terrain-open" }],
      ["1,-1", { terrainId: "terrain-forest" }],
    ]);
    expect(connectedTerrainDirections({ q: 0, r: 0 }, "terrain-open", index)).toEqual([0]);
    expect(terrainBoundaryDirections({ q: 0, r: 0 }, "terrain-open", index)).toEqual([1]);
    expect(exposedMapDirections({ q: 0, r: 0 }, index)).toEqual([2, 3, 4, 5]);
  });
});

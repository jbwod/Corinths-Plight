import { describe, expect, it } from "vitest";
import { ADMIN_MAP_TERRAIN_VOCABULARY } from "../packages/rules-engine/src/admin-map-domain";

import {
  TACTICAL_VISUAL_TERRAIN_PROFILES,
  connectedTerrainDirections,
  exposedMapDirections,
  isTacticalWaterTerrain,
  tacticalTerrainKind,
  tacticalTerrainLabel,
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
    expect(tacticalTerrainKind("terrain-open", "ARID_DESERT")).toBe("ARID");
    expect(tacticalTerrainKind("terrain-open", "COLD_GLACIER")).toBe("COLD");
    expect(tacticalTerrainKind("terrain-forest", "LOWLANDS_URBAN")).toBe("URBAN");
    expect(tacticalTerrainKind("terrain-open", "FORESTS_GLADE")).toBe("OPEN");
    expect(tacticalTerrainKind("terrain-forest", "COLD_TAIGA")).toBe("FOREST");
    expect(tacticalTerrainKind("terrain-open", "WATER_COAST")).toBe("WATER_SHALLOW");
    expect(tacticalTerrainKind("terrain-open", "WATER_DEEP")).toBe("WATER_DEEP");
    expect(tacticalTerrainKind("terrain-beach", "WATER_COAST_BEACH")).toBe("ARID");
    expect(isTacticalWaterTerrain("terrain-open", "WATER_OCEAN")).toBe(true);
    expect(isTacticalWaterTerrain("terrain-open", "WATER_FROZEN_LAKE")).toBe(true);
    expect(isTacticalWaterTerrain("terrain-beach", "WATER_COAST_BEACH")).toBe(false);
  });

  it("covers every pinned @2 visual biome with an explicit presentation profile", () => {
    expect(Object.keys(TACTICAL_VISUAL_TERRAIN_PROFILES).sort()).toEqual(
      ADMIN_MAP_TERRAIN_VOCABULARY.map((entry) => entry.id).sort(),
    );
    expect(tacticalTerrainLabel("terrain-open", "HIGHLANDS_MOUNTAIN_PEAK")).toBe("Mountain Peak");
    expect(TACTICAL_VISUAL_TERRAIN_PROFILES.LOWLANDS_FARMLAND.motif).not.toBe(
      TACTICAL_VISUAL_TERRAIN_PROFILES.LOWLANDS_GRASSLAND.motif,
    );
    expect(TACTICAL_VISUAL_TERRAIN_PROFILES.WATER_RAPIDS.motif).not.toBe(
      TACTICAL_VISUAL_TERRAIN_PROFILES.WATER_COAST.motif,
    );
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

  it("treats an authored water neighbour as coastline without outlining water as land", () => {
    const index = new Map([
      ["0,0", { terrainId: "terrain-open", visualTerrainId: "LOWLANDS_GRASSLAND" }],
      ["0,-1", { terrainId: "terrain-open", visualTerrainId: "WATER_COAST" }],
    ]);
    expect(exposedMapDirections({ q: 0, r: 0 }, index)).toContain(0);
    expect(exposedMapDirections({ q: 0, r: -1 }, index)).toEqual([]);
    expect(terrainBoundaryDirections(
      { q: 0, r: 0 },
      "terrain-open",
      index,
      "LOWLANDS_GRASSLAND",
    )).toContain(0);
  });

  it("keeps frozen water hydrographic while treating beach as land", () => {
    const frozen = new Map([
      ["0,0", { terrainId: "terrain-open", visualTerrainId: "LOWLANDS_GRASSLAND" }],
      ["0,-1", { terrainId: "terrain-frozen-lake", visualTerrainId: "WATER_FROZEN_LAKE" }],
    ]);
    expect(exposedMapDirections({ q: 0, r: 0 }, frozen)).toContain(0);
    expect(exposedMapDirections({ q: 0, r: -1 }, frozen)).toEqual([]);

    const beach = new Map([
      ["0,0", { terrainId: "terrain-beach", visualTerrainId: "WATER_COAST_BEACH" }],
      ["0,-1", { terrainId: "terrain-shallow-water", visualTerrainId: "WATER_COAST" }],
    ]);
    expect(exposedMapDirections({ q: 0, r: 0 }, beach)).toContain(0);
  });
});

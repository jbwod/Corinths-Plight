import { describe, expect, it } from "vitest";

import {
  ADMIN_MAP_EDGE_FEATURE_VOCABULARY,
  ADMIN_MAP_POINT_FEATURE_VOCABULARY,
  ADMIN_MAP_PRESETS,
  ADMIN_MAP_TERRAIN_VOCABULARY,
  adminMapContentHash,
  analyzeAdminMapTopology,
  exportAdminMap,
  generateAdminMap,
  importAdminMap,
  validateAdminMap,
  type AdminMapDocumentV1,
  type AdminMapPresetId,
} from "../src";

function mutableDocument(document: AdminMapDocumentV1): Record<string, unknown> {
  return JSON.parse(exportAdminMap(document)) as Record<string, unknown>;
}

describe("versioned deterministic admin map generation", () => {
  it("replays exactly for an equal seed and changes content for another seed", () => {
    const options = { preset: "MIXED" as const, seed: "gm-preview-17", width: 30, height: 20 };
    const first = generateAdminMap(options);
    const repeated = generateAdminMap(options);
    const changed = generateAdminMap({ ...options, seed: "gm-preview-18" });

    expect(repeated).toEqual(first);
    expect(exportAdminMap(repeated)).toBe(exportAdminMap(first));
    expect(changed.hash).not.toBe(first.hash);
    expect(changed.cells).not.toEqual(first.cells);
  });

  it.each(ADMIN_MAP_PRESETS)("generates valid %s content with connected water", (preset) => {
    const document = generateAdminMap({ preset, seed: `preset:${preset}`, width: 32, height: 22 });
    const topology = analyzeAdminMapTopology(document.cells);

    expect(validateAdminMap(document)).toBe(document);
    expect(document.cells).toHaveLength(document.width * document.height);
    expect(topology.landCellCount).toBeGreaterThan(0);
    expect(topology.waterCellCount).toBeGreaterThan(0);
    expect(topology.waterComponents).toBe(1);
    expect(topology.landComponents).toBe(preset === "ISLANDS" ? 3 : 1);
    expect(document.topology.land).toBe(preset === "ISLANDS" ? "ARCHIPELAGO" : "CONTIGUOUS");
    expect(document.cells
      .filter((cell) => cell.q === 0 || cell.q === document.width - 1 || cell.r === 0 || cell.r === document.height - 1)
      .every((cell) => cell.terrainGroup === "WATER")).toBe(true);
    expect(document.pointFeatures.length).toBeGreaterThan(0);
    expect(document.edgeFeatures.length).toBeGreaterThan(0);
  });

  it("round-trips canonical JSON and its SHA-256 content hash", () => {
    const generated = generateAdminMap({
      preset: "DESERT_CONTINENT",
      seed: "roundtrip-map",
      width: 24,
      height: 18,
    });
    const serialized = exportAdminMap(generated);
    const imported = importAdminMap(serialized);

    expect(exportAdminMap(imported)).toBe(serialized);
    expect(imported).toEqual(generated);
    expect(imported.hash).toBe(adminMapContentHash(imported));
    expect(serialized.startsWith('{"cells":')).toBe(true);
  });

  it("fails closed for malformed, unknown, tampered, and non-canonical content", () => {
    const generated = generateAdminMap({ preset: "ICY", seed: "validation-map", width: 20, height: 16 });
    const unknownField = mutableDocument(generated);
    unknownField.clientOverride = true;
    expect(() => validateAdminMap(unknownField)).toThrow(/must contain exactly/i);

    const tampered = mutableDocument(generated);
    const tamperedCells = tampered.cells as Array<Record<string, unknown>>;
    tamperedCells[0]!.visualBiomeId = "ARID_DESERT";
    expect(() => validateAdminMap(tampered)).toThrow(/does not match|hash/i);

    const inventedMechanics = mutableDocument(generated);
    const cells = inventedMechanics.cells as Array<Record<string, unknown>>;
    const governedCell = cells.find((cell) => cell.mechanicalTerrainProfileId !== "terrain-open")!;
    governedCell.mechanicalTerrainProfileId = "terrain-open";
    expect(() => validateAdminMap(inventedMechanics)).toThrow(/does not match the visual biome definition/i);

    const unsupportedVersion = mutableDocument(generated);
    unsupportedVersion.schemaVersion = 2;
    expect(() => validateAdminMap(unsupportedVersion)).toThrow(/unsupported schema version/i);
    expect(() => importAdminMap("not-json")).toThrow(/not valid JSON/i);
  });

  it("publishes an explicit mechanical profile for every visual and feature", () => {
    const published = ADMIN_MAP_TERRAIN_VOCABULARY.filter((entry) => entry.mechanicsStatus === "PUBLISHED");

    expect(published).toHaveLength(ADMIN_MAP_TERRAIN_VOCABULARY.length);
    expect(published.every((entry) => entry.mechanicalTerrainProfileId !== null)).toBe(true);
    expect(ADMIN_MAP_TERRAIN_VOCABULARY.every((entry) => entry.mechanicsStatus === "PUBLISHED")).toBe(true);
    expect(new Set(ADMIN_MAP_TERRAIN_VOCABULARY.map((entry) => entry.group))).toEqual(new Set([
      "LOWLANDS",
      "FORESTS",
      "WETLANDS",
      "HIGHLANDS",
      "ARID",
      "COLD",
      "WATER",
    ]));
    expect(ADMIN_MAP_POINT_FEATURE_VOCABULARY.map((entry) => entry.id)).toEqual([
      "CITY",
      "AIRFIELD",
      "TOWN",
      "OUTPOST",
      "RADAR",
      "TRENCH",
    ]);
    expect(ADMIN_MAP_EDGE_FEATURE_VOCABULARY.map((entry) => entry.id)).toEqual([
      "ROAD",
      "PATH",
      "RIVER",
      "WALL",
      "BRIDGE",
    ]);
    expect(ADMIN_MAP_POINT_FEATURE_VOCABULARY.every((entry) =>
      entry.mechanicsStatus === "PUBLISHED" && entry.mechanicalFeatureId !== null)).toBe(true);
    expect(ADMIN_MAP_EDGE_FEATURE_VOCABULARY.filter((entry) => entry.mechanicsStatus === "PUBLISHED"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "ROAD", mechanicalFeatureId: "edge-road@1" }),
        expect.objectContaining({ id: "PATH", mechanicalFeatureId: "edge-path@1" }),
        expect.objectContaining({ id: "RIVER", mechanicalFeatureId: "edge-river-crossing@1" }),
        expect.objectContaining({ id: "WALL", mechanicalFeatureId: "edge-wall@1" }),
        expect.objectContaining({ id: "BRIDGE", mechanicalFeatureId: "structure-bridge" }),
      ]));
    expect(ADMIN_MAP_EDGE_FEATURE_VOCABULARY.every((entry) =>
      entry.mechanicsStatus === "PUBLISHED" && entry.mechanicalFeatureId !== null)).toBe(true);
  });

  it("contains every requested visual terrain label in its assigned group", () => {
    const labelsByGroup = new Map<string, Set<string>>();
    for (const entry of ADMIN_MAP_TERRAIN_VOCABULARY) {
      const labels = labelsByGroup.get(entry.group) ?? new Set<string>();
      labels.add(entry.label.toLowerCase());
      labelsByGroup.set(entry.group, labels);
    }
    const requested: Readonly<Record<string, readonly string[]>> = {
      LOWLANDS: ["lowlands", "plains", "grassland", "meadow", "valley", "heath", "savanna", "steppe"],
      FORESTS: ["forest", "dense forest", "jungle", "glade"],
      WETLANDS: ["wetlands", "swamp", "marsh", "bog"],
      HIGHLANDS: ["highlands", "hill", "crag", "mountain", "mountain peak", "volcano"],
      ARID: ["arid", "desert", "badlands", "canyon", "crater"],
      COLD: ["cold", "tundra", "glacier"],
      WATER: [
        "water",
        "open water",
        "ocean",
        "deep ocean",
        "sea",
        "fresh water",
        "lake",
        "pond",
        "frozen lake",
        "rapids",
        "coastal",
        "coast-beach",
      ],
    };
    for (const [group, labels] of Object.entries(requested)) {
      for (const label of labels) expect(labelsByGroup.get(group), `${group}/${label}`).toContain(label);
    }
  });

  it.each([
    { preset: "MIXED" as AdminMapPresetId, seed: "", message: /seed/i },
    { preset: "MIXED" as AdminMapPresetId, seed: "map", width: 4, message: /width/i },
    { preset: "MIXED" as AdminMapPresetId, seed: "map", height: 200, message: /height/i },
  ])("rejects invalid generation options: $message", (options) => {
    expect(() => generateAdminMap(options)).toThrow(options.message);
  });
});

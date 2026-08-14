import { describe, expect, it } from "vitest";
import { generateAdminMap } from "../packages/rules-engine/src";
import {
  canonicalAdminMapEdge,
  removeAdminMapEdgeFeature,
  removeAdminMapPointFeature,
  upsertAdminMapEdgeFeature,
  upsertAdminMapPointFeature,
} from "./game-master-map-editor";

function map() {
  return generateAdminMap({ preset: "MIXED", seed: "gm-editor-test", width: 18, height: 14 });
}

describe("Game Master map feature editor", () => {
  it("places, edits, and removes point features while recomputing the canonical hash", () => {
    const original = map();
    const land = original.cells.find((cell) =>
      cell.terrainGroup !== "WATER" &&
      !original.pointFeatures.some((feature) => feature.q === cell.q && feature.r === cell.r))!;
    const created = upsertAdminMapPointFeature(original, {
      featureId: "TRENCH",
      q: land.q,
      r: land.r,
    });

    expect(created.feature).toMatchObject({
      featureId: "TRENCH",
      mechanicalFeatureId: "structure-trench",
      mechanicsStatus: "PUBLISHED",
    });
    expect(created.document.hash).not.toBe(original.hash);

    const edited = upsertAdminMapPointFeature(created.document, {
      id: created.feature.id,
      featureId: "RADAR",
      q: land.q,
      r: land.r,
    });
    expect(edited.feature).toMatchObject({
      id: created.feature.id,
      featureId: "RADAR",
      mechanicalFeatureId: "feature-radar@1",
      mechanicsStatus: "PUBLISHED",
    });
    expect(removeAdminMapPointFeature(edited.document, edited.feature.id).pointFeatures)
      .toHaveLength(original.pointFeatures.length);
  });

  it("canonicalizes reverse edge selection before editing", () => {
    const original = map();
    const existing = original.edgeFeatures.find((feature) => feature.featureId === "PATH")!;
    const reverseDirection = ((existing.direction + 3) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
    const deltas = [
      { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
      { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 },
    ] as const;
    const target = {
      q: existing.q + deltas[existing.direction].q,
      r: existing.r + deltas[existing.direction].r,
    };

    expect(canonicalAdminMapEdge(original, target.q, target.r, reverseDirection)).toEqual({
      q: existing.q,
      r: existing.r,
      direction: existing.direction,
    });

    const edited = upsertAdminMapEdgeFeature(original, {
      id: existing.id,
      featureId: "ROAD",
      q: target.q,
      r: target.r,
      direction: reverseDirection,
    });
    expect(edited.feature).toMatchObject({
      id: existing.id,
      featureId: "ROAD",
      q: existing.q,
      r: existing.r,
      direction: existing.direction,
      mechanicsStatus: "PUBLISHED",
    });
  });

  it("refuses removal that would leave a bridge without its governed road and river", () => {
    const original = map();
    const bridge = original.edgeFeatures.find((feature) => feature.featureId === "BRIDGE")!;
    const road = original.edgeFeatures.find((feature) =>
      feature.featureId === "ROAD" && feature.q === bridge.q && feature.r === bridge.r &&
      feature.direction === bridge.direction,
    )!;

    expect(() => removeAdminMapEdgeFeature(original, road.id))
      .toThrow(/bridge .* requires a river and road\/path/i);
  });
});

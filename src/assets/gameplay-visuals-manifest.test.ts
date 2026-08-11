import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EQUIPMENT_VISUALS } from "../equipment-visuals";
import { UNIT_VISUALS } from "../unit-visuals";
import manifest from "./gameplay-visuals.manifest.json";

describe("gameplay visual asset manifest", () => {
  it("matches every active registry key", () => {
    const registered = [
      ...UNIT_VISUALS.map((visual) => visual.assetKey),
      ...EQUIPMENT_VISUALS.map((visual) => visual.assetKey),
    ].sort();
    const active = manifest.assets
      .filter((asset) => asset.status === "ACTIVE")
      .map((asset) => asset.key)
      .sort();

    expect(active).toEqual(registered);
  });

  it("records the exact SHA-256 of every generated file", () => {
    for (const asset of manifest.assets) {
      const digest = createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), asset.path)))
        .digest("hex");
      expect(digest, asset.path).toBe(asset.sha256);
    }
  });
});

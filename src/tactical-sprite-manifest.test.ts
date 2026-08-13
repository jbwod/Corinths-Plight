import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { UNIT_VISUALS } from "./unit-visuals";
import {
  ACTIVE_TACTICAL_SPRITE_ASSETS,
  findActiveTacticalSpriteAsset,
} from "./tactical-sprite-manifest";
import mechProvenance from "./assets/tactical-sprites/mech-sprite-provenance.json";

describe("tactical sprite manifest", () => {
  it("is the explicit one-to-one allowlist for every catalogued unit", () => {
    expect(ACTIVE_TACTICAL_SPRITE_ASSETS.map((asset) => asset.definitionId).sort()).toEqual(
      UNIT_VISUALS.map((visual) => visual.definitionId).sort(),
    );
    expect(new Set(ACTIVE_TACTICAL_SPRITE_ASSETS.map((asset) => asset.definitionId)).size).toBe(
      ACTIVE_TACTICAL_SPRITE_ASSETS.length,
    );
    expect(new Set(ACTIVE_TACTICAL_SPRITE_ASSETS.map((asset) => asset.revisionId)).size).toBe(
      ACTIVE_TACTICAL_SPRITE_ASSETS.length,
    );
  });

  it("does not use wildcard discovery or import inactive mech revisions", () => {
    const source = readFileSync(resolve(process.cwd(), "src/tactical-sprite-manifest.ts"), "utf8");
    expect(source).not.toContain("import.meta.glob");

    const inactiveMechRevisions = mechProvenance.assets
      .filter((asset) => asset.status !== "ACTIVE")
      .map((asset) => asset.revisionId);
    for (const revisionId of inactiveMechRevisions) {
      expect(source, revisionId).not.toContain(`generated/${revisionId}.png`);
    }
  });

  it("activates only the three QA-passed mech revisions", () => {
    const activeMechs = mechProvenance.assets.filter((asset) => asset.status === "ACTIVE");
    expect(activeMechs).toHaveLength(3);
    for (const asset of activeMechs) {
      expect(asset.visualQa).toBe("PASS");
      expect(findActiveTacticalSpriteAsset(asset.definitionId)?.revisionId).toBe(asset.revisionId);
    }
  });

  it("records exact hashes for every declared mech asset", () => {
    for (const asset of mechProvenance.assets) {
      const digest = createHash("sha256")
        .update(readFileSync(resolve(process.cwd(), asset.path)))
        .digest("hex");
      expect(digest, asset.path).toBe(asset.sha256);

      if ("chromaPath" in asset && asset.chromaPath) {
        const chromaDigest = createHash("sha256")
          .update(readFileSync(resolve(process.cwd(), asset.chromaPath)))
          .digest("hex");
        expect(chromaDigest, asset.chromaPath).toBe(asset.chromaSha256);
      }
    }
  });
});

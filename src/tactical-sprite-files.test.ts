import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ACTIVE_TACTICAL_SPRITE_ASSETS } from "./tactical-sprite-manifest";
import mechProvenance from "./assets/tactical-sprites/mech-sprite-provenance.json";
import swarmProvenance from "./assets/tactical-sprites/swarm-sprite-provenance.json";

function readPngDimensions(path: string): { width: number; height: number; bitDepth: number; colourType: number } {
  const png = readFileSync(resolve(process.cwd(), path));
  const ascii = (start: number, end: number) => String.fromCharCode(...png.subarray(start, end));
  const uint32 = (offset: number) =>
    (((png[offset] ?? 0) * 0x1000000) +
      ((png[offset + 1] ?? 0) << 16) +
      ((png[offset + 2] ?? 0) << 8) +
      (png[offset + 3] ?? 0)) >>>
    0;

  expect(ascii(1, 4), path).toBe("PNG");
  expect(ascii(12, 16), path).toBe("IHDR");
  return {
    width: uint32(16),
    height: uint32(20),
    bitDepth: png[24] ?? -1,
    colourType: png[25] ?? -1,
  };
}

describe("tactical sprite files", () => {
  it("keeps every runtime sheet on the six-frame RGBA contract", () => {
    for (const asset of ACTIVE_TACTICAL_SPRITE_ASSETS) {
      const path = `src/assets/tactical-sprites/generated/${asset.revisionId}.png`;
      expect(readPngDimensions(path)).toEqual({
        width: 1536,
        height: 256,
        bitDepth: 8,
        colourType: 6,
      });
    }
  });

  it("declares every generated mech revision in provenance", () => {
    const generatedMechRevisions = readdirSync(resolve(process.cwd(), "src/assets/tactical-sprites/generated"))
      .filter((name) => /^unit-(light|medium|heavy)-mech(?:-v\d+)?\.png$/.test(name))
      .map((name) => name.replace(/\.png$/, ""))
      .sort();
    const declaredGeneratedRevisions = mechProvenance.assets
      .filter((asset) => asset.path.startsWith("src/assets/tactical-sprites/generated/"))
      .map((asset) => asset.revisionId)
      .sort();
    expect(declaredGeneratedRevisions).toEqual(generatedMechRevisions);
  });

  it("declares every rejected mech render in quarantine provenance", () => {
    const quarantinedFiles = readdirSync(resolve(process.cwd(), "src/assets/tactical-sprites/quarantine"))
      .filter((name) => name.endsWith(".png"))
      .sort();
    const declaredQuarantinedFiles = mechProvenance.assets
      .filter((asset) => asset.status === "QUARANTINED")
      .map((asset) => asset.path.split("/").at(-1) ?? "")
      .sort();
    expect(declaredQuarantinedFiles).toEqual(quarantinedFiles);
  });

  it("declares every generated Bug Swarm sheet and retained RGBA source", () => {
    const generatedEnemyRevisions = readdirSync(resolve(process.cwd(), "src/assets/tactical-sprites/generated"))
      .filter((name) => /^enemy-bug-.+\.png$/.test(name))
      .map((name) => name.replace(/\.png$/, ""))
      .sort();
    const declaredEnemyRevisions = swarmProvenance.assets
      .map((asset) => asset.definitionId)
      .sort();
    expect(generatedEnemyRevisions).toEqual(declaredEnemyRevisions);

    for (const asset of swarmProvenance.assets) {
      expect(readPngDimensions(asset.sourcePath).colourType, asset.sourcePath).toBe(6);
    }
  });
});

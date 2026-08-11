import { describe, expect, it } from "vitest";

import catalogue from "../rules/catalogue/v5-core-curated@2/catalogue.json";
import {
  TACTICAL_UNIT_GLYPH_PATHS,
  UNIT_VISUALS,
  findUnitVisual,
  resolveUnitVisual,
} from "./unit-visuals";

describe("unit visual registry", () => {
  it("covers every canonical non-orbital unit with a stable asset and tactical glyph", () => {
    expect(UNIT_VISUALS.map((visual) => visual.definitionId).sort()).toEqual(
      [...catalogue.content.canonicalUnitIds].sort(),
    );
    expect(new Set(UNIT_VISUALS.map((visual) => visual.assetKey)).size).toBe(UNIT_VISUALS.length);

    for (const visual of UNIT_VISUALS) {
      expect(visual.artSrc).toMatch(/\.png$/);
      expect(visual.shortCode).toMatch(/^[A-Z]{3}$/);
      expect(TACTICAL_UNIT_GLYPH_PATHS[visual.tacticalGlyph]).not.toHaveLength(0);
    }
  });

  it("resolves retained class aliases to the canonical visual", () => {
    expect(findUnitVisual("unit-combat-engineers")?.definitionId).toBe("unit-engineers");
    expect(findUnitVisual("unit-light-artillery")?.definitionId).toBe("unit-artillery");
    expect(findUnitVisual("unit-logistics-vehicle")?.definitionId).toBe("unit-logi-truck");
    expect(findUnitVisual("unit-heavy-aerospace-transport")?.definitionId).toBe("unit-heavy-air-transport");
  });

  it("fails visibly to a code-native tactical glyph when no portrait is registered", () => {
    const enemy = resolveUnitVisual({ definitionId: "enemy-unknown", side: "ENEMY" });
    expect(enemy.artSrc).toBeUndefined();
    expect(enemy.tacticalGlyph).toBe("BIOLOGICAL");
    expect(TACTICAL_UNIT_GLYPH_PATHS[enemy.tacticalGlyph]).not.toHaveLength(0);
  });
});

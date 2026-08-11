import { describe, expect, it } from "vitest";

import catalogue from "../rules/catalogue/v5-core-curated@2/catalogue.json";
import { EQUIPMENT_VISUALS, findEquipmentVisual } from "./equipment-visuals";

describe("equipment visual registry", () => {
  it("covers every authoritative equipment definition", () => {
    expect(EQUIPMENT_VISUALS.map((visual) => visual.definitionId).sort()).toEqual(
      catalogue.content.equipment.map((definition) => definition.id).sort(),
    );
    expect(new Set(EQUIPMENT_VISUALS.map((visual) => visual.assetKey)).size).toBe(
      EQUIPMENT_VISUALS.length,
    );
  });

  it("exposes a game-ready image and accessible label for every item", () => {
    for (const visual of EQUIPMENT_VISUALS) {
      expect(visual.artSrc).toMatch(/\.png$/);
      expect(visual.label.trim()).not.toHaveLength(0);
      expect(visual.slot.trim()).not.toHaveLength(0);
      expect(findEquipmentVisual(visual.definitionId)).toBe(visual);
    }
  });

  it("uses the cleaner second Silent SMGs composition", () => {
    expect(findEquipmentVisual("equipment-silent-smgs")?.artSrc).toContain("silent-smgs-v2");
  });
});

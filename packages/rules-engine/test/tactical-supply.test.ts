import {
  TACTICAL_SUPPLY_RESOURCE_IDS,
  isTacticalSupplyResourceId,
  parseTacticalSupplyResourceId,
} from "../../domain/src";
import { describe, expect, it } from "vitest";
import {
  normalizeTacticalSupplyInventory,
  validateSupplyInventory,
} from "../src";

describe("canonical tactical supply resources", () => {
  it("defines the exact D1 tactical vocabulary", () => {
    expect(TACTICAL_SUPPLY_RESOURCE_IDS).toEqual([
      "SMALL_SUPPLY",
      "MEDIUM_SUPPLY",
      "LARGE_SUPPLY",
      "MEDICAL_SUPPLY",
      "MAIN_AMMUNITION",
    ]);
    for (const resourceId of TACTICAL_SUPPLY_RESOURCE_IDS) {
      expect(isTacticalSupplyResourceId(resourceId)).toBe(true);
      expect(parseTacticalSupplyResourceId(resourceId)).toBe(resourceId);
    }
  });

  it.each(["SMALL", "MEDIUM", "LARGE"])(
    "rejects the ambiguous strategic size %s instead of appending a suffix",
    (value) => {
      expect(() => parseTacticalSupplyResourceId(value)).toThrowError(
        expect.objectContaining({
          code: "TACTICAL_SUPPLY_RESOURCE_ID_AMBIGUOUS",
        }),
      );
    },
  );

  it("rejects aliases and non-canonical casing rather than translating them", () => {
    expect(() => parseTacticalSupplyResourceId("small_supply")).toThrowError(
      expect.objectContaining({
        code: "TACTICAL_SUPPLY_RESOURCE_ID_NOT_CANONICAL",
      }),
    );
    expect(() => parseTacticalSupplyResourceId("MEDICAL")).toThrowError(
      expect.objectContaining({
        code: "TACTICAL_SUPPLY_RESOURCE_ID_UNKNOWN",
      }),
    );
  });
});

describe("tactical supply inventory normalization", () => {
  it("copies an exact inventory in canonical resource order", () => {
    expect(normalizeTacticalSupplyInventory({ MAIN_AMMUNITION: 2, SMALL_SUPPLY: 4 })).toEqual({
      SMALL_SUPPLY: 4,
      MAIN_AMMUNITION: 2,
    });
  });

  it("fails closed on legacy keys and invalid quantities", () => {
    expect(() => normalizeTacticalSupplyInventory({ SMALL: 4 })).toThrowError(
      expect.objectContaining({
        code: "TACTICAL_SUPPLY_RESOURCE_ID_AMBIGUOUS",
      }),
    );
    expect(() => normalizeTacticalSupplyInventory({ SMALL_SUPPLY: 1.5 })).toThrowError(
      expect.objectContaining({
        code: "TACTICAL_SUPPLY_QUANTITY_INVALID",
        path: "$.SMALL_SUPPLY",
      }),
    );
  });

  it("makes logistics validation reject legacy inventory keys at runtime", () => {
    expect(
      validateSupplyInventory(
        {
          id: "logistics",
          capacities: { SMALL_SUPPLY: 5 },
          retainExistingOverCapacity: false,
          transferableTypes: ["SMALL_SUPPLY"],
        },
        { SMALL: 1 } as never,
        1,
      ),
    ).toMatchObject({
      legal: false,
      reasons: ["SMALL is not a canonical tactical supply resource identifier."],
    });
  });
});

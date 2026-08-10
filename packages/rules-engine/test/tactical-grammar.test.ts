import { describe, expect, it } from "vitest";

import {
  getTacticalActionRule,
  getTacticalOrderRule,
} from "../src/tactical-grammar";
import { V5_CORE_CURATED_2_CONTENT_HASH } from "../src/generated/v5-core-curated-2";

describe("generated tactical grammar", () => {
  it("drives the executable foundation order and action set", () => {
    expect(["HOLD", "ADVANCE", "RUSH"].map((type) =>
      getTacticalOrderRule(type as "HOLD" | "ADVANCE" | "RUSH").executable,
    )).toEqual([true, true, true]);
    expect(getTacticalOrderRule("EVASIVE").executable).toBe(false);

    expect(getTacticalActionRule("ATTACK")).toMatchObject({
      id: "action-attack",
      economy: "STANDARD",
      speedCost: 0,
      usesAttack: true,
      executable: true,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    });
    expect(getTacticalActionRule("RELOAD")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("LOAD")).toMatchObject({ speedCost: 0.5, executable: true });
    expect(getTacticalActionRule("UNLOAD")).toMatchObject({ speedCost: 0.5, executable: true });
  });

  it("keeps catalogue-only mechanics out of live orders", () => {
    expect(getTacticalActionRule("SCAN").executable).toBe(false);
    expect(getTacticalActionRule("DEPLOY_DRONE").executable).toBe(false);
    expect(getTacticalActionRule("HEAL").executable).toBe(false);
    expect(getTacticalActionRule("BOMBARDMENT").executable).toBe(false);
    expect(() => getTacticalActionRule("AIR_SUPPORT")).toThrow("Unknown action type: AIR_SUPPORT");
  });
});

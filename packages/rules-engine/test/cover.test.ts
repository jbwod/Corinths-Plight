import { describe, expect, it } from "vitest";

import { INFANTRY_COVER_ARMOR_1, resolveTacticalCover } from "../src/cover";
import { makeDeployment, makeHex } from "./fixtures";

describe("generated tactical cover", () => {
  const attacker = makeDeployment("attacker", { q: 0, r: 0 });

  it("grants one non-stacking Armor from forest, building, or governed structure cover", () => {
    const target = makeDeployment("infantry", { q: 1, r: 0 }, "ENEMY", {
      tags: ["GROUND", "PERSONNEL", "INFANTRY"],
    });
    const forestBuilding = makeHex(1, 0, {
      terrainId: "terrain-forest",
      structureIds: ["structure-trench:campaign-1"],
      environment: [INFANTRY_COVER_ARMOR_1],
    });

    expect(resolveTacticalCover(attacker, target, [makeHex(0, 0), forestBuilding])).toEqual({
      armor: 1,
      sources: [INFANTRY_COVER_ARMOR_1, "structure-trench", "terrain-forest"],
    });
  });

  it("does not protect vehicles, co-located attackers, or open-ground personnel", () => {
    const vehicle = makeDeployment("vehicle", { q: 1, r: 0 }, "ENEMY", {
      tags: ["GROUND", "VEHICLE"],
      stats: { healthModel: "HITS" },
    });
    const infantry = makeDeployment("infantry", { q: 1, r: 0 }, "ENEMY", {
      tags: ["GROUND", "PERSONNEL", "INFANTRY"],
    });
    const forest = makeHex(1, 0, { terrainId: "terrain-forest" });

    expect(resolveTacticalCover(attacker, vehicle, [forest]).armor).toBe(0);
    expect(resolveTacticalCover({ ...attacker, position: { q: 1, r: 0 } }, infantry, [forest]).armor).toBe(0);
    expect(resolveTacticalCover(attacker, infantry, [makeHex(1, 0)]).armor).toBe(0);
  });
});

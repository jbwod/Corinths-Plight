import { describe, expect, it } from "vitest";
import { getEnemyDoctrineProfile } from "../src/enemy-doctrine";

describe("published enemy doctrine", () => {
  it("materialises the authored Bug roles without class switches", () => {
    expect(getEnemyDoctrineProfile("enemy-bug-drone")).toEqual({
      schemaVersion: 1,
      definitionId: "enemy-bug-drone",
      factionId: "bug-swarm",
      preferredTargets: ["PERSONNEL"],
      preferredOrderTypes: ["ADVANCE", "RUSH", "MELEE_CHARGE"],
      aggression: 1,
      role: null,
      vehiclePriority: false,
    });
    expect(getEnemyDoctrineProfile("enemy-bug-heavy")).toMatchObject({
      preferredTargets: ["VEHICLE", "OBJECTIVE"],
      preferredOrderTypes: ["ADVANCE", "HOLD"],
      aggression: 0.8,
      vehiclePriority: true,
    });
  });

  it("fails closed when a deployment references no published enemy definition", () => {
    expect(() => getEnemyDoctrineProfile("enemy-not-published")).toThrow(
      "ENEMY_DOCTRINE_MISSING:enemy-not-published",
    );
  });
});

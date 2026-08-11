import { describe, expect, it } from "vitest";

import { resolveSimultaneousMovement } from "../src/movement";
import { getTacticalUnitClass } from "../src/tactical-unit-catalogue";
import { makeDeployment, makeHex, makeOrder } from "./fixtures";

describe("distance-increment simultaneous movement", () => {
  it("stops opposing blocking ground units before the same empty position", () => {
    const allied = makeDeployment("allied", { q: -1, r: 0 }, "ALLIED");
    const enemy = makeDeployment("enemy", { q: 0, r: -1 }, "ENEMY");
    const destination = makeHex(0, 0, { capacity: 3 });
    const alliedOrder = makeOrder(allied, { route: [allied.position, destination.coord], endHex: destination.coord });
    const enemyOrder = makeOrder(enemy, { route: [enemy.position, destination.coord], endHex: destination.coord });

    const outcomes = resolveSimultaneousMovement(
      [enemyOrder, alliedOrder],
      [allied, enemy],
      [makeHex(-1, 0), makeHex(0, -1), destination],
    );

    expect(outcomes).toEqual([
      expect.objectContaining({ unitId: "allied", to: allied.position, block: expect.objectContaining({ reason: "HOSTILE_ROUTE_CONTEST", distanceIncrement: 1 }) }),
      expect.objectContaining({ unitId: "enemy", to: enemy.position, block: expect.objectContaining({ reason: "HOSTILE_ROUTE_CONTEST", distanceIncrement: 1 }) }),
    ]);
  });

  it("commits the legal route prefix before an occupied hostile position", () => {
    const mover = makeDeployment("mover", { q: -2, r: 0 }, "ALLIED");
    const hostile = makeDeployment("hostile", { q: 0, r: 0 }, "ENEMY");
    const order = makeOrder(mover, {
      route: [mover.position, { q: -1, r: 0 }, hostile.position],
      endHex: hostile.position,
    });

    expect(resolveSimultaneousMovement(
      [order],
      [mover, hostile],
      [makeHex(-2, 0), makeHex(-1, 0), makeHex(0, 0)],
    )[0]).toEqual(expect.objectContaining({
      to: { q: -1, r: 0 },
      traversedRoute: [{ q: -2, r: 0 }, { q: -1, r: 0 }],
      block: { at: { q: 0, r: 0 }, reason: "HOSTILE_FORMATION", distanceIncrement: 2 },
    }));
  });

  it("uses quarter-distance arrival timing so the earlier formation claims the position", () => {
    const fast = makeDeployment("fast", { q: -1, r: 0 }, "ALLIED");
    const slow = makeDeployment("slow", { q: 0, r: -1 }, "ENEMY");
    const fastStart = makeHex(-1, 0, { edges: { roads: [2], rivers: [] } });
    const slowStart = makeHex(0, -1);
    const destination = makeHex(0, 0, { capacity: 2 });
    const fastOrder = makeOrder(fast, { route: [fast.position, destination.coord], endHex: destination.coord });
    const slowOrder = makeOrder(slow, { route: [slow.position, destination.coord], endHex: destination.coord });

    const outcomes = resolveSimultaneousMovement(
      [fastOrder, slowOrder],
      [fast, slow],
      [fastStart, slowStart, destination],
    );

    expect(outcomes.find((outcome) => outcome.unitId === "fast")).toMatchObject({ to: destination.coord, block: undefined });
    expect(outcomes.find((outcome) => outcome.unitId === "slow")).toMatchObject({
      to: slow.position,
      block: { reason: "HOSTILE_FORMATION", distanceIncrement: 1 },
    });
  });

  it.each([
    ["unit-light-mech", "mech"],
    ["unit-vtol", "vtol"],
  ])("lets %s pass through an occupied hostile ground formation", (definitionId, deploymentId) => {
    const definition = getTacticalUnitClass(definitionId);
    const mover = makeDeployment(deploymentId, { q: -1, r: 0 }, "ALLIED", {
      definitionId: definition.id,
      tags: definition.tags,
      stats: definition.stats,
      weapons: definition.weapons,
    });
    const hostile = makeDeployment("hostile", { q: 0, r: 0 }, "ENEMY");
    const order = makeOrder(mover, {
      route: [mover.position, hostile.position, { q: 1, r: 0 }],
      endHex: { q: 1, r: 0 },
    });

    expect(resolveSimultaneousMovement(
      [order],
      [mover, hostile],
      [makeHex(-1, 0), makeHex(0, 0, { capacity: 1 }), makeHex(1, 0)],
    )[0]).toMatchObject({
      to: { q: 1, r: 0 },
      traversedRoute: [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }],
      block: undefined,
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolveInfantryStealthOrder } from "../src/infantry-stealth";
import { makeHex } from "./fixtures";

const map = Array.from({ length: 8 }, (_, q) => makeHex(q, 0));
const unit = {
  id: "spectre",
  side: "ALLIED" as const,
  status: "ACTIVE" as const,
  position: { q: 0, r: 0 },
};
const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];

describe("Infantry Stealth orders", () => {
  it("counts each hostile observer whose LOS is entered once and hides on meet-or-beat", () => {
    const observers = [
      { id: "enemy-a", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 3, r: 0 }, sensorRange: 3 },
      { id: "enemy-b", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 4, r: 0 }, sensorRange: 3 },
    ];

    expect(resolveInfantryStealthOrder({ unit, route, observers, map, roll: 2 })).toEqual({
      legal: true,
      detected: false,
      stealthBroken: false,
      observerIds: ["enemy-a", "enemy-b"],
      threshold: 2,
      roll: 2,
    });
    expect(resolveInfantryStealthOrder({ unit, route, observers, map, roll: 1 })).toMatchObject({
      legal: true,
      detected: true,
      stealthBroken: true,
      threshold: 2,
      roll: 1,
    });
  });

  it("does not count LOS confined to the starting hex and ignores allied, neutral, and inactive units", () => {
    const observers = [
      { id: "start-only", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 0, r: 0 }, sensorRange: 0 },
      { id: "friendly", side: "ALLIED" as const, status: "ACTIVE" as const, position: { q: 1, r: 0 }, sensorRange: 3 },
      { id: "neutral", side: "NEUTRAL" as const, status: "ACTIVE" as const, position: { q: 1, r: 0 }, sensorRange: 3 },
      { id: "destroyed", side: "ENEMY" as const, status: "DESTROYED" as const, position: { q: 1, r: 0 }, sensorRange: 3 },
    ];

    expect(resolveInfantryStealthOrder({ unit, route, observers, map })).toEqual({
      legal: true,
      detected: false,
      stealthBroken: false,
      observerIds: [],
      threshold: 0,
    });
  });

  it("breaks stealth on an attack or interaction while preserving ordinary endpoint LOS", () => {
    const observers = [
      { id: "near", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 3, r: 0 }, sensorRange: 2 },
      { id: "far", side: "ENEMY" as const, status: "ACTIVE" as const, position: { q: 7, r: 0 }, sensorRange: 1 },
    ];

    expect(resolveInfantryStealthOrder({ unit, route, observers, map, revealCause: "ATTACK" })).toEqual({
      legal: true,
      detected: true,
      stealthBroken: true,
      observerIds: ["near"],
    });
  });

  it("fails closed for malformed routes and invalid D6 results", () => {
    expect(resolveInfantryStealthOrder({
      unit,
      route: [{ q: 0, r: 0 }, { q: 2, r: 0 }],
      observers: [],
      map,
    })).toMatchObject({ legal: false, detected: true, stealthBroken: true });

    const observer = {
      id: "enemy",
      side: "ENEMY" as const,
      status: "ACTIVE" as const,
      position: { q: 2, r: 0 },
      sensorRange: 2,
    };
    expect(resolveInfantryStealthOrder({ unit, route, observers: [observer], map, roll: 7 })).toMatchObject({
      legal: false,
      detected: true,
      threshold: 1,
      reason: expect.stringMatching(/D6/),
    });
  });

  it("makes seven observers impossible to pass with the source-defined D6", () => {
    const observers = Array.from({ length: 7 }, (_, index) => ({
      id: `enemy-${index}`,
      side: "ENEMY" as const,
      status: "ACTIVE" as const,
      position: { q: 2, r: 0 },
      sensorRange: 2,
    }));

    expect(resolveInfantryStealthOrder({ unit, route, observers, map, roll: 6 })).toMatchObject({
      legal: true,
      detected: true,
      stealthBroken: true,
      threshold: 7,
      roll: 6,
    });
  });
});

import { describe, expect, it } from "vitest";
import { validateResolveStrategicMap, validateSubmitStrategicOrder } from "./strategic-validation";

const movement = {
  commandId: "strategic-move-0001",
  mapId: "strategic-map-corinth",
  expectedMapVersion: 4,
  expectedFormationVersion: 2,
  formation: { kind: "TASK_FORCE", id: "task-force-resolute" },
  destinationNodeId: "node-corinth-jump-point",
  intent: { type: "MOVE_TASK_FORCE" },
} as const;

describe("strategic command validation", () => {
  it("normalizes a bounded movement order", () => {
    expect(validateSubmitStrategicOrder(movement)).toEqual({
      valid: true,
      value: movement,
    });
  });

  it("rejects client-authored route, cost, supply, and authority fields", () => {
    for (const field of ["route", "travelRounds", "supplyCost", "approvedBy", "capabilities"]) {
      expect(validateSubmitStrategicOrder({ ...movement, [field]: [] })).toMatchObject({
        valid: false,
        code: "STRATEGIC_COMMAND_INVALID",
      });
    }
  });

  it("validates typed supply and deferred orbital shapes", () => {
    expect(
      validateSubmitStrategicOrder({
        ...movement,
        destinationNodeId: undefined,
        intent: {
          type: "TRANSFER_SUPPLY",
          supplySize: "LARGE",
          amount: 1,
          source: { kind: "SHIP", id: "ship-resolute" },
        destination: { kind: "TASK_FORCE", id: "task-force-resolute" },
        },
      }),
    ).toMatchObject({ valid: true });
    expect(
      validateSubmitStrategicOrder({
        ...movement,
        destinationNodeId: undefined,
        intent: { type: "ORBITAL_COMBAT", opposingFormationId: "hostile-task-force" },
      }),
    ).toMatchObject({ valid: true });
    expect(validateSubmitStrategicOrder({ ...movement, intent: { type: "INTERCEPT" } })).toMatchObject({
      valid: false,
      code: "STRATEGIC_INTENT_INVALID",
    });
  });

  it("requires a movement destination and matching formation kind", () => {
    expect(validateSubmitStrategicOrder({ ...movement, destinationNodeId: undefined })).toMatchObject({
      valid: false,
      code: "DESTINATION_NODE_INVALID",
    });
    expect(
      validateSubmitStrategicOrder({
        ...movement,
        formation: { kind: "BATTLEGROUP", id: "battlegroup-hammer" },
      }),
    ).toMatchObject({ valid: false, code: "FORMATION_INTENT_MISMATCH" });
  });

  it("requires optimistic versions and a strong command ID", () => {
    expect(validateSubmitStrategicOrder({ ...movement, expectedMapVersion: 0 })).toMatchObject({
      valid: false,
      code: "MAP_VERSION_INVALID",
    });
    expect(validateSubmitStrategicOrder({ ...movement, expectedFormationVersion: -1 })).toMatchObject({
      valid: false,
      code: "FORMATION_VERSION_INVALID",
    });
    expect(validateSubmitStrategicOrder({ ...movement, commandId: "short" })).toMatchObject({
      valid: false,
      code: "COMMAND_ID_INVALID",
    });
  });

  it("validates a development resolve command without accepting resolution inputs", () => {
    expect(
      validateResolveStrategicMap({
        commandId: "strategic-resolve-0001",
        expectedMapVersion: 7,
        expectedRound: 3,
      }),
    ).toMatchObject({ valid: true });
    expect(
      validateResolveStrategicMap({
        commandId: "strategic-resolve-0001",
        expectedMapVersion: 7,
        expectedRound: 3,
        seed: "caller-controlled",
      }),
    ).toMatchObject({ valid: false, code: "STRATEGIC_RESOLVE_COMMAND_INVALID" });
  });
});

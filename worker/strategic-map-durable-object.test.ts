import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockStrategicServiceError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: unknown,
    ) {
      super(message);
    }
  }
  return {
    commitStrategicOrder: vi.fn(),
    resolveStrategicMapRound: vi.fn(),
    StrategicServiceError: MockStrategicServiceError,
  };
});

vi.mock("cloudflare:workers", () => ({
  DurableObject: class<Environment> {
    protected ctx: DurableObjectState;
    protected env: Environment;

    constructor(ctx: DurableObjectState, env: Environment) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

vi.mock("./services/strategic", () => ({
  commitStrategicOrder: mocks.commitStrategicOrder,
  resolveStrategicMapRound: mocks.resolveStrategicMapRound,
  StrategicServiceError: mocks.StrategicServiceError,
}));

import type { Env } from "./env";
import { StrategicMapDurableObject } from "./strategic-map-durable-object";

const movement = {
  commandId: "strategic-move-0001",
  mapId: "strategic-map-corinth",
  expectedMapVersion: 4,
  expectedFormationVersion: 2,
  formation: { kind: "TASK_FORCE", id: "task-force-resolute" },
  destinationNodeId: "node-corinth-jump-point",
  intent: { type: "MOVE_TASK_FORCE" },
} as const;

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  readonly setAlarm = vi.fn();

  async transaction<T>(closure: (transaction: DurableObjectTransaction) => Promise<T>): Promise<T> {
    const transaction = {
      get: async <Value>(key: string): Promise<Value | undefined> => this.values.get(key) as Value | undefined,
      put: async <Value>(key: string, value: Value): Promise<void> => {
        this.values.set(key, value);
      },
    } as unknown as DurableObjectTransaction;
    return closure(transaction);
  }
}

function environment(mode: Env["ENVIRONMENT"] = "development"): Env {
  return { ENVIRONMENT: mode } as Env;
}

function object(storage = new MemoryStorage(), env = environment()): {
  coordinator: StrategicMapDurableObject;
  storage: MemoryStorage;
} {
  const context = { storage } as unknown as DurableObjectState;
  return { coordinator: new StrategicMapDurableObject(context, env), storage };
}

function request(
  path: string,
  body: unknown = movement,
  mapId: string = movement.mapId,
  method = "POST",
): Request {
  return new Request(`https://strategic.internal${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-corinth-strategic-user": "user-commander",
      "x-corinth-strategic-map": mapId,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mocks.commitStrategicOrder.mockReset();
  mocks.commitStrategicOrder.mockResolvedValue({ orderId: "strategic-order-1", lifecycle: "SUBMITTED" });
  mocks.resolveStrategicMapRound.mockReset();
  mocks.resolveStrategicMapRound.mockResolvedValue({ round: 28, nextRound: 29, lifecycle: "RESOLVED" });
});

describe("StrategicMapDurableObject", () => {
  it("binds its shard identity and submits a strictly validated order", async () => {
    const env = environment();
    const { coordinator, storage } = object(new MemoryStorage(), env);
    const response = await coordinator.fetch(request("/orders"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId: "strategic-order-1", lifecycle: "SUBMITTED" });
    expect([...storage.values.values()]).toEqual([movement.mapId]);
    expect(mocks.commitStrategicOrder).toHaveBeenCalledWith(
      env,
      "user-commander",
      movement.mapId,
      movement,
    );
  });

  it("rejects unsupported client-authored order fields before the service", async () => {
    const { coordinator } = object();
    const response = await coordinator.fetch(request("/orders", { ...movement, travelRounds: 0 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "STRATEGIC_COMMAND_INVALID" } });
    expect(mocks.commitStrategicOrder).not.toHaveBeenCalled();
  });

  it("rejects a different map after the coordinator shard is assigned", async () => {
    const { coordinator } = object();
    expect((await coordinator.fetch(request("/orders"))).status).toBe(200);

    const response = await coordinator.fetch(
      request("/orders", { ...movement, mapId: "strategic-map-other" }, "strategic-map-other"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: "STRATEGIC_COORDINATOR_MISMATCH",
        details: { requestedMapId: "strategic-map-other", coordinatorMapId: movement.mapId },
      },
    });
    expect(mocks.commitStrategicOrder).toHaveBeenCalledTimes(1);
  });

  it("renders StrategicServiceError failures through the standard error envelope", async () => {
    mocks.commitStrategicOrder.mockRejectedValueOnce(
      new mocks.StrategicServiceError(422, "TRAVEL_TIME_BALANCE_REQUIRED", "Travel timing is unresolved.", {
        routeId: "route-corinth-relay",
      }),
    );
    const { coordinator } = object();
    const response = await coordinator.fetch(request("/orders"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "TRAVEL_TIME_BALANCE_REQUIRED",
        message: "Travel timing is unresolved.",
        details: { routeId: "route-corinth-relay" },
      },
    });
  });

  it("does not expose unexpected infrastructure error details", async () => {
    mocks.commitStrategicOrder.mockRejectedValueOnce(new Error("D1 token or internal statement detail"));
    const { coordinator } = object();
    const response = await coordinator.fetch(request("/orders"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "STRATEGIC_COORDINATOR_ERROR",
        message: "Strategic coordinator request failed.",
      },
    });
  });

  it("resolves a validated round through the authoritative service", async () => {
    const { coordinator, storage } = object();
    const response = await coordinator.fetch(
      request("/resolve", {
        commandId: "strategic-resolve-0001",
        expectedMapVersion: 4,
        expectedRound: 28,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ round: 28, nextRound: 29, lifecycle: "RESOLVED" });
    expect(storage.setAlarm).not.toHaveBeenCalled();
    expect(mocks.commitStrategicOrder).not.toHaveBeenCalled();
    expect(mocks.resolveStrategicMapRound).toHaveBeenCalledWith(
      expect.anything(),
      "user-commander",
      movement.mapId,
      { commandId: "strategic-resolve-0001", expectedMapVersion: 4, expectedRound: 28 },
    );
  });

  it("validates resolve in production and rejects unknown routes and methods", async () => {
    const production = object(new MemoryStorage(), environment("production"));
    expect((await production.coordinator.fetch(request("/resolve", {}))).status).toBe(400);

    const { coordinator } = object();
    const methodResponse = await coordinator.fetch(request("/orders", undefined, movement.mapId, "GET"));
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("POST");
    expect((await coordinator.fetch(request("/unknown"))).status).toBe(404);
  });
});

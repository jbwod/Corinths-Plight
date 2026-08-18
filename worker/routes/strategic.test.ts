import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { routeStrategicRequest } from "./strategic";

const coordinatorFetch = vi.fn(async () => new Response(JSON.stringify({ orderId: "order-1", lifecycle: "SUBMITTED" }), {
  status: 200,
  headers: { "content-type": "application/json" },
}));

const developmentEnv = {
  ENVIRONMENT: "development",
  ALLOW_DEMO_AUTH: "true",
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          user_id: "demo-user", username: "demo-user", user_status: "ACTIVE", user_created_at: 1,
          last_active_at: 1, display_name: "Demo", profile_callsign: "DEMO", image_key: null,
          biography: null, timezone: null, battalion_id: "battalion-demo", battalion_name: "Demo Battalion",
          short_name: "DEMO", battalion_description: "", insignia_key: null, motto: null,
          battalion_status: "ACTIVE", primary_ship_id: null, battalion_created_by: "demo-user",
          battalion_created_at: 1, battalion_revision: 1, rank_id: "rank-demo", rank_name: "Commander", member_count: 1,
        }),
        all: async () => ({ results: [{ permission: "STRATEGIC_ORDER_CREATE" }] }),
      }),
    }),
  },
  STRATEGIC_MAP: { getByName: () => ({ fetch: coordinatorFetch }) },
} as unknown as Env;

function demoRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-demo-user", "demo-user");
  return new Request(`https://game.example${path}`, { ...init, headers });
}

describe("strategic routes", () => {
  it("does not claim unrelated APIs", async () => {
    await expect(routeStrategicRequest(new Request("https://game.example/api/health"), developmentEnv)).resolves.toBeNull();
  });

  it("requires an authenticated identity", async () => {
    const response = await routeStrategicRequest(new Request("https://game.example/api/command"), developmentEnv);
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("rejects unsupported methods before persistence", async () => {
    const response = await routeStrategicRequest(demoRequest("/api/operations", { method: "POST" }), developmentEnv);
    expect(response?.status).toBe(405);
  });

  it("requires JSON for strategic mutations", async () => {
    const response = await routeStrategicRequest(
      demoRequest("/api/strategic/orders", { method: "POST", body: "formation=hammer" }),
      developmentEnv,
    );
    expect(response?.status).toBe(415);
    expect(await response?.json()).toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });

  it("rejects client-authored route and travel cost before coordinator access", async () => {
    const response = await routeStrategicRequest(
      demoRequest("/api/strategic/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "strategic-move-0001",
          mapId: "strategic-map-corinth",
          expectedMapVersion: 1,
          expectedFormationVersion: 1,
          formation: { kind: "TASK_FORCE", id: "task-force-resolute" },
          destinationNodeId: "node-relay-kappa",
          intent: { type: "MOVE_TASK_FORCE" },
          route: ["node-relay-kappa"],
          travelRounds: 0,
        }),
      }),
      developmentEnv,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "STRATEGIC_COMMAND_INVALID" } });
  });

  it("forwards a valid order to the map coordinator", async () => {
    const response = await routeStrategicRequest(
      demoRequest("/api/strategic/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "strategic-move-0001",
          mapId: "strategic-map-corinth",
          expectedMapVersion: 1,
          expectedFormationVersion: 1,
          formation: { kind: "TASK_FORCE", id: "task-force-resolute" },
          destinationNodeId: "node-corinth-jump-point",
          intent: { type: "MOVE_TASK_FORCE" },
        }),
      }),
      developmentEnv,
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ orderId: "order-1", lifecycle: "SUBMITTED" });
    expect(coordinatorFetch).toHaveBeenCalled();
  });

  it("hides manual resolve outside development", async () => {
    const previewEnv = { ENVIRONMENT: "preview", ALLOW_DEMO_AUTH: "false" } as Env;
    // Without a session preview rejects at authentication first, ensuring demo identity cannot reach the route.
    const response = await routeStrategicRequest(
      new Request("https://game.example/api/strategic/maps/strategic-map-corinth/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      previewEnv,
    );
    expect(response?.status).toBe(401);
  });

  it("validates activity pagination before persistence", async () => {
    const response = await routeStrategicRequest(
      demoRequest("/api/battalions/current/activity?limit=1000"),
      developmentEnv,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "LIMIT_INVALID" } });
  });
});

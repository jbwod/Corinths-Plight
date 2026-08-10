import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeStrategicRequest } from "./strategic";

const developmentEnv = {
  ENVIRONMENT: "development",
  ALLOW_DEMO_AUTH: "true",
} as Env;

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

  it("does not persist a valid order while strategic resolution persistence is deferred", async () => {
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
    expect(response?.status).toBe(501);
    expect(await response?.json()).toMatchObject({
      error: { code: "STRATEGIC_ORDER_EXECUTION_DEFERRED" },
    });
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

import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeForcesRequest } from "./forces";

const developmentEnv = {
  ENVIRONMENT: "development",
  ALLOW_DEMO_AUTH: "true",
} as Env;

function demoRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-demo-user", "demo-user");
  return new Request(`https://game.example${path}`, { ...init, headers });
}

describe("Forces routes", () => {
  it("does not claim unrelated routes", async () => {
    const response = await routeForcesRequest(new Request("https://game.example/api/health"), developmentEnv);
    expect(response).toBeNull();
  });

  it("requires an authenticated identity", async () => {
    const response = await routeForcesRequest(new Request("https://game.example/api/forces"), developmentEnv);
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("rejects unsupported methods before touching persistence", async () => {
    const response = await routeForcesRequest(demoRequest("/api/forces", { method: "POST" }), developmentEnv);
    expect(response?.status).toBe(405);
    expect(await response?.json()).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  });

  it("rejects client-authored authority fields", async () => {
    const response = await routeForcesRequest(
      demoRequest("/api/requisition/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "purchase-command-0001",
          kind: "UNIT",
          definitionId: "unit-infantry-squad",
          desiredName: "Raven Section",
          callsign: "RAVEN-2",
          requisitionCost: 0,
        }),
      }),
      developmentEnv,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "COMMAND_INVALID" } });
  });

  it("requires JSON for mutations", async () => {
    const response = await routeForcesRequest(
      demoRequest("/api/deployment-readiness/check", { method: "POST", body: "unit=force-raven" }),
      developmentEnv,
    );
    expect(response?.status).toBe(415);
    expect(await response?.json()).toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });

  it("requires JSON for authoritative loadout mutations", async () => {
    const response = await routeForcesRequest(
      demoRequest("/api/forces/force-raven/loadout-changes", { method: "POST" }),
      developmentEnv,
    );
    expect(response?.status).toBe(415);
    expect(await response?.json()).toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });

  it("requires JSON for authoritative loadout previews", async () => {
    const response = await routeForcesRequest(
      demoRequest("/api/forces/force-raven/loadout-preview", { method: "POST" }),
      developmentEnv,
    );
    expect(response?.status).toBe(415);
    expect(await response?.json()).toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });

  it("validates list filters", async () => {
    const response = await routeForcesRequest(
      demoRequest("/api/forces?status=god-mode"),
      developmentEnv,
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: { code: "FILTER_INVALID" } });
  });
});

import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeBattlegroupRequest } from "./battlegroups";

const environment = { ENVIRONMENT: "development", ALLOW_DEMO_AUTH: "true" } as Env;

describe("Battlegroup routes", () => {
  it("does not claim unrelated routes", async () => {
    expect(await routeBattlegroupRequest(new Request("https://game.example/api/health"), environment)).toBeNull();
  });

  it("requires authentication", async () => {
    const response = await routeBattlegroupRequest(new Request("https://game.example/api/battlegroups"), environment);
    expect(response?.status).toBe(401);
  });

  it("requires JSON for formation mutations", async () => {
    const response = await routeBattlegroupRequest(new Request("https://game.example/api/battlegroups", {
      method: "POST",
      headers: { "x-demo-user": "demo-user" },
    }), environment);
    expect(response?.status).toBe(415);
    expect(await response?.json()).toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });
});

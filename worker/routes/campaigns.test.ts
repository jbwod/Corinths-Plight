import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { routeCampaignDirectoryRequest } from "./campaigns";

function env(rows: unknown[]): Env {
  const statement = {
    bind: () => statement,
    all: async () => ({ results: rows, success: true }),
  };
  return {
    ENVIRONMENT: "development",
    ALLOW_DEMO_AUTH: "true",
    DB: { prepare: () => statement } as unknown as D1Database,
  } as Env;
}

describe("campaign directory", () => {
  it("returns only the authenticated player's server-backed memberships", async () => {
    const response = await routeCampaignDirectoryRequest(new Request("https://game.test/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    }), env([{
      campaign_id: "outpost-k17",
      name: "Outpost K-17",
      status: "ACTIVE",
      planet_name: "Corinth",
      map_source_key: "fixture/outpost-k17",
      side: "ALLIED",
      role: "PLAYER",
      joined_at: 1,
      minimum_players: 1,
      maximum_players: 8,
      member_count: 2,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "outpost-k17",
        scenarioAvailable: true,
        canEnter: true,
        memberCount: 2,
      })],
    });
  });

  it("requires authentication", async () => {
    const response = await routeCampaignDirectoryRequest(
      new Request("https://game.test/api/campaigns"),
      env([]),
    );
    expect(response?.status).toBe(401);
  });
});

import { describe, expect, it } from "vitest";

import type { Env } from "../env";
import { routeCampaignDirectoryRequest } from "./campaigns";

function env(rows: unknown[]): Env {
  let prepareIndex = 0;
  const prepare = () => {
    const resultRows = prepareIndex++ === 0 ? rows : [];
    const statement = {
      bind: () => statement,
      all: async () => ({ results: resultRows, success: true }),
    };
    return statement;
  };
  return {
    ENVIRONMENT: "development",
    ALLOW_DEMO_AUTH: "true",
    DB: { prepare } as unknown as D1Database,
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
      deployment_count: 1,
      result: "VICTORY",
      outcome_reason: "FINAL_ROUND_PRIMARY_HELD",
      result_round: 4,
      rewards_json: JSON.stringify({
        serviceHistory: "RECORDED",
        requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
      }),
      resolved_at: 42,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "outpost-k17",
        scenarioAvailable: true,
        canEnter: true,
        memberCount: 2,
        outcome: {
          result: "VICTORY",
          reason: "FINAL_ROUND_PRIMARY_HELD",
          round: 4,
          rewards: {
            serviceHistory: "RECORDED",
            requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
          },
          resolvedAt: 42,
        },
      })],
      availableCampaigns: [],
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

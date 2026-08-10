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

  it("advertises the authored Iron Rain briefing to campaign members", async () => {
    const response = await routeCampaignDirectoryRequest(new Request("https://game.test/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    }), env([{
      campaign_id: "operation-iron-rain",
      name: "Operation Iron Rain",
      status: "RECRUITING",
      planet_name: "Corinth",
      map_source_key: "fixture/operation-iron-rain",
      side: "ALLIED",
      role: "BATTALION_COMMAND",
      joined_at: 1,
      minimum_players: 2,
      maximum_players: 8,
      member_count: 1,
      deployment_count: 0,
      result: null,
      outcome_reason: null,
      result_round: null,
      rewards_json: null,
      resolved_at: null,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "operation-iron-rain",
        scenarioAvailable: true,
        canEnter: false,
        briefing: {
          threat: "HIGH",
          objectives: ["Hold Airfield", "Destroy Hive"],
          durationRounds: 6,
          recommendedCapabilities: ["GROUND_COMBAT", "ARMOURED", "ENGINEERING", "ARTILLERY"],
        },
      })],
      availableCampaigns: [],
    });
  });

  it("advertises the unlocked Broken Road follow-on briefing", async () => {
    const response = await routeCampaignDirectoryRequest(new Request("https://game.test/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    }), env([{
      campaign_id: "operation-broken-road",
      name: "Operation Broken Road",
      status: "RECRUITING",
      planet_name: "Corinth",
      map_source_key: "fixture/operation-broken-road",
      side: "ALLIED",
      role: "PLAYER",
      joined_at: 1,
      minimum_players: 1,
      maximum_players: 8,
      member_count: 1,
      deployment_count: 0,
      result: null,
      outcome_reason: null,
      result_round: null,
      rewards_json: null,
      resolved_at: null,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "operation-broken-road",
        scenarioAvailable: true,
        briefing: {
          threat: "MODERATE",
          objectives: ["Hold Junction 7", "Protect Supply Cache"],
          durationRounds: 5,
          recommendedCapabilities: ["GROUND_COMBAT", "ENGINEERING", "LOGISTICS", "ARTILLERY"],
        },
      })],
      availableCampaigns: [],
    });
  });

  it("advertises the unlocked Night Glass follow-on briefing", async () => {
    const response = await routeCampaignDirectoryRequest(new Request("https://game.test/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    }), env([{
      campaign_id: "operation-night-glass",
      name: "Operation Night Glass",
      status: "RECRUITING",
      planet_name: "Corinth",
      map_source_key: "fixture/operation-night-glass",
      side: "ALLIED",
      role: "PLAYER",
      joined_at: 1,
      minimum_players: 1,
      maximum_players: 6,
      member_count: 1,
      deployment_count: 0,
      result: null,
      outcome_reason: null,
      result_round: null,
      rewards_json: null,
      resolved_at: null,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "operation-night-glass",
        scenarioAvailable: true,
        briefing: {
          threat: "HIGH",
          objectives: ["Hold Sensor Array", "Clear Forward Burrow"],
          durationRounds: 4,
          recommendedCapabilities: ["GROUND_COMBAT", "RECON", "AIR_MOBILE", "ARTILLERY"],
        },
      })],
      availableCampaigns: [],
    });
  });

  it("advertises the authored Corinth II operation briefing", async () => {
    const response = await routeCampaignDirectoryRequest(new Request("https://game.test/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    }), env([{
      campaign_id: "operation-cold-horizon",
      name: "Operation Cold Horizon",
      status: "RECRUITING",
      planet_name: "Corinth II",
      map_source_key: "fixture/operation-cold-horizon",
      side: "ALLIED",
      role: "PLAYER",
      joined_at: 1,
      minimum_players: 1,
      maximum_players: 6,
      member_count: 1,
      deployment_count: 0,
      result: null,
      outcome_reason: null,
      result_round: null,
      rewards_json: null,
      resolved_at: null,
    }]));

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      campaigns: [expect.objectContaining({
        campaignId: "operation-cold-horizon",
        planetName: "Corinth II",
        scenarioAvailable: true,
        briefing: {
          threat: "HIGH",
          objectives: ["Hold Colony Beacon", "Secure Landing Field"],
          durationRounds: 5,
          recommendedCapabilities: ["GROUND_COMBAT", "RECON", "ARMOURED", "ARTILLERY"],
        },
      })],
      availableCampaigns: [],
    });
  });
});

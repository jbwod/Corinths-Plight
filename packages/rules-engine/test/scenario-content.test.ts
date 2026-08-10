import { describe, expect, it } from "vitest";

import { createDemoCampaignState } from "../src/demo";
import {
  createScenarioCampaignState,
  OUTPOST_K17_SCENARIO_ID,
  OUTPOST_K17_SCENARIO_VERSION,
} from "../src/scenario-content";

describe("authored scenario content", () => {
  it("builds a campaign instance from its map source and persistent allied force", () => {
    const allied = createDemoCampaignState(1_000).deployments
      .filter((deployment) => deployment.side === "ALLIED")
      .slice(0, 2)
      .map((deployment) => ({ ...deployment, campaignId: "campaign-live", ownerId: "player-live" }));
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/outpost-k17",
      campaignId: "campaign-live",
      campaignName: "Hold the Relay",
      planetName: "Corinth",
      now: 10_000,
      durationMs: 300_000,
      alliedDeployments: allied,
    });

    expect(state).toMatchObject({
      campaignId: "campaign-live",
      scenarioId: OUTPOST_K17_SCENARIO_ID,
      scenarioVersion: OUTPOST_K17_SCENARIO_VERSION,
      round: 1,
      phase: "PLANNING",
      scenarioPolicy: { startRound: 1, maxRounds: 4, primaryObjectiveId: "objective-outpost" },
    });
    expect(state.deployments.filter((deployment) => deployment.side === "ALLIED")).toHaveLength(2);
    expect(state.deployments.filter((deployment) => deployment.side === "ENEMY" && deployment.status === "ACTIVE")).toHaveLength(3);
    expect(state.deployments.find((deployment) => deployment.callsign === "SKITTER-9")?.position).toEqual({ q: 3, r: -2 });
    expect(state.deployments.filter((deployment) => deployment.locationState === "RESERVE")).toHaveLength(6);
    expect(state.reinforcementWaves).toEqual([
      expect.objectContaining({ id: "k17-wave-2", arrivesAfterRound: 1, status: "PENDING" }),
      expect.objectContaining({ id: "k17-wave-3", arrivesAfterRound: 2, status: "PENDING" }),
      expect.objectContaining({ id: "k17-wave-4", arrivesAfterRound: 3, status: "PENDING" }),
    ]);
    expect(state.objectives).toHaveLength(3);
    expect(state.events[0]).toMatchObject({
      type: "ROUND_STARTED",
      payload: { scenarioId: OUTPOST_K17_SCENARIO_ID, scenarioVersion: OUTPOST_K17_SCENARIO_VERSION },
    });
  });

  it("fails closed when a campaign names content that is not authored", () => {
    expect(() => createScenarioCampaignState({
      mapSourceKey: "fixture/operation-unknown",
      campaignId: "unknown",
      campaignName: "Unknown",
      planetName: "Corinth",
      now: 10_000,
      durationMs: 300_000,
      alliedDeployments: [],
    })).toThrow("CAMPAIGN_SCENARIO_NOT_AVAILABLE");
  });
});

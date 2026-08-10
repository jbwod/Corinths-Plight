import { describe, expect, it } from "vitest";

import { createDemoCampaignState } from "../src/demo";
import {
  BROKEN_ROAD_SCENARIO_ID,
  BROKEN_ROAD_SCENARIO_VERSION,
  createScenarioCampaignState,
  IRON_RAIN_SCENARIO_ID,
  IRON_RAIN_SCENARIO_VERSION,
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

  it("builds the authored Iron Rain combined-arms battlefield", () => {
    const allied = createDemoCampaignState(1_000).deployments
      .filter((deployment) => deployment.side === "ALLIED")
      .map((deployment) => ({
        ...deployment,
        id: `iron-rain:${deployment.id}`,
        campaignId: "operation-iron-rain",
        ownerId: "player-live",
        position: { q: -6, r: 2 },
      }));
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-iron-rain",
      campaignId: "operation-iron-rain",
      campaignName: "Operation Iron Rain",
      planetName: "Corinth",
      now: 20_000,
      durationMs: 300_000,
      alliedDeployments: allied,
    });

    expect(state).toMatchObject({
      scenarioId: IRON_RAIN_SCENARIO_ID,
      scenarioVersion: IRON_RAIN_SCENARIO_VERSION,
      scenarioPolicy: {
        startRound: 1,
        maxRounds: 6,
        primaryObjectiveId: "objective-kestrel-airfield",
      },
    });
    expect(state.map).toHaveLength(169);
    expect(state.map.find((hex) => hex.coord.q === -6 && hex.coord.r === 2)?.capacity).toBe(8);
    expect(state.objectives.map((objective) => objective.name)).toEqual(["Hold Airfield", "Destroy Hive"]);
    expect(state.deployments.filter((deployment) => deployment.side === "ALLIED")).toHaveLength(5);
    expect(state.deployments.filter((deployment) => deployment.side === "ENEMY" && deployment.status === "ACTIVE")).toHaveLength(4);
    expect(state.deployments.filter((deployment) => deployment.locationState === "RESERVE")).toHaveLength(6);
    expect(state.reinforcementWaves).toEqual([
      expect.objectContaining({ id: "iron-rain-wave-2", arrivesAfterRound: 1 }),
      expect.objectContaining({ id: "iron-rain-wave-3", arrivesAfterRound: 2 }),
      expect.objectContaining({ id: "iron-rain-wave-4", arrivesAfterRound: 3 }),
    ]);
  });

  it("builds the unlocked Broken Road logistics-defence battlefield", () => {
    const allied = createDemoCampaignState(1_000).deployments
      .filter((deployment) => deployment.side === "ALLIED")
      .slice(0, 3)
      .map((deployment) => ({
        ...deployment,
        id: `broken-road:${deployment.id}`,
        campaignId: "operation-broken-road",
        ownerId: "player-live",
        position: { q: -5, r: 1 },
      }));
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/operation-broken-road",
      campaignId: "operation-broken-road",
      campaignName: "Operation Broken Road",
      planetName: "Corinth",
      now: 30_000,
      durationMs: 300_000,
      alliedDeployments: allied,
    });

    expect(state).toMatchObject({
      scenarioId: BROKEN_ROAD_SCENARIO_ID,
      scenarioVersion: BROKEN_ROAD_SCENARIO_VERSION,
      scenarioPolicy: {
        startRound: 1,
        maxRounds: 5,
        primaryObjectiveId: "objective-junction-7",
      },
    });
    expect(state.map).toHaveLength(127);
    expect(state.map.find((hex) => hex.coord.q === -5 && hex.coord.r === 1)?.capacity).toBe(8);
    expect(state.objectives.map((objective) => objective.name)).toEqual(["Hold Junction 7", "Protect Supply Cache"]);
    expect(state.deployments.filter((deployment) => deployment.side === "ENEMY" && deployment.status === "ACTIVE")).toHaveLength(3);
    expect(state.deployments.filter((deployment) => deployment.locationState === "RESERVE")).toHaveLength(4);
    expect(state.reinforcementWaves).toEqual([
      expect.objectContaining({ id: "broken-road-wave-2", arrivesAfterRound: 1 }),
      expect.objectContaining({ id: "broken-road-wave-3", arrivesAfterRound: 3 }),
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  createDemoCampaignState,
  createScenarioCampaignState,
  applyScenarioReinforcements,
  evaluateScenarioRoundEnd,
  resolveRound,
} from "../src";

function fixture(round = 18) {
  const state = createDemoCampaignState(10_000, 300_000, "scenario-k17-test");
  state.round = round;
  state.orders = [];
  return state;
}

describe("declarative Outpost K-17 scenario policy", () => {
  it("captures an objective for exactly one active on-map side, independent of input order", () => {
    const state = fixture();
    const objective = state.objectives.find(({ id }) => id === "objective-nest")!;
    const allied = state.deployments.find(({ id }) => id === "dep-rook-7")!;
    const enemy = state.deployments.find(({ id }) => id === "bug-heavy-1")!;
    allied.position = { ...objective.coord };
    enemy.status = "DESTROYED";
    enemy.locationState = "DESTROYED";

    const first = evaluateScenarioRoundEnd(state);
    const permuted = structuredClone(state);
    permuted.deployments.reverse();
    permuted.objectives.reverse();
    permuted.scenarioPolicy!.capturableObjectiveIds.reverse();
    const second = evaluateScenarioRoundEnd(permuted);

    expect(second).toEqual(first);
    expect(first.captures).toEqual([{
      objectiveId: "objective-nest",
      objectiveName: "Destroy Bug Nest",
      coord: { q: 4, r: -2 },
      previousOwner: "ENEMY",
      owner: "ALLIED",
      status: "ACTIVE",
      occupantIds: ["dep-rook-7"],
    }]);
    expect(first.objectives.find(({ id }) => id === objective.id)?.owner).toBe("ALLIED");
    expect(state.objectives.find(({ id }) => id === objective.id)?.owner).toBe("ENEMY");
  });

  it("does not capture when a hex is empty, contested, or occupied only by a non-active unit", () => {
    const empty = fixture();
    expect(evaluateScenarioRoundEnd(empty).captures).toEqual([]);

    const contested = fixture();
    const outpost = contested.objectives.find(({ id }) => id === "objective-outpost")!;
    contested.deployments.find(({ id }) => id === "dep-rook-7")!.position = { ...outpost.coord };
    contested.deployments.find(({ id }) => id === "bug-drone-1")!.position = { ...outpost.coord };
    expect(evaluateScenarioRoundEnd(contested).captures).toEqual([]);

    const inactive = fixture();
    inactive.objectives.find(({ id }) => id === "objective-outpost")!.owner = "NEUTRAL";
    const enemy = inactive.deployments.find(({ id }) => id === "bug-drone-1")!;
    enemy.position = { ...outpost.coord };
    enemy.status = "IMMOBILISED";
    expect(evaluateScenarioRoundEnd(inactive).captures).toEqual([]);
  });

  it("fails immediately when every Allied deployment is destroyed or withdrawn", () => {
    const state = fixture();
    state.deployments
      .filter(({ side }) => side === "ALLIED")
      .forEach((deployment, index) => {
        deployment.status = index % 2 === 0 ? "DESTROYED" : "WITHDRAWN";
      });

    expect(evaluateScenarioRoundEnd(state).outcome).toMatchObject({
      result: "DEFEAT",
      round: 18,
      reason: "ALL_ALLIED_DEPLOYMENTS_LOST",
    });
  });

  it("fails immediately when the primary outpost becomes Enemy-controlled", () => {
    const state = fixture();
    const outpost = state.objectives.find(({ id }) => id === "objective-outpost")!;
    state.deployments.find(({ id }) => id === "bug-drone-1")!.position = { ...outpost.coord };

    const result = evaluateScenarioRoundEnd(state);

    expect(result.captures.map(({ objectiveId }) => objectiveId)).toContain("objective-outpost");
    expect(result.outcome).toMatchObject({
      result: "DEFEAT",
      reason: "PRIMARY_OBJECTIVE_LOST",
    });
  });

  it("wins on round 21 when an Allied survivor holds the primary, regardless of secondaries", () => {
    const state = fixture(21);
    state.objectives.find(({ id }) => id === "objective-nest")!.owner = "ENEMY";
    state.objectives.find(({ id }) => id === "objective-supply-route")!.owner = "ENEMY";

    expect(evaluateScenarioRoundEnd(state).outcome).toEqual({
      result: "VICTORY",
      round: 21,
      reason: "FINAL_ROUND_PRIMARY_HELD",
      objectives: [
        { id: "objective-nest", owner: "ENEMY", status: "ACTIVE" },
        { id: "objective-outpost", owner: "ALLIED", status: "ACTIVE" },
        { id: "objective-supply-route", owner: "ENEMY", status: "ACTIVE" },
      ],
      rewards: {
        serviceHistory: "RECORDED",
        requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
      },
    });
  });

  it("fails at the final round when the surviving Allies do not hold the primary", () => {
    const state = fixture(21);
    state.objectives.find(({ id }) => id === "objective-outpost")!.owner = "NEUTRAL";

    expect(evaluateScenarioRoundEnd(state).outcome).toMatchObject({
      result: "DEFEAT",
      reason: "FINAL_ROUND_CONDITIONS_NOT_MET",
    });
  });

  it("emits public round and terminal reports, completes the campaign, and replays as a no-op", () => {
    const state = fixture(21);
    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "k17-terminal",
      resolutionTime: 20_000,
    });

    expect(output.events.map(({ type }) => type)).toEqual(["ROUND_FINISHED", "CAMPAIGN_COMPLETED"]);
    expect(output.events.at(-1)?.payload).toEqual(output.state.outcome);
    expect(output.state.phase).toBe("COMPLETE");
    expect(output.state.outcome?.reason).toBe("FINAL_ROUND_PRIMARY_HELD");
    expect(output.persistentEffects.filter((effect) => effect.type === "CAMPAIGN_HISTORY")).toHaveLength(10);
    expect(output.persistentEffects.find((effect) => effect.type === "CAMPAIGN_RESULT")?.payload).toMatchObject({
      result: "VICTORY",
      reason: "FINAL_ROUND_PRIMARY_HELD",
      rewards: {
        serviceHistory: "RECORDED",
        requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
      },
    });
    expect(output.persistentEffects.find((effect) => effect.type === "CAMPAIGN_HISTORY")?.payload).toMatchObject({
      campaignCompleted: true,
      result: "VICTORY",
      reason: "FINAL_ROUND_PRIMARY_HELD",
    });

    const replay = resolveRound({
      previousState: output.state,
      rulesetVersion: output.state.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "ignored-after-terminal",
      resolutionTime: 30_000,
    });
    expect(replay.events).toEqual([]);
    expect(replay.state).toEqual(output.state);
    expect(replay.digest).toBe(output.digest);
  });

  it("emits capture before the failure report when the outpost falls", () => {
    const state = fixture();
    const outpost = state.objectives.find(({ id }) => id === "objective-outpost")!;
    state.deployments.find(({ id }) => id === "bug-drone-1")!.position = { ...outpost.coord };

    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "k17-failure",
      resolutionTime: 20_000,
    });

    expect(output.events.map(({ type }) => type)).toEqual([
      "OBJECTIVE_CAPTURED",
      "ROUND_FINISHED",
      "CAMPAIGN_FAILED",
    ]);
    expect(output.state.outcome?.reason).toBe("PRIMARY_OBJECTIVE_LOST");
    expect(output.state.phase).toBe("COMPLETE");
  });

  it("activates authored assault waves once at the end of each non-terminal round", () => {
    const allied = createDemoCampaignState(10_000).deployments
      .filter((deployment) => deployment.side === "ALLIED")
      .slice(0, 1)
      .map((deployment) => ({ ...deployment, campaignId: "campaign-waves", persistentUnitId: undefined }));
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/outpost-k17",
      campaignId: "campaign-waves",
      campaignName: "Hold the Relay",
      planetName: "Corinth",
      now: 10_000,
      durationMs: 300_000,
      alliedDeployments: allied,
    });
    const output = resolveRound({
      previousState: state,
      rulesetVersion: state.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "k17-wave-2",
      resolutionTime: 20_000,
    });

    expect(output.events.map((event) => event.type)).toEqual([
      "ENEMY_REINFORCEMENTS_ARRIVED",
      "ROUND_FINISHED",
    ]);
    expect(output.events[0]?.payload).toMatchObject({
      waveId: "k17-wave-2",
      entryRound: 2,
      callsigns: ["RAZOR-2", "CHITIN-7"],
    });
    expect(output.state.reinforcementWaves?.[0]?.status).toBe("ARRIVED");
    expect(output.state.deployments.filter((deployment) => deployment.status === "ACTIVE" && deployment.side === "ENEMY")).toHaveLength(5);

    const replay = applyScenarioReinforcements(output.state);
    expect(replay.arrivals).toEqual([]);
    expect(replay.reinforcementWaves[0]?.status).toBe("ARRIVED");
  });
});

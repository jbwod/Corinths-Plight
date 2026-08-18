import { describe, expect, it } from "vitest";
import type { CampaignRuntimeState } from "../../domain/src";
import {
  GAME_MASTER_SKIRMISH_MAX_ROUNDS,
  PUBLIC_V1_ECONOMY_POLICY_ID,
} from "../../domain/src";
import { createDemoCampaignState, evaluateScenarioRoundEnd } from "../src";

function fixture(round = 1, includeEnemy = true): CampaignRuntimeState {
  const state = createDemoCampaignState(10_000, 300_000, "game-master-skirmish-test");
  const allied = structuredClone(state.deployments.find(({ side }) => side === "ALLIED")!);
  const enemy = structuredClone(state.deployments.find(({ side }) => side === "ENEMY")!);
  state.round = round;
  state.orders = [];
  state.objectives = [];
  state.deployments = includeEnemy ? [allied, enemy] : [allied];
  state.scenarioPolicy = {
    policyId: "game-master-skirmish",
    version: 1,
    maxRounds: GAME_MASTER_SKIRMISH_MAX_ROUNDS,
    rewardPolicyId: PUBLIC_V1_ECONOMY_POLICY_ID,
  };
  state.outcome = undefined;
  return state;
}

describe("versioned Game Master skirmish terminal policy", () => {
  it("does not award an empty-roster victory before an enemy has existed", () => {
    const state = fixture(1, false);

    expect(evaluateScenarioRoundEnd(state)).toEqual({ objectives: [], captures: [] });
  });

  it("fails immediately when all Allied deployments are lost", () => {
    const state = fixture();
    state.deployments.find(({ side }) => side === "ALLIED")!.status = "DESTROYED";

    expect(evaluateScenarioRoundEnd(state).outcome).toMatchObject({
      result: "DEFEAT",
      round: 1,
      reason: "ALL_ALLIED_DEPLOYMENTS_LOST",
      rewards: {
        requisition: {
          amount: 5,
          policyId: PUBLIC_V1_ECONOMY_POLICY_ID,
          breakdown: { mission: 5, campaign: 0 },
        },
      },
    });
  });

  it("wins after the last spawned enemy is lost and preserves public-v1 rewards", () => {
    const state = fixture(4);
    state.deployments.find(({ side }) => side === "ENEMY")!.status = "WITHDRAWN";

    expect(evaluateScenarioRoundEnd(state).outcome).toEqual({
      result: "VICTORY",
      round: 4,
      reason: "ALL_SPAWNED_ENEMIES_LOST",
      objectives: [],
      rewards: {
        serviceHistory: "RECORDED",
        requisition: {
          status: "PUBLISHED",
          amount: 25,
          rulesDecisionId: "RC-V5-016",
          policyId: PUBLIC_V1_ECONOMY_POLICY_ID,
          breakdown: { mission: 5, campaign: 20 },
        },
      },
    });
  });

  it("fails at round 12 while any spawned enemy survives", () => {
    const state = fixture(GAME_MASTER_SKIRMISH_MAX_ROUNDS);

    expect(evaluateScenarioRoundEnd(state).outcome).toMatchObject({
      result: "DEFEAT",
      round: GAME_MASTER_SKIRMISH_MAX_ROUNDS,
      reason: "GAME_MASTER_SKIRMISH_ROUND_LIMIT_REACHED",
    });
  });

  it("awards victory when the last enemy is lost on round 12", () => {
    const state = fixture(GAME_MASTER_SKIRMISH_MAX_ROUNDS);
    state.deployments.find(({ side }) => side === "ENEMY")!.status = "DESTROYED";

    expect(evaluateScenarioRoundEnd(state).outcome).toMatchObject({
      result: "VICTORY",
      reason: "ALL_SPAWNED_ENEMIES_LOST",
    });
  });

  it("is independent of deployment order and does not mutate state", () => {
    const state = fixture(3);
    state.deployments.find(({ side }) => side === "ENEMY")!.status = "DESTROYED";
    const before = structuredClone(state);
    const permuted = structuredClone(state);
    permuted.deployments.reverse();

    expect(evaluateScenarioRoundEnd(permuted)).toEqual(evaluateScenarioRoundEnd(state));
    expect(state).toEqual(before);
  });

  it("fails closed on drift from the exact application policy", () => {
    const state = fixture();
    (state.scenarioPolicy as unknown as { maxRounds: number }).maxRounds = 13;

    expect(() => evaluateScenarioRoundEnd(state)).toThrow(/Unsupported Game Master skirmish policy/);
  });
});

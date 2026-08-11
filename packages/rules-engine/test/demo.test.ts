import { describe, expect, it } from "vitest";
import { createDemoCampaignState } from "../src/demo";
import { validateOrder } from "../src/resolver";

describe("Outpost K-17 fixture", () => {
  it("binds every deployment and intention to the requested campaign and starts with legal allied orders", () => {
    const state = createDemoCampaignState(10_000, 300_000, "fixture-campaign");

    expect(state.deployments.every((deployment) => deployment.campaignId === state.campaignId)).toBe(true);
    expect(state.orders.every((order) => order.campaignId === state.campaignId)).toBe(true);
    expect(state.deployments.filter(({ side }) => side === "ALLIED")).toHaveLength(10);
    expect(state.deployments.filter(({ side }) => side === "ALLIED").every(({ ownerId }) => ownerId === "demo-user")).toBe(true);
    expect(state.scenarioPolicy).toEqual({
      policyId: "HOLD_PRIMARY_OBJECTIVE",
      version: 1,
      startRound: 18,
      maxRounds: 4,
      primaryObjectiveId: "objective-outpost",
      capturableObjectiveIds: ["objective-nest", "objective-outpost", "objective-supply-route"],
    });
    for (const order of state.orders) {
      const deployment = state.deployments.find((candidate) => candidate.id === order.unitId);
      const validation = validateOrder(order, deployment, {
        previousState: state,
        rulesetVersion: state.rulesetVersion,
        playerOrders: [order],
        enemyOrders: [],
        seed: "fixture-validation",
        resolutionTime: 10_000,
      });
      expect(validation.reasons, `${order.id} should be a legal starting intention`).toEqual([]);
    }
  });
});

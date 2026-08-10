import { describe, expect, it } from "vitest";

import { configuredCampaignStrategicConsequences } from "./campaign-strategic-effects";

const rules = JSON.stringify([{
  when: { objectiveId: "objective-kestrel-airfield", owner: "ALLIED" },
  effects: [
    { type: "STRATEGIC_NODE_CAPTURED", nodeId: "node-kestrel-ridge", control: "FRIENDLY" },
    { type: "ROUTE_UNLOCKED", routeId: "route-kestrel-outpost-k17" },
    { type: "OPERATION_ACTIVATED", operationId: "strategic-operation-broken-road" },
  ],
}]);

describe("campaign strategic consequences", () => {
  it("materializes the authored Iron Rain victory effects", () => {
    expect(configuredCampaignStrategicConsequences(rules, "VICTORY", [
      { id: "objective-kestrel-airfield", owner: "ALLIED", status: "ACTIVE" },
    ])).toEqual([
      { type: "STRATEGIC_NODE_CAPTURED", nodeId: "node-kestrel-ridge", control: "FRIENDLY" },
      { type: "ROUTE_UNLOCKED", routeId: "route-kestrel-outpost-k17" },
      { type: "OPERATION_ACTIVATED", operationId: "strategic-operation-broken-road" },
    ]);
  });

  it("does not apply victory-only consequences to a failed or unmet objective", () => {
    expect(configuredCampaignStrategicConsequences(rules, "DEFEAT", [
      { id: "objective-kestrel-airfield", owner: "ALLIED", status: "ACTIVE" },
    ])).toEqual([]);
    expect(configuredCampaignStrategicConsequences(rules, "VICTORY", [
      { id: "objective-kestrel-airfield", owner: "ENEMY", status: "ACTIVE" },
    ])).toEqual([]);
  });

  it("fails closed on an unsupported configured effect", () => {
    expect(() => configuredCampaignStrategicConsequences(JSON.stringify([{
      when: { objectiveId: "objective-kestrel-airfield", owner: "ALLIED" },
      effects: [{ type: "GRANT_REQUISITION", amount: 100 }],
    }]), "VICTORY", [
      { id: "objective-kestrel-airfield", owner: "ALLIED", status: "ACTIVE" },
    ])).toThrow("CAMPAIGN_STRATEGIC_EFFECT_UNSUPPORTED");
  });
});

import { describe, expect, it } from "vitest";

import { companionArmourIntentSummary, getCompanionArmourUiProfile } from "./companion-armour-ui";

describe("companion armour UI metadata", () => {
  it("surfaces the exact public-v1 profiles and requisition prices", () => {
    expect(getCompanionArmourUiProfile("unit-mechanized-infantry")).toMatchObject({
      requisitionCost: 10,
      attackLabel: "D4 autocannon · Range 2",
      capabilityLabel: expect.stringContaining("Forward Line"),
    });
    expect(getCompanionArmourUiProfile("unit-light-battle-tank")).toMatchObject({ requisitionCost: 10 });
    expect(getCompanionArmourUiProfile("unit-heavy-battle-tank")).toMatchObject({ requisitionCost: 14 });
    expect(getCompanionArmourUiProfile("unit-super-heavy-tank")).toMatchObject({
      requisitionCost: 20,
      attackLabel: "2 × D8 · AP 5 · Range 3 · Primary",
    });
    expect(getCompanionArmourUiProfile("unit-medium-mech")).toMatchObject({ requisitionCost: 14, capabilityLabel: expect.stringContaining("crouch") });
    expect(getCompanionArmourUiProfile("unit-heavy-mech")).toMatchObject({ requisitionCost: 18, capabilityLabel: expect.stringContaining("three external") });
  });

  it("builds a player-facing intent summary only for the governed family", () => {
    expect(companionArmourIntentSummary("unit-super-heavy-tank", "BREAKER")).toBe(
      "engage BREAKER with 2 × D8 · AP 5 · Range 3 · Primary",
    );
    expect(companionArmourIntentSummary("unit-main-battle-tank", "BREAKER")).toBeUndefined();
  });
});

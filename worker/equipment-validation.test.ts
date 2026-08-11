import { describe, expect, it } from "vitest";
import { validateLoadoutChangeCommand, validateSaveDeploymentPlanCommand } from "./equipment-validation";

function deploymentCommand(supplyType: string): Record<string, unknown> {
  return {
    commandId: "command-deploy-0001",
    expectedRevision: 0,
    planId: "plan-1",
    campaignId: "campaign-1",
    method: "STANDARD_GROUND",
    route: [],
    units: [{
      unitId: "unit-1",
      loadoutId: "loadout-1",
      expectedUnitVersion: 1,
      expectedLoadoutRevision: 1,
    }],
    transports: [{
      carrierUnitId: "unit-1",
      cargoProfileId: "cargo-logi-two-slot",
      cargo: [{
        id: "cargo-1",
        kind: "SUPPLY",
        quantity: 1,
        supplyType,
        tags: [],
      }],
    }],
  };
}

describe("deployment cargo request vocabulary", () => {
  it("accepts an exact tactical supply resource identifier", () => {
    expect(validateSaveDeploymentPlanCommand(deploymentCommand("SMALL_SUPPLY"))).toMatchObject({
      valid: true,
      value: {
        transports: [{ cargo: [{ supplyType: "SMALL_SUPPLY" }] }],
      },
    });
  });

  it("rejects an ambiguous strategic supply size", () => {
    expect(validateSaveDeploymentPlanCommand(deploymentCommand("SMALL"))).toEqual({
      valid: false,
      code: "CARGO_INVALID",
      message: "Cargo items contain invalid or unsupported fields.",
    });
  });
});

describe("loadout change commands", () => {
  const reserveCommand = {
    commandId: "loadout-command-0001",
    expectedVersion: 1,
    expectedLoadoutRevision: 1,
    context: "PRE_CAMPAIGN_MUSTER",
    items: [{
      inventoryId: "inventory:spearhead:flak-spare",
      slotType: "SECONDARY",
      slotIndex: 0,
    }],
  };

  it("allows a Reserve refit before the unit is attached to a campaign", () => {
    expect(validateLoadoutChangeCommand(reserveCommand)).toEqual({
      valid: true,
      value: reserveCommand,
    });
  });

  it("rejects client-authored equipment effects", () => {
    expect(validateLoadoutChangeCommand({
      ...reserveCommand,
      items: [{ ...reserveCommand.items[0], armor: 99 }],
    })).toMatchObject({ valid: false, code: "LOADOUT_ITEM_INVALID" });
  });
});

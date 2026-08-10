import { describe, expect, test } from "vitest";

import { validateSaveDeploymentPlanCommand } from "./equipment-validation";

function command(supplyType: string): Record<string, unknown> {
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
  test("accepts an exact tactical supply resource identifier", () => {
    expect(validateSaveDeploymentPlanCommand(command("SMALL_SUPPLY"))).toMatchObject({
      valid: true,
      value: {
        transports: [{ cargo: [{ supplyType: "SMALL_SUPPLY" }] }],
      },
    });
  });

  test("rejects an ambiguous strategic supply size", () => {
    expect(validateSaveDeploymentPlanCommand(command("SMALL"))).toEqual({
      valid: false,
      code: "CARGO_INVALID",
      message: "Cargo items contain invalid or unsupported fields.",
    });
  });
});

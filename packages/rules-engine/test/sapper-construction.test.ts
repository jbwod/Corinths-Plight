import { describe, expect, it } from "vitest";
import {
  performSapperBuildAction,
  reloadSapperBuildSupply,
  SOURCE_SAPPER_BUILD_PROFILE,
} from "../src/sapper-construction";

describe("source-exact Sapper construction accounting", () => {
  it("publishes the companion row's six-point pool and three-for-three build action", () => {
    expect(SOURCE_SAPPER_BUILD_PROFILE).toEqual({
      capacity: 6,
      supplyPerAction: 3,
      progressPerAction: 3,
      reloadResource: "GENERAL_SUPPLY",
      reloadCost: 1,
    });
    expect(performSapperBuildAction({ buildSupply: 6, generalSupply: 0, projectProgress: 4 })).toEqual({
      legal: true,
      state: { buildSupply: 3, generalSupply: 0, projectProgress: 7 },
      supplySpent: 3,
      progressAdded: 3,
    });
    expect(performSapperBuildAction({ buildSupply: 3, generalSupply: 0, projectProgress: 7 })).toEqual({
      legal: true,
      state: { buildSupply: 0, generalSupply: 0, projectProgress: 10 },
      supplySpent: 3,
      progressAdded: 3,
    });
  });

  it("fails closed when fewer than three Build Supply remain", () => {
    const state = { buildSupply: 2, generalSupply: 1, projectProgress: 3 };
    expect(performSapperBuildAction(state)).toEqual({
      legal: false,
      reason: "Sapper construction requires 3 Build Supply.",
      state,
      supplySpent: 0,
      progressAdded: 0,
    });
  });

  it("reloads the complete Sapper pool for exactly one General Supply crate", () => {
    expect(reloadSapperBuildSupply({ buildSupply: 0, generalSupply: 2, projectProgress: 6 })).toEqual({
      legal: true,
      state: { buildSupply: 6, generalSupply: 1, projectProgress: 6 },
      supplySpent: 1,
      progressAdded: 0,
    });
  });

  it("rejects a full reload, missing General Supply, and malformed state without mutation", () => {
    expect(reloadSapperBuildSupply({ buildSupply: 6, generalSupply: 1, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/already full/i) });
    expect(reloadSapperBuildSupply({ buildSupply: 3, generalSupply: 0, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/General Supply/i) });
    expect(performSapperBuildAction({ buildSupply: 7, generalSupply: 1, projectProgress: 0 }))
      .toMatchObject({ legal: false, reason: expect.stringMatching(/state is invalid/i) });
  });

  it("rejects invalid profiles instead of inferring replacement values", () => {
    expect(performSapperBuildAction(
      { buildSupply: 6, generalSupply: 1, projectProgress: 0 },
      { ...SOURCE_SAPPER_BUILD_PROFILE, progressPerAction: 0 },
    )).toMatchObject({ legal: false, reason: expect.stringMatching(/profile is invalid/i) });
  });
});

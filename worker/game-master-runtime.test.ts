import { describe, expect, it } from "vitest";
import { generateAdminMap } from "../packages/rules-engine/src";
import {
  gameMasterScenarioContentKey,
  materializeGameMasterCampaignState,
  materializeGameMasterEnemyDeployment,
  selectGameMasterInsertionHex,
} from "./game-master-runtime";

const campaignId = `gm-campaign-${"a".repeat(32)}`;

describe("Game Master custom-map runtime materialization", () => {
  it("selects a deterministic passable non-water insertion hex", () => {
    const document = generateAdminMap({ preset: "ISLANDS", seed: "runtime-zone", width: 18, height: 14 });
    const first = selectGameMasterInsertionHex(document);
    const replay = selectGameMasterInsertionHex(document);

    expect(replay.coord).toEqual(first.coord);
    expect(first.visualTerrainId).not.toMatch(/^WATER_/);
    expect(first.movementRules).toMatchObject({ groundTraversal: "PASSABLE" });
  });

  it("materializes the exact map as a neutral scenario with the pinned skirmish policy", () => {
    const document = generateAdminMap({ preset: "MIXED", seed: "runtime-state", width: 18, height: 14 });
    const state = materializeGameMasterCampaignState({
      campaignId,
      campaignName: "Operation Runtime State",
      planetName: "Corinth",
      document,
      alliedDeployments: [],
      now: 10_000,
      durationMs: 300_000,
    });

    expect(state.scenarioId).toBe(`scenario-${campaignId}`);
    expect(`${state.scenarioId}@${state.scenarioVersion}`).toBe(gameMasterScenarioContentKey(campaignId));
    expect(state.map).toHaveLength(document.cells.length);
    expect(state.map.every((hex) => hex.control === "NEUTRAL" && hex.visibility === "UNKNOWN")).toBe(true);
    expect(state.objectives).toEqual([]);
    expect(state.deployments).toEqual([]);
    expect(state.scenarioPolicy).toEqual({
      policyId: "game-master-skirmish",
      version: 1,
      maxRounds: 12,
      rewardPolicyId: "public-v1-economy@1",
    });
    expect(state.map.some((hex) => hex.edges.paths !== undefined && hex.edges.walls !== undefined)).toBe(true);
  });

  it("materializes a valid manual clock without scheduling an immediate round", () => {
    const document = generateAdminMap({ preset: "ISLANDS", seed: "manual-clock", width: 18, height: 14 });
    const state = materializeGameMasterCampaignState({
      campaignId,
      campaignName: "Manual Watch",
      planetName: "Corinth",
      document,
      alliedDeployments: [],
      now: 1_000,
      durationMs: 0,
    });

    expect(state.clock).toMatchObject({
      durationMs: 0,
      lockLeadMs: 0,
      lockAt: 0,
      resolvesAt: 0,
      schedule: [],
    });
    expect(state.events[0]?.payload.deadline).toBeNull();
  });

  it("hydrates an explicitly spawned governed enemy definition server-side", () => {
    const deployment = materializeGameMasterEnemyDeployment(campaignId, {
      id: "gm:spawn-1",
      definitionId: "enemy-bug-warrior",
      callsign: "TALON-1",
      coord: { q: 4, r: 3 },
      facing: 2,
    });

    expect(deployment).toMatchObject({
      campaignId,
      side: "ENEMY",
      definitionId: "enemy-bug-warrior",
      callsign: "TALON-1",
      status: "ACTIVE",
      position: { q: 4, r: 3 },
      facing: 2,
      allowedActions: ["ATTACK"],
    });
    expect(deployment.currentHealth).toBe(deployment.stats.maxHealth);
    expect(deployment.persistentUnitId).toBeUndefined();
  });
});

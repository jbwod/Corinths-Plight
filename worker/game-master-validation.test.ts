import { describe, expect, it } from "vitest";
import {
  GameMasterValidationError,
  parseGameMasterCampaignCreate,
  parseGameMasterEnemySpawn,
  parseGameMasterMapPublish,
  parseGameMasterMapSave,
  parseGameMasterControl,
  parseGameMasterObjectiveCreate,
  parseGameMasterObjectiveUpdate,
  parseGameMasterRevive,
} from "./game-master-validation";
import { generateAdminMap } from "../packages/rules-engine/src";

const base = {
  commandId: "gm-cmd-0001",
  expectedCampaignVersion: 7,
};

describe("game master command validation", () => {
  it("parses a strict objective create command and normalizes text", () => {
    expect(parseGameMasterObjectiveCreate({
      ...base,
      objective: {
        id: "objective-ridge",
        name: "  Kestrel Ridge  ",
        description: "  Hold the ridge.  ",
        coord: { q: -4, r: 11 },
        owner: "NEUTRAL",
        status: "ACTIVE",
      },
    })).toEqual({
      operation: "OBJECTIVE_CREATE",
      ...base,
      objective: {
        id: "objective-ridge",
        name: "Kestrel Ridge",
        description: "Hold the ridge.",
        coord: { q: -4, r: 11 },
        owner: "NEUTRAL",
        status: "ACTIVE",
      },
    });
  });

  it("parses a non-empty objective patch without accepting an objective ID", () => {
    expect(parseGameMasterObjectiveUpdate({
      ...base,
      patch: { owner: "ALLIED", status: "SECURED", description: "" },
    })).toEqual({
      operation: "OBJECTIVE_UPDATE",
      ...base,
      patch: { owner: "ALLIED", status: "SECURED", description: "" },
    });
    expect(() => parseGameMasterObjectiveUpdate({ ...base, patch: {} }))
      .toThrowError(expect.objectContaining({ path: "$.patch" }));
    expect(() => parseGameMasterObjectiveUpdate({ ...base, patch: { id: "forged-id" } }))
      .toThrowError(expect.objectContaining({ path: "$.patch" }));
  });

  it("parses revive and enemy spawn bodies with URL-owned deployment IDs omitted", () => {
    expect(parseGameMasterRevive(base)).toEqual({ operation: "DEPLOYMENT_REVIVE", ...base });
    expect(parseGameMasterEnemySpawn({
      ...base,
      definitionId: "enemy-bug-warrior",
      callsign: "  Talon 3  ",
      coord: { q: 3, r: -2 },
      facing: 5,
    })).toEqual({
      operation: "ENEMY_SPAWN",
      ...base,
      definitionId: "enemy-bug-warrior",
      callsign: "Talon 3",
      coord: { q: 3, r: -2 },
      facing: 5,
    });
  });

  it.each([
    [{ ...base, commandId: "short" }, "$.commandId"],
    [{ ...base, expectedCampaignVersion: 0 }, "$.expectedCampaignVersion"],
    [{ ...base, expectedCampaignVersion: 1.5 }, "$.expectedCampaignVersion"],
    [{ ...base, commandRole: "ADMIN" }, "$"],
  ])("rejects an invalid revive envelope", (input, path) => {
    expect(() => parseGameMasterRevive(input)).toThrowError(expect.objectContaining({
      code: "GAME_MASTER_COMMAND_INVALID",
      path,
    }));
  });

  it.each([
    [{ q: 10_001, r: 0 }, "$.coord.q"],
    [{ q: 0, r: -10_001 }, "$.coord.r"],
    [{ q: 0.5, r: 0 }, "$.coord.q"],
    [{ q: 0, r: 0, elevation: 4 }, "$.coord"],
  ])("rejects an unsafe spawn coordinate", (coord, path) => {
    expect(() => parseGameMasterEnemySpawn({
      ...base,
      definitionId: "enemy-bug-warrior",
      callsign: "Talon",
      coord,
      facing: 2,
    })).toThrowError(expect.objectContaining({ path }));
  });

  it("rejects unsupported objective enums, facing, and overlong text", () => {
    expect(() => parseGameMasterObjectiveCreate({
      ...base,
      objective: {
        id: "ridge",
        name: "Ridge",
        description: "Hold.",
        coord: { q: 0, r: 0 },
        owner: "PLAYER",
        status: "ACTIVE",
      },
    })).toThrowError(expect.objectContaining({ path: "$.objective.owner" }));
    expect(() => parseGameMasterEnemySpawn({
      ...base,
      definitionId: "enemy-bug-warrior",
      callsign: "x".repeat(81),
      coord: { q: 0, r: 0 },
      facing: 6,
    })).toThrowError(expect.objectContaining({ path: "$.facing" }));
  });

  it("exposes a dedicated typed validation error", () => {
    try {
      parseGameMasterRevive(null);
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GameMasterValidationError);
      expect(error).toMatchObject({ code: "GAME_MASTER_COMMAND_INVALID", path: "$" });
    }
  });

  it("parses canonical map authoring commands without rewriting their document", () => {
    const document = generateAdminMap({ preset: "MIXED", seed: "gm-map-save", width: 18, height: 14 });
    expect(parseGameMasterMapSave({
      commandId: "gm-map-save-0001",
      mapId: "gm-map-existing",
      expectedRevision: 4,
      name: "  Kestrel Expanse  ",
      planetId: "planet-corinth",
      mechanicsMapping: {},
      document,
    })).toEqual({
      operation: "MAP_SAVE",
      commandId: "gm-map-save-0001",
      mapId: "gm-map-existing",
      expectedRevision: 4,
      name: "Kestrel Expanse",
      planetId: "planet-corinth",
      mechanicsMapping: {},
      document,
    });
    expect(parseGameMasterMapPublish({ commandId: "gm-map-publish-1", expectedRevision: 2 }))
      .toEqual({ operation: "MAP_PUBLISH", commandId: "gm-map-publish-1", expectedRevision: 2 });
  });

  it("rejects invented terrain profiles and invalid campaign authoring policy", () => {
    const document = generateAdminMap({ preset: "ICY", seed: "gm-map-invalid", width: 18, height: 14 });
    const usedBiome = document.cells[0]!.visualBiomeId;
    const lockedCell = document.cells.find((cell) => cell.mechanicalTerrainProfileId !== "terrain-open")!;
    expect(() => parseGameMasterMapSave({
      commandId: "gm-map-save-0002",
      name: "Ice",
      mechanicsMapping: { [usedBiome]: "terrain-lava" },
      document,
    })).toThrowError(expect.objectContaining({ path: `$.mechanicsMapping.${usedBiome}` }));
    expect(() => parseGameMasterMapSave({
      commandId: "gm-map-save-0003",
      name: "Ice Override",
      mechanicsMapping: { [lockedCell.visualBiomeId]: "terrain-open" },
      document,
    })).toThrowError(expect.objectContaining({ path: `$.mechanicsMapping.${lockedCell.visualBiomeId}` }));
    expect(() => parseGameMasterCampaignCreate({
      commandId: "gm-campaign-0001",
      name: "Ice Watch",
      planetId: "planet-corinth",
      mapId: "gm-map-1",
      mapRevision: 1,
      mapContentHash: `sha256:${"0".repeat(64)}`,
      roundDurationMs: 86_400_001,
    })).toThrowError(expect.objectContaining({ path: "$.roundDurationMs" }));
  });

  it("requires an exact immutable map revision and content hash for campaign creation", () => {
    const mapContentHash = `sha256:${"a".repeat(64)}` as const;
    expect(parseGameMasterCampaignCreate({
      commandId: "gm-campaign-0002",
      name: "Published Expanse",
      planetId: "planet-corinth",
      mapId: "gm-map-1",
      mapRevision: 7,
      mapContentHash,
      roundDurationMs: 300_000,
    })).toEqual({
      operation: "CAMPAIGN_CREATE",
      commandId: "gm-campaign-0002",
      name: "Published Expanse",
      planetId: "planet-corinth",
      mapId: "gm-map-1",
      mapRevision: 7,
      mapContentHash,
      roundDurationMs: 300_000,
    });
    expect(() => parseGameMasterCampaignCreate({
      commandId: "gm-campaign-0003",
      name: "Unpinned Expanse",
      planetId: "planet-corinth",
      mapId: "gm-map-1",
      mapRevision: 7,
      mapContentHash: "sha256:not-a-hash",
      roundDurationMs: 300_000,
    })).toThrowError(expect.objectContaining({ path: "$.mapContentHash" }));
    expect(() => parseGameMasterCampaignCreate({
      commandId: "gm-campaign-0004",
      name: "Too Fast Expanse",
      planetId: "planet-corinth",
      mapId: "gm-map-1",
      mapRevision: 7,
      mapContentHash,
      roundDurationMs: 4_999,
    })).toThrowError(expect.objectContaining({ path: "$.roundDurationMs" }));
  });

  it("pins campaign control commands to a version and resolve to a round", () => {
    expect(parseGameMasterControl(base, "CAMPAIGN_PAUSE")).toEqual({
      operation: "CAMPAIGN_PAUSE",
      ...base,
    });
    expect(parseGameMasterControl({ ...base, expectedRound: 7 }, "ROUND_RESOLVE")).toEqual({
      operation: "ROUND_RESOLVE",
      ...base,
      expectedRound: 7,
    });
    expect(() => parseGameMasterControl(base, "ROUND_RESOLVE"))
      .toThrowError(expect.objectContaining({ path: "$.expectedRound" }));
    expect(() => parseGameMasterControl({ ...base, expectedRound: 7 }, "CAMPAIGN_RESUME"))
      .toThrowError(expect.objectContaining({ path: "$" }));
  });
});

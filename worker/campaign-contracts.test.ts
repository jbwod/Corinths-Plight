import { createDemoCampaignState, createScenarioCampaignState, resolveRound } from "../packages/rules-engine/src";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STORAGE_SCHEMA_VERSION,
  CampaignRequestContractError,
  assertCampaignMutationBodyEmpty,
  campaignCommandHash,
  canonicalCampaignJson,
  encodeCampaignStoredState,
  parseCampaignClockIntent,
  parseCampaignOrderIntent,
  parseCampaignStoredState,
} from "./campaign-contracts";

const CAMPAIGN_ID = "outpost-k17";
const ORDER_COMMAND = {
  commandId: "command-order-0001",
  expectedCampaignVersion: 1,
  expectedOrderRevision: 0,
} as const;
const CLOCK_COMMAND = {
  commandId: "command-clock-0001",
  expectedCampaignVersion: 1,
} as const;

describe("campaign order request contracts", () => {
  it("accepts intent fields while leaving action economy to the server", () => {
    expect(parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "deployment-allied-infantry",
      round: 2,
      orderType: "ADVANCE",
      lifecycle: "SUBMITTED",
      route: [{ q: -2, r: 1 }, { q: -1, r: 1 }],
      facing: 2,
      actions: [{
        type: "ATTACK",
        targetDeploymentId: "deployment-enemy-warrior",
        weaponId: "rifle",
        equipmentIds: ["equipment-optics"],
      }],
    })).toEqual({
      ...ORDER_COMMAND,
      unitId: "deployment-allied-infantry",
      round: 2,
      orderType: "ADVANCE",
      lifecycle: "SUBMITTED",
      route: [{ q: -2, r: 1 }, { q: -1, r: 1 }],
      facing: 2,
      actions: [{
        type: "ATTACK",
        targetDeploymentId: "deployment-enemy-warrior",
        weaponId: "rifle",
        equipmentIds: ["equipment-optics"],
      }],
      incidentalActions: undefined,
    });
  });

  it("accepts weaponless Reload intent for server-authorized resource reload handlers", () => {
    expect(parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "deployment-allied-medic",
      orderType: "HOLD",
      facing: 2,
      actions: [{ type: "RELOAD" }],
    }).actions).toEqual([{ type: "RELOAD" }]);
  });

  it("accepts only the explicit Engineer Repair choices", () => {
    expect(parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "deployment-allied-engineers",
      orderType: "HOLD",
      facing: 2,
      actions: [{
        type: "REPAIR",
        targetDeploymentId: "deployment-allied-tank",
        payload: { repairKind: "HIT" },
      }],
    }).actions).toEqual([{
      type: "REPAIR",
      targetDeploymentId: "deployment-allied-tank",
      payload: { repairKind: "HIT" },
    }]);

    expect(parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "deployment-allied-engineers",
      orderType: "HOLD",
      facing: 2,
      actions: [{
        type: "REPAIR",
        targetDeploymentId: "deployment-allied-tank",
        payload: { repairKind: "SUBSYSTEM", subsystemId: "mobility" },
      }],
    }).actions).toEqual([{
      type: "REPAIR",
      targetDeploymentId: "deployment-allied-tank",
      payload: { repairKind: "SUBSYSTEM", subsystemId: "mobility" },
    }]);
  });

  it.each([
    ["unknown order field", { unitId: "unit-1", orderType: "HOLD", facing: 0, economy: "STANDARD" }],
    ["invalid campaign version", { unitId: "unit-1", orderType: "HOLD", facing: 0, expectedCampaignVersion: 0 }],
    ["invalid order revision", { unitId: "unit-1", orderType: "HOLD", facing: 0, expectedOrderRevision: -1 }],
    ["client action economy", { unitId: "unit-1", orderType: "HOLD", facing: 0, actions: [{ type: "ATTACK", economy: "INCIDENTAL" }] }],
    ["client action cost", { unitId: "unit-1", orderType: "HOLD", facing: 0, actions: [{ type: "ATTACK", speedCost: -99 }] }],
    ["client ammunition audit", {
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: [{ type: "ATTACK", targetDeploymentId: "unit-2", weaponId: "rifle", ammoRequested: 99 }],
    }],
    ["unrelated weapon field", {
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: [{ type: "SCAN", targetHex: { q: 0, r: 0 }, weaponId: "rifle" }],
    }],
    ["arbitrary action payload", { unitId: "unit-1", orderType: "HOLD", facing: 0, actions: [{ type: "ATTACK", payload: { revealAll: true } }] }],
    ["First Aid without a target", { unitId: "unit-1", orderType: "HOLD", facing: 0, actions: [{ type: "HEAL" }] }],
    ["client-authored First Aid amount", {
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: [{ type: "HEAL", targetDeploymentId: "unit-2", amount: 99 }],
    }],
    ["Engineer Repair without target", {
      unitId: "unit-1", orderType: "HOLD", facing: 0,
      actions: [{ type: "REPAIR", payload: { repairKind: "HIT" } }],
    }],
    ["Engineer Repair without choice", {
      unitId: "unit-1", orderType: "HOLD", facing: 0,
      actions: [{ type: "REPAIR", targetDeploymentId: "unit-2" }],
    }],
    ["subsystem Repair without subsystem", {
      unitId: "unit-1", orderType: "HOLD", facing: 0,
      actions: [{ type: "REPAIR", targetDeploymentId: "unit-2", payload: { repairKind: "SUBSYSTEM" } }],
    }],
    ["client-authored Repair amount", {
      unitId: "unit-1", orderType: "HOLD", facing: 0,
      actions: [{ type: "REPAIR", targetDeploymentId: "unit-2", payload: { repairKind: "HIT", amount: 99 } }],
    }],
    ["invalid facing", { unitId: "unit-1", orderType: "HOLD", facing: 6 }],
    ["invalid round", { unitId: "unit-1", round: 0, orderType: "HOLD", facing: 0 }],
    ["fractional coordinate", { unitId: "unit-1", orderType: "ADVANCE", facing: 0, route: [{ q: 0.5, r: 1 }] }],
    ["oversized roleplay", { unitId: "unit-1", orderType: "HOLD", facing: 0, optionalRoleplayText: "x".repeat(501) }],
    ["too many actions", { unitId: "unit-1", orderType: "HOLD", facing: 0, actions: Array.from({ length: 17 }, () => ({ type: "ATTACK" })) }],
    ["too many combined actions", {
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: Array.from({ length: 8 }, () => ({ type: "SCAN" })),
      incidentalActions: Array.from({ length: 9 }, () => ({ type: "SCAN" })),
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCampaignOrderIntent({ ...ORDER_COMMAND, ...input })).toThrow(CampaignRequestContractError);
  });

  it("allows only the explicit unload payload shape", () => {
    expect(parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: [{ type: "UNLOAD", payload: { cargoDeploymentId: "unit-2", mode: "PARADROP" } }],
    }).actions).toEqual([
      { type: "UNLOAD", payload: { cargoDeploymentId: "unit-2", mode: "PARADROP" } },
    ]);
    expect(() => parseCampaignOrderIntent({
      ...ORDER_COMMAND,
      unitId: "unit-1",
      orderType: "HOLD",
      facing: 0,
      actions: [{ type: "UNLOAD", payload: { mode: "STANDARD" } }],
    })).toThrow(/Only PARADROP/);
  });

  it("hashes canonical command content with SHA-256", async () => {
    expect(canonicalCampaignJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
    const left = await campaignCommandHash({ z: 1, a: { y: 2, b: 3 } });
    const reordered = await campaignCommandHash({ a: { b: 3, y: 2 }, z: 1 });
    const changed = await campaignCommandHash({ a: { b: 4, y: 2 }, z: 1 });
    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(left);
    expect(changed).not.toBe(left);
  });
});

describe("campaign clock request contracts", () => {
  it.each(["manual", "1m", "5m", "30m", "24h"] as const)("accepts the %s preset", (preset) => {
    expect(parseCampaignClockIntent({ ...CLOCK_COMMAND, preset })).toEqual({ ...CLOCK_COMMAND, preset });
  });

  it("accepts a bounded custom duration", () => {
    expect(parseCampaignClockIntent({ ...CLOCK_COMMAND, durationMs: 42_000 })).toEqual({ ...CLOCK_COMMAND, durationMs: 42_000 });
  });

  it.each([
    {},
    { preset: "1h" },
    { preset: "5m", durationMs: 300_000 },
    { durationMs: -1 },
    { durationMs: 1 },
    { durationMs: 86_400_001 },
    { durationMs: 1.5 },
    { durationMs: 0, admin: true },
  ])("rejects ambiguous or invalid clocks", (input) => {
    expect(() => parseCampaignClockIntent({ ...CLOCK_COMMAND, ...input })).toThrow(CampaignRequestContractError);
  });

  it("enforces an exact empty-body contract for bodyless mutations", async () => {
    await expect(assertCampaignMutationBodyEmpty(new Request("https://campaign.internal/pause", { method: "POST" })))
      .resolves.toBeUndefined();
    await expect(assertCampaignMutationBodyEmpty(new Request("https://campaign.internal/pause", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }))).rejects.toThrow(CampaignRequestContractError);
  });
});

describe("versioned campaign Durable Object storage", () => {
  function fixture() {
    return createDemoCampaignState(100_000, 300_000, CAMPAIGN_ID);
  }

  it("accepts and identifies a legacy raw state for transparent migration", () => {
    const state = fixture();
    delete state.scenarioPolicy;
    const parsed = parseCampaignStoredState(state, CAMPAIGN_ID);

    expect(parsed).toEqual({ state, legacy: true });
  });

  it("round-trips the current storage envelope", () => {
    const state = fixture();
    const stored = encodeCampaignStoredState(state);

    expect(stored.schemaVersion).toBe(CAMPAIGN_STORAGE_SCHEMA_VERSION);
    expect(parseCampaignStoredState(stored, CAMPAIGN_ID)).toEqual({ state, legacy: false });
  });

  it("round-trips authored reserve waves without exposing an invalid deployment shape", () => {
    const state = createScenarioCampaignState({
      mapSourceKey: "fixture/outpost-k17",
      campaignId: CAMPAIGN_ID,
      campaignName: "Hold the Relay",
      planetName: "Corinth",
      now: 100_000,
      durationMs: 300_000,
      alliedDeployments: fixture().deployments.filter((deployment) => deployment.side === "ALLIED").slice(0, 1),
    });
    const stored = encodeCampaignStoredState(state);

    expect(parseCampaignStoredState(stored, CAMPAIGN_ID)).toEqual({ state, legacy: false });
  });

  it("accepts a state emitted by the pinned round resolver", () => {
    const previousState = fixture();
    const output = resolveRound({
      previousState,
      rulesetVersion: previousState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "contract-test-seed",
      resolutionTime: 110_000,
    });

    expect(parseCampaignStoredState(encodeCampaignStoredState(output.state), CAMPAIGN_ID)).toEqual({
      state: output.state,
      legacy: false,
    });
  });

  it("round-trips a terminal scenario outcome with objective summaries", () => {
    const previousState = fixture();
    previousState.round = 21;
    previousState.clock.schedule.forEach((scheduled) => {
      scheduled.round = 21;
    });
    const output = resolveRound({
      previousState,
      rulesetVersion: previousState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "terminal-contract-test",
      resolutionTime: 110_000,
    });

    expect(output.state.outcome).toMatchObject({
      result: "VICTORY",
      round: 21,
      reason: "FINAL_ROUND_PRIMARY_HELD",
    });
    expect(parseCampaignStoredState(encodeCampaignStoredState(output.state), CAMPAIGN_ID)).toEqual({
      state: output.state,
      legacy: false,
    });
  });

  it("upgrades a previously stored terminal outcome with the fail-closed reward disposition", () => {
    const previousState = fixture();
    previousState.round = 21;
    previousState.clock.schedule.forEach((scheduled) => { scheduled.round = 21; });
    const state = resolveRound({
      previousState,
      rulesetVersion: previousState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "legacy-terminal-reward-upgrade",
      resolutionTime: 110_000,
    }).state;
    const stored = structuredClone(encodeCampaignStoredState(state)) as unknown as {
      schemaVersion: number;
      state: { outcome: Record<string, unknown> };
    };
    delete stored.state.outcome.rewards;

    const parsed = parseCampaignStoredState(stored, CAMPAIGN_ID);
    expect(parsed.legacy).toBe(true);
    expect(parsed.state.outcome?.rewards).toEqual({
      serviceHistory: "RECORDED",
      requisition: { status: "BALANCE_REQUIRED", amount: null, rulesDecisionId: "RC-V5-016" },
    });
  });

  it("fails closed on malformed scenario policies and outcomes", () => {
    const badDuration = fixture();
    (badDuration.scenarioPolicy as unknown as Record<string, unknown>).maxRounds = 0;
    expect(() => encodeCampaignStoredState(badDuration)).toThrow(/scenarioPolicy\.maxRounds/);

    const badObjective = fixture();
    badObjective.scenarioPolicy!.capturableObjectiveIds.push("objective-does-not-exist");
    expect(() => encodeCampaignStoredState(badObjective)).toThrow(/objective does not exist/);

    const previousState = fixture();
    previousState.round = 21;
    previousState.clock.schedule.forEach((scheduled) => {
      scheduled.round = 21;
    });
    const terminal = resolveRound({
      previousState,
      rulesetVersion: previousState.rulesetVersion,
      playerOrders: [],
      enemyOrders: [],
      seed: "malformed-outcome-test",
      resolutionTime: 110_000,
    }).state;
    terminal.outcome!.objectives[0]!.owner = "NEUTRAL";
    expect(() => encodeCampaignStoredState(terminal)).toThrow(/summary does not match objective state/);
  });

  it("rejects another campaign, unknown versions, and malformed critical state", () => {
    expect(() => parseCampaignStoredState(fixture(), "another-campaign")).toThrow(/Durable Object identity/);
    expect(() => parseCampaignStoredState({ schemaVersion: 999, state: fixture() }, CAMPAIGN_ID)).toThrow(/unsupported storage schema/);

    const malformed = fixture();
    malformed.deployments[0]!.position.q = 0.5;
    expect(() => parseCampaignStoredState(malformed, CAMPAIGN_ID)).toThrow(/deployments\[0\]\.position\.q/);

    const extra = { ...fixture(), injectedAuthority: "ADMIN" };
    expect(() => parseCampaignStoredState(extra, CAMPAIGN_ID)).toThrow(/unknown top-level fields/);
  });

  it("fails closed on malformed nested map, weapon, route, clock, and effect data", () => {
    const badEdges = fixture();
    (badEdges.map[0] as unknown as Record<string, unknown>).edges = null;
    expect(() => parseCampaignStoredState(badEdges, CAMPAIGN_ID)).toThrow(/map\[0\]\.edges/);

    const badWeapons = fixture();
    (badWeapons.deployments[0] as unknown as Record<string, unknown>).weapons = [null];
    expect(() => parseCampaignStoredState(badWeapons, CAMPAIGN_ID)).toThrow(/weapons\[0\]/);

    const badRoute = fixture();
    badRoute.orders[0]!.route = [];
    expect(() => encodeCampaignStoredState(badRoute)).toThrow(/route must contain/);

    const badClock = fixture();
    badClock.clock.lockAt = badClock.clock.resolvesAt + 1;
    expect(() => parseCampaignStoredState(badClock, CAMPAIGN_ID)).toThrow(/deadline ordering/);

    const badEffect = fixture();
    (badEffect.pendingPersistentEffects as unknown[]).push({
      idempotencyKey: "effect-root",
      type: "ROOT_ACCESS",
      payload: {},
      status: "PENDING",
    });
    expect(() => parseCampaignStoredState(badEffect, CAMPAIGN_ID)).toThrow(/invalid persistent effect type/);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class<Environment> {
    protected ctx: DurableObjectState;
    protected env: Environment;

    constructor(ctx: DurableObjectState, env: Environment) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import type { Env } from "./env";
import { CampaignDurableObject } from "./campaign-durable-object";
import { encodeCampaignStoredState, parseCampaignStoredState } from "./campaign-contracts";

const CAMPAIGN_ID = "outpost-k17";
const UNIT_ID = "dep-rook-7";

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  alarm: number | null = null;

  async get<Value>(key: string): Promise<Value | undefined> {
    return this.values.get(key) as Value | undefined;
  }

  async put<Value>(key: string, value: Value): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async list<Value>({ prefix = "" }: { prefix?: string } = {}): Promise<Map<string, Value>> {
    return new Map(
      [...this.values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, value as Value]),
    );
  }

  async transaction<Value>(closure: (transaction: DurableObjectTransaction) => Promise<Value>): Promise<Value> {
    return closure({
      get: this.get.bind(this),
      put: this.put.bind(this),
    } as unknown as DurableObjectTransaction);
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(value: number): Promise<void> {
    this.alarm = value;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

class EffectStatement {
  constructor(
    readonly database: EffectDatabase,
    readonly query: string,
    readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]): D1PreparedStatement {
    return new EffectStatement(this.database, this.query, bindings) as unknown as D1PreparedStatement;
  }

  async first(): Promise<Record<string, unknown> | null> {
    if (this.query.includes("FROM campaign_effect_receipts")) {
      return this.database.receipts.has(String(this.bindings[0])) ? { applied: 1 } : null;
    }
    if (this.query.includes("FROM campaign_results")) {
      return this.database.results.get(String(this.bindings[0])) === String(this.bindings[1]) ? { applied: 1 } : null;
    }
    if (this.query.includes("FROM strategic_operations AS operations")) {
      return this.database.linkedOperation;
    }
    if (
      this.query.includes("SELECT 1 FROM strategic_nodes") ||
      this.query.includes("SELECT 1 FROM strategic_routes") ||
      this.query.includes("SELECT 1 FROM strategic_operations")
    ) {
      return { exists: 1 };
    }
    return null;
  }
}

class EffectDatabase {
  fail = true;
  readonly receipts = new Set<string>();
  readonly results = new Map<string, string>();
  readonly appliedQueries: string[] = [];
  linkedOperation: Record<string, unknown> | null = null;

  prepare(query: string): D1PreparedStatement {
    return new EffectStatement(this, query) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    if (this.fail) throw new Error("D1_EFFECT_WRITE_FAILED");
    for (const raw of statements) {
      const statement = raw as unknown as EffectStatement;
      this.appliedQueries.push(statement.query);
      if (statement.query.includes("INSERT INTO campaign_effect_receipts")) {
        this.receipts.add(String(statement.bindings[0]));
      }
      if (statement.query.includes("INSERT INTO campaign_results")) {
        this.results.set(String(statement.bindings[0]), String(statement.bindings[9]));
      }
    }
    return statements.map(() => ({ success: true, meta: {} })) as D1Result[];
  }
}

function campaignObject(database?: EffectDatabase): { campaign: CampaignDurableObject; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  const context = {
    id: { name: CAMPAIGN_ID, toString: () => CAMPAIGN_ID },
    storage,
    getWebSockets: () => [],
  } as unknown as DurableObjectState;
  const env = {
    ENVIRONMENT: "development",
    DEFAULT_ROUND_DURATION_MS: "300000",
    ORDER_LOCK_LEAD_MS: "30000",
    DB: database,
  } as unknown as Env;
  return { campaign: new CampaignDurableObject(context, env), storage };
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-corinth-user", "demo-user");
  headers.set("x-corinth-side", "ALLIED");
  headers.set("x-corinth-role", "PLAYER");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://campaign.internal${path}`, { ...init, headers });
}

function orderBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    commandId: "command-order-0001",
    expectedCampaignVersion: 1,
    expectedOrderRevision: 0,
    unitId: UNIT_ID,
    orderType: "HOLD",
    facing: 2,
    actions: [],
    ...overrides,
  });
}

describe("CampaignDurableObject campaign contracts", () => {
  it("hydrates governed Supply cargo and towing actions into the tactical state", async () => {
    const { campaign } = campaignObject();
    const response = await campaign.fetch(request("/state"));
    expect(response.status).toBe(200);
    const view = await response.json() as {
      deployments: Array<{
        definitionId: string;
        allowedActions?: string[];
        cargo?: Array<Record<string, unknown>>;
      }>;
    };
    expect(view.deployments.find((deployment) => deployment.definitionId === "unit-logi-truck")?.cargo)
      .toContainEqual(expect.objectContaining({
        kind: "SUPPLY",
        supplyType: "SMALL_SUPPLY",
        quantity: 5,
        transportMode: "STOWED",
      }));
    expect(view.deployments.find((deployment) => deployment.definitionId === "unit-artillery")?.allowedActions)
      .toEqual(expect.arrayContaining(["LOAD", "UNLOAD"]));
  });

  it("accepts a governed Logi transfer without trusting client quantity or economy", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.deployments.find((deployment) => deployment.id === "dep-longbow")!.supplies = { SMALL_SUPPLY: 1 };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-logi-resupply",
        unitId: "dep-mule-3",
        actions: [{ type: "RESUPPLY", targetDeploymentId: "dep-longbow" }],
      }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      order: {
        unitId: "dep-mule-3",
        actions: [{
          type: "RESUPPLY",
          targetDeploymentId: "dep-longbow",
          economy: "STANDARD",
          speedCost: 0.5,
        }],
      },
    });
  });

  it("replays an identical order command and rejects command reuse or a stale revision", async () => {
    const { campaign, storage } = campaignObject();
    const body = orderBody();

    const first = await campaign.fetch(request("/orders", { method: "POST", body }));
    const replay = await campaign.fetch(request("/orders", { method: "POST", body }));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());

    const parsed = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID);
    expect(parsed.state.orders.filter((order) => order.unitId === UNIT_ID)).toHaveLength(1);
    expect(parsed.state.events.filter((event) => event.type === "ORDER_SUBMITTED" && event.actor === UNIT_ID)).toHaveLength(1);

    const reused = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({ lifecycle: "DRAFT" }),
    }));
    expect(reused.status).toBe(409);
    expect(await reused.json()).toMatchObject({ error: { code: "COMMAND_REUSED" } });

    const stale = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({ commandId: "command-order-stale" }),
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "CAMPAIGN_VERSION_CHANGED" } });
  });

  it("validates attacks from the intended endpoint and derives target/ammunition audit fields", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.deployments.find((deployment) => deployment.id === "bug-drone-1")!.position = { q: -1, r: 1 };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));
    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-attack-audit",
        orderType: "ADVANCE",
        route: [{ q: -3, r: 1 }, { q: -2, r: 1 }],
        actions: [{
          type: "ATTACK",
          targetDeploymentId: "bug-drone-1",
          targetHex: { q: 0, r: 0 },
          weaponId: "weapon-infantry-rifle",
          equipmentIds: [],
        }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      order: {
        actions: [{ targetHex: { q: -1, r: 1 }, weaponIds: ["weapon-infantry-rifle"] }],
        ammoUsed: {},
      },
    });
  });

  it("rejects a Fighter target outside its travel-path firing arc before storing the order", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.deployments.find((deployment) => deployment.id === "bug-drone-1")!.position = { q: -3, r: -2 };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-fighter-rear-arc",
        unitId: "dep-vulture-1",
        actions: [{ type: "ATTACK", targetDeploymentId: "bug-drone-1" }],
      }),
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "TARGET_OUTSIDE_FIRING_ARC" } });
    const unchanged = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(unchanged.orders.some((candidate) => candidate.unitId === "dep-vulture-1")).toBe(false);
    expect(unchanged.deployments.find((deployment) => deployment.id === "dep-vulture-1")?.ammunition)
      .toEqual({ "weapon-fighter-snub-hmg": 1 });
  });

  it("accepts governed Evasive orders only with the required displacement", async () => {
    const { campaign } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-evasive-order",
        unitId: "dep-lantern",
        expectedOrderRevision: 1,
        orderType: "EVASIVE",
        route: [{ q: -2, r: -1 }, { q: -3, r: 0 }, { q: -4, r: 0 }, { q: -5, r: 0 }],
      }),
    }));

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    expect(responseBody).toMatchObject({
      order: { unitId: "dep-lantern", orderType: "EVASIVE", endHex: { q: -5, r: 0 } },
    });
  });

  it("derives stationary Primary Crew Repair for a damaged vehicle subsystem", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const tank = seeded.deployments.find((deployment) => deployment.id === "dep-bellator")!;
    tank.subsystems = [{ subsystemId: "MOBILITY", state: "DISABLED", damageSourceId: "bug-heavy-1", damagedRound: 17 }];
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-crew-repair",
        unitId: tank.id,
        actions: [{ type: "CREW_REPAIR", payload: { subsystemId: "MOBILITY" } }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      order: {
        unitId: tank.id,
        orderType: "HOLD",
        route: [tank.position],
        actions: [{
          type: "CREW_REPAIR",
          economy: "PRIMARY",
          speedCost: 0,
          payload: { subsystemId: "MOBILITY" },
        }],
      },
    });
  });

  it("replaces a cancelled deterministic order instead of corrupting state with a duplicate ID", async () => {
    const { campaign, storage } = campaignObject();
    const first = await campaign.fetch(request("/orders", { method: "POST", body: orderBody() }));
    expect(first.status).toBe(201);
    const firstBody = await first.json() as { order: { id: string; revision: number } };
    expect(firstBody.order.revision).toBe(1);

    const cancelled = await campaign.fetch(request(`/orders/${encodeURIComponent(firstBody.order.id)}`, { method: "DELETE" }));
    expect(cancelled.status).toBe(200);

    const replacement = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-order-0002",
        expectedCampaignVersion: 3,
        expectedOrderRevision: 1,
      }),
    }));
    expect(replacement.status).toBe(200);
    const replacementBody = await replacement.json() as { order: { id: string; revision: number } };
    expect(replacementBody.order).toMatchObject({ id: firstBody.order.id, revision: 2 });

    const parsed = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID);
    const matching = parsed.state.orders.filter((order) => order.unitId === UNIT_ID && order.round === parsed.state.round);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ id: firstBody.order.id, revision: 2, lifecycle: "SUBMITTED" });
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
  });

  it("rejects client-authored economy before mutating storage", async () => {
    const { campaign, storage } = campaignObject();
    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: JSON.stringify({
        commandId: "command-invalid-economy",
        expectedCampaignVersion: 1,
        expectedOrderRevision: 0,
        unitId: UNIT_ID,
        orderType: "HOLD",
        facing: 2,
        actions: [{ type: "ATTACK", economy: "INCIDENTAL", speedCost: -100 }],
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "CAMPAIGN_REQUEST_INVALID",
        message: "Unknown fields: economy, speedCost.",
        details: { path: "$.actions[0]" },
      },
    });
    expect(storage.values.has("state/current")).toBe(false);
  });

  it("rejects future-round orders and non-empty bodyless commands", async () => {
    const { campaign } = campaignObject();
    const future = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({ commandId: "command-future-order", round: 19 }),
    }));
    expect(future.status).toBe(422);
    expect(await future.json()).toMatchObject({ error: { code: "FUTURE_ORDER_UNSUPPORTED" } });

    const pause = await campaign.fetch(request("/pause", {
      method: "POST",
      body: "{}",
    }));
    expect(pause.status).toBe(400);
    expect(await pause.json()).toMatchObject({ error: { code: "CAMPAIGN_REQUEST_INVALID" } });
  });

  it("fails closed before reading or mutating allied state with no executable @2 adapter", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const originalOrderCount = seeded.orders.length;
    seeded.deployments.find((deployment) => deployment.id === UNIT_ID)!.definitionId = "unit-heavy-air-transport";
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const before = storage.values.get("state/current");
    const stateResponse = await campaign.fetch(request("/state"));
    expect(stateResponse.status).toBe(500);
    expect(await stateResponse.json()).toMatchObject({
      error: {
        code: "CAMPAIGN_ERROR",
        details: { message: "CAMPAIGN_UNIT_DEFINITION_NOT_EXECUTABLE:unit-heavy-air-transport:NOT_EXECUTABLE" },
      },
    });
    expect(storage.values.get("state/current")).toBe(before);

    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({ commandId: "command-unsupported-unit" }),
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "CAMPAIGN_ERROR" },
    });
    const unchanged = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(unchanged.orders).toHaveLength(originalOrderCount);
    expect(unchanged.orders.some((order) => order.unitId === UNIT_ID)).toBe(false);
    expect(unchanged.version).toBe(1);
  });

  it("requires an explicit expected round for manual resolution", async () => {
    const { campaign } = campaignObject();
    const response = await campaign.fetch(request("/resolve", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "EXPECTED_ROUND_REQUIRED" } });
  });

  it("keeps a terminal scenario on its completed round and clears the alarm", async () => {
    const database = new EffectDatabase();
    database.fail = false;
    database.linkedOperation = {
      id: "strategic-operation-k17-test",
      map_id: "strategic-map-corinth",
      node_id: "node-outpost-k17",
      current_round: 28,
      battalion_id: "battalion-33rd-expeditionary",
      effect_rules_json: JSON.stringify([{
        when: { objectiveId: "objective-outpost", owner: "ALLIED" },
        effects: [
          { type: "STRATEGIC_NODE_CAPTURED", nodeId: "node-outpost-k17", control: "FRIENDLY" },
          { type: "ROUTE_UNLOCKED", routeId: "route-kestrel-outpost-k17" },
          { type: "OPERATION_ACTIVATED", operationId: "strategic-operation-broken-road" },
        ],
      }]),
    };
    const { campaign, storage } = campaignObject(database);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.round = 21;
    seeded.orders = [];
    seeded.phase = "PLANNING";
    seeded.clock = {
      durationMs: 0,
      lockLeadMs: 0,
      roundStartedAt: 1,
      lockAt: 0,
      resolvesAt: 0,
      schedule: [],
    };
    seeded.deployments.forEach((deployment) => {
      deployment.persistentUnitId = undefined;
      if (deployment.side === "ENEMY") {
        deployment.status = "DESTROYED";
        deployment.locationState = "DESTROYED";
        deployment.currentHealth = 0;
      }
    });
    storage.values.set("state/current", encodeCampaignStoredState(seeded));
    storage.alarm = 123;

    const response = await campaign.fetch(request("/resolve", {
      method: "POST",
      headers: { "x-expected-round": "21" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      nextRound: null,
      phase: "COMPLETE",
      outcome: { result: "VICTORY", round: 21, reason: "FINAL_ROUND_PRIMARY_HELD" },
    });
    const completed = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(completed.round).toBe(21);
    expect(completed.phase).toBe("COMPLETE");
    expect(completed.clock.schedule).toEqual([]);
    expect(completed.events).toContainEqual(expect.objectContaining({ type: "CAMPAIGN_COMPLETED", round: 21 }));
    expect(completed.events).not.toContainEqual(expect.objectContaining({ type: "ROUND_STARTED", round: 22 }));
    expect(storage.values.has("resolution/21")).toBe(true);
    expect(database.results.get(CAMPAIGN_ID)).toBe(`${CAMPAIGN_ID}:21:campaign-result`);
    expect(database.appliedQueries.filter((query) => query.includes("INSERT INTO strategic_effect_receipts"))).toHaveLength(3);
    expect(database.appliedQueries.filter((query) => query.includes("INSERT INTO strategic_events"))).toHaveLength(3);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE strategic_nodes SET control_status"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE strategic_routes SET status='OPEN'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE strategic_operations SET status='MUSTERING'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE campaigns SET status='RECRUITING'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("location_kind='RESERVE'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE player_unit_loadouts SET locked_at=NULL"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("status='CANCELLED'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("status='DISEMBARKED'"))).toBe(true);
    expect(database.appliedQueries.some((query) => query.includes("UPDATE battlegroups SET status='RECOVERING'"))).toBe(true);
    expect(storage.alarm).toBeNull();

    const reportIndex = await campaign.fetch(request("/reports"));
    expect(reportIndex.status).toBe(200);
    expect(await reportIndex.json()).toMatchObject({
      campaignId: CAMPAIGN_ID,
      reports: [{
        round: 21,
        status: "RESOLVED",
        eventCount: expect.any(Number),
        digest: expect.any(String),
        terminal: { result: "VICTORY", round: 21 },
      }],
    });

    const pause = await campaign.fetch(request("/pause", { method: "POST" }));
    expect(pause.status).toBe(409);
    expect(await pause.json()).toMatchObject({ error: { code: "CAMPAIGN_COMPLETE" } });
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.phase).toBe("COMPLETE");
  });

  it("keeps the round closed until persistent effects succeed, then advances exactly once", async () => {
    const database = new EffectDatabase();
    const { campaign, storage } = campaignObject(database);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const completedRound = seeded.round;
    const allied = seeded.deployments.find((deployment) => deployment.id === UNIT_ID)!;
    allied.persistentUnitId = "player-unit-rook-7";
    seeded.deployments.forEach((deployment) => {
      if (deployment.side === "ENEMY") {
        deployment.status = "DESTROYED";
        deployment.locationState = "DESTROYED";
        deployment.currentHealth = 0;
      }
    });
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const first = await campaign.fetch(request("/resolve", {
      method: "POST",
      headers: { "x-expected-round": String(completedRound) },
    }));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as {
      nextRound: number | null;
      phase: string;
      resolution: { status: string; effectCount: number; appliedEffectCount: number };
    };
    expect(firstBody).toMatchObject({
      nextRound: null,
      phase: "EFFECTS_PENDING",
      resolution: { status: "EFFECTS_PENDING", appliedEffectCount: 0 },
    });
    expect(firstBody.resolution.effectCount).toBeGreaterThan(0);
    const pending = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(pending).toMatchObject({ round: completedRound, phase: "EFFECTS_PENDING" });
    expect(pending.events).not.toContainEqual(expect.objectContaining({ type: "ROUND_STARTED", round: completedRound + 1 }));
    expect([...storage.values.keys()].filter((key) => key.startsWith("pending-effect/"))).toHaveLength(
      firstBody.resolution.effectCount,
    );
    expect(storage.alarm).not.toBeNull();

    database.fail = false;
    await campaign.alarm();
    const advanced = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(advanced).toMatchObject({ round: completedRound + 1, phase: "PLANNING" });
    expect(advanced.events.filter((event) => event.type === "ROUND_STARTED" && event.round === completedRound + 1)).toHaveLength(1);
    expect([...storage.values.keys()].filter((key) => key.startsWith("pending-effect/"))).toHaveLength(0);
    expect(database.receipts.size).toBe(firstBody.resolution.effectCount);
    expect(database.appliedQueries.some((query) => query.includes("INSERT INTO unit_service_summaries"))).toBe(true);
    expect(storage.values.get(`resolution/${completedRound}`)).toMatchObject({
      status: "RESOLVED",
      effectCount: firstBody.resolution.effectCount,
      appliedEffectCount: firstBody.resolution.effectCount,
    });

    const replay = await campaign.fetch(request("/resolve", {
      method: "POST",
      headers: { "x-expected-round": String(completedRound) },
    }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ duplicate: true, nextRound: completedRound + 1 });
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.round).toBe(completedRound + 1);
    expect(database.receipts.size).toBe(firstBody.resolution.effectCount);
  });

  it("commits clock commands once and rejects replay collisions or stale versions", async () => {
    const { campaign, storage } = campaignObject();
    const body = JSON.stringify({
      commandId: "command-clock-0001",
      expectedCampaignVersion: 1,
      preset: "1m",
    });
    const first = await campaign.fetch(request("/clock", { method: "PATCH", body }));
    const replay = await campaign.fetch(request("/clock", { method: "PATCH", body }));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.version).toBe(2);

    const collision = await campaign.fetch(request("/clock", {
      method: "PATCH",
      body: JSON.stringify({
        commandId: "command-clock-0001",
        expectedCampaignVersion: 1,
        preset: "5m",
      }),
    }));
    expect(collision.status).toBe(409);
    expect(await collision.json()).toMatchObject({ error: { code: "COMMAND_REUSED" } });

    const stale = await campaign.fetch(request("/clock", {
      method: "PATCH",
      body: JSON.stringify({
        commandId: "command-clock-stale",
        expectedCampaignVersion: 1,
        preset: "5m",
      }),
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "CAMPAIGN_VERSION_CHANGED" } });
  });
});

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
import { CAMPAIGN_STATE_CHUNK_BYTES, CampaignDurableObject } from "./campaign-durable-object";
import { encodeCampaignStoredState, parseCampaignStoredState } from "./campaign-contracts";
import {
  createDemoCampaignState,
  createScenarioCampaignState,
  generateAdminMap,
  IRON_RAIN_SCENARIO_CONTENT_KEY,
} from "../packages/rules-engine/src";
import { selectGameMasterInsertionHex } from "./game-master-runtime";

const CAMPAIGN_ID = "outpost-k17";
const UNIT_ID = "dep-rook-7";

class MemoryStorage {
  readonly values = new Map<string, unknown>();
  alarm: number | null = null;
  failNextPutWhen?: (key: string, value: unknown) => boolean;
  lastTransactionMutationCount = 0;

  private assertValueFits(value: unknown): void {
    const byteLength = value instanceof Uint8Array
      ? value.byteLength
      : new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (byteLength > 2 * 1024 * 1024) throw new Error("MEMORY_STORAGE_VALUE_TOO_LARGE");
  }

  async get<Value>(key: string): Promise<Value | undefined>;
  async get<Value>(keys: string[]): Promise<Map<string, Value>>;
  async get<Value>(keyOrKeys: string | string[]): Promise<Value | undefined | Map<string, Value>> {
    if (Array.isArray(keyOrKeys)) {
      return new Map(keyOrKeys.flatMap((key) => this.values.has(key)
        ? [[key, this.values.get(key) as Value] as const]
        : []));
    }
    return this.values.get(keyOrKeys) as Value | undefined;
  }

  async put<Value>(key: string, value: Value): Promise<void>;
  async put<Value>(entries: Record<string, Value>): Promise<void>;
  async put<Value>(keyOrEntries: string | Record<string, Value>, value?: Value): Promise<void> {
    const entries = typeof keyOrEntries === "string"
      ? [[keyOrEntries, value as Value] as const]
      : Object.entries(keyOrEntries) as Array<[string, Value]>;
    for (const [key, entry] of entries) {
      this.assertValueFits(entry);
      if (this.failNextPutWhen?.(key, entry)) {
        this.failNextPutWhen = undefined;
        throw new Error("MEMORY_STORAGE_INJECTED_WRITE_FAILURE");
      }
      this.values.set(key, entry);
    }
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
    const staged = new Map(this.values);
    const mutations = new Set<string>();
    const get = async <Stored>(keyOrKeys: string | string[]): Promise<Stored | undefined | Map<string, Stored>> => {
      if (Array.isArray(keyOrKeys)) {
        return new Map(keyOrKeys.flatMap((key) => staged.has(key)
          ? [[key, staged.get(key) as Stored] as const]
          : []));
      }
      return staged.get(keyOrKeys) as Stored | undefined;
    };
    const put = async <Stored>(
      keyOrEntries: string | Record<string, Stored>,
      value?: Stored,
    ): Promise<void> => {
      const entries = typeof keyOrEntries === "string"
        ? [[keyOrEntries, value as Stored] as const]
        : Object.entries(keyOrEntries) as Array<[string, Stored]>;
      for (const [key, entry] of entries) {
        this.assertValueFits(entry);
        if (this.failNextPutWhen?.(key, entry)) {
          this.failNextPutWhen = undefined;
          throw new Error("MEMORY_STORAGE_INJECTED_WRITE_FAILURE");
        }
        staged.set(key, entry);
        mutations.add(key);
      }
    };
    const remove = async (keyOrKeys: string | string[]): Promise<boolean | number> => {
      if (Array.isArray(keyOrKeys)) {
        let count = 0;
        for (const key of keyOrKeys) {
          mutations.add(key);
          if (staged.delete(key)) count += 1;
        }
        return count;
      }
      mutations.add(keyOrKeys);
      return staged.delete(keyOrKeys);
    };
    const result = await closure({ get, put, delete: remove } as unknown as DurableObjectTransaction);
    if (mutations.size > 128) throw new Error("MEMORY_STORAGE_TRANSACTION_KEY_LIMIT");
    this.lastTransactionMutationCount = mutations.size;
    this.values.clear();
    for (const [key, value] of staged) this.values.set(key, value);
    return result;
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
    if (this.query.includes("FROM game_master_campaign_scenarios AS scenarios")) {
      return this.database.customScenarioRow;
    }
    if (this.query.includes("FROM enemy_definitions AS enemies") && this.query.includes("JOIN campaigns")) {
      return this.database.enemyDefinitionAllowed ? { id: String(this.bindings[1]) } : null;
    }
    if (this.query.includes("SELECT map_source_key,scenario_content_key") && this.query.includes("FROM campaigns")) {
      return this.database.campaignRow;
    }
    if (this.query.includes("FROM campaigns") && this.query.includes("JOIN planets")) {
      return this.database.campaignRow;
    }
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

  async all<T>(): Promise<D1Result<T>> {
    if (this.query.includes("FROM status_effect_definitions AS definitions")) {
      return {
        success: true,
        meta: {},
        results: this.database.permanentStatusEffectIds.map((id) => ({ id })) as T[],
      } as D1Result<T>;
    }
    if (this.query.includes("FROM deployments JOIN player_units")) {
      return { success: true, meta: {}, results: this.database.deploymentRows as T[] } as D1Result<T>;
    }
    if (this.query.includes("FROM strategic_effect_receipts AS receipts")) {
      return {
        success: true,
        meta: {},
        results: [...this.database.strategicConsequences.values()] as T[],
      } as D1Result<T>;
    }
    return { success: true, meta: {}, results: [] } as unknown as D1Result<T>;
  }
}

class EffectDatabase {
  fail = true;
  readonly receipts = new Set<string>();
  readonly results = new Map<string, string>();
  readonly appliedQueries: string[] = [];
  readonly strategicConsequences = new Map<string, {
    effect_type: string;
    target_type: string;
    target_id: string;
    event_type: string | null;
    summary: string | null;
  }>();
  linkedOperation: Record<string, unknown> | null = null;
  campaignRow: Record<string, unknown> | null = null;
  customScenarioRow: Record<string, unknown> | null = null;
  enemyDefinitionAllowed = false;
  permanentStatusEffectIds: string[] = [];
  deploymentRows: Record<string, unknown>[] = [];

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
      if (statement.query.includes("INSERT INTO strategic_effect_receipts")) {
        this.strategicConsequences.set(String(statement.bindings[0]), {
          effect_type: String(statement.bindings[4]),
          target_type: String(statement.bindings[5]),
          target_id: String(statement.bindings[6]),
          event_type: null,
          summary: null,
        });
      }
      if (statement.query.includes("INSERT INTO strategic_events")) {
        const key = String(statement.bindings[10]).replace(/:event$/, "");
        const consequence = this.strategicConsequences.get(key);
        if (consequence) {
          consequence.event_type = String(statement.bindings[3]);
          consequence.summary = String(statement.bindings[7]);
        }
      }
    }
    return statements.map(() => ({ success: true, meta: {} })) as D1Result[];
  }
}

function campaignObject(
  database?: EffectDatabase,
  campaignId = CAMPAIGN_ID,
): { campaign: CampaignDurableObject; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  const context = {
    id: { name: campaignId, toString: () => campaignId },
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

function adminRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-corinth-user", "demo-admin");
  headers.set("x-corinth-side", "ALLIED");
  headers.set("x-corinth-role", "ADMIN");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://campaign.internal${path}`, { ...init, headers });
}

function globalGameMasterRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-corinth-global-game-master", "1");
  return adminRequest(path, { ...init, headers });
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

function ironRainState(campaignId: string) {
  const alliedDeployments = createDemoCampaignState(1_000).deployments
    .filter((deployment) => deployment.side === "ALLIED")
    .slice(0, 1)
    .map((deployment) => ({ ...deployment, campaignId, ownerId: "demo-user" }));
  return createScenarioCampaignState({
    mapSourceKey: "fixture/operation-iron-rain",
    scenarioContentKey: IRON_RAIN_SCENARIO_CONTENT_KEY,
    campaignId,
    campaignName: "Operation Iron Rain",
    planetName: "Corinth",
    now: 1_000,
    durationMs: 300_000,
    alliedDeployments,
  });
}

function configureCustomCampaign(
  database: EffectDatabase,
  campaignId: string,
  document = generateAdminMap({ preset: "MIXED", seed: "do-custom-runtime", width: 18, height: 14 }),
): void {
  const mapId = "gm-map-runtime";
  const revision = 2;
  const revisionId = `${mapId}@${revision}`;
  const scenarioId = `scenario-${campaignId}`;
  const scenarioContentKey = `${scenarioId}@2`;
  const mapSourceKey = `admin-map/${mapId}@${revision}:${document.hash}`;
  const insertion = selectGameMasterInsertionHex(document);
  const infantry = createDemoCampaignState(1_000).deployments
    .find((deployment) => deployment.side === "ALLIED" && deployment.definitionId === "unit-infantry-squad")!;
  database.campaignRow = {
    id: campaignId,
    status: "RECRUITING",
    name: "Operation Custom Runtime",
    map_source_key: mapSourceKey,
    scenario_content_key: scenarioContentKey,
    game_master_map_revision_id: revisionId,
    round_duration_ms: 300_000,
    planet_name: "Corinth",
  };
  database.customScenarioRow = {
    scenario_id: scenarioId,
    scenario_version: 2,
    scenario_content_key: scenarioContentKey,
    map_revision_id: revisionId,
    map_content_hash: document.hash,
    objectives_json: "[]",
    enemy_deployments_json: "[]",
    application_policy_key: "game-master-skirmish@1",
    maximum_rounds: 12,
    reward_policy_id: "public-v1-economy@1",
    map_id: mapId,
    map_revision: revision,
    revision_content_hash: document.hash,
    document_json: JSON.stringify(document),
    map_source_key: mapSourceKey,
    campaign_scenario_content_key: scenarioContentKey,
    campaign_map_revision_id: revisionId,
  };
  database.deploymentRows = [{
    id: `deployment:${campaignId}:rook-custom`,
    owner_id: "demo-user",
    side: "ALLIED",
    status: "READY",
    snapshot_json: JSON.stringify({ ...infantry, position: insertion.coord }),
    persistent_unit_id: "rook-custom",
    ruleset_id: "ruleset-v5-core-curated-1",
    definition_id: "unit-infantry-squad",
    callsign: "ROOK-CUSTOM",
    battlegroup_id: null,
  }];
}

function storedCampaignState(storage: MemoryStorage, campaignId: string) {
  const root = storage.values.get("state/current");
  if (
    root && typeof root === "object" && !Array.isArray(root) &&
    (root as { storageFormat?: unknown }).storageFormat === "CORINTH_CAMPAIGN_STATE_CHUNKS"
  ) {
    const manifest = root as {
      generation: string;
      chunkCount: number;
      byteLength: number;
    };
    const bytes = new Uint8Array(manifest.byteLength);
    let offset = 0;
    for (let index = 0; index < manifest.chunkCount; index += 1) {
      const key = `state/chunk/${String(index).padStart(6, "0")}`;
      const chunk = storage.values.get(key);
      if (!(chunk instanceof Uint8Array)) throw new Error(`TEST_STATE_CHUNK_MISSING:${index}`);
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return parseCampaignStoredState(
      JSON.parse(new TextDecoder().decode(bytes)),
      campaignId,
    ).state;
  }
  return parseCampaignStoredState(root, campaignId).state;
}

describe("CampaignDurableObject campaign contracts", () => {
  it("returns a fog-safe campaign summary without tactical map, orders, or events", async () => {
    const { campaign, storage } = campaignObject(undefined, CAMPAIGN_ID);
    const state = createDemoCampaignState(100_000);
    storage.values.set("state/current", encodeCampaignStoredState(state));

    const response = await campaign.fetch(request("/summary"));
    const summary = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(summary).toMatchObject({
      campaignId: state.campaignId,
      round: state.round,
      phase: state.phase,
      deployments: { enemy: { visibility: "VISIBLE_ONLY" }, allied: { visibility: "EXACT" } },
    });
    expect(summary).not.toHaveProperty("map");
    expect(summary).not.toHaveProperty("orders");
    expect(summary).not.toHaveProperty("events");
    expect(summary).not.toHaveProperty("resolutions");
    expect(summary).not.toHaveProperty("pendingPersistentEffects");
    expect(summary.viewerUnits).toEqual(
      state.deployments
        .filter((deployment) => deployment.ownerId === "demo-user" && deployment.locationState !== "RESERVE")
        .map((deployment) => expect.objectContaining({
          id: deployment.id,
          currentHealth: deployment.currentHealth,
          maxHealth: deployment.stats.maxHealth,
        })),
    );
  });

  it("fails closed without materialising latest content for an unpinned legacy campaign", async () => {
    const database = new EffectDatabase();
    const campaignId = "legacy-iron-rain";
    database.campaignRow = {
      id: campaignId,
      status: "ACTIVE",
      name: "Legacy Iron Rain",
      map_source_key: "fixture/operation-iron-rain",
      scenario_content_key: null,
      round_duration_ms: 300000,
      planet_name: "Corinth",
    };
    const { campaign, storage } = campaignObject(database, campaignId);

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAMPAIGN_ERROR", details: { message: "CAMPAIGN_SCENARIO_CONTENT_UNPINNED" } },
    });
    expect(storage.values.has("state/current")).toBe(false);
  });

  it("rejects a stored scenario whose identity differs from its immutable campaign pin", async () => {
    const database = new EffectDatabase();
    const campaignId = "pinned-iron-rain";
    database.campaignRow = {
      id: campaignId,
      status: "ACTIVE",
      name: "Pinned Iron Rain",
      map_source_key: "fixture/operation-iron-rain",
      scenario_content_key: IRON_RAIN_SCENARIO_CONTENT_KEY,
      round_duration_ms: 300000,
      planet_name: "Corinth",
    };
    const { campaign, storage } = campaignObject(database, campaignId);
    const stored = ironRainState(campaignId);
    stored.scenarioVersion = 2;
    storage.values.set("state/current", encodeCampaignStoredState(stored));

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "CAMPAIGN_ERROR",
        details: {
          message: "CAMPAIGN_SCENARIO_CONTENT_MISMATCH:scenario-operation-iron-rain@2:scenario-operation-iron-rain@3",
        },
      },
    });
    expect(parseCampaignStoredState(storage.values.get("state/current"), campaignId).state.scenarioVersion).toBe(2);
  });

  it("materializes an exact published Game Master map revision into server-authoritative runtime state", async () => {
    const database = new EffectDatabase();
    const campaignId = `gm-campaign-${"a".repeat(32)}`;
    configureCustomCampaign(database, campaignId);
    const { campaign, storage } = campaignObject(database, campaignId);

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(200);
    const state = storedCampaignState(storage, campaignId);
    expect(`${state.scenarioId}@${state.scenarioVersion}`).toBe(database.campaignRow!.scenario_content_key);
    expect(state.map.length).toBeGreaterThan(100);
    expect(state.map.some((hex) => hex.visualTerrainId?.startsWith("WATER_") &&
      hex.movementRules?.groundTraversal === "IMPASSABLE")).toBe(true);
    expect(state.map.some((hex) => hex.edges.paths !== undefined && hex.edges.walls !== undefined)).toBe(true);
    expect(state.objectives).toEqual([]);
    expect(state.deployments).toEqual([
      expect.objectContaining({ persistentUnitId: "rook-custom", callsign: "ROOK-CUSTOM" }),
    ]);
    expect(state.scenarioPolicy).toEqual({
      policyId: "game-master-skirmish",
      version: 1,
      maxRounds: 12,
      rewardPolicyId: "public-v1-economy@1",
    });
  });

  it("leaves legacy Game Master @1 state untouched and fails closed instead of upgrading it", async () => {
    const database = new EffectDatabase();
    const campaignId = `gm-campaign-${"b".repeat(32)}`;
    configureCustomCampaign(database, campaignId);
    const legacyContentKey = `scenario-${campaignId}@1`;
    database.campaignRow!.scenario_content_key = legacyContentKey;
    database.customScenarioRow!.scenario_version = 1;
    database.customScenarioRow!.scenario_content_key = legacyContentKey;
    database.customScenarioRow!.campaign_scenario_content_key = legacyContentKey;
    database.customScenarioRow!.application_policy_key = null;
    database.customScenarioRow!.maximum_rounds = null;
    database.customScenarioRow!.reward_policy_id = null;
    const { campaign, storage } = campaignObject(database, campaignId);

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "CAMPAIGN_ERROR",
        details: { message: `CAMPAIGN_SCENARIO_VERSION_NOT_AVAILABLE:${legacyContentKey}` },
      },
    });
    expect(storage.values.has("state/current")).toBe(false);
  });

  it("fails closed when the persisted Game Master application policy drifts", async () => {
    const database = new EffectDatabase();
    const campaignId = `gm-campaign-${"c".repeat(32)}`;
    configureCustomCampaign(database, campaignId);
    database.customScenarioRow!.maximum_rounds = 13;
    const { campaign, storage } = campaignObject(database, campaignId);

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAMPAIGN_ERROR", details: { message: "GAME_MASTER_SCENARIO_PIN_MISMATCH" } },
    });
    expect(storage.values.has("state/current")).toBe(false);
  });

  it("round-trips a 96x96 custom battlefield through bounded atomic chunks and fails closed on corruption", async () => {
    const database = new EffectDatabase();
    const campaignId = `gm-campaign-${"d".repeat(32)}`;
    const document = generateAdminMap({ preset: "MIXED", seed: "do-chunked-96", width: 96, height: 96 });
    configureCustomCampaign(database, campaignId, document);
    const { campaign, storage } = campaignObject(database, campaignId);

    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const firstManifest = storage.values.get("state/current") as {
      storageFormat: string;
      generation: string;
      chunkCount: number;
      byteLength: number;
    };
    expect(firstManifest).toMatchObject({
      storageFormat: "CORINTH_CAMPAIGN_STATE_CHUNKS",
      chunkCount: expect.any(Number),
      byteLength: expect.any(Number),
    });
    expect(firstManifest.chunkCount).toBeGreaterThan(1);
    const firstChunks = [...storage.values.entries()].filter(([key]) => key.startsWith("state/chunk/"));
    expect(firstChunks).toHaveLength(firstManifest.chunkCount);
    expect(firstChunks.every(([, value]) =>
      value instanceof Uint8Array && value.byteLength <= CAMPAIGN_STATE_CHUNK_BYTES)).toBe(true);
    const roundTripped = storedCampaignState(storage, campaignId);
    expect(roundTripped.map).toHaveLength(96 * 96);
    expect(roundTripped.map.map((hex) => hex.coord)).toEqual(document.cells.map((cell) => ({ q: cell.q, r: cell.r })));

    const pause = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({
        operation: "CAMPAIGN_PAUSE",
        commandId: "gm-chunked-pause-0001",
        expectedCampaignVersion: roundTripped.version,
      }),
    }));
    expect(pause.status).toBe(200);
    const secondManifest = storage.values.get("state/current") as typeof firstManifest;
    expect(secondManifest.generation).not.toBe(firstManifest.generation);
    expect([...storage.values.keys()].filter((key) => key.startsWith("state/chunk/")))
      .toHaveLength(secondManifest.chunkCount);
    expect(storage.lastTransactionMutationCount).toBeLessThanOrEqual(128);
    expect(storedCampaignState(storage, campaignId)).toMatchObject({ phase: "PAUSED", map: expect.any(Array) });

    const corruptKey = `state/chunk/${"0".padStart(6, "0")}`;
    storage.values.delete(corruptKey);
    const corrupted = await campaign.fetch(request("/state"));
    expect(corrupted.status).toBe(500);
    await expect(corrupted.json()).resolves.toMatchObject({
      error: { code: "CAMPAIGN_ERROR", details: { message: "CAMPAIGN_STATE_CHUNK_MISSING:0" } },
    });
  }, 15_000);

  it("fails closed when a custom campaign's selector and immutable map pin disagree", async () => {
    const database = new EffectDatabase();
    const campaignId = `gm-campaign-${"b".repeat(32)}`;
    configureCustomCampaign(database, campaignId);
    database.customScenarioRow = {
      ...database.customScenarioRow,
      map_source_key: "admin-map/forged@1:sha256:forged",
    };
    const { campaign, storage } = campaignObject(database, campaignId);

    const response = await campaign.fetch(request("/state"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAMPAIGN_ERROR", details: { message: "GAME_MASTER_SCENARIO_PIN_MISMATCH" } },
    });
    expect(storage.values.has("state/current")).toBe(false);
  });

  it("spawns a governed enemy into an initially empty custom scenario", async () => {
    const database = new EffectDatabase();
    database.enemyDefinitionAllowed = true;
    const campaignId = `gm-campaign-${"c".repeat(32)}`;
    configureCustomCampaign(database, campaignId);
    const { campaign, storage } = campaignObject(database, campaignId);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const initial = storedCampaignState(storage, campaignId);
    expect((await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({
        operation: "CAMPAIGN_PAUSE",
        commandId: "gm-custom-pause-0001",
        expectedCampaignVersion: initial.version,
      }),
    }))).status).toBe(200);
    const seeded = storedCampaignState(storage, campaignId);
    const spawnHex = seeded.map.find((hex) =>
      !hex.visualTerrainId?.startsWith("WATER_") && hex.movementRules?.groundTraversal === "PASSABLE")!;

    const response = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({
        operation: "ENEMY_SPAWN",
        commandId: "gm-custom-spawn-0001",
        expectedCampaignVersion: seeded.version,
        definitionId: "enemy-bug-warrior",
        callsign: "TALON-CUSTOM",
        coord: spawnHex.coord,
        facing: 2,
      }),
    }));

    expect(response.status).toBe(201);
    const current = storedCampaignState(storage, campaignId);
    expect(current.deployments).toContainEqual(expect.objectContaining({
      id: `${campaignId}:authored:gm:gm-custom-spawn-0001`,
      side: "ENEMY",
      definitionId: "enemy-bug-warrior",
      callsign: "TALON-CUSTOM",
      position: spawnHex.coord,
    }));
  });

  it("imports a committed Allied reinforcement once and exposes its Battlegroup", async () => {
    const database = new EffectDatabase();
    const { campaign, storage } = campaignObject(database);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const infantry = seeded.deployments.find((deployment) => deployment.definitionId === "unit-infantry-squad")!;
    database.campaignRow = {
      id: CAMPAIGN_ID,
      status: "ACTIVE",
      name: "Outpost K-17",
      map_source_key: "fixture/outpost-k17",
      scenario_content_key: "scenario-outpost-k17-hold-relay@3",
      round_duration_ms: 300000,
      planet_name: "Corinth",
    };
    database.deploymentRows = [{
      id: "deployment:outpost-k17:reinforcement-1",
      owner_id: "demo-user",
      side: "ALLIED",
      status: "READY",
      snapshot_json: JSON.stringify({
        ...infantry,
        position: { q: -4, r: 1 },
        currentHealth: infantry.currentHealth,
      }),
      persistent_unit_id: "reinforcement-1",
      ruleset_id: "ruleset-v5-core-curated-1",
      definition_id: "unit-infantry-squad",
      callsign: "RELIEF-1",
      battlegroup_id: "battlegroup-relief",
    }];

    const first = await campaign.fetch(request("/reinforcements/sync", { method: "POST" }));
    const replay = await campaign.fetch(request("/reinforcements/sync", { method: "POST" }));

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      addedDeploymentIds: ["deployment:outpost-k17:reinforcement-1"],
      round: seeded.round,
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ addedDeploymentIds: [] });
    const current = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(current.deployments.filter((deployment) => deployment.persistentUnitId === "reinforcement-1")).toEqual([
      expect.objectContaining({ callsign: "RELIEF-1", battlegroupId: "battlegroup-relief", position: { q: -4, r: 1 } }),
    ]);
    expect(current.events.filter((event) => event.type === "ALLIED_REINFORCEMENTS_ARRIVED")).toHaveLength(1);
  });

  it("persists, revises, replays, and removes round-scoped Allied operation notes", async () => {
    const { campaign, storage } = campaignObject();
    await campaign.fetch(request("/state"));
    const addBody = JSON.stringify({
      commandId: "operation-note-0001",
      operation: "ADD",
      text: "Hold the relay. Support element screens the east approach.",
    });
    const added = await campaign.fetch(request("/operation-notes", { method: "POST", body: addBody }));
    const replay = await campaign.fetch(request("/operation-notes", { method: "POST", body: addBody }));
    expect(added.status).toBe(201);
    expect(replay.status).toBe(201);
    const addedBody = await added.json() as { note: { id: string; revision: number; own: boolean; canEdit: boolean } };
    expect(addedBody.note).toMatchObject({ revision: 1, own: true, canEdit: true });
    expect([...storage.values.keys()].filter((key) => key.startsWith("operation-note/"))).toHaveLength(1);

    const updated = await campaign.fetch(request("/operation-notes", {
      method: "POST",
      body: JSON.stringify({
        commandId: "operation-note-0002",
        operation: "UPDATE",
        noteId: addedBody.note.id,
        expectedRevision: 1,
        text: "Hold the relay. Artillery shifts to the eastern approach.",
      }),
    }));
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ note: { revision: 2 } });
    await expect((await campaign.fetch(request("/operation-notes"))).json()).resolves.toMatchObject({
      notes: [{ id: addedBody.note.id, revision: 2, text: "Hold the relay. Artillery shifts to the eastern approach." }],
    });

    const removed = await campaign.fetch(request("/operation-notes", {
      method: "POST",
      body: JSON.stringify({
        commandId: "operation-note-0003",
        operation: "REMOVE",
        noteId: addedBody.note.id,
        expectedRevision: 2,
      }),
    }));
    expect(removed.status).toBe(200);
    await expect((await campaign.fetch(request("/operation-notes"))).json()).resolves.toMatchObject({ notes: [] });
  });

  it("persists, projects, replays, and clears round-scoped Allied command markers", async () => {
    const { campaign, storage } = campaignObject();
    const stateResponse = await campaign.fetch(request("/state"));
    expect(stateResponse.status).toBe(200);
    const state = await stateResponse.json() as { map: Array<{ coord: { q: number; r: number }; visibility: string }> };
    const known = state.map.find((hex) => hex.visibility !== "UNKNOWN")!;
    const body = JSON.stringify({
      commandId: "marker-command-0001",
      operation: "PLACE",
      kind: "ATTACK",
      coord: known.coord,
      label: "FOCUS FIRE",
    });
    const placed = await campaign.fetch(request("/markers", { method: "POST", body }));
    const replay = await campaign.fetch(request("/markers", { method: "POST", body }));
    expect(placed.status).toBe(201);
    expect(replay.status).toBe(201);
    const placedBody = await placed.json() as { marker: { id: string; own: boolean; canRemove: boolean } };
    expect(placedBody.marker).toMatchObject({ own: true, canRemove: true });
    expect([...storage.values.keys()].filter((key) => key.startsWith("marker/"))).toHaveLength(1);

    const listed = await campaign.fetch(request("/markers"));
    expect(await listed.json()).toMatchObject({
      markers: [{ id: placedBody.marker.id, kind: "ATTACK", label: "FOCUS FIRE", own: true }],
    });

    const removed = await campaign.fetch(request("/markers", {
      method: "POST",
      body: JSON.stringify({
        commandId: "marker-command-0002",
        operation: "REMOVE",
        markerId: placedBody.marker.id,
      }),
    }));
    expect(removed.status).toBe(200);
    await expect((await campaign.fetch(request("/markers"))).json()).resolves.toMatchObject({ markers: [] });
  });

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

  it("requires a Bomber attack target to lie on its submitted flight path", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.deployments.find((deployment) => deployment.id === "bug-drone-1")!.position = { q: 0, r: -3 };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const rejected = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-bomber-missed-run",
        unitId: "dep-havoc-2",
        actions: [{ type: "ATTACK", targetDeploymentId: "bug-drone-1" }],
      }),
    }));
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ error: { code: "BOMBER_ATTACK_ILLEGAL" } });

    const accepted = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-bomber-legal-run",
        unitId: "dep-havoc-2",
        orderType: "ADVANCE",
        route: [{ q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 }],
        facing: 2,
        actions: [{ type: "ATTACK", targetDeploymentId: "bug-drone-1" }],
      }),
    }));
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({
      order: {
        unitId: "dep-havoc-2",
        route: [{ q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 }],
        actions: [{ type: "ATTACK", targetDeploymentId: "bug-drone-1", weaponIds: ["weapon-bomber-ordnance"] }],
      },
    });
  });

  it("requires a Bomber bombing run to Advance over a ground target", async () => {
    const stationary = campaignObject();
    expect((await stationary.campaign.fetch(request("/state"))).status).toBe(200);
    const stationaryState = parseCampaignStoredState(
      stationary.storage.values.get("state/current"),
      CAMPAIGN_ID,
    ).state;
    stationaryState.deployments.find((deployment) => deployment.id === "bug-drone-1")!.position = { q: -1, r: -3 };
    stationary.storage.values.set("state/current", encodeCampaignStoredState(stationaryState));

    const stationaryResponse = await stationary.campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-bomber-stationary-run",
        unitId: "dep-havoc-2",
        actions: [{ type: "ATTACK", targetDeploymentId: "bug-drone-1" }],
      }),
    }));
    expect(stationaryResponse.status).toBe(422);
    expect(await stationaryResponse.json()).toMatchObject({ error: { code: "BOMBER_ATTACK_ILLEGAL" } });

    const airTarget = campaignObject();
    expect((await airTarget.campaign.fetch(request("/state"))).status).toBe(200);
    const airTargetState = parseCampaignStoredState(
      airTarget.storage.values.get("state/current"),
      CAMPAIGN_ID,
    ).state;
    airTargetState.deployments.find((deployment) => deployment.id === "dep-vulture-1")!.position = { q: 0, r: -3 };
    airTarget.storage.values.set("state/current", encodeCampaignStoredState(airTargetState));

    const airTargetResponse = await airTarget.campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-bomber-air-target",
        unitId: "dep-havoc-2",
        orderType: "ADVANCE",
        route: [{ q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 }],
        actions: [{ type: "ATTACK", targetDeploymentId: "dep-vulture-1" }],
      }),
    }));
    expect(airTargetResponse.status).toBe(422);
    expect(await airTargetResponse.json()).toMatchObject({ error: { code: "BOMBER_ATTACK_ILLEGAL" } });
  });

  it("rejects redundant full-ammunition aerospace rearm before storing the order", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const bomber = seeded.deployments.find((deployment) => deployment.id === "dep-havoc-2")!;
    const airfield = seeded.map.find((hex) => hex.coord.q === 0 && hex.coord.r === 0)!;
    airfield.control = "ALLIED";
    airfield.environment = [...new Set([...airfield.environment, "LAND_AEROSPACE", "REARM_AEROSPACE"])];
    bomber.position = { ...airfield.coord };
    bomber.statuses = ["LANDED"];
    bomber.ammunition = { "weapon-bomber-ordnance": 1 };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const response = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-bomber-rearm-full",
        unitId: "dep-havoc-2",
        actions: [{ type: "REARM_AEROSPACE" }],
      }),
    }));

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(409);
    expect(payload).toMatchObject({ error: { code: "AEROSPACE_AMMUNITION_FULL" } });
    const unchanged = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(unchanged.orders.some((candidate) => candidate.unitId === bomber.id)).toBe(false);
  });

  it("accepts only a clear route-bound Heavy Air Transport drop", async () => {
    const legal = campaignObject();
    expect((await legal.campaign.fetch(request("/state"))).status).toBe(200);
    const accepted = await legal.campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-hat-clear-drop",
        unitId: "dep-atlas-1",
        orderType: "ADVANCE",
        route: [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -1, r: -2 }],
        actions: [{
          type: "AIRDROP",
          targetDeploymentId: "dep-raven-drop",
          targetHex: { q: -2, r: -2 },
          payload: { cargoDeploymentId: "dep-raven-drop" },
        }],
      }),
    }));
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({
      order: {
        unitId: "dep-atlas-1",
        actions: [{
          type: "AIRDROP",
          economy: "INCIDENTAL",
          speedCost: 0,
          targetDeploymentId: "dep-raven-drop",
          targetHex: { q: -2, r: -2 },
        }],
      },
    });

    const hazardous = campaignObject();
    expect((await hazardous.campaign.fetch(request("/state"))).status).toBe(200);
    const rejected = await hazardous.campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-hat-hazard-drop",
        unitId: "dep-atlas-1",
        orderType: "ADVANCE",
        route: [{ q: -3, r: -2 }, { q: -2, r: -2 }, { q: -2, r: -1 }],
        actions: [{
          type: "AIRDROP",
          targetDeploymentId: "dep-raven-drop",
          targetHex: { q: -2, r: -1 },
          payload: { cargoDeploymentId: "dep-raven-drop" },
        }],
      }),
    }));
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: { code: "AIRDROP_DESTINATION_INVALID", details: { hazardous: true } },
    });
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
    const firstBody = await first.json() as { order: { id: string; revision: number }; campaignVersion: number };
    expect(firstBody.order.revision).toBe(1);

    const cancellationBody = JSON.stringify({
      commandId: "command-cancel-0001",
      expectedCampaignVersion: firstBody.campaignVersion,
      expectedOrderRevision: firstBody.order.revision,
    });
    const cancelled = await campaign.fetch(request(`/orders/${encodeURIComponent(firstBody.order.id)}`, {
      method: "DELETE",
      body: cancellationBody,
    }));
    const cancellationReplay = await campaign.fetch(request(`/orders/${encodeURIComponent(firstBody.order.id)}`, {
      method: "DELETE",
      body: cancellationBody,
    }));
    expect(cancelled.status).toBe(200);
    expect(cancellationReplay.status).toBe(200);
    const cancelledBody = await cancelled.json() as { campaignVersion: number; orderRevision: number; lifecycle: string };
    expect(await cancellationReplay.json()).toEqual(cancelledBody);
    expect(cancelledBody).toMatchObject({ lifecycle: "CANCELLED", orderRevision: 2 });
    const afterCancel = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(afterCancel.events.filter((event) => event.type === "ORDER_CANCELLED" && event.actor === UNIT_ID)).toHaveLength(1);

    const replacement = await campaign.fetch(request("/orders", {
      method: "POST",
      body: orderBody({
        commandId: "command-order-0002",
        expectedCampaignVersion: cancelledBody.campaignVersion,
        expectedOrderRevision: cancelledBody.orderRevision,
      }),
    }));
    expect(replacement.status).toBe(200);
    const replacementBody = await replacement.json() as { order: { id: string; revision: number } };
    expect(replacementBody.order).toMatchObject({ id: firstBody.order.id, revision: 3 });

    const parsed = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID);
    const matching = parsed.state.orders.filter((order) => order.unitId === UNIT_ID && order.round === parsed.state.round);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ id: firstBody.order.id, revision: 3, lifecycle: "SUBMITTED" });
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

    const pause = await campaign.fetch(globalGameMasterRequest("/pause", {
      method: "POST",
      body: "{}",
    }));
    expect(pause.status).toBe(400);
    expect(await pause.json()).toMatchObject({ error: { code: "CAMPAIGN_REQUEST_INVALID" } });
  });

  it("fails closed before reading or mutating allied state with an unknown unit definition", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const originalOrderCount = seeded.orders.length;
    seeded.deployments.find((deployment) => deployment.id === UNIT_ID)!.definitionId = "unit-unknown-test-chassis";
    storage.values.set("state/current", encodeCampaignStoredState(seeded));

    const before = storage.values.get("state/current");
    const stateResponse = await campaign.fetch(request("/state"));
    expect(stateResponse.status).toBe(500);
    expect(await stateResponse.json()).toMatchObject({
      error: {
        code: "CAMPAIGN_ERROR",
        details: { message: "CAMPAIGN_UNIT_DEFINITION_NOT_EXECUTABLE:unit-unknown-test-chassis:DEFINITION_NOT_FOUND" },
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
    const response = await campaign.fetch(globalGameMasterRequest("/resolve", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "EXPECTED_ROUND_REQUIRED" } });
  });

  it("denies every campaign control path to a campaign-local admin without global authority", async () => {
    const { campaign, storage } = campaignObject();
    const attempts = [
      adminRequest("/resolve", { method: "POST", headers: { "x-expected-round": "1" } }),
      adminRequest("/clock", {
        method: "PATCH",
        body: JSON.stringify({
          commandId: "campaign-local-clock-0001",
          expectedCampaignVersion: 1,
          preset: "1m",
        }),
      }),
      adminRequest("/pause", { method: "POST" }),
      adminRequest("/resume", { method: "POST" }),
    ];

    for (const attempt of attempts) {
      const response = await campaign.fetch(attempt);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "GLOBAL_GAME_MASTER_REQUIRED" },
      });
    }
    expect(storage.values.has("state/current")).toBe(false);
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

    const response = await campaign.fetch(globalGameMasterRequest("/resolve", {
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
      strategicConsequences: [
        {
          effectType: "STRATEGIC_NODE_CAPTURED",
          targetType: "STRATEGIC_NODE",
          targetId: "node-outpost-k17",
          eventType: "STRATEGIC_NODE_CONTROL_CHANGED",
          summary: expect.stringContaining("secured node-outpost-k17"),
        },
        {
          effectType: "ROUTE_UNLOCKED",
          targetType: "STRATEGIC_ROUTE",
          targetId: "route-kestrel-outpost-k17",
          eventType: "STRATEGIC_ROUTE_STATUS_CHANGED",
          summary: expect.stringContaining("unlocked strategic route"),
        },
        {
          effectType: "OPERATION_ACTIVATED",
          targetType: "STRATEGIC_OPERATION",
          targetId: "strategic-operation-broken-road",
          eventType: "STRATEGIC_OPERATION_STATUS_CHANGED",
          summary: expect.stringContaining("opened strategic-operation-broken-road"),
        },
      ],
      reports: [{
        round: 21,
        status: "RESOLVED",
        eventCount: expect.any(Number),
        digest: expect.any(String),
        terminal: { result: "VICTORY", round: 21 },
      }],
    });
    const reportDetail = await campaign.fetch(request("/reports/21"));
    expect(reportDetail.status).toBe(200);
    expect(await reportDetail.json()).toMatchObject({
      resolution: { round: 21 },
      startingState: {
        round: 21,
        map: expect.any(Array),
        deployments: expect.any(Array),
        objectives: expect.any(Array),
      },
      events: expect.arrayContaining([expect.objectContaining({ type: "CAMPAIGN_COMPLETED" })]),
    });

    const pause = await campaign.fetch(globalGameMasterRequest("/pause", { method: "POST" }));
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

    const first = await campaign.fetch(globalGameMasterRequest("/resolve", {
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

    const replay = await campaign.fetch(globalGameMasterRequest("/resolve", {
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
    const first = await campaign.fetch(globalGameMasterRequest("/clock", { method: "PATCH", body }));
    const replay = await campaign.fetch(globalGameMasterRequest("/clock", { method: "PATCH", body }));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.version).toBe(2);

    const collision = await campaign.fetch(globalGameMasterRequest("/clock", {
      method: "PATCH",
      body: JSON.stringify({
        commandId: "command-clock-0001",
        expectedCampaignVersion: 1,
        preset: "5m",
      }),
    }));
    expect(collision.status).toBe(409);
    expect(await collision.json()).toMatchObject({ error: { code: "COMMAND_REUSED" } });

    const stale = await campaign.fetch(globalGameMasterRequest("/clock", {
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

  it("requires trusted global authority and applies an enemy spawn once with server-authored mechanics", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const pausedAt = Date.now();
    seeded.phase = "PAUSED";
    seeded.clock = {
      ...seeded.clock,
      pausedAt,
      phaseBeforePause: "PLANNING",
    };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));
    const body = JSON.stringify({
      operation: "ENEMY_SPAWN",
      commandId: "gm-spawn-command-0001",
      expectedCampaignVersion: seeded.version,
      definitionId: "enemy-bug-drone",
      callsign: "Spawn Alpha",
      coord: { q: -4, r: 1 },
      facing: 2,
    });

    const forbidden = await campaign.fetch(adminRequest("/game-master/commands", { method: "POST", body }));
    expect(forbidden.status).toBe(403);

    const first = await campaign.fetch(globalGameMasterRequest("/game-master/commands", { method: "POST", body }));
    const replay = await campaign.fetch(globalGameMasterRequest("/game-master/commands", { method: "POST", body }));
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    const state = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const spawned = state.deployments.find((deployment) => deployment.id === `${CAMPAIGN_ID}:gm:gm-spawn-command-0001`)!;
    expect(spawned).toMatchObject({
      side: "ENEMY",
      definitionId: "enemy-bug-drone",
      callsign: "Spawn Alpha",
      status: "ACTIVE",
      position: { q: -4, r: 1 },
    });
    expect(spawned.currentHealth).toBe(spawned.stats.maxHealth);
    expect(state.events.at(-1)).toMatchObject({ type: "GAME_MASTER_ENEMY_SPAWNED", visibility: "ADMIN" });
  });

  it("applies and replays exceptional deployment recovery under the pinned application policy", async () => {
    const database = new EffectDatabase();
    database.permanentStatusEffectIds = ["status-permanent-progression"];
    const { campaign, storage } = campaignObject(database);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.phase = "PAUSED";
    seeded.clock = { ...seeded.clock, pausedAt: Date.now(), phaseBeforePause: "PLANNING" };
    const target = seeded.deployments[0]!;
    target.status = "DESTROYED";
    target.locationState = "DESTROYED";
    target.currentHealth = 0;
    target.ammunition = Object.fromEntries(target.weapons
      .filter((weapon) => weapon.ammoCapacity !== undefined)
      .map((weapon) => [weapon.id, 0]));
    target.cooldowns = { "recovery-test": 3 };
    target.statuses = ["DUG_IN", "REARM_REQUIRED"];
    target.statusEffects = [
      { id: "temporary", definitionId: "status-temporary", status: "ACTIVE" },
      { id: "permanent", definitionId: "status-permanent-progression", status: "ACTIVE" },
    ];
    target.subsystems = [
      { subsystemId: "mobility", state: "DISABLED", damageSourceId: "enemy", damagedRound: seeded.round },
      { subsystemId: "sensors", state: "DAMAGED", damagedRound: seeded.round },
    ];
    target.bombardmentSuppression = { stacks: 2, lastAppliedRound: seeded.round };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));
    const body = JSON.stringify({
      operation: "DEPLOYMENT_REVIVE",
      deploymentId: target.id,
      commandId: "gm-revive-command-0001",
      expectedCampaignVersion: seeded.version,
    });
    const first = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body,
    }));
    const replay = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body,
    }));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    const state = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const recovered = state.deployments.find((deployment) => deployment.id === target.id)!;
    expect(recovered).toMatchObject({
      status: "ACTIVE",
      locationState: "ON_MAP",
      currentHealth: target.stats.maxHealth,
      cooldowns: {},
      statuses: [],
      statusEffects: [{ id: "permanent", definitionId: "status-permanent-progression", status: "ACTIVE" }],
      subsystems: [
        { subsystemId: "mobility", state: "OPERATIONAL" },
        { subsystemId: "sensors", state: "OPERATIONAL" },
      ],
    });
    expect(recovered).not.toHaveProperty("bombardmentSuppression");
    expect(recovered.ammunition).toEqual(Object.fromEntries(recovered.weapons
      .filter((weapon) => weapon.ammoCapacity !== undefined)
      .map((weapon) => [weapon.id, weapon.ammoCapacity])));
    expect(state.version).toBe(seeded.version + 1);
    expect(state.events.filter((event) => event.type === "GAME_MASTER_DEPLOYMENT_REVIVED")).toEqual([
      expect.objectContaining({
        visibility: "ADMIN",
        payload: expect.objectContaining({
          policyId: "game-master-recovery@1",
          exceptionalCorrection: true,
          resourceId: target.id,
        }),
      }),
    ]);
  });

  it("rejects recovery for a deployment that is not destroyed", async () => {
    const { campaign, storage } = campaignObject(new EffectDatabase());
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const seeded = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    seeded.phase = "PAUSED";
    seeded.clock = { ...seeded.clock, pausedAt: Date.now(), phaseBeforePause: "PLANNING" };
    storage.values.set("state/current", encodeCampaignStoredState(seeded));
    const response = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({
        operation: "DEPLOYMENT_REVIVE",
        deploymentId: seeded.deployments[0]!.id,
        commandId: "gm-revive-command-healthy",
        expectedCampaignVersion: seeded.version,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "DEPLOYMENT_NOT_DESTROYED" } });
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.version).toBe(seeded.version);
  });

  it("applies and replays version-pinned Game Master pause and resume commands", async () => {
    const { campaign, storage } = campaignObject();
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const initial = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const pauseBody = JSON.stringify({
      operation: "CAMPAIGN_PAUSE",
      commandId: "gm-pause-command-0001",
      expectedCampaignVersion: initial.version,
    });
    const pause = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: pauseBody,
    }));
    const replay = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: pauseBody,
    }));
    expect(pause.status).toBe(200);
    expect(await replay.json()).toEqual(await pause.json());
    const paused = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    expect(paused.phase).toBe("PAUSED");
    expect(paused.clock.phaseBeforePause).toBe("PLANNING");

    const resume = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({
        operation: "CAMPAIGN_RESUME",
        commandId: "gm-resume-command-0001",
        expectedCampaignVersion: paused.version,
      }),
    }));
    expect(resume.status).toBe(200);
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state.phase).toBe("PLANNING");
  });

  it("reconciles a committed Game Master round when final receipt persistence fails", async () => {
    const database = new EffectDatabase();
    database.fail = false;
    const { campaign, storage } = campaignObject(database);
    expect((await campaign.fetch(request("/state"))).status).toBe(200);
    const initial = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;
    const commandId = "gm-resolve-command-0001";
    const receiptKey = `command/game-master/demo-admin/${commandId}`;
    const command = {
      operation: "ROUND_RESOLVE",
      commandId,
      expectedCampaignVersion: initial.version,
      expectedRound: initial.round,
    };
    const body = JSON.stringify(command);
    storage.failNextPutWhen = (key, value) => key === receiptKey &&
      typeof value === "object" && value !== null && "status" in value && value.status === 200;

    const interrupted = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body,
    }));
    expect(interrupted.status).toBe(500);
    const pending = storage.values.get(receiptKey) as Record<string, unknown>;
    expect(pending).toMatchObject({
      schemaVersion: 1,
      operation: "ROUND_RESOLVE",
      status: "PENDING",
      actorUserId: "demo-admin",
      commandId,
      expectedCampaignVersion: initial.version,
      expectedRound: initial.round,
    });
    expect(storage.values.get(`resolution/${initial.round}`)).toMatchObject({
      round: initial.round,
      status: "RESOLVED",
    });
    expect([...storage.values.keys()].filter((key) => key.startsWith("resolution/"))).toHaveLength(1);
    expect([...storage.values.keys()].filter((key) => key.startsWith("audit/game-master/"))).toHaveLength(0);
    const committedState = parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state;

    const collision = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body: JSON.stringify({ ...command, expectedCampaignVersion: initial.version + 1 }),
    }));
    expect(collision.status).toBe(409);
    expect(await collision.json()).toMatchObject({ error: { code: "COMMAND_REUSED" } });
    expect(storage.values.get(receiptKey)).toEqual(pending);

    const recovered = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body,
    }));
    expect(recovered.status).toBe(200);
    const recoveredBody = await recovered.json() as Record<string, unknown>;
    expect(recoveredBody).toMatchObject({
      operation: "ROUND_RESOLVE",
      commandId,
      appliedAt: pending.createdAt,
    });
    expect(storage.values.get(receiptKey)).toMatchObject({
      operation: "ROUND_RESOLVE",
      status: 200,
      response: recoveredBody,
    });
    expect([...storage.values.keys()].filter((key) => key.startsWith("resolution/"))).toEqual([
      `resolution/${initial.round}`,
    ]);
    expect([...storage.values.keys()].filter((key) => key.startsWith("audit/game-master/"))).toHaveLength(1);
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state).toEqual(committedState);

    const replay = await campaign.fetch(globalGameMasterRequest("/game-master/commands", {
      method: "POST",
      body,
    }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(recoveredBody);
    expect([...storage.values.keys()].filter((key) => key.startsWith("resolution/"))).toHaveLength(1);
    expect([...storage.values.keys()].filter((key) => key.startsWith("audit/game-master/"))).toHaveLength(1);
    expect(parseCampaignStoredState(storage.values.get("state/current"), CAMPAIGN_ID).state).toEqual(committedState);
  });
});

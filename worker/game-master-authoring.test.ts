import { describe, expect, it } from "vitest";
import { generateAdminMap } from "../packages/rules-engine/src";
import type { Env } from "./env";
import { routeGameMasterAuthoringRequest } from "./game-master-authoring";

interface StoredReceipt {
  operation: string;
  target_id: string;
  request_hash: string;
  reservation_token: string;
  status_code: number | null;
  response_json: string | null;
  created_at: number;
}

class FakeStatement {
  bindings: unknown[] = [];

  constructor(readonly database: FakeDatabase, readonly query: string) {}

  bind(...values: unknown[]): this {
    this.bindings = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.query.includes("FROM game_master_authoring_receipts")) {
      return (this.database.receipts.get(`${this.bindings[0]}:${this.bindings[1]}`) ?? null) as T | null;
    }
    if (this.query.includes("FROM planets WHERE id=")) {
      return (this.database.planet ?? null) as T | null;
    }
    if (this.query.includes("FROM rulesets WHERE status='ACTIVE'")) {
      return { id: "ruleset-v5-core-curated-1" } as T;
    }
    if (this.query.includes("FROM campaigns WHERE planet_id=")) return null;
    if (this.query.includes("FROM game_master_maps AS maps WHERE maps.id=")) {
      return (this.database.existingMap ?? null) as T | null;
    }
    if (this.query.includes("FROM game_master_maps AS maps WHERE maps.created_by_user_id=")) {
      return (this.database.existingMap ?? null) as T | null;
    }
    if (this.query.includes("FROM game_master_maps WHERE id=")) {
      return (this.database.campaignMap ?? null) as T | null;
    }
    if (this.query.includes("LEFT JOIN game_master_map_revisions AS revisions") && this.query.includes("WHERE maps.id=")) {
      return (this.database.campaignMap ?? null) as T | null;
    }
    if (this.query.includes("LEFT JOIN planets") && this.query.includes("WHERE maps.id=")) {
      return (this.database.existingMap ?? null) as T | null;
    }
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    if (this.query.includes("FROM game_master_maps AS maps")) {
      return { success: true, results: this.database.maps as T[], meta: {} } as D1Result<T>;
    }
    if (this.query.includes("FROM planets ORDER BY")) {
      return { success: true, results: [this.database.planet] as T[], meta: {} } as D1Result<T>;
    }
    if (this.query.includes("FROM enemy_definitions")) {
      return { success: true, results: [{ id: "enemy-warrior", name: "Warrior", faction_id: "BUG" }] as T[], meta: {} } as D1Result<T>;
    }
    return { success: true, results: [], meta: {} } as unknown as D1Result<T>;
  }
}

class FakeDatabase {
  readonly receipts = new Map<string, StoredReceipt>();
  readonly batches: FakeStatement[][] = [];
  maps: Record<string, unknown>[] = [];
  existingMap: Record<string, unknown> | null = null;
  campaignMap: Record<string, unknown> | null = null;
  planet: Record<string, unknown> | null = { id: "planet-corinth", name: "Corinth" };
  reservationBatchCount = 0;
  afterReservation?: (count: number) => Promise<void>;

  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(this, query) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const cast = statements as unknown as FakeStatement[];
    this.batches.push(cast);
    for (const statement of cast) {
      if (statement.query.includes("INSERT INTO game_master_authoring_receipts")) {
        const key = `${statement.bindings[0]}:${statement.bindings[1]}`;
        if (!this.receipts.has(key)) {
          this.receipts.set(key, {
            operation: String(statement.bindings[2]),
            target_id: String(statement.bindings[3]),
            request_hash: String(statement.bindings[4]),
            reservation_token: String(statement.bindings[6]),
            status_code: null,
            response_json: null,
            created_at: Number(statement.bindings[7]),
          });
        }
      }
      if (statement.query.includes("UPDATE game_master_authoring_receipts")) {
        if (statement.query.includes("SET reservation_token")) {
          const key = `${statement.bindings[2]}:${statement.bindings[3]}`;
          const receipt = this.receipts.get(key);
          if (
            receipt && receipt.operation === statement.bindings[4] &&
            receipt.target_id === statement.bindings[5] &&
            receipt.request_hash === statement.bindings[6] &&
            receipt.reservation_token === statement.bindings[7] &&
            receipt.created_at === statement.bindings[8] && receipt.status_code === null
          ) {
            receipt.reservation_token = String(statement.bindings[0]);
            receipt.created_at = Number(statement.bindings[1]);
          }
          continue;
        }
        const key = `${statement.bindings[3]}:${statement.bindings[4]}`;
        const receipt = this.receipts.get(key);
        if (
          receipt &&
          receipt.reservation_token === statement.bindings[5] &&
          receipt.operation === statement.bindings[6] &&
          receipt.target_id === statement.bindings[7] &&
          receipt.request_hash === statement.bindings[8] &&
          receipt.status_code === null
        ) {
          receipt.status_code = Number(statement.bindings[0]);
          receipt.response_json = String(statement.bindings[1]);
        }
      }
    }
    if (cast.some((statement) => statement.query.includes("INSERT INTO game_master_authoring_receipts"))) {
      this.reservationBatchCount += 1;
      await this.afterReservation?.(this.reservationBatchCount);
    }
    return cast.map(() => ({ success: true, results: [], meta: { changes: 1 } })) as unknown as D1Result[];
  }
}

function env(database: FakeDatabase): Env {
  return {
    DB: database as unknown as D1Database,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
    ENVIRONMENT: "development",
    ALLOW_DEMO_AUTH: "true",
    DEFAULT_ROUND_DURATION_MS: "300000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "300000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
  };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://game.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const actor = { allowed: true as const, userId: "demo-user", source: "DEVELOPMENT_DEMO" as const };

function mapRow(document = generateAdminMap({ preset: "MIXED", seed: "saved-map", width: 18, height: 14 })) {
  return {
    id: "gm-map-existing",
    name: "Existing Map",
    planet_id: "planet-corinth",
    planet_name: "Corinth",
    preset: document.preset,
    seed: document.seed,
    status: "DRAFT",
    revision: 1,
    schema_version: document.schemaVersion,
    generator_version: document.generatorVersion,
    vocabulary_version: document.vocabularyVersion,
    content_hash: document.hash,
    document_json: JSON.stringify(document),
    mechanics_mapping_json: "{}",
    updated_at: 10,
  };
}

describe("Game Master map and campaign authoring", () => {
  it("lists maps with planets, enemy definitions, and application profiles", async () => {
    const database = new FakeDatabase();
    database.maps = [mapRow()];
    const response = await routeGameMasterAuthoringRequest(
      new Request("https://game.test/api/game-master/maps"), env(database), actor,
    );
    expect(response?.status).toBe(200);
    const payload = await response?.json() as { maps: Array<Record<string, unknown>> };
    expect(payload).toMatchObject({
      maps: [{ mapId: "gm-map-existing" }],
      planets: [{ planetId: "planet-corinth", name: "Corinth" }],
      unitDefinitions: [{ definitionId: "enemy-warrior" }],
      mechanicalProfiles: expect.arrayContaining([expect.objectContaining({
        visualBiomeId: "LOWLANDS_OPEN",
        terrainId: "terrain-open",
        name: "Open Ground",
        locked: true,
      })]),
    });
    expect(payload.maps[0]).not.toHaveProperty("document");
  });

  it("loads one saved map document for an authorized editor", async () => {
    const database = new FakeDatabase();
    const row = mapRow();
    database.existingMap = row;
    const response = await routeGameMasterAuthoringRequest(
      new Request("https://game.test/api/game-master/maps/gm-map-existing"), env(database), actor,
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      map: {
        mapId: "gm-map-existing",
        revision: 1,
        mechanicsMapping: {},
        document: JSON.parse(String(row.document_json)),
      },
    });
  });

  it("saves a canonical draft revision with actor receipt and audit", async () => {
    const database = new FakeDatabase();
    const document = generateAdminMap({ preset: "ISLANDS", seed: "draft-save", width: 18, height: 14 });
    const response = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", {
      commandId: "gm-map-save-0001",
      name: "Island Watch",
      planetId: "planet-corinth",
      mechanicsMapping: {},
      document,
    }), env(database), actor);
    expect(response?.status).toBe(201);
    const body = await response?.json() as { map: { revision: number; document: unknown; mechanicsMapping: unknown } };
    expect(body.map).toMatchObject({ revision: 1, document, mechanicsMapping: {} });
    expect(database.batches.flat().some((statement) => statement.query.includes("game_master_map_revisions"))).toBe(true);
    expect(database.batches.flat().some((statement) => statement.query.includes("game_master_authoring_audit_events"))).toBe(true);
  });

  it("replays only the matching authoring target/hash and rejects command reuse without another mutation", async () => {
    const database = new FakeDatabase();
    const document = generateAdminMap({ preset: "ISLANDS", seed: "idempotent-save", width: 18, height: 14 });
    const original = {
      commandId: "gm-map-idempotent-1",
      name: "Idempotent Islands",
      planetId: "planet-corinth",
      document,
    };
    const first = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", original), env(database), actor);
    const replay = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", original), env(database), actor);
    const conflict = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", {
      ...original,
      name: "Different Target",
    }), env(database), actor);

    expect(first?.status).toBe(201);
    expect(await replay?.json()).toEqual(await first?.clone().json());
    expect(conflict?.status).toBe(409);
    expect(await conflict?.json()).toMatchObject({ error: { code: "COMMAND_REUSED" } });
    expect(database.batches.flat().filter((statement) => statement.query.includes("INSERT INTO game_master_maps")))
      .toHaveLength(1);
  });

  it("fails an exact concurrent authoring retry closed while the winning reservation is in progress", async () => {
    const database = new FakeDatabase();
    let release!: () => void;
    let entered!: () => void;
    const enteredReservation = new Promise<void>((resolve) => { entered = resolve; });
    const holdReservation = new Promise<void>((resolve) => { release = resolve; });
    database.afterReservation = async (count) => {
      if (count !== 1) return;
      entered();
      await holdReservation;
    };
    const document = generateAdminMap({ preset: "MIXED", seed: "concurrent-save", width: 18, height: 14 });
    const body = { commandId: "gm-map-concurrent-1", name: "Concurrent Map", document };
    const winning = routeGameMasterAuthoringRequest(post("/api/game-master/maps", body), env(database), actor);
    await enteredReservation;
    const retry = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", body), env(database), actor);

    expect(retry?.status).toBe(409);
    expect(await retry?.json()).toMatchObject({ error: { code: "COMMAND_IN_PROGRESS" } });
    expect(database.batches.flat().some((statement) => statement.query.includes("INSERT INTO game_master_maps"))).toBe(false);

    release();
    expect((await winning)?.status).toBe(201);
    expect(database.batches.flat().filter((statement) => statement.query.includes("INSERT INTO game_master_maps")))
      .toHaveLength(1);
  });

  it("reclaims a stale exact authoring reservation after an interrupted worker", async () => {
    const database = new FakeDatabase();
    database.afterReservation = async () => {
      database.afterReservation = undefined;
      throw new Error("SIMULATED_AUTHORING_INTERRUPTION");
    };
    const document = generateAdminMap({ preset: "ICY", seed: "stale-save", width: 18, height: 14 });
    const body = { commandId: "gm-map-stale-1", name: "Recovered Ice Map", document };
    const send = () => routeGameMasterAuthoringRequest(post("/api/game-master/maps", body), env(database), actor);

    await expect(send()).rejects.toThrow("SIMULATED_AUTHORING_INTERRUPTION");
    const receipt = database.receipts.get("demo-user:gm-map-stale-1")!;
    receipt.created_at = 0;
    const recovered = await send();

    expect(recovered?.status).toBe(201);
    expect(receipt.status_code).toBe(201);
    expect(database.batches.flat().filter((statement) => statement.query.includes("INSERT INTO game_master_maps")))
      .toHaveLength(1);
  });

  it("updates and renames a draft by mapId with revision CAS", async () => {
    const database = new FakeDatabase();
    database.existingMap = mapRow();
    const document = generateAdminMap({ preset: "MIXED", seed: "rename-map", width: 18, height: 14 });
    const response = await routeGameMasterAuthoringRequest(post("/api/game-master/maps", {
      commandId: "gm-map-rename-01",
      mapId: "gm-map-existing",
      expectedRevision: 1,
      name: "Renamed Expanse",
      document,
    }), env(database), actor);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      map: { mapId: "gm-map-existing", name: "Renamed Expanse", revision: 2 },
    });
    const update = database.batches.flat().find((statement) => statement.query.includes("UPDATE game_master_maps"));
    expect(update?.bindings).toContain("Renamed Expanse");
    expect(update?.bindings).toContain(1);
  });

  it("publishes a fully governed @2 map with no unresolved mechanics blockers", async () => {
    const database = new FakeDatabase();
    database.existingMap = mapRow();
    const response = await routeGameMasterAuthoringRequest(post(
      "/api/game-master/maps/gm-map-existing/publish",
      { commandId: "gm-map-publish-1", expectedRevision: 1 },
    ), env(database), actor);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      map: { mapId: "gm-map-existing", status: "PUBLISHED", revision: 2 },
    });
  });

  it("creates a recruiting runtime campaign pinned to the exact published map and a passable insertion zone", async () => {
    const database = new FakeDatabase();
    const row = mapRow();
    database.campaignMap = {
      id: "gm-map-existing",
      planet_id: "planet-corinth",
      status: "PUBLISHED",
      revision: 1,
      content_hash: row.content_hash,
      document_json: row.document_json,
      revision_id: "gm-map-existing@1",
      revision_content_hash: row.content_hash,
    };
    const response = await routeGameMasterAuthoringRequest(post("/api/game-master/campaigns", {
      commandId: "gm-campaign-0001",
      name: "Operation Island Watch",
      planetId: "planet-corinth",
      mapId: "gm-map-existing",
      mapRevision: 1,
      mapContentHash: row.content_hash,
      roundDurationMs: 0,
    }), env(database), actor);
    expect(response?.status).toBe(201);
    expect(await response?.json()).toMatchObject({
      campaign: {
        status: "RECRUITING",
        mapRevision: 1,
        mapContentHash: row.content_hash,
        canJoin: true,
        canEnter: false,
        runtimeStatus: "READY_FOR_DEPLOYMENT",
        insertionZones: [{
          allowedMethods: ["STANDARD_GROUND"],
          coord: expect.any(Object),
        }],
      },
    });
    const campaignInsert = database.batches.flat().find((statement) => statement.query.includes("INSERT INTO campaigns"));
    expect(campaignInsert?.query).toContain("'RECRUITING'");
    expect(database.batches.flat().some((statement) => statement.query.includes("game_master_campaign_scenarios"))).toBe(true);
    expect(database.batches.flat().some((statement) => statement.query.includes("campaign_insertion_zones"))).toBe(true);
    expect(database.batches.flat().some((statement) => statement.query.includes("campaign_memberships"))).toBe(true);
  });

  it("rejects draft, stale, or hash-drifted maps before reserving a campaign command", async () => {
    const database = new FakeDatabase();
    const row = mapRow();
    database.campaignMap = {
      id: "gm-map-existing",
      planet_id: "planet-corinth",
      status: "DRAFT",
      revision: 2,
      content_hash: row.content_hash,
      document_json: row.document_json,
      revision_id: "gm-map-existing@1",
      revision_content_hash: row.content_hash,
    };
    const response = await routeGameMasterAuthoringRequest(post("/api/game-master/campaigns", {
      commandId: "gm-campaign-stale-1",
      name: "Operation Stale Map",
      planetId: "planet-corinth",
      mapId: "gm-map-existing",
      mapRevision: 1,
      mapContentHash: row.content_hash,
      roundDurationMs: 300_000,
    }), env(database), actor);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ error: { code: "MAP_PIN_CONFLICT" } });
    expect(database.receipts.size).toBe(0);
  });
});

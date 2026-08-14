import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeGameMasterRequest } from "./game-master";

interface FakeRow { [key: string]: unknown }

interface RuntimeReceipt {
  operation: string;
  campaign_id: string;
  request_hash: string;
  reservation_token: string;
  status_code: number | null;
  response_json: string | null;
  created_at: number;
}

function fakeEnv(options: {
  admin?: boolean;
  campaigns?: FakeRow[];
  audit?: FakeRow[];
  doResponse?: Response;
  doHandler?: (request: Request) => Promise<Response>;
  campaignStatus?: string;
} = {}): {
  env: Env;
  doCalls: string[];
  batches: number[];
  receipts: Map<string, RuntimeReceipt>;
  registry: { campaignStatus: string; roundDurationMs: number };
} {
  const doCalls: string[] = [];
  const batches: number[] = [];
  const receipts = new Map<string, RuntimeReceipt>();
  const registry = {
    campaignStatus: options.campaignStatus ?? "ACTIVE",
    roundDurationMs: 300_000,
  };
  const prepare = (query: string) => {
    const statement = {
      query,
      bindings: [] as unknown[],
      bind(...values: unknown[]) { this.bindings = values; return this; },
      async first() {
        if (query.includes("FROM game_master_grants")) return options.admin === false ? null : { user_id: "demo-admin" };
        if (query.includes("FROM game_master_command_receipts")) {
          return receipts.get(`${this.bindings[0]}:${this.bindings[1]}`) ?? null;
        }
        return null;
      },
      async all() {
        if (query.includes("FROM game_master_audit_events")) return { success: true, results: options.audit ?? [], meta: {} };
        if (query.includes("FROM campaigns JOIN planets")) return { success: true, results: options.campaigns ?? [], meta: {} };
        return { success: true, results: [], meta: {} };
      },
    };
    return statement;
  };
  return {
    doCalls,
    batches,
    receipts,
    registry,
    env: {
      ENVIRONMENT: "development",
      ALLOW_DEMO_AUTH: "true",
      DB: {
        prepare,
        batch: async (statements: D1PreparedStatement[]) => {
          batches.push(statements.length);
          for (const raw of statements) {
            const statement = raw as unknown as ReturnType<typeof prepare>;
            const query = (statement as unknown as { query?: string }).query;
            if (query?.includes("INSERT INTO game_master_command_receipts")) {
              const key = `${statement.bindings[0]}:${statement.bindings[1]}`;
              if (!receipts.has(key)) {
                receipts.set(key, {
                  operation: String(statement.bindings[2]),
                  campaign_id: String(statement.bindings[3]),
                  request_hash: String(statement.bindings[4]),
                  reservation_token: String(statement.bindings[6]),
                  status_code: null,
                  response_json: null,
                  created_at: Number(statement.bindings[7]),
                });
              }
            }
            if (query?.includes("UPDATE campaigns SET status='PAUSED'")) {
              const receipt = receipts.get(`${statement.bindings[1]}:${statement.bindings[2]}`);
              if (
                ["ACTIVE", "PAUSED"].includes(registry.campaignStatus) &&
                receipt !== undefined &&
                receipt.campaign_id === statement.bindings[0] &&
                receipt.reservation_token === statement.bindings[3] &&
                receipt.operation === statement.bindings[4] &&
                receipt.status_code === null
              ) {
                registry.campaignStatus = "PAUSED";
              }
            }
            if (query?.includes("UPDATE campaigns SET status='ACTIVE'")) {
              const receipt = receipts.get(`${statement.bindings[1]}:${statement.bindings[2]}`);
              if (
                ["PAUSED", "ACTIVE"].includes(registry.campaignStatus) &&
                receipt !== undefined &&
                receipt.campaign_id === statement.bindings[0] &&
                receipt.reservation_token === statement.bindings[3] &&
                receipt.operation === statement.bindings[4] &&
                receipt.status_code === null
              ) {
                registry.campaignStatus = "ACTIVE";
              }
            }
            if (query?.includes("UPDATE campaigns SET round_duration_ms=")) {
              const receipt = receipts.get(`${statement.bindings[2]}:${statement.bindings[3]}`);
              if (
                receipt !== undefined &&
                receipt.campaign_id === statement.bindings[1] &&
                receipt.reservation_token === statement.bindings[4] &&
                receipt.operation === statement.bindings[5] &&
                receipt.status_code === null
              ) {
                registry.roundDurationMs = Number(statement.bindings[0]);
              }
            }
            if (query?.includes("UPDATE game_master_command_receipts")) {
              if (query.includes("SET reservation_token")) {
                const key = `${statement.bindings[2]}:${statement.bindings[3]}`;
                const receipt = receipts.get(key);
                if (
                  receipt && receipt.operation === statement.bindings[4] &&
                  receipt.campaign_id === statement.bindings[5] &&
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
              const receipt = receipts.get(key);
              const registryGuardSatisfied =
                (!query.includes("SELECT 1 FROM campaigns WHERE id=?8 AND status='PAUSED'") ||
                  registry.campaignStatus === "PAUSED") &&
                (!query.includes("SELECT 1 FROM campaigns WHERE id=?8 AND status='ACTIVE'") ||
                  registry.campaignStatus === "ACTIVE") &&
                (!query.includes("SELECT 1 FROM campaigns WHERE id=?8 AND round_duration_ms=?9") ||
                  registry.roundDurationMs === Number(statement.bindings[8]));
              if (
                receipt &&
                receipt.reservation_token === statement.bindings[5] &&
                receipt.operation === statement.bindings[6] &&
                receipt.campaign_id === statement.bindings[7] &&
                receipt.status_code === null &&
                registryGuardSatisfied
              ) {
                receipt.status_code = Number(statement.bindings[0]);
                receipt.response_json = String(statement.bindings[1]);
              }
            }
          }
          return statements.map(() => ({ success: true, results: [], meta: {} })) as unknown as D1Result[];
        },
      } as unknown as D1Database,
      CAMPAIGN: {
        getByName: () => ({
          fetch: async (request: Request) => {
            doCalls.push(await request.clone().text());
            expect(request.headers.get("x-corinth-global-game-master")).toBe("1");
            if (options.doHandler) return options.doHandler(request);
            return options.doResponse ?? new Response(JSON.stringify({
              operation: "OBJECTIVE_CREATE",
              commandId: "objective-command-0001",
              campaignId: "campaign-1",
              campaignVersion: 2,
              appliedAt: 10,
              resource: { id: "objective-extra" },
            }), { status: 201, headers: { "content-type": "application/json" } });
          },
        }),
      } as unknown as DurableObjectNamespace,
    } as Env,
  };
}

function request(path: string, init: RequestInit = {}, role: "ADMIN" | "PLAYER" = "ADMIN"): Request {
  const headers = new Headers(init.headers);
  headers.set("x-demo-user", "demo-admin");
  headers.set("x-demo-role", role);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://game.test${path}`, { ...init, headers });
}

describe("Game Master routes", () => {
  it("discovers local capability without exposing grants to an ordinary player", async () => {
    const allowed = await routeGameMasterRequest(request("/api/game-master/session"), fakeEnv().env);
    const denied = await routeGameMasterRequest(request("/api/game-master/session", {}, "PLAYER"), fakeEnv().env);
    expect(await allowed?.json()).toMatchObject({
      authorized: true,
      grantSource: "DEVELOPMENT_DEMO",
      capabilities: expect.arrayContaining(["MAP_WRITE", "CAMPAIGN_CREATE"]),
    });
    expect(await denied?.json()).toEqual({
      authenticated: true,
      authorized: false,
      userId: "demo-admin",
      grantSource: null,
      capabilities: [],
    });
  });

  it("lists bounded campaign registry data without claiming stale D1 rows are runtime state", async () => {
    const { env } = fakeEnv({ campaigns: [{
      id: "campaign-1",
      name: "Operation One",
      planet_id: "planet-1",
      planet_name: "Corinth",
      status: "ACTIVE",
      map_source_key: "fixture/operation-iron-rain",
      scenario_content_key: "scenario-operation-iron-rain@3",
      round_duration_ms: 300000,
    }] });
    const response = await routeGameMasterRequest(request("/api/game-master/campaigns?limit=25"), env);
    expect(await response?.json()).toEqual({ campaigns: [expect.objectContaining({
      campaignId: "campaign-1",
      registryStatus: "ACTIVE",
      roundDurationMs: 300000,
    })] });
  });

  it("returns one ordered audit projection for runtime and authoring targets", async () => {
    const { env } = fakeEnv({ audit: [{
      id: "gm-authoring-audit:demo-admin:save-1",
      actor_user_id: "demo-admin",
      grant_source: "DEVELOPMENT_DEMO",
      operation: "MAP_SAVE",
      target_id: "gm-map-1",
      target_kind: "MAP",
      command_id: "save-1",
      response_status: 201,
      occurred_at: 10,
    }] });
    const response = await routeGameMasterRequest(request("/api/game-master/audit?limit=20"), env);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ events: [{
      id: "gm-authoring-audit:demo-admin:save-1",
      actorUserId: "demo-admin",
      grantSource: "DEVELOPMENT_DEMO",
      operation: "MAP_SAVE",
      targetId: "gm-map-1",
      targetKind: "MAP",
      commandId: "save-1",
      responseStatus: 201,
      occurredAt: 10,
    }] });
  });

  it("proxies authoritative campaign state for a global Game Master without campaign membership", async () => {
    const runtime = {
      campaignId: "campaign-1",
      version: 27,
      round: 4,
      phase: "PAUSED",
      objectives: [{ id: "objective-1" }],
      deployments: [{ id: "enemy-1", side: "ENEMY" }],
    };
    const harness = fakeEnv({
      doResponse: new Response(JSON.stringify(runtime), {
        headers: { "content-type": "application/json" },
      }),
    });
    const response = await routeGameMasterRequest(
      request("/api/game-master/campaigns/campaign-1/state"),
      harness.env,
    );
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual(runtime);
    expect(harness.doCalls).toEqual([""]);
  });

  it("validates and forwards a globally authorized objective command, then audits it", async () => {
    const harness = fakeEnv();
    const response = await routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/objectives", {
      method: "POST",
      body: JSON.stringify({
        commandId: "objective-command-0001",
        expectedCampaignVersion: 1,
        objective: {
          id: "objective-extra",
          name: "Extra Objective",
          description: "GM-authored narrative objective; not added to victory policy.",
          coord: { q: 0, r: 0 },
          owner: "NEUTRAL",
          status: "ACTIVE",
        },
      }),
    }), harness.env);
    expect(response?.status).toBe(201);
    expect(harness.doCalls).toHaveLength(1);
    expect(harness.batches).toEqual([1, 2]);
  });

  it("rejects non-admin demo identities before invoking a campaign object", async () => {
    const harness = fakeEnv();
    const response = await routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/enemy-deployments", {
      method: "POST",
      body: JSON.stringify({}),
    }, "PLAYER"), harness.env);
    expect(response?.status).toBe(403);
    expect(harness.doCalls).toHaveLength(0);
  });

  it("keeps the campaign registry coherent across audited pause and resume commands", async () => {
    const harness = fakeEnv({
      doHandler: async (request) => {
        const command = await request.json() as {
          operation: "CAMPAIGN_PAUSE" | "CAMPAIGN_RESUME";
          commandId: string;
          expectedCampaignVersion: number;
        };
        const paused = command.operation === "CAMPAIGN_PAUSE";
        return new Response(JSON.stringify({
          operation: command.operation,
          commandId: command.commandId,
          campaignId: "campaign-1",
          campaignVersion: command.expectedCampaignVersion + 1,
          appliedAt: 10,
          resource: { phase: paused ? "PAUSED" : "PLANNING", round: 2 },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    const pause = await routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/pause", {
      method: "POST",
      body: JSON.stringify({ commandId: "pause-command-0001", expectedCampaignVersion: 7 }),
    }), harness.env);
    expect(pause?.status).toBe(200);
    expect(harness.registry.campaignStatus).toBe("PAUSED");
    expect(JSON.parse(harness.doCalls[0]!)).toEqual({
      operation: "CAMPAIGN_PAUSE",
      commandId: "pause-command-0001",
      expectedCampaignVersion: 7,
    });

    const resume = await routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/resume", {
      method: "POST",
      body: JSON.stringify({ commandId: "resume-command-0001", expectedCampaignVersion: 8 }),
    }), harness.env);
    expect(resume?.status).toBe(200);
    expect(harness.registry.campaignStatus).toBe("ACTIVE");
    expect(JSON.parse(harness.doCalls[1]!)).toEqual({
      operation: "CAMPAIGN_RESUME",
      commandId: "resume-command-0001",
      expectedCampaignVersion: 8,
    });
    expect(harness.batches).toEqual([1, 3, 1, 3]);
  });

  it("leaves the reservation pending when the registry cannot enter the DO-confirmed phase", async () => {
    const harness = fakeEnv({
      campaignStatus: "RECRUITING",
      doResponse: new Response(JSON.stringify({
        operation: "CAMPAIGN_PAUSE",
        commandId: "pause-command-drift",
        campaignId: "campaign-1",
        campaignVersion: 8,
        appliedAt: 10,
        resource: { phase: "PAUSED", round: 2 },
      }), { headers: { "content-type": "application/json" } }),
    });
    const operation = routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/pause", {
      method: "POST",
      body: JSON.stringify({ commandId: "pause-command-drift", expectedCampaignVersion: 7 }),
    }), harness.env);

    await expect(operation).rejects.toThrow("GAME_MASTER_COMMAND_FINALIZATION_FAILED");
    expect(harness.registry.campaignStatus).toBe("RECRUITING");
    expect(harness.receipts.get("demo-admin:pause-command-drift")).toMatchObject({
      status_code: null,
      response_json: null,
    });
  });

  it("does not double-dispatch ROUND_RESOLVE while the winning D1 reservation is in progress", async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredDurableObject = new Promise<void>((resolve) => { entered = resolve; });
    const holdDurableObject = new Promise<void>((resolve) => { release = resolve; });
    const harness = fakeEnv({
      doHandler: async () => {
        entered();
        await holdDurableObject;
        return new Response(JSON.stringify({
          operation: "ROUND_RESOLVE",
          commandId: "resolve-command-0001",
          campaignId: "campaign-1",
          campaignVersion: 9,
          appliedAt: 10,
          resource: { phase: "PLANNING", round: 3 },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    const body = {
      commandId: "resolve-command-0001",
      expectedCampaignVersion: 8,
      expectedRound: 2,
    };
    const winning = routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    }), harness.env);
    await enteredDurableObject;
    const retry = await routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    }), harness.env);

    expect(retry?.status).toBe(409);
    expect(await retry?.json()).toMatchObject({ error: { code: "COMMAND_IN_PROGRESS" } });
    expect(harness.doCalls).toHaveLength(1);

    release();
    expect((await winning)?.status).toBe(200);
    expect(harness.doCalls).toHaveLength(1);
  });

  it("reclaims a stale exact reservation and relies on Durable Object replay safety", async () => {
    let dispatch = 0;
    const harness = fakeEnv({
      doHandler: async () => {
        dispatch += 1;
        if (dispatch === 1) throw new Error("SIMULATED_WORKER_INTERRUPTION");
        return new Response(JSON.stringify({
          operation: "ROUND_RESOLVE",
          commandId: "resolve-command-stale",
          campaignId: "campaign-1",
          campaignVersion: 9,
          appliedAt: 10,
          resource: { phase: "PLANNING", round: 3 },
        }), { headers: { "content-type": "application/json" } });
      },
    });
    const body = {
      commandId: "resolve-command-stale",
      expectedCampaignVersion: 8,
      expectedRound: 2,
    };
    const send = () => routeGameMasterRequest(request("/api/game-master/campaigns/campaign-1/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    }), harness.env);

    await expect(send()).rejects.toThrow("SIMULATED_WORKER_INTERRUPTION");
    const receipt = harness.receipts.get("demo-admin:resolve-command-stale")!;
    receipt.created_at = 0;
    const recovered = await send();

    expect(recovered?.status).toBe(200);
    expect(harness.doCalls).toHaveLength(2);
    expect(receipt.status_code).toBe(200);
  });
});

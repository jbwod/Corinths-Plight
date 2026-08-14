import type {
  GameMasterCapability,
  GameMasterSessionDto,
} from "../../packages/domain/src";
import {
  authenticate,
  authorizeGameMaster,
  internalViewerHeaders,
} from "../auth";
import {
  CampaignRequestContractError,
  campaignCommandHash,
  canonicalCampaignJson,
  parseCampaignClockIntent,
} from "../campaign-contracts";
import type { Env } from "../env";
import {
  GameMasterValidationError,
  parseGameMasterEnemySpawn,
  parseGameMasterControl,
  parseGameMasterObjectiveCreate,
  parseGameMasterObjectiveUpdate,
  parseGameMasterRevive,
} from "../game-master-validation";
import { routeGameMasterAuthoringRequest } from "../game-master-authoring";
import { errorResponse, json, readJson } from "../http";

const basePath = "/api/game-master";
const campaignCommandPath = /^\/api\/game-master\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/(clock|objectives|enemy-deployments)$/;
const campaignStatePath = /^\/api\/game-master\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/state$/;
const campaignControlPath = /^\/api\/game-master\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/(pause|resume|resolve)$/;
const objectiveUpdatePath = /^\/api\/game-master\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/objectives\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/;
const revivePath = /^\/api\/game-master\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/deployments\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/revive$/;
const GAME_MASTER_RESERVATION_LEASE_MS = 120_000;
const capabilities: GameMasterCapability[] = [
  "CAMPAIGN_READ",
  "CAMPAIGN_CLOCK_WRITE",
  "CAMPAIGN_CONTROL",
  "CAMPAIGN_CREATE",
  "MAP_WRITE",
  "OBJECTIVE_WRITE",
  "ENEMY_SPAWN",
  "AUDIT_READ",
];

interface CampaignRegistryRow {
  id: string;
  name: string;
  planet_id: string;
  planet_name: string;
  status: "ACTIVE" | "PAUSED";
  map_source_key: string;
  scenario_content_key: string | null;
  round_duration_ms: number;
}

interface AuditRow {
  id: string;
  actor_user_id: string;
  grant_source: "GLOBAL_GRANT" | "DEVELOPMENT_DEMO";
  operation: string;
  target_id: string;
  target_kind: "CAMPAIGN" | "MAP";
  command_id: string;
  response_status: number;
  occurred_at: number;
}

interface RuntimeCommandReceiptRow {
  operation: string;
  campaign_id: string;
  request_hash: string;
  reservation_token: string;
  status_code: number | null;
  response_json: string | null;
  created_at: number;
}

type RuntimeCommandReservation =
  | { kind: "OWNER"; token: string }
  | { kind: "RESPONSE"; response: Response };

function method(request: Request, expected: string): Response | undefined {
  if (request.method === expected) return undefined;
  return errorResponse(405, "METHOD_NOT_ALLOWED", `Use ${expected} for this endpoint.`, { allowed: [expected] });
}

function internalRequest(
  request: Request,
  userId: string,
  path: string,
  body?: string,
): Request {
  const headers = new Headers(request.headers);
  for (const name of [
    "cookie", "authorization", "x-demo-user", "x-demo-role",
    "x-corinth-user", "x-corinth-side", "x-corinth-role", "x-corinth-battalion",
    "x-corinth-global-game-master",
  ]) headers.delete(name);
  for (const [name, value] of internalViewerHeaders({ userId, side: "ALLIED", role: "ADMIN" })) {
    headers.set(name, value);
  }
  headers.set("x-corinth-global-game-master", "1");
  return new Request(`https://campaign.internal${path}`, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function commandBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Use application/json for this request."), { status: 415, code: "JSON_REQUIRED" });
  }
  try {
    return await readJson<unknown>(request, 16_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw Object.assign(new Error("Game Master command exceeds 16 KB."), { status: 413, code: "REQUEST_TOO_LARGE" });
    }
    throw Object.assign(new Error("Request body must contain valid JSON."), { status: 400, code: "JSON_INVALID" });
  }
}

async function completeRuntimeCommand(
  env: Env,
  actor: { userId: string; source: "GLOBAL_GRANT" | "DEVELOPMENT_DEMO" },
  campaignId: string,
  operation: string,
  commandId: string,
  reservationToken: string,
  response: Response,
): Promise<void> {
  const responseText = await response.clone().text();
  const responseJson = responseText || "{}";
  const now = Date.now();
  const auditId = `gm-audit:${actor.userId}:${commandId}`;
  const statements: D1PreparedStatement[] = [];
  let registryCompletionGuard = "";
  const receiptBindings: unknown[] = [
    response.status, responseJson, now, actor.userId, commandId, reservationToken, operation, campaignId,
  ];
  if (operation === "CLOCK_UPDATE" && response.ok) {
    const parsed = JSON.parse(responseJson) as { clock?: { durationMs?: unknown } };
    if (Number.isSafeInteger(parsed.clock?.durationMs)) {
      const durationMs = Number(parsed.clock!.durationMs);
      statements.push(env.DB.prepare(`UPDATE campaigns SET round_duration_ms=?1
        WHERE id=?2 AND EXISTS (
          SELECT 1 FROM game_master_command_receipts AS receipts
          WHERE receipts.actor_user_id=?3 AND receipts.command_id=?4 AND receipts.reservation_token=?5
            AND receipts.operation=?6 AND receipts.campaign_id=?2 AND receipts.status_code IS NULL)`)
        .bind(durationMs, campaignId, actor.userId, commandId, reservationToken, operation));
      registryCompletionGuard = `AND EXISTS (
        SELECT 1 FROM campaigns WHERE id=?8 AND round_duration_ms=?9)`;
      receiptBindings.push(durationMs);
    }
  }
  if (operation === "CAMPAIGN_PAUSE" && response.ok) {
    statements.push(env.DB.prepare(`UPDATE campaigns SET status='PAUSED'
      WHERE id=?1 AND status IN ('ACTIVE','PAUSED') AND EXISTS (
        SELECT 1 FROM game_master_command_receipts AS receipts
        WHERE receipts.actor_user_id=?2 AND receipts.command_id=?3 AND receipts.reservation_token=?4
          AND receipts.operation=?5 AND receipts.campaign_id=?1 AND receipts.status_code IS NULL)`)
      .bind(campaignId, actor.userId, commandId, reservationToken, operation));
    registryCompletionGuard = `AND EXISTS (
      SELECT 1 FROM campaigns WHERE id=?8 AND status='PAUSED')`;
  }
  if (operation === "CAMPAIGN_RESUME" && response.ok) {
    statements.push(env.DB.prepare(`UPDATE campaigns SET status='ACTIVE'
      WHERE id=?1 AND status IN ('PAUSED','ACTIVE') AND EXISTS (
        SELECT 1 FROM game_master_command_receipts AS receipts
        WHERE receipts.actor_user_id=?2 AND receipts.command_id=?3 AND receipts.reservation_token=?4
          AND receipts.operation=?5 AND receipts.campaign_id=?1 AND receipts.status_code IS NULL)`)
      .bind(campaignId, actor.userId, commandId, reservationToken, operation));
    registryCompletionGuard = `AND EXISTS (
      SELECT 1 FROM campaigns WHERE id=?8 AND status='ACTIVE')`;
  }
  statements.push(
    env.DB.prepare(`UPDATE game_master_command_receipts
      SET status_code=?1,response_json=?2,completed_at=?3
      WHERE actor_user_id=?4 AND command_id=?5 AND reservation_token=?6
        AND operation=?7 AND campaign_id=?8 AND status_code IS NULL
        ${registryCompletionGuard}`)
      .bind(...receiptBindings),
    env.DB.prepare(`INSERT INTO game_master_audit_events
      (id,actor_user_id,grant_source,operation,campaign_id,command_id,request_hash,request_json,response_status,response_json,occurred_at)
      SELECT ?1,receipts.actor_user_id,?2,receipts.operation,receipts.campaign_id,receipts.command_id,
        receipts.request_hash,receipts.request_json,receipts.status_code,receipts.response_json,?3
      FROM game_master_command_receipts AS receipts
      WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5 AND receipts.reservation_token=?6
        AND receipts.status_code IS NOT NULL
      ON CONFLICT(actor_user_id,command_id) DO NOTHING`)
      .bind(auditId, actor.source, now, actor.userId, commandId, reservationToken),
  );
  await env.DB.batch(statements);
  const completed = await env.DB.prepare(`SELECT operation,campaign_id,request_hash,reservation_token,status_code,response_json,created_at
      FROM game_master_command_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actor.userId, commandId).first<RuntimeCommandReceiptRow>();
  if (!completed || completed.reservation_token !== reservationToken || completed.status_code === null || completed.response_json === null) {
    throw new Error("GAME_MASTER_COMMAND_FINALIZATION_FAILED");
  }
}

async function reserveRuntimeCommand(
  env: Env,
  actorUserId: string,
  campaignId: string,
  operation: string,
  commandId: string,
  requestHash: string,
  requestBody: unknown,
): Promise<RuntimeCommandReservation> {
  const token = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO game_master_command_receipts
      (actor_user_id,command_id,operation,campaign_id,request_hash,request_json,reservation_token,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8
      WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=?4)
      ON CONFLICT(actor_user_id,command_id) DO NOTHING`)
      .bind(actorUserId, commandId, operation, campaignId, requestHash,
        canonicalCampaignJson(requestBody), token, now),
  ]);
  const load = () => env.DB.prepare(`SELECT operation,campaign_id,request_hash,reservation_token,status_code,response_json,created_at
      FROM game_master_command_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actorUserId, commandId)
    .first<RuntimeCommandReceiptRow>();
  let prior = await load();
  if (!prior) {
    return { kind: "RESPONSE", response: errorResponse(404, "CAMPAIGN_NOT_FOUND", "The campaign is not available.") };
  }
  if (prior.operation !== operation || prior.campaign_id !== campaignId || prior.request_hash !== requestHash) {
    return { kind: "RESPONSE", response: errorResponse(409, "COMMAND_REUSED", "commandId was already used for a different Game Master command.") };
  }
  if (prior.status_code !== null && prior.response_json !== null) {
    return { kind: "RESPONSE", response: json(JSON.parse(prior.response_json), { status: prior.status_code }) };
  }
  if (prior.reservation_token !== token && prior.created_at <= now - GAME_MASTER_RESERVATION_LEASE_MS) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE game_master_command_receipts
        SET reservation_token=?1,created_at=?2
        WHERE actor_user_id=?3 AND command_id=?4 AND operation=?5 AND campaign_id=?6
          AND request_hash=?7 AND reservation_token=?8 AND created_at=?9 AND status_code IS NULL`)
        .bind(token, now, actorUserId, commandId, operation, campaignId, requestHash,
          prior.reservation_token, prior.created_at),
    ]);
    prior = await load();
    if (!prior) throw new Error("GAME_MASTER_COMMAND_RESERVATION_MISSING");
    if (prior.status_code !== null && prior.response_json !== null) {
      return { kind: "RESPONSE", response: json(JSON.parse(prior.response_json), { status: prior.status_code }) };
    }
  }
  if (prior.reservation_token !== token) {
    return { kind: "RESPONSE", response: errorResponse(409, "COMMAND_IN_PROGRESS", "The prior command is still in progress.") };
  }
  return { kind: "OWNER", token };
}

export async function routeGameMasterRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${basePath}/`) && url.pathname !== basePath) return null;
  const identity = await authenticate(request, env);
  if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for Game Master operations.");
  const decision = await authorizeGameMaster(identity, env);

  if (url.pathname === `${basePath}/session`) {
    const wrongMethod = method(request, "GET");
    if (wrongMethod) return wrongMethod;
    const response: GameMasterSessionDto = {
      authenticated: true,
      authorized: decision.allowed,
      userId: decision.userId,
      grantSource: decision.allowed ? decision.source : null,
      capabilities: decision.allowed ? capabilities : [],
    };
    return json(response);
  }
  if (!decision.allowed) return errorResponse(403, "GAME_MASTER_REQUIRED", "An active global Game Master grant is required.");

  const authoringResponse = await routeGameMasterAuthoringRequest(request, env, decision);
  if (authoringResponse) return authoringResponse;

  if (url.pathname === `${basePath}/campaigns`) {
    const wrongMethod = method(request, "GET");
    if (wrongMethod) return wrongMethod;
    const limitValue = url.searchParams.get("limit");
    const limit = limitValue === null ? 25 : Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
      return errorResponse(400, "LIMIT_INVALID", "limit must be an integer from 1 through 25.");
    }
    const rows = await env.DB.prepare(`SELECT campaigns.id,campaigns.name,campaigns.planet_id,
        planets.name AS planet_name,campaigns.status,campaigns.map_source_key,
        campaigns.scenario_content_key,campaigns.round_duration_ms
      FROM campaigns JOIN planets ON planets.id=campaigns.planet_id
      WHERE campaigns.status IN ('RECRUITING','ACTIVE','PAUSED')
      ORDER BY campaigns.created_at DESC,campaigns.id DESC LIMIT ?1`)
      .bind(limit).all<CampaignRegistryRow>();
    return json({ campaigns: rows.results.map((row) => ({
      campaignId: row.id,
      name: row.name,
      planet: { id: row.planet_id, name: row.planet_name },
      registryStatus: row.status,
      mapSourceKey: row.map_source_key,
      scenarioContentKey: row.scenario_content_key,
      roundDurationMs: row.round_duration_ms,
    })) });
  }

  if (url.pathname === `${basePath}/audit`) {
    const wrongMethod = method(request, "GET");
    if (wrongMethod) return wrongMethod;
    const limitValue = url.searchParams.get("limit");
    const limit = limitValue === null ? 50 : Number(limitValue);
    const campaignId = url.searchParams.get("campaignId");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return errorResponse(400, "LIMIT_INVALID", "limit must be an integer from 1 through 100.");
    }
    if (campaignId !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(campaignId)) {
      return errorResponse(400, "CAMPAIGN_ID_INVALID", "campaignId is invalid.");
    }
    const query = campaignId
      ? `SELECT id,actor_user_id,grant_source,operation,campaign_id AS target_id,'CAMPAIGN' AS target_kind,
            command_id,response_status,occurred_at
           FROM game_master_audit_events WHERE campaign_id=?1
         UNION ALL
         SELECT id,actor_user_id,grant_source,operation,target_id,'CAMPAIGN' AS target_kind,
            command_id,response_status,occurred_at
           FROM game_master_authoring_audit_events
           WHERE operation='CAMPAIGN_CREATE' AND target_id=?1
         ORDER BY occurred_at DESC,id DESC LIMIT ?2`
      : `SELECT id,actor_user_id,grant_source,operation,campaign_id AS target_id,'CAMPAIGN' AS target_kind,
            command_id,response_status,occurred_at
           FROM game_master_audit_events
         UNION ALL
         SELECT id,actor_user_id,grant_source,operation,target_id,
            CASE WHEN operation='CAMPAIGN_CREATE' THEN 'CAMPAIGN' ELSE 'MAP' END AS target_kind,
            command_id,response_status,occurred_at
           FROM game_master_authoring_audit_events
         ORDER BY occurred_at DESC,id DESC LIMIT ?1`;
    const rows = campaignId
      ? await env.DB.prepare(query).bind(campaignId, limit).all<AuditRow>()
      : await env.DB.prepare(query).bind(limit).all<AuditRow>();
    return json({ events: rows.results.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      grantSource: row.grant_source,
      operation: row.operation,
      targetId: row.target_id,
      targetKind: row.target_kind,
      ...(row.target_kind === "CAMPAIGN" ? { campaignId: row.target_id } : {}),
      commandId: row.command_id,
      responseStatus: row.response_status,
      occurredAt: row.occurred_at,
    })) });
  }

  const stateMatch = url.pathname.match(campaignStatePath);
  if (stateMatch) {
    const wrongMethod = method(request, "GET");
    if (wrongMethod) return wrongMethod;
    return env.CAMPAIGN.getByName(stateMatch[1]).fetch(
      internalRequest(request, decision.userId, "/state"),
    );
  }

  const commandMatch = url.pathname.match(campaignCommandPath);
  const objectiveMatch = url.pathname.match(objectiveUpdatePath);
  const reviveMatch = url.pathname.match(revivePath);
  const controlMatch = url.pathname.match(campaignControlPath);
  if (!commandMatch && !objectiveMatch && !reviveMatch && !controlMatch) {
    return errorResponse(404, "NOT_FOUND", "Game Master endpoint not found.");
  }
  const campaignId = commandMatch?.[1] ?? objectiveMatch?.[1] ?? reviveMatch?.[1] ?? controlMatch?.[1] ?? "";
  const expectedMethod = commandMatch?.[2] === "clock" || objectiveMatch ? "PATCH" : "POST";
  const wrongMethod = method(request, expectedMethod);
  if (wrongMethod) return wrongMethod;

  try {
    const raw = await commandBody(request);
    const parsed = commandMatch?.[2] === "clock"
      ? { ...parseCampaignClockIntent(raw), operation: "CLOCK_UPDATE" as const }
      : commandMatch?.[2] === "objectives"
        ? parseGameMasterObjectiveCreate(raw)
        : commandMatch?.[2] === "enemy-deployments"
          ? parseGameMasterEnemySpawn(raw)
          : objectiveMatch
            ? { ...parseGameMasterObjectiveUpdate(raw), objectiveId: objectiveMatch[2] }
            : reviveMatch
              ? { ...parseGameMasterRevive(raw), deploymentId: reviveMatch[2] }
              : parseGameMasterControl(
                  raw,
                  controlMatch![2] === "pause"
                    ? "CAMPAIGN_PAUSE"
                    : controlMatch![2] === "resume"
                      ? "CAMPAIGN_RESUME"
                      : "ROUND_RESOLVE",
                );
    const operation = parsed.operation;
    const commandId = parsed.commandId;
    const requestHash = await campaignCommandHash({
      actorUserId: decision.userId,
      campaignId,
      operation,
      requestBody: parsed,
    });
    const reservation = await reserveRuntimeCommand(
      env,
      decision.userId,
      campaignId,
      operation,
      commandId,
      requestHash,
      parsed,
    );
    if (reservation.kind === "RESPONSE") return reservation.response;
    const internalPath = operation === "CLOCK_UPDATE" ? "/clock" : "/game-master/commands";
    const body = operation === "CLOCK_UPDATE" ? JSON.stringify(raw) : JSON.stringify(parsed);
    const stub = env.CAMPAIGN.getByName(campaignId);
    const response = await stub.fetch(internalRequest(request, decision.userId, internalPath, body));
    await completeRuntimeCommand(
      env,
      decision,
      campaignId,
      operation,
      commandId,
      reservation.token,
      response,
    );
    return response;
  } catch (error) {
    if (error instanceof GameMasterValidationError) {
      return errorResponse(400, error.code, error.message, { path: error.path });
    }
    if (error instanceof CampaignRequestContractError) {
      return errorResponse(400, error.code, error.message, { path: error.path });
    }
    if (error instanceof Error && "status" in error && "code" in error) {
      const typed = error as Error & { status: number; code: string };
      return errorResponse(typed.status, typed.code, typed.message);
    }
    if (error instanceof SyntaxError) return errorResponse(400, "GAME_MASTER_COMMAND_INVALID", error.message);
    throw error;
  }
}

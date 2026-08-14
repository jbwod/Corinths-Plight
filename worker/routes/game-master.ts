import type {
  CampaignDeployment,
  GameMasterCapability,
  GameMasterSessionDto,
} from "../../packages/domain/src";
import { GAME_MASTER_RECOVERY_POLICY_ID } from "../../packages/domain/src";
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
  "DEPLOYMENT_REVIVE",
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

type GameMasterRecoveryResource = CampaignDeployment & {
  recoveryPolicyId: typeof GAME_MASTER_RECOVERY_POLICY_ID;
  recoveryRound: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRecoveryResponse(
  responseJson: string,
  campaignId: string,
  commandId: string,
  deploymentId: string,
): GameMasterRecoveryResource {
  const envelope = record(JSON.parse(responseJson));
  const resource = record(envelope?.resource);
  if (
    envelope?.operation !== "DEPLOYMENT_REVIVE" ||
    envelope.commandId !== commandId ||
    envelope.campaignId !== campaignId ||
    resource?.id !== deploymentId ||
    resource.campaignId !== campaignId ||
    resource.recoveryPolicyId !== GAME_MASTER_RECOVERY_POLICY_ID ||
    typeof resource.recoveryRound !== "number" ||
    !Number.isSafeInteger(resource.recoveryRound) ||
    resource.recoveryRound <= 0 ||
    resource.status !== "ACTIVE" ||
    resource.locationState !== "ON_MAP" ||
    !["ALLIED", "ENEMY", "NEUTRAL"].includes(String(resource.side)) ||
    (resource.persistentUnitId !== undefined && (
      typeof resource.persistentUnitId !== "string" ||
      resource.persistentUnitId.length < 1 ||
      resource.persistentUnitId.length > 256 ||
      resource.side !== "ALLIED"
    )) ||
    typeof resource.currentHealth !== "number" ||
    !Number.isSafeInteger(resource.currentHealth) ||
    resource.currentHealth <= 0
  ) {
    throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
  }
  const stats = record(resource.stats);
  if (
    typeof stats?.maxHealth !== "number" ||
    !Number.isSafeInteger(stats.maxHealth) ||
    stats.maxHealth !== resource.currentHealth
  ) {
    throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
  }
  const ammunition = record(resource.ammunition);
  const cooldowns = record(resource.cooldowns);
  if (
    !ammunition ||
    Object.values(ammunition).some((amount) =>
      typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) ||
    !cooldowns || Object.keys(cooldowns).length !== 0 ||
    !Array.isArray(resource.statuses) || resource.statuses.length !== 0 ||
    !Array.isArray(resource.statusEffects) ||
    !Array.isArray(resource.weapons) ||
    !Array.isArray(resource.subsystems) ||
    resource.bombardmentSuppression !== undefined
  ) {
    throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
  }
  for (const candidate of resource.weapons) {
    const weapon = record(candidate);
    if (!weapon || typeof weapon.id !== "string") {
      throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
    }
    if (weapon.ammoCapacity !== undefined && (
      typeof weapon.ammoCapacity !== "number" ||
      !Number.isSafeInteger(weapon.ammoCapacity) ||
      ammunition[weapon.id] !== weapon.ammoCapacity
    )) {
      throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
    }
  }
  for (const candidate of resource.subsystems) {
    const subsystem = record(candidate);
    if (
      !subsystem || typeof subsystem.subsystemId !== "string" ||
      subsystem.state !== "OPERATIONAL" ||
      subsystem.damageSourceId !== undefined || subsystem.damagedRound !== undefined
    ) {
      throw new Error("GAME_MASTER_RECOVERY_RESPONSE_INVALID");
    }
  }
  return resource as unknown as GameMasterRecoveryResource;
}

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
  targetId?: string,
): Promise<void> {
  const responseText = await response.clone().text();
  const responseJson = responseText || "{}";
  const now = Date.now();
  const auditId = `gm-audit:${actor.userId}:${commandId}`;
  const statements: D1PreparedStatement[] = [];
  let registryCompletionGuard = "";
  let completeReceiptBeforeProjection = false;
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
  if (operation === "DEPLOYMENT_REVIVE" && response.ok) {
    if (!targetId) throw new Error("GAME_MASTER_RECOVERY_TARGET_MISSING");
    const recovery = parseRecoveryResponse(responseJson, campaignId, commandId, targetId);
    if (recovery.persistentUnitId) {
      const unitId = recovery.persistentUnitId;
      const ammunitionJson = JSON.stringify(recovery.ammunition);
      const statusEffectsJson = JSON.stringify(recovery.statusEffects);
      const subsystemsJson = JSON.stringify(recovery.subsystems);
      const historyId = `gm-recovery:${actor.userId}:${commandId}:${unitId}`;
      const historyPayload = JSON.stringify({
        policyId: GAME_MASTER_RECOVERY_POLICY_ID,
        operation: "EXCEPTIONAL_ADMIN_CORRECTION",
        actorUserId: actor.userId,
        commandId,
        campaignId,
        deploymentId: recovery.id,
        round: recovery.recoveryRound,
        restored: {
          status: "DEPLOYED",
          locationState: "ON_MAP",
          currentHealth: recovery.currentHealth,
          ammunition: recovery.ammunition,
          subsystemState: "OPERATIONAL",
          transientStatusesCleared: true,
        },
      });
      statements.push(
        env.DB.prepare(`UPDATE player_units SET status='DEPLOYED',
            location_kind='CAMPAIGN',location_state='ON_MAP',location_id=?3,
            current_health=?2,ammunition_json=?1,damage_json='[]',
            destroyed_at=NULL,destroyed_campaign_id=NULL,destroyed_round=NULL,destroyed_cause=NULL,
            version=version+1,updated_at=unixepoch()
          WHERE id=?4 AND status='DESTROYED'
            AND EXISTS (SELECT 1 FROM deployments AS deployment
              WHERE deployment.id=?5 AND deployment.campaign_id=?3
                AND deployment.player_unit_id=player_units.id
                AND deployment.side='ALLIED' AND deployment.status='DESTROYED')
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?6 AND receipts.command_id=?7
                AND receipts.reservation_token=?8 AND receipts.operation=?9
                AND receipts.campaign_id=?3 AND receipts.status_code IS NOT NULL)`)
          .bind(ammunitionJson, recovery.currentHealth, campaignId, unitId, recovery.id,
            actor.userId, commandId, reservationToken, operation),
        env.DB.prepare(`UPDATE deployments SET status='ACTIVE',withdrawn_at=NULL,
            snapshot_json=json_remove(json_set(snapshot_json,
              '$.currentHealth',?1,'$.ammunition',json(?2),'$.cooldowns',json('{}'),
              '$.statuses',json('[]'),'$.statusEffects',json(?3),'$.subsystems',json(?4),
              '$.damage',json('[]'),'$.locationState','ON_MAP'),
              '$.bombardmentSuppression')
          WHERE campaign_id=?5 AND id=?6 AND player_unit_id=?7
            AND side='ALLIED' AND status='DESTROYED'
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?8 AND receipts.command_id=?9
                AND receipts.reservation_token=?10 AND receipts.operation=?11
                AND receipts.campaign_id=?5 AND receipts.status_code IS NOT NULL)`)
          .bind(recovery.currentHealth, ammunitionJson, statusEffectsJson, subsystemsJson,
            campaignId, recovery.id, unitId, actor.userId, commandId, reservationToken, operation),
        env.DB.prepare(`UPDATE player_unit_weapon_mounts SET state='OPERATIONAL',
            cooldown_remaining=0,updated_at=unixepoch()
          WHERE player_unit_id=?1
            AND EXISTS (SELECT 1 FROM deployments WHERE campaign_id=?2 AND id=?3
              AND player_unit_id=?1 AND side='ALLIED' AND status='ACTIVE')
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5
                AND receipts.reservation_token=?6 AND receipts.operation=?7
                AND receipts.campaign_id=?2 AND receipts.status_code IS NOT NULL)`)
          .bind(unitId, campaignId, recovery.id, actor.userId, commandId, reservationToken, operation),
        env.DB.prepare(`UPDATE campaign_weapon_states SET ready_at_round=NULL,
            revision=revision+1
          WHERE snapshot_id IN (SELECT snapshots.id
            FROM campaign_loadout_snapshots AS snapshots
            JOIN deployments ON deployments.campaign_id=snapshots.campaign_id
              AND deployments.player_unit_id=snapshots.player_unit_id
            WHERE snapshots.campaign_id=?1 AND snapshots.player_unit_id=?2
              AND deployments.id=?3 AND deployments.side='ALLIED' AND deployments.status='ACTIVE')
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5
                AND receipts.reservation_token=?6 AND receipts.operation=?7
                AND receipts.campaign_id=?1 AND receipts.status_code IS NOT NULL)`)
          .bind(campaignId, unitId, recovery.id, actor.userId, commandId, reservationToken, operation),
        env.DB.prepare(`UPDATE player_unit_subsystems SET state='OPERATIONAL',
            damaged_campaign_id=NULL,damaged_round=NULL,repaired_at=unixepoch(),
            state_json='{}',revision=revision+1,updated_at=unixepoch()
          WHERE player_unit_id=?1
            AND EXISTS (SELECT 1 FROM deployments WHERE campaign_id=?2 AND id=?3
              AND player_unit_id=?1 AND side='ALLIED' AND status='ACTIVE')
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5
                AND receipts.reservation_token=?6 AND receipts.operation=?7
                AND receipts.campaign_id=?2 AND receipts.status_code IS NOT NULL)`)
          .bind(unitId, campaignId, recovery.id, actor.userId, commandId, reservationToken, operation),
        env.DB.prepare(`UPDATE player_unit_status_effects SET removed_at=unixepoch()
          WHERE player_unit_id=?1 AND removed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM status_effect_definitions AS definitions
              WHERE definitions.id=player_unit_status_effects.status_effect_id
                AND definitions.ruleset_id=player_unit_status_effects.ruleset_id
                AND COALESCE(json_extract(definitions.definition_json,'$.permanent'),0)=1)
            AND EXISTS (SELECT 1 FROM deployments WHERE campaign_id=?2 AND id=?3
              AND player_unit_id=?1 AND side='ALLIED' AND status='ACTIVE')
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5
                AND receipts.reservation_token=?6 AND receipts.operation=?7
                AND receipts.campaign_id=?2 AND receipts.status_code IS NOT NULL)`)
          .bind(unitId, campaignId, recovery.id, actor.userId, commandId, reservationToken, operation),
      );
      for (const [weaponId, amount] of Object.entries(recovery.ammunition)) {
        statements.push(
          env.DB.prepare(`UPDATE player_unit_weapon_mounts SET current_ammo=?1,
              cooldown_remaining=0,state='OPERATIONAL',updated_at=unixepoch()
            WHERE player_unit_id=?3 AND weapon_definition_id=?2
              AND EXISTS (SELECT 1 FROM deployments WHERE campaign_id=?4 AND id=?5
                AND player_unit_id=?3 AND side='ALLIED' AND status='ACTIVE')
              AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
                WHERE receipts.actor_user_id=?6 AND receipts.command_id=?7
                  AND receipts.reservation_token=?8 AND receipts.operation=?9
                  AND receipts.campaign_id=?4 AND receipts.status_code IS NOT NULL)`)
            .bind(amount, weaponId, unitId, campaignId, recovery.id,
              actor.userId, commandId, reservationToken, operation),
          env.DB.prepare(`UPDATE campaign_weapon_states SET ammo_remaining=?1,
              ready_at_round=NULL,revision=revision+1
            WHERE weapon_id=?2 AND snapshot_id IN (SELECT snapshots.id
              FROM campaign_loadout_snapshots AS snapshots
              JOIN deployments ON deployments.campaign_id=snapshots.campaign_id
                AND deployments.player_unit_id=snapshots.player_unit_id
              WHERE snapshots.campaign_id=?3 AND snapshots.player_unit_id=?4
                AND deployments.id=?5 AND deployments.side='ALLIED' AND deployments.status='ACTIVE')
              AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
                WHERE receipts.actor_user_id=?6 AND receipts.command_id=?7
                  AND receipts.reservation_token=?8 AND receipts.operation=?9
                  AND receipts.campaign_id=?3 AND receipts.status_code IS NOT NULL)`)
            .bind(amount, weaponId, campaignId, unitId, recovery.id,
              actor.userId, commandId, reservationToken, operation),
        );
      }
      statements.push(env.DB.prepare(`INSERT INTO unit_history (
          id,player_unit_id,event_type,campaign_id,round_number,payload_json,
          occurred_at,idempotency_key,summary,actor_user_id,visibility
        ) SELECT ?1,units.id,'GAME_MASTER_RECOVERY',?3,?4,?5,unixepoch(),?1,?6,?7,'OWNER'
          FROM player_units AS units JOIN deployments
            ON deployments.player_unit_id=units.id AND deployments.campaign_id=?3
          WHERE units.id=?2 AND units.status='DEPLOYED'
            AND units.location_kind='CAMPAIGN' AND units.location_state='ON_MAP'
            AND deployments.id=?11 AND deployments.side='ALLIED' AND deployments.status='ACTIVE'
            AND EXISTS (SELECT 1 FROM game_master_command_receipts AS receipts
              WHERE receipts.actor_user_id=?7 AND receipts.command_id=?8
                AND receipts.reservation_token=?9 AND receipts.operation=?10
                AND receipts.campaign_id=?3 AND receipts.status_code IS NOT NULL)
          ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(historyId, unitId, campaignId, recovery.recoveryRound, historyPayload,
          `Global Game Master recovery under ${GAME_MASTER_RECOVERY_POLICY_ID}.`, actor.userId,
          commandId, reservationToken, operation, recovery.id));
      registryCompletionGuard = `AND EXISTS (
          SELECT 1 FROM deployments JOIN player_units AS units
            ON units.id=deployments.player_unit_id
          WHERE deployments.campaign_id=?8 AND deployments.id=?9
            AND deployments.player_unit_id=?10 AND deployments.side='ALLIED'
            AND deployments.status='DESTROYED' AND units.status='DESTROYED'
            AND units.location_kind='DESTROYED' AND units.location_state='DESTROYED'
            AND units.current_health=0)`;
      receiptBindings.push(recovery.id, unitId);
      completeReceiptBeforeProjection = true;
    }
  }
  const receiptCompletion = env.DB.prepare(`UPDATE game_master_command_receipts
      SET status_code=?1,response_json=?2,completed_at=?3
      WHERE actor_user_id=?4 AND command_id=?5 AND reservation_token=?6
        AND operation=?7 AND campaign_id=?8 AND status_code IS NULL
        ${registryCompletionGuard}`)
      .bind(...receiptBindings);
  const auditCompletion = env.DB.prepare(`INSERT INTO game_master_audit_events
      (id,actor_user_id,grant_source,operation,campaign_id,command_id,request_hash,request_json,response_status,response_json,occurred_at)
      SELECT ?1,receipts.actor_user_id,?2,receipts.operation,receipts.campaign_id,receipts.command_id,
        receipts.request_hash,receipts.request_json,receipts.status_code,receipts.response_json,?3
      FROM game_master_command_receipts AS receipts
      WHERE receipts.actor_user_id=?4 AND receipts.command_id=?5 AND receipts.reservation_token=?6
        AND receipts.status_code IS NOT NULL
      ON CONFLICT(actor_user_id,command_id) DO NOTHING`)
      .bind(auditId, actor.source, now, actor.userId, commandId, reservationToken);
  await env.DB.batch(completeReceiptBeforeProjection
    ? [receiptCompletion, ...statements, auditCompletion]
    : [...statements, receiptCompletion, auditCompletion]);
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
      reviveMatch?.[2],
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

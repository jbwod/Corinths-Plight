import { authenticate } from "../auth";
import {
  AUTHORED_SCENARIO_MAP_SOURCES,
  isAuthoredScenarioMapSourceKey,
} from "../../packages/rules-engine/src";
import type { Env } from "../env";
import { errorResponse, json } from "../http";

interface CampaignDirectoryRow {
  campaign_id: string;
  name: string;
  status: string;
  planet_name: string;
  map_source_key: string;
  side: string;
  role: string;
  joined_at: number;
  minimum_players: number;
  maximum_players: number;
  member_count: number;
  deployment_count: number;
  result: "VICTORY" | "DEFEAT" | null;
  outcome_reason: string | null;
  result_round: number | null;
  rewards_json: string | null;
  resolved_at: number | null;
}

interface PublicCampaignRow {
  campaign_id: string;
  name: string;
  status: string;
  planet_name: string;
  map_source_key: string;
  minimum_players: number;
  maximum_players: number;
  member_count: number;
}

const joinPath = /^\/api\/campaigns\/([a-z0-9][a-z0-9-]{0,63})\/join$/;
const [outpostMapSource, ironRainMapSource] = AUTHORED_SCENARIO_MAP_SOURCES;

function scenarioBriefing(mapSourceKey: string): Record<string, unknown> | undefined {
  if (mapSourceKey === "fixture/outpost-k17") {
    return {
      threat: "MODERATE",
      objectives: ["Hold Outpost K-17", "Destroy Bug Nest", "Keep Supply Route Open"],
      durationRounds: 4,
      recommendedCapabilities: ["GROUND_COMBAT", "ARMOURED", "ARTILLERY"],
    };
  }
  if (mapSourceKey === "fixture/operation-iron-rain") {
    return {
      threat: "HIGH",
      objectives: ["Hold Airfield", "Destroy Hive"],
      durationRounds: 6,
      recommendedCapabilities: ["GROUND_COMBAT", "ARMOURED", "ENGINEERING", "ARTILLERY"],
    };
  }
  return undefined;
}

async function commandHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function joinCampaign(request: Request, env: Env, campaignId: string): Promise<Response> {
  const identity = await authenticate(request, env);
  if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required to join a campaign.");
  const userId = identity.kind === "SESSION" ? identity.userId : identity.viewer.userId;
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse(400, "INVALID_JSON", "Request body is not valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "INVALID_COMMAND", "Campaign join command is invalid.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "commandId") ||
      typeof record.commandId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(record.commandId)) {
    return errorResponse(400, "INVALID_COMMAND", "Campaign join command is invalid.");
  }
  const requestHash = await commandHash({ campaignId, userId });
  const prior = await env.DB.prepare(`SELECT campaign_id,request_hash,response_json
    FROM campaign_join_receipts WHERE user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(userId, record.commandId).first<{ campaign_id: string; request_hash: string; response_json: string }>();
  if (prior) {
    if (prior.campaign_id !== campaignId || prior.request_hash !== requestHash) {
      return errorResponse(409, "COMMAND_ID_REUSED", "commandId was already used for a different command.");
    }
    return json(JSON.parse(prior.response_json));
  }
  const response = { joined: true, campaignId };
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO campaign_memberships (campaign_id,user_id,battalion_id,side,role)
      SELECT campaigns.id,?1,active.battalion_id,'ALLIED','PLAYER'
      FROM campaigns JOIN user_active_battalions AS active ON active.user_id=?1
      WHERE campaigns.id=?2 AND campaigns.status='RECRUITING'
        AND campaigns.map_source_key IN (?3,?4)
        AND (SELECT COUNT(*) FROM campaign_memberships WHERE campaign_id=campaigns.id) < campaigns.maximum_players
      ON CONFLICT(campaign_id,user_id) DO NOTHING`)
      .bind(userId, campaignId, outpostMapSource, ironRainMapSource),
    env.DB.prepare(`INSERT INTO campaign_join_receipts
      (user_id,command_id,campaign_id,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM campaign_memberships WHERE campaign_id=?6 AND user_id=?1)`)
      .bind(userId, record.commandId, campaignId, requestHash, JSON.stringify(response), campaignId),
  ]);
  const committed = await env.DB.prepare(`SELECT response_json FROM campaign_join_receipts
    WHERE user_id=?1 AND command_id=?2 AND campaign_id=?3 AND request_hash=?4 LIMIT 1`)
    .bind(userId, record.commandId, campaignId, requestHash).first<{ response_json: string }>();
  if (!committed) return errorResponse(409, "CAMPAIGN_JOIN_UNAVAILABLE", "The campaign is full, closed, or your active Battalion is missing.");
  return json(JSON.parse(committed.response_json), { status: 201 });
}

export async function routeCampaignDirectoryRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const join = url.pathname.match(joinPath);
  if (join) {
    if (request.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST to join a campaign.", { allowed: ["POST"] });
    return joinCampaign(request, env, join[1]);
  }
  if (url.pathname !== "/api/campaigns") return null;
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET for the campaign directory.", { allowed: ["GET"] });
  }
  const identity = await authenticate(request, env);
  if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required to view campaigns.");
  const userId = identity.kind === "SESSION" ? identity.userId : identity.viewer.userId;
  const [result, available] = await Promise.all([
    env.DB.prepare(`SELECT campaigns.id AS campaign_id, campaigns.name,
      campaigns.status, planets.name AS planet_name, campaigns.map_source_key,
      memberships.side, memberships.role, memberships.joined_at,
      campaigns.minimum_players, campaigns.maximum_players,
      results.result,results.reason AS outcome_reason,results.round_number AS result_round,
      results.rewards_json,results.resolved_at,
      (SELECT COUNT(*) FROM campaign_memberships AS members
        WHERE members.campaign_id = campaigns.id) AS member_count,
      (SELECT COUNT(*) FROM deployments
        WHERE deployments.campaign_id=campaigns.id AND deployments.owner_id=?1
          AND deployments.status IN ('READY','ACTIVE','IMMOBILISED')) AS deployment_count
    FROM campaign_memberships AS memberships
    JOIN campaigns ON campaigns.id = memberships.campaign_id
    JOIN planets ON planets.id = campaigns.planet_id
    LEFT JOIN campaign_results AS results ON results.campaign_id=campaigns.id
    WHERE memberships.user_id = ?1
      AND campaigns.status IN ('RECRUITING','ACTIVE','PAUSED','COMPLETE','FAILED')
    ORDER BY CASE campaigns.status
      WHEN 'ACTIVE' THEN 0 WHEN 'RECRUITING' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END,
      campaigns.name, campaigns.id`).bind(userId).all<CampaignDirectoryRow>(),
    env.DB.prepare(`SELECT campaigns.id AS campaign_id,campaigns.name,campaigns.status,
        planets.name AS planet_name,campaigns.map_source_key,campaigns.minimum_players,
        campaigns.maximum_players,(SELECT COUNT(*) FROM campaign_memberships AS members
          WHERE members.campaign_id=campaigns.id) AS member_count
      FROM campaigns JOIN planets ON planets.id=campaigns.planet_id
      WHERE campaigns.status='RECRUITING' AND campaigns.map_source_key IN (?2,?3)
        AND NOT EXISTS (SELECT 1 FROM campaign_memberships AS mine
          WHERE mine.campaign_id=campaigns.id AND mine.user_id=?1)
        AND (SELECT COUNT(*) FROM campaign_memberships AS members
          WHERE members.campaign_id=campaigns.id) < campaigns.maximum_players
      ORDER BY campaigns.name,campaigns.id`)
      .bind(userId, outpostMapSource, ironRainMapSource).all<PublicCampaignRow>(),
  ]);
  return json({
    campaigns: result.results.map((row) => ({
      campaignId: row.campaign_id,
      name: row.name,
      planetName: row.planet_name,
      status: row.status,
      side: row.side,
      role: row.role,
      joinedAt: row.joined_at,
      memberCount: Number(row.member_count),
      minimumPlayers: Number(row.minimum_players),
      maximumPlayers: Number(row.maximum_players),
      scenarioAvailable: isAuthoredScenarioMapSourceKey(row.map_source_key),
      canEnter: isAuthoredScenarioMapSourceKey(row.map_source_key) && Number(row.deployment_count) > 0 &&
        ["RECRUITING", "ACTIVE", "PAUSED", "COMPLETE", "FAILED"].includes(row.status),
      briefing: scenarioBriefing(row.map_source_key),
      outcome: row.result ? {
        result: row.result,
        reason: row.outcome_reason,
        round: Number(row.result_round),
        rewards: row.rewards_json ? JSON.parse(row.rewards_json) : undefined,
        resolvedAt: Number(row.resolved_at),
      } : undefined,
    })),
    availableCampaigns: available.results.map((row) => ({
      campaignId: row.campaign_id,
      name: row.name,
      planetName: row.planet_name,
      status: row.status,
      memberCount: Number(row.member_count),
      minimumPlayers: Number(row.minimum_players),
      maximumPlayers: Number(row.maximum_players),
      scenarioAvailable: isAuthoredScenarioMapSourceKey(row.map_source_key),
      canJoin: isAuthoredScenarioMapSourceKey(row.map_source_key),
      briefing: scenarioBriefing(row.map_source_key),
    })),
  });
}

import { authenticate } from "../auth";
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
}

export async function routeCampaignDirectoryRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/campaigns") return null;
  if (request.method !== "GET") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET for the campaign directory.", { allowed: ["GET"] });
  }
  const identity = await authenticate(request, env);
  if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required to view campaigns.");
  const userId = identity.kind === "SESSION" ? identity.userId : identity.viewer.userId;
  const result = await env.DB.prepare(`SELECT campaigns.id AS campaign_id, campaigns.name,
      campaigns.status, planets.name AS planet_name, campaigns.map_source_key,
      memberships.side, memberships.role, memberships.joined_at,
      campaigns.minimum_players, campaigns.maximum_players,
      (SELECT COUNT(*) FROM campaign_memberships AS members
        WHERE members.campaign_id = campaigns.id) AS member_count
    FROM campaign_memberships AS memberships
    JOIN campaigns ON campaigns.id = memberships.campaign_id
    JOIN planets ON planets.id = campaigns.planet_id
    WHERE memberships.user_id = ?1
      AND campaigns.status IN ('RECRUITING','ACTIVE','PAUSED','COMPLETE','FAILED')
    ORDER BY CASE campaigns.status
      WHEN 'ACTIVE' THEN 0 WHEN 'RECRUITING' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END,
      campaigns.name, campaigns.id`).bind(userId).all<CampaignDirectoryRow>();
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
      scenarioAvailable: row.map_source_key === "fixture/outpost-k17",
      canEnter: row.map_source_key === "fixture/outpost-k17" && ["ACTIVE", "PAUSED", "COMPLETE", "FAILED"].includes(row.status),
    })),
  });
}

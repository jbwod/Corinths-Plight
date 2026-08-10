import type { ViewerContext } from "../packages/domain/src";
import type { Env } from "./env";

interface SessionRow {
  user_id: string;
}

interface CampaignMembershipRow {
  campaign_id: string;
  side: string | null;
  role: string | null;
  battalion_id: string | null;
}

export type AuthenticatedIdentity =
  | { kind: "SESSION"; userId: string }
  | { kind: "DEMO"; viewer: ViewerContext };

export type CampaignAccessDecision =
  | { allowed: true; viewer: ViewerContext }
  | { allowed: false; reason: "NOT_FOUND" | "FORBIDDEN" | "ROLE_UNSUPPORTED" };

export const LOCAL_DEMO_CAMPAIGN_ID = "outpost-k17";
export const LOCAL_DEMO_CAMPAIGN_IDS = new Set([LOCAL_DEMO_CAMPAIGN_ID, "operation-spearhead"]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const knownEnvironments = new Set(["development", "preview", "production"]);

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator > 0 && trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return undefined;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function demoAuthEnabled(env: Pick<Env, "ENVIRONMENT" | "ALLOW_DEMO_AUTH">): boolean {
  return env.ENVIRONMENT === "development" && env.ALLOW_DEMO_AUTH === "true";
}

export function authConfigurationIsSafe(env: Pick<Env, "ENVIRONMENT" | "ALLOW_DEMO_AUTH">): boolean {
  if (!knownEnvironments.has(env.ENVIRONMENT)) return false;
  return env.ENVIRONMENT !== "production" || env.ALLOW_DEMO_AUTH !== "true";
}

export function requestRequiresSameOrigin(request: Request): boolean {
  return !safeMethods.has(request.method.toUpperCase()) || request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requestIsExplicitlyCrossOrigin(request: Request): boolean {
  if (request.headers.has("origin")) return !requestIsSameOrigin(request);
  return request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site";
}

export async function authenticate(request: Request, env: Env): Promise<AuthenticatedIdentity | null> {
  // Browsers cannot attach custom headers to a WebSocket handshake. The query
  // fallback is available only in an explicitly opted-in local environment.
  const developmentIdentity =
    request.headers.get("x-demo-user") ?? new URL(request.url).searchParams.get("demo_user");
  if (demoAuthEnabled(env) && developmentIdentity && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(developmentIdentity)) {
    return {
      kind: "DEMO",
      viewer: {
        userId: developmentIdentity,
        side: "ALLIED",
        role: request.headers.get("x-demo-role") === "ADMIN" ? "ADMIN" : "PLAYER",
        battalionId: "battalion-33rd-expeditionary",
      },
    };
  }

  const token = cookie(request, "corinth_session");
  if (!token || token.length < 32 || token.length > 512) return null;
  let decodedToken: string;
  try {
    decodedToken = decodeURIComponent(token);
  } catch {
    return null;
  }
  const tokenHash = await sha256(decodedToken);
  const row = await env.DB.prepare(
    `SELECT s.user_id
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id AND u.status = 'ACTIVE'
      WHERE s.token_hash = ?1 AND s.expires_at > unixepoch() AND s.revoked_at IS NULL
      LIMIT 1`,
  )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row) return null;
  return { kind: "SESSION", userId: row.user_id };
}

export function campaignAccessFromRow(
  userId: string,
  row: CampaignMembershipRow | null,
): CampaignAccessDecision {
  if (!row) return { allowed: false, reason: "NOT_FOUND" };
  if (!row.role || !row.side) return { allowed: false, reason: "FORBIDDEN" };

  if (row.role === "OBSERVER") return { allowed: false, reason: "ROLE_UNSUPPORTED" };
  if (row.role !== "PLAYER" && row.role !== "BATTALION_COMMAND" && row.role !== "GM") {
    return { allowed: false, reason: "ROLE_UNSUPPORTED" };
  }
  if (row.side !== "ALLIED" && row.side !== "ENEMY" && !(row.side === "NEUTRAL" && row.role === "GM")) {
    return { allowed: false, reason: "ROLE_UNSUPPORTED" };
  }

  return {
    allowed: true,
    viewer: {
      userId,
      side: row.side === "NEUTRAL" ? "ALLIED" : row.side,
      role: row.role === "GM" ? "ADMIN" : row.role,
      battalionId: row.battalion_id ?? undefined,
    },
  };
}

export async function authorizeCampaign(
  identity: AuthenticatedIdentity,
  campaignId: string,
  env: Env,
): Promise<CampaignAccessDecision> {
  if (identity.kind === "DEMO") {
    return demoAuthEnabled(env) && LOCAL_DEMO_CAMPAIGN_IDS.has(campaignId)
      ? { allowed: true, viewer: identity.viewer }
      : { allowed: false, reason: "NOT_FOUND" };
  }

  const row = await env.DB.prepare(
    `SELECT c.id AS campaign_id, m.side, m.role, m.battalion_id
       FROM campaigns c
       LEFT JOIN campaign_memberships m
         ON m.campaign_id = c.id AND m.user_id = ?2
      WHERE c.id = ?1
        AND c.status IN ('ACTIVE', 'PAUSED', 'COMPLETE', 'FAILED')
      LIMIT 1`,
  )
    .bind(campaignId, identity.userId)
    .first<CampaignMembershipRow>();
  return campaignAccessFromRow(identity.userId, row);
}

export function internalViewerHeaders(viewer: ViewerContext): Headers {
  const headers = new Headers();
  headers.set("x-corinth-user", viewer.userId);
  headers.set("x-corinth-side", viewer.side);
  headers.set("x-corinth-role", viewer.role);
  if (viewer.battalionId) headers.set("x-corinth-battalion", viewer.battalionId);
  return headers;
}

export function viewerFromInternalRequest(request: Request): ViewerContext {
  const userId = request.headers.get("x-corinth-user");
  const side = request.headers.get("x-corinth-side");
  const role = request.headers.get("x-corinth-role");
  if (!userId || (side !== "ALLIED" && side !== "ENEMY") || !role) {
    throw new Error("Missing trusted viewer context.");
  }
  return {
    userId,
    side,
    role: role === "ADMIN" ? "ADMIN" : role === "BATTALION_COMMAND" ? "BATTALION_COMMAND" : "PLAYER",
    battalionId: request.headers.get("x-corinth-battalion") ?? undefined,
  };
}

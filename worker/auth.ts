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

export type GameMasterAccessDecision =
  | { allowed: true; userId: string; source: "GLOBAL_GRANT" | "DEVELOPMENT_DEMO" }
  | { allowed: false; userId: string };

export const LOCAL_DEMO_CAMPAIGN_ID = "outpost-k17";
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

export function requestIsEmailVerificationNavigation(request: Request): boolean {
  if (request.method.toUpperCase() !== "GET" || request.headers.has("origin")) return false;
  if (new URL(request.url).pathname !== "/api/auth/verify") return false;
  return (
    request.headers.get("sec-fetch-mode")?.toLowerCase() === "navigate" &&
    request.headers.get("sec-fetch-dest")?.toLowerCase() === "document"
  );
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
  if (identity.kind === "DEMO" && !demoAuthEnabled(env)) return { allowed: false, reason: "NOT_FOUND" };
  const userId = identity.kind === "DEMO" ? identity.viewer.userId : identity.userId;

  const row = await env.DB.prepare(
    `SELECT c.id AS campaign_id, m.side, m.role, m.battalion_id
       FROM campaigns c
       LEFT JOIN campaign_memberships m
         ON m.campaign_id = c.id AND m.user_id = ?2
      WHERE c.id = ?1
        AND c.status IN ('RECRUITING', 'ACTIVE', 'PAUSED', 'COMPLETE', 'FAILED')
      LIMIT 1`,
  )
    .bind(campaignId, userId)
    .first<CampaignMembershipRow>();
  return campaignAccessFromRow(userId, row);
}

export async function authorizeGameMaster(
  identity: AuthenticatedIdentity,
  env: Env,
): Promise<GameMasterAccessDecision> {
  if (identity.kind === "DEMO") {
    return demoAuthEnabled(env) && identity.viewer.role === "ADMIN"
      ? { allowed: true, userId: identity.viewer.userId, source: "DEVELOPMENT_DEMO" }
      : { allowed: false, userId: identity.viewer.userId };
  }
  const grant = await env.DB.prepare(`SELECT grants.user_id
      FROM game_master_grants AS grants
      JOIN users ON users.id=grants.user_id AND users.status='ACTIVE'
      WHERE grants.user_id=?1 AND grants.status='ACTIVE'
      LIMIT 1`)
    .bind(identity.userId)
    .first<{ user_id: string }>();
  return grant
    ? { allowed: true, userId: identity.userId, source: "GLOBAL_GRANT" }
    : { allowed: false, userId: identity.userId };
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

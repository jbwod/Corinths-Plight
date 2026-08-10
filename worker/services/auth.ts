import type { AuthLinkRequestedDto, AuthSessionDto, AuthUserDto } from "../../packages/domain/src";
import { authenticate, demoAuthEnabled, type AuthenticatedIdentity } from "../auth";
import type { Env } from "../env";

const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_REQUEST_LIMIT = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export class AuthServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ChallengeRow {
  id: string;
  purpose: "REGISTER" | "LOGIN";
  email: string;
  email_hash: string;
  proposed_user_id: string | null;
  proposed_username: string | null;
  proposed_display_name: string | null;
  status: string;
  expires_at: number;
}

interface SessionUserRow {
  session_id: string;
  user_id: string;
  email: string;
  username: string;
  email_verified_at: number | null;
  display_name: string;
  callsign: string | null;
}

export interface RequestAuthLinkInput {
  email: string;
  username?: string;
  displayName?: string;
}

function seconds(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashSecret(env: Env): string {
  if (env.AUTH_HASH_KEY) return env.AUTH_HASH_KEY;
  if (env.ENVIRONMENT === "development" && demoAuthEnabled(env)) return "corinth-development-only-auth-hash-key";
  throw new AuthServiceError(503, "AUTH_NOT_CONFIGURED", "Production authentication is not configured.");
}

export function authAvailable(env: Env): boolean {
  if (env.ENVIRONMENT === "development" && demoAuthEnabled(env)) return true;
  return Boolean(env.RESEND_API_KEY && env.AUTH_HASH_KEY && env.AUTH_BASE_URL?.startsWith("https://") && env.AUTH_FROM_EMAIL);
}

function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

function userAgent(request: Request): string {
  return request.headers.get("user-agent")?.slice(0, 512) ?? "unknown";
}

async function requestFingerprints(request: Request, env: Env): Promise<{ ipHash: string; userAgentHash: string }> {
  const secret = hashSecret(env);
  return {
    ipHash: await hmac(`ip:${requestIp(request)}`, secret),
    userAgentHash: await hmac(`ua:${userAgent(request)}`, secret),
  };
}

async function enforceRateLimit(env: Env, bucketKey: string, now: number): Promise<void> {
  const row = await env.DB.prepare(`INSERT INTO auth_rate_limits (
      bucket_key,window_started_at,request_count,blocked_until,updated_at
    ) VALUES (?1,?2,1,NULL,?2)
    ON CONFLICT(bucket_key) DO UPDATE SET
      request_count = CASE
        WHEN auth_rate_limits.window_started_at <= ?3 THEN 1
        ELSE auth_rate_limits.request_count + 1 END,
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at <= ?3 THEN ?2
        ELSE auth_rate_limits.window_started_at END,
      blocked_until = CASE
        WHEN auth_rate_limits.window_started_at <= ?3 THEN NULL
        WHEN auth_rate_limits.request_count + 1 > ?4 THEN ?2 + ?5
        ELSE auth_rate_limits.blocked_until END,
      updated_at = ?2
    RETURNING request_count, blocked_until`)
    .bind(bucketKey, now, now - RATE_WINDOW_SECONDS, RATE_REQUEST_LIMIT, RATE_WINDOW_SECONDS)
    .first<{ request_count: number; blocked_until: number | null }>();
  if (!row || (row.blocked_until !== null && row.blocked_until > now)) {
    throw new AuthServiceError(429, "AUTH_RATE_LIMITED", "Too many sign-in attempts. Try again in 15 minutes.");
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendVerificationEmail(
  env: Env,
  challenge: { id: string; email: string; displayName?: string; verificationUrl: string; purpose: "REGISTER" | "LOGIN" },
): Promise<string> {
  if (!env.RESEND_API_KEY) {
    if (env.ENVIRONMENT === "development" && demoAuthEnabled(env)) return "development-delivery";
    throw new AuthServiceError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
  }
  const greeting = challenge.displayName ? `, ${escapeHtml(challenge.displayName)}` : "";
  const action = challenge.purpose === "REGISTER" ? "complete your enlistment" : "sign in";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `auth-link/${challenge.id}`,
      "user-agent": "CorinthsPlight/0.1",
    },
    body: JSON.stringify({
      from: env.AUTH_FROM_EMAIL ?? "",
      to: [challenge.email],
      subject: challenge.purpose === "REGISTER" ? "Complete your Corinth's Plight enlistment" : "Your Corinth's Plight sign-in link",
      text: `Command access requested. Open this link to ${action}: ${challenge.verificationUrl}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`,
      html: `<div style="background:#071013;color:#dce8e8;padding:32px;font-family:Arial,sans-serif"><h1 style="font-size:22px">Command access${greeting}</h1><p>Use the secure link below to ${action}.</p><p><a href="${escapeHtml(challenge.verificationUrl)}" style="display:inline-block;padding:12px 18px;background:#76e3d2;color:#071013;text-decoration:none;font-weight:700">OPEN COMMAND ACCESS</a></p><p style="color:#93a7a8;font-size:13px">This link expires in 15 minutes and can be used once. If you did not request it, ignore this email.</p></div>`,
      tags: [{ name: "category", value: "authentication" }],
    }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new AuthServiceError(503, "EMAIL_DELIVERY_FAILED", "The access email could not be sent. Try again shortly.");
  }
  return body.id;
}

async function audit(
  env: Env,
  input: { userId?: string; eventType: string; outcome: "SUCCESS" | "REJECTED" | "FAILED"; subjectHash?: string; ipHash: string; userAgentHash: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await env.DB.prepare(`INSERT INTO auth_audit_events (
    id,user_id,event_type,outcome,subject_hash,ip_hash,user_agent_hash,metadata_json
  ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
    .bind(`auth-event-${crypto.randomUUID()}`, input.userId ?? null, input.eventType, input.outcome,
      input.subjectHash ?? null, input.ipHash, input.userAgentHash, JSON.stringify(input.metadata ?? {}))
    .run();
}

export function validateRegistrationInput(value: unknown): RequestAuthLinkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthServiceError(400, "REGISTRATION_INVALID", "Registration details are invalid.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["email", "username", "displayName"].includes(key))) {
    throw new AuthServiceError(400, "REGISTRATION_INVALID", "Registration contains unsupported fields.");
  }
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new AuthServiceError(400, "EMAIL_INVALID", "Enter a valid email address.");
  if (!USERNAME_PATTERN.test(username)) throw new AuthServiceError(400, "USERNAME_INVALID", "Username must be 3–24 lowercase letters, numbers, hyphens, or underscores.");
  if (displayName.length < 2 || displayName.length > 48) throw new AuthServiceError(400, "DISPLAY_NAME_INVALID", "Display name must be 2–48 characters.");
  return { email, username, displayName };
}

export function validateLoginInput(value: unknown): RequestAuthLinkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthServiceError(400, "LOGIN_INVALID", "Login details are invalid.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "email")) throw new AuthServiceError(400, "LOGIN_INVALID", "Login contains unsupported fields.");
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new AuthServiceError(400, "EMAIL_INVALID", "Enter a valid email address.");
  return { email };
}

export async function requestAuthLink(
  request: Request,
  env: Env,
  requestedPurpose: "REGISTER" | "LOGIN",
  input: RequestAuthLinkInput,
): Promise<AuthLinkRequestedDto> {
  if (!authAvailable(env)) throw new AuthServiceError(503, "AUTH_NOT_CONFIGURED", "Production authentication is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const secret = hashSecret(env);
  const email = normalizeEmail(input.email);
  const emailHash = await hmac(`email:${email}`, secret);
  const { ipHash, userAgentHash } = await requestFingerprints(request, env);
  await enforceRateLimit(env, await hmac(`rate:ip:${requestIp(request)}`, secret), now);
  await enforceRateLimit(env, await hmac(`rate:email:${email}`, secret), now);

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?1 COLLATE NOCASE LIMIT 1`)
    .bind(email).first<{ id: string }>();
  let purpose = requestedPurpose;
  if (requestedPurpose === "LOGIN" && !existing) {
    await audit(env, { eventType: "AUTH_LINK_REQUESTED", outcome: "REJECTED", subjectHash: emailHash, ipHash, userAgentHash, metadata: { reason: "unknown_subject" } }).catch(() => undefined);
    return { accepted: true, message: "If the address is eligible, a secure access link is on its way." };
  }
  if (requestedPurpose === "REGISTER" && existing) purpose = "LOGIN";
  if (purpose === "REGISTER") {
    const usernameTaken = await env.DB.prepare(`SELECT 1 FROM users WHERE username = ?1 COLLATE NOCASE LIMIT 1`)
      .bind(input.username).first();
    if (usernameTaken) throw new AuthServiceError(409, "USERNAME_UNAVAILABLE", "That username is unavailable.");
  }

  const challengeId = `auth-challenge-${crypto.randomUUID()}`;
  const token = randomToken();
  const tokenHash = await sha256(token);
  const ttl = seconds(env.AUTH_CHALLENGE_TTL_SECONDS, 900, 300, 3600);
  const baseUrl = env.ENVIRONMENT === "development"
    ? new URL(request.url).origin
    : env.AUTH_BASE_URL ?? new URL(request.url).origin;
  const verificationUrl = `${baseUrl.replace(/\/$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await env.DB.batch([
    env.DB.prepare(`UPDATE auth_email_challenges SET status='REVOKED'
      WHERE email_hash=?1 AND status IN ('PENDING','SENT') AND expires_at>?2`).bind(emailHash, now),
    env.DB.prepare(`INSERT INTO auth_email_challenges (
        id,purpose,email,email_hash,proposed_user_id,proposed_username,proposed_display_name,
        token_hash,status,created_at,expires_at,requested_ip_hash,user_agent_hash
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'PENDING',?9,?10,?11,?12)`)
      .bind(challengeId, purpose, email, emailHash,
        purpose === "REGISTER" ? `user-${crypto.randomUUID()}` : null,
        purpose === "REGISTER" ? input.username : null,
        purpose === "REGISTER" ? input.displayName : null,
        tokenHash, now, now + ttl, ipHash, userAgentHash),
  ]);
  let resendId: string;
  try {
    resendId = await sendVerificationEmail(env, {
      id: challengeId,
      email,
      displayName: purpose === "REGISTER" ? input.displayName : undefined,
      verificationUrl,
      purpose,
    });
  } catch (error) {
    await env.DB.prepare(`UPDATE auth_email_challenges SET status='SEND_FAILED',
      send_attempt_count=send_attempt_count+1 WHERE id=?1 AND status='PENDING'`).bind(challengeId).run();
    await audit(env, { userId: existing?.id, eventType: "AUTH_LINK_REQUESTED", outcome: "FAILED", subjectHash: emailHash, ipHash, userAgentHash, metadata: { purpose } }).catch(() => undefined);
    throw error;
  }
  await env.DB.prepare(`UPDATE auth_email_challenges SET status='SENT', resend_email_id=?1,
    send_attempt_count=send_attempt_count+1 WHERE id=?2 AND status='PENDING'`).bind(resendId, challengeId).run();
  await audit(env, { userId: existing?.id, eventType: "AUTH_LINK_REQUESTED", outcome: "SUCCESS", subjectHash: emailHash, ipHash, userAgentHash, metadata: { purpose } }).catch(() => undefined);
  return {
    accepted: true,
    message: "If the address is eligible, a secure access link is on its way.",
    ...(env.ENVIRONMENT === "development" && !env.RESEND_API_KEY ? { developmentVerificationUrl: verificationUrl } : {}),
  };
}

function sessionCookie(token: string, env: Env): string {
  const ttl = seconds(env.AUTH_SESSION_TTL_SECONDS, 2_592_000, 3600, 7_776_000);
  const secure = env.ENVIRONMENT === "development" ? "" : "; Secure";
  return `corinth_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`;
}

export function clearSessionCookie(env: Env): string {
  const secure = env.ENVIRONMENT === "development" ? "" : "; Secure";
  return `corinth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function verificationCookie(token: string, env: Env): string {
  const secure = env.ENVIRONMENT === "development" ? "" : "; Secure";
  return `corinth_auth_verify=${encodeURIComponent(token)}; Path=/api/auth/verify; HttpOnly; SameSite=Lax; Max-Age=300${secure}`;
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export async function stageAuthChallenge(env: Env, token: string): Promise<string> {
  if (!TOKEN_PATTERN.test(token)) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
  const tokenHash = await sha256(token);
  const challenge = await env.DB.prepare(`SELECT 1 FROM auth_email_challenges
    WHERE token_hash=?1 AND status IN ('PENDING','SENT') AND expires_at>unixepoch() LIMIT 1`)
    .bind(tokenHash).first();
  if (!challenge) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
  return verificationCookie(token, env);
}

export async function consumeStagedAuthChallenge(request: Request, env: Env): Promise<{ cookie: string; redirect: string }> {
  const rawToken = cookie(request, "corinth_auth_verify");
  if (!rawToken) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
  let token: string;
  try { token = decodeURIComponent(rawToken); } catch { throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired."); }
  return consumeAuthChallenge(request, env, token);
}

export async function consumeAuthChallenge(request: Request, env: Env, token: string): Promise<{ cookie: string; redirect: string }> {
  if (!TOKEN_PATTERN.test(token)) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await sha256(token);
  const challenge = await env.DB.prepare(`SELECT id,purpose,email,email_hash,proposed_user_id,
      proposed_username,proposed_display_name,status,expires_at
    FROM auth_email_challenges WHERE token_hash=?1 LIMIT 1`).bind(tokenHash).first<ChallengeRow>();
  if (!challenge || !["PENDING", "SENT"].includes(challenge.status) || challenge.expires_at <= now) {
    throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
  }
  const { ipHash, userAgentHash } = await requestFingerprints(request, env);
  const sessionId = `session-${crypto.randomUUID()}`;
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const sessionTtl = seconds(env.AUTH_SESSION_TTL_SECONDS, 2_592_000, 3600, 7_776_000);
  const providerSubjectHash = await hmac(`email:${challenge.email}`, hashSecret(env));
  const statements: D1PreparedStatement[] = [];
  let userId = challenge.proposed_user_id;
  if (challenge.purpose === "REGISTER") {
    if (!userId) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
    const onboardingPolicy = await env.DB.prepare(`SELECT 1 FROM onboarding_economy_policies
      WHERE id='production-onboarding-v1' LIMIT 1`).first();
    if (!onboardingPolicy) {
      throw new AuthServiceError(503, "ONBOARDING_NOT_CONFIGURED", "Account enlistment is temporarily unavailable.");
    }
    statements.push(
      env.DB.prepare(`INSERT INTO users (id,email,username,status,email_verified_at)
        SELECT proposed_user_id,email,proposed_username,'ACTIVE',?1 FROM auth_email_challenges
        WHERE id=?2 AND status IN ('PENDING','SENT') AND expires_at>?1`).bind(now, challenge.id),
      env.DB.prepare(`INSERT INTO profiles (user_id,display_name)
        SELECT proposed_user_id,proposed_display_name FROM auth_email_challenges
        WHERE id=?1 AND status IN ('PENDING','SENT') AND expires_at>?2`).bind(challenge.id, now),
      env.DB.prepare(`INSERT INTO onboarding_progress (user_id,status,current_step)
        SELECT proposed_user_id,'IN_PROGRESS','BATTALION' FROM auth_email_challenges
        WHERE id=?1 AND status IN ('PENDING','SENT') AND expires_at>?2
        ON CONFLICT(user_id) DO NOTHING`).bind(challenge.id, now),
      env.DB.prepare(`INSERT INTO requisition_transactions (
          id,user_id,amount,reason_code,description,
          related_entity_type,related_entity_id,idempotency_key
        ) SELECT 'req:onboarding-charter:' || challenges.proposed_user_id,
                 challenges.proposed_user_id,policies.starter_charter_grant,
                 'ONBOARDING_CHARTER_GRANT','One-time command charter grant.',
                 'ONBOARDING',challenges.proposed_user_id,
                 'onboarding-charter-grant:' || challenges.proposed_user_id
            FROM auth_email_challenges AS challenges
            JOIN onboarding_economy_policies AS policies
              ON policies.id='production-onboarding-v1'
           WHERE challenges.id=?1 AND challenges.status IN ('PENDING','SENT')
             AND challenges.expires_at>?2
        ON CONFLICT(idempotency_key) DO NOTHING`).bind(challenge.id, now),
    );
  } else {
    const existingUser = await env.DB.prepare(`SELECT id FROM users
      WHERE email=?1 COLLATE NOCASE AND status='ACTIVE' LIMIT 1`).bind(challenge.email).first<{ id: string }>();
    if (!existingUser) throw new AuthServiceError(400, "AUTH_LINK_INVALID", "This access link is invalid or has expired.");
    userId = existingUser.id;
    statements.push(env.DB.prepare(`UPDATE users SET email_verified_at=COALESCE(email_verified_at,?1),
      updated_at=?1 WHERE email=?2 COLLATE NOCASE AND status='ACTIVE'`).bind(now, challenge.email));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO auth_identities (
        id,user_id,provider,provider_subject_hash,status,provider_profile_json,last_used_at
      ) SELECT ?1,users.id,'resend_magic_link',?2,'ACTIVE','{}',?3 FROM users
        JOIN auth_email_challenges ON auth_email_challenges.email=users.email COLLATE NOCASE
      WHERE auth_email_challenges.id=?4 AND auth_email_challenges.status IN ('PENDING','SENT')
        AND auth_email_challenges.expires_at>?3
      ON CONFLICT(provider,provider_subject_hash) DO UPDATE SET status='ACTIVE',last_used_at=excluded.last_used_at`)
      .bind(`auth-identity-${crypto.randomUUID()}`, providerSubjectHash, now, challenge.id),
    env.DB.prepare(`INSERT INTO user_sessions (
        id,user_id,token_hash,created_at,expires_at,ip_hash,user_agent_hash,last_seen_at
      ) SELECT ?1,users.id,?2,?3,?4,?5,?6,?3 FROM users
        JOIN auth_email_challenges ON auth_email_challenges.email=users.email COLLATE NOCASE
      WHERE auth_email_challenges.id=?7 AND auth_email_challenges.status IN ('PENDING','SENT')
        AND auth_email_challenges.expires_at>?3 AND users.status='ACTIVE'`)
      .bind(sessionId, sessionHash, now, now + sessionTtl, ipHash, userAgentHash, challenge.id),
    env.DB.prepare(`UPDATE auth_email_challenges SET status='CONSUMED',consumed_at=?1
      WHERE id=?2 AND status IN ('PENDING','SENT') AND expires_at>?1`).bind(now, challenge.id),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (challenge.purpose === "REGISTER") {
      throw new AuthServiceError(409, "REGISTRATION_CONFLICT", "That account could not be created. Request a new link.");
    }
    throw error;
  }
  await audit(env, { userId, eventType: "AUTH_LINK_CONSUMED", outcome: "SUCCESS", subjectHash: challenge.email_hash, ipHash, userAgentHash, metadata: { purpose: challenge.purpose } }).catch(() => undefined);
  return { cookie: sessionCookie(sessionToken, env), redirect: "/?auth=verified" };
}

function authUser(row: SessionUserRow): AuthUserDto {
  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    callsign: row.callsign,
    emailVerified: row.email_verified_at !== null,
  };
}

export async function currentSession(request: Request, env: Env): Promise<AuthSessionDto> {
  const identity = await authenticate(request, env);
  if (!identity) return { signedIn: false, authAvailable: authAvailable(env) };
  if (identity.kind === "DEMO") {
    return {
      signedIn: true,
      authAvailable: true,
      demo: true,
      user: { userId: identity.viewer.userId, email: "demo@local.invalid", username: "demo-user", displayName: "Demo Commander", callsign: "DEMO", emailVerified: true },
    };
  }
  const rawToken = cookie(request, "corinth_session");
  if (!rawToken) return { signedIn: false, authAvailable: authAvailable(env) };
  let decoded: string;
  try { decoded = decodeURIComponent(rawToken); } catch { return { signedIn: false, authAvailable: authAvailable(env) }; }
  const tokenHash = await sha256(decoded);
  const row = await env.DB.prepare(`SELECT sessions.id AS session_id,users.id AS user_id,
      users.email,users.username,users.email_verified_at,profiles.display_name,profiles.callsign
    FROM user_sessions AS sessions
    JOIN users ON users.id=sessions.user_id AND users.status='ACTIVE'
    JOIN profiles ON profiles.user_id=users.id
    WHERE sessions.token_hash=?1 AND sessions.revoked_at IS NULL AND sessions.expires_at>unixepoch()
    LIMIT 1`).bind(tokenHash).first<SessionUserRow>();
  if (!row) return { signedIn: false, authAvailable: authAvailable(env) };
  await env.DB.batch([
    env.DB.prepare(`UPDATE user_sessions SET last_seen_at=unixepoch() WHERE id=?1`).bind(row.session_id),
    env.DB.prepare(`UPDATE users SET last_active_at=unixepoch() WHERE id=?1`).bind(row.user_id),
  ]);
  return { signedIn: true, authAvailable: true, demo: false, user: authUser(row) };
}

export async function logout(request: Request, env: Env): Promise<void> {
  const rawToken = cookie(request, "corinth_session");
  if (!rawToken) return;
  let decoded: string;
  try { decoded = decodeURIComponent(rawToken); } catch { return; }
  const tokenHash = await sha256(decoded);
  const identity: AuthenticatedIdentity | null = await authenticate(request, env);
  await env.DB.prepare(`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,unixepoch()) WHERE token_hash=?1`).bind(tokenHash).run();
  if (identity?.kind === "SESSION") {
    const { ipHash, userAgentHash } = await requestFingerprints(request, env);
    await audit(env, { userId: identity.userId, eventType: "SESSION_LOGOUT", outcome: "SUCCESS", ipHash, userAgentHash }).catch(() => undefined);
  }
}

import type { Env } from "../env";
import {
  claimInvitationDeliveryJobs,
  consumeInvitationRateBuckets,
  invitationAuditStatement,
  markInvitationDeliveryFailed,
  markInvitationDeliverySent,
  recordInvitationAudit,
  runSecurityMaintenance,
  type InvitationDeliveryJobRow,
  type InvitationRateBucketInput,
  type InvitationRateOutcome,
  type InvitationRateResultRow,
  type InvitationRateScope,
  type SecurityMaintenanceResult,
} from "../repositories/security-operations";
import { InvitationDeliveryError, sendBattalionInviteEmail } from "./invitation-delivery";

const DAY_SECONDS = 24 * 60 * 60;

export const SECURITY_MAINTENANCE_POLICY = Object.freeze({
  batchLimit: 100,
  sessionRetentionSeconds: 30 * DAY_SECONDS,
  challengeRetentionSeconds: 7 * DAY_SECONDS,
  rateBucketRetentionSeconds: 2 * DAY_SECONDS,
  authAuditRetentionSeconds: 180 * DAY_SECONDS,
  invitationAuditRetentionSeconds: 90 * DAY_SECONDS,
  invitationPiiRetentionSeconds: 30 * DAY_SECONDS,
});

export const INVITATION_RATE_POLICY = Object.freeze({
  ACTOR: Object.freeze({ cooldownSeconds: 30, maximumAttempts: 20 }),
  BATTALION: Object.freeze({ cooldownSeconds: 5, maximumAttempts: 100 }),
  RECIPIENT: Object.freeze({ cooldownSeconds: 15 * 60, maximumAttempts: 5 }),
  IP: Object.freeze({ cooldownSeconds: 10, maximumAttempts: 30 }),
  windowSeconds: DAY_SECONDS,
});

export const INVITATION_DELIVERY_POLICY = Object.freeze({
  batchLimit: 10,
  leaseSeconds: 5 * 60,
  maximumAttempts: 5,
  initialBackoffSeconds: 15 * 60,
  maximumBackoffSeconds: DAY_SECONDS,
});

export const GENERIC_INVITATION_RESPONSE = Object.freeze({
  accepted: true,
  message: "If the commander is eligible, an invitation will be delivered.",
});

export class InvitationSecurityError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface InvitationSecurityContext {
  recipientHash: string;
  ipHash: string;
}

export interface InvitationDeliveryRunResult {
  claimed: number;
  sent: number;
  retryScheduled: number;
  abandoned: number;
}

export function authHashKeyIsStrong(value: string | undefined): value is string {
  if (!value || value.length < 43 || !/^[\x21-\x7e]+$/.test(value)) return false;
  if (/(placeholder|change.?me|development|example|test.?only)/i.test(value)) return false;
  return new Set(value).size >= 12;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function securitySecret(env: Env): string {
  if (authHashKeyIsStrong(env.AUTH_HASH_KEY)) return env.AUTH_HASH_KEY;
  if (env.ENVIRONMENT === "development" && env.ALLOW_DEMO_AUTH === "true" && !env.AUTH_HASH_KEY) {
    return "corinth-development-only-invitation-hash-key-not-for-production";
  }
  throw new InvitationSecurityError(503, "INVITATION_SECURITY_UNAVAILABLE", "Invitation delivery is temporarily unavailable.");
}

export async function invitationSecurityContext(
  request: Request,
  env: Env,
  normalizedRecipient: string,
): Promise<InvitationSecurityContext> {
  const secret = securitySecret(env);
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  return {
    recipientHash: await hmac(`invitation-recipient:${normalizedRecipient}`, secret),
    ipHash: await hmac(`invitation-ip:${ip}`, secret),
  };
}

export function invitationRateBuckets(
  actorUserId: string,
  battalionId: string | undefined,
  context: InvitationSecurityContext,
  scopes: InvitationRateScope[],
): InvitationRateBucketInput[] {
  const identities: Record<InvitationRateScope, string | undefined> = {
    ACTOR: actorUserId,
    BATTALION: battalionId,
    RECIPIENT: context.recipientHash,
    IP: context.ipHash,
  };
  return scopes.map((scope) => {
    const identity = identities[scope];
    if (!identity) throw new InvitationSecurityError(503, "INVITATION_SECURITY_UNAVAILABLE", "Invitation delivery is temporarily unavailable.");
    return {
      bucketKey: `${scope.toLowerCase()}:${identity}`,
      scope,
      cooldownSeconds: INVITATION_RATE_POLICY[scope].cooldownSeconds,
      windowSeconds: INVITATION_RATE_POLICY.windowSeconds,
      maximumAttempts: INVITATION_RATE_POLICY[scope].maximumAttempts,
    };
  });
}

export function blockedInvitationScopes(
  results: Array<{ scope: InvitationRateScope; last_outcome: InvitationRateOutcome }>,
): InvitationRateScope[] {
  return results.filter((result) => result.last_outcome !== "ALLOWED").map((result) => result.scope);
}

function firstBlockedTransition(results: InvitationRateResultRow[]): boolean {
  return results.some((result) => {
    if (result.last_outcome === "COOLDOWN") return Number(result.attempt_count) === 2;
    if (result.last_outcome === "QUOTA") {
      return Number(result.attempt_count) === INVITATION_RATE_POLICY[result.scope].maximumAttempts + 1;
    }
    return false;
  });
}

export async function enforceInvitationRateLimit(
  env: Env,
  input: {
    actorUserId: string;
    battalionId?: string;
    context: InvitationSecurityContext;
    scopes: InvitationRateScope[];
    now: number;
  },
): Promise<void> {
  const buckets = invitationRateBuckets(input.actorUserId, input.battalionId, input.context, input.scopes);
  const results = await consumeInvitationRateBuckets(env.DB, buckets, input.now);
  if (results.length !== buckets.length) {
    throw new InvitationSecurityError(503, "INVITATION_SECURITY_UNAVAILABLE", "Invitation delivery is temporarily unavailable.");
  }
  const blockedScopes = blockedInvitationScopes(results);
  if (blockedScopes.length === 0) return;
  if (firstBlockedTransition(results)) {
    await auditInvitationSecurity(env, {
      ...input,
      outcome: "REJECTED",
      reasonCode: `THROTTLED_${blockedScopes.sort().join("_")}`,
    });
  }
  throw new InvitationSecurityError(429, "INVITATION_THROTTLED", "Invitation delivery is temporarily unavailable. Try again later.");
}

export async function auditInvitationSecurity(
  env: Env,
  input: {
    actorUserId: string;
    battalionId?: string;
    context: InvitationSecurityContext;
    outcome: "ACCEPTED" | "REJECTED" | "FAILED";
    reasonCode: string;
    metadata?: Record<string, unknown>;
    now: number;
  },
): Promise<void> {
  await recordInvitationAudit(env.DB, {
    actorUserId: input.actorUserId, battalionId: input.battalionId,
    eventType: "BATTALION_INVITATION_ATTEMPT", outcome: input.outcome,
    reasonCode: input.reasonCode, recipientHash: input.context.recipientHash,
    ipHash: input.context.ipHash, metadata: input.metadata, occurredAt: input.now,
  });
}

export function invitationSecurityAuditStatement(
  env: Env,
  input: {
    actorUserId: string;
    battalionId?: string;
    context: InvitationSecurityContext;
    outcome: "ACCEPTED" | "REJECTED" | "FAILED";
    reasonCode: string;
    metadata?: Record<string, unknown>;
    now: number;
  },
): D1PreparedStatement {
  return invitationAuditStatement(env.DB, {
    actorUserId: input.actorUserId, battalionId: input.battalionId,
    eventType: "BATTALION_INVITATION_ATTEMPT", outcome: input.outcome,
    reasonCode: input.reasonCode, recipientHash: input.context.recipientHash,
    ipHash: input.context.ipHash, metadata: input.metadata, occurredAt: input.now,
  });
}

function deliveryAudit(env: Env, job: InvitationDeliveryJobRow, now: number, outcome: "ACCEPTED" | "FAILED", reasonCode: string): D1PreparedStatement {
  return invitationAuditStatement(env.DB, {
    actorUserId: job.actor_user_id, battalionId: job.battalion_id,
    eventType: "BATTALION_INVITATION_DELIVERY", outcome, reasonCode,
    recipientHash: job.recipient_hash, ipHash: job.ip_hash,
    metadata: { source: job.invitation_source, attempt: Number(job.attempt_count) + 1 }, occurredAt: now,
  });
}

async function deliverOne(env: Env, job: InvitationDeliveryJobRow, now: number): Promise<"SENT" | "RETRY" | "ABANDONED"> {
  try {
    const resendEmailId = await sendBattalionInviteEmail(env, {
      invitationId: job.invitation_id,
      email: job.recipient_email,
      battalionName: job.battalion_name,
      invitedBy: job.invited_by,
      message: job.message,
      inviteCode: job.invite_code ?? undefined,
    });
    await markInvitationDeliverySent(env.DB, {
      job, resendEmailId, now, audit: deliveryAudit(env, job, now, "ACCEPTED", "DELIVERED"),
    });
    return "SENT";
  } catch (error) {
    const attempt = Number(job.attempt_count) + 1;
    const backoff = Math.min(
      INVITATION_DELIVERY_POLICY.initialBackoffSeconds * (2 ** Math.max(0, attempt - 1)),
      INVITATION_DELIVERY_POLICY.maximumBackoffSeconds,
    );
    const nextAttemptAt = now + backoff;
    const abandon = attempt >= INVITATION_DELIVERY_POLICY.maximumAttempts || nextAttemptAt >= Number(job.expires_at);
    const errorCode = error instanceof InvitationDeliveryError ? error.code : "DELIVERY_UNEXPECTED";
    await markInvitationDeliveryFailed(env.DB, {
      job, now, nextAttemptAt, errorCode, abandon,
      audit: deliveryAudit(env, job, now, "FAILED", abandon ? "DELIVERY_ABANDONED" : "DELIVERY_RETRY_SCHEDULED"),
    });
    return abandon ? "ABANDONED" : "RETRY";
  }
}

export async function processInvitationDeliveryJobs(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<InvitationDeliveryRunResult> {
  const jobs = await claimInvitationDeliveryJobs(env.DB, {
    now,
    leaseToken: `invitation-lease-${crypto.randomUUID()}`,
    leaseSeconds: INVITATION_DELIVERY_POLICY.leaseSeconds,
    limit: INVITATION_DELIVERY_POLICY.batchLimit,
  });
  const result: InvitationDeliveryRunResult = { claimed: jobs.length, sent: 0, retryScheduled: 0, abandoned: 0 };
  for (const job of jobs) {
    const outcome = await deliverOne(env, job, now);
    if (outcome === "SENT") result.sent += 1;
    else if (outcome === "RETRY") result.retryScheduled += 1;
    else result.abandoned += 1;
  }
  return result;
}

export async function performScheduledSecurityMaintenance(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<{ delivery: InvitationDeliveryRunResult; maintenance: SecurityMaintenanceResult }> {
  const delivery = await processInvitationDeliveryJobs(env, now);
  const maintenance = await runSecurityMaintenance(env.DB, now, SECURITY_MAINTENANCE_POLICY);
  return { delivery, maintenance };
}

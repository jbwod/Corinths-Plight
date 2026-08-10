import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import {
  GENERIC_INVITATION_RESPONSE,
  INVITATION_DELIVERY_POLICY,
  INVITATION_RATE_POLICY,
  InvitationSecurityError,
  SECURITY_MAINTENANCE_POLICY,
  blockedInvitationScopes,
  enforceInvitationRateLimit,
  invitationRateBuckets,
  invitationSecurityContext,
} from "./security-operations";

function environment(db: D1Database = {} as D1Database, overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "production",
    ALLOW_DEMO_AUTH: "false",
    DEFAULT_ROUND_DURATION_MS: "86400000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "86400000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
    AUTH_HASH_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DB: db,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
    ...overrides,
  };
}

describe("invitation security policy", () => {
  it("publishes explicit cooldown, quota, retention, and batch bounds", () => {
    expect(INVITATION_RATE_POLICY).toEqual({
      ACTOR: { cooldownSeconds: 30, maximumAttempts: 20 },
      BATTALION: { cooldownSeconds: 5, maximumAttempts: 100 },
      RECIPIENT: { cooldownSeconds: 900, maximumAttempts: 5 },
      IP: { cooldownSeconds: 10, maximumAttempts: 30 },
      windowSeconds: 86_400,
    });
    expect(SECURITY_MAINTENANCE_POLICY).toEqual({
      batchLimit: 100,
      sessionRetentionSeconds: 2_592_000,
      challengeRetentionSeconds: 604_800,
      rateBucketRetentionSeconds: 172_800,
      authAuditRetentionSeconds: 15_552_000,
      invitationAuditRetentionSeconds: 7_776_000,
      invitationPiiRetentionSeconds: 2_592_000,
    });
    expect(INVITATION_DELIVERY_POLICY).toEqual({
      batchLimit: 10,
      leaseSeconds: 300,
      maximumAttempts: 5,
      initialBackoffSeconds: 900,
      maximumBackoffSeconds: 86_400,
    });
  });

  it("pseudonymizes recipient and IP before creating all four rate buckets", async () => {
    const context = await invitationSecurityContext(new Request("https://example.test", {
      headers: { "cf-connecting-ip": "203.0.113.9" },
    }), environment(), "commander@example.com");
    expect(context.recipientHash).toMatch(/^[a-f0-9]{64}$/);
    expect(context.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(context)).not.toContain("commander@example.com");
    expect(JSON.stringify(context)).not.toContain("203.0.113.9");

    expect(invitationRateBuckets("user-1", "battalion-1", context, ["ACTOR", "BATTALION", "RECIPIENT", "IP"]).map((bucket) => ({
      scope: bucket.scope,
      cooldownSeconds: bucket.cooldownSeconds,
      maximumAttempts: bucket.maximumAttempts,
    }))).toEqual([
      { scope: "ACTOR", cooldownSeconds: 30, maximumAttempts: 20 },
      { scope: "BATTALION", cooldownSeconds: 5, maximumAttempts: 100 },
      { scope: "RECIPIENT", cooldownSeconds: 900, maximumAttempts: 5 },
      { scope: "IP", cooldownSeconds: 10, maximumAttempts: 30 },
    ]);
  });

  it("returns one non-enumerating throttle error while auditing the internal scope", async () => {
    const statements: Array<{ sql: string; values: unknown[]; statement: D1PreparedStatement }> = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const probe = { sql, values: [] as unknown[] } as { sql: string; values: unknown[]; statement: D1PreparedStatement };
        probe.statement = {
          bind: (...values: unknown[]) => {
            probe.values = values;
            return probe.statement;
          },
          run: vi.fn(async () => ({ success: true, results: [], meta: { changes: 1 } })),
        } as unknown as D1PreparedStatement;
        statements.push(probe);
        return probe.statement;
      }),
      batch: vi.fn(async () => [
        { success: true, results: [{ scope: "ACTOR", attempt_count: 21, last_outcome: "QUOTA" }], meta: { changes: 1 } },
        { success: true, results: [{ scope: "BATTALION", attempt_count: 1, last_outcome: "ALLOWED" }], meta: { changes: 1 } },
        { success: true, results: [{ scope: "RECIPIENT", attempt_count: 1, last_outcome: "ALLOWED" }], meta: { changes: 1 } },
        { success: true, results: [{ scope: "IP", attempt_count: 1, last_outcome: "ALLOWED" }], meta: { changes: 1 } },
      ]),
    } as unknown as D1Database;
    const context = { recipientHash: "r".repeat(64), ipHash: "i".repeat(64) };

    await expect(enforceInvitationRateLimit(environment(db), {
      actorUserId: "user-1",
      battalionId: "battalion-1",
      context,
      scopes: ["ACTOR", "BATTALION", "RECIPIENT", "IP"],
      now: 100,
    })).rejects.toEqual(expect.objectContaining({
      status: 429,
      code: "INVITATION_THROTTLED",
      message: "Invitation delivery is temporarily unavailable. Try again later.",
    }));
    expect(statements.at(-1)?.sql).toContain("battalion_invitation_audit_events");
    expect(statements.at(-1)?.values).toContain("THROTTLED_ACTOR");
    expect(GENERIC_INVITATION_RESPONSE).toEqual({
      accepted: true,
      message: "If the commander is eligible, an invitation will be delivered.",
    });
  });

  it("fails closed without a production pseudonymization secret", async () => {
    await expect(invitationSecurityContext(
      new Request("https://example.test"),
      environment({} as D1Database, { AUTH_HASH_KEY: undefined }),
      "commander@example.com",
    )).rejects.toBeInstanceOf(InvitationSecurityError);
  });

  it("reports every blocked scope without exposing identities", () => {
    expect(blockedInvitationScopes([
      { scope: "ACTOR", last_outcome: "ALLOWED" },
      { scope: "RECIPIENT", last_outcome: "COOLDOWN" },
      { scope: "IP", last_outcome: "QUOTA" },
    ])).toEqual(["RECIPIENT", "IP"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  consumeInvitationRateBuckets,
  runSecurityMaintenance,
  type InvitationRateResultRow,
} from "./security-operations";

interface PreparedProbe {
  sql: string;
  values: unknown[];
  statement: D1PreparedStatement;
}

function prepared(sql: string): PreparedProbe {
  const probe = { sql, values: [] as unknown[] } as PreparedProbe;
  probe.statement = {
    bind: (...values: unknown[]) => {
      probe.values = values;
      return probe.statement;
    },
  } as D1PreparedStatement;
  return probe;
}

describe("invitation security repository", () => {
  it("consumes every rate scope with one D1 batch and returns the persisted decisions", async () => {
    const probes: PreparedProbe[] = [];
    const rows: InvitationRateResultRow[] = [
      { scope: "ACTOR", attempt_count: 1, window_started_at: 100, next_allowed_at: 130, last_outcome: "ALLOWED" },
      { scope: "BATTALION", attempt_count: 2, window_started_at: 100, next_allowed_at: 105, last_outcome: "COOLDOWN" },
    ];
    const db = {
      prepare: vi.fn((sql: string) => {
        const probe = prepared(sql);
        probes.push(probe);
        return probe.statement;
      }),
      batch: vi.fn(async () => rows.map((row) => ({ success: true, results: [row], meta: { changes: 1 } }))),
    } as unknown as D1Database;

    const result = await consumeInvitationRateBuckets(db, [
      { bucketKey: "actor:a", scope: "ACTOR", cooldownSeconds: 30, windowSeconds: 86_400, maximumAttempts: 20 },
      { bucketKey: "battalion:b", scope: "BATTALION", cooldownSeconds: 5, windowSeconds: 86_400, maximumAttempts: 100 },
    ], 100);

    expect(result).toEqual(rows);
    expect(probes).toHaveLength(2);
    expect(probes[0].values).toEqual(["actor:a", "ACTOR", 100, 30, 86_400, 20]);
    expect(probes[1].values).toEqual(["battalion:b", "BATTALION", 100, 5, 86_400, 100]);
    expect(probes.every((probe) => probe.sql.includes("ON CONFLICT(bucket_key) DO UPDATE"))).toBe(true);
  });

  it("keeps every maintenance mutation explicitly bounded", async () => {
    const probes: PreparedProbe[] = [];
    const changes = Array.from({ length: 14 }, (_, index) => index + 1);
    const db = {
      prepare: vi.fn((sql: string) => {
        const probe = prepared(sql);
        probes.push(probe);
        return probe.statement;
      }),
      batch: vi.fn(async () => changes.map((value) => ({ success: true, results: [], meta: { changes: value } }))),
    } as unknown as D1Database;

    const result = await runSecurityMaintenance(db, 1_000_000, {
      batchLimit: 100,
      sessionRetentionSeconds: 100,
      challengeRetentionSeconds: 200,
      rateBucketRetentionSeconds: 300,
      authAuditRetentionSeconds: 400,
      invitationAuditRetentionSeconds: 500,
      invitationPiiRetentionSeconds: 600,
    });

    expect(probes).toHaveLength(14);
    expect(probes.every((probe) => /LIMIT \?2/.test(probe.sql))).toBe(true);
    expect(probes.every((probe) => !/\b(?:OR|COALESCE)\b/.test(probe.sql))).toBe(true);
    expect(result).toEqual({
      abandonedExpiredDeliveryJobs: 1,
      expiredAuthChallenges: 2,
      expiredAccountInvitations: 3,
      expiredEmailInvitations: 4,
      deletedExpiredSessions: 5,
      deletedRevokedSessions: 6,
      deletedConsumedAuthChallenges: 7,
      deletedTerminalAuthChallenges: 8,
      deletedAuthRateBuckets: 9,
      deletedInvitationRateBuckets: 10,
      deletedAuthAuditEvents: 11,
      deletedInvitationAuditEvents: 12,
      deletedAccountInvitationPii: 13,
      deletedEmailInvitationPii: 14,
    });
  });
});

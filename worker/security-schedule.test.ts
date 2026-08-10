import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { scheduleSecurityMaintenance } from "./security-maintenance";

afterEach(() => vi.restoreAllMocks());

describe("scheduled security maintenance boundary", () => {
  it("runs the bounded repository job through waitUntil and logs aggregate counts", async () => {
    const statements: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        const statement = {
          bind: () => statement,
          run: async () => ({ success: true, results: [], meta: { changes: 0 } }),
          all: async () => ({ success: true, results: [], meta: { changes: 0 } }),
        } as unknown as D1PreparedStatement;
        return statement;
      }),
      batch: vi.fn(async () => Array.from({ length: 14 }, () => ({
        success: true,
        results: [],
        meta: { changes: 0 },
      }))),
    } as unknown as D1Database;
    const env = {
      ENVIRONMENT: "development",
      ALLOW_DEMO_AUTH: "true",
      DEFAULT_ROUND_DURATION_MS: "300000",
      ORDER_LOCK_LEAD_MS: "30000",
      DEFAULT_STRATEGIC_ROUND_DURATION_MS: "300000",
      STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
      DB: db,
      CAMPAIGN: {} as DurableObjectNamespace,
      STRATEGIC_MAP: {} as DurableObjectNamespace,
    } satisfies Env;
    let pending: Promise<unknown> | undefined;
    const context = {
      waitUntil: (promise: Promise<unknown>) => { pending = promise; },
    } as unknown as ExecutionContext;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    scheduleSecurityMaintenance(
      { scheduledTime: 1_786_300_000_000, cron: "0 * * * *", noRetry: () => undefined },
      env,
      context,
    );
    await pending;

    expect(statements).toHaveLength(16);
    expect(statements.every((sql) => sql.includes("LIMIT"))).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"operation":"security.maintenance"'));
  });
});

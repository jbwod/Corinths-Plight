import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeAuthRequest } from "./auth";

function environment(): Env {
  return {
    ENVIRONMENT: "production",
    ALLOW_DEMO_AUTH: "false",
    DEFAULT_ROUND_DURATION_MS: "86400000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "86400000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
    AUTH_BASE_URL: "https://corinthplight.qnetica.com.au",
    AUTH_FROM_EMAIL: "Corinth's Plight <access@updates.qnetica.com.au>",
    AUTH_HASH_KEY: "test-hmac-key-that-is-not-a-production-secret",
    RESEND_API_KEY: "re_test_only",
    DB: {} as D1Database,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
  };
}

describe("auth HTTP boundary", () => {
  it("returns a non-cacheable anonymous session without touching D1", async () => {
    const response = await routeAuthRequest(new Request("https://corinthplight.qnetica.com.au/api/auth/session"), environment());
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({ signedIn: false, authAvailable: true });
  });

  it("requires JSON for login and registration mutations", async () => {
    const response = await routeAuthRequest(new Request("https://corinthplight.qnetica.com.au/api/auth/login", {
      method: "POST",
      body: "email=commander@example.com",
    }), environment());
    expect(response?.status).toBe(415);
    await expect(response?.json()).resolves.toMatchObject({ error: { code: "JSON_REQUIRED" } });
  });

  it("redirects malformed and expired verification links without exposing a reason", async () => {
    const response = await routeAuthRequest(new Request("https://corinthplight.qnetica.com.au/api/auth/verify?token=too-short"), environment());
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/?auth=invalid");
    expect(response?.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response?.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response?.headers.get("set-cookie")).toContain("Secure");
  });

  it("does not claim unknown auth routes", async () => {
    const response = await routeAuthRequest(new Request("https://corinthplight.qnetica.com.au/api/forces"), environment());
    expect(response).toBeNull();
  });
});

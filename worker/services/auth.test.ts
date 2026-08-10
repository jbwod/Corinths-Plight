import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import {
  AuthServiceError,
  authAvailable,
  clearSessionCookie,
  sendVerificationEmail,
  validateLoginInput,
  validateRegistrationInput,
} from "./auth";

function environment(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "production",
    ALLOW_DEMO_AUTH: "false",
    DEFAULT_ROUND_DURATION_MS: "86400000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "86400000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
    AUTH_BASE_URL: "https://corinthplight.qnetica.com.au",
    AUTH_FROM_EMAIL: "Corinth's Plight <register@corinth.qnetica.com.au>",
    AUTH_HASH_KEY: "test-hmac-key-that-is-not-a-production-secret",
    RESEND_API_KEY: "re_test_only",
    DB: {} as D1Database,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("passwordless auth input policy", () => {
  it("normalizes registration identity fields and rejects client-controlled extras", () => {
    expect(validateRegistrationInput({
      email: "  Commander@Example.com ",
      username: "  NIGHT_RAVEN ",
      displayName: "  Avery Black  ",
    })).toEqual({
      email: "commander@example.com",
      username: "night_raven",
      displayName: "Avery Black",
    });

    expect(() => validateRegistrationInput({
      email: "commander@example.com",
      username: "night_raven",
      displayName: "Avery Black",
      role: "ADMIN",
    })).toThrowError(AuthServiceError);
  });

  it("accepts only an email for login", () => {
    expect(validateLoginInput({ email: " Commander@Example.com " })).toEqual({ email: "commander@example.com" });
    expect(() => validateLoginInput({ email: "commander@example.com", username: "ignored" })).toThrowError(AuthServiceError);
    expect(() => validateLoginInput({ email: "not-an-email" })).toThrowError(AuthServiceError);
  });

  it("fails closed in production unless every mail and hashing setting exists", () => {
    expect(authAvailable(environment())).toBe(true);
    expect(authAvailable(environment({ RESEND_API_KEY: undefined }))).toBe(false);
    expect(authAvailable(environment({ AUTH_HASH_KEY: undefined }))).toBe(false);
    expect(authAvailable(environment({ AUTH_BASE_URL: "http://corinthplight.qnetica.com.au" }))).toBe(false);
    expect(authAvailable(environment({ AUTH_FROM_EMAIL: undefined }))).toBe(false);
  });
});

describe("Resend delivery adapter", () => {
  it("sends a text and HTML link with bearer auth and request idempotency", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendVerificationEmail(environment(), {
      id: "challenge-123",
      email: "commander@example.com",
      displayName: "Avery <Commander>",
      verificationUrl: "https://corinthplight.qnetica.com.au/api/auth/verify?token=test-token",
      purpose: "REGISTER",
    })).resolves.toBe("email-123");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_only",
      "content-type": "application/json",
      "idempotency-key": "auth-link/challenge-123",
      "user-agent": "CorinthsPlight/0.1",
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: "Corinth's Plight <register@corinth.qnetica.com.au>",
      to: ["commander@example.com"],
    });
    expect(String(body.html)).toContain("Avery &lt;Commander&gt;");
    expect(String(body.text)).toContain("expires in 15 minutes");
  });

  it("does not silently succeed when Resend is unavailable in production", async () => {
    await expect(sendVerificationEmail(environment({ RESEND_API_KEY: undefined }), {
      id: "challenge-123",
      email: "commander@example.com",
      verificationUrl: "https://corinthplight.qnetica.com.au/api/auth/verify?token=test-token",
      purpose: "LOGIN",
    })).rejects.toMatchObject({ status: 503, code: "EMAIL_NOT_CONFIGURED" });
  });

  it("marks production session deletion cookies Secure", () => {
    expect(clearSessionCookie(environment())).toContain("Secure");
    expect(clearSessionCookie(environment({ ENVIRONMENT: "development" }))).not.toContain("Secure");
  });
});

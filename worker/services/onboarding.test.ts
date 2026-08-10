import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { OnboardingServiceError, sendBattalionInviteEmail } from "./onboarding";

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
    RESEND_API_KEY: "re_test_only",
    AUTH_HASH_KEY: "test-only-key",
    DB: {} as D1Database,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Battalion invitation delivery", () => {
  it("uses Resend idempotency and escapes invitation presentation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-invite-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendBattalionInviteEmail(environment(), {
      invitationId: "invite-123",
      email: "new.commander@example.com",
      battalionName: "Watch <One>",
      invitedBy: "Avery & Co",
      message: "Hold <fast>",
      inviteCode: "PRIVATE-CODE-77",
    })).resolves.toBe("email-invite-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_only",
      "idempotency-key": "battalion-invite/invite-123",
    });
    const body = JSON.parse(String(init.body)) as { to: string[]; html: string; text: string };
    expect(body.to).toEqual(["new.commander@example.com"]);
    expect(body.html).toContain("Watch &lt;One&gt;");
    expect(body.html).toContain("?invite=PRIVATE-CODE-77");
    expect(body.text).toContain("expires in seven days");
  });

  it("fails closed when production email is unavailable", async () => {
    await expect(sendBattalionInviteEmail(environment({ RESEND_API_KEY: undefined }), {
      invitationId: "invite-123",
      email: "new.commander@example.com",
      battalionName: "Watch One",
      invitedBy: "Command",
      message: "",
    })).rejects.toBeInstanceOf(OnboardingServiceError);
  });
});

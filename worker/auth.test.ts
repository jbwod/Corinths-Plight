import { describe, expect, it } from "vitest";
import {
  LOCAL_DEMO_CAMPAIGN_ID,
  authConfigurationIsSafe,
  authorizeCampaign,
  campaignAccessFromRow,
  demoAuthEnabled,
  requestIsEmailVerificationNavigation,
  requestIsExplicitlyCrossOrigin,
  requestIsSameOrigin,
  requestRequiresSameOrigin,
  type AuthenticatedIdentity,
} from "./auth";
import type { Env } from "./env";

function envWithRow(row: unknown): Env {
  return {
    ENVIRONMENT: "production",
    ALLOW_DEMO_AUTH: "false",
    DEFAULT_ROUND_DURATION_MS: "86400000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "86400000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => row }),
      }),
    } as unknown as D1Database,
  };
}

describe("authentication environment policy", () => {
  it("requires an exact local opt-in and never enables demo auth in production", () => {
    expect(demoAuthEnabled({ ENVIRONMENT: "development", ALLOW_DEMO_AUTH: "true" })).toBe(true);
    expect(demoAuthEnabled({ ENVIRONMENT: "development", ALLOW_DEMO_AUTH: "false" })).toBe(false);
    expect(demoAuthEnabled({ ENVIRONMENT: "preview", ALLOW_DEMO_AUTH: "true" })).toBe(false);
    expect(demoAuthEnabled({ ENVIRONMENT: "production", ALLOW_DEMO_AUTH: "true" })).toBe(false);
    expect(authConfigurationIsSafe({ ENVIRONMENT: "production", ALLOW_DEMO_AUTH: "true" })).toBe(false);
  });
});

describe("same-origin policy", () => {
  it("requires a matching Origin for mutations and WebSocket upgrades", () => {
    const mutation = new Request("https://game.example/api/campaigns/outpost-k17/orders", {
      method: "POST",
      headers: { origin: "https://game.example" },
    });
    const crossOrigin = new Request("https://game.example/api/campaigns/outpost-k17/orders", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    const socket = new Request("https://game.example/api/campaigns/outpost-k17/ws", {
      headers: { origin: "https://game.example", upgrade: "websocket" },
    });

    expect(requestRequiresSameOrigin(mutation)).toBe(true);
    expect(requestIsSameOrigin(mutation)).toBe(true);
    expect(requestIsSameOrigin(crossOrigin)).toBe(false);
    expect(requestIsExplicitlyCrossOrigin(crossOrigin)).toBe(true);
    expect(requestRequiresSameOrigin(socket)).toBe(true);
  });

  it("permits only a top-level document navigation to stage an email verification token", () => {
    const emailNavigation = new Request("https://game.example/api/auth/verify?token=secret", {
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site",
      },
    });
    const otherApiNavigation = new Request("https://game.example/api/auth/session", {
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site",
      },
    });
    const foreignOrigin = new Request("https://game.example/api/auth/verify?token=secret", {
      headers: {
        origin: "https://mail.example",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site",
      },
    });
    const confirmation = new Request("https://game.example/api/auth/verify", {
      method: "POST",
      headers: { origin: "https://game.example" },
    });

    expect(requestIsExplicitlyCrossOrigin(emailNavigation)).toBe(true);
    expect(requestIsEmailVerificationNavigation(emailNavigation)).toBe(true);
    expect(requestIsEmailVerificationNavigation(otherApiNavigation)).toBe(false);
    expect(requestIsEmailVerificationNavigation(foreignOrigin)).toBe(false);
    expect(requestIsEmailVerificationNavigation(confirmation)).toBe(false);
  });
});

describe("campaign authorization", () => {
  it("maps only campaign-scoped player, command, and GM roles", () => {
    expect(
      campaignAccessFromRow("user-1", {
        campaign_id: "campaign-1",
        side: "ALLIED",
        role: "BATTALION_COMMAND",
        battalion_id: "battalion-1",
      }),
    ).toMatchObject({ allowed: true, viewer: { role: "BATTALION_COMMAND", side: "ALLIED" } });
    expect(
      campaignAccessFromRow("gm-1", {
        campaign_id: "campaign-1",
        side: "NEUTRAL",
        role: "GM",
        battalion_id: null,
      }),
    ).toMatchObject({ allowed: true, viewer: { role: "ADMIN" } });
    expect(
      campaignAccessFromRow("observer-1", {
        campaign_id: "campaign-1",
        side: "NEUTRAL",
        role: "OBSERVER",
        battalion_id: null,
      }),
    ).toEqual({ allowed: false, reason: "ROLE_UNSUPPORTED" });
  });

  it("allows a locally enabled demo identity only into its D1-backed campaign memberships", async () => {
    const identity: AuthenticatedIdentity = {
      kind: "DEMO",
      viewer: { userId: "demo-user", side: "ALLIED", role: "PLAYER" },
    };
    const env = {
      ...envWithRow({
        campaign_id: LOCAL_DEMO_CAMPAIGN_ID,
        side: "ALLIED",
        role: "PLAYER",
        battalion_id: "battalion-demo",
      }),
      ENVIRONMENT: "development",
      ALLOW_DEMO_AUTH: "true",
    } satisfies Env;

    await expect(authorizeCampaign(identity, LOCAL_DEMO_CAMPAIGN_ID, env)).resolves.toMatchObject({ allowed: true });
    await expect(authorizeCampaign(identity, "invented-campaign", {
      ...env,
      DB: envWithRow(null).DB,
    })).resolves.toEqual({
      allowed: false,
      reason: "NOT_FOUND",
    });
    await expect(authorizeCampaign(identity, LOCAL_DEMO_CAMPAIGN_ID, envWithRow(null))).resolves.toEqual({
      allowed: false,
      reason: "NOT_FOUND",
    });
  });

  it("derives session access from the campaign membership row", async () => {
    const identity: AuthenticatedIdentity = { kind: "SESSION", userId: "user-1" };
    const env = envWithRow({
      campaign_id: "campaign-1",
      side: "ENEMY",
      role: "PLAYER",
      battalion_id: null,
    });

    await expect(authorizeCampaign(identity, "campaign-1", env)).resolves.toMatchObject({
      allowed: true,
      viewer: { userId: "user-1", side: "ENEMY", role: "PLAYER" },
    });
  });
});

import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { routeOnboardingRequest } from "./onboarding";

function environment(): Env {
  return {
    ENVIRONMENT: "development",
    ALLOW_DEMO_AUTH: "true",
    DEFAULT_ROUND_DURATION_MS: "300000",
    ORDER_LOCK_LEAD_MS: "30000",
    DEFAULT_STRATEGIC_ROUND_DURATION_MS: "300000",
    STRATEGIC_ORDER_LOCK_LEAD_MS: "30000",
    DB: {} as D1Database,
    CAMPAIGN: {} as DurableObjectNamespace,
    STRATEGIC_MAP: {} as DurableObjectNamespace,
  };
}

describe("onboarding HTTP boundary", () => {
  it("does not claim unrelated paths", async () => {
    await expect(routeOnboardingRequest(new Request("http://localhost/api/forces"), environment())).resolves.toBeNull();
  });

  it("requires authentication", async () => {
    const response = await routeOnboardingRequest(new Request("http://localhost/api/onboarding"), environment());
    expect(response?.status).toBe(401);
  });

  it("requires JSON and rejects client-authored mutation fields before D1", async () => {
    const noJson = await routeOnboardingRequest(new Request("http://localhost/api/onboarding/starter-unit", {
      method: "POST",
      headers: { "x-demo-user": "demo-user" },
      body: "definitionId=unit-infantry-squad",
    }), environment());
    expect(noJson?.status).toBe(415);

    const forged = await routeOnboardingRequest(new Request("http://localhost/api/onboarding/starter-unit", {
      method: "POST",
      headers: { "x-demo-user": "demo-user", "content-type": "application/json" },
      body: JSON.stringify({
        commandId: "starter-command-123456",
        definitionId: "unit-infantry-squad",
        name: "First Light",
        callsign: "ROOK-1",
        requisitionValue: 0,
      }),
    }), environment());
    expect(forged?.status).toBe(400);
    await expect(forged?.json()).resolves.toMatchObject({ error: { code: "COMMAND_INVALID" } });

    const switchWithoutRevision = await routeOnboardingRequest(new Request("http://localhost/api/onboarding/battalions/current", {
      method: "POST",
      headers: { "x-demo-user": "demo-user", "content-type": "application/json" },
      body: JSON.stringify({
        commandId: "switch-battalion-123456",
        battalionId: "battalion-33rd-expeditionary",
      }),
    }), environment());
    expect(switchWithoutRevision?.status).toBe(400);
    await expect(switchWithoutRevision?.json()).resolves.toMatchObject({ error: { code: "REVISION_INVALID" } });

    const leaveWithForgedStatus = await routeOnboardingRequest(new Request("http://localhost/api/onboarding/battalions/leave", {
      method: "POST",
      headers: { "x-demo-user": "demo-user", "content-type": "application/json" },
      body: JSON.stringify({
        commandId: "leave-battalion-123456",
        battalionId: "battalion-npc-nightwatch",
        expectedMembershipRevision: 1,
        expectedSelectionRevision: 2,
        status: "LEFT",
      }),
    }), environment());
    expect(leaveWithForgedStatus?.status).toBe(400);
    await expect(leaveWithForgedStatus?.json()).resolves.toMatchObject({ error: { code: "COMMAND_INVALID" } });

    const removeWithForgedBattalion = await routeOnboardingRequest(new Request("http://localhost/api/onboarding/battalions/members/remove", {
      method: "POST",
      headers: { "x-demo-user": "demo-user", "content-type": "application/json" },
      body: JSON.stringify({
        commandId: "remove-member-123456",
        targetUserId: "demo-wing-user",
        expectedMembershipRevision: 1,
        battalionId: "battalion-client-selected",
      }),
    }), environment());
    expect(removeWithForgedBattalion?.status).toBe(400);
    await expect(removeWithForgedBattalion?.json()).resolves.toMatchObject({ error: { code: "COMMAND_INVALID" } });
  });
});

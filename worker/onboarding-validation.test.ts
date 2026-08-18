import { describe, expect, it } from "vitest";
import {
  onboardingCommandHash,
  validateCompleteOnboardingCommand,
  validateCreateBattalionCommand,
  validateGrantStarterUnitCommand,
  validateInviteBattalionMemberCommand,
  validateJoinBattalionCommand,
  validateLeaveBattalionCommand,
  validateRemoveBattalionMemberCommand,
  validateSwitchActiveBattalionCommand,
  validateUpdateBattalionRecruitmentCommand,
} from "./onboarding-validation";

const commandId = "onboarding-command-123456";

describe("guided onboarding command validation", () => {
  it("requires exactly one public, invitation, or code selector", () => {
    expect(validateJoinBattalionCommand({ commandId, battalionId: "battalion-1" })).toMatchObject({ valid: true });
    expect(validateJoinBattalionCommand({ commandId, inviteCode: "NIGHTWATCH-77" })).toMatchObject({ valid: true });
    expect(validateJoinBattalionCommand({ commandId, battalionId: "battalion-1", inviteCode: "NIGHTWATCH-77" })).toMatchObject({ valid: false, code: "JOIN_SELECTOR_INVALID" });
  });

  it("requires an engagement summary for public Battalions", () => {
    expect(validateCreateBattalionCommand({
      commandId, name: "Corinth Watch", description: "A public test Battalion.", motto: "",
      accessPolicy: "PUBLIC", engagementSummary: "",
    })).toMatchObject({ valid: false, code: "ENGAGEMENT_INVALID" });
    expect(validateCreateBattalionCommand({
      commandId, name: "Corinth Watch", shortName: "CW", description: "A public test Battalion.", motto: "Stand ready.",
      accessPolicy: "PUBLIC", engagementSummary: "Holding the test perimeter.",
    })).toMatchObject({ valid: true, value: { shortName: "CW" } });
  });

  it("normalizes invitation and starter-unit identities and rejects authority fields", () => {
    expect(validateInviteBattalionMemberCommand({ commandId, targetType: "USERNAME", target: " NIGHT_RAVEN ", message: " Welcome " }))
      .toMatchObject({ valid: true, value: { target: "night_raven", message: "Welcome" } });
    expect(validateGrantStarterUnitCommand({ commandId, definitionId: "unit-infantry-squad", name: " First Light ", callsign: " rook-1 " }))
      .toMatchObject({ valid: true, value: { name: "First Light", callsign: "ROOK-1" } });
    expect(validateGrantStarterUnitCommand({ commandId, definitionId: "unit-infantry-squad", name: "First Light", callsign: "ROOK-1", requisitionValue: 0 }))
      .toMatchObject({ valid: false });
  });

  it("requires optimistic revisions for settings and completion", () => {
    expect(validateUpdateBattalionRecruitmentCommand({ commandId, expectedRevision: 0, accessPolicy: "PRIVATE", joinEnabled: true, engagementSummary: "" }))
      .toMatchObject({ valid: false, code: "REVISION_INVALID" });
    expect(validateCompleteOnboardingCommand({ commandId, expectedRevision: 4 })).toMatchObject({ valid: true });
    expect(validateSwitchActiveBattalionCommand({
      commandId,
      battalionId: "battalion-33rd-expeditionary",
      expectedSelectionRevision: 3,
    })).toMatchObject({ valid: true, value: { expectedSelectionRevision: 3 } });
    expect(validateSwitchActiveBattalionCommand({
      commandId,
      battalionId: "battalion-33rd-expeditionary",
      expectedSelectionRevision: null,
    })).toMatchObject({ valid: true, value: { expectedSelectionRevision: null } });
    expect(validateSwitchActiveBattalionCommand({
      commandId,
      battalionId: "battalion-33rd-expeditionary",
      expectedSelectionRevision: 0,
    })).toMatchObject({ valid: false, code: "REVISION_INVALID" });
    expect(validateLeaveBattalionCommand({
      commandId,
      battalionId: "battalion-npc-nightwatch",
      expectedMembershipRevision: 2,
      expectedSelectionRevision: 7,
    })).toMatchObject({ valid: true });
    expect(validateLeaveBattalionCommand({
      commandId,
      battalionId: "battalion-npc-nightwatch",
      expectedMembershipRevision: 0,
      expectedSelectionRevision: 7,
    })).toMatchObject({ valid: false, code: "REVISION_INVALID" });
    expect(validateRemoveBattalionMemberCommand({
      commandId,
      targetUserId: "demo-wing-user",
      expectedMembershipRevision: 1,
    })).toMatchObject({ valid: true });
    expect(validateRemoveBattalionMemberCommand({
      commandId,
      targetUserId: "demo-wing-user",
      expectedMembershipRevision: 1,
      battalionId: "client-authored",
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
  });

  it("hashes canonical request content with code-point key ordering", async () => {
    await expect(onboardingCommandHash({ z: 1, a: { y: 2, b: 3 } }))
      .resolves.toBe(await onboardingCommandHash({ a: { b: 3, y: 2 }, z: 1 }));
    await expect(onboardingCommandHash({ a: 1 })).resolves.not.toBe(await onboardingCommandHash({ a: 2 }));
  });
});

import { describe, expect, it } from "vitest";
import {
  validateAssignBattlegroupUnit,
  validateCreateBattlegroup,
  validateSetBattlegroupDelegation,
  validateUpdateBattlegroup,
} from "./battlegroup-validation";

describe("Battlegroup mutation contracts", () => {
  it("accepts a strict formation identity", () => {
    expect(validateCreateBattlegroup({
      commandId: "create-battlegroup-0001",
      name: "Raven Battlegroup",
      callsign: "RAVEN",
      objective: "Secure the relay corridor.",
    })).toMatchObject({ valid: true, value: { callsign: "RAVEN" } });
  });

  it("rejects client-authored status and version fields on creation", () => {
    expect(validateCreateBattlegroup({
      commandId: "create-battlegroup-0001",
      name: "Raven Battlegroup",
      callsign: "RAVEN",
      objective: "Secure the relay corridor.",
      status: "READY",
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
  });

  it("requires optimistic concurrency for roster and identity changes", () => {
    expect(validateAssignBattlegroupUnit({
      commandId: "assign-battlegroup-0001",
      unitId: "force-raven",
    })).toMatchObject({ valid: false, code: "REVISION_INVALID" });
    expect(validateUpdateBattlegroup({
      commandId: "update-battlegroup-0001",
      expectedRevision: 2,
      name: "Raven Battlegroup",
      callsign: "RAVEN",
      objective: "Screen the advance.",
      leaderUserId: null,
    })).toMatchObject({ valid: true });
  });

  it("requires an explicit delegation state and rejects forged authority fields", () => {
    expect(validateSetBattlegroupDelegation({
      commandId: "delegate-battlegroup-01",
      expectedRevision: 3,
      unitId: "force-raven",
      delegateUserId: "member-operations",
      active: true,
      ownerId: "someone-else",
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
  });
});

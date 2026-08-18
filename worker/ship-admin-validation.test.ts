import { describe, expect, it } from "vitest";
import { validateRenamePrimaryShip } from "./ship-admin-validation";

describe("primary ship identity validation", () => {
  it("normalizes a strict versioned identity command", () => {
    expect(validateRenamePrimaryShip({
      commandId: "ship-identity-command-0001",
      expectedVersion: 3,
      name: " CSV Resolute II ",
      registry: "csv-resolute-ii",
    })).toEqual({ valid: true, value: {
      commandId: "ship-identity-command-0001",
      expectedVersion: 3,
      name: "CSV Resolute II",
      registry: "CSV-RESOLUTE-II",
    } });
  });

  it("rejects client-authored scope and malformed registries", () => {
    expect(validateRenamePrimaryShip({
      commandId: "ship-identity-command-0001",
      expectedVersion: 3,
      name: "CSV Resolute II",
      registry: "CSV-RESOLUTE-II",
      battalionId: "battalion-foreign",
    })).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
    expect(validateRenamePrimaryShip({
      commandId: "ship-identity-command-0001",
      expectedVersion: 3,
      name: "CSV Resolute II",
      registry: "bad registry",
    })).toMatchObject({ valid: false, code: "SHIP_REGISTRY_INVALID" });
  });
});

import { describe, expect, it } from "vitest";
import {
  commandHash,
  requestHasJsonContentType,
  validatePurchaseForceCommand,
  validateReadinessCheckCommand,
  validateRenameForceCommand,
} from "./forces-validation";

describe("Phase 2 force command validation", () => {
  it("normalizes a valid seven-character callsign and rejects client-authored authority fields", () => {
    expect(
      validateRenameForceCommand({
        commandId: "rename:unit:0001",
        expectedVersion: 2,
        name: " 7th Armoured Platoon ",
        callsign: "bellatr",
      }),
    ).toMatchObject({ valid: true, value: { callsign: "BELLATR", name: "7th Armoured Platoon" } });

    expect(
      validatePurchaseForceCommand({
        commandId: "purchase:unit:01",
        kind: "UNIT",
        definitionId: "unit-main-battle-tank",
        desiredName: "14th Armour",
        callsign: "BELLATR",
        cost: 0,
      }),
    ).toMatchObject({ valid: false, code: "COMMAND_INVALID" });
  });

  it("rejects duplicate readiness IDs and oversized callsigns", () => {
    expect(validateReadinessCheckCommand({ unitIds: ["unit-1", "unit-1"] })).toMatchObject({
      valid: false,
      code: "UNIT_IDS_INVALID",
    });
    expect(
      validateRenameForceCommand({
        commandId: "rename:unit:0002",
        expectedVersion: 1,
        name: "Raven Company",
        callsign: "TOO-LONG",
      }),
    ).toMatchObject({ valid: false, code: "CALLSIGN_INVALID" });
  });

  it("hashes canonical command content and requires JSON content type", async () => {
    await expect(commandHash({ b: 2, a: { d: 4, c: 3 } })).resolves.toBe(
      await commandHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(requestHasJsonContentType(new Request("https://game.example", { headers: { "content-type": "application/json; charset=utf-8" } }))).toBe(true);
    expect(requestHasJsonContentType(new Request("https://game.example", { headers: { "content-type": "text/plain" } }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { validateIncidentalActions } from "./order-validation";

describe("order action ledgers", () => {
  it("rejects ATTACK through incidentalActions", () => {
    expect(validateIncidentalActions([{ type: "ATTACK" }])).toEqual({
      legal: false,
      reason: "ATTACK must be submitted in actions, not incidentalActions.",
    });
  });

  it("rejects a server-derived Standard Action from the incidental ledger", () => {
    expect(validateIncidentalActions([{ type: "SCAN", economy: "STANDARD" }])).toEqual({
      legal: false,
      reason: "SCAN is not an Incidental Action in the pinned ruleset.",
    });
  });

  it("accepts only actions whose pinned economy is Incidental", () => {
    expect(validateIncidentalActions([{ type: "SCAN", economy: "INCIDENTAL" }])).toEqual({ legal: true });
  });
});

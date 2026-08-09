import { describe, expect, it } from "vitest";
import { validateIncidentalActions } from "./order-validation";

describe("order action ledgers", () => {
  it("rejects ATTACK through incidentalActions", () => {
    expect(validateIncidentalActions([{ type: "ATTACK" }])).toEqual({
      legal: false,
      reason: "ATTACK must be submitted in actions, not incidentalActions.",
    });
  });
});

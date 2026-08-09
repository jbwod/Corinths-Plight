import { describe, expect, it } from "vitest";
import type { ForceRow } from "../repositories/forces";
import { developerOverrideAllowed, readinessFor } from "./forces";

function forceRow(overrides: Partial<ForceRow> = {}): ForceRow {
  return {
    status: "ACTIVE",
    current_health: 3,
    availability_status: "DEV_ONLY",
    implementation_status: "PARTIAL",
    executable: 1,
    reason_code: null,
    location_state: "RESERVE",
    deployment_requirements_json: "{}",
    ...overrides,
  } as unknown as ForceRow;
}

describe("Phase 2 force authority gates", () => {
  it("allows an executable development definition through the summary readiness gate", () => {
    const result = readinessFor(forceRow(), true);

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.requirements).toContainEqual({
      id: "definition-executable",
      label: "Rules definition is executable",
      satisfied: true,
    });
  });

  it("keeps catalogue-only definitions visibly blocked even in development", () => {
    const result = readinessFor(forceRow({ implementation_status: "CATALOGUE_ONLY", executable: 0 }), true);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "DEFINITION_NOT_EXECUTABLE",
      requirementId: "definition-executable",
    }));
  });

  it("never offers the developer requisition override for catalogue-only definitions", () => {
    expect(developerOverrideAllowed(true, {
      implementation_status: "CATALOGUE_ONLY",
      requisition_status: "BALANCE_REQUIRED",
      availability_status: "DEV_ONLY",
    })).toBe(false);
  });

  it("offers the override only for non-production, balance-required foundation definitions", () => {
    const definition = {
      implementation_status: "PARTIAL",
      requisition_status: "BALANCE_REQUIRED",
      availability_status: "DEV_ONLY",
    };

    expect(developerOverrideAllowed(true, definition)).toBe(true);
    expect(developerOverrideAllowed(false, definition)).toBe(false);
  });
});

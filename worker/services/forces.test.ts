import { describe, expect, it } from "vitest";
import type { ForceRow } from "../repositories/forces";
import { isImplementedUnitDefinition, readinessFor } from "./forces";

function forceRow(overrides: Partial<ForceRow> = {}): ForceRow {
  return {
    status: "ACTIVE",
    current_health: 3,
    availability_status: "AVAILABLE",
    implementation_status: "IMPLEMENTED",
    executable: 1,
    reason_code: null,
    location_state: "RESERVE",
    deployment_requirements_json: "{}",
    ...overrides,
  } as unknown as ForceRow;
}

describe("force authority gates", () => {
  it("allows an implemented, executable definition through the summary readiness gate", () => {
    const result = readinessFor(forceRow());

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.requirements).toContainEqual({
      id: "definition-executable",
      label: "Rules definition is executable",
      satisfied: true,
    });
  });

  it.each(["CATALOGUE_ONLY", "PARTIAL"])("keeps %s definitions blocked even when executable in development", (status) => {
    const result = readinessFor(forceRow({ implementation_status: status, availability_status: "DEV_ONLY" }), true);

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "DEFINITION_NOT_EXECUTABLE",
      requirementId: "definition-executable",
    }));
  });

  it("only exposes fully implemented and published definitions as requisitionable", () => {
    const definition = {
      implementation_status: "IMPLEMENTED",
      executable: 1,
      purchasable: 1,
      availability_status: "AVAILABLE",
      requisition_status: "PUBLISHED",
      requisition_cost: 10,
    };

    expect(isImplementedUnitDefinition(definition)).toBe(true);
    expect(isImplementedUnitDefinition({ ...definition, implementation_status: "PARTIAL" })).toBe(false);
    expect(isImplementedUnitDefinition({ ...definition, implementation_status: "CATALOGUE_ONLY" })).toBe(false);
    expect(isImplementedUnitDefinition({ ...definition, requisition_cost: null })).toBe(false);
  });
});

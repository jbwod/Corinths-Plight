import type { StructuredAction } from "../packages/domain/src";

export type IncidentalActionValidation =
  | { legal: true }
  | { legal: false; reason: string };

export function validateIncidentalActions(
  actions: Array<Partial<StructuredAction>> | undefined,
): IncidentalActionValidation {
  if (actions?.some((action) => action.type === "ATTACK")) {
    return {
      legal: false,
      reason: "ATTACK must be submitted in actions, not incidentalActions.",
    };
  }
  const nonIncidental = actions?.find((action) => action.economy !== "INCIDENTAL");
  if (nonIncidental) {
    return {
      legal: false,
      reason: `${nonIncidental.type ?? "This action"} is not an Incidental Action in the pinned ruleset.`,
    };
  }
  return { legal: true };
}

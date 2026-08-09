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
  return { legal: true };
}

export const MASH_OPERATIONS = ["DEPLOY", "PACK", "USE", "DESTROY"] as const;

export type MashOperation = typeof MASH_OPERATIONS[number];

export interface MashOperationBlock {
  legal: false;
  operation: MashOperation;
  conflictIds: readonly string[];
  reason: string;
}

/**
 * MASH is companion catalogue material, not an active V5 Combat Medic rule.
 * Keep every lifecycle entry point explicit and fail-closed until the owner
 * selects a canonical activation and supplies a governed facility lifecycle.
 */
export function validateMashOperation(operation: MashOperation): MashOperationBlock {
  const conflictIds = operation === "DESTROY"
    ? ["RC-UNIT-002", "RC-BUILD-006"] as const
    : ["RC-UNIT-002"] as const;
  return {
    legal: false,
    operation,
    conflictIds,
    reason: operation === "DESTROY"
      ? "MASH destruction is blocked: the companion facility is inactive and has no governed durability."
      : "MASH is companion catalogue material and is not executable for the canonical V5 Combat Medic.",
  };
}

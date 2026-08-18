import type { ExecutableFieldworkId } from "./fieldworks";

export const V5_BRIDGE_SMALL_SUPPLY_COST = 2;

export type BridgeAttackEffect = "MISS" | "MINOR_DAMAGE" | "DESTROYED";
export type BridgeCrossingRestriction = "ALL_GROUND" | "NO_TANKS" | "INFANTRY_ONLY" | "NONE";

export interface BridgeState {
  minorHits: 0 | 1 | 2 | 3;
  destroyed: boolean;
}

export type BridgeAttackResult =
  | {
      legal: true;
      naturalRoll: number;
      effect: BridgeAttackEffect;
      before: BridgeState;
      after: BridgeState;
    }
  | {
      legal: false;
      reason: string;
      before: BridgeState;
      after: BridgeState;
    };

/**
 * Source-exact projection of the V5 bridge-only D6 table. This helper does not
 * activate Bridge targeting: no governed Bridge instance lifecycle exists yet.
 */
export function resolveV5BridgeAttackRoll(state: BridgeState, naturalRoll: number): BridgeAttackResult {
  const before = structuredClone(state);
  const unchanged = (reason: string): BridgeAttackResult => ({
    legal: false,
    reason,
    before,
    after: structuredClone(state),
  });
  if (
    !Number.isInteger(state.minorHits) ||
    state.minorHits < 0 ||
    state.minorHits > 3 ||
    (state.minorHits === 3 && !state.destroyed)
  ) {
    return unchanged("Bridge damage state is invalid.");
  }
  if (!Number.isInteger(naturalRoll) || naturalRoll < 1 || naturalRoll > 6) {
    return unchanged("Bridge attack requires one natural D6 result.");
  }
  if (state.destroyed) return unchanged("Destroyed Bridges cannot be attacked again.");
  if (naturalRoll === 1) {
    return { legal: true, naturalRoll, effect: "MISS", before, after: structuredClone(state) };
  }
  if (naturalRoll >= 5) {
    return {
      legal: true,
      naturalRoll,
      effect: "DESTROYED",
      before,
      after: { minorHits: state.minorHits, destroyed: true },
    };
  }
  const minorHits = Math.min(3, state.minorHits + 1) as BridgeState["minorHits"];
  const destroyed = minorHits === 3;
  return {
    legal: true,
    naturalRoll,
    effect: destroyed ? "DESTROYED" : "MINOR_DAMAGE",
    before,
    after: { minorHits, destroyed },
  };
}

export function bridgeCrossingRestriction(state: BridgeState): BridgeCrossingRestriction {
  if (state.destroyed || state.minorHits >= 3) return "NONE";
  if (state.minorHits === 2) return "INFANTRY_ONLY";
  if (state.minorHits === 1) return "NO_TANKS";
  return "ALL_GROUND";
}

export type BridgeLifecycleOperation = "CONSTRUCT" | "ATTACK" | "REPAIR" | "ABANDON";

export interface BridgeLifecycleBlock {
  legal: false;
  operation: BridgeLifecycleOperation;
  decisionId: "DEC-006";
  conflictIds: readonly string[];
  knownSmallSupplyCost?: 2;
  damageTableAvailable?: true;
  reason: string;
}

/** Bridge execution remains blocked even though its cost and damage table are source-complete. */
export function validateBridgeLifecycleOperation(operation: BridgeLifecycleOperation): BridgeLifecycleBlock {
  const common = { legal: false as const, operation, decisionId: "DEC-006" as const };
  if (operation === "CONSTRUCT") {
    return {
      ...common,
      conflictIds: ["RC-BUILD-001"],
      knownSmallSupplyCost: V5_BRIDGE_SMALL_SUPPLY_COST,
      reason: "Bridge construction is blocked until a governed river-edge placement and persistent structure lifecycle are selected.",
    };
  }
  if (operation === "ATTACK") {
    return {
      ...common,
      conflictIds: ["RC-BUILD-006"],
      damageTableAvailable: true,
      reason: "The V5 Bridge damage table is source-complete, but no targetable persistent Bridge instance is active.",
    };
  }
  if (operation === "REPAIR") {
    return {
      ...common,
      conflictIds: ["RC-BUILD-006", "RC-BUILD-007"],
      reason: "Bridge repair has no governed action cost, Supply cost, or damage-restoration rule.",
    };
  }
  return {
    ...common,
    conflictIds: ["RC-BUILD-006"],
    reason: "Bridge abandonment and ownership transfer have no governed lifecycle rule.",
  };
}

export type FieldworkDurabilityOperation = "ATTACK" | "REPAIR" | "DESTROY";

export function validateFieldworkDurabilityOperation(
  structureDefinitionId: ExecutableFieldworkId,
  operation: FieldworkDurabilityOperation,
) {
  return {
    legal: false as const,
    structureDefinitionId,
    operation,
    decisionId: "DEC-006" as const,
    conflictIds: ["RC-BUILD-006"] as const,
    reason: "Active V5 fieldworks are persistent effects but have no governed health, Armor, damage, destruction, or repair profile.",
  };
}

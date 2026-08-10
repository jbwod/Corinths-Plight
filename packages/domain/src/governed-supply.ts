import type { JsonObject } from "./json-contract";
import type { TacticalSupplyResourceId } from "./tactical-supply";

export type GovernedSupplyCapacityV1 =
  | {
      kind: "FIXED_MAXIMUM";
      maximum: number;
      capacityFormula: null;
    }
  | {
      kind: "CURRENT_FS";
      maximum: number;
      capacityFormula: "CURRENT_FS";
    };

export type GovernedSupplyCapacitiesV1 = Partial<
  Record<TacticalSupplyResourceId, GovernedSupplyCapacityV1>
>;

export type GovernedSupplyOverCapacityPolicyV1 = "RETAIN_AND_BLOCK_LOADING";
export type GovernedSupplyFacilityCapabilityV1 = "REARM_AEROSPACE";
export type GovernedSupplyActionEconomyV1 = "STANDARD" | "PRIMARY" | "INCIDENTAL";
export type GovernedSupplyResourceQuantityV1 = number | "SCENARIO_DEFINED";

/**
 * Lossless executable-boundary view of generated supply reload/refill rules.
 * Null means the catalogue omitted the field; consumers must not manufacture a
 * gameplay default from that omission.
 */
export interface GovernedSupplyReloadRulesV1 {
  overCapacityPolicy: GovernedSupplyOverCapacityPolicyV1 | null;
  refillToMaximum: boolean | null;
  sourceResource: TacticalSupplyResourceId | null;
  sourceQuantity: number | null;
  facilityCapability: GovernedSupplyFacilityCapabilityV1 | null;
  requiresLanded: boolean | null;
  economy: GovernedSupplyActionEconomyV1 | null;
  resourceQuantity: GovernedSupplyResourceQuantityV1 | null;
  costPerRoundOfFire: number | null;
  conflictIds: string[] | null;
}

export interface GovernedSupplyProfileV1 {
  schemaVersion: 1;
  id: string;
  capacities: GovernedSupplyCapacitiesV1;
  reloadRules: GovernedSupplyReloadRulesV1;
  definition: JsonObject;
}

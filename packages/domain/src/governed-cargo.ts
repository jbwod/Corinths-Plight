import type { JsonObject } from "./json-contract";
import { TACTICAL_SUPPLY_RESOURCE_IDS, type TacticalSupplyResourceId } from "./tactical-supply";

/** Exact tactical resource identifiers published by the curated rules catalogue. */
export const TACTICAL_CARGO_RESOURCE_TYPES = TACTICAL_SUPPLY_RESOURCE_IDS;

export type TacticalCargoResourceType = TacticalSupplyResourceId;

export type CargoItemTagsAnyV1 = [string, ...string[]];

export type CargoMixedLoadingPolicyV1 =
  | "SHARED_SLOT_CAPACITY"
  | "NOT_APPLICABLE"
  | "MUTUALLY_EXCLUSIVE";

export interface CargoForceStrengthSlotConversionV1 {
  kind: "MAXIMUM_FORCE_STRENGTH";
  itemTagsAny: CargoItemTagsAnyV1;
  maximumForceStrength: number;
  slotCostQuarters: number;
}

export interface CargoTaggedItemSlotConversionV1 {
  kind: "TAGGED_ITEM";
  itemTagsAny: CargoItemTagsAnyV1;
  slotCostQuarters: number;
}

export interface CargoResourceSlotConversionV1 {
  kind: "RESOURCE_QUANTITY";
  resourceType: TacticalCargoResourceType;
  quantity: number;
  slotCostQuarters: number;
}

export type CargoSlotConversionV1 =
  | CargoForceStrengthSlotConversionV1
  | CargoTaggedItemSlotConversionV1
  | CargoResourceSlotConversionV1;

export interface CargoTowRuleV1 {
  count: number;
  itemTagsAny: CargoItemTagsAnyV1;
}

export interface CargoSlotConversionsCapacityV1 {
  kind: "SLOT_CONVERSIONS";
  slotCapacityQuarters: number;
  conversions: CargoSlotConversionV1[];
  mixedLoadingPolicy: "SHARED_SLOT_CAPACITY";
  tow: CargoTowRuleV1 | null;
}

export interface CargoMaximumForceStrengthCapacityV1 {
  kind: "MAXIMUM_FORCE_STRENGTH";
  itemTagsAny: CargoItemTagsAnyV1;
  maximumForceStrength: number;
  mixedLoadingPolicy: "NOT_APPLICABLE";
  tow: null;
}

export interface CargoForceStrengthAlternativeModeV1 {
  kind: "MAXIMUM_FORCE_STRENGTH";
  itemTagsAny: CargoItemTagsAnyV1;
  maximumForceStrength: number;
}

export interface CargoResourceAlternativeModeV1 {
  kind: "RESOURCE_QUANTITY";
  resourceType: TacticalCargoResourceType;
  quantity: number;
}

export type CargoAlternativeModeV1 =
  | CargoForceStrengthAlternativeModeV1
  | CargoResourceAlternativeModeV1;

export interface CargoAlternativeModesCapacityV1 {
  kind: "ALTERNATIVE_MODES";
  modes: [CargoAlternativeModeV1, CargoAlternativeModeV1, ...CargoAlternativeModeV1[]];
  mixedLoadingPolicy: "MUTUALLY_EXCLUSIVE";
  tow: null;
}

export type GovernedCargoCapacityV1 =
  | CargoSlotConversionsCapacityV1
  | CargoMaximumForceStrengthCapacityV1
  | CargoAlternativeModesCapacityV1;

export type CargoLoadingCostV1 =
  | { kind: "STANDARD_ACTION" }
  | { kind: "STANDARD_ACTION_PER_SLOT"; costPerCargoSlotQuarters: number };

export interface GovernedCargoLoadingRulesV1 {
  cost: CargoLoadingCostV1;
  clearAirdropAlongRoute: boolean | null;
  requiresPermissionForForeignUnit: boolean | null;
  conflictIds: string[] | null;
}

/**
 * Lossless executable-boundary view of a generated CARGO_PROFILE definition.
 * Nullable fields mean the source omitted the field; callers must not replace
 * them with gameplay defaults.
 */
export interface GovernedCargoProfileV1 {
  schemaVersion: 1;
  id: string;
  capacity: GovernedCargoCapacityV1;
  loading: GovernedCargoLoadingRulesV1;
  definition: JsonObject;
}

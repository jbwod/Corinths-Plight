import {
  isTacticalSupplyResourceId,
  type CargoCapacityRule,
  type CargoManifestItem,
  type CargoProfile,
  type ReloadProfile,
  type SupplyInventory,
  type SupplyProfile,
  type TacticalSupplyResourceId,
  type WeaponProfile,
} from "../../domain/src";
import { hasAllTags, hasAnyTag } from "./forces";

export const CARGO_SLOT_QUARTERS = 4;

export interface CargoSlotUsage {
  legal: boolean;
  reason?: string;
  slotsQuarters: number;
  ruleId?: string;
  loadGroup?: string;
}

function matchingCargoRule(profile: CargoProfile, item: CargoManifestItem): CargoCapacityRule | undefined {
  return profile.rules.find(
    (rule) =>
      (!rule.cargoKind || rule.cargoKind === item.kind) &&
      (!rule.supplyType || rule.supplyType === item.supplyType) &&
      hasAllTags(item.tags, rule.requiredTags) &&
      !hasAnyTag(item.tags, rule.prohibitedTags),
  );
}

export function cargoSlotsForItem(profile: CargoProfile, item: CargoManifestItem): CargoSlotUsage {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    return { legal: false, reason: "Cargo quantity must be a positive integer.", slotsQuarters: 0 };
  }
  const rule = matchingCargoRule(profile, item);
  if (!rule) return { legal: false, reason: "Cargo item is ineligible for this carrier.", slotsQuarters: 0 };
  const hasQuantityRule = rule.quantityPerSlot !== undefined;
  const hasItemRule = rule.slotsPerItemQuarters !== undefined;
  if (hasQuantityRule === hasItemRule) {
    return { legal: false, reason: "Cargo rule must define exactly one slot calculation.", slotsQuarters: 0 };
  }
  let slotsQuarters: number;
  if (rule.quantityPerSlot !== undefined) {
    if (!Number.isInteger(rule.quantityPerSlot) || rule.quantityPerSlot <= 0) {
      return { legal: false, reason: "Cargo quantity-per-slot must be a positive integer.", slotsQuarters: 0 };
    }
    slotsQuarters = Math.ceil(item.quantity / rule.quantityPerSlot) * CARGO_SLOT_QUARTERS;
  } else {
    const perItem = rule.slotsPerItemQuarters!;
    if (!Number.isInteger(perItem) || perItem <= 0) {
      return { legal: false, reason: "Cargo slots-per-item quarters must be a positive integer.", slotsQuarters: 0 };
    }
    slotsQuarters = item.quantity * perItem;
  }
  return { legal: true, slotsQuarters, ruleId: rule.id, loadGroup: rule.loadGroup };
}

export interface CargoManifestValidation {
  legal: boolean;
  reasons: string[];
  slotsUsedQuarters: number;
  capacitySlotsQuarters: number;
}

export function validateCargoManifest(
  profile: CargoProfile,
  manifest: readonly CargoManifestItem[],
): CargoManifestValidation {
  const reasons: string[] = [];
  if (!Number.isInteger(profile.capacitySlotsQuarters) || profile.capacitySlotsQuarters < 0) {
    reasons.push("Cargo capacity quarters must be a non-negative integer.");
  }
  const ids = new Set<string>();
  const loadGroups = new Set<string>();
  let slotsUsedQuarters = 0;
  for (const item of manifest) {
    if (ids.has(item.id)) reasons.push(`Cargo item ${item.id} appears more than once.`);
    ids.add(item.id);
    const usage = cargoSlotsForItem(profile, item);
    if (!usage.legal) reasons.push(`${item.id}: ${usage.reason}`);
    else {
      slotsUsedQuarters += usage.slotsQuarters;
      if (usage.loadGroup) loadGroups.add(usage.loadGroup);
    }
  }
  if (!profile.allowMixedLoadGroups && loadGroups.size > 1) reasons.push("Carrier cannot mix these cargo load groups.");
  if (slotsUsedQuarters > profile.capacitySlotsQuarters) {
    reasons.push(`Cargo capacity exceeded (${slotsUsedQuarters}/${profile.capacitySlotsQuarters} quarters).`);
  }
  return {
    legal: reasons.length === 0,
    reasons,
    slotsUsedQuarters,
    capacitySlotsQuarters: profile.capacitySlotsQuarters,
  };
}

export function cargoSlotsUsed(profile: CargoProfile, manifest: readonly CargoManifestItem[]): number {
  return validateCargoManifest(profile, manifest).slotsUsedQuarters;
}

export interface CargoActionResult {
  legal: boolean;
  reason?: string;
  manifest: CargoManifestItem[];
  slotsUsedQuarters: number;
  speedCostQuarters: number;
}

function cargoActionSpeedCost(
  slotsQuarters: number,
  flatCostQuarters: number | undefined,
  costQuartersPerCargoSlot: number | undefined,
): number | undefined {
  if ((flatCostQuarters === undefined) === (costQuartersPerCargoSlot === undefined)) return undefined;
  return flatCostQuarters ?? (slotsQuarters / CARGO_SLOT_QUARTERS) * costQuartersPerCargoSlot!;
}

export function embarkCargo(
  profile: CargoProfile,
  manifest: readonly CargoManifestItem[],
  item: CargoManifestItem,
  availableSpeedQuarters: number,
): CargoActionResult {
  const next = [...manifest.map((entry) => structuredClone(entry)), structuredClone(item)];
  const validation = validateCargoManifest(profile, next);
  const usage = cargoSlotsForItem(profile, item);
  const speedCostQuarters = usage.legal
    ? cargoActionSpeedCost(
        usage.slotsQuarters,
        profile.embarkFlatSpeedCostQuarters,
        profile.embarkSpeedCostQuartersPerCargoSlot,
      )
    : 0;
  if (!validation.legal) {
    return {
      legal: false,
      reason: validation.reasons[0],
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  if (speedCostQuarters === undefined) {
    return {
      legal: false,
      reason: "Cargo profile must define exactly one embark Speed cost mode.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  if (!Number.isInteger(speedCostQuarters) || speedCostQuarters < 0) {
    return {
      legal: false,
      reason: "Embark Speed cost must resolve to whole quarters.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  if (!Number.isInteger(availableSpeedQuarters) || availableSpeedQuarters < speedCostQuarters) {
    return {
      legal: false,
      reason: "Insufficient Speed to embark cargo.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  return { legal: true, manifest: next, slotsUsedQuarters: validation.slotsUsedQuarters, speedCostQuarters };
}

export function disembarkCargo(
  profile: CargoProfile,
  manifest: readonly CargoManifestItem[],
  itemIds: readonly string[],
  availableSpeedQuarters: number,
): CargoActionResult {
  const selected = new Set(itemIds);
  if (selected.size === 0) {
    return {
      legal: false,
      reason: "At least one cargo item must disembark.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  const removed = manifest.filter((item) => selected.has(item.id));
  if (removed.length !== selected.size) {
    return {
      legal: false,
      reason: "A selected cargo item is not embarked.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  const removedSlots = cargoSlotsUsed(profile, removed);
  const speedCostQuarters = cargoActionSpeedCost(
    removedSlots,
    profile.disembarkFlatSpeedCostQuarters,
    profile.disembarkSpeedCostQuartersPerCargoSlot,
  );
  if (speedCostQuarters === undefined) {
    return {
      legal: false,
      reason: "Cargo profile must define exactly one disembark Speed cost mode.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  if (!Number.isInteger(speedCostQuarters) || speedCostQuarters < 0) {
    return {
      legal: false,
      reason: "Disembark Speed cost must resolve to whole quarters.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  if (!Number.isInteger(availableSpeedQuarters) || availableSpeedQuarters < speedCostQuarters) {
    return {
      legal: false,
      reason: "Insufficient Speed to disembark cargo.",
      manifest: manifest.map((entry) => structuredClone(entry)),
      slotsUsedQuarters: cargoSlotsUsed(profile, manifest),
      speedCostQuarters: 0,
    };
  }
  const next = manifest.filter((item) => !selected.has(item.id)).map((entry) => structuredClone(entry));
  return {
    legal: true,
    manifest: next,
    slotsUsedQuarters: cargoSlotsUsed(profile, next),
    speedCostQuarters,
  };
}

export interface TowableUnit {
  unitId: string;
  tags: string[];
}

export interface TowResult {
  legal: boolean;
  reason?: string;
  towedUnitIds: string[];
}

export function attachTow(
  profile: CargoProfile,
  currentTowedUnitIds: readonly string[],
  unit: TowableUnit,
): TowResult {
  const capacity = profile.towCapacity ?? 0;
  if (!Number.isInteger(capacity) || capacity < 0) {
    return { legal: false, reason: "Tow capacity must be a non-negative integer.", towedUnitIds: [...currentTowedUnitIds] };
  }
  if (capacity === 0) return { legal: false, reason: "Carrier cannot tow units.", towedUnitIds: [...currentTowedUnitIds] };
  if (!unit.unitId) return { legal: false, reason: "Towed unit identifier is required.", towedUnitIds: [...currentTowedUnitIds] };
  if (currentTowedUnitIds.includes(unit.unitId)) {
    return { legal: false, reason: "Unit is already towed.", towedUnitIds: [...currentTowedUnitIds] };
  }
  if (currentTowedUnitIds.length >= capacity) {
    return { legal: false, reason: "Tow capacity is full.", towedUnitIds: [...currentTowedUnitIds] };
  }
  if (!hasAllTags(unit.tags, profile.towRequiredTags)) {
    return { legal: false, reason: "Unit lacks a required tow tag.", towedUnitIds: [...currentTowedUnitIds] };
  }
  return { legal: true, towedUnitIds: [...currentTowedUnitIds, unit.unitId] };
}

export function detachTow(currentTowedUnitIds: readonly string[], unitId: string): TowResult {
  if (!currentTowedUnitIds.includes(unitId)) {
    return { legal: false, reason: "Unit is not currently towed.", towedUnitIds: [...currentTowedUnitIds] };
  }
  return { legal: true, towedUnitIds: currentTowedUnitIds.filter((candidate) => candidate !== unitId) };
}

export function effectiveSupplyCapacity(profile: SupplyProfile, currentHealth: number): number {
  const configuredCapacity = profile.totalCapacity ?? Object.values(profile.capacities).reduce(
    (total, capacity) => total + (Number.isInteger(capacity) && capacity >= 0 ? capacity : 0),
    0,
  );
  const healthCapacity = profile.capacityPerCurrentHealth === undefined
    ? Number.POSITIVE_INFINITY
    : Number.isFinite(currentHealth) && currentHealth >= 0 &&
        Number.isFinite(profile.capacityPerCurrentHealth) && profile.capacityPerCurrentHealth >= 0
      ? currentHealth * profile.capacityPerCurrentHealth
      : 0;
  return Number.isFinite(configuredCapacity) && configuredCapacity >= 0
    ? Math.min(configuredCapacity, healthCapacity)
    : 0;
}

export interface SupplyInventoryValidation {
  legal: boolean;
  reasons: string[];
  total: number;
  capacity: number;
  overCapacity: boolean;
}

export function validateSupplyInventory(
  profile: SupplyProfile,
  inventory: SupplyInventory,
  currentHealth: number,
): SupplyInventoryValidation {
  const reasons: string[] = [];
  if (profile.totalCapacity !== undefined && (!Number.isInteger(profile.totalCapacity) || profile.totalCapacity < 0)) {
    reasons.push("Total supply capacity must be a non-negative integer.");
  }
  if (
    profile.capacityPerCurrentHealth !== undefined &&
    (!Number.isFinite(profile.capacityPerCurrentHealth) || profile.capacityPerCurrentHealth < 0)
  ) {
    reasons.push("Health-linked supply capacity must be finite and non-negative.");
  }
  if (!Number.isFinite(currentHealth) || currentHealth < 0) reasons.push("Current health is invalid for supply capacity.");
  for (const [type, typeCapacity] of Object.entries(profile.capacities)) {
    if (!isTacticalSupplyResourceId(type)) {
      reasons.push(`${type} is not a canonical tactical supply resource identifier.`);
      continue;
    }
    if (!Number.isInteger(typeCapacity) || typeCapacity < 0) reasons.push(`${type} supply capacity is invalid.`);
  }
  let total = 0;
  for (const [type, quantity] of Object.entries(inventory)) {
    const validQuantity = Number.isInteger(quantity) && quantity >= 0;
    if (!validQuantity) reasons.push(`${type} supply must be a non-negative integer.`);
    else total += quantity;
    if (!isTacticalSupplyResourceId(type)) {
      reasons.push(`${type} is not a canonical tactical supply resource identifier.`);
      continue;
    }
    const typeCapacity = profile.capacities[type];
    if (typeCapacity === undefined) reasons.push(`${type} supply is unsupported by this profile.`);
    else if (validQuantity && quantity > typeCapacity) reasons.push(`${type} supply capacity exceeded.`);
  }
  const capacity = effectiveSupplyCapacity(profile, currentHealth);
  const overCapacity = total > capacity;
  if (overCapacity && !profile.retainExistingOverCapacity) reasons.push("Total supply capacity exceeded.");
  return { legal: reasons.length === 0, reasons, total, capacity, overCapacity };
}

export interface SupplyTransferInput {
  sourceProfile: SupplyProfile;
  destinationProfile: SupplyProfile;
  source: SupplyInventory;
  destination: SupplyInventory;
  sourceCurrentHealth: number;
  destinationCurrentHealth: number;
  type: TacticalSupplyResourceId;
  quantity: number;
}

export interface SupplyTransferResult {
  legal: boolean;
  reason?: string;
  source: SupplyInventory;
  destination: SupplyInventory;
}

export function transferProfiledSupply(input: SupplyTransferInput): SupplyTransferResult {
  const unchanged = (reason: string): SupplyTransferResult => ({
    legal: false,
    reason,
    source: { ...input.source },
    destination: { ...input.destination },
  });
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return unchanged("Supply quantity must be a positive integer.");
  if (input.sourceProfile.capacities[input.type] === undefined || input.destinationProfile.capacities[input.type] === undefined) {
    return unchanged("Supply type is unsupported by one or both profiles.");
  }
  if (!input.sourceProfile.transferableTypes.includes(input.type) || !input.destinationProfile.transferableTypes.includes(input.type)) {
    return unchanged("Supply type is not transferable for both units.");
  }
  if ((input.source[input.type] ?? 0) < input.quantity) return unchanged("Source has insufficient supply.");
  const beforeDestination = validateSupplyInventory(input.destinationProfile, input.destination, input.destinationCurrentHealth);
  if (beforeDestination.overCapacity) return unchanged("Destination is already over capacity.");
  const source = { ...input.source, [input.type]: (input.source[input.type] ?? 0) - input.quantity };
  const destination = { ...input.destination, [input.type]: (input.destination[input.type] ?? 0) + input.quantity };
  const afterDestination = validateSupplyInventory(input.destinationProfile, destination, input.destinationCurrentHealth);
  if (!afterDestination.legal || afterDestination.overCapacity) {
    return unchanged(afterDestination.reasons[0] ?? "Destination supply capacity would be exceeded.");
  }
  return { legal: true, source, destination };
}

export interface ReloadInput {
  profile: ReloadProfile;
  weapon: WeaponProfile;
  currentAmmo: number;
  supplies: SupplyInventory;
  landed: boolean;
  facilityTags: string[];
}

export interface ReloadResult {
  legal: boolean;
  reason?: string;
  ammunitionAfter: number;
  supplySpent: number;
  supplies: SupplyInventory;
  actionEconomy: ReloadProfile["actionEconomy"];
}

export function reloadAmmunition(input: ReloadInput): ReloadResult {
  const unchanged = (reason: string): ReloadResult => ({
    legal: false,
    reason,
    ammunitionAfter: input.currentAmmo,
    supplySpent: 0,
    supplies: { ...input.supplies },
    actionEconomy: input.profile.actionEconomy,
  });
  const capacity = input.weapon.ammoCapacity;
  if (capacity === undefined || !Number.isInteger(capacity) || capacity <= 0) {
    return unchanged("Weapon has no finite ammunition capacity.");
  }
  if (!Number.isInteger(input.currentAmmo) || input.currentAmmo < 0 || input.currentAmmo > capacity) {
    return unchanged("Current ammunition is invalid.");
  }
  if (input.currentAmmo >= capacity) return unchanged("Weapon ammunition is already full.");
  if (input.profile.requiresLanding && !input.landed) return unchanged("Unit must be landed to reload.");
  const facilityEligible = input.profile.requiredFacilityTags.length === 0 ||
    (input.profile.facilityTagMatch === "ALL"
      ? hasAllTags(input.facilityTags, input.profile.requiredFacilityTags)
      : hasAnyTag(input.facilityTags, input.profile.requiredFacilityTags));
  if (!facilityEligible) return unchanged("Reload facility is ineligible.");
  if (!Number.isInteger(input.profile.supplyCost) || input.profile.supplyCost < 0) return unchanged("Reload supply cost is invalid.");
  const supplyType = input.profile.supplyType;
  if (input.profile.supplyCost > 0 && (!supplyType || (input.supplies[supplyType] ?? 0) < input.profile.supplyCost)) {
    return unchanged("Insufficient reload supply.");
  }
  const requested = input.profile.ammunitionPerAction === "FULL"
    ? capacity
    : input.currentAmmo + Math.max(0, input.profile.ammunitionPerAction);
  const ammunitionAfter = Math.min(capacity, requested);
  if (!Number.isInteger(ammunitionAfter) || ammunitionAfter <= input.currentAmmo) {
    return unchanged("Reload amount must add whole ammunition units.");
  }
  const supplies = { ...input.supplies };
  if (supplyType && input.profile.supplyCost > 0) supplies[supplyType] -= input.profile.supplyCost;
  return {
    legal: true,
    ammunitionAfter,
    supplySpent: input.profile.supplyCost,
    supplies,
    actionEconomy: input.profile.actionEconomy,
  };
}

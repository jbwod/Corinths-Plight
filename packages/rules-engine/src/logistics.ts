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
  if (item.transportMode === "TOWED") {
    if (!item.unitId) {
      return { legal: false, reason: "Towed cargo requires a unit identifier.", slotsQuarters: 0 };
    }
    if (!Number.isInteger(profile.towCapacity) || (profile.towCapacity ?? 0) <= 0) {
      return { legal: false, reason: "Carrier cannot tow units.", slotsQuarters: 0 };
    }
    if ((profile.towRequiredTags?.length ?? 0) > 0 && !hasAnyTag(item.tags, profile.towRequiredTags)) {
      return { legal: false, reason: "Unit lacks an eligible tow tag.", slotsQuarters: 0 };
    }
    return { legal: true, slotsQuarters: 0, ruleId: "tow" };
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
  let towedUnits = 0;
  let slotsUsedQuarters = 0;
  for (const item of manifest) {
    if (ids.has(item.id)) reasons.push(`Cargo item ${item.id} appears more than once.`);
    ids.add(item.id);
    const usage = cargoSlotsForItem(profile, item);
    if (!usage.legal) reasons.push(`${item.id}: ${usage.reason}`);
    else {
      slotsUsedQuarters += usage.slotsQuarters;
      if (item.transportMode === "TOWED") towedUnits += 1;
      if (usage.loadGroup) loadGroups.add(usage.loadGroup);
    }
  }
  if (towedUnits > (profile.towCapacity ?? 0)) {
    reasons.push(`Tow capacity exceeded (${towedUnits}/${profile.towCapacity ?? 0}).`);
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

/**
 * Projects an authoritative tactical supply inventory into a carrier manifest.
 * Existing unit/tow cargo is preserved; supply rows are rebuilt from inventory so
 * capacity checks cannot drift from the quantities used by tactical actions.
 */
export function synchronizeSupplyCargo(
  profile: CargoProfile,
  manifest: readonly CargoManifestItem[],
  supplies: SupplyInventory,
  itemIdPrefix: string,
): CargoManifestItem[] {
  const next = manifest
    // Only tactical resource rows are inventory projections. Opaque mission or
    // companion "Supply Cargo" packages have no supplyType and must persist.
    .filter((item) => item.kind !== "SUPPLY" || item.supplyType === undefined)
    .map((item) => structuredClone(item));
  for (const supplyType of Object.keys(supplies).sort()) {
    const quantity = supplies[supplyType] ?? 0;
    if (!isTacticalSupplyResourceId(supplyType) || !Number.isInteger(quantity) || quantity <= 0) continue;
    const item: CargoManifestItem = {
      id: `${itemIdPrefix}:${supplyType}`,
      kind: "SUPPLY",
      quantity,
      tags: ["SUPPLY", supplyType],
      transportMode: "STOWED",
      supplyType,
    };
    if (matchingCargoRule(profile, item)) next.push(item);
  }
  return next;
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
  if ((profile.towRequiredTags?.length ?? 0) > 0 && !hasAnyTag(unit.tags, profile.towRequiredTags)) {
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

export interface PartialSupplyTransferResult extends SupplyTransferResult {
  quantityTransferred: number;
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

/**
 * Moves as much of one governed tactical resource as can legally fit, bounded
 * by an optional caller maximum. This is the reusable partial-transfer
 * primitive used by logistics handoffs; it never aliases strategic Supply
 * sizes or converts one resource into another.
 */
export function transferAvailableProfiledSupply(
  input: Omit<SupplyTransferInput, "quantity"> & { maximumQuantity?: number },
): PartialSupplyTransferResult {
  const unchanged = (reason: string): PartialSupplyTransferResult => ({
    legal: false,
    reason,
    source: { ...input.source },
    destination: { ...input.destination },
    quantityTransferred: 0,
  });
  if (
    input.maximumQuantity !== undefined &&
    (!Number.isInteger(input.maximumQuantity) || input.maximumQuantity <= 0)
  ) return unchanged("Maximum Supply transfer quantity must be a positive integer.");
  if (
    input.sourceProfile.capacities[input.type] === undefined ||
    input.destinationProfile.capacities[input.type] === undefined
  ) return unchanged("Supply type is unsupported by one or both profiles.");
  if (
    !input.sourceProfile.transferableTypes.includes(input.type) ||
    !input.destinationProfile.transferableTypes.includes(input.type)
  ) return unchanged("Supply type is not transferable for both units.");

  const sourceValidation = validateSupplyInventory(input.sourceProfile, input.source, input.sourceCurrentHealth);
  if (!sourceValidation.legal) return unchanged(sourceValidation.reasons[0] ?? "Source Supply inventory is invalid.");
  const destinationValidation = validateSupplyInventory(
    input.destinationProfile,
    input.destination,
    input.destinationCurrentHealth,
  );
  if (!destinationValidation.legal) {
    return unchanged(destinationValidation.reasons[0] ?? "Destination Supply inventory is invalid.");
  }
  if (destinationValidation.overCapacity) return unchanged("Destination is already over capacity.");

  const sourceAvailable = input.source[input.type] ?? 0;
  if (sourceAvailable <= 0) return unchanged("Source has insufficient supply.");
  const typeRemaining = Math.max(
    0,
    input.destinationProfile.capacities[input.type]! - (input.destination[input.type] ?? 0),
  );
  const totalRemaining = Math.max(0, destinationValidation.capacity - destinationValidation.total);
  const quantity = Math.min(
    sourceAvailable,
    typeRemaining,
    totalRemaining,
    input.maximumQuantity ?? Number.MAX_SAFE_INTEGER,
  );
  if (quantity <= 0) return unchanged("Destination Supply capacity is full.");
  const transferred = transferProfiledSupply({ ...input, quantity });
  return transferred.legal
    ? { ...transferred, quantityTransferred: quantity }
    : { ...transferred, quantityTransferred: 0 };
}

export const LOGI_SMALL_SUPPLY_CAPACITY = 10;
export const ARTILLERY_SMALL_SUPPLY_CAPACITY = 2;
export const HAT_SMALL_SUPPLY_CAPACITY = 25;

const logiSmallSupplyProfile: SupplyProfile = {
  id: "v5-logi-small-supply-cargo",
  capacities: { SMALL_SUPPLY: LOGI_SMALL_SUPPLY_CAPACITY },
  totalCapacity: LOGI_SMALL_SUPPLY_CAPACITY,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL_SUPPLY"],
  handlerId: "foundation-action-handler",
};

const artillerySmallSupplyProfile: SupplyProfile = {
  id: "v5-artillery-small-supply-stockpile",
  capacities: { SMALL_SUPPLY: ARTILLERY_SMALL_SUPPLY_CAPACITY },
  totalCapacity: ARTILLERY_SMALL_SUPPLY_CAPACITY,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL_SUPPLY"],
  handlerId: "foundation-action-handler",
};

const hatSmallSupplyProfile: SupplyProfile = {
  id: "v5-hat-small-supply-cargo",
  capacities: { SMALL_SUPPLY: HAT_SMALL_SUPPLY_CAPACITY },
  totalCapacity: HAT_SMALL_SUPPLY_CAPACITY,
  retainExistingOverCapacity: true,
  transferableTypes: ["SMALL_SUPPLY"],
  handlerId: "foundation-action-handler",
};

export type CoordinatedSupplyDropResult =
  | {
      legal: true;
      source: SupplyInventory;
      destination: SupplyInventory;
      resourceType: "SMALL_SUPPLY";
      quantityTransferred: number;
    }
  | {
      legal: false;
      reason: string;
      source: SupplyInventory;
      destination: SupplyInventory;
      quantityTransferred: 0;
    };

/**
 * Source-complete inventory handoff for the Logi/HAT coordinated drop. Route,
 * paired-action and carrier identity checks belong to the resolver boundary.
 */
export function transferCoordinatedSupplyDrop(
  source: SupplyInventory,
  destination: SupplyInventory,
): CoordinatedSupplyDropResult {
  const result = transferAvailableProfiledSupply({
    sourceProfile: hatSmallSupplyProfile,
    destinationProfile: logiSmallSupplyProfile,
    source,
    destination,
    sourceCurrentHealth: 1,
    destinationCurrentHealth: 1,
    type: "SMALL_SUPPLY",
  });
  return result.legal
    ? {
        legal: true,
        source: result.source,
        destination: result.destination,
        resourceType: "SMALL_SUPPLY",
        quantityTransferred: result.quantityTransferred,
      }
    : {
        legal: false,
        reason: result.reason ?? "Coordinated Supply Drop is illegal.",
        source: result.source,
        destination: result.destination,
        quantityTransferred: 0,
      };
}

/**
 * The source-complete tactical logistics path: a Logi Standard Action moves
 * one Small Supply crate into an Artillery stockpile. Wider resupply and
 * weapon-reload conversions remain separate rules decisions.
 */
export function transferLogiArtillerySupply(
  source: SupplyInventory,
  destination: SupplyInventory,
): SupplyTransferResult {
  return transferProfiledSupply({
    sourceProfile: logiSmallSupplyProfile,
    destinationProfile: artillerySmallSupplyProfile,
    source,
    destination,
    sourceCurrentHealth: 1,
    destinationCurrentHealth: 3,
    type: "SMALL_SUPPLY",
    quantity: 1,
  });
}

export type FieldResupplyPurpose = "SAME_RESOURCE_TRANSFER";

export type FieldResupplyResult =
  | {
      legal: true;
      source: SupplyInventory;
      destination: SupplyInventory;
      purpose: FieldResupplyPurpose;
      resourceType: "SMALL_SUPPLY";
      sourceSpent: number;
      quantityRestored: number;
    }
  | {
      legal: false;
      reason: string;
      source: SupplyInventory;
      destination: SupplyInventory;
    };

/**
 * Public-v1 V5 Logi field resupply. The server moves as much SMALL_SUPPLY as
 * both governed profiles can accept. It never converts a resource into another
 * resource or mutates a weapon ammunition store.
 */
export function resupplyLogiTarget(input: {
  source: SupplyInventory;
  destination: SupplyInventory;
  destinationTags: readonly string[];
  destinationCurrentHealth: number;
}): FieldResupplyResult {
  const unchanged = (reason: string): FieldResupplyResult => ({
    legal: false,
    reason,
    source: { ...input.source },
    destination: { ...input.destination },
  });
  const tags = new Set(input.destinationTags);
  const maximum = tags.has("ARTILLERY") ? ARTILLERY_SMALL_SUPPLY_CAPACITY
    : tags.has("ENGINEER") ? Math.max(0, input.destinationCurrentHealth)
      : undefined;
  if (maximum === undefined) return unchanged("That unit has no governed same-resource field-resupply profile.");
  const destinationProfile: SupplyProfile = {
    id: tags.has("ARTILLERY") ? "v5-artillery-small-supply-stockpile" : "v5-engineer-small-supply-stockpile",
    capacities: { SMALL_SUPPLY: maximum },
    totalCapacity: maximum,
    retainExistingOverCapacity: true,
    transferableTypes: ["SMALL_SUPPLY"],
    handlerId: "foundation-action-handler",
  };
  const transferred = transferAvailableProfiledSupply({
    sourceProfile: logiSmallSupplyProfile,
    destinationProfile,
    source: input.source,
    destination: input.destination,
    sourceCurrentHealth: 1,
    destinationCurrentHealth: input.destinationCurrentHealth,
    type: "SMALL_SUPPLY",
  });
  if (!transferred.legal) return unchanged(transferred.reason ?? "Small Supply transfer is illegal.");
  return {
    legal: true,
    source: transferred.source,
    destination: transferred.destination,
    purpose: "SAME_RESOURCE_TRANSFER",
    resourceType: "SMALL_SUPPLY",
    sourceSpent: transferred.quantityTransferred,
    quantityRestored: transferred.quantityTransferred,
  };
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

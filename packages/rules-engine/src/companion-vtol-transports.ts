import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  CargoManifestItem,
  CargoProfile,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { COMPANION_PUBLIC_V1_PROFILE_ID, getCompanionClassPolicyV1 } from "./companion-class-profile";
import { isInfantryGarrisonBuilding } from "./cover";
import { validateCargoManifest } from "./logistics";

export const COMPANION_VTOL_TRANSPORT_RULESET = COMPANION_PUBLIC_V1_PROFILE_ID;

export type CompanionVtolTransportDefinitionId =
  | "unit-vtol-troop-airlift"
  | "unit-vtol-multipurpose-airlift"
  | "unit-vtol-heavy-lift";

const TROOP_AIRLIFT_ID: CompanionVtolTransportDefinitionId = "unit-vtol-troop-airlift";
const MULTIPURPOSE_AIRLIFT_ID: CompanionVtolTransportDefinitionId = "unit-vtol-multipurpose-airlift";
const HEAVY_LIFT_ID: CompanionVtolTransportDefinitionId = "unit-vtol-heavy-lift";

export const COMPANION_VTOL_UNIT_CARGO_TAG = "COMPANION_VTOL_UNIT_CARGO" as const;
export const COMPANION_VTOL_SUPPLY_CARGO_TAG = "SUPPLY_CARGO" as const;
export const COMPANION_VTOL_OBJECTIVE_CARGO_TAG = "OBJECTIVE_CARGO" as const;
export const COMPANION_VTOL_EXTERNAL_LOAD_TAG = "EXTERNAL_HEAVY_LIFT" as const;

export function isCompanionVtolTransportDefinitionId(
  value: string,
): value is CompanionVtolTransportDefinitionId {
  return value === TROOP_AIRLIFT_ID || value === MULTIPURPOSE_AIRLIFT_ID || value === HEAVY_LIFT_ID;
}

export function isCompanionVtolTransport(
  deployment: Pick<CampaignDeployment, "definitionId">,
): deployment is Pick<CampaignDeployment, "definitionId"> & { definitionId: CompanionVtolTransportDefinitionId } {
  return isCompanionVtolTransportDefinitionId(deployment.definitionId);
}

function governedLightGun(): WeaponProfile {
  const source = getCompanionClassPolicyV1(TROOP_AIRLIFT_ID).weapons[0]!;
  return {
    id: source.id,
    name: source.name,
    damage: { ...source.damage },
    range: source.range,
    armorPiercing: source.armorPiercing,
    ammoCapacity: 1,
    tags: ["DIRECT", "NOSE_GUN", "REARM_REQUIRED"],
  };
}

const TROOP_AIRLIFT_CARGO_PROFILE: CargoProfile = {
  id: "cargo-companion-vtol-troop-airlift-public-v1",
  capacitySlotsQuarters: 8,
  allowMixedLoadGroups: false,
  embarkFlatSpeedCostQuarters: 2,
  disembarkFlatSpeedCostQuarters: 2,
  rules: [
    {
      id: "troop-airlift-infantry-unit",
      cargoKind: "PERSONNEL",
      requiredTags: ["INFANTRY", "PERSONNEL", COMPANION_VTOL_UNIT_CARGO_TAG],
      prohibitedTags: ["VEHICLE"],
      slotsPerItemQuarters: 4,
      loadGroup: "PERSONNEL",
    },
    {
      id: "troop-airlift-one-opaque-supply-cargo",
      cargoKind: "SUPPLY",
      requiredTags: [COMPANION_VTOL_SUPPLY_CARGO_TAG],
      slotsPerItemQuarters: 8,
      loadGroup: "SUPPLY",
    },
  ],
};

const MULTIPURPOSE_AIRLIFT_CARGO_PROFILE: CargoProfile = {
  id: "cargo-companion-vtol-multipurpose-airlift-public-v1",
  capacitySlotsQuarters: 8,
  allowMixedLoadGroups: true,
  embarkFlatSpeedCostQuarters: 2,
  disembarkFlatSpeedCostQuarters: 2,
  rules: [
    {
      id: "multipurpose-one-infantry-unit",
      cargoKind: "PERSONNEL",
      requiredTags: ["INFANTRY", "PERSONNEL", COMPANION_VTOL_UNIT_CARGO_TAG],
      prohibitedTags: ["VEHICLE"],
      slotsPerItemQuarters: 4,
      loadGroup: "PERSONNEL_OR_SUPPLY",
    },
    {
      id: "multipurpose-one-opaque-supply-cargo",
      cargoKind: "SUPPLY",
      requiredTags: [COMPANION_VTOL_SUPPLY_CARGO_TAG],
      slotsPerItemQuarters: 4,
      loadGroup: "PERSONNEL_OR_SUPPLY",
    },
    {
      id: "multipurpose-one-light-vehicle",
      cargoKind: "VEHICLE",
      requiredTags: ["VEHICLE", "LIGHT_VEHICLE", COMPANION_VTOL_UNIT_CARGO_TAG],
      prohibitedTags: ["MECH", "HEAVY", "SUPER_HEAVY"],
      slotsPerItemQuarters: 4,
      loadGroup: "LIGHT_VEHICLE",
    },
  ],
};

const HEAVY_LIFT_CARGO_PROFILE: CargoProfile = {
  id: "cargo-companion-vtol-heavy-lift-public-v1",
  capacitySlotsQuarters: 4,
  allowMixedLoadGroups: false,
  embarkFlatSpeedCostQuarters: 2,
  disembarkFlatSpeedCostQuarters: 2,
  rules: [
    {
      id: "heavy-lift-one-heavy-unit",
      cargoKind: "VEHICLE",
      requiredTags: [COMPANION_VTOL_UNIT_CARGO_TAG, COMPANION_VTOL_EXTERNAL_LOAD_TAG],
      slotsPerItemQuarters: 4,
      loadGroup: "EXTERNAL_LOAD",
    },
    {
      id: "heavy-lift-one-objective-cargo",
      cargoKind: "OTHER",
      requiredTags: [COMPANION_VTOL_OBJECTIVE_CARGO_TAG, COMPANION_VTOL_EXTERNAL_LOAD_TAG],
      slotsPerItemQuarters: 4,
      loadGroup: "EXTERNAL_LOAD",
    },
    {
      id: "heavy-lift-one-opaque-supply-cargo",
      cargoKind: "SUPPLY",
      requiredTags: [COMPANION_VTOL_SUPPLY_CARGO_TAG, COMPANION_VTOL_EXTERNAL_LOAD_TAG],
      slotsPerItemQuarters: 4,
      loadGroup: "EXTERNAL_LOAD",
    },
  ],
};

const cargoProfiles: Readonly<Record<CompanionVtolTransportDefinitionId, CargoProfile>> = Object.freeze({
  [TROOP_AIRLIFT_ID]: TROOP_AIRLIFT_CARGO_PROFILE,
  [MULTIPURPOSE_AIRLIFT_ID]: MULTIPURPOSE_AIRLIFT_CARGO_PROFILE,
  [HEAVY_LIFT_ID]: HEAVY_LIFT_CARGO_PROFILE,
});

export function getCompanionVtolCargoProfile(definitionId: CompanionVtolTransportDefinitionId): CargoProfile {
  return structuredClone(cargoProfiles[definitionId]);
}

/** Runtime projection of the owner-approved public-v1 companion VTOL conversion. */
export function getCompanionVtolPublicV1Class(
  definitionId: CompanionVtolTransportDefinitionId,
  sensorRange: number,
): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error(`${definitionId} requires a scenario-authored non-negative integer sensor range.`);
  }
  const policy = getCompanionClassPolicyV1(definitionId);
  const armed = definitionId !== HEAVY_LIFT_ID;
  return {
    id: definitionId,
    kind: "unit-class",
    name: policy.name,
    description: `${policy.name} under the approved public-v1 companion VTOL conversion.`,
    category: "AEROSPACE",
    tags: [...policy.tags, "CANNOT_SPOT_GROUND", ...(armed ? ["REARM_AFTER_ATTACK"] : [])],
    stats: {
      healthModel: "HITS",
      maxHealth: policy.maximumHealth,
      armor: policy.armor,
      defense: 0,
      speed: policy.speed,
      sensors: sensorRange,
      capacity: 1,
    },
    weapons: armed ? [governedLightGun()] : [],
    requisitionCost: policy.requisitionCost,
    slots: { light: 1, internal: 1 },
    allowedOrders: [...policy.allowedOrders],
    allowedActions: [...policy.allowedActions],
    rulesetVersion: COMPANION_VTOL_TRANSPORT_RULESET,
    source: "Classes.html rows 24-26 plus owner-approved public-v1 companion conversion",
    status: "experimental",
    notes: "Supply Cargo is an opaque one-package alternative; its resource contents remain scenario-authored.",
  };
}

export interface CompanionVtolValidationResult {
  legal: boolean;
  reasons: string[];
}

export function validateCompanionVtolIdentity(
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags" | "weapons" | "cargoProfile">,
): CompanionVtolValidationResult {
  if (!isCompanionVtolTransport(deployment)) {
    return { legal: false, reasons: ["Unit is not an approved public-v1 companion VTOL transport."] };
  }
  const policy = getCompanionClassPolicyV1(deployment.definitionId);
  const reasons: string[] = [];
  if (
    deployment.stats.healthModel !== "HITS" ||
    deployment.stats.maxHealth !== policy.maximumHealth ||
    deployment.stats.armor !== policy.armor ||
    deployment.stats.speed !== policy.speed
  ) reasons.push("Companion VTOL chassis does not match approved public-v1 Hits, Armor, or Speed authority.");
  const tags = new Set(deployment.tags ?? []);
  for (const tag of ["AEROSPACE", "VTOL", "VEHICLE", "TRANSPORT", "CANNOT_SPOT_GROUND"]) {
    if (!tags.has(tag)) reasons.push(`Companion VTOL is missing governed ${tag} identity.`);
  }
  const expectedProfile = cargoProfiles[deployment.definitionId];
  if (deployment.cargoProfile?.id !== expectedProfile.id) {
    reasons.push("Companion VTOL is missing its exact governed cargo profile.");
  }
  if (deployment.definitionId === HEAVY_LIFT_ID) {
    if (deployment.weapons.length !== 0) reasons.push("VTOL Heavy Lift has no governed base weapon.");
  } else {
    const gun = deployment.weapons.find((weapon) => weapon.id === "weapon-vtol-light-gun-public-v1");
    if (
      deployment.weapons.length !== 1 ||
      !gun ||
      gun.damage.count !== 1 ||
      gun.damage.sides !== 2 ||
      gun.range !== 1 ||
      gun.armorPiercing !== 0 ||
      gun.ammoCapacity !== 1
    ) reasons.push("Armed companion VTOL must use its one-shot governed D2 light gun.");
  }
  return { legal: reasons.length === 0, reasons };
}

function hasAll(tags: readonly string[], required: readonly string[]): boolean {
  const set = new Set(tags);
  return required.every((tag) => set.has(tag));
}

function isOpaqueSupplyCargo(item: CargoManifestItem): boolean {
  return item.kind === "SUPPLY" && item.tags.includes(COMPANION_VTOL_SUPPLY_CARGO_TAG);
}

function isObjectiveCargo(item: CargoManifestItem): boolean {
  return item.kind === "OTHER" && item.tags.includes(COMPANION_VTOL_OBJECTIVE_CARGO_TAG);
}

function isPersonnelUnit(item: CargoManifestItem): boolean {
  return item.kind === "PERSONNEL" && hasAll(item.tags, ["INFANTRY", "PERSONNEL", COMPANION_VTOL_UNIT_CARGO_TAG]);
}

function isLightVehicleUnit(item: CargoManifestItem): boolean {
  return item.kind === "VEHICLE" && hasAll(item.tags, ["VEHICLE", "LIGHT_VEHICLE", COMPANION_VTOL_UNIT_CARGO_TAG]);
}

export interface CompanionVtolManifestValidation extends CompanionVtolValidationResult {
  slotsUsedQuarters: number;
}

/**
 * Companion source capacity counts whole units/cargo packages, not V5 FS.
 * Therefore every manifest row is quantity 1 and per-unit health persists on
 * the referenced deployment instead of being duplicated as cargo quantity.
 */
export function validateCompanionVtolManifest(
  definitionId: CompanionVtolTransportDefinitionId,
  manifest: readonly CargoManifestItem[],
): CompanionVtolManifestValidation {
  const profile = cargoProfiles[definitionId];
  const generic = validateCargoManifest(profile, manifest);
  const reasons = [...generic.reasons];
  for (const item of manifest) {
    if (item.quantity !== 1) reasons.push(`${item.id}: companion VTOL cargo rows represent exactly one unit or package.`);
    if ((isPersonnelUnit(item) || isLightVehicleUnit(item) || item.kind === "VEHICLE") && !item.unitId) {
      reasons.push(`${item.id}: transported units require a deployment identifier.`);
    }
  }

  if (definitionId === TROOP_AIRLIFT_ID) {
    const personnel = manifest.filter(isPersonnelUnit);
    const supply = manifest.filter(isOpaqueSupplyCargo);
    if (personnel.length > 2) reasons.push("Troop Airlift carries at most two Infantry units.");
    if (supply.length > 1) reasons.push("Troop Airlift carries at most one opaque Supply Cargo package.");
    if (personnel.length > 0 && supply.length > 0) reasons.push("Troop Airlift uses Infantry or Supply Cargo capacity, never both.");
  } else if (definitionId === MULTIPURPOSE_AIRLIFT_ID) {
    const personnelOrSupply = manifest.filter((item) => isPersonnelUnit(item) || isOpaqueSupplyCargo(item));
    const lightVehicles = manifest.filter(isLightVehicleUnit);
    if (personnelOrSupply.length > 1) {
      reasons.push("Multi-Purpose Airlift carries at most one Infantry unit or one opaque Supply Cargo package.");
    }
    if (lightVehicles.length > 1) reasons.push("Multi-Purpose Airlift carries at most one Light Vehicle unit.");
  } else {
    if (manifest.length > 1) reasons.push("Heavy Lift carries exactly one external load at a time.");
    for (const item of manifest) {
      if (!item.tags.includes(COMPANION_VTOL_EXTERNAL_LOAD_TAG)) {
        reasons.push(`${item.id}: Heavy Lift cargo must be recorded as an external load.`);
      }
      if (!(item.kind === "VEHICLE" || isObjectiveCargo(item) || isOpaqueSupplyCargo(item))) {
        reasons.push(`${item.id}: Heavy Lift accepts only a governed heavy unit, objective, or Supply Cargo package.`);
      }
    }
  }
  return { legal: reasons.length === 0, reasons, slotsUsedQuarters: generic.slotsUsedQuarters };
}

function isHeavyLiftUnit(definitionId: string, tags: readonly string[]): boolean {
  return tags.includes("MECH") || definitionId === "unit-heavy-battle-tank" || definitionId === "unit-super-heavy-tank";
}

export interface CompanionVtolCargoItemResult extends CompanionVtolValidationResult {
  item?: CargoManifestItem;
}

/** Builds the server-owned cargo row; mutable client marker tags are ignored. */
export function makeCompanionVtolCargoItem(input: {
  campaignId: string;
  carrierDefinitionId: CompanionVtolTransportDefinitionId;
  cargo: Pick<CampaignDeployment, "id" | "definitionId" | "tags">;
}): CompanionVtolCargoItemResult {
  const baseTags = [...new Set(input.cargo.tags ?? [])];
  const tagSet = new Set(baseTags);
  const passiveSupply = tagSet.has(COMPANION_VTOL_SUPPLY_CARGO_TAG);
  const objectiveCargo = tagSet.has(COMPANION_VTOL_OBJECTIVE_CARGO_TAG);
  const personnel = tagSet.has("INFANTRY") && tagSet.has("PERSONNEL") && !tagSet.has("VEHICLE");
  const lightVehicle = tagSet.has("VEHICLE") && tagSet.has("LIGHT_VEHICLE") &&
    !tagSet.has("MECH") && !tagSet.has("HEAVY") && !tagSet.has("SUPER_HEAVY");
  const heavyUnit = isHeavyLiftUnit(input.cargo.definitionId, baseTags);
  const legal = input.carrierDefinitionId === TROOP_AIRLIFT_ID
    ? personnel || passiveSupply
    : input.carrierDefinitionId === MULTIPURPOSE_AIRLIFT_ID
      ? personnel || passiveSupply || lightVehicle
      : heavyUnit || passiveSupply || objectiveCargo;
  if (!legal) {
    return {
      legal: false,
      reasons: [`${input.cargo.definitionId} is not eligible cargo for ${input.carrierDefinitionId}.`],
    };
  }

  const tags = [...baseTags];
  if (!passiveSupply && !objectiveCargo) tags.push(COMPANION_VTOL_UNIT_CARGO_TAG);
  if (input.carrierDefinitionId === HEAVY_LIFT_ID) tags.push(COMPANION_VTOL_EXTERNAL_LOAD_TAG);
  const item: CargoManifestItem = {
    id: `campaign-cargo:${input.campaignId}:${input.cargo.id}`,
    kind: passiveSupply ? "SUPPLY" : objectiveCargo ? "OTHER" : personnel ? "PERSONNEL" : "VEHICLE",
    quantity: 1,
    tags: [...new Set(tags)],
    transportMode: "EMBARKED",
    unitId: input.cargo.id,
  };
  const validation = validateCompanionVtolManifest(input.carrierDefinitionId, [item]);
  return validation.legal ? { legal: true, reasons: [], item } : { legal: false, reasons: validation.reasons };
}

export function companionVtolNormalCargoOperationAllowed(
  carrier: Pick<CampaignDeployment, "definitionId" | "statuses">,
): CompanionVtolValidationResult {
  if (!isCompanionVtolTransport(carrier)) {
    return { legal: false, reasons: ["Cargo operation requires a companion VTOL transport."] };
  }
  return carrier.statuses.includes("LANDED")
    ? { legal: true, reasons: [] }
    : { legal: false, reasons: ["Companion VTOL normal loading and unloading requires the carrier to be landed."] };
}

function sameCoord(left: AxialCoord, right: AxialCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

export interface CompanionVtolRappelResult extends CompanionVtolValidationResult {
  manifest: CargoManifestItem[];
  passengerStatuses: string[];
  targetHex?: AxialCoord;
  passengerActionRequired: false;
  carrierMustLand: false;
}

/**
 * Rappelling is the Troop Airlift's UNLOAD mode: the carrier pays its normal
 * Standard Action, the passenger submits no action, and the authored building
 * must lie on the resolved flight path.
 */
export function resolveCompanionVtolRappel(input: {
  carrier: Pick<CampaignDeployment, "definitionId" | "statuses" | "cargo">;
  passenger: Pick<CampaignDeployment, "id" | "tags" | "locationState" | "statuses">;
  flightPath: readonly AxialCoord[];
  destination: BattlefieldHex | undefined;
  canOccupyDestination: boolean;
}): CompanionVtolRappelResult {
  const manifest = (input.carrier.cargo ?? []).map((item) => structuredClone(item));
  const reasons: string[] = [];
  if (input.carrier.definitionId !== TROOP_AIRLIFT_ID) reasons.push("Only VTOL Heavy Troop Airlift has governed rappelling gear.");
  if (input.carrier.statuses.includes("LANDED")) reasons.push("Rappelling requires the Troop Airlift to remain airborne.");
  const item = manifest.find((candidate) => candidate.unitId === input.passenger.id);
  if (!item || !isPersonnelUnit(item)) reasons.push("Rappelling passenger must be manifested Infantry cargo.");
  const passengerTags = new Set(input.passenger.tags ?? []);
  if (!passengerTags.has("INFANTRY") || !passengerTags.has("PERSONNEL") || passengerTags.has("VEHICLE")) {
    reasons.push("Rappelling passenger must be an Infantry personnel unit.");
  }
  if (input.passenger.locationState !== "EMBARKED") reasons.push("Rappelling passenger is not embarked.");
  if (!input.destination || !isInfantryGarrisonBuilding(input.destination)) {
    reasons.push("Rappelling destination must be an authored Infantry garrison building.");
  } else if (!input.flightPath.some((coord) => sameCoord(coord, input.destination!.coord))) {
    reasons.push("Rappelling destination must lie on the Troop Airlift's resolved flight path.");
  }
  if (!input.canOccupyDestination) reasons.push("Rappelling destination has no room for the Infantry unit.");
  if (reasons.length > 0) {
    return {
      legal: false,
      reasons,
      manifest,
      passengerStatuses: [...input.passenger.statuses],
      passengerActionRequired: false,
      carrierMustLand: false,
    };
  }
  return {
    legal: true,
    reasons: [],
    manifest: manifest.filter((candidate) => candidate.id !== item!.id),
    passengerStatuses: [...new Set([...input.passenger.statuses, "GARRISONED"])],
    targetHex: { ...input.destination!.coord },
    passengerActionRequired: false,
    carrierMustLand: false,
  };
}

export const COMPANION_VTOL_CARRIER_LOSS_POLICY = Object.freeze({
  conflictId: "RC-V5-030",
  disposition: "FREEZE_FOR_GM_ADJUDICATION",
  automaticPassengerDamage: false,
  automaticCargoDeployment: false,
} as const);

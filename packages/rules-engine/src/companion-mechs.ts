import type {
  BattlefieldHex,
  CampaignDeployment,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";

export const COMPANION_V1_MECH_RULESET = "companion-v1-mechs@1" as const;

export const COMPANION_V1_MECH_WEAPONS: readonly WeaponProfile[] = Object.freeze([
  { id: "weapon-mech-heavy-machine-public-v1", name: "Heavy Machine Weapon", damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0, tags: ["DIRECT", "MECH_WEAPON", "BURST_FIRE"], ammoCapacity: 4 },
  { id: "weapon-mech-autocannon-public-v1", name: "Mech Autocannon", damage: { count: 1, sides: 6 }, range: 2, armorPiercing: 2, tags: ["DIRECT", "MECH_WEAPON", "AUTOCANNON"], ammoCapacity: 2 },
  { id: "weapon-mech-light-laser-public-v1", name: "Light Laser", damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0, tags: ["DIRECT", "MECH_WEAPON", "ENERGY", "COOLING_3"], ammoCapacity: 3 },
  { id: "weapon-mech-medium-laser-public-v1", name: "Medium Laser", damage: { count: 1, sides: 6 }, range: 2, armorPiercing: 0, tags: ["DIRECT", "MECH_WEAPON", "ENERGY", "COOLING_2"], ammoCapacity: 2 },
  { id: "weapon-mech-large-laser-public-v1", name: "Large Laser", damage: { count: 1, sides: 8 }, range: 3, armorPiercing: 0, tags: ["DIRECT", "MECH_WEAPON", "ENERGY", "COOLING_1"], ammoCapacity: 1 },
] satisfies readonly WeaponProfile[]);

const companionMechWeaponById = new Map(COMPANION_V1_MECH_WEAPONS.map((weapon) => [weapon.id, weapon]));

export function getCompanionMechWeaponProfile(weaponId: string): WeaponProfile {
  const weapon = companionMechWeaponById.get(weaponId);
  if (!weapon) throw new Error(`Unknown public-v1 mech weapon: ${weaponId}`);
  return cloneFittedMechWeapon(weapon);
}

export type CompanionMechDefinitionId = "unit-medium-mech" | "unit-heavy-mech";

export interface CompanionMechProfile {
  definitionId: CompanionMechDefinitionId;
  name: string;
  hits: number;
  armor: number;
  speed: number;
  externalSlots: number;
  internalSlots: number;
  requisitionCost: number;
  mayCrouch: boolean;
}

export const COMPANION_V1_MECH_PROFILES: Readonly<Record<CompanionMechDefinitionId, CompanionMechProfile>> =
  Object.freeze({
    "unit-medium-mech": Object.freeze({
      definitionId: "unit-medium-mech",
      name: "Medium Mech",
      hits: 4,
      armor: 2,
      speed: 3,
      externalSlots: 2,
      internalSlots: 4,
      requisitionCost: 14,
      mayCrouch: true,
    }),
    "unit-heavy-mech": Object.freeze({
      definitionId: "unit-heavy-mech",
      name: "Heavy Mech",
      hits: 5,
      armor: 3,
      speed: 2,
      externalSlots: 3,
      internalSlots: 4,
      requisitionCost: 18,
      mayCrouch: false,
    }),
  });

export function isCompanionMech<T extends { definitionId: string }>(
  deployment: T,
): deployment is T & { definitionId: CompanionMechDefinitionId } {
  return deployment.definitionId === "unit-medium-mech" || deployment.definitionId === "unit-heavy-mech";
}

export function getCompanionMechV1Class(
  definitionId: CompanionMechDefinitionId,
  sensorRange = 0,
): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error("Companion mech sensor range must be scenario-defined as a non-negative integer.");
  }
  const profile = COMPANION_V1_MECH_PROFILES[definitionId];
  return {
    id: definitionId,
    kind: "unit-class",
    name: profile.name,
    description: `${profile.name} companion-v1 conversion with fitted weapons only.`,
    category: "MECH",
    tags: [
      "GROUND",
      "VEHICLE",
      "ARMOURED",
      "MECH",
      "MECH_LEG_HEIGHT_1",
      ...(profile.mayCrouch ? ["CROUCH_CAPABLE"] : []),
    ],
    stats: {
      healthModel: "HITS",
      maxHealth: profile.hits,
      armor: profile.armor,
      defense: 0,
      speed: profile.speed,
      sensors: sensorRange,
      capacity: 1,
    },
    weapons: [],
    requisitionCost: profile.requisitionCost,
    slots: { external: profile.externalSlots, internal: profile.internalSlots },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    // DIG_IN is the existing stationary command envelope for the distinct
    // Medium-Mech crouch transition until generated companion action authority lands.
    // Paired LOAD/UNLOAD is the passenger consent envelope for approved
    // carriers such as Heavy Lift; it does not give the mech cargo capacity.
    allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD", ...(profile.mayCrouch ? ["DIG_IN" as const] : [])],
    rulesetVersion: COMPANION_V1_MECH_RULESET,
    source: "Classes.html rows 31-32 + approved companion-v1 conversion",
    status: "active",
    notes: "No default weapon; every attack comes from fitted public-v1 mech equipment.",
  };
}

export interface MechValidationResult {
  legal: boolean;
  reasons: string[];
}

export function validateCompanionMechChassis(
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags">,
): MechValidationResult {
  if (!isCompanionMech(deployment)) {
    return { legal: false, reasons: ["Unit is not an approved companion-v1 Medium or Heavy Mech."] };
  }
  const profile = COMPANION_V1_MECH_PROFILES[deployment.definitionId];
  const reasons: string[] = [];
  if (deployment.stats.healthModel !== "HITS" || deployment.stats.maxHealth !== profile.hits) {
    reasons.push(`${profile.name} must use the approved ${profile.hits}-Hit conversion.`);
  }
  if (deployment.stats.armor !== profile.armor || deployment.stats.speed !== profile.speed) {
    reasons.push(`${profile.name} Armor or Speed does not match companion-v1 authority.`);
  }
  const tags = new Set(deployment.tags ?? []);
  if (!tags.has("MECH") || !tags.has("MECH_LEG_HEIGHT_1")) {
    reasons.push(`${profile.name} is missing governed mech/leg-height identity.`);
  }
  return { legal: reasons.length === 0, reasons };
}

export interface MechAttackActivationResult extends MechValidationResult {
  weaponIds: string[];
}

/**
 * One Primary attack activation may fire one fitted weapon or any larger
 * fitted subset, including every fitted weapon. Omitted selection means all.
 */
export function validateMechAttackActivation(input: {
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags" | "weapons">;
  economy: "STANDARD" | "PRIMARY" | "INCIDENTAL";
  declaredWeaponIds?: readonly string[];
}): MechAttackActivationResult {
  const chassis = validateCompanionMechChassis(input.deployment);
  const fittedIds = input.deployment.weapons.map((weapon) => weapon.id).sort((left, right) => left.localeCompare(right));
  const selected = input.declaredWeaponIds === undefined ? fittedIds : [...input.declaredWeaponIds];
  const reasons = [...chassis.reasons];
  if (input.economy !== "PRIMARY") reasons.push("Companion mech weapons fire through one Primary activation.");
  if (fittedIds.length === 0) reasons.push("The mech has no fitted weapon to fire.");
  if (selected.length === 0) reasons.push("At least one fitted mech weapon must be selected.");
  if (new Set(selected).size !== selected.length) reasons.push("A fitted mech weapon may fire at most once per activation.");
  const fitted = new Set(fittedIds);
  if (selected.some((weaponId) => !fitted.has(weaponId))) {
    reasons.push("The mech attack selected a weapon that is not fitted.");
  }
  return {
    legal: reasons.length === 0,
    reasons,
    weaponIds: [...new Set(selected)].sort((left, right) => left.localeCompare(right)),
  };
}

export interface MechReloadResult extends MechValidationResult {
  ammunitionBefore: number;
  ammunitionAfter: number;
}

export function reloadMechWeaponAtSupplyPoint(input: {
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags" | "weapons" | "ammunition">;
  weaponId: string | undefined;
  atFriendlyGovernedSupplyPoint: boolean;
}): MechReloadResult {
  const chassis = validateCompanionMechChassis(input.deployment);
  const weapon = input.deployment.weapons.find((candidate) => candidate.id === input.weaponId);
  const before = weapon ? input.deployment.ammunition[weapon.id] ?? 0 : 0;
  const reasons = [...chassis.reasons];
  if (!input.atFriendlyGovernedSupplyPoint) reasons.push("Mech reload requires a friendly governed Supply Point.");
  if (!weapon) reasons.push("Reload weapon is not fitted.");
  if (weapon && (weapon.ammoCapacity === undefined || !Number.isSafeInteger(weapon.ammoCapacity) || weapon.ammoCapacity <= 0)) {
    reasons.push("Selected mech weapon has no finite ammunition capacity.");
  } else if (weapon && before >= weapon.ammoCapacity!) {
    reasons.push("Weapon ammunition is already full.");
  } else if (weapon && (!Number.isSafeInteger(before) || before < 0)) {
    reasons.push("Current mech ammunition is invalid.");
  }
  return {
    legal: reasons.length === 0,
    reasons,
    ammunitionBefore: before,
    ammunitionAfter: reasons.length === 0 ? weapon!.ammoCapacity! : before,
  };
}

export function mechSightHeightBonus(
  deployment: Pick<CampaignDeployment, "definitionId" | "tags">,
): 0 | 1 {
  return isCompanionMech(deployment) && new Set(deployment.tags ?? []).has("MECH_LEG_HEIGHT_1") ? 1 : 0;
}

export interface MechCrouchResult extends MechValidationResult {
  status: "CROUCHED" | null;
}

export function resolveMechCrouch(
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags" | "statuses">,
  stationary: boolean,
): MechCrouchResult {
  const chassis = validateCompanionMechChassis(deployment);
  const reasons = [...chassis.reasons];
  if (deployment.definitionId !== "unit-medium-mech") reasons.push("Only the Medium Mech may crouch.");
  if (!stationary) reasons.push("The Medium Mech must remain stationary to crouch.");
  if (deployment.statuses.includes("CROUCHED")) reasons.push("The Medium Mech is already crouched.");
  return { legal: reasons.length === 0, reasons, status: reasons.length === 0 ? "CROUCHED" : null };
}

/** Non-stacking +1 Armor only for direct fire while occupying blocking level-1 terrain. */
export function resolveMechCrouchCover(
  target: Pick<CampaignDeployment, "definitionId" | "statuses" | "position">,
  hexes: readonly BattlefieldHex[],
  directFire: boolean,
): { armor: 0 | 1; sources: string[] } {
  if (target.definitionId !== "unit-medium-mech" || !target.statuses.includes("CROUCHED") || !directFire) {
    return { armor: 0, sources: [] };
  }
  const terrain = hexes.find((hex) => hex.coord.q === target.position.q && hex.coord.r === target.position.r);
  if (!terrain || terrain.elevation !== 1 || !terrain.blocksLineOfSight) return { armor: 0, sources: [] };
  return { armor: 1, sources: [`MECH_CROUCH:${terrain.terrainId}`] };
}

export function cloneFittedMechWeapon(weapon: WeaponProfile): WeaponProfile {
  return { ...weapon, damage: { ...weapon.damage }, tags: [...weapon.tags] };
}

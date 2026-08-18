import type { CampaignDeployment, UnitClassDefinition, WeaponProfile } from "../../domain/src";

export const POWER_ARMOURED_INFANTRY_PROFILE = Object.freeze({
  maximumForceStrength: 3,
  healthModel: "FORCE_STRENGTH" as const,
  armor: 2,
  speedQuarters: 4,
  range: 1,
  primaryEquipmentSlots: 2,
  mechWeaponSlots: 1,
});

export const POWER_ARMOURED_INFANTRY_PUBLIC_V1 = Object.freeze({
  rulesProfileId: "public-v1-power-armoured-infantry@1",
  unitRequisitionCost: 10,
  backWeaponEquipmentId: "equipment-power-armour-back-light-laser-public-v1",
  backWeaponRequisitionCost: 1,
  backWeaponUnlockCompletedMissions: 1,
  backWeaponId: "weapon-power-armour-back-light-laser-public-v1",
  backWeaponShotsBeforeCooling: 3,
  backWeaponCoolingRounds: 1,
  orbitalDropRequiredCapability: "HEAVY_DROP_POD",
  orbitalDropActionDelayRounds: 1,
  ballisticShieldsEquipmentId: "equipment-ballistic-shields",
  magneticClampsEquipmentId: "equipment-mech-magnetic-clamps",
});

export const POWER_ARMOURED_INFANTRY_BACK_WEAPON = Object.freeze({
  id: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId,
  name: "Power Armour Back-mounted Light Laser",
  damage: Object.freeze({ count: 1, sides: 4 }),
  range: 1,
  armorPiercing: 0,
  ammoCapacity: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponShotsBeforeCooling,
  tags: Object.freeze(["POWER_ARMOUR_BACK_MOUNT", "ENERGY"]),
});

export const POWER_ARMOURED_INFANTRY_BASE_WEAPON = Object.freeze({
  id: "weapon-infantry-rifle",
  name: "Infantry Rifle",
  damage: Object.freeze({ count: 1, sides: 6 }),
  range: 1,
  armorPiercing: 0,
  tags: Object.freeze([] as string[]),
});

/** Standalone executable projection for the separately versioned companion profile. */
export function getPowerArmouredInfantryPublicV1Class(
  sensorRange = 0,
): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error("Power Armour sensor range must be scenario-defined as a non-negative integer.");
  }
  return {
    id: "unit-power-armoured-infantry",
    kind: "unit-class",
    name: "Power Armoured Infantry",
    description: "Elite armoured personnel with an unlockable back-mounted Light Laser and Heavy Drop Pod insertion.",
    category: "INFANTRY",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "ARMOURED", "POWER_ARMOUR"],
    stats: {
      healthModel: POWER_ARMOURED_INFANTRY_PROFILE.healthModel,
      maxHealth: POWER_ARMOURED_INFANTRY_PROFILE.maximumForceStrength,
      armor: POWER_ARMOURED_INFANTRY_PROFILE.armor,
      defense: 0,
      speed: POWER_ARMOURED_INFANTRY_PROFILE.speedQuarters / 4,
      sensors: sensorRange,
      capacity: 1,
    },
    weapons: [powerArmourWeaponClone(POWER_ARMOURED_INFANTRY_BASE_WEAPON)],
    requisitionCost: POWER_ARMOURED_INFANTRY_PUBLIC_V1.unitRequisitionCost,
    slots: { primary: 2, mech_weapon: 1 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "DIG_IN", "SHIELD_WALL", "MOUNT_MAGNETIC_CLAMPS", "DISMOUNT_MAGNETIC_CLAMPS"],
    rulesetVersion: POWER_ARMOURED_INFANTRY_PUBLIC_V1.rulesProfileId,
    source: "Classes.html Power Armored Infantry + public-v1 companion application policy",
    status: "experimental",
    notes: "Hold Line is V5 Dig In only; legacy battleline is not restored.",
  };
}

function powerArmourWeaponClone(
  weapon: typeof POWER_ARMOURED_INFANTRY_BASE_WEAPON | typeof POWER_ARMOURED_INFANTRY_BACK_WEAPON,
): WeaponProfile {
  return {
    ...weapon,
    damage: { ...weapon.damage },
    tags: [...weapon.tags],
  };
}

export function powerArmourFittedWeapons(backWeaponInstalled: boolean): WeaponProfile[] {
  return [
    powerArmourWeaponClone(POWER_ARMOURED_INFANTRY_BASE_WEAPON),
    ...(backWeaponInstalled ? [powerArmourWeaponClone(POWER_ARMOURED_INFANTRY_BACK_WEAPON)] : []),
  ];
}

export interface PowerArmourPurchaseResult {
  legal: boolean;
  reason?: string;
  requisitionBefore: number;
  requisitionAfter: number;
  requisitionSpent: number;
}

/** Public-v1 economy hook: Power Armour occupies the 10 Req elite-personnel tier. */
export function purchasePowerArmouredInfantry(availableRequisition: number): PowerArmourPurchaseResult {
  const before = availableRequisition;
  if (!Number.isSafeInteger(before) || before < 0) {
    return { legal: false, reason: "Available Requisition is invalid.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  }
  const cost = POWER_ARMOURED_INFANTRY_PUBLIC_V1.unitRequisitionCost;
  if (before < cost) {
    return { legal: false, reason: "Insufficient Requisition for Power Armoured Infantry.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  }
  return { legal: true, requisitionBefore: before, requisitionAfter: before - cost, requisitionSpent: cost };
}

export interface PowerArmourBackWeaponInstallInput {
  availableRequisition: number;
  completedMissions: number;
  mechWeaponSlotOccupied: boolean;
}

export interface PowerArmourBackWeaponInstallResult extends PowerArmourPurchaseResult {
  equipmentId?: string;
  weapon?: typeof POWER_ARMOURED_INFANTRY_BACK_WEAPON;
  initialHeatCapacity?: number;
}

/**
 * Public-v1 makes the prose's future back mount available after one completed
 * mission and normalizes it to the V5 Light Mech's D4 laser attack profile.
 */
export function installPowerArmourBackWeapon(
  input: PowerArmourBackWeaponInstallInput,
): PowerArmourBackWeaponInstallResult {
  const before = input.availableRequisition;
  const reject = (reason: string): PowerArmourBackWeaponInstallResult => ({
    legal: false,
    reason,
    requisitionBefore: before,
    requisitionAfter: before,
    requisitionSpent: 0,
  });
  if (!Number.isSafeInteger(before) || before < 0) return reject("Available Requisition is invalid.");
  if (!Number.isSafeInteger(input.completedMissions) || input.completedMissions < 0) {
    return reject("Completed mission count is invalid.");
  }
  if (input.completedMissions < POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponUnlockCompletedMissions) {
    return reject("The back-mounted mech weapon unlocks after one completed mission.");
  }
  if (input.mechWeaponSlotOccupied) return reject("The Power Armour mech-weapon slot is already occupied.");
  const cost = POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponRequisitionCost;
  if (before < cost) return reject("Insufficient Requisition for the back-mounted Light Laser.");
  return {
    legal: true,
    requisitionBefore: before,
    requisitionAfter: before - cost,
    requisitionSpent: cost,
    equipmentId: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponEquipmentId,
    weapon: POWER_ARMOURED_INFANTRY_BACK_WEAPON,
    initialHeatCapacity: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponShotsBeforeCooling,
  };
}

export interface PowerArmourBackWeaponCycleResult {
  ammunitionAfter: number;
  cooldownAfter?: number;
  coolingTriggered: boolean;
}

/**
 * The ammunition field is a persisted heat-capacity counter, not physical
 * ammunition. A two-tick engine cooldown blocks exactly the next round.
 */
export function resolvePowerArmourBackWeaponCycle(
  ammunitionAfterShot: number,
): PowerArmourBackWeaponCycleResult {
  const capacity = POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponShotsBeforeCooling;
  if (!Number.isSafeInteger(ammunitionAfterShot) || ammunitionAfterShot < 0 || ammunitionAfterShot >= capacity) {
    throw new Error("Power Armour back-weapon heat state is invalid.");
  }
  if (ammunitionAfterShot > 0) {
    return { ammunitionAfter: ammunitionAfterShot, coolingTriggered: false };
  }
  return {
    ammunitionAfter: capacity,
    cooldownAfter: POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponCoolingRounds + 1,
    coolingTriggered: true,
  };
}

export function isPowerArmourBackWeaponId(weaponId: string | undefined): boolean {
  return weaponId === POWER_ARMOURED_INFANTRY_PUBLIC_V1.backWeaponId;
}

export type MechWeightClass = "LIGHT" | "MEDIUM" | "HEAVY" | "NOT_A_MECH";

export interface MagneticClampRideInput {
  riderIsPowerArmouredInfantry: boolean;
  carrierIsFriendly: boolean;
  carrierWeightClass: MechWeightClass;
  magneticClampsEquipped: boolean;
}

export interface PowerArmourRuleValidation {
  legal: boolean;
  reasons: string[];
}

/**
 * Validates only the Store's Magnetic Clamps eligibility sentence. Embark and
 * disembark costs, capacity, damage transfer, and destruction outcomes are not
 * defined by that source and therefore remain outside this helper.
 */
export function validateMagneticClampRide(
  input: MagneticClampRideInput,
): PowerArmourRuleValidation {
  const reasons: string[] = [];
  if (!input.riderIsPowerArmouredInfantry) {
    reasons.push("Magnetic Clamps carry Power Armoured Infantry only.");
  }
  if (!input.carrierIsFriendly) {
    reasons.push("Magnetic Clamps require a friendly carrier.");
  }
  if (input.carrierWeightClass !== "MEDIUM" && input.carrierWeightClass !== "HEAVY") {
    reasons.push("Magnetic Clamps require a Medium or larger mech.");
  }
  if (!input.magneticClampsEquipped) {
    reasons.push("The Magnetic Clamps equipment is required.");
  }
  return { legal: reasons.length === 0, reasons };
}

export type PowerArmourDeploymentMode = "GROUND" | "ORBITAL_DROP";

export interface PowerArmourDeploymentInput {
  mode: PowerArmourDeploymentMode;
  carrierCapabilities: readonly string[];
}

/**
 * The class may deploy normally or by orbital drop. The Store explicitly
 * identifies the Heavy Drop Pod Launch Bay as the carrier able to land Power
 * Armour, so orbital deployment fails closed without that capability.
 */
export function validatePowerArmourDeployment(
  input: PowerArmourDeploymentInput,
): PowerArmourRuleValidation {
  if (input.mode === "GROUND") return { legal: true, reasons: [] };
  return input.carrierCapabilities.includes("HEAVY_DROP_POD")
    ? { legal: true, reasons: [] }
    : {
      legal: false,
      reasons: ["Power Armour orbital deployment requires a Heavy Drop Pod Launch Bay."],
    };
}

export interface PowerArmourOrbitalDropInput {
  carrierCapabilities: readonly string[];
  insertionRound: number;
  destinationExists: boolean;
  destinationKnown: boolean;
  destinationOpen: boolean;
  destinationCapacityAvailable: boolean;
}

export interface PowerArmourOrbitalDropResult extends PowerArmourRuleValidation {
  maySubmitOrdersFromRound?: number;
}

/** A safe pre-round deployment with no invented scatter or damage table. */
export function resolvePowerArmourOrbitalDrop(
  input: PowerArmourOrbitalDropInput,
): PowerArmourOrbitalDropResult {
  const reasons: string[] = [];
  if (!Number.isSafeInteger(input.insertionRound) || input.insertionRound < 1) reasons.push("Orbital insertion round is invalid.");
  if (!input.carrierCapabilities.includes(POWER_ARMOURED_INFANTRY_PUBLIC_V1.orbitalDropRequiredCapability)) {
    reasons.push("Power Armour orbital deployment requires a Heavy Drop Pod Launch Bay.");
  }
  if (!input.destinationExists) reasons.push("Orbital drop destination does not exist.");
  if (!input.destinationKnown) reasons.push("Orbital drop destination must be known to the allied force.");
  if (!input.destinationOpen) reasons.push("Orbital drop destination must be clear open ground.");
  if (!input.destinationCapacityAvailable) reasons.push("Orbital drop destination has no available capacity.");
  return reasons.length > 0
    ? { legal: false, reasons }
    : {
      legal: true,
      reasons: [],
      maySubmitOrdersFromRound: input.insertionRound + POWER_ARMOURED_INFANTRY_PUBLIC_V1.orbitalDropActionDelayRounds,
    };
}

export interface BallisticShieldWallInput {
  ballisticShieldsEquipped: boolean;
  shieldWallActive: boolean;
  movedSinceActivation: boolean;
  incomingAttackIsDirect: boolean;
  otherCoverArmor: 0 | 1;
}

export interface BallisticShieldWallResult {
  shieldWallRemainsActive: boolean;
  shieldWallArmor: 0 | 1;
  effectiveCoverArmor: 0 | 1;
}

/**
 * Resolves the source-defined effect of an already accepted Shield Wall
 * action. It does not authorize the action: the Store does not state its V5
 * Speed/Primary-Action cost. Shield Wall is a non-stacking Cover Armor source.
 */
export function resolveBallisticShieldWall(
  input: BallisticShieldWallInput,
): BallisticShieldWallResult {
  const shieldWallRemainsActive = input.ballisticShieldsEquipped &&
    input.shieldWallActive &&
    !input.movedSinceActivation;
  const shieldWallArmor = shieldWallRemainsActive && input.incomingAttackIsDirect ? 1 : 0;
  return {
    shieldWallRemainsActive,
    shieldWallArmor,
    effectiveCoverArmor: Math.max(input.otherCoverArmor, shieldWallArmor) as 0 | 1,
  };
}

export function companionMechWeightClass(deployment: Pick<CampaignDeployment, "definitionId">): MechWeightClass {
  if (deployment.definitionId === "unit-medium-mech") return "MEDIUM";
  if (deployment.definitionId === "unit-heavy-mech") return "HEAVY";
  if (deployment.definitionId === "unit-light-mech") return "LIGHT";
  return "NOT_A_MECH";
}

export interface MagneticClampPairInput {
  rider: CampaignDeployment;
  carrier: CampaignDeployment;
  matchingPrimaryActions: boolean;
  carrierRiderIds: readonly string[];
}

/** Public-v1 lifecycle authority for the paired Primary mounting declaration. */
export function validateMagneticClampMount(input: MagneticClampPairInput): PowerArmourRuleValidation {
  const base = validateMagneticClampRide({
    riderIsPowerArmouredInfantry: input.rider.definitionId === "unit-power-armoured-infantry",
    carrierIsFriendly: input.rider.side === input.carrier.side,
    carrierWeightClass: companionMechWeightClass(input.carrier),
    magneticClampsEquipped: input.carrier.equipmentIds.includes(POWER_ARMOURED_INFANTRY_PUBLIC_V1.magneticClampsEquipmentId),
  });
  const reasons = [...base.reasons];
  if (!input.matchingPrimaryActions) reasons.push("Magnetic Clamp mounting requires matching Primary actions from rider and mech.");
  if (input.rider.position.q !== input.carrier.position.q || input.rider.position.r !== input.carrier.position.r) reasons.push("Magnetic Clamp rider and mech must be co-located.");
  if (input.rider.locationState === "EMBARKED") reasons.push("The Power Armour rider is already embarked.");
  if (input.carrierRiderIds.length >= 1) reasons.push("A mech may carry one Power Armour rider with Magnetic Clamps.");
  return { legal: reasons.length === 0, reasons };
}

export function validateMagneticClampDismount(
  rider: CampaignDeployment,
  carrier: CampaignDeployment,
  matchingStandardActions: boolean,
): PowerArmourRuleValidation {
  const reasons: string[] = [];
  if (rider.definitionId !== "unit-power-armoured-infantry" || rider.locationState !== "EMBARKED") reasons.push("Only an embarked Power Armour rider can dismount Magnetic Clamps.");
  if (!matchingStandardActions) reasons.push("Magnetic Clamp dismount requires matching Standard actions from rider and mech.");
  if (!(carrier.cargo ?? []).some((item) => item.unitId === rider.id && item.tags.includes("MAGNETIC_CLAMP_RIDER"))) reasons.push("The Power Armour unit is not mounted on that mech.");
  return { legal: reasons.length === 0, reasons };
}

export function powerArmourHatParadropAllowed(cargo: Pick<CampaignDeployment, "definitionId">): boolean {
  return cargo.definitionId !== "unit-power-armoured-infantry";
}

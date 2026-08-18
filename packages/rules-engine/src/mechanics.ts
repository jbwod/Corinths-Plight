import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  EquipmentDefinition,
  StructuredAction,
  SupplyInventory,
  TacticalSupplyResourceId,
  UnitClassDefinition,
  UnitStats,
  WeaponProfile,
} from "../../domain/src";
import { hasLineOfSight, hexDistance, isRearAttack } from "./hex";
import { isInfantryGarrisonBuilding, resolveTacticalCover } from "./cover";
import { mechSightHeightBonus } from "./companion-mechs";
import { irregularDamageOutputForTags } from "./irregular-progression";
import type { SeededRandom } from "./rng";

export interface AttackRoll {
  raw: number;
  modified: number;
  capped: number;
}

export interface AttackCalculation {
  legal: boolean;
  reason?: string;
  roll?: AttackRoll;
  rearAttack: boolean;
  targetArmor: number;
  coverArmor: 0 | 1;
  coverSources: string[];
  effectiveArmor: number;
  targetDefense: number;
  digInDefense: 0 | 2;
  threshold: number;
  penetrated: boolean;
  healthLoss: number;
  rapidFireMultiplier: 1 | 2;
  damageResult: number;
  highGroundModifier: 0 | 1;
  evasiveAttackModifier: 0 | -2;
  evasiveDefenseModifier: 0 | 3;
  crewRepairArmorExposed: boolean;
  armorPiercingBonus: number;
  ammoAfter?: number;
  cooldownAfter?: number;
}

export function hasDisabledSubsystem(
  deployment: Pick<CampaignDeployment, "subsystems">,
  subsystemId: "WEAPONS" | "MOBILITY",
): boolean {
  return deployment.subsystems?.some((subsystem) =>
    subsystem.subsystemId.toUpperCase() === subsystemId && subsystem.state === "DISABLED"
  ) === true;
}

export function validateSpeedBudget(
  stats: UnitStats,
  movementCost: number,
  actions: StructuredAction[],
): { legal: boolean; spent: number; available: number } {
  const invalidCost = actions.some(
    (action) => action.economy === "STANDARD" && (!Number.isFinite(action.speedCost) || action.speedCost < 0),
  );
  const actionCost = actions.reduce(
    (total, action) => total + (action.economy === "STANDARD" ? Math.max(0, action.speedCost) : 0),
    0,
  );
  const primaryActions = actions.filter((action) => action.economy === "PRIMARY").length;
  const spent = movementCost + actionCost;
  return {
    legal: !invalidCost && Number.isFinite(movementCost) && movementCost >= 0 && spent <= stats.speed && primaryActions <= 1,
    spent,
    available: stats.speed,
  };
}

export function canTarget(
  attacker: CampaignDeployment,
  target: CampaignDeployment,
  weapon: WeaponProfile,
  hexes: BattlefieldHex[],
  spotters: CampaignDeployment[] = [],
): { legal: boolean; reason?: string } {
  if (attacker.status === "DESTROYED") return { legal: false, reason: "Attacker is destroyed." };
  if (hasDisabledSubsystem(attacker, "WEAPONS")) {
    return { legal: false, reason: "The unit's weapon systems are disabled." };
  }
  if (target.status === "DESTROYED") return { legal: false, reason: "Target is destroyed." };
  if (target.definitionId === "unit-power-armoured-infantry" && target.locationState === "EMBARKED") {
    return { legal: false, reason: "Mounted Power Armoured Infantry cannot be independently targeted." };
  }
  if (attacker.side === target.side) return { legal: false, reason: "Friendly fire is not enabled." };
  if (hexDistance(attacker.position, target.position) > weapon.range) {
    return { legal: false, reason: "Target is outside weapon range." };
  }
  if (!weapon.indirect && !hasLineOfSight(attacker.position, target.position, hexes, weapon.range, {
    observerHeightBonus: mechSightHeightBonus(attacker),
  })) {
    return { legal: false, reason: "Line of sight is blocked." };
  }
  if (
    weapon.indirect &&
    !spotters.some(
      (spotter) =>
        spotter.side === attacker.side &&
        spotter.status !== "DESTROYED" &&
        spotter.status !== "WITHDRAWN" &&
        hasLineOfSight(spotter.position, target.position, hexes, spotter.stats.sensors, {
          observerHeightBonus: mechSightHeightBonus(spotter),
        }),
    )
  ) {
    return { legal: false, reason: "Indirect fire requires a friendly spotter with line of sight." };
  }
  const ammo = attacker.ammunition[weapon.id];
  if (weapon.ammoCapacity !== undefined && (ammo ?? 0) <= 0) {
    return { legal: false, reason: "Weapon has no ammunition." };
  }
  if ((attacker.cooldowns[weapon.id] ?? 0) > 0) {
    return { legal: false, reason: "Weapon is cooling down." };
  }
  return { legal: true };
}

export function resolveAttackRoll(
  attacker: CampaignDeployment,
  target: CampaignDeployment,
  weapon: WeaponProfile,
  hexes: BattlefieldHex[],
  random: SeededRandom,
  spotters: CampaignDeployment[] = [],
  modifiers: { attackerEvasive?: boolean; targetEvasive?: boolean; targetCrewRepairing?: boolean; armorPiercingBonus?: number } = {},
): AttackCalculation {
  const targetCheck = canTarget(attacker, target, weapon, hexes, spotters);
  const rearGeometry = isRearAttack(attacker.position, target.position, target.facing);
  const targetTags = new Set(target.tags ?? []);
  const groundTarget = !targetTags.has("AEROSPACE") && !targetTags.has("VTOL") && !targetTags.has("ORBITAL");
  const attackerTags = new Set(attacker.tags ?? []);
  const groundAttacker = !attackerTags.has("AEROSPACE") && !attackerTags.has("VTOL") && !attackerTags.has("ORBITAL");
  const attackerElevation = hexes.find((hex) => hex.coord.q === attacker.position.q && hex.coord.r === attacker.position.r)?.elevation;
  const targetElevation = hexes.find((hex) => hex.coord.q === target.position.q && hex.coord.r === target.position.r)?.elevation;
  const highGroundModifier: 0 | 1 = groundAttacker && groundTarget && attackerElevation !== undefined && targetElevation !== undefined && attackerElevation > targetElevation ? 1 : 0;
  const groundVehicleRear = rearGeometry && groundTarget && targetTags.has("VEHICLE");
  const groundInfantryRear = rearGeometry && groundTarget && (targetTags.has("INFANTRY") || targetTags.has("PERSONNEL"));
  const rearAttack = groundVehicleRear || groundInfantryRear;
  const targetHex = hexes.find((hex) => hex.coord.q === target.position.q && hex.coord.r === target.position.r);
  const rearIgnoresDigIn = groundInfantryRear && !isInfantryGarrisonBuilding(targetHex);
  const crewRepairArmorExposed = modifiers.targetCrewRepairing === true;
  const targetArmor = crewRepairArmorExposed ? 0 : target.stats.armor;
  const cover = resolveTacticalCover(attacker, target, hexes, { directFire: !weapon.indirect });
  const armorPiercingBonus = Math.max(0, modifiers.armorPiercingBonus ?? 0);
  const effectiveArmor = groundVehicleRear ? 0 : Math.max(0, targetArmor + cover.armor - weapon.armorPiercing - armorPiercingBonus);
  const digInDefense: 0 | 2 = groundTarget && !rearIgnoresDigIn && (targetTags.has("INFANTRY") || targetTags.has("PERSONNEL")) && target.statuses.includes("DUG_IN") ? 2 : 0;
  const evasiveAttackModifier: 0 | -2 = modifiers.attackerEvasive ? -2 : 0;
  const evasiveDefenseModifier: 0 | 3 = modifiers.targetEvasive ? 3 : 0;
  const baseDefense = target.stats.defense + digInDefense + evasiveDefenseModifier;
  const targetDefense = Math.max(0, baseDefense - (target.bombardmentSuppression?.stacks ?? 0));
  const threshold = effectiveArmor + targetDefense;
  const rapidFireMultiplier = weapon.tags.includes("RAPID_FIRE") && target.tags?.includes("HORDE") === true ? 2 : 1;
  if (!targetCheck.legal) {
    return {
      ...targetCheck,
      rearAttack,
      targetArmor,
      coverArmor: cover.armor,
      coverSources: cover.sources,
      effectiveArmor,
      targetDefense,
      digInDefense,
      threshold,
      penetrated: false,
      healthLoss: 0,
      rapidFireMultiplier,
      damageResult: 0,
      highGroundModifier,
      evasiveAttackModifier,
      evasiveDefenseModifier,
      crewRepairArmorExposed,
      armorPiercingBonus,
    };
  }

  // A D1 is the canonical fixed-damage encoding used by companion artillery.
  const rolls = Array.from({ length: weapon.damage.count }, () => weapon.damage.sides === 1 ? 1 : random.die(weapon.damage.sides));
  const raw = rolls.reduce((total, value) => total + value, 0);
  const modified = Math.max(0, raw + (weapon.damage.modifier ?? 0) + highGroundModifier + evasiveAttackModifier);
  const governedOutput = irregularDamageOutputForTags(modified, attacker.tags ?? []);
  const capped =
    attacker.stats.healthModel === "FORCE_STRENGTH"
      ? Math.min(governedOutput, attacker.currentHealth)
      : governedOutput;
  const damageResult = capped * rapidFireMultiplier;
  const penetrated = damageResult > threshold;
  const healthLoss = penetrated
    ? target.stats.healthModel === "HITS"
      ? 1
      : Math.max(1, damageResult - threshold)
    : 0;

  return {
    legal: true,
    roll: { raw, modified, capped },
    rearAttack,
    targetArmor,
    coverArmor: cover.armor,
    coverSources: cover.sources,
    effectiveArmor,
    targetDefense,
    digInDefense,
    threshold,
    penetrated,
    healthLoss,
    rapidFireMultiplier,
    damageResult,
    highGroundModifier,
    evasiveAttackModifier,
    evasiveDefenseModifier,
    crewRepairArmorExposed,
    armorPiercingBonus,
    ammoAfter:
      weapon.ammoCapacity === undefined
        ? undefined
        : Math.max(0, (attacker.ammunition[weapon.id] ?? 0) - 1),
    cooldownAfter: weapon.cooldownRounds,
  };
}

export function tickCooldowns(cooldowns: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(cooldowns)
      .map(([id, rounds]) => [id, Math.max(0, rounds - 1)] as const)
      .filter(([, rounds]) => rounds > 0),
  );
}

export function consumeAmmo(
  ammunition: Record<string, number>,
  weaponId: string,
  quantity = 1,
): { legal: boolean; ammunition: Record<string, number> } {
  const available = ammunition[weaponId] ?? 0;
  if (quantity < 0 || available < quantity) return { legal: false, ammunition };
  return { legal: true, ammunition: { ...ammunition, [weaponId]: available - quantity } };
}

export function transferSupply(
  source: SupplyInventory,
  destination: SupplyInventory,
  type: TacticalSupplyResourceId,
  quantity: number,
): { legal: boolean; source: SupplyInventory; destination: SupplyInventory } {
  if (!Number.isInteger(quantity) || quantity <= 0 || (source[type] ?? 0) < quantity) {
    return { legal: false, source, destination };
  }
  return {
    legal: true,
    source: { ...source, [type]: source[type] - quantity },
    destination: { ...destination, [type]: (destination[type] ?? 0) + quantity },
  };
}

export function advanceBuildProgress(
  current: number,
  required: number,
  availableBuildPoints: number,
  pointsPerAction: number,
): { progress: number; spent: number; complete: boolean } {
  const remaining = Math.max(0, required - current);
  const spent = Math.max(0, Math.min(remaining, availableBuildPoints, pointsPerAction));
  const progress = current + spent;
  return { progress, spent, complete: progress >= required };
}

export function canEquip(
  unit: UnitClassDefinition,
  equipment: EquipmentDefinition,
  installedIds: string[],
  installedById: Map<string, EquipmentDefinition>,
): { legal: boolean; reason?: string } {
  if (equipment.status !== "active") return { legal: false, reason: "Equipment is not active." };
  if (equipment.allowedClasses.length > 0 && !equipment.allowedClasses.includes(unit.id)) {
    return { legal: false, reason: "Unit class is not eligible for this equipment." };
  }
  if (equipment.requiredEquipment.some((id) => !installedIds.includes(id))) {
    return { legal: false, reason: "Required equipment is missing." };
  }
  if (equipment.incompatibleEquipment.some((id) => installedIds.includes(id))) {
    return { legal: false, reason: "Equipment is incompatible with an installed item." };
  }
  const usedSlots = installedIds
    .map((id) => installedById.get(id))
    .filter((definition): definition is EquipmentDefinition => Boolean(definition))
    .filter((definition) => definition.slotType === equipment.slotType).length;
  const availableSlots = unit.slots[equipment.slotType] ?? 0;
  if (usedSlots >= availableSlots) return { legal: false, reason: "No compatible equipment slot is available." };
  return { legal: true };
}

export function canJoinMeleeBrawl(attacker: CampaignDeployment, brawlHex: AxialCoord): boolean {
  return (
    attacker.status !== "DESTROYED" &&
    attacker.weapons.some((weapon) => weapon.tags.includes("MELEE") || weapon.tags.includes("HIGHLY_ACCURATE")) &&
    hexDistance(attacker.position, brawlHex) <= 1
  );
}

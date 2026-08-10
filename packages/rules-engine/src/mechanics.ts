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
  effectiveArmor: number;
  targetDefense: number;
  threshold: number;
  penetrated: boolean;
  healthLoss: number;
  ammoAfter?: number;
  cooldownAfter?: number;
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
  if (target.status === "DESTROYED") return { legal: false, reason: "Target is destroyed." };
  if (attacker.side === target.side) return { legal: false, reason: "Friendly fire is not enabled." };
  if (hexDistance(attacker.position, target.position) > weapon.range) {
    return { legal: false, reason: "Target is outside weapon range." };
  }
  if (!weapon.indirect && !hasLineOfSight(attacker.position, target.position, hexes, weapon.range)) {
    return { legal: false, reason: "Line of sight is blocked." };
  }
  if (
    weapon.indirect &&
    !spotters.some(
      (spotter) =>
        spotter.side === attacker.side &&
        spotter.status !== "DESTROYED" &&
        spotter.status !== "WITHDRAWN" &&
        hasLineOfSight(spotter.position, target.position, hexes, spotter.stats.sensors),
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
): AttackCalculation {
  const targetCheck = canTarget(attacker, target, weapon, hexes, spotters);
  const rearAttack = isRearAttack(attacker.position, target.position, target.facing);
  const targetArmor = target.stats.armor;
  const effectiveArmor = rearAttack ? 0 : Math.max(0, targetArmor - weapon.armorPiercing);
  const targetDefense = rearAttack && target.statuses.includes("DUG_IN") ? 0 : target.stats.defense;
  const threshold = effectiveArmor + targetDefense;
  if (!targetCheck.legal) {
    return {
      ...targetCheck,
      rearAttack,
      targetArmor,
      effectiveArmor,
      targetDefense,
      threshold,
      penetrated: false,
      healthLoss: 0,
    };
  }

  const rolls = Array.from({ length: weapon.damage.count }, () => random.die(weapon.damage.sides));
  const raw = rolls.reduce((total, value) => total + value, 0);
  const modified = raw + (weapon.damage.modifier ?? 0);
  const capped =
    attacker.stats.healthModel === "FORCE_STRENGTH"
      ? Math.min(modified, attacker.currentHealth)
      : modified;
  const penetrated = capped > threshold;
  const healthLoss = penetrated
    ? target.stats.healthModel === "HITS"
      ? 1
      : Math.max(1, capped - threshold)
    : 0;

  return {
    legal: true,
    roll: { raw, modified, capped },
    rearAttack,
    targetArmor,
    effectiveArmor,
    targetDefense,
    threshold,
    penetrated,
    healthLoss,
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

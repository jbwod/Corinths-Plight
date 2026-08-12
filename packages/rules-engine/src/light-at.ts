import type { CampaignDeployment, WeaponProfile } from "../../domain/src";
import { hexDistance } from "./hex";

export const LIGHT_AT_WEAPON_ID = "weapon-light-at" as const;
export const LIGHT_AT_MAX_CHARGES_PER_ATTACK = 3 as const;

export interface LightAtAttackValidation {
  legal: boolean;
  reason?: string;
  available: number;
  charges: number;
  armorPiercingBonus: number;
  ammunitionAfter: number;
}

export function isLightAtChargeStore(weapon: Pick<WeaponProfile, "id">): boolean {
  return weapon.id === LIGHT_AT_WEAPON_ID;
}

export function validateLightAtAttack(
  attacker: Pick<CampaignDeployment, "weapons" | "ammunition" | "position" | "tags">,
  targetPosition: CampaignDeployment["position"],
  requestedCharges: number | undefined,
): LightAtAttackValidation {
  const fitted = attacker.weapons.some(isLightAtChargeStore);
  const available = fitted ? Math.max(0, attacker.ammunition[LIGHT_AT_WEAPON_ID] ?? 0) : 0;
  const charges = requestedCharges ?? 0;
  const invalid = !Number.isSafeInteger(charges) || charges < 0 || charges > LIGHT_AT_MAX_CHARGES_PER_ATTACK;
  if (invalid) {
    return { legal: false, reason: "Light AT use must be between zero and three charges.", available, charges: 0, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  if (charges === 0) {
    return { legal: true, available, charges, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  if (!fitted || !attacker.tags?.includes("INFANTRY")) {
    return { legal: false, reason: "This unit does not have a fitted Lightweight Anti-armour Weapon.", available, charges, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  if (!attacker.weapons.some((weapon) => weapon.id === "weapon-infantry-rifle")) {
    return { legal: false, reason: "Light AT charges modify an Infantry Squad rifle attack; no base rifle is fitted.", available, charges, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  if (hexDistance(attacker.position, targetPosition) > 1) {
    return { legal: false, reason: "Light AT charges can be used only at Range 1.", available, charges, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  if (charges > available) {
    return { legal: false, reason: `Only ${available} Light AT charge${available === 1 ? " is" : "s are"} available.`, available, charges, armorPiercingBonus: 0, ammunitionAfter: available };
  }
  return {
    legal: true,
    available,
    charges,
    armorPiercingBonus: charges,
    ammunitionAfter: available - charges,
  };
}

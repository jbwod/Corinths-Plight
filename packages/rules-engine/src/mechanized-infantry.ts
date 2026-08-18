import type {
  CampaignDeployment,
  EquipmentDefinition,
  FactionSide,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { COMPANION_PUBLIC_V1_PROFILE_ID, getCompanionClassPolicyV1 } from "./companion-class-profile";

export const MECHANIZED_INFANTRY_DEFINITION_ID = "unit-mechanized-infantry" as const;
export const MECHANIZED_INFANTRY_PUBLIC_V1 = COMPANION_PUBLIC_V1_PROFILE_ID;

export const MECHANIZED_INFANTRY_AUTOCANNON: WeaponProfile = {
  id: "weapon-mechanized-autocannon-public-v1",
  name: "Mechanized Autocannon",
  damage: { count: 1, sides: 4 },
  range: 2,
  armorPiercing: 0,
  tags: ["DIRECT", "AUTOCANNON"],
};

export function isMechanizedInfantry(
  deployment: Pick<CampaignDeployment, "definitionId">,
): boolean {
  return deployment.definitionId === MECHANIZED_INFANTRY_DEFINITION_ID;
}

/** Runtime projection of the approved public-v1 mixed-formation policy. */
export function getMechanizedInfantryPublicV1Class(sensorRange: number): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error("Mechanized Infantry sensor range must be scenario-defined as a non-negative integer.");
  }
  const policy = getCompanionClassPolicyV1(MECHANIZED_INFANTRY_DEFINITION_ID);
  return {
    id: policy.id,
    kind: "unit-class",
    name: policy.name,
    description: "Armoured fighting vehicles whose dismounted infantry can secure their occupied objective hex.",
    category: "ARMOUR",
    // INFANTRY_EQUIPMENT_ACCESS is a loadout capability, not a combat/body tag.
    tags: ["GROUND", "VEHICLE", "ARMOURED", "MECHANISED", "FORWARD_LINE_CONTROL", "INFANTRY_EQUIPMENT_ACCESS", "SUBSYSTEMS"],
    stats: {
      healthModel: "HITS",
      maxHealth: policy.maximumHealth,
      armor: policy.armor,
      defense: 0,
      speed: policy.speed,
      sensors: sensorRange,
      capacity: 1,
    },
    weapons: [{ ...MECHANIZED_INFANTRY_AUTOCANNON, damage: { ...MECHANIZED_INFANTRY_AUTOCANNON.damage }, tags: [...MECHANIZED_INFANTRY_AUTOCANNON.tags] }],
    requisitionCost: policy.requisitionCost,
    slots: { primary: 1, secondary: 1, internal: 1 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK"],
    rulesetVersion: MECHANIZED_INFANTRY_PUBLIC_V1,
    source: "Classes.html row 10 + approved public-v1 conversion",
    status: "active",
    notes: "Vehicle for damage, rear attacks and subsystems; Infantry only for equipment access and objective control. No passenger cargo.",
  };
}

export interface MechanizedIdentityValidation {
  legal: boolean;
  reasons: string[];
}

export function validateMechanizedInfantryIdentity(
  deployment: Pick<CampaignDeployment, "definitionId" | "stats" | "tags" | "cargoProfile">,
): MechanizedIdentityValidation {
  if (!isMechanizedInfantry(deployment)) {
    return { legal: false, reasons: ["Unit is not governed Mechanized Infantry."] };
  }
  const reasons: string[] = [];
  const tags = new Set(deployment.tags ?? []);
  if (
    deployment.stats.healthModel !== "HITS" ||
    deployment.stats.maxHealth !== 3 ||
    deployment.stats.armor !== 2 ||
    deployment.stats.speed !== 3
  ) reasons.push("Mechanized Infantry chassis does not match public-v1 Hits/Armor/Speed authority.");
  if (!tags.has("VEHICLE") || !tags.has("FORWARD_LINE_CONTROL") || !tags.has("INFANTRY_EQUIPMENT_ACCESS")) {
    reasons.push("Mechanized Infantry is missing its governed mixed-role capabilities.");
  }
  if (tags.has("PERSONNEL")) reasons.push("Mechanized Infantry remains a vehicle and cannot gain PERSONNEL rules.");
  if (deployment.cargoProfile !== undefined) reasons.push("Mechanized Infantry has no governed passenger cargo profile.");
  return { legal: reasons.length === 0, reasons };
}

export type MechanizedEquipmentFamily = "INFANTRY" | "VEHICLE" | "UNSUPPORTED";

export function mechanizedInfantryEquipmentFamily(
  equipment: Pick<EquipmentDefinition, "category">,
): MechanizedEquipmentFamily {
  const category = equipment.category.toUpperCase();
  if (category.startsWith("INFANTRY_") || category === "INFANTRY") return "INFANTRY";
  if (category.startsWith("VEHICLE_") || category === "VEHICLE") return "VEHICLE";
  return "UNSUPPORTED";
}

export interface MechanizedEquipmentSelection {
  equipment: Pick<EquipmentDefinition, "id" | "category" | "slotType" | "statModifiers">;
  slotIndex: number;
}

export interface MechanizedEquipmentValidation {
  legal: boolean;
  reasons: string[];
}

/**
 * Fails closed to the three exact source slots. Infantry equipment is allowed,
 * but AP/Armor/Speed mutation authority must come from the vehicle catalogue.
 */
export function validateMechanizedInfantryEquipment(
  selections: readonly MechanizedEquipmentSelection[],
): MechanizedEquipmentValidation {
  const reasons: string[] = [];
  const occupied = new Set<string>();
  const allowedSlots = new Set(["PRIMARY:0", "SECONDARY:0", "INTERNAL:0"]);
  const seenEquipment = new Set<string>();
  for (const selection of selections) {
    const slot = `${selection.equipment.slotType.toUpperCase()}:${selection.slotIndex}`;
    if (!allowedSlots.has(slot)) reasons.push(`${selection.equipment.id} does not fit a governed Mechanized Infantry slot.`);
    if (occupied.has(slot)) reasons.push(`${slot} is assigned more than once.`);
    occupied.add(slot);
    if (seenEquipment.has(selection.equipment.id)) reasons.push(`${selection.equipment.id} is selected more than once.`);
    seenEquipment.add(selection.equipment.id);
    const family = mechanizedInfantryEquipmentFamily(selection.equipment);
    if (family === "UNSUPPORTED") reasons.push(`${selection.equipment.id} is not Infantry or Vehicle equipment.`);
    const mutatesVehicleStat = Object.keys(selection.equipment.statModifiers).some((stat) =>
      stat === "armor" || stat === "speed"
    ) || selection.equipment.category.toUpperCase().includes("AMMUNITION");
    if (family === "INFANTRY" && mutatesVehicleStat) {
      reasons.push(`${selection.equipment.id} cannot apply AP, Armor, or Speed from the Infantry equipment list.`);
    }
  }
  return { legal: reasons.length === 0, reasons };
}

export interface ForwardLineOccupant {
  id: string;
  side: FactionSide;
  operational: boolean;
}

export interface ForwardLineControlResult {
  controllingSide: FactionSide | null;
  contested: boolean;
  occupantIds: string[];
}

/** Deterministic exact-side control; opposing operational sides contest. */
export function resolveForwardLineControl(
  occupants: readonly ForwardLineOccupant[],
): ForwardLineControlResult {
  const operational = occupants.filter((occupant) =>
    occupant.operational && (occupant.side === "ALLIED" || occupant.side === "ENEMY")
  ).sort((left, right) => left.id.localeCompare(right.id));
  const sides = new Set(operational.map((occupant) => occupant.side));
  return {
    controllingSide: sides.size === 1 ? operational[0]!.side : null,
    contested: sides.size > 1,
    occupantIds: operational.map((occupant) => occupant.id),
  };
}

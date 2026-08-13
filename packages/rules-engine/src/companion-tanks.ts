import type {
  SubsystemDamageProfile,
  SubsystemDefinition,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import {
  COMPANION_PUBLIC_V1_PROFILE_ID,
  getCompanionClassPolicyV1,
} from "./companion-class-profile";

export const PUBLIC_V1_COMPANION_ARMOUR_PROFILE = COMPANION_PUBLIC_V1_PROFILE_ID;

export type CompanionTankDefinitionId =
  | "unit-light-battle-tank"
  | "unit-heavy-battle-tank"
  | "unit-super-heavy-tank";

export function isCompanionTankDefinitionId(value: string): value is CompanionTankDefinitionId {
  return value === "unit-light-battle-tank" ||
    value === "unit-heavy-battle-tank" ||
    value === "unit-super-heavy-tank";
}

function weaponProfile(definitionId: CompanionTankDefinitionId): WeaponProfile {
  const source = getCompanionClassPolicyV1(definitionId).weapons[0]!;
  return {
    id: source.id,
    name: source.name,
    damage: { ...source.damage },
    range: source.range,
    armorPiercing: source.armorPiercing,
    tags: ["DIRECT", "MAIN_WEAPON", ...(definitionId === "unit-super-heavy-tank" ? ["SUPER_HEAVY_DUAL_CANNON"] : [])],
  };
}

/** Runtime projection of the explicitly approved public-v1 conversion policy. */
export function getPublicV1CompanionTankProfile(
  id: CompanionTankDefinitionId,
  scenarioSensorRange: number,
): UnitClassDefinition {
  if (!Number.isInteger(scenarioSensorRange) || scenarioSensorRange < 0) {
    throw new Error(`${id} requires a scenario-authored non-negative integer sensor range.`);
  }
  const policy = getCompanionClassPolicyV1(id);
  return {
    id,
    kind: "unit-class",
    name: policy.name,
    description: `${policy.name} under ${COMPANION_PUBLIC_V1_PROFILE_ID}.`,
    category: policy.category,
    tags: [
      ...policy.tags,
      ...(id === "unit-light-battle-tank" ? ["LIGHT_VEHICLE"] : []),
    ],
    stats: {
      healthModel: policy.healthModel,
      maxHealth: policy.maximumHealth,
      armor: policy.armor,
      defense: 0,
      speed: policy.speed,
      sensors: scenarioSensorRange,
      capacity: 1,
    },
    weapons: [weaponProfile(id)],
    requisitionCost: policy.requisitionCost,
    slots: Object.fromEntries(Object.entries(policy.slots).map(([key, value]) => [key.toLowerCase(), value])),
    allowedOrders: [...policy.allowedOrders],
    // Paired LOAD/UNLOAD is consent for the separately governed tank transport
    // policy; the tank remains cargo and never becomes a carrier itself.
    allowedActions: [...new Set([...policy.allowedActions, "LOAD" as const, "UNLOAD" as const])],
    rulesetVersion: COMPANION_PUBLIC_V1_PROFILE_ID,
    source: "Classes.html plus owner-approved public-v1 companion armour conversion",
    status: "active",
    notes: `Application policy; decision references: ${policy.decisionReferences.join(", ")}.`,
  };
}

export interface CompanionTankAttackSelection {
  legal: boolean;
  reason?: string;
  /** One entry per shot; Super Heavy deliberately repeats its fitted cannon. */
  weapons: WeaponProfile[];
  shotCount: number;
}

/** Server-owned shot selection; client weaponIds cannot narrow or duplicate it. */
export function selectCompanionTankAttackWeapons(
  definitionId: string,
  fittedWeapons: readonly WeaponProfile[],
): CompanionTankAttackSelection | undefined {
  if (!isCompanionTankDefinitionId(definitionId)) return undefined;
  const policy = getCompanionClassPolicyV1(definitionId);
  const expected = policy.weapons[0]!;
  const fitted = fittedWeapons.find((weapon) => weapon.id === expected.id);
  if (!fitted) {
    return {
      legal: false,
      reason: `${definitionId} is missing a governed main cannon from its public-v1 profile.`,
      weapons: [],
      shotCount: 0,
    };
  }
  const shotCount = expected.attacksPerActivation ?? 1;
  return { legal: true, weapons: Array.from({ length: shotCount }, () => fitted), shotCount };
}

export const COMPANION_TANK_SUBSYSTEM_DEFINITIONS: SubsystemDefinition[] = [
  { id: "WEAPONS", name: "Weapon systems", kind: "WEAPON", tags: [] },
  { id: "MOBILITY", name: "Mobility", kind: "MOBILITY", tags: [] },
];

export const COMPANION_TANK_SUBSYSTEM_PROFILE: SubsystemDamageProfile = {
  id: "public-v1-companion-tank-subsystems",
  requiresPenetration: true,
  triggers: [
    { naturalRolls: [5], targetKind: "WEAPON", resultingState: "DISABLED", selection: "ALL" },
    { naturalRolls: [6], targetKind: "MOBILITY", resultingState: "DISABLED", selection: "ALL" },
  ],
};

export function getCompanionTankSubsystemRules(definitionId: string) {
  return isCompanionTankDefinitionId(definitionId)
    ? {
        profile: structuredClone(COMPANION_TANK_SUBSYSTEM_PROFILE),
        definitions: structuredClone(COMPANION_TANK_SUBSYSTEM_DEFINITIONS),
      }
    : undefined;
}

/** The approved Mechanized Infantry conversion is a vehicle for subsystem damage. */
export function getMechanizedInfantrySubsystemRules(definitionId: string) {
  return definitionId === "unit-mechanized-infantry"
    ? {
        profile: { ...COMPANION_TANK_SUBSYSTEM_PROFILE, id: "public-v1-mechanized-infantry-subsystems" },
        definitions: structuredClone(COMPANION_TANK_SUBSYSTEM_DEFINITIONS),
      }
    : undefined;
}

export interface CompanionTankTransportResult {
  legal: boolean;
  reason?: string;
  airDropAllowed: boolean;
  hazardousDropPolicy: "REJECT" | "NOT_APPLICABLE";
}

export function validateCompanionTankTransport(
  tankDefinitionId: string,
  carrierDefinitionId: string,
): CompanionTankTransportResult | undefined {
  if (!isCompanionTankDefinitionId(tankDefinitionId)) return undefined;
  if (carrierDefinitionId === "unit-heavy-air-transport") {
    return tankDefinitionId === "unit-light-battle-tank"
      ? { legal: true, airDropAllowed: true, hazardousDropPolicy: "REJECT" }
      : {
          legal: false,
          reason: `${tankDefinitionId} cannot be carried by a Heavy Air Transport.`,
          airDropAllowed: false,
          hazardousDropPolicy: "NOT_APPLICABLE",
        };
  }
  if (carrierDefinitionId === "unit-vtol-heavy-lift") {
    return { legal: true, airDropAllowed: false, hazardousDropPolicy: "NOT_APPLICABLE" };
  }
  return {
    legal: false,
    reason: `${tankDefinitionId} requires an approved Heavy Air Transport or Heavy Lift carrier.`,
    airDropAllowed: false,
    hazardousDropPolicy: "NOT_APPLICABLE",
  };
}

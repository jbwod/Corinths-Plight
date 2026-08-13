import type { ActionType, HealthModel, OrderType } from "../../domain/src";

export const COMPANION_PUBLIC_V1_PROFILE_ID = "public-v1-companion-classes@1" as const;

export interface CompanionWeaponPolicyV1 {
  id: string;
  name: string;
  damage: { count: number; sides: number; modifier?: number };
  range: number;
  armorPiercing: number;
  indirect?: boolean;
  attacksPerActivation?: number;
  areaHex?: boolean;
  minimumRange?: number;
  ammunitionCapacity?: number;
  outputMultiplier?: { numerator: number; denominator: number; rounding: "UP" };
  fittedOnly?: boolean;
}

export interface CompanionClassPolicyV1 {
  id: string;
  name: string;
  category: "INFANTRY" | "ARMOUR" | "ARTILLERY" | "MECH" | "SUPPORT" | "AEROSPACE";
  healthModel: HealthModel;
  maximumHealth: number;
  armor: number;
  speed: number;
  sensorRange: "SCENARIO_DEFINED";
  requisitionCost: number;
  slots: Readonly<Record<string, number>>;
  tags: readonly string[];
  allowedOrders: readonly OrderType[];
  allowedActions: readonly ActionType[];
  weapons: readonly CompanionWeaponPolicyV1[];
  signatureMechanics: readonly string[];
  transportPolicy: readonly string[];
  decisionReferences: readonly string[];
}

const fixedDamage = (damage: number): { count: number; sides: number; modifier: number } => ({
  count: 1,
  sides: 1,
  modifier: damage - 1,
});

/**
 * Application-owned conversion profile for the sixteen Classes.html companion
 * units. Source FS remains FS for personnel/crewed field guns. Legacy FS on a
 * vehicle, mech, or aerospace chassis becomes the same numeric value in Hits.
 * Prices and missing weapon dice are public-v1 balance values, not retroactive
 * claims about the source sheet.
 */
export const COMPANION_CLASS_POLICIES_V1 = [
  {
    id: "unit-power-armoured-infantry", name: "Power Armoured Infantry", category: "INFANTRY",
    healthModel: "FORCE_STRENGTH", maximumHealth: 3, armor: 2, speed: 1,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 10,
    slots: { PRIMARY: 2, MECH_WEAPON: 1 },
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "ARMOURED", "POWER_ARMOUR"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "DIG_IN", "SHIELD_WALL", "MOUNT_MAGNETIC_CLAMPS", "DISMOUNT_MAGNETIC_CLAMPS"],
    weapons: [{ id: "weapon-infantry-rifle", name: "Squad Small Arms", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0 }],
    signatureMechanics: ["DIG_IN", "SHIELD_WALL", "MAGNETIC_CLAMP_RIDER", "HEAVY_DROP_POD_INSERTION", "UNLOCKABLE_BACK_LIGHT_LASER"],
    transportPolicy: ["GROUND", "HEAVY_DROP_POD"], decisionReferences: ["DEC-021", "public-v1-power-armoured-infantry@1"],
  },
  {
    id: "unit-irregular", name: "Irregular Unit", category: "INFANTRY",
    healthModel: "FORCE_STRENGTH", maximumHealth: 10, armor: 0, speed: 1,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 4,
    slots: { HIGH_RISK_ARMS: 2, LOW_TECH_MELEE: 1 },
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "IRREGULAR"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK", "RECRUIT_IRREGULAR"],
    weapons: [{ id: "weapon-irregular-small-arms-public-v1", name: "Irregular Small Arms", damage: { count: 1, sides: 6 }, range: 1, armorPiercing: 0, outputMultiplier: { numerator: 1, denominator: 4, rounding: "UP" } }],
    signatureMechanics: ["QUARTER_DAMAGE_ROUND_UP", "POPULATION_RECRUITMENT", "CLASS_PROGRESSION"],
    transportPolicy: ["GROUND", "PERSONNEL_CARGO"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-special-forces", name: "Special Forces", category: "INFANTRY",
    healthModel: "FORCE_STRENGTH", maximumHealth: 3, armor: 0, speed: 2,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 8,
    slots: { PRIMARY: 2, SECONDARY: 2 },
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "INFANTRY_STEALTH", "SPECIAL_FORCES"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"],
    allowedActions: ["ATTACK", "PLACE_DELAYED_CHARGE", "DETONATE_DELAYED_CHARGE"],
    weapons: [{ id: "weapon-special-forces-quiet-rifle-public-v1", name: "Quiet Rifle", damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0 }],
    signatureMechanics: ["INFANTRY_STEALTH", "DELAYED_CHARGE"],
    transportPolicy: ["GROUND", "PERSONNEL_CARGO"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-sappers", name: "Sappers", category: "SUPPORT",
    healthModel: "FORCE_STRENGTH", maximumHealth: 2, armor: 0, speed: 1,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 6,
    slots: { PRIMARY: 1, SECONDARY: 1 },
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "INFANTRY_STEALTH", "ENGINEER", "SAPPER"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"], allowedActions: ["ATTACK", "SAPPER_CONSTRUCT", "RELOAD_BUILD_SUPPLY"],
    weapons: [{ id: "weapon-sapper-carbine-public-v1", name: "Sapper Carbine", damage: { count: 1, sides: 4 }, range: 1, armorPiercing: 0 }],
    signatureMechanics: ["INFANTRY_STEALTH", "BUILD_SUPPLY_6", "MINES", "SENSOR_TOWER", "WEAPON_EMPLACEMENT"],
    transportPolicy: ["GROUND", "PERSONNEL_CARGO"], decisionReferences: ["DEC-006", "DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-mechanized-infantry", name: "Mechanized Infantry", category: "ARMOUR",
    healthModel: "HITS", maximumHealth: 3, armor: 2, speed: 3,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 10,
    slots: { PRIMARY: 1, SECONDARY: 1, INTERNAL: 1 },
    tags: ["GROUND", "VEHICLE", "ARMOURED", "INFANTRY", "MECHANISED"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK", "DIG_IN"],
    weapons: [{ id: "weapon-mechanized-autocannon-public-v1", name: "Mechanized Autocannon", damage: { count: 1, sides: 4 }, range: 2, armorPiercing: 0 }],
    signatureMechanics: ["FORWARD_LINE_CONTROL", "MIXED_INFANTRY_VEHICLE_EQUIPMENT"],
    transportPolicy: ["GROUND"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-light-battle-tank", name: "Light Battle Tank", category: "ARMOUR",
    healthModel: "HITS", maximumHealth: 3, armor: 2, speed: 3,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 10,
    slots: { SECONDARY: 1, INTERNAL: 1 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "LIGHT", "SUBSYSTEMS", "REAR_WEAK_SPOT"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD"],
    weapons: [{ id: "weapon-light-battle-tank-cannon-public-v1", name: "Light Tank Cannon", damage: { count: 1, sides: 4 }, range: 2, armorPiercing: 2 }],
    signatureMechanics: ["REAR_WEAK_SPOT", "HAT_LIGHT_TANK_AIRDROP"], transportPolicy: ["GROUND", "HAT_AIRDROP"],
    decisionReferences: ["DEC-009", "DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-heavy-battle-tank", name: "Heavy Battle Tank", category: "ARMOUR",
    healthModel: "HITS", maximumHealth: 3, armor: 4, speed: 2,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 14,
    slots: { SECONDARY: 1, INTERNAL: 1 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "HEAVY", "SUBSYSTEMS", "REAR_WEAK_SPOT"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK"],
    weapons: [{ id: "weapon-heavy-battle-tank-cannon-public-v1", name: "Long Heavy Cannon", damage: { count: 1, sides: 8 }, range: 3, armorPiercing: 2 }],
    signatureMechanics: ["REAR_WEAK_SPOT", "HEAVY_CHASSIS"], transportPolicy: ["GROUND", "NO_HAT"],
    decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-super-heavy-tank", name: "Super Heavy Tank", category: "ARMOUR",
    healthModel: "HITS", maximumHealth: 4, armor: 5, speed: 1,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 20,
    slots: { SECONDARY: 2, INTERNAL: 2 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "SUPER_HEAVY", "SUBSYSTEMS", "REAR_WEAK_SPOT"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["ATTACK"],
    weapons: [{ id: "weapon-super-heavy-dual-cannon-public-v1", name: "Dual Super-heavy Cannons", damage: { count: 1, sides: 8 }, range: 3, armorPiercing: 5, attacksPerActivation: 2 }],
    signatureMechanics: ["REAR_WEAK_SPOT", "TWO_ATTACKS_PER_ACTIVATION"], transportPolicy: ["GROUND", "VTOL_HEAVY_LIFT_ONLY"],
    decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-light-artillery", name: "Light Artillery", category: "ARTILLERY",
    healthModel: "FORCE_STRENGTH", maximumHealth: 2, armor: 0, speed: 1,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 8,
    slots: { SECONDARY: 1, INTERNAL: 2 }, tags: ["GROUND", "PERSONNEL", "ARTILLERY", "INDIRECT", "DEPLOYABLE"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["ATTACK", "DEPLOY", "PACK_UP"],
    weapons: [{ id: "weapon-light-artillery-public-v1", name: "Light Artillery Battery", damage: fixedDamage(2), range: 5, armorPiercing: 0, indirect: true, attacksPerActivation: 2, areaHex: true }],
    signatureMechanics: ["DEPLOYED_FIRE", "SPLIT_FIRE_TWO", "ABANDON_GUNS", "ONE_CAMPAIGN_REPLACEMENT"],
    transportPolicy: ["GROUND", "HAT_AIRDROP", "HEAVY_DROP_POD"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-heavy-artillery", name: "Heavy Artillery", category: "ARTILLERY",
    healthModel: "FORCE_STRENGTH", maximumHealth: 3, armor: 0, speed: 0,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 12,
    slots: { SECONDARY: 1, INTERNAL: 2 }, tags: ["GROUND", "PERSONNEL", "ARTILLERY", "INDIRECT", "DEPLOYABLE", "HEAVY"],
    allowedOrders: ["HOLD"], allowedActions: ["ATTACK", "DEPLOY", "PACK_UP"],
    weapons: [{ id: "weapon-heavy-artillery-public-v1", name: "Heavy Artillery Battery", damage: fixedDamage(3), range: 8, armorPiercing: 0, indirect: true, attacksPerActivation: 3, areaHex: true }],
    signatureMechanics: ["DEPLOYED_FIRE", "SPLIT_FIRE_THREE", "ABANDON_GUNS", "ONE_CAMPAIGN_REPLACEMENT"],
    transportPolicy: ["GROUND", "HAT_CARGO"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-self-propelled-artillery", name: "Self-Propelled Artillery", category: "ARTILLERY",
    healthModel: "HITS", maximumHealth: 2, armor: 2, speed: 2,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 10,
    slots: { SECONDARY: 1, INTERNAL: 2 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "ARTILLERY", "INDIRECT", "SUBSYSTEMS"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["ATTACK"],
    weapons: [{ id: "weapon-self-propelled-artillery-public-v1", name: "Self-propelled Howitzer", damage: { count: 1, sides: 6 }, range: 4, minimumRange: 2, armorPiercing: 0, indirect: true, areaHex: true, ammunitionCapacity: 5 }],
    signatureMechanics: ["MINIMUM_RANGE_TWO", "FIVE_FINITE_AP_ROUNDS"], transportPolicy: ["GROUND"],
    decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-vtol-troop-airlift", name: "VTOL Heavy Troop Airlift", category: "AEROSPACE",
    healthModel: "HITS", maximumHealth: 3, armor: 1, speed: 5,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 12,
    slots: { LIGHT: 1, INTERNAL: 1 }, tags: ["AEROSPACE", "VTOL", "VEHICLE", "ARMOURED", "TRANSPORT"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF", "REARM_AEROSPACE"],
    weapons: [{ id: "weapon-vtol-light-gun-public-v1", name: "VTOL Light Gun", damage: { count: 1, sides: 2 }, range: 1, armorPiercing: 0, ammunitionCapacity: 1 }],
    signatureMechanics: ["TWO_INFANTRY_OR_SUPPLY", "RAPPEL_GARRISON", "REARM_AFTER_ATTACK"],
    transportPolicy: ["VTOL", "PERSONNEL_OR_SUPPLY"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-vtol-multipurpose-airlift", name: "VTOL Multi-Purpose Airlift", category: "AEROSPACE",
    healthModel: "HITS", maximumHealth: 3, armor: 1, speed: 5,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 12,
    slots: { LIGHT: 1, INTERNAL: 1 }, tags: ["AEROSPACE", "VTOL", "VEHICLE", "ARMOURED", "TRANSPORT"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF", "REARM_AEROSPACE"],
    weapons: [{ id: "weapon-vtol-light-gun-public-v1", name: "VTOL Light Gun", damage: { count: 1, sides: 2 }, range: 1, armorPiercing: 0, ammunitionCapacity: 1 }],
    signatureMechanics: ["INFANTRY_OR_SUPPLY_PLUS_LIGHT_VEHICLE", "REARM_AFTER_ATTACK"],
    transportPolicy: ["VTOL", "MIXED_PERSONNEL_VEHICLE"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-vtol-heavy-lift", name: "VTOL Heavy Lift", category: "AEROSPACE",
    healthModel: "HITS", maximumHealth: 3, armor: 3, speed: 5,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 14,
    slots: { LIGHT: 1, INTERNAL: 1 }, tags: ["AEROSPACE", "VTOL", "VEHICLE", "ARMOURED", "TRANSPORT", "HEAVY_LIFT"],
    allowedOrders: ["HOLD", "ADVANCE"], allowedActions: ["LOAD", "UNLOAD", "LAND", "TAKE_OFF"], weapons: [],
    signatureMechanics: ["EXTERNAL_HEAVY_LIFT", "OBJECTIVE_CARGO"],
    transportPolicy: ["VTOL", "ONE_HEAVY_EXTERNAL_LOAD"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-medium-mech", name: "Medium Mech", category: "MECH",
    healthModel: "HITS", maximumHealth: 4, armor: 2, speed: 3,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 14,
    slots: { EXTERNAL: 2, INTERNAL: 4 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "MECH", "SUBSYSTEMS", "LEGGED"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD", "DIG_IN"],
    weapons: [{ id: "fitted-mech-weapons", name: "Fitted Mech Weapons", damage: { count: 0, sides: 0 }, range: 0, armorPiercing: 0, fittedOnly: true }],
    signatureMechanics: ["FIRE_ALL_FITTED_WEAPONS", "SUPPLY_POINT_RELOAD", "LEG_HEIGHT_ONE", "CROUCH_COVER"],
    transportPolicy: ["GROUND", "MAGNETIC_CLAMP_CARRIER", "VTOL_HEAVY_LIFT"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
  {
    id: "unit-heavy-mech", name: "Heavy Mech", category: "MECH",
    healthModel: "HITS", maximumHealth: 5, armor: 3, speed: 2,
    sensorRange: "SCENARIO_DEFINED", requisitionCost: 18,
    slots: { EXTERNAL: 3, INTERNAL: 4 }, tags: ["GROUND", "VEHICLE", "ARMOURED", "MECH", "SUBSYSTEMS", "LEGGED", "HEAVY"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"], allowedActions: ["ATTACK", "RELOAD", "LOAD", "UNLOAD"],
    weapons: [{ id: "fitted-mech-weapons", name: "Fitted Mech Weapons", damage: { count: 0, sides: 0 }, range: 0, armorPiercing: 0, fittedOnly: true }],
    signatureMechanics: ["FIRE_ALL_FITTED_WEAPONS", "SUPPLY_POINT_RELOAD", "LEG_HEIGHT_ONE"],
    transportPolicy: ["GROUND", "MAGNETIC_CLAMP_CARRIER", "VTOL_HEAVY_LIFT"], decisionReferences: ["DEC-021", COMPANION_PUBLIC_V1_PROFILE_ID],
  },
] as const satisfies readonly CompanionClassPolicyV1[];

const companionPolicyById = new Map<string, CompanionClassPolicyV1>(
  COMPANION_CLASS_POLICIES_V1.map((policy) => [policy.id, policy]),
);

export function getCompanionClassPolicyV1(definitionId: string): CompanionClassPolicyV1 {
  const policy = companionPolicyById.get(definitionId);
  if (!policy) throw new Error(`Unknown public-v1 companion class: ${definitionId}`);
  return policy;
}

export function isCompanionClassV1(definitionId: string): boolean {
  return companionPolicyById.has(definitionId);
}

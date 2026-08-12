import type {
  ActionEconomy,
  ActionType,
  EquipmentDefinition,
  GameDefinition,
  OrderType,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { RULESET_VERSION } from "../../domain/src";
import { getTacticalActionRule, getTacticalOrderRule } from "./tactical-grammar";
import { getTacticalUnitClass } from "./tactical-unit-catalogue";

const v5 = (section: string) => `Meta - Core Rules (V5).md — ${section}`;
const slots = (primary = 0, secondary = 0, internal = 0) => ({ primary, secondary, internal });

export const weapons = {
  infantryRifle: {
    id: "weapon-infantry-rifle",
    name: "Squad Small Arms",
    damage: { count: 1, sides: 6 },
    range: 1,
    armorPiercing: 0,
    tags: ["PERSONNEL", "FS_CAPPED"],
  },
  lightHmg: {
    id: "weapon-light-hmg",
    name: "Heavy Machine Gun",
    damage: { count: 1, sides: 4 },
    range: 2,
    armorPiercing: 0,
    tags: ["RAPID_FIRE"],
  },
  tankCannon: {
    id: "weapon-mbt-cannon",
    name: "Main Cannon",
    damage: { count: 1, sides: 6 },
    range: 2,
    armorPiercing: 3,
    tags: ["ANTI_ARMOUR"],
  },
  artilleryBarrage: {
    id: "weapon-artillery-barrage",
    name: "Indirect Barrage",
    damage: { count: 1, sides: 6 },
    range: 4,
    armorPiercing: 0,
    indirect: true,
    ammoCapacity: 2,
    tags: ["INDIRECT", "EXPERIMENTAL_DAMAGE_MODE"],
  },
  bugClaws: {
    id: "weapon-bug-claws",
    name: "Rending Claws",
    damage: { count: 1, sides: 6 },
    range: 1,
    armorPiercing: 0,
    tags: ["MELEE", "FS_CAPPED"],
  },
  bugSpines: {
    id: "weapon-bug-spines",
    name: "Heavy Spine Volley",
    damage: { count: 1, sides: 6 },
    range: 2,
    armorPiercing: 2,
    tags: ["ANTI_ARMOUR"],
  },
} satisfies Record<string, WeaponProfile>;

export const unitClasses: UnitClassDefinition[] = [
  {
    id: "unit-infantry-squad",
    kind: "unit-class",
    name: "Infantry Squad",
    description: "Six-person line infantry able to hold ground and dig in.",
    category: "INFANTRY",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "DIG_IN"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6, armor: 0, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    weapons: [weapons.infantryRifle],
    requisitionCost: null,
    slots: slots(4, 4, 0),
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "MELEE_CHARGE", "STEALTH"],
    allowedActions: ["ATTACK", "DIG_IN", "LOAD", "UNLOAD"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Starting Unit Classes / Infantry Squad"),
    status: "active",
    notes: "V5 FS 6 is active. Legacy Classes.html FS 5 is preserved as conflict RC-001.",
    conflictIds: ["RC-001"],
  },
  {
    id: "unit-engineers",
    kind: "unit-class",
    name: "Engineers",
    description: "Non-combat specialists who construct positions and repair vehicles.",
    category: "ENGINEER",
    tags: ["GROUND", "PERSONNEL", "BUILDER", "REPAIR"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 4, armor: 0, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    weapons: [],
    requisitionCost: null,
    slots: { primary: 0, secondary: 2, internal: 0, engineer: 3 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["DIG_IN", "ARTILLERY_DIG_IN", "REPAIR", "CONSTRUCT", "LOAD", "UNLOAD"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Starting Unit Classes / Engineers"),
    status: "active",
    notes: "V5 supply-capacity model active; legacy build points remain catalogued, inactive.",
    conflictIds: ["RC-003", "RC-009"],
  },
  {
    id: "unit-light-vehicle",
    kind: "unit-class",
    name: "Light Vehicle",
    description: "Fast reconnaissance vehicle with a rapid-fire heavy machine gun.",
    category: "ARMOUR",
    tags: ["GROUND", "VEHICLE", "SUB_SYSTEM", "EVASIVE"],
    stats: { healthModel: "HITS", maxHealth: 2, armor: 0, defense: 0, speed: 4, sensors: 5, capacity: 1 },
    weapons: [weapons.lightHmg],
    requisitionCost: null,
    slots: slots(0, 1, 1),
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "EVASIVE"],
    allowedActions: ["ATTACK", "LOAD", "UNLOAD", "SCAN"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Starting Unit Classes / Light Vehicle"),
    status: "active",
  },
  {
    id: "unit-main-battle-tank",
    kind: "unit-class",
    name: "Main Battle Tank",
    description: "Armoured line-breaker with a high-penetration main cannon.",
    category: "ARMOUR",
    tags: ["GROUND", "VEHICLE", "SUB_SYSTEM", "REAR_WEAK_SPOT"],
    stats: { healthModel: "HITS", maxHealth: 3, armor: 3, defense: 0, speed: 2, sensors: 4, capacity: 1 },
    weapons: [weapons.tankCannon],
    requisitionCost: null,
    slots: slots(0, 1, 1),
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "REPAIR"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Starting Unit Classes / Main Battle Tank"),
    status: "active",
  },
  {
    id: "unit-artillery",
    kind: "unit-class",
    name: "Artillery",
    description: "Area-control battery with bombardment and funnel fire missions.",
    category: "ARTILLERY",
    tags: ["GROUND", "PERSONNEL", "INDIRECT", "DEPLOYABLE"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 3, armor: 0, defense: 0, speed: 1, sensors: 3, capacity: 1 },
    weapons: [weapons.artilleryBarrage],
    requisitionCost: null,
    slots: slots(0, 1, 2),
    allowedOrders: ["HOLD", "ADVANCE"],
    allowedActions: ["DEPLOY", "PACK_UP", "BOMBARDMENT", "ATTACK", "RELOAD"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Starting Unit Classes / Artillery"),
    status: "active",
    notes: "Damage profile is experimental for the foundation demo; V5's active role is bombardment/funnel control.",
    conflictIds: ["RC-007"],
  },
  {
    id: "enemy-bug-drone",
    kind: "enemy",
    name: "Bug Drone",
    description: "Fast swarm organism that closes on the nearest visible humanoid force.",
    category: "ENEMY",
    tags: ["GROUND", "PERSONNEL", "HORDE", "BUG"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 3, armor: 0, defense: 0, speed: 2, sensors: 3, capacity: 1 },
    weapons: [weapons.bugClaws],
    requisitionCost: null,
    slots: slots(),
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "MELEE_CHARGE"],
    allowedActions: ["ATTACK", "ASSAULT"],
    rulesetVersion: RULESET_VERSION,
    source: "gameplan.md §53 MVP Scenario",
    status: "experimental",
    notes: "Product-brief enemy name with foundation statistics; not claimed as a V5 source value.",
  },
  {
    id: "enemy-bug-warrior",
    kind: "enemy",
    name: "Bug Warrior",
    description: "Aggressive line organism that pins allied infantry in close combat.",
    category: "ENEMY",
    tags: ["GROUND", "PERSONNEL", "BUG"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 6, armor: 0, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    weapons: [weapons.bugClaws],
    requisitionCost: null,
    slots: slots(),
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "MELEE_CHARGE"],
    allowedActions: ["ATTACK", "ASSAULT"],
    rulesetVersion: RULESET_VERSION,
    source: "gameplan.md §53 MVP Scenario",
    status: "experimental",
    notes: "Foundation doctrine template; pending campaign balance testing.",
  },
  {
    id: "enemy-bug-heavy",
    kind: "enemy",
    name: "Bug Heavy",
    description: "Armoured siege organism that prioritises vehicles and objectives.",
    category: "ENEMY",
    tags: ["GROUND", "VEHICLE", "BUG", "ANTI_ARMOUR"],
    stats: { healthModel: "HITS", maxHealth: 4, armor: 3, defense: 0, speed: 1, sensors: 4, capacity: 1 },
    weapons: [weapons.bugSpines],
    requisitionCost: null,
    slots: slots(),
    allowedOrders: ["HOLD", "ADVANCE"],
    allowedActions: ["ATTACK"],
    rulesetVersion: RULESET_VERSION,
    source: "gameplan.md §53 MVP Scenario",
    status: "experimental",
    notes: "Foundation doctrine template; pending campaign balance testing.",
  },
];

export const equipment: EquipmentDefinition[] = [
  {
    id: "equipment-flak-vests",
    kind: "equipment",
    name: "Flak Vests",
    description: "Adds +1 armour to otherwise unarmoured infantry.",
    category: "INFANTRY_ARMOUR",
    slotType: "secondary",
    cost: 1,
    allowedClasses: ["unit-infantry-squad"],
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: { armor: 1 },
    abilityGrants: [],
    consumable: false,
    rulesText: "Add +1 Armor from 0 only.",
    tags: ["ARMOUR"],
    rulesetVersion: RULESET_VERSION,
    source: "The Store - Equipment List.html row 4",
    status: "active",
  },
  {
    id: "equipment-light-at",
    kind: "equipment",
    name: "Lightweight Anti-armour Weapon",
    description: "Three disposable range-one attacks with AP +1.",
    category: "INFANTRY_WEAPON",
    slotType: "primary",
    cost: 1,
    allowedClasses: ["unit-infantry-squad"],
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: {},
    abilityGrants: ["weapon-law"],
    ammoCapacity: 3,
    consumable: true,
    rulesText: "AP +1 per weapon used; 3/3 uses; Range 1.",
    tags: ["ANTI_ARMOUR", "AMMO"],
    rulesetVersion: RULESET_VERSION,
    source: "The Store - Equipment List.html row 10",
    status: "active",
    notes: "Executable finite-ammunition weapon grant in the equipment/deployment vertical slice.",
  },
  {
    id: "equipment-vehicle-optics",
    kind: "equipment",
    name: "Vehicle Optics",
    description: "Reveals a selected hex at the edge of line of sight.",
    category: "VEHICLE_INTERNAL",
    slotType: "internal",
    cost: 1,
    allowedClasses: ["unit-light-vehicle", "unit-main-battle-tank"],
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: { sensors: 1 },
    abilityGrants: ["SCAN"],
    consumable: false,
    rulesText: "Action: Optics — reveal a hex at edge of LOS.",
    tags: ["SENSOR"],
    rulesetVersion: RULESET_VERSION,
    source: "The Store - Equipment List.html row 43",
    status: "active",
  },
];

export interface OrderTypeRuleDefinition extends GameDefinition {
  kind: "order-type";
  orderType: OrderType;
  executable: boolean;
}

export interface ActionRuleDefinition extends GameDefinition {
  kind: "action";
  actionType: ActionType;
  economy: ActionEconomy;
  speedCost: number;
  usesAttack: boolean;
  executable: boolean;
}

export const orderTypeDefinitions: OrderTypeRuleDefinition[] = (
  ["HOLD", "ADVANCE", "RUSH", "EVASIVE", "MELEE_CHARGE", "STEALTH"] as const
).map((name) => ({
    id: `order-${name.toLowerCase().replaceAll("_", "-")}`,
    kind: "order-type" as const,
    name,
    orderType: name,
    executable: name === "HOLD" || name === "ADVANCE" || name === "RUSH" || name === "EVASIVE",
    description: `Structured ${name.toLowerCase().replaceAll("_", " ")} order definition.`,
    tags: ["ORDER"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Standard and Special Order Types"),
    status: "active" as const,
    notes:
      name === "HOLD" || name === "ADVANCE" || name === "RUSH" || name === "EVASIVE"
        ? "Executable in the foundation resolver."
        : "Canonical rule retained as data; deterministic resolution hook is deferred.",
  }));

const actionProfiles: Record<
  "ATTACK" | "DIG_IN" | "ARTILLERY_DIG_IN" | "DEPLOY" | "PACK_UP" | "REPAIR" | "CREW_REPAIR" | "CONSTRUCT" | "TRENCH_UPGRADE" | "BOMBARDMENT" | "RELOAD" | "LOAD" | "UNLOAD" | "AIRDROP" | "LAND" | "TAKE_OFF" | "REARM_AEROSPACE" | "SCAN" | "DEPLOY_DRONE",
  { economy: ActionEconomy; speedCost: number; usesAttack: boolean; executable: boolean }
> = {
  ATTACK: { economy: "STANDARD", speedCost: 0, usesAttack: true, executable: true },
  DIG_IN: { economy: "STANDARD", speedCost: 1, usesAttack: false, executable: true },
  ARTILLERY_DIG_IN: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  DEPLOY: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  PACK_UP: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  REPAIR: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  CREW_REPAIR: { economy: "PRIMARY", speedCost: 0, usesAttack: false, executable: true },
  CONSTRUCT: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  TRENCH_UPGRADE: { economy: "PRIMARY", speedCost: 0, usesAttack: true, executable: true },
  BOMBARDMENT: { economy: "PRIMARY", speedCost: 0, usesAttack: true, executable: true },
  RELOAD: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  LOAD: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  UNLOAD: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  AIRDROP: { economy: "INCIDENTAL", speedCost: 0, usesAttack: false, executable: true },
  LAND: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  TAKE_OFF: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: true },
  REARM_AEROSPACE: { economy: "PRIMARY", speedCost: 0, usesAttack: false, executable: true },
  SCAN: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: false },
  DEPLOY_DRONE: { economy: "STANDARD", speedCost: 0.5, usesAttack: false, executable: false },
};

export const actionDefinitions: ActionRuleDefinition[] = (
  ["ATTACK", "DIG_IN", "ARTILLERY_DIG_IN", "DEPLOY", "PACK_UP", "REPAIR", "CREW_REPAIR", "CONSTRUCT", "TRENCH_UPGRADE", "BOMBARDMENT", "RELOAD", "LOAD", "UNLOAD", "AIRDROP", "LAND", "TAKE_OFF", "REARM_AEROSPACE", "SCAN", "DEPLOY_DRONE"] as const
).map((name) => ({
    id: name === "LOAD"
      ? "action-load-cargo"
      : name === "UNLOAD"
        ? "action-unload-cargo"
        : name === "DEPLOY"
          ? "action-deploy-platform"
          : name === "PACK_UP"
            ? "action-pack-platform"
            : `action-${name.toLowerCase().replaceAll("_", "-")}`,
    kind: "action" as const,
    name,
    actionType: name,
    ...actionProfiles[name],
    description: `Structured ${name.toLowerCase().replaceAll("_", " ")} action.`,
    tags: ["ACTION"],
    rulesetVersion: RULESET_VERSION,
    source: v5("Actions and Starting Unit Classes"),
    status: "active" as const,
    notes: actionProfiles[name].executable
      ? "Executable in the foundation resolver."
      : "Canonical rule retained as data; deterministic resolution hook is deferred.",
  }));

export const supportingDefinitions: GameDefinition[] = [
  ...orderTypeDefinitions,
  ...actionDefinitions,
  ...[
    ["terrain-open", "Open Ground", "No special modifier."],
    ["terrain-forest", "Corinth Pine Forest", "Blocks LOS through the hex and grants infantry cover."],
    ["terrain-ridge", "Basalt Ridge", "Elevation may grant terrain advantage."],
    ["terrain-marsh", "Ash Marsh", "Increased ground movement cost."],
  ].map(([id, name, description]) => ({
    id,
    kind: "terrain" as const,
    name,
    description,
    tags: ["TERRAIN"],
    rulesetVersion: RULESET_VERSION,
    source: `${v5("Terrain, Structures and Cover")} / Outpost K-17 scenario`,
    status: "active" as const,
  })),
  ...[
    ["structure-sandbag-line", "Sandbag Line", "active"],
    ["structure-razor-wire", "Razor Wire", "active"],
    ["structure-tank-traps", "Tank Traps", "active"],
    ["structure-trench", "Trench Line", "active"],
    ["structure-supply-depot", "Supply Depot", "experimental"],
    ["structure-sensor-tower", "Sensor Tower", "experimental"],
  ].map(([id, name, status]) => ({
    id,
    kind: "structure" as const,
    name,
    description: `${name} companion catalogue definition.`,
    tags: ["STRUCTURE"],
    rulesetVersion: RULESET_VERSION,
    source: "Build and Supply System.html",
    status: status as "active" | "experimental",
    notes: status === "active"
      ? "Executable V5 fieldwork; durability remains unresolved under RC-BUILD-006."
      : "Health/build conversion remains unresolved; see RULE_CONFLICTS.md.",
  })),
];

export const allDefinitions: GameDefinition[] = [
  ...unitClasses,
  ...equipment,
  ...supportingDefinitions,
];

export function getUnitClass(id: string): UnitClassDefinition {
  const enemy = unitClasses.find((candidate) => candidate.id === id && candidate.kind === "enemy");
  if (enemy) return enemy;
  return getTacticalUnitClass(id);
}

export function getOrderTypeDefinition(orderType: OrderType): OrderTypeRuleDefinition {
  const definition = orderTypeDefinitions.find((candidate) => candidate.orderType === orderType);
  if (!definition) throw new Error(`Unknown order type: ${orderType}`);
  const governed = getTacticalOrderRule(orderType);
  return {
    ...definition,
    id: governed.id,
    executable: governed.executable,
    rulesetVersion: governed.catalogueRulesetVersion,
  };
}

export function getActionDefinition(actionType: ActionType): ActionRuleDefinition {
  const definition = actionDefinitions.find((candidate) => candidate.actionType === actionType);
  if (!definition) throw new Error(`Unknown action type: ${actionType}`);
  const governed = getTacticalActionRule(actionType);
  return {
    ...definition,
    id: governed.id,
    economy: governed.economy,
    speedCost: governed.speedCost,
    usesAttack: governed.usesAttack,
    executable: governed.executable,
    rulesetVersion: governed.catalogueRulesetVersion,
  };
}

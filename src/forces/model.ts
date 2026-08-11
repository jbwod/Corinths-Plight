import type {
  AbilityRef,
  AvailabilityStatus,
  DeploymentReadinessResult,
  ForceSummaryDto,
  HealthModel,
  ImplementationStatus,
  RequisitionStatus,
  StatusEffectState,
  SubsystemOperationalState,
  UnitLocationState,
  UnitStatus,
  WeaponProfile,
} from "../../packages/domain/src";

export const FORCE_ROLES = ["INFANTRY", "ARMOUR", "SUPPORT", "ARTILLERY", "MECH", "AEROSPACE"] as const;
export type ForceRole = (typeof FORCE_ROLES)[number];
export type ForceRoleFilter = "ALL" | ForceRole;
export type ForceStatusFilter = "ALL" | "READY" | "DEPLOYED" | "DAMAGED" | "LOST";

export interface ForceEquipmentView {
  id: string;
  definitionId?: string;
  name: string;
  slot: string;
  description: string;
}

export interface ForceAbilityView {
  id: string;
  name: string;
  description: string;
  status: ImplementationStatus;
}

export interface ForceHistoryView {
  id: string;
  type: string;
  summary: string;
  campaign?: string;
  round?: number;
  timestamp: number;
}

export interface ForceSubsystemView {
  id: string;
  name: string;
  state: SubsystemOperationalState;
}

export interface ForceCargoView {
  id: string;
  label: string;
  quantity: number;
  kind: string;
  transportMode?: string;
  slots?: number;
  tags?: string[];
}

export interface ForceUnitView extends ForceSummaryDto {
  className: string;
  description: string;
  role: ForceRole;
  battlegroup?: string;
  armour: number;
  speed: number;
  sensors: number;
  range: number;
  movementLabel: string;
  tags: string[];
  abilities: ForceAbilityView[];
  weapons: WeaponProfile[];
  equipment: ForceEquipmentView[];
  ammunition: Record<string, number>;
  cooldowns: Record<string, number>;
  supplies: Record<string, number>;
  cargo: ForceCargoView[];
  subsystems: ForceSubsystemView[];
  statusEffects: StatusEffectState[];
  history: ForceHistoryView[];
  serviceCampaigns: number;
  serviceRounds: number;
  serviceDamageSustained: number;
  serviceObjectivesCompleted: number;
  serviceUnitsDestroyed: number;
  serviceCommendations: number;
  descriptionText?: string;
}

export interface ForceCatalogueView {
  id: string;
  name: string;
  description: string;
  role: ForceRole;
  category: string;
  tags: string[];
  healthModel: HealthModel;
  maximumHealth: number;
  armour: number;
  speed: number;
  sensors: number;
  weapons: WeaponProfile[];
  weaponIds: string[];
  slots: Record<string, number>;
  abilities: ForceAbilityView[];
  movementLabel: string;
  movementProfileId: string;
  cargoSummary?: string;
  implementationStatus: ImplementationStatus;
  requisitionStatus: RequisitionStatus;
  availabilityStatus: AvailabilityStatus;
  availabilityReason?: string;
  requisitionCost: number | null;
  developerOverrideAllowed: boolean;
  initialEquipment: ForceEquipmentView[];
}

const now = Date.UTC(2026, 7, 9, 2, 0, 0);

const abilityCopy: Record<string, Omit<ForceAbilityView, "id">> = {
  DIG_IN: { name: "Dig In", description: "Prepare cover and improve the unit's staying power.", status: "CATALOGUE_ONLY" },
  FIRST_AID: { name: "First Aid", description: "Restore Force Strength to a valid friendly infantry target.", status: "CATALOGUE_ONLY" },
  DEPLOY_MASH: { name: "Deploy MASH", description: "Establish a forward medical support facility.", status: "CATALOGUE_ONLY" },
  STEALTH: { name: "Stealth Operations", description: "Reduce hostile detection until an interaction reveals the unit.", status: "CATALOGUE_ONLY" },
  SABOTAGE: { name: "Sabotage", description: "Place delayed charges against objectives or structures.", status: "CATALOGUE_ONLY" },
  CONSTRUCT: { name: "Construction", description: "Spend build supply to advance a persistent field project.", status: "CATALOGUE_ONLY" },
  REPAIR: { name: "Field Repair", description: "Restore a damaged vehicle or structure subsystem.", status: "CATALOGUE_ONLY" },
  INDIRECT_FIRE: { name: "Indirect Fire", description: "Fire on a hex observed by a valid friendly spotter.", status: "CATALOGUE_ONLY" },
  PACK_DEPLOY: { name: "Pack / Deploy", description: "Change the weapon platform's movement and firing state.", status: "CATALOGUE_ONLY" },
  RESUPPLY: { name: "Resupply", description: "Transfer compatible supplies or reload nearby units.", status: "CATALOGUE_ONLY" },
  TOW: { name: "Tow Platform", description: "Carry a compatible artillery platform as generic cargo.", status: "CATALOGUE_ONLY" },
  RAPID_FIRE: { name: "Rapid Fire", description: "Double the modified damage result against Horde targets before mitigation.", status: "IMPLEMENTED" },
  EVASIVE: { name: "Evasive", description: "Trade offensive options for a harder-to-hit movement pattern.", status: "CATALOGUE_ONLY" },
  TRANSPORT: { name: "Transport", description: "Embark and disembark compatible units using shared cargo rules.", status: "CATALOGUE_ONLY" },
  CREW_REPAIR: { name: "Crew Repair", description: "Attempt to recover a damaged internal subsystem.", status: "CATALOGUE_ONLY" },
  HOSTILE_PASSAGE: { name: "Mech Stride", description: "Pass through hostile ground formations while routing.", status: "CATALOGUE_ONLY" },
  INTERCEPT: { name: "Intercept", description: "Engage aerospace targets within the forward firing arc.", status: "CATALOGUE_ONLY" },
  REARM: { name: "Land & Rearm", description: "Recover expended ammunition at a compatible facility.", status: "CATALOGUE_ONLY" },
  BOMB_RUN: { name: "Bomb Run", description: "Strike a target hex crossed by the submitted flight path.", status: "CATALOGUE_ONLY" },
  AIRDROP: { name: "Airdrop", description: "Unload eligible cargo at a legal point along the flight path.", status: "CATALOGUE_ONLY" },
  ORBITAL_DROP: { name: "Orbital Drop", description: "Deploy from a compatible carrier into a legal surface zone.", status: "CATALOGUE_ONLY" },
};

function abilities(...ids: string[]): ForceAbilityView[] {
  return ids.map((id) => ({ id, ...(abilityCopy[id] ?? { name: readable(id), description: "Rules-defined unit capability.", status: "PARTIAL" as const }) }));
}

function readable(value: string): string {
  return value.replace(/^(ability|equipment|weapon|unit)-/, "").replaceAll("-", " ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function weapon(
  id: string,
  name: string,
  sides: number,
  range: number,
  armorPiercing: number,
  tags: string[] = [],
  ammoCapacity?: number,
): WeaponProfile {
  return { id, name, damage: { count: 1, sides }, range, armorPiercing, tags, ammoCapacity };
}

const weapons = {
  rifle: weapon("weapon-infantry-rifle", "Squad Small Arms", 6, 1, 0, ["PERSONNEL", "FS_CAPPED"]),
  powerRifle: weapon("weapon-power-rifle", "Powered Battle Rifle", 6, 1, 1, ["PERSONNEL"]),
  smg: weapon("weapon-compact-smg", "Compact SMG", 4, 1, 0, ["PERSONNEL"]),
  artillery: weapon("weapon-light-artillery", "Light Artillery Gun", 6, 5, 1, ["INDIRECT_FIRE"], 4),
  hmg: weapon("weapon-heavy-machine-gun", "Heavy Machine Gun", 4, 2, 0, ["RAPID_FIRE"], 6),
  autocannon: weapon("weapon-snub-autocannon", "Snub Auto-Cannon", 6, 2, 2, ["VEHICLE"]),
  cannon: weapon("weapon-main-cannon", "Main Cannon", 6, 2, 3, ["ANTI_ARMOUR"], 5),
  mechLaser: weapon("weapon-mech-laser", "Light Laser Cannon", 6, 2, 2, ["MECH"]),
  fighter: weapon("weapon-fighter-cannon", "Interceptor Cannon", 6, 2, 2, ["AEROSPACE", "FORWARD_ARC"], 4),
  bombs: weapon("weapon-cluster-bomb", "Cluster Bomb Rack", 6, 0, 1, ["ORDNANCE", "FLY_OVER"], 2),
  noseGun: weapon("weapon-vtol-nose-gun", "VTOL Nose Gun", 4, 2, 1, ["VTOL"], 4),
};

const readinessReady: DeploymentReadinessResult = {
  ready: true,
  blockers: [],
  warnings: [],
  requirements: [
    { id: "operational", label: "Operational", satisfied: true },
    { id: "aboard", label: "On battalion ship", satisfied: true },
    { id: "loadout", label: "Valid campaign loadout", satisfied: true },
  ],
};

const readinessDamaged: DeploymentReadinessResult = {
  ready: false,
  blockers: [{ code: "UNIT_DAMAGED", severity: "BLOCKER", message: "Mobility subsystem requires repair before deployment." }],
  warnings: [],
  requirements: [
    { id: "operational", label: "Operational", satisfied: false },
    { id: "aboard", label: "On battalion ship", satisfied: true },
    { id: "loadout", label: "Valid campaign loadout", satisfied: true },
  ],
};

const readinessNoFlightDeck: DeploymentReadinessResult = {
  ready: false,
  blockers: [{ code: "SHIP_CAPABILITY_MISSING", severity: "BLOCKER", message: "Battalion ship has no free aerospace support berth." }],
  warnings: [],
  requirements: [
    { id: "operational", label: "Operational", satisfied: true },
    { id: "aboard", label: "On battalion ship", satisfied: true },
    { id: "facility", label: "Aerospace facility available", satisfied: false },
  ],
};

interface ShowcaseInput {
  id: string;
  definitionId: string;
  callsign: string;
  name: string;
  className: string;
  description: string;
  role: ForceRole;
  healthModel: HealthModel;
  health: number;
  maximumHealth: number;
  armour: number;
  speed: number;
  sensors?: number;
  movement: string;
  status?: UnitStatus;
  location?: UnitLocationState;
  battlegroup?: string;
  tags: string[];
  abilityIds: string[];
  unitWeapons?: WeaponProfile[];
  equipment?: ForceEquipmentView[];
  ammunition?: Record<string, number>;
  supplies?: Record<string, number>;
  cargo?: ForceCargoView[];
  subsystems?: ForceSubsystemView[];
  readiness?: DeploymentReadinessResult;
  descriptionText?: string;
  history?: ForceHistoryView[];
  serviceCampaigns?: number;
  serviceRounds?: number;
}

function showcaseUnit(input: ShowcaseInput): ForceUnitView {
  const history = input.history ?? [
    { id: `${input.id}:deploy`, type: "DEPLOYED", summary: "Assigned to Operation Iron Rain.", campaign: "Operation Iron Rain", round: 1, timestamp: now - 86_400_000 },
    { id: `${input.id}:purchase`, type: "PURCHASED", summary: "Mustered into the 33rd Expeditionary Battalion.", timestamp: now - 7_776_000_000 },
  ];
  const unitWeapons = input.unitWeapons ?? [];
  return {
    unitId: input.id,
    definitionId: input.definitionId,
    callsign: input.callsign,
    name: input.name,
    className: input.className,
    description: input.description,
    role: input.role,
    status: input.status ?? "ACTIVE",
    locationState: input.location ?? "ON_SHIP",
    currentHealth: input.health,
    maximumHealth: input.maximumHealth,
    healthModel: input.healthModel,
    version: 1,
    readiness: input.readiness ?? readinessReady,
    battlegroups: input.battlegroup
      ? [{ id: `battlegroup-${input.battlegroup.toLowerCase()}`, name: readable(input.battlegroup), objective: "Combined-arms operational formation." }]
      : [],
    battlegroup: input.battlegroup,
    armour: input.armour,
    speed: input.speed,
    sensors: input.sensors ?? 4,
    range: Math.max(0, ...unitWeapons.map((item) => item.range)),
    movementLabel: input.movement,
    tags: input.tags,
    abilities: abilities(...input.abilityIds),
    weapons: unitWeapons,
    equipment: input.equipment ?? [],
    ammunition: input.ammunition ?? {},
    cooldowns: {},
    supplies: input.supplies ?? {},
    cargo: input.cargo ?? [],
    subsystems: input.subsystems ?? [],
    statusEffects: [],
    history,
    serviceCampaigns: input.serviceCampaigns ?? 1,
    serviceRounds: input.serviceRounds ?? 7,
    serviceDamageSustained: Math.max(0, input.maximumHealth - input.health),
    serviceObjectivesCompleted: history.filter((entry) => entry.type === "OBJECTIVE_COMPLETED").length,
    serviceUnitsDestroyed: 0,
    serviceCommendations: 0,
    descriptionText: input.descriptionText,
  };
}

const operationalVehicle: ForceSubsystemView[] = [
  { id: "weapons", name: "Weapons", state: "OPERATIONAL" },
  { id: "mobility", name: "Mobility", state: "OPERATIONAL" },
  { id: "sensors", name: "Sensors", state: "OPERATIONAL" },
];

export const SHOWCASE_FORCE: ForceUnitView[] = [
  showcaseUnit({ id: "force-raven-2", definitionId: "unit-infantry-squad", callsign: "RAVEN-2", name: "2nd Corinth Line Section", className: "Infantry", description: "Flexible line infantry configured for anti-armour defence.", role: "INFANTRY", healthModel: "FORCE_STRENGTH", health: 5, maximumHealth: 6, armour: 1, speed: 1, movement: "Infantry Ground", battlegroup: "HAMMER", tags: ["INFANTRY", "PERSONNEL", "TRANSPORTABLE", "DIG_IN"], abilityIds: ["DIG_IN", "ORBITAL_DROP"], unitWeapons: [weapons.rifle], equipment: [{ id: "equipment-flak-vests", name: "Flak Vests", slot: "SECONDARY", description: "Protective infantry armour package." }, { id: "equipment-light-at", name: "Light AT Launcher", slot: "PRIMARY", description: "Limited-use anti-armour weapon." }], ammunition: { "equipment-light-at": 2 }, descriptionText: "Veteran line section. Prefers prepared positions and short-range armour interdiction.", serviceCampaigns: 2, serviceRounds: 18 }),
  showcaseUnit({ id: "force-aegis", definitionId: "unit-power-armour", callsign: "AEGIS", name: "Aegis Powered Lance", className: "Power Armoured Infantry", description: "Elite infantry with vehicle-grade protection and drop capability.", role: "INFANTRY", healthModel: "FORCE_STRENGTH", health: 3, maximumHealth: 3, armour: 3, speed: 1, movement: "Powered Infantry", tags: ["INFANTRY", "PERSONNEL", "ARMOURED", "ORBITAL"], abilityIds: ["DIG_IN", "ORBITAL_DROP"], unitWeapons: [weapons.powerRifle], equipment: [{ id: "equipment-sealed-power-plate", name: "Sealed Power Plate", slot: "INTERNAL", description: "Powered protection and hostile-environment seal." }] }),
  showcaseUnit({ id: "force-doc-7", definitionId: "unit-combat-medic", callsign: "DOC-7", name: "7th Combat Medical Detachment", className: "Combat Medical Unit", description: "Forward medical support for infantry formations.", role: "SUPPORT", healthModel: "FORCE_STRENGTH", health: 3, maximumHealth: 3, armour: 0, speed: 1, movement: "Infantry Ground", battlegroup: "HAMMER", tags: ["INFANTRY", "PERSONNEL", "MEDICAL", "SUPPORT"], abilityIds: ["FIRST_AID", "DEPLOY_MASH"], unitWeapons: [weapons.smg], supplies: { MEDICAL: 4 }, equipment: [{ id: "equipment-field-medical-kit", name: "Field Medical Kit", slot: "MEDICAL", description: "Supplies First Aid and stabilisation actions." }] }),
  showcaseUnit({ id: "force-spectre", definitionId: "unit-special-forces", callsign: "SPECTRE", name: "Spectre Reconnaissance Cell", className: "Special Forces", description: "Low-signature reconnaissance and objective interdiction team.", role: "INFANTRY", healthModel: "FORCE_STRENGTH", health: 2, maximumHealth: 2, armour: 0, speed: 2, sensors: 6, movement: "Light Infantry Ground", tags: ["INFANTRY", "PERSONNEL", "STEALTH", "RECON"], abilityIds: ["STEALTH", "SABOTAGE"], unitWeapons: [weapons.smg], equipment: [{ id: "equipment-camo-mesh", name: "Adaptive Camo Mesh", slot: "INTERNAL", description: "Supports stealth projection and observation." }, { id: "equipment-demo-charge", name: "Delayed Charges", slot: "PRIMARY", description: "Objective and structure sabotage package." }] }),
  showcaseUnit({ id: "force-anvil", definitionId: "unit-combat-engineers", callsign: "ANVIL", name: "4th Combat Engineer Troop", className: "Combat Engineers", description: "Construction and vehicle-repair specialists.", role: "SUPPORT", healthModel: "FORCE_STRENGTH", health: 4, maximumHealth: 4, armour: 0, speed: 1, movement: "Infantry Ground", battlegroup: "HAMMER", tags: ["INFANTRY", "PERSONNEL", "ENGINEER", "LOGISTICS"], abilityIds: ["CONSTRUCT", "REPAIR"], supplies: { BUILD: 6, PARTS: 2 }, unitWeapons: [weapons.rifle], equipment: [{ id: "equipment-field-tools", name: "Field Engineering Tools", slot: "ENGINEER", description: "Construction, roadwork and repair equipment." }], history: [{ id: "anvil:project", type: "CONSTRUCTION_PROGRESS", summary: "Bunker Network reached 3 / 6 progress.", campaign: "Operation Iron Rain", round: 3, timestamp: now - 21_600_000 }, { id: "anvil:purchase", type: "PURCHASED", summary: "Mustered into the 33rd Expeditionary Battalion.", timestamp: now - 6_912_000_000 }] }),
  showcaseUnit({ id: "force-longbow", definitionId: "unit-light-artillery", callsign: "LONGBOW", name: "Longbow Field Battery", className: "Light Artillery", description: "Deployable indirect-fire platform requiring a friendly spotter.", role: "ARTILLERY", healthModel: "HITS", health: 2, maximumHealth: 2, armour: 0, speed: 1, sensors: 3, movement: "Towed Ground", tags: ["ARTILLERY", "VEHICLE", "INDIRECT_FIRE", "DEPLOYABLE"], abilityIds: ["INDIRECT_FIRE", "PACK_DEPLOY"], unitWeapons: [weapons.artillery], ammunition: { "weapon-light-artillery": 3 }, supplies: { AMMUNITION: 1 }, subsystems: [{ id: "weapon", name: "Artillery Gun", state: "OPERATIONAL" }, { id: "carriage", name: "Carriage", state: "OPERATIONAL" }] }),
  showcaseUnit({ id: "force-mule", definitionId: "unit-logistics-vehicle", callsign: "MULE-3", name: "3rd Field Logistics Section", className: "Logistics Vehicle", description: "Cargo, towing and ammunition transfer platform.", role: "SUPPORT", healthModel: "HITS", health: 2, maximumHealth: 2, armour: 0, speed: 3, movement: "Wheeled Ground", tags: ["VEHICLE", "LOGISTICS", "TRANSPORT", "TOWING"], abilityIds: ["RESUPPLY", "TOW", "TRANSPORT"], unitWeapons: [weapons.hmg], supplies: { SMALL_SUPPLY: 5, AMMUNITION: 3, PARTS: 2 }, cargo: [{ id: "cargo-supply", label: "Small Supply", quantity: 5, kind: "SUPPLY" }, { id: "cargo-parts", label: "Repair Parts", quantity: 2, kind: "SUPPLY" }], subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-nomad", definitionId: "unit-light-vehicle", callsign: "NOMAD", name: "Nomad Recon Vehicle", className: "Light Vehicle", description: "Fast reconnaissance and rapid-fire support vehicle.", role: "ARMOUR", healthModel: "HITS", health: 2, maximumHealth: 2, armour: 0, speed: 4, sensors: 6, movement: "Wheeled Ground", tags: ["VEHICLE", "LIGHT", "RAPID_FIRE", "EVASIVE", "TRANSPORT"], abilityIds: ["RAPID_FIRE", "EVASIVE", "TRANSPORT"], unitWeapons: [weapons.hmg], ammunition: { "weapon-heavy-machine-gun": 5 }, cargo: [{ id: "cargo-scouts", label: "Scout Team", quantity: 1, kind: "PERSONNEL" }], subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-carrier-6", definitionId: "unit-infantry-fighting-vehicle", callsign: "CARRIER-6", name: "6th Mechanised Infantry Carrier", className: "Infantry Fighting Vehicle", description: "Armoured infantry carrier with an anti-armour cannon.", role: "ARMOUR", healthModel: "HITS", health: 3, maximumHealth: 3, armour: 2, speed: 3, sensors: 4, movement: "Tracked Ground", battlegroup: "HAMMER", tags: ["VEHICLE", "ARMOURED", "TRANSPORT", "SUBSYSTEMS"], abilityIds: ["TRANSPORT", "CREW_REPAIR"], unitWeapons: [weapons.autocannon], cargo: [{ id: "cargo-raven", label: "Raven-3 Infantry", quantity: 1, kind: "PERSONNEL" }], subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-bellator", definitionId: "unit-main-battle-tank", callsign: "BELLATOR", name: "14th Armoured Platoon", className: "Main Battle Tank", description: "Heavy line-breaker with strong frontal armour and high AP.", role: "ARMOUR", healthModel: "HITS", health: 2, maximumHealth: 3, armour: 3, speed: 2, movement: "Tracked Ground", battlegroup: "HAMMER", tags: ["VEHICLE", "ARMOURED", "HEAVY", "SUBSYSTEMS", "FACING"], abilityIds: ["CREW_REPAIR"], unitWeapons: [weapons.cannon], ammunition: { "weapon-main-cannon": 4 }, subsystems: [{ id: "weapons", name: "Weapons", state: "OPERATIONAL" }, { id: "mobility", name: "Mobility", state: "DAMAGED" }, { id: "sensors", name: "Sensors", state: "OPERATIONAL" }], status: "DAMAGED", readiness: readinessDamaged, equipment: [{ id: "equipment-reactive-armour", name: "Reactive Armour", slot: "INTERNAL", description: "Supplemental vehicle protection." }, { id: "equipment-smoke-launchers", name: "Smoke Launchers", slot: "SECONDARY", description: "Defensive concealment system." }], serviceCampaigns: 3, serviceRounds: 24 }),
  showcaseUnit({ id: "force-strider", definitionId: "unit-light-mech", callsign: "STRIDER", name: "Strider Light Mech Lance", className: "Light Mech", description: "Mobile weapons platform able to stride through hostile formations.", role: "MECH", healthModel: "HITS", health: 3, maximumHealth: 3, armour: 2, speed: 4, sensors: 5, movement: "Mech Ground", tags: ["MECH", "ARMOURED", "SUBSYSTEMS", "EVASIVE"], abilityIds: ["HOSTILE_PASSAGE", "EVASIVE", "CREW_REPAIR"], unitWeapons: [weapons.mechLaser], subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-vulture", definitionId: "unit-aerospace-fighter", callsign: "VULTURE-1", name: "1st Vulture Interceptor", className: "Aerospace Fighter", description: "Forward-arc interceptor with limited ammunition and a flight path.", role: "AEROSPACE", healthModel: "HITS", health: 2, maximumHealth: 2, armour: 1, speed: 7, sensors: 7, movement: "Aerospace Flight", tags: ["AEROSPACE", "INTERCEPTOR", "EVASIVE", "FORWARD_ARC"], abilityIds: ["INTERCEPT", "EVASIVE", "REARM"], unitWeapons: [weapons.fighter], ammunition: { "weapon-fighter-cannon": 1 }, readiness: readinessNoFlightDeck }),
  showcaseUnit({ id: "force-hammer", definitionId: "unit-aerospace-bomber", callsign: "HAMMER-2", name: "2nd Hammer Bomber", className: "Aerospace Bomber", description: "Ordnance aircraft that attacks a target crossed by its route.", role: "AEROSPACE", healthModel: "HITS", health: 3, maximumHealth: 3, armour: 1, speed: 5, sensors: 5, movement: "Aerospace Flight", tags: ["AEROSPACE", "BOMBER", "ORDNANCE"], abilityIds: ["BOMB_RUN", "REARM"], unitWeapons: [weapons.bombs], ammunition: { "weapon-cluster-bomb": 2 } }),
  showcaseUnit({ id: "force-kestrel", definitionId: "unit-vtol", callsign: "KESTREL", name: "Kestrel VTOL Flight", className: "VTOL", description: "Air-mobile fire support and personnel transport.", role: "AEROSPACE", healthModel: "HITS", health: 3, maximumHealth: 3, armour: 1, speed: 5, sensors: 5, movement: "VTOL Flight", tags: ["VTOL", "AEROSPACE", "TRANSPORT"], abilityIds: ["TRANSPORT", "REARM"], unitWeapons: [weapons.noseGun], ammunition: { "weapon-vtol-nose-gun": 4 }, cargo: [{ id: "cargo-medic", label: "Medical Team", quantity: 1, kind: "PERSONNEL" }], subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-atlas", definitionId: "unit-heavy-aerospace-transport", callsign: "ATLAS", name: "Atlas Heavy Lift Wing", className: "Heavy Aerospace Transport", description: "Strategic airlifter carrying personnel, vehicles and supply.", role: "AEROSPACE", healthModel: "HITS", health: 5, maximumHealth: 5, armour: 2, speed: 4, sensors: 5, movement: "Heavy Aerospace Flight", tags: ["AEROSPACE", "HEAVY", "TRANSPORT", "AIRDROP"], abilityIds: ["TRANSPORT", "AIRDROP", "REARM"], cargo: [{ id: "cargo-infantry-a", label: "Raven-4 Infantry", quantity: 1, kind: "PERSONNEL" }, { id: "cargo-vehicle", label: "Light Vehicle", quantity: 1, kind: "VEHICLE" }, { id: "cargo-supply", label: "Small Supply", quantity: 5, kind: "SUPPLY" }], supplies: { SMALL_SUPPLY: 5 }, subsystems: operationalVehicle }),
  showcaseUnit({ id: "force-castellan", definitionId: "unit-main-battle-tank", callsign: "CASTELLAN", name: "Castellan Armoured Troop", className: "Main Battle Tank", description: "Lost during the defence of Outpost K-17.", role: "ARMOUR", healthModel: "HITS", health: 0, maximumHealth: 3, armour: 3, speed: 2, movement: "Tracked Ground", tags: ["VEHICLE", "ARMOURED", "HEAVY", "SUBSYSTEMS"], abilityIds: ["CREW_REPAIR"], unitWeapons: [weapons.cannon], status: "DESTROYED", location: "DESTROYED", readiness: { ready: false, blockers: [{ code: "UNIT_DESTROYED", severity: "BLOCKER", message: "Destroyed units remain in the memorial and cannot deploy." }], warnings: [], requirements: [{ id: "operational", label: "Operational", satisfied: false }] }, serviceCampaigns: 3, serviceRounds: 18, history: [{ id: "castellan:lost", type: "UNIT_DESTROYED", summary: "Destroyed holding the western approach to Outpost K-17.", campaign: "Outpost K-17", round: 32, timestamp: now - 3_600_000_000 }, { id: "castellan:honour", type: "OBJECTIVE_COMPLETED", summary: "Held Relay Theta through four assault waves.", campaign: "Outpost K-17", round: 29, timestamp: now - 3_610_000_000 }, { id: "castellan:purchase", type: "PURCHASED", summary: "Mustered into the 33rd Expeditionary Battalion.", timestamp: now - 18_144_000_000 }] }),
];

interface CatalogueInput {
  id: string;
  name: string;
  description: string;
  role: ForceRole;
  category: string;
  tags: string[];
  healthModel: HealthModel;
  maximumHealth: number;
  armour: number;
  speed: number;
  sensors: number;
  unitWeapons?: WeaponProfile[];
  slots?: Record<string, number>;
  abilityIds?: string[];
  movement: string;
  implementationStatus?: ImplementationStatus;
  availabilityStatus?: AvailabilityStatus;
  availabilityReason?: string;
  cargoSummary?: string;
}

function catalogueItem(input: CatalogueInput): ForceCatalogueView {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    role: input.role,
    category: input.category,
    tags: input.tags,
    healthModel: input.healthModel,
    maximumHealth: input.maximumHealth,
    armour: input.armour,
    speed: input.speed,
    sensors: input.sensors,
    weapons: input.unitWeapons ?? [],
    weaponIds: (input.unitWeapons ?? []).map((item) => item.id),
    slots: input.slots ?? {},
    abilities: abilities(...(input.abilityIds ?? [])),
    movementLabel: input.movement,
    movementProfileId: input.movement.toUpperCase().replaceAll(" ", "_"),
    cargoSummary: input.cargoSummary,
    implementationStatus: input.implementationStatus ?? "IMPLEMENTED",
    requisitionStatus: "BALANCE_REQUIRED",
    availabilityStatus: input.availabilityStatus ?? "DEV_ONLY",
    availabilityReason: input.availabilityReason ?? "Local showcase definitions cannot be persistently requisitioned.",
    requisitionCost: null,
    developerOverrideAllowed: false,
    initialEquipment: [],
  };
}

export const SHOWCASE_CATALOGUE: ForceCatalogueView[] = SHOWCASE_FORCE
  .filter((unit, index, roster) => unit.status !== "DESTROYED" && roster.findIndex((candidate) => candidate.definitionId === unit.definitionId) === index)
  .map((unit) => catalogueItem({
    id: unit.definitionId,
    name: unit.className,
    description: unit.description,
    role: unit.role,
    category: unit.role,
    tags: unit.tags,
    healthModel: unit.healthModel,
    maximumHealth: unit.maximumHealth,
    armour: unit.armour,
    speed: unit.speed,
    sensors: unit.sensors,
    unitWeapons: unit.weapons,
    slots: Object.fromEntries(unit.equipment.map((item) => [item.slot.toLowerCase(), 1])),
    abilityIds: unit.abilities.map((ability) => ability.id),
    movement: unit.movementLabel,
    cargoSummary: unit.cargo.length ? `${unit.cargo.reduce((total, item) => total + item.quantity, 0)} manifested cargo` : undefined,
  })).map((definition) => ({
    ...definition,
    initialEquipment: SHOWCASE_FORCE.find((unit) => unit.definitionId === definition.id)?.equipment ?? [],
  }));

export function roleFor(category: unknown, tags: string[]): ForceRole {
  const normalizedCategory = typeof category === "string" ? category.toUpperCase() : "";
  const set = new Set(tags.map((tag) => tag.toUpperCase()));
  if (normalizedCategory.includes("AERO") || set.has("AEROSPACE") || set.has("VTOL")) return "AEROSPACE";
  if (normalizedCategory.includes("ARTILLERY") || set.has("ARTILLERY") || set.has("INDIRECT_FIRE")) return "ARTILLERY";
  if (normalizedCategory.includes("MECH") || set.has("MECH")) return "MECH";
  if (normalizedCategory.includes("ARMOUR") || set.has("VEHICLE") || set.has("ARMOURED")) return "ARMOUR";
  if (normalizedCategory.includes("SUPPORT") || normalizedCategory.includes("ENGINEER") || set.has("MEDICAL") || set.has("ENGINEER") || set.has("LOGISTICS")) return "SUPPORT";
  return "INFANTRY";
}

export function readableId(value: string): string {
  return readable(value);
}

export function abilityRefsToViews(refs: AbilityRef[]): ForceAbilityView[] {
  return refs.map((ref) => {
    const key = ref.abilityId.replace(/^ability-/, "").toUpperCase().replaceAll("-", "_");
    return {
      id: ref.abilityId,
      ...(abilityCopy[key] ?? { name: readable(ref.abilityId), description: "Rules-defined unit capability.", status: "CATALOGUE_ONLY" as const }),
    };
  });
}

export function forceStatusMatches(unit: ForceUnitView, filter: ForceStatusFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "LOST") return unit.status === "DESTROYED" || unit.status === "RETIRED";
  if (filter === "DEPLOYED") return unit.status === "DEPLOYED" || unit.locationState === "ON_MAP";
  if (filter === "DAMAGED") return unit.status === "DAMAGED" || (unit.currentHealth > 0 && unit.currentHealth < unit.maximumHealth);
  return Boolean(unit.readiness?.ready) && !["DESTROYED", "RETIRED", "DEPLOYED"].includes(unit.status);
}

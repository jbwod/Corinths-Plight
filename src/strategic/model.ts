export type StrategicDataMode = "LOADING" | "LIVE" | "SHOWCASE" | "ERROR" | "AUTH_REQUIRED" | "NO_BATTALION";

export type ImplementationStatus = "IMPLEMENTED" | "PARTIAL" | "CATALOGUE_ONLY" | "DEFERRED";

export interface StrategicProfileView {
  userId: string;
  callsign: string;
  displayName: string;
  rankName: string;
  battalionName: string;
  timezone?: string;
}

export interface StrategicClockView {
  round: number;
  mode: "MANUAL" | "SCHEDULED" | "PAUSED";
  nextTickAt: number | null;
  ordersLockAt: number | null;
}

export interface ForceTotalsView {
  active: number;
  deployed: number;
  aboard: number;
  available: number;
  lost: number;
}

export interface BattalionSummaryView {
  id: string;
  name: string;
  shortName: string;
  description: string;
  motto?: string;
  status: string;
  currentUserRank: string;
  permissions: string[];
}

export interface RankView {
  id: string;
  name: string;
  precedence: number;
  memberCount: number;
  permissions: string[];
}

export interface BattalionMemberView {
  id: string;
  userId: string;
  callsign: string;
  displayName: string;
  rankId: string;
  rankName: string;
  status: string;
  battlegroupIds: string[];
  lastActiveAt: number | null;
}

export interface BattlegroupView {
  id: string;
  name: string;
  callsign: string;
  commanderCallsign?: string;
  status: string;
  currentLocation: string;
  currentOperation?: string;
  unitCount: number;
  memberCount: number;
  capabilities: string[];
  intention?: string;
}

export interface ActivityView {
  id: string;
  type: string;
  summary: string;
  occurredAt: number;
  actorCallsign?: string;
}

export interface ModuleView {
  id: string;
  name: string;
  slotType: "INTERNAL" | "EXTERNAL" | "EXTERNAL_INTERNAL";
  slotIndex: number;
  state: string;
  implementationStatus: ImplementationStatus;
  capabilities: string[];
}

export interface ShipCapacityView {
  id: string;
  label: string;
  used: number | null;
  total: number | null;
  status: "AVAILABLE" | "FULL" | "UNAVAILABLE" | "UNKNOWN";
  source: string;
}

export interface ShipCargoView {
  id: string;
  label: string;
  quantity: number | null;
  supplySize?: "LARGE" | "MEDIUM" | "SMALL";
  location: string;
}

export interface EmbarkedUnitView {
  id: string;
  callsign: string;
  className: string;
  battlegroupName?: string;
  state: string;
}

export interface ShipView {
  id: string;
  name: string;
  className: string;
  registry: string;
  location: string;
  status: string;
  version: number;
  internalSlots: number;
  externalSlots: number;
  modules: ModuleView[];
  capabilities: string[];
  capacities: ShipCapacityView[];
  cargo: ShipCargoView[];
  embarkedUnits: EmbarkedUnitView[];
  supply: {
    largeCurrent: number | null;
    largeCapacity: number | null;
    state: string;
    suppliedUntilRound: number | null;
    mediumAccess: boolean | null;
    smallAccess: boolean | null;
  };
  taskForce: {
    id: string;
    name: string;
    status: string;
    location: string;
    intention?: string;
  };
}

export type OperationStatus = "ACTIVE" | "MUSTERING" | "AVAILABLE" | "RESOLVED" | "FAILED" | "CANCELLED" | string;

export interface OperationView {
  id: string;
  campaignId?: string;
  name: string;
  location: string;
  nodeId: string;
  status: OperationStatus;
  role: string;
  threat?: string;
  strategicImportance: string;
  objectives: string[];
  recommendedCapabilities: string[];
  assignedBattlegroups: string[];
  reinforcementState: string;
  knownEnemy?: string;
  environment: string[];
  tacticalRound: number | null;
  implementationStatus: ImplementationStatus;
}

export type StrategicNodeControl = "FRIENDLY" | "CONTESTED" | "HOSTILE" | "NEUTRAL" | "UNKNOWN";

export interface StrategicNodeView {
  id: string;
  name: string;
  type: string;
  locationId: string;
  planetLocationId?: string;
  parentName?: string;
  control: StrategicNodeControl;
  x: number;
  y: number;
  operationIds: string[];
  forceIds: string[];
  supplyAvailable: boolean;
}

export interface StrategicRouteView {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  status: string;
  movementProfiles: string[];
  travelRounds: number | null;
}

export interface MapFormationView {
  id: string;
  kind: "TASK_FORCE" | "BATTLEGROUP";
  name: string;
  status: string;
  nodeId: string;
  intention?: string;
  routeNodeIds: string[];
  version: number;
  carrierTaskForceId?: string;
  capabilities: string[];
}

export interface StrategicMapView {
  id: string;
  name: string;
  scope: string;
  version: number;
  nodes: StrategicNodeView[];
  routes: StrategicRouteView[];
  formations: MapFormationView[];
  viewerPermissions: string[];
}

export interface StrategicSnapshot {
  profile: StrategicProfileView;
  clock: StrategicClockView;
  forces: ForceTotalsView;
  battalion: BattalionSummaryView;
  ranks: RankView[];
  members: BattalionMemberView[];
  battlegroups: BattlegroupView[];
  activity: ActivityView[];
  ship: ShipView;
  operations: OperationView[];
  map: StrategicMapView;
}

const showcaseTimestamp = Date.parse("2026-08-09T11:03:00Z");

export const SHOWCASE_STRATEGIC_SNAPSHOT: StrategicSnapshot = {
  profile: {
    userId: "demo-user",
    callsign: "JBW",
    displayName: "J. Blackwood",
    rankName: "Lieutenant",
    battalionName: "33rd Expeditionary",
    timezone: "Australia/Sydney",
  },
  clock: {
    round: 28,
    mode: "MANUAL",
    nextTickAt: null,
    ordersLockAt: null,
  },
  forces: { active: 14, deployed: 0, aboard: 14, available: 0, lost: 1 },
  battalion: {
    id: "battalion-33rd-expeditionary",
    name: "33rd Expeditionary Battalion",
    shortName: "33RD EXP",
    description: "A cooperative combined-arms formation operating from CSV Resolute in the Helion theatre.",
    motto: "Hold fast. Move together.",
    status: "ACTIVE",
    currentUserRank: "Lieutenant",
    permissions: ["SHIP_VIEW", "SUPPLY_VIEW", "UNIT_DEPLOY_SELF"],
  },
  ranks: [
    { id: "rank-colonel", name: "Colonel", precedence: 10, memberCount: 1, permissions: ["BATTALION_EDIT", "MEMBER_INVITE", "RANK_MANAGE", "OPERATION_COMMAND", "SHIP_MOVE", "STRATEGIC_ORDER_APPROVE"] },
    { id: "rank-major", name: "Major", precedence: 20, memberCount: 1, permissions: ["MEMBER_INVITE", "BATTLEGROUP_CREATE", "OPERATION_CREATE", "OPERATION_COMMAND", "STRATEGIC_ORDER_CREATE"] },
    { id: "rank-captain", name: "Captain", precedence: 30, memberCount: 2, permissions: ["BATTLEGROUP_EDIT", "BATTLEGROUP_ASSIGN", "STRATEGIC_ORDER_CREATE"] },
    { id: "rank-lieutenant", name: "Lieutenant", precedence: 40, memberCount: 2, permissions: ["SHIP_VIEW", "SUPPLY_VIEW", "UNIT_DEPLOY_SELF"] },
  ],
  members: [
    { id: "member-mercer", userId: "user-mercer", callsign: "MERCER", displayName: "J. Mercer", rankId: "rank-colonel", rankName: "Colonel", status: "ACTIVE", battlegroupIds: [], lastActiveAt: showcaseTimestamp },
    { id: "member-vega", userId: "user-vega", callsign: "VEGA", displayName: "M. Vega", rankId: "rank-major", rankName: "Major", status: "ACTIVE", battlegroupIds: [], lastActiveAt: showcaseTimestamp - 1_860_000 },
    { id: "member-holt", userId: "user-holt", callsign: "HAVOC", displayName: "C. Holt", rankId: "rank-captain", rankName: "Captain", status: "ACTIVE", battlegroupIds: ["battlegroup-hammer"], lastActiveAt: showcaseTimestamp - 4_320_000 },
    { id: "member-cross", userId: "user-cross", callsign: "CROSS", displayName: "L. Cross", rankId: "rank-lieutenant", rankName: "Lieutenant", status: "ACTIVE", battlegroupIds: ["battlegroup-raven"], lastActiveAt: showcaseTimestamp - 7_200_000 },
    { id: "member-jbw", userId: "demo-user", callsign: "JBW", displayName: "J. Blackwood", rankId: "rank-lieutenant", rankName: "Lieutenant", status: "ACTIVE", battlegroupIds: ["battlegroup-hammer"], lastActiveAt: showcaseTimestamp },
  ],
  battlegroups: [
    {
      id: "battlegroup-hammer",
      name: "Battlegroup Hammer",
      callsign: "HAMMER",
      commanderCallsign: "HAVOC",
      status: "EMBARKED",
      currentLocation: "CSV Resolute · Corinth High Orbit",
      unitCount: 6,
      memberCount: 3,
      capabilities: ["GROUND_COMBAT", "ARMOURED", "ENGINEERING", "ARTILLERY"],
      intention: "Combined-arms reserve aboard CSV Resolute.",
    },
    {
      id: "battlegroup-raven",
      name: "Battlegroup Raven",
      callsign: "RAVEN",
      commanderCallsign: "CROSS",
      status: "EMBARKED",
      currentLocation: "CSV Resolute · Corinth High Orbit",
      unitCount: 4,
      memberCount: 2,
      capabilities: ["GROUND_COMBAT", "RECON", "AIR_MOBILE"],
      intention: "Held aboard as rapid-response reserve.",
    },
  ],
  activity: [
    { id: "strategic-event-raven-embarked", type: "BATTLEGROUP_EMBARKED", summary: "Battlegroup Raven embarked aboard the Resolute Task Force.", occurredAt: showcaseTimestamp, actorCallsign: "JBW" },
    { id: "strategic-event-hammer-embarked", type: "BATTLEGROUP_EMBARKED", summary: "Battlegroup Hammer embarked aboard the Resolute Task Force.", occurredAt: showcaseTimestamp - 1_000, actorCallsign: "JBW" },
    { id: "strategic-event-resolute-large-supply", type: "SUPPLY_CONSUMED", summary: "Resolute Task Force consumed 1 Large Supply and is supplied through round 29.", occurredAt: showcaseTimestamp - 2_000, actorCallsign: "JBW" },
    { id: "strategic-event-resolute-arrived-corinth", type: "TASK_FORCE_ARRIVED", summary: "CSV Resolute entered Corinth High Orbit.", occurredAt: showcaseTimestamp - 3_000 },
  ],
  ship: {
    id: "ship-corinth-ward",
    name: "CSV Resolute",
    className: "Destroyer",
    registry: "CSV-RESOLUTE",
    location: "Corinth High Orbit",
    status: "ORBIT",
    version: 1,
    internalSlots: 4,
    externalSlots: 3,
    modules: [
      { id: "equipment-carrier-flight-deck", name: "Carrier Flight Deck", slotType: "EXTERNAL", slotIndex: 0, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_AEROSPACE", "LAND_VTOL", "LAND_AEROSPACE", "REPAIR_AEROSPACE", "REARM_AEROSPACE"] },
      { id: "equipment-vtol-bay", name: "VTOL Bay", slotType: "EXTERNAL", slotIndex: 1, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_VTOL", "LAND_VTOL", "REPAIR_AEROSPACE", "REARM_AEROSPACE"] },
      { id: "equipment-mech-bay", name: "Mech Bay", slotType: "EXTERNAL", slotIndex: 2, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_MECH", "CARRY_HEAVY_VEHICLE", "REPAIR_MECH", "REPAIR_VEHICLE", "REFIT_MECH"] },
      { id: "equipment-armory", name: "Armory", slotType: "INTERNAL", slotIndex: 0, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["REARM_INFANTRY", "CHANGE_INFANTRY_LOADOUT"] },
      { id: "equipment-mobile-infantry", name: "Mobile Infantry Upgrade", slotType: "EXTERNAL_INTERNAL", slotIndex: 0, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_INFANTRY"] },
      { id: "equipment-heavy-ground-vehicle-bay", name: "Heavy Ground Vehicle Bay", slotType: "INTERNAL", slotIndex: 2, state: "OPERATIONAL", implementationStatus: "PARTIAL", capabilities: ["CARRY_LIGHT_VEHICLE", "CARRY_HEAVY_VEHICLE", "REPAIR_VEHICLE"] },
    ],
    capabilities: ["CARRY_INFANTRY", "CARRY_LIGHT_VEHICLE", "CARRY_HEAVY_VEHICLE", "CARRY_MECH", "CARRY_VTOL", "CARRY_AEROSPACE", "LAND_VTOL", "LAND_AEROSPACE", "REPAIR_VEHICLE", "REPAIR_MECH", "REPAIR_AEROSPACE", "REARM_INFANTRY", "REARM_AEROSPACE", "CHANGE_INFANTRY_LOADOUT", "REFIT_MECH"],
    capacities: [
      { id: "capacity-infantry", label: "Infantry transport", used: null, total: 2, status: "AVAILABLE", source: "Mobile Infantry Upgrade" },
      { id: "capacity-heavy-vehicle", label: "Heavy vehicle transport", used: null, total: 4, status: "AVAILABLE", source: "Mech Bay + Heavy Ground Vehicle Bay" },
      { id: "capacity-vtol", label: "VTOL operations", used: null, total: 2, status: "AVAILABLE", source: "VTOL Bay" },
      { id: "capacity-mech", label: "Mech support", used: null, total: 2, status: "AVAILABLE", source: "Mech Bay" },
    ],
    cargo: [
      { id: "cargo-large-supply", label: "Large Supply", quantity: 3, supplySize: "LARGE", location: "CSV Resolute · Cargo Bay" },
      { id: "cargo-small-supply-access", label: "Small Supply access", quantity: null, supplySize: "SMALL", location: "CSV Resolute · Cargo Bay" },
    ],
    embarkedUnits: [
      { id: "force-spectre", callsign: "SPECTRE", className: "Special Forces", battlegroupName: "Battlegroup Raven", state: "EMBARKED" },
      { id: "force-nomad", callsign: "NOMAD", className: "Light Vehicle", battlegroupName: "Battlegroup Raven", state: "EMBARKED" },
      { id: "force-kestrel", callsign: "KESTREL", className: "VTOL", battlegroupName: "Battlegroup Raven", state: "EMBARKED" },
    ],
    supply: {
      largeCurrent: 3,
      largeCapacity: 4,
      state: "SUPPLIED",
      suppliedUntilRound: 29,
      mediumAccess: true,
      smallAccess: true,
    },
    taskForce: {
      id: "task-force-resolute",
      name: "Resolute Task Force",
      status: "READY",
      location: "Corinth High Orbit",
      intention: "Support the Corinth Expedition and recover deployed Battlegroups.",
    },
  },
  operations: [
    {
      id: "strategic-operation-iron-rain",
      campaignId: "operation-iron-rain",
      name: "Operation Iron Rain",
      location: "Kestrel Ridge",
      nodeId: "node-kestrel-ridge",
      status: "MUSTERING",
      role: "Front-line assault",
      threat: "HIGH",
      strategicImportance: "Secure the ridge and its airfield approach for the northern advance.",
      objectives: ["Hold Airfield", "Destroy Hive"],
      recommendedCapabilities: ["ARMOURED", "GROUND_COMBAT", "ENGINEERING", "ARTILLERY"],
      assignedBattlegroups: [],
      reinforcementState: "OPEN",
      knownEnemy: "Bug infestation · tactical intelligence limited",
      environment: ["Planet and campaign modifiers are server-configured"],
      tacticalRound: null,
      implementationStatus: "PARTIAL",
    },
    {
      id: "strategic-operation-night-glass",
      name: "Operation Night Glass",
      location: "New Carthage",
      nodeId: "node-new-carthage",
      status: "ANNOUNCED",
      role: "Recon / rapid response",
      strategicImportance: "Establish current contact and protect the southern population centre.",
      objectives: ["Confirm enemy approach", "Preserve the evacuation corridor"],
      recommendedCapabilities: ["RECON", "GROUND_COMBAT", "AIR_MOBILE"],
      assignedBattlegroups: [],
      reinforcementState: "UNPUBLISHED",
      knownEnemy: "Unconfirmed contacts",
      environment: ["Campaign briefing pending authoritative tactical configuration"],
      tacticalRound: null,
      implementationStatus: "PARTIAL",
    },
    {
      id: "strategic-operation-broken-road",
      name: "Operation Broken Road",
      location: "Junction 7",
      nodeId: "node-junction-7",
      status: "ANNOUNCED",
      role: "Logistics defence",
      strategicImportance: "Keep the surface supply route open between the airbase and Kestrel Ridge.",
      objectives: ["Defend Junction 7", "Protect logistics traffic"],
      recommendedCapabilities: ["GROUND_COMBAT", "ENGINEERING", "LOGISTICS"],
      assignedBattlegroups: [],
      reinforcementState: "NOT YET DEPLOYED",
      knownEnemy: "Bug pressure reported along the route",
      environment: ["Surface route"],
      tacticalRound: null,
      implementationStatus: "PARTIAL",
    },
  ],
  map: {
    id: "strategic-map-corinth",
    name: "The Corinth Expedition",
    scope: "PLANETARY THEATRE",
    version: 1,
    viewerPermissions: [
      "SHIP_VIEW",
      "SUPPLY_VIEW",
      "SHIP_MOVE",
      "STRATEGIC_ORDER_CREATE",
      "STRATEGIC_ORDER_APPROVE",
    ],
    nodes: [
      { id: "node-corinth-high-orbit", name: "Corinth High Orbit", type: "ORBIT", locationId: "location-corinth-high-orbit", parentName: "Corinth", control: "FRIENDLY", x: 48, y: 12, operationIds: [], forceIds: ["task-force-resolute", "battlegroup-hammer", "battlegroup-raven"], supplyAvailable: true },
      { id: "node-north-airbase", name: "North Airbase", type: "BASE", locationId: "location-north-airbase", parentName: "Corinth", control: "FRIENDLY", x: 38, y: 34, operationIds: [], forceIds: [], supplyAvailable: true },
      { id: "node-kestrel-ridge", name: "Kestrel Ridge", type: "OBJECTIVE", locationId: "location-kestrel-ridge", parentName: "Corinth", control: "CONTESTED", x: 27, y: 50, operationIds: ["strategic-operation-iron-rain"], forceIds: [], supplyAvailable: false },
      { id: "node-outpost-k17", name: "Outpost K-17", type: "BASE", locationId: "location-outpost-k17", parentName: "Corinth", control: "FRIENDLY", x: 17, y: 68, operationIds: [], forceIds: [], supplyAvailable: false },
      { id: "node-new-carthage", name: "New Carthage", type: "CITY", locationId: "location-new-carthage", parentName: "Corinth", control: "CONTESTED", x: 62, y: 65, operationIds: ["strategic-operation-night-glass"], forceIds: [], supplyAvailable: false },
      { id: "node-hive-basin", name: "Hive Basin", type: "OBJECTIVE", locationId: "location-hive-basin", parentName: "Corinth", control: "HOSTILE", x: 81, y: 75, operationIds: [], forceIds: [], supplyAvailable: false },
      { id: "node-junction-7", name: "Junction 7", type: "JUNCTION", locationId: "location-junction-7", parentName: "Corinth", control: "CONTESTED", x: 52, y: 51, operationIds: ["strategic-operation-broken-road"], forceIds: [], supplyAvailable: false },
      { id: "node-corinth-ii", name: "Corinth II", type: "PLANET", locationId: "location-corinth-ii", control: "UNKNOWN", x: 75, y: 18, operationIds: [], forceIds: [], supplyAvailable: false },
      { id: "node-relay-kappa", name: "Relay Station Kappa", type: "STATION", locationId: "location-relay-kappa", control: "FRIENDLY", x: 62, y: 8, operationIds: [], forceIds: [], supplyAvailable: false },
      { id: "node-helion-jump-point", name: "Helion Jump Point", type: "JUMP_POINT", locationId: "location-helion-jump-point", control: "NEUTRAL", x: 89, y: 6, operationIds: [], forceIds: [], supplyAvailable: false },
    ],
    routes: [
      { id: "route-corinth-orbit-relay-kappa", fromNodeId: "node-corinth-high-orbit", toNodeId: "node-relay-kappa", status: "OPEN", movementProfiles: ["TASK_FORCE"], travelRounds: null },
      { id: "route-relay-kappa-corinth-ii", fromNodeId: "node-relay-kappa", toNodeId: "node-corinth-ii", status: "OPEN", movementProfiles: ["TASK_FORCE"], travelRounds: null },
      { id: "route-relay-kappa-helion-jump", fromNodeId: "node-relay-kappa", toNodeId: "node-helion-jump-point", status: "OPEN", movementProfiles: ["TASK_FORCE"], travelRounds: null },
      { id: "route-corinth-orbit-north-airbase", fromNodeId: "node-corinth-high-orbit", toNodeId: "node-north-airbase", status: "OPEN", movementProfiles: ["AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
      { id: "route-north-airbase-kestrel-ridge", fromNodeId: "node-north-airbase", toNodeId: "node-kestrel-ridge", status: "OPEN", movementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
      { id: "route-kestrel-outpost-k17", fromNodeId: "node-kestrel-ridge", toNodeId: "node-outpost-k17", status: "LOCKED", movementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
      { id: "route-north-airbase-junction-7", fromNodeId: "node-north-airbase", toNodeId: "node-junction-7", status: "OPEN", movementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
      { id: "route-junction-7-new-carthage", fromNodeId: "node-junction-7", toNodeId: "node-new-carthage", status: "OPEN", movementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
      { id: "route-junction-7-hive-basin", fromNodeId: "node-junction-7", toNodeId: "node-hive-basin", status: "OPEN", movementProfiles: ["GROUND_BATTLEGROUP", "AIR_MOBILE_BATTLEGROUP"], travelRounds: null },
    ],
    formations: [
      { id: "task-force-resolute", kind: "TASK_FORCE", name: "Resolute Task Force", status: "READY", nodeId: "node-corinth-high-orbit", intention: "Support the Corinth Expedition", routeNodeIds: [], version: 1, capabilities: ["GROUND_COMBAT", "LOGISTICS"] },
      { id: "battlegroup-hammer", kind: "BATTLEGROUP", name: "Battlegroup Hammer", status: "EMBARKED", nodeId: "node-corinth-high-orbit", intention: "Combined-arms reserve", routeNodeIds: [], version: 1, carrierTaskForceId: "task-force-resolute", capabilities: ["GROUND_COMBAT", "ARMOURED", "ENGINEERING", "ARTILLERY"] },
      { id: "battlegroup-raven", kind: "BATTLEGROUP", name: "Battlegroup Raven", status: "EMBARKED", nodeId: "node-corinth-high-orbit", intention: "Rapid-response reserve", routeNodeIds: [], version: 1, carrierTaskForceId: "task-force-resolute", capabilities: ["GROUND_COMBAT", "RECON", "AIR_MOBILE"] },
    ],
  },
};

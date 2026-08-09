export const RULESET_VERSION = "v5-core-curated@1" as const;

export type DefinitionStatus = "active" | "experimental" | "legacy" | "incomplete";
export type DefinitionKind =
  | "unit-class"
  | "weapon"
  | "equipment"
  | "action"
  | "order-type"
  | "structure"
  | "terrain"
  | "ship-class"
  | "enemy";

export interface RuleMetadata {
  rulesetVersion: string;
  source: string;
  status: DefinitionStatus;
  notes?: string;
  conflictIds?: string[];
}

export interface GameDefinition extends RuleMetadata {
  id: string;
  kind: DefinitionKind;
  name: string;
  description: string;
  tags: string[];
}

export type HealthModel = "FORCE_STRENGTH" | "HITS";
export type UnitStatus = "ACTIVE" | "DEPLOYED" | "DAMAGED" | "DESTROYED" | "RETIRED";
export type DeploymentStatus = "READY" | "ACTIVE" | "IMMOBILISED" | "DESTROYED" | "WITHDRAWN";
export type FactionSide = "ALLIED" | "ENEMY" | "NEUTRAL";
export type Facing = 0 | 1 | 2 | 3 | 4 | 5;

export interface DiceProfile {
  count: number;
  sides: number;
  modifier?: number;
}

export interface WeaponProfile {
  id: string;
  name: string;
  damage: DiceProfile;
  range: number;
  armorPiercing: number;
  indirect?: boolean;
  ammoCapacity?: number;
  cooldownRounds?: number;
  tags: string[];
}

export interface UnitStats {
  healthModel: HealthModel;
  maxHealth: number;
  armor: number;
  defense: number;
  speed: number;
  sensors: number;
  capacity: number;
}

export interface UnitClassDefinition extends GameDefinition {
  kind: "unit-class" | "enemy";
  category: "INFANTRY" | "ARMOUR" | "ARTILLERY" | "ENGINEER" | "AEROSPACE" | "MECH" | "SUPPORT" | "ENEMY";
  stats: UnitStats;
  weapons: WeaponProfile[];
  requisitionCost: number | null;
  slots: Record<string, number>;
  allowedOrders: string[];
  allowedActions: string[];
}

export interface EquipmentDefinition extends GameDefinition {
  kind: "equipment";
  category: string;
  slotType: string;
  cost: number | null;
  allowedClasses: string[];
  requiredEquipment: string[];
  incompatibleEquipment: string[];
  statModifiers: Partial<UnitStats>;
  abilityGrants: string[];
  ammoCapacity?: number;
  cooldownRounds?: number;
  consumable: boolean;
  rulesText: string;
}

export interface AxialCoord {
  q: number;
  r: number;
}

export interface HexEdgeFeatures {
  rivers: Facing[];
  roads: Facing[];
}

export type VisibilityState = "VISIBLE" | "OBSERVED" | "UNKNOWN";

export interface BattlefieldHex {
  coord: AxialCoord;
  terrainId: string;
  elevation: number;
  movementCost: number;
  blocksLineOfSight: boolean;
  lineOfSightModifier: number;
  capacity: number;
  edges: HexEdgeFeatures;
  structureIds: string[];
  objectiveId?: string;
  control: FactionSide;
  environment: string[];
  visibility?: VisibilityState;
}

export interface PlayerUnit {
  id: string;
  ownerId: string;
  definitionId: string;
  callsign: string;
  name: string;
  status: UnitStatus;
  currentHealth: number;
  equipmentIds: string[];
  ammunition: Record<string, number>;
  cooldowns: Record<string, number>;
  damage: string[];
  requisitionValue: number;
  campaignHistory: string[];
}

export interface CampaignDeployment {
  id: string;
  campaignId: string;
  persistentUnitId?: string;
  ownerId: string;
  side: FactionSide;
  definitionId: string;
  callsign: string;
  status: DeploymentStatus;
  position: AxialCoord;
  facing: Facing;
  stats: UnitStats;
  currentHealth: number;
  weapons: WeaponProfile[];
  ammunition: Record<string, number>;
  cooldowns: Record<string, number>;
  statuses: string[];
  equipmentIds: string[];
  battlegroupId?: string;
}

export type OrderLifecycle =
  | "DRAFT"
  | "SUBMITTED"
  | "LOCKED"
  | "RESOLVING"
  | "RESOLVED"
  | "FAILED"
  | "CANCELLED";
export type OrderType = "HOLD" | "ADVANCE" | "RUSH" | "EVASIVE" | "MELEE_CHARGE" | "STEALTH";
export type ActionType =
  | "ATTACK"
  | "ASSAULT"
  | "DIG_IN"
  | "BREAK_OUT"
  | "DEPLOY"
  | "PACK_UP"
  | "REPAIR"
  | "CONSTRUCT"
  | "GARRISON"
  | "LOAD"
  | "UNLOAD"
  | "RESUPPLY"
  | "RELOAD"
  | "SCAN"
  | "DEPLOY_DRONE"
  | "HEAL"
  | "ORBITAL_DROP"
  | "BOMBARDMENT"
  | "AIR_SUPPORT";
export type ActionEconomy = "STANDARD" | "PRIMARY" | "INCIDENTAL";

export interface StructuredAction {
  id: string;
  type: ActionType;
  economy: ActionEconomy;
  speedCost: number;
  targetDeploymentId?: string;
  targetHex?: AxialCoord;
  weaponId?: string;
  equipmentIds: string[];
  ammoRequested?: number;
  payload?: Record<string, unknown>;
}

export interface UnitOrder {
  id: string;
  revision: number;
  unitId: string;
  campaignId: string;
  round: number;
  orderType: OrderType;
  lifecycle: OrderLifecycle;
  startHex: AxialCoord;
  route: AxialCoord[];
  endHex: AxialCoord;
  facing: Facing;
  actions: StructuredAction[];
  targets: string[];
  equipmentUsed: string[];
  ammoUsed: Record<string, number>;
  incidentalActions: StructuredAction[];
  optionalRoleplayText?: string;
  submittedBy: string;
  submittedAt: number;
}

export type CampaignPhase = "PLANNING" | "LOCKED" | "RESOLVING" | "PAUSED" | "COMPLETE" | "FAILED";
export type ScheduledEventType = "ORDER_LOCK" | "ROUND_RESOLVE" | "CAMPAIGN_END";

export interface ScheduledCampaignEvent {
  id: string;
  type: ScheduledEventType;
  round: number;
  runAt: number;
}

export interface CampaignClock {
  durationMs: number;
  lockLeadMs: number;
  roundStartedAt: number;
  lockAt: number;
  resolvesAt: number;
  pausedAt?: number;
  phaseBeforePause?: Exclude<CampaignPhase, "PAUSED">;
  schedule: ScheduledCampaignEvent[];
}

export type CampaignEventType =
  | "ROUND_STARTED"
  | "ORDER_SUBMITTED"
  | "ORDER_REJECTED"
  | "ORDER_LOCKED"
  | "UNIT_MOVED"
  | "UNIT_BLOCKED"
  | "UNIT_ATTACKED"
  | "DICE_ROLLED"
  | "DAMAGE_APPLIED"
  | "UNIT_DESTROYED"
  | "STRUCTURE_COMPLETED"
  | "SUPPLY_TRANSFERRED"
  | "OBJECTIVE_CAPTURED"
  | "ROUND_FINISHED"
  | "CAMPAIGN_PAUSED"
  | "CAMPAIGN_RESUMED";

export interface CampaignEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  campaignId: string;
  round: number;
  sequence: number;
  type: CampaignEventType;
  actor?: string;
  payload: TPayload;
  timestamp: number;
  visibility: "PUBLIC" | "ALLIED" | "ENEMY" | "ADMIN";
}

export interface ObjectiveState {
  id: string;
  name: string;
  coord: AxialCoord;
  owner: FactionSide;
  status: "ACTIVE" | "SECURED" | "FAILED";
  description: string;
}

export interface PendingPersistentEffect {
  idempotencyKey: string;
  type: "UNIT_DESTROYED" | "UNIT_DAMAGED" | "REQUISITION_AWARDED" | "CAMPAIGN_HISTORY";
  unitId?: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "APPLIED" | "FAILED";
}

export interface ResolutionRecord {
  key: string;
  campaignId: string;
  round: number;
  seed: string;
  startedAt: number;
  committedAt: number;
  eventIds: string[];
  stateDigest: string;
}

export interface CampaignRuntimeState {
  campaignId: string;
  campaignName: string;
  planetName: string;
  rulesetVersion: string;
  engineVersion: string;
  round: number;
  phase: CampaignPhase;
  clock: CampaignClock;
  map: BattlefieldHex[];
  deployments: CampaignDeployment[];
  orders: UnitOrder[];
  objectives: ObjectiveState[];
  events: CampaignEvent[];
  resolutions: Record<string, ResolutionRecord>;
  pendingPersistentEffects: PendingPersistentEffect[];
  version: number;
}

export interface RoundInput {
  previousState: CampaignRuntimeState;
  rulesetVersion: string;
  playerOrders: UnitOrder[];
  enemyOrders: UnitOrder[];
  seed: string;
  resolutionTime: number;
}

export interface RoundOutput {
  state: CampaignRuntimeState;
  events: CampaignEvent[];
  persistentEffects: PendingPersistentEffect[];
  digest: string;
}

export interface ViewerContext {
  userId: string;
  side: FactionSide;
  role: "PLAYER" | "BATTALION_COMMAND" | "ADMIN";
  battalionId?: string;
}

export interface CampaignView extends Omit<CampaignRuntimeState, "resolutions" | "pendingPersistentEffects"> {
  viewer: ViewerContext;
  serverTime: number;
  connectionToken?: string;
}

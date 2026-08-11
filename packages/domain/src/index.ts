export const RULESET_VERSION = "v5-core-curated@1" as const;

export type CampaignMarkerKind = "PING" | "MOVE" | "ATTACK" | "DEFEND" | "SUPPORT";

export interface CampaignMarkerDto {
  id: string;
  campaignId: string;
  round: number;
  kind: CampaignMarkerKind;
  coord: AxialCoord;
  label?: string;
  createdAt: number;
  own: boolean;
  canRemove: boolean;
}

export * from "./json-contract";
export * from "./rules-catalogue-contract";
export * from "./governed-cargo";
export * from "./governed-supply";
export * from "./tactical-supply";

export type DefinitionStatus = "active" | "experimental" | "legacy" | "incomplete";
export type ImplementationStatus = "IMPLEMENTED" | "PARTIAL" | "CATALOGUE_ONLY";
export type RequisitionStatus = "PUBLISHED" | "BALANCE_REQUIRED" | "NOT_APPLICABLE";
export type RequisitionValueStatus = "PUBLISHED" | "BALANCE_REQUIRED" | "DEV_OVERRIDE";
export type AvailabilityStatus = "AVAILABLE" | "BLOCKED" | "DEV_ONLY" | "HIDDEN";
export type DefinitionKind =
  | "unit-class"
  | "weapon"
  | "equipment"
  | "refit"
  | "action"
  | "order-type"
  | "structure"
  | "terrain"
  | "ship-class"
  | "enemy"
  | "ability"
  | "status-effect"
  | "movement-profile"
  | "durability-profile"
  | "cargo-profile"
  | "supply-profile"
  | "deployment-profile";

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
export type MovementDomain = "GROUND" | "VTOL" | "AEROSPACE" | "ORBITAL";
export type TerrainCostMode = "BATTLEFIELD" | "FLAT";
export type DamageOutputScaling = "CURRENT_HEALTH" | "NONE";
export type PenetrationLossMode = "RESIDUAL" | "ONE_HIT";
export type UnitLocationState =
  | "RESERVE"
  | "ON_MAP"
  | "EMBARKED"
  | "ON_SHIP"
  | "IN_AIR_TRANSPORT"
  | "IN_VEHICLE"
  | "IN_TRANSIT"
  | "DESTROYED";
export type SubsystemOperationalState = "OPERATIONAL" | "DAMAGED" | "DISABLED";
export type ConstructionProjectStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETE" | "CANCELLED" | "DESTROYED";

export interface MovementProfile {
  id: string;
  mode: MovementDomain;
  groundMode?: "STANDARD" | "MECH";
  /** Speed units at the domain boundary; values must be exact multiples of 0.25. */
  baseSpeed: number;
  usesFacing: boolean;
  allowsHostilePassage: boolean;
  requiresFlightPath: boolean;
  terrainCostMode: TerrainCostMode;
  flatStepCost?: number;
  ignoresElevation?: boolean;
  ignoresRivers?: boolean;
  roadMultiplier?: number;
  canRush?: boolean;
  rushCostMultiplier?: number;
  occupiesGroundCapacity?: boolean;
  requiresRunway?: boolean;
  altitudeTransitionCostFraction?: number;
  maximumLandingOrTakeoffActions?: number;
  handlerId?: string;
}

interface BaseDurabilityProfile {
  id: string;
  maximumHealth: number;
  outputScaling: DamageOutputScaling;
  penetrationLoss: PenetrationLossMode;
  supportsSubsystems: boolean;
  handlerId?: string;
}

export interface ForceStrengthDurabilityProfile extends BaseDurabilityProfile {
  model: "FORCE_STRENGTH";
  outputScaling: "CURRENT_HEALTH";
  penetrationLoss: "RESIDUAL";
  healable: true;
}

export interface HitsDurabilityProfile extends BaseDurabilityProfile {
  model: "HITS";
  outputScaling: "NONE";
  penetrationLoss: "ONE_HIT";
  healable: false;
}

export type DurabilityProfile = ForceStrengthDurabilityProfile | HitsDurabilityProfile;

export interface AbilityRef {
  abilityId: string;
  sourceId?: string;
  handlerId?: string;
  parameters?: Record<string, unknown>;
}

export interface AbilityDefinition extends GameDefinition {
  kind: "ability";
  handlerId: string;
  requiredTags: string[];
  prohibitedTags: string[];
  parameters?: Record<string, unknown>;
}

export interface StatusEffectDefinition extends GameDefinition {
  kind: "status-effect";
  handlerId: string;
  durationMode: "ROUND" | "UNTIL_ACTION" | "UNTIL_REPAIRED" | "PERSISTENT";
}

export interface StatusEffectState {
  id: string;
  definitionId: string;
  status: "ACTIVE" | "EXPIRED";
  appliedRound?: number;
  expiresRound?: number;
  remainingRounds?: number;
  sourceId?: string;
  parameters?: Record<string, unknown>;
}

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

export type CargoKind = "PERSONNEL" | "VEHICLE" | "SUPPLY" | "STRUCTURE" | "OTHER";
export type CargoTransportMode = "STOWED" | "EMBARKED" | "TOWED" | "AIRLIFTED";
/**
 * Compatibility type for persisted pre-CP-201 data. New tactical boundaries
 * must use TacticalSupplyResourceId or parse values before assigning them.
 */
export type SupplyType = string;

export interface CargoCapacityRule {
  id: string;
  cargoKind?: CargoKind;
  supplyType?: SupplyType;
  requiredTags?: string[];
  prohibitedTags?: string[];
  quantityPerSlot?: number;
  slotsPerItemQuarters?: number;
  loadGroup?: string;
}

export interface CargoProfile {
  id: string;
  capacitySlotsQuarters: number;
  rules: CargoCapacityRule[];
  allowMixedLoadGroups: boolean;
  /** Normal transports can pay one fixed Standard Action regardless of load size. */
  embarkFlatSpeedCostQuarters?: number;
  disembarkFlatSpeedCostQuarters?: number;
  /** HAT-style profiles instead pay this many Speed quarters per full cargo slot. */
  embarkSpeedCostQuartersPerCargoSlot?: number;
  disembarkSpeedCostQuartersPerCargoSlot?: number;
  towCapacity?: number;
  towRequiredTags?: string[];
  handlerId?: string;
}

export interface CargoManifestItem {
  id: string;
  kind: CargoKind;
  quantity: number;
  tags: string[];
  transportMode?: CargoTransportMode;
  supplyType?: SupplyType;
  unitId?: string;
}

export interface SupplyProfile {
  id: string;
  capacities: Record<SupplyType, number>;
  totalCapacity?: number;
  capacityPerCurrentHealth?: number;
  retainExistingOverCapacity: boolean;
  transferableTypes: SupplyType[];
  handlerId?: string;
}

export type SupplyInventory = Record<SupplyType, number>;

export interface ReloadProfile {
  id: string;
  supplyType?: SupplyType;
  supplyCost: number;
  ammunitionPerAction: "FULL" | number;
  requiresLanding: boolean;
  requiredFacilityTags: string[];
  facilityTagMatch: "ANY" | "ALL";
  actionEconomy: ActionEconomy;
  handlerId?: string;
}

export interface DeploymentProfile {
  id: string;
  allowedLocationStates: UnitLocationState[];
  requiredTags: string[];
  prohibitedStatuses: string[];
  requiredEquipmentIds?: string[];
  minimumHealth?: number;
  supportRequirementTags?: string[];
  handlerId?: string;
}

export interface HealingProfile {
  id: string;
  targetHealthModels: HealthModel[];
  maximumRange: number;
  requiresFriendlyTarget: boolean;
  allowsSelfTarget: boolean;
  allowsDestroyedTarget: boolean;
  supplyType: SupplyType;
  supplyCost: number;
  amountCap: "HEALER_CURRENT_HEALTH" | "TARGET_MISSING_HEALTH" | number;
  handlerId?: string;
}

export type EngineerRepairChoice =
  | { kind: "HIT" }
  | { kind: "SUBSYSTEM"; subsystemId: string };

export interface EngineerRepairProfile {
  id: string;
  maximumRange: number;
  requiresFriendlyTarget: boolean;
  targetHealthModels: HealthModel[];
  hitRepair: number;
  supplyType: "SMALL_SUPPLY";
  supplyCost: number;
  handlerId?: string;
}

export interface ConstructionProfile {
  id: string;
  progressRequired: number;
  progressPerAction: number;
  supplyType: SupplyType;
  supplyPerAction: number;
  maximumActionsPerRound?: number;
  requiredBuilderTags?: string[];
  handlerId?: string;
}

export interface ConstructionProjectState {
  id: string;
  definitionId: string;
  status: ConstructionProjectStatus;
  progress: number;
  builderUnitIds: string[];
  position?: AxialCoord;
}

export type SubsystemKind = "WEAPON" | "MOBILITY" | "SENSORS" | "CARGO" | "OTHER";

export interface SubsystemDefinition {
  id: string;
  name: string;
  kind: SubsystemKind;
  tags: string[];
}

export interface SubsystemState {
  subsystemId: string;
  state: SubsystemOperationalState;
  damageSourceId?: string;
  damagedRound?: number;
}

export interface SubsystemDamageTrigger {
  naturalRolls: number[];
  targetKind: SubsystemKind;
  resultingState: Exclude<SubsystemOperationalState, "OPERATIONAL">;
  selection: "ALL" | "FIRST_BY_ID";
  requiresAttackerHealthAtLeastRoll?: boolean;
}

export interface SubsystemDamageProfile {
  id: string;
  requiresPenetration: boolean;
  triggers: SubsystemDamageTrigger[];
  handlerId?: string;
}

export interface SubsystemRepairProfile {
  id: string;
  supplyType?: SupplyType;
  supplyCost: number;
  requiredActions: number;
  requiresStationary: boolean;
  requiresCrewExposed: boolean;
  handlerId?: string;
}

export type ArtilleryDeploymentState = "PACKED" | "DEPLOYED";

export interface BombardmentSuppressionState {
  stacks: number;
  lastAppliedRound: number;
}

export interface ArtilleryProfile {
  id: string;
  deploySpeedCostQuarters: number;
  packSpeedCostQuarters: number;
  mustBeDeployedForIndirectFire: boolean;
  indirectRequiresSpotter: boolean;
  fireSupplyType?: SupplyType;
  fireSupplyCost: number;
  handlerId?: string;
}

export type TargetDomain = "GROUND" | "AEROSPACE" | "ORBITAL";

export interface SpotterProfile {
  id: string;
  canSpotDomains: TargetDomain[];
  allowsFiringUnit: boolean;
  requiredTags?: string[];
  prohibitedTags?: string[];
  handlerId?: string;
}

export interface StealthProfile {
  id: string;
  mode: "INFANTRY_ROLL" | "RANGE_REDUCTION";
  /** Defaults to a D6 for the V5 Infantry Stealth rule. */
  detectionDieSides?: number;
  detectionRangeMultiplier?: number;
  rangeRounding?: "CEIL" | "FLOOR" | "ROUND";
  revealOnAttack: boolean;
  revealOnInteraction: boolean;
  handlerId?: string;
}

export interface FighterProfile {
  id: string;
  firingArcDegrees: number;
  useTravelFacing: boolean;
  mainWeaponAmmoCapacity: number;
  rearmRequiresLanding: boolean;
  rearmFacilityTags: string[];
  rearmActionEconomy: ActionEconomy;
  handlerId?: string;
}

export interface BomberProfile {
  id: string;
  requiresTargetFlyOver: boolean;
  ordnanceAmmoCapacity: number;
  rearmRequiresLanding: boolean;
  rearmFacilityTags: string[];
  handlerId?: string;
}

export interface AirDropProfile {
  id: string;
  allowedCargoKinds: CargoKind[];
  requiredCargoTags?: string[];
  destinationMustBeOnFlightPath: boolean;
  requiresStraightFlightPath: boolean;
  requiresClearDestination: boolean;
  blockedTerrainIds: string[];
  blockedEnvironmentTags: string[];
  allowStructuresAtDestination: boolean;
  hazardousDestinationPolicy: "REJECT" | "ALLOW";
  handlerId?: string;
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

export interface UnitDefinition extends UnitClassDefinition {
  implementationStatus: ImplementationStatus;
  requisitionStatus: RequisitionStatus;
  availabilityStatus: AvailabilityStatus;
  availabilityReasonCode?: string;
  movementProfile: MovementProfile;
  durabilityProfile: DurabilityProfile;
  abilities: AbilityRef[];
  cargoProfile?: CargoProfile;
  supplyProfile?: SupplyProfile;
  deploymentProfile?: DeploymentProfile;
  subsystemDefinitions?: SubsystemDefinition[];
}

export interface WeaponDefinition extends GameDefinition {
  kind: "weapon";
  profile: WeaponProfile;
  implementationStatus: ImplementationStatus;
  abilities: AbilityRef[];
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

export type EquipmentEffect =
  | { type: "STAT_ADD"; stat: keyof Pick<UnitStats, "maxHealth" | "armor" | "defense" | "speed" | "sensors" | "capacity">; amount: number }
  | { type: "STAT_SET_IF"; stat: keyof Pick<UnitStats, "armor" | "defense" | "speed" | "sensors">; whenEquals: number; value: number }
  | { type: "TAG_GRANT"; tag: string }
  | { type: "TAG_REMOVE"; tag: string }
  | { type: "WEAPON_GRANT"; weapon: WeaponProfile }
  | { type: "WEAPON_MODIFIER"; weaponId?: string; tag?: string; armorPiercing?: number; range?: number; damageModifier?: number }
  | { type: "ACTION_GRANT"; action: ActionType }
  | { type: "ORDER_GRANT"; order: OrderType }
  | { type: "ABILITY_GRANT"; ability: AbilityRef }
  | { type: "CARGO_CAPACITY_ADD"; slotsQuarters: number }
  | { type: "DEPLOYMENT_GRANT"; method: DeploymentMethodId }
  | { type: "AMMO_GRANT"; weaponId: string; capacity: number }
  | { type: "COOLDOWN_GRANT"; abilityOrWeaponId: string; rounds: number };

export interface RefitDefinition extends GameDefinition {
  kind: "refit";
  allowedUnitDefinitionIds: string[];
  requiredTags: string[];
  effects: EquipmentEffect[];
  implementationStatus: ImplementationStatus;
}

export interface SelectedEquipment {
  instanceId: string;
  definition: EquipmentDefinition;
  effects: EquipmentEffect[];
  slotType: string;
  slotIndex: number;
  state: "AVAILABLE" | "INSTALLED" | "DAMAGED" | "EXPENDED";
}

export interface InstalledRefit {
  instanceId: string;
  definition: RefitDefinition;
}

export interface EffectiveUnit {
  rulesetVersion: string;
  definitionId: string;
  persistentUnitId?: string;
  stats: UnitStats;
  tags: string[];
  weapons: WeaponProfile[];
  allowedActions: ActionType[];
  allowedOrders: OrderType[];
  abilities: AbilityRef[];
  deploymentMethods: DeploymentMethodId[];
  cargoProfile?: CargoProfile;
  equipmentInstanceIds: string[];
  refitInstanceIds: string[];
  ammunition: Record<string, number>;
  cooldowns: Record<string, number>;
  subsystems?: SubsystemState[];
  sourceHash: string;
}

export interface EffectiveUnitBuildInput {
  rulesetVersion: string;
  unitDefinition: UnitDefinition;
  playerUnit?: PlayerUnit;
  refits: InstalledRefit[];
  equipment: SelectedEquipment[];
  ammunition?: Record<string, number>;
  cooldowns?: Record<string, number>;
}

export interface EffectiveUnitBuildResult {
  valid: boolean;
  errors: DeploymentValidationIssue[];
  warnings: DeploymentValidationIssue[];
  unit?: EffectiveUnit;
}

export type DeploymentMethodId =
  | "STANDARD_GROUND"
  | "VEHICLE_TRANSPORT"
  | "VTOL_INSERTION"
  | "HEAVY_AIR_TRANSPORT"
  | "PARADROP"
  | "ORBITAL_DROP";

export type DeploymentPlanStatus =
  | "DRAFT"
  | "VALID"
  | "INVALID"
  | "COMMITTED"
  | "DEPLOYING"
  | "DEPLOYED"
  | "CANCELLED";

export interface DeploymentValidationIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  entityId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DeploymentUnitSelection {
  unitId: string;
  ownerId: string;
  effectiveUnit: EffectiveUnit;
  ownerApproved: boolean;
  commandApproved: boolean;
}

export interface DeploymentTransportAssignment {
  carrierUnitId: string;
  cargo: CargoManifestItem[];
  profile: CargoProfile;
}

export interface DeploymentPlanState {
  id: string;
  campaignId: string;
  battalionId: string;
  battlegroupId?: string;
  createdBy: string;
  status: DeploymentPlanStatus;
  revision: number;
  method: DeploymentMethodId;
  insertionHex?: AxialCoord;
  transportRoute?: AxialCoord[];
  unitSelections: DeploymentUnitSelection[];
  transportAssignments: DeploymentTransportAssignment[];
}

export interface CampaignLoadoutSnapshot {
  id: string;
  campaignId: string;
  deploymentPlanId: string;
  playerUnitId: string;
  rulesetVersion: string;
  unitDefinitionVersion: string;
  effectiveUnit: EffectiveUnit;
  insertionMethod: DeploymentMethodId;
  carrierUnitId?: string;
  lockedAt: number;
  snapshotHash: string;
}

export interface EquipmentEligibilityRule extends RuleMetadata {
  id: string;
  equipmentDefinitionId: string;
  requiredAllTags: string[];
  requiredAnyTags: string[];
  prohibitedTags: string[];
  allowedUnitDefinitionIds: string[];
  slotTypes: string[];
  /** Null means the source provides no duplicate limit; it never means zero. */
  maximumEquipped: number | null;
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
  version: number;
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
  locationState?: UnitLocationState;
  supplies?: SupplyInventory;
  statusEffects?: StatusEffectState[];
  subsystems?: SubsystemState[];
  cargo?: CargoManifestItem[];
  cargoProfile?: CargoProfile;
  towedUnitId?: string;
}

export interface CampaignDeployment {
  id: string;
  campaignId: string;
  persistentUnitId?: string;
  ownerId: string;
  side: FactionSide;
  definitionId: string;
  callsign: string;
  tags?: string[];
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
  allowedActions?: ActionType[];
  allowedOrders?: OrderType[];
  battlegroupId?: string;
  movementProfile?: MovementProfile;
  durabilityProfile?: DurabilityProfile;
  abilities?: AbilityRef[];
  supplies?: SupplyInventory;
  statusEffects?: StatusEffectState[];
  subsystems?: SubsystemState[];
  cargo?: CargoManifestItem[];
  cargoProfile?: CargoProfile;
  artilleryDeployment?: ArtilleryDeploymentState;
  bombardmentSuppression?: BombardmentSuppressionState;
  locationState?: UnitLocationState;
  towedUnitId?: string;
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
export type EnemyTargetPreference =
  | "PERSONNEL"
  | "VEHICLE"
  | "OBJECTIVE"
  | "STRUCTURE"
  | "LOGISTICS"
  | "AEROSPACE";

export interface EnemyDoctrineProfileV1 {
  schemaVersion: 1;
  definitionId: string;
  factionId: string;
  preferredTargets: EnemyTargetPreference[];
  preferredOrderTypes: OrderType[];
  aggression: number | null;
  role: string | null;
  vehiclePriority: boolean;
}
export type ActionType =
  | "ATTACK"
  | "ASSAULT"
  | "DIG_IN"
  | "ARTILLERY_DIG_IN"
  | "BREAK_OUT"
  | "DEPLOY"
  | "PACK_UP"
  | "REPAIR"
  | "CREW_REPAIR"
  | "CONSTRUCT"
  | "TRENCH_UPGRADE"
  | "GARRISON"
  | "LOAD"
  | "UNLOAD"
  | "AIRDROP"
  | "LAND"
  | "TAKE_OFF"
  | "REARM_AEROSPACE"
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
  structureDefinitionId?: string;
  weaponId?: string;
  /** Server-derived fitted weapons participating in one Attack activation. */
  weaponIds?: string[];
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
  enemyIntent?: {
    doctrineDefinitionId: string;
    factionId: string;
    targetPreference?: EnemyTargetPreference;
    allocation: "SPREAD_BY_PRIORITY";
    objectiveId?: string;
  };
  submittedBy: string;
  submittedAt: number;
}

export type CampaignPhase =
  | "PLANNING"
  | "LOCKED"
  | "RESOLVING"
  | "EFFECTS_PENDING"
  | "PAUSED"
  | "COMPLETE"
  | "FAILED";
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
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "ORDER_LOCKED"
  | "ENEMY_INTENTION_DECLARED"
  | "UNIT_MOVED"
  | "UNIT_BLOCKED"
  | "UNIT_DUG_IN"
  | "UNIT_DUG_OUT"
  | "EVASIVE_MANEUVER"
  | "UNIT_ATTACKED"
  | "WEAPON_SKIPPED"
  | "SUBSYSTEM_MALFUNCTIONED"
  | "CARGO_LOADED"
  | "CARGO_UNLOADED"
  | "AIR_DROP_COMPLETED"
  | "AIR_DROP_FAILED"
  | "AEROSPACE_LANDED"
  | "AEROSPACE_TOOK_OFF"
  | "AEROSPACE_REARMED"
  | "AEROSPACE_INTERCEPTED"
  | "WEAPON_RELOADED"
  | "UNIT_HEALED"
  | "UNIT_REPAIRED"
  | "ARTILLERY_DEPLOYED"
  | "ARTILLERY_PACKED"
  | "ARTILLERY_BOMBARDED"
  | "BOMBARDMENT_APPLIED"
  | "BOMBARDMENT_RECOVERED"
  | "MEDICAL_SUPPLY_RELOADED"
  | "HEX_SCANNED"
  | "DRONE_DEPLOYED"
  | "DICE_ROLLED"
  | "DAMAGE_APPLIED"
  | "UNIT_DESTROYED"
  | "STRUCTURE_COMPLETED"
  | "STRUCTURE_UPGRADED"
  | "SUPPLY_TRANSFERRED"
  | "ENEMY_REINFORCEMENTS_ARRIVED"
  | "OBJECTIVE_CAPTURED"
  | "ROUND_FINISHED"
  | "CAMPAIGN_COMPLETED"
  | "CAMPAIGN_FAILED"
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

/**
 * Version 1 describes a bounded hold-the-objective scenario without coupling
 * the rules engine to a campaign identifier. The policy data names every
 * objective that can change hands and the one objective that gates victory.
 */
export interface CampaignScenarioPolicyV1 {
  policyId: "HOLD_PRIMARY_OBJECTIVE";
  version: 1;
  startRound: number;
  maxRounds: number;
  primaryObjectiveId: string;
  capturableObjectiveIds: string[];
}

export type CampaignScenarioPolicy = CampaignScenarioPolicyV1;

export interface CampaignReinforcementWave {
  id: string;
  arrivesAfterRound: number;
  deploymentIds: string[];
  status: "PENDING" | "ARRIVED";
}

export type CampaignOutcomeReason =
  | "ALL_ALLIED_DEPLOYMENTS_LOST"
  | "PRIMARY_OBJECTIVE_LOST"
  | "FINAL_ROUND_PRIMARY_HELD"
  | "FINAL_ROUND_CONDITIONS_NOT_MET";

export interface CampaignObjectiveSummary {
  id: string;
  owner: FactionSide;
  status: ObjectiveState["status"];
}

export interface CampaignRewardSummary {
  serviceHistory: "RECORDED";
  requisition: {
    status: "BALANCE_REQUIRED";
    amount: null;
    rulesDecisionId: "RC-V5-016";
  };
}

export interface CampaignOutcome {
  result: "VICTORY" | "DEFEAT";
  round: number;
  reason: CampaignOutcomeReason;
  objectives: CampaignObjectiveSummary[];
  rewards: CampaignRewardSummary;
}

export interface PendingPersistentEffect {
  idempotencyKey: string;
  type: "UNIT_DESTROYED" | "UNIT_DAMAGED" | "UNIT_STATE_UPDATED" | "REQUISITION_AWARDED" | "CAMPAIGN_HISTORY" | "CAMPAIGN_RESULT";
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
  status?: "EFFECTS_PENDING" | "RESOLVED" | "FAILED";
  effectCount?: number;
  appliedEffectCount?: number;
  resolvedAt?: number;
}

export interface CampaignRuntimeState {
  campaignId: string;
  campaignName: string;
  planetName: string;
  scenarioId?: string;
  scenarioVersion?: number;
  rulesetVersion: string;
  engineVersion: string;
  round: number;
  phase: CampaignPhase;
  clock: CampaignClock;
  map: BattlefieldHex[];
  deployments: CampaignDeployment[];
  orders: UnitOrder[];
  objectives: ObjectiveState[];
  scenarioPolicy?: CampaignScenarioPolicy;
  reinforcementWaves?: CampaignReinforcementWave[];
  outcome?: CampaignOutcome;
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

export interface CampaignView extends Omit<CampaignRuntimeState, "resolutions" | "pendingPersistentEffects" | "reinforcementWaves"> {
  viewer: ViewerContext;
  serverTime: number;
  connectionToken?: string;
}

export interface PersistentUnitIdentity {
  id: string;
  ownerId: string;
  definitionId: string;
  callsign: string;
  name: string;
  version: number;
  createdAt: number;
  retiredAt?: number;
  destroyedAt?: number;
}

export interface ReadinessIssue {
  code: string;
  severity: "BLOCKER" | "WARNING";
  message: string;
  requirementId?: string;
  details?: Record<string, unknown>;
}

export interface DeploymentRequirement {
  id: string;
  label: string;
  satisfied: boolean;
  details?: Record<string, unknown>;
}

export interface DeploymentReadinessResult {
  ready: boolean;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
  requirements: DeploymentRequirement[];
}

/** Read projection of a movement profile; storage-backed summaries may hydrate fields incrementally. */
export type MovementProfileInspectionDto = {
  id: string;
  name?: string | null;
  /** Backward-compatible storage/API alias for MovementProfile.mode. */
  domain?: MovementDomain | string | null;
} & Partial<Omit<MovementProfile, "id">>;

/** Read projection of either durability discriminant without pretending a partial row is executable. */
export interface DurabilityProfileInspectionDto {
  id: string;
  name?: string | null;
  model: HealthModel | string;
  maximumHealth?: number;
  outputScaling?: DamageOutputScaling;
  penetrationLoss?: PenetrationLossMode;
  supportsSubsystems?: boolean;
  healable?: boolean;
  handlerId?: string;
}

export interface ForceDefinitionInspectionDto {
  id: string;
  name: string;
  category: string;
  sourceStats?: Record<string, unknown>;
}

export interface ForceServiceDto {
  campaigns: number;
  rounds: number;
}

export interface DestroyedUnitInspectionDto {
  at: number;
  campaignId?: string | null;
  round?: number | null;
  cause?: string | null;
}

export interface ForceBattlegroupSummaryDto {
  id: string;
  name: string;
  objective?: string;
}

export interface ForceSummaryDto {
  unitId: string;
  definitionId: string;
  callsign: string;
  name: string;
  status: UnitStatus;
  locationState: UnitLocationState;
  currentHealth: number;
  maximumHealth: number;
  healthModel: HealthModel;
  version: number;
  readiness?: DeploymentReadinessResult;
  /** Additive inspection/list enrichment retained as optional for older API producers. */
  definitionName?: string;
  className?: string;
  category?: string;
  description?: string;
  armor?: number;
  defense?: number;
  speed?: number;
  sensors?: number;
  implementationStatus?: ImplementationStatus;
  requisitionStatus?: RequisitionStatus;
  availabilityStatus?: AvailabilityStatus;
  reasonCode?: string | null;
  movementProfile?: MovementProfileInspectionDto;
  durabilityProfile?: DurabilityProfileInspectionDto;
  service?: ForceServiceDto;
  battlegroups?: ForceBattlegroupSummaryDto[];
  /** Compatibility aliases for older single-formation consumers. */
  battlegroup?: string;
  battlegroupName?: string | null;
  requisitionValue?: number;
  requisitionValueStatus?: RequisitionValueStatus;
  destroyed?: DestroyedUnitInspectionDto;
}

export interface WeaponMountInspectionDto {
  mountId: string;
  weapon: WeaponProfile;
  ammunition?: number;
  cooldownRounds: number;
  operational: boolean;
}

export interface EquipmentInspectionDto {
  /** Canonical definition identifier on enriched Phase 2 projections. */
  equipmentId?: string;
  /** Backward-compatible alias used by the existing Forces detail projection. */
  id?: string;
  name: string;
  category?: string;
  slotType: string;
  slotIndex?: number;
  status?: DefinitionStatus;
  tags?: string[];
  abilities?: AbilityRef[];
  state?: Record<string, unknown>;
  lost?: boolean;
}

/** Existing Forces endpoint mount shape retained alongside the richer weaponMounts projection. */
export interface WeaponMountDetailDto {
  id: string;
  definitionId: string;
  name: string;
  role: string;
  state: string;
  damage: DiceProfile;
  armorPiercing: number;
  range: number;
  indirect: boolean;
  currentAmmo: number | null;
  ammoCapacity: number | null;
  cooldownRemaining: number;
  tags?: string[];
}

export interface CargoDetailInspectionDto {
  id: string;
  kind: string;
  callsign?: string | null;
  resourceType?: string | null;
  quantity: number;
  transportMode?: CargoTransportMode;
  slots: number;
  state: string;
}

/** Storage-backed cargo profile projection; it is descriptive until compiled by the rules engine. */
export interface CargoProfileInspectionDto {
  id: string;
  name?: string | null;
  capacity: Record<string, unknown>;
  loadingRules: Record<string, unknown>;
}

export interface UnitServiceSummaryDto {
  campaignsParticipated: number;
  roundsDeployed: number;
  damageSustained: number;
  objectivesCompleted: number;
  unitsDestroyed: number;
  commendations: number;
}

export interface UnitHistoryRecordDto {
  id: string;
  type: string;
  occurredAt: number;
  summary: string;
  campaignId?: string | null;
  round?: number | null;
  payload?: Record<string, unknown>;
}

export interface FriendlyUnitInspectionDto extends ForceSummaryDto {
  ownerId: string;
  definition?: ForceDefinitionInspectionDto;
  tags: string[];
  abilities: AbilityRef[];
  equipmentIds: string[];
  equipment?: EquipmentInspectionDto[];
  equipmentDetail?: EquipmentInspectionDto[];
  weaponMounts?: WeaponMountInspectionDto[];
  weapons?: WeaponMountDetailDto[];
  ammunition: Record<string, number>;
  cooldowns: Record<string, number>;
  supplies: SupplyInventory;
  supplyCapacities?: SupplyInventory;
  cargo: CargoManifestItem[];
  cargoProfile?: CargoProfileInspectionDto;
  cargoDetail?: CargoDetailInspectionDto[];
  subsystems: SubsystemState[];
  statusEffects: StatusEffectState[];
  recentHistory: string[];
  serviceSummary?: UnitServiceSummaryDto;
  recentServiceRecords?: UnitHistoryRecordDto[];
  /** Bounded compatibility projection; long history belongs to the paginated history API. */
  history?: UnitHistoryRecordDto[];
}

export interface EnemyContactInspectionDto {
  contactId: string;
  displayName: string;
  observedAt: number;
  position?: AxialCoord;
  facing?: Facing;
  apparentCategory?: string;
  apparentStatus?: DeploymentStatus;
  knownTags: string[];
  confidence: "EXACT" | "ESTIMATED" | "UNKNOWN";
}

export interface AuthUserDto {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  callsign?: string | null;
  emailVerified: boolean;
}

export type AuthSessionDto =
  | { signedIn: false; authAvailable: boolean }
  | { signedIn: true; authAvailable: true; user: AuthUserDto; demo: boolean };

export interface AuthLinkRequestedDto {
  accepted: true;
  message: string;
  developmentVerificationUrl?: string;
}

export type OnboardingStep = "BATTALION" | "UNIT" | "TOUR" | "COMPLETE";
export type BattalionAccessPolicy = "PUBLIC" | "PRIVATE";

export interface BattalionDirectoryEntryDto {
  battalionId: string;
  name: string;
  shortName?: string | null;
  description: string;
  motto: string;
  recruitmentKind: "NPC" | "PLAYER";
  accessPolicy: BattalionAccessPolicy;
  engagementSummary: string;
  memberCount: number;
  memberCapacity: number;
  openSpots: number;
}

export interface BattalionInvitationDto {
  invitationId: string;
  battalionId: string;
  battalionName: string;
  invitedBy: string;
  message: string;
  expiresAt: number | null;
  source: "ACCOUNT" | "EMAIL";
}

export interface StarterUnitOptionDto {
  definitionId: string;
  name: string;
  category: string;
  healthModel: HealthModel;
  maximumHealth: number;
  armor: number;
  speed: number;
  summary: string;
}

export interface ActiveOnboardingBattalionDto extends BattalionDirectoryEntryDto {
  settingsRevision: number;
  permissions: BattalionPermission[];
  joinEnabled: boolean;
}

export interface OnboardingStatusDto {
  required: boolean;
  status: "NOT_ENROLLED" | "IN_PROGRESS" | "COMPLETE" | "SKIPPED";
  step: OnboardingStep;
  progressRevision?: number;
  charter: {
    balance: number;
    grantAmount: number;
    creationCost: number;
    canCreate: boolean;
    alreadyUsed: boolean;
  };
  activeBattalion: ActiveOnboardingBattalionDto | null;
  publicBattalions: BattalionDirectoryEntryDto[];
  invitations: BattalionInvitationDto[];
  starterUnits: StarterUnitOptionDto[];
  firstUnit: { unitId: string; name: string; callsign: string; definitionId: string } | null;
}

// ---------------------------------------------------------------------------
// Phase 3: persistent organisations and the strategic layer
// ---------------------------------------------------------------------------

export type PlayerAccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

/** Public player identity. Authentication-provider identifiers never belong here. */
export interface PlayerProfileDto {
  userId: string;
  displayName: string;
  callsign: string;
  avatarUrl?: string | null;
  bio?: string | null;
  timezone?: string | null;
  preferredBattalionId?: string | null;
  createdAt: number;
  lastActiveAt: number;
  accountStatus: PlayerAccountStatus;
}

export type BattalionStatus = "ACTIVE" | "SUSPENDED" | "DISBANDED";
export type BattalionMembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "LEFT" | "REMOVED";

export type BattalionPermission =
  | "BATTALION_EDIT"
  | "MEMBER_INVITE"
  | "MEMBER_REMOVE"
  | "RANK_MANAGE"
  | "BATTLEGROUP_CREATE"
  | "BATTLEGROUP_EDIT"
  | "BATTLEGROUP_ASSIGN"
  | "OPERATION_CREATE"
  | "OPERATION_COMMAND"
  | "SHIP_VIEW"
  | "SHIP_CONFIGURE"
  | "SHIP_UPGRADE"
  | "SHIP_MOVE"
  | "SUPPLY_VIEW"
  | "SUPPLY_MANAGE"
  | "UNIT_DEPLOY_SELF"
  | "UNIT_DEPLOY_OTHERS"
  | "STRATEGIC_ORDER_CREATE"
  | "STRATEGIC_ORDER_APPROVE";

export interface BattalionDto {
  id: string;
  name: string;
  shortName: string;
  description: string;
  insigniaUrl?: string | null;
  motto?: string | null;
  createdAt: number;
  createdBy: string;
  status: BattalionStatus;
  primaryShipId?: string | null;
  version: number;
}

export interface BattalionSummaryDto {
  id: string;
  name: string;
  shortName: string;
  insigniaUrl?: string | null;
  motto?: string | null;
  status: BattalionStatus;
  memberCount: number;
  primaryShipId?: string | null;
  version: number;
}

export interface BattalionRankDto {
  id: string;
  battalionId: string;
  name: string;
  sortOrder: number;
  permissions: BattalionPermission[];
  version: number;
}

export interface BattalionMemberDto {
  membershipId: string;
  battalionId: string;
  userId: string;
  displayName: string;
  callsign: string;
  rankId: string;
  status: BattalionMembershipStatus;
  joinedAt?: number | null;
  leftAt?: number | null;
}

export type BattlegroupStatus =
  | "FORMING"
  | "READY"
  | "EMBARKED"
  | "DEPLOYING"
  | "DEPLOYED"
  | "IN_TRANSIT"
  | "WITHDRAWING"
  | "RECOVERING";

export type StrategicCapability =
  | "GROUND_COMBAT"
  | "ARMOURED"
  | "RECON"
  | "ENGINEERING"
  | "LOGISTICS"
  | "ANTI_AIR"
  | "ARTILLERY"
  | "AIR_MOBILE"
  | "ORBITAL_DROP"
  | "CARRY_INFANTRY"
  | "CARRY_LIGHT_VEHICLE"
  | "CARRY_HEAVY_VEHICLE"
  | "CARRY_MECH"
  | "CARRY_VTOL"
  | "CARRY_AEROSPACE"
  | "LAND_VTOL"
  | "LAND_AEROSPACE"
  | "REPAIR_INFANTRY"
  | "REPAIR_VEHICLE"
  | "REPAIR_MECH"
  | "REPAIR_AEROSPACE"
  | "REARM_INFANTRY"
  | "REARM_AEROSPACE"
  | "CHANGE_INFANTRY_LOADOUT"
  | "REFIT_MECH"
  | "GENERATE_SMALL_SUPPLY"
  | "GENERATE_MEDIUM_SUPPLY"
  | "SURFACE_LANDING";

export type StrategicCapabilitySourceKind = "UNIT" | "EQUIPMENT" | "SHIP_MODULE" | "ATTACHED_SUPPORT";

export interface StrategicCapabilityGrant {
  capability: StrategicCapability;
  /** Non-negative data-driven strength/capacity; zero grants are ignored. */
  value: number;
}

export interface StrategicCapabilitySource {
  sourceId: string;
  sourceKind: StrategicCapabilitySourceKind;
  grants: StrategicCapabilityGrant[];
}

export interface StrategicCapabilitySummary {
  capability: StrategicCapability;
  value: number;
  sourceIds: string[];
}

export interface BattlegroupUnitSummaryDto {
  unitId: string;
  ownerId: string;
  definitionId: string;
  callsign: string;
  domain: "GROUND" | "AEROSPACE" | "ORBITAL";
}

export interface BattlegroupSummaryDto {
  id: string;
  battalionId: string;
  name: string;
  callsign: string;
  commanderMembershipId?: string | null;
  unitCount: number;
  currentNodeId?: string | null;
  currentOperationId?: string | null;
  currentCarrierTaskForceId?: string | null;
  status: BattlegroupStatus;
  capabilities: StrategicCapabilitySummary[];
  version: number;
}

export interface BattlegroupDto extends BattlegroupSummaryDto {
  members: string[];
  units: BattlegroupUnitSummaryDto[];
}

export interface BattlegroupManagementDto {
  battlegroup: BattlegroupSummaryDto;
  units: BattlegroupUnitSummaryDto[];
  delegatedUnitIds: string[];
}

export interface CreateBattlegroupCommand {
  commandId: string;
  name: string;
  callsign: string;
  objective: string;
}

export interface UpdateBattlegroupCommand {
  commandId: string;
  expectedRevision: number;
  name: string;
  callsign: string;
  objective: string;
  leaderUserId: string | null;
}

export interface AssignBattlegroupUnitCommand {
  commandId: string;
  expectedRevision: number;
  unitId: string;
}

export type RemoveBattlegroupUnitCommand = AssignBattlegroupUnitCommand;

export interface SetBattlegroupDelegationCommand extends AssignBattlegroupUnitCommand {
  delegateUserId: string;
  active: boolean;
}

export interface BattlegroupMutationResultDto {
  operation:
    | "CREATE_BATTLEGROUP"
    | "UPDATE_BATTLEGROUP"
    | "ASSIGN_BATTLEGROUP_UNIT"
    | "REMOVE_BATTLEGROUP_UNIT"
    | "SET_BATTLEGROUP_DELEGATION";
  battlegroupId: string;
  revision: number;
  unitId?: string;
  delegateUserId?: string;
  delegationActive?: boolean;
}

export interface BattlegroupManagementGroupDto {
  id: string;
  name: string;
  callsign: string;
  objective: string;
  leaderUserId: string | null;
  status: BattlegroupStatus;
  revision: number;
}

export interface BattlegroupManagementUnitDto {
  battlegroupId: string;
  unitId: string;
  ownerId: string;
  delegatedCommand: boolean;
}

export interface BattlegroupManagementProjectionDto {
  battlegroups: BattlegroupManagementGroupDto[];
  units: BattlegroupManagementUnitDto[];
}

export type ShipStatus =
  | "DOCKED"
  | "ORBIT"
  | "IN_TRANSIT"
  | "ARRIVING"
  | "DEPLOYING"
  | "DAMAGED"
  | "DESTROYED";
export type ShipModuleStatus = "OPERATIONAL" | "DAMAGED" | "DISABLED";
export type ShipModuleSlotType = "INTERNAL" | "EXTERNAL" | "EXTERNAL_INTERNAL";

export interface ShipDamageDto {
  currentHits: number;
  maximumHits: number;
  armour: number;
  damagedSubsystemIds: string[];
}

export interface ShipSummaryDto {
  id: string;
  battalionId: string;
  name: string;
  classDefinitionId: string;
  className: string;
  registry: string;
  currentNodeId?: string | null;
  status: ShipStatus;
  damage: ShipDamageDto;
  largeSupply: number;
  largeSupplyCapacity: number;
  version: number;
}

export interface ShipDto extends ShipSummaryDto {
  primary: boolean;
  internalSlots: number;
  externalSlots: number;
  atmoFuel?: number | null;
  atmoFuelCapacity?: number | null;
}

export interface ShipModuleDto {
  id: string;
  shipId: string;
  definitionId: string;
  name: string;
  slotType: ShipModuleSlotType;
  slotIndex: number;
  status: ShipModuleStatus;
  capabilities: StrategicCapabilityGrant[];
  implementationStatus: ImplementationStatus;
}

export type SupplySize = "LARGE" | "MEDIUM" | "SMALL";
export type StrategicSupplyLocationKind = "TASK_FORCE" | "SHIP" | "HQ" | "FOB" | "UNIT";

export interface StrategicSupplyEndpointRef {
  kind: StrategicSupplyLocationKind;
  id: string;
}

export interface StrategicSupplyBalance {
  size: SupplySize;
  quantity: number;
  capacity?: number | null;
}

export interface StrategicSupplyState {
  location: StrategicSupplyEndpointRef;
  balances: StrategicSupplyBalance[];
  /** Inclusive round. Null means the location is not currently supplied. */
  suppliedThroughRound: number | null;
  facilities: StrategicCapability[];
}

export interface ShipCargoDto {
  id: string;
  shipId: string;
  kind: "UNIT" | "SUPPLY" | "EQUIPMENT";
  unitId?: string | null;
  definitionId?: string | null;
  supplySize?: SupplySize | null;
  quantity: number;
  capacityUsed: number;
}

export type TaskForceStatus =
  | "FORMING"
  | "READY"
  | "IN_TRANSIT"
  | "ARRIVING"
  | "DEPLOYING"
  | "DAMAGED"
  | "DESTROYED";
export type StrategicMovementProfile = "GROUND_BATTLEGROUP" | "AIR_MOBILE_BATTLEGROUP" | "TASK_FORCE";

export interface StrategicTransitState {
  routeNodeIds: string[];
  routeIds: string[];
  totalTravelCost: number;
  progress: number;
  startedRound: number;
  etaRound: number;
}

export interface TaskForceSummaryDto {
  id: string;
  battalionId: string;
  name: string;
  commanderMembershipId?: string | null;
  shipIds: string[];
  embarkedBattlegroupIds: string[];
  currentNodeId?: string | null;
  transit?: StrategicTransitState | null;
  status: TaskForceStatus;
  supply: StrategicSupplyState;
  capabilities: StrategicCapabilitySummary[];
  version: number;
}

export type StrategicLocationType =
  | "GALAXY"
  | "STAR_SYSTEM"
  | "PLANET"
  | "MOON"
  | "ORBIT"
  | "STATION"
  | "JUMP_POINT"
  | "SURFACE_REGION"
  | "CITY"
  | "BASE"
  | "JUNCTION"
  | "OBJECTIVE"
  | "CAMPAIGN";

export interface StrategicLocationDto {
  id: string;
  type: StrategicLocationType;
  parentLocationId?: string | null;
  name: string;
  description?: string | null;
}

export type StrategicMapScope = "GALAXY" | "SYSTEM" | "PLANET" | "THEATRE";
export type StrategicNodeType =
  | "PLANET"
  | "MOON"
  | "STATION"
  | "JUMP_POINT"
  | "ORBIT"
  | "CITY"
  | "BASE"
  | "JUNCTION"
  | "OBJECTIVE"
  | "CAMPAIGN";
export type StrategicNodeControl = "FRIENDLY" | "ENEMY" | "CONTESTED" | "NEUTRAL" | "UNKNOWN";
export type StrategicRouteStatus = "OPEN" | "BLOCKED" | "LOCKED" | "DESTROYED";
export type StrategicTravelCostStatus = "PUBLISHED" | "SCENARIO_CONFIG" | "BALANCE_REQUIRED";

export interface StrategicMapDto {
  id: string;
  name: string;
  scope: StrategicMapScope;
  rootLocationId: string;
  version: number;
}

export interface StrategicNodeDto {
  id: string;
  mapId: string;
  locationId: string;
  /** Nearest owning Planet in the strategic location hierarchy. */
  planetLocationId?: string | null;
  type: StrategicNodeType;
  name: string;
  control: StrategicNodeControl;
  status: "OPEN" | "BLOCKED" | "LOCKED" | "DESTROYED";
  position?: { x: number; y: number } | null;
}

export interface StrategicRouteDto {
  id: string;
  mapId: string;
  fromNodeId: string;
  toNodeId: string;
  direction: "ONE_WAY" | "BIDIRECTIONAL";
  /** Source/config-authored cost units. Null is unresolved and must never mean zero. */
  baseTravelRounds: number | null;
  travelCostStatus: StrategicTravelCostStatus;
  allowedMovementProfiles: StrategicMovementProfile[];
  status: StrategicRouteStatus;
}

export type OperationStatus = "ANNOUNCED" | "MUSTERING" | "ACTIVE" | "RESOLVED" | "FAILED" | "CANCELLED";
export type ReinforcementStatus = "OPEN" | "CLOSED" | "CLOSES_AFTER_TACTICAL_ROUND";

export interface OperationSummaryDto {
  id: string;
  mapId: string;
  campaignId?: string | null;
  strategicNodeId: string;
  name: string;
  role: string;
  status: OperationStatus;
  threat?: string | null;
  objectiveSummaries: string[];
  recommendedCapabilities: StrategicCapability[];
  deployedBattlegroupIds: string[];
  reinforcementStatus: ReinforcementStatus;
  reinforcementClosesAfterRound?: number | null;
  version: number;
}

export interface StrategicRoundDto {
  mapId: string;
  round: number;
  phase: StrategicPhase;
  version: number;
}

export interface StrategicClockDto {
  mode: "SCHEDULED" | "ACCELERATED" | "MANUAL";
  durationMs: number | null;
  roundStartedAt: number;
  locksAt: number | null;
  resolvesAt: number | null;
  pausedAt?: number | null;
}

export interface StrategicCommandSummaryDto {
  mapId: string;
  mapName: string;
  currentNodeId?: string | null;
  currentNodeName?: string | null;
  round: number;
  nextStrategicTick?: number | null;
  activeOperationCount: number;
  deployedBattlegroupCount: number;
}

export interface CommandProjectionDto {
  profile: PlayerProfileDto;
  battalion: BattalionSummaryDto | null;
  primaryShip: ShipSummaryDto | null;
  strategic: StrategicCommandSummaryDto | null;
  operations: OperationSummaryDto[];
}

export interface BattalionProjectionDto {
  battalion: BattalionDto;
  ranks: BattalionRankDto[];
  permissions: BattalionPermission[];
  battlegroups: BattlegroupSummaryDto[];
}

export interface ShipProjectionDto {
  ship: ShipDto;
  modules: ShipModuleDto[];
  capabilities: StrategicCapabilitySummary[];
  cargo: ShipCargoDto[];
  supply: StrategicSupplyState;
  taskForce: TaskForceSummaryDto | null;
}

export interface StrategicMapProjectionDto {
  map: StrategicMapDto;
  round: StrategicRoundDto;
  clock: StrategicClockDto;
  nodes: StrategicNodeDto[];
  routes: StrategicRouteDto[];
  taskForces: TaskForceSummaryDto[];
  battlegroups: BattlegroupSummaryDto[];
  operations: OperationSummaryDto[];
  viewerPermissions: BattalionPermission[];
  serverTime: number;
}

export type StrategicDeploymentMethod =
  | "STANDARD_LANDING"
  | "VTOL_DEPLOYMENT"
  | "AEROSPACE_TRANSPORT"
  | "ORBITAL_DROP"
  | "SHIP_SURFACE_LANDING";

export type StrategicFormationRef =
  | { kind: "TASK_FORCE"; id: string }
  | { kind: "BATTLEGROUP"; id: string };

export type StrategicOrderIntent =
  | { type: "MOVE_TASK_FORCE" }
  | { type: "MOVE_BATTLEGROUP" }
  | { type: "EMBARK_BATTLEGROUP"; battlegroupId: string; carrierTaskForceId: string }
  | { type: "DISEMBARK_BATTLEGROUP"; battlegroupId: string; carrierTaskForceId: string }
  | {
      type: "DEPLOY_TO_CAMPAIGN";
      battlegroupId: string;
      operationId: string;
      deploymentMethod: StrategicDeploymentMethod;
    }
  | {
      type: "WITHDRAW_FROM_CAMPAIGN";
      battlegroupId: string;
      operationId: string;
      extractionNodeId?: string;
    }
  | {
      type: "TRANSFER_SUPPLY";
      supplySize: SupplySize;
      amount: number;
      source: StrategicSupplyEndpointRef;
      destination: StrategicSupplyEndpointRef;
    }
  | { type: "RESUPPLY_TASK_FORCE"; taskForceId: string }
  | { type: "SUPPORT_CAMPAIGN"; operationId: string; capability: StrategicCapability }
  | { type: "ORBITAL_COMBAT"; opposingFormationId: string };

export interface SubmitStrategicOrderCommand {
  commandId: string;
  expectedMapVersion: number;
  expectedFormationVersion: number;
  mapId: string;
  formation: StrategicFormationRef;
  /** Required only for movement intents; the server derives the route. */
  destinationNodeId?: string;
  intent: StrategicOrderIntent;
}

export interface StrategicOrderRecord extends SubmitStrategicOrderCommand {
  id: string;
  lifecycle: OrderLifecycle;
  revision: number;
  strategicRound: number;
  submittedBy: string;
  submittedAt: number;
}

export type StrategicUnitDomain = "GROUND" | "AEROSPACE" | "ORBITAL";

export interface StrategicUnitComposition {
  unitId: string;
  ownerId: string;
  definitionId: string;
  domain: StrategicUnitDomain;
  /** Explicit configured movement points. Null means unresolved; it never means zero. */
  movementPointsPerRound: number | null;
  capabilitySources: StrategicCapabilitySource[];
  transportRequirements: StrategicCapabilityGrant[];
}

export interface StrategicFormationStateBase {
  id: string;
  battalionId: string;
  name: string;
  currentNodeId: string | null;
  movementProfile: StrategicMovementProfile;
  movementPointsPerRound: number | null;
  transit: StrategicTransitState | null;
  version: number;
}

export interface StrategicBattlegroupState extends StrategicFormationStateBase {
  kind: "BATTLEGROUP";
  status: BattlegroupStatus;
  currentOperationId: string | null;
  currentCarrierTaskForceId: string | null;
  units: StrategicUnitComposition[];
}

export interface StrategicTaskForceState extends StrategicFormationStateBase {
  kind: "TASK_FORCE";
  status: TaskForceStatus;
  shipIds: string[];
  embarkedBattlegroupIds: string[];
  capabilitySources: StrategicCapabilitySource[];
  supply: StrategicSupplyState;
}

export interface StrategicShipState {
  id: string;
  battalionId: string;
  currentNodeId: string | null;
  moduleCapabilitySources: StrategicCapabilitySource[];
  version: number;
}

export interface StrategicOperationState extends OperationSummaryDto {
  controlEffectsApplied: boolean;
}

export type StrategicPhase = "PLANNING" | "LOCKED" | "RESOLVING" | "PAUSED" | "COMPLETE" | "FAILED";

export type StrategicCampaignOutcome = "VICTORY" | "DEFEAT" | "WITHDRAWAL" | "PYRRHIC_VICTORY" | "OBJECTIVE_PARTIAL";

export interface StrategicCampaignResult {
  effectId: string;
  campaignId: string;
  resultVersion: number;
  operationId: string;
  outcome: StrategicCampaignOutcome;
  nodeControl?: { nodeId: string; control: StrategicNodeControl };
  routeChanges: Array<{ routeId: string; status: StrategicRouteStatus }>;
  warVariableDeltas: Array<{ variableId: string; delta: number }>;
}

export interface StrategicResolutionRecord {
  key: string;
  mapId: string;
  round: number;
  retryInputHash: string;
  inputHash: string;
  resultHash: string;
  eventIds: string[];
}

interface StrategicEventBase<TType extends string, TPayload> {
  eventId: string;
  mapId: string;
  round: number;
  sequence: number;
  type: TType;
  actorId?: string;
  payload: TPayload;
  timestamp: number;
  visibility: "OWNER" | "BATTALION" | "PUBLIC" | "ADMIN";
}

export type StrategicEvent =
  | StrategicEventBase<"STRATEGIC_ORDER_ACCEPTED", { orderId: string; commandId: string }>
  | StrategicEventBase<
      "STRATEGIC_ORDER_REJECTED",
      { orderId: string; commandId: string; code: StrategicOrderRejectionCode; message: string }
    >
  | StrategicEventBase<
      "FORMATION_MOVEMENT_STARTED",
      { formation: StrategicFormationRef; routeNodeIds: string[]; routeIds: string[]; etaRound: number }
    >
  | StrategicEventBase<
      "FORMATION_TRAVEL_PROGRESS",
      { formation: StrategicFormationRef; progress: number; totalTravelCost: number }
    >
  | StrategicEventBase<
      "FORMATION_ARRIVED",
      { formation: StrategicFormationRef; nodeId: string }
    >
  | StrategicEventBase<
      "BATTLEGROUP_EMBARKED",
      { battlegroupId: string; taskForceId: string; nodeId: string }
    >
  | StrategicEventBase<
      "BATTLEGROUP_DISEMBARKED",
      { battlegroupId: string; taskForceId: string; nodeId: string }
    >
  | StrategicEventBase<"LARGE_SUPPLY_CONSUMED", { taskForceId: string; amount: 1; remaining: number }>
  | StrategicEventBase<"TASK_FORCE_SUPPLIED", { taskForceId: string; suppliedThroughRound: number }>
  | StrategicEventBase<
      "SUPPLY_TRANSFERRED",
      { size: SupplySize; amount: number; source: StrategicSupplyEndpointRef; destination: StrategicSupplyEndpointRef }
    >
  | StrategicEventBase<
      "OPERATION_DEPLOYMENT_STARTED",
      { operationId: string; battlegroupId: string; deploymentMethod: StrategicDeploymentMethod }
    >
  | StrategicEventBase<
      "OPERATION_SUPPORT_ASSIGNED",
      { operationId: string; formation: StrategicFormationRef; capability: StrategicCapability }
    >
  | StrategicEventBase<
      "CAMPAIGN_OUTCOME_APPLIED",
      { effectId: string; campaignId: string; operationId: string; outcome: StrategicCampaignOutcome }
    >
  | StrategicEventBase<"STRATEGIC_NODE_CONTROL_CHANGED", { nodeId: string; control: StrategicNodeControl }>
  | StrategicEventBase<"STRATEGIC_ROUTE_STATUS_CHANGED", { routeId: string; status: StrategicRouteStatus }>
  | StrategicEventBase<"ORBITAL_COMBAT_DEFERRED", { orderId: string; opposingFormationId: string }>
  | StrategicEventBase<"STRATEGIC_ROUND_RESOLVED", { inputHash: string; resultHash: string; nextRound: number }>;

export type StrategicOrderRejectionCode =
  | "WRONG_MAP"
  | "STALE_MAP_VERSION"
  | "STALE_FORMATION_VERSION"
  | "FORMATION_NOT_FOUND"
  | "FORMATION_KIND_MISMATCH"
  | "DUPLICATE_FORMATION_ORDER"
  | "INVALID_DESTINATION"
  | "ROUTE_NOT_FOUND"
  | "ROUTE_BLOCKED"
  | "ROUTE_TIMING_UNRESOLVED"
  | "MOVEMENT_PROFILE_FORBIDDEN"
  | "FORMATION_ALREADY_IN_TRANSIT"
  | "BATTLEGROUP_INVALID_COMPOSITION"
  | "BATTLEGROUP_EMBARKED"
  | "NOT_COLOCATED"
  | "INSUFFICIENT_CAPACITY"
  | "INSUFFICIENT_SUPPLY"
  | "SUPPLY_SOURCE_OFFLINE"
  | "OPERATION_NOT_FOUND"
  | "OPERATION_UNAVAILABLE"
  | "DEPLOYMENT_CAPABILITY_MISSING"
  | "TACTICAL_WITHDRAWAL_REQUIRED"
  | "ORBITAL_COMBAT_DEFERRED"
  | "UNSUPPORTED_INTENT";

interface StrategicPersistentEffectBase<TType extends string, TPayload> {
  idempotencyKey: string;
  type: TType;
  payload: TPayload;
}

export type StrategicPersistentEffect =
  | StrategicPersistentEffectBase<"FORMATION_STATE", { formation: StrategicFormationRef; version: number }>
  | StrategicPersistentEffectBase<"SUPPLY_STATE", { location: StrategicSupplyEndpointRef }>
  | StrategicPersistentEffectBase<"OPERATION_STATE", { operationId: string; version: number }>
  | StrategicPersistentEffectBase<"NODE_CONTROL", { nodeId: string; control: StrategicNodeControl }>
  | StrategicPersistentEffectBase<"ROUTE_STATUS", { routeId: string; status: StrategicRouteStatus }>
  | StrategicPersistentEffectBase<"WAR_VARIABLE_DELTA", { variableId: string; delta: number; sourceEffectId: string }>;

export interface StrategicRuntimeState {
  mapId: string;
  rulesetVersion: string;
  engineVersion: string;
  round: number;
  phase: StrategicPhase;
  version: number;
  nodes: StrategicNodeDto[];
  routes: StrategicRouteDto[];
  ships: StrategicShipState[];
  taskForces: StrategicTaskForceState[];
  battlegroups: StrategicBattlegroupState[];
  operations: StrategicOperationState[];
  orders: StrategicOrderRecord[];
  events: StrategicEvent[];
  resolutions: Record<string, StrategicResolutionRecord>;
  appliedCampaignResultIds: string[];
}

export interface StrategicResolutionInput {
  previousState: StrategicRuntimeState;
  rulesetVersion: string;
  lockedOrders: StrategicOrderRecord[];
  campaignResults: StrategicCampaignResult[];
  resolutionTime: number;
}

export interface StrategicResolutionOutput {
  state: StrategicRuntimeState;
  events: StrategicEvent[];
  effects: StrategicPersistentEffect[];
  inputHash: string;
  resultHash: string;
}

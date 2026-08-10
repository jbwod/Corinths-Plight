import type {
  AbilityRef,
  AxialCoord,
  BattlefieldHex,
  ConstructionProfile,
  ConstructionProjectState,
  DurabilityProfile,
  EngineerRepairChoice,
  EngineerRepairProfile,
  FactionSide,
  HealingProfile,
  MovementProfile,
  SubsystemDamageProfile,
  SubsystemDefinition,
  SubsystemOperationalState,
  SubsystemRepairProfile,
  SubsystemState,
} from "../../domain/src";
import { calculateRouteCost, coordKey, hexDistance } from "./hex";

export const SPEED_QUARTERS_PER_UNIT = 4;

export function isQuarterSpeedValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Number.isInteger(value * SPEED_QUARTERS_PER_UNIT);
}

export function hasAllTags(tags: readonly string[], required: readonly string[] = []): boolean {
  const available = new Set(tags);
  return required.every((tag) => available.has(tag));
}

export function hasAnyTag(tags: readonly string[], candidates: readonly string[] = []): boolean {
  const available = new Set(tags);
  return candidates.some((tag) => available.has(tag));
}

export function abilityById(abilities: readonly AbilityRef[], abilityId: string): AbilityRef | undefined {
  return abilities.find((ability) => ability.abilityId === abilityId);
}

export interface MovementRouteInput {
  profile: MovementProfile;
  route: AxialCoord[];
  map: BattlefieldHex[];
  availableSpeed?: number;
  rush?: boolean;
  hostileGroundPositions?: AxialCoord[];
  unitTags?: readonly string[];
}

export interface MovementRouteResult {
  legal: boolean;
  reasons: string[];
  cost: number;
  availableSpeed: number;
  blockedAt?: AxialCoord;
}

function validNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateMovementRoute(input: MovementRouteInput): MovementRouteResult {
  const { profile, route, map } = input;
  const reasons: string[] = [];
  const availableSpeed = input.availableSpeed ?? profile.baseSpeed;
  if (!isQuarterSpeedValue(profile.baseSpeed) || !isQuarterSpeedValue(availableSpeed)) {
    reasons.push("Movement Speed must be a finite non-negative multiple of 0.25.");
  }
  if (route.length === 0) reasons.push("Movement route must contain a starting position.");
  if (profile.requiresFlightPath && route.length < 2) {
    reasons.push("This movement profile requires an explicit flight path.");
  }
  if (input.rush && !profile.canRush) reasons.push("This movement profile cannot Rush.");

  const mapIndex = new Set(map.map((hex) => coordKey(hex.coord)));
  for (let index = 0; index < route.length; index += 1) {
    if (!mapIndex.has(coordKey(route[index]))) {
      reasons.push(`Route leaves the battlefield at step ${index}.`);
      break;
    }
    if (index > 0 && hexDistance(route[index - 1], route[index]) !== 1) {
      reasons.push(`Route step ${index} is not adjacent.`);
      break;
    }
  }

  let blockedAt: AxialCoord | undefined;
  if (!profile.allowsHostilePassage && input.hostileGroundPositions?.length) {
    const hostile = new Set(input.hostileGroundPositions.map(coordKey));
    blockedAt = route.slice(1).find((coord) => hostile.has(coordKey(coord)));
    if (blockedAt) reasons.push(`Hostile formation blocks route at ${coordKey(blockedAt)}.`);
  }

  let cost = 0;
  if (reasons.every((reason) => !reason.startsWith("Route "))) {
    if (profile.terrainCostMode === "BATTLEFIELD") {
      const calculated = calculateRouteCost(route, map, {
        ignoresElevation: profile.ignoresElevation,
        ignoresRivers: profile.ignoresRivers,
        roadMultiplier: profile.roadMultiplier,
        unitTags: input.unitTags,
      });
      if (!calculated.legal) reasons.push(calculated.reason ?? "Movement route is illegal.");
      cost = calculated.total;
    } else {
      const flatStepCost = profile.flatStepCost ?? 1;
      if (!isQuarterSpeedValue(flatStepCost)) reasons.push("Flat movement step cost must be a multiple of 0.25.");
      else cost = Math.max(0, route.length - 1) * flatStepCost;
    }
  }
  if (input.rush) cost *= profile.rushCostMultiplier ?? 0.5;
  if (!isQuarterSpeedValue(cost)) reasons.push("Movement route cost must resolve to a multiple of 0.25 Speed.");
  if (cost > availableSpeed) reasons.push(`Movement Speed exceeded (${cost}/${availableSpeed}).`);

  return { legal: reasons.length === 0, reasons, cost, availableSpeed, blockedAt };
}

export interface DurabilityDamageResult {
  legal: boolean;
  reason?: string;
  before: number;
  loss: number;
  after: number;
  destroyed: boolean;
}

export function resolveDurabilityDamage(
  profile: DurabilityProfile,
  currentHealth: number,
  penetratingDamage: number,
): DurabilityDamageResult {
  const maximumHealthValid = validNonNegative(profile.maximumHealth) && profile.maximumHealth > 0;
  const before = maximumHealthValid && validNonNegative(currentHealth)
    ? Math.max(0, Math.min(profile.maximumHealth, currentHealth))
    : 0;
  if (!maximumHealthValid || !validNonNegative(currentHealth) || !validNonNegative(penetratingDamage)) {
    return {
      legal: false,
      reason: "Durability maximum, health, and penetrating damage must be finite non-negative values.",
      before,
      loss: 0,
      after: before,
      destroyed: before === 0,
    };
  }
  const requestedLoss =
    profile.penetrationLoss === "ONE_HIT"
      ? penetratingDamage > 0
        ? 1
        : 0
      : penetratingDamage;
  const loss = Math.min(before, requestedLoss);
  const after = before - loss;
  return { legal: true, before, loss, after, destroyed: after === 0 };
}

export function capDamageOutput(
  profile: DurabilityProfile,
  currentHealth: number,
  rolledDamage: number,
): number {
  const normalized = validNonNegative(rolledDamage) ? rolledDamage : 0;
  return profile.outputScaling === "CURRENT_HEALTH"
    ? Math.min(normalized, validNonNegative(currentHealth) ? currentHealth : 0)
    : normalized;
}

export interface HealingParticipant {
  id: string;
  side: FactionSide;
  healthModel: DurabilityProfile["model"];
  currentHealth: number;
  maximumHealth: number;
}

export interface HealingInput {
  profile: HealingProfile;
  healer: HealingParticipant;
  target: HealingParticipant;
  distance: number;
  rolledAmount: number;
  supplyAvailable: number;
}

export interface HealingResult {
  legal: boolean;
  reason?: string;
  amount: number;
  targetHealthAfter: number;
  supplySpent: number;
  supplyAfter: number;
}

export function resolveHealing(input: HealingInput): HealingResult {
  const { profile, healer, target } = input;
  const rejected = (reason: string): HealingResult => ({
    legal: false,
    reason,
    amount: 0,
    targetHealthAfter: target.currentHealth,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
  });
  if (!validNonNegative(profile.maximumRange)) return rejected("Healing profile range is invalid.");
  if (!Number.isInteger(profile.supplyCost) || profile.supplyCost < 0) {
    return rejected("Healing supply cost must be a non-negative integer.");
  }
  if (
    typeof profile.amountCap === "number" &&
    (!validNonNegative(profile.amountCap) || profile.amountCap === 0)
  ) {
    return rejected("Healing amount cap must be positive.");
  }
  if (!validNonNegative(input.distance) || !Number.isInteger(input.rolledAmount) || input.rolledAmount <= 0) {
    return rejected("Healing distance must be non-negative and the roll must be a positive integer.");
  }
  if (!Number.isInteger(input.supplyAvailable) || input.supplyAvailable < 0) {
    return rejected("Healing supply must be a non-negative integer.");
  }
  if (
    !validNonNegative(healer.currentHealth) ||
    !validNonNegative(target.currentHealth) ||
    !validNonNegative(healer.maximumHealth) ||
    !validNonNegative(target.maximumHealth) ||
    healer.maximumHealth === 0 ||
    target.maximumHealth === 0 ||
    healer.currentHealth > healer.maximumHealth ||
    target.currentHealth > target.maximumHealth
  ) {
    return rejected("Healing participant health is invalid.");
  }
  if (profile.requiresFriendlyTarget && healer.side !== target.side) return rejected("Healing target is not friendly.");
  if (!profile.allowsSelfTarget && healer.id === target.id) return rejected("This healing ability cannot target itself.");
  if (!profile.targetHealthModels.includes(target.healthModel)) return rejected("Target durability model is ineligible.");
  if (target.currentHealth <= 0 && !profile.allowsDestroyedTarget) return rejected("Destroyed targets cannot be healed.");
  if (target.currentHealth >= target.maximumHealth) return rejected("Target is not wounded.");
  if (input.distance > profile.maximumRange) return rejected("Healing target is out of range.");
  if (input.supplyAvailable < profile.supplyCost) return rejected("Insufficient healing supply.");

  const missing = Math.max(0, target.maximumHealth - target.currentHealth);
  const configuredCap =
    profile.amountCap === "HEALER_CURRENT_HEALTH"
      ? Math.max(0, healer.currentHealth)
      : profile.amountCap === "TARGET_MISSING_HEALTH"
        ? missing
        : Math.max(0, profile.amountCap);
  const amount = Math.min(input.rolledAmount, configuredCap, missing);
  return {
    legal: true,
    amount,
    targetHealthAfter: target.currentHealth + amount,
    supplySpent: profile.supplyCost,
    supplyAfter: input.supplyAvailable - profile.supplyCost,
  };
}

export interface EngineerRepairParticipant {
  id: string;
  side: FactionSide;
  healthModel: DurabilityProfile["model"];
  currentHealth: number;
  maximumHealth: number;
  subsystems: SubsystemState[];
}

export interface EngineerRepairInput {
  profile: EngineerRepairProfile;
  engineer: Pick<EngineerRepairParticipant, "id" | "side">;
  target: EngineerRepairParticipant;
  distance: number;
  supplyAvailable: number;
  choice: EngineerRepairChoice;
}

export interface EngineerRepairResult {
  legal: boolean;
  reason?: string;
  choice: EngineerRepairChoice;
  targetHealthAfter: number;
  subsystemsAfter: SubsystemState[];
  supplySpent: number;
  supplyAfter: number;
}

export function resolveEngineerRepair(input: EngineerRepairInput): EngineerRepairResult {
  const subsystemsAfter = input.target.subsystems.map((subsystem) => ({ ...subsystem }));
  const rejected = (reason: string): EngineerRepairResult => ({
    legal: false,
    reason,
    choice: input.choice,
    targetHealthAfter: input.target.currentHealth,
    subsystemsAfter,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
  });
  if (
    !validNonNegative(input.profile.maximumRange) ||
    !Number.isInteger(input.profile.hitRepair) || input.profile.hitRepair <= 0 ||
    !Number.isInteger(input.profile.supplyCost) || input.profile.supplyCost < 0
  ) {
    return rejected("Engineer repair profile is invalid.");
  }
  if (
    !validNonNegative(input.distance) ||
    !Number.isInteger(input.supplyAvailable) || input.supplyAvailable < 0 ||
    !validNonNegative(input.target.currentHealth) ||
    !validNonNegative(input.target.maximumHealth) ||
    input.target.maximumHealth <= 0 ||
    input.target.currentHealth > input.target.maximumHealth
  ) {
    return rejected("Engineer repair state is invalid.");
  }
  if (input.profile.requiresFriendlyTarget && input.engineer.side !== input.target.side) {
    return rejected("Repair target is not friendly.");
  }
  if (input.engineer.id === input.target.id) return rejected("Engineers cannot repair themselves as a vehicle target.");
  if (!input.profile.targetHealthModels.includes(input.target.healthModel)) return rejected("Repair target is not a vehicle.");
  if (input.target.currentHealth <= 0) return rejected("Destroyed targets cannot be repaired.");
  if (input.distance > input.profile.maximumRange) return rejected("Repair target is out of range.");
  if (input.supplyAvailable < input.profile.supplyCost) return rejected("Engineer repair requires one Small Supply.");

  const choice = input.choice;
  if (choice.kind === "HIT") {
    if (input.target.currentHealth >= input.target.maximumHealth) return rejected("Target has no lost Hit to repair.");
    return {
      legal: true,
      choice,
      targetHealthAfter: Math.min(input.target.maximumHealth, input.target.currentHealth + input.profile.hitRepair),
      subsystemsAfter,
      supplySpent: input.profile.supplyCost,
      supplyAfter: input.supplyAvailable - input.profile.supplyCost,
    };
  }

  const subsystem = subsystemsAfter.find((candidate) => candidate.subsystemId === choice.subsystemId);
  if (!subsystem) return rejected("Repair subsystem does not exist.");
  if (subsystem.state === "OPERATIONAL") return rejected("Repair subsystem is already operational.");
  subsystem.state = "OPERATIONAL";
  delete subsystem.damageSourceId;
  delete subsystem.damagedRound;
  return {
    legal: true,
    choice,
    targetHealthAfter: input.target.currentHealth,
    subsystemsAfter,
    supplySpent: input.profile.supplyCost,
    supplyAfter: input.supplyAvailable - input.profile.supplyCost,
  };
}

export interface BuildActionInput {
  profile: ConstructionProfile;
  project: ConstructionProjectState;
  builderTags: string[];
  supplyAvailable: number;
  actionsRequested?: number;
}

export interface BuildActionResult {
  legal: boolean;
  reason?: string;
  project: ConstructionProjectState;
  actionsApplied: number;
  supplySpent: number;
  supplyAfter: number;
}

export function resolveBuildAction(input: BuildActionInput): BuildActionResult {
  const { profile, project } = input;
  const rejected = (reason: string): BuildActionResult => ({
    legal: false,
    reason,
    project: structuredClone(project),
    actionsApplied: 0,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
  });
  if (["COMPLETE", "CANCELLED", "DESTROYED"].includes(project.status)) {
    return rejected(`Construction project is ${project.status.toLowerCase()}.`);
  }
  if (!hasAllTags(input.builderTags, profile.requiredBuilderTags)) return rejected("Builder lacks a required tag.");
  const actionsRequested = input.actionsRequested ?? 1;
  if (!Number.isInteger(actionsRequested) || actionsRequested <= 0) return rejected("Build actions must be a positive integer.");
  if (!Number.isInteger(input.supplyAvailable) || input.supplyAvailable < 0) {
    return rejected("Build supply must be a non-negative integer.");
  }
  if (
    !validNonNegative(profile.progressRequired) ||
    profile.progressRequired === 0 ||
    !validNonNegative(profile.progressPerAction) ||
    profile.progressPerAction === 0 ||
    !Number.isInteger(profile.supplyPerAction) ||
    profile.supplyPerAction < 0
  ) {
    return rejected("Construction profile contains invalid progress or supply values.");
  }
  if (
    profile.maximumActionsPerRound !== undefined &&
    (!Number.isInteger(profile.maximumActionsPerRound) || profile.maximumActionsPerRound <= 0)
  ) {
    return rejected("Construction round action limit must be a positive integer.");
  }
  if (!validNonNegative(project.progress) || project.progress >= profile.progressRequired) {
    return rejected("Construction project progress is invalid or already complete.");
  }
  const roundLimit = profile.maximumActionsPerRound ?? actionsRequested;
  const remaining = Math.max(0, profile.progressRequired - project.progress);
  const actionsNeeded = Math.ceil(remaining / profile.progressPerAction);
  const affordable = profile.supplyPerAction === 0
    ? actionsRequested
    : Math.floor(input.supplyAvailable / profile.supplyPerAction);
  const actionsApplied = Math.min(actionsRequested, roundLimit, actionsNeeded, affordable);
  if (actionsApplied <= 0) return rejected("Insufficient build supply.");
  const supplySpent = actionsApplied * profile.supplyPerAction;
  const progress = Math.min(profile.progressRequired, project.progress + actionsApplied * profile.progressPerAction);
  return {
    legal: true,
    project: {
      ...structuredClone(project),
      progress,
      status: progress >= profile.progressRequired ? "COMPLETE" : "IN_PROGRESS",
    },
    actionsApplied,
    supplySpent,
    supplyAfter: input.supplyAvailable - supplySpent,
  };
}

function subsystemRank(state: SubsystemOperationalState): number {
  return state === "OPERATIONAL" ? 0 : state === "DAMAGED" ? 1 : 2;
}

export interface SubsystemDamageInput {
  profile: SubsystemDamageProfile;
  definitions: SubsystemDefinition[];
  states: SubsystemState[];
  penetrated: boolean;
  naturalRoll: number;
  attackerCurrentHealth?: number;
  sourceId?: string;
  round?: number;
}

export interface SubsystemDamageResult {
  triggered: boolean;
  reason?: string;
  affectedSubsystemIds: string[];
  states: SubsystemState[];
}

export function resolveSubsystemDamage(input: SubsystemDamageInput): SubsystemDamageResult {
  const cloned = input.states.map((state) => ({ ...state }));
  if (!Number.isInteger(input.naturalRoll) || input.naturalRoll <= 0) {
    return { triggered: false, reason: "Natural roll must be a positive integer.", affectedSubsystemIds: [], states: cloned };
  }
  if (input.profile.requiresPenetration && !input.penetrated) {
    return { triggered: false, reason: "Attack did not penetrate.", affectedSubsystemIds: [], states: cloned };
  }
  const trigger = input.profile.triggers.find((candidate) => candidate.naturalRolls.includes(input.naturalRoll));
  if (!trigger) return { triggered: false, reason: "Natural roll does not trigger subsystem damage.", affectedSubsystemIds: [], states: cloned };
  if (
    trigger.requiresAttackerHealthAtLeastRoll &&
    (input.attackerCurrentHealth ?? 0) < input.naturalRoll
  ) {
    return { triggered: false, reason: "Attacker lacks the required current health.", affectedSubsystemIds: [], states: cloned };
  }

  const matching = input.definitions
    .filter((definition) => definition.kind === trigger.targetKind)
    .sort((left, right) => left.id.localeCompare(right.id));
  const selected = trigger.selection === "ALL" ? matching : matching.slice(0, 1);
  if (selected.length === 0) return { triggered: false, reason: "No matching subsystem exists.", affectedSubsystemIds: [], states: cloned };
  const byId = new Map(cloned.map((state) => [state.subsystemId, state]));
  const affectedSubsystemIds: string[] = [];
  for (const definition of selected) {
    const existing = byId.get(definition.id) ?? { subsystemId: definition.id, state: "OPERATIONAL" as const };
    if (subsystemRank(trigger.resultingState) > subsystemRank(existing.state)) {
      existing.state = trigger.resultingState;
      existing.damageSourceId = input.sourceId;
      existing.damagedRound = input.round;
      affectedSubsystemIds.push(definition.id);
    }
    byId.set(definition.id, existing);
  }
  return {
    triggered: affectedSubsystemIds.length > 0,
    reason: affectedSubsystemIds.length > 0 ? undefined : "Subsystems were already at an equal or worse state.",
    affectedSubsystemIds,
    states: [...byId.values()].sort((left, right) => left.subsystemId.localeCompare(right.subsystemId)),
  };
}

export interface SubsystemRepairInput {
  profile: SubsystemRepairProfile;
  states: SubsystemState[];
  subsystemId: string;
  movedThisRound: boolean;
  actionsSpent: number;
  crewExposed: boolean;
  supplyAvailable: number;
}

export interface SubsystemRepairResult {
  legal: boolean;
  reason?: string;
  states: SubsystemState[];
  supplySpent: number;
  supplyAfter: number;
}

export function resolveSubsystemRepair(input: SubsystemRepairInput): SubsystemRepairResult {
  const states = input.states.map((state) => ({ ...state }));
  const rejected = (reason: string): SubsystemRepairResult => ({
    legal: false,
    reason,
    states,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
  });
  if (
    !Number.isInteger(input.profile.requiredActions) ||
    input.profile.requiredActions <= 0 ||
    !Number.isInteger(input.profile.supplyCost) ||
    input.profile.supplyCost < 0
  ) {
    return rejected("Subsystem repair profile contains invalid action or supply costs.");
  }
  const target = states.find((state) => state.subsystemId === input.subsystemId);
  if (!target) return rejected("Subsystem does not exist.");
  if (target.state === "OPERATIONAL") return rejected("Subsystem is already operational.");
  if (input.profile.requiresStationary && input.movedThisRound) return rejected("Subsystem repair requires a stationary unit.");
  if (input.profile.requiresCrewExposed && !input.crewExposed) return rejected("Subsystem repair requires exposed crew.");
  if (!Number.isInteger(input.actionsSpent) || input.actionsSpent < input.profile.requiredActions) {
    return rejected("Insufficient repair actions.");
  }
  if (!Number.isInteger(input.supplyAvailable) || input.supplyAvailable < input.profile.supplyCost) {
    return rejected("Insufficient repair supply.");
  }
  target.state = "OPERATIONAL";
  delete target.damageSourceId;
  delete target.damagedRound;
  return {
    legal: true,
    states,
    supplySpent: input.profile.supplyCost,
    supplyAfter: input.supplyAvailable - input.profile.supplyCost,
  };
}

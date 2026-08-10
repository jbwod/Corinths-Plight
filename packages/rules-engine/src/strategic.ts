import type {
  StrategicBattlegroupState,
  StrategicCampaignResult,
  StrategicCapability,
  StrategicCapabilitySource,
  StrategicCapabilitySummary,
  StrategicEvent,
  StrategicFormationRef,
  StrategicMovementProfile,
  StrategicNodeDto,
  StrategicOrderRecord,
  StrategicOrderRejectionCode,
  StrategicPersistentEffect,
  StrategicResolutionInput,
  StrategicResolutionOutput,
  StrategicRouteDto,
  StrategicRuntimeState,
  StrategicSupplyState,
  StrategicTaskForceState,
  StrategicUnitComposition,
  SupplySize,
} from "../../domain/src";
import { hashSeed } from "./rng";

export const STRATEGIC_ENGINE_VERSION = "strategic-foundation-0.1.0" as const;

/** Locale-independent Unicode code-point order for canonical hashes and replay ordering. */
export function compareStrategicCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** JSON with recursively sorted object keys. Array order remains semantically significant. */
export function canonicalStrategicJson(value: unknown): string {
  const seen = new Set<object>();
  const canonicalize = (item: unknown): unknown => {
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new TypeError("Strategic canonicalization accepts finite numbers only.");
    }
    if (typeof item === "bigint" || typeof item === "function" || typeof item === "symbol") {
      throw new TypeError("Strategic canonicalization accepts JSON values only.");
    }
    if (item === null || typeof item !== "object") return item;
    if (seen.has(item)) throw new TypeError("Strategic canonicalization does not accept cyclic values.");
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map(canonicalize)
      : Object.fromEntries(
          Object.entries(item)
            .filter(([, child]) => child !== undefined)
            .sort(([left], [right]) => compareStrategicCodePoints(left, right))
            .map(([key, child]) => [key, canonicalize(child)]),
        );
    seen.delete(item);
    return result;
  };
  return JSON.stringify(canonicalize(value));
}

/** Replay-stable integrity digest. Authorization must never treat this non-cryptographic hash as a signature. */
export function strategicStableHash(value: unknown): string {
  return hashSeed(canonicalStrategicJson(value)).toString(16).padStart(8, "0");
}

export interface StrategicCapabilityAggregation {
  valid: boolean;
  issues: string[];
  capabilities: StrategicCapabilitySummary[];
}

export function aggregateStrategicCapabilities(
  sources: readonly StrategicCapabilitySource[],
): StrategicCapabilityAggregation {
  const issues: string[] = [];
  const seenSources = new Set<string>();
  const totals = new Map<StrategicCapability, { value: number; sourceIds: Set<string> }>();
  for (const source of [...sources].sort(
    (left, right) =>
      compareStrategicCodePoints(left.sourceKind, right.sourceKind) ||
      compareStrategicCodePoints(left.sourceId, right.sourceId),
  )) {
    const sourceKey = `${source.sourceKind}:${source.sourceId}`;
    if (seenSources.has(sourceKey)) {
      issues.push(`Capability source ${sourceKey} appears more than once.`);
      continue;
    }
    seenSources.add(sourceKey);
    for (const grant of [...source.grants].sort((left, right) =>
      compareStrategicCodePoints(left.capability, right.capability))) {
      if (!Number.isFinite(grant.value) || grant.value < 0) {
        issues.push(`${sourceKey} has an invalid ${grant.capability} capability value.`);
        continue;
      }
      if (grant.value === 0) continue;
      const existing = totals.get(grant.capability) ?? { value: 0, sourceIds: new Set<string>() };
      existing.value += grant.value;
      existing.sourceIds.add(source.sourceId);
      totals.set(grant.capability, existing);
    }
  }
  const capabilities = [...totals.entries()]
    .sort(([left], [right]) => compareStrategicCodePoints(left, right))
    .map(([capability, value]) => ({
      capability,
      value: value.value,
      sourceIds: [...value.sourceIds].sort(compareStrategicCodePoints),
    }));
  return { valid: issues.length === 0, issues, capabilities };
}

export interface BattlegroupCompositionValidation {
  valid: boolean;
  reasons: Array<
    | "EMPTY_BATTLEGROUP"
    | "AEROSPACE_ONLY_BATTLEGROUP"
    | "ORBITAL_UNIT_IN_BATTLEGROUP"
    | "DUPLICATE_UNIT"
    | "MISSING_STRATEGIC_SPEED"
    | "INVALID_STRATEGIC_SPEED"
    | "INVALID_CAPABILITY_SOURCE"
  >;
  capabilities: StrategicCapabilitySummary[];
  movementPointsPerRound: number | null;
}

/**
 * Battlegroups are ground formations. Attached aerospace is allowed, but it can
 * neither constitute the whole group nor conceal an unresolved ground speed.
 */
export function validateBattlegroupComposition(
  units: readonly StrategicUnitComposition[],
): BattlegroupCompositionValidation {
  const reasons: BattlegroupCompositionValidation["reasons"] = [];
  if (units.length === 0) reasons.push("EMPTY_BATTLEGROUP");
  if (new Set(units.map((unit) => unit.unitId)).size !== units.length) reasons.push("DUPLICATE_UNIT");
  const groundUnits = units.filter((unit) => unit.domain === "GROUND");
  if (units.length > 0 && groundUnits.length === 0 && units.every((unit) => unit.domain === "AEROSPACE")) {
    reasons.push("AEROSPACE_ONLY_BATTLEGROUP");
  }
  if (units.some((unit) => unit.domain === "ORBITAL")) reasons.push("ORBITAL_UNIT_IN_BATTLEGROUP");
  if (groundUnits.some((unit) => unit.movementPointsPerRound === null)) reasons.push("MISSING_STRATEGIC_SPEED");
  if (
    groundUnits.some(
      (unit) =>
        unit.movementPointsPerRound !== null &&
        (!Number.isFinite(unit.movementPointsPerRound) || unit.movementPointsPerRound <= 0),
    )
  ) {
    reasons.push("INVALID_STRATEGIC_SPEED");
  }
  const aggregation = aggregateStrategicCapabilities(units.flatMap((unit) => unit.capabilitySources));
  if (!aggregation.valid) reasons.push("INVALID_CAPABILITY_SOURCE");
  const resolvedGroundSpeeds = groundUnits
    .map((unit) => unit.movementPointsPerRound)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed) && speed > 0);
  const movementPointsPerRound =
    groundUnits.length > 0 && resolvedGroundSpeeds.length === groundUnits.length
      ? Math.min(...resolvedGroundSpeeds)
      : null;
  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    capabilities: aggregation.capabilities,
    movementPointsPerRound,
  };
}

export interface BattlegroupMovementProfileValidation {
  valid: boolean;
  compositionValid: boolean;
  profileSupported: boolean;
  reasons: string[];
  movementPointsPerRound: number | null;
  capabilities: StrategicCapabilitySummary[];
  transportRequirements: StrategicCapabilitySummary[];
}

/** AIR_MOBILE is earned only when attached lift satisfies every ground-unit requirement. */
export function validateBattlegroupMovementProfile(
  units: readonly StrategicUnitComposition[],
  profile: StrategicMovementProfile,
): BattlegroupMovementProfileValidation {
  const composition = validateBattlegroupComposition(units);
  const reasons: string[] = [...composition.reasons];
  const profileReasons: string[] = [];
  const requirementSources: StrategicCapabilitySource[] = units
    .filter((unit) => unit.domain === "GROUND")
    .map((unit) => ({
      sourceId: `movement-requirement:${unit.unitId}`,
      sourceKind: "UNIT",
      grants: unit.transportRequirements,
    }));
  const requirements = aggregateStrategicCapabilities(requirementSources);
  if (!requirements.valid) profileReasons.push(...requirements.issues);
  if (profile === "TASK_FORCE") profileReasons.push("A Battlegroup cannot use the Task Force movement profile.");
  if (profile === "AIR_MOBILE_BATTLEGROUP") {
    if (capabilityValue(composition.capabilities, "AIR_MOBILE") <= 0) {
      profileReasons.push("AIR_MOBILE capability is required for air-mobile movement.");
    }
    for (const requirement of requirements.capabilities) {
      const available = capabilityValue(composition.capabilities, requirement.capability);
      if (available < requirement.value) {
        profileReasons.push(`${requirement.capability} lift capacity is insufficient (${available}/${requirement.value}).`);
      }
    }
  }
  reasons.push(...profileReasons);
  const profileSupported = profileReasons.length === 0;
  return {
    valid: composition.valid && profileSupported,
    compositionValid: composition.valid,
    profileSupported,
    reasons,
    movementPointsPerRound: composition.movementPointsPerRound,
    capabilities: composition.capabilities,
    transportRequirements: requirements.capabilities,
  };
}

export type StrategicRouteFailureCode =
  | "INVALID_ROUTE"
  | "INVALID_START"
  | "INVALID_DESTINATION"
  | "ROUTE_NOT_FOUND"
  | "ROUTE_BLOCKED"
  | "ROUTE_TIMING_UNRESOLVED"
  | "MOVEMENT_PROFILE_FORBIDDEN";

export type StrategicRouteValidation =
  | {
      valid: true;
      routeNodeIds: string[];
      routeIds: string[];
      totalTravelCost: number;
    }
  | {
      valid: false;
      code: StrategicRouteFailureCode;
      message: string;
      failedAtIndex?: number;
    };

type StrategicRouteFailure = Extract<StrategicRouteValidation, { valid: false }>;
type ResolvedStrategicRoute = StrategicRouteDto & { baseTravelRounds: number };

export interface StrategicRouteValidationInput {
  nodes: readonly StrategicNodeDto[];
  routes: readonly StrategicRouteDto[];
  routeNodeIds: readonly string[];
  movementProfile: StrategicMovementProfile;
  startNodeId: string;
  destinationNodeId: string;
}

function connects(route: StrategicRouteDto, fromNodeId: string, toNodeId: string): boolean {
  return (
    (route.fromNodeId === fromNodeId && route.toNodeId === toNodeId) ||
    (route.direction === "BIDIRECTIONAL" && route.fromNodeId === toNodeId && route.toNodeId === fromNodeId)
  );
}

function routeTimingResolved(route: StrategicRouteDto): route is ResolvedStrategicRoute {
  return (
    route.travelCostStatus !== "BALANCE_REQUIRED" &&
    route.baseTravelRounds !== null &&
    Number.isFinite(route.baseTravelRounds) &&
    route.baseTravelRounds > 0
  );
}

function selectConnection(
  routes: readonly StrategicRouteDto[],
  fromNodeId: string,
  toNodeId: string,
  movementProfile: StrategicMovementProfile,
): ResolvedStrategicRoute | StrategicRouteFailure {
  const adjacent = routes.filter((route) => connects(route, fromNodeId, toNodeId));
  if (adjacent.length === 0) {
    return { valid: false, code: "ROUTE_NOT_FOUND", message: `No route connects ${fromNodeId} to ${toNodeId}.` };
  }
  const open = adjacent.filter((route) => route.status === "OPEN");
  if (open.length === 0) {
    return { valid: false, code: "ROUTE_BLOCKED", message: `Every route from ${fromNodeId} to ${toNodeId} is closed.` };
  }
  const profileAllowed = open.filter((route) => route.allowedMovementProfiles.includes(movementProfile));
  if (profileAllowed.length === 0) {
    return {
      valid: false,
      code: "MOVEMENT_PROFILE_FORBIDDEN",
      message: `${movementProfile} cannot use the route from ${fromNodeId} to ${toNodeId}.`,
    };
  }
  const timed: ResolvedStrategicRoute[] = profileAllowed.filter(routeTimingResolved);
  if (timed.length === 0) {
    return {
      valid: false,
      code: "ROUTE_TIMING_UNRESOLVED",
      message: `Route timing from ${fromNodeId} to ${toNodeId} is not published.`,
    };
  }
  return [...timed].sort(
    (left, right) =>
      left.baseTravelRounds - right.baseTravelRounds || compareStrategicCodePoints(left.id, right.id),
  )[0];
}

export function validateStrategicRoute(input: StrategicRouteValidationInput): StrategicRouteValidation {
  const nodeIndex = new Map(input.nodes.map((node) => [node.id, node]));
  const startNode = nodeIndex.get(input.startNodeId);
  const destinationNode = nodeIndex.get(input.destinationNodeId);
  if (!startNode || startNode.status === "DESTROYED") {
    return { valid: false, code: "INVALID_START", message: "The route start node does not exist." };
  }
  if (!destinationNode || destinationNode.status !== "OPEN" || destinationNode.mapId !== startNode.mapId) {
    return { valid: false, code: "INVALID_DESTINATION", message: "The route destination node is not open." };
  }
  if (
    input.routeNodeIds.length === 0 ||
    input.routeNodeIds[0] !== input.startNodeId ||
    input.routeNodeIds.at(-1) !== input.destinationNodeId
  ) {
    return {
      valid: false,
      code: "INVALID_ROUTE",
      message: "The route must start and finish at its declared nodes.",
    };
  }
  if (
    input.routeNodeIds
      .slice(1)
      .some((nodeId) => {
        const candidate = nodeIndex.get(nodeId);
        return candidate?.status !== "OPEN" || candidate.mapId !== startNode.mapId;
      })
  ) {
    return { valid: false, code: "INVALID_ROUTE", message: "The route contains an unavailable node." };
  }
  if (new Set(input.routeNodeIds).size !== input.routeNodeIds.length) {
    return { valid: false, code: "INVALID_ROUTE", message: "Strategic routes cannot contain cycles." };
  }

  const routeIds: string[] = [];
  let totalTravelCost = 0;
  const scopedRoutes = input.routes.filter((route) => route.mapId === startNode.mapId);
  for (let index = 1; index < input.routeNodeIds.length; index += 1) {
    const connection = selectConnection(
      scopedRoutes,
      input.routeNodeIds[index - 1],
      input.routeNodeIds[index],
      input.movementProfile,
    );
    if ("valid" in connection) return { ...connection, failedAtIndex: index };
    routeIds.push(connection.id);
    totalTravelCost += connection.baseTravelRounds;
  }
  return { valid: true, routeNodeIds: [...input.routeNodeIds], routeIds, totalTravelCost };
}

export type StrategicRoutePlan = StrategicRouteValidation;

export interface StrategicRoutePlanInput {
  nodes: readonly StrategicNodeDto[];
  routes: readonly StrategicRouteDto[];
  movementProfile: StrategicMovementProfile;
  startNodeId: string;
  destinationNodeId: string;
}

function neighboringNode(route: StrategicRouteDto, nodeId: string): string | undefined {
  if (route.fromNodeId === nodeId) return route.toNodeId;
  if (route.direction === "BIDIRECTIONAL" && route.toNodeId === nodeId) return route.fromNodeId;
  return undefined;
}

function pathExists(
  input: StrategicRoutePlanInput,
  options: { requireOpen: boolean; requireProfile: boolean },
): boolean {
  const traversableNodes = new Set(
    input.nodes.filter((node) => node.status === "OPEN" || node.id === input.startNodeId).map((node) => node.id),
  );
  const visited = new Set([input.startNodeId]);
  const queue = [input.startNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === input.destinationNodeId) return true;
    for (const route of input.routes) {
      if (options.requireOpen && route.status !== "OPEN") continue;
      if (options.requireProfile && !route.allowedMovementProfiles.includes(input.movementProfile)) continue;
      const neighbor = neighboringNode(route, current);
      if (neighbor && traversableNodes.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

/** Deterministic Dijkstra search. Equal-cost paths are resolved by their route-ID signature. */
export function findStrategicRoute(input: StrategicRoutePlanInput): StrategicRoutePlan {
  const nodeIndex = new Map(input.nodes.map((node) => [node.id, node]));
  const startNode = nodeIndex.get(input.startNodeId);
  const destinationNode = nodeIndex.get(input.destinationNodeId);
  if (!startNode || startNode.status === "DESTROYED") {
    return { valid: false, code: "INVALID_START", message: "The route start node does not exist." };
  }
  if (!destinationNode || destinationNode.status !== "OPEN" || destinationNode.mapId !== startNode.mapId) {
    return { valid: false, code: "INVALID_DESTINATION", message: "The route destination node is not open." };
  }
  if (input.startNodeId === input.destinationNodeId) {
    return {
      valid: true,
      routeNodeIds: [input.startNodeId],
      routeIds: [],
      totalTravelCost: 0,
    };
  }

  type Candidate = { nodeId: string; cost: number; nodeIds: string[]; routeIds: string[]; signature: string };
  const scopedInput: StrategicRoutePlanInput = {
    ...input,
    nodes: input.nodes.filter((candidate) => candidate.mapId === startNode.mapId),
    routes: input.routes.filter((candidate) => candidate.mapId === startNode.mapId),
  };
  const candidates: Candidate[] = [
    { nodeId: input.startNodeId, cost: 0, nodeIds: [input.startNodeId], routeIds: [], signature: "" },
  ];
  const best = new Map<string, { cost: number; signature: string }>();
  while (candidates.length > 0) {
    candidates.sort(
      (left, right) =>
        left.cost - right.cost ||
        compareStrategicCodePoints(left.signature, right.signature) ||
        compareStrategicCodePoints(left.nodeId, right.nodeId),
    );
    const current = candidates.shift()!;
    const known = best.get(current.nodeId);
    if (known && (known.cost < current.cost || (known.cost === current.cost && known.signature <= current.signature))) continue;
    best.set(current.nodeId, { cost: current.cost, signature: current.signature });
    if (current.nodeId === input.destinationNodeId) {
      return {
        valid: true,
        routeNodeIds: current.nodeIds,
        routeIds: current.routeIds,
        totalTravelCost: current.cost,
      };
    }
    const outgoing = scopedInput.routes
      .filter(
        (route): route is ResolvedStrategicRoute =>
          route.status === "OPEN" &&
          route.allowedMovementProfiles.includes(input.movementProfile) &&
          routeTimingResolved(route) &&
          neighboringNode(route, current.nodeId) !== undefined,
      )
      .sort((left, right) => compareStrategicCodePoints(left.id, right.id));
    for (const route of outgoing) {
      const neighbor = neighboringNode(route, current.nodeId)!;
      if (nodeIndex.get(neighbor)?.status !== "OPEN") continue;
      if (current.nodeIds.includes(neighbor)) continue;
      const routeIds = [...current.routeIds, route.id];
      const signature = routeIds.join("\u0000");
      const cost = current.cost + route.baseTravelRounds;
      const neighborBest = best.get(neighbor);
      if (neighborBest && (neighborBest.cost < cost || (neighborBest.cost === cost && neighborBest.signature <= signature))) {
        continue;
      }
      candidates.push({
        nodeId: neighbor,
        cost,
        nodeIds: [...current.nodeIds, neighbor],
        routeIds,
        signature,
      });
    }
  }

  if (pathExists(scopedInput, { requireOpen: true, requireProfile: true })) {
    return {
      valid: false,
      code: "ROUTE_TIMING_UNRESOLVED",
      message: "A route exists, but one or more travel values are unresolved or balance-required.",
    };
  }
  if (pathExists(scopedInput, { requireOpen: true, requireProfile: false })) {
    return {
        valid: false,
        code: "MOVEMENT_PROFILE_FORBIDDEN",
        message: `${input.movementProfile} cannot reach the destination over the available routes.`,
      };
  }
  if (pathExists(scopedInput, { requireOpen: false, requireProfile: true })) {
    return { valid: false, code: "ROUTE_BLOCKED", message: "Every compatible path to the destination is blocked or locked." };
  }
  return { valid: false, code: "ROUTE_NOT_FOUND", message: "No strategic route reaches the destination." };
}

export type StrategicTravelTiming =
  | { valid: true; roundsRequired: number; etaRound: number }
  | { valid: false; code: "INVALID_TRAVEL_COST" | "UNRESOLVED_MOVEMENT_RATE"; message: string };

export interface StrategicTravelTimingInput {
  totalTravelCost: number;
  movementPointsPerRound: number | null;
  startingRound: number;
}

export function calculateStrategicTravelTiming(input: StrategicTravelTimingInput): StrategicTravelTiming {
  if (!Number.isFinite(input.totalTravelCost) || input.totalTravelCost < 0) {
    return { valid: false, code: "INVALID_TRAVEL_COST", message: "Travel cost must be finite and non-negative." };
  }
  if (
    input.movementPointsPerRound === null ||
    !Number.isFinite(input.movementPointsPerRound) ||
    input.movementPointsPerRound <= 0
  ) {
    return {
      valid: false,
      code: "UNRESOLVED_MOVEMENT_RATE",
      message: "Formation movement is unresolved; missing values never mean zero or free travel.",
    };
  }
  const roundsRequired = Math.ceil(input.totalTravelCost / input.movementPointsPerRound);
  return { valid: true, roundsRequired, etaRound: input.startingRound + roundsRequired };
}

export type SupplyActivationResult =
  | { applied: true; supply: StrategicSupplyState; consumed: 1; suppliedThroughRound: number }
  | {
      applied: false;
      code: "INVALID_ROUND" | "INVALID_LOCATION" | "INVALID_BALANCE" | "INSUFFICIENT_SUPPLY" | "ALREADY_SUPPLIED";
      message: string;
      supply: StrategicSupplyState;
    };

function clonedSupply(supply: StrategicSupplyState): StrategicSupplyState {
  return structuredClone(supply);
}

function balanceFor(supply: StrategicSupplyState, size: SupplySize) {
  return supply.balances.find((balance) => balance.size === size);
}

/** One Large Supply makes a Task Force/HQ supplied for this and the next strategic round. */
export function applyLargeSupply(input: {
  currentRound: number;
  supply: StrategicSupplyState;
}): SupplyActivationResult {
  const supply = clonedSupply(input.supply);
  if (!Number.isInteger(input.currentRound) || input.currentRound < 0) {
    return { applied: false, code: "INVALID_ROUND", message: "Strategic round must be a non-negative integer.", supply };
  }
  if (supply.location.kind !== "TASK_FORCE" && supply.location.kind !== "HQ") {
    return { applied: false, code: "INVALID_LOCATION", message: "Large Supply can supply a Task Force or HQ.", supply };
  }
  const balance = balanceFor(supply, "LARGE");
  if (!balance || !Number.isInteger(balance.quantity) || balance.quantity < 0) {
    return { applied: false, code: "INVALID_BALANCE", message: "Large Supply balance is invalid.", supply };
  }
  const suppliedThroughRound = input.currentRound + 1;
  if (supply.suppliedThroughRound !== null && supply.suppliedThroughRound >= suppliedThroughRound) {
    return { applied: false, code: "ALREADY_SUPPLIED", message: "The location is already supplied for two rounds.", supply };
  }
  if (balance.quantity < 1) {
    return { applied: false, code: "INSUFFICIENT_SUPPLY", message: "No Large Supply remains at this location.", supply };
  }
  balance.quantity -= 1;
  supply.suppliedThroughRound = suppliedThroughRound;
  return { applied: true, supply, consumed: 1, suppliedThroughRound };
}

/** One Medium Supply keeps a FOB online for the current strategic round. */
export function applyMediumSupply(input: {
  currentRound: number;
  supply: StrategicSupplyState;
}): SupplyActivationResult {
  const supply = clonedSupply(input.supply);
  if (!Number.isInteger(input.currentRound) || input.currentRound < 0) {
    return { applied: false, code: "INVALID_ROUND", message: "Strategic round must be a non-negative integer.", supply };
  }
  if (supply.location.kind !== "FOB") {
    return { applied: false, code: "INVALID_LOCATION", message: "Medium Supply activation applies to FOBs.", supply };
  }
  const balance = balanceFor(supply, "MEDIUM");
  if (!balance || !Number.isInteger(balance.quantity) || balance.quantity < 0) {
    return { applied: false, code: "INVALID_BALANCE", message: "Medium Supply balance is invalid.", supply };
  }
  if (supply.suppliedThroughRound !== null && supply.suppliedThroughRound >= input.currentRound) {
    return { applied: false, code: "ALREADY_SUPPLIED", message: "The FOB is already online this round.", supply };
  }
  if (balance.quantity < 1) {
    return { applied: false, code: "INSUFFICIENT_SUPPLY", message: "No Medium Supply remains at this FOB.", supply };
  }
  balance.quantity -= 1;
  supply.suppliedThroughRound = input.currentRound;
  return { applied: true, supply, consumed: 1, suppliedThroughRound: input.currentRound };
}

export type SupplyDrawValidation =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | "INVALID_AMOUNT"
        | "INVALID_SOURCE"
        | "LARGE_SUPPLY_NOT_DRAWABLE"
        | "SOURCE_OFFLINE"
        | "LOGISTICS_REQUIRED"
        | "FOB_SMALL_ONLY";
      message: string;
    };

export function validateSupplyDraw(input: {
  currentRound: number;
  size: SupplySize;
  amount: number;
  source: StrategicSupplyState;
  requesterCapabilities: readonly StrategicCapabilitySummary[];
}): SupplyDrawValidation {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { allowed: false, code: "INVALID_AMOUNT", message: "Supply draw amount must be a positive integer." };
  }
  if (!["TASK_FORCE", "SHIP", "HQ", "FOB"].includes(input.source.location.kind)) {
    return {
      allowed: false,
      code: "INVALID_SOURCE",
      message: "This location carries supply but is not an online supply source.",
    };
  }
  if (input.size === "LARGE") {
    return {
      allowed: false,
      code: "LARGE_SUPPLY_NOT_DRAWABLE",
      message: "Large Supply is the finite strategic war chest and cannot be pulled as a lower-tier supply.",
    };
  }
  if (input.source.suppliedThroughRound === null || input.source.suppliedThroughRound < input.currentRound) {
    return { allowed: false, code: "SOURCE_OFFLINE", message: "The supply source is not online this round." };
  }
  if (!input.requesterCapabilities.some((item) => item.capability === "LOGISTICS" && item.value > 0)) {
    return { allowed: false, code: "LOGISTICS_REQUIRED", message: "A logistical unit must pull Small or Medium Supply." };
  }
  if (input.source.location.kind === "FOB" && input.size !== "SMALL") {
    return { allowed: false, code: "FOB_SMALL_ONLY", message: "A FOB can provide Small Supply, not Medium Supply." };
  }
  return { allowed: true };
}

export type SuppliedFacilityValidation =
  | { allowed: true }
  | {
      allowed: false;
      code: "SOURCE_OFFLINE" | "FACILITY_MISSING" | "INVALID_SOURCE";
      message: string;
    };

/** Repair/rearm/reload permission while supplied; rates and tactical costs remain catalogue-authored. */
export function validateSuppliedFacilityUse(input: {
  currentRound: number;
  source: StrategicSupplyState;
  requiredCapability: StrategicCapability;
}): SuppliedFacilityValidation {
  if (!["TASK_FORCE", "SHIP", "HQ"].includes(input.source.location.kind)) {
    return {
      allowed: false,
      code: "INVALID_SOURCE",
      message: "This facility is not a supplied Task Force, ship, or HQ.",
    };
  }
  if (input.source.suppliedThroughRound === null || input.source.suppliedThroughRound < input.currentRound) {
    return { allowed: false, code: "SOURCE_OFFLINE", message: "The facility source is not supplied this round." };
  }
  if (!input.source.facilities.includes(input.requiredCapability)) {
    return {
      allowed: false,
      code: "FACILITY_MISSING",
      message: `${input.requiredCapability} requires an appropriate installed facility.`,
    };
  }
  return { allowed: true };
}

export const STRATEGIC_RESOLUTION_PHASE_ORDER = [
  "VALIDATE",
  "FORMATION",
  "SUPPLY",
  "MOVEMENT",
  "OPERATIONS",
  "CAMPAIGN_RESULTS",
  "FINALIZE",
] as const;

type ResolutionPhase = (typeof STRATEGIC_RESOLUTION_PHASE_ORDER)[number];

function sortedStateClone(state: StrategicRuntimeState): StrategicRuntimeState {
  const clone = structuredClone(state);
  clone.nodes.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.routes.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.ships.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.taskForces.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.battlegroups.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.operations.sort((left, right) => compareStrategicCodePoints(left.id, right.id));
  clone.orders.sort((left, right) =>
    compareStrategicCodePoints(left.id, right.id) || left.revision - right.revision);
  clone.events.sort(
    (left, right) =>
      left.round - right.round ||
      left.sequence - right.sequence ||
      compareStrategicCodePoints(left.eventId, right.eventId),
  );
  clone.appliedCampaignResultIds.sort(compareStrategicCodePoints);
  return clone;
}

function sortedOrders(orders: readonly StrategicOrderRecord[]): StrategicOrderRecord[] {
  const sorted = [...orders]
    .map((order) => structuredClone(order))
    .sort(
      (left, right) =>
        compareStrategicCodePoints(left.formation.kind, right.formation.kind) ||
        compareStrategicCodePoints(left.formation.id, right.formation.id) ||
        compareStrategicCodePoints(left.intent.type, right.intent.type) ||
        compareStrategicCodePoints(left.commandId, right.commandId) ||
        compareStrategicCodePoints(left.id, right.id),
    );
  const unique: StrategicOrderRecord[] = [];
  const seen = new Map<string, string>();
  const seenCommands = new Map<string, string>();
  for (const order of sorted) {
    const identity = order.id;
    const digest = strategicStableHash(order);
    const previous = seen.get(identity);
    if (previous && previous !== digest) throw new Error(`Conflicting locked strategic order ${identity}.`);
    if (previous) continue;
    const commandIdentity = `${order.submittedBy}:${order.commandId}`;
    const existingOrderId = seenCommands.get(commandIdentity);
    if (existingOrderId && existingOrderId !== order.id) {
      throw new Error(`Strategic command ${commandIdentity} identifies more than one order.`);
    }
    seen.set(identity, digest);
    seenCommands.set(commandIdentity, order.id);
    unique.push(order);
  }
  return unique;
}

function sortedCampaignResults(results: readonly StrategicCampaignResult[]): StrategicCampaignResult[] {
  const sorted = [...results]
    .map((result) => structuredClone(result))
    .sort(
      (left, right) =>
        compareStrategicCodePoints(left.effectId, right.effectId) ||
        compareStrategicCodePoints(left.campaignId, right.campaignId) ||
        left.resultVersion - right.resultVersion,
    );
  const unique: StrategicCampaignResult[] = [];
  const seen = new Map<string, string>();
  for (const result of sorted) {
    const digest = strategicStableHash(result);
    const previous = seen.get(result.effectId);
    if (previous && previous !== digest) throw new Error(`Conflicting strategic campaign effect ${result.effectId}.`);
    if (previous) continue;
    seen.set(result.effectId, digest);
    unique.push(result);
  }
  return unique;
}

function formationKey(ref: StrategicFormationRef): string {
  return `${ref.kind}:${ref.id}`;
}

function findFormation(
  state: StrategicRuntimeState,
  ref: StrategicFormationRef,
): StrategicTaskForceState | StrategicBattlegroupState | undefined {
  return ref.kind === "TASK_FORCE"
    ? state.taskForces.find((formation) => formation.id === ref.id)
    : state.battlegroups.find((formation) => formation.id === ref.id);
}

function taskForceCapabilities(
  state: StrategicRuntimeState,
  taskForce: StrategicTaskForceState,
): StrategicCapabilityAggregation {
  const shipIds = new Set(taskForce.shipIds);
  return aggregateStrategicCapabilities([
    ...taskForce.capabilitySources,
    ...state.ships
      .filter((ship) => shipIds.has(ship.id))
      .flatMap((ship) => ship.moduleCapabilitySources),
  ]);
}

function battlegroupCapabilities(battlegroup: StrategicBattlegroupState): StrategicCapabilityAggregation {
  return aggregateStrategicCapabilities(battlegroup.units.flatMap((unit) => unit.capabilitySources));
}

function capabilityValue(
  capabilities: readonly StrategicCapabilitySummary[],
  capability: StrategicCapability,
): number {
  return capabilities.find((entry) => entry.capability === capability)?.value ?? 0;
}

function transportRequirements(
  state: StrategicRuntimeState,
  battlegroupIds: readonly string[],
): StrategicCapabilityAggregation {
  const syntheticSources: StrategicCapabilitySource[] = [];
  const issues: string[] = [];
  for (const battlegroupId of [...battlegroupIds].sort(compareStrategicCodePoints)) {
    const battlegroup = state.battlegroups.find((candidate) => candidate.id === battlegroupId);
    if (!battlegroup) {
      issues.push(`Embarked Battlegroup ${battlegroupId} does not exist.`);
      continue;
    }
    for (const unit of battlegroup.units) {
      syntheticSources.push({
        sourceId: `transport-requirement:${unit.unitId}`,
        sourceKind: "UNIT",
        grants: unit.transportRequirements,
      });
    }
  }
  const aggregated = aggregateStrategicCapabilities(syntheticSources);
  return {
    valid: issues.length === 0 && aggregated.valid,
    issues: [...issues, ...aggregated.issues],
    capabilities: aggregated.capabilities,
  };
}

function validateEmbarkCapacity(
  state: StrategicRuntimeState,
  taskForce: StrategicTaskForceState,
  nextBattlegroupId: string,
): { valid: true } | { valid: false; message: string } {
  const capabilities = taskForceCapabilities(state, taskForce);
  if (!capabilities.valid) return { valid: false, message: capabilities.issues[0] ?? "Task Force capabilities are invalid." };
  const requirements = transportRequirements(state, [
    ...new Set([...taskForce.embarkedBattlegroupIds, nextBattlegroupId]),
  ]);
  if (!requirements.valid) return { valid: false, message: requirements.issues[0] ?? "Transport requirements are invalid." };
  for (const requirement of requirements.capabilities) {
    const available = capabilityValue(capabilities.capabilities, requirement.capability);
    if (available < requirement.value) {
      return {
        valid: false,
        message: `${requirement.capability} capacity exceeded (${requirement.value}/${available}).`,
      };
    }
  }
  return { valid: true };
}

function routeFailureToOrderCode(code: StrategicRouteFailureCode): StrategicOrderRejectionCode {
  switch (code) {
    case "INVALID_DESTINATION":
    case "INVALID_START":
    case "INVALID_ROUTE":
      return "INVALID_DESTINATION";
    case "ROUTE_BLOCKED":
      return "ROUTE_BLOCKED";
    case "ROUTE_TIMING_UNRESOLVED":
      return "ROUTE_TIMING_UNRESOLVED";
    case "MOVEMENT_PROFILE_FORBIDDEN":
      return "MOVEMENT_PROFILE_FORBIDDEN";
    case "ROUTE_NOT_FOUND":
      return "ROUTE_NOT_FOUND";
  }
}

function requiredDeploymentCapability(
  method: Extract<StrategicOrderRecord["intent"], { type: "DEPLOY_TO_CAMPAIGN" }>["deploymentMethod"],
): StrategicCapability | undefined {
  switch (method) {
    case "STANDARD_LANDING":
      return undefined;
    case "VTOL_DEPLOYMENT":
    case "AEROSPACE_TRANSPORT":
      return "AIR_MOBILE";
    case "ORBITAL_DROP":
      return "ORBITAL_DROP";
    case "SHIP_SURFACE_LANDING":
      return "SURFACE_LANDING";
  }
}

function orderPhase(order: StrategicOrderRecord): ResolutionPhase {
  switch (order.intent.type) {
    case "EMBARK_BATTLEGROUP":
    case "DISEMBARK_BATTLEGROUP":
      return "FORMATION";
    case "RESUPPLY_TASK_FORCE":
    case "TRANSFER_SUPPLY":
      return "SUPPLY";
    case "MOVE_TASK_FORCE":
    case "MOVE_BATTLEGROUP":
      return "MOVEMENT";
    case "DEPLOY_TO_CAMPAIGN":
    case "WITHDRAW_FROM_CAMPAIGN":
    case "SUPPORT_CAMPAIGN":
    case "ORBITAL_COMBAT":
      return "OPERATIONS";
  }
}

/**
 * Pure, deterministic strategic tick. Callers persist the returned state and
 * idempotent effects; this function performs no I/O and reads no wall clock.
 */
export function resolveStrategicRound(input: StrategicResolutionInput): StrategicResolutionOutput {
  if (input.rulesetVersion !== input.previousState.rulesetVersion) {
    throw new Error("Strategic ruleset does not match the map-bound ruleset.");
  }
  if (!Number.isFinite(input.resolutionTime)) throw new Error("Strategic resolution time must be explicit and finite.");

  const requestedRound =
    input.lockedOrders.length > 0 &&
    input.lockedOrders.every((order) => order.strategicRound === input.lockedOrders[0].strategicRound)
      ? input.lockedOrders[0].strategicRound
      : input.previousState.round;
  const orders = sortedOrders(input.lockedOrders);
  const campaignResults = sortedCampaignResults(input.campaignResults);
  const retryInputHash = strategicStableHash({
    mapId: input.previousState.mapId,
    round: requestedRound,
    rulesetVersion: input.rulesetVersion,
    lockedOrders: orders,
    campaignResults,
    resolutionTime: input.resolutionTime,
  });
  const priorKey = `${input.previousState.mapId}:${requestedRound}`;
  const priorResolution = input.previousState.resolutions[priorKey];
  if (priorResolution) {
    if (priorResolution.retryInputHash !== retryInputHash) {
      throw new Error("Strategic resolution retry input does not match the committed resolution.");
    }
    return {
      state: sortedStateClone(input.previousState),
      events: [],
      effects: [],
      inputHash: priorResolution.inputHash,
      resultHash: priorResolution.resultHash,
    };
  }
  if (input.previousState.phase !== "LOCKED" && input.previousState.phase !== "RESOLVING") {
    throw new Error("Strategic resolution requires a locked strategic round.");
  }

  const original = sortedStateClone(input.previousState);
  const inputHash = strategicStableHash({
    previousState: original,
    rulesetVersion: input.rulesetVersion,
    lockedOrders: orders,
    campaignResults,
    resolutionTime: input.resolutionTime,
  });
  const state = sortedStateClone(original);
  state.phase = "RESOLVING";
  state.engineVersion = STRATEGIC_ENGINE_VERSION;
  const resolvingRound = state.round;
  const events: StrategicEvent[] = [];
  const effects: StrategicPersistentEffect[] = [];
  let sequence = Math.max(
    0,
    ...state.events.filter((event) => event.round === resolvingRound).map((event) => event.sequence),
  );

  const emit = (
    type: StrategicEvent["type"],
    actorId: string | undefined,
    payload: StrategicEvent["payload"],
    visibility: StrategicEvent["visibility"] = "BATTALION",
  ): StrategicEvent => {
    sequence += 1;
    const created = {
      eventId: `${state.mapId}:${resolvingRound}:${String(sequence).padStart(4, "0")}:${type}`,
      mapId: state.mapId,
      round: resolvingRound,
      sequence,
      type,
      actorId,
      payload,
      timestamp: input.resolutionTime,
      visibility,
    } as StrategicEvent;
    events.push(created);
    return created;
  };

  const addEffect = (
    event: StrategicEvent,
    type: StrategicPersistentEffect["type"],
    payload: StrategicPersistentEffect["payload"],
    suffix = "0",
  ): void => {
    effects.push({
      idempotencyKey: `${event.eventId}:effect:${type}:${suffix}`,
      type,
      payload,
    } as StrategicPersistentEffect);
  };

  const stateOrders = new Map<string, StrategicOrderRecord>();
  for (const locked of orders) {
    const stored = state.orders.find((candidate) => candidate.id === locked.id);
    if (stored) {
      Object.assign(stored, structuredClone(locked));
      stateOrders.set(locked.id, stored);
    } else {
      const created = structuredClone(locked);
      state.orders.push(created);
      stateOrders.set(created.id, created);
    }
  }

  const reject = (
    order: StrategicOrderRecord,
    code: StrategicOrderRejectionCode,
    message: string,
  ): void => {
    const stored = stateOrders.get(order.id)!;
    stored.lifecycle = "FAILED";
    emit(
      "STRATEGIC_ORDER_REJECTED",
      order.formation.id,
      { orderId: order.id, commandId: order.commandId, code, message },
      "BATTALION",
    );
  };

  const accept = (order: StrategicOrderRecord): void => {
    const stored = stateOrders.get(order.id)!;
    stored.lifecycle = "RESOLVED";
    emit(
      "STRATEGIC_ORDER_ACCEPTED",
      order.formation.id,
      { orderId: order.id, commandId: order.commandId },
      "BATTALION",
    );
  };

  const initialFormationVersions = new Map<string, number>();
  for (const taskForce of original.taskForces) {
    initialFormationVersions.set(formationKey({ kind: "TASK_FORCE", id: taskForce.id }), taskForce.version);
  }
  for (const battlegroup of original.battlegroups) {
    initialFormationVersions.set(formationKey({ kind: "BATTLEGROUP", id: battlegroup.id }), battlegroup.version);
  }

  const candidates: StrategicOrderRecord[] = [];
  const orderedFormations = new Set<string>();
  for (const order of orders) {
    if (order.lifecycle !== "LOCKED") {
      reject(order, "UNSUPPORTED_INTENT", "Only locked strategic orders can resolve.");
      continue;
    }
    if (order.mapId !== state.mapId || order.strategicRound !== resolvingRound) {
      reject(order, "WRONG_MAP", "The strategic order targets another map or round.");
      continue;
    }
    if (order.expectedMapVersion !== original.version) {
      reject(order, "STALE_MAP_VERSION", "The strategic map version is stale.");
      continue;
    }
    const key = formationKey(order.formation);
    const formation = findFormation(state, order.formation);
    if (!formation) {
      reject(order, "FORMATION_NOT_FOUND", "The ordered formation does not exist.");
      continue;
    }
    if (initialFormationVersions.get(key) !== order.expectedFormationVersion) {
      reject(order, "STALE_FORMATION_VERSION", "The formation version is stale.");
      continue;
    }
    if (orderedFormations.has(key)) {
      reject(order, "DUPLICATE_FORMATION_ORDER", "A formation can receive only one locked strategic order per round.");
      continue;
    }
    orderedFormations.add(key);
    candidates.push(order);
  }

  const touchFormation = (formation: StrategicTaskForceState | StrategicBattlegroupState, event: StrategicEvent): void => {
    formation.version += 1;
    addEffect(
      event,
      "FORMATION_STATE",
      { formation: { kind: formation.kind, id: formation.id }, version: formation.version },
      formation.id,
    );
  };

  const byPhase = new Map<ResolutionPhase, StrategicOrderRecord[]>();
  for (const order of candidates) {
    const phase = orderPhase(order);
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), order]);
  }

  for (const order of byPhase.get("FORMATION") ?? []) {
    const intent = order.intent;
    if (intent.type === "EMBARK_BATTLEGROUP") {
      if (order.formation.kind !== "BATTLEGROUP" || order.formation.id !== intent.battlegroupId) {
        reject(order, "FORMATION_KIND_MISMATCH", "Embark orders must target their Battlegroup.");
        continue;
      }
      const battlegroup = state.battlegroups.find((candidate) => candidate.id === intent.battlegroupId)!;
      const taskForce = state.taskForces.find((candidate) => candidate.id === intent.carrierTaskForceId);
      if (!taskForce) {
        reject(order, "FORMATION_NOT_FOUND", "The carrier Task Force does not exist.");
        continue;
      }
      if (taskForce.battalionId !== battlegroup.battalionId) {
        reject(order, "FORMATION_NOT_FOUND", "The carrier Task Force is not in the ordered Battalion.");
        continue;
      }
      const composition = validateBattlegroupComposition(battlegroup.units);
      if (!composition.valid) {
        reject(order, "BATTLEGROUP_INVALID_COMPOSITION", composition.reasons.join(", "));
        continue;
      }
      if (
        battlegroup.currentCarrierTaskForceId !== null ||
        battlegroup.transit !== null ||
        taskForce.transit !== null ||
        battlegroup.currentNodeId === null ||
        battlegroup.currentNodeId !== taskForce.currentNodeId
      ) {
        reject(order, "NOT_COLOCATED", "Battlegroup and carrier must be stationary at the same strategic node.");
        continue;
      }
      const capacity = validateEmbarkCapacity(state, taskForce, battlegroup.id);
      if (!capacity.valid) {
        reject(order, "INSUFFICIENT_CAPACITY", capacity.message);
        continue;
      }
      battlegroup.currentCarrierTaskForceId = taskForce.id;
      battlegroup.currentNodeId = null;
      battlegroup.status = "EMBARKED";
      taskForce.embarkedBattlegroupIds = [...new Set([...taskForce.embarkedBattlegroupIds, battlegroup.id])].sort();
      accept(order);
      const embarked = emit(
        "BATTLEGROUP_EMBARKED",
        battlegroup.id,
        { battlegroupId: battlegroup.id, taskForceId: taskForce.id, nodeId: taskForce.currentNodeId! },
      );
      touchFormation(battlegroup, embarked);
      touchFormation(taskForce, embarked);
      continue;
    }

    if (intent.type !== "DISEMBARK_BATTLEGROUP") {
      reject(order, "UNSUPPORTED_INTENT", "Formation phase received an unsupported strategic intent.");
      continue;
    }
    if (order.formation.kind !== "BATTLEGROUP" || order.formation.id !== intent.battlegroupId) {
      reject(order, "FORMATION_KIND_MISMATCH", "Disembark orders must target their Battlegroup.");
      continue;
    }
    const battlegroup = state.battlegroups.find((candidate) => candidate.id === intent.battlegroupId)!;
    const taskForce = state.taskForces.find((candidate) => candidate.id === intent.carrierTaskForceId);
    if (!taskForce || taskForce.battalionId !== battlegroup.battalionId) {
      reject(order, "FORMATION_NOT_FOUND", "The carrier Task Force is not in the ordered Battalion.");
      continue;
    }
    if (
      battlegroup.currentCarrierTaskForceId !== taskForce.id ||
      taskForce.transit !== null ||
      taskForce.currentNodeId === null
    ) {
      reject(order, "NOT_COLOCATED", "The Battlegroup is not aboard a stationary carrier.");
      continue;
    }
    battlegroup.currentCarrierTaskForceId = null;
    battlegroup.currentNodeId = taskForce.currentNodeId;
    battlegroup.status = "READY";
    taskForce.embarkedBattlegroupIds = taskForce.embarkedBattlegroupIds.filter((id) => id !== battlegroup.id);
    accept(order);
    const disembarked = emit(
      "BATTLEGROUP_DISEMBARKED",
      battlegroup.id,
      { battlegroupId: battlegroup.id, taskForceId: taskForce.id, nodeId: taskForce.currentNodeId },
    );
    touchFormation(battlegroup, disembarked);
    touchFormation(taskForce, disembarked);
  }

  for (const order of byPhase.get("SUPPLY") ?? []) {
    const intent = order.intent;
    if (intent.type === "RESUPPLY_TASK_FORCE") {
      if (order.formation.kind !== "TASK_FORCE" || order.formation.id !== intent.taskForceId) {
        reject(order, "FORMATION_KIND_MISMATCH", "Resupply orders must target their Task Force.");
        continue;
      }
      const taskForce = state.taskForces.find((candidate) => candidate.id === intent.taskForceId)!;
      const applied = applyLargeSupply({ currentRound: resolvingRound, supply: taskForce.supply });
      if (!applied.applied) {
        reject(
          order,
          applied.code === "INSUFFICIENT_SUPPLY" ? "INSUFFICIENT_SUPPLY" : "SUPPLY_SOURCE_OFFLINE",
          applied.message,
        );
        continue;
      }
      taskForce.supply = applied.supply;
      accept(order);
      const consumed = emit(
        "LARGE_SUPPLY_CONSUMED",
        taskForce.id,
        {
          taskForceId: taskForce.id,
          amount: 1,
          remaining: balanceFor(taskForce.supply, "LARGE")!.quantity,
        },
      );
      addEffect(consumed, "SUPPLY_STATE", { location: taskForce.supply.location }, taskForce.id);
      const supplied = emit(
        "TASK_FORCE_SUPPLIED",
        taskForce.id,
        { taskForceId: taskForce.id, suppliedThroughRound: applied.suppliedThroughRound },
      );
      touchFormation(taskForce, supplied);
      continue;
    }

    if (intent.type !== "TRANSFER_SUPPLY") {
      reject(order, "UNSUPPORTED_INTENT", "Supply phase received an unsupported strategic intent.");
      continue;
    }
    if (order.formation.kind !== "TASK_FORCE" || order.formation.id !== intent.source.id) {
      reject(order, "FORMATION_KIND_MISMATCH", "Supply transfer authority must target the source Task Force.");
      continue;
    }
    if (
      intent.source.kind !== "TASK_FORCE" ||
      intent.destination.kind !== "TASK_FORCE" ||
      intent.source.id === intent.destination.id
    ) {
      reject(order, "UNSUPPORTED_INTENT", "This checkpoint supports explicit Task Force-to-Task Force transfers only.");
      continue;
    }
    if (!Number.isInteger(intent.amount) || intent.amount <= 0) {
      reject(order, "INSUFFICIENT_SUPPLY", "Supply transfer amount must be a positive integer.");
      continue;
    }
    const source = state.taskForces.find((candidate) => candidate.id === intent.source.id)!;
    const destination = state.taskForces.find((candidate) => candidate.id === intent.destination.id);
    if (!destination || source.battalionId !== destination.battalionId) {
      reject(order, "FORMATION_NOT_FOUND", "The destination Task Force is not in the ordered Battalion.");
      continue;
    }
    if (
      source.transit !== null ||
      destination.transit !== null ||
      source.currentNodeId === null ||
      source.currentNodeId !== destination.currentNodeId
    ) {
      reject(order, "NOT_COLOCATED", "Supply transfers require stationary, co-located Task Forces.");
      continue;
    }
    const sourceBalance = balanceFor(source.supply, intent.supplySize);
    const destinationBalance = balanceFor(destination.supply, intent.supplySize);
    if (
      !sourceBalance ||
      !destinationBalance ||
      !Number.isInteger(sourceBalance.quantity) ||
      !Number.isInteger(destinationBalance.quantity) ||
      sourceBalance.quantity < intent.amount ||
      (destinationBalance.capacity !== null &&
        destinationBalance.capacity !== undefined &&
        destinationBalance.quantity + intent.amount > destinationBalance.capacity)
    ) {
      reject(order, "INSUFFICIENT_SUPPLY", "Supply balance or destination capacity cannot satisfy the transfer.");
      continue;
    }
    sourceBalance.quantity -= intent.amount;
    destinationBalance.quantity += intent.amount;
    accept(order);
    const transferred = emit(
      "SUPPLY_TRANSFERRED",
      source.id,
      {
        size: intent.supplySize,
        amount: intent.amount,
        source: intent.source,
        destination: intent.destination,
      },
    );
    addEffect(transferred, "SUPPLY_STATE", { location: source.supply.location }, source.id);
    addEffect(transferred, "SUPPLY_STATE", { location: destination.supply.location }, destination.id);
    touchFormation(source, transferred);
    touchFormation(destination, transferred);
  }

  for (const order of byPhase.get("MOVEMENT") ?? []) {
    const formation = findFormation(state, order.formation)!;
    const expectedIntent = order.formation.kind === "TASK_FORCE" ? "MOVE_TASK_FORCE" : "MOVE_BATTLEGROUP";
    if (order.intent.type !== expectedIntent) {
      reject(order, "FORMATION_KIND_MISMATCH", `${order.intent.type} cannot target a ${order.formation.kind}.`);
      continue;
    }
    if (formation.transit !== null) {
      reject(order, "FORMATION_ALREADY_IN_TRANSIT", "The formation is already in transit.");
      continue;
    }
    if (formation.kind === "BATTLEGROUP") {
      if (formation.currentCarrierTaskForceId !== null) {
        reject(order, "BATTLEGROUP_EMBARKED", "An embarked Battlegroup moves with its carrier Task Force.");
        continue;
      }
      const profileValidation = validateBattlegroupMovementProfile(formation.units, formation.movementProfile);
      if (!profileValidation.valid) {
        reject(
          order,
          profileValidation.compositionValid ? "MOVEMENT_PROFILE_FORBIDDEN" : "BATTLEGROUP_INVALID_COMPOSITION",
          profileValidation.reasons.join(", "),
        );
        continue;
      }
      formation.movementPointsPerRound = profileValidation.movementPointsPerRound;
    }
    if (!order.destinationNodeId || order.destinationNodeId === formation.currentNodeId || formation.currentNodeId === null) {
      reject(order, "INVALID_DESTINATION", "Movement requires a different valid destination and an authoritative start node.");
      continue;
    }
    const route = findStrategicRoute({
      nodes: state.nodes,
      routes: state.routes,
      movementProfile: formation.movementProfile,
      startNodeId: formation.currentNodeId,
      destinationNodeId: order.destinationNodeId,
    });
    if (!route.valid) {
      reject(order, routeFailureToOrderCode(route.code), route.message);
      continue;
    }
    const timing = calculateStrategicTravelTiming({
      totalTravelCost: route.totalTravelCost,
      movementPointsPerRound: formation.movementPointsPerRound,
      startingRound: resolvingRound,
    });
    if (!timing.valid) {
      reject(order, "ROUTE_TIMING_UNRESOLVED", timing.message);
      continue;
    }
    formation.transit = {
      routeNodeIds: route.routeNodeIds,
      routeIds: route.routeIds,
      totalTravelCost: route.totalTravelCost,
      progress: 0,
      startedRound: resolvingRound,
      etaRound: timing.etaRound,
    };
    formation.status = "IN_TRANSIT";
    accept(order);
    const started = emit(
      "FORMATION_MOVEMENT_STARTED",
      formation.id,
      {
        formation: { kind: formation.kind, id: formation.id },
        routeNodeIds: route.routeNodeIds,
        routeIds: route.routeIds,
        etaRound: timing.etaRound,
      },
    );
    touchFormation(formation, started);
  }

  const movingFormations: Array<StrategicTaskForceState | StrategicBattlegroupState> = [
    ...state.taskForces,
    ...state.battlegroups,
  ]
    .filter((formation) => formation.transit !== null)
    .sort(
      (left, right) =>
        compareStrategicCodePoints(left.kind, right.kind) ||
        compareStrategicCodePoints(left.id, right.id),
    );
  for (const formation of movingFormations) {
    const transit = formation.transit!;
    if (
      formation.movementPointsPerRound === null ||
      !Number.isFinite(formation.movementPointsPerRound) ||
      formation.movementPointsPerRound <= 0
    ) {
      continue;
    }
    transit.progress = Math.min(
      transit.totalTravelCost,
      transit.progress + formation.movementPointsPerRound,
    );
    const progressed = emit(
      "FORMATION_TRAVEL_PROGRESS",
      formation.id,
      {
        formation: { kind: formation.kind, id: formation.id },
        progress: transit.progress,
        totalTravelCost: transit.totalTravelCost,
      },
    );
    touchFormation(formation, progressed);
    if (transit.progress < transit.totalTravelCost) continue;
    const destinationNodeId = transit.routeNodeIds.at(-1)!;
    formation.currentNodeId = destinationNodeId;
    formation.transit = null;
    formation.status = "READY";
    if (formation.kind === "TASK_FORCE") {
      for (const shipId of formation.shipIds) {
        const ship = state.ships.find((candidate) => candidate.id === shipId);
        if (ship) {
          ship.currentNodeId = destinationNodeId;
          ship.version += 1;
        }
      }
    }
    const arrived = emit(
      "FORMATION_ARRIVED",
      formation.id,
      { formation: { kind: formation.kind, id: formation.id }, nodeId: destinationNodeId },
    );
    touchFormation(formation, arrived);
  }

  for (const order of byPhase.get("OPERATIONS") ?? []) {
    const intent = order.intent;
    if (intent.type === "ORBITAL_COMBAT") {
      emit(
        "ORBITAL_COMBAT_DEFERRED",
        order.formation.id,
        { orderId: order.id, opposingFormationId: intent.opposingFormationId },
        "BATTALION",
      );
      reject(order, "ORBITAL_COMBAT_DEFERRED", "Orbital combat is explicitly deferred in Phase 3.");
      continue;
    }
    if (intent.type === "WITHDRAW_FROM_CAMPAIGN") {
      reject(
        order,
        "TACTICAL_WITHDRAWAL_REQUIRED",
        "Withdrawal requires an acknowledged tactical extraction result and cannot resolve strategically yet.",
      );
      continue;
    }
    if (intent.type === "SUPPORT_CAMPAIGN") {
      const operation = state.operations.find((candidate) => candidate.id === intent.operationId);
      const formation = findFormation(state, order.formation)!;
      if (!operation) {
        reject(order, "OPERATION_NOT_FOUND", "The supported operation does not exist.");
        continue;
      }
      if (operation.status !== "MUSTERING" && operation.status !== "ACTIVE") {
        reject(order, "OPERATION_UNAVAILABLE", "The operation cannot receive support in its current state.");
        continue;
      }
      const aggregation =
        formation.kind === "TASK_FORCE"
          ? taskForceCapabilities(state, formation)
          : battlegroupCapabilities(formation);
      if (!aggregation.valid || capabilityValue(aggregation.capabilities, intent.capability) <= 0) {
        reject(order, "DEPLOYMENT_CAPABILITY_MISSING", "The formation does not provide the requested capability.");
        continue;
      }
      accept(order);
      emit(
        "OPERATION_SUPPORT_ASSIGNED",
        formation.id,
        { operationId: operation.id, formation: order.formation, capability: intent.capability },
      );
      continue;
    }
    if (intent.type !== "DEPLOY_TO_CAMPAIGN") {
      reject(order, "UNSUPPORTED_INTENT", "Operations phase received an unsupported strategic intent.");
      continue;
    }
    if (order.formation.kind !== "BATTLEGROUP" || order.formation.id !== intent.battlegroupId) {
      reject(order, "FORMATION_KIND_MISMATCH", "Campaign deployment orders must target their Battlegroup.");
      continue;
    }
    const battlegroup = state.battlegroups.find((candidate) => candidate.id === intent.battlegroupId)!;
    const operation = state.operations.find((candidate) => candidate.id === intent.operationId);
    if (!operation) {
      reject(order, "OPERATION_NOT_FOUND", "The deployment operation does not exist.");
      continue;
    }
    if (
      operation.status !== "MUSTERING" &&
      !(operation.status === "ACTIVE" && operation.reinforcementStatus === "OPEN")
    ) {
      reject(order, "OPERATION_UNAVAILABLE", "The operation is not accepting this deployment.");
      continue;
    }
    const carrier = battlegroup.currentCarrierTaskForceId
      ? state.taskForces.find((candidate) => candidate.id === battlegroup.currentCarrierTaskForceId)
      : undefined;
    const sourceNodeId = carrier?.currentNodeId ?? battlegroup.currentNodeId;
    if (sourceNodeId === null || sourceNodeId === undefined || sourceNodeId !== operation.strategicNodeId) {
      reject(order, "NOT_COLOCATED", "Deployment cannot teleport; the Battlegroup or carrier must be at the operation node.");
      continue;
    }
    const composition = validateBattlegroupComposition(battlegroup.units);
    if (!composition.valid) {
      reject(order, "BATTLEGROUP_INVALID_COMPOSITION", composition.reasons.join(", "));
      continue;
    }
    const required = requiredDeploymentCapability(intent.deploymentMethod);
    if (required) {
      const sources = [
        ...battlegroup.units.flatMap((unit) => unit.capabilitySources),
        ...(carrier ? taskForceCapabilities(state, carrier).capabilities.map((capability) => ({
          sourceId: `carrier:${carrier.id}:${capability.capability}`,
          sourceKind: "ATTACHED_SUPPORT" as const,
          grants: [{ capability: capability.capability, value: capability.value }],
        })) : []),
      ];
      const deploymentCapabilities = aggregateStrategicCapabilities(sources);
      if (!deploymentCapabilities.valid || capabilityValue(deploymentCapabilities.capabilities, required) <= 0) {
        reject(order, "DEPLOYMENT_CAPABILITY_MISSING", `${required} is required for this deployment method.`);
        continue;
      }
    }
    if (carrier) {
      carrier.embarkedBattlegroupIds = carrier.embarkedBattlegroupIds.filter((id) => id !== battlegroup.id);
      carrier.version += 1;
    }
    battlegroup.currentCarrierTaskForceId = null;
    battlegroup.currentNodeId = operation.strategicNodeId;
    battlegroup.currentOperationId = operation.id;
    battlegroup.status = "DEPLOYING";
    operation.deployedBattlegroupIds = [...new Set([...operation.deployedBattlegroupIds, battlegroup.id])].sort();
    if (operation.status === "MUSTERING") operation.status = "ACTIVE";
    operation.version += 1;
    accept(order);
    const deployed = emit(
      "OPERATION_DEPLOYMENT_STARTED",
      battlegroup.id,
      {
        operationId: operation.id,
        battlegroupId: battlegroup.id,
        deploymentMethod: intent.deploymentMethod,
      },
    );
    touchFormation(battlegroup, deployed);
    addEffect(deployed, "OPERATION_STATE", { operationId: operation.id, version: operation.version }, operation.id);
  }

  for (const result of campaignResults) {
    if (state.appliedCampaignResultIds.includes(result.effectId)) continue;
    const operation = state.operations.find((candidate) => candidate.id === result.operationId);
    if (!operation || operation.campaignId !== result.campaignId) continue;
    operation.status = result.outcome === "DEFEAT" ? "FAILED" : "RESOLVED";
    operation.version += 1;
    operation.controlEffectsApplied = true;
    state.appliedCampaignResultIds.push(result.effectId);
    const outcome = emit(
      "CAMPAIGN_OUTCOME_APPLIED",
      result.campaignId,
      {
        effectId: result.effectId,
        campaignId: result.campaignId,
        operationId: result.operationId,
        outcome: result.outcome,
      },
      "PUBLIC",
    );
    addEffect(outcome, "OPERATION_STATE", { operationId: operation.id, version: operation.version }, operation.id);
    if (result.nodeControl) {
      const node = state.nodes.find((candidate) => candidate.id === result.nodeControl!.nodeId);
      if (node) {
        node.control = result.nodeControl.control;
        const changed = emit(
          "STRATEGIC_NODE_CONTROL_CHANGED",
          result.campaignId,
          { nodeId: node.id, control: node.control },
          "PUBLIC",
        );
        addEffect(changed, "NODE_CONTROL", { nodeId: node.id, control: node.control }, node.id);
      }
    }
    for (const change of [...result.routeChanges].sort((left, right) =>
      compareStrategicCodePoints(left.routeId, right.routeId))) {
      const route = state.routes.find((candidate) => candidate.id === change.routeId);
      if (!route) continue;
      route.status = change.status;
      const changed = emit(
        "STRATEGIC_ROUTE_STATUS_CHANGED",
        result.campaignId,
        { routeId: route.id, status: route.status },
        "PUBLIC",
      );
      addEffect(changed, "ROUTE_STATUS", { routeId: route.id, status: route.status }, route.id);
    }
    for (const delta of [...result.warVariableDeltas].sort((left, right) =>
      compareStrategicCodePoints(left.variableId, right.variableId))) {
      addEffect(
        outcome,
        "WAR_VARIABLE_DELTA",
        { variableId: delta.variableId, delta: delta.delta, sourceEffectId: result.effectId },
        delta.variableId,
      );
    }
  }

  state.appliedCampaignResultIds.sort(compareStrategicCodePoints);
  for (const order of state.orders) {
    if (order.strategicRound === resolvingRound && order.lifecycle === "RESOLVING") order.lifecycle = "FAILED";
  }
  effects.sort((left, right) => compareStrategicCodePoints(left.idempotencyKey, right.idempotencyKey));
  const nextRound = resolvingRound + 1;
  const resultHash = strategicStableHash({
    mapId: state.mapId,
    resolvingRound,
    nextRound,
    version: state.version + 1,
    nodes: state.nodes,
    routes: state.routes,
    ships: state.ships,
    taskForces: state.taskForces,
    battlegroups: state.battlegroups,
    operations: state.operations,
    orders: state.orders,
    appliedCampaignResultIds: state.appliedCampaignResultIds,
    events,
    effects,
  });
  emit(
    "STRATEGIC_ROUND_RESOLVED",
    undefined,
    { inputHash, resultHash, nextRound },
    "PUBLIC",
  );
  state.phase = "PLANNING";
  state.round = nextRound;
  state.version += 1;
  state.events.push(...events);
  const key = `${state.mapId}:${resolvingRound}`;
  state.resolutions[key] = {
    key,
    mapId: state.mapId,
    round: resolvingRound,
    retryInputHash,
    inputHash,
    resultHash,
    eventIds: events.map((event) => event.eventId),
  };
  state.orders.sort((left, right) =>
    compareStrategicCodePoints(left.id, right.id) || left.revision - right.revision);
  state.events.sort(
    (left, right) =>
      left.round - right.round ||
      left.sequence - right.sequence ||
      compareStrategicCodePoints(left.eventId, right.eventId),
  );
  return { state, events, effects, inputHash, resultHash };
}

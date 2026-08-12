import type {
  AxialCoord,
  BattlefieldHex,
  DeploymentStatus,
  FactionSide,
} from "../../domain/src";
import { hasLineOfSight, hexDistance, sameCoord } from "./hex";

const INFANTRY_STEALTH_DIE_SIDES = 6;

export interface InfantryStealthUnit {
  id: string;
  side: FactionSide;
  status: DeploymentStatus;
  position: AxialCoord;
}

export interface InfantryStealthObserver {
  id: string;
  side: FactionSide;
  status: DeploymentStatus;
  position: AxialCoord;
  sensorRange: number;
}

export interface InfantryStealthOrderInput {
  unit: InfantryStealthUnit;
  route: readonly AxialCoord[];
  observers: readonly InfantryStealthObserver[];
  map: BattlefieldHex[];
  roll?: number;
  revealCause?: "ATTACK" | "INTERACTION";
}

export interface InfantryStealthOrderResult {
  legal: boolean;
  reason?: string;
  detected: boolean;
  stealthBroken: boolean;
  observerIds: string[];
  threshold?: number;
  roll?: number;
}

function isActive(status: DeploymentStatus): boolean {
  return status !== "DESTROYED" && status !== "WITHDRAWN";
}

function hostile(left: FactionSide, right: FactionSide): boolean {
  return left !== "NEUTRAL" && right !== "NEUTRAL" && left !== right;
}

function routeIsGoverned(
  unit: InfantryStealthUnit,
  route: readonly AxialCoord[],
  map: BattlefieldHex[],
): boolean {
  if (route.length < 2 || !sameCoord(route[0]!, unit.position)) return false;
  if (route.some((coord) => !map.some((hex) => sameCoord(hex.coord, coord)))) return false;
  return route.slice(1).every((coord, index) => hexDistance(route[index]!, coord) === 1);
}

/**
 * Resolves the source-defined Infantry Stealth order without projecting hidden
 * contacts. The starting hex is excluded: V5 counts enemy units whose line of
 * sight the unit enters or moves through during this order.
 */
export function resolveInfantryStealthOrder(
  input: InfantryStealthOrderInput,
): InfantryStealthOrderResult {
  if (!isActive(input.unit.status)) {
    return {
      legal: false,
      reason: "Inactive unit cannot use Infantry Stealth.",
      detected: true,
      stealthBroken: true,
      observerIds: [],
    };
  }
  if (!routeIsGoverned(input.unit, input.route, input.map)) {
    return {
      legal: false,
      reason: "Infantry Stealth requires a contiguous movement route from the authoritative starting hex.",
      detected: true,
      stealthBroken: true,
      observerIds: [],
    };
  }

  const observers = input.observers
    .filter((observer) =>
      isActive(observer.status) &&
      hostile(input.unit.side, observer.side) &&
      Number.isFinite(observer.sensorRange) &&
      observer.sensorRange >= 0 &&
      input.map.some((hex) => sameCoord(hex.coord, observer.position))
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (input.revealCause) {
    const endpoint = input.route.at(-1)!;
    const observerIds = observers
      .filter((observer) => hasLineOfSight(observer.position, endpoint, input.map, observer.sensorRange))
      .map((observer) => observer.id);
    return {
      legal: true,
      detected: observerIds.length > 0,
      stealthBroken: true,
      observerIds,
    };
  }

  const enteredHexes = input.route.slice(1);
  const observerIds = observers
    .filter((observer) => enteredHexes.some((coord) =>
      hasLineOfSight(observer.position, coord, input.map, observer.sensorRange)
    ))
    .map((observer) => observer.id);
  const threshold = observerIds.length;
  if (threshold === 0) {
    return { legal: true, detected: false, stealthBroken: false, observerIds, threshold };
  }
  if (!Number.isInteger(input.roll) || input.roll! < 1 || input.roll! > INFANTRY_STEALTH_DIE_SIDES) {
    return {
      legal: false,
      reason: `Infantry Stealth requires a D${INFANTRY_STEALTH_DIE_SIDES} roll.`,
      detected: true,
      stealthBroken: true,
      observerIds,
      threshold,
    };
  }
  const detected = input.roll! < threshold;
  return {
    legal: true,
    detected,
    stealthBroken: detected,
    observerIds,
    threshold,
    roll: input.roll,
  };
}

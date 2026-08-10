import type {
  AirDropProfile,
  ArtilleryDeploymentState,
  ArtilleryProfile,
  AxialCoord,
  BattlefieldHex,
  BomberProfile,
  CargoManifestItem,
  DeploymentStatus,
  Facing,
  FactionSide,
  FighterProfile,
  SpotterProfile,
  StealthProfile,
  TargetDomain,
  WeaponProfile,
} from "../../domain/src";
import { hasAllTags, hasAnyTag } from "./forces";
import {
  facingBetween,
  hasLineOfSight,
  hexDistance,
  hexLine,
  sameCoord,
} from "./hex";

export interface ArtilleryTransitionResult {
  legal: boolean;
  reason?: string;
  state: ArtilleryDeploymentState;
  speedCostQuarters: number;
}

export function transitionArtilleryDeployment(
  profile: ArtilleryProfile,
  current: ArtilleryDeploymentState,
  action: "DEPLOY" | "PACK_UP",
  availableSpeedQuarters: number,
): ArtilleryTransitionResult {
  const desired: ArtilleryDeploymentState = action === "DEPLOY" ? "DEPLOYED" : "PACKED";
  const cost = action === "DEPLOY" ? profile.deploySpeedCostQuarters : profile.packSpeedCostQuarters;
  if (current === desired) {
    return { legal: false, reason: `Artillery is already ${desired.toLowerCase()}.`, state: current, speedCostQuarters: 0 };
  }
  if (!Number.isInteger(cost) || cost < 0) {
    return { legal: false, reason: "Artillery transition cost must use non-negative Speed quarters.", state: current, speedCostQuarters: 0 };
  }
  if (!Number.isInteger(availableSpeedQuarters) || availableSpeedQuarters < cost) {
    return { legal: false, reason: "Insufficient Speed for artillery transition.", state: current, speedCostQuarters: 0 };
  }
  return { legal: true, state: desired, speedCostQuarters: cost };
}

export interface SpotterCandidate {
  id: string;
  side: FactionSide;
  status: DeploymentStatus;
  position: AxialCoord;
  sensorRange: number;
  tags: string[];
  profile: SpotterProfile;
}

export interface ArtilleryTarget {
  id: string;
  side: FactionSide;
  status: DeploymentStatus;
  position: AxialCoord;
  domain: TargetDomain;
}

export function isEligibleSpotter(
  candidate: SpotterCandidate,
  firingUnitId: string,
  firingSide: FactionSide,
  target: ArtilleryTarget,
  map: BattlefieldHex[],
): boolean {
  return (
    candidate.side === firingSide &&
    candidate.status !== "DESTROYED" &&
    candidate.status !== "WITHDRAWN" &&
    (candidate.profile.allowsFiringUnit || candidate.id !== firingUnitId) &&
    candidate.profile.canSpotDomains.includes(target.domain) &&
    hasAllTags(candidate.tags, candidate.profile.requiredTags) &&
    !hasAnyTag(candidate.tags, candidate.profile.prohibitedTags) &&
    Number.isFinite(candidate.sensorRange) &&
    candidate.sensorRange >= 0 &&
    map.some((hex) => sameCoord(hex.coord, candidate.position)) &&
    map.some((hex) => sameCoord(hex.coord, target.position)) &&
    hasLineOfSight(candidate.position, target.position, map, candidate.sensorRange)
  );
}

export interface ArtilleryFireInput {
  profile: ArtilleryProfile;
  deploymentState: ArtilleryDeploymentState;
  firingUnitId: string;
  firingSide: FactionSide;
  firingPosition: AxialCoord;
  weapon: WeaponProfile;
  target: ArtilleryTarget;
  map: BattlefieldHex[];
  spotters: SpotterCandidate[];
  supplyAvailable: number;
}

export interface ArtilleryFireResult {
  legal: boolean;
  reason?: string;
  spotterId?: string;
  supplySpent: number;
  supplyAfter: number;
}

export interface BombardmentSuppressionResult {
  before: number;
  after: number;
  defenseAfter: number;
}

export function applyBombardmentSuppression(
  baseDefense: number,
  currentStacks: number,
): BombardmentSuppressionResult {
  if (!Number.isInteger(baseDefense) || baseDefense < 0 || !Number.isInteger(currentStacks) || currentStacks < 0) {
    throw new Error("Bombardment Defense and stack values must be non-negative integers.");
  }
  const before = Math.min(baseDefense, currentStacks);
  const after = Math.min(baseDefense, before + 1);
  return { before, after, defenseAfter: Math.max(0, baseDefense - after) };
}

export function recoverBombardmentSuppression(
  baseDefense: number,
  currentStacks: number,
): BombardmentSuppressionResult {
  if (!Number.isInteger(baseDefense) || baseDefense < 0 || !Number.isInteger(currentStacks) || currentStacks < 0) {
    throw new Error("Bombardment Defense and stack values must be non-negative integers.");
  }
  const before = Math.min(baseDefense, currentStacks);
  const after = Math.max(0, before - 1);
  return { before, after, defenseAfter: Math.max(0, baseDefense - after) };
}

export function validateArtilleryFire(input: ArtilleryFireInput): ArtilleryFireResult {
  const rejected = (reason: string): ArtilleryFireResult => ({
    legal: false,
    reason,
    supplySpent: 0,
    supplyAfter: input.supplyAvailable,
  });
  if (!Number.isInteger(input.profile.fireSupplyCost) || input.profile.fireSupplyCost < 0) {
    return rejected("Artillery supply cost must be a non-negative integer.");
  }
  if (!Number.isFinite(input.weapon.range) || input.weapon.range < 0) return rejected("Artillery weapon range is invalid.");
  if (
    !input.map.some((hex) => sameCoord(hex.coord, input.firingPosition)) ||
    !input.map.some((hex) => sameCoord(hex.coord, input.target.position))
  ) {
    return rejected("Artillery firing unit and target must be on the battlefield.");
  }
  if (input.target.status === "DESTROYED") return rejected("Target is destroyed.");
  if (input.target.side === input.firingSide) return rejected("Friendly fire is not enabled.");
  if (hexDistance(input.firingPosition, input.target.position) > input.weapon.range) return rejected("Target is outside artillery range.");
  if (input.weapon.indirect && input.profile.mustBeDeployedForIndirectFire && input.deploymentState !== "DEPLOYED") {
    return rejected("Artillery must be deployed for indirect fire.");
  }
  if (
    !Number.isInteger(input.supplyAvailable) ||
    input.supplyAvailable < 0 ||
    input.supplyAvailable < input.profile.fireSupplyCost
  ) {
    return rejected("Insufficient artillery supply.");
  }
  let spotterId: string | undefined;
  if (input.weapon.indirect && input.profile.indirectRequiresSpotter) {
    spotterId = input.spotters
      .filter((candidate) => isEligibleSpotter(candidate, input.firingUnitId, input.firingSide, input.target, input.map))
      .sort((left, right) => left.id.localeCompare(right.id))[0]?.id;
    if (!spotterId) return rejected("Indirect fire requires an eligible friendly spotter with line of sight.");
  } else if (!input.weapon.indirect && !hasLineOfSight(input.firingPosition, input.target.position, input.map, input.weapon.range)) {
    return rejected("Direct artillery fire requires line of sight.");
  }
  return {
    legal: true,
    spotterId,
    supplySpent: input.profile.fireSupplyCost,
    supplyAfter: input.supplyAvailable - input.profile.fireSupplyCost,
  };
}

export interface StealthUnitView {
  id: string;
  position: AxialCoord;
  status: DeploymentStatus;
}

export interface StealthObserverView {
  id: string;
  position: AxialCoord;
  status: DeploymentStatus;
  sensorRange: number;
}

export interface StealthDetectionInput {
  profile: StealthProfile;
  unit: StealthUnitView;
  observers: StealthObserverView[];
  map: BattlefieldHex[];
  roll?: number;
  attacked?: boolean;
  interacted?: boolean;
}

export interface StealthDetectionResult {
  legal: boolean;
  reason?: string;
  detected: boolean;
  observerIds: string[];
  threshold?: number;
  roll?: number;
  stealthBroken?: boolean;
}

function roundedRange(value: number, mode: StealthProfile["rangeRounding"]): number {
  return mode === "FLOOR" ? Math.floor(value) : mode === "ROUND" ? Math.round(value) : Math.ceil(value);
}

export function resolveStealthDetection(input: StealthDetectionInput): StealthDetectionResult {
  if (input.unit.status === "DESTROYED" || input.unit.status === "WITHDRAWN") {
    return { legal: false, reason: "Inactive unit cannot use stealth.", detected: false, observerIds: [] };
  }
  const activeObservers = input.observers.filter(
    (observer) =>
      observer.status !== "DESTROYED" &&
      observer.status !== "WITHDRAWN" &&
      Number.isFinite(observer.sensorRange) &&
      observer.sensorRange >= 0,
  );
  if ((input.attacked && input.profile.revealOnAttack) || (input.interacted && input.profile.revealOnInteraction)) {
    const observing = activeObservers
      .filter((observer) => hasLineOfSight(observer.position, input.unit.position, input.map, observer.sensorRange))
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      legal: true,
      detected: observing.length > 0,
      observerIds: observing.map((observer) => observer.id),
      stealthBroken: true,
    };
  }
  if (input.profile.mode === "INFANTRY_ROLL") {
    const dieSides = input.profile.detectionDieSides ?? 6;
    if (!Number.isInteger(dieSides) || dieSides <= 0) {
      return { legal: false, reason: "Infantry stealth die must have a positive integer size.", detected: true, observerIds: [] };
    }
    const observersWithLos = activeObservers
      .filter((observer) => hasLineOfSight(observer.position, input.unit.position, input.map, observer.sensorRange))
      .sort((left, right) => left.id.localeCompare(right.id));
    const threshold = observersWithLos.length;
    if (threshold === 0) return { legal: true, detected: false, observerIds: [], threshold };
    if (!Number.isInteger(input.roll) || input.roll! < 1 || input.roll! > dieSides) {
      return {
        legal: false,
        reason: `Infantry stealth requires a roll from 1 to ${dieSides}.`,
        detected: true,
        observerIds: observersWithLos.map((observer) => observer.id),
        threshold,
      };
    }
    return {
      legal: true,
      detected: input.roll! < threshold,
      observerIds: observersWithLos.map((observer) => observer.id),
      threshold,
      roll: input.roll,
    };
  }

  const multiplier = input.profile.detectionRangeMultiplier ?? 0.5;
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    return { legal: false, reason: "Stealth detection range multiplier is invalid.", detected: true, observerIds: [] };
  }
  const detecting = activeObservers
    .filter((observer) => {
      const range = roundedRange(observer.sensorRange * multiplier, input.profile.rangeRounding);
      return hasLineOfSight(observer.position, input.unit.position, input.map, range);
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return { legal: true, detected: detecting.length > 0, observerIds: detecting.map((observer) => observer.id) };
}

export function projectDetectedContacts<T extends { id: string }>(
  contacts: readonly T[],
  detectionById: Readonly<Record<string, StealthDetectionResult>>,
): T[] {
  return contacts.filter((contact) => detectionById[contact.id]?.legal && detectionById[contact.id]?.detected);
}

export function projectDetectedContactsAs<T extends { id: string }, TProjected>(
  contacts: readonly T[],
  detectionById: Readonly<Record<string, StealthDetectionResult>>,
  projector: (contact: T) => TProjected,
): TProjected[] {
  return contacts
    .filter((contact) => detectionById[contact.id]?.legal && detectionById[contact.id]?.detected)
    .map(projector);
}

export function travelFacing(route: readonly AxialCoord[], fallback: Facing): Facing {
  for (let index = route.length - 1; index > 0; index -= 1) {
    const facing = facingBetween(route[index - 1], route[index]);
    if (facing !== null) return facing;
  }
  return fallback;
}

export function isTargetInFiringArc(
  origin: AxialCoord,
  target: AxialCoord,
  facing: Facing,
  arcDegrees: number,
): boolean {
  if (arcDegrees >= 360) return true;
  if (!Number.isFinite(arcDegrees) || arcDegrees <= 0) return false;
  const targetFacing = facingBetween(origin, target);
  if (targetFacing === null) return true;
  const rawDifference = Math.abs(targetFacing - facing);
  const sectorDifference = Math.min(rawDifference, 6 - rawDifference);
  return sectorDifference * 60 <= arcDegrees / 2;
}

export interface FighterAttackResult {
  legal: boolean;
  reason?: string;
  firingFacing: Facing;
  ammunitionAfter: number;
}

export function validateFighterAttack(
  profile: FighterProfile,
  route: readonly AxialCoord[],
  fallbackFacing: Facing,
  target: AxialCoord,
  currentAmmo: number,
): FighterAttackResult {
  const firingFacing = profile.useTravelFacing ? travelFacing(route, fallbackFacing) : fallbackFacing;
  if (!Number.isInteger(profile.mainWeaponAmmoCapacity) || profile.mainWeaponAmmoCapacity <= 0) {
    return { legal: false, reason: "Fighter ammunition capacity is invalid.", firingFacing, ammunitionAfter: currentAmmo };
  }
  if (!Number.isFinite(profile.firingArcDegrees) || profile.firingArcDegrees <= 0 || profile.firingArcDegrees > 360) {
    return { legal: false, reason: "Fighter firing arc is invalid.", firingFacing, ammunitionAfter: currentAmmo };
  }
  if (!Number.isInteger(currentAmmo) || currentAmmo <= 0 || currentAmmo > profile.mainWeaponAmmoCapacity) {
    return { legal: false, reason: "Fighter main weapon has no ammunition.", firingFacing, ammunitionAfter: currentAmmo };
  }
  const origin = route.at(-1);
  if (!origin) return { legal: false, reason: "Fighter route is empty.", firingFacing, ammunitionAfter: currentAmmo };
  if (!isTargetInFiringArc(origin, target, firingFacing, profile.firingArcDegrees)) {
    return { legal: false, reason: "Target is outside the fighter firing arc.", firingFacing, ammunitionAfter: currentAmmo };
  }
  return { legal: true, firingFacing, ammunitionAfter: currentAmmo - 1 };
}

export interface FighterRearmResult {
  legal: boolean;
  reason?: string;
  ammunitionAfter: number;
  actionEconomy: FighterProfile["rearmActionEconomy"];
}

export function rearmFighter(
  profile: FighterProfile,
  currentAmmo: number,
  landed: boolean,
  facilityTags: readonly string[],
): FighterRearmResult {
  const unchanged = (reason: string): FighterRearmResult => ({
    legal: false,
    reason,
    ammunitionAfter: currentAmmo,
    actionEconomy: profile.rearmActionEconomy,
  });
  if (!Number.isInteger(profile.mainWeaponAmmoCapacity) || profile.mainWeaponAmmoCapacity <= 0) {
    return unchanged("Fighter ammunition capacity is invalid.");
  }
  if (!Number.isInteger(currentAmmo) || currentAmmo < 0 || currentAmmo > profile.mainWeaponAmmoCapacity) {
    return unchanged("Fighter ammunition is invalid.");
  }
  if (currentAmmo === profile.mainWeaponAmmoCapacity) return unchanged("Fighter ammunition is already full.");
  if (profile.rearmRequiresLanding && !landed) return unchanged("Fighter must land before rearming.");
  if (profile.rearmFacilityTags.length > 0 && !hasAnyTag(facilityTags, profile.rearmFacilityTags)) {
    return unchanged("Facility cannot rearm this fighter.");
  }
  return {
    legal: true,
    ammunitionAfter: profile.mainWeaponAmmoCapacity,
    actionEconomy: profile.rearmActionEconomy,
  };
}

export interface BomberFlyOverResult {
  legal: boolean;
  reason?: string;
  pathIndex?: number;
  ammunitionAfter: number;
}

export function validateBomberFlyOver(
  profile: BomberProfile,
  route: readonly AxialCoord[],
  target: AxialCoord,
  currentAmmo: number,
): BomberFlyOverResult {
  if (!Number.isInteger(profile.ordnanceAmmoCapacity) || profile.ordnanceAmmoCapacity <= 0) {
    return { legal: false, reason: "Bomber ordnance capacity is invalid.", ammunitionAfter: currentAmmo };
  }
  if (!Number.isInteger(currentAmmo) || currentAmmo <= 0 || currentAmmo > profile.ordnanceAmmoCapacity) {
    return { legal: false, reason: "Bomber has no ordnance.", ammunitionAfter: currentAmmo };
  }
  if (route.length === 0) return { legal: false, reason: "Bomber route is empty.", ammunitionAfter: currentAmmo };
  const pathIndex = route.findIndex((coord) => sameCoord(coord, target));
  if (profile.requiresTargetFlyOver && pathIndex < 0) {
    return { legal: false, reason: "Bomber flight path does not pass over the target.", ammunitionAfter: currentAmmo };
  }
  return { legal: true, pathIndex: pathIndex < 0 ? undefined : pathIndex, ammunitionAfter: currentAmmo - 1 };
}

function isStraightFlightPath(route: readonly AxialCoord[]): boolean {
  if (route.length < 2) return false;
  const expected = hexLine(route[0], route.at(-1)!);
  return expected.length === route.length && expected.every((coord, index) => sameCoord(coord, route[index]));
}

export interface AirDropInput {
  profile: AirDropProfile;
  flightPath: AxialCoord[];
  destination: BattlefieldHex;
  cargo: CargoManifestItem;
  currentOccupancy: number;
}

export interface AirDropValidation {
  legal: boolean;
  reasons: string[];
  hazardous: boolean;
}

export function validateAirDrop(input: AirDropInput): AirDropValidation {
  const reasons: string[] = [];
  if (!Number.isInteger(input.cargo.quantity) || input.cargo.quantity <= 0) {
    reasons.push("Air-drop cargo quantity must be a positive integer.");
  }
  if (!input.profile.allowedCargoKinds.includes(input.cargo.kind)) reasons.push("Cargo kind is not eligible for air drop.");
  if (!hasAllTags(input.cargo.tags, input.profile.requiredCargoTags)) reasons.push("Cargo lacks a required air-drop tag.");
  if (input.profile.requiresStraightFlightPath && !isStraightFlightPath(input.flightPath)) {
    reasons.push("Air transport flight path must be straight.");
  }
  if (
    input.profile.destinationMustBeOnFlightPath &&
    !input.flightPath.some((coord) => sameCoord(coord, input.destination.coord))
  ) {
    reasons.push("Drop destination is not on the air transport flight path.");
  }
  const terrainBlocked = input.profile.blockedTerrainIds.includes(input.destination.terrainId);
  const environmentBlocked = input.destination.environment.some((tag) => input.profile.blockedEnvironmentTags.includes(tag));
  const structureBlocked = !input.profile.allowStructuresAtDestination && input.destination.structureIds.length > 0;
  const capacityBlocked = !Number.isInteger(input.currentOccupancy) || input.currentOccupancy < 0 || input.currentOccupancy >= input.destination.capacity;
  const hazardous = terrainBlocked || environmentBlocked || structureBlocked || capacityBlocked;
  if (input.profile.requiresClearDestination && hazardous && input.profile.hazardousDestinationPolicy === "REJECT") {
    reasons.push("Drop destination is not clear and open.");
  }
  return { legal: reasons.length === 0, reasons, hazardous };
}

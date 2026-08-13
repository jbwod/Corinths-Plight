export interface SapperBuildProfile {
  capacity: number;
  supplyPerAction: number;
  progressPerAction: number;
  reloadResource: "GENERAL_SUPPLY";
  reloadCost: number;
}

export interface SapperBuildState {
  buildSupply: number;
  generalSupply: number;
  projectProgress: number;
}

export interface SapperBuildResult {
  legal: boolean;
  reason?: string;
  state: SapperBuildState;
  supplySpent: number;
  progressAdded: number;
}

export const SOURCE_SAPPER_BUILD_PROFILE: Readonly<SapperBuildProfile> = Object.freeze({
  capacity: 6,
  supplyPerAction: 3,
  progressPerAction: 3,
  reloadResource: "GENERAL_SUPPLY",
  reloadCost: 1,
});

export const SAPPER_PUBLIC_V1 = Object.freeze({
  rulesProfileId: "public-v1-sappers@1",
  unitRequisitionCost: 6,
  buildSupplyResource: "BUILD_SUPPLY",
  generalSupplyResource: "GENERAL_SUPPLY",
  projectStatusEffectId: "status-sapper-project-public-v1",
  sensorTowerRevealRadius: 1,
});

export const SAPPER_QUIET_RIFLE: WeaponProfile = {
  id: "weapon-sapper-quiet-rifle-public-v1",
  name: "Sapper Quiet Rifle",
  damage: { count: 1, sides: 4 },
  range: 1,
  armorPiercing: 0,
  tags: ["QUIET"],
};

export const SAPPER_STRUCTURE_POLICIES = Object.freeze({
  "structure-trench": Object.freeze({ requiredProgress: 3, kind: "FIELDWORK" as const }),
  "structure-road": Object.freeze({ requiredProgress: 3, kind: "ROAD" as const }),
  "structure-sensor-tower": Object.freeze({ requiredProgress: 7, kind: "SENSOR" as const }),
  "structure-sapper-weapon-emplacement": Object.freeze({ requiredProgress: 5, kind: "EMPLACEMENT" as const }),
  "structure-sapper-minefield": Object.freeze({ requiredProgress: 3, kind: "MINE" as const }),
  "structure-sapper-at-minefield": Object.freeze({ requiredProgress: 3, kind: "AT_MINE" as const }),
});

export type SapperStructureId = keyof typeof SAPPER_STRUCTURE_POLICIES;

/**
 * Public-v1 application policy for missing timings: construction is adjacent
 * or current hex and each Primary action adds the source-defined three points.
 * Published project thresholds are retained where present (Sensor 7,
 * Emplacement 5, Road 3); the source's one-action trench/mine placements use
 * the same three-point threshold. Public-v1 normalizes a road project to one
 * adjacent edge instead of the strategic sheet's minimum three-hex project;
 * players extend a road by completing successive edge projects. The generic
 * Sapper emplacement uses the published anti-armour profile: +1 Damage,
 * Range 2 and AP +2 for the first friendly Infantry weapon fired from its hex.
 * Progress may exceed the threshold.
 */
export function getSapperPublicV1Class(sensorRange = 0): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error("Sapper sensor range must be scenario-defined as a non-negative integer.");
  }
  return {
    id: "unit-sappers",
    kind: "unit-class",
    name: "Sappers",
    description: "A stealth engineering team with a distinct Build Supply pool and bounded fieldwork catalogue.",
    category: "SUPPORT",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "ENGINEER", "SAPPER", "INFANTRY_STEALTH", "BUILD_SUPPLY"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 2, armor: 0, defense: 0, speed: 1, sensors: sensorRange, capacity: 1 },
    weapons: [{ ...SAPPER_QUIET_RIFLE, damage: { ...SAPPER_QUIET_RIFLE.damage }, tags: [...SAPPER_QUIET_RIFLE.tags] }],
    requisitionCost: SAPPER_PUBLIC_V1.unitRequisitionCost,
    slots: { primary: 1, secondary: 1 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"],
    allowedActions: ["ATTACK", "SAPPER_CONSTRUCT", "RELOAD_BUILD_SUPPLY"],
    rulesetVersion: SAPPER_PUBLIC_V1.rulesProfileId,
    source: "Classes.html Sappers + Store equipment access + public-v1 companion application policy",
    status: "experimental",
    notes: "Build Supply is not Small Supply. Vehicle/structure repair remains excluded because its FS-to-Hits conversion is unresolved.",
  };
}

export function isSapperDeployment(deployment: CampaignDeployment): boolean {
  return deployment.definitionId === "unit-sappers" || deployment.tags?.includes("SAPPER") === true;
}

const explicitlySapperEquipment = new Set([
  "equipment-at-mines",
  "equipment-automated-turrets",
  "equipment-delayed-explosive-charge",
  "equipment-light-at",
  "equipment-mines",
  "equipment-mortar-squad",
  "equipment-remote-detonators",
  "equipment-road-building",
  "equipment-stinger-aa",
]);

const allInfantryEquipment = new Set([
  "equipment-combat-shotguns",
  "equipment-drone-operator",
  "equipment-flak-vests",
  "equipment-frag-grenades",
  "equipment-k9-scouts",
  "equipment-orbital-drop-training",
  "equipment-smoke-grenades",
  "equipment-squad-automatic-weapon",
  "equipment-standard-melee-weapons",
]);

/** Exact Store access: explicit Sapper/SF-and-Sapper or All Infantry only. */
export function sapperEquipmentAllowed(equipmentId: string): boolean {
  return explicitlySapperEquipment.has(equipmentId) || allInfantryEquipment.has(equipmentId);
}

export function purchaseSappers(availableRequisition: number) {
  const before = availableRequisition;
  if (!Number.isSafeInteger(before) || before < 0) return { legal: false, reason: "Available Requisition is invalid.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  if (before < SAPPER_PUBLIC_V1.unitRequisitionCost) return { legal: false, reason: "Insufficient Requisition for Sappers.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  return { legal: true, requisitionBefore: before, requisitionAfter: before - SAPPER_PUBLIC_V1.unitRequisitionCost, requisitionSpent: SAPPER_PUBLIC_V1.unitRequisitionCost };
}

export interface SapperProjectState {
  effectId: string;
  structureDefinitionId: SapperStructureId;
  targetHex: AxialCoord;
  progress: number;
  requiredProgress: number;
}

export interface SapperConstructionResult {
  legal: boolean;
  reason?: string;
  buildSupplyBefore: number;
  buildSupplyAfter: number;
  progressBefore: number;
  progressAfter: number;
  completed: boolean;
  project?: SapperProjectState;
  statusEffects: StatusEffectState[];
  structureInstanceId?: string;
}

export function readSapperProject(deployment: CampaignDeployment): SapperProjectState | undefined {
  const effect = deployment.statusEffects?.find((candidate) =>
    candidate.definitionId === SAPPER_PUBLIC_V1.projectStatusEffectId && candidate.status === "ACTIVE"
  );
  const p = effect?.parameters;
  if (!effect || typeof p?.structureDefinitionId !== "string" || !(p.structureDefinitionId in SAPPER_STRUCTURE_POLICIES) ||
    typeof p.targetQ !== "number" || typeof p.targetR !== "number" || !Number.isSafeInteger(p.progress) || !Number.isSafeInteger(p.requiredProgress)) return undefined;
  return {
    effectId: effect.id,
    structureDefinitionId: p.structureDefinitionId as SapperStructureId,
    targetHex: { q: p.targetQ, r: p.targetR },
    progress: p.progress as number,
    requiredProgress: p.requiredProgress as number,
  };
}

export function performSapperConstruction(
  deployment: CampaignDeployment,
  structureDefinitionId: string | undefined,
  targetHex: AxialCoord | undefined,
  map: BattlefieldHex[],
  round: number,
): SapperConstructionResult {
  const buildSupplyBefore = deployment.supplies?.BUILD_SUPPLY ?? 0;
  const statusEffects = structuredClone(deployment.statusEffects ?? []);
  const reject = (reason: string): SapperConstructionResult => ({ legal: false, reason, buildSupplyBefore, buildSupplyAfter: buildSupplyBefore, progressBefore: 0, progressAfter: 0, completed: false, statusEffects });
  if (!isSapperDeployment(deployment)) return reject("Sapper construction requires a Sapper team.");
  if (!structureDefinitionId || !(structureDefinitionId in SAPPER_STRUCTURE_POLICIES)) return reject("That structure is outside the Sapper public-v1 build list.");
  if (!targetHex || !map.some((hex) => sameCoord(hex.coord, targetHex))) return reject("Sapper construction requires a known target hex.");
  if (hexDistance(deployment.position, targetHex) > 1) return reject("Sapper construction is limited to the current or an adjacent hex.");
  if (structureDefinitionId === "structure-road" && hexDistance(deployment.position, targetHex) !== 1) return reject("A road project must connect the Sapper's current hex to an adjacent hex.");
  if (buildSupplyBefore < SOURCE_SAPPER_BUILD_PROFILE.supplyPerAction) return reject("Sapper construction requires 3 Build Supply.");
  if (map.find((hex) => sameCoord(hex.coord, targetHex))!.structureIds.some((id) => id === structureDefinitionId || id.startsWith(`${structureDefinitionId}:`))) return reject("That Sapper structure is already complete in the target hex.");
  if (structureDefinitionId === "structure-sapper-at-minefield" && !deployment.equipmentIds.includes("equipment-at-mines")) return reject("AT Mine construction requires fitted Anti-tank Mines.");
  if (structureDefinitionId === "structure-road" && !deployment.equipmentIds.includes("equipment-road-building")) return reject("Road construction requires fitted Road Building Equipment.");
  // The class row itself authorizes a bounded emplacement recipe. It does not
  // grant the Store's Engineers-only equipment item to the Sapper loadout.
  const existing = readSapperProject(deployment);
  if (existing && (existing.structureDefinitionId !== structureDefinitionId || !sameCoord(existing.targetHex, targetHex))) return reject("A Sapper team may advance only one construction project at a time.");
  const policy = SAPPER_STRUCTURE_POLICIES[structureDefinitionId as SapperStructureId];
  const progressBefore = existing?.progress ?? 0;
  const progressAfter = progressBefore + SOURCE_SAPPER_BUILD_PROFILE.progressPerAction;
  const completed = progressAfter >= policy.requiredProgress;
  const effectId = existing?.effectId ?? `sapper-project:${deployment.id}:${round}`;
  const project: SapperProjectState = { effectId, structureDefinitionId: structureDefinitionId as SapperStructureId, targetHex: { ...targetHex }, progress: progressAfter, requiredProgress: policy.requiredProgress };
  const prior = statusEffects.find((candidate) => candidate.id === effectId);
  const state: StatusEffectState = {
    id: effectId,
    definitionId: SAPPER_PUBLIC_V1.projectStatusEffectId,
    status: completed ? "EXPIRED" : "ACTIVE",
    appliedRound: prior?.appliedRound ?? round,
    sourceId: deployment.id,
    parameters: { structureDefinitionId, targetQ: targetHex.q, targetR: targetHex.r, progress: progressAfter, requiredProgress: policy.requiredProgress },
  };
  if (prior) Object.assign(prior, state); else statusEffects.push(state);
  return {
    legal: true,
    buildSupplyBefore,
    buildSupplyAfter: buildSupplyBefore - SOURCE_SAPPER_BUILD_PROFILE.supplyPerAction,
    progressBefore,
    progressAfter,
    completed,
    project,
    statusEffects,
    structureInstanceId: completed ? `${structureDefinitionId}:${deployment.side}:${round}:${deployment.id}:${targetHex.q},${targetHex.r}` : undefined,
  };
}

export function reloadSapperBuildSupplyFromDeployment(deployment: CampaignDeployment) {
  const buildSupplyBefore = deployment.supplies?.BUILD_SUPPLY ?? 0;
  const generalSupplyBefore = deployment.supplies?.GENERAL_SUPPLY ?? 0;
  const result = reloadSapperBuildSupply({ buildSupply: buildSupplyBefore, generalSupply: generalSupplyBefore, projectProgress: 0 });
  return {
    ...result,
    supplies: result.legal
      ? { ...(deployment.supplies ?? {}), BUILD_SUPPLY: result.state.buildSupply, GENERAL_SUPPLY: result.state.generalSupply }
      : { ...(deployment.supplies ?? {}) },
  };
}

export interface SapperMinefield {
  structureInstanceId: string;
  definitionId: "structure-sapper-minefield" | "structure-sapper-at-minefield";
  side: CampaignDeployment["side"];
  armedFromRound: number;
}

export function parseSapperMinefield(instanceId: string): SapperMinefield | undefined {
  const parts = instanceId.split(":");
  if ((parts[0] !== "structure-sapper-minefield" && parts[0] !== "structure-sapper-at-minefield") ||
    (parts[1] !== "ALLIED" && parts[1] !== "ENEMY") || !Number.isSafeInteger(Number(parts[2]))) return undefined;
  return { structureInstanceId: instanceId, definitionId: parts[0], side: parts[1], armedFromRound: Number(parts[2]) + 1 };
}

/** Mines arm next round and trigger once on the first eligible hostile entrant. */
export function resolveSapperMineTrigger(mine: SapperMinefield, target: CampaignDeployment, round: number) {
  if (round < mine.armedFromRound || target.side === mine.side || target.side === "NEUTRAL" || target.status === "DESTROYED" || target.status === "WITHDRAWN") return { triggered: false, healthLoss: 0, armorPiercing: 0 };
  const antiTank = mine.definitionId === "structure-sapper-at-minefield";
  if (antiTank && !target.tags?.includes("VEHICLE")) return { triggered: false, healthLoss: 0, armorPiercing: 2 };
  const effectiveAtArmor = Math.max(0, target.stats.armor - 2);
  return antiTank
    ? { triggered: true, healthLoss: target.stats.healthModel === "HITS" ? (2 > effectiveAtArmor ? 1 : 0) : Math.max(0, 2 - effectiveAtArmor), armorPiercing: 2 }
    : { triggered: true, healthLoss: target.stats.healthModel === "HITS" ? (3 > target.stats.armor ? 1 : 0) : Math.max(0, 3 - target.stats.armor), armorPiercing: 0 };
}

export function applySapperWeaponEmplacement(
  attacker: CampaignDeployment,
  weapon: WeaponProfile,
  map: BattlefieldHex[],
): { applied: boolean; weapon: WeaponProfile } {
  const infantry = attacker.tags?.includes("INFANTRY") === true && attacker.tags.includes("PERSONNEL");
  const hex = map.find((candidate) => sameCoord(candidate.coord, attacker.position));
  const emplacement = hex?.structureIds.some((id) =>
    id === "structure-sapper-weapon-emplacement" || id.startsWith("structure-sapper-weapon-emplacement:")
  ) ?? false;
  if (!infantry || !emplacement) return { applied: false, weapon };
  return {
    applied: true,
    weapon: {
      ...weapon,
      damage: { ...weapon.damage, modifier: (weapon.damage.modifier ?? 0) + 1 },
      range: Math.max(weapon.range, 2),
      armorPiercing: weapon.armorPiercing + 2,
      tags: [...new Set([...weapon.tags, "SAPPER_WEAPON_EMPLACEMENT"])],
    },
  };
}

export function sensorTowerRevealHexes(origin: AxialCoord, map: BattlefieldHex[]): AxialCoord[] {
  return map.filter((hex) => hexDistance(origin, hex.coord) <= SAPPER_PUBLIC_V1.sensorTowerRevealRadius).map((hex) => ({ ...hex.coord }));
}

function validProfile(profile: SapperBuildProfile): boolean {
  return Number.isSafeInteger(profile.capacity) && profile.capacity > 0 &&
    Number.isSafeInteger(profile.supplyPerAction) && profile.supplyPerAction > 0 &&
    profile.supplyPerAction <= profile.capacity &&
    Number.isSafeInteger(profile.progressPerAction) && profile.progressPerAction > 0 &&
    profile.reloadResource === "GENERAL_SUPPLY" &&
    Number.isSafeInteger(profile.reloadCost) && profile.reloadCost > 0;
}

function validState(profile: SapperBuildProfile, state: SapperBuildState): boolean {
  return Number.isSafeInteger(state.buildSupply) &&
    state.buildSupply >= 0 &&
    state.buildSupply <= profile.capacity &&
    Number.isSafeInteger(state.generalSupply) &&
    state.generalSupply >= 0 &&
    Number.isSafeInteger(state.projectProgress) &&
    state.projectProgress >= 0;
}

function rejected(state: SapperBuildState, reason: string): SapperBuildResult {
  return {
    legal: false,
    reason,
    state: { ...state },
    supplySpent: 0,
    progressAdded: 0,
  };
}

/**
 * Source-exact companion construction accounting. This reducer deliberately
 * does not select a structure, action economy, target hex, or completion
 * threshold because those rules remain outside the Sapper class row.
 */
export function performSapperBuildAction(
  state: SapperBuildState,
  profile: SapperBuildProfile = SOURCE_SAPPER_BUILD_PROFILE,
): SapperBuildResult {
  if (!validProfile(profile)) return rejected(state, "Sapper build profile is invalid.");
  if (!validState(profile, state)) return rejected(state, "Sapper build state is invalid.");
  if (state.buildSupply < profile.supplyPerAction) {
    return rejected(state, `Sapper construction requires ${profile.supplyPerAction} Build Supply.`);
  }
  return {
    legal: true,
    state: {
      ...state,
      buildSupply: state.buildSupply - profile.supplyPerAction,
      projectProgress: state.projectProgress + profile.progressPerAction,
    },
    supplySpent: profile.supplyPerAction,
    progressAdded: profile.progressPerAction,
  };
}

/** Restores the six-point Sapper pool for one General Supply crate. */
export function reloadSapperBuildSupply(
  state: SapperBuildState,
  profile: SapperBuildProfile = SOURCE_SAPPER_BUILD_PROFILE,
): SapperBuildResult {
  if (!validProfile(profile)) return rejected(state, "Sapper build profile is invalid.");
  if (!validState(profile, state)) return rejected(state, "Sapper build state is invalid.");
  if (state.buildSupply === profile.capacity) return rejected(state, "Sapper Build Supply is already full.");
  if (state.generalSupply < profile.reloadCost) {
    return rejected(state, `Reload requires ${profile.reloadCost} General Supply crate.`);
  }
  return {
    legal: true,
    state: {
      ...state,
      buildSupply: profile.capacity,
      generalSupply: state.generalSupply - profile.reloadCost,
    },
    supplySpent: profile.reloadCost,
    progressAdded: 0,
  };
}
import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  StatusEffectState,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { hexDistance, sameCoord } from "./hex";

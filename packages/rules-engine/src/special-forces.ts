import type {
  CampaignDeployment,
  StatusEffectState,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { hexDistance } from "./hex";

export const SPECIAL_FORCES_PUBLIC_V1 = Object.freeze({
  rulesProfileId: "public-v1-special-forces@1",
  unitRequisitionCost: 8,
  delayedChargeStatusEffectId: "status-special-forces-delayed-charge-public-v1",
  delayedChargeArmingDelayRounds: 1,
});

export const SPECIAL_FORCES_QUIET_RIFLE: WeaponProfile = {
  id: "weapon-special-forces-quiet-rifle-public-v1",
  name: "Special Forces Quiet Rifle",
  damage: { count: 1, sides: 4 },
  range: 1,
  armorPiercing: 0,
  tags: ["QUIET"],
};

export const SPECIAL_FORCES_DELAYED_CHARGE: WeaponProfile = {
  id: "weapon-special-forces-delayed-charge-public-v1",
  name: "Special Forces Delayed Charge",
  damage: { count: 1, sides: 6 },
  range: 0,
  armorPiercing: 2,
  tags: ["DELAYED_CHARGE", "DEMOLITION"],
};

const prohibitedEquipmentIds = new Set([
  "equipment-mines",
  "equipment-at-mines",
  "equipment-automated-turrets",
]);

export function isSpecialForcesDeployment(deployment: CampaignDeployment): boolean {
  return deployment.definitionId === "unit-special-forces" ||
    (deployment.tags?.includes("SPECIAL_FORCES") === true && deployment.tags.includes("INFANTRY_STEALTH"));
}

export function getSpecialForcesPublicV1Class(sensorRange = 0): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) {
    throw new Error("Special Forces sensor range must be scenario-defined as a non-negative integer.");
  }
  return {
    id: "unit-special-forces",
    kind: "unit-class",
    name: "Special Forces",
    description: "A small stealth team equipped for reconnaissance and persistent demolition attacks.",
    category: "INFANTRY",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "SPECIAL_FORCES", "INFANTRY_STEALTH"],
    stats: {
      healthModel: "FORCE_STRENGTH",
      maxHealth: 3,
      armor: 0,
      defense: 0,
      speed: 2,
      sensors: sensorRange,
      capacity: 1,
    },
    weapons: [{ ...SPECIAL_FORCES_QUIET_RIFLE, damage: { ...SPECIAL_FORCES_QUIET_RIFLE.damage }, tags: [...SPECIAL_FORCES_QUIET_RIFLE.tags] }],
    requisitionCost: SPECIAL_FORCES_PUBLIC_V1.unitRequisitionCost,
    slots: { primary: 2, secondary: 2 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH", "STEALTH"],
    allowedActions: ["ATTACK", "PLACE_DELAYED_CHARGE", "DETONATE_DELAYED_CHARGE"],
    rulesetVersion: SPECIAL_FORCES_PUBLIC_V1.rulesProfileId,
    source: "Classes.html Special Forces + public-v1 companion application policy",
    status: "experimental",
    notes: "The quiet rifle remains capped by current Force Strength. Delayed charges are one-per-team persistent state.",
  };
}

export function specialForcesEquipmentAllowed(equipmentId: string): boolean {
  return !prohibitedEquipmentIds.has(equipmentId);
}

export interface SpecialForcesPurchaseResult {
  legal: boolean;
  reason?: string;
  requisitionBefore: number;
  requisitionAfter: number;
  requisitionSpent: number;
}

export function purchaseSpecialForces(availableRequisition: number): SpecialForcesPurchaseResult {
  const before = availableRequisition;
  if (!Number.isSafeInteger(before) || before < 0) {
    return { legal: false, reason: "Available Requisition is invalid.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  }
  const cost = SPECIAL_FORCES_PUBLIC_V1.unitRequisitionCost;
  if (before < cost) {
    return { legal: false, reason: "Insufficient Requisition for Special Forces.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  }
  return { legal: true, requisitionBefore: before, requisitionAfter: before - cost, requisitionSpent: cost };
}

export interface DelayedChargeState {
  effectId: string;
  sourceDeploymentId: string;
  targetDeploymentId: string;
  targetKind: "UNIT" | "STRUCTURE";
  placedRound: number;
  armedFromRound: number;
}

function activeEffect(source: CampaignDeployment): StatusEffectState | undefined {
  return source.statusEffects?.find((effect) =>
    effect.definitionId === SPECIAL_FORCES_PUBLIC_V1.delayedChargeStatusEffectId && effect.status === "ACTIVE"
  );
}

export function readSpecialForcesDelayedCharge(
  source: CampaignDeployment,
): DelayedChargeState | undefined {
  const effect = activeEffect(source);
  const parameters = effect?.parameters;
  if (
    !effect ||
    typeof parameters?.sourceDeploymentId !== "string" ||
    typeof parameters.targetDeploymentId !== "string" ||
    (parameters.targetKind !== "UNIT" && parameters.targetKind !== "STRUCTURE") ||
    !Number.isSafeInteger(parameters.placedRound) ||
    !Number.isSafeInteger(parameters.armedFromRound)
  ) return undefined;
  return {
    effectId: effect.id,
    sourceDeploymentId: parameters.sourceDeploymentId,
    targetDeploymentId: parameters.targetDeploymentId,
    targetKind: parameters.targetKind,
    placedRound: parameters.placedRound as number,
    armedFromRound: parameters.armedFromRound as number,
  };
}

export interface DelayedChargeResult {
  legal: boolean;
  reason?: string;
  charge?: DelayedChargeState;
  statusEffects: StatusEffectState[];
}

function isOperational(deployment: CampaignDeployment): boolean {
  return deployment.status !== "DESTROYED" && deployment.status !== "WITHDRAWN" &&
    (deployment.locationState ?? "ON_MAP") === "ON_MAP";
}

export function placeSpecialForcesDelayedCharge(
  source: CampaignDeployment,
  target: CampaignDeployment | undefined,
  round: number,
): DelayedChargeResult {
  const statusEffects = structuredClone(source.statusEffects ?? []);
  const reject = (reason: string): DelayedChargeResult => ({ legal: false, reason, statusEffects });
  if (!isSpecialForcesDeployment(source) || !isOperational(source)) return reject("Only an operational Special Forces team can place a delayed charge.");
  if (!Number.isSafeInteger(round) || round < 1) return reject("Delayed charge round is invalid.");
  if (readSpecialForcesDelayedCharge(source)) return reject("This Special Forces team already has an active delayed charge.");
  if (!target || !isOperational(target) || target.side === source.side || target.side === "NEUTRAL" || source.side === "NEUTRAL") {
    return reject("A delayed charge requires an operational hostile target.");
  }
  if (hexDistance(source.position, target.position) !== 1) return reject("A delayed charge target must be adjacent.");
  const targetIsStructure = target.tags?.includes("STRUCTURE") === true;
  if (targetIsStructure && target.tags?.includes("ATTACKABLE") !== true) {
    return reject("A structure must be explicitly attackable to receive a delayed charge.");
  }
  const charge: DelayedChargeState = {
    effectId: `delayed-charge:${source.id}:${round}`,
    sourceDeploymentId: source.id,
    targetDeploymentId: target.id,
    targetKind: targetIsStructure ? "STRUCTURE" : "UNIT",
    placedRound: round,
    armedFromRound: round + SPECIAL_FORCES_PUBLIC_V1.delayedChargeArmingDelayRounds,
  };
  statusEffects.push({
    id: charge.effectId,
    definitionId: SPECIAL_FORCES_PUBLIC_V1.delayedChargeStatusEffectId,
    status: "ACTIVE",
    appliedRound: round,
    sourceId: source.id,
    parameters: {
      sourceDeploymentId: charge.sourceDeploymentId,
      targetDeploymentId: charge.targetDeploymentId,
      targetKind: charge.targetKind,
      placedRound: charge.placedRound,
      armedFromRound: charge.armedFromRound,
    },
  });
  return { legal: true, charge, statusEffects };
}

export function detonateSpecialForcesDelayedCharge(
  source: CampaignDeployment,
  round: number,
): DelayedChargeResult {
  const statusEffects = structuredClone(source.statusEffects ?? []);
  const reject = (reason: string): DelayedChargeResult => ({ legal: false, reason, statusEffects });
  if (!isSpecialForcesDeployment(source) || !isOperational(source)) return reject("Only an operational Special Forces team can detonate its delayed charge.");
  const charge = readSpecialForcesDelayedCharge(source);
  if (!charge) return reject("This Special Forces team has no active delayed charge.");
  if (!Number.isSafeInteger(round) || round < charge.armedFromRound) {
    return reject("The delayed charge arms at the end of its placement round and may detonate next round or later.");
  }
  const effect = statusEffects.find((candidate) => candidate.id === charge.effectId);
  if (effect) effect.status = "EXPIRED";
  return { legal: true, charge, statusEffects };
}

export function revealSpecialForces(source: CampaignDeployment): void {
  source.statuses = [...new Set([...source.statuses.filter((status) => status !== "STEALTHED"), "REVEALED"])]
}

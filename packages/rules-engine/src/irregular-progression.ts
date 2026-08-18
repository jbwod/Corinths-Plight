import type {
  AxialCoord,
  BattlefieldHex,
  CampaignDeployment,
  StatusEffectState,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import { sameCoord } from "./hex";

export const IRREGULAR_DAMAGE_DIVISOR = 4;
export const IRREGULAR_RECRUITMENT_MAX_FS = 15;
export const IRREGULAR_RECRUITMENT_MAX_FS_GAIN = 3;

export const IRREGULAR_PUBLIC_V1 = Object.freeze({
  rulesProfileId: "public-v1-irregular@1",
  unitRequisitionCost: 4,
  recruitmentEquipmentId: "equipment-charismatic-commander",
  populationCenterEnvironment: "POPULATION_CENTER",
  headquartersEnvironment: "HEADQUARTERS",
  recruitmentHistoryStatusEffectId: "status-irregular-recruitment-history-public-v1",
  progressionStatusEffectId: "status-irregular-progression-public-v1",
  progressionMinimumCompletedMissions: 2,
  progressionMinimumExperience: 12,
});

export const IRREGULAR_SMALL_ARMS: WeaponProfile = {
  id: "weapon-irregular-small-arms-public-v1",
  name: "Irregular Small Arms",
  damage: { count: 1, sides: 6 },
  range: 1,
  armorPiercing: 0,
  tags: ["IRREGULAR_SMALL_ARMS"],
};

export type IrregularProgressionTrack = "MILITIA_VETERAN" | "RAIDER" | "REVOLUTIONARY_GUARD";

export const IRREGULAR_PROGRESSION_TRACKS = Object.freeze({
  MILITIA_VETERAN: Object.freeze({ name: "Militia Veteran", requisitionValue: 4, maxHealth: 12, armor: 0, speed: 1, damageDivisor: 2 }),
  RAIDER: Object.freeze({ name: "Raider", requisitionValue: 6, maxHealth: 10, armor: 0, speed: 2, damageDivisor: 2 }),
  REVOLUTIONARY_GUARD: Object.freeze({ name: "Revolutionary Guard", requisitionValue: 8, maxHealth: 10, armor: 1, speed: 1, damageDivisor: 1 }),
});

export function getIrregularPublicV1Class(sensorRange = 0): UnitClassDefinition {
  if (!Number.isSafeInteger(sensorRange) || sensorRange < 0) throw new Error("Irregular sensor range must be scenario-defined as a non-negative integer.");
  return {
    id: "unit-irregular",
    kind: "unit-class",
    name: "Irregular Unit",
    description: "A large, poorly trained force that can recruit locally and permanently specialize after campaign service.",
    category: "INFANTRY",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "IRREGULAR", "IRREGULAR_DAMAGE_QUARTER"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 10, armor: 0, defense: 0, speed: 1, sensors: sensorRange, capacity: 1 },
    weapons: [{ ...IRREGULAR_SMALL_ARMS, damage: { ...IRREGULAR_SMALL_ARMS.damage }, tags: [...IRREGULAR_SMALL_ARMS.tags] }],
    requisitionCost: IRREGULAR_PUBLIC_V1.unitRequisitionCost,
    slots: { high_risk_arms: 2, low_tech_melee: 1 },
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "RECRUIT_IRREGULAR"],
    rulesetVersion: IRREGULAR_PUBLIC_V1.rulesProfileId,
    source: "Classes.html Irregular Unit + Store Charismatic Commander + public-v1 progression policy",
    status: "experimental",
    notes: "Base D6 output is quartered, rounded up, then capped by current FS.",
  };
}

export function isIrregularDeployment(deployment: CampaignDeployment): boolean {
  return deployment.definitionId === "unit-irregular" || deployment.tags?.includes("IRREGULAR") === true;
}

export function purchaseIrregular(availableRequisition: number) {
  const before = availableRequisition;
  if (!Number.isSafeInteger(before) || before < 0) return { legal: false, reason: "Available Requisition is invalid.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  const cost = IRREGULAR_PUBLIC_V1.unitRequisitionCost;
  if (before < cost) return { legal: false, reason: "Insufficient Requisition for an Irregular Unit.", requisitionBefore: before, requisitionAfter: before, requisitionSpent: 0 };
  return { legal: true, requisitionBefore: before, requisitionAfter: before - cost, requisitionSpent: cost };
}

export function irregularDamageOutputForTags(baseDamageOutput: number, tags: readonly string[] = []): number {
  if (!Number.isSafeInteger(baseDamageOutput) || baseDamageOutput < 0) throw new Error("Irregular base damage output must be a non-negative integer.");
  if (tags.includes("IRREGULAR_DAMAGE_QUARTER")) return Math.ceil(baseDamageOutput / 4);
  if (tags.includes("IRREGULAR_DAMAGE_HALF")) return Math.ceil(baseDamageOutput / 2);
  return baseDamageOutput;
}

const irregularEquipmentIds = new Set([
  "equipment-charismatic-commander", "equipment-combat-shotguns", "equipment-delayed-explosive-charge",
  "equipment-drone-operator", "equipment-flak-vests", "equipment-frag-grenades", "equipment-good-ammunition",
  "equipment-hardened-leadership", "equipment-heavy-machine-gun-ammunition", "equipment-high-risk-flamers",
  "equipment-k9-scouts", "equipment-light-at", "equipment-powered-chainblades", "equipment-rocket-jump-pack",
  "equipment-smoke-grenades", "equipment-squad-automatic-weapon", "equipment-stick-bombs",
]);

export function irregularEquipmentAllowed(equipmentId: string): boolean {
  return irregularEquipmentIds.has(equipmentId);
}

export function irregularPopulationCenterKey(hex: BattlefieldHex): string {
  return `population-center:${hex.coord.q},${hex.coord.r}`;
}

export function irregularRecruitmentHistory(deployment: CampaignDeployment): string[] {
  return (deployment.statusEffects ?? [])
    .filter((effect) => effect.definitionId === IRREGULAR_PUBLIC_V1.recruitmentHistoryStatusEffectId && effect.status === "ACTIVE")
    .flatMap((effect) => typeof effect.parameters?.populationCenterKey === "string" ? [effect.parameters.populationCenterKey] : []);
}

export interface IrregularRecruitmentContext {
  deployment: CampaignDeployment;
  route: readonly AxialCoord[];
  map: BattlefieldHex[];
  campaignDeployments: CampaignDeployment[];
  round: number;
}

export function recruitIrregularAtPopulationCenter(input: IrregularRecruitmentContext) {
  const center = input.map.find((hex) => sameCoord(hex.coord, input.route.at(-1) ?? input.deployment.position));
  const entered = input.route.length > 1 && center?.environment.includes(IRREGULAR_PUBLIC_V1.populationCenterEnvironment) === true &&
    !input.map.find((hex) => sameCoord(hex.coord, input.route[0]!))?.environment.includes(IRREGULAR_PUBLIC_V1.populationCenterEnvironment);
  const centerKey = center ? irregularPopulationCenterKey(center) : "population-center:unknown";
  const alreadyUsed = input.campaignDeployments.some((deployment) => irregularRecruitmentHistory(deployment).includes(centerKey));
  const base = recruitIrregularForceStrength({
    currentMaximumForceStrength: input.deployment.stats.maxHealth,
    enteredPopulationCenter: entered && center?.control === "ALLIED",
    recruiterActionDeclared: true,
    charismaticCommanderEquipped: input.deployment.equipmentIds.includes(IRREGULAR_PUBLIC_V1.recruitmentEquipmentId),
  });
  if (!base.legal || alreadyUsed) return { ...base, legal: false, reason: alreadyUsed ? "This Population Center has already recruited an Irregular unit in this campaign." : base.reason, centerKey, statusEffects: structuredClone(input.deployment.statusEffects ?? []) };
  const statusEffects = structuredClone(input.deployment.statusEffects ?? []);
  statusEffects.push({
    id: `irregular-recruitment:${centerKey}:${input.round}`,
    definitionId: IRREGULAR_PUBLIC_V1.recruitmentHistoryStatusEffectId,
    status: "ACTIVE",
    appliedRound: input.round,
    sourceId: input.deployment.id,
    parameters: { populationCenterKey: centerKey, maximumForceStrengthGained: base.maximumForceStrengthGained, permanent: true },
  });
  return { ...base, centerKey, statusEffects };
}

export interface IrregularUpgradeInput {
  deployment: CampaignDeployment;
  track: IrregularProgressionTrack;
  completedMissions: number;
  experience: number;
  availableRequisition: number;
  atFriendlyHeadquarters: boolean;
  history: string[];
}

export interface IrregularUpgradeResult {
  legal: boolean;
  reason?: string;
  deployment: CampaignDeployment;
  history: string[];
  requisitionBefore: number;
  requisitionAfter: number;
  requisitionSpent: number;
  track?: IrregularProgressionTrack;
}

export function upgradeIrregularUnit(input: IrregularUpgradeInput): IrregularUpgradeResult {
  const deployment = structuredClone(input.deployment);
  const history = [...input.history];
  const rejected = (reason: string): IrregularUpgradeResult => ({ legal: false, reason, deployment, history, requisitionBefore: input.availableRequisition, requisitionAfter: input.availableRequisition, requisitionSpent: 0 });
  if (!isIrregularDeployment(deployment)) return rejected("Only a base Irregular unit may use Irregular progression.");
  if (deployment.statusEffects?.some((effect) => effect.definitionId === IRREGULAR_PUBLIC_V1.progressionStatusEffectId && effect.status === "ACTIVE")) return rejected("Irregular progression is irreversible and this unit has already chosen a track.");
  if (!input.atFriendlyHeadquarters) return rejected("Irregular progression requires a friendly Headquarters.");
  if (!Number.isSafeInteger(input.completedMissions) || input.completedMissions < IRREGULAR_PUBLIC_V1.progressionMinimumCompletedMissions) return rejected("Irregular progression requires two completed missions.");
  if (!Number.isSafeInteger(input.experience) || input.experience < IRREGULAR_PUBLIC_V1.progressionMinimumExperience) return rejected("Irregular progression requires 12 XP.");
  if (!Number.isSafeInteger(input.availableRequisition) || input.availableRequisition < 0) return rejected("Available Requisition is invalid.");
  const profile = IRREGULAR_PROGRESSION_TRACKS[input.track];
  const cost = profile.requisitionValue - IRREGULAR_PUBLIC_V1.unitRequisitionCost;
  if (input.availableRequisition < cost) return rejected(`Insufficient Requisition for ${profile.name}.`);
  const damageTag = profile.damageDivisor === 2 ? "IRREGULAR_DAMAGE_HALF" : "IRREGULAR_DAMAGE_FULL";
  deployment.tags = [...new Set([...(deployment.tags ?? []).filter((tag) => !tag.startsWith("IRREGULAR_DAMAGE_") && !tag.startsWith("IRREGULAR_TRACK_")), damageTag, `IRREGULAR_TRACK_${input.track}`])];
  deployment.stats = { ...deployment.stats, maxHealth: profile.maxHealth, armor: profile.armor, speed: profile.speed };
  deployment.currentHealth = Math.min(deployment.currentHealth, profile.maxHealth);
  deployment.equipmentIds = deployment.equipmentIds.filter(irregularEquipmentAllowed);
  const permanentHistory = `IRREGULAR_PROGRESSION:${input.track}`;
  if (!history.includes(permanentHistory)) history.push(permanentHistory);
  const effect: StatusEffectState = {
    id: `irregular-progression:${deployment.id}:${input.track}`,
    definitionId: IRREGULAR_PUBLIC_V1.progressionStatusEffectId,
    status: "ACTIVE",
    sourceId: deployment.id,
    parameters: { track: input.track, requisitionValue: profile.requisitionValue, permanent: true },
  };
  deployment.statusEffects = [...(deployment.statusEffects ?? []), effect];
  return { legal: true, deployment, history, requisitionBefore: input.availableRequisition, requisitionAfter: input.availableRequisition - cost, requisitionSpent: cost, track: input.track };
}

export interface IrregularRecruitmentInput {
  currentMaximumForceStrength: number;
  enteredPopulationCenter: boolean;
  recruiterActionDeclared: boolean;
  charismaticCommanderEquipped: boolean;
}

export interface IrregularRecruitmentResult {
  legal: boolean;
  reason?: string;
  maximumForceStrengthBefore: number;
  maximumForceStrengthAfter: number;
  maximumForceStrengthGained: number;
}

/** Applies the Classes.html Irregular "1/4 damage output rounded up" rule. */
export function irregularDamageOutput(baseDamageOutput: number): number {
  if (!Number.isSafeInteger(baseDamageOutput) || baseDamageOutput < 0) {
    throw new Error("Irregular base damage output must be a non-negative integer.");
  }
  return Math.ceil(baseDamageOutput / IRREGULAR_DAMAGE_DIVISOR);
}

function rejected(input: IrregularRecruitmentInput, reason: string): IrregularRecruitmentResult {
  return {
    legal: false,
    reason,
    maximumForceStrengthBefore: input.currentMaximumForceStrength,
    maximumForceStrengthAfter: input.currentMaximumForceStrength,
    maximumForceStrengthGained: 0,
  };
}

/**
 * Resolves one source-defined Irregular Recruiter action. This pure transition
 * intentionally changes maximum FS only: the Store says "+3 FS Max", not that
 * the unit heals or immediately gains current FS. Campaign recurrence and the
 * meaning of "entering" a Population Center remain external eligibility rules.
 */
export function recruitIrregularForceStrength(
  input: IrregularRecruitmentInput,
): IrregularRecruitmentResult {
  if (
    !Number.isSafeInteger(input.currentMaximumForceStrength) ||
    input.currentMaximumForceStrength < 1 ||
    input.currentMaximumForceStrength > IRREGULAR_RECRUITMENT_MAX_FS
  ) {
    return rejected(input, "Irregular maximum Force Strength is invalid.");
  }
  if (!input.charismaticCommanderEquipped) {
    return rejected(input, "Irregular recruitment requires a Charismatic Commander.");
  }
  if (!input.enteredPopulationCenter) {
    return rejected(input, "Irregular recruitment requires entry into a Population Center.");
  }
  if (!input.recruiterActionDeclared) {
    return rejected(input, "Irregular recruitment requires the Recruiter action.");
  }
  if (input.currentMaximumForceStrength === IRREGULAR_RECRUITMENT_MAX_FS) {
    return rejected(input, "Irregular maximum Force Strength is already 15.");
  }
  const maximumForceStrengthAfter = Math.min(
    IRREGULAR_RECRUITMENT_MAX_FS,
    input.currentMaximumForceStrength + IRREGULAR_RECRUITMENT_MAX_FS_GAIN,
  );
  return {
    legal: true,
    maximumForceStrengthBefore: input.currentMaximumForceStrength,
    maximumForceStrengthAfter,
    maximumForceStrengthGained: maximumForceStrengthAfter - input.currentMaximumForceStrength,
  };
}

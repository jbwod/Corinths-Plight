import type {
  ArtilleryDeploymentState,
  ActionType,
  AxialCoord,
  CampaignDeployment,
  CompanionArtilleryAbandonmentState,
  OrderType,
  UnitClassDefinition,
  WeaponProfile,
} from "../../domain/src";
import {
  COMPANION_PUBLIC_V1_PROFILE_ID,
  getCompanionClassPolicyV1,
} from "./companion-class-profile";
import { sameCoord } from "./hex";

export type CompanionArtilleryDefinitionId =
  | "unit-light-artillery"
  | "unit-heavy-artillery"
  | "unit-self-propelled-artillery";

export function isCompanionArtilleryDefinitionId(value: string): value is CompanionArtilleryDefinitionId {
  return value === "unit-light-artillery" || value === "unit-heavy-artillery" || value === "unit-self-propelled-artillery";
}

export function isCrewedCompanionArtilleryDefinitionId(
  value: string,
): value is "unit-light-artillery" | "unit-heavy-artillery" {
  return value === "unit-light-artillery" || value === "unit-heavy-artillery";
}

export const COMPANION_ARTILLERY_CREW_DEFINITION_ID = "unit-companion-artillery-crew";

export function getCompanionArtilleryCrewProfile(sensorRange: number): UnitClassDefinition {
  if (!Number.isInteger(sensorRange) || sensorRange < 0) throw new Error("Artillery CREW requires a governed sensor range.");
  return {
    id: COMPANION_ARTILLERY_CREW_DEFINITION_ID,
    kind: "unit-class",
    name: "Artillery Crew",
    description: "An unarmed crew that abandoned its artillery platform.",
    category: "INFANTRY",
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "CREW", "UNARMED"],
    stats: { healthModel: "FORCE_STRENGTH", maxHealth: 1, armor: 0, defense: 0, speed: 1, sensors: sensorRange, capacity: 1 },
    weapons: [],
    requisitionCost: 0,
    slots: {},
    allowedOrders: ["HOLD", "ADVANCE"],
    allowedActions: ["REPLACE_GUNS"],
    rulesetVersion: COMPANION_PUBLIC_V1_PROFILE_ID,
    source: "Classes.html / Abandon Guns",
    status: "active",
  };
}

function weaponProfile(id: CompanionArtilleryDefinitionId): WeaponProfile {
  const weapon = getCompanionClassPolicyV1(id).weapons[0]!;
  return {
    id: weapon.id,
    name: weapon.name,
    damage: { ...weapon.damage },
    range: weapon.range,
    armorPiercing: weapon.armorPiercing,
    indirect: weapon.indirect,
    ammoCapacity: weapon.ammunitionCapacity,
    tags: [
      "INDIRECT",
      ...(weapon.areaHex ? ["AREA_HEX"] : []),
      ...(id === "unit-self-propelled-artillery" ? ["MINIMUM_RANGE_2"] : []),
    ],
  };
}

export function getPublicV1CompanionArtilleryProfile(
  id: CompanionArtilleryDefinitionId,
  scenarioSensorRange: number,
): UnitClassDefinition {
  if (!Number.isInteger(scenarioSensorRange) || scenarioSensorRange < 0) {
    throw new Error(`${id} requires a scenario-authored non-negative integer sensor range.`);
  }
  const policy = getCompanionClassPolicyV1(id);
  return {
    id,
    kind: "unit-class",
    name: policy.name,
    description: `${policy.name} under ${COMPANION_PUBLIC_V1_PROFILE_ID}.`,
    category: policy.category,
    tags: [
      ...policy.tags,
      ...(id === "unit-light-artillery" ? ["LIGHT_ARTILLERY_AIRDROP"] : []),
      ...(id === "unit-heavy-artillery" ? ["HAT_ARTILLERY_CARGO"] : []),
    ],
    stats: {
      healthModel: policy.healthModel,
      maxHealth: policy.maximumHealth,
      armor: policy.armor,
      defense: 0,
      speed: policy.speed,
      sensors: scenarioSensorRange,
      capacity: 1,
    },
    weapons: [weaponProfile(id)],
    requisitionCost: policy.requisitionCost,
    slots: Object.fromEntries(Object.entries(policy.slots).map(([key, value]) => [key.toLowerCase(), value])),
    allowedOrders: [...policy.allowedOrders],
    allowedActions: [
      ...policy.allowedActions,
      ...(isCrewedCompanionArtilleryDefinitionId(id) ? ["ABANDON_GUNS" as const] : []),
    ],
    rulesetVersion: COMPANION_PUBLIC_V1_PROFILE_ID,
    source: "Classes.html plus approved public-v1 companion class conversion",
    status: "active",
    notes: policy.signatureMechanics.join(", "),
  };
}

export interface CompanionArtilleryFireSelection {
  legal: boolean;
  reasons: string[];
  shots: Array<{ index: number; targetHex: AxialCoord }>;
  weapon: WeaponProfile;
  ammunitionBefore?: number;
  ammunitionAfter?: number;
}

function axialCoord(value: unknown): AxialCoord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.q) && Number.isInteger(candidate.r)
    ? { q: candidate.q as number, r: candidate.r as number }
    : undefined;
}

/** Server-owned shot count; declarations only choose one target hex per shot. */
export function selectCompanionArtilleryFire(input: {
  deployment: Pick<CampaignDeployment, "definitionId" | "weapons" | "ammunition"> & { artilleryDeployment?: ArtilleryDeploymentState; statuses: string[] };
  targetHex?: AxialCoord;
  payloadTargetHexes?: unknown;
}): CompanionArtilleryFireSelection | undefined {
  if (!isCompanionArtilleryDefinitionId(input.deployment.definitionId)) return undefined;
  const policy = getCompanionClassPolicyV1(input.deployment.definitionId);
  const expected = policy.weapons[0]!;
  const weapon = input.deployment.weapons.find((candidate) => candidate.id === expected.id) ?? weaponProfile(input.deployment.definitionId);
  const shotCount = expected.attacksPerActivation ?? 1;
  const declared = Array.isArray(input.payloadTargetHexes)
    ? input.payloadTargetHexes.map(axialCoord)
    : input.targetHex
      ? [input.targetHex]
      : [];
  const reasons: string[] = [];
  if (isCrewedCompanionArtilleryDefinitionId(input.deployment.definitionId)) {
    const deployed = input.deployment.artilleryDeployment ?? (input.deployment.statuses.includes("DEPLOYED") ? "DEPLOYED" : "PACKED");
    if (deployed !== "DEPLOYED") reasons.push(`${policy.name} must be deployed before firing.`);
  }
  if (declared.length < 1 || declared.some((coord) => coord === undefined)) {
    reasons.push("Companion artillery requires valid target hex declarations.");
  }
  if (declared.length > shotCount) reasons.push(`${policy.name} may declare at most ${shotCount} target hexes.`);
  const targetHexes = declared.filter((coord): coord is AxialCoord => coord !== undefined);
  const expanded = targetHexes.length === 1
    ? Array.from({ length: shotCount }, () => ({ ...targetHexes[0]! }))
    : targetHexes;
  if (expanded.length !== shotCount) reasons.push(`${policy.name} must resolve exactly ${shotCount} shots.`);
  const ammoBefore = weapon.ammoCapacity === undefined ? undefined : input.deployment.ammunition[weapon.id] ?? 0;
  if (ammoBefore !== undefined && ammoBefore < shotCount) reasons.push(`${policy.name} has insufficient ammunition for its attack activation.`);
  return {
    legal: reasons.length === 0,
    reasons,
    shots: reasons.length === 0 ? expanded.map((targetHex, index) => ({ index: index + 1, targetHex })) : [],
    weapon,
    ammunitionBefore: ammoBefore,
    ammunitionAfter: ammoBefore === undefined ? undefined : ammoBefore - shotCount,
  };
}

export function validateCompanionArtilleryRange(
  definitionId: CompanionArtilleryDefinitionId,
  origin: AxialCoord,
  target: AxialCoord,
  distance: number,
): { legal: boolean; reason?: string } {
  if (!Number.isInteger(distance) || distance < 0 || sameCoord(origin, target) !== (distance === 0)) {
    return { legal: false, reason: "Artillery distance state is invalid." };
  }
  const policy = getCompanionClassPolicyV1(definitionId);
  const weapon = policy.weapons[0]!;
  const minimum = weapon.minimumRange ?? 0;
  return distance < minimum || distance > weapon.range
    ? { legal: false, reason: `${policy.name} target must be at Range ${minimum}-${weapon.range}.` }
    : { legal: true };
}

export type AbandonedArtillerySnapshot = CompanionArtilleryAbandonmentState;

export function abandonCompanionArtillery(
  deployment: CampaignDeployment,
): { legal: boolean; reason?: string; deployment: CampaignDeployment; snapshot?: AbandonedArtillerySnapshot } {
  const next = structuredClone(deployment);
  if (!isCrewedCompanionArtilleryDefinitionId(deployment.definitionId)) {
    return { legal: false, reason: "Only operational Light or Heavy Artillery may abandon its guns.", deployment: next };
  }
  if (deployment.status === "DESTROYED" || deployment.status === "WITHDRAWN" || deployment.currentHealth <= 0) {
    return { legal: false, reason: "Destroyed or withdrawn artillery cannot abandon its guns.", deployment: next };
  }
  const snapshot: AbandonedArtillerySnapshot = {
    originalDefinitionId: deployment.definitionId,
    originalStats: structuredClone(deployment.stats),
    originalWeapons: structuredClone(deployment.weapons),
    originalEquipmentIds: [...deployment.equipmentIds],
    originalAmmunition: { ...deployment.ammunition },
    replacementUsed: deployment.companionArtilleryAbandonment?.replacementUsed ?? false,
  };
  next.definitionId = COMPANION_ARTILLERY_CREW_DEFINITION_ID;
  next.tags = ["GROUND", "PERSONNEL", "INFANTRY", "CREW", "UNARMED"];
  next.stats = { healthModel: "FORCE_STRENGTH", maxHealth: 1, armor: 0, defense: 0, speed: 1, sensors: deployment.stats.sensors, capacity: 1 };
  next.currentHealth = 1;
  next.weapons = [];
  next.ammunition = {};
  next.equipmentIds = [];
  next.allowedActions = ["REPLACE_GUNS"];
  next.allowedOrders = ["HOLD", "ADVANCE"];
  next.artilleryDeployment = undefined;
  next.statuses = ["ARTILLERY_CREW", `ORIGINAL_ARTILLERY:${snapshot.originalDefinitionId}`];
  return { legal: true, deployment: next, snapshot };
}

export function companionArtilleryReplacementCost(definitionId: "unit-light-artillery" | "unit-heavy-artillery"): number {
  return Math.ceil(getCompanionClassPolicyV1(definitionId).requisitionCost / 2);
}

export function replaceCompanionArtillery(input: {
  deployment: CampaignDeployment;
  snapshot: AbandonedArtillerySnapshot | undefined;
  atFriendlySupplyPoint: boolean;
  availableRequisition: number;
}): { legal: boolean; reason?: string; deployment: CampaignDeployment; requisitionSpent: number; snapshot?: AbandonedArtillerySnapshot } {
  const next = structuredClone(input.deployment);
  const snapshot = input.snapshot ? structuredClone(input.snapshot) : undefined;
  const rejected = (reason: string) => ({ legal: false, reason, deployment: next, requisitionSpent: 0, snapshot });
  if (input.deployment.definitionId !== COMPANION_ARTILLERY_CREW_DEFINITION_ID || !snapshot) {
    return rejected("Only an artillery CREW with an original gun snapshot may replace its guns.");
  }
  if (snapshot.replacementUsed) return rejected("This artillery crew already used its one campaign replacement.");
  if (!input.atFriendlySupplyPoint) return rejected("Artillery replacement requires a friendly Supply Point.");
  if (!Number.isInteger(input.availableRequisition) || input.availableRequisition < 0) return rejected("Available Requisition is invalid.");
  const cost = companionArtilleryReplacementCost(snapshot.originalDefinitionId);
  if (input.availableRequisition < cost) return rejected(`Artillery replacement requires ${cost} Req.`);
  next.definitionId = snapshot.originalDefinitionId;
  next.tags = getPublicV1CompanionArtilleryProfile(snapshot.originalDefinitionId, next.stats.sensors).tags;
  next.stats = structuredClone(snapshot.originalStats);
  next.currentHealth = next.stats.maxHealth;
  next.weapons = structuredClone(snapshot.originalWeapons);
  next.equipmentIds = [...snapshot.originalEquipmentIds];
  const restoredProfile = getPublicV1CompanionArtilleryProfile(snapshot.originalDefinitionId, next.stats.sensors);
  next.allowedActions = [...restoredProfile.allowedActions] as ActionType[];
  next.allowedOrders = [...restoredProfile.allowedOrders] as OrderType[];
  next.ammunition = { ...snapshot.originalAmmunition };
  next.artilleryDeployment = "PACKED";
  next.statuses = ["PACKED", "ARTILLERY_REPLACEMENT_USED"];
  snapshot.replacementUsed = true;
  return { legal: true, deployment: next, requisitionSpent: cost, snapshot };
}

export function validateCompanionArtilleryTransport(
  artilleryId: CompanionArtilleryDefinitionId,
  carrierOrMethod: "unit-heavy-air-transport" | "HEAVY_DROP_POD",
): { legal: boolean; airDrop: boolean; reason?: string } {
  if (artilleryId === "unit-light-artillery") {
    return { legal: true, airDrop: true };
  }
  if (artilleryId === "unit-heavy-artillery" && carrierOrMethod === "unit-heavy-air-transport") {
    return { legal: true, airDrop: false };
  }
  return { legal: false, airDrop: false, reason: `${artilleryId} cannot use ${carrierOrMethod}.` };
}

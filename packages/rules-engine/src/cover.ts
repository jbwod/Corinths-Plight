import type { BattlefieldHex, CampaignDeployment } from "../../domain/src";
import { V5_CORE_CURATED_2_CATALOGUE } from "./generated/v5-core-curated-2";

export const INFANTRY_COVER_ARMOR_1 = "INFANTRY_COVER_ARMOR_1" as const;
export const INFANTRY_GARRISON_BUILDING = "INFANTRY_GARRISON_BUILDING" as const;

export function isInfantryGarrisonBuilding(hex: BattlefieldHex | undefined): boolean {
  return Boolean(hex?.environment.includes(INFANTRY_GARRISON_BUILDING));
}

export function isGarrisonEligible(deployment: Pick<CampaignDeployment, "tags">): boolean {
  const tags = new Set(deployment.tags ?? []);
  return tags.has("INFANTRY") && tags.has("PERSONNEL") && !tags.has("VEHICLE");
}

export interface TacticalCoverResult {
  armor: 0 | 1;
  sources: string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function infantryArmor(value: unknown): 0 | 1 {
  return record(record(value)?.definition)?.infantryArmor === 1 ? 1 : 0;
}

const terrainCover = new Map<string, 0 | 1>(
  V5_CORE_CURATED_2_CATALOGUE.content.terrain
    .map((definition) => [definition.id, infantryArmor(definition.parameters)]),
);

const structureCover = new Map<string, 0 | 1>(
  V5_CORE_CURATED_2_CATALOGUE.content.structures
    .map((definition) => [definition.id, infantryArmor(definition.parameters)]),
);

function sameHex(left: CampaignDeployment, right: CampaignDeployment): boolean {
  return left.position.q === right.position.q && left.position.r === right.position.r;
}

export function resolveTacticalCover(
  attacker: CampaignDeployment,
  target: CampaignDeployment,
  hexes: BattlefieldHex[],
): TacticalCoverResult {
  const tags = new Set(target.tags ?? []);
  if (sameHex(attacker, target) || !tags.has("PERSONNEL") || tags.has("VEHICLE")) {
    return { armor: 0, sources: [] };
  }
  const hex = hexes.find((candidate) =>
    candidate.coord.q === target.position.q && candidate.coord.r === target.position.r
  );
  if (!hex) return { armor: 0, sources: [] };

  const sources: string[] = [];
  if (terrainCover.get(hex.terrainId) === 1) sources.push(hex.terrainId);
  for (const structureId of hex.structureIds) {
    const definitionId = [...structureCover.entries()].find(([id, armor]) =>
      armor === 1 && (structureId === id || structureId.startsWith(`${id}:`))
    )?.[0];
    if (definitionId) sources.push(definitionId);
  }
  if (hex.environment.includes(INFANTRY_COVER_ARMOR_1)) sources.push(INFANTRY_COVER_ARMOR_1);

  return sources.length > 0
    ? { armor: 1, sources: [...new Set(sources)].sort() }
    : { armor: 0, sources: [] };
}

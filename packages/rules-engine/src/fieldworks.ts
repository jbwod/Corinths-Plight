import type { BattlefieldHex } from "../../domain/src";
import { tacticalRulesCatalogueRuntime } from "./tactical-grammar";

export const EXECUTABLE_FIELDWORK_IDS = [
  "structure-razor-wire",
  "structure-sandbag-line",
  "structure-bridge",
  "structure-tank-traps",
  "structure-trench",
] as const;

export const CONSTRUCTIBLE_FIELDWORK_IDS = [
  "structure-sandbag-line",
  "structure-bridge",
  "structure-razor-wire",
  "structure-tank-traps",
] as const;

export type ExecutableFieldworkId = typeof EXECUTABLE_FIELDWORK_IDS[number];
export type ConstructibleFieldworkId = typeof CONSTRUCTIBLE_FIELDWORK_IDS[number];

export interface FieldworkDefinition {
  id: ExecutableFieldworkId;
  name: string;
  smallSupplyCost: number;
  constructRange: "ADJACENT_OR_CURRENT" | "ADJACENT_RIVER_EDGE" | null;
  movementPenalty: { unitTag: "INFANTRY" | "VEHICLE"; speed: number } | null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`FIELDWORK_DEFINITION_INVALID:${label}`);
  }
  return value as Record<string, unknown>;
}

export function isConstructibleFieldworkId(value: string | undefined): value is ConstructibleFieldworkId {
  return CONSTRUCTIBLE_FIELDWORK_IDS.includes(value as ConstructibleFieldworkId);
}

export function structureInstanceMatches(instanceId: string, definitionId: string): boolean {
  return instanceId === definitionId || instanceId.startsWith(`${definitionId}:`);
}

export function getFieldworkDefinition(id: ExecutableFieldworkId): FieldworkDefinition {
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("STRUCTURE", id);
  if (!lookup.found) throw new Error(`FIELDWORK_DEFINITION_MISSING:${id}`);
  const decision = tacticalRulesCatalogueRuntime.decide("STRUCTURE", id);
  if (!decision.executability.allowed || decision.executability.handlerId !== "foundation-fieldwork-handler") {
    throw new Error(`FIELDWORK_NOT_EXECUTABLE:${id}:${decision.executability.code}`);
  }
  const parameters = record(lookup.value.parameters, `${id}:parameters`);
  const buildCost = record(parameters.buildCost, `${id}:buildCost`);
  const definition = record(parameters.definition, `${id}:definition`);
  const smallSupplyCost = buildCost.smallSupply ?? 0;
  if (!Number.isInteger(smallSupplyCost) || (smallSupplyCost as number) < 0) {
    throw new Error(`FIELDWORK_DEFINITION_INVALID:${id}:smallSupplyCost`);
  }
  const constructRange = definition.constructRange === undefined
    ? null
    : definition.constructRange === "ADJACENT_OR_CURRENT"
      ? definition.constructRange
      : definition.constructRange === "ADJACENT_RIVER_EDGE"
        ? definition.constructRange
        : (() => { throw new Error(`FIELDWORK_DEFINITION_INVALID:${id}:constructRange`); })();
  let movementPenalty: FieldworkDefinition["movementPenalty"] = null;
  if (definition.movementPenalty !== undefined) {
    const value = record(definition.movementPenalty, `${id}:movementPenalty`);
    if (
      (value.unitTag !== "INFANTRY" && value.unitTag !== "VEHICLE") ||
      typeof value.speed !== "number" ||
      !Number.isFinite(value.speed) ||
      value.speed < 0 ||
      !Number.isInteger(value.speed * 4)
    ) {
      throw new Error(`FIELDWORK_DEFINITION_INVALID:${id}:movementPenalty`);
    }
    movementPenalty = { unitTag: value.unitTag, speed: value.speed };
  }
  return {
    id,
    name: lookup.value.name,
    smallSupplyCost: smallSupplyCost as number,
    constructRange,
    movementPenalty,
  };
}

export function fieldworkMovementPenalty(
  hex: Pick<BattlefieldHex, "structureIds">,
  unitTags: readonly string[] = [],
): { total: number; sources: Array<{ structureDefinitionId: ExecutableFieldworkId; speed: number }> } {
  const tags = new Set(unitTags);
  const sources = EXECUTABLE_FIELDWORK_IDS.flatMap((id) => {
    if (!hex.structureIds.some((instanceId) => structureInstanceMatches(instanceId, id))) return [];
    const penalty = getFieldworkDefinition(id).movementPenalty;
    return penalty && tags.has(penalty.unitTag)
      ? [{ structureDefinitionId: id, speed: penalty.speed }]
      : [];
  });
  return { total: sources.reduce((total, source) => total + source.speed, 0), sources };
}

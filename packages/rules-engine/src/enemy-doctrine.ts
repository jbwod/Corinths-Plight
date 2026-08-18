import type {
  EnemyDoctrineProfileV1,
  EnemyTargetPreference,
  OrderType,
} from "../../domain/src";
import { tacticalRulesCatalogueRuntime } from "./tactical-grammar";

const targetPreferences = new Set<EnemyTargetPreference>([
  "PERSONNEL",
  "VEHICLE",
  "OBJECTIVE",
  "STRUCTURE",
  "LOGISTICS",
  "AEROSPACE",
]);
const orderTypes = new Set<OrderType>([
  "HOLD",
  "ADVANCE",
  "RUSH",
  "EVASIVE",
  "MELEE_CHARGE",
  "STEALTH",
]);

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${path}`);
  }
  return value as Record<string, unknown>;
}

function stringArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !allowed.has(item as T))) {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${path}`);
  }
  const result = value as T[];
  if (new Set(result).size !== result.length) throw new Error(`ENEMY_DOCTRINE_INVALID:${path}:DUPLICATE`);
  return result.slice();
}

/** Materialises the published enemy doctrine without class-name switches. */
export function getEnemyDoctrineProfile(definitionId: string): EnemyDoctrineProfileV1 {
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("ENEMY", definitionId);
  if (!lookup.found) throw new Error(`ENEMY_DOCTRINE_MISSING:${definitionId}`);
  const parameters = record(lookup.value.parameters, `${definitionId}:parameters`);
  const doctrine = record(parameters.doctrine, `${definitionId}:doctrine`);
  if (typeof parameters.factionId !== "string" || parameters.factionId.length === 0) {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${definitionId}:factionId`);
  }
  const aggression = doctrine.aggression;
  if (aggression !== undefined && (typeof aggression !== "number" || !Number.isFinite(aggression))) {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${definitionId}:aggression`);
  }
  if (doctrine.role !== undefined && typeof doctrine.role !== "string") {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${definitionId}:role`);
  }
  if (doctrine.vehiclePriority !== undefined && doctrine.vehiclePriority !== 0 && doctrine.vehiclePriority !== 1) {
    throw new Error(`ENEMY_DOCTRINE_INVALID:${definitionId}:vehiclePriority`);
  }
  return {
    schemaVersion: 1,
    definitionId,
    factionId: parameters.factionId,
    preferredTargets: stringArray(doctrine.preferredTargets, targetPreferences, `${definitionId}:preferredTargets`),
    preferredOrderTypes: stringArray(doctrine.preferredOrderTypes, orderTypes, `${definitionId}:preferredOrderTypes`),
    aggression: typeof aggression === "number" ? aggression : null,
    role: typeof doctrine.role === "string" ? doctrine.role : null,
    vehiclePriority: doctrine.vehiclePriority === 1,
  };
}

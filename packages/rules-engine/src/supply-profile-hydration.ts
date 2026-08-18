import {
  JsonContractError,
  TACTICAL_SUPPLY_RESOURCE_IDS,
  TacticalSupplyResourceIdError,
  assertJsonObject,
  parseTacticalSupplyResourceId,
  type GovernedSupplyActionEconomyV1,
  type GovernedSupplyCapacitiesV1,
  type GovernedSupplyCapacityV1,
  type GovernedSupplyFacilityCapabilityV1,
  type GovernedSupplyOverCapacityPolicyV1,
  type GovernedSupplyProfileV1,
  type GovernedSupplyReloadRulesV1,
  type GovernedSupplyResourceQuantityV1,
  type JsonObject,
  type TacticalSupplyResourceId,
} from "../../domain/src";

export type SupplyProfileHydrationIssueCodeV1 =
  | "OBJECT_REQUIRED"
  | "UNKNOWN_FIELD"
  | "REQUIRED_FIELD"
  | "STRING_REQUIRED"
  | "ARRAY_REQUIRED"
  | "ARRAY_LENGTH"
  | "DUPLICATE_VALUE"
  | "BOOLEAN_REQUIRED"
  | "POSITIVE_INTEGER_REQUIRED"
  | "RESOURCE_ID_REQUIRED"
  | "RESOURCE_ID_AMBIGUOUS"
  | "RESOURCE_ID_NOT_CANONICAL"
  | "RESOURCE_ID_UNKNOWN"
  | "CAPACITY_FORMULA_UNKNOWN"
  | "ENUM_VALUE_UNKNOWN"
  | "RESOURCE_QUANTITY_INVALID"
  | "SOURCE_PAIR_REQUIRED"
  | "JSON_OBJECT_REQUIRED";

export interface SupplyProfileHydrationIssueV1 {
  code: SupplyProfileHydrationIssueCodeV1;
  path: string;
  message: string;
}

export interface SupplyProfileHydrationInputV1 {
  id: string;
  parameters: unknown;
}

export type SupplyProfileHydrationResultV1 =
  | { ok: true; profile: GovernedSupplyProfileV1 }
  | { ok: false; issues: SupplyProfileHydrationIssueV1[] };

class SupplyProfileHydrationError extends Error {
  constructor(readonly issue: SupplyProfileHydrationIssueV1) {
    super(issue.message);
    this.name = "SupplyProfileHydrationError";
  }
}

function fail(
  code: SupplyProfileHydrationIssueCodeV1,
  path: string,
  message: string,
): never {
  throw new SupplyProfileHydrationError({ code, path, message });
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("OBJECT_REQUIRED", path, "Expected an object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("OBJECT_REQUIRED", path, "Expected a plain object.");
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  path: string,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): Record<string, unknown> {
  const parsed = record(value, path);
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(parsed)) {
    if (!allowed.has(field)) {
      fail("UNKNOWN_FIELD", `${path}.${field}`, "Field is not part of the governed supply-profile contract.");
    }
  }
  for (const field of requiredFields) {
    if (!(field in parsed)) fail("REQUIRED_FIELD", `${path}.${field}`, "Required field is missing.");
  }
  return parsed;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail("STRING_REQUIRED", path, "Expected a non-empty string.");
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail("POSITIVE_INTEGER_REQUIRED", path, "Expected a positive safe integer.");
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("BOOLEAN_REQUIRED", path, "Expected a boolean.");
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail("ARRAY_REQUIRED", path, "Expected an array of strings.");
  const parsed = value.map((candidate, index) => nonEmptyString(candidate, `${path}[${index}]`));
  const seen = new Set<string>();
  for (const [index, candidate] of parsed.entries()) {
    if (seen.has(candidate)) fail("DUPLICATE_VALUE", `${path}[${index}]`, `Duplicate value ${candidate}.`);
    seen.add(candidate);
  }
  return parsed;
}

function resourceId(value: unknown, path: string): TacticalSupplyResourceId {
  try {
    return parseTacticalSupplyResourceId(value);
  } catch (error) {
    if (!(error instanceof TacticalSupplyResourceIdError)) throw error;
    const code: SupplyProfileHydrationIssueCodeV1 =
      error.code === "TACTICAL_SUPPLY_RESOURCE_ID_REQUIRED" ? "RESOURCE_ID_REQUIRED"
        : error.code === "TACTICAL_SUPPLY_RESOURCE_ID_AMBIGUOUS" ? "RESOURCE_ID_AMBIGUOUS"
          : error.code === "TACTICAL_SUPPLY_RESOURCE_ID_NOT_CANONICAL" ? "RESOURCE_ID_NOT_CANONICAL"
            : "RESOURCE_ID_UNKNOWN";
    fail(code, path, error.message);
  }
}

function capacity(value: unknown, path: string): GovernedSupplyCapacityV1 {
  const parsed = exactObject(value, path, ["maximum", "capacityFormula"], ["maximum"]);
  const maximum = positiveInteger(parsed.maximum, `${path}.maximum`);
  if (!("capacityFormula" in parsed)) {
    return { kind: "FIXED_MAXIMUM", maximum, capacityFormula: null };
  }
  if (parsed.capacityFormula !== "CURRENT_FS") {
    fail("CAPACITY_FORMULA_UNKNOWN", `${path}.capacityFormula`, "Only the CURRENT_FS capacity formula is governed.");
  }
  return { kind: "CURRENT_FS", maximum, capacityFormula: "CURRENT_FS" };
}

function capacities(value: unknown, path: string): GovernedSupplyCapacitiesV1 {
  const parsed = record(value, path);
  const keys = Object.keys(parsed);
  if (keys.length === 0) fail("ARRAY_LENGTH", path, "At least one tactical supply capacity is required.");

  const parsedIds = new Map<TacticalSupplyResourceId, unknown>();
  for (const key of keys) parsedIds.set(resourceId(key, `${path}.${key}`), parsed[key]);

  const result: GovernedSupplyCapacitiesV1 = {};
  for (const id of TACTICAL_SUPPLY_RESOURCE_IDS) {
    if (!parsedIds.has(id)) continue;
    result[id] = capacity(parsedIds.get(id), `${path}.${id}`);
  }
  return result;
}

function nullableEnum<T extends string>(
  parsed: Record<string, unknown>,
  field: string,
  path: string,
  values: readonly T[],
): T | null {
  if (!(field in parsed)) return null;
  const value = nonEmptyString(parsed[field], `${path}.${field}`);
  if (!(values as readonly string[]).includes(value)) {
    fail("ENUM_VALUE_UNKNOWN", `${path}.${field}`, `${value} is not a governed ${field} value.`);
  }
  return value as T;
}

function resourceQuantity(value: unknown, path: string): GovernedSupplyResourceQuantityV1 {
  if (value === "SCENARIO_DEFINED") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  fail("RESOURCE_QUANTITY_INVALID", path, "Expected SCENARIO_DEFINED or a positive safe integer.");
}

function reloadRules(value: unknown, path: string): GovernedSupplyReloadRulesV1 {
  const parsed = exactObject(
    value,
    path,
    [
      "overCapacityPolicy",
      "refillToMaximum",
      "refillResource",
      "sourceResource",
      "sourceQuantity",
      "facilityCapability",
      "requiresLanded",
      "economy",
      "resourceQuantity",
      "costPerRoundOfFire",
      "conflictIds",
    ],
    [],
  );
  const hasSourceResource = "sourceResource" in parsed;
  const hasSourceQuantity = "sourceQuantity" in parsed;
  if (hasSourceResource !== hasSourceQuantity) {
    fail("SOURCE_PAIR_REQUIRED", path, "sourceResource and sourceQuantity must be declared together.");
  }
  return {
    overCapacityPolicy: nullableEnum<GovernedSupplyOverCapacityPolicyV1>(
      parsed,
      "overCapacityPolicy",
      path,
      ["RETAIN_AND_BLOCK_LOADING"],
    ),
    refillToMaximum: "refillToMaximum" in parsed
      ? booleanValue(parsed.refillToMaximum, `${path}.refillToMaximum`)
      : null,
    refillResource: "refillResource" in parsed
      ? resourceId(parsed.refillResource, `${path}.refillResource`)
      : null,
    sourceResource: hasSourceResource ? resourceId(parsed.sourceResource, `${path}.sourceResource`) : null,
    sourceQuantity: hasSourceQuantity ? positiveInteger(parsed.sourceQuantity, `${path}.sourceQuantity`) : null,
    facilityCapability: nullableEnum<GovernedSupplyFacilityCapabilityV1>(
      parsed,
      "facilityCapability",
      path,
      ["REARM_AEROSPACE"],
    ),
    requiresLanded: "requiresLanded" in parsed
      ? booleanValue(parsed.requiresLanded, `${path}.requiresLanded`)
      : null,
    economy: nullableEnum<GovernedSupplyActionEconomyV1>(
      parsed,
      "economy",
      path,
      ["STANDARD", "PRIMARY", "INCIDENTAL"],
    ),
    resourceQuantity: "resourceQuantity" in parsed
      ? resourceQuantity(parsed.resourceQuantity, `${path}.resourceQuantity`)
      : null,
    costPerRoundOfFire: "costPerRoundOfFire" in parsed
      ? positiveInteger(parsed.costPerRoundOfFire, `${path}.costPerRoundOfFire`)
      : null,
    conflictIds: "conflictIds" in parsed ? stringArray(parsed.conflictIds, `${path}.conflictIds`) : null,
  };
}

function jsonObject(value: unknown, path: string): JsonObject {
  try {
    return assertJsonObject(value, path);
  } catch (error) {
    if (error instanceof JsonContractError) {
      fail(
        "JSON_OBJECT_REQUIRED",
        error.issues[0]?.path ?? path,
        error.issues[0]?.message ?? "Expected a JSON-compatible object.",
      );
    }
    throw error;
  }
}

export function hydrateGovernedSupplyProfile(
  input: SupplyProfileHydrationInputV1,
): SupplyProfileHydrationResultV1 {
  try {
    const id = nonEmptyString(input.id, "$.id");
    const parameters = exactObject(
      input.parameters,
      "$.parameters",
      ["capacities", "reloadRules", "definition"],
      ["capacities", "reloadRules", "definition"],
    );
    return {
      ok: true,
      profile: {
        schemaVersion: 1,
        id,
        capacities: capacities(parameters.capacities, "$.parameters.capacities"),
        reloadRules: reloadRules(parameters.reloadRules, "$.parameters.reloadRules"),
        definition: jsonObject(parameters.definition, "$.parameters.definition"),
      },
    };
  } catch (error) {
    if (error instanceof SupplyProfileHydrationError) return { ok: false, issues: [error.issue] };
    throw error;
  }
}

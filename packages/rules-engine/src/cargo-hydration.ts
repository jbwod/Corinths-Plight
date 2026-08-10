import {
  JsonContractError,
  TACTICAL_CARGO_RESOURCE_TYPES,
  assertJsonObject,
  type CargoAlternativeModeV1,
  type CargoAlternativeModesCapacityV1,
  type CargoItemTagsAnyV1,
  type CargoLoadingCostV1,
  type CargoMaximumForceStrengthCapacityV1,
  type CargoSlotConversionV1,
  type CargoSlotConversionsCapacityV1,
  type CargoTowRuleV1,
  type GovernedCargoCapacityV1,
  type GovernedCargoLoadingRulesV1,
  type GovernedCargoProfileV1,
  type JsonObject,
  type TacticalCargoResourceType,
} from "../../domain/src";

export type CargoProfileHydrationIssueCodeV1 =
  | "OBJECT_REQUIRED"
  | "UNKNOWN_FIELD"
  | "REQUIRED_FIELD"
  | "STRING_REQUIRED"
  | "ARRAY_REQUIRED"
  | "ARRAY_LENGTH"
  | "DUPLICATE_VALUE"
  | "BOOLEAN_REQUIRED"
  | "INTEGER_REQUIRED"
  | "POSITIVE_INTEGER_REQUIRED"
  | "NON_NEGATIVE_INTEGER_REQUIRED"
  | "UNKNOWN_RESOURCE_TYPE"
  | "UNKNOWN_CAPACITY_SHAPE"
  | "AMBIGUOUS_CAPACITY_SHAPE"
  | "UNKNOWN_CONVERSION_SHAPE"
  | "UNKNOWN_ALTERNATIVE_MODE_SHAPE"
  | "LOADING_COST_MODE_REQUIRED"
  | "AMBIGUOUS_LOADING_COST_MODE"
  | "JSON_OBJECT_REQUIRED";

export interface CargoProfileHydrationIssueV1 {
  code: CargoProfileHydrationIssueCodeV1;
  path: string;
  message: string;
}

export interface CargoProfileHydrationInputV1 {
  id: string;
  parameters: unknown;
}

export type CargoProfileHydrationResultV1 =
  | { ok: true; profile: GovernedCargoProfileV1 }
  | { ok: false; issues: CargoProfileHydrationIssueV1[] };

class CargoHydrationError extends Error {
  constructor(readonly issue: CargoProfileHydrationIssueV1) {
    super(issue.message);
    this.name = "CargoHydrationError";
  }
}

function fail(
  code: CargoProfileHydrationIssueCodeV1,
  path: string,
  message: string,
): never {
  throw new CargoHydrationError({ code, path, message });
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
      fail("UNKNOWN_FIELD", `${path}.${field}`, "Field is not part of the governed cargo contract.");
    }
  }
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      fail("REQUIRED_FIELD", `${path}.${field}`, "Required field is missing.");
    }
  }
  return parsed;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("STRING_REQUIRED", path, "Expected a non-empty string.");
  }
  return value;
}

function stringArray(value: unknown, path: string, requireItem: boolean): string[] {
  if (!Array.isArray(value)) fail("ARRAY_REQUIRED", path, "Expected an array of strings.");
  if (requireItem && value.length === 0) fail("ARRAY_LENGTH", path, "Expected at least one value.");
  const parsed = value.map((candidate, index) => nonEmptyString(candidate, `${path}[${index}]`));
  const seen = new Set<string>();
  for (const [index, candidate] of parsed.entries()) {
    if (seen.has(candidate)) fail("DUPLICATE_VALUE", `${path}[${index}]`, `Duplicate value ${candidate}.`);
    seen.add(candidate);
  }
  return parsed;
}

function tagsAny(value: unknown, path: string): CargoItemTagsAnyV1 {
  return stringArray(value, path, true) as CargoItemTagsAnyV1;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("BOOLEAN_REQUIRED", path, "Expected a boolean.");
  return value;
}

function safeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    fail("INTEGER_REQUIRED", path, "Expected a safe integer.");
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = safeInteger(value, path);
  if (parsed <= 0) fail("POSITIVE_INTEGER_REQUIRED", path, "Expected a positive integer.");
  return parsed;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const parsed = safeInteger(value, path);
  if (parsed < 0) fail("NON_NEGATIVE_INTEGER_REQUIRED", path, "Expected a non-negative integer.");
  return parsed;
}

function resourceType(value: unknown, path: string): TacticalCargoResourceType {
  const parsed = nonEmptyString(value, path);
  if (!(TACTICAL_CARGO_RESOURCE_TYPES as readonly string[]).includes(parsed)) {
    fail("UNKNOWN_RESOURCE_TYPE", path, `Unknown tactical cargo resource type ${parsed}.`);
  }
  return parsed as TacticalCargoResourceType;
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

function conversionSignature(conversion: CargoSlotConversionV1 | CargoAlternativeModeV1): string {
  if (conversion.kind === "RESOURCE_QUANTITY") return `${conversion.kind}:${conversion.resourceType}`;
  return `${conversion.kind}:${[...conversion.itemTagsAny].sort().join("|")}`;
}

function assertUniqueModes(
  values: readonly (CargoSlotConversionV1 | CargoAlternativeModeV1)[],
  path: string,
): void {
  const signatures = new Set<string>();
  for (const [index, value] of values.entries()) {
    const signature = conversionSignature(value);
    if (signatures.has(signature)) {
      fail("DUPLICATE_VALUE", `${path}[${index}]`, "Cargo rule duplicates an earlier semantic match.");
    }
    signatures.add(signature);
  }
}

function parseSlotConversion(value: unknown, path: string): CargoSlotConversionV1 {
  const candidate = record(value, path);
  const hasResource = "resourceType" in candidate || "quantity" in candidate;
  const hasForceStrength = "maximumFS" in candidate;
  const hasTags = "itemTagsAny" in candidate;
  if (Number(hasResource) + Number(hasForceStrength) + Number(hasTags && !hasForceStrength) !== 1) {
    fail("UNKNOWN_CONVERSION_SHAPE", path, "Cargo conversion does not match one governed conversion shape.");
  }
  if (hasResource) {
    const parsed = exactObject(candidate, path, ["resourceType", "quantity", "slotCostQuarters"], ["resourceType", "quantity", "slotCostQuarters"]);
    return {
      kind: "RESOURCE_QUANTITY",
      resourceType: resourceType(parsed.resourceType, `${path}.resourceType`),
      quantity: positiveInteger(parsed.quantity, `${path}.quantity`),
      slotCostQuarters: positiveInteger(parsed.slotCostQuarters, `${path}.slotCostQuarters`),
    };
  }
  if (hasForceStrength) {
    const parsed = exactObject(candidate, path, ["itemTagsAny", "maximumFS", "slotCostQuarters"], ["itemTagsAny", "maximumFS", "slotCostQuarters"]);
    return {
      kind: "MAXIMUM_FORCE_STRENGTH",
      itemTagsAny: tagsAny(parsed.itemTagsAny, `${path}.itemTagsAny`),
      maximumForceStrength: positiveInteger(parsed.maximumFS, `${path}.maximumFS`),
      slotCostQuarters: positiveInteger(parsed.slotCostQuarters, `${path}.slotCostQuarters`),
    };
  }
  if (hasTags) {
    const parsed = exactObject(candidate, path, ["itemTagsAny", "slotCostQuarters"], ["itemTagsAny", "slotCostQuarters"]);
    return {
      kind: "TAGGED_ITEM",
      itemTagsAny: tagsAny(parsed.itemTagsAny, `${path}.itemTagsAny`),
      slotCostQuarters: positiveInteger(parsed.slotCostQuarters, `${path}.slotCostQuarters`),
    };
  }
  fail("UNKNOWN_CONVERSION_SHAPE", path, "Cargo conversion does not match one governed conversion shape.");
}

function parseTow(value: unknown, path: string): CargoTowRuleV1 {
  const parsed = exactObject(value, path, ["count", "itemTagsAny"], ["count", "itemTagsAny"]);
  return {
    count: positiveInteger(parsed.count, `${path}.count`),
    itemTagsAny: tagsAny(parsed.itemTagsAny, `${path}.itemTagsAny`),
  };
}

function parseSlotCapacity(value: unknown, path: string): CargoSlotConversionsCapacityV1 {
  const parsed = exactObject(
    value,
    path,
    ["slotCapacityQuarters", "conversions", "tow"],
    ["slotCapacityQuarters", "conversions"],
  );
  if (!Array.isArray(parsed.conversions)) {
    fail("ARRAY_REQUIRED", `${path}.conversions`, "Expected an array of cargo conversions.");
  }
  if (parsed.conversions.length === 0) {
    fail("ARRAY_LENGTH", `${path}.conversions`, "Expected at least one cargo conversion.");
  }
  const conversions = parsed.conversions.map((conversion, index) =>
    parseSlotConversion(conversion, `${path}.conversions[${index}]`));
  assertUniqueModes(conversions, `${path}.conversions`);
  return {
    kind: "SLOT_CONVERSIONS",
    slotCapacityQuarters: positiveInteger(parsed.slotCapacityQuarters, `${path}.slotCapacityQuarters`),
    conversions,
    mixedLoadingPolicy: "SHARED_SLOT_CAPACITY",
    tow: "tow" in parsed ? parseTow(parsed.tow, `${path}.tow`) : null,
  };
}

function parseMaximumForceStrength(value: unknown, path: string): CargoMaximumForceStrengthCapacityV1 {
  const parsed = exactObject(value, path, ["itemTagsAny", "maximumFS"], ["itemTagsAny", "maximumFS"]);
  return {
    kind: "MAXIMUM_FORCE_STRENGTH",
    itemTagsAny: tagsAny(parsed.itemTagsAny, `${path}.itemTagsAny`),
    maximumForceStrength: positiveInteger(parsed.maximumFS, `${path}.maximumFS`),
    mixedLoadingPolicy: "NOT_APPLICABLE",
    tow: null,
  };
}

function parseAlternativeMode(value: unknown, path: string): CargoAlternativeModeV1 {
  const candidate = record(value, path);
  const hasResource = "resourceType" in candidate || "quantity" in candidate;
  const hasForceStrength = "maximumFS" in candidate || "itemTagsAny" in candidate;
  if (hasResource === hasForceStrength) {
    fail("UNKNOWN_ALTERNATIVE_MODE_SHAPE", path, "Alternative cargo mode does not match one governed mode shape.");
  }
  if (hasResource) {
    const parsed = exactObject(candidate, path, ["resourceType", "quantity"], ["resourceType", "quantity"]);
    return {
      kind: "RESOURCE_QUANTITY",
      resourceType: resourceType(parsed.resourceType, `${path}.resourceType`),
      quantity: positiveInteger(parsed.quantity, `${path}.quantity`),
    };
  }
  const parsed = exactObject(candidate, path, ["itemTagsAny", "maximumFS"], ["itemTagsAny", "maximumFS"]);
  return {
    kind: "MAXIMUM_FORCE_STRENGTH",
    itemTagsAny: tagsAny(parsed.itemTagsAny, `${path}.itemTagsAny`),
    maximumForceStrength: positiveInteger(parsed.maximumFS, `${path}.maximumFS`),
  };
}

function parseAlternativeModes(value: unknown, path: string): CargoAlternativeModesCapacityV1 {
  const parsed = exactObject(value, path, ["alternativeModes"], ["alternativeModes"]);
  if (!Array.isArray(parsed.alternativeModes)) {
    fail("ARRAY_REQUIRED", `${path}.alternativeModes`, "Expected an array of alternative cargo modes.");
  }
  if (parsed.alternativeModes.length < 2) {
    fail("ARRAY_LENGTH", `${path}.alternativeModes`, "Alternative cargo capacity requires at least two modes.");
  }
  const modes = parsed.alternativeModes.map((mode, index) =>
    parseAlternativeMode(mode, `${path}.alternativeModes[${index}]`));
  assertUniqueModes(modes, `${path}.alternativeModes`);
  return {
    kind: "ALTERNATIVE_MODES",
    modes: modes as CargoAlternativeModesCapacityV1["modes"],
    mixedLoadingPolicy: "MUTUALLY_EXCLUSIVE",
    tow: null,
  };
}

function parseCapacity(value: unknown, path: string): GovernedCargoCapacityV1 {
  const candidate = record(value, path);
  const slotShape = "conversions" in candidate || "slotCapacityQuarters" in candidate || "tow" in candidate;
  const alternativeShape = "alternativeModes" in candidate;
  const forceStrengthShape = "maximumFS" in candidate || "itemTagsAny" in candidate;
  const shapeCount = Number(slotShape) + Number(alternativeShape) + Number(forceStrengthShape);
  if (shapeCount === 0) fail("UNKNOWN_CAPACITY_SHAPE", path, "Cargo capacity does not match a governed capacity shape.");
  if (shapeCount > 1) fail("AMBIGUOUS_CAPACITY_SHAPE", path, "Cargo capacity mixes incompatible capacity shapes.");
  if (slotShape) return parseSlotCapacity(candidate, path);
  if (alternativeShape) return parseAlternativeModes(candidate, path);
  return parseMaximumForceStrength(candidate, path);
}

function parseLoading(value: unknown, path: string): GovernedCargoLoadingRulesV1 {
  const parsed = exactObject(
    value,
    path,
    [
      "standardAction",
      "standardActionCostPerSlotQuarters",
      "clearAirdropAlongRoute",
      "requiresPermissionForForeignUnit",
      "conflictIds",
    ],
    [],
  );
  const hasFlatAction = "standardAction" in parsed;
  const hasPerSlotAction = "standardActionCostPerSlotQuarters" in parsed;
  if (!hasFlatAction && !hasPerSlotAction) {
    fail("LOADING_COST_MODE_REQUIRED", path, "Cargo loading must declare its action-cost mode.");
  }
  if (hasFlatAction && hasPerSlotAction) {
    fail("AMBIGUOUS_LOADING_COST_MODE", path, "Cargo loading declares more than one action-cost mode.");
  }
  let cost: CargoLoadingCostV1;
  if (hasFlatAction) {
    const isStandardAction = booleanValue(parsed.standardAction, `${path}.standardAction`);
    if (!isStandardAction) {
      fail("LOADING_COST_MODE_REQUIRED", `${path}.standardAction`, "Standard Action loading must be explicitly enabled.");
    }
    cost = { kind: "STANDARD_ACTION" };
  } else {
    cost = {
      kind: "STANDARD_ACTION_PER_SLOT",
      costPerCargoSlotQuarters: nonNegativeInteger(
        parsed.standardActionCostPerSlotQuarters,
        `${path}.standardActionCostPerSlotQuarters`,
      ),
    };
  }
  return {
    cost,
    clearAirdropAlongRoute: "clearAirdropAlongRoute" in parsed
      ? booleanValue(parsed.clearAirdropAlongRoute, `${path}.clearAirdropAlongRoute`)
      : null,
    requiresPermissionForForeignUnit: "requiresPermissionForForeignUnit" in parsed
      ? booleanValue(parsed.requiresPermissionForForeignUnit, `${path}.requiresPermissionForForeignUnit`)
      : null,
    conflictIds: "conflictIds" in parsed
      ? stringArray(parsed.conflictIds, `${path}.conflictIds`, false)
      : null,
  };
}

/**
 * Strictly hydrates the generated catalogue representation without projecting
 * non-slot capacity into fictional slots or translating Standard Actions into
 * an assumed numeric Speed cost.
 */
export function hydrateGovernedCargoProfile(
  input: CargoProfileHydrationInputV1,
): CargoProfileHydrationResultV1 {
  try {
    const id = nonEmptyString(input.id, "$.id");
    const parameters = exactObject(
      input.parameters,
      "$.parameters",
      ["capacity", "loadingRules", "definition"],
      ["capacity", "loadingRules", "definition"],
    );
    return {
      ok: true,
      profile: {
        schemaVersion: 1,
        id,
        capacity: parseCapacity(parameters.capacity, "$.parameters.capacity"),
        loading: parseLoading(parameters.loadingRules, "$.parameters.loadingRules"),
        definition: jsonObject(parameters.definition, "$.parameters.definition"),
      },
    };
  } catch (error) {
    if (error instanceof CargoHydrationError) return { ok: false, issues: [error.issue] };
    throw error;
  }
}

import {
  JsonContractError,
  assertJsonObject,
  assertJsonValue,
  sha256CanonicalJson,
  type ContractIssue,
  type JsonObject,
  type JsonValue,
} from "./json-contract";

export const RULES_CATALOGUE_SCHEMA_VERSION = 1 as const;
export const RULES_CATALOGUE_CONTENT_TYPE = "application/vnd.corinths-plight.rules-catalogue+json" as const;

export type RuleDefinitionStatusV1 = "active" | "experimental" | "legacy" | "incomplete" | "unspecified";
export type RuleValueStatusV1 = "PUBLISHED" | "BALANCE_REQUIRED" | "SCENARIO_DEFINED" | "NOT_APPLICABLE";
export type RuleImplementationStatusV1 = "IMPLEMENTED" | "PARTIAL" | "CATALOGUE_ONLY";
export type RuleRequisitionStatusV1 = "PUBLISHED" | "BALANCE_REQUIRED" | "NOT_APPLICABLE";
export type RuleAvailabilityStatusV1 = "AVAILABLE" | "BLOCKED" | "DEV_ONLY" | "HIDDEN";

export type RuleDefinitionKindV1 =
  | "UNIT"
  | "WEAPON"
  | "EQUIPMENT"
  | "ACTION"
  | "ORDER"
  | "STRUCTURE"
  | "TERRAIN"
  | "SHIP"
  | "ENEMY"
  | "MOVEMENT_PROFILE"
  | "DURABILITY_PROFILE"
  | "CARGO_PROFILE"
  | "SUPPLY_PROFILE"
  | "DEPLOYMENT_PROFILE"
  | "DEPLOYMENT_METHOD"
  | "TAG"
  | "ABILITY"
  | "STATUS"
  | "SHIP_CAPABILITY";

export type RuleOverlayDefinitionKindV1 =
  | "UNIT"
  | "ENEMY"
  | "WEAPON"
  | "EQUIPMENT"
  | "ACTION"
  | "ORDER"
  | "STATUS"
  | "ABILITY"
  | "STRUCTURE"
  | "SHIP_MODULE";

export type RuleDefinitionGroupV1 =
  | "units"
  | "weapons"
  | "equipment"
  | "actions"
  | "orders"
  | "structures"
  | "terrain"
  | "ships"
  | "enemies"
  | "movementProfiles"
  | "durabilityProfiles"
  | "cargoProfiles"
  | "supplyProfiles"
  | "deploymentProfiles"
  | "deploymentMethods"
  | "tags"
  | "abilities"
  | "statusEffects"
  | "shipCapabilities";

export interface RuleNullableNumberV1 {
  status: RuleValueStatusV1;
  value: number | null;
}

export interface RuleDefinitionReferenceV1 {
  definitionKind: RuleDefinitionKindV1;
  definitionId: string;
}

export interface RuleDefinitionRecordV1 {
  id: string;
  kind: RuleDefinitionKindV1;
  name: string;
  definitionStatus: RuleDefinitionStatusV1;
  sourceId: string | null;
  sourcePath: string | null;
  sourceLocator: string | null;
  notes: string;
  sourcedNumbers: Record<string, RuleNullableNumberV1>;
  references: RuleDefinitionReferenceV1[];
  parameters: JsonObject;
}

export interface RuleRulesetV1 {
  id: string;
  version: string;
  name: string;
  engineVersion: string;
  authorityNotes: string;
}

export interface RuleSourceV1 {
  id: string;
  path: string;
  sha256: string | null;
  authorityRank: number;
  status: "PRIMARY" | "ERRATA" | "COMPANION" | "LEGACY";
  notes: string;
}

export interface RuleConflictV1 {
  id: string;
  category: string;
  summary: string;
  sourceIds: string[];
  disposition: string;
  status:
    | "RESOLVED-MVP"
    | "PROVISIONAL-MVP"
    | "CATALOGUED"
    | "DEFERRED"
    | "BLOCKED"
    | "REJECTED-BY-PROFILE"
    | "RESOLVED_FOR_PROFILE"
    | "OPEN"
    | "INCOMPLETE_DATA";
  notes: string;
}

export interface RuleEngineHandlerV1 {
  id: string;
  kind: RuleOverlayDefinitionKindV1;
  evidence: JsonObject;
}

export interface RuleImplementationOverlayV1 {
  definitionKind: RuleOverlayDefinitionKindV1;
  definitionId: string;
  implementationStatus: RuleImplementationStatusV1;
  requisitionStatus: RuleRequisitionStatusV1;
  availabilityStatus: RuleAvailabilityStatusV1;
  executable: boolean;
  purchasable: boolean;
  handlerId: string | null;
  reasonCode: string | null;
  sourcePath: string;
  sourceLocator: string;
  parameters: JsonObject;
}

export type RuleRelationKindV1 =
  | "UNIT_PROFILE"
  | "UNIT_TAG"
  | "UNIT_ABILITY"
  | "UNIT_WEAPON"
  | "UNIT_EQUIPMENT_SLOT"
  | "EQUIPMENT_ELIGIBILITY"
  | "EQUIPMENT_EFFECT"
  | "SHIP_MODULE_CAPABILITY_GRANT";

export type RuleRelationGroupV1 =
  | "unitProfiles"
  | "unitTags"
  | "unitAbilities"
  | "unitWeapons"
  | "unitEquipmentSlots"
  | "equipmentEligibility"
  | "equipmentEffects"
  | "shipModuleCapabilityGrants";

export interface RuleRelationEndpointV1 {
  definitionKind: RuleDefinitionKindV1;
  definitionId: string;
}

export interface RuleRelationRecordV1 {
  id: string;
  kind: RuleRelationKindV1;
  from: RuleRelationEndpointV1;
  to: RuleRelationEndpointV1 | null;
  ordinal: number | null;
  sourceId: string | null;
  sourcePath: string | null;
  sourceLocator: string | null;
  sourcedNumbers: Record<string, RuleNullableNumberV1>;
  parameters: JsonObject;
}

export type RuleRelationsV1 = Record<RuleRelationGroupV1, RuleRelationRecordV1[]>;

export interface RulesCatalogueContentV1 extends Record<RuleDefinitionGroupV1, RuleDefinitionRecordV1[]> {
  schemaVersion: typeof RULES_CATALOGUE_SCHEMA_VERSION;
  ruleset: RuleRulesetV1;
  sources: RuleSourceV1[];
  conflicts: RuleConflictV1[];
  canonicalUnitIds: string[];
  companionUnitIds: string[];
  handlers: RuleEngineHandlerV1[];
  overlays: RuleImplementationOverlayV1[];
  relations: RuleRelationsV1;
}

export interface RulesCatalogueEnvelopeV1 {
  schemaVersion: typeof RULES_CATALOGUE_SCHEMA_VERSION;
  contentType: typeof RULES_CATALOGUE_CONTENT_TYPE;
  contentHash: string;
  content: RulesCatalogueContentV1;
}

export interface PublicRuleImplementationV1 {
  implementationStatus: RuleImplementationStatusV1;
  requisitionStatus: RuleRequisitionStatusV1;
  availabilityStatus: "AVAILABLE" | "BLOCKED";
  executable: boolean;
  purchasable: boolean;
  reasonCode: string | null;
}

export interface PublicRuleDefinitionV1 {
  id: string;
  kind: RuleDefinitionKindV1;
  name: string;
  definitionStatus: RuleDefinitionStatusV1;
  sourcedNumbers: Record<string, RuleNullableNumberV1>;
  references: RuleDefinitionReferenceV1[];
  parameters: JsonObject;
  implementation: PublicRuleImplementationV1 | null;
}

export interface PublicRuleRelationV1 {
  id: string;
  kind: RuleRelationKindV1;
  from: RuleRelationEndpointV1;
  to: RuleRelationEndpointV1 | null;
  ordinal: number | null;
  sourcedNumbers: Record<string, RuleNullableNumberV1>;
  parameters: JsonObject;
}

export interface PublicRulesCatalogueDtoV1 extends Record<RuleDefinitionGroupV1, PublicRuleDefinitionV1[]> {
  schemaVersion: typeof RULES_CATALOGUE_SCHEMA_VERSION;
  contentHash: string;
  ruleset: Pick<RuleRulesetV1, "id" | "version" | "name" | "engineVersion">;
  canonicalUnitIds: string[];
  companionUnitIds: string[];
  relations: Record<RuleRelationGroupV1, PublicRuleRelationV1[]>;
}

export class RulesCatalogueContractError extends JsonContractError {
  constructor(issue: ContractIssue | readonly ContractIssue[]) {
    super(issue);
    this.name = "RulesCatalogueContractError";
  }
}

const definitionGroups: Readonly<Record<RuleDefinitionGroupV1, RuleDefinitionKindV1>> = {
  units: "UNIT",
  weapons: "WEAPON",
  equipment: "EQUIPMENT",
  actions: "ACTION",
  orders: "ORDER",
  structures: "STRUCTURE",
  terrain: "TERRAIN",
  ships: "SHIP",
  enemies: "ENEMY",
  movementProfiles: "MOVEMENT_PROFILE",
  durabilityProfiles: "DURABILITY_PROFILE",
  cargoProfiles: "CARGO_PROFILE",
  supplyProfiles: "SUPPLY_PROFILE",
  deploymentProfiles: "DEPLOYMENT_PROFILE",
  deploymentMethods: "DEPLOYMENT_METHOD",
  tags: "TAG",
  abilities: "ABILITY",
  statusEffects: "STATUS",
  shipCapabilities: "SHIP_CAPABILITY",
};

const relationGroups: Readonly<Record<RuleRelationGroupV1, RuleRelationKindV1>> = {
  unitProfiles: "UNIT_PROFILE",
  unitTags: "UNIT_TAG",
  unitAbilities: "UNIT_ABILITY",
  unitWeapons: "UNIT_WEAPON",
  unitEquipmentSlots: "UNIT_EQUIPMENT_SLOT",
  equipmentEligibility: "EQUIPMENT_ELIGIBILITY",
  equipmentEffects: "EQUIPMENT_EFFECT",
  shipModuleCapabilityGrants: "SHIP_MODULE_CAPABILITY_GRANT",
};

const definitionKinds = Object.values(definitionGroups);
const overlayKinds: RuleOverlayDefinitionKindV1[] = [
  "UNIT", "ENEMY", "WEAPON", "EQUIPMENT", "ACTION", "ORDER", "STATUS", "ABILITY", "STRUCTURE", "SHIP_MODULE",
];

function fail(code: string, path: string, message: string): never {
  throw new RulesCatalogueContractError({ code, path, message });
}

function object(value: unknown, path: string, keys: readonly string[]): JsonObject {
  let parsed: JsonObject;
  try {
    parsed = assertJsonObject(value, path);
  } catch (error) {
    if (error instanceof JsonContractError) throw new RulesCatalogueContractError(error.issues);
    throw error;
  }
  const allowed = new Set(keys);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, "Field is not part of this contract version.");
  }
  for (const key of keys) {
    if (!(key in parsed)) fail("REQUIRED_FIELD", `${path}.${key}`, "Required field is missing.");
  }
  return parsed;
}

function string(value: JsonValue, path: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") fail("STRING_REQUIRED", path, "Expected a string.");
  if (value.length === 0 || value.length > 4096) fail("STRING_LENGTH", path, "String must contain 1 to 4096 characters.");
  return value;
}

function text(value: JsonValue, path: string): string {
  if (typeof value !== "string") fail("STRING_REQUIRED", path, "Expected a string.");
  if (value.length > 65_536) fail("STRING_LENGTH", path, "Text exceeds the contract limit.");
  return value;
}

function boolean(value: JsonValue, path: string): boolean {
  if (typeof value !== "boolean") fail("BOOLEAN_REQUIRED", path, "Expected a boolean.");
  return value;
}

function integer(value: JsonValue, path: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail("INTEGER_REQUIRED", path, "Expected a safe integer.");
  return value;
}

function enumeration<T extends string>(value: JsonValue, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail("ENUM_INVALID", path, `Expected one of: ${values.join(", ")}.`);
  }
  return value as T;
}

function array<T>(value: JsonValue, path: string, parse: (item: JsonValue, path: string) => T): T[] {
  if (!Array.isArray(value)) fail("ARRAY_REQUIRED", path, "Expected an array.");
  if (value.length > 20_000) fail("ARRAY_LENGTH", path, "Array exceeds the contract limit.");
  return value.map((item, index) => parse(item, `${path}[${index}]`));
}

function uniqueStrings(value: JsonValue, path: string): string[] {
  const values = array(value, path, (item, itemPath) => string(item, itemPath) as string);
  if (new Set(values).size !== values.length) fail("DUPLICATE_VALUE", path, "Values must be unique.");
  return values;
}

function extension(value: JsonValue, path: string): JsonObject {
  try {
    return assertJsonObject(value, path);
  } catch (error) {
    if (error instanceof JsonContractError) throw new RulesCatalogueContractError(error.issues);
    throw error;
  }
}

function parseNullableNumber(value: JsonValue, path: string): RuleNullableNumberV1 {
  const parsed = object(value, path, ["status", "value"]);
  const status = enumeration(parsed.status, `${path}.status`, ["PUBLISHED", "BALANCE_REQUIRED", "SCENARIO_DEFINED", "NOT_APPLICABLE"]);
  const numericValue = parsed.value === null ? null : Number(parsed.value);
  if (numericValue !== null && !Number.isFinite(numericValue)) fail("NUMBER_REQUIRED", `${path}.value`, "Expected a finite number or null.");
  if (status === "PUBLISHED" && numericValue === null) fail("PUBLISHED_VALUE_MISSING", path, "Published values cannot be null.");
  if (status !== "PUBLISHED" && numericValue !== null) fail("UNKNOWN_VALUE_NOT_NULL", path, `${status} values must remain null.`);
  return { status, value: numericValue };
}

function parseSourcedNumbers(value: JsonValue, path: string): Record<string, RuleNullableNumberV1> {
  const parsed = extension(value, path);
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) fail("VALUE_KEY_INVALID", `${path}.${key}`, "Value keys must be camel-case identifiers.");
    return [key, parseNullableNumber(item, `${path}.${key}`)];
  }));
}

function parseReference(value: JsonValue, path: string): RuleDefinitionReferenceV1 {
  const parsed = object(value, path, ["definitionKind", "definitionId"]);
  return {
    definitionKind: enumeration(parsed.definitionKind, `${path}.definitionKind`, definitionKinds),
    definitionId: string(parsed.definitionId, `${path}.definitionId`) as string,
  };
}

function parseDefinition(value: JsonValue, path: string, expectedKind: RuleDefinitionKindV1): RuleDefinitionRecordV1 {
  const parsed = object(value, path, [
    "id", "kind", "name", "definitionStatus", "sourceId", "sourcePath", "sourceLocator", "notes",
    "sourcedNumbers", "references", "parameters",
  ]);
  const sourceId = string(parsed.sourceId, `${path}.sourceId`, true);
  const sourcePath = string(parsed.sourcePath, `${path}.sourcePath`, true);
  if ((sourceId === null) === (sourcePath === null)) {
    fail("SOURCE_EXCLUSIVE", path, "Exactly one of sourceId or sourcePath must be present.");
  }
  const kind = enumeration(parsed.kind, `${path}.kind`, definitionKinds);
  if (kind !== expectedKind) fail("DEFINITION_KIND_MISMATCH", `${path}.kind`, `Expected ${expectedKind}.`);
  return {
    id: string(parsed.id, `${path}.id`) as string,
    kind,
    name: string(parsed.name, `${path}.name`) as string,
    definitionStatus: enumeration(parsed.definitionStatus, `${path}.definitionStatus`, ["active", "experimental", "legacy", "incomplete", "unspecified"]),
    sourceId,
    sourcePath,
    sourceLocator: string(parsed.sourceLocator, `${path}.sourceLocator`, true),
    notes: text(parsed.notes, `${path}.notes`),
    sourcedNumbers: parseSourcedNumbers(parsed.sourcedNumbers, `${path}.sourcedNumbers`),
    references: array(parsed.references, `${path}.references`, parseReference),
    parameters: extension(parsed.parameters, `${path}.parameters`),
  };
}

function parseRuleset(value: JsonValue, path: string): RuleRulesetV1 {
  const parsed = object(value, path, ["id", "version", "name", "engineVersion", "authorityNotes"]);
  return {
    id: string(parsed.id, `${path}.id`) as string,
    version: string(parsed.version, `${path}.version`) as string,
    name: string(parsed.name, `${path}.name`) as string,
    engineVersion: string(parsed.engineVersion, `${path}.engineVersion`) as string,
    authorityNotes: text(parsed.authorityNotes, `${path}.authorityNotes`),
  };
}

function parseSource(value: JsonValue, path: string): RuleSourceV1 {
  const parsed = object(value, path, ["id", "path", "sha256", "authorityRank", "status", "notes"]);
  const sha256 = string(parsed.sha256, `${path}.sha256`, true);
  if (sha256 !== null && !/^[a-f0-9]{64}$/.test(sha256)) fail("HASH_INVALID", `${path}.sha256`, "Expected a lower-case SHA-256 hex digest.");
  const authorityRank = integer(parsed.authorityRank, `${path}.authorityRank`) as number;
  if (authorityRank < 0) fail("INTEGER_RANGE", `${path}.authorityRank`, "Authority rank cannot be negative.");
  return {
    id: string(parsed.id, `${path}.id`) as string,
    path: string(parsed.path, `${path}.path`) as string,
    sha256,
    authorityRank,
    status: enumeration(parsed.status, `${path}.status`, ["PRIMARY", "ERRATA", "COMPANION", "LEGACY"]),
    notes: text(parsed.notes, `${path}.notes`),
  };
}

function parseConflict(value: JsonValue, path: string): RuleConflictV1 {
  const parsed = object(value, path, ["id", "category", "summary", "sourceIds", "disposition", "status", "notes"]);
  return {
    id: string(parsed.id, `${path}.id`) as string,
    category: string(parsed.category, `${path}.category`) as string,
    summary: text(parsed.summary, `${path}.summary`),
    sourceIds: uniqueStrings(parsed.sourceIds, `${path}.sourceIds`),
    disposition: text(parsed.disposition, `${path}.disposition`),
    status: enumeration(parsed.status, `${path}.status`, [
      "RESOLVED-MVP", "PROVISIONAL-MVP", "CATALOGUED", "DEFERRED", "BLOCKED", "REJECTED-BY-PROFILE",
      "RESOLVED_FOR_PROFILE", "OPEN", "INCOMPLETE_DATA",
    ]),
    notes: text(parsed.notes, `${path}.notes`),
  };
}

function parseHandler(value: JsonValue, path: string): RuleEngineHandlerV1 {
  const parsed = object(value, path, ["id", "kind", "evidence"]);
  return {
    id: string(parsed.id, `${path}.id`) as string,
    kind: enumeration(parsed.kind, `${path}.kind`, overlayKinds),
    evidence: extension(parsed.evidence, `${path}.evidence`),
  };
}

function parseOverlay(value: JsonValue, path: string): RuleImplementationOverlayV1 {
  const parsed = object(value, path, [
    "definitionKind", "definitionId", "implementationStatus", "requisitionStatus", "availabilityStatus",
    "executable", "purchasable", "handlerId", "reasonCode", "sourcePath", "sourceLocator", "parameters",
  ]);
  return {
    definitionKind: enumeration(parsed.definitionKind, `${path}.definitionKind`, overlayKinds),
    definitionId: string(parsed.definitionId, `${path}.definitionId`) as string,
    implementationStatus: enumeration(parsed.implementationStatus, `${path}.implementationStatus`, ["IMPLEMENTED", "PARTIAL", "CATALOGUE_ONLY"]),
    requisitionStatus: enumeration(parsed.requisitionStatus, `${path}.requisitionStatus`, ["PUBLISHED", "BALANCE_REQUIRED", "NOT_APPLICABLE"]),
    availabilityStatus: enumeration(parsed.availabilityStatus, `${path}.availabilityStatus`, ["AVAILABLE", "BLOCKED", "DEV_ONLY", "HIDDEN"]),
    executable: boolean(parsed.executable, `${path}.executable`),
    purchasable: boolean(parsed.purchasable, `${path}.purchasable`),
    handlerId: string(parsed.handlerId, `${path}.handlerId`, true),
    reasonCode: string(parsed.reasonCode, `${path}.reasonCode`, true),
    sourcePath: string(parsed.sourcePath, `${path}.sourcePath`) as string,
    sourceLocator: string(parsed.sourceLocator, `${path}.sourceLocator`) as string,
    parameters: extension(parsed.parameters, `${path}.parameters`),
  };
}

function parseEndpoint(value: JsonValue, path: string): RuleRelationEndpointV1 {
  const parsed = object(value, path, ["definitionKind", "definitionId"]);
  return {
    definitionKind: enumeration(parsed.definitionKind, `${path}.definitionKind`, definitionKinds),
    definitionId: string(parsed.definitionId, `${path}.definitionId`) as string,
  };
}

function parseRelation(value: JsonValue, path: string, expectedKind: RuleRelationKindV1): RuleRelationRecordV1 {
  const parsed = object(value, path, [
    "id", "kind", "from", "to", "ordinal", "sourceId", "sourcePath", "sourceLocator", "sourcedNumbers", "parameters",
  ]);
  const kind = enumeration(parsed.kind, `${path}.kind`, Object.values(relationGroups));
  if (kind !== expectedKind) fail("RELATION_KIND_MISMATCH", `${path}.kind`, `Expected ${expectedKind}.`);
  const sourceId = string(parsed.sourceId, `${path}.sourceId`, true);
  const sourcePath = string(parsed.sourcePath, `${path}.sourcePath`, true);
  if (sourceId !== null && sourcePath !== null) fail("SOURCE_EXCLUSIVE", path, "A relation cannot specify both sourceId and sourcePath.");
  return {
    id: string(parsed.id, `${path}.id`) as string,
    kind,
    from: parseEndpoint(parsed.from, `${path}.from`),
    to: parsed.to === null ? null : parseEndpoint(parsed.to, `${path}.to`),
    ordinal: integer(parsed.ordinal, `${path}.ordinal`, true),
    sourceId,
    sourcePath,
    sourceLocator: string(parsed.sourceLocator, `${path}.sourceLocator`, true),
    sourcedNumbers: parseSourcedNumbers(parsed.sourcedNumbers, `${path}.sourcedNumbers`),
    parameters: extension(parsed.parameters, `${path}.parameters`),
  };
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string, path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) fail("DUPLICATE_ID", path, `Duplicate identifier: ${id}.`);
    seen.add(id);
  }
}

function overlayTargetKind(kind: RuleOverlayDefinitionKindV1): RuleDefinitionKindV1 {
  return kind === "SHIP_MODULE" ? "EQUIPMENT" : kind;
}

function validateContent(content: RulesCatalogueContentV1): void {
  const sources = new Map(content.sources.map((source) => [source.id, source]));
  assertUnique(content.sources, (source) => source.id, "$.content.sources");
  assertUnique(content.conflicts, (conflict) => conflict.id, "$.content.conflicts");
  for (const conflict of content.conflicts) {
    for (const sourceId of conflict.sourceIds) if (!sources.has(sourceId)) fail("SOURCE_REFERENCE_MISSING", `$.content.conflicts.${conflict.id}`, `Unknown source ${sourceId}.`);
  }

  const definitions = Object.keys(definitionGroups).flatMap((group) => content[group as RuleDefinitionGroupV1]);
  assertUnique(definitions, (definition) => definition.id, "$.content.definitions");
  const definitionIndex = new Map(definitions.map((definition) => [definition.id, definition]));
  for (const definition of definitions) {
    if (definition.sourceId !== null && !sources.has(definition.sourceId)) fail("SOURCE_REFERENCE_MISSING", `$.content.${definition.id}.sourceId`, `Unknown source ${definition.sourceId}.`);
    assertUnique(definition.references, (reference) => `${reference.definitionKind}:${reference.definitionId}`, `$.content.${definition.id}.references`);
    for (const reference of definition.references) {
      const target = definitionIndex.get(reference.definitionId);
      if (!target || target.kind !== reference.definitionKind) fail("DEFINITION_REFERENCE_MISSING", `$.content.${definition.id}.references`, `Unknown ${reference.definitionKind} ${reference.definitionId}.`);
    }
  }

  const unitIds = new Set(content.units.map((unit) => unit.id));
  for (const id of [...content.canonicalUnitIds, ...content.companionUnitIds]) if (!unitIds.has(id)) fail("UNIT_REFERENCE_MISSING", "$.content.canonicalUnitIds", `Unknown unit ${id}.`);
  const classified = [...content.canonicalUnitIds, ...content.companionUnitIds];
  if (new Set(classified).size !== classified.length || classified.length !== unitIds.size) fail("UNIT_CLASSIFICATION_INVALID", "$.content", "Canonical and companion unit IDs must be disjoint and classify every unit exactly once.");

  const handlers = new Map(content.handlers.map((handler) => [handler.id, handler]));
  assertUnique(content.handlers, (handler) => handler.id, "$.content.handlers");
  assertUnique(content.overlays, (overlay) => `${overlay.definitionKind}:${overlay.definitionId}`, "$.content.overlays");
  for (const overlay of content.overlays) {
    const definition = definitionIndex.get(overlay.definitionId);
    if (!definition || definition.kind !== overlayTargetKind(overlay.definitionKind)) fail("OVERLAY_TARGET_MISSING", "$.content.overlays", `Overlay target ${overlay.definitionKind}:${overlay.definitionId} does not exist.`);
    const handler = overlay.handlerId === null ? undefined : handlers.get(overlay.handlerId);
    if (overlay.handlerId !== null && (!handler || handler.kind !== overlay.definitionKind)) fail("HANDLER_REFERENCE_MISSING", "$.content.overlays", `Handler ${overlay.handlerId} does not support ${overlay.definitionKind}.`);
    if (overlay.executable && (overlay.implementationStatus === "CATALOGUE_ONLY" || !handler)) fail("EXECUTABLE_HANDLER_REQUIRED", "$.content.overlays", "Executable definitions require a registered matching handler and cannot be catalogue-only.");
    if (overlay.purchasable && (overlay.availabilityStatus !== "AVAILABLE" || overlay.requisitionStatus !== "PUBLISHED" || !["UNIT", "EQUIPMENT", "SHIP_MODULE"].includes(overlay.definitionKind))) fail("PURCHASABLE_INVALID", "$.content.overlays", "Purchasable definitions must be available, published units or equipment.");
  }

  const relations = Object.keys(relationGroups).flatMap((group) => content.relations[group as RuleRelationGroupV1]);
  assertUnique(relations, (relation) => relation.id, "$.content.relations");
  for (const relation of relations) {
    if (relation.sourceId !== null && !sources.has(relation.sourceId)) fail("SOURCE_REFERENCE_MISSING", `$.content.relations.${relation.id}`, `Unknown source ${relation.sourceId}.`);
    for (const endpoint of relation.to === null ? [relation.from] : [relation.from, relation.to]) {
      const target = definitionIndex.get(endpoint.definitionId);
      if (!target || target.kind !== endpoint.definitionKind) fail("RELATION_TARGET_MISSING", `$.content.relations.${relation.id}`, `Unknown ${endpoint.definitionKind} ${endpoint.definitionId}.`);
    }
  }
}

export function parseRulesCatalogueContent(value: unknown): RulesCatalogueContentV1 {
  const keys = [
    "schemaVersion", "ruleset", "sources", "conflicts", "canonicalUnitIds", "companionUnitIds",
    ...Object.keys(definitionGroups), "handlers", "overlays", "relations",
  ];
  const parsed = object(value, "$.content", keys);
  if (parsed.schemaVersion !== RULES_CATALOGUE_SCHEMA_VERSION) fail("SCHEMA_VERSION_UNSUPPORTED", "$.content.schemaVersion", "Unsupported rules catalogue schema version.");
  const content = {
    schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION,
    ruleset: parseRuleset(parsed.ruleset, "$.content.ruleset"),
    sources: array(parsed.sources, "$.content.sources", parseSource),
    conflicts: array(parsed.conflicts, "$.content.conflicts", parseConflict),
    canonicalUnitIds: uniqueStrings(parsed.canonicalUnitIds, "$.content.canonicalUnitIds"),
    companionUnitIds: uniqueStrings(parsed.companionUnitIds, "$.content.companionUnitIds"),
    ...Object.fromEntries(Object.entries(definitionGroups).map(([group, kind]) => [
      group,
      array(parsed[group], `$.content.${group}`, (item, path) => parseDefinition(item, path, kind)),
    ])),
    handlers: array(parsed.handlers, "$.content.handlers", parseHandler),
    overlays: array(parsed.overlays, "$.content.overlays", parseOverlay),
    relations: Object.fromEntries(Object.entries(relationGroups).map(([group, kind]) => [
      group,
      array(object(parsed.relations, "$.content.relations", Object.keys(relationGroups))[group], `$.content.relations.${group}`, (item, path) => parseRelation(item, path, kind)),
    ])),
  } as RulesCatalogueContentV1;
  validateContent(content);
  return content;
}

export async function rulesCatalogueContentHash(content: unknown): Promise<string> {
  return sha256CanonicalJson(parseRulesCatalogueContent(content));
}

export async function createRulesCatalogueEnvelope(content: unknown): Promise<RulesCatalogueEnvelopeV1> {
  const parsed = parseRulesCatalogueContent(content);
  return {
    schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION,
    contentType: RULES_CATALOGUE_CONTENT_TYPE,
    contentHash: await sha256CanonicalJson(parsed),
    content: parsed,
  };
}

export async function parseRulesCatalogueEnvelope(value: unknown): Promise<RulesCatalogueEnvelopeV1> {
  const parsed = object(value, "$", ["schemaVersion", "contentType", "contentHash", "content"]);
  if (parsed.schemaVersion !== RULES_CATALOGUE_SCHEMA_VERSION) fail("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion", "Unsupported rules catalogue envelope version.");
  if (parsed.contentType !== RULES_CATALOGUE_CONTENT_TYPE) fail("CONTENT_TYPE_INVALID", "$.contentType", "Unexpected rules catalogue content type.");
  const contentHash = string(parsed.contentHash, "$.contentHash") as string;
  if (!/^[a-f0-9]{64}$/.test(contentHash)) fail("HASH_INVALID", "$.contentHash", "Expected a lower-case SHA-256 hex digest.");
  const content = parseRulesCatalogueContent(parsed.content);
  const actualHash = await sha256CanonicalJson(content);
  if (actualHash !== contentHash) fail("CONTENT_HASH_MISMATCH", "$.contentHash", "Catalogue content does not match its SHA-256 digest.");
  return { schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION, contentType: RULES_CATALOGUE_CONTENT_TYPE, contentHash, content };
}

function redactInternal(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redactInternal);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "handlerId" && key !== "handlerIds")
      .map(([key, item]) => [key, redactInternal(item)]));
  }
  return value;
}

export function projectPublicRulesCatalogue(envelope: RulesCatalogueEnvelopeV1): PublicRulesCatalogueDtoV1 {
  const overlayIndex = new Map(envelope.content.overlays.map((overlay) => [`${overlayTargetKind(overlay.definitionKind)}:${overlay.definitionId}`, overlay]));
  const governedKinds = new Set<RuleDefinitionKindV1>(["UNIT", "ENEMY", "WEAPON", "EQUIPMENT", "ACTION", "ORDER", "STATUS", "ABILITY", "STRUCTURE"]);
  const visibleIds = new Set<string>();
  const groups = Object.fromEntries(Object.keys(definitionGroups).map((groupName) => {
    const group = groupName as RuleDefinitionGroupV1;
    const definitions = envelope.content[group].flatMap((definition): PublicRuleDefinitionV1[] => {
      const overlay = overlayIndex.get(`${definition.kind}:${definition.id}`);
      if (governedKinds.has(definition.kind) && (!overlay || overlay.availabilityStatus === "HIDDEN" || overlay.availabilityStatus === "DEV_ONLY")) return [];
      visibleIds.add(definition.id);
      return [{
        id: definition.id,
        kind: definition.kind,
        name: definition.name,
        definitionStatus: definition.definitionStatus,
        sourcedNumbers: definition.sourcedNumbers,
        references: definition.references,
        parameters: redactInternal(definition.parameters) as JsonObject,
        implementation: overlay ? {
          implementationStatus: overlay.implementationStatus,
          requisitionStatus: overlay.requisitionStatus,
          availabilityStatus: overlay.availabilityStatus as "AVAILABLE" | "BLOCKED",
          executable: overlay.executable,
          purchasable: overlay.purchasable,
          reasonCode: overlay.reasonCode,
        } : null,
      }];
    });
    return [group, definitions];
  })) as Record<RuleDefinitionGroupV1, PublicRuleDefinitionV1[]>;

  const relations = Object.fromEntries(Object.keys(relationGroups).map((groupName) => {
    const group = groupName as RuleRelationGroupV1;
    return [group, envelope.content.relations[group].filter((relation) =>
      visibleIds.has(relation.from.definitionId) && (relation.to === null || visibleIds.has(relation.to.definitionId)),
    ).map((relation): PublicRuleRelationV1 => ({
      id: relation.id,
      kind: relation.kind,
      from: relation.from,
      to: relation.to,
      ordinal: relation.ordinal,
      sourcedNumbers: relation.sourcedNumbers,
      parameters: redactInternal(relation.parameters) as JsonObject,
    }))];
  })) as Record<RuleRelationGroupV1, PublicRuleRelationV1[]>;

  return {
    schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION,
    contentHash: envelope.contentHash,
    ruleset: {
      id: envelope.content.ruleset.id,
      version: envelope.content.ruleset.version,
      name: envelope.content.ruleset.name,
      engineVersion: envelope.content.ruleset.engineVersion,
    },
    canonicalUnitIds: envelope.content.canonicalUnitIds.filter((id) => visibleIds.has(id)),
    companionUnitIds: envelope.content.companionUnitIds.filter((id) => visibleIds.has(id)),
    ...groups,
    relations,
  };
}

export function assertRulesCatalogueJson(value: unknown): JsonValue {
  try {
    return assertJsonValue(value);
  } catch (error) {
    if (error instanceof JsonContractError) throw new RulesCatalogueContractError(error.issues);
    throw error;
  }
}

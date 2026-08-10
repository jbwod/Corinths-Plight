import { parseArgs } from "node:util";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  assertJsonValue,
  canonicalJson,
  compareUnicodeCodePoints,
  sha256Hex,
  type JsonObject,
  type JsonValue,
} from "../packages/domain/src/json-contract";
import {
  RULES_CATALOGUE_SCHEMA_VERSION,
  createRulesCatalogueEnvelope,
  parseRulesCatalogueEnvelope,
  type RuleDefinitionKindV1,
  type RuleDefinitionRecordV1,
  type RuleDefinitionStatusV1,
  type RuleEngineHandlerV1,
  type RuleImplementationOverlayV1,
  type RuleNullableNumberV1,
  type RuleRelationEndpointV1,
  type RuleRelationRecordV1,
  type RuleSourceV1,
  type RulesCatalogueContentV1,
  type RulesCatalogueEnvelopeV1,
} from "../packages/domain/src/rules-catalogue-contract";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalCataloguePath = resolve(repositoryRoot, "rules/catalogue/v5-core-curated@2/catalogue.json");
const generatedCataloguePath = resolve(repositoryRoot, "packages/rules-engine/src/generated/v5-core-curated-2.ts");
const publishedRulesetId = "ruleset-v5-core-curated-2";
const publishedRulesetVersion = "v5-core-curated@2";

export const legacyRulesSeedFiles = [
  "seeds/v5-core-curated.sql",
  "seeds/v5-phase2-combined-arms.sql",
  "seeds/v5-equipment-deployment.sql",
] as const;

/**
 * This is the complete set of rules/profile/relation tables populated by the
 * three production-safe rules seeds. It exists only to bootstrap the first
 * canonical publication; generated artefacts never read D1 at runtime.
 */
export const legacyCatalogueTables = [
  "rulesets",
  "ruleset_sources",
  "rule_conflicts",
  "unit_class_definitions",
  "weapon_definitions",
  "equipment_definitions",
  "action_definitions",
  "order_type_definitions",
  "structure_definitions",
  "terrain_definitions",
  "ship_class_definitions",
  "enemy_definitions",
  "movement_profile_definitions",
  "durability_profile_definitions",
  "cargo_profile_definitions",
  "supply_profile_definitions",
  "deployment_profile_definitions",
  "tag_definitions",
  "ability_definitions",
  "status_effect_definitions",
  "unit_definition_profiles",
  "unit_definition_tags",
  "unit_definition_abilities",
  "unit_definition_weapons",
  "unit_equipment_slot_definitions",
  "equipment_eligibility_rules",
  "ruleset_implementation_overlays",
  "ship_capability_definitions",
  "ship_module_capability_grants",
  "equipment_effect_definitions",
  "deployment_method_definitions",
] as const;

type LegacyCatalogueTable = (typeof legacyCatalogueTables)[number];

interface TableColumn {
  name: string;
  primaryKeyPosition: number;
}

export interface LegacyCatalogueSnapshot extends JsonObject {
  schemaVersion: 1;
  source: "FINAL_PRODUCTION_RULES_SEEDS";
  seedFiles: string[];
  tables: Record<LegacyCatalogueTable, JsonObject[]>;
}

export interface CanonicalConflictRegisterRecord extends JsonObject {
  id: string;
  title: string;
  section: string;
  bodyMarkdown: string;
  fields: JsonObject;
}

export const legacyDefinitionTables = {
  units: "unit_class_definitions",
  weapons: "weapon_definitions",
  equipment: "equipment_definitions",
  actions: "action_definitions",
  orders: "order_type_definitions",
  structures: "structure_definitions",
  terrain: "terrain_definitions",
  ships: "ship_class_definitions",
  enemies: "enemy_definitions",
} as const satisfies Record<string, LegacyCatalogueTable>;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function compareJsonScalars(left: JsonValue | undefined, right: JsonValue | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return compareUnicodeCodePoints(canonicalJson(left), canonicalJson(right));
}

function compareRows(columns: readonly string[], left: JsonObject, right: JsonObject): number {
  for (const column of columns) {
    const difference = compareJsonScalars(left[column], right[column]);
    if (difference !== 0) return difference;
  }
  return compareUnicodeCodePoints(canonicalJson(left), canonicalJson(right));
}

function normalizeSqlValue(column: string, value: SQLInputValue): JsonValue {
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (typeof value === "bigint") {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) {
      throw new Error(`${column} contains an integer outside JSON's safe range.`);
    }
    return numeric;
  }
  if (typeof value === "string" && column.endsWith("_json")) {
    try {
      return assertJsonValue(JSON.parse(value), `$.${column}`);
    } catch (error) {
      throw new Error(`${column} does not contain valid JSON.`, { cause: error });
    }
  }
  return assertJsonValue(value, `$.${column}`);
}

function tableColumns(database: DatabaseSync, table: string): TableColumn[] {
  const statement = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return (statement.all() as Array<Record<string, SQLInputValue>>).map((row) => ({
    name: String(row.name),
    primaryKeyPosition: Number(row.pk),
  }));
}

function tableRows(database: DatabaseSync, table: LegacyCatalogueTable): JsonObject[] {
  const columns = tableColumns(database, table);
  const primaryKey = columns
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((left, right) => left.primaryKeyPosition - right.primaryKeyPosition)
    .map((column) => column.name);
  const fallbackOrder = columns.map((column) => column.name).sort(compareUnicodeCodePoints);
  const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Array<Record<string, SQLInputValue>>;
  return rows
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, normalizeSqlValue(column, value)]),
    ))
    .sort((left, right) => compareRows(primaryKey.length > 0 ? primaryKey : fallbackOrder, left, right));
}

export async function readLegacyCatalogueSnapshot(root = repositoryRoot): Promise<LegacyCatalogueSnapshot> {
  const database = new DatabaseSync(":memory:");
  try {
    const migrationDirectory = resolve(root, "migrations");
    const migrations = (await readdir(migrationDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort(compareUnicodeCodePoints);
    for (const migration of migrations) {
      database.exec(await readFile(resolve(migrationDirectory, migration), "utf8"));
    }
    for (const seed of legacyRulesSeedFiles) {
      database.exec(await readFile(resolve(root, seed), "utf8"));
    }

    const tables = Object.fromEntries(
      legacyCatalogueTables.map((table) => [table, tableRows(database, table)]),
    ) as Record<LegacyCatalogueTable, JsonObject[]>;
    return {
      schemaVersion: 1,
      source: "FINAL_PRODUCTION_RULES_SEEDS",
      seedFiles: [...legacyRulesSeedFiles],
      tables,
    };
  } finally {
    database.close();
  }
}

export function legacyTopLevelDefinitionCount(snapshot: LegacyCatalogueSnapshot): number {
  return Object.values(legacyDefinitionTables)
    .reduce((total, table) => total + snapshot.tables[table].length, 0);
}

export function legacyDefinitionCounts(snapshot: LegacyCatalogueSnapshot): Record<keyof typeof legacyDefinitionTables, number> {
  return Object.fromEntries(
    Object.entries(legacyDefinitionTables).map(([kind, table]) => [kind, snapshot.tables[table].length]),
  ) as Record<keyof typeof legacyDefinitionTables, number>;
}

export function legacyUnitPublicationSplit(snapshot: LegacyCatalogueSnapshot): {
  canonicalUnitIds: string[];
  companionUnitIds: string[];
} {
  const canonicalUnitIds: string[] = [];
  const companionUnitIds: string[] = [];
  for (const unit of snapshot.tables.unit_class_definitions) {
    const id = String(unit.id);
    if (unit.definition_status === "active") canonicalUnitIds.push(id);
    else if (unit.definition_status === "legacy") companionUnitIds.push(id);
    else throw new Error(`${id} has no canonical/companion publication classification.`);
  }
  return { canonicalUnitIds, companionUnitIds };
}

function parseConflictFields(bodyMarkdown: string): JsonObject {
  const fields: JsonObject = {};
  for (const line of bodyMarkdown.split("\n")) {
    const match = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, label, value] = match;
    if (fields[label] !== undefined) {
      throw new Error(`Conflict register repeats the ${label} field within one record.`);
    }
    fields[label] = value;
  }
  return fields;
}

/**
 * Parses the canonical Markdown audit without interpreting or rewriting its
 * evidence. `bodyMarkdown` is retained byte-for-byte except for separator
 * blank lines, while `fields` supplies a deterministic structural index.
 */
export async function readCanonicalConflictRegister(root = repositoryRoot): Promise<CanonicalConflictRegisterRecord[]> {
  const markdown = await readFile(resolve(root, "docs/RULE_CONFLICTS.md"), "utf8");
  const records: CanonicalConflictRegisterRecord[] = [];
  let section = "";
  let current: { id: string; title: string; section: string } | undefined;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!current) return;
    while (bodyLines.at(-1) === "") bodyLines.pop();
    const bodyMarkdown = bodyLines.join("\n");
    records.push({ ...current, bodyMarkdown, fields: parseConflictFields(bodyMarkdown) });
    current = undefined;
    bodyLines = [];
  };

  for (const line of markdown.split("\n")) {
    const conflictHeading = /^### (RC-[A-Z0-9-]+) — (.+)$/.exec(line);
    if (conflictHeading) {
      flush();
      current = { id: conflictHeading[1], title: conflictHeading[2], section };
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      section = line.slice(3);
      continue;
    }
    if (current) bodyLines.push(line);
  }
  flush();

  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Conflict register repeats ${record.id}.`);
    ids.add(record.id);
  }
  return records;
}

export function referencedConflictIds(snapshot: LegacyCatalogueSnapshot): string[] {
  const ids = new Set<string>();
  const visit = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "conflictIds" && Array.isArray(child)) {
        for (const id of child) {
          if (typeof id !== "string") throw new Error("A conflictIds entry is not a string.");
          ids.add(id);
        }
      }
      visit(child);
    }
  };
  visit(snapshot.tables);
  return [...ids].sort(compareUnicodeCodePoints);
}

export async function legacySourceHashMismatches(
  snapshot: LegacyCatalogueSnapshot,
  root = repositoryRoot,
): Promise<Array<{ id: string; expected: string; actual: string }>> {
  const mismatches: Array<{ id: string; expected: string; actual: string }> = [];
  for (const source of snapshot.tables.ruleset_sources) {
    const expected = source.source_sha256;
    if (typeof expected !== "string") continue;
    const actual = await sha256Hex(await readFile(resolve(root, String(source.source_path))));
    if (actual !== expected) mismatches.push({ id: String(source.id), expected, actual });
  }
  return mismatches;
}

function requiredString(row: JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string.`);
  return value;
}

function optionalString(row: JsonObject, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${key} must be a string or null.`);
  return value;
}

function requiredNumber(row: JsonObject, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number.`);
  return value;
}

function optionalNumber(row: JsonObject, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number or null.`);
  return value;
}

function jsonObject(row: JsonObject, key: string): JsonObject {
  const value = row[key];
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${key} must be a JSON object.`);
  return value;
}

function published(value: number): RuleNullableNumberV1 {
  return { status: "PUBLISHED", value };
}

function unpublished(status: Exclude<RuleNullableNumberV1["status"], "PUBLISHED">): RuleNullableNumberV1 {
  return { status, value: null };
}

function nullableNumber(value: number | null, missingStatus: Exclude<RuleNullableNumberV1["status"], "PUBLISHED">): RuleNullableNumberV1 {
  return value === null ? unpublished(missingStatus) : published(value);
}

interface DefinitionSource {
  sourceId: string | null;
  sourcePath: string | null;
  sourceLocator: string | null;
}

function sourceIdForLabel(label: string): string | undefined {
  const mappings: Array<[RegExp, string]> = [
    [/^(?:V5(?:\b|\s*\/)|rules\/Meta - Core Rules \(V5\)\.md)/, "source-v5-core"],
    [/^(?:Classes(?:\.html)?|rules\/Classes\.html)/, "source-classes"],
    [/^(?:The Store|Store|rules\/The Store)/, "source-store"],
    [/^(?:Build sheet|Build and Supply|rules\/Build and Supply)/, "source-build"],
    [/^(?:Actions|legacy action sheet|rules\/Actions)/, "source-actions"],
    [/^(?:Orders|rules\/Order Formatting)/, "source-orders"],
    [/^phase2-forces\.md/, "source-phase2-forces-plan"],
    [/^gameplan\.md/, "source-product-brief"],
  ];
  return mappings.find(([pattern]) => pattern.test(label))?.[1];
}

function definitionSource(pathOrCitation: string, locator: string | null = null): DefinitionSource {
  const sourceId = sourceIdForLabel(pathOrCitation);
  return sourceId
    ? { sourceId, sourcePath: null, sourceLocator: locator ?? pathOrCitation }
    : { sourceId: null, sourcePath: pathOrCitation, sourceLocator: locator };
}

function definitionStatus(row: JsonObject): RuleDefinitionStatusV1 {
  const value = row.definition_status;
  if (value === "active" || value === "experimental" || value === "legacy" || value === "incomplete") return value;
  if (value === undefined) return "unspecified";
  throw new Error(`Unknown definition status: ${String(value)}.`);
}

function baseDefinition(
  row: JsonObject,
  kind: RuleDefinitionKindV1,
  source: DefinitionSource,
  sourcedNumbers: Record<string, RuleNullableNumberV1>,
  parameters: JsonObject,
): RuleDefinitionRecordV1 {
  return {
    id: requiredString(row, "id"),
    kind,
    name: requiredString(row, "name"),
    definitionStatus: definitionStatus(row),
    ...source,
    notes: typeof row.notes === "string" ? row.notes : "",
    sourcedNumbers,
    references: [],
    parameters,
  };
}

function overlayFor(snapshot: LegacyCatalogueSnapshot, definitionId: string): JsonObject | undefined {
  return snapshot.tables.ruleset_implementation_overlays.find((row) => row.definition_id === definitionId);
}

function requisitionValue(row: JsonObject, snapshot: LegacyCatalogueSnapshot, field: string): RuleNullableNumberV1 {
  const value = optionalNumber(row, field);
  const status = overlayFor(snapshot, requiredString(row, "id"))?.requisition_status;
  if (status === "PUBLISHED") {
    if (value === null) throw new Error(`${row.id} has a published requisition status but no numeric value.`);
    return published(value);
  }
  if (status === "BALANCE_REQUIRED") return unpublished("BALANCE_REQUIRED");
  if (status === "NOT_APPLICABLE" || status === undefined) return unpublished("NOT_APPLICABLE");
  throw new Error(`${row.id} has an unknown requisition status.`);
}

function supportingDefinition(
  row: JsonObject,
  kind: RuleDefinitionKindV1,
  sourcedNumbers: Record<string, RuleNullableNumberV1>,
  parameters: JsonObject,
): RuleDefinitionRecordV1 {
  const sourcePath = requiredString(row, "source_path");
  return baseDefinition(
    row,
    kind,
    definitionSource(sourcePath, requiredString(row, "source_locator")),
    sourcedNumbers,
    parameters,
  );
}

const foundationUnitExecution: Record<string, JsonObject> = {
  "unit-artillery": {
    capacity: 1,
    tags: ["GROUND", "PERSONNEL", "ARTILLERY", "INDIRECT", "DEPLOYABLE"],
    allowedOrders: ["HOLD", "ADVANCE"],
    allowedActions: ["ATTACK", "DEPLOY", "PACK_UP", "RELOAD"],
  },
  "unit-combat-medic": {
    capacity: 1,
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "MEDICAL"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["HEAL", "RELOAD", "LOAD", "UNLOAD"],
  },
  "unit-engineers": {
    capacity: 1,
    tags: ["GROUND", "PERSONNEL", "ENGINEER", "BUILDER", "REPAIR"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["REPAIR", "LOAD", "UNLOAD"],
  },
  "unit-infantry-squad": {
    capacity: 1,
    tags: ["GROUND", "PERSONNEL", "INFANTRY", "DIG_IN"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "LOAD", "UNLOAD"],
  },
  "unit-light-vehicle": {
    capacity: 1,
    tags: ["GROUND", "VEHICLE", "SUB_SYSTEM", "EVASIVE"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK", "LOAD", "UNLOAD"],
  },
  "unit-main-battle-tank": {
    capacity: 1,
    tags: ["GROUND", "VEHICLE", "SUB_SYSTEM", "REAR_WEAK_SPOT"],
    allowedOrders: ["HOLD", "ADVANCE", "RUSH"],
    allowedActions: ["ATTACK"],
  },
};

function buildDefinitionGroups(snapshot: LegacyCatalogueSnapshot): Record<string, RuleDefinitionRecordV1[]> {
  const units = snapshot.tables.unit_class_definitions.map((row) => {
    const definition = jsonObject(row, "definition_json");
    return baseDefinition(row, "UNIT", definitionSource(requiredString(row, "source")), {
      maxHealth: published(requiredNumber(row, "max_health")),
      armor: published(requiredNumber(row, "armor")),
      defense: published(requiredNumber(row, "defense")),
      speedQuarters: published(requiredNumber(row, "speed_quarters")),
      sensorRange: unpublished("SCENARIO_DEFINED"),
      requisitionCost: requisitionValue(row, snapshot, "requisition_cost"),
    }, {
      category: requiredString(row, "category"),
      healthModel: requiredString(row, "health_model"),
      legacyProjectionSensorRange: requiredNumber(row, "sensor_range"),
      execution: foundationUnitExecution[requiredString(row, "id")] ?? null,
      definition,
    });
  });

  const weapons = snapshot.tables.weapon_definitions.map((row) => baseDefinition(
    row,
    "WEAPON",
    definitionSource(requiredString(row, "source")),
    {
      damageDiceCount: published(requiredNumber(row, "damage_dice_count")),
      damageDieSides: published(requiredNumber(row, "damage_die_sides")),
      damageModifier: published(requiredNumber(row, "damage_modifier")),
      armorPiercing: published(requiredNumber(row, "armor_piercing")),
      rangeHexes: published(requiredNumber(row, "range_hexes")),
      ammoCapacity: nullableNumber(optionalNumber(row, "ammo_capacity"), "NOT_APPLICABLE"),
      cooldownRounds: nullableNumber(optionalNumber(row, "cooldown_rounds"), "NOT_APPLICABLE"),
    },
    { indirect: row.indirect === 1, definition: jsonObject(row, "definition_json") },
  ));

  const equipment = snapshot.tables.equipment_definitions.map((row) => baseDefinition(
    row,
    "EQUIPMENT",
    definitionSource(requiredString(row, "source")),
    { requisitionCost: requisitionValue(row, snapshot, "requisition_cost") },
    {
      category: requiredString(row, "category"),
      slotType: requiredString(row, "slot_type"),
      consumable: row.consumable === 1,
      definition: jsonObject(row, "definition_json"),
    },
  ));

  const actions = snapshot.tables.action_definitions.map((row) => baseDefinition(
    row,
    "ACTION",
    definitionSource(requiredString(row, "source")),
    { speedCostQuarters: published(requiredNumber(row, "speed_cost_quarters")) },
    { economy: requiredString(row, "economy"), definition: jsonObject(row, "definition_json") },
  ));

  const orders = snapshot.tables.order_type_definitions.map((row) => baseDefinition(
    row,
    "ORDER",
    definitionSource(requiredString(row, "source")),
    {},
    { definition: jsonObject(row, "definition_json") },
  ));

  const structures = snapshot.tables.structure_definitions.map((row) => baseDefinition(
    row,
    "STRUCTURE",
    definitionSource(requiredString(row, "source")),
    {
      buildPoints: nullableNumber(optionalNumber(row, "build_points"), "BALANCE_REQUIRED"),
      health: nullableNumber(optionalNumber(row, "health"), "BALANCE_REQUIRED"),
    },
    { buildCost: jsonObject(row, "build_cost_json"), definition: jsonObject(row, "definition_json") },
  ));

  const terrain = snapshot.tables.terrain_definitions.map((row) => baseDefinition(
    row,
    "TERRAIN",
    definitionSource(requiredString(row, "source")),
    {
      movementCostQuarters: published(requiredNumber(row, "movement_cost_quarters")),
      capacity: published(requiredNumber(row, "capacity")),
    },
    { blocksLos: row.blocks_los === 1, definition: jsonObject(row, "definition_json") },
  ));

  const ships = snapshot.tables.ship_class_definitions.map((row) => baseDefinition(
    row,
    "SHIP",
    definitionSource(requiredString(row, "source")),
    {
      health: published(requiredNumber(row, "health")),
      armor: published(requiredNumber(row, "armor")),
      speed: published(requiredNumber(row, "speed")),
      externalSlots: published(requiredNumber(row, "external_slots")),
      internalSlots: published(requiredNumber(row, "internal_slots")),
      cargoCapacity: published(requiredNumber(row, "cargo_capacity")),
      atmoFuel: nullableNumber(optionalNumber(row, "atmo_fuel"), "BALANCE_REQUIRED"),
    },
    { definition: jsonObject(row, "definition_json") },
  ));

  const enemies = snapshot.tables.enemy_definitions.map((row) => baseDefinition(
    row,
    "ENEMY",
    definitionSource(requiredString(row, "source")),
    {},
    {
      factionId: requiredString(row, "faction_id"),
      doctrine: jsonObject(row, "doctrine_json"),
      unitDefinition: jsonObject(row, "unit_definition_json"),
    },
  ));

  const movementProfiles = snapshot.tables.movement_profile_definitions.map((row) => supportingDefinition(row, "MOVEMENT_PROFILE", {}, {
    domain: requiredString(row, "domain"),
    usesFacing: row.uses_facing === 1,
    allowsHostilePassage: row.allows_hostile_passage === 1,
    requiresFlightPath: row.requires_flight_path === 1,
    canLand: row.can_land === 1,
    canEnterOrbit: row.can_enter_orbit === 1,
    terrainCosts: jsonObject(row, "terrain_costs_json"),
    definition: jsonObject(row, "definition_json"),
  }));
  const durabilityProfiles = snapshot.tables.durability_profile_definitions.map((row) => supportingDefinition(row, "DURABILITY_PROFILE", {}, {
    model: requiredString(row, "model"),
    outputScalesWithCurrent: row.output_scales_with_current === 1,
    supportsSubsystems: row.supports_subsystems === 1,
    definition: jsonObject(row, "definition_json"),
  }));
  const cargoProfiles = snapshot.tables.cargo_profile_definitions.map((row) => supportingDefinition(row, "CARGO_PROFILE", {}, {
    capacity: jsonObject(row, "capacity_json"),
    loadingRules: jsonObject(row, "loading_rules_json"),
    definition: jsonObject(row, "definition_json"),
  }));
  const supplyProfiles = snapshot.tables.supply_profile_definitions.map((row) => supportingDefinition(row, "SUPPLY_PROFILE", {}, {
    capacities: jsonObject(row, "capacities_json"),
    reloadRules: jsonObject(row, "reload_rules_json"),
    definition: jsonObject(row, "definition_json"),
  }));
  const deploymentProfiles = snapshot.tables.deployment_profile_definitions.map((row) => supportingDefinition(row, "DEPLOYMENT_PROFILE", {}, {
    requirements: jsonObject(row, "requirements_json"),
    dropModes: row.drop_modes_json!,
    definition: jsonObject(row, "definition_json"),
  }));
  const deploymentMethods = snapshot.tables.deployment_method_definitions.map((row) => supportingDefinition(row, "DEPLOYMENT_METHOD", {}, {
    implementationStatus: requiredString(row, "implementation_status"),
    requirements: jsonObject(row, "requirements_json"),
  }));
  const tags = snapshot.tables.tag_definitions.map((row) => supportingDefinition(row, "TAG", {}, {
    definition: jsonObject(row, "definition_json"),
  }));
  const abilities = snapshot.tables.ability_definitions.map((row) => supportingDefinition(row, "ABILITY", {}, {
    actionDefinitionId: optionalString(row, "action_definition_id"),
    targetSelector: jsonObject(row, "target_selector_json"),
    effect: jsonObject(row, "effect_json"),
    definition: jsonObject(row, "definition_json"),
  }));
  const statusEffects = snapshot.tables.status_effect_definitions.map((row) => supportingDefinition(row, "STATUS", {}, {
    stackingRule: requiredString(row, "stacking_rule"),
    visibility: requiredString(row, "visibility"),
    definition: jsonObject(row, "definition_json"),
  }));
  const shipCapabilities = snapshot.tables.ship_capability_definitions.map((row) => supportingDefinition(row, "SHIP_CAPABILITY", {}, {
    valueKind: requiredString(row, "value_kind"),
    definition: jsonObject(row, "definition_json"),
  }));

  const groups: Record<string, RuleDefinitionRecordV1[]> = {
    units, weapons, equipment, actions, orders, structures, terrain, ships, enemies,
    movementProfiles, durabilityProfiles, cargoProfiles, supplyProfiles, deploymentProfiles,
    deploymentMethods, tags, abilities, statusEffects, shipCapabilities,
  };
  const kindById = new Map<string, RuleDefinitionKindV1>();
  for (const definition of Object.values(groups).flat()) {
    if (kindById.has(definition.id)) throw new Error(`Definition ID ${definition.id} is not globally unique.`);
    kindById.set(definition.id, definition.kind);
  }
  const collectReferences = (value: JsonValue, references: Map<string, RuleDefinitionKindV1>): void => {
    if (Array.isArray(value)) return value.forEach((item) => collectReferences(item, references));
    if (value !== null && typeof value === "object") {
      Object.values(value).forEach((item) => collectReferences(item, references));
      return;
    }
    if (typeof value !== "string") return;
    const kind = kindById.get(value);
    if (kind) references.set(value, kind);
  };
  for (const definition of Object.values(groups).flat()) {
    const references = new Map<string, RuleDefinitionKindV1>();
    collectReferences(definition.parameters, references);
    references.delete(definition.id);
    definition.references = [...references]
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([definitionId, definitionKind]) => ({ definitionKind, definitionId }));
  }
  return groups;
}

function canonicalConflictStatus(sourceStatus: string): RulesCatalogueContentV1["conflicts"][number]["status"] {
  const match = /`(RESOLVED-MVP|PROVISIONAL-MVP|CATALOGUED|DEFERRED|BLOCKED|REJECTED-BY-PROFILE)`/.exec(sourceStatus);
  if (!match) throw new Error(`Canonical conflict status is missing or unknown: ${sourceStatus}`);
  return match[1] as RulesCatalogueContentV1["conflicts"][number]["status"];
}

function conflictSourceIds(text: string): string[] {
  const candidates = [
    [/(?:`V5|\bV5\b)/, "source-v5-core"],
    [/(?:`Classes|Classes\.html)/, "source-classes"],
    [/(?:`Store|Store entries|Store values|Store item|Store section)/, "source-store"],
    [/(?:`Build|Build Points|Build sheet)/, "source-build"],
    [/(?:`Actions|legacy action sheet)/, "source-actions"],
    [/(?:`Orders|Order Formatting)/, "source-orders"],
  ] as const;
  return candidates
    .filter(([pattern]) => pattern.test(text))
    .map(([, sourceId]) => sourceId)
    .sort(compareUnicodeCodePoints);
}

function buildConflicts(
  snapshot: LegacyCatalogueSnapshot,
  canonical: CanonicalConflictRegisterRecord[],
): RulesCatalogueContentV1["conflicts"] {
  const canonicalRecords = canonical.map((record) => {
    const sourceStatus = typeof record.fields.Status === "string" ? record.fields.Status : "";
    const disposition = typeof record.fields.Disposition === "string"
      ? record.fields.Disposition
      : typeof record.fields["MVP disposition"] === "string"
        ? record.fields["MVP disposition"]
        : "See preserved canonical record.";
    return {
      id: record.id,
      category: record.id.split("-")[1] ?? "RULE",
      summary: record.title,
      sourceIds: conflictSourceIds(record.bodyMarkdown),
      disposition,
      status: canonicalConflictStatus(sourceStatus),
      notes: `Canonical section: ${record.section}\nCanonical status: ${sourceStatus}\n\n${record.bodyMarkdown}`,
    } satisfies RulesCatalogueContentV1["conflicts"][number];
  });
  const legacyRecords = snapshot.tables.rule_conflicts.map((row) => {
    const sourceEvidence = row.sources_json;
    const evidenceText = canonicalJson(sourceEvidence);
    const status = requiredString(row, "status") as RulesCatalogueContentV1["conflicts"][number]["status"];
    return {
      id: requiredString(row, "id"),
      category: requiredString(row, "category"),
      summary: requiredString(row, "summary"),
      sourceIds: conflictSourceIds(evidenceText),
      disposition: requiredString(row, "disposition"),
      status,
      notes: `Legacy compatibility record retained from v5-core-curated@1.\nSource evidence: ${evidenceText}${typeof row.notes === "string" && row.notes.length > 0 ? `\n${row.notes}` : ""}`,
    } satisfies RulesCatalogueContentV1["conflicts"][number];
  });
  return [...canonicalRecords, ...legacyRecords]
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
}

const foundationUnitIds = [
  "unit-artillery",
  "unit-combat-medic",
  "unit-engineers",
  "unit-infantry-squad",
  "unit-light-vehicle",
  "unit-main-battle-tank",
] as const;

const foundationOrderIds = [
  "order-advance",
  "order-hold",
  "order-rush",
] as const;

const foundationActionIds = [
  "action-attack",
  "action-deploy-platform",
  "action-first-aid",
  "action-load-cargo",
  "action-pack-platform",
  "action-repair",
  "action-reload",
  "action-unload-cargo",
] as const;

const implementationCorrections: Record<string, Partial<RuleImplementationOverlayV1> & { explanation: string }> = {
  "UNIT:unit-artillery": {
    implementationStatus: "PARTIAL", executable: true, handlerId: "foundation-generated-unit-class",
    reasonCode: "EXPERIMENTAL_DAMAGE_PROFILE",
    parameters: {
      implementedSubset: ["FS", "MOVEMENT", "DEPLOY_PACK_STATE", "EXPERIMENTAL_ATTACK"],
      missing: ["BOMBARDMENT", "FUNNEL", "ANTI_ORBITAL"],
    },
    explanation: "Artillery can now deploy and pack with the V5 half-Speed Standard Action while its control actions remain deferred.",
  },
  "UNIT:unit-engineers": {
    implementationStatus: "PARTIAL", executable: true, handlerId: "foundation-generated-unit-class",
    reasonCode: "MISSING_CANONICAL_PRICE",
    parameters: {
      implementedSubset: ["FS", "MOVEMENT", "REPAIR_ACTION"],
      missing: ["CONSTRUCTION_PROJECTS"],
    },
    explanation: "The V5 Engineer Repair vertical now restores one vehicle Hit or one subsystem for one Small Supply.",
  },
  "UNIT:unit-heavy-air-transport": {
    implementationStatus: "PARTIAL", executable: false, handlerId: null,
    reasonCode: "CP_201_CATALOGUE_HANDLER_CUTOVER_PENDING",
    explanation: "The final seed claimed transport execution before a generated-catalogue campaign handler existed.",
  },
  "UNIT:unit-infantry-fighting-vehicle": {
    implementationStatus: "PARTIAL", executable: false, handlerId: null,
    reasonCode: "CP_201_CATALOGUE_HANDLER_CUTOVER_PENDING",
    explanation: "The final seed claimed transport execution before a generated-catalogue campaign handler existed.",
  },
  "UNIT:unit-logi-truck": {
    implementationStatus: "PARTIAL", executable: false, handlerId: null,
    reasonCode: "CP_201_CATALOGUE_HANDLER_CUTOVER_PENDING",
    explanation: "The final seed claimed transport execution before a generated-catalogue campaign handler existed.",
  },
  "UNIT:unit-vtol": {
    implementationStatus: "PARTIAL", executable: false, handlerId: null,
    reasonCode: "CP_201_CATALOGUE_HANDLER_CUTOVER_PENDING",
    explanation: "The final seed claimed transport execution before a generated-catalogue campaign handler existed.",
  },
  "EQUIPMENT:equipment-drone-operator": {
    implementationStatus: "PARTIAL", availabilityStatus: "BLOCKED", executable: false, purchasable: false, handlerId: null,
    reasonCode: "MISSING_VISIBILITY_STATE_EFFECT",
    explanation: "Deploy Drone currently emits an event/cooldown but does not apply its advertised visibility effect.",
  },
  "EQUIPMENT:equipment-vehicle-optics": {
    implementationStatus: "PARTIAL", availabilityStatus: "BLOCKED", executable: false, purchasable: false, handlerId: null,
    reasonCode: "UNAUTHORISED_SENSOR_MODIFIER_AND_MISSING_VISIBILITY_STATE_EFFECT",
    explanation: "The passive sensor modifier is not source-authorised and Scan does not apply its advertised visibility effect.",
  },
};

function buildHandlers(): RuleEngineHandlerV1[] {
  return [
    {
      id: "foundation-generated-unit-class",
      kind: "UNIT",
      evidence: {
        sourcePath: "packages/rules-engine/src/tactical-unit-catalogue.ts",
        resolverPath: "packages/rules-engine/src/resolver.ts",
        definitionIds: [...foundationUnitIds],
      },
    },
    {
      id: "foundation-order-handler",
      kind: "ORDER",
      evidence: {
        sourcePath: "packages/rules-engine/src/catalogue.ts",
        resolverPath: "packages/rules-engine/src/resolver.ts",
        definitionIds: [...foundationOrderIds],
      },
    },
    {
      id: "foundation-action-handler",
      kind: "ACTION",
      evidence: {
        sourcePath: "packages/rules-engine/src/catalogue.ts",
        resolverPath: "packages/rules-engine/src/resolver.ts",
        definitionIds: [...foundationActionIds],
      },
    },
    {
      id: "equipment-effect-flak-vests",
      kind: "EQUIPMENT",
      evidence: {
        sourcePath: "packages/rules-engine/src/equipment.ts",
        definitionId: "equipment-flak-vests",
        effectTypes: ["STAT_SET_IF"],
      },
    },
    {
      id: "equipment-effect-light-at",
      kind: "EQUIPMENT",
      evidence: {
        sourcePath: "packages/rules-engine/src/equipment.ts",
        definitionId: "equipment-light-at",
        effectTypes: ["WEAPON_GRANT", "AMMO_GRANT"],
      },
    },
  ];
}

function handlerForOverlay(kind: string, id: string): string | null {
  if (kind === "UNIT" && foundationUnitIds.includes(id as (typeof foundationUnitIds)[number])) return "foundation-generated-unit-class";
  if (kind === "EQUIPMENT" && id === "equipment-flak-vests") return "equipment-effect-flak-vests";
  if (kind === "EQUIPMENT" && id === "equipment-light-at") return "equipment-effect-light-at";
  return null;
}

function buildOverlays(snapshot: LegacyCatalogueSnapshot): RuleImplementationOverlayV1[] {
  const seeded = snapshot.tables.ruleset_implementation_overlays.map((row) => {
    const definitionKind = requiredString(row, "definition_kind") as RuleImplementationOverlayV1["definitionKind"];
    const definitionId = requiredString(row, "definition_id");
    const key = `${definitionKind}:${definitionId}`;
    const seedOverlay = {
      implementationStatus: requiredString(row, "implementation_status"),
      requisitionStatus: requiredString(row, "requisition_status"),
      availabilityStatus: requiredString(row, "availability_status"),
      executable: row.executable === 1,
      purchasable: row.purchasable === 1,
      reasonCode: optionalString(row, "reason_code"),
    };
    const correction = implementationCorrections[key];
    const base: RuleImplementationOverlayV1 = {
      definitionKind,
      definitionId,
      implementationStatus: seedOverlay.implementationStatus as RuleImplementationOverlayV1["implementationStatus"],
      requisitionStatus: seedOverlay.requisitionStatus as RuleImplementationOverlayV1["requisitionStatus"],
      availabilityStatus: seedOverlay.availabilityStatus as RuleImplementationOverlayV1["availabilityStatus"],
      executable: seedOverlay.executable,
      purchasable: seedOverlay.purchasable,
      handlerId: handlerForOverlay(definitionKind, definitionId),
      reasonCode: seedOverlay.reasonCode,
      sourcePath: requiredString(row, "source_path"),
      sourceLocator: requiredString(row, "source_locator"),
      parameters: jsonObject(row, "overlay_json"),
    };
    if (!correction) return base;
    const { explanation, ...changes } = correction;
    return {
      ...base,
      ...changes,
      parameters: {
        ...base.parameters,
        ...(changes.parameters ?? {}),
        publicationCorrection: {
          reason: explanation,
          seedOverlay,
        },
      },
    };
  });
  const foundationGrammar: RuleImplementationOverlayV1[] = [
    ...foundationOrderIds.map((definitionId): RuleImplementationOverlayV1 => ({
      definitionKind: "ORDER",
      definitionId,
      implementationStatus: "PARTIAL",
      requisitionStatus: "NOT_APPLICABLE",
      availabilityStatus: "AVAILABLE",
      executable: true,
      purchasable: false,
      handlerId: "foundation-order-handler",
      reasonCode: "FOUNDATION_PARTIAL_HANDLER",
      sourcePath: "packages/rules-engine/src/catalogue.ts",
      sourceLocator: "orderTypes",
      parameters: {
        runtimeEvidence: "Existing deterministic resolver grammar; later mechanics remain separately gated.",
      },
    })),
    ...foundationActionIds.map((definitionId): RuleImplementationOverlayV1 => ({
      definitionKind: "ACTION",
      definitionId,
      implementationStatus: "PARTIAL",
      requisitionStatus: "NOT_APPLICABLE",
      availabilityStatus: "AVAILABLE",
      executable: true,
      purchasable: false,
      handlerId: "foundation-action-handler",
      reasonCode: "FOUNDATION_PARTIAL_HANDLER",
      sourcePath: "packages/rules-engine/src/catalogue.ts",
      sourceLocator: "actionProfiles",
      parameters: {
        runtimeEvidence: "Existing deterministic resolver grammar; visibility-only no-op actions are excluded.",
      },
    })),
  ];
  return [...seeded, ...foundationGrammar].sort((left, right) =>
    compareUnicodeCodePoints(left.definitionKind, right.definitionKind)
      || compareUnicodeCodePoints(left.definitionId, right.definitionId),
  );
}

function relationSource(row: JsonObject): Pick<RuleRelationRecordV1, "sourceId" | "sourcePath" | "sourceLocator"> {
  if (typeof row.source_path !== "string") return { sourceId: null, sourcePath: null, sourceLocator: null };
  return definitionSource(row.source_path, typeof row.source_locator === "string" ? row.source_locator : null);
}

function endpoint(definitionKind: RuleDefinitionKindV1, definitionId: string): RuleRelationEndpointV1 {
  return { definitionKind, definitionId };
}

function relation(
  id: string,
  kind: RuleRelationRecordV1["kind"],
  from: RuleRelationEndpointV1,
  to: RuleRelationEndpointV1 | null,
  ordinal: number | null,
  row: JsonObject,
  sourcedNumbers: Record<string, RuleNullableNumberV1>,
  parameters: JsonObject,
): RuleRelationRecordV1 {
  return { id, kind, from, to, ordinal, ...relationSource(row), sourcedNumbers, parameters };
}

function actionDefinitionId(action: JsonValue): string | undefined {
  if (typeof action !== "string") return undefined;
  if (action === "LOAD") return "action-load-cargo";
  if (action === "UNLOAD") return "action-unload-cargo";
  return `action-${action.toLowerCase().replaceAll("_", "-")}`;
}

function buildRelations(snapshot: LegacyCatalogueSnapshot): RulesCatalogueContentV1["relations"] {
  const profileKinds = [
    ["movement_profile_id", "MOVEMENT_PROFILE", "movement"],
    ["durability_profile_id", "DURABILITY_PROFILE", "durability"],
    ["cargo_profile_id", "CARGO_PROFILE", "cargo"],
    ["supply_profile_id", "SUPPLY_PROFILE", "supply"],
    ["deployment_profile_id", "DEPLOYMENT_PROFILE", "deployment"],
  ] as const;
  const unitProfiles = snapshot.tables.unit_definition_profiles.flatMap((row) => profileKinds.flatMap(([field, kind, suffix]) => {
    const profileId = row[field];
    if (typeof profileId !== "string") return [];
    const unitId = requiredString(row, "unit_definition_id");
    return [relation(
      `unit-profile:${unitId}:${suffix}`,
      "UNIT_PROFILE",
      endpoint("UNIT", unitId),
      endpoint(kind, profileId),
      null,
      row,
      {},
      { profile: jsonObject(row, "profile_json"), profileRole: suffix },
    )];
  }));
  const unitTags = snapshot.tables.unit_definition_tags.map((row) => {
    const unitId = requiredString(row, "unit_definition_id");
    const tagId = requiredString(row, "tag_id");
    return relation(`unit-tag:${unitId}:${tagId}`, "UNIT_TAG", endpoint("UNIT", unitId), endpoint("TAG", tagId), null, row, {}, {});
  });
  const unitAbilities = snapshot.tables.unit_definition_abilities.map((row) => {
    const unitId = requiredString(row, "unit_definition_id");
    const abilityId = requiredString(row, "ability_id");
    const sourceKind = requiredString(row, "source_kind");
    return relation(`unit-ability:${unitId}:${abilityId}:${sourceKind.toLowerCase()}`, "UNIT_ABILITY", endpoint("UNIT", unitId), endpoint("ABILITY", abilityId), null, row, {}, { sourceKind });
  });
  const unitWeapons = snapshot.tables.unit_definition_weapons.map((row) => {
    const unitId = requiredString(row, "unit_definition_id");
    const weaponId = requiredString(row, "weapon_definition_id");
    const mountRole = requiredString(row, "mount_role");
    const mountIndex = requiredNumber(row, "mount_index");
    return relation(`unit-weapon:${unitId}:${mountRole.toLowerCase()}:${mountIndex}`, "UNIT_WEAPON", endpoint("UNIT", unitId), endpoint("WEAPON", weaponId), mountIndex, row, {}, { mountRole, state: jsonObject(row, "state_json") });
  });
  const unitEquipmentSlots = snapshot.tables.unit_equipment_slot_definitions.map((row) => {
    const unitId = requiredString(row, "unit_definition_id");
    const slotType = requiredString(row, "slot_type");
    return relation(`unit-equipment-slot:${unitId}:${slotType.toLowerCase()}`, "UNIT_EQUIPMENT_SLOT", endpoint("UNIT", unitId), null, null, row, { slotCount: published(requiredNumber(row, "slot_count")) }, { slotType, eligibility: jsonObject(row, "eligibility_json") });
  });
  const equipmentEligibility = snapshot.tables.equipment_eligibility_rules.map((row) => {
    const equipmentId = requiredString(row, "equipment_definition_id");
    return relation(`equipment-eligibility:${equipmentId}`, "EQUIPMENT_ELIGIBILITY", endpoint("EQUIPMENT", equipmentId), null, null, row, {
      maximumEquipped: nullableNumber(optionalNumber(row, "maximum_equipped"), "NOT_APPLICABLE"),
    }, {
      requiredTagsAll: row.required_tags_all_json!,
      requiredTagsAny: row.required_tags_any_json!,
      forbiddenTags: row.forbidden_tags_json!,
      allowedUnitDefinitions: row.allowed_unit_definitions_json!,
      slotTypes: row.slot_types_json!,
      rule: jsonObject(row, "rule_json"),
    });
  });
  const equipmentEffects = snapshot.tables.equipment_effect_definitions.map((row) => {
    const equipmentId = requiredString(row, "equipment_definition_id");
    const effectIndex = requiredNumber(row, "effect_index");
    const effect = jsonObject(row, "effect_json");
    let to: RuleRelationEndpointV1 | null = null;
    if (typeof effect.weaponId === "string") to = endpoint("WEAPON", effect.weaponId);
    else if (typeof effect.abilityId === "string") to = endpoint("ABILITY", effect.abilityId);
    else {
      const actionId = actionDefinitionId(effect.action);
      if (actionId) to = endpoint("ACTION", actionId);
    }
    return relation(`equipment-effect:${equipmentId}:${effectIndex}`, "EQUIPMENT_EFFECT", endpoint("EQUIPMENT", equipmentId), to, effectIndex, row, {}, {
      effectType: requiredString(row, "effect_type"), effect,
    });
  });
  const shipModuleCapabilityGrants = snapshot.tables.ship_module_capability_grants.map((row) => {
    const equipmentId = requiredString(row, "equipment_definition_id");
    const capabilityId = requiredString(row, "capability_id");
    return relation(`ship-module-capability:${equipmentId}:${capabilityId}`, "SHIP_MODULE_CAPABILITY_GRANT", endpoint("EQUIPMENT", equipmentId), endpoint("SHIP_CAPABILITY", capabilityId), null, row, {
      capacityDelta: published(requiredNumber(row, "capacity_delta")),
    }, { grant: jsonObject(row, "grant_json") });
  });
  return { unitProfiles, unitTags, unitAbilities, unitWeapons, unitEquipmentSlots, equipmentEligibility, equipmentEffects, shipModuleCapabilityGrants };
}

function buildSources(snapshot: LegacyCatalogueSnapshot): RuleSourceV1[] {
  return snapshot.tables.ruleset_sources.map((row) => ({
    id: requiredString(row, "id"),
    path: requiredString(row, "source_path"),
    sha256: optionalString(row, "source_sha256"),
    authorityRank: requiredNumber(row, "authority_rank"),
    status: requiredString(row, "source_status") as RuleSourceV1["status"],
    notes: typeof row.notes === "string" ? row.notes : "",
  }));
}

export async function buildCanonicalCatalogueEnvelope(root = repositoryRoot): Promise<RulesCatalogueEnvelopeV1> {
  const [snapshot, canonicalConflicts] = await Promise.all([
    readLegacyCatalogueSnapshot(root),
    readCanonicalConflictRegister(root),
  ]);
  if (legacyTopLevelDefinitionCount(snapshot) !== 96) throw new Error("The final seed snapshot must contain exactly 96 top-level definitions.");
  if (canonicalConflicts.length !== 72) throw new Error("The canonical conflict register must contain exactly 72 records.");
  const sourceMismatches = await legacySourceHashMismatches(snapshot, root);
  if (sourceMismatches.length > 0) throw new Error(`Rules source hashes drifted: ${canonicalJson(sourceMismatches)}`);
  const canonicalConflictIds = new Set(canonicalConflicts.map((conflict) => conflict.id));
  const missingConflicts = referencedConflictIds(snapshot).filter((id) => !canonicalConflictIds.has(id));
  if (missingConflicts.length > 0) throw new Error(`Seeded conflict references are absent from the canonical register: ${missingConflicts.join(", ")}.`);

  const ruleset = snapshot.tables.rulesets[0];
  if (!ruleset) throw new Error("The final seed snapshot has no ruleset row.");
  const split = legacyUnitPublicationSplit(snapshot);
  const groups = buildDefinitionGroups(snapshot);
  const content: RulesCatalogueContentV1 = {
    schemaVersion: RULES_CATALOGUE_SCHEMA_VERSION,
    ruleset: {
      id: publishedRulesetId,
      version: publishedRulesetVersion,
      name: requiredString(ruleset, "name"),
      engineVersion: requiredString(ruleset, "engine_version"),
      authorityNotes: requiredString(ruleset, "authority_notes"),
    },
    sources: buildSources(snapshot),
    conflicts: buildConflicts(snapshot, canonicalConflicts),
    canonicalUnitIds: split.canonicalUnitIds,
    companionUnitIds: split.companionUnitIds,
    units: groups.units,
    weapons: groups.weapons,
    equipment: groups.equipment,
    actions: groups.actions,
    orders: groups.orders,
    structures: groups.structures,
    terrain: groups.terrain,
    ships: groups.ships,
    enemies: groups.enemies,
    movementProfiles: groups.movementProfiles,
    durabilityProfiles: groups.durabilityProfiles,
    cargoProfiles: groups.cargoProfiles,
    supplyProfiles: groups.supplyProfiles,
    deploymentProfiles: groups.deploymentProfiles,
    deploymentMethods: groups.deploymentMethods,
    tags: groups.tags,
    abilities: groups.abilities,
    statusEffects: groups.statusEffects,
    shipCapabilities: groups.shipCapabilities,
    handlers: buildHandlers(),
    overlays: buildOverlays(snapshot),
    relations: buildRelations(snapshot),
  };
  return createRulesCatalogueEnvelope(content);
}

async function bootstrapLegacySnapshot(destination: string): Promise<void> {
  const snapshot = await readLegacyCatalogueSnapshot();
  const topLevelDefinitions = legacyTopLevelDefinitionCount(snapshot);
  if (topLevelDefinitions !== 96) {
    throw new Error(`Expected 96 final seeded top-level definitions; received ${topLevelDefinitions}.`);
  }
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Bootstrapped ${topLevelDefinitions} definitions to ${relative(repositoryRoot, destination)}.`);
}

export function renderGeneratedCatalogueModule(envelope: RulesCatalogueEnvelopeV1): string {
  return `/* This file is generated by scripts/generate-rules-catalogue.ts. Do not edit. */
import type { RulesCatalogueEnvelopeV1 } from "../../../domain/src/rules-catalogue-contract";

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends readonly unknown[] ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const snapshot = ${JSON.stringify(envelope, null, 2)} as const satisfies RulesCatalogueEnvelopeV1;

export const V5_CORE_CURATED_2_CATALOGUE = deepFreeze(snapshot);
export const V5_CORE_CURATED_2_CONTENT_HASH = ${JSON.stringify(envelope.contentHash)} as const;
export const V5_CORE_CURATED_2_RULESET_VERSION = ${JSON.stringify(envelope.content.ruleset.version)} as const;
`;
}

async function readCanonicalEnvelope(): Promise<RulesCatalogueEnvelopeV1> {
  const source = JSON.parse(await readFile(canonicalCataloguePath, "utf8"));
  return parseRulesCatalogueEnvelope(source);
}

async function writeGeneratedModule(envelope: RulesCatalogueEnvelopeV1): Promise<void> {
  await mkdir(dirname(generatedCataloguePath), { recursive: true });
  await writeFile(generatedCataloguePath, renderGeneratedCatalogueModule(envelope), "utf8");
}

async function bootstrapCanonicalCatalogue(): Promise<void> {
  const envelope = await buildCanonicalCatalogueEnvelope();
  await mkdir(dirname(canonicalCataloguePath), { recursive: true });
  await writeFile(canonicalCataloguePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  await writeGeneratedModule(envelope);
  console.log(`Published ${envelope.content.ruleset.version} (${envelope.contentHash}) to ${relative(repositoryRoot, canonicalCataloguePath)}.`);
}

async function generateFromCanonicalCatalogue(): Promise<void> {
  const envelope = await readCanonicalEnvelope();
  await writeGeneratedModule(envelope);
  console.log(`Generated ${relative(repositoryRoot, generatedCataloguePath)} from ${envelope.content.ruleset.version}.`);
}

async function checkCanonicalCatalogue(): Promise<void> {
  const [canonical, rebuilt] = await Promise.all([
    readCanonicalEnvelope(),
    buildCanonicalCatalogueEnvelope(),
  ]);
  if (canonicalJson(canonical) !== canonicalJson(rebuilt)) {
    throw new Error("Canonical catalogue drifted from its source rules, conflict register, or final production seed state. Run the deliberate --bootstrap publication flow and review the diff.");
  }
  const expectedGenerated = renderGeneratedCatalogueModule(canonical);
  let actualGenerated: string;
  try {
    actualGenerated = await readFile(generatedCataloguePath, "utf8");
  } catch {
    throw new Error(`Generated catalogue is missing: ${relative(repositoryRoot, generatedCataloguePath)}.`);
  }
  if (actualGenerated !== expectedGenerated) {
    throw new Error("Generated TypeScript catalogue drifted from the canonical JSON. Run npm run catalogue:generate.");
  }
  console.log(`Catalogue check passed: ${canonical.content.ruleset.version} ${canonical.contentHash}.`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "bootstrap-legacy": { type: "string" },
      bootstrap: { type: "boolean" },
      write: { type: "boolean" },
      check: { type: "boolean" },
    },
    strict: true,
  });
  if (values["bootstrap-legacy"]) {
    await bootstrapLegacySnapshot(resolve(repositoryRoot, values["bootstrap-legacy"]));
    return;
  }
  const operations = [values.bootstrap, values.write, values.check].filter(Boolean).length;
  if (operations !== 1) throw new Error("Choose exactly one of --bootstrap, --write, or --check.");
  if (values.bootstrap) await bootstrapCanonicalCatalogue();
  else if (values.write) await generateFromCanonicalCatalogue();
  else await checkCanonicalCatalogue();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

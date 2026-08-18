/**
 * Versioned, storage-agnostic authoring contract for generated tactical maps.
 *
 * Visual biome IDs deliberately do not imply rules. The versioned vocabulary
 * binds every visual choice to an explicit application profile; runtime code
 * consumes the materialised fields rather than interpreting biome names.
 */

export const ADMIN_MAP_SCHEMA = "corinth.admin-map" as const;
export const ADMIN_MAP_SCHEMA_VERSION = 1 as const;
export const ADMIN_MAP_GENERATOR_VERSION = "admin-map-generator@2" as const;
export const ADMIN_MAP_VOCABULARY_VERSION = "admin-map-vocabulary@2" as const;

export const ADMIN_MAP_MIN_WIDTH = 12;
export const ADMIN_MAP_MIN_HEIGHT = 10;
export const ADMIN_MAP_MAX_WIDTH = 96;
export const ADMIN_MAP_MAX_HEIGHT = 96;
export const ADMIN_MAP_MAX_IMPORT_CHARACTERS = 16 * 1024 * 1024;

export type AdminMapPresetId =
  | "DESERT_CONTINENT"
  | "URBAN_CONTINENT"
  | "ISLANDS"
  | "MIXED"
  | "ICY";

export const ADMIN_MAP_PRESETS: readonly AdminMapPresetId[] = Object.freeze([
  "DESERT_CONTINENT",
  "URBAN_CONTINENT",
  "ISLANDS",
  "MIXED",
  "ICY",
]);

export type AdminMapTerrainGroup =
  | "LOWLANDS"
  | "FORESTS"
  | "WETLANDS"
  | "HIGHLANDS"
  | "ARID"
  | "COLD"
  | "WATER";

export type AdminMapMechanicsStatus = "PUBLISHED" | "BALANCE_REQUIRED";
export type AdminMapMechanicalTerrainProfileId =
  | "terrain-open"
  | "terrain-rough"
  | "terrain-urban"
  | "terrain-forest"
  | "terrain-dense-forest"
  | "terrain-jungle"
  | "terrain-wetland"
  | "terrain-swamp"
  | "terrain-bog"
  | "terrain-ridge"
  | "terrain-crag"
  | "terrain-mountain"
  | "terrain-mountain-peak"
  | "terrain-volcano"
  | "terrain-marsh"
  | "terrain-desert"
  | "terrain-dunes"
  | "terrain-badlands"
  | "terrain-canyon"
  | "terrain-crater"
  | "terrain-tundra"
  | "terrain-snowfield"
  | "terrain-glacier"
  | "terrain-shallow-water"
  | "terrain-deep-water"
  | "terrain-fresh-water"
  | "terrain-frozen-lake"
  | "terrain-rapids"
  | "terrain-beach";

export interface AdminMapTerrainVocabularyEntry {
  readonly id: string;
  readonly group: AdminMapTerrainGroup;
  readonly label: string;
  readonly mechanicalTerrainProfileId: AdminMapMechanicalTerrainProfileId | null;
  readonly mechanicsStatus: AdminMapMechanicsStatus;
}

function publishedTerrain<
  const Id extends string,
  const Group extends AdminMapTerrainGroup,
  const Profile extends AdminMapMechanicalTerrainProfileId,
>(
  id: Id,
  group: Group,
  label: string,
  mechanicalTerrainProfileId: Profile,
): AdminMapTerrainVocabularyEntry & {
  readonly id: Id;
  readonly group: Group;
  readonly mechanicalTerrainProfileId: Profile;
  readonly mechanicsStatus: "PUBLISHED";
} {
  return Object.freeze({
    id,
    group,
    label,
    mechanicalTerrainProfileId,
    mechanicsStatus: "PUBLISHED" as const,
  });
}

export const ADMIN_MAP_TERRAIN_VOCABULARY = Object.freeze([
  publishedTerrain("LOWLANDS_OPEN", "LOWLANDS", "Open Ground", "terrain-open"),
  publishedTerrain("LOWLANDS_LOWLANDS", "LOWLANDS", "Lowlands", "terrain-open"),
  publishedTerrain("LOWLANDS_PLAINS", "LOWLANDS", "Plains", "terrain-open"),
  publishedTerrain("LOWLANDS_GRASSLAND", "LOWLANDS", "Grassland", "terrain-open"),
  publishedTerrain("LOWLANDS_MEADOW", "LOWLANDS", "Meadow", "terrain-open"),
  publishedTerrain("LOWLANDS_VALLEY", "LOWLANDS", "Valley", "terrain-open"),
  publishedTerrain("LOWLANDS_HEATH", "LOWLANDS", "Heath", "terrain-rough"),
  publishedTerrain("LOWLANDS_SAVANNA", "LOWLANDS", "Savanna", "terrain-open"),
  publishedTerrain("LOWLANDS_STEPPE", "LOWLANDS", "Steppe", "terrain-rough"),
  publishedTerrain("LOWLANDS_SCRUB", "LOWLANDS", "Scrubland", "terrain-rough"),
  publishedTerrain("LOWLANDS_FARMLAND", "LOWLANDS", "Farmland", "terrain-open"),
  publishedTerrain("LOWLANDS_URBAN", "LOWLANDS", "Urban Ground", "terrain-urban"),

  publishedTerrain("FORESTS_CORINTH_PINE", "FORESTS", "Corinth Pine Forest", "terrain-forest"),
  publishedTerrain("FORESTS_FOREST", "FORESTS", "Forest", "terrain-forest"),
  publishedTerrain("FORESTS_DECIDUOUS", "FORESTS", "Deciduous Forest", "terrain-forest"),
  publishedTerrain("FORESTS_DENSE", "FORESTS", "Dense Forest", "terrain-dense-forest"),
  publishedTerrain("FORESTS_JUNGLE", "FORESTS", "Jungle", "terrain-jungle"),
  publishedTerrain("FORESTS_GLADE", "FORESTS", "Glade", "terrain-open"),
  publishedTerrain("FORESTS_RAINFOREST", "FORESTS", "Rainforest", "terrain-jungle"),
  publishedTerrain("FORESTS_BURNT", "FORESTS", "Burnt Forest", "terrain-rough"),

  publishedTerrain("WETLANDS_ASH_MARSH", "WETLANDS", "Ash Marsh", "terrain-marsh"),
  publishedTerrain("WETLANDS_WETLANDS", "WETLANDS", "Wetlands", "terrain-wetland"),
  publishedTerrain("WETLANDS_SWAMP", "WETLANDS", "Swamp", "terrain-swamp"),
  publishedTerrain("WETLANDS_MARSH", "WETLANDS", "Marsh", "terrain-marsh"),
  publishedTerrain("WETLANDS_BOG", "WETLANDS", "Bog", "terrain-bog"),
  publishedTerrain("WETLANDS_FLOODPLAIN", "WETLANDS", "Floodplain", "terrain-wetland"),
  publishedTerrain("WETLANDS_MANGROVE", "WETLANDS", "Mangrove", "terrain-swamp"),

  publishedTerrain("HIGHLANDS_BASALT_RIDGE", "HIGHLANDS", "Basalt Ridge", "terrain-ridge"),
  publishedTerrain("HIGHLANDS_HIGHLANDS", "HIGHLANDS", "Highlands", "terrain-ridge"),
  publishedTerrain("HIGHLANDS_HILLS", "HIGHLANDS", "Hills", "terrain-ridge"),
  publishedTerrain("HIGHLANDS_HILL", "HIGHLANDS", "Hill", "terrain-ridge"),
  publishedTerrain("HIGHLANDS_CRAG", "HIGHLANDS", "Crag", "terrain-crag"),
  publishedTerrain("HIGHLANDS_MOUNTAIN", "HIGHLANDS", "Mountain", "terrain-mountain"),
  publishedTerrain("HIGHLANDS_MOUNTAINS", "HIGHLANDS", "Mountains", "terrain-mountain"),
  publishedTerrain("HIGHLANDS_MOUNTAIN_PEAK", "HIGHLANDS", "Mountain Peak", "terrain-mountain-peak"),
  publishedTerrain("HIGHLANDS_VOLCANO", "HIGHLANDS", "Volcano", "terrain-volcano"),
  publishedTerrain("HIGHLANDS_CLIFFS", "HIGHLANDS", "Cliffs", "terrain-mountain"),
  publishedTerrain("HIGHLANDS_VOLCANIC", "HIGHLANDS", "Volcanic Highlands", "terrain-crag"),

  publishedTerrain("ARID_DESERT", "ARID", "Desert", "terrain-desert"),
  publishedTerrain("ARID_ARID", "ARID", "Arid", "terrain-desert"),
  publishedTerrain("ARID_DUNES", "ARID", "Dunes", "terrain-dunes"),
  publishedTerrain("ARID_BADLANDS", "ARID", "Badlands", "terrain-badlands"),
  publishedTerrain("ARID_CANYON", "ARID", "Canyon", "terrain-canyon"),
  publishedTerrain("ARID_CRATER", "ARID", "Crater", "terrain-crater"),
  publishedTerrain("ARID_SALT_FLAT", "ARID", "Salt Flat", "terrain-desert"),
  publishedTerrain("ARID_MESA", "ARID", "Mesa", "terrain-badlands"),

  publishedTerrain("COLD_TUNDRA", "COLD", "Tundra", "terrain-tundra"),
  publishedTerrain("COLD_COLD", "COLD", "Cold", "terrain-tundra"),
  publishedTerrain("COLD_TAIGA", "COLD", "Taiga", "terrain-forest"),
  publishedTerrain("COLD_SNOWFIELD", "COLD", "Snowfield", "terrain-snowfield"),
  publishedTerrain("COLD_GLACIER", "COLD", "Glacier", "terrain-glacier"),
  publishedTerrain("COLD_ICE_CAP", "COLD", "Ice Cap", "terrain-glacier"),

  publishedTerrain("WATER_COAST", "WATER", "Coastal Water", "terrain-shallow-water"),
  publishedTerrain("WATER_WATER", "WATER", "Water", "terrain-fresh-water"),
  publishedTerrain("WATER_OPEN_WATER", "WATER", "Open Water", "terrain-deep-water"),
  publishedTerrain("WATER_SHALLOW", "WATER", "Shallow Water", "terrain-shallow-water"),
  publishedTerrain("WATER_OCEAN", "WATER", "Ocean", "terrain-deep-water"),
  publishedTerrain("WATER_DEEP", "WATER", "Deep Ocean", "terrain-deep-water"),
  publishedTerrain("WATER_SEA", "WATER", "Sea", "terrain-deep-water"),
  publishedTerrain("WATER_FRESH", "WATER", "Fresh Water", "terrain-fresh-water"),
  publishedTerrain("WATER_LAKE", "WATER", "Lake", "terrain-fresh-water"),
  publishedTerrain("WATER_POND", "WATER", "Pond", "terrain-fresh-water"),
  publishedTerrain("WATER_FROZEN_LAKE", "WATER", "Frozen Lake", "terrain-frozen-lake"),
  publishedTerrain("WATER_RAPIDS", "WATER", "Rapids", "terrain-rapids"),
  publishedTerrain("WATER_COASTAL", "WATER", "Coastal", "terrain-shallow-water"),
  publishedTerrain("WATER_COAST_BEACH", "WATER", "Coast-Beach", "terrain-beach"),
  publishedTerrain("WATER_ICE", "WATER", "Ice Water", "terrain-frozen-lake"),
] satisfies readonly AdminMapTerrainVocabularyEntry[]);

export type AdminMapVisualBiomeId = (typeof ADMIN_MAP_TERRAIN_VOCABULARY)[number]["id"];

export type AdminMapPointFeatureId =
  | "CITY"
  | "AIRFIELD"
  | "TOWN"
  | "OUTPOST"
  | "RADAR"
  | "TRENCH";

export type AdminMapEdgeFeatureId =
  | "ROAD"
  | "PATH"
  | "RIVER"
  | "WALL"
  | "BRIDGE";

export interface AdminMapFeatureVocabularyEntry<FeatureId extends string> {
  readonly id: FeatureId;
  readonly label: string;
  readonly mechanicalFeatureId: string | null;
  readonly mechanicsStatus: AdminMapMechanicsStatus;
}

export const ADMIN_MAP_POINT_FEATURE_VOCABULARY = Object.freeze([
  { id: "CITY", label: "City", mechanicalFeatureId: "feature-city@1", mechanicsStatus: "PUBLISHED" },
  { id: "AIRFIELD", label: "Airfield", mechanicalFeatureId: "feature-airfield@1", mechanicsStatus: "PUBLISHED" },
  { id: "TOWN", label: "Town", mechanicalFeatureId: "feature-town@1", mechanicsStatus: "PUBLISHED" },
  { id: "OUTPOST", label: "Outpost", mechanicalFeatureId: "feature-outpost@1", mechanicsStatus: "PUBLISHED" },
  { id: "RADAR", label: "RADAR", mechanicalFeatureId: "feature-radar@1", mechanicsStatus: "PUBLISHED" },
  { id: "TRENCH", label: "Trench", mechanicalFeatureId: "structure-trench", mechanicsStatus: "PUBLISHED" },
] as const satisfies readonly AdminMapFeatureVocabularyEntry<AdminMapPointFeatureId>[]);

export const ADMIN_MAP_EDGE_FEATURE_VOCABULARY = Object.freeze([
  { id: "ROAD", label: "Road", mechanicalFeatureId: "edge-road@1", mechanicsStatus: "PUBLISHED" },
  { id: "PATH", label: "Path", mechanicalFeatureId: "edge-path@1", mechanicsStatus: "PUBLISHED" },
  { id: "RIVER", label: "River", mechanicalFeatureId: "edge-river-crossing@1", mechanicsStatus: "PUBLISHED" },
  { id: "WALL", label: "Wall", mechanicalFeatureId: "edge-wall@1", mechanicsStatus: "PUBLISHED" },
  { id: "BRIDGE", label: "Bridge", mechanicalFeatureId: "structure-bridge", mechanicsStatus: "PUBLISHED" },
] as const satisfies readonly AdminMapFeatureVocabularyEntry<AdminMapEdgeFeatureId>[]);

export type AdminMapHexDirection = 0 | 1 | 2 | 3 | 4 | 5;
export type AdminMapLandTopology = "CONTIGUOUS" | "ARCHIPELAGO";

export interface AdminMapCellV1 {
  readonly q: number;
  readonly r: number;
  readonly visualBiomeId: AdminMapVisualBiomeId;
  readonly terrainGroup: AdminMapTerrainGroup;
  readonly mechanicalTerrainProfileId: AdminMapMechanicalTerrainProfileId | null;
  readonly mechanicsStatus: AdminMapMechanicsStatus;
}

export interface AdminMapPointFeatureV1 {
  readonly id: string;
  readonly featureId: AdminMapPointFeatureId;
  readonly q: number;
  readonly r: number;
  readonly mechanicalFeatureId: string | null;
  readonly mechanicsStatus: AdminMapMechanicsStatus;
}

export interface AdminMapEdgeFeatureV1 {
  readonly id: string;
  readonly featureId: AdminMapEdgeFeatureId;
  readonly q: number;
  readonly r: number;
  readonly direction: AdminMapHexDirection;
  readonly mechanicalFeatureId: string | null;
  readonly mechanicsStatus: AdminMapMechanicsStatus;
}

export interface AdminMapTopologyV1 {
  readonly land: AdminMapLandTopology;
  readonly water: "CONTIGUOUS";
  readonly landComponents: number;
  readonly waterComponents: 1;
}

export interface AdminMapDocumentV1 {
  readonly schema: typeof ADMIN_MAP_SCHEMA;
  readonly schemaVersion: typeof ADMIN_MAP_SCHEMA_VERSION;
  readonly generatorVersion: typeof ADMIN_MAP_GENERATOR_VERSION;
  readonly vocabularyVersion: typeof ADMIN_MAP_VOCABULARY_VERSION;
  readonly preset: AdminMapPresetId;
  readonly seed: string;
  readonly width: number;
  readonly height: number;
  readonly topology: AdminMapTopologyV1;
  readonly cells: readonly AdminMapCellV1[];
  readonly pointFeatures: readonly AdminMapPointFeatureV1[];
  readonly edgeFeatures: readonly AdminMapEdgeFeatureV1[];
  readonly hash: `sha256:${string}`;
}

export type AdminMapBodyV1 = Omit<AdminMapDocumentV1, "hash">;

export interface AdminMapTopologyAnalysis {
  readonly landComponents: number;
  readonly waterComponents: number;
  readonly landCellCount: number;
  readonly waterCellCount: number;
}

const terrainById = new Map<string, AdminMapTerrainVocabularyEntry>(
  ADMIN_MAP_TERRAIN_VOCABULARY.map((entry) => [entry.id, entry]),
);
const pointFeatureById = new Map<string, AdminMapFeatureVocabularyEntry<AdminMapPointFeatureId>>(
  ADMIN_MAP_POINT_FEATURE_VOCABULARY.map((entry) => [entry.id, entry]),
);
const edgeFeatureById = new Map<string, AdminMapFeatureVocabularyEntry<AdminMapEdgeFeatureId>>(
  ADMIN_MAP_EDGE_FEATURE_VOCABULARY.map((entry) => [entry.id, entry]),
);

export function getAdminMapTerrainDefinition(id: string): AdminMapTerrainVocabularyEntry | undefined {
  return terrainById.get(id);
}

export function getAdminMapPointFeatureDefinition(
  id: string,
): AdminMapFeatureVocabularyEntry<AdminMapPointFeatureId> | undefined {
  return pointFeatureById.get(id);
}

export function getAdminMapEdgeFeatureDefinition(
  id: string,
): AdminMapFeatureVocabularyEntry<AdminMapEdgeFeatureId> | undefined {
  return edgeFeatureById.get(id);
}

export class AdminMapValidationError extends Error {
  readonly code = "ADMIN_MAP_VALIDATION_FAILED";
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "AdminMapValidationError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new AdminMapValidationError(path, message);
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "must be a plain JSON object");
  const expected = [...keys].sort(codePointCompare);
  const actual = Object.keys(value).sort(codePointCompare);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `must contain exactly: ${expected.join(", ")}`);
  }
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

function integerValue(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function enumValue<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    fail(path, `must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringValue(value, path);
}

function coordinateKey(q: number, r: number): string {
  return `${q},${r}`;
}

const HEX_DIRECTIONS = Object.freeze([
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
]);

function compareCellCoordinates(left: Pick<AdminMapCellV1, "q" | "r">, right: Pick<AdminMapCellV1, "q" | "r">): number {
  return left.q - right.q || left.r - right.r;
}

function compareFeatureIds(left: { id: string }, right: { id: string }): number {
  return codePointCompare(left.id, right.id);
}

function requireSorted<T>(items: readonly T[], compare: (left: T, right: T) => number, path: string): void {
  for (let index = 1; index < items.length; index += 1) {
    if (compare(items[index - 1]!, items[index]!) > 0) fail(path, "must use canonical ordering");
  }
}

function componentCount(cells: readonly AdminMapCellV1[], water: boolean): number {
  const eligible = new Set(
    cells
      .filter((cell) => (cell.terrainGroup === "WATER") === water)
      .map((cell) => coordinateKey(cell.q, cell.r)),
  );
  let components = 0;
  while (eligible.size > 0) {
    components += 1;
    const first = eligible.values().next().value as string;
    const [firstQ, firstR] = first.split(",").map(Number);
    const pending = [{ q: firstQ!, r: firstR! }];
    eligible.delete(first);
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const direction of HEX_DIRECTIONS) {
        const neighbour = { q: current.q + direction.q, r: current.r + direction.r };
        const key = coordinateKey(neighbour.q, neighbour.r);
        if (!eligible.delete(key)) continue;
        pending.push(neighbour);
      }
    }
  }
  return components;
}

export function analyzeAdminMapTopology(cells: readonly AdminMapCellV1[]): AdminMapTopologyAnalysis {
  const landCellCount = cells.filter((cell) => cell.terrainGroup !== "WATER").length;
  const waterCellCount = cells.length - landCellCount;
  return {
    landComponents: componentCount(cells, false),
    waterComponents: componentCount(cells, true),
    landCellCount,
    waterCellCount,
  };
}

function validateCell(
  value: unknown,
  path: string,
  width: number,
  height: number,
): AdminMapCellV1 {
  const parsed = exactRecord(value, path, [
    "q",
    "r",
    "visualBiomeId",
    "terrainGroup",
    "mechanicalTerrainProfileId",
    "mechanicsStatus",
  ]);
  integerValue(parsed.q, `${path}.q`, 0, width - 1);
  integerValue(parsed.r, `${path}.r`, 0, height - 1);
  const visualBiomeId = stringValue(parsed.visualBiomeId, `${path}.visualBiomeId`);
  const terrain = terrainById.get(visualBiomeId);
  if (!terrain) fail(`${path}.visualBiomeId`, "is not in the pinned terrain vocabulary");
  const terrainGroup = enumValue(parsed.terrainGroup, `${path}.terrainGroup`, [
    "LOWLANDS",
    "FORESTS",
    "WETLANDS",
    "HIGHLANDS",
    "ARID",
    "COLD",
    "WATER",
  ] as const);
  const mechanicalTerrainProfileId = nullableString(
    parsed.mechanicalTerrainProfileId,
    `${path}.mechanicalTerrainProfileId`,
  );
  const mechanicsStatus = enumValue(parsed.mechanicsStatus, `${path}.mechanicsStatus`, [
    "PUBLISHED",
    "BALANCE_REQUIRED",
  ] as const);
  if (terrain.group !== terrainGroup) fail(`${path}.terrainGroup`, "does not match the visual biome definition");
  if (terrain.mechanicalTerrainProfileId !== mechanicalTerrainProfileId) {
    fail(`${path}.mechanicalTerrainProfileId`, "does not match the visual biome definition");
  }
  if (terrain.mechanicsStatus !== mechanicsStatus) {
    fail(`${path}.mechanicsStatus`, "does not match the visual biome definition");
  }
  return parsed as unknown as AdminMapCellV1;
}

function validatePointFeature(
  value: unknown,
  path: string,
  width: number,
  height: number,
  cellsByCoordinate: ReadonlyMap<string, AdminMapCellV1>,
): AdminMapPointFeatureV1 {
  const parsed = exactRecord(value, path, [
    "id",
    "featureId",
    "q",
    "r",
    "mechanicalFeatureId",
    "mechanicsStatus",
  ]);
  const id = stringValue(parsed.id, `${path}.id`);
  if (!/^[a-z0-9][a-z0-9:.-]{0,127}$/.test(id)) fail(`${path}.id`, "has an invalid stable identifier");
  const featureId = enumValue(parsed.featureId, `${path}.featureId`, [
    "CITY",
    "AIRFIELD",
    "TOWN",
    "OUTPOST",
    "RADAR",
    "TRENCH",
  ] as const);
  const definition = pointFeatureById.get(featureId)!;
  const q = integerValue(parsed.q, `${path}.q`, 0, width - 1);
  const r = integerValue(parsed.r, `${path}.r`, 0, height - 1);
  const cell = cellsByCoordinate.get(coordinateKey(q, r));
  if (!cell || cell.terrainGroup === "WATER") fail(path, "must be placed on a land cell");
  const mechanicalFeatureId = nullableString(parsed.mechanicalFeatureId, `${path}.mechanicalFeatureId`);
  const mechanicsStatus = enumValue(parsed.mechanicsStatus, `${path}.mechanicsStatus`, [
    "PUBLISHED",
    "BALANCE_REQUIRED",
  ] as const);
  if (definition.mechanicalFeatureId !== mechanicalFeatureId) {
    fail(`${path}.mechanicalFeatureId`, "does not match the point-feature vocabulary");
  }
  if (definition.mechanicsStatus !== mechanicsStatus) {
    fail(`${path}.mechanicsStatus`, "does not match the point-feature vocabulary");
  }
  return parsed as unknown as AdminMapPointFeatureV1;
}

function validateEdgeFeature(
  value: unknown,
  path: string,
  width: number,
  height: number,
  cellsByCoordinate: ReadonlyMap<string, AdminMapCellV1>,
): AdminMapEdgeFeatureV1 {
  const parsed = exactRecord(value, path, [
    "id",
    "featureId",
    "q",
    "r",
    "direction",
    "mechanicalFeatureId",
    "mechanicsStatus",
  ]);
  const id = stringValue(parsed.id, `${path}.id`);
  if (!/^[a-z0-9][a-z0-9:.-]{0,127}$/.test(id)) fail(`${path}.id`, "has an invalid stable identifier");
  const featureId = enumValue(parsed.featureId, `${path}.featureId`, [
    "ROAD",
    "PATH",
    "RIVER",
    "WALL",
    "BRIDGE",
  ] as const);
  const definition = edgeFeatureById.get(featureId)!;
  const q = integerValue(parsed.q, `${path}.q`, 0, width - 1);
  const r = integerValue(parsed.r, `${path}.r`, 0, height - 1);
  const direction = integerValue(parsed.direction, `${path}.direction`, 0, 5) as AdminMapHexDirection;
  const source = cellsByCoordinate.get(coordinateKey(q, r));
  const delta = HEX_DIRECTIONS[direction]!;
  const target = cellsByCoordinate.get(coordinateKey(q + delta.q, r + delta.r));
  if (!source || !target) fail(path, "must connect two cells inside the map");
  if (compareCellCoordinates(source, target) >= 0) fail(path, "must use the canonical undirected edge orientation");
  if (source.terrainGroup === "WATER" && target.terrainGroup === "WATER") {
    fail(path, "must not connect two water cells");
  }
  if (["ROAD", "PATH", "WALL", "BRIDGE"].includes(featureId)
      && (source.terrainGroup === "WATER" || target.terrainGroup === "WATER")) {
    fail(path, `${featureId} must connect two land cells`);
  }
  const mechanicalFeatureId = nullableString(parsed.mechanicalFeatureId, `${path}.mechanicalFeatureId`);
  const mechanicsStatus = enumValue(parsed.mechanicsStatus, `${path}.mechanicsStatus`, [
    "PUBLISHED",
    "BALANCE_REQUIRED",
  ] as const);
  if (definition.mechanicalFeatureId !== mechanicalFeatureId) {
    fail(`${path}.mechanicalFeatureId`, "does not match the edge-feature vocabulary");
  }
  if (definition.mechanicsStatus !== mechanicsStatus) {
    fail(`${path}.mechanicsStatus`, "does not match the edge-feature vocabulary");
  }
  return parsed as unknown as AdminMapEdgeFeatureV1;
}

function validateAdminMapStructure(value: unknown): AdminMapDocumentV1 {
  const parsed = exactRecord(value, "$", [
    "schema",
    "schemaVersion",
    "generatorVersion",
    "vocabularyVersion",
    "preset",
    "seed",
    "width",
    "height",
    "topology",
    "cells",
    "pointFeatures",
    "edgeFeatures",
    "hash",
  ]);
  if (parsed.schema !== ADMIN_MAP_SCHEMA) fail("$.schema", `must equal ${ADMIN_MAP_SCHEMA}`);
  if (parsed.schemaVersion !== ADMIN_MAP_SCHEMA_VERSION) {
    fail("$.schemaVersion", `unsupported schema version ${String(parsed.schemaVersion)}`);
  }
  if (parsed.generatorVersion !== ADMIN_MAP_GENERATOR_VERSION) {
    fail("$.generatorVersion", `unsupported generator version ${String(parsed.generatorVersion)}`);
  }
  if (parsed.vocabularyVersion !== ADMIN_MAP_VOCABULARY_VERSION) {
    fail("$.vocabularyVersion", `unsupported vocabulary version ${String(parsed.vocabularyVersion)}`);
  }
  const preset = enumValue(parsed.preset, "$.preset", ADMIN_MAP_PRESETS);
  const seed = stringValue(parsed.seed, "$.seed");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(seed)) {
    fail("$.seed", "must contain 1-128 stable ASCII letters, digits, dot, underscore, colon, or hyphen");
  }
  const width = integerValue(parsed.width, "$.width", ADMIN_MAP_MIN_WIDTH, ADMIN_MAP_MAX_WIDTH);
  const height = integerValue(parsed.height, "$.height", ADMIN_MAP_MIN_HEIGHT, ADMIN_MAP_MAX_HEIGHT);
  const topologyObject = exactRecord(parsed.topology, "$.topology", [
    "land",
    "water",
    "landComponents",
    "waterComponents",
  ]);
  const landTopology = enumValue(topologyObject.land, "$.topology.land", ["CONTIGUOUS", "ARCHIPELAGO"] as const);
  if (topologyObject.water !== "CONTIGUOUS") fail("$.topology.water", "must equal CONTIGUOUS");
  const declaredLandComponents = integerValue(
    topologyObject.landComponents,
    "$.topology.landComponents",
    1,
    width * height,
  );
  if (topologyObject.waterComponents !== 1) fail("$.topology.waterComponents", "must equal 1");

  const rawCells = arrayValue(parsed.cells, "$.cells");
  if (rawCells.length !== width * height) fail("$.cells", "must contain every coordinate exactly once");
  const cells = rawCells.map((cell, index) => validateCell(cell, `$.cells[${index}]`, width, height));
  requireSorted(cells, compareCellCoordinates, "$.cells");
  const cellsByCoordinate = new Map<string, AdminMapCellV1>();
  for (const cell of cells) {
    const key = coordinateKey(cell.q, cell.r);
    if (cellsByCoordinate.has(key)) fail("$.cells", `contains duplicate coordinate ${key}`);
    cellsByCoordinate.set(key, cell);
  }
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      if (!cellsByCoordinate.has(coordinateKey(q, r))) fail("$.cells", `is missing coordinate ${q},${r}`);
    }
  }
  for (const cell of cells) {
    if ((cell.q === 0 || cell.q === width - 1 || cell.r === 0 || cell.r === height - 1)
        && cell.terrainGroup !== "WATER") {
      fail("$.cells", "boundary coordinates must remain water");
    }
  }

  const analysis = analyzeAdminMapTopology(cells);
  if (analysis.landCellCount === 0 || analysis.waterCellCount === 0) {
    fail("$.topology", "requires both land and water");
  }
  if (analysis.waterComponents !== 1) fail("$.topology.waterComponents", "water must be contiguous");
  if (analysis.landComponents !== declaredLandComponents) {
    fail("$.topology.landComponents", "does not match the generated cell topology");
  }
  const expectedLandTopology: AdminMapLandTopology = preset === "ISLANDS" ? "ARCHIPELAGO" : "CONTIGUOUS";
  if (landTopology !== expectedLandTopology) fail("$.topology.land", `must equal ${expectedLandTopology} for ${preset}`);
  if (landTopology === "CONTIGUOUS" && analysis.landComponents !== 1) {
    fail("$.topology.landComponents", "continent presets require one land component");
  }
  if (landTopology === "ARCHIPELAGO" && analysis.landComponents < 2) {
    fail("$.topology.landComponents", "islands require at least two land components");
  }

  const rawPointFeatures = arrayValue(parsed.pointFeatures, "$.pointFeatures");
  if (rawPointFeatures.length > cells.length) fail("$.pointFeatures", "contains too many features");
  const pointFeatures = rawPointFeatures.map((feature, index) => validatePointFeature(
    feature,
    `$.pointFeatures[${index}]`,
    width,
    height,
    cellsByCoordinate,
  ));
  requireSorted(pointFeatures, compareFeatureIds, "$.pointFeatures");
  const pointIds = new Set<string>();
  const pointPlacements = new Set<string>();
  for (const feature of pointFeatures) {
    if (pointIds.has(feature.id)) fail("$.pointFeatures", `contains duplicate id ${feature.id}`);
    pointIds.add(feature.id);
    const placement = `${feature.featureId}:${feature.q},${feature.r}`;
    if (pointPlacements.has(placement)) fail("$.pointFeatures", `duplicates ${placement}`);
    pointPlacements.add(placement);
  }

  const rawEdgeFeatures = arrayValue(parsed.edgeFeatures, "$.edgeFeatures");
  if (rawEdgeFeatures.length > cells.length * 6) fail("$.edgeFeatures", "contains too many features");
  const edgeFeatures = rawEdgeFeatures.map((feature, index) => validateEdgeFeature(
    feature,
    `$.edgeFeatures[${index}]`,
    width,
    height,
    cellsByCoordinate,
  ));
  requireSorted(edgeFeatures, compareFeatureIds, "$.edgeFeatures");
  const edgeIds = new Set<string>();
  const edgePlacements = new Set<string>();
  const featureIdsByGeometry = new Map<string, Set<AdminMapEdgeFeatureId>>();
  for (const feature of edgeFeatures) {
    if (edgeIds.has(feature.id)) fail("$.edgeFeatures", `contains duplicate id ${feature.id}`);
    edgeIds.add(feature.id);
    const geometry = `${feature.q},${feature.r}:${feature.direction}`;
    const placement = `${feature.featureId}:${geometry}`;
    if (edgePlacements.has(placement)) fail("$.edgeFeatures", `duplicates ${placement}`);
    edgePlacements.add(placement);
    const ids = featureIdsByGeometry.get(geometry) ?? new Set<AdminMapEdgeFeatureId>();
    ids.add(feature.featureId);
    featureIdsByGeometry.set(geometry, ids);
  }
  for (const [geometry, featureIds] of featureIdsByGeometry) {
    if (!featureIds.has("BRIDGE")) continue;
    if (!featureIds.has("RIVER") || (!featureIds.has("ROAD") && !featureIds.has("PATH"))) {
      fail("$.edgeFeatures", `bridge ${geometry} requires a river and road/path on the same edge`);
    }
  }

  const hash = stringValue(parsed.hash, "$.hash");
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) fail("$.hash", "must be a lowercase SHA-256 content hash");
  return parsed as unknown as AdminMapDocumentV1;
}

type CanonicalJsonValue = null | boolean | number | string | readonly CanonicalJsonValue[] | {
  readonly [key: string]: CanonicalJsonValue;
};

function canonicalJson(value: unknown, path = "$hash"): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(path, "canonical maps permit safe integers only");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (!isRecord(value)) fail(path, "is not canonical JSON data");
  const keys = Object.keys(value).sort(codePointCompare);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], `${path}.${key}`)}`).join(",")}}`;
}

const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, places: number): number {
  return (value >>> places) | (value << (32 - places));
}

function sha256Hex(text: string): string {
  const input = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bitLength = input.length * 8;
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const state = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }
    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, "0")).join("");
}

function bodyWithoutHash(document: AdminMapDocumentV1 | AdminMapBodyV1): AdminMapBodyV1 {
  if (!("hash" in document)) return document;
  return {
    schema: document.schema,
    schemaVersion: document.schemaVersion,
    generatorVersion: document.generatorVersion,
    vocabularyVersion: document.vocabularyVersion,
    preset: document.preset,
    seed: document.seed,
    width: document.width,
    height: document.height,
    topology: document.topology,
    cells: document.cells,
    pointFeatures: document.pointFeatures,
    edgeFeatures: document.edgeFeatures,
  };
}

export function adminMapContentHash(
  document: AdminMapDocumentV1 | AdminMapBodyV1,
): `sha256:${string}` {
  return `sha256:${sha256Hex(canonicalJson(bodyWithoutHash(document) as unknown as CanonicalJsonValue))}`;
}

function hashesEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function validateAdminMap(value: unknown): AdminMapDocumentV1 {
  const document = validateAdminMapStructure(value);
  const expectedHash = adminMapContentHash(document);
  if (!hashesEqual(document.hash, expectedHash)) fail("$.hash", "does not match the canonical map content");
  return document;
}

export function createAdminMapDocument(body: AdminMapBodyV1): AdminMapDocumentV1 {
  const document: AdminMapDocumentV1 = {
    ...body,
    hash: adminMapContentHash(body),
  };
  return validateAdminMap(document);
}

export function exportAdminMap(document: AdminMapDocumentV1): string {
  return canonicalJson(validateAdminMap(document) as unknown as CanonicalJsonValue);
}

export function importAdminMap(serialized: string): AdminMapDocumentV1 {
  if (typeof serialized !== "string") fail("$", "serialized map must be a string");
  if (serialized.length === 0 || serialized.length > ADMIN_MAP_MAX_IMPORT_CHARACTERS) {
    fail("$", `serialized map must contain 1-${ADMIN_MAP_MAX_IMPORT_CHARACTERS} characters`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    fail("$", "serialized map is not valid JSON");
  }
  return validateAdminMap(parsed);
}

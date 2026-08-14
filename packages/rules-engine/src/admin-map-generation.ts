import { createSeededRandom, hashSeed, type SeededRandom } from "./rng";
import {
  ADMIN_MAP_GENERATOR_VERSION,
  ADMIN_MAP_MAX_HEIGHT,
  ADMIN_MAP_MAX_WIDTH,
  ADMIN_MAP_MIN_HEIGHT,
  ADMIN_MAP_MIN_WIDTH,
  ADMIN_MAP_SCHEMA,
  ADMIN_MAP_SCHEMA_VERSION,
  ADMIN_MAP_VOCABULARY_VERSION,
  AdminMapValidationError,
  analyzeAdminMapTopology,
  createAdminMapDocument,
  getAdminMapEdgeFeatureDefinition,
  getAdminMapPointFeatureDefinition,
  getAdminMapTerrainDefinition,
  type AdminMapBodyV1,
  type AdminMapCellV1,
  type AdminMapDocumentV1,
  type AdminMapEdgeFeatureId,
  type AdminMapEdgeFeatureV1,
  type AdminMapHexDirection,
  type AdminMapPointFeatureId,
  type AdminMapPointFeatureV1,
  type AdminMapPresetId,
  type AdminMapVisualBiomeId,
} from "./admin-map-domain";

export interface AdminMapGenerationOptions {
  readonly preset: AdminMapPresetId;
  readonly seed: string;
  readonly width?: number;
  readonly height?: number;
}

const DEFAULT_WIDTH = 36;
const DEFAULT_HEIGHT = 24;

interface Coord {
  q: number;
  r: number;
}

const DIRECTIONS: readonly Coord[] = Object.freeze([
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
]);

const PRESET_LAND_RATIOS: Readonly<Record<AdminMapPresetId, number>> = Object.freeze({
  DESERT_CONTINENT: 0.53,
  URBAN_CONTINENT: 0.58,
  ISLANDS: 0.22,
  MIXED: 0.55,
  ICY: 0.5,
});

const PRESET_BIOMES: Readonly<Record<AdminMapPresetId, readonly AdminMapVisualBiomeId[]>> = Object.freeze({
  DESERT_CONTINENT: [
    "ARID_DESERT",
    "ARID_DESERT",
    "ARID_DUNES",
    "ARID_BADLANDS",
    "ARID_SALT_FLAT",
    "ARID_MESA",
    "LOWLANDS_OPEN",
    "HIGHLANDS_BASALT_RIDGE",
  ],
  URBAN_CONTINENT: [
    "LOWLANDS_URBAN",
    "LOWLANDS_URBAN",
    "LOWLANDS_FARMLAND",
    "LOWLANDS_OPEN",
    "FORESTS_CORINTH_PINE",
    "WETLANDS_ASH_MARSH",
    "HIGHLANDS_BASALT_RIDGE",
  ],
  ISLANDS: [
    "LOWLANDS_GRASSLAND",
    "LOWLANDS_OPEN",
    "FORESTS_RAINFOREST",
    "FORESTS_DENSE",
    "WETLANDS_MANGROVE",
    "HIGHLANDS_HILLS",
  ],
  MIXED: [
    "LOWLANDS_OPEN",
    "LOWLANDS_GRASSLAND",
    "LOWLANDS_SCRUB",
    "LOWLANDS_FARMLAND",
    "FORESTS_CORINTH_PINE",
    "FORESTS_DECIDUOUS",
    "FORESTS_DENSE",
    "WETLANDS_ASH_MARSH",
    "WETLANDS_SWAMP",
    "HIGHLANDS_BASALT_RIDGE",
    "HIGHLANDS_HILLS",
    "ARID_BADLANDS",
    "COLD_TUNDRA",
  ],
  ICY: [
    "COLD_TUNDRA",
    "COLD_TUNDRA",
    "COLD_TAIGA",
    "COLD_SNOWFIELD",
    "COLD_GLACIER",
    "COLD_ICE_CAP",
    "HIGHLANDS_BASALT_RIDGE",
    "LOWLANDS_OPEN",
  ],
});

const PRESET_POINT_FEATURES: Readonly<Record<AdminMapPresetId, readonly AdminMapPointFeatureId[]>> = Object.freeze({
  DESERT_CONTINENT: ["CITY", "AIRFIELD", "TOWN", "OUTPOST", "RADAR", "TRENCH"],
  URBAN_CONTINENT: ["CITY", "AIRFIELD", "TOWN", "OUTPOST", "RADAR", "TRENCH"],
  ISLANDS: ["AIRFIELD", "TOWN", "OUTPOST", "RADAR", "TRENCH"],
  MIXED: ["CITY", "AIRFIELD", "TOWN", "OUTPOST", "RADAR", "TRENCH"],
  ICY: ["AIRFIELD", "TOWN", "OUTPOST", "RADAR", "TRENCH"],
});

function key(coord: Coord): string {
  return `${coord.q},${coord.r}`;
}

function compareCoords(left: Coord, right: Coord): number {
  return left.q - right.q || left.r - right.r;
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function inside(coord: Coord, width: number, height: number): boolean {
  return coord.q >= 0 && coord.q < width && coord.r >= 0 && coord.r < height;
}

function interior(coord: Coord, width: number, height: number): boolean {
  return coord.q > 0 && coord.q < width - 1 && coord.r > 0 && coord.r < height - 1;
}

function neighbours(coord: Coord): Coord[] {
  return DIRECTIONS.map((direction) => ({ q: coord.q + direction.q, r: coord.r + direction.r }));
}

function distance(left: Coord, right: Coord): number {
  const q = left.q - right.q;
  const r = left.r - right.r;
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

function allCoordinates(width: number, height: number): Coord[] {
  const result: Coord[] = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) result.push({ q, r });
  }
  return result;
}

function nearestAllowedCoordinate(
  preferred: Coord,
  coordinates: readonly Coord[],
  allowed: (coord: Coord) => boolean,
): Coord {
  const candidates = coordinates.filter(allowed).sort((left, right) =>
    distance(left, preferred) - distance(right, preferred) || compareCoords(left, right));
  if (!candidates[0]) throw new AdminMapValidationError("$options", "map dimensions cannot support the requested topology");
  return candidates[0];
}

function growConnectedRegion(
  start: Coord,
  targetCount: number,
  random: SeededRandom,
  allowed: (coord: Coord) => boolean,
): Set<string> {
  if (!allowed(start)) throw new AdminMapValidationError("$options", "land seed is not allowed");
  const region = new Set<string>([key(start)]);
  const frontier = new Map<string, Coord>();
  const addFrontier = (coord: Coord): void => {
    for (const neighbour of neighbours(coord)) {
      const candidateKey = key(neighbour);
      if (!region.has(candidateKey) && allowed(neighbour)) frontier.set(candidateKey, neighbour);
    }
  };
  addFrontier(start);
  while (region.size < targetCount && frontier.size > 0) {
    const candidates = [...frontier.values()].sort(compareCoords);
    const candidate = candidates[random.integer(0, candidates.length - 1)]!;
    frontier.delete(key(candidate));
    region.add(key(candidate));
    addFrontier(candidate);
  }
  return region;
}

function boundaryReachableWater(
  land: ReadonlySet<string>,
  width: number,
  height: number,
): Set<string> {
  const visited = new Set<string>();
  const pending: Coord[] = [];
  for (const coord of allCoordinates(width, height)) {
    if (coord.q !== 0 && coord.q !== width - 1 && coord.r !== 0 && coord.r !== height - 1) continue;
    if (land.has(key(coord))) continue;
    visited.add(key(coord));
    pending.push(coord);
  }
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]!;
    for (const neighbour of neighbours(current)) {
      const neighbourKey = key(neighbour);
      if (!inside(neighbour, width, height) || land.has(neighbourKey) || visited.has(neighbourKey)) continue;
      visited.add(neighbourKey);
      pending.push(neighbour);
    }
  }
  return visited;
}

function fillEnclosedWater(land: Set<string>, width: number, height: number): void {
  const outsideWater = boundaryReachableWater(land, width, height);
  for (const coord of allCoordinates(width, height)) {
    const coordKey = key(coord);
    if (!land.has(coordKey) && !outsideWater.has(coordKey)) land.add(coordKey);
  }
}

function createContinent(
  preset: AdminMapPresetId,
  width: number,
  height: number,
  random: SeededRandom,
): Set<string> {
  const coordinates = allCoordinates(width, height);
  const preferred = {
    q: Math.floor(width / 2) + random.integer(-1, 1),
    r: Math.floor(height / 2) + random.integer(-1, 1),
  };
  const start = nearestAllowedCoordinate(preferred, coordinates, (coord) => interior(coord, width, height));
  const interiorCount = (width - 2) * (height - 2);
  const target = Math.max(1, Math.floor(interiorCount * PRESET_LAND_RATIOS[preset]));
  const land = growConnectedRegion(start, target, random, (coord) => interior(coord, width, height));
  fillEnclosedWater(land, width, height);
  return land;
}

function createIslands(width: number, height: number, random: SeededRandom): Set<string> {
  const coordinates = allCoordinates(width, height);
  const land = new Set<string>();
  const preferredCenters: readonly Coord[] = [
    { q: Math.floor(width * 0.24), r: Math.floor(height * 0.3) },
    { q: Math.floor(width * 0.72), r: Math.floor(height * 0.3) },
    { q: Math.floor(width * 0.48), r: Math.floor(height * 0.72) },
  ];
  const targetPerIsland = Math.max(
    3,
    Math.floor(((width - 2) * (height - 2) * PRESET_LAND_RATIOS.ISLANDS) / preferredCenters.length),
  );
  for (const preferred of preferredCenters) {
    const allowed = (coord: Coord): boolean =>
      interior(coord, width, height)
      && !land.has(key(coord))
      && neighbours(coord).every((neighbour) => !land.has(key(neighbour)));
    const start = nearestAllowedCoordinate(preferred, coordinates, allowed);
    const island = growConnectedRegion(start, targetPerIsland, random, allowed);
    for (const cellKey of island) land.add(cellKey);
  }
  fillEnclosedWater(land, width, height);
  return land;
}

function waterDepths(land: ReadonlySet<string>, width: number, height: number): Map<string, number> {
  const depths = new Map<string, number>();
  const pending: Coord[] = [];
  for (const coord of allCoordinates(width, height)) {
    if (!land.has(key(coord))) continue;
    depths.set(key(coord), 0);
    pending.push(coord);
  }
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]!;
    const nextDepth = depths.get(key(current))! + 1;
    for (const neighbour of neighbours(current)) {
      const neighbourKey = key(neighbour);
      if (!inside(neighbour, width, height) || depths.has(neighbourKey)) continue;
      depths.set(neighbourKey, nextDepth);
      pending.push(neighbour);
    }
  }
  return depths;
}

function selectAnchors(
  landCoords: readonly Coord[],
  preset: AdminMapPresetId,
  random: SeededRandom,
): Array<{ coord: Coord; biome: AdminMapVisualBiomeId }> {
  const palette = PRESET_BIOMES[preset];
  const available = [...landCoords].sort(compareCoords);
  const anchorCount = Math.max(1, Math.min(18, Math.ceil(landCoords.length / 45)));
  const anchors: Array<{ coord: Coord; biome: AdminMapVisualBiomeId }> = [];
  for (let index = 0; index < anchorCount && available.length > 0; index += 1) {
    const selected = random.integer(0, available.length - 1);
    const coord = available.splice(selected, 1)[0]!;
    anchors.push({ coord, biome: palette[random.integer(0, palette.length - 1)]! });
  }
  return anchors;
}

function waterBiome(preset: AdminMapPresetId, depth: number, coord: Coord, seed: string): AdminMapVisualBiomeId {
  if (preset === "ICY" && depth <= 2 && hashSeed(`${seed}:ice:${coord.q}:${coord.r}`) % 5 !== 0) return "WATER_ICE";
  if (depth <= 1) return "WATER_COAST";
  if (depth <= 2) return "WATER_SHALLOW";
  if (depth >= 6) return "WATER_DEEP";
  return "WATER_OCEAN";
}

function createCells(
  preset: AdminMapPresetId,
  seed: string,
  width: number,
  height: number,
  land: ReadonlySet<string>,
  random: SeededRandom,
): AdminMapCellV1[] {
  const coordinates = allCoordinates(width, height);
  const landCoords = coordinates.filter((coord) => land.has(key(coord)));
  const anchors = selectAnchors(landCoords, preset, random);
  const depths = waterDepths(land, width, height);
  return coordinates.sort(compareCoords).map((coord) => {
    let visualBiomeId: AdminMapVisualBiomeId;
    if (land.has(key(coord))) {
      visualBiomeId = anchors
        .map((anchor, index) => ({ anchor, index, distance: distance(coord, anchor.coord) }))
        .sort((left, right) => left.distance - right.distance || left.index - right.index)[0]!.anchor.biome;
    } else {
      visualBiomeId = waterBiome(preset, depths.get(key(coord)) ?? width + height, coord, seed);
    }
    const definition = getAdminMapTerrainDefinition(visualBiomeId);
    if (!definition) throw new AdminMapValidationError("$generator", `unknown visual biome ${visualBiomeId}`);
    return {
      q: coord.q,
      r: coord.r,
      visualBiomeId,
      terrainGroup: definition.group,
      mechanicalTerrainProfileId: definition.mechanicalTerrainProfileId,
      mechanicsStatus: definition.mechanicsStatus,
    };
  });
}

function evenlyDistributedLandCells(
  cells: readonly AdminMapCellV1[],
  count: number,
  random: SeededRandom,
): AdminMapCellV1[] {
  const available = cells.filter((cell) => cell.terrainGroup !== "WATER").sort(compareCoords);
  const chosen: AdminMapCellV1[] = [];
  while (chosen.length < count && available.length > 0) {
    const sampleSize = Math.min(available.length, 24);
    let bestIndex = random.integer(0, available.length - 1);
    let bestDistance = -1;
    for (let sample = 0; sample < sampleSize; sample += 1) {
      const candidateIndex = random.integer(0, available.length - 1);
      const candidate = available[candidateIndex]!;
      const minimumDistance = chosen.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...chosen.map((existing) => distance(existing, candidate)));
      if (minimumDistance > bestDistance) {
        bestDistance = minimumDistance;
        bestIndex = candidateIndex;
      }
    }
    chosen.push(available.splice(bestIndex, 1)[0]!);
  }
  return chosen;
}

function createPointFeatures(
  preset: AdminMapPresetId,
  cells: readonly AdminMapCellV1[],
  random: SeededRandom,
): AdminMapPointFeatureV1[] {
  const featureIds = PRESET_POINT_FEATURES[preset];
  const positions = evenlyDistributedLandCells(cells, featureIds.length, random);
  return featureIds.map((featureId, index) => {
    const definition = getAdminMapPointFeatureDefinition(featureId)!;
    const position = positions[index]!;
    return {
      id: `point:${index.toString().padStart(2, "0")}:${featureId.toLowerCase()}`,
      featureId,
      q: position.q,
      r: position.r,
      mechanicalFeatureId: definition.mechanicalFeatureId,
      mechanicsStatus: definition.mechanicsStatus,
    };
  }).sort((left, right) => codePointCompare(left.id, right.id));
}

interface CanonicalEdge {
  q: number;
  r: number;
  direction: AdminMapHexDirection;
}

function canonicalLandEdges(cells: readonly AdminMapCellV1[]): CanonicalEdge[] {
  const land = new Map(cells.filter((cell) => cell.terrainGroup !== "WATER").map((cell) => [key(cell), cell]));
  const edges: CanonicalEdge[] = [];
  for (const cell of [...land.values()].sort(compareCoords)) {
    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      const delta = DIRECTIONS[direction]!;
      const target = land.get(key({ q: cell.q + delta.q, r: cell.r + delta.r }));
      if (!target || compareCoords(cell, target) >= 0) continue;
      edges.push({ q: cell.q, r: cell.r, direction: direction as AdminMapHexDirection });
    }
  }
  return edges;
}

function createEdgeFeature(
  featureId: AdminMapEdgeFeatureId,
  edge: CanonicalEdge,
  index: number,
): AdminMapEdgeFeatureV1 {
  const definition = getAdminMapEdgeFeatureDefinition(featureId)!;
  return {
    id: `edge:${index.toString().padStart(2, "0")}:${featureId.toLowerCase()}`,
    featureId,
    ...edge,
    mechanicalFeatureId: definition.mechanicalFeatureId,
    mechanicsStatus: definition.mechanicsStatus,
  };
}

function createEdgeFeatures(cells: readonly AdminMapCellV1[], random: SeededRandom): AdminMapEdgeFeatureV1[] {
  const available = canonicalLandEdges(cells);
  if (available.length < 4) throw new AdminMapValidationError("$generator", "generated land lacks enough internal edges");
  const selected: CanonicalEdge[] = [];
  while (selected.length < 4) {
    selected.push(available.splice(random.integer(0, available.length - 1), 1)[0]!);
  }
  const bridgeEdge = selected[2]!;
  return [
    createEdgeFeature("ROAD", selected[0]!, 0),
    createEdgeFeature("PATH", selected[1]!, 1),
    createEdgeFeature("RIVER", bridgeEdge, 2),
    createEdgeFeature("ROAD", bridgeEdge, 3),
    createEdgeFeature("BRIDGE", bridgeEdge, 4),
    createEdgeFeature("WALL", selected[3]!, 5),
  ].sort((left, right) => codePointCompare(left.id, right.id));
}

function generationInteger(
  value: number | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new AdminMapValidationError(`$options.${name}`, `must be a safe integer from ${minimum} through ${maximum}`);
  }
  return result;
}

/**
 * Generates deterministic authoring content pinned to the published @2
 * vocabulary. Runtime callers materialize its explicit profiles through
 * materializeAdminMapBattlefield; generation itself stays storage agnostic.
 */
export function generateAdminMap(options: AdminMapGenerationOptions): AdminMapDocumentV1 {
  if (!options || typeof options !== "object") {
    throw new AdminMapValidationError("$options", "must be an object");
  }
  if (!(Object.keys(PRESET_LAND_RATIOS) as AdminMapPresetId[]).includes(options.preset)) {
    throw new AdminMapValidationError("$options.preset", "is not a supported generator preset");
  }
  if (typeof options.seed !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(options.seed)) {
    throw new AdminMapValidationError(
      "$options.seed",
      "must contain 1-128 stable ASCII letters, digits, dot, underscore, colon, or hyphen",
    );
  }
  const width = generationInteger(options.width, DEFAULT_WIDTH, "width", ADMIN_MAP_MIN_WIDTH, ADMIN_MAP_MAX_WIDTH);
  const height = generationInteger(options.height, DEFAULT_HEIGHT, "height", ADMIN_MAP_MIN_HEIGHT, ADMIN_MAP_MAX_HEIGHT);
  const random = createSeededRandom(`${ADMIN_MAP_GENERATOR_VERSION}:${options.preset}:${options.seed}:${width}:${height}`);
  const land = options.preset === "ISLANDS"
    ? createIslands(width, height, random)
    : createContinent(options.preset, width, height, random);
  const cells = createCells(options.preset, options.seed, width, height, land, random);
  const topology = analyzeAdminMapTopology(cells);
  const body: AdminMapBodyV1 = {
    schema: ADMIN_MAP_SCHEMA,
    schemaVersion: ADMIN_MAP_SCHEMA_VERSION,
    generatorVersion: ADMIN_MAP_GENERATOR_VERSION,
    vocabularyVersion: ADMIN_MAP_VOCABULARY_VERSION,
    preset: options.preset,
    seed: options.seed,
    width,
    height,
    topology: {
      land: options.preset === "ISLANDS" ? "ARCHIPELAGO" : "CONTIGUOUS",
      water: "CONTIGUOUS",
      landComponents: topology.landComponents,
      waterComponents: 1,
    },
    cells,
    pointFeatures: createPointFeatures(options.preset, cells, random),
    edgeFeatures: createEdgeFeatures(cells, random),
  };
  return createAdminMapDocument(body);
}

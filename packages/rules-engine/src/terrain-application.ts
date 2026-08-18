import type {
  AdminMapDocumentV1,
  AdminMapEdgeFeatureId,
  AdminMapEdgeFeatureV1,
  AdminMapMechanicalTerrainProfileId,
  AdminMapPointFeatureId,
  AdminMapPointFeatureV1,
  AdminMapVisualBiomeId,
} from "./admin-map-domain";
import {
  ADMIN_MAP_TERRAIN_VOCABULARY,
  getAdminMapEdgeFeatureDefinition,
  validateAdminMap,
} from "./admin-map-domain";
import type {
  BattlefieldHex,
  BattlefieldHexMovementRules,
  Facing,
  HexEdgeFeatures,
} from "../../domain/src";
import { INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING } from "./cover";

/**
 * User-authorised application ruling for playable custom maps. The profile is
 * versioned independently from visuals and the V5 catalogue so later balance
 * revisions cannot silently change a published map.
 */
export const CUSTOM_MAP_TERRAIN_APPLICATION_PROFILE_ID =
  "corinth-custom-map-terrain-application@2" as const;
export const CUSTOM_MAP_RIVER_CROSSING_SURCHARGE = 1 as const;
export const CUSTOM_MAP_MARSH_MOVEMENT_COST = 1.5 as const;
export const CUSTOM_MAP_PATH_MULTIPLIER = 0.75 as const;
export const CUSTOM_MAP_ROAD_MULTIPLIER = 0.5 as const;

export interface CustomMapTerrainMechanicalProfile {
  readonly movementCost: number;
  readonly elevation: number;
  readonly blocksLineOfSight: boolean;
  readonly lineOfSightModifier: number;
  readonly capacity: number;
  readonly groundTraversal: "PASSABLE" | "IMPASSABLE";
  readonly allowedGroundTraversalTags?: readonly string[];
  readonly environment: readonly string[];
}

const COVER = [INFANTRY_COVER_ARMOR_1] as const;
const GARRISON = [INFANTRY_COVER_ARMOR_1, INFANTRY_GARRISON_BUILDING] as const;
const AMPHIBIOUS = ["AMPHIBIOUS", "WATER_TRAVERSAL"] as const;
const MOUNTAIN = ["MOUNTAIN_TRAVERSAL"] as const;

/**
 * Conservative application mechanics approved for every authoring profile.
 * A cost of 1 is normal ground; quarter-point increments preserve the engine's
 * speed economy. Deep water deliberately has no ground exception.
 */
export const CUSTOM_MAP_TERRAIN_MECHANICS: Readonly<Record<
  AdminMapMechanicalTerrainProfileId,
  CustomMapTerrainMechanicalProfile
>> = Object.freeze({
  "terrain-open": profile(1, 0, false, 0, 3),
  "terrain-rough": profile(1.25, 0, false, 0, 3),
  "terrain-urban": profile(1.25, 0, true, -1, 4, "PASSABLE", undefined, [...GARRISON, "POPULATION_CENTER"]),
  "terrain-forest": profile(1.25, 0, true, -1, 2, "PASSABLE", undefined, COVER),
  "terrain-dense-forest": profile(1.5, 0, true, -1, 2, "PASSABLE", undefined, COVER),
  "terrain-jungle": profile(1.75, 0, true, -1, 1, "PASSABLE", undefined, COVER),
  "terrain-wetland": profile(1.25, 0, false, 0, 2),
  "terrain-marsh": profile(CUSTOM_MAP_MARSH_MOVEMENT_COST, 0, false, 0, 2),
  "terrain-swamp": profile(1.75, 0, true, -1, 1, "PASSABLE", undefined, COVER),
  "terrain-bog": profile(2, 0, false, 0, 1),
  "terrain-ridge": profile(1.25, 1, false, 0, 2),
  "terrain-crag": profile(1.5, 2, true, 0, 1),
  "terrain-mountain": profile(1, 2, true, 0, 1, "IMPASSABLE", MOUNTAIN),
  "terrain-mountain-peak": profile(1, 3, true, 0, 1, "IMPASSABLE", MOUNTAIN),
  "terrain-volcano": profile(1, 3, true, 0, 1, "IMPASSABLE", MOUNTAIN, ["HAZARDOUS", "VOLCANIC"]),
  "terrain-desert": profile(1.25, 0, false, 0, 3, "PASSABLE", undefined, ["ARID"]),
  "terrain-dunes": profile(1.5, 0, false, 0, 2, "PASSABLE", undefined, ["ARID"]),
  "terrain-badlands": profile(1.5, 1, false, 0, 2, "PASSABLE", undefined, ["ARID"]),
  "terrain-canyon": profile(1.75, 0, false, 0, 2, "PASSABLE", undefined, ["ARID"]),
  "terrain-crater": profile(1.5, 0, false, 0, 2),
  "terrain-tundra": profile(1.25, 0, false, 0, 3, "PASSABLE", undefined, ["COLD"]),
  "terrain-snowfield": profile(1.5, 0, false, 0, 2, "PASSABLE", undefined, ["COLD"]),
  "terrain-glacier": profile(2, 1, false, 0, 2, "PASSABLE", undefined, ["COLD", "ICE"]),
  "terrain-shallow-water": profile(1.25, 0, false, 0, 2, "IMPASSABLE", AMPHIBIOUS, ["WATER", "SHALLOW_WATER"]),
  "terrain-deep-water": profile(1, 0, false, 0, 1, "IMPASSABLE", undefined, ["WATER", "DEEP_WATER"]),
  "terrain-fresh-water": profile(1.5, 0, false, 0, 1, "IMPASSABLE", AMPHIBIOUS, ["WATER", "FRESH_WATER"]),
  "terrain-frozen-lake": profile(1.5, 0, false, 0, 2, "PASSABLE", undefined, ["COLD", "ICE"]),
  "terrain-rapids": profile(2, 0, false, 0, 1, "IMPASSABLE", AMPHIBIOUS, ["WATER", "RAPIDS"]),
  "terrain-beach": profile(1.25, 0, false, 0, 3, "PASSABLE", undefined, ["COASTAL"]),
});

function profile(
  movementCost: number,
  elevation: number,
  blocksLineOfSight: boolean,
  lineOfSightModifier: number,
  capacity: number,
  groundTraversal: "PASSABLE" | "IMPASSABLE" = "PASSABLE",
  allowedGroundTraversalTags?: readonly string[],
  environment: readonly string[] = [],
): CustomMapTerrainMechanicalProfile {
  return Object.freeze({
    movementCost,
    elevation,
    blocksLineOfSight,
    lineOfSightModifier,
    capacity,
    groundTraversal,
    ...(allowedGroundTraversalTags ? { allowedGroundTraversalTags: Object.freeze([...allowedGroundTraversalTags]) } : {}),
    environment: Object.freeze([...environment]),
  });
}

export interface CustomMapTerrainApplication {
  readonly terrainId: AdminMapMechanicalTerrainProfileId;
  readonly visualTerrainId: AdminMapVisualBiomeId;
  readonly movementCost: number;
  readonly elevation: number;
  readonly blocksLineOfSight: boolean;
  readonly lineOfSightModifier: number;
  readonly capacity: number;
  readonly environment: string[];
  readonly movementRules: BattlefieldHexMovementRules;
}

/** Materialises mechanics by the selected profile, never by parsing a biome ID. */
export function customMapTerrainApplication(
  visualBiomeId: AdminMapVisualBiomeId,
  selectedTerrainId: AdminMapMechanicalTerrainProfileId,
): CustomMapTerrainApplication {
  const authorizedProfile = CUSTOM_MAP_VISUAL_PROFILE_LOOKUP[visualBiomeId];
  if (selectedTerrainId !== authorizedProfile) {
    throw new Error(`CUSTOM_MAP_TERRAIN_PROFILE_MISMATCH:${visualBiomeId}:${selectedTerrainId}`);
  }
  const selected = CUSTOM_MAP_TERRAIN_MECHANICS[selectedTerrainId];
  return {
    terrainId: selectedTerrainId,
    visualTerrainId: visualBiomeId,
    movementCost: selected.movementCost,
    elevation: selected.elevation,
    blocksLineOfSight: selected.blocksLineOfSight,
    lineOfSightModifier: selected.lineOfSightModifier,
    capacity: selected.capacity,
    environment: [...selected.environment],
    movementRules: {
      groundTraversal: selected.groundTraversal,
      applicationProfileId: CUSTOM_MAP_TERRAIN_APPLICATION_PROFILE_ID,
      ...(selected.allowedGroundTraversalTags
        ? { allowedGroundTraversalTags: [...selected.allowedGroundTraversalTags] }
        : {}),
    },
  };
}

export function isCustomMapGroundBlockingBiome(visualBiomeId: string): boolean {
  const terrain = validateVisualBiome(visualBiomeId);
  return terrain !== undefined && CUSTOM_MAP_TERRAIN_MECHANICS[terrain].groundTraversal === "IMPASSABLE";
}

function validateVisualBiome(visualBiomeId: string): AdminMapMechanicalTerrainProfileId | undefined {
  // This compatibility helper is authoring-time only. Runtime traversal reads
  // BattlefieldHex.movementRules and never interprets visual or terrain IDs.
  return CUSTOM_MAP_VISUAL_PROFILE_LOOKUP[visualBiomeId as AdminMapVisualBiomeId];
}

// Populated from the domain vocabulary without exporting a mutable Map. It is
// kept local so compatibility queries cannot become runtime movement policy.
const CUSTOM_MAP_VISUAL_PROFILE_LOOKUP = Object.freeze(Object.fromEntries(
  ADMIN_MAP_TERRAIN_VOCABULARY.flatMap((entry) => entry.mechanicalTerrainProfileId
    ? [[entry.id, entry.mechanicalTerrainProfileId]]
    : []),
) as Record<AdminMapVisualBiomeId, AdminMapMechanicalTerrainProfileId>);

export interface CustomMapPointFeatureMechanicalProfile {
  readonly mechanicalFeatureId: string;
  readonly structureDefinitionId: string;
  readonly minimumCapacity: number;
  readonly minimumElevation: number;
  readonly blocksLineOfSight: boolean;
  readonly lineOfSightModifier: number;
  readonly environment: readonly string[];
}

export interface CustomMapEdgeFeatureMechanicalProfile {
  readonly mechanicalFeatureId: string;
  readonly groundCostMultiplier?: number;
  readonly riverCrossingSurcharge?: number;
  readonly blocksGroundTraversal?: true;
  readonly blocksLineOfSight?: true;
  readonly removesRiverCrossingSurcharge?: true;
}

/** Exact, version-addressed effects for all five authorable edge features. */
export const CUSTOM_MAP_EDGE_FEATURE_MECHANICS: Readonly<Record<
  AdminMapEdgeFeatureId,
  CustomMapEdgeFeatureMechanicalProfile
>> = Object.freeze({
  ROAD: Object.freeze({ mechanicalFeatureId: "edge-road@1", groundCostMultiplier: CUSTOM_MAP_ROAD_MULTIPLIER }),
  PATH: Object.freeze({ mechanicalFeatureId: "edge-path@1", groundCostMultiplier: CUSTOM_MAP_PATH_MULTIPLIER }),
  RIVER: Object.freeze({
    mechanicalFeatureId: "edge-river-crossing@1",
    riverCrossingSurcharge: CUSTOM_MAP_RIVER_CROSSING_SURCHARGE,
  }),
  WALL: Object.freeze({ mechanicalFeatureId: "edge-wall@1", blocksGroundTraversal: true, blocksLineOfSight: true }),
  BRIDGE: Object.freeze({ mechanicalFeatureId: "structure-bridge", removesRiverCrossingSurcharge: true }),
});

export const CUSTOM_MAP_POINT_FEATURE_MECHANICS: Readonly<Record<
  AdminMapPointFeatureId,
  CustomMapPointFeatureMechanicalProfile
>> = Object.freeze({
  CITY: pointProfile("feature-city@1", "structure-custom-city", 8, 0, true, -1,
    [...GARRISON, "POPULATION_CENTER"]),
  AIRFIELD: pointProfile("feature-airfield@1", "structure-custom-airfield", 6, 0, false, 0,
    ["LAND_AEROSPACE", "LAND_VTOL", "REARM_AEROSPACE"]),
  TOWN: pointProfile("feature-town@1", "structure-custom-town", 5, 0, true, -1,
    [...GARRISON, "POPULATION_CENTER"]),
  OUTPOST: pointProfile("feature-outpost@1", "structure-custom-outpost", 4, 0, true, -1,
    [...GARRISON, "SUPPLY_POINT"]),
  RADAR: pointProfile("feature-radar@1", "structure-sensor-tower", 3, 1, false, 0,
    ["SENSOR_ARRAY"]),
  TRENCH: pointProfile("structure-trench", "structure-trench", 2, 0, false, 0,
    [INFANTRY_COVER_ARMOR_1]),
});

function pointProfile(
  mechanicalFeatureId: string,
  structureDefinitionId: string,
  minimumCapacity: number,
  minimumElevation: number,
  blocksLineOfSight: boolean,
  lineOfSightModifier: number,
  environment: readonly string[],
): CustomMapPointFeatureMechanicalProfile {
  return Object.freeze({
    mechanicalFeatureId,
    structureDefinitionId,
    minimumCapacity,
    minimumElevation,
    blocksLineOfSight,
    lineOfSightModifier,
    environment: Object.freeze([...environment]),
  });
}

export interface CustomMapPointFeatureApplication extends CustomMapPointFeatureMechanicalProfile {
  readonly featureId: AdminMapPointFeatureId;
  readonly structureInstanceId: string;
}

export function customMapPointFeatureApplication(
  feature: AdminMapPointFeatureV1,
): CustomMapPointFeatureApplication {
  const selected = CUSTOM_MAP_POINT_FEATURE_MECHANICS[feature.featureId];
  if (feature.mechanicsStatus !== "PUBLISHED" || feature.mechanicalFeatureId !== selected.mechanicalFeatureId) {
    throw new Error(`CUSTOM_MAP_POINT_FEATURE_UNPUBLISHED:${feature.featureId}`);
  }
  return {
    ...selected,
    featureId: feature.featureId,
    structureInstanceId: `${selected.structureDefinitionId}:${feature.id}`,
  };
}

const REAR_FACING = (facing: Facing): Facing => ((facing + 3) % 6) as Facing;

/**
 * Converts canonical undirected Game Master edges to the bidirectional arrays
 * consumed by movement and LOS. Bridges remove river cost only; they do not
 * erase the authored river. Walls remain blockers even if another edge exists.
 */
export function customMapHexEdges(
  edgeFeatures: readonly AdminMapEdgeFeatureV1[],
): ReadonlyMap<string, HexEdgeFeatures> {
  const mutable = new Map<string, {
    rivers: Set<Facing>;
    roads: Set<Facing>;
    bridges: Set<Facing>;
    paths: Set<Facing>;
    walls: Set<Facing>;
  }>();
  const directions = [
    { q: 0, r: -1 },
    { q: 1, r: -1 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
  ] as const;
  const entry = (q: number, r: number) => {
    const key = `${q},${r}`;
    const existing = mutable.get(key);
    if (existing) return existing;
    const created = {
      rivers: new Set<Facing>(),
      roads: new Set<Facing>(),
      bridges: new Set<Facing>(),
      paths: new Set<Facing>(),
      walls: new Set<Facing>(),
    };
    mutable.set(key, created);
    return created;
  };

  for (const feature of edgeFeatures) {
    const definition = getAdminMapEdgeFeatureDefinition(feature.featureId);
    const mechanics = CUSTOM_MAP_EDGE_FEATURE_MECHANICS[feature.featureId];
    if (
      feature.mechanicsStatus !== "PUBLISHED" ||
      !feature.mechanicalFeatureId ||
      feature.mechanicalFeatureId !== definition?.mechanicalFeatureId ||
      feature.mechanicalFeatureId !== mechanics.mechanicalFeatureId
    ) {
      throw new Error(`CUSTOM_MAP_EDGE_FEATURE_UNPUBLISHED:${feature.featureId}`);
    }
    const facing = feature.direction as Facing;
    const delta = directions[facing];
    const source = entry(feature.q, feature.r);
    const target = entry(feature.q + delta.q, feature.r + delta.r);
    const targetFacing = REAR_FACING(facing);
    const add = (name: "rivers" | "roads" | "bridges" | "paths" | "walls"): void => {
      source[name].add(facing);
      target[name].add(targetFacing);
    };
    if (feature.featureId === "RIVER") add("rivers");
    if (feature.featureId === "ROAD") add("roads");
    if (feature.featureId === "BRIDGE") add("bridges");
    if (feature.featureId === "PATH") add("paths");
    if (feature.featureId === "WALL") add("walls");
  }

  return new Map([...mutable.entries()].map(([key, value]) => [key, {
    rivers: [...value.rivers].sort() as Facing[],
    roads: [...value.roads].sort() as Facing[],
    bridges: [...value.bridges].sort() as Facing[],
    paths: [...value.paths].sort() as Facing[],
    walls: [...value.walls].sort() as Facing[],
  }]));
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The sole custom-map document → tactical runtime adapter. It validates the
 * versioned document, copies explicit mechanics into BattlefieldHex fields,
 * and applies point/edge profiles deterministically.
 */
export function materializeAdminMapBattlefield(document: AdminMapDocumentV1): BattlefieldHex[] {
  const validated = validateAdminMap(document);
  const edges = customMapHexEdges(validated.edgeFeatures);
  const points = new Map<string, AdminMapPointFeatureV1[]>();
  for (const feature of validated.pointFeatures) {
    const key = `${feature.q},${feature.r}`;
    const existing = points.get(key) ?? [];
    existing.push(feature);
    points.set(key, existing);
  }

  return validated.cells.map((cell) => {
    if (cell.mechanicsStatus !== "PUBLISHED" || !cell.mechanicalTerrainProfileId) {
      throw new Error(`CUSTOM_MAP_TERRAIN_UNPUBLISHED:${cell.visualBiomeId}`);
    }
    const terrain = customMapTerrainApplication(cell.visualBiomeId, cell.mechanicalTerrainProfileId);
    const key = `${cell.q},${cell.r}`;
    const features = [...(points.get(key) ?? [])].sort((left, right) => codePointCompare(left.id, right.id));
    let capacity = terrain.capacity;
    let elevation = terrain.elevation;
    let blocksLineOfSight = terrain.blocksLineOfSight;
    let lineOfSightModifier = terrain.lineOfSightModifier;
    const structureIds: string[] = [];
    const environment = new Set(terrain.environment);
    for (const feature of features) {
      const application = customMapPointFeatureApplication(feature);
      capacity = Math.max(capacity, application.minimumCapacity);
      elevation = Math.max(elevation, application.minimumElevation);
      blocksLineOfSight ||= application.blocksLineOfSight;
      lineOfSightModifier = Math.min(lineOfSightModifier, application.lineOfSightModifier);
      structureIds.push(application.structureInstanceId);
      application.environment.forEach((tag) => environment.add(tag));
    }
    return {
      coord: { q: cell.q, r: cell.r },
      terrainId: terrain.terrainId,
      visualTerrainId: terrain.visualTerrainId,
      elevation,
      movementCost: terrain.movementCost,
      movementRules: structuredClone(terrain.movementRules),
      blocksLineOfSight,
      lineOfSightModifier,
      capacity,
      edges: structuredClone(edges.get(key) ?? {
        rivers: [], roads: [], bridges: [], paths: [], walls: [],
      }),
      structureIds,
      control: "NEUTRAL",
      environment: [...environment].sort(codePointCompare),
      visibility: "UNKNOWN",
    };
  });
}

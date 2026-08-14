import type { AxialCoord } from "../packages/domain/src";
import type { AdminMapVisualBiomeId } from "../packages/rules-engine/src/admin-map-domain";
import { coordKey, HEX_DIRECTIONS } from "../packages/rules-engine/src";

export type TacticalTerrainKind =
  | "OPEN"
  | "FOREST"
  | "RIDGE"
  | "MARSH"
  | "ARID"
  | "COLD"
  | "URBAN"
  | "WATER_SHALLOW"
  | "WATER_DEEP";

export interface TacticalTerrainStyle {
  fill: string;
  shadow: string;
  highlight: string;
  accent: string;
  detail: string;
  contour: string;
  grid: string;
}

export interface TacticalTerrainVisualProfile {
  readonly kind: TacticalTerrainKind;
  readonly motif: string;
  readonly paletteOffset: number;
  readonly hydrographic: boolean;
}

function visualProfile(
  kind: TacticalTerrainKind,
  motif: string,
  paletteOffset: number,
  hydrographic = false,
): TacticalTerrainVisualProfile {
  return Object.freeze({ kind, motif, paletteOffset, hydrographic });
}

/**
 * Presentation-only bindings for the pinned admin-map-vocabulary@2 terrain IDs.
 * These profiles never alter movement, cover, or any other rules value.
 */
export const TACTICAL_VISUAL_TERRAIN_PROFILES = Object.freeze({
  LOWLANDS_OPEN: visualProfile("OPEN", "OPEN", 0),
  LOWLANDS_LOWLANDS: visualProfile("OPEN", "LOWLANDS", 1),
  LOWLANDS_PLAINS: visualProfile("OPEN", "PLAINS", 2),
  LOWLANDS_GRASSLAND: visualProfile("OPEN", "GRASSLAND", 3),
  LOWLANDS_MEADOW: visualProfile("OPEN", "MEADOW", 4),
  LOWLANDS_VALLEY: visualProfile("OPEN", "VALLEY", 0),
  LOWLANDS_HEATH: visualProfile("OPEN", "HEATH", 1),
  LOWLANDS_SAVANNA: visualProfile("OPEN", "SAVANNA", 2),
  LOWLANDS_STEPPE: visualProfile("OPEN", "STEPPE", 3),
  LOWLANDS_SCRUB: visualProfile("OPEN", "SCRUB", 4),
  LOWLANDS_FARMLAND: visualProfile("OPEN", "FARMLAND", 1),
  LOWLANDS_URBAN: visualProfile("URBAN", "URBAN", 2),

  FORESTS_CORINTH_PINE: visualProfile("FOREST", "PINE", 0),
  FORESTS_FOREST: visualProfile("FOREST", "FOREST", 1),
  FORESTS_DECIDUOUS: visualProfile("FOREST", "DECIDUOUS", 2),
  FORESTS_DENSE: visualProfile("FOREST", "DENSE_FOREST", 3),
  FORESTS_JUNGLE: visualProfile("FOREST", "JUNGLE", 4),
  FORESTS_GLADE: visualProfile("OPEN", "GLADE", 2),
  FORESTS_RAINFOREST: visualProfile("FOREST", "RAINFOREST", 1),
  FORESTS_BURNT: visualProfile("ARID", "BURNT_FOREST", 4),

  WETLANDS_ASH_MARSH: visualProfile("MARSH", "ASH_MARSH", 0),
  WETLANDS_WETLANDS: visualProfile("MARSH", "WETLANDS", 1),
  WETLANDS_SWAMP: visualProfile("MARSH", "SWAMP", 2),
  WETLANDS_MARSH: visualProfile("MARSH", "MARSH", 3),
  WETLANDS_BOG: visualProfile("MARSH", "BOG", 4),
  WETLANDS_FLOODPLAIN: visualProfile("MARSH", "FLOODPLAIN", 1),
  WETLANDS_MANGROVE: visualProfile("MARSH", "MANGROVE", 2),

  HIGHLANDS_BASALT_RIDGE: visualProfile("RIDGE", "BASALT_RIDGE", 0),
  HIGHLANDS_HIGHLANDS: visualProfile("RIDGE", "HIGHLANDS", 1),
  HIGHLANDS_HILLS: visualProfile("RIDGE", "HILLS", 2),
  HIGHLANDS_HILL: visualProfile("RIDGE", "HILL", 3),
  HIGHLANDS_CRAG: visualProfile("RIDGE", "CRAG", 4),
  HIGHLANDS_MOUNTAIN: visualProfile("RIDGE", "MOUNTAIN", 0),
  HIGHLANDS_MOUNTAINS: visualProfile("RIDGE", "MOUNTAINS", 1),
  HIGHLANDS_MOUNTAIN_PEAK: visualProfile("RIDGE", "MOUNTAIN_PEAK", 2),
  HIGHLANDS_VOLCANO: visualProfile("RIDGE", "VOLCANO", 3),
  HIGHLANDS_CLIFFS: visualProfile("RIDGE", "CLIFFS", 4),
  HIGHLANDS_VOLCANIC: visualProfile("RIDGE", "VOLCANIC", 2),

  ARID_DESERT: visualProfile("ARID", "DESERT", 0),
  ARID_ARID: visualProfile("ARID", "ARID", 1),
  ARID_DUNES: visualProfile("ARID", "DUNES", 2),
  ARID_BADLANDS: visualProfile("ARID", "BADLANDS", 3),
  ARID_CANYON: visualProfile("ARID", "CANYON", 4),
  ARID_CRATER: visualProfile("ARID", "CRATER", 0),
  ARID_SALT_FLAT: visualProfile("ARID", "SALT_FLAT", 1),
  ARID_MESA: visualProfile("ARID", "MESA", 2),

  COLD_TUNDRA: visualProfile("COLD", "TUNDRA", 0),
  COLD_COLD: visualProfile("COLD", "COLD", 1),
  COLD_TAIGA: visualProfile("FOREST", "TAIGA", 2),
  COLD_SNOWFIELD: visualProfile("COLD", "SNOWFIELD", 3),
  COLD_GLACIER: visualProfile("COLD", "GLACIER", 4),
  COLD_ICE_CAP: visualProfile("COLD", "ICE_CAP", 2),

  WATER_COAST: visualProfile("WATER_SHALLOW", "COAST", 0, true),
  WATER_WATER: visualProfile("WATER_SHALLOW", "FRESH_WATER", 1, true),
  WATER_OPEN_WATER: visualProfile("WATER_DEEP", "OPEN_WATER", 2, true),
  WATER_SHALLOW: visualProfile("WATER_SHALLOW", "SHALLOW_WATER", 3, true),
  WATER_OCEAN: visualProfile("WATER_DEEP", "OCEAN", 4, true),
  WATER_DEEP: visualProfile("WATER_DEEP", "DEEP_OCEAN", 0, true),
  WATER_SEA: visualProfile("WATER_DEEP", "SEA", 1, true),
  WATER_FRESH: visualProfile("WATER_SHALLOW", "FRESH_WATER", 2, true),
  WATER_LAKE: visualProfile("WATER_SHALLOW", "LAKE", 3, true),
  WATER_POND: visualProfile("WATER_SHALLOW", "POND", 4, true),
  WATER_FROZEN_LAKE: visualProfile("COLD", "FROZEN_LAKE", 0, true),
  WATER_RAPIDS: visualProfile("WATER_SHALLOW", "RAPIDS", 1, true),
  WATER_COASTAL: visualProfile("WATER_SHALLOW", "COASTAL", 2, true),
  WATER_COAST_BEACH: visualProfile("ARID", "BEACH", 3),
  WATER_ICE: visualProfile("COLD", "ICE_WATER", 4, true),
} satisfies Record<AdminMapVisualBiomeId, TacticalTerrainVisualProfile>);

const VISUAL_PROFILE_INDEX: Readonly<Record<string, TacticalTerrainVisualProfile>> =
  TACTICAL_VISUAL_TERRAIN_PROFILES;

export type TacticalWaterDepth = 1 | 2 | 3;

export interface TacticalWaterHex {
  coord: AxialCoord;
  depth: TacticalWaterDepth;
}

export const TACTICAL_TERRAIN_PALETTES: Readonly<Record<TacticalTerrainKind, readonly TacticalTerrainStyle[]>> = {
  OPEN: [
    { fill: "#687052", shadow: "#3d4a3c", highlight: "#9aa071", accent: "#7f895f", detail: "#c0b879", contour: "#ddd09a", grid: "rgba(31, 54, 50, .44)" },
    { fill: "#707155", shadow: "#474b3b", highlight: "#a6a276", accent: "#88885f", detail: "#c8b97b", contour: "#e0d09a", grid: "rgba(38, 57, 51, .44)" },
    { fill: "#607052", shadow: "#394b3e", highlight: "#91a072", accent: "#74895e", detail: "#afb878", contour: "#d3ce96", grid: "rgba(29, 56, 50, .44)" },
    { fill: "#747258", shadow: "#4a4939", highlight: "#aaa47a", accent: "#8b8963", detail: "#cabd80", contour: "#e2d19a", grid: "rgba(42, 58, 50, .44)" },
    { fill: "#646c51", shadow: "#3e483b", highlight: "#989b70", accent: "#79835d", detail: "#b7b477", contour: "#d7ca91", grid: "rgba(34, 54, 49, .44)" },
  ],
  FOREST: [
    { fill: "#365b43", shadow: "#18382f", highlight: "#62825b", accent: "#294d38", detail: "#83a16b", contour: "#b3bd82", grid: "rgba(20, 56, 48, .5)" },
    { fill: "#315a4d", shadow: "#153934", highlight: "#5c8274", accent: "#254c42", detail: "#76a08c", contour: "#a9bd99", grid: "rgba(18, 57, 53, .5)" },
    { fill: "#3d6244", shadow: "#1d3c2d", highlight: "#6f8a5c", accent: "#31543a", detail: "#8aa870", contour: "#bdc689", grid: "rgba(23, 61, 48, .5)" },
    { fill: "#31523d", shadow: "#163329", highlight: "#5c7653", accent: "#274633", detail: "#769262", contour: "#a8b47a", grid: "rgba(18, 51, 43, .5)" },
    { fill: "#426048", shadow: "#213a2e", highlight: "#718261", accent: "#36523c", detail: "#91a36e", contour: "#bdc083", grid: "rgba(25, 58, 48, .5)" },
  ],
  RIDGE: [
    { fill: "#755f45", shadow: "#3c372f", highlight: "#aa8d62", accent: "#62513d", detail: "#c2a26e", contour: "#ead19a", grid: "rgba(62, 52, 40, .5)" },
    { fill: "#7b6750", shadow: "#433b32", highlight: "#b0956b", accent: "#685743", detail: "#c9aa7a", contour: "#edd6a5", grid: "rgba(67, 57, 45, .5)" },
    { fill: "#6b6154", shadow: "#3b3a37", highlight: "#998c78", accent: "#5b5349", detail: "#b1a187", contour: "#d9cab0", grid: "rgba(58, 56, 52, .5)" },
    { fill: "#806348", shadow: "#49372b", highlight: "#b48b5c", accent: "#6d5038", detail: "#cca069", contour: "#efd099", grid: "rgba(72, 52, 38, .5)" },
    { fill: "#6c6356", shadow: "#3c3b37", highlight: "#9b907c", accent: "#5c554b", detail: "#b3a48e", contour: "#dccdb6", grid: "rgba(59, 57, 53, .5)" },
  ],
  MARSH: [
    { fill: "#58664e", shadow: "#2f443b", highlight: "#7d8964", accent: "#465949", detail: "#9a9c68", contour: "#bec194", grid: "rgba(38, 61, 53, .48)" },
    { fill: "#626b50", shadow: "#39473b", highlight: "#878d68", accent: "#505d49", detail: "#a4a16d", contour: "#c7c59a", grid: "rgba(44, 63, 53, .48)" },
    { fill: "#52634f", shadow: "#2b423d", highlight: "#74876a", accent: "#40564a", detail: "#8f9c76", contour: "#b7c19f", grid: "rgba(34, 60, 54, .48)" },
    { fill: "#697058", shadow: "#3d493c", highlight: "#909473", accent: "#56604d", detail: "#aaa477", contour: "#ceca9f", grid: "rgba(47, 65, 54, .48)" },
    { fill: "#4c5d49", shadow: "#293d37", highlight: "#6c8063", accent: "#3b5144", detail: "#87946d", contour: "#adb995", grid: "rgba(32, 56, 49, .48)" },
  ],
  ARID: [
    { fill: "#8a704d", shadow: "#4b4033", highlight: "#c4a66f", accent: "#735d43", detail: "#d8bd82", contour: "#efdaa7", grid: "rgba(71, 57, 42, .48)" },
    { fill: "#927651", shadow: "#514234", highlight: "#caaa73", accent: "#7b6345", detail: "#dfc188", contour: "#f2dca9", grid: "rgba(76, 60, 43, .48)" },
    { fill: "#806b4c", shadow: "#463d31", highlight: "#b99d6f", accent: "#6b5941", detail: "#ceb27e", contour: "#e8d2a2", grid: "rgba(66, 55, 42, .48)" },
    { fill: "#9b7850", shadow: "#574334", highlight: "#d2ab72", accent: "#826345", detail: "#e5bd80", contour: "#f4d9a0", grid: "rgba(82, 62, 43, .48)" },
    { fill: "#866d50", shadow: "#4a3f34", highlight: "#bea176", accent: "#705b45", detail: "#d3b588", contour: "#ead6ae", grid: "rgba(69, 57, 45, .48)" },
  ],
  COLD: [
    { fill: "#718082", shadow: "#3f5156", highlight: "#b3c2bb", accent: "#5c6e72", detail: "#d6d8c8", contour: "#eef0dc", grid: "rgba(46, 67, 72, .48)" },
    { fill: "#77868b", shadow: "#43555d", highlight: "#bdcac4", accent: "#60757b", detail: "#dce0d4", contour: "#f1f3e5", grid: "rgba(49, 70, 78, .48)" },
    { fill: "#68797d", shadow: "#394c53", highlight: "#aabdb8", accent: "#536a70", detail: "#cbd4ca", contour: "#e7ede2", grid: "rgba(42, 64, 71, .48)" },
    { fill: "#809094", shadow: "#485c62", highlight: "#c6d2cb", accent: "#6a7d81", detail: "#e2e4d7", contour: "#f5f5e8", grid: "rgba(52, 75, 80, .48)" },
    { fill: "#6d7c83", shadow: "#3c4f59", highlight: "#afc0c0", accent: "#586c75", detail: "#ced7d4", contour: "#e8eeee", grid: "rgba(44, 65, 75, .48)" },
  ],
  URBAN: [
    { fill: "#626763", shadow: "#313b3c", highlight: "#92978d", accent: "#505855", detail: "#b0aa91", contour: "#d4cba9", grid: "rgba(37, 49, 50, .55)" },
    { fill: "#686b66", shadow: "#353d3d", highlight: "#999c92", accent: "#555b58", detail: "#b7af98", contour: "#d8cfb2", grid: "rgba(40, 51, 51, .55)" },
    { fill: "#5b6260", shadow: "#2d393b", highlight: "#89918a", accent: "#495452", detail: "#a7a58f", contour: "#cbc7aa", grid: "rgba(34, 47, 49, .55)" },
    { fill: "#707069", shadow: "#3b403e", highlight: "#a29f92", accent: "#5c5f5a", detail: "#beb49a", contour: "#ded3b5", grid: "rgba(43, 53, 51, .55)" },
    { fill: "#606561", shadow: "#303a3a", highlight: "#90958b", accent: "#4e5653", detail: "#adaa94", contour: "#d0c9ad", grid: "rgba(36, 48, 49, .55)" },
  ],
  WATER_SHALLOW: [
    { fill: "#376f72", shadow: "#173d45", highlight: "#78aaa1", accent: "#285a62", detail: "#a2c4b7", contour: "#d8d7ae", grid: "rgba(18, 54, 62, .52)" },
    { fill: "#3d7777", shadow: "#19434a", highlight: "#82b1a5", accent: "#2d6267", detail: "#adcbba", contour: "#dddcb7", grid: "rgba(19, 59, 66, .52)" },
    { fill: "#32696e", shadow: "#153940", highlight: "#70a198", accent: "#25565e", detail: "#98bcb0", contour: "#d0d3ad", grid: "rgba(16, 51, 59, .52)" },
    { fill: "#477c78", shadow: "#21464a", highlight: "#8ab4a6", accent: "#356763", detail: "#b5cebb", contour: "#e0dcb5", grid: "rgba(23, 61, 64, .52)" },
    { fill: "#386e70", shadow: "#173e43", highlight: "#79a69d", accent: "#295a60", detail: "#a2c0b3", contour: "#d5d5af", grid: "rgba(18, 54, 60, .52)" },
  ],
  WATER_DEEP: [
    { fill: "#24515d", shadow: "#0b2b36", highlight: "#4f7f83", accent: "#183f4d", detail: "#76a4a3", contour: "#a7bda8", grid: "rgba(9, 37, 47, .58)" },
    { fill: "#285764", shadow: "#0c2e3a", highlight: "#56868a", accent: "#1b4452", detail: "#7caaa8", contour: "#adc2ac", grid: "rgba(10, 40, 51, .58)" },
    { fill: "#214b58", shadow: "#092832", highlight: "#49777c", accent: "#163a48", detail: "#6e9b9d", contour: "#9db5a5", grid: "rgba(8, 34, 44, .58)" },
    { fill: "#2b5963", shadow: "#0e3039", highlight: "#5b8889", accent: "#204650", detail: "#83aaa6", contour: "#b2c3ac", grid: "rgba(11, 41, 49, .58)" },
    { fill: "#244f5a", shadow: "#0a2a34", highlight: "#507c80", accent: "#193d49", detail: "#75a0a0", contour: "#a4b9a7", grid: "rgba(9, 36, 45, .58)" },
  ],
};

export const TACTICAL_TERRAIN_STYLES: Readonly<Record<TacticalTerrainKind, TacticalTerrainStyle>> = {
  OPEN: TACTICAL_TERRAIN_PALETTES.OPEN[0]!,
  FOREST: TACTICAL_TERRAIN_PALETTES.FOREST[0]!,
  RIDGE: TACTICAL_TERRAIN_PALETTES.RIDGE[0]!,
  MARSH: TACTICAL_TERRAIN_PALETTES.MARSH[0]!,
  ARID: TACTICAL_TERRAIN_PALETTES.ARID[0]!,
  COLD: TACTICAL_TERRAIN_PALETTES.COLD[0]!,
  URBAN: TACTICAL_TERRAIN_PALETTES.URBAN[0]!,
  WATER_SHALLOW: TACTICAL_TERRAIN_PALETTES.WATER_SHALLOW[0]!,
  WATER_DEEP: TACTICAL_TERRAIN_PALETTES.WATER_DEEP[0]!,
};

export function tacticalTerrainVisualProfile(
  terrainId: string,
  visualTerrainId?: string,
): TacticalTerrainVisualProfile {
  const authored = visualTerrainId ? VISUAL_PROFILE_INDEX[visualTerrainId] : undefined;
  if (authored) return authored;
  if (terrainId.includes("forest")) return visualProfile("FOREST", "FOREST", 0);
  if (terrainId.includes("ridge") || terrainId.includes("mountain")) {
    return visualProfile("RIDGE", "RIDGE", 0);
  }
  if (terrainId.includes("marsh") || terrainId.includes("swamp") || terrainId.includes("wetland")) {
    return visualProfile("MARSH", "MARSH", 0);
  }
  if (terrainId.includes("water") || terrainId.includes("ocean") || terrainId.includes("sea")) {
    const deep = terrainId.includes("deep") || terrainId.includes("ocean") || terrainId.includes("sea");
    return visualProfile(deep ? "WATER_DEEP" : "WATER_SHALLOW", deep ? "OPEN_WATER" : "SHALLOW_WATER", 0, true);
  }
  return visualProfile("OPEN", "OPEN", 0);
}

export function tacticalTerrainKind(terrainId: string, visualTerrainId?: string): TacticalTerrainKind {
  return tacticalTerrainVisualProfile(terrainId, visualTerrainId).kind;
}

export function isTacticalWaterTerrain(terrainId: string, visualTerrainId?: string): boolean {
  return tacticalTerrainVisualProfile(terrainId, visualTerrainId).hydrographic;
}

export function tacticalTerrainLabel(terrainId: string, visualTerrainId?: string): string {
  if (visualTerrainId && VISUAL_PROFILE_INDEX[visualTerrainId]) {
    return visualTerrainId
      .replace(/^(LOWLANDS|FORESTS|WETLANDS|HIGHLANDS|ARID|COLD|WATER)_/, "")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return tacticalTerrainKind(terrainId, visualTerrainId).toLowerCase().replaceAll("_", " ");
}

function tacticalTerrainBlendKey(terrainId: string, visualTerrainId?: string): string {
  const profile = tacticalTerrainVisualProfile(terrainId, visualTerrainId);
  return profile.hydrographic && profile.kind === "COLD" ? "FROZEN_WATER" : profile.kind;
}

export function tacticalTerrainSeed(coord: AxialCoord, channel = 0): number {
  let value = Math.imul(coord.q + 173, 374761393) ^ Math.imul(coord.r - 97, 668265263) ^ channel;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

export function tacticalTerrainVariant(coord: AxialCoord): number {
  // Low-frequency world-space waves keep neighbouring cells visually related.
  // This avoids a checkerboard of random tile values while remaining a purely
  // deterministic presentation choice with no rules effect.
  const field = Math.sin(coord.q * .43 + coord.r * .17 + .6)
    + Math.sin(coord.r * .37 - coord.q * .19 + 1.9)
    + Math.sin((coord.q + coord.r) * .23 - .8);
  return Math.max(0, Math.min(4, Math.floor(((field + 3) / 6) * 5)));
}

export function tacticalTerrainStyle(
  terrainId: string,
  coord: AxialCoord,
  visualTerrainId?: string,
): TacticalTerrainStyle {
  const profile = tacticalTerrainVisualProfile(terrainId, visualTerrainId);
  const palette = TACTICAL_TERRAIN_PALETTES[profile.kind];
  const index = (tacticalTerrainVariant(coord) + profile.paletteOffset) % palette.length;
  return palette[index] ?? palette[0]!;
}

export function tacticalWaterRings(
  landCoords: readonly AxialCoord[],
  ringCount = 3,
): TacticalWaterHex[] {
  const maximumDepth = Math.max(0, Math.min(3, Math.floor(ringCount)));
  if (landCoords.length === 0 || maximumDepth === 0) return [];

  const landKeys = new Set(landCoords.map(coordKey));
  const waterKeys = new Set<string>();
  let frontier = [...new Map(landCoords.map((coord) => [coordKey(coord), coord])).values()];
  const result: TacticalWaterHex[] = [];

  for (let depth = 1; depth <= maximumDepth; depth += 1) {
    const ring = new Map<string, AxialCoord>();
    for (const coord of frontier) {
      for (const direction of HEX_DIRECTIONS) {
        const candidate = { q: coord.q + direction.q, r: coord.r + direction.r };
        const key = coordKey(candidate);
        if (!landKeys.has(key) && !waterKeys.has(key)) ring.set(key, candidate);
      }
    }
    frontier = [...ring.values()].sort((left, right) => left.q - right.q || left.r - right.r);
    for (const coord of frontier) {
      waterKeys.add(coordKey(coord));
      result.push({ coord, depth: depth as TacticalWaterDepth });
    }
  }

  return result;
}

export function connectedTerrainDirections(
  coord: AxialCoord,
  terrainId: string,
  mapIndex: ReadonlyMap<string, { terrainId: string; visualTerrainId?: string }>,
  visualTerrainId?: string,
): number[] {
  const blendKey = tacticalTerrainBlendKey(terrainId, visualTerrainId);
  return HEX_DIRECTIONS.flatMap((direction, index) => {
    const neighbour = mapIndex.get(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r }));
    return neighbour && tacticalTerrainBlendKey(neighbour.terrainId, neighbour.visualTerrainId) === blendKey ? [index] : [];
  });
}

export function exposedMapDirections(
  coord: AxialCoord,
  mapIndex: ReadonlyMap<string, { terrainId: string; visualTerrainId?: string }>,
): number[] {
  const current = mapIndex.get(coordKey(coord));
  if (!current || isTacticalWaterTerrain(current.terrainId, current.visualTerrainId)) return [];
  return HEX_DIRECTIONS.flatMap((direction, index) => {
    const neighbour = mapIndex.get(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r }));
    return !neighbour || isTacticalWaterTerrain(neighbour.terrainId, neighbour.visualTerrainId) ? [index] : [];
  });
}

export function terrainBoundaryDirections(
  coord: AxialCoord,
  terrainId: string,
  mapIndex: ReadonlyMap<string, { terrainId: string; visualTerrainId?: string }>,
  visualTerrainId?: string,
): number[] {
  const blendKey = tacticalTerrainBlendKey(terrainId, visualTerrainId);
  return HEX_DIRECTIONS.flatMap((direction, index) => {
    const neighbour = mapIndex.get(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r }));
    return neighbour && tacticalTerrainBlendKey(neighbour.terrainId, neighbour.visualTerrainId) !== blendKey ? [index] : [];
  });
}

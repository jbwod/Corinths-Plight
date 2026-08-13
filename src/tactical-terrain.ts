import type { AxialCoord } from "../packages/domain/src";
import { coordKey, HEX_DIRECTIONS } from "../packages/rules-engine/src";

export type TacticalTerrainKind = "OPEN" | "FOREST" | "RIDGE" | "MARSH";

export interface TacticalTerrainStyle {
  fill: string;
  shadow: string;
  highlight: string;
  accent: string;
  detail: string;
  contour: string;
  grid: string;
}

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
};

export const TACTICAL_TERRAIN_STYLES: Readonly<Record<TacticalTerrainKind, TacticalTerrainStyle>> = {
  OPEN: TACTICAL_TERRAIN_PALETTES.OPEN[0]!,
  FOREST: TACTICAL_TERRAIN_PALETTES.FOREST[0]!,
  RIDGE: TACTICAL_TERRAIN_PALETTES.RIDGE[0]!,
  MARSH: TACTICAL_TERRAIN_PALETTES.MARSH[0]!,
};

export function tacticalTerrainKind(terrainId: string): TacticalTerrainKind {
  if (terrainId.includes("forest")) return "FOREST";
  if (terrainId.includes("ridge")) return "RIDGE";
  if (terrainId.includes("marsh")) return "MARSH";
  return "OPEN";
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

export function tacticalTerrainStyle(terrainId: string, coord: AxialCoord): TacticalTerrainStyle {
  const palette = TACTICAL_TERRAIN_PALETTES[tacticalTerrainKind(terrainId)];
  return palette[tacticalTerrainVariant(coord)] ?? palette[0]!;
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
  mapIndex: ReadonlyMap<string, { terrainId: string }>,
): number[] {
  return HEX_DIRECTIONS.flatMap((direction, index) => {
    const neighbour = mapIndex.get(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r }));
    return neighbour?.terrainId === terrainId ? [index] : [];
  });
}

export function exposedMapDirections(
  coord: AxialCoord,
  mapIndex: ReadonlyMap<string, unknown>,
): number[] {
  return HEX_DIRECTIONS.flatMap((direction, index) =>
    mapIndex.has(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r })) ? [] : [index]
  );
}

export function terrainBoundaryDirections(
  coord: AxialCoord,
  terrainId: string,
  mapIndex: ReadonlyMap<string, { terrainId: string }>,
): number[] {
  const kind = tacticalTerrainKind(terrainId);
  return HEX_DIRECTIONS.flatMap((direction, index) => {
    const neighbour = mapIndex.get(coordKey({ q: coord.q + direction.q, r: coord.r + direction.r }));
    return neighbour && tacticalTerrainKind(neighbour.terrainId) !== kind ? [index] : [];
  });
}

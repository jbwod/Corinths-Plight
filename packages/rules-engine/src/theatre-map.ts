import type { AxialCoord } from "../../domain/src";

import { HEX_DIRECTIONS, coordKey, hexDistance, hexNeighbours } from "./hex";

export interface IrregularTheatreOptions {
  seed: string;
  coreRadius: number;
  outerRadius: number;
}

function assertRadius(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function coordinateScore(seed: number, coord: AxialCoord, ring: number): number {
  const fine = mix32(
    seed
      ^ Math.imul(coord.q, 0x9e3779b1)
      ^ Math.imul(coord.r, 0x85ebca6b)
      ^ Math.imul(ring, 0xc2b2ae35),
  ) % 100;
  const broad = mix32(
    seed
      ^ Math.imul(Math.floor(coord.q / 2), 0x27d4eb2d)
      ^ Math.imul(Math.floor(coord.r / 2), 0x165667b1)
      ^ Math.imul(ring, 0xd3a2646c),
  ) % 100;
  return Math.floor((fine + broad * 2) / 3);
}

function scaledDirection(directionIndex: number, distance: number): AxialCoord {
  const direction = HEX_DIRECTIONS[directionIndex]!;
  return { q: direction.q * distance, r: direction.r * distance };
}

function compareCoords(a: AxialCoord, b: AxialCoord): number {
  return a.q - b.q || a.r - b.r;
}

/**
 * Builds one connected theatre footprint around a complete authored core.
 * Outer rings grow only from already included inner-ring land. Two deterministic
 * spines ensure the requested extent is reached, while a seed-oriented coastal
 * notch guarantees that the result is not a complete hex disc.
 */
export function createIrregularTheatreCoordinates(
  options: IrregularTheatreOptions,
): AxialCoord[] {
  assertRadius("coreRadius", options.coreRadius);
  assertRadius("outerRadius", options.outerRadius);
  if (options.coreRadius > options.outerRadius) {
    throw new Error("coreRadius must not exceed outerRadius.");
  }
  if (options.seed.length === 0) {
    throw new Error("seed must not be empty.");
  }

  const rings: AxialCoord[][] = Array.from(
    { length: options.outerRadius + 1 },
    () => [],
  );
  const origin = { q: 0, r: 0 };
  for (let q = -options.outerRadius; q <= options.outerRadius; q += 1) {
    const minimumR = Math.max(-options.outerRadius, -q - options.outerRadius);
    const maximumR = Math.min(options.outerRadius, -q + options.outerRadius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      const coord = { q, r };
      rings[hexDistance(origin, coord)]!.push(coord);
    }
  }
  for (const ring of rings) ring.sort(compareCoords);

  const included = new Map<string, AxialCoord>();
  for (let ring = 0; ring <= options.coreRadius; ring += 1) {
    for (const coord of rings[ring]!) included.set(coordKey(coord), coord);
  }
  if (options.coreRadius === options.outerRadius) {
    return [...included.values()].sort(compareCoords);
  }

  const seed = hashText(options.seed);
  const primaryDirection = seed % HEX_DIRECTIONS.length;
  const secondaryDirection = (primaryDirection + 3) % HEX_DIRECTIONS.length;
  const notchDirection = (primaryDirection + 1) % HEX_DIRECTIONS.length;
  const outerDepth = options.outerRadius - options.coreRadius;

  for (let ring = options.coreRadius + 1; ring <= options.outerRadius; ring += 1) {
    const anchorKeys = new Set([
      coordKey(scaledDirection(primaryDirection, ring)),
      coordKey(scaledDirection(secondaryDirection, ring)),
    ]);
    const notchKey = coordKey(scaledDirection(notchDirection, ring));
    const depth = ring - options.coreRadius;
    const threshold = outerDepth === 1
      ? 48
      : 76 - Math.floor(((depth - 1) * 42) / (outerDepth - 1));

    for (const coord of rings[ring]!) {
      const key = coordKey(coord);
      if (anchorKeys.has(key)) {
        included.set(key, coord);
        continue;
      }
      if (key === notchKey) continue;

      const inwardConnections = hexNeighbours(coord).filter(
        (neighbour) => hexDistance(origin, neighbour) === ring - 1
          && included.has(coordKey(neighbour)),
      ).length;
      if (inwardConnections === 0) continue;

      const continuityBonus = Math.min(18, (inwardConnections - 1) * 9);
      if (coordinateScore(seed, coord, ring) < threshold + continuityBonus) {
        included.set(key, coord);
      }
    }
  }

  return [...included.values()].sort(compareCoords);
}

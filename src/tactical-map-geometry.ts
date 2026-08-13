import type { AxialCoord } from "../packages/domain/src";

export interface TacticalMapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface TacticalMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const TACTICAL_HEX_SIZE = 39;
export const TACTICAL_MIN_ZOOM = 0.1;
export const TACTICAL_MAX_ZOOM = 2.2;
const SQRT_THREE = Math.sqrt(3);

export function axialToTacticalWorld({ q, r }: AxialCoord) {
  return {
    x: TACTICAL_HEX_SIZE * 1.5 * q,
    y: TACTICAL_HEX_SIZE * SQRT_THREE * (r + q / 2),
  };
}

function cubeRound(q: number, r: number): AxialCoord {
  let x = Math.round(q);
  let z = Math.round(r);
  const y = Math.round(-q - r);
  const xDiff = Math.abs(x - q);
  const yDiff = Math.abs(y + q + r);
  const zDiff = Math.abs(z - r);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff <= zDiff) z = -x - y;
  return { q: x, r: z };
}

export function tacticalWorldToAxial(x: number, y: number): AxialCoord {
  const q = (2 / 3) * (x / TACTICAL_HEX_SIZE);
  const r = (-1 / 3) * (x / TACTICAL_HEX_SIZE) + (SQRT_THREE / 3) * (y / TACTICAL_HEX_SIZE);
  return cubeRound(q, r);
}

export function tacticalMapBounds(coords: readonly AxialCoord[]): TacticalMapBounds {
  if (coords.length === 0) {
    return {
      minX: -TACTICAL_HEX_SIZE,
      minY: -TACTICAL_HEX_SIZE,
      maxX: TACTICAL_HEX_SIZE,
      maxY: TACTICAL_HEX_SIZE,
    };
  }
  const points = coords.map(axialToTacticalWorld);
  const halfHeight = TACTICAL_HEX_SIZE * SQRT_THREE / 2;
  return {
    minX: Math.min(...points.map((point) => point.x)) - TACTICAL_HEX_SIZE,
    minY: Math.min(...points.map((point) => point.y)) - halfHeight,
    maxX: Math.max(...points.map((point) => point.x)) + TACTICAL_HEX_SIZE,
    maxY: Math.max(...points.map((point) => point.y)) + halfHeight,
  };
}

export function clampTacticalZoom(zoom: number): number {
  return Math.max(TACTICAL_MIN_ZOOM, Math.min(TACTICAL_MAX_ZOOM, zoom));
}

export function fitTacticalMapViewport(
  width: number,
  height: number,
  bounds: TacticalMapBounds,
  padding = 58,
): TacticalMapViewport {
  const mapWidth = Math.max(1, bounds.maxX - bounds.minX);
  const mapHeight = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const zoom = clampTacticalZoom(Math.min(0.9, availableWidth / mapWidth, availableHeight / mapHeight));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    x: width / 2 - centerX * zoom,
    y: height / 2 - centerY * zoom,
  };
}

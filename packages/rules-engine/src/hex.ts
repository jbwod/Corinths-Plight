import type { AxialCoord, BattlefieldHex, CampaignDeployment, Facing } from "../../domain/src";

export const FACING_LABELS = ["N", "NE", "SE", "S", "SW", "NW"] as const;
export const HEX_DIRECTIONS: ReadonlyArray<AxialCoord> = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
];

export const coordKey = ({ q, r }: AxialCoord): string => `${q},${r}`;
export const sameCoord = (a: AxialCoord, b: AxialCoord): boolean => a.q === b.q && a.r === b.r;
export const addCoord = (a: AxialCoord, b: AxialCoord): AxialCoord => ({ q: a.q + b.q, r: a.r + b.r });
export const subtractCoord = (a: AxialCoord, b: AxialCoord): AxialCoord => ({ q: a.q - b.q, r: a.r - b.r });

export function hexNeighbours(coord: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map((direction) => addCoord(coord, direction));
}

export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

const axialToCube = ({ q, r }: AxialCoord): CubeCoord => ({ x: q, z: r, y: -q - r });
const cubeToAxial = ({ x, z }: CubeCoord): AxialCoord => ({ q: x, r: z });
const cubeLerp = (a: CubeCoord, b: CubeCoord, t: number): CubeCoord => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

function cubeRound(cube: CubeCoord): CubeCoord {
  let x = Math.round(cube.x);
  let y = Math.round(cube.y);
  let z = Math.round(cube.z);
  const dx = Math.abs(x - cube.x);
  const dy = Math.abs(y - cube.y);
  const dz = Math.abs(z - cube.z);
  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;
  return { x, y, z };
}

export function hexLine(start: AxialCoord, end: AxialCoord): AxialCoord[] {
  const distance = hexDistance(start, end);
  if (distance === 0) return [{ ...start }];
  const a = axialToCube(start);
  const b = axialToCube(end);
  return Array.from({ length: distance + 1 }, (_, index) =>
    cubeToAxial(cubeRound(cubeLerp(a, b, index / distance))),
  );
}

export function facingBetween(from: AxialCoord, to: AxialCoord): Facing | null {
  if (sameCoord(from, to)) return null;
  const firstStep = hexLine(from, to)[1];
  const delta = subtractCoord(firstStep, from);
  const direction = HEX_DIRECTIONS.findIndex((candidate) => sameCoord(candidate, delta));
  return direction < 0 ? null : (direction as Facing);
}

export function rearFacing(facing: Facing): Facing {
  return ((facing + 3) % 6) as Facing;
}

export function isRearAttack(attacker: AxialCoord, target: AxialCoord, targetFacing: Facing): boolean {
  return facingBetween(target, attacker) === rearFacing(targetFacing);
}

export function createHexIndex(hexes: BattlefieldHex[]): Map<string, BattlefieldHex> {
  return new Map(hexes.map((hex) => [coordKey(hex.coord), hex]));
}

function edgeDirection(from: AxialCoord, to: AxialCoord): Facing | null {
  const delta = subtractCoord(to, from);
  const index = HEX_DIRECTIONS.findIndex((direction) => sameCoord(direction, delta));
  return index < 0 ? null : (index as Facing);
}

export interface RouteCostOptions {
  rush?: boolean;
  ignoresRivers?: boolean;
  ignoresElevation?: boolean;
  roadMultiplier?: number;
}

export interface RouteCostResult {
  total: number;
  steps: Array<{
    from: AxialCoord;
    to: AxialCoord;
    base: number;
    elevation: number;
    river: number;
    road: boolean;
    total: number;
  }>;
  legal: boolean;
  reason?: string;
}

export function calculateRouteCost(
  route: AxialCoord[],
  hexes: BattlefieldHex[],
  options: RouteCostOptions = {},
): RouteCostResult {
  if (route.length < 2) return { total: 0, steps: [], legal: true };
  const index = createHexIndex(hexes);
  const steps: RouteCostResult["steps"] = [];
  let total = 0;

  for (let position = 1; position < route.length; position += 1) {
    const fromCoord = route[position - 1];
    const toCoord = route[position];
    if (hexDistance(fromCoord, toCoord) !== 1) {
      return { total, steps, legal: false, reason: `Route step ${position} is not adjacent.` };
    }
    const from = index.get(coordKey(fromCoord));
    const to = index.get(coordKey(toCoord));
    if (!from || !to) return { total, steps, legal: false, reason: `Route leaves the battlefield at step ${position}.` };
    const direction = edgeDirection(fromCoord, toCoord);
    if (direction === null) return { total, steps, legal: false, reason: `Route direction is invalid at step ${position}.` };

    const road = from.edges.roads.includes(direction) || to.edges.roads.includes(rearFacing(direction));
    const base = road ? to.movementCost * (options.roadMultiplier ?? 0.5) : to.movementCost;
    const elevation = options.ignoresElevation ? 0 : Math.max(0, to.elevation - from.elevation);
    const riverCrossing =
      from.edges.rivers.includes(direction) || to.edges.rivers.includes(rearFacing(direction));
    const river = options.ignoresRivers || !riverCrossing ? 0 : 1;
    const stepTotal = Math.max(0.25, base + elevation + river) * (options.rush ? 0.5 : 1);
    steps.push({ from: fromCoord, to: toCoord, base, elevation, river, road, total: stepTotal });
    total += stepTotal;
  }

  return { total, steps, legal: true };
}

export function canOccupyHex(
  coord: AxialCoord,
  movingUnitId: string,
  deployments: CampaignDeployment[],
  hexes: BattlefieldHex[],
): boolean {
  const hex = hexes.find((candidate) => sameCoord(candidate.coord, coord));
  if (!hex) return false;
  const occupied = deployments.filter(
    (deployment) =>
      deployment.id !== movingUnitId &&
      deployment.status !== "DESTROYED" &&
      deployment.status !== "WITHDRAWN" &&
      sameCoord(deployment.position, coord),
  ).length;
  return occupied < hex.capacity;
}

export function hasLineOfSight(
  start: AxialCoord,
  end: AxialCoord,
  hexes: BattlefieldHex[],
  maximumRange: number,
): boolean {
  if (hexDistance(start, end) > maximumRange) return false;
  const index = createHexIndex(hexes);
  const line = hexLine(start, end);
  const startHeight = index.get(coordKey(start))?.elevation ?? 0;
  const endHeight = index.get(coordKey(end))?.elevation ?? 0;
  const sightCeiling = Math.max(startHeight, endHeight) + 1;
  return line.slice(1, -1).every((coord) => {
    const hex = index.get(coordKey(coord));
    return Boolean(hex && !hex.blocksLineOfSight && hex.elevation <= sightCeiling);
  });
}

export function visibleHexes(
  observers: CampaignDeployment[],
  hexes: BattlefieldHex[],
): Set<string> {
  const visible = new Set<string>();
  for (const observer of observers) {
    if (observer.status === "DESTROYED") continue;
    for (const hex of hexes) {
      if (hasLineOfSight(observer.position, hex.coord, hexes, observer.stats.sensors)) {
        visible.add(coordKey(hex.coord));
      }
    }
  }
  return visible;
}

export interface PathOptions {
  blocked?: Set<string>;
  maximumSteps?: number;
}

export function shortestPath(
  start: AxialCoord,
  goal: AxialCoord,
  hexes: BattlefieldHex[],
  options: PathOptions = {},
): AxialCoord[] {
  if (sameCoord(start, goal)) return [{ ...start }];
  const index = createHexIndex(hexes);
  const blocked = options.blocked ?? new Set<string>();
  const frontier: AxialCoord[] = [start];
  const cameFrom = new Map<string, AxialCoord | null>([[coordKey(start), null]]);
  const maximumSteps = options.maximumSteps ?? hexes.length;

  while (frontier.length > 0 && cameFrom.size <= maximumSteps * 7) {
    const current = frontier.shift()!;
    for (const next of hexNeighbours(current)) {
      const key = coordKey(next);
      if (!index.has(key) || blocked.has(key) || cameFrom.has(key)) continue;
      cameFrom.set(key, current);
      if (sameCoord(next, goal)) {
        const result: AxialCoord[] = [next];
        let cursor: AxialCoord | null = current;
        while (cursor) {
          result.push(cursor);
          cursor = cameFrom.get(coordKey(cursor)) ?? null;
        }
        return result.reverse();
      }
      frontier.push(next);
    }
  }

  return [];
}

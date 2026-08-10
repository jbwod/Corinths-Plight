import type {
  CampaignDeployment,
  CampaignRuntimeState,
  StructuredAction,
  UnitOrder,
} from "../packages/domain/src";
import {
  calculateRouteCost,
  canTarget,
  hasLineOfSight,
  hexDistance,
  shortestPath,
} from "../packages/rules-engine/src";

function chooseTarget(enemy: CampaignDeployment, state: CampaignRuntimeState): CampaignDeployment | undefined {
  const visible = state.deployments.filter(
    (candidate) =>
      candidate.side === "ALLIED" &&
      candidate.status !== "DESTROYED" &&
      (candidate.locationState ?? "ON_MAP") === "ON_MAP" &&
      hasLineOfSight(enemy.position, candidate.position, state.map, enemy.stats.sensors),
  );
  const prioritised = enemy.weapons.some((weapon) => weapon.armorPiercing > 0)
    ? [...visible].sort((left, right) => {
        const armourPriority = Number(right.stats.healthModel === "HITS") - Number(left.stats.healthModel === "HITS");
        return armourPriority || hexDistance(enemy.position, left.position) - hexDistance(enemy.position, right.position) || left.id.localeCompare(right.id);
      })
    : [...visible].sort(
        (left, right) =>
          hexDistance(enemy.position, left.position) - hexDistance(enemy.position, right.position) ||
          left.id.localeCompare(right.id),
      );
  return prioritised[0];
}

function routeWithinBudget(
  enemy: CampaignDeployment,
  target: CampaignDeployment | undefined,
  state: CampaignRuntimeState,
) {
  const destination = target?.position ?? state.objectives.find((objective) => objective.id === "objective-outpost")?.coord;
  if (!destination) return [enemy.position];
  const path = shortestPath(enemy.position, destination, state.map);
  if (path.length <= 1) return [enemy.position];
  const route = [path[0]];
  for (const step of path.slice(1)) {
    const candidate = [...route, step];
    if (calculateRouteCost(candidate, state.map).total > enemy.stats.speed) break;
    route.push(step);
    if (target && hexDistance(step, target.position) <= Math.max(1, ...enemy.weapons.map((weapon) => weapon.range))) break;
  }
  return route;
}

export function generateEnemyOrders(state: CampaignRuntimeState, now: number): UnitOrder[] {
  return state.deployments
    .filter((deployment) =>
      deployment.side === "ENEMY" &&
      deployment.status === "ACTIVE" &&
      (deployment.locationState ?? "ON_MAP") === "ON_MAP"
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((enemy) => {
      const target = chooseTarget(enemy, state);
      const route = routeWithinBudget(enemy, target, state);
      const projected = { ...enemy, position: route.at(-1)! };
      const weapons = target
        ? enemy.weapons.filter((candidate) =>
            canTarget(projected, target, candidate, state.map).legal &&
            (candidate.ammoCapacity === undefined || (enemy.ammunition[candidate.id] ?? 0) > 0) &&
            (enemy.cooldowns[candidate.id] ?? 0) <= 1
          )
        : [];
      const action: StructuredAction[] =
        target && weapons.length > 0
          ? [
              {
                id: `action:${state.round}:${enemy.id}:attack`,
                type: "ATTACK",
                economy: "STANDARD",
                speedCost: 0,
                targetDeploymentId: target.id,
                targetHex: target.position,
                weaponIds: weapons.map((weapon) => weapon.id).sort(),
                equipmentIds: [],
              },
            ]
          : [];
      return {
        id: `enemy-order:${state.campaignId}:${state.round}:${enemy.id}`,
        revision: 1,
        unitId: enemy.id,
        campaignId: state.campaignId,
        round: state.round,
        orderType: route.length > 1 ? "ADVANCE" : "HOLD",
        lifecycle: "LOCKED",
        startHex: enemy.position,
        route,
        endHex: route.at(-1)!,
        facing: enemy.facing,
        actions: action,
        targets: target ? [target.id] : [],
        equipmentUsed: [],
        ammoUsed: Object.fromEntries(
          weapons.flatMap((weapon) => weapon.ammoCapacity === undefined ? [] : [[weapon.id, 1] as const]),
        ),
        incidentalActions: [],
        optionalRoleplayText: "Deterministic swarm doctrine: close with the nearest visible priority target.",
        submittedBy: "enemy-doctrine",
        submittedAt: now,
      } satisfies UnitOrder;
    });
}

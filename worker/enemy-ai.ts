import type {
  CampaignDeployment,
  CampaignRuntimeState,
  EnemyDoctrineProfileV1,
  EnemyTargetPreference,
  OrderType,
  StructuredAction,
  UnitOrder,
  WeaponProfile,
} from "../packages/domain/src";
import {
  calculateRouteCost,
  canTarget,
  getEnemyDoctrineProfile,
  getTacticalOrderRule,
  hasLineOfSight,
  hexDistance,
  shortestPath,
} from "../packages/rules-engine/src";

interface TargetPlan {
  target: CampaignDeployment;
  route: CampaignDeployment["position"][];
  weapons: WeaponProfile[];
  distance: number;
  preferences: Set<EnemyTargetPreference>;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function routeWithinBudget(
  enemy: CampaignDeployment,
  destination: CampaignDeployment["position"] | undefined,
  state: CampaignRuntimeState,
  desiredRange?: number,
): CampaignDeployment["position"][] {
  if (!destination) return [enemy.position];
  if (desiredRange !== undefined && hexDistance(enemy.position, destination) <= desiredRange) {
    return [enemy.position];
  }
  const path = shortestPath(enemy.position, destination, state.map, {
    unitTags: enemy.tags,
    unitStatuses: enemy.statuses,
    airborne: enemy.tags?.some((tag) => tag === "AEROSPACE" || tag === "ATMO_FLIGHT" || tag === "VTOL")
      ? !enemy.statuses.includes("LANDED")
      : undefined,
  });
  if (path.length <= 1) return [enemy.position];
  const route = [path[0]!];
  for (const step of path.slice(1)) {
    const candidate = [...route, step];
    const cost = calculateRouteCost(candidate, state.map, {
      unitTags: enemy.tags,
      unitStatuses: enemy.statuses,
      airborne: enemy.tags?.some((tag) => tag === "AEROSPACE" || tag === "ATMO_FLIGHT" || tag === "VTOL")
        ? !enemy.statuses.includes("LANDED")
        : undefined,
    });
    if (!cost.legal || cost.total > enemy.stats.speed) break;
    route.push(step);
    if (desiredRange !== undefined && hexDistance(step, destination) <= desiredRange) break;
  }
  return route;
}

function hasAnyTag(deployment: CampaignDeployment, ...tags: string[]): boolean {
  const values = new Set((deployment.tags ?? []).map((tag) => tag.toUpperCase()));
  return tags.some((tag) => values.has(tag));
}

function targetPreferences(
  target: CampaignDeployment,
  state: CampaignRuntimeState,
): Set<EnemyTargetPreference> {
  const result = new Set<EnemyTargetPreference>();
  const occupiedHex = state.map.find(
    (hex) => hex.coord.q === target.position.q && hex.coord.r === target.position.r,
  );
  if (target.stats.healthModel === "FORCE_STRENGTH" || hasAnyTag(target, "PERSONNEL", "INFANTRY")) {
    result.add("PERSONNEL");
  }
  if (
    target.stats.healthModel === "HITS" ||
    hasAnyTag(target, "VEHICLE", "GROUND_VEHICLE", "MECH")
  ) {
    result.add("VEHICLE");
  }
  if (hasAnyTag(target, "AEROSPACE", "VTOL", "FIGHTER", "BOMBER")) result.add("AEROSPACE");
  if (hasAnyTag(target, "LOGISTICS", "SUPPLY")) result.add("LOGISTICS");
  if (state.objectives.some((objective) =>
    objective.coord.q === target.position.q && objective.coord.r === target.position.r
  )) {
    result.add("OBJECTIVE");
  }
  if ((occupiedHex?.structureIds.length ?? 0) > 0) result.add("STRUCTURE");
  return result;
}

function targetPlans(
  enemy: CampaignDeployment,
  state: CampaignRuntimeState,
): TargetPlan[] {
  const maximumRange = Math.max(1, ...enemy.weapons.map((weapon) => weapon.range));
  return state.deployments
    .filter((candidate) =>
      candidate.side === "ALLIED" &&
      candidate.status !== "DESTROYED" &&
      candidate.status !== "WITHDRAWN" &&
      (candidate.locationState ?? "ON_MAP") === "ON_MAP" &&
      hasLineOfSight(enemy.position, candidate.position, state.map, enemy.stats.sensors)
    )
    .map((target) => {
      const route = routeWithinBudget(enemy, target.position, state, maximumRange);
      const projected = { ...enemy, position: route.at(-1)! };
      const weapons = enemy.weapons
        .filter((weapon) =>
          canTarget(projected, target, weapon, state.map).legal &&
          (weapon.ammoCapacity === undefined || (enemy.ammunition[weapon.id] ?? 0) > 0) &&
          (enemy.cooldowns[weapon.id] ?? 0) <= 1
        )
        .sort((left, right) => compareCodePoints(left.id, right.id));
      return {
        target,
        route,
        weapons,
        distance: hexDistance(enemy.position, target.position),
        preferences: targetPreferences(target, state),
      };
    });
}

function selectPreference(
  doctrine: EnemyDoctrineProfileV1,
  enemy: CampaignDeployment,
  plans: TargetPlan[],
): { preference: EnemyTargetPreference | undefined; plans: TargetPlan[] } {
  const fireable = plans.filter((plan) => plan.weapons.length > 0);
  const pool = fireable.length > 0 ? fireable : plans;
  const prioritisesVehicles = doctrine.vehiclePriority || enemy.weapons.some((weapon) => weapon.armorPiercing > 0);
  if (prioritisesVehicles) {
    const vehicles = pool.filter((plan) => plan.preferences.has("VEHICLE"));
    if (vehicles.length > 0) return { preference: "VEHICLE", plans: vehicles };
  }
  for (const preference of doctrine.preferredTargets) {
    const matching = pool.filter((plan) => plan.preferences.has(preference));
    if (matching.length > 0) return { preference, plans: matching };
  }
  return { preference: undefined, plans: pool };
}

function selectTarget(
  doctrine: EnemyDoctrineProfileV1,
  enemy: CampaignDeployment,
  state: CampaignRuntimeState,
  assignedTargets: Map<string, number>,
): { plan?: TargetPlan; preference?: EnemyTargetPreference } {
  const selected = selectPreference(doctrine, enemy, targetPlans(enemy, state));
  const plan = [...selected.plans].sort((left, right) =>
    (assignedTargets.get(left.target.id) ?? 0) - (assignedTargets.get(right.target.id) ?? 0) ||
    left.distance - right.distance ||
    compareCodePoints(left.target.id, right.target.id)
  )[0];
  if (plan) assignedTargets.set(plan.target.id, (assignedTargets.get(plan.target.id) ?? 0) + 1);
  return { plan, preference: selected.preference };
}

function selectOrderType(
  doctrine: EnemyDoctrineProfileV1,
  enemy: CampaignDeployment,
  route: CampaignDeployment["position"][],
  attacks: boolean,
): OrderType {
  const allowed = new Set(enemy.allowedOrders ?? ["HOLD", "ADVANCE"]);
  const executable = (orderType: OrderType) =>
    allowed.has(orderType) && getTacticalOrderRule(orderType).executable;
  if (route.length <= 1) return executable("HOLD") ? "HOLD" : doctrine.preferredOrderTypes.find(executable) ?? "HOLD";
  const preferred = doctrine.preferredOrderTypes.find((orderType) =>
    orderType !== "HOLD" && (!attacks || orderType !== "RUSH") && executable(orderType)
  );
  if (preferred) return preferred;
  if (executable("ADVANCE")) return "ADVANCE";
  return executable("HOLD") ? "HOLD" : "ADVANCE";
}

function primaryObjective(state: CampaignRuntimeState) {
  const configured = state.scenarioPolicy?.policyId === "HOLD_PRIMARY_OBJECTIVE"
    ? state.scenarioPolicy.primaryObjectiveId
    : undefined;
  if (configured) {
    const objective = state.objectives.find((candidate) => candidate.id === configured);
    if (objective) return objective;
  }
  return [...state.objectives].sort((left, right) => compareCodePoints(left.id, right.id))[0];
}

export function generateEnemyOrders(state: CampaignRuntimeState, now: number): UnitOrder[] {
  const assignedTargets = new Map<string, number>();
  return state.deployments
    .filter((deployment) =>
      deployment.side === "ENEMY" &&
      deployment.status === "ACTIVE" &&
      (deployment.locationState ?? "ON_MAP") === "ON_MAP"
    )
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map((enemy) => {
      const doctrine = getEnemyDoctrineProfile(enemy.definitionId);
      const selected = selectTarget(doctrine, enemy, state, assignedTargets);
      const objective = selected.plan ? undefined : primaryObjective(state);
      const route = selected.plan?.route ?? routeWithinBudget(enemy, objective?.coord, state);
      const weapons = selected.plan?.weapons ?? [];
      const action: StructuredAction[] = selected.plan && weapons.length > 0
        ? [{
            id: `action:${state.round}:${enemy.id}:attack`,
            type: "ATTACK",
            economy: "STANDARD",
            speedCost: 0,
            targetDeploymentId: selected.plan.target.id,
            targetHex: selected.plan.target.position,
            weaponIds: weapons.map((weapon) => weapon.id),
            equipmentIds: [],
          }]
        : [];
      const orderType = selectOrderType(doctrine, enemy, route, action.length > 0);
      return {
        id: `enemy-order:${state.campaignId}:${state.round}:${enemy.id}`,
        revision: 1,
        unitId: enemy.id,
        campaignId: state.campaignId,
        round: state.round,
        orderType,
        lifecycle: "LOCKED",
        startHex: enemy.position,
        route,
        endHex: route.at(-1)!,
        facing: enemy.facing,
        actions: action,
        targets: selected.plan ? [selected.plan.target.id] : [],
        equipmentUsed: [],
        ammoUsed: Object.fromEntries(
          weapons.flatMap((weapon) => weapon.ammoCapacity === undefined ? [] : [[weapon.id, 1] as const]),
        ),
        incidentalActions: [],
        optionalRoleplayText: `${doctrine.factionId} doctrine: ${doctrine.role ?? "line assault"}.`,
        enemyIntent: {
          doctrineDefinitionId: doctrine.definitionId,
          factionId: doctrine.factionId,
          targetPreference: selected.preference,
          allocation: "SPREAD_BY_PRIORITY",
          objectiveId: objective?.id,
        },
        submittedBy: `enemy-doctrine:${doctrine.factionId}`,
        submittedAt: now,
      } satisfies UnitOrder;
    });
}

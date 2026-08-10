import type { AxialCoord, BattlefieldHex, CampaignDeployment, UnitOrder } from "../../domain/src";
import { calculateRouteCost, coordKey, sameCoord } from "./hex";

export type MovementBlockReason =
  | "HOSTILE_ROUTE_CONTEST"
  | "HOSTILE_FORMATION"
  | "HEX_CAPACITY";

export interface MovementBlock {
  at: AxialCoord;
  reason: MovementBlockReason;
  distanceIncrement: number;
}

export interface SimultaneousMovementOutcome {
  unitId: string;
  orderId: string;
  from: AxialCoord;
  to: AxialCoord;
  traversedRoute: AxialCoord[];
  block?: MovementBlock;
}

interface MovementPlan {
  deployment: CampaignDeployment;
  order: UnitOrder;
  arrivals: Array<{ coord: AxialCoord; tick: number }>;
  next: number;
  traversed: AxialCoord[];
  stopped: boolean;
}

function blocksGroundMovement(deployment: CampaignDeployment): boolean {
  const tags = new Set(deployment.tags ?? []);
  return !tags.has("MECH") && !tags.has("AEROSPACE") && !tags.has("VTOL") && !tags.has("ORBITAL");
}

function activeOnMap(deployment: CampaignDeployment): boolean {
  return deployment.status !== "DESTROYED" &&
    deployment.status !== "WITHDRAWN" &&
    (deployment.locationState ?? "ON_MAP") === "ON_MAP";
}

function hostile(left: CampaignDeployment, right: CampaignDeployment): boolean {
  return left.side !== right.side;
}

export function resolveSimultaneousMovement(
  orders: UnitOrder[],
  deployments: CampaignDeployment[],
  map: BattlefieldHex[],
): SimultaneousMovementOutcome[] {
  const deploymentById = new Map(deployments.map((deployment) => [deployment.id, deployment]));
  const positions = new Map(
    deployments.filter(activeOnMap).map((deployment) => [deployment.id, { ...deployment.position }]),
  );
  const plans = orders
    .map((order): MovementPlan | undefined => {
      const deployment = deploymentById.get(order.unitId);
      if (!deployment || order.route.length <= 1) return undefined;
      const route = calculateRouteCost(order.route, map, { rush: order.orderType === "RUSH" });
      if (!route.legal) return undefined;
      let cumulative = 0;
      const arrivals = route.steps.map((step) => {
        cumulative += step.total;
        return { coord: { ...step.to }, tick: Math.round(cumulative * 4) };
      });
      return {
        deployment,
        order,
        arrivals,
        next: 0,
        traversed: [{ ...order.startHex }],
        stopped: false,
      };
    })
    .filter((plan): plan is MovementPlan => plan !== undefined)
    .sort((left, right) => left.deployment.id < right.deployment.id ? -1 : left.deployment.id > right.deployment.id ? 1 : 0);
  const blocks = new Map<string, MovementBlock>();
  const ticks = [...new Set(plans.flatMap((plan) => plan.arrivals.map((arrival) => arrival.tick)))].sort((a, b) => a - b);

  for (const tick of ticks) {
    const intents = plans.filter((plan) => !plan.stopped && plan.arrivals[plan.next]?.tick === tick);
    if (intents.length === 0) continue;
    const blocked = new Map<string, MovementBlock>();
    const block = (plan: MovementPlan, reason: MovementBlockReason): void => {
      blocked.set(plan.deployment.id, {
        at: { ...plan.arrivals[plan.next]!.coord },
        reason,
        distanceIncrement: tick / 4,
      });
    };

    for (let leftIndex = 0; leftIndex < intents.length; leftIndex += 1) {
      const left = intents[leftIndex]!;
      if (!blocksGroundMovement(left.deployment)) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < intents.length; rightIndex += 1) {
        const right = intents[rightIndex]!;
        if (
          blocksGroundMovement(right.deployment) &&
          hostile(left.deployment, right.deployment) &&
          sameCoord(left.arrivals[left.next]!.coord, right.arrivals[right.next]!.coord)
        ) {
          block(left, "HOSTILE_ROUTE_CONTEST");
          block(right, "HOSTILE_ROUTE_CONTEST");
        }
      }
    }

    for (const intent of intents) {
      if (blocked.has(intent.deployment.id) || !blocksGroundMovement(intent.deployment)) continue;
      const destination = intent.arrivals[intent.next]!.coord;
      const occupyingHostile = deployments.some((candidate) =>
        candidate.id !== intent.deployment.id &&
        activeOnMap(candidate) &&
        hostile(intent.deployment, candidate) &&
        positions.has(candidate.id) &&
        sameCoord(positions.get(candidate.id)!, destination)
      );
      if (occupyingHostile) block(intent, "HOSTILE_FORMATION");
    }

    let capacityChanged = true;
    while (capacityChanged) {
      capacityChanged = false;
      const movingIds = new Set(intents.filter((intent) => !blocked.has(intent.deployment.id)).map((intent) => intent.deployment.id));
      const destinations = new Map<string, MovementPlan[]>();
      for (const intent of intents) {
        if (blocked.has(intent.deployment.id)) continue;
        const passingThrough = !blocksGroundMovement(intent.deployment) && intent.next < intent.arrivals.length - 1;
        if (passingThrough) continue;
        const key = coordKey(intent.arrivals[intent.next]!.coord);
        destinations.set(key, [...(destinations.get(key) ?? []), intent]);
      }
      for (const [key, incoming] of destinations) {
        const hex = map.find((candidate) => coordKey(candidate.coord) === key);
        if (!hex) continue;
        const stationaryOccupants = deployments.filter((candidate) =>
          candidate.status !== "DESTROYED" &&
          candidate.status !== "WITHDRAWN" &&
          (candidate.locationState ?? "ON_MAP") === "ON_MAP" &&
          !movingIds.has(candidate.id) &&
          positions.has(candidate.id) &&
          coordKey(positions.get(candidate.id)!) === key
        ).length;
        if (stationaryOccupants + incoming.length <= hex.capacity) continue;
        for (const intent of incoming) {
          if (!blocked.has(intent.deployment.id)) {
            block(intent, "HEX_CAPACITY");
            capacityChanged = true;
          }
        }
      }
    }

    for (const intent of intents) {
      const movementBlock = blocked.get(intent.deployment.id);
      if (movementBlock) {
        intent.stopped = true;
        blocks.set(intent.deployment.id, movementBlock);
        continue;
      }
      const destination = intent.arrivals[intent.next]!.coord;
      positions.set(intent.deployment.id, { ...destination });
      intent.traversed.push({ ...destination });
      intent.next += 1;
    }
  }

  return plans.map((plan) => ({
    unitId: plan.deployment.id,
    orderId: plan.order.id,
    from: { ...plan.order.startHex },
    to: { ...(positions.get(plan.deployment.id) ?? plan.order.startHex) },
    traversedRoute: plan.traversed,
    block: blocks.get(plan.deployment.id),
  }));
}

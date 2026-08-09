import type {
  CampaignDeployment,
  CampaignEvent,
  PendingPersistentEffect,
  RoundInput,
  RoundOutput,
  UnitOrder,
  WeaponProfile,
} from "../../domain/src";
import {
  calculateRouteCost,
  canOccupyHex,
  coordKey,
  sameCoord,
} from "./hex";
import { resolveAttackRoll, tickCooldowns, validateSpeedBudget } from "./mechanics";
import { createSeededRandom, hashSeed } from "./rng";
import { getActionDefinition, getOrderTypeDefinition } from "./catalogue";

export const ENGINE_VERSION = "foundation-0.1.0";

export interface OrderValidation {
  legal: boolean;
  reasons: string[];
  movementCost: number;
}

export function validateOrder(
  order: UnitOrder,
  deployment: CampaignDeployment | undefined,
  input: RoundInput,
): OrderValidation {
  const reasons: string[] = [];
  if (!deployment) return { legal: false, reasons: ["Deployment does not exist."], movementCost: 0 };
  if (deployment.status === "DESTROYED") reasons.push("Unit was destroyed before the order resolved.");
  if (deployment.status === "IMMOBILISED" && order.route.length > 1) reasons.push("Unit is immobilised.");
  if (order.campaignId !== input.previousState.campaignId) reasons.push("Order belongs to another campaign.");
  if (order.round !== input.previousState.round) reasons.push("Order targets another round.");
  if (order.unitId !== deployment.id) reasons.push("Order unit does not match deployment.");
  if (!sameCoord(order.startHex, deployment.position)) reasons.push("Order start does not match authoritative unit position.");
  if (order.route.length === 0 || !sameCoord(order.route[0], order.startHex)) reasons.push("Route must begin at startHex.");
  if (!sameCoord(order.route.at(-1) ?? order.startHex, order.endHex)) reasons.push("Route must end at endHex.");
  if (order.orderType === "HOLD" && order.route.length > 1) reasons.push("HOLD cannot include movement.");
  const orderDefinition = getOrderTypeDefinition(order.orderType);
  if (!orderDefinition.executable) {
    reasons.push(`${order.orderType.replaceAll("_", " ")} is catalogued but not executable in this engine version.`);
  }
  const route = calculateRouteCost(order.route, input.previousState.map, {
    rush: order.orderType === "RUSH",
  });
  if (!route.legal) reasons.push(route.reason ?? "Route is illegal.");
  const budget = validateSpeedBudget(deployment.stats, route.total, [
    ...order.actions,
    ...order.incidentalActions,
  ]);
  if (!budget.legal) reasons.push(`Speed budget exceeded (${budget.spent}/${budget.available}).`);
  for (const action of [...order.actions, ...order.incidentalActions]) {
    let definition;
    try {
      definition = getActionDefinition(action.type);
    } catch {
      reasons.push(`${action.type.replaceAll("_", " ")} has no active rules definition.`);
      continue;
    }
    if (!definition.executable) {
      reasons.push(`${action.type.replaceAll("_", " ")} is catalogued but not executable in this engine version.`);
    }
    if (action.economy !== definition.economy || action.speedCost !== definition.speedCost) {
      reasons.push(`${action.type.replaceAll("_", " ")} economy or speed cost does not match the pinned ruleset.`);
    }
  }
  if (order.orderType === "RUSH" && order.actions.some((action) => action.type === "ATTACK")) {
    reasons.push("RUSH units cannot attack.");
  }
  if (order.actions.filter((action) => action.type === "ATTACK").length > 1) {
    reasons.push("A unit receives one attack activation per round.");
  }
  const primaryCount = order.actions.filter((action) => action.economy === "PRIMARY").length;
  if (primaryCount > 0 && order.actions.some((action) => action.type === "ATTACK")) {
    reasons.push("A Primary Action replaces the unit's attack.");
  }
  return { legal: reasons.length === 0, reasons, movementCost: route.total };
}

function stableDigest(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    }
    return item;
  });
  return hashSeed(serialized).toString(16).padStart(8, "0");
}

export function resolveRound(input: RoundInput): RoundOutput {
  if (input.rulesetVersion !== input.previousState.rulesetVersion) {
    throw new Error("Round ruleset does not match the campaign-bound ruleset.");
  }

  const suppliedOrders = [...input.playerOrders, ...input.enemyOrders];
  const alreadyResolved =
    suppliedOrders.length > 0 &&
    suppliedOrders.every((order) =>
      input.previousState.orders.some(
        (stored) =>
          stored.id === order.id &&
          stored.revision === order.revision &&
          stored.lifecycle === "RESOLVED",
      ),
    );
  if (alreadyResolved) {
    const state = structuredClone(input.previousState);
    const digest = stableDigest({
      campaignId: state.campaignId,
      round: state.round,
      deployments: state.deployments,
      objectives: state.objectives,
      events: state.events,
    });
    return { state, events: [], persistentEffects: [], digest };
  }

  const state = structuredClone(input.previousState);
  state.phase = "RESOLVING";
  state.engineVersion = ENGINE_VERSION;
  const allOrders = suppliedOrders
    .filter((order) => order.lifecycle === "SUBMITTED" || order.lifecycle === "LOCKED")
    .sort((left, right) => left.unitId.localeCompare(right.unitId) || left.revision - right.revision);
  const events: CampaignEvent[] = [];
  const effects: PendingPersistentEffect[] = [];
  const random = createSeededRandom(input.seed);
  let sequence = Math.max(
    0,
    ...state.events.filter((item) => item.round === state.round).map((item) => item.sequence),
  );

  const event = <TPayload extends Record<string, unknown>>(
    type: CampaignEvent["type"],
    actor: string | undefined,
    payload: TPayload,
    visibility: CampaignEvent["visibility"] = "PUBLIC",
  ): CampaignEvent<TPayload> => {
    sequence += 1;
    const created: CampaignEvent<TPayload> = {
      eventId: `${state.campaignId}:${state.round}:${String(sequence).padStart(4, "0")}:${type}`,
      campaignId: state.campaignId,
      round: state.round,
      sequence,
      type,
      actor,
      payload,
      timestamp: input.resolutionTime,
      visibility,
    };
    events.push(created);
    return created;
  };

  const validOrders = new Map<string, UnitOrder>();
  for (const order of allOrders) {
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId);
    const validation = validateOrder(order, deployment, input);
    const stateOrder = state.orders.find((candidate) => candidate.id === order.id);
    if (!validation.legal || !deployment) {
      if (stateOrder) stateOrder.lifecycle = "FAILED";
      event(
        "ORDER_REJECTED",
        order.unitId,
        { orderId: order.id, reasons: validation.reasons },
        deployment?.side === "ENEMY" ? "ENEMY" : "ALLIED",
      );
      continue;
    }
    validOrders.set(order.unitId, order);
  }

  for (const deployment of state.deployments) {
    deployment.cooldowns = tickCooldowns(deployment.cooldowns);
  }

  const movementOrders = [...validOrders.values()].filter((order) => order.route.length > 1);
  const contestedDestinations = new Set<string>();
  const movementByDestination = new Map<string, UnitOrder[]>();
  for (const order of movementOrders) {
    const key = coordKey(order.endHex);
    movementByDestination.set(key, [...(movementByDestination.get(key) ?? []), order]);
  }
  for (const [key, incoming] of movementByDestination) {
    const destination = state.map.find((hex) => coordKey(hex.coord) === key);
    if (!destination || incoming.length < 2) continue;
    const incomingIds = new Set(incoming.map((order) => order.unitId));
    const occupants = state.deployments.filter(
      (deployment) =>
        !incomingIds.has(deployment.id) &&
        deployment.status !== "DESTROYED" &&
        deployment.status !== "WITHDRAWN" &&
        sameCoord(deployment.position, destination.coord),
    ).length;
    if (occupants + incoming.length > destination.capacity) contestedDestinations.add(key);
  }

  for (const order of validOrders.values()) {
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    deployment.facing = order.facing;
    if (order.route.length <= 1) continue;
    if (contestedDestinations.has(coordKey(order.endHex))) {
      event("UNIT_BLOCKED", deployment.id, {
        orderId: order.id,
        at: coordKey(order.endHex),
        reason: "SIMULTANEOUS_CAPACITY_CONTEST",
      });
      continue;
    }
    if (!canOccupyHex(order.endHex, deployment.id, state.deployments, state.map)) {
      event("UNIT_BLOCKED", deployment.id, {
        orderId: order.id,
        at: coordKey(order.endHex),
        reason: "HEX_CAPACITY",
      });
      continue;
    }
    const from = { ...deployment.position };
    deployment.position = { ...order.endHex };
    event("UNIT_MOVED", deployment.id, {
      orderId: order.id,
      from,
      to: deployment.position,
      route: order.route,
      orderType: order.orderType,
    });
  }

  const damage = new Map<string, number>();
  const rushingUnits = new Set(
    [...validOrders.entries()]
      .filter(([, order]) => order.orderType === "RUSH")
      .map(([unitId]) => unitId),
  );

  for (const order of validOrders.values()) {
    const attacker = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    for (const action of order.actions.filter((candidate) => candidate.type === "ATTACK")) {
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      const weapon = attacker.weapons.find((candidate) => candidate.id === action.weaponId);
      if (!target || !weapon) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: [target ? "Weapon does not exist on unit." : "Target does not exist."],
        });
        continue;
      }
      const result = resolveAttackRoll(attacker, target, weapon, state.map, random, state.deployments);
      if (!result.legal || !result.roll) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: [result.reason ?? "Attack is illegal."],
        });
        continue;
      }
      if (result.ammoAfter !== undefined) attacker.ammunition[weapon.id] = result.ammoAfter;
      if (result.cooldownAfter) attacker.cooldowns[weapon.id] = result.cooldownAfter;
      event("DICE_ROLLED", attacker.id, {
        actionId: action.id,
        weaponId: weapon.id,
        targetId: target.id,
        dice: weapon.damage,
        raw: result.roll.raw,
        modified: result.roll.modified,
        capped: result.roll.capped,
      });
      const rushMultiplier = rushingUnits.has(target.id) ? 2 : 1;
      const healthLoss = result.healthLoss * rushMultiplier;
      event("UNIT_ATTACKED", attacker.id, {
        actionId: action.id,
        targetId: target.id,
        weaponId: weapon.id,
        armor: result.targetArmor,
        effectiveArmor: result.effectiveArmor,
        defense: result.targetDefense,
        threshold: result.threshold,
        rearAttack: result.rearAttack,
        penetrated: result.penetrated,
        rushMultiplier,
        healthLoss,
      });
      if (healthLoss > 0) damage.set(target.id, (damage.get(target.id) ?? 0) + healthLoss);
    }
  }

  for (const [targetId, healthLoss] of [...damage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const target = state.deployments.find((candidate) => candidate.id === targetId);
    if (!target) continue;
    const before = target.currentHealth;
    target.currentHealth = Math.max(0, target.currentHealth - healthLoss);
    event("DAMAGE_APPLIED", target.id, {
      healthModel: target.stats.healthModel,
      before,
      loss: healthLoss,
      after: target.currentHealth,
    });
    if (target.currentHealth === 0) {
      target.status = "DESTROYED";
      event("UNIT_DESTROYED", target.id, {
        persistentUnitId: target.persistentUnitId,
        equipmentLost: target.equipmentIds,
      });
      if (target.persistentUnitId) {
        effects.push({
          idempotencyKey: `${state.campaignId}:${state.round}:destroy:${target.persistentUnitId}`,
          type: "UNIT_DESTROYED",
          unitId: target.persistentUnitId,
          payload: { campaignId: state.campaignId, round: state.round, equipmentLost: target.equipmentIds },
          status: "PENDING",
        });
      }
    } else if (target.persistentUnitId) {
      effects.push({
        idempotencyKey: `${state.campaignId}:${state.round}:damage:${target.persistentUnitId}`,
        type: "UNIT_DAMAGED",
        unitId: target.persistentUnitId,
        payload: { campaignId: state.campaignId, round: state.round, currentHealth: target.currentHealth },
        status: "PENDING",
      });
    }
  }

  for (const order of state.orders) {
    const accepted = validOrders.get(order.unitId);
    if (accepted && accepted.id === order.id && accepted.revision === order.revision) {
      order.lifecycle = "RESOLVED";
    }
  }
  event("ROUND_FINISHED", undefined, {
    ordersAccepted: validOrders.size,
    ordersRejected: allOrders.length - validOrders.size,
    unitsDestroyed: state.deployments.filter((deployment) => deployment.status === "DESTROYED").length,
  });
  state.events = [...state.events, ...events].slice(-1000);
  state.pendingPersistentEffects = [...state.pendingPersistentEffects, ...effects];
  state.version += 1;
  const digest = stableDigest({
    campaignId: state.campaignId,
    round: state.round,
    deployments: state.deployments,
    objectives: state.objectives,
    events: state.events,
  });
  return { state, events, persistentEffects: effects, digest };
}

export function weaponById(deployment: CampaignDeployment, weaponId: string): WeaponProfile | undefined {
  return deployment.weapons.find((weapon) => weapon.id === weaponId);
}

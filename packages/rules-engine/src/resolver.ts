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
  hexDistance,
  sameCoord,
} from "./hex";
import { cargoSlotsForItem, disembarkCargo, embarkCargo, reloadAmmunition } from "./logistics";
import { resolveAttackRoll, tickCooldowns, validateSpeedBudget } from "./mechanics";
import { createSeededRandom, hashSeed } from "./rng";
import { getTacticalActionRule, getTacticalOrderRule } from "./tactical-grammar";
import { applyScenarioReinforcements, evaluateScenarioRoundEnd } from "./scenario";

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
  const embarked = deployment.locationState === "EMBARKED" || deployment.locationState === "IN_VEHICLE" || deployment.locationState === "IN_AIR_TRANSPORT";
  if (embarked && (order.route.length > 1 || order.actions.some((action) => action.type !== "UNLOAD"))) {
    reasons.push("Embarked units cannot move or perform actions other than coordinated unloading.");
  }
  if (order.campaignId !== input.previousState.campaignId) reasons.push("Order belongs to another campaign.");
  if (order.round !== input.previousState.round) reasons.push("Order targets another round.");
  if (order.unitId !== deployment.id) reasons.push("Order unit does not match deployment.");
  if (!sameCoord(order.startHex, deployment.position)) reasons.push("Order start does not match authoritative unit position.");
  if (order.route.length === 0 || !sameCoord(order.route[0], order.startHex)) reasons.push("Route must begin at startHex.");
  if (!sameCoord(order.route.at(-1) ?? order.startHex, order.endHex)) reasons.push("Route must end at endHex.");
  if (order.orderType === "HOLD" && order.route.length > 1) reasons.push("HOLD cannot include movement.");
  const orderDefinition = getTacticalOrderRule(order.orderType);
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
      definition = getTacticalActionRule(action.type);
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

function campaignStateDigest(state: RoundOutput["state"]): string {
  return stableDigest({
    campaignId: state.campaignId,
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    round: state.round,
    phase: state.phase,
    deployments: state.deployments,
    objectives: state.objectives,
    scenarioPolicy: state.scenarioPolicy,
    reinforcementWaves: state.reinforcementWaves,
    outcome: state.outcome,
    events: state.events,
  });
}

export function resolveRound(input: RoundInput): RoundOutput {
  if (input.rulesetVersion !== input.previousState.rulesetVersion) {
    throw new Error("Round ruleset does not match the campaign-bound ruleset.");
  }

  if (input.previousState.outcome) {
    const state = structuredClone(input.previousState);
    return { state, events: [], persistentEffects: [], digest: campaignStateDigest(state) };
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
    const digest = campaignStateDigest(state);
    return { state, events: [], persistentEffects: [], digest };
  }

  const state = structuredClone(input.previousState);
  const participatingPersistentUnitIds = state.deployments
    .filter((deployment) =>
      deployment.side === "ALLIED" &&
      deployment.persistentUnitId !== undefined &&
      deployment.status !== "DESTROYED" &&
      deployment.status !== "WITHDRAWN" &&
      (deployment.locationState ?? "ON_MAP") === "ON_MAP"
    )
    .map((deployment) => deployment.persistentUnitId!)
    .sort((left, right) => left.localeCompare(right));
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
        (deployment.locationState ?? "ON_MAP") === "ON_MAP" &&
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

  for (const order of validOrders.values()) {
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const actorVisibility: CampaignEvent["visibility"] = actor.side === "ENEMY" ? "ENEMY" : "ALLIED";
    for (const action of order.actions.filter((candidate) => candidate.type !== "ATTACK")) {
      if (action.type === "LOAD") {
        if (!actor.cargoProfile && action.targetDeploymentId && state.deployments.find((candidate) => candidate.id === action.targetDeploymentId)?.cargoProfile) continue;
        const cargo = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const matching = cargo && validOrders.get(cargo.id)?.actions.some((candidate) => candidate.type === "LOAD" && candidate.targetDeploymentId === actor.id);
        if (!cargo || !matching || !actor.cargoProfile || !sameCoord(actor.position, cargo.position) || cargo.locationState === "EMBARKED") {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Loading requires an eligible co-located carrier and matching cargo action."] }, actorVisibility);
          continue;
        }
        const item = {
          id: `campaign-cargo:${state.campaignId}:${cargo.id}`,
          kind: cargo.stats.healthModel === "FORCE_STRENGTH" ? "PERSONNEL" as const : "VEHICLE" as const,
          quantity: 1,
          tags: cargo.stats.healthModel === "FORCE_STRENGTH" ? ["INFANTRY"] : ["VEHICLE"],
          transportMode: "EMBARKED" as const,
          unitId: cargo.id,
        };
        const loaded = embarkCargo(actor.cargoProfile, actor.cargo ?? [], item, Math.round(actor.stats.speed * 4));
        if (!loaded.legal) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: [loaded.reason ?? "Cargo cannot be loaded."] }, actorVisibility);
          continue;
        }
        actor.cargo = loaded.manifest;
        cargo.locationState = "EMBARKED";
        cargo.position = { ...actor.position };
        event("CARGO_LOADED", actor.id, { actionId: action.id, cargoDeploymentId: cargo.id, speedCostQuarters: loaded.speedCostQuarters }, actorVisibility);
      }
      if (action.type === "UNLOAD") {
        if (!actor.cargoProfile && action.targetDeploymentId && state.deployments.find((candidate) => candidate.id === action.targetDeploymentId)?.cargoProfile) continue;
        const cargoId = typeof action.payload?.cargoDeploymentId === "string" ? action.payload.cargoDeploymentId : action.targetDeploymentId;
        const cargo = state.deployments.find((candidate) => candidate.id === cargoId);
        const item = actor.cargo?.find((candidate) => candidate.unitId === cargo?.id);
        const matching = cargo && validOrders.get(cargo.id)?.actions.some((candidate) => candidate.type === "UNLOAD" && candidate.targetDeploymentId === actor.id);
        if (!cargo || !item || !matching || !actor.cargoProfile) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Unloading requires manifested cargo and matching cargo action."] }, actorVisibility);
          continue;
        }
        const targetHex = action.targetHex ?? actor.position;
        const hex = state.map.find((candidate) => sameCoord(candidate.coord, targetHex));
        const isAirDrop = item.transportMode === "AIRLIFTED" || action.payload?.mode === "PARADROP";
        if (!hex || (isAirDrop && !canOccupyHex(targetHex, cargo.id, state.deployments, state.map))) {
          event("AIR_DROP_FAILED", actor.id, { actionId: action.id, cargoDeploymentId: cargo.id, targetHex, reason: "DROP_HEX_BLOCKED" }, actorVisibility);
          continue;
        }
        if (!isAirDrop && !sameCoord(targetHex, actor.position)) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Normal unloading must use the carrier hex."] }, actorVisibility);
          continue;
        }
        const unloaded = disembarkCargo(actor.cargoProfile, actor.cargo ?? [], [item.id], Math.round(actor.stats.speed * 4));
        if (!unloaded.legal) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: [unloaded.reason ?? "Cargo cannot unload."] }, actorVisibility);
          continue;
        }
        actor.cargo = unloaded.manifest;
        cargo.locationState = "ON_MAP";
        cargo.position = { ...targetHex };
        event(isAirDrop ? "AIR_DROP_COMPLETED" : "CARGO_UNLOADED", actor.id, {
          actionId: action.id, cargoDeploymentId: cargo.id, targetHex, speedCostQuarters: unloaded.speedCostQuarters,
        }, actorVisibility);
      }
      if (action.type === "RELOAD") {
        const weapon = actor.weapons.find((candidate) => candidate.id === action.weaponId);
        if (!weapon) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Reload weapon is not fitted."] }, actorVisibility);
          continue;
        }
        const currentAmmo = actor.ammunition[weapon.id] ?? 0;
        const reloaded = reloadAmmunition({
          profile: { id: "v5-field-reload", supplyType: "SMALL_SUPPLY", supplyCost: 1, ammunitionPerAction: "FULL", requiresLanding: false, requiredFacilityTags: [], facilityTagMatch: "ANY", actionEconomy: "STANDARD" },
          weapon,
          currentAmmo,
          supplies: actor.supplies ?? {},
          landed: true,
          facilityTags: [],
        });
        if (!reloaded.legal) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: [reloaded.reason ?? "Reload is illegal."] }, actorVisibility);
          continue;
        }
        actor.ammunition[weapon.id] = reloaded.ammunitionAfter;
        actor.supplies = reloaded.supplies;
        event("WEAPON_RELOADED", actor.id, { actionId: action.id, weaponId: weapon.id, ammunitionAfter: reloaded.ammunitionAfter, supplySpent: reloaded.supplySpent }, actorVisibility);
      }
      if (action.type === "SCAN" || action.type === "DEPLOY_DRONE") {
        const targetHex = action.targetHex;
        const ability = action.type === "DEPLOY_DRONE"
          ? actor.abilities?.find((candidate) => candidate.handlerId === "DEPLOY_DRONE" || candidate.abilityId === "ability-deploy-drone")
          : undefined;
        const maximumRange = action.type === "DEPLOY_DRONE" ? 5 : actor.stats.sensors;
        const cooldownKey = ability?.abilityId ?? action.type;
        if (!targetHex || hexDistance(actor.position, targetHex) > maximumRange || (actor.cooldowns[cooldownKey] ?? 0) > 0 || (action.type === "DEPLOY_DRONE" && !ability)) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Scan target, range, ability, or cooldown is invalid."] }, actorVisibility);
          continue;
        }
        if (action.type === "DEPLOY_DRONE") actor.cooldowns[cooldownKey] = 6;
        event(action.type === "DEPLOY_DRONE" ? "DRONE_DEPLOYED" : "HEX_SCANNED", actor.id, {
          actionId: action.id, targetHex, maximumRange, cooldownRounds: action.type === "DEPLOY_DRONE" ? 6 : 0,
        }, actorVisibility);
      }
    }
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
      target.locationState = "DESTROYED";
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

  for (const deployment of state.deployments.filter((candidate) => candidate.persistentUnitId)) {
    effects.push({
      idempotencyKey: `${state.campaignId}:${state.round}:state:${deployment.persistentUnitId}`,
      type: "UNIT_STATE_UPDATED",
      unitId: deployment.persistentUnitId,
      payload: {
        campaignId: state.campaignId,
        round: state.round,
        locationState: deployment.locationState ?? "ON_MAP",
        ammunition: deployment.ammunition,
        cooldowns: deployment.cooldowns,
        supplies: deployment.supplies ?? {},
        cargo: (deployment.cargo ?? []).map((item) => ({
          ...item,
          slotsQuarters: deployment.cargoProfile ? cargoSlotsForItem(deployment.cargoProfile, item).slotsQuarters : 0,
          unitId: item.unitId
            ? state.deployments.find((candidate) => candidate.id === item.unitId)?.persistentUnitId ?? item.unitId
            : undefined,
        })),
      },
      status: "PENDING",
    });
  }

  for (const order of state.orders) {
    const accepted = validOrders.get(order.unitId);
    if (accepted && accepted.id === order.id && accepted.revision === order.revision) {
      order.lifecycle = "RESOLVED";
    }
  }

  const scenario = evaluateScenarioRoundEnd(state);
  state.objectives = scenario.objectives;
  for (const capture of scenario.captures) {
    event("OBJECTIVE_CAPTURED", undefined, { ...capture });
  }
  if (scenario.outcome) state.outcome = scenario.outcome;
  const reinforcements = applyScenarioReinforcements(state);
  state.deployments = reinforcements.deployments;
  state.reinforcementWaves = reinforcements.reinforcementWaves;
  for (const arrival of reinforcements.arrivals) {
    event("ENEMY_REINFORCEMENTS_ARRIVED", undefined, {
      ...arrival,
      entryRound: state.round + 1,
    });
  }
  event("ROUND_FINISHED", undefined, {
    ordersAccepted: validOrders.size,
    ordersRejected: allOrders.length - validOrders.size,
    unitsDestroyed: state.deployments.filter((deployment) => deployment.status === "DESTROYED").length,
  });
  if (scenario.outcome) {
    state.phase = "COMPLETE";
    event(
      scenario.outcome.result === "VICTORY" ? "CAMPAIGN_COMPLETED" : "CAMPAIGN_FAILED",
      undefined,
      { ...scenario.outcome },
    );
  }
  for (const persistentUnitId of participatingPersistentUnitIds) {
    effects.push({
      idempotencyKey: `${state.campaignId}:${state.round}:history:${persistentUnitId}`,
      type: "CAMPAIGN_HISTORY",
      unitId: persistentUnitId,
      payload: {
        campaignId: state.campaignId,
        round: state.round,
        campaignName: state.campaignName,
        scenarioId: state.scenarioId,
        result: scenario.outcome?.result,
        reason: scenario.outcome?.reason,
        campaignCompleted: scenario.outcome !== undefined,
      },
      status: "PENDING",
    });
  }
  state.events = [...state.events, ...events].slice(-1000);
  state.pendingPersistentEffects = [...state.pendingPersistentEffects, ...effects];
  state.version += 1;
  const digest = campaignStateDigest(state);
  return { state, events, persistentEffects: effects, digest };
}

export function weaponById(deployment: CampaignDeployment, weaponId: string): WeaponProfile | undefined {
  return deployment.weapons.find((weapon) => weapon.id === weaponId);
}

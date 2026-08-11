import type {
  CampaignDeployment,
  CampaignEvent,
  ArtilleryProfile,
  EngineerRepairChoice,
  EngineerRepairProfile,
  HealingProfile,
  PendingPersistentEffect,
  RoundInput,
  RoundOutput,
  StructuredAction,
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
import {
  attachTow,
  cargoSlotsForItem,
  detachTow,
  disembarkCargo,
  embarkCargo,
  reloadAmmunition,
  synchronizeSupplyCargo,
  resupplyLogiTarget,
} from "./logistics";
import { hasDisabledSubsystem, resolveAttackRoll, tickCooldowns, validateSpeedBudget } from "./mechanics";
import { resolveSimultaneousMovement } from "./movement";
import { resolveEngineerRepair, resolveHealing, resolveSubsystemDamage } from "./forces";
import { getFieldworkDefinition, isConstructibleFieldworkId, structureInstanceMatches } from "./fieldworks";
import {
  applyBombardmentSuppression,
  recoverBombardmentSuppression,
  validateArtilleryFire,
  validateBomberAttack,
  validateHatClearAirDrop,
  validateLimitedForwardArc,
} from "./specialists";
import { createSeededRandom, hashSeed } from "./rng";
import { getTacticalActionRule, getTacticalOrderRule } from "./tactical-grammar";
import { getTacticalSubsystemRules, getTacticalUnitClass } from "./tactical-unit-catalogue";
import { applyScenarioReinforcements, evaluateScenarioRoundEnd } from "./scenario";

export const ENGINE_VERSION = "foundation-0.1.0";

export interface OrderValidation {
  legal: boolean;
  reasons: string[];
  movementCost: number;
}

function isArtilleryDeployment(deployment: CampaignDeployment): boolean {
  try {
    return getTacticalUnitClass(deployment.definitionId).tags.includes("ARTILLERY");
  } catch {
    return false;
  }
}

function artilleryState(deployment: CampaignDeployment): "PACKED" | "DEPLOYED" {
  return deployment.artilleryDeployment ?? (deployment.statuses.includes("DEPLOYED") ? "DEPLOYED" : "PACKED");
}

const artilleryProfile: ArtilleryProfile = {
  id: "v5-artillery",
  deploySpeedCostQuarters: 2,
  packSpeedCostQuarters: 2,
  mustBeDeployedForIndirectFire: true,
  indirectRequiresSpotter: true,
  fireSupplyType: "SMALL_SUPPLY",
  fireSupplyCost: 1,
  handlerId: "foundation-action-handler",
};

function deploymentTags(deployment: CampaignDeployment): string[] {
  if (deployment.tags) return deployment.tags;
  try {
    return getTacticalUnitClass(deployment.definitionId).tags;
  } catch {
    return [];
  }
}

function isAerospaceDeployment(deployment: CampaignDeployment): boolean {
  const tags = deploymentTags(deployment);
  return tags.includes("ATMO_FLIGHT") || tags.includes("VTOL");
}

function facilitySupports(
  state: RoundOutput["state"],
  deployment: CampaignDeployment,
  position: CampaignDeployment["position"],
  capability: "LAND" | "REARM_AEROSPACE",
): boolean {
  const hex = state.map.find((candidate) => sameCoord(candidate.coord, position));
  if (!hex) return false;
  const friendly = hex.control === deployment.side || (
    hex.objectiveId !== undefined &&
    state.objectives.find((objective) => objective.id === hex.objectiveId)?.owner === deployment.side
  );
  if (!friendly) return false;
  if (capability === "REARM_AEROSPACE") return hex.environment.includes("REARM_AEROSPACE");
  return deploymentTags(deployment).includes("VTOL")
    ? hex.environment.includes("LAND_VTOL")
    : hex.environment.includes("LAND_AEROSPACE");
}

function synchronizeEmbarkedCargo(deployments: CampaignDeployment[]): void {
  const byId = new Map(deployments.map((deployment) => [deployment.id, deployment]));
  for (const carrier of deployments) {
    for (const item of carrier.cargo ?? []) {
      if (!item.unitId) continue;
      const passenger = byId.get(item.unitId);
      if (!passenger || passenger.locationState !== "EMBARKED") continue;
      passenger.position = { ...carrier.position };
    }
  }
}

function synchronizeDeploymentSupplyCargo(campaignId: string, deployments: CampaignDeployment[]): void {
  for (const deployment of deployments) {
    if (!deployment.cargoProfile) continue;
    deployment.cargo = synchronizeSupplyCargo(
      deployment.cargoProfile,
      deployment.cargo ?? [],
      deployment.supplies ?? {},
      `campaign-cargo:${campaignId}:${deployment.id}:supply`,
    );
  }
}

function campaignCargoItem(
  campaignId: string,
  cargo: CampaignDeployment,
  transportMode: "EMBARKED" | "TOWED" = "EMBARKED",
) {
  return {
    id: `campaign-cargo:${campaignId}:${cargo.id}`,
    kind: cargo.stats.healthModel === "FORCE_STRENGTH" ? "PERSONNEL" as const : "VEHICLE" as const,
    quantity: cargo.stats.healthModel === "FORCE_STRENGTH" ? cargo.currentHealth : 1,
    tags: deploymentTags(cargo),
    transportMode,
    unitId: cargo.id,
  };
}

function cargoTransportMode(
  carrier: CampaignDeployment,
  cargo: CampaignDeployment,
): "EMBARKED" | "TOWED" | undefined {
  if (isArtilleryDeployment(cargo)) {
    if (
      carrier.cargoProfile &&
      artilleryState(cargo) === "PACKED" &&
      attachTow(carrier.cargoProfile, [], { unitId: cargo.id, tags: deploymentTags(cargo) }).legal
    ) return "TOWED";
    return undefined;
  }
  return "EMBARKED";
}

function artillerySpotters(state: RoundOutput["state"], artillery: CampaignDeployment) {
  return state.deployments
    .filter((deployment) =>
      deployment.side === artillery.side &&
      deployment.status !== "DESTROYED" &&
      deployment.status !== "WITHDRAWN" &&
      (deployment.locationState ?? "ON_MAP") === "ON_MAP"
    )
    .map((deployment) => ({
      id: deployment.id,
      side: deployment.side,
      status: deployment.status,
      position: deployment.position,
      sensorRange: deployment.stats.sensors,
      tags: deploymentTags(deployment),
      profile: {
        id: "v5-ground-spotter",
        canSpotDomains: ["GROUND" as const],
        allowsFiringUnit: false,
        prohibitedTags: ["CANNOT_SPOT_GROUND"],
      },
    }));
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
  if (hasDisabledSubsystem(deployment, "MOBILITY") && order.route.length > 1) {
    reasons.push("The unit's mobility subsystem is disabled.");
  }
  const actions = [...order.actions, ...order.incidentalActions];
  const takesOff = actions.some((action) => action.type === "TAKE_OFF");
  const lands = actions.some((action) => action.type === "LAND");
  const rearms = actions.some((action) => action.type === "REARM_AEROSPACE");
  const landed = deployment.statuses.includes("LANDED");
  if (landed && order.route.length > 1 && !takesOff) reasons.push("A landed aerospace unit must Take Off before moving.");
  if (takesOff && lands) reasons.push("An aerospace unit cannot land and take off in the same round.");
  if (takesOff && !landed) reasons.push("Only a landed aerospace unit can Take Off.");
  if (lands && landed) reasons.push("The aerospace unit is already landed.");
  if ((takesOff || lands || rearms) && !isAerospaceDeployment(deployment)) {
    reasons.push("Landing, takeoff, and aerospace rearm require an aerospace unit.");
  }
  if (lands && !facilitySupports(input.previousState, deployment, order.endHex, "LAND")) {
    reasons.push("Landing requires a friendly compatible airfield at the route endpoint.");
  }
  if (rearms) {
    if (!landed && !lands) reasons.push("Aerospace rearm requires the unit to be landed.");
    if (!facilitySupports(input.previousState, deployment, order.endHex, "REARM_AEROSPACE")) {
      reasons.push("Aerospace rearm requires a friendly rearm facility.");
    }
    if (!deployment.weapons.some((weapon) => weapon.ammoCapacity !== undefined)) {
      reasons.push("This aerospace unit has no ammunition store to rearm.");
    }
  }
  const artillery = isArtilleryDeployment(deployment);
  const artilleryDeployed = artilleryState(deployment) === "DEPLOYED";
  if (artillery && artilleryDeployed && order.route.length > 1) {
    reasons.push("Deployed artillery must pack up before it can move in a later round.");
  }
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
  if (order.orderType === "EVASIVE") {
    const tags = new Set(deployment.tags ?? []);
    if (!tags.has("EVASIVE") && !tags.has("EVASIVE_CAPABLE")) {
      reasons.push("This unit is not capable of Evasive movement.");
    }
    const requiredDisplacement = deployment.stats.speed / 2;
    if (hexDistance(order.startHex, order.endHex) < requiredDisplacement) {
      reasons.push(`EVASIVE must end at least ${requiredDisplacement} hexes from the starting position.`);
    }
  }
  const orderDefinition = getTacticalOrderRule(order.orderType);
  if (!orderDefinition.executable) {
    reasons.push(`${order.orderType.replaceAll("_", " ")} is catalogued but not executable in this engine version.`);
  }
  const route = calculateRouteCost(order.route, input.previousState.map, {
    rush: order.orderType === "RUSH",
    unitTags: deployment.tags,
  });
  if (!route.legal) reasons.push(route.reason ?? "Route is illegal.");
  const budget = validateSpeedBudget(deployment.stats, route.total, [
    ...order.actions,
    ...order.incidentalActions,
  ]);
  if (!budget.legal) reasons.push(`Speed budget exceeded (${budget.spent}/${budget.available}).`);
  for (const action of actions) {
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
  const attackActivations = [...order.actions, ...order.incidentalActions]
    .filter((action) => {
      try {
        return getTacticalActionRule(action.type).usesAttack;
      } catch {
        return false;
      }
    }).length;
  if (attackActivations > 1) reasons.push("A unit receives one attack activation per round.");
  if (order.orderType === "RUSH" && order.actions.some((action) => action.type === "ATTACK")) {
    reasons.push("RUSH units cannot attack.");
  }
  if (order.actions.filter((action) => action.type === "ATTACK").length > 1) {
    reasons.push("A unit receives one attack activation per round.");
  }
  const deployActions = order.actions.filter((action) => action.type === "DEPLOY");
  const packActions = order.actions.filter((action) => action.type === "PACK_UP");
  const digInActions = order.actions.filter((action) => action.type === "DIG_IN");
  const artilleryDigInActions = order.actions.filter((action) => action.type === "ARTILLERY_DIG_IN");
  if (digInActions.length > 1) reasons.push("A unit may Dig In once per round.");
  if (digInActions.length > 0 && order.route.length > 1) reasons.push("Dig In consumes all movement and requires the unit to hold position.");
  if (digInActions.length > 0 && deployment.statuses.includes("DUG_IN")) reasons.push("The unit is already dug in.");
  for (const action of artilleryDigInActions) {
    const target = input.previousState.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
    const targetOrder = [...input.playerOrders, ...input.enemyOrders].find((candidate) => candidate.unitId === target?.id);
    if (!deploymentTags(deployment).includes("ENGINEER")) {
      reasons.push("Dig In Artillery requires an Engineer unit.");
    } else if (
      !target ||
      target.side !== deployment.side ||
      target.status === "DESTROYED" ||
      !deploymentTags(target).includes("ARTILLERY")
    ) {
      reasons.push("Dig In Artillery requires a friendly operational Artillery unit.");
    } else if (artilleryState(target) !== "DEPLOYED") {
      reasons.push("The Artillery unit must already be deployed.");
    } else if (target.statuses.includes("DUG_IN")) {
      reasons.push("The Artillery unit is already dug in.");
    } else if (hexDistance(order.endHex, target.position) > 1) {
      reasons.push("The Engineer must finish adjacent to the Artillery unit.");
    } else if (targetOrder && (targetOrder.route.length > 1 || targetOrder.actions.some((candidate) => candidate.type === "PACK_UP"))) {
      reasons.push("The Artillery unit must remain deployed and stationary this round.");
    }
  }
  if (deployActions.length + packActions.length > 1) reasons.push("Artillery may change platform state once per round.");
  if ((deployActions.length > 0 || packActions.length > 0) && !artillery) {
    reasons.push("Deploy and Pack Up require an Artillery unit.");
  }
  if (deployActions.length > 0 && artilleryDeployed) reasons.push("Artillery is already deployed.");
  if (packActions.length > 0 && !artilleryDeployed) reasons.push("Artillery is already packed.");
  if (artillery && order.actions.some((action) => action.type === "ATTACK") && !artilleryDeployed && deployActions.length === 0) {
    reasons.push("Artillery must deploy before firing.");
  }
  const primaryCount = order.actions.filter((action) => action.economy === "PRIMARY").length;
  if (primaryCount > 1) reasons.push("A unit may perform one Primary Action per round.");
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
  synchronizeDeploymentSupplyCargo(state.campaignId, state.deployments);
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
  const bombardedThisRound = new Set<string>();
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

  const crewRepairingUnits = new Set<string>();
  for (const order of validOrders.values()) {
    if (!order.enemyIntent) continue;
    event("ENEMY_INTENTION_DECLARED", order.unitId, {
      orderId: order.id,
      orderType: order.orderType,
      doctrineDefinitionId: order.enemyIntent.doctrineDefinitionId,
      factionId: order.enemyIntent.factionId,
      targetPreference: order.enemyIntent.targetPreference,
      allocation: order.enemyIntent.allocation,
      objectiveId: order.enemyIntent.objectiveId,
      targetId: order.targets[0],
      destination: order.endHex,
    });
  }

  for (const deployment of state.deployments) {
    deployment.cooldowns = tickCooldowns(deployment.cooldowns);
  }

  for (const order of validOrders.values()) {
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const takeOff = order.actions.find((action) => action.type === "TAKE_OFF");
    if (!takeOff) continue;
    deployment.statuses = deployment.statuses.filter((status) => status !== "LANDED");
    event("AEROSPACE_TOOK_OFF", deployment.id, {
      actionId: takeOff.id,
      position: deployment.position,
      speedCost: takeOff.speedCost,
    }, deployment.side === "ENEMY" ? "ENEMY" : "ALLIED");
  }

  for (const order of validOrders.values()) {
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    deployment.facing = order.facing;
  }
  const movementOutcomes = resolveSimultaneousMovement(
    [...validOrders.values()].filter((order) => order.route.length > 1),
    state.deployments,
    state.map,
  );
  for (const outcome of movementOutcomes) {
    const deployment = state.deployments.find((candidate) => candidate.id === outcome.unitId)!;
    const moved = outcome.traversedRoute.length > 1;
    if (moved) deployment.position = { ...outcome.to };
    if (deployment.statuses.includes("DUG_IN")) {
      const startedInTrench = state.map.find((hex) => sameCoord(hex.coord, outcome.from))?.structureIds
        .some((id) => id === "structure-trench" || id.startsWith("structure-trench:")) ?? false;
      const endedInTrench = state.map.find((hex) => sameCoord(hex.coord, outcome.to))?.structureIds
        .some((id) => id === "structure-trench" || id.startsWith("structure-trench:")) ?? false;
      if (moved && !(startedInTrench && endedInTrench)) {
        deployment.statuses = deployment.statuses.filter((status) => status !== "DUG_IN");
        event("UNIT_DUG_OUT", deployment.id, {
          orderId: outcome.orderId,
          from: outcome.from,
          reason: "MOVED_FROM_POSITION",
        });
      }
    }
    if (moved) {
      const order = validOrders.get(deployment.id)!;
      event("UNIT_MOVED", deployment.id, {
        orderId: outcome.orderId,
        from: outcome.from,
        to: outcome.to,
        route: outcome.traversedRoute,
        declaredDestination: order.endHex,
        orderType: order.orderType,
        digInPreserved: deployment.statuses.includes("DUG_IN"),
      });
    }
    if (outcome.block) {
      event("UNIT_BLOCKED", deployment.id, {
        orderId: outcome.orderId,
        at: coordKey(outcome.block.at),
        reason: outcome.block.reason,
        distanceIncrement: outcome.block.distanceIncrement,
      });
    }
  }
  synchronizeEmbarkedCargo(state.deployments);

  const evasiveUnits = new Set<string>();
  for (const order of validOrders.values()) {
    if (order.orderType !== "EVASIVE") continue;
    const deployment = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const requiredDisplacement = deployment.stats.speed / 2;
    const actualDisplacement = hexDistance(order.startHex, deployment.position);
    const active = actualDisplacement >= requiredDisplacement;
    if (active) evasiveUnits.add(deployment.id);
    event("EVASIVE_MANEUVER", deployment.id, {
      orderId: order.id,
      active,
      requiredDisplacement,
      actualDisplacement,
      attackModifier: active ? -2 : 0,
      defenseModifier: active ? 3 : 0,
      reason: active ? "MINIMUM_DISPLACEMENT_MET" : "MOVEMENT_BLOCKED_BEFORE_MINIMUM_DISPLACEMENT",
    }, deployment.side === "ENEMY" ? "ENEMY" : "ALLIED");
  }

  for (const order of validOrders.values()) {
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const actorVisibility: CampaignEvent["visibility"] = actor.side === "ENEMY" ? "ENEMY" : "ALLIED";
    const supportActions = order.actions
      .filter((candidate) => candidate.type !== "ATTACK")
      .map((action, index) => ({ action, index }))
      .sort((left, right) => {
        const priority = (type: StructuredAction["type"]) => type === "LAND" ? -2 : type === "DEPLOY" ? -1 : 0;
        return priority(left.action.type) - priority(right.action.type) || left.index - right.index;
      })
      .map(({ action }) => action);
    for (const action of supportActions) {
      if (action.type === "TAKE_OFF") continue;
      if (action.type === "LAND") {
        if (!facilitySupports(state, actor, actor.position, "LAND")) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["Landing requires a friendly compatible airfield at the route endpoint."],
          }, actorVisibility);
          continue;
        }
        actor.statuses = [...new Set([...actor.statuses, "LANDED"])];
        event("AEROSPACE_LANDED", actor.id, {
          actionId: action.id,
          position: actor.position,
          speedCost: action.speedCost,
        }, actorVisibility);
      }
      if (action.type === "REARM_AEROSPACE") {
        if (!actor.statuses.includes("LANDED") || !facilitySupports(state, actor, actor.position, "REARM_AEROSPACE")) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["Aerospace rearm requires a landed unit at a friendly rearm facility."],
          }, actorVisibility);
          continue;
        }
        const ammunitionBefore = { ...actor.ammunition };
        const ammunitionAfter = { ...actor.ammunition };
        const weaponIds: string[] = [];
        for (const weapon of actor.weapons) {
          if (weapon.ammoCapacity === undefined) continue;
          ammunitionAfter[weapon.id] = weapon.ammoCapacity;
          weaponIds.push(weapon.id);
        }
        actor.ammunition = ammunitionAfter;
        event("AEROSPACE_REARMED", actor.id, {
          actionId: action.id,
          weaponIds,
          ammunitionBefore,
          ammunitionAfter,
          supplyCost: null,
          rulesDecisionId: "RC-V5-023",
        }, actorVisibility);
      }
      if (action.type === "DIG_IN") {
        if (actor.statuses.includes("DUG_IN")) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["The unit is already dug in."],
          }, actorVisibility);
          continue;
        }
        actor.statuses.push("DUG_IN");
        event("UNIT_DUG_IN", actor.id, {
          actionId: action.id,
          position: actor.position,
          defenseModifier: 2,
          speedCost: action.speedCost,
        }, actorVisibility);
      }
      if (action.type === "ARTILLERY_DIG_IN") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const targetOrder = target && validOrders.get(target.id);
        const targetRemainsStationary = !targetOrder || (
          targetOrder.route.length === 1 && !targetOrder.actions.some((candidate) => candidate.type === "PACK_UP")
        );
        if (
          !deploymentTags(actor).includes("ENGINEER") ||
          !target ||
          target.side !== actor.side ||
          target.status === "DESTROYED" ||
          !deploymentTags(target).includes("ARTILLERY") ||
          artilleryState(target) !== "DEPLOYED" ||
          target.statuses.includes("DUG_IN") ||
          hexDistance(actor.position, target.position) > 1 ||
          !targetRemainsStationary
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !deploymentTags(actor).includes("ENGINEER")
                ? "Dig In Artillery requires an Engineer unit."
                : !target || target.side !== actor.side || !deploymentTags(target).includes("ARTILLERY")
                  ? "Dig In Artillery requires a friendly operational Artillery unit."
                  : artilleryState(target) !== "DEPLOYED"
                    ? "The Artillery unit must already be deployed."
                    : target.statuses.includes("DUG_IN")
                      ? "The Artillery unit is already dug in."
                      : !targetRemainsStationary
                        ? "The Artillery unit must remain deployed and stationary this round."
                        : "The Engineer must finish adjacent to the Artillery unit.",
            ],
          }, actorVisibility);
          continue;
        }
        target.statuses.push("DUG_IN");
        event("UNIT_DUG_IN", actor.id, {
          actionId: action.id,
          targetId: target.id,
          position: target.position,
          defenseModifier: 2,
          speedCost: action.speedCost,
          method: "ENGINEER_ARTILLERY_POSITION",
          conflictId: "RC-V5-025",
        }, actorVisibility);
      }
      if (action.type === "CONSTRUCT") {
        const targetHex = action.targetHex;
        const targetMapHex = targetHex && state.map.find((hex) => sameCoord(hex.coord, targetHex));
        const supplyBefore = actor.supplies?.SMALL_SUPPLY ?? 0;
        const fieldwork = isConstructibleFieldworkId(action.structureDefinitionId)
          ? getFieldworkDefinition(action.structureDefinitionId)
          : undefined;
        const alreadyPresent = fieldwork
          ? targetMapHex?.structureIds.some((id) => structureInstanceMatches(id, fieldwork.id)) ?? false
          : false;
        if (
          !(actor.tags ?? []).includes("ENGINEER") ||
          !fieldwork ||
          !targetHex ||
          !targetMapHex ||
          hexDistance(actor.position, targetHex) > 1 ||
          alreadyPresent ||
          supplyBefore < (fieldwork?.smallSupplyCost ?? 0)
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !(actor.tags ?? []).includes("ENGINEER")
                ? "Construction requires an Engineer unit."
                : !fieldwork
                  ? "That fieldwork is not executable."
                  : alreadyPresent
                    ? `That hex already contains ${fieldwork.name}.`
                    : supplyBefore < fieldwork.smallSupplyCost
                      ? `${fieldwork.name} requires ${fieldwork.smallSupplyCost} Small Supply.`
                      : `${fieldwork.name} must be placed in the Engineer's current or an adjacent hex.`,
            ],
          }, actorVisibility);
          continue;
        }
        const instanceId = `${fieldwork.id}:${state.campaignId}:${state.round}:${actor.id}:${targetHex.q},${targetHex.r}`;
        targetMapHex.structureIds.push(instanceId);
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: supplyBefore - fieldwork.smallSupplyCost };
        event("STRUCTURE_COMPLETED", actor.id, {
          actionId: action.id,
          structureDefinitionId: fieldwork.id,
          structureName: fieldwork.name,
          structureInstanceId: instanceId,
          targetHex,
          smallSupplySpent: fieldwork.smallSupplyCost,
          movementPenalty: fieldwork.movementPenalty,
        }, actorVisibility);
      }
      if (action.type === "TRENCH_UPGRADE") {
        const targetHex = action.targetHex;
        const targetMapHex = targetHex && state.map.find((hex) => sameCoord(hex.coord, targetHex));
        const sandbagIndex = targetMapHex?.structureIds.findIndex((id) =>
          id === "structure-sandbag-line" || id.startsWith("structure-sandbag-line:")
        ) ?? -1;
        if (
          !(actor.tags ?? []).includes("INFANTRY") ||
          !targetHex ||
          !sameCoord(actor.position, targetHex) ||
          !targetMapHex ||
          sandbagIndex < 0
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !(actor.tags ?? []).includes("INFANTRY")
                ? "Trench Upgrade requires an Infantry unit."
                : "Trench Upgrade requires the Infantry unit to occupy a Sandbag Line.",
            ],
          }, actorVisibility);
          continue;
        }
        const previousStructureId = targetMapHex.structureIds[sandbagIndex]!;
        const structureInstanceId = `structure-trench:${state.campaignId}:${state.round}:${actor.id}:${targetHex.q},${targetHex.r}`;
        targetMapHex.structureIds[sandbagIndex] = structureInstanceId;
        event("STRUCTURE_UPGRADED", actor.id, {
          actionId: action.id,
          fromStructureDefinitionId: "structure-sandbag-line",
          toStructureDefinitionId: "structure-trench",
          previousStructureInstanceId: previousStructureId,
          structureInstanceId,
          targetHex,
          smallSupplySpent: 0,
          preservesDigIn: true,
        }, actorVisibility);
      }
      if (action.type === "DEPLOY" || action.type === "PACK_UP") {
        if (!isArtilleryDeployment(actor)) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["Deploy and Pack Up require an Artillery unit."],
          }, actorVisibility);
          continue;
        }
        const deployed = action.type === "DEPLOY";
        actor.statuses = actor.statuses.filter((status) => status !== "PACKED" && status !== "DEPLOYED");
        actor.statuses.push(deployed ? "DEPLOYED" : "PACKED");
        actor.artilleryDeployment = deployed ? "DEPLOYED" : "PACKED";
        event(deployed ? "ARTILLERY_DEPLOYED" : "ARTILLERY_PACKED", actor.id, {
          actionId: action.id,
          fromStatus: deployed ? "PACKED" : "DEPLOYED",
          toStatus: deployed ? "DEPLOYED" : "PACKED",
          speedCost: action.speedCost,
        }, actorVisibility);
      }
      if (action.type === "BOMBARDMENT") {
        const targetHex = action.targetHex;
        const weapon = actor.weapons.find((candidate) => candidate.indirect) ?? actor.weapons[0];
        const targetOnMap = targetHex && state.map.some((hex) => sameCoord(hex.coord, targetHex));
        const minimumRangeSatisfied = targetHex ? hexDistance(actor.position, targetHex) >= 1 : false;
        const validation = targetHex && weapon && targetOnMap && minimumRangeSatisfied
          ? validateArtilleryFire({
              profile: artilleryProfile,
              deploymentState: artilleryState(actor),
              firingUnitId: actor.id,
              firingSide: actor.side,
              firingPosition: actor.position,
              weapon,
              target: {
                id: `hex:${targetHex.q},${targetHex.r}`,
                side: actor.side === "ALLIED" ? "ENEMY" : "ALLIED",
                status: "ACTIVE",
                position: targetHex,
                domain: "GROUND",
              },
              map: state.map,
              spotters: artillerySpotters(state, actor),
              supplyAvailable: actor.supplies?.SMALL_SUPPLY ?? 0,
            })
          : undefined;
        if (!isArtilleryDeployment(actor) || !targetHex || !weapon || !targetOnMap || !minimumRangeSatisfied || !validation?.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !isArtilleryDeployment(actor)
                ? "Bombardment requires an Artillery unit."
                : !minimumRangeSatisfied
                  ? "Bombardment target must be at least one hex away."
                  : validation?.reason ?? "Bombardment target is invalid.",
            ],
          }, actorVisibility);
          continue;
        }
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: validation.supplyAfter };
        const affected = state.deployments
          .filter((candidate) =>
            candidate.side !== actor.side &&
            candidate.status !== "DESTROYED" &&
            candidate.status !== "WITHDRAWN" &&
            (candidate.locationState ?? "ON_MAP") === "ON_MAP" &&
            hexDistance(candidate.position, targetHex) <= 1
          )
          .sort((left, right) => left.id.localeCompare(right.id));
        event("ARTILLERY_BOMBARDED", actor.id, {
          actionId: action.id,
          targetHex,
          areaRadius: 1,
          spotterId: validation.spotterId,
          smallSupplySpent: validation.supplySpent,
          affectedTargetIds: affected.map((candidate) => candidate.id),
        }, actorVisibility);
        for (const target of affected) {
          bombardedThisRound.add(target.id);
          const suppression = applyBombardmentSuppression(
            target.stats.defense,
            target.bombardmentSuppression?.stacks ?? 0,
          );
          if (suppression.after === suppression.before) continue;
          target.bombardmentSuppression = { stacks: suppression.after, lastAppliedRound: state.round };
          event("BOMBARDMENT_APPLIED", actor.id, {
            actionId: action.id,
            targetId: target.id,
            targetHex: target.position,
            stacksBefore: suppression.before,
            stacksAfter: suppression.after,
            defenseAfter: suppression.defenseAfter,
          }, actorVisibility);
        }
      }
      if (action.type === "LOAD") {
        const cargo = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const actorCandidateMode = cargo && actor.cargoProfile ? cargoTransportMode(actor, cargo) : undefined;
        const actorCandidateItem = cargo && actor.cargoProfile && actorCandidateMode
          ? campaignCargoItem(state.campaignId, cargo, actorCandidateMode)
          : undefined;
        const cargoCandidateMode = cargo?.cargoProfile ? cargoTransportMode(cargo, actor) : undefined;
        const cargoCandidateItem = cargo?.cargoProfile && cargoCandidateMode
          ? campaignCargoItem(state.campaignId, actor, cargoCandidateMode)
          : undefined;
        if (
          cargo?.cargoProfile &&
          cargo.cargo?.some((item) => item.unitId === actor.id) !== true &&
          actor.cargoProfile &&
          actorCandidateItem &&
          !embarkCargo(actor.cargoProfile, actor.cargo ?? [], actorCandidateItem, Math.round(actor.stats.speed * 4)).legal &&
          cargoCandidateItem &&
          embarkCargo(cargo.cargoProfile, cargo.cargo ?? [], cargoCandidateItem, Math.round(cargo.stats.speed * 4)).legal
        ) continue;
        if (!actor.cargoProfile && cargo?.cargoProfile) continue;
        const matching = cargo && validOrders.get(cargo.id)?.actions.some((candidate) => candidate.type === "LOAD" && candidate.targetDeploymentId === actor.id);
        if (!cargo || !matching || !actor.cargoProfile || !sameCoord(actor.position, cargo.position) || cargo.locationState === "EMBARKED") {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Loading requires an eligible co-located carrier and matching cargo action."] }, actorVisibility);
          continue;
        }
        const transportMode = cargoTransportMode(actor, cargo);
        if (!transportMode) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: ["Artillery must be packed and paired with an eligible towing carrier before it can move as cargo."] }, actorVisibility);
          continue;
        }
        const item = campaignCargoItem(state.campaignId, cargo, transportMode);
        const loaded = embarkCargo(actor.cargoProfile, actor.cargo ?? [], item, Math.round(actor.stats.speed * 4));
        if (!loaded.legal) {
          event("ORDER_REJECTED", actor.id, { orderId: order.id, actionId: action.id, reasons: [loaded.reason ?? "Cargo cannot be loaded."] }, actorVisibility);
          continue;
        }
        actor.cargo = loaded.manifest;
        if (transportMode === "TOWED") actor.towedUnitId = cargo.id;
        cargo.locationState = "EMBARKED";
        cargo.position = { ...actor.position };
        event("CARGO_LOADED", actor.id, {
          actionId: action.id,
          cargoDeploymentId: cargo.id,
          transportMode,
          speedCostQuarters: loaded.speedCostQuarters,
        }, actorVisibility);
      }
      if (action.type === "AIRDROP") {
        const cargoId = typeof action.payload?.cargoDeploymentId === "string"
          ? action.payload.cargoDeploymentId
          : action.targetDeploymentId;
        const cargo = state.deployments.find((candidate) => candidate.id === cargoId);
        const item = actor.cargo?.find((candidate) => candidate.unitId === cargo?.id);
        const targetHex = action.targetHex;
        const hex = targetHex && state.map.find((candidate) => sameCoord(candidate.coord, targetHex));
        const currentOccupancy = targetHex
          ? state.deployments.filter((candidate) =>
              candidate.id !== cargo?.id &&
              candidate.status !== "DESTROYED" &&
              candidate.status !== "WITHDRAWN" &&
              (candidate.locationState ?? "ON_MAP") === "ON_MAP" &&
              sameCoord(candidate.position, targetHex)
            ).length
          : 0;
        const validation = cargo && item && hex
          ? validateHatClearAirDrop({ flightPath: order.route, destination: hex, cargo: item, currentOccupancy })
          : { legal: false, reasons: ["Airdrop requires manifested cargo and a battlefield target hex."], hazardous: false };
        if (
          !actor.cargoProfile ||
          !deploymentTags(actor).includes("AIRDROP") ||
          !cargo ||
          !item ||
          !targetHex ||
          !hex ||
          !validation.legal ||
          !canOccupyHex(targetHex, cargo.id, state.deployments, state.map)
        ) {
          event("AIR_DROP_FAILED", actor.id, {
            actionId: action.id,
            cargoDeploymentId: cargo?.id ?? cargoId,
            targetHex,
            reason: validation.reasons.join(" ") || "DROP_HEX_BLOCKED",
            hazardous: validation.hazardous,
          }, actorVisibility);
          continue;
        }
        const unloaded = disembarkCargo(actor.cargoProfile, actor.cargo ?? [], [item.id], Math.round(actor.stats.speed * 4));
        if (!unloaded.legal) {
          event("AIR_DROP_FAILED", actor.id, {
            actionId: action.id,
            cargoDeploymentId: cargo.id,
            targetHex,
            reason: unloaded.reason ?? "Cargo cannot air drop.",
          }, actorVisibility);
          continue;
        }
        actor.cargo = unloaded.manifest;
        cargo.locationState = "ON_MAP";
        cargo.position = { ...targetHex };
        event("AIR_DROP_COMPLETED", actor.id, {
          actionId: action.id,
          cargoDeploymentId: cargo.id,
          transportMode: "AIRLIFTED",
          targetHex,
          speedCostQuarters: 0,
        }, actorVisibility);
      }
      if (action.type === "UNLOAD") {
        const targetCarrier = action.targetDeploymentId
          ? state.deployments.find((candidate) => candidate.id === action.targetDeploymentId)
          : undefined;
        if (targetCarrier?.cargo?.some((item) => item.unitId === actor.id)) continue;
        if (!actor.cargoProfile && targetCarrier?.cargoProfile) continue;
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
        if (!hex || !canOccupyHex(targetHex, cargo.id, state.deployments, state.map)) {
          event(isAirDrop ? "AIR_DROP_FAILED" : "ORDER_REJECTED", actor.id, isAirDrop
            ? { actionId: action.id, cargoDeploymentId: cargo.id, targetHex, reason: "DROP_HEX_BLOCKED" }
            : { orderId: order.id, actionId: action.id, reasons: ["The carrier hex has no room to unload this unit."] }, actorVisibility);
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
        if (item.transportMode === "TOWED") {
          const detached = detachTow(actor.towedUnitId ? [actor.towedUnitId] : [], cargo.id);
          if (detached.legal) actor.towedUnitId = detached.towedUnitIds[0];
        }
        cargo.locationState = "ON_MAP";
        cargo.position = { ...targetHex };
        event(isAirDrop ? "AIR_DROP_COMPLETED" : "CARGO_UNLOADED", actor.id, {
          actionId: action.id,
          cargoDeploymentId: cargo.id,
          transportMode: item.transportMode ?? "EMBARKED",
          targetHex,
          speedCostQuarters: unloaded.speedCostQuarters,
        }, actorVisibility);
      }
      if (action.type === "RELOAD") {
        const medicalUnit = (() => {
          try {
            return getTacticalUnitClass(actor.definitionId).tags.includes("MEDICAL");
          } catch {
            return false;
          }
        })();
        if (medicalUnit && action.weaponId === undefined) {
          const currentMedicalSupply = actor.supplies?.MEDICAL_SUPPLY ?? 0;
          const medicalSupplyCapacity = Math.max(0, Math.floor(actor.currentHealth));
          const smallSupply = actor.supplies?.SMALL_SUPPLY ?? 0;
          if (currentMedicalSupply >= medicalSupplyCapacity) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: ["Medical Supply is already at the medic's current capacity."],
            }, actorVisibility);
            continue;
          }
          if (smallSupply < 1) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: ["Medic reload requires one Small Supply."],
            }, actorVisibility);
            continue;
          }
          actor.supplies = {
            ...(actor.supplies ?? {}),
            MEDICAL_SUPPLY: medicalSupplyCapacity,
            SMALL_SUPPLY: smallSupply - 1,
          };
          event("MEDICAL_SUPPLY_RELOADED", actor.id, {
            actionId: action.id,
            medicalSupplyBefore: currentMedicalSupply,
            medicalSupplyAfter: medicalSupplyCapacity,
            smallSupplySpent: 1,
          }, actorVisibility);
          continue;
        }
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
      if (action.type === "HEAL") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        let targetIsInfantry = false;
        if (target) {
          try {
            targetIsInfantry = getTacticalUnitClass(target.definitionId).tags.includes("INFANTRY");
          } catch {
            targetIsInfantry = false;
          }
        }
        const profile: HealingProfile = {
          id: "v5-first-aid",
          targetHealthModels: ["FORCE_STRENGTH"],
          maximumRange: 0,
          requiresFriendlyTarget: true,
          allowsSelfTarget: false,
          allowsDestroyedTarget: false,
          supplyType: "MEDICAL_SUPPLY" as const,
          supplyCost: 1,
          amountCap: "HEALER_CURRENT_HEALTH" as const,
          handlerId: "foundation-action-handler",
        };
        const healingInput = target && targetIsInfantry ? {
          profile,
          healer: {
            id: actor.id,
            side: actor.side,
            healthModel: actor.stats.healthModel,
            currentHealth: actor.currentHealth,
            maximumHealth: actor.stats.maxHealth,
          },
          target: {
            id: target.id,
            side: target.side,
            healthModel: target.stats.healthModel,
            currentHealth: target.currentHealth,
            maximumHealth: target.stats.maxHealth,
          },
          distance: hexDistance(actor.position, target.position),
          supplyAvailable: actor.supplies?.MEDICAL_SUPPLY ?? 0,
        } : undefined;
        const preflight = healingInput ? resolveHealing({ ...healingInput, rolledAmount: 1 }) : undefined;
        if (!target || !targetIsInfantry || !preflight?.legal || !healingInput) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [!targetIsInfantry ? "First Aid requires a friendly Infantry target." : preflight?.reason ?? "First Aid is illegal."],
          }, actorVisibility);
          continue;
        }
        const rolledAmount = random.die(6);
        const healed = resolveHealing({ ...healingInput, rolledAmount });
        if (!healed.legal) throw new Error(`First Aid preflight diverged: ${healed.reason ?? "unknown reason"}`);
        const before = target.currentHealth;
        target.currentHealth = healed.targetHealthAfter;
        actor.supplies = { ...(actor.supplies ?? {}), MEDICAL_SUPPLY: healed.supplyAfter };
        event("DICE_ROLLED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          dice: { count: 1, sides: 6, modifier: 0 },
          raw: rolledAmount,
          modified: rolledAmount,
          capped: healed.amount,
          purpose: "FIRST_AID",
        }, actorVisibility);
        event("UNIT_HEALED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          before,
          amount: healed.amount,
          after: target.currentHealth,
          medicalSupplySpent: healed.supplySpent,
        }, actorVisibility);
      }
      if (action.type === "CREW_REPAIR") {
        const subsystemId = action.payload?.subsystemId;
        const subsystem = typeof subsystemId === "string"
          ? actor.subsystems?.find((candidate) => candidate.subsystemId === subsystemId)
          : undefined;
        if (order.route.length !== 1 || !subsystem || subsystem.state === "OPERATIONAL") {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [order.route.length !== 1
              ? "Crew Repair requires a full stationary round."
              : "Crew Repair requires one damaged subsystem."],
          }, actorVisibility);
          continue;
        }
        actor.subsystems = actor.subsystems?.map((candidate) =>
          candidate.subsystemId === subsystemId
            ? { subsystemId: candidate.subsystemId, state: "OPERATIONAL" as const }
            : candidate
        );
        crewRepairingUnits.add(actor.id);
        event("UNIT_REPAIRED", actor.id, {
          actionId: action.id,
          targetId: actor.id,
          repairKind: "SUBSYSTEM",
          repairMethod: "CREW",
          subsystemId,
          before: actor.currentHealth,
          after: actor.currentHealth,
          armorBenefitThisRound: false,
          smallSupplySpent: 0,
        }, actorVisibility);
      }
      if (action.type === "REPAIR") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        let actorIsEngineer = false;
        if (target) {
          try {
            actorIsEngineer = getTacticalUnitClass(actor.definitionId).tags.includes("ENGINEER");
          } catch {
            actorIsEngineer = false;
          }
        }
        const repairKind = action.payload?.repairKind;
        const subsystemId = action.payload?.subsystemId;
        const choice: EngineerRepairChoice | undefined = repairKind === "HIT"
          ? { kind: "HIT" }
          : repairKind === "SUBSYSTEM" && typeof subsystemId === "string"
            ? { kind: "SUBSYSTEM", subsystemId }
            : undefined;
        const profile: EngineerRepairProfile = {
          id: "v5-engineer-field-repair",
          maximumRange: 0,
          requiresFriendlyTarget: true,
          targetHealthModels: ["HITS"],
          hitRepair: 1,
          supplyType: "SMALL_SUPPLY",
          supplyCost: 1,
          handlerId: "foundation-action-handler",
        };
        const repaired = target && actorIsEngineer && choice ? resolveEngineerRepair({
          profile,
          engineer: { id: actor.id, side: actor.side },
          target: {
            id: target.id,
            side: target.side,
            healthModel: target.stats.healthModel,
            currentHealth: target.currentHealth,
            maximumHealth: target.stats.maxHealth,
            subsystems: target.subsystems ?? [],
          },
          distance: hexDistance(actor.position, target.position),
          supplyAvailable: actor.supplies?.SMALL_SUPPLY ?? 0,
          choice,
        }) : undefined;
        if (!target || !actorIsEngineer || !choice || !repaired?.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !actorIsEngineer
                ? "Engineer Repair requires an Engineer unit."
                : repaired?.reason ?? "Engineer Repair target or repair choice is invalid.",
            ],
          }, actorVisibility);
          continue;
        }
        const before = target.currentHealth;
        target.currentHealth = repaired.targetHealthAfter;
        target.subsystems = repaired.subsystemsAfter;
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: repaired.supplyAfter };
        event("UNIT_REPAIRED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          repairKind: repaired.choice.kind,
          subsystemId: repaired.choice.kind === "SUBSYSTEM" ? repaired.choice.subsystemId : undefined,
          before,
          after: target.currentHealth,
          smallSupplySpent: repaired.supplySpent,
        }, actorVisibility);
      }
      if (action.type === "RESUPPLY") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const actorIsLogistics = deploymentTags(actor).includes("LOGISTICS");
        const targetTags = target ? deploymentTags(target) : [];
        const targetIsSupported = targetTags.some((tag) => tag === "ARTILLERY" || tag === "ENGINEER" || tag === "MEDICAL");
        const transfer = target && actorIsLogistics && targetIsSupported && target.side === actor.side &&
          target.status !== "DESTROYED" && sameCoord(actor.position, target.position)
          ? resupplyLogiTarget({
              source: actor.supplies ?? {},
              destination: target.supplies ?? {},
              destinationTags: targetTags,
              destinationCurrentHealth: target.currentHealth,
            })
          : undefined;
        if (!target || !actorIsLogistics || !targetIsSupported || target.side !== actor.side ||
            target.status === "DESTROYED" || !sameCoord(actor.position, target.position) || !transfer?.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !actorIsLogistics
                ? "Transfer Supply requires a Logi Truck."
                : !target || !targetIsSupported || target.side !== actor.side || target.status === "DESTROYED"
                  ? "Field resupply requires a friendly operational Medic, Engineer, or Artillery unit."
                  : !sameCoord(actor.position, target.position)
                    ? "The Logi Truck and target unit must finish in the same hex."
                    : transfer && "reason" in transfer ? transfer.reason : "Small Supply transfer is illegal.",
            ],
          }, actorVisibility);
          continue;
        }
        actor.supplies = transfer.source;
        target.supplies = transfer.destination;
        event("SUPPLY_TRANSFERRED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          resourceType: transfer.resourceType,
          sourceResourceType: "SMALL_SUPPLY",
          quantity: transfer.quantityRestored,
          sourceRemaining: transfer.source.SMALL_SUPPLY ?? 0,
          targetAfter: transfer.destination[transfer.resourceType] ?? 0,
          purpose: transfer.purpose,
          conflictId: transfer.purpose === "ARTILLERY_RELOAD" ? "RC-SUP-001" : undefined,
        }, actorVisibility);
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

  for (const target of state.deployments
    .filter((deployment) => (deployment.bombardmentSuppression?.stacks ?? 0) > 0 && !bombardedThisRound.has(deployment.id))
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const recovered = recoverBombardmentSuppression(target.stats.defense, target.bombardmentSuppression!.stacks);
    if (recovered.after === 0) delete target.bombardmentSuppression;
    else target.bombardmentSuppression = {
      stacks: recovered.after,
      lastAppliedRound: target.bombardmentSuppression!.lastAppliedRound,
    };
    event("BOMBARDMENT_RECOVERED", target.id, {
      stacksBefore: recovered.before,
      stacksAfter: recovered.after,
      defenseAfter: recovered.defenseAfter,
    });
  }

  const damage = new Map<string, number>();
  const pendingSubsystemStates = new Map<string, NonNullable<CampaignDeployment["subsystems"]>>();
  const pendingSubsystemEvents: Array<{
    targetId: string;
    sourceId: string;
    naturalRoll: number;
    affectedSubsystemIds: string[];
  }> = [];
  const rushingUnits = new Set(
    [...validOrders.entries()]
      .filter(([, order]) => order.orderType === "RUSH")
      .map(([unitId]) => unitId),
  );
  for (const order of validOrders.values()) {
    const attacker = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    for (const action of order.actions.filter((candidate) => candidate.type === "ATTACK")) {
      if (isArtilleryDeployment(attacker) && !attacker.statuses.includes("DEPLOYED")) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["Artillery must be deployed before firing."],
        });
        continue;
      }
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      if (!target) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["Target does not exist."],
        });
        continue;
      }
      const arc = validateLimitedForwardArc(deploymentTags(attacker), order.route, attacker.facing, target.position);
      if (!arc.legal) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          targetId: target.id,
          reasons: [arc.reason],
          firingFacing: arc.firingFacing,
        });
        continue;
      }
      const bombingFailure = attacker.weapons
        .map((weapon) => validateBomberAttack(
          deploymentTags(attacker),
          weapon,
          order.route,
          target.position,
          attacker.ammunition[weapon.id] ?? 0,
        ))
        .find((validation) => validation.applies && !validation.legal);
      if (bombingFailure) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          targetId: target.id,
          reasons: [bombingFailure.reason],
        });
        continue;
      }
      let weaponsFired = 0;
      for (const weapon of [...attacker.weapons].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )) {
        const bombing = validateBomberAttack(
          deploymentTags(attacker),
          weapon,
          order.route,
          target.position,
          attacker.ammunition[weapon.id] ?? 0,
        );
        if (!bombing.legal) {
          event("WEAPON_SKIPPED", attacker.id, {
            orderId: order.id,
            actionId: action.id,
            weaponId: weapon.id,
            targetId: target.id,
            reason: bombing.reason ?? "Bomber flight path is not legal.",
          });
          continue;
        }
        const attackOrigin = bombing.applies ? { ...attacker, position: { ...target.position } } : attacker;
        const result = resolveAttackRoll(attackOrigin, target, weapon, state.map, random, state.deployments, {
          attackerEvasive: evasiveUnits.has(attacker.id),
          targetEvasive: evasiveUnits.has(target.id),
          targetCrewRepairing: crewRepairingUnits.has(target.id),
        });
        if (!result.legal || !result.roll) {
          event("WEAPON_SKIPPED", attacker.id, {
            orderId: order.id,
            actionId: action.id,
            weaponId: weapon.id,
            targetId: target.id,
            reason: result.reason ?? "Weapon is not eligible for this activation.",
          });
          continue;
        }
        weaponsFired += 1;
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
          rapidFireMultiplier: result.rapidFireMultiplier,
          damageResult: result.damageResult,
          highGroundModifier: result.highGroundModifier,
          evasiveAttackModifier: result.evasiveAttackModifier,
        });
        const rushMultiplier = rushingUnits.has(target.id) ? 2 : 1;
        const healthLoss = result.healthLoss * rushMultiplier;
        event("UNIT_ATTACKED", attacker.id, {
          actionId: action.id,
          targetId: target.id,
          weaponId: weapon.id,
          armor: result.targetArmor,
          coverArmor: result.coverArmor,
          coverSources: result.coverSources,
          effectiveArmor: result.effectiveArmor,
          defense: result.targetDefense,
          digInDefense: result.digInDefense,
          threshold: result.threshold,
          rearAttack: result.rearAttack,
          penetrated: result.penetrated,
          rushMultiplier,
          healthLoss,
          rapidFireMultiplier: result.rapidFireMultiplier,
          damageResult: result.damageResult,
          highGroundModifier: result.highGroundModifier,
          evasiveAttackModifier: result.evasiveAttackModifier,
          evasiveDefenseModifier: result.evasiveDefenseModifier,
          crewRepairArmorExposed: result.crewRepairArmorExposed,
        });
        const subsystemRules = weapon.damage.count === 1
          ? getTacticalSubsystemRules(target.definitionId)
          : undefined;
        if (subsystemRules) {
          const subsystemResult = resolveSubsystemDamage({
            profile: {
              ...subsystemRules.profile,
              triggers: subsystemRules.profile.triggers.map((trigger) => ({
                ...trigger,
                requiresAttackerHealthAtLeastRoll: attacker.stats.healthModel === "FORCE_STRENGTH",
              })),
            },
            definitions: subsystemRules.definitions,
            states: pendingSubsystemStates.get(target.id) ?? target.subsystems ?? [],
            penetrated: result.penetrated,
            naturalRoll: result.roll.raw,
            attackerCurrentHealth: attacker.currentHealth,
            sourceId: attacker.id,
            round: state.round,
          });
          if (subsystemResult.triggered) {
            pendingSubsystemStates.set(target.id, subsystemResult.states);
            pendingSubsystemEvents.push({
              targetId: target.id,
              sourceId: attacker.id,
              naturalRoll: result.roll.raw,
              affectedSubsystemIds: subsystemResult.affectedSubsystemIds,
            });
          }
        }
        if (healthLoss > 0) damage.set(target.id, (damage.get(target.id) ?? 0) + healthLoss);
      }
      if (weaponsFired === 0) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["No fitted weapon was eligible when the attack resolved."],
        });
      }
    }
  }

  for (const [targetId, subsystems] of [...pendingSubsystemStates.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const target = state.deployments.find((candidate) => candidate.id === targetId);
    if (target) target.subsystems = subsystems;
  }
  for (const malfunction of pendingSubsystemEvents) {
    event("SUBSYSTEM_MALFUNCTIONED", malfunction.sourceId, {
      targetId: malfunction.targetId,
      naturalRoll: malfunction.naturalRoll,
      affectedSubsystemIds: malfunction.affectedSubsystemIds,
    });
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

  synchronizeDeploymentSupplyCargo(state.campaignId, state.deployments);
  const carrierByCargoDeployment = new Map<string, CampaignDeployment>();
  for (const carrier of state.deployments) {
    for (const item of carrier.cargo ?? []) {
      if (item.unitId) carrierByCargoDeployment.set(item.unitId, carrier);
    }
  }
  for (const deployment of state.deployments.filter((candidate) => candidate.persistentUnitId)) {
    const carrier = carrierByCargoDeployment.get(deployment.id);
    effects.push({
      idempotencyKey: `${state.campaignId}:${state.round}:state:${deployment.persistentUnitId}`,
      type: "UNIT_STATE_UPDATED",
      unitId: deployment.persistentUnitId,
      payload: {
        campaignId: state.campaignId,
        round: state.round,
        locationState: deployment.locationState ?? "ON_MAP",
        carrierPersistentUnitId: carrier?.persistentUnitId,
        ammunition: deployment.ammunition,
        cooldowns: deployment.cooldowns,
        supplies: deployment.supplies ?? {},
        currentHealth: deployment.currentHealth,
        maximumHealth: deployment.stats.maxHealth,
        subsystems: deployment.subsystems ?? [],
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
    effects.push({
      idempotencyKey: `${state.campaignId}:${state.round}:campaign-result`,
      type: "CAMPAIGN_RESULT",
      payload: {
        campaignId: state.campaignId,
        scenarioId: state.scenarioId,
        scenarioVersion: state.scenarioVersion,
        resolutionKey: `${state.campaignId}:${state.round}`,
        ...scenario.outcome,
      },
      status: "PENDING",
    });
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

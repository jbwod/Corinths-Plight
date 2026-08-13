import type {
  AxialCoord,
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
  addCoord,
  canOccupyHex,
  coordKey,
  facingBetween,
  hexDistance,
  rearFacing,
  sameCoord,
  HEX_DIRECTIONS,
} from "./hex";
import {
  attachTow,
  cargoSlotsForItem,
  detachTow,
  disembarkCargo,
  embarkCargo,
  reloadAmmunition,
  transferCoordinatedSupplyDrop,
  synchronizeSupplyCargo,
  resupplyLogiTarget,
} from "./logistics";
import { canTarget, hasDisabledSubsystem, resolveAttackRoll, tickCooldowns, validateSpeedBudget } from "./mechanics";
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
import { isLightAtChargeStore, validateLightAtAttack } from "./light-at";
import { isGarrisonEligible, isInfantryGarrisonBuilding } from "./cover";
import { getTacticalSubsystemRules, getTacticalUnitClass } from "./tactical-unit-catalogue";
import { applyScenarioReinforcements, evaluateScenarioRoundEnd } from "./scenario";
import {
  POWER_ARMOURED_INFANTRY_PUBLIC_V1,
  isPowerArmourBackWeaponId,
  powerArmourHatParadropAllowed,
  resolvePowerArmourBackWeaponCycle,
  validateMagneticClampDismount,
  validateMagneticClampMount,
} from "./power-armoured-infantry";
import {
  isCompanionMech,
  reloadMechWeaponAtSupplyPoint,
  resolveMechCrouch,
  validateCompanionMechChassis,
  validateMechAttackActivation,
} from "./companion-mechs";
import {
  isMechanizedInfantry,
  resolveForwardLineControl,
  validateMechanizedInfantryIdentity,
} from "./mechanized-infantry";
import {
  V5_FUNNEL_FORCED_DISTANCE_QUARTERS,
  validateArtilleryAntiOrbitalExecution,
  validateFunnelExecution,
} from "./artillery";
import { resolveInfantryStealthOrder } from "./infantry-stealth";
import {
  isIrregularDeployment,
  recruitIrregularAtPopulationCenter,
} from "./irregular-progression";
import {
  SPECIAL_FORCES_DELAYED_CHARGE,
  detonateSpecialForcesDelayedCharge,
  isSpecialForcesDeployment,
  placeSpecialForcesDelayedCharge,
  readSpecialForcesDelayedCharge,
  revealSpecialForces,
} from "./special-forces";
import {
  applySapperWeaponEmplacement,
  isSapperDeployment,
  parseSapperMinefield,
  performSapperConstruction,
  reloadSapperBuildSupplyFromDeployment,
  resolveSapperMineTrigger,
  sensorTowerRevealHexes,
} from "./sapper-construction";
import {
  getCompanionTankSubsystemRules,
  getMechanizedInfantrySubsystemRules,
  isCompanionTankDefinitionId,
  selectCompanionTankAttackWeapons,
  validateCompanionTankTransport,
} from "./companion-tanks";
import {
  abandonCompanionArtillery,
  companionArtilleryReplacementCost,
  isCompanionArtilleryDefinitionId,
  isCrewedCompanionArtilleryDefinitionId,
  replaceCompanionArtillery,
  selectCompanionArtilleryFire,
  validateCompanionArtilleryTransport,
  validateCompanionArtilleryRange,
} from "./companion-artillery";
import {
  COMPANION_VTOL_EXTERNAL_LOAD_TAG,
  COMPANION_VTOL_OBJECTIVE_CARGO_TAG,
  COMPANION_VTOL_SUPPLY_CARGO_TAG,
  companionVtolNormalCargoOperationAllowed,
  isCompanionVtolTransport,
  makeCompanionVtolCargoItem,
  resolveCompanionVtolRappel,
  validateCompanionVtolIdentity,
  validateCompanionVtolManifest,
} from "./companion-vtol-transports";

export const ENGINE_VERSION = "foundation-0.1.0";

export interface OrderValidation {
  legal: boolean;
  reasons: string[];
  movementCost: number;
}

function isArtilleryDeployment(deployment: CampaignDeployment): boolean {
  if (isCrewedCompanionArtilleryDefinitionId(deployment.definitionId)) return true;
  try {
    return getTacticalUnitClass(deployment.definitionId).tags.includes("ARTILLERY");
  } catch {
    return false;
  }
}

function isLogiTruck(deployment: CampaignDeployment): boolean {
  return deployment.definitionId === "unit-logi-truck" && deploymentAllowsAction(deployment, "RESUPPLY");
}

function isHeavyAirTransport(deployment: CampaignDeployment): boolean {
  return deployment.definitionId === "unit-heavy-air-transport" && deploymentAllowsAction(deployment, "AIRDROP");
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

function activeOnMap(deployment: CampaignDeployment): boolean {
  return deployment.status !== "DESTROYED" &&
    deployment.status !== "WITHDRAWN" &&
    (deployment.locationState ?? "ON_MAP") === "ON_MAP";
}

function deploymentAllowsAction(
  deployment: CampaignDeployment,
  actionType: StructuredAction["type"],
): boolean {
  if (isCrewedCompanionArtilleryDefinitionId(deployment.definitionId)) {
    return actionType === "ATTACK" || actionType === "DEPLOY" || actionType === "PACK_UP" || actionType === "ABANDON_GUNS";
  }
  if (deployment.definitionId === "unit-self-propelled-artillery") return actionType === "ATTACK";
  if (deployment.definitionId === "unit-companion-artillery-crew") return actionType === "REPLACE_GUNS";
  if (
    deployment.definitionId === "unit-power-armoured-infantry" &&
    (actionType === "DIG_IN" || actionType === "SHIELD_WALL" ||
      actionType === "MOUNT_MAGNETIC_CLAMPS" || actionType === "DISMOUNT_MAGNETIC_CLAMPS")
  ) return true;
  if (isCompanionMech(deployment)) {
    return actionType === "ATTACK" || actionType === "RELOAD" ||
      actionType === "MOUNT_MAGNETIC_CLAMPS" || actionType === "DISMOUNT_MAGNETIC_CLAMPS" ||
      (deployment.definitionId === "unit-medium-mech" && actionType === "DIG_IN");
  }
  if (isMechanizedInfantry(deployment)) return actionType === "ATTACK";
  if (isCompanionVtolTransport(deployment)) {
    if (actionType === "LOAD" || actionType === "UNLOAD" || actionType === "LAND" || actionType === "TAKE_OFF") return true;
    return deployment.definitionId !== "unit-vtol-heavy-lift" &&
      (actionType === "ATTACK" || actionType === "REARM_AEROSPACE");
  }
  if (isCompanionTankDefinitionId(deployment.definitionId)) {
    return actionType === "ATTACK" || actionType === "CREW_REPAIR" || actionType === "LOAD" || actionType === "UNLOAD";
  }
  if (
    isSpecialForcesDeployment(deployment) &&
    (actionType === "PLACE_DELAYED_CHARGE" || actionType === "DETONATE_DELAYED_CHARGE")
  ) return true;
  if (isSapperDeployment(deployment) && (actionType === "SAPPER_CONSTRUCT" || actionType === "RELOAD_BUILD_SUPPLY")) return true;
  if (isIrregularDeployment(deployment) && actionType === "RECRUIT_IRREGULAR") return true;
  try {
    return getTacticalUnitClass(deployment.definitionId).allowedActions.includes(actionType);
  } catch {
    return false;
  }
}

function deploymentAllowsOrder(deployment: CampaignDeployment, orderType: UnitOrder["orderType"]): boolean {
  if (isCompanionVtolTransport(deployment)) return orderType === "HOLD" || orderType === "ADVANCE";
  if ((isSpecialForcesDeployment(deployment) || isSapperDeployment(deployment)) && orderType === "STEALTH") return true;
  if (deployment.allowedOrders) return deployment.allowedOrders.includes(orderType);
  try {
    return getTacticalUnitClass(deployment.definitionId).allowedOrders.includes(orderType);
  } catch {
    return orderType !== "STEALTH";
  }
}

function isTrenchHex(state: RoundOutput["state"], position: CampaignDeployment["position"]): boolean {
  return state.map.find((hex) => sameCoord(hex.coord, position))?.structureIds
    .some((id) => id === "structure-trench" || id.startsWith("structure-trench:")) ?? false;
}

function isAerospaceDeployment(deployment: CampaignDeployment): boolean {
  const tags = deploymentTags(deployment);
  return tags.includes("ATMO_FLIGHT") || tags.includes("VTOL");
}

function facilitySupports(
  state: RoundOutput["state"],
  deployment: CampaignDeployment,
  position: CampaignDeployment["position"],
  capability: "LAND" | "REARM_AEROSPACE" | "RELOAD_MECH" | "REPLACE_ARTILLERY",
): boolean {
  const hex = state.map.find((candidate) => sameCoord(candidate.coord, position));
  if (!hex) return false;
  const friendly = hex.control === deployment.side || (
    hex.objectiveId !== undefined &&
    state.objectives.find((objective) => objective.id === hex.objectiveId)?.owner === deployment.side
  );
  if (!friendly) return false;
  if (capability === "RELOAD_MECH" || capability === "REPLACE_ARTILLERY") return hex.environment.includes("SUPPLY_POINT");
  if (capability === "REARM_AEROSPACE") return hex.environment.includes("REARM_AEROSPACE");
  return deploymentTags(deployment).includes("VTOL")
    ? hex.environment.includes("LAND_VTOL")
    : hex.environment.includes("LAND_AEROSPACE");
}

function canAttackInterceptor(
  attacker: CampaignDeployment,
  order: UnitOrder,
  interceptor: CampaignDeployment,
  state: RoundOutput["state"],
  route: readonly AxialCoord[] = order.route,
): boolean {
  const arc = validateLimitedForwardArc(deploymentTags(attacker), route, attacker.facing, interceptor.position);
  if (!arc.legal) return false;
  return attacker.weapons.some((weapon) => {
    const bombing = validateBomberAttack(
      deploymentTags(attacker),
      weapon,
      route,
      interceptor.position,
      attacker.ammunition[weapon.id] ?? 0,
      { orderType: order.orderType, targetTags: deploymentTags(interceptor) },
    );
    if (!bombing.legal) return false;
    const origin = bombing.applies ? { ...attacker, position: { ...interceptor.position } } : attacker;
    return canTarget(origin, interceptor, weapon, state.map, state.deployments).legal;
  });
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
  const companionCrewedArtillery = isCrewedCompanionArtilleryDefinitionId(cargo.definitionId);
  return {
    id: `campaign-cargo:${campaignId}:${cargo.id}`,
    kind: companionCrewedArtillery || cargo.stats.healthModel !== "FORCE_STRENGTH" ? "VEHICLE" as const : "PERSONNEL" as const,
    quantity: companionCrewedArtillery || cargo.stats.healthModel !== "FORCE_STRENGTH" ? 1 : cargo.currentHealth,
    tags: companionCrewedArtillery ? [...new Set([...deploymentTags(cargo), "VEHICLE"])] : deploymentTags(cargo),
    transportMode,
    unitId: cargo.id,
  };
}

function cargoTransportMode(
  carrier: CampaignDeployment,
  cargo: CampaignDeployment,
): "EMBARKED" | "TOWED" | undefined {
  if (isHeavyAirTransport(carrier) && isCrewedCompanionArtilleryDefinitionId(cargo.definitionId)) {
    return artilleryState(cargo) === "PACKED" ? "EMBARKED" : undefined;
  }
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
  if (isCompanionMech(deployment)) reasons.push(...validateCompanionMechChassis(deployment).reasons);
  if (isMechanizedInfantry(deployment)) reasons.push(...validateMechanizedInfantryIdentity(deployment).reasons);
  if (isCompanionVtolTransport(deployment)) reasons.push(...validateCompanionVtolIdentity(deployment).reasons);
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
    const rearmableWeapons = deployment.weapons.filter((weapon) => weapon.ammoCapacity !== undefined);
    if (rearmableWeapons.length === 0) {
      reasons.push("This aerospace unit has no ammunition store to rearm.");
    } else if (rearmableWeapons.every((weapon) =>
      (deployment.ammunition[weapon.id] ?? 0) >= weapon.ammoCapacity!
    )) {
      reasons.push("Aerospace ammunition is already full.");
    }
  }
  const artillery = isArtilleryDeployment(deployment);
  const artilleryDeployed = artilleryState(deployment) === "DEPLOYED";
  if (artillery && artilleryDeployed && order.route.length > 1) {
    reasons.push("Deployed artillery must pack up before it can move in a later round.");
  }
  const embarked = deployment.locationState === "EMBARKED" || deployment.locationState === "IN_VEHICLE" || deployment.locationState === "IN_AIR_TRANSPORT";
  const magneticClampDismount = deployment.definitionId === "unit-power-armoured-infantry" &&
    order.actions.length > 0 && order.actions.every((action) => action.type === "DISMOUNT_MAGNETIC_CLAMPS");
  if (embarked && (order.route.length > 1 || order.actions.some((action) => action.type !== "UNLOAD" && action.type !== "DISMOUNT_MAGNETIC_CLAMPS") ||
    (order.actions.some((action) => action.type === "DISMOUNT_MAGNETIC_CLAMPS") && !magneticClampDismount))) {
    reasons.push("Embarked units cannot move or perform actions other than coordinated unloading or Magnetic Clamp dismount.");
  }
  if (order.campaignId !== input.previousState.campaignId) reasons.push("Order belongs to another campaign.");
  if (order.round !== input.previousState.round) reasons.push("Order targets another round.");
  if (order.unitId !== deployment.id) reasons.push("Order unit does not match deployment.");
  if (!Number.isInteger(order.facing) || order.facing < 0 || order.facing > 5) {
    reasons.push("Facing must be an integer from 0 through 5.");
  }
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
  if (!deploymentAllowsOrder(deployment, order.orderType)) {
    reasons.push(`${order.orderType.replaceAll("_", " ")} is not available to this unit class.`);
  }
  if (order.orderType === "STEALTH" && order.route.length < 2) {
    reasons.push("Infantry Stealth requires a movement route.");
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
    if (action.type === "ABANDON_GUNS" || action.type === "REPLACE_GUNS") {
      if (action.economy !== "PRIMARY" || action.speedCost !== 0) {
        reasons.push(`${action.type.replaceAll("_", " ")} must be a zero-Speed Primary Action.`);
      }
      if (!deploymentAllowsAction(deployment, action.type)) {
        reasons.push(action.type === "ABANDON_GUNS"
          ? "Only operational Light or Heavy Artillery may abandon its guns."
          : "Only an abandoned artillery CREW may replace its guns.");
      }
      if (action.type === "ABANDON_GUNS" && artilleryState(deployment) !== "DEPLOYED") {
        reasons.push("Artillery must be deployed before its guns can be abandoned.");
      }
      if (action.type === "REPLACE_GUNS") {
        if (!deployment.persistentUnitId) reasons.push("Artillery replacement requires a persistent player unit.");
        if (!deployment.companionArtilleryAbandonment) reasons.push("The artillery CREW has no original gun snapshot.");
        if (deployment.companionArtilleryAbandonment?.replacementUsed) reasons.push("This artillery crew already used its one campaign replacement.");
        if (!facilitySupports(input.previousState, deployment, order.endHex, "REPLACE_ARTILLERY")) {
          reasons.push("Artillery replacement requires a friendly Supply Point.");
        }
      }
      continue;
    }
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
    const coordinatedSupplyDrop = action.type === "RESUPPLY" && input.previousState.deployments
      .some((candidate) => candidate.id === action.targetDeploymentId && isHeavyAirTransport(candidate));
    const companionMechAttack = action.type === "ATTACK" && isCompanionMech(deployment);
    const superHeavyTankAttack = action.type === "ATTACK" && deployment.definitionId === "unit-super-heavy-tank";
    const expectedEconomy = coordinatedSupplyDrop || companionMechAttack || superHeavyTankAttack ? "PRIMARY" : definition.economy;
    const expectedSpeedCost = coordinatedSupplyDrop ? 0 : definition.speedCost;
    if (action.economy !== expectedEconomy || action.speedCost !== expectedSpeedCost) {
      reasons.push(`${action.type.replaceAll("_", " ")} economy or speed cost does not match the pinned ruleset.`);
    }
    if (isCompanionVtolTransport(deployment) && !deploymentAllowsAction(deployment, action.type)) {
      reasons.push(`${action.type.replaceAll("_", " ")} is not available to this companion VTOL transport.`);
    }
    if (isCompanionVtolTransport(deployment) && (action.type === "LOAD" || action.type === "UNLOAD")) {
      const rappel = action.type === "UNLOAD" && action.payload?.mode === "RAPPEL_GARRISON";
      if (rappel) {
        if (deployment.definitionId !== "unit-vtol-troop-airlift") {
          reasons.push("Only VTOL Heavy Troop Airlift may use Rappel Garrison.");
        }
        if (landed && !takesOff) reasons.push("Rappel Garrison requires the Troop Airlift to be airborne.");
        if (!action.targetHex) reasons.push("Rappel Garrison requires an authored building target hex.");
      } else {
        const projectedCarrier = lands && !takesOff
          ? { ...deployment, statuses: [...new Set([...deployment.statuses, "LANDED"])] }
          : deployment;
        reasons.push(...companionVtolNormalCargoOperationAllowed(projectedCarrier).reasons);
        if (takesOff) reasons.push("Companion VTOL cannot perform a normal cargo operation while taking off.");
      }
    }
    if (action.type === "DIG_IN" && !deploymentAllowsAction(deployment, "DIG_IN")) {
      reasons.push("This unit class cannot Dig In.");
    }
    if (action.type === "TRENCH_UPGRADE" && deployment.definitionId !== "unit-infantry-squad") {
      reasons.push("Trench Upgrade requires an Infantry Squad.");
    }
    if (action.type === "CONSTRUCT" && !deploymentAllowsAction(deployment, "CONSTRUCT")) {
      reasons.push("Construction requires an Engineer unit.");
    }
    if (action.type === "REPAIR" && !deploymentAllowsAction(deployment, "REPAIR")) {
      reasons.push("Engineer Repair requires an Engineer unit.");
    }
    if (action.type === "RELOAD" && action.weaponId === "weapon-light-at") {
      reasons.push("Light AT charges have no active field reload rule.");
    }
    if (action.type === "RELOAD" && isPowerArmourBackWeaponId(action.weaponId)) {
      reasons.push("The Power Armour back-mounted Light Laser cools automatically and cannot be reloaded.");
    }
    if (action.type === "RELOAD" && isCompanionMech(deployment)) {
      const reload = reloadMechWeaponAtSupplyPoint({
        deployment,
        weaponId: action.weaponId,
        atFriendlyGovernedSupplyPoint: facilitySupports(input.previousState, deployment, order.endHex, "RELOAD_MECH"),
      });
      reasons.push(...reload.reasons);
    }
    if (action.type === "BOMBARDMENT" && !artillery) {
      reasons.push("Bombardment requires an Artillery unit.");
    }
    if (action.type === "FUNNEL") {
      if (!artillery) reasons.push("Funnel requires an Artillery unit.");
      if (!action.targetDeploymentId) reasons.push("Funnel requires a hostile target unit.");
      if (action.direction === undefined) reasons.push("Funnel requires a chosen displacement direction.");
      if (!artilleryDeployed && !order.actions.some((candidate) => candidate.type === "DEPLOY")) {
        reasons.push("Artillery must deploy before using Funnel.");
      }
    }
    if (action.type === "RESUPPLY" && !isLogiTruck(deployment)) {
      reasons.push("Transfer Supply requires a Logi Truck.");
    }
    if (
      (action.type === "PLACE_DELAYED_CHARGE" || action.type === "DETONATE_DELAYED_CHARGE") &&
      !deploymentAllowsAction(deployment, action.type)
    ) {
      reasons.push("Delayed charges require a Special Forces team.");
    }
    if (action.type === "PLACE_DELAYED_CHARGE") {
      const target = input.previousState.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      if (!target) reasons.push("Delayed charge placement requires a target deployment.");
      if (readSpecialForcesDelayedCharge(deployment)) reasons.push("This Special Forces team already has an active delayed charge.");
    }
    if (action.type === "DETONATE_DELAYED_CHARGE") {
      const charge = readSpecialForcesDelayedCharge(deployment);
      if (!charge) reasons.push("This Special Forces team has no active delayed charge.");
      else if (input.previousState.round < charge.armedFromRound) {
        reasons.push("The delayed charge arms at the end of its placement round and may detonate next round or later.");
      }
    }
    if ((action.type === "SAPPER_CONSTRUCT" || action.type === "RELOAD_BUILD_SUPPLY") && !deploymentAllowsAction(deployment, action.type)) {
      reasons.push("This action requires a Sapper team.");
    }
    if (action.type === "SAPPER_CONSTRUCT") {
      if (!action.targetHex || !action.structureDefinitionId) reasons.push("Sapper construction requires a structure and target hex.");
      if ((deployment.supplies?.BUILD_SUPPLY ?? 0) < 3) reasons.push("Sapper construction requires 3 Build Supply.");
    }
    if (action.type === "RELOAD_BUILD_SUPPLY") {
      if ((deployment.supplies?.BUILD_SUPPLY ?? 0) >= 6) reasons.push("Sapper Build Supply is already full.");
      if ((deployment.supplies?.GENERAL_SUPPLY ?? 0) < 1) reasons.push("Reload requires 1 General Supply crate.");
    }
    if (action.type === "RECRUIT_IRREGULAR") {
      if (!deploymentAllowsAction(deployment, action.type)) reasons.push("Recruit requires an Irregular unit.");
      if (!deployment.equipmentIds.includes("equipment-charismatic-commander")) reasons.push("Irregular recruitment requires a Charismatic Commander.");
    }
    if (action.type === "SHIELD_WALL") {
      if (deployment.definitionId !== "unit-power-armoured-infantry") reasons.push("Shield Wall requires Power Armoured Infantry.");
      if (!deployment.equipmentIds.includes(POWER_ARMOURED_INFANTRY_PUBLIC_V1.ballisticShieldsEquipmentId)) {
        reasons.push("Shield Wall requires fitted Ballistic Shields.");
      }
      if (order.route.length > 1) reasons.push("Shield Wall consumes the unit's full movement and requires it to hold position.");
    }
    if (action.type === "MOUNT_MAGNETIC_CLAMPS" || action.type === "DISMOUNT_MAGNETIC_CLAMPS") {
      const target = input.previousState.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      if (!target) {
        reasons.push("Magnetic Clamp actions require a target unit.");
      } else if (action.type === "MOUNT_MAGNETIC_CLAMPS") {
        const rider = deployment.definitionId === "unit-power-armoured-infantry" ? deployment : target;
        const carrier = rider.id === deployment.id ? target : deployment;
        const matching = [...input.playerOrders, ...input.enemyOrders].find((candidate) => candidate.unitId === target.id)
          ?.actions.some((candidate) => candidate.type === action.type && candidate.targetDeploymentId === deployment.id) ?? false;
        reasons.push(...validateMagneticClampMount({
          rider,
          carrier,
          matchingPrimaryActions: matching,
          carrierRiderIds: (carrier.cargo ?? []).filter((item) => item.tags.includes("MAGNETIC_CLAMP_RIDER") && item.unitId).map((item) => item.unitId!),
        }).reasons);
      } else {
        const rider = deployment.definitionId === "unit-power-armoured-infantry" ? deployment : target;
        const carrier = rider.id === deployment.id ? target : deployment;
        const matching = [...input.playerOrders, ...input.enemyOrders].find((candidate) => candidate.unitId === target.id)
          ?.actions.some((candidate) => candidate.type === action.type && candidate.targetDeploymentId === deployment.id) ?? false;
        reasons.push(...validateMagneticClampDismount(rider, carrier, matching).reasons);
      }
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
  for (const action of order.actions.filter((candidate) => candidate.type === "ATTACK" && candidate.lightAtCharges)) {
    const target = input.previousState.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
    if (!target) continue;
    const lightAt = validateLightAtAttack({ ...deployment, position: { ...order.endHex } }, target.position, action.lightAtCharges);
    if (!lightAt.legal) reasons.push(lightAt.reason ?? "Light AT use is not legal.");
  }
  for (const action of order.actions.filter((candidate) => candidate.type === "ATTACK" && isCompanionMech(deployment))) {
    reasons.push(...validateMechAttackActivation({
      deployment,
      economy: action.economy,
      declaredWeaponIds: action.weaponIds,
    }).reasons);
  }
  const deployActions = order.actions.filter((action) => action.type === "DEPLOY");
  const packActions = order.actions.filter((action) => action.type === "PACK_UP");
  const digInActions = order.actions.filter((action) => action.type === "DIG_IN");
  const artilleryDigInActions = order.actions.filter((action) => action.type === "ARTILLERY_DIG_IN");
  if (digInActions.length > 1) reasons.push("A unit may Dig In once per round.");
  if (digInActions.length > 0 && order.route.length > 1) reasons.push("Dig In consumes all movement and requires the unit to hold position.");
  if (digInActions.length > 0 && (
    deployment.statuses.includes("DUG_IN") ||
    (isCompanionMech(deployment) && deployment.statuses.includes("CROUCHED"))
  )) reasons.push(isCompanionMech(deployment) ? "The Medium Mech is already crouched." : "The unit is already dug in.");
  for (const action of artilleryDigInActions) {
    const target = input.previousState.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
    const targetOrder = [...input.playerOrders, ...input.enemyOrders].find((candidate) => candidate.unitId === target?.id);
    if (!deploymentAllowsAction(deployment, "ARTILLERY_DIG_IN")) {
      reasons.push("Dig In Artillery requires an Engineer unit.");
    } else if (
      !target ||
      target.side !== deployment.side ||
      target.status === "DESTROYED" ||
      !isArtilleryDeployment(target)
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
  if (deployment.definitionId === "unit-artillery" && order.actions.some((action) => action.type === "ATTACK")) {
    if (!artilleryDeployed && deployActions.length === 0) {
      reasons.push("Artillery must deploy before firing.");
    } else {
      const directFire = validateArtilleryAntiOrbitalExecution({
        deploymentState: deployActions.length > 0 ? "DEPLOYED" : artilleryState(deployment),
        targetDomain: "GROUND",
        distance: 0,
        supplyAvailable: deployment.supplies?.SMALL_SUPPLY ?? 0,
      });
      reasons.push(`${directFire.reason} The experimental barrage profile is not V5 ground direct-fire authority.`);
    }
  }
  if (artillery && order.actions.some((action) => action.type === "BOMBARDMENT") && !artilleryDeployed && deployActions.length === 0) {
    reasons.push("Artillery must deploy before firing.");
  }
  const primaryCount = order.actions.filter((action) => action.economy === "PRIMARY").length;
  if (primaryCount > 1) reasons.push("A unit may perform one Primary Action per round.");
  if (
    primaryCount > 0 &&
    order.actions.some((action) => action.type === "ATTACK") &&
    !order.actions.some((action) =>
      action.type === "ATTACK" &&
      action.economy === "PRIMARY" &&
      (isCompanionMech(deployment) || deployment.definitionId === "unit-super-heavy-tank")
    )
  ) {
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
  const completedMagneticClampActions = new Set<string>();
  for (const order of [...validOrders.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId);
    if (!actor) continue;
    for (const action of order.actions.filter((candidate) => candidate.type === "MOUNT_MAGNETIC_CLAMPS")) {
      if (completedMagneticClampActions.has(action.id)) continue;
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      const targetOrder = target ? validOrders.get(target.id) : undefined;
      const matching = targetOrder?.actions.find((candidate) =>
        candidate.type === action.type && candidate.targetDeploymentId === actor.id
      );
      if (!target || !matching) continue;
      const rider = actor.definitionId === "unit-power-armoured-infantry" ? actor : target;
      const carrier = rider.id === actor.id ? target : actor;
      const validation = validateMagneticClampMount({
        rider,
        carrier,
        matchingPrimaryActions: action.economy === "PRIMARY" && matching.economy === "PRIMARY",
        carrierRiderIds: (carrier.cargo ?? []).filter((item) => item.tags.includes("MAGNETIC_CLAMP_RIDER") && item.unitId).map((item) => item.unitId!),
      });
      if (!validation.legal) continue;
      carrier.cargo = [...(carrier.cargo ?? []), {
        id: `magnetic-clamp:${state.campaignId}:${carrier.id}:${rider.id}`,
        kind: "PERSONNEL",
        quantity: rider.currentHealth,
        tags: [...new Set([...deploymentTags(rider), "MAGNETIC_CLAMP_RIDER"])],
        transportMode: "EMBARKED",
        unitId: rider.id,
      }];
      rider.locationState = "EMBARKED";
      rider.position = { ...carrier.position };
      event("MAGNETIC_CLAMPS_MOUNTED", carrier.id, {
        actionId: action.id,
        matchingActionId: matching.id,
        riderDeploymentId: rider.id,
        carrierDeploymentId: carrier.id,
        position: { ...carrier.position },
        capacity: 1,
      }, carrier.side === "ENEMY" ? "ENEMY" : "ALLIED");
      completedMagneticClampActions.add(action.id);
      completedMagneticClampActions.add(matching.id);
    }
  }
  const resolvedRoutes = new Map(
    [...validOrders.values()].map((order) => [order.id, order.route.map((coord) => ({ ...coord }))]),
  );
  const pendingSapperMineDamage = new Map<string, number>();
  const movementOutcomes = resolveSimultaneousMovement(
    [...validOrders.values()].filter((order) => order.route.length > 1),
    state.deployments,
    state.map,
  );
  for (const outcome of movementOutcomes) {
    resolvedRoutes.set(outcome.orderId, outcome.traversedRoute.map((coord) => ({ ...coord })));
    const deployment = state.deployments.find((candidate) => candidate.id === outcome.unitId)!;
    const moved = outcome.traversedRoute.length > 1;
    const startedGarrisoned = deployment.statuses.includes("GARRISONED") || (
      isGarrisonEligible(deployment) && isInfantryGarrisonBuilding(
        state.map.find((hex) => sameCoord(hex.coord, outcome.from)),
      )
    );
    if (moved) deployment.position = { ...outcome.to };
    const endsGarrisoned = moved && isGarrisonEligible(deployment) && isInfantryGarrisonBuilding(
      state.map.find((hex) => sameCoord(hex.coord, outcome.to)),
    );
    if (moved) {
      deployment.statuses = endsGarrisoned
        ? [...new Set([...deployment.statuses, "GARRISONED"])]
        : deployment.statuses.filter((status) => status !== "GARRISONED");
    }
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
    if (moved && activeOnMap(deployment)) {
      let triggered = false;
      for (const position of outcome.traversedRoute.slice(1)) {
        if (triggered) break;
        const hex = state.map.find((candidate) => sameCoord(candidate.coord, position));
        if (!hex) continue;
        for (const structureInstanceId of [...hex.structureIds].sort((left, right) => left.localeCompare(right))) {
          const mine = parseSapperMinefield(structureInstanceId);
          if (!mine) continue;
          const result = resolveSapperMineTrigger(mine, deployment, state.round);
          if (!result.triggered) continue;
          hex.structureIds = hex.structureIds.filter((id) => id !== structureInstanceId);
          if (result.healthLoss > 0) pendingSapperMineDamage.set(
            deployment.id,
            (pendingSapperMineDamage.get(deployment.id) ?? 0) + result.healthLoss,
          );
          event("SAPPER_MINE_TRIGGERED", deployment.id, {
            structureInstanceId,
            structureDefinitionId: mine.definitionId,
            position,
            healthLoss: result.healthLoss,
            armorPiercing: result.armorPiercing,
            consumed: true,
          });
          triggered = true;
          break;
        }
      }
    }
    if (moved && deployment.statuses.includes("CROUCHED")) {
      deployment.statuses = deployment.statuses.filter((status) => status !== "CROUCHED");
      event("UNIT_DUG_OUT", deployment.id, {
        orderId: outcome.orderId,
        from: outcome.from,
        reason: "MOVED_FROM_POSITION",
        stance: "MECH_CROUCH",
      });
    }
    if (moved && deployment.statuses.includes("SHIELD_WALL")) {
      deployment.statuses = deployment.statuses.filter((status) => status !== "SHIELD_WALL");
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
      if (!startedGarrisoned && endsGarrisoned) {
        event("UNIT_GARRISONED", deployment.id, {
          orderId: outcome.orderId,
          position: outcome.to,
          movementCost: 0.25,
          coverArmor: 1,
          conflictId: "RC-COVER-001",
        });
      } else if (startedGarrisoned && !endsGarrisoned) {
        event("UNIT_LEFT_GARRISON", deployment.id, {
          orderId: outcome.orderId,
          from: outcome.from,
          reason: "LEFT_BUILDING",
        });
      }
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

  for (const deployment of [...state.deployments].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!activeOnMap(deployment) || !isGarrisonEligible(deployment)) continue;
    const insideBuilding = isInfantryGarrisonBuilding(
      state.map.find((hex) => sameCoord(hex.coord, deployment.position)),
    );
    const recordedGarrison = deployment.statuses.includes("GARRISONED");
    if (insideBuilding && !recordedGarrison) {
      deployment.statuses = [...deployment.statuses, "GARRISONED"];
      event("UNIT_GARRISONED", deployment.id, {
        position: deployment.position,
        movementCost: 0,
        coverArmor: 1,
        reason: "DERIVED_OCCUPANCY",
        conflictId: "RC-COVER-001",
      });
    } else if (!insideBuilding && recordedGarrison) {
      deployment.statuses = deployment.statuses.filter((status) => status !== "GARRISONED");
      event("UNIT_LEFT_GARRISON", deployment.id, {
        from: deployment.position,
        reason: "STALE_OCCUPANCY",
        conflictId: "RC-COVER-001",
      });
    }
  }

  const trenchIntruders = new Map<string, Set<string>>();
  for (const outcome of movementOutcomes) {
    const intruder = state.deployments.find((deployment) => deployment.id === outcome.unitId);
    if (!intruder || !activeOnMap(intruder)) continue;
    for (const position of outcome.traversedRoute.slice(1)) {
      if (!isTrenchHex(state, position)) continue;
      for (const defender of state.deployments) {
        if (
          defender.id === intruder.id ||
          defender.side === intruder.side ||
          !activeOnMap(defender) ||
          !defender.statuses.includes("DUG_IN") ||
          !sameCoord(defender.position, position)
        ) continue;
        const intruders = trenchIntruders.get(defender.id) ?? new Set<string>();
        intruders.add(intruder.id);
        trenchIntruders.set(defender.id, intruders);
      }
    }
  }
  for (const [defenderId, intruderIds] of [...trenchIntruders].sort(([left], [right]) => left.localeCompare(right))) {
    const defender = state.deployments.find((deployment) => deployment.id === defenderId);
    if (!defender?.statuses.includes("DUG_IN")) continue;
    defender.statuses = defender.statuses.filter((status) => status !== "DUG_IN");
    event("UNIT_DUG_OUT", defender.id, {
      from: defender.position,
      reason: "HOSTILE_ENTERED_TRENCH",
      hostileUnitIds: [...intruderIds].sort((left, right) => left.localeCompare(right)),
      conflictId: "RC-V5-019",
    });
  }
  synchronizeEmbarkedCargo(state.deployments);

  for (const order of validOrders.values()) {
    if (order.orderType !== "STEALTH") continue;
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const route = resolvedRoutes.get(order.id) ?? order.route;
    const stealth = resolveInfantryStealthOrder({
      unit: { ...actor, position: { ...route[0]! } },
      route,
      observers: state.deployments
        .filter((candidate) => candidate.id !== actor.id)
        .map((candidate) => ({
          id: candidate.id,
          side: candidate.side,
          status: candidate.status,
          position: candidate.position,
          sensorRange: candidate.stats.sensors,
        })),
      map: state.map,
      roll: random.die(6),
    });
    actor.statuses = stealth.legal && !stealth.stealthBroken
      ? [...new Set([...actor.statuses.filter((status) => status !== "REVEALED"), "STEALTHED"])]
      : [...new Set([...actor.statuses.filter((status) => status !== "STEALTHED"), "REVEALED"])];
    event("INFANTRY_STEALTH_RESOLVED", actor.id, {
      orderId: order.id,
      route,
      legal: stealth.legal,
      reason: stealth.reason,
      detected: stealth.detected,
      stealthBroken: stealth.stealthBroken,
      observerIds: stealth.observerIds,
      threshold: stealth.threshold,
      roll: stealth.roll,
    }, actor.side === "ENEMY" ? "ENEMY" : "ALLIED");
  }

  // Minimal deterministic application rule: the Logi spends its V5 Primary
  // Action, the HAT declares an Airdrop over the Logi's resolved endpoint, and
  // Small Supply transfers only up to the Logi's remaining two-slot capacity.
  const completedCoordinatedSupplyActions = new Set<string>();
  for (const logiOrder of [...validOrders.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const logi = state.deployments.find((deployment) => deployment.id === logiOrder.unitId);
    if (!logi || !isLogiTruck(logi) || !activeOnMap(logi)) continue;
    for (const logiAction of logiOrder.actions.filter((action) => action.type === "RESUPPLY")) {
      const hat = state.deployments.find((deployment) => deployment.id === logiAction.targetDeploymentId);
      const hatOrder = hat ? validOrders.get(hat.id) : undefined;
      const hatAction = hatOrder?.actions.find((action) =>
        action.type === "AIRDROP" &&
        action.targetDeploymentId === logi.id &&
        action.targetHex !== undefined &&
        sameCoord(action.targetHex, logi.position)
      );
      const route = hatOrder ? resolvedRoutes.get(hatOrder.id) ?? hatOrder.route : [];
      const fliesOverLogi = route.some((position) => sameCoord(position, logi.position));
      const manifestedSmallSupply = hat?.cargo?.some((item) =>
        item.kind === "SUPPLY" && item.supplyType === "SMALL_SUPPLY" && item.quantity > 0
      );
      if (
        !hat ||
        !isHeavyAirTransport(hat) ||
        !activeOnMap(hat) ||
        hat.side !== logi.side ||
        !hatOrder ||
        !hatAction ||
        !fliesOverLogi ||
        !manifestedSmallSupply
      ) continue;
      const transfer = transferCoordinatedSupplyDrop(hat.supplies ?? {}, logi.supplies ?? {});
      if (!transfer.legal) continue;

      hat.supplies = transfer.source;
      logi.supplies = transfer.destination;
      completedCoordinatedSupplyActions.add(logiAction.id);
      completedCoordinatedSupplyActions.add(hatAction.id);
      event("AIR_DROP_COMPLETED", hat.id, {
        actionId: hatAction.id,
        coordinatedByActionId: logiAction.id,
        targetDeploymentId: logi.id,
        targetHex: { ...logi.position },
        supplyType: transfer.resourceType,
        quantity: transfer.quantityTransferred,
        sourceRemaining: transfer.source.SMALL_SUPPLY ?? 0,
        targetAfter: transfer.destination.SMALL_SUPPLY ?? 0,
        applicationRule: "COORDINATED_DROP_TO_LOGI_ENDPOINT_PARTIAL_TO_CAPACITY",
      }, hat.side === "ENEMY" ? "ENEMY" : "ALLIED");
      event("SUPPLY_TRANSFERRED", logi.id, {
        actionId: logiAction.id,
        dropActionId: hatAction.id,
        sourceId: hat.id,
        targetId: logi.id,
        sourceResourceType: transfer.resourceType,
        resourceType: transfer.resourceType,
        quantity: transfer.quantityTransferred,
        sourceRemaining: transfer.source.SMALL_SUPPLY ?? 0,
        targetAfter: transfer.destination.SMALL_SUPPLY ?? 0,
        purpose: "COORDINATED_SUPPLY_DROP",
        applicationRule: "COORDINATED_DROP_TO_LOGI_ENDPOINT_PARTIAL_TO_CAPACITY",
      }, logi.side === "ENEMY" ? "ENEMY" : "ALLIED");
    }
  }

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

  for (const order of [...validOrders.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId);
    if (!actor) continue;
    for (const action of order.actions.filter((candidate) => candidate.type === "DISMOUNT_MAGNETIC_CLAMPS")) {
      if (completedMagneticClampActions.has(action.id)) continue;
      const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      const targetOrder = target ? validOrders.get(target.id) : undefined;
      const matching = targetOrder?.actions.find((candidate) =>
        candidate.type === action.type && candidate.targetDeploymentId === actor.id
      );
      if (!target || !matching) continue;
      const rider = actor.definitionId === "unit-power-armoured-infantry" ? actor : target;
      const carrier = rider.id === actor.id ? target : actor;
      const validation = validateMagneticClampDismount(
        rider,
        carrier,
        action.economy === "STANDARD" && matching.economy === "STANDARD",
      );
      if (!validation.legal) continue;
      carrier.cargo = (carrier.cargo ?? []).filter((item) =>
        !(item.unitId === rider.id && item.tags.includes("MAGNETIC_CLAMP_RIDER"))
      );
      rider.locationState = "ON_MAP";
      rider.position = { ...carrier.position };
      event("MAGNETIC_CLAMPS_DISMOUNTED", carrier.id, {
        actionId: action.id,
        matchingActionId: matching.id,
        riderDeploymentId: rider.id,
        carrierDeploymentId: carrier.id,
        position: { ...carrier.position },
      }, carrier.side === "ENEMY" ? "ENEMY" : "ALLIED");
      completedMagneticClampActions.add(action.id);
      completedMagneticClampActions.add(matching.id);
    }
  }

  for (const order of validOrders.values()) {
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const actorVisibility: CampaignEvent["visibility"] = actor.side === "ENEMY" ? "ENEMY" : "ALLIED";
    const supportActions = order.actions
      .filter((candidate) => candidate.type !== "ATTACK" && candidate.type !== "DETONATE_DELAYED_CHARGE")
      .map((action, index) => ({ action, index }))
      .sort((left, right) => {
        const priority = (type: StructuredAction["type"]) => type === "LAND" ? -2 : type === "DEPLOY" ? -1 : 0;
        return priority(left.action.type) - priority(right.action.type) || left.index - right.index;
      })
      .map(({ action }) => action);
    for (const action of supportActions) {
      if (completedCoordinatedSupplyActions.has(action.id)) continue;
      if (completedMagneticClampActions.has(action.id)) continue;
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
        actor.statuses = actor.statuses.filter((status) => status !== "REARM_REQUIRED");
        event("AEROSPACE_REARMED", actor.id, {
          actionId: action.id,
          weaponIds,
          ammunitionBefore,
          ammunitionAfter,
          supplyCost: null,
          rulesDecisionId: "RC-V5-023",
        }, actorVisibility);
      }
      if (action.type === "PLACE_DELAYED_CHARGE") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const placement = placeSpecialForcesDelayedCharge(actor, target, state.round);
        if (!placement.legal || !placement.charge) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [placement.reason ?? "Delayed charge placement is illegal."],
          }, actorVisibility);
          continue;
        }
        actor.statusEffects = placement.statusEffects;
        revealSpecialForces(actor);
        event("DELAYED_CHARGE_PLACED", actor.id, {
          actionId: action.id,
          targetId: placement.charge.targetDeploymentId,
          targetKind: placement.charge.targetKind,
          placedRound: placement.charge.placedRound,
          armedFromRound: placement.charge.armedFromRound,
          persistent: true,
        }, actorVisibility);
      }
      if (action.type === "SAPPER_CONSTRUCT") {
        const construction = performSapperConstruction(actor, action.structureDefinitionId, action.targetHex, state.map, state.round);
        if (!construction.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [construction.reason ?? "Sapper construction is illegal."],
          }, actorVisibility);
          continue;
        }
        actor.supplies = { ...(actor.supplies ?? {}), BUILD_SUPPLY: construction.buildSupplyAfter };
        actor.statusEffects = construction.statusEffects;
        event("SAPPER_BUILD_PROGRESS", actor.id, {
          actionId: action.id,
          structureDefinitionId: action.structureDefinitionId,
          targetHex: action.targetHex,
          buildSupplyBefore: construction.buildSupplyBefore,
          buildSupplyAfter: construction.buildSupplyAfter,
          progressBefore: construction.progressBefore,
          progressAfter: construction.progressAfter,
          requiredProgress: construction.project?.requiredProgress,
          completed: construction.completed,
        }, actorVisibility);
        if (construction.completed && construction.structureInstanceId && action.targetHex) {
          const targetMapHex = state.map.find((hex) => sameCoord(hex.coord, action.targetHex!));
          targetMapHex?.structureIds.push(construction.structureInstanceId);
          if (action.structureDefinitionId === "structure-road" && targetMapHex) {
            const sourceHex = state.map.find((hex) => sameCoord(hex.coord, actor.position));
            const direction = facingBetween(actor.position, action.targetHex);
            if (sourceHex && direction !== null) {
              sourceHex.edges.roads = [...new Set([...sourceHex.edges.roads, direction])].sort();
              targetMapHex.edges.roads = [...new Set([...targetMapHex.edges.roads, rearFacing(direction)])].sort();
            }
          }
          const revealHexes = action.structureDefinitionId === "structure-sensor-tower"
            ? sensorTowerRevealHexes(action.targetHex, state.map)
            : [];
          for (const coord of revealHexes) {
            const hex = state.map.find((candidate) => sameCoord(candidate.coord, coord));
            if (hex) hex.visibility = "VISIBLE";
          }
          event("STRUCTURE_COMPLETED", actor.id, {
            actionId: action.id,
            structureDefinitionId: action.structureDefinitionId,
            structureInstanceId: construction.structureInstanceId,
            targetHex: action.targetHex,
            buildSupplySpent: 3,
            revealHexes,
            applicationPolicy: "SAPPER_PUBLIC_V1_BUILD_PROGRESS",
          }, actorVisibility);
        }
      }
      if (action.type === "RELOAD_BUILD_SUPPLY") {
        const reload = reloadSapperBuildSupplyFromDeployment(actor);
        if (!reload.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [reload.reason ?? "Sapper Build Supply reload is illegal."],
          }, actorVisibility);
          continue;
        }
        const buildSupplyBefore = actor.supplies?.BUILD_SUPPLY ?? 0;
        const generalSupplyBefore = actor.supplies?.GENERAL_SUPPLY ?? 0;
        actor.supplies = reload.supplies;
        event("SAPPER_BUILD_SUPPLY_RELOADED", actor.id, {
          actionId: action.id,
          resourceType: "BUILD_SUPPLY",
          buildSupplyBefore,
          buildSupplyAfter: actor.supplies.BUILD_SUPPLY,
          sourceResourceType: "GENERAL_SUPPLY",
          generalSupplyBefore,
          generalSupplyAfter: actor.supplies.GENERAL_SUPPLY,
        }, actorVisibility);
      }
      if (action.type === "RECRUIT_IRREGULAR") {
        const recruitment = recruitIrregularAtPopulationCenter({
          deployment: actor,
          route: resolvedRoutes.get(order.id) ?? order.route,
          map: state.map,
          campaignDeployments: state.deployments,
          round: state.round,
        });
        if (!recruitment.legal) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [recruitment.reason ?? "Irregular recruitment is illegal."],
          }, actorVisibility);
          continue;
        }
        const currentHealthBefore = actor.currentHealth;
        actor.stats = { ...actor.stats, maxHealth: recruitment.maximumForceStrengthAfter };
        actor.statusEffects = recruitment.statusEffects;
        event("IRREGULAR_RECRUITED", actor.id, {
          actionId: action.id,
          populationCenterKey: recruitment.centerKey,
          maximumForceStrengthBefore: recruitment.maximumForceStrengthBefore,
          maximumForceStrengthAfter: recruitment.maximumForceStrengthAfter,
          maximumForceStrengthGained: recruitment.maximumForceStrengthGained,
          currentHealthBefore,
          currentHealthAfter: actor.currentHealth,
          healed: false,
          permanent: true,
        }, actorVisibility);
      }
      if (action.type === "ABANDON_GUNS") {
        const abandoned = abandonCompanionArtillery(actor);
        if (!abandoned.legal || !abandoned.snapshot || artilleryState(actor) !== "DEPLOYED") {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [abandoned.reason ?? "Artillery must be operational and deployed before its guns can be abandoned."],
          }, actorVisibility);
          continue;
        }
        const originalDefinitionId = actor.definitionId;
        Object.assign(actor, abandoned.deployment);
        actor.companionArtilleryAbandonment = abandoned.snapshot;
        event("ARTILLERY_ABANDONED", actor.id, {
          actionId: action.id,
          originalDefinitionId,
          replacementCost: companionArtilleryReplacementCost(abandoned.snapshot.originalDefinitionId),
          position: { ...actor.position },
          transformedDefinitionId: actor.definitionId,
          unarmed: true,
          replacementLimit: "ONCE_PER_CAMPAIGN",
        }, actorVisibility);
      }
      if (action.type === "REPLACE_GUNS") {
        const snapshot = actor.companionArtilleryAbandonment;
        const persistent = actor.persistentUnitId !== undefined;
        const atSupplyPoint = facilitySupports(state, actor, actor.position, "REPLACE_ARTILLERY");
        const replacementCost = snapshot ? companionArtilleryReplacementCost(snapshot.originalDefinitionId) : 0;
        const replacement = replaceCompanionArtillery({
          deployment: actor,
          snapshot,
          atFriendlySupplyPoint: atSupplyPoint,
          // Availability is enforced atomically by the persistent Req ledger effect below.
          availableRequisition: replacementCost,
        });
        if (!persistent || !replacement.legal || !replacement.snapshot) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !persistent
                ? "Artillery replacement requires a persistent player unit for authoritative Requisition debit."
                : replacement.reason ?? "Artillery replacement is illegal.",
            ],
          }, actorVisibility);
          continue;
        }
        Object.assign(actor, replacement.deployment);
        actor.companionArtilleryAbandonment = replacement.snapshot;
        effects.push({
          idempotencyKey: `${state.campaignId}:${state.round}:artillery-replacement:${actor.persistentUnitId}`,
          type: "REQUISITION_SPENT",
          unitId: actor.persistentUnitId,
          payload: {
            campaignId: state.campaignId,
            round: state.round,
            amount: replacement.requisitionSpent,
            reasonCode: "ARTILLERY_REPLACEMENT",
            definitionId: actor.definitionId,
          },
          status: "PENDING",
        });
        event("ARTILLERY_REPLACED", actor.id, {
          actionId: action.id,
          definitionId: actor.definitionId,
          position: { ...actor.position },
          requisitionSpent: replacement.requisitionSpent,
          replacementUsed: true,
          deploymentState: actor.artilleryDeployment,
        }, actorVisibility);
      }
      if (action.type === "SHIELD_WALL") {
        if (
          actor.definitionId !== "unit-power-armoured-infantry" ||
          !actor.equipmentIds.includes(POWER_ARMOURED_INFANTRY_PUBLIC_V1.ballisticShieldsEquipmentId) ||
          !sameCoord(order.startHex, order.endHex)
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["Shield Wall requires stationary Power Armoured Infantry with fitted Ballistic Shields."],
          }, actorVisibility);
          continue;
        }
        actor.statuses = [...new Set([...actor.statuses, "SHIELD_WALL"])];
        event("SHIELD_WALL_FORMED", actor.id, {
          actionId: action.id,
          position: { ...actor.position },
          coverArmor: 1,
          directFireOnly: true,
          stackingCap: 1,
          clearsOnMovement: true,
        }, actorVisibility);
      }
      if (action.type === "DIG_IN") {
        if (isCompanionMech(actor)) {
          const crouch = resolveMechCrouch(actor, sameCoord(order.startHex, order.endHex));
          if (!crouch.legal) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: crouch.reasons,
            }, actorVisibility);
            continue;
          }
          actor.statuses = [...new Set([...actor.statuses, "CROUCHED"])];
          event("UNIT_DUG_IN", actor.id, {
            actionId: action.id,
            position: actor.position,
            stance: "MECH_CROUCH",
            coverArmor: 1,
            coverRequirement: "BLOCKING_LEVEL_1_TERRAIN_DIRECT_FIRE_ONLY",
            speedCost: action.speedCost,
          }, actorVisibility);
          continue;
        }
        if (!deploymentAllowsAction(actor, "DIG_IN") || actor.statuses.includes("DUG_IN")) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !deploymentAllowsAction(actor, "DIG_IN")
                ? "This unit class cannot Dig In."
                : "The unit is already dug in.",
            ],
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
          !deploymentAllowsAction(actor, "ARTILLERY_DIG_IN") ||
          !target ||
          target.side !== actor.side ||
          target.status === "DESTROYED" ||
          !isArtilleryDeployment(target) ||
          artilleryState(target) !== "DEPLOYED" ||
          target.statuses.includes("DUG_IN") ||
          hexDistance(actor.position, target.position) > 1 ||
          !targetRemainsStationary
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !deploymentAllowsAction(actor, "ARTILLERY_DIG_IN")
                ? "Dig In Artillery requires an Engineer unit."
                : !target || target.side !== actor.side || !isArtilleryDeployment(target)
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
        const bridgeDirection = targetHex ? facingBetween(actor.position, targetHex) : null;
        const bridgeSourceHex = fieldwork?.id === "structure-bridge"
          ? state.map.find((hex) => sameCoord(hex.coord, actor.position))
          : undefined;
        const bridgeHasRiverEdge = fieldwork?.id !== "structure-bridge" || (
          bridgeDirection !== null && bridgeSourceHex !== undefined && targetMapHex !== undefined &&
          (bridgeSourceHex.edges.rivers.includes(bridgeDirection) || targetMapHex.edges.rivers.includes(rearFacing(bridgeDirection)))
        );
        if (
          !deploymentAllowsAction(actor, "CONSTRUCT") ||
          !fieldwork ||
          !targetHex ||
          !targetMapHex ||
          hexDistance(actor.position, targetHex) > 1 ||
          alreadyPresent ||
          !bridgeHasRiverEdge ||
          supplyBefore < (fieldwork?.smallSupplyCost ?? 0)
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !deploymentAllowsAction(actor, "CONSTRUCT")
                ? "Construction requires an Engineer unit."
                : !fieldwork
                  ? "That fieldwork is not executable."
                  : alreadyPresent
                  ? `That hex already contains ${fieldwork.name}.`
                  : !bridgeHasRiverEdge
                    ? "A Field Bridge must join the Engineer's hex to an adjacent river-crossing hex."
                    : supplyBefore < fieldwork.smallSupplyCost
                      ? `${fieldwork.name} requires ${fieldwork.smallSupplyCost} Small Supply.`
                      : `${fieldwork.name} must be placed in the Engineer's current or an adjacent hex.`,
            ],
          }, actorVisibility);
          continue;
        }
        const instanceId = `${fieldwork.id}:${state.campaignId}:${state.round}:${actor.id}:${targetHex.q},${targetHex.r}`;
        targetMapHex.structureIds.push(instanceId);
        if (fieldwork.id === "structure-bridge" && bridgeSourceHex && bridgeDirection !== null) {
          bridgeSourceHex.structureIds.push(instanceId);
          bridgeSourceHex.edges.rivers = bridgeSourceHex.edges.rivers.filter((direction) => direction !== bridgeDirection);
          targetMapHex.edges.rivers = targetMapHex.edges.rivers.filter((direction) => direction !== rearFacing(bridgeDirection));
        }
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: supplyBefore - fieldwork.smallSupplyCost };
        event("STRUCTURE_COMPLETED", actor.id, {
          actionId: action.id,
          structureDefinitionId: fieldwork.id,
          structureName: fieldwork.name,
          structureInstanceId: instanceId,
          targetHex,
          smallSupplySpent: fieldwork.smallSupplyCost,
          movementPenalty: fieldwork.movementPenalty,
          edgeDirection: fieldwork.id === "structure-bridge" ? bridgeDirection : undefined,
          opensGroundCrossing: fieldwork.id === "structure-bridge",
          applicationProfileId: fieldwork.id === "structure-bridge" ? "public-v1-engineer-bridge@1" : undefined,
        }, actorVisibility);
      }
      if (action.type === "TRENCH_UPGRADE") {
        const targetHex = action.targetHex;
        const targetMapHex = targetHex && state.map.find((hex) => sameCoord(hex.coord, targetHex));
        const sandbagIndex = targetMapHex?.structureIds.findIndex((id) =>
          id === "structure-sandbag-line" || id.startsWith("structure-sandbag-line:")
        ) ?? -1;
        if (
          actor.definitionId !== "unit-infantry-squad" ||
          !targetHex ||
          !sameCoord(actor.position, targetHex) ||
          !targetMapHex ||
          sandbagIndex < 0
        ) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              actor.definitionId !== "unit-infantry-squad"
                ? "Trench Upgrade requires an Infantry Squad."
                : "Trench Upgrade requires the Infantry Squad to occupy a Sandbag Line.",
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
              minimumRange: 1,
              maximumRange: 4,
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
        const smallSupplyBefore = actor.supplies?.SMALL_SUPPLY ?? 0;
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: validation.supplyAfter };
        const affected = state.deployments
          .filter((candidate) =>
            ((actor.side === "ALLIED" && candidate.side === "ENEMY") ||
              (actor.side === "ENEMY" && candidate.side === "ALLIED")) &&
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
          smallSupplyBefore,
          smallSupplySpent: validation.supplySpent,
          smallSupplyAfter: validation.supplyAfter,
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
      if (action.type === "FUNNEL") {
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const targetOrder = target ? validOrders.get(target.id) : undefined;
        const targetRoute = targetOrder ? resolvedRoutes.get(targetOrder.id) ?? targetOrder.route : [];
        const supplyBefore = actor.supplies?.SMALL_SUPPLY ?? 0;
        const validation = validateFunnelExecution({
          deploymentState: artilleryState(actor),
          targetExists: Boolean(target),
          targetHostile: Boolean(target && target.side !== actor.side && target.side !== "NEUTRAL"),
          targetOperational: Boolean(target && target.status !== "DESTROYED" && target.status !== "WITHDRAWN"),
          targetOnMap: Boolean(target && (target.locationState ?? "ON_MAP") === "ON_MAP"),
          targetMovedThisRound: targetRoute.length > 1,
          distance: target ? hexDistance(actor.position, target.position) : 0,
          chosenDirection: action.direction,
          supplyAvailable: supplyBefore,
        });
        const destination = target && action.direction !== undefined
          ? addCoord(target.position, HEX_DIRECTIONS[action.direction]!)
          : undefined;
        const destinationHex = destination && state.map.find((hex) => sameCoord(hex.coord, destination));
        const destinationOpen = Boolean(
          target && destination && destinationHex && canOccupyHex(destination, target.id, state.deployments, state.map),
        );
        if (!validation.legal || !target || !destination || !destinationHex || !destinationOpen) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              validation.legal
                ? "Funnel displacement must end in an open battlefield hex and cannot chain-push another unit."
                : validation.reason,
            ],
          }, actorVisibility);
          continue;
        }
        const from = { ...target.position };
        target.position = { ...destination };
        actor.supplies = { ...(actor.supplies ?? {}), SMALL_SUPPLY: validation.supplyAfter };
        event("ARTILLERY_FUNNELLED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          from,
          to: destination,
          direction: action.direction,
          forcedDistanceQuarters: V5_FUNNEL_FORCED_DISTANCE_QUARTERS,
          smallSupplyBefore: supplyBefore,
          smallSupplySpent: validation.supplySpent,
          smallSupplyAfter: validation.supplyAfter,
          applicationProfileId: validation.applicationProfileId,
        }, actorVisibility);
      }
      if (action.type === "LOAD") {
        const cargo = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        if (actor.definitionId === "unit-heavy-air-transport" && cargo && isCompanionArtilleryDefinitionId(cargo.definitionId)) {
          const transport = validateCompanionArtilleryTransport(cargo.definitionId, "unit-heavy-air-transport");
          if (!transport.legal) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: [transport.reason ?? "That companion artillery unit cannot use a Heavy Air Transport."],
            }, actorVisibility);
            continue;
          }
        }
        if (isCompanionVtolTransport(actor)) {
          const passivePackage = cargo && (
            deploymentTags(cargo).includes(COMPANION_VTOL_SUPPLY_CARGO_TAG) ||
            deploymentTags(cargo).includes(COMPANION_VTOL_OBJECTIVE_CARGO_TAG)
          );
          const matching = cargo && (passivePackage || validOrders.get(cargo.id)?.actions
            .some((candidate) => candidate.type === "LOAD" && candidate.targetDeploymentId === actor.id));
          const built = cargo
            ? makeCompanionVtolCargoItem({
                campaignId: state.campaignId,
                carrierDefinitionId: actor.definitionId,
                cargo,
              })
            : undefined;
          if (
            !cargo ||
            !matching ||
            !actor.cargoProfile ||
            !actor.statuses.includes("LANDED") ||
            cargo.status === "DESTROYED" ||
            cargo.status === "WITHDRAWN" ||
            cargo.locationState === "EMBARKED" ||
            !sameCoord(actor.position, cargo.position) ||
            !built?.legal ||
            !built.item
          ) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: built?.reasons.length
                ? built.reasons
                : ["Companion VTOL loading requires an eligible co-located cargo package, a landed carrier, and unit consent."],
            }, actorVisibility);
            continue;
          }
          const loaded = embarkCargo(actor.cargoProfile, actor.cargo ?? [], built.item, Math.round(actor.stats.speed * 4));
          const companionManifest = loaded.legal
            ? validateCompanionVtolManifest(actor.definitionId, loaded.manifest)
            : undefined;
          if (!loaded.legal || !companionManifest?.legal) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: companionManifest?.reasons.length
                ? companionManifest.reasons
                : [loaded.reason ?? "Cargo cannot be loaded."],
            }, actorVisibility);
            continue;
          }
          actor.cargo = loaded.manifest;
          cargo.locationState = "EMBARKED";
          cargo.position = { ...actor.position };
          event("CARGO_LOADED", actor.id, {
            actionId: action.id,
            cargoDeploymentId: cargo.id,
            transportMode: built.item.transportMode ?? "EMBARKED",
            externalLoad: built.item.tags.includes(COMPANION_VTOL_EXTERNAL_LOAD_TAG),
            passivePackage: Boolean(passivePackage),
            speedCostQuarters: loaded.speedCostQuarters,
          }, actorVisibility);
          continue;
        }
        const actorTankTransport = cargo
          ? validateCompanionTankTransport(cargo.definitionId, actor.definitionId)
          : undefined;
        const cargoTankTransport = cargo
          ? validateCompanionTankTransport(actor.definitionId, cargo.definitionId)
          : undefined;
        const invalidTankTransport = actorTankTransport?.legal === false
          ? actorTankTransport
          : cargoTankTransport?.legal === false
            ? cargoTankTransport
            : undefined;
        if (invalidTankTransport) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [invalidTankTransport.reason ?? "That companion tank cannot use this carrier."],
          }, actorVisibility);
          continue;
        }
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
        const cargoManifestItemId = typeof action.payload?.cargoManifestItemId === "string"
          ? action.payload.cargoManifestItemId
          : undefined;
        const manifestedSupply = cargoManifestItemId
          ? actor.cargo?.find((candidate) => candidate.id === cargoManifestItemId && candidate.kind === "SUPPLY")
          : undefined;
        if (manifestedSupply) {
          event("AIR_DROP_FAILED", actor.id, {
            actionId: action.id,
            cargoManifestItemId: manifestedSupply.id,
            supplyType: manifestedSupply.supplyType,
            quantity: manifestedSupply.quantity,
            targetHex: action.targetHex,
            reason: "Coordinated Supply Drop is not yet governed; Supply remains aboard.",
            hazardous: false,
          }, actorVisibility);
          continue;
        }
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
          ? powerArmourHatParadropAllowed(cargo)
            ? validateHatClearAirDrop({ flightPath: order.route, destination: hex, cargo: item, currentOccupancy })
            : { legal: false, reasons: ["Power Armoured Infantry requires Heavy Drop Pod insertion and cannot use generic HAT paradrop."], hazardous: false }
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
        if (isCompanionVtolTransport(actor)) {
          const item = actor.cargo?.find((candidate) => candidate.unitId === cargo?.id);
          const targetHex = action.targetHex ?? actor.position;
          const hex = state.map.find((candidate) => sameCoord(candidate.coord, targetHex));
          const rappel = action.payload?.mode === "RAPPEL_GARRISON";
          if (rappel) {
            const rappelled = cargo
              ? resolveCompanionVtolRappel({
                  carrier: actor,
                  passenger: cargo,
                  flightPath: resolvedRoutes.get(order.id) ?? order.route,
                  destination: hex,
                  canOccupyDestination: Boolean(hex && canOccupyHex(targetHex, cargo.id, state.deployments, state.map)),
                })
              : undefined;
            if (!cargo || !rappelled?.legal || !rappelled.targetHex) {
              event("ORDER_REJECTED", actor.id, {
                orderId: order.id,
                actionId: action.id,
                reasons: rappelled?.reasons ?? ["Rappel Garrison requires manifested Infantry cargo."],
              }, actorVisibility);
              continue;
            }
            actor.cargo = rappelled.manifest;
            cargo.locationState = "ON_MAP";
            cargo.position = { ...rappelled.targetHex };
            cargo.statuses = rappelled.passengerStatuses;
            event("CARGO_UNLOADED", actor.id, {
              actionId: action.id,
              cargoDeploymentId: cargo.id,
              transportMode: item?.transportMode ?? "EMBARKED",
              mode: "RAPPEL_GARRISON",
              targetHex: rappelled.targetHex,
              speedCostQuarters: 0,
              passengerActionRequired: rappelled.passengerActionRequired,
              carrierMustLand: rappelled.carrierMustLand,
            }, actorVisibility);
            event("UNIT_GARRISONED", cargo.id, {
              actionId: action.id,
              carrierDeploymentId: actor.id,
              position: rappelled.targetHex,
              movementCost: 0,
              coverArmor: 1,
              reason: "VTOL_RAPPEL_GARRISON",
              conflictId: "RC-COVER-001",
            }, cargo.side === "ENEMY" ? "ENEMY" : "ALLIED");
            continue;
          }

          const passivePackage = Boolean(item && (
            item.tags.includes(COMPANION_VTOL_SUPPLY_CARGO_TAG) ||
            item.tags.includes(COMPANION_VTOL_OBJECTIVE_CARGO_TAG)
          ));
          const matching = cargo && (passivePackage || validOrders.get(cargo.id)?.actions
            .some((candidate) => candidate.type === "UNLOAD" && candidate.targetDeploymentId === actor.id));
          if (
            !cargo ||
            !item ||
            !matching ||
            !actor.cargoProfile ||
            !actor.statuses.includes("LANDED") ||
            !hex ||
            !sameCoord(targetHex, actor.position) ||
            !canOccupyHex(targetHex, cargo.id, state.deployments, state.map)
          ) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: ["Companion VTOL normal unloading requires manifested cargo, a landed carrier hex, room, and unit consent."],
            }, actorVisibility);
            continue;
          }
          const unloaded = disembarkCargo(actor.cargoProfile, actor.cargo ?? [], [item.id], Math.round(actor.stats.speed * 4));
          if (!unloaded.legal) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: [unloaded.reason ?? "Cargo cannot unload."],
            }, actorVisibility);
            continue;
          }
          actor.cargo = unloaded.manifest;
          cargo.locationState = "ON_MAP";
          cargo.position = { ...targetHex };
          const garrisoned = isGarrisonEligible(cargo) && isInfantryGarrisonBuilding(hex);
          cargo.statuses = garrisoned
            ? [...new Set([...cargo.statuses, "GARRISONED"])]
            : cargo.statuses.filter((status) => status !== "GARRISONED");
          event("CARGO_UNLOADED", actor.id, {
            actionId: action.id,
            cargoDeploymentId: cargo.id,
            transportMode: item.transportMode ?? "EMBARKED",
            externalLoad: item.tags.includes(COMPANION_VTOL_EXTERNAL_LOAD_TAG),
            passivePackage,
            targetHex,
            speedCostQuarters: unloaded.speedCostQuarters,
          }, actorVisibility);
          if (garrisoned) {
            event("UNIT_GARRISONED", cargo.id, {
              actionId: action.id,
              carrierDeploymentId: actor.id,
              position: targetHex,
              movementCost: 0,
              coverArmor: 1,
              reason: "VTOL_NORMAL_UNLOAD",
              conflictId: "RC-COVER-001",
            }, cargo.side === "ENEMY" ? "ENEMY" : "ALLIED");
          }
          continue;
        }
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
        if (isCompanionMech(actor)) {
          const reload = reloadMechWeaponAtSupplyPoint({
            deployment: actor,
            weaponId: action.weaponId,
            atFriendlyGovernedSupplyPoint: facilitySupports(state, actor, actor.position, "RELOAD_MECH"),
          });
          if (!reload.legal) {
            event("ORDER_REJECTED", actor.id, {
              orderId: order.id,
              actionId: action.id,
              reasons: reload.reasons,
            }, actorVisibility);
            continue;
          }
          actor.ammunition[action.weaponId!] = reload.ammunitionAfter;
          event("WEAPON_RELOADED", actor.id, {
            actionId: action.id,
            weaponId: action.weaponId,
            ammunitionBefore: reload.ammunitionBefore,
            ammunitionAfter: reload.ammunitionAfter,
            facilityCapability: "SUPPLY_POINT",
            supplySpent: 0,
            rulesProfileId: "companion-v1-mechs@1",
          }, actorVisibility);
          continue;
        }
        if (action.weaponId === "weapon-light-at") {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["Light AT charges have no active field reload rule."],
          }, actorVisibility);
          continue;
        }
        if (isPowerArmourBackWeaponId(action.weaponId)) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: ["The Power Armour back-mounted Light Laser cools automatically and cannot be reloaded."],
          }, actorVisibility);
          continue;
        }
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
        const actorIsMedic = (() => {
          try {
            return getTacticalUnitClass(actor.definitionId).tags.includes("MEDICAL");
          } catch {
            return false;
          }
        })();
        const target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
        const targetIsInfantry = (() => {
          if (!target) return false;
          try {
            return getTacticalUnitClass(target.definitionId).tags.includes("INFANTRY");
          } catch {
            return false;
          }
        })();
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
        const healingInput = actorIsMedic && target && targetIsInfantry ? {
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
        if (!actorIsMedic || !target || !targetIsInfantry || !preflight?.legal || !healingInput) {
          event("ORDER_REJECTED", actor.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [
              !actorIsMedic
                ? "First Aid requires a Combat Medic."
                : !targetIsInfantry
                  ? "First Aid requires a friendly Infantry target."
                  : preflight?.reason ?? "First Aid is illegal.",
            ],
          }, actorVisibility);
          continue;
        }
        const rolledAmount = random.die(6);
        const healed = resolveHealing({ ...healingInput, rolledAmount });
        if (!healed.legal) throw new Error(`First Aid preflight diverged: ${healed.reason ?? "unknown reason"}`);
        const before = target.currentHealth;
        const medicalSupplyBefore = actor.supplies?.MEDICAL_SUPPLY ?? 0;
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
          medicalSupplyBefore,
          medicalSupplyAfter: healed.supplyAfter,
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
          conflictId: "RC-V5-024",
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
        const targetRequiresLandingForRepair = target !== undefined &&
          deploymentTags(target).includes("ATMO_FLIGHT") &&
          !target.statuses.includes("LANDED");
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
        const repaired = target && actorIsEngineer && choice && !targetRequiresLandingForRepair ? resolveEngineerRepair({
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
                : targetRequiresLandingForRepair
                  ? "Fixed-wing aerospace must land at a friendly airfield before it can be repaired."
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
        const actorIsLogistics = isLogiTruck(actor);
        const targetTags = (() => {
          if (!target) return [];
          try {
            return getTacticalUnitClass(target.definitionId).tags;
          } catch {
            return [];
          }
        })();
        const targetIsSupported = target?.definitionId === "unit-artillery" ||
          target?.definitionId === "unit-engineers";
        const targetHasFiniteAmmunition = target?.weapons.some((weapon) =>
          weapon.ammoCapacity !== undefined && (target.ammunition[weapon.id] ?? 0) < weapon.ammoCapacity
        ) ?? false;
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
                  ? targetHasFiniteAmmunition
                    ? "Weapon-ammunition resupply has no governed Small Supply conversion (RC-SUP-001)."
                    : "Field resupply requires a friendly operational Engineer or Artillery unit with governed Small Supply capacity."
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
          applicationRule: "SAME_RESOURCE_PARTIAL_TRANSFER_NO_AMMO_CONVERSION",
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
  for (const [targetId, healthLoss] of pendingSapperMineDamage) damage.set(targetId, healthLoss);
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
    const actor = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    for (const action of order.actions.filter((candidate) => candidate.type === "DETONATE_DELAYED_CHARGE")) {
      const detonation = detonateSpecialForcesDelayedCharge(actor, state.round);
      const actorVisibility: CampaignEvent["visibility"] = actor.side === "ENEMY" ? "ENEMY" : "ALLIED";
      if (!detonation.legal || !detonation.charge) {
        event("ORDER_REJECTED", actor.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: [detonation.reason ?? "Delayed charge detonation is illegal."],
        }, actorVisibility);
        continue;
      }
      actor.statusEffects = detonation.statusEffects;
      revealSpecialForces(actor);
      const target = state.deployments.find((candidate) => candidate.id === detonation.charge!.targetDeploymentId);
      if (!target || !activeOnMap(target)) {
        event("DELAYED_CHARGE_DETONATED", actor.id, {
          actionId: action.id,
          targetId: detonation.charge.targetDeploymentId,
          targetKind: detonation.charge.targetKind,
          healthLoss: 0,
          reason: "ATTACHED_TARGET_NO_LONGER_OPERATIONAL",
        }, actorVisibility);
        continue;
      }
      const demolitionOrigin: CampaignDeployment = {
        ...actor,
        position: { ...target.position },
        stats: { ...actor.stats, healthModel: "HITS" },
      };
      const result = resolveAttackRoll(
        demolitionOrigin,
        target,
        SPECIAL_FORCES_DELAYED_CHARGE,
        state.map,
        random,
        state.deployments,
        { targetEvasive: evasiveUnits.has(target.id), targetCrewRepairing: crewRepairingUnits.has(target.id) },
      );
      if (!result.legal || !result.roll) {
        event("DELAYED_CHARGE_DETONATED", actor.id, {
          actionId: action.id,
          targetId: target.id,
          targetKind: detonation.charge.targetKind,
          healthLoss: 0,
          reason: result.reason ?? "DETONATION_TARGET_INVALID",
        }, actorVisibility);
        continue;
      }
      event("DICE_ROLLED", actor.id, {
        actionId: action.id,
        weaponId: SPECIAL_FORCES_DELAYED_CHARGE.id,
        targetId: target.id,
        dice: SPECIAL_FORCES_DELAYED_CHARGE.damage,
        raw: result.roll.raw,
        modified: result.roll.modified,
        capped: result.roll.capped,
        damageResult: result.damageResult,
        armorPiercing: SPECIAL_FORCES_DELAYED_CHARGE.armorPiercing,
      });
      event("UNIT_ATTACKED", actor.id, {
        actionId: action.id,
        targetId: target.id,
        weaponId: SPECIAL_FORCES_DELAYED_CHARGE.id,
        armor: result.targetArmor,
        coverArmor: result.coverArmor,
        effectiveArmor: result.effectiveArmor,
        defense: result.targetDefense,
        threshold: result.threshold,
        penetrated: result.penetrated,
        healthLoss: result.healthLoss,
        damageResult: result.damageResult,
      });
      event("DELAYED_CHARGE_DETONATED", actor.id, {
        actionId: action.id,
        targetId: target.id,
        targetKind: detonation.charge.targetKind,
        armedFromRound: detonation.charge.armedFromRound,
        detonatedRound: state.round,
        healthLoss: result.healthLoss,
        damageResult: result.damageResult,
        armorPiercing: SPECIAL_FORCES_DELAYED_CHARGE.armorPiercing,
      }, actorVisibility);
      if (result.healthLoss > 0) damage.set(target.id, (damage.get(target.id) ?? 0) + result.healthLoss);
    }
  }
  const interceptorsByTarget = new Map<string, CampaignDeployment[]>();
  for (const interceptorOrder of validOrders.values()) {
    const interceptor = state.deployments.find((candidate) => candidate.id === interceptorOrder.unitId)!;
    if (!deploymentTags(interceptor).includes("AEROSPACE_INTERCEPTOR")) continue;
    for (const action of interceptorOrder.actions.filter((candidate) => candidate.type === "ATTACK")) {
      const intercepted = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      if (
        !intercepted ||
        !deploymentTags(intercepted).includes("AEROSPACE") ||
        !canAttackInterceptor(
          interceptor,
          interceptorOrder,
          intercepted,
          state,
          resolvedRoutes.get(interceptorOrder.id),
        )
      ) continue;
      const existing = interceptorsByTarget.get(intercepted.id) ?? [];
      if (!existing.some((candidate) => candidate.id === interceptor.id)) existing.push(interceptor);
      existing.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      interceptorsByTarget.set(intercepted.id, existing);
      event("AEROSPACE_INTERCEPTED", intercepted.id, {
        interceptorId: interceptor.id,
        interceptorOrderId: interceptorOrder.id,
        rulesDecisionId: "RC-V5-028",
      });
    }
  }
  for (const order of validOrders.values()) {
    const attacker = state.deployments.find((candidate) => candidate.id === order.unitId)!;
    const resolvedRoute = resolvedRoutes.get(order.id) ?? order.route;
    for (const action of order.actions.filter((candidate) => candidate.type === "ATTACK")) {
      const mechActivation = isCompanionMech(attacker)
        ? validateMechAttackActivation({
            deployment: attacker,
            economy: action.economy,
            declaredWeaponIds: action.weaponIds,
          })
        : undefined;
      const tankActivation = selectCompanionTankAttackWeapons(attacker.definitionId, attacker.weapons);
      if (tankActivation && !tankActivation.legal) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: [tankActivation.reason ?? "The companion tank attack profile is incomplete."],
        });
        continue;
      }
      if (tankActivation && attacker.definitionId === "unit-super-heavy-tank" && action.economy !== "PRIMARY") {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["Super Heavy Tank dual-cannon fire requires one Primary Action."],
        });
        continue;
      }
      if (mechActivation && !mechActivation.legal) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: mechActivation.reasons,
        });
        continue;
      }
      if ((isSpecialForcesDeployment(attacker) || isSapperDeployment(attacker)) && attacker.statuses.includes("STEALTHED")) {
        revealSpecialForces(attacker);
        event("INFANTRY_STEALTH_RESOLVED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          revealCause: "ATTACK",
          detected: true,
          stealthBroken: true,
          observerIds: [],
        }, attacker.side === "ENEMY" ? "ENEMY" : "ALLIED");
      }
      const companionArtilleryDefinitionId = isCompanionArtilleryDefinitionId(attacker.definitionId)
        ? attacker.definitionId
        : undefined;
      const companionArtilleryFire = selectCompanionArtilleryFire({
        deployment: attacker,
        targetHex: action.targetHex,
        payloadTargetHexes: action.payload?.targetHexes,
      });
      if (companionArtilleryFire && companionArtilleryDefinitionId) {
        const shotErrors = [...companionArtilleryFire.reasons];
        const firingProfile: ArtilleryProfile = {
          ...artilleryProfile,
          id: "companion-artillery-public-v1",
          fireSupplyCost: 0,
        };
        for (const shot of companionArtilleryFire.shots) {
          if (!state.map.some((hex) => sameCoord(hex.coord, shot.targetHex))) {
            shotErrors.push(`Shot ${shot.index} targets a hex outside the battlefield.`);
            continue;
          }
          const range = validateCompanionArtilleryRange(
            companionArtilleryDefinitionId,
            attacker.position,
            shot.targetHex,
            hexDistance(attacker.position, shot.targetHex),
          );
          if (!range.legal) shotErrors.push(range.reason ?? `Shot ${shot.index} is outside the weapon's range.`);
          const fire = validateArtilleryFire({
            profile: firingProfile,
            deploymentState: isCrewedCompanionArtilleryDefinitionId(attacker.definitionId) ? artilleryState(attacker) : "DEPLOYED",
            firingUnitId: attacker.id,
            firingSide: attacker.side,
            firingPosition: attacker.position,
            weapon: companionArtilleryFire.weapon,
            target: {
              id: `hex:${shot.targetHex.q},${shot.targetHex.r}`,
              side: attacker.side === "ALLIED" ? "ENEMY" : "ALLIED",
              status: "ACTIVE",
              position: shot.targetHex,
              domain: "GROUND",
            },
            map: state.map,
            spotters: artillerySpotters(state, attacker),
            supplyAvailable: 0,
          });
          if (!fire.legal) shotErrors.push(fire.reason ?? `Shot ${shot.index} has no legal spotter.`);
        }
        if (!companionArtilleryFire.legal || shotErrors.length > 0) {
          event("ORDER_REJECTED", attacker.id, {
            orderId: order.id,
            actionId: action.id,
            reasons: [...new Set(shotErrors)],
          });
          continue;
        }
        if (companionArtilleryFire.ammunitionAfter !== undefined) {
          attacker.ammunition[companionArtilleryFire.weapon.id] = companionArtilleryFire.ammunitionAfter;
        }
        const spotterDeployments = state.deployments.filter((candidate) =>
          candidate.id !== attacker.id &&
          candidate.side === attacker.side &&
          activeOnMap(candidate) &&
          !deploymentTags(candidate).includes("CANNOT_SPOT_GROUND")
        );
        const activationWeapon = { ...companionArtilleryFire.weapon, ammoCapacity: undefined };
        for (const shot of companionArtilleryFire.shots) {
          const targets = state.deployments
            .filter((candidate) =>
              candidate.side !== attacker.side &&
              activeOnMap(candidate) &&
              deploymentTags(candidate).includes("GROUND") &&
              sameCoord(candidate.position, shot.targetHex)
            )
            .sort((left, right) => left.id.localeCompare(right.id));
          for (const target of targets) {
            const result = resolveAttackRoll(attacker, target, activationWeapon, state.map, random, spotterDeployments, {
              attackerEvasive: evasiveUnits.has(attacker.id),
              targetEvasive: evasiveUnits.has(target.id),
              targetCrewRepairing: crewRepairingUnits.has(target.id),
            });
            if (!result.legal || !result.roll) continue;
            event("DICE_ROLLED", attacker.id, {
              actionId: action.id,
              weaponId: activationWeapon.id,
              shotIndex: shot.index,
              shotCount: companionArtilleryFire.shots.length,
              targetHex: shot.targetHex,
              targetId: target.id,
              areaHex: true,
              dice: activationWeapon.damage,
              raw: result.roll.raw,
              modified: result.roll.modified,
              capped: result.roll.capped,
              damageResult: result.damageResult,
              ammunitionBefore: companionArtilleryFire.ammunitionBefore,
              ammunitionAfter: companionArtilleryFire.ammunitionAfter,
            });
            const rushMultiplier = rushingUnits.has(target.id) ? 2 : 1;
            const healthLoss = result.healthLoss * rushMultiplier;
            event("UNIT_ATTACKED", attacker.id, {
              actionId: action.id,
              targetId: target.id,
              targetHex: shot.targetHex,
              weaponId: activationWeapon.id,
              shotIndex: shot.index,
              shotCount: companionArtilleryFire.shots.length,
              areaHex: true,
              armor: result.targetArmor,
              coverArmor: result.coverArmor,
              effectiveArmor: result.effectiveArmor,
              defense: result.targetDefense,
              threshold: result.threshold,
              penetrated: result.penetrated,
              healthLoss,
              rushMultiplier,
            });
            if (healthLoss > 0) damage.set(target.id, (damage.get(target.id) ?? 0) + healthLoss);
          }
          event("ARTILLERY_BOMBARDED", attacker.id, {
            actionId: action.id,
            shotIndex: shot.index,
            shotCount: companionArtilleryFire.shots.length,
            targetHex: shot.targetHex,
            areaHex: true,
            targetIds: targets.map((target) => target.id),
            weaponId: activationWeapon.id,
            supplySpent: 0,
          });
        }
        continue;
      }
      if (isArtilleryDeployment(attacker) && !attacker.statuses.includes("DEPLOYED")) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["Artillery must be deployed before firing."],
        });
        continue;
      }
      let target = state.deployments.find((candidate) => candidate.id === action.targetDeploymentId);
      const declaredInterceptors = interceptorsByTarget.get(attacker.id) ?? [];
      if (declaredInterceptors.length > 0) {
        const legalInterceptors = declaredInterceptors.filter((candidate) =>
          canAttackInterceptor(attacker, order, candidate, state, resolvedRoute)
        );
        if (legalInterceptors.length === 0) {
          event("ORDER_REJECTED", attacker.id, {
            orderId: order.id,
            actionId: action.id,
            targetId: target?.id,
            reasons: ["The intercepted aerospace unit has no legal Interceptor target and loses its attack activation."],
            rulesDecisionId: "RC-V5-028",
          });
          continue;
        }
        if (!target || !legalInterceptors.some((candidate) => candidate.id === target!.id)) {
          if (attacker.side !== "ENEMY") {
            event("ORDER_REJECTED", attacker.id, {
              orderId: order.id,
              actionId: action.id,
              targetId: target?.id,
              legalInterceptorIds: legalInterceptors.map((candidate) => candidate.id),
              reasons: ["An intercepted aerospace unit may attack only a legal Interceptor that attacked it."],
              rulesDecisionId: "RC-V5-028",
            });
            continue;
          }
          target = legalInterceptors[0];
        }
      }
      if (!target) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          reasons: ["Target does not exist."],
        });
        continue;
      }
      const arc = validateLimitedForwardArc(deploymentTags(attacker), resolvedRoute, attacker.facing, target.position);
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
      const bombingFailure = attacker.weapons.filter((weapon) => !isLightAtChargeStore(weapon))
        .map((weapon) => validateBomberAttack(
          deploymentTags(attacker),
          weapon,
          resolvedRoute,
          target.position,
          attacker.ammunition[weapon.id] ?? 0,
          { orderType: order.orderType, targetTags: deploymentTags(target) },
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
      const lightAt = validateLightAtAttack(attacker, target.position, action.lightAtCharges);
      if (!lightAt.legal) {
        event("ORDER_REJECTED", attacker.id, {
          orderId: order.id,
          actionId: action.id,
          targetId: target.id,
          reasons: [lightAt.reason],
        });
        continue;
      }
      let lightAtSpent = false;
      let emplacementUsed = false;
      const selectedMechWeapons = mechActivation ? new Set(mechActivation.weaponIds) : undefined;
      const selectedAttackWeapons = tankActivation?.weapons ?? attacker.weapons.filter((candidate) =>
        !isLightAtChargeStore(candidate) && (!selectedMechWeapons || selectedMechWeapons.has(candidate.id))
      ).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
      for (const [shotIndex, fittedWeapon] of selectedAttackWeapons.entries()) {
        const emplacement = emplacementUsed
          ? { applied: false, weapon: fittedWeapon }
          : applySapperWeaponEmplacement(attacker, fittedWeapon, state.map);
        const weapon = emplacement.weapon;
        const ammunitionBefore = weapon.ammoCapacity === undefined
          ? undefined
          : attacker.ammunition[weapon.id] ?? 0;
        const bombing = validateBomberAttack(
          deploymentTags(attacker),
          weapon,
          resolvedRoute,
          target.position,
          attacker.ammunition[weapon.id] ?? 0,
          { orderType: order.orderType, targetTags: deploymentTags(target) },
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
          armorPiercingBonus: weapon.id === "weapon-infantry-rifle" ? lightAt.armorPiercingBonus : 0,
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
        if (emplacement.applied) emplacementUsed = true;
        if (weapon.id === "weapon-infantry-rifle" && lightAt.charges > 0 && !lightAtSpent) {
          attacker.ammunition["weapon-light-at"] = lightAt.ammunitionAfter;
          lightAtSpent = true;
          event("LIGHT_AT_EXPENDED", attacker.id, {
            actionId: action.id,
            targetId: target.id,
            chargesSpent: lightAt.charges,
            armorPiercingBonus: lightAt.armorPiercingBonus,
            ammunitionBefore: lightAt.available,
            ammunitionAfter: lightAt.ammunitionAfter,
            sourceEquipmentId: "equipment-light-at",
          });
        }
        let ammunitionAfter = result.ammoAfter;
        let coolingTriggered = false;
        if (ammunitionAfter !== undefined && isPowerArmourBackWeaponId(weapon.id)) {
          const cycle = resolvePowerArmourBackWeaponCycle(ammunitionAfter);
          ammunitionAfter = cycle.ammunitionAfter;
          coolingTriggered = cycle.coolingTriggered;
          if (cycle.cooldownAfter !== undefined) attacker.cooldowns[weapon.id] = cycle.cooldownAfter;
        }
        if (ammunitionAfter !== undefined) {
          attacker.ammunition[weapon.id] = ammunitionAfter;
          if (ammunitionAfter === 0 && isAerospaceDeployment(attacker)) {
            attacker.statuses = [...new Set([...attacker.statuses, "REARM_REQUIRED"])];
          }
        }
        if (result.cooldownAfter) attacker.cooldowns[weapon.id] = result.cooldownAfter;
        event("DICE_ROLLED", attacker.id, {
          actionId: action.id,
          weaponId: weapon.id,
          shotIndex: tankActivation ? shotIndex + 1 : undefined,
          shotCount: tankActivation?.shotCount,
          attackMode: mechActivation ? "MECH_PRIMARY_MULTIWEAPON" : undefined,
          activationWeaponIds: mechActivation?.weaponIds,
          targetId: target.id,
          dice: weapon.damage,
          raw: result.roll.raw,
          modified: result.roll.modified,
          capped: result.roll.capped,
          rapidFireMultiplier: result.rapidFireMultiplier,
          damageResult: result.damageResult,
          highGroundModifier: result.highGroundModifier,
          evasiveAttackModifier: result.evasiveAttackModifier,
          armorPiercingBonus: result.armorPiercingBonus,
          ammunitionBefore,
          ammunitionAfter,
          coolingTriggered,
        });
        const rushMultiplier = rushingUnits.has(target.id) ? 2 : 1;
        const healthLoss = result.healthLoss * rushMultiplier;
        event("UNIT_ATTACKED", attacker.id, {
          actionId: action.id,
          targetId: target.id,
          weaponId: weapon.id,
          shotIndex: tankActivation ? shotIndex + 1 : undefined,
          shotCount: tankActivation?.shotCount,
          attackMode: mechActivation ? "MECH_PRIMARY_MULTIWEAPON" : undefined,
          activationWeaponIds: mechActivation?.weaponIds,
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
          armorPiercingBonus: result.armorPiercingBonus,
        });
        const subsystemRules = weapon.damage.count === 1
          ? getTacticalSubsystemRules(target.definitionId) ??
            getCompanionTankSubsystemRules(target.definitionId) ??
            getMechanizedInfantrySubsystemRules(target.definitionId)
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
      if ((target.cargo?.length ?? 0) > 0) {
        const frozenCargo = target.cargo!.map((item) => ({
          cargoId: item.id,
          cargoDeploymentId: item.unitId,
          kind: item.kind,
          quantity: item.quantity,
          supplyType: item.supplyType,
          transportMode: item.transportMode,
        }));
        event("CARGO_DESTRUCTION_REQUIRES_ADJUDICATION", target.id, {
          conflictId: "RC-V5-030",
          carrierPersistentUnitId: target.persistentUnitId,
          frozenAt: { ...target.position },
          cargo: frozenCargo,
          requiresAdjudication: frozenCargo.some((item) => item.kind !== "SUPPLY"),
          resolution: "FROZEN_WITH_DESTROYED_CARRIER",
        }, target.side === "ENEMY" ? "ENEMY" : "ALLIED");
      }
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
        position: { ...deployment.position },
        facing: deployment.facing,
        statuses: [...deployment.statuses],
        definitionId: deployment.definitionId,
        stats: structuredClone(deployment.stats),
        weapons: structuredClone(deployment.weapons),
        companionArtilleryAbandonment: structuredClone(deployment.companionArtilleryAbandonment),
        statusEffects: structuredClone(deployment.statusEffects ?? []),
        equipmentIds: [...deployment.equipmentIds],
        towedUnitId: deployment.towedUnitId
          ? state.deployments.find((candidate) => candidate.id === deployment.towedUnitId)?.persistentUnitId ?? deployment.towedUnitId
          : undefined,
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

  // Forward Line is intentionally narrower than a combat Infantry tag. At
  // round end, an operational on-map Mechanized Infantry formation contests
  // or claims only its occupied authored objective/control hex.
  for (const hex of [...state.map].sort((left, right) => coordKey(left.coord).localeCompare(coordKey(right.coord)))) {
    if (!hex.objectiveId) continue;
    const objective = state.objectives.find((candidate) => candidate.id === hex.objectiveId);
    const mechanizedOccupants = state.deployments.filter((deployment) =>
      isMechanizedInfantry(deployment) && sameCoord(deployment.position, hex.coord)
    );
    if (mechanizedOccupants.length === 0) continue;
    const objectiveControlOccupants = state.deployments.filter((deployment) =>
      sameCoord(deployment.position, hex.coord) && (
        isMechanizedInfantry(deployment) ||
        (deploymentTags(deployment).includes("INFANTRY") && deploymentTags(deployment).includes("PERSONNEL"))
      )
    );
    const control = resolveForwardLineControl(objectiveControlOccupants.map((deployment) => ({
      id: deployment.id,
      side: deployment.side,
      operational: activeOnMap(deployment),
    })));
    if (control.contested) {
      event("OBJECTIVE_CAPTURED", undefined, {
        objectiveId: hex.objectiveId,
        coord: { ...hex.coord },
        contested: true,
        occupantIds: control.occupantIds,
        controlAbility: "FORWARD_LINE_CONTROL",
        owner: hex.control,
      });
      continue;
    }
    if (
      !control.controllingSide ||
      (control.controllingSide === hex.control && (!objective || control.controllingSide === objective.owner))
    ) continue;
    const previousOwner = objective?.owner ?? hex.control;
    hex.control = control.controllingSide;
    if (objective) objective.owner = control.controllingSide;
    event("OBJECTIVE_CAPTURED", undefined, {
      objectiveId: hex.objectiveId,
      objectiveName: objective?.name,
      coord: { ...hex.coord },
      previousOwner,
      owner: control.controllingSide,
      status: "ACTIVE",
      occupantIds: control.occupantIds,
      controlAbility: "FORWARD_LINE_CONTROL",
    });
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

import type { ActionEconomy, ActionType, OrderType } from "../../domain/src";
import type { RulesCatalogueEnvelopeV1 } from "../../domain/src/rules-catalogue-contract";
import { createRulesCatalogueRuntime, type CatalogueRuntimeModeV1 } from "./catalogue-runtime";
import {
  V5_CORE_CURATED_2_CATALOGUE,
  V5_CORE_CURATED_2_CONTENT_HASH,
  V5_CORE_CURATED_2_RULESET_VERSION,
} from "./generated/v5-core-curated-2";

const registeredHandlerIds = new Set([
  "foundation-generated-unit-class",
  "foundation-action-handler",
  "foundation-fieldwork-handler",
  "foundation-order-handler",
  "equipment-effect-flak-vests",
  "equipment-effect-light-at",
  "companion-irregular-public-v1",
  "companion-special-forces-public-v1",
  "companion-sappers-public-v1",
  "companion-artillery-public-v1",
  "companion-vtol-transports-public-v1",
  "companion-tanks-public-v1",
  "companion-mechanized-infantry-public-v1",
  "companion-mechs-public-v1",
  "companion-power-armour-public-v1",
  "equipment-power-armour-public-v1",
  "equipment-mech-weapons-public-v1",
]);

const runtimeBuild = createRulesCatalogueRuntime(
  structuredClone(V5_CORE_CURATED_2_CATALOGUE) as unknown as RulesCatalogueEnvelopeV1,
  registeredHandlerIds,
);

if (!runtimeBuild.ok) {
  throw new Error(
    `TACTICAL_GRAMMAR_HANDLER_REGISTRY_INVALID:${runtimeBuild.issues.map((issue) => issue.handlerId).join(",")}`,
  );
}

export const tacticalRulesCatalogueRuntime = runtimeBuild.runtime;

const actionIds: Partial<Record<ActionType, string>> = {
  AIRDROP: "action-airdrop",
  LAND: "action-land",
  TAKE_OFF: "action-take-off",
  REARM_AEROSPACE: "action-rearm-aerospace",
  ATTACK: "action-attack",
  ARTILLERY_DIG_IN: "action-artillery-dig-in",
  DIG_IN: "action-dig-in",
  DEPLOY: "action-deploy-platform",
  PACK_UP: "action-pack-platform",
  REPAIR: "action-repair",
  CREW_REPAIR: "action-crew-repair",
  CONSTRUCT: "action-construct",
  TRENCH_UPGRADE: "action-trench-upgrade",
  LOAD: "action-load-cargo",
  UNLOAD: "action-unload-cargo",
  RESUPPLY: "action-transfer-supply",
  RELOAD: "action-reload",
  SCAN: "action-scan",
  DEPLOY_DRONE: "action-deploy-drone",
  HEAL: "action-first-aid",
  BOMBARDMENT: "action-bombardment",
  FUNNEL: "action-funnel",
  PLACE_DELAYED_CHARGE: "action-place-delayed-charge-public-v1",
  DETONATE_DELAYED_CHARGE: "action-detonate-delayed-charge-public-v1",
};

const orderIds: Record<OrderType, string> = {
  HOLD: "order-hold",
  ADVANCE: "order-advance",
  RUSH: "order-rush",
  EVASIVE: "order-evasive",
  MELEE_CHARGE: "order-melee-charge",
  STEALTH: "order-stealth",
};

export interface TacticalActionRule {
  id: string;
  actionType: ActionType;
  economy: ActionEconomy;
  speedCost: number;
  usesAttack: boolean;
  executable: boolean;
  handlerId: string | null;
  catalogueRulesetVersion: typeof V5_CORE_CURATED_2_RULESET_VERSION;
  catalogueContentHash: typeof V5_CORE_CURATED_2_CONTENT_HASH;
}

export interface TacticalOrderRule {
  id: string;
  orderType: OrderType;
  executable: boolean;
  handlerId: string | null;
  catalogueRulesetVersion: typeof V5_CORE_CURATED_2_RULESET_VERSION;
  catalogueContentHash: typeof V5_CORE_CURATED_2_CONTENT_HASH;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`TACTICAL_GRAMMAR_INVALID:${label}`);
  }
  return value as Record<string, unknown>;
}

function actionEconomy(value: unknown, id: string): ActionEconomy {
  if (value === "STANDARD" || value === "PRIMARY" || value === "INCIDENTAL") return value;
  throw new Error(`TACTICAL_GRAMMAR_INVALID:${id}:economy`);
}

export function getTacticalActionRule(
  actionType: ActionType,
  mode: CatalogueRuntimeModeV1 = "PRODUCTION",
): TacticalActionRule {
  if (actionType === "PLACE_DELAYED_CHARGE" || actionType === "DETONATE_DELAYED_CHARGE") {
    return {
      id: actionType === "PLACE_DELAYED_CHARGE"
        ? "action-place-delayed-charge-public-v1"
        : "action-detonate-delayed-charge-public-v1",
      actionType,
      economy: "PRIMARY",
      speedCost: 0,
      usesAttack: true,
      executable: true,
      handlerId: "foundation-action-handler",
      catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    };
  }
  if (actionType === "SAPPER_CONSTRUCT" || actionType === "RELOAD_BUILD_SUPPLY" || actionType === "RECRUIT_IRREGULAR") {
    return {
      id: actionType === "SAPPER_CONSTRUCT"
        ? "action-sapper-construct-public-v1"
        : actionType === "RELOAD_BUILD_SUPPLY"
          ? "action-reload-build-supply-public-v1"
          : "action-recruit-irregular-public-v1",
      actionType,
      economy: "PRIMARY",
      speedCost: 0,
      usesAttack: true,
      executable: true,
      handlerId: "foundation-action-handler",
      catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    };
  }
  if (actionType === "ABANDON_GUNS" || actionType === "REPLACE_GUNS") {
    return {
      id: actionType === "ABANDON_GUNS" ? "action-abandon-guns-public-v1" : "action-replace-guns-public-v1",
      actionType,
      economy: "PRIMARY",
      speedCost: 0,
      usesAttack: true,
      executable: true,
      handlerId: "foundation-action-handler",
      catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    };
  }
  if (actionType === "SHIELD_WALL" || actionType === "MOUNT_MAGNETIC_CLAMPS" || actionType === "DISMOUNT_MAGNETIC_CLAMPS") {
    return {
      id: `action-${actionType.toLowerCase().replaceAll("_", "-")}-public-v1`,
      actionType,
      economy: actionType === "MOUNT_MAGNETIC_CLAMPS" ? "PRIMARY" : "STANDARD",
      speedCost: actionType === "SHIELD_WALL" ? 1 : actionType === "DISMOUNT_MAGNETIC_CLAMPS" ? 0.5 : 0,
      usesAttack: actionType === "MOUNT_MAGNETIC_CLAMPS",
      executable: true,
      handlerId: "foundation-action-handler",
      catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    };
  }
  const id = actionIds[actionType];
  if (!id) throw new Error(`Unknown action type: ${actionType}`);
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("ACTION", id);
  if (!lookup.found) throw new Error(`TACTICAL_GRAMMAR_DEFINITION_MISSING:${id}`);
  const parameters = objectValue(lookup.value.parameters, `${id}:parameters`);
  const definition = objectValue(parameters.definition, `${id}:definition`);
  const speed = lookup.value.sourcedNumbers.speedCostQuarters;
  if (!speed || speed.status !== "PUBLISHED" || speed.value === null || !Number.isInteger(speed.value)) {
    throw new Error(`TACTICAL_GRAMMAR_INVALID:${id}:speedCostQuarters`);
  }
  const decision = tacticalRulesCatalogueRuntime.decide("ACTION", id, mode);
  return {
    id,
    actionType,
    economy: actionEconomy(parameters.economy, id),
    speedCost: speed.value / 4,
    usesAttack: definition.usesAttack === true,
    executable: decision.availability.allowed && decision.executability.allowed,
    handlerId: decision.executability.handlerId,
    catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
  };
}

export function getTacticalOrderRule(
  orderType: OrderType,
  mode: CatalogueRuntimeModeV1 = "PRODUCTION",
): TacticalOrderRule {
  if (orderType === "STEALTH") {
    return {
      id: orderIds.STEALTH,
      orderType,
      executable: true,
      handlerId: "foundation-order-handler",
      catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
      catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    };
  }
  const id = orderIds[orderType];
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("ORDER", id);
  if (!lookup.found) throw new Error(`TACTICAL_GRAMMAR_DEFINITION_MISSING:${id}`);
  const decision = tacticalRulesCatalogueRuntime.decide("ORDER", id, mode);
  return {
    id,
    orderType,
    executable: decision.availability.allowed && decision.executability.allowed,
    handlerId: decision.executability.handlerId,
    catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
  };
}

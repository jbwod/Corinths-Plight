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
  "foundation-order-handler",
  "equipment-effect-flak-vests",
  "equipment-effect-light-at",
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
  ATTACK: "action-attack",
  DIG_IN: "action-dig-in",
  DEPLOY: "action-deploy-platform",
  PACK_UP: "action-pack-platform",
  REPAIR: "action-repair",
  CONSTRUCT: "action-construct",
  LOAD: "action-load-cargo",
  UNLOAD: "action-unload-cargo",
  RESUPPLY: "action-transfer-supply",
  RELOAD: "action-reload",
  SCAN: "action-scan",
  DEPLOY_DRONE: "action-deploy-drone",
  HEAL: "action-first-aid",
  BOMBARDMENT: "action-bombardment",
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

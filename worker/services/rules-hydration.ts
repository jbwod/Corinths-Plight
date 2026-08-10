import type {
  RuleDefinitionStatusV1,
  RuleNullableNumberV1,
  RulesCatalogueEnvelopeV1,
} from "../../packages/domain/src/rules-catalogue-contract";
import type {
  GovernedCargoProfileV1,
  GovernedSupplyProfileV1,
  UnitClassDefinition,
} from "../../packages/domain/src";
import {
  createRulesCatalogueRuntime,
  getActionDefinition,
  getOrderTypeDefinition,
  getUnitClass,
  hydrateGovernedCargoProfile,
  hydrateGovernedSupplyProfile,
  type CatalogueRuntimeModeV1,
  type RulesCatalogueRuntimeV1,
} from "../../packages/rules-engine/src";
import {
  V5_CORE_CURATED_2_CATALOGUE,
  V5_CORE_CURATED_2_CONTENT_HASH,
  V5_CORE_CURATED_2_RULESET_VERSION,
} from "../../packages/rules-engine/src/generated/v5-core-curated-2";

export const RULES_AUTHORITY_SNAPSHOT_VERSION = 1 as const;
export const LEGACY_RULESET_ID = "ruleset-v5-core-curated-1" as const;

const callerHandlerIds = new Set([
  "foundation-compiled-unit-class",
  "foundation-action-handler",
  "foundation-order-handler",
  "equipment-effect-flak-vests",
  "equipment-effect-light-at",
]);

const runtimeBuild = createRulesCatalogueRuntime(
  structuredClone(V5_CORE_CURATED_2_CATALOGUE) as unknown as RulesCatalogueEnvelopeV1,
  callerHandlerIds,
);

if (!runtimeBuild.ok) {
  throw new Error(`RULES_CATALOGUE_HANDLER_REGISTRY_INVALID:${runtimeBuild.issues.map((issue) => issue.handlerId).join(",")}`);
}

export const serverRulesCatalogueRuntime: RulesCatalogueRuntimeV1 = runtimeBuild.runtime;

export type D1RuleStatus = string | null;

export interface D1UnitRulesInput {
  rulesetId: string;
  definitionId: string;
  definitionStatus: string;
  sensorRange: number;
  requisitionCost: number | null;
  implementationStatus: D1RuleStatus;
  requisitionStatus: D1RuleStatus;
  availabilityStatus: D1RuleStatus;
  executable: boolean;
  purchasable: boolean;
  reasonCode: D1RuleStatus;
  actionDefinitionIds: readonly string[];
  allowedActionTypes: readonly string[];
  allowedOrderTypes: readonly string[];
  movementProfileId: string;
  durabilityProfileId: string;
  cargoProfileId: string | null;
  supplyProfileId: string | null;
  deploymentProfileId: string | null;
}

export interface D1EquipmentRulesInput {
  rulesetId: string;
  definitionId: string;
  definitionStatus: string;
  requisitionCost: number | null;
  implementationStatus: D1RuleStatus;
  requisitionStatus: D1RuleStatus;
  availabilityStatus: D1RuleStatus;
  executable: boolean;
  purchasable: boolean;
  reasonCode: D1RuleStatus;
}

export interface RulesAuthorityStatusSnapshotV1 {
  definitionStatus: RuleDefinitionStatusV1;
  implementationStatus: string;
  requisitionStatus: string;
  availabilityStatus: string;
  executable: boolean;
  purchasable: boolean;
  handlerId: string | null;
  reasonCode: string | null;
}

export interface UnitRulesAuthoritySnapshotV1 {
  schemaVersion: typeof RULES_AUTHORITY_SNAPSHOT_VERSION;
  kind: "UNIT";
  catalogueContentHash: typeof V5_CORE_CURATED_2_CONTENT_HASH;
  catalogueRulesetVersion: typeof V5_CORE_CURATED_2_RULESET_VERSION;
  definitionId: string;
  sourcedNumbers: {
    sensorRange: RuleNullableNumberV1;
    requisitionCost: RuleNullableNumberV1;
  };
  status: RulesAuthorityStatusSnapshotV1;
  decision: {
    availabilityCode: string;
    executabilityCode: string;
    available: boolean;
    executable: boolean;
  };
  links: {
    actionDefinitionIds: string[];
    orderDefinitionIds: string[];
    allowedActionTypes: string[];
    allowedOrderTypes: string[];
  };
  profiles: {
    movementProfileId: string;
    durabilityProfileId: string;
    cargoProfile: GovernedCargoProfileV1 | null;
    supplyProfile: GovernedSupplyProfileV1 | null;
    deploymentProfileId: string | null;
  };
  legacyD1: D1UnitRulesInput;
}

export interface EquipmentRulesAuthoritySnapshotV1 {
  schemaVersion: typeof RULES_AUTHORITY_SNAPSHOT_VERSION;
  kind: "EQUIPMENT";
  catalogueContentHash: typeof V5_CORE_CURATED_2_CONTENT_HASH;
  catalogueRulesetVersion: typeof V5_CORE_CURATED_2_RULESET_VERSION;
  definitionId: string;
  sourcedNumbers: { requisitionCost: RuleNullableNumberV1 };
  status: RulesAuthorityStatusSnapshotV1;
  decision: {
    availabilityCode: string;
    executabilityCode: string;
    available: boolean;
    executable: boolean;
  };
  legacyD1: D1EquipmentRulesInput;
}

export type UnitRulesHydrationResult =
  | {
    ok: true;
    authority: UnitRulesAuthoritySnapshotV1;
    legacyDefinition: UnitClassDefinition;
  }
  | {
    ok: false;
    code: string;
    message: string;
    authority: UnitRulesAuthoritySnapshotV1 | null;
  };

export type EquipmentRulesHydrationResult =
  | { ok: true; authority: EquipmentRulesAuthoritySnapshotV1 }
  | { ok: false; code: string; message: string; authority: EquipmentRulesAuthoritySnapshotV1 | null };

type UnitHandlerAdapter = (definitionId: string) => UnitClassDefinition;

const unitHandlerAdapters = new Map<string, UnitHandlerAdapter>([
  ["foundation-compiled-unit-class", getUnitClass],
]);

export type UnitExecutionAdapterResult =
  | {
    ok: true;
    code: "EXECUTABLE";
    legacyDefinition: UnitClassDefinition;
    allowedActionTypes: string[];
    allowedOrderTypes: string[];
  }
  | { ok: false; code: string; message: string };

function modeForEnvironment(environment: string | undefined): CatalogueRuntimeModeV1 {
  return environment === "production" ? "PRODUCTION" : "DEVELOPMENT";
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function requiredSourcedNumber(
  sourcedNumbers: Readonly<Record<string, Readonly<RuleNullableNumberV1>>>,
  key: string,
  definitionId: string,
): RuleNullableNumberV1 {
  const sourced = sourcedNumbers[key];
  if (!sourced) throw new Error(`RULES_CATALOGUE_SOURCE_VALUE_MISSING:${definitionId}:${key}`);
  return { status: sourced.status, value: sourced.value };
}

function generatedUnitActionLinks(definitionId: string): string[] {
  const actionIds: string[] = [];
  for (const relation of serverRulesCatalogueRuntime.relationsFrom({ definitionKind: "UNIT", definitionId })) {
    if (relation.kind !== "UNIT_ABILITY" || relation.to?.definitionKind !== "ABILITY") continue;
    const ability = serverRulesCatalogueRuntime.lookupDefinition("ABILITY", relation.to.definitionId);
    if (!ability.found) continue;
    for (const reference of ability.value.references) {
      if (reference.definitionKind === "ACTION") actionIds.push(reference.definitionId);
    }
  }
  return sortedUnique(actionIds);
}

interface GeneratedUnitProfileBindings {
  movementProfileId: string | null;
  durabilityProfileId: string | null;
  cargoProfileId: string | null;
  supplyProfileId: string | null;
  deploymentProfileId: string | null;
}

function generatedUnitProfileBindings(definitionId: string): GeneratedUnitProfileBindings {
  const bindings: GeneratedUnitProfileBindings = {
    movementProfileId: null,
    durabilityProfileId: null,
    cargoProfileId: null,
    supplyProfileId: null,
    deploymentProfileId: null,
  };
  const keys = {
    MOVEMENT_PROFILE: "movementProfileId",
    DURABILITY_PROFILE: "durabilityProfileId",
    CARGO_PROFILE: "cargoProfileId",
    SUPPLY_PROFILE: "supplyProfileId",
    DEPLOYMENT_PROFILE: "deploymentProfileId",
  } as const;
  for (const relation of serverRulesCatalogueRuntime.relationsFrom({ definitionKind: "UNIT", definitionId })) {
    if (relation.kind !== "UNIT_PROFILE" || !relation.to) continue;
    const key = keys[relation.to.definitionKind as keyof typeof keys];
    if (!key) continue;
    if (bindings[key] !== null) {
      throw new Error(`RULES_CATALOGUE_PROFILE_BINDING_DUPLICATE:${definitionId}:${key}`);
    }
    bindings[key] = relation.to.definitionId;
  }
  return bindings;
}

function governedCargoProfile(profileId: string | null): GovernedCargoProfileV1 | null {
  if (!profileId) return null;
  const definition = serverRulesCatalogueRuntime.lookupDefinition("CARGO_PROFILE", profileId);
  if (!definition.found) throw new Error(`RULES_CATALOGUE_CARGO_PROFILE_MISSING:${profileId}`);
  const hydrated = hydrateGovernedCargoProfile({ id: definition.value.id, parameters: definition.value.parameters });
  if (!hydrated.ok) {
    const issue = hydrated.issues[0];
    throw new Error(`RULES_CATALOGUE_CARGO_PROFILE_INVALID:${profileId}:${issue?.code ?? "UNKNOWN"}:${issue?.path ?? "$"}`);
  }
  return hydrated.profile;
}

function governedSupplyProfile(profileId: string | null): GovernedSupplyProfileV1 | null {
  if (!profileId) return null;
  const definition = serverRulesCatalogueRuntime.lookupDefinition("SUPPLY_PROFILE", profileId);
  if (!definition.found) throw new Error(`RULES_CATALOGUE_SUPPLY_PROFILE_MISSING:${profileId}`);
  const hydrated = hydrateGovernedSupplyProfile({ id: definition.value.id, parameters: definition.value.parameters });
  if (!hydrated.ok) {
    const issue = hydrated.issues[0];
    throw new Error(`RULES_CATALOGUE_SUPPLY_PROFILE_INVALID:${profileId}:${issue?.code ?? "UNKNOWN"}:${issue?.path ?? "$"}`);
  }
  return hydrated.profile;
}

function profileBindingMismatch(
  input: D1UnitRulesInput,
  generated: GeneratedUnitProfileBindings,
): string | null {
  for (const key of [
    "movementProfileId",
    "durabilityProfileId",
    "cargoProfileId",
    "supplyProfileId",
    "deploymentProfileId",
  ] as const) {
    if (input[key] !== generated[key]) return key;
  }
  return null;
}

function executableLegacyActions(
  definition: UnitClassDefinition,
  mode: CatalogueRuntimeModeV1,
): Array<{ type: UnitClassDefinition["allowedActions"][number]; id: string }> {
  return definition.allowedActions.flatMap((type) => {
    try {
      const id = getActionDefinition(type as Parameters<typeof getActionDefinition>[0]).id;
      const decision = serverRulesCatalogueRuntime.decide("ACTION", id, mode);
      return decision.availability.allowed && decision.executability.allowed ? [{ type, id }] : [];
    } catch {
      return [];
    }
  });
}

function executableLegacyOrders(
  definition: UnitClassDefinition,
  mode: CatalogueRuntimeModeV1,
): Array<{ type: UnitClassDefinition["allowedOrders"][number]; id: string }> {
  return definition.allowedOrders.flatMap((type) => {
    try {
      const id = getOrderTypeDefinition(type as Parameters<typeof getOrderTypeDefinition>[0]).id;
      const decision = serverRulesCatalogueRuntime.decide("ORDER", id, mode);
      return decision.availability.allowed && decision.executability.allowed ? [{ type, id }] : [];
    } catch {
      return [];
    }
  });
}

export function resolveUnitExecutionAdapter(
  rulesetId: string,
  definitionId: string,
  environment: string | undefined,
): UnitExecutionAdapterResult {
  if (rulesetId !== LEGACY_RULESET_ID) {
    return { ok: false, code: "RULESET_ADAPTER_UNSUPPORTED", message: `Ruleset ${rulesetId} has no server hydration adapter.` };
  }
  const mode = modeForEnvironment(environment);
  const decision = serverRulesCatalogueRuntime.decide("UNIT", definitionId, mode);
  if (!decision.overlay) {
    return { ok: false, code: decision.executability.code, message: `Unit ${definitionId} is absent from the governed generated catalogue.` };
  }
  const handlerId = decision.overlay.handlerId;
  const code = decision.overlay.implementationStatus === "CATALOGUE_ONLY"
    ? "CATALOGUE_ONLY"
    : !decision.overlay.executable
      ? "NOT_EXECUTABLE"
      : !handlerId
        ? "HANDLER_NOT_DECLARED"
        : !unitHandlerAdapters.has(handlerId)
          ? "HANDLER_ADAPTER_MISSING"
          : "EXECUTABLE";
  if (code !== "EXECUTABLE" || !handlerId) {
    return { ok: false, code, message: `Unit ${definitionId} is ${code.toLowerCase().replaceAll("_", " ")}.` };
  }
  try {
    const legacyDefinition = unitHandlerAdapters.get(handlerId)!(definitionId);
    const profileBindings = generatedUnitProfileBindings(definitionId);
    const governedCargo = governedCargoProfile(profileBindings.cargoProfileId);
    const executableActions = executableLegacyActions(legacyDefinition, mode)
      .filter(({ type }) => governedCargo === null || (type !== "LOAD" && type !== "UNLOAD"));
    return {
      ok: true,
      code,
      legacyDefinition,
      allowedActionTypes: sortedUnique(executableActions.map(({ type }) => type)),
      allowedOrderTypes: sortedUnique(executableLegacyOrders(legacyDefinition, mode).map(({ type }) => type)),
    };
  } catch {
    return {
      ok: false,
      code: "HANDLER_ADAPTER_REJECTED",
      message: `Unit ${definitionId} is not supported by handler ${handlerId}.`,
    };
  }
}

function statusSnapshot(
  definitionStatus: RuleDefinitionStatusV1,
  overlay: NonNullable<ReturnType<RulesCatalogueRuntimeV1["decide"]>["overlay"]>,
): RulesAuthorityStatusSnapshotV1 {
  return {
    definitionStatus,
    implementationStatus: overlay.implementationStatus,
    requisitionStatus: overlay.requisitionStatus,
    availabilityStatus: overlay.availabilityStatus,
    executable: overlay.executable,
    purchasable: overlay.purchasable,
    handlerId: overlay.handlerId,
    reasonCode: overlay.reasonCode,
  };
}

export function resolveUnitRulesAuthority(
  input: D1UnitRulesInput,
  environment: string | undefined,
): UnitRulesHydrationResult {
  if (input.rulesetId !== LEGACY_RULESET_ID) {
    return {
      ok: false,
      code: "RULESET_ADAPTER_UNSUPPORTED",
      message: `Ruleset ${input.rulesetId} has no server hydration adapter.`,
      authority: null,
    };
  }
  const mode = modeForEnvironment(environment);
  const definition = serverRulesCatalogueRuntime.lookupDefinition("UNIT", input.definitionId);
  const decision = serverRulesCatalogueRuntime.decide("UNIT", input.definitionId, mode);
  if (!definition.found || !decision.overlay) {
    return {
      ok: false,
      code: decision.executability.code,
      message: `Unit ${input.definitionId} is absent from the governed generated catalogue.`,
      authority: null,
    };
  }

  const generatedProfiles = generatedUnitProfileBindings(input.definitionId);
  const mismatchedProfile = profileBindingMismatch(input, generatedProfiles);
  if (mismatchedProfile) {
    return {
      ok: false,
      code: "PROFILE_BINDING_MISMATCH",
      message: `Unit ${input.definitionId} has a D1/generated ${mismatchedProfile} mismatch.`,
      authority: null,
    };
  }
  const cargoProfile = governedCargoProfile(generatedProfiles.cargoProfileId);
  const supplyProfile = governedSupplyProfile(generatedProfiles.supplyProfileId);

  const execution = resolveUnitExecutionAdapter(input.rulesetId, input.definitionId, environment);
  const executionCode = execution.code;
  const executionAllowed = execution.ok;
  const legacyDefinition = execution.ok ? execution.legacyDefinition : undefined;

  const legacyActions = legacyDefinition ? executableLegacyActions(legacyDefinition, mode) : [];
  const linkedActionIds = sortedUnique([
    ...input.actionDefinitionIds,
    ...generatedUnitActionLinks(input.definitionId),
    ...legacyActions.map(({ id }) => id),
  ]);
  const linkedOrderIds = legacyDefinition
    ? sortedUnique(legacyDefinition.allowedOrders.flatMap((type) => {
      try { return [getOrderTypeDefinition(type as Parameters<typeof getOrderTypeDefinition>[0]).id]; }
      catch { return []; }
    }))
    : [];
  const authority: UnitRulesAuthoritySnapshotV1 = {
    schemaVersion: RULES_AUTHORITY_SNAPSHOT_VERSION,
    kind: "UNIT",
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    definitionId: input.definitionId,
    sourcedNumbers: {
      sensorRange: requiredSourcedNumber(definition.value.sourcedNumbers, "sensorRange", input.definitionId),
      requisitionCost: requiredSourcedNumber(definition.value.sourcedNumbers, "requisitionCost", input.definitionId),
    },
    status: statusSnapshot(definition.value.definitionStatus, decision.overlay),
    decision: {
      availabilityCode: decision.availability.code,
      executabilityCode: executionCode,
      available: decision.availability.allowed,
      executable: executionAllowed,
    },
    links: {
      actionDefinitionIds: linkedActionIds,
      orderDefinitionIds: linkedOrderIds,
      allowedActionTypes: execution.ok ? execution.allowedActionTypes : [],
      allowedOrderTypes: execution.ok ? execution.allowedOrderTypes : [],
    },
    profiles: {
      movementProfileId: input.movementProfileId,
      durabilityProfileId: input.durabilityProfileId,
      cargoProfile,
      supplyProfile,
      deploymentProfileId: input.deploymentProfileId,
    },
    legacyD1: {
      ...input,
      actionDefinitionIds: [...input.actionDefinitionIds],
      allowedActionTypes: [...input.allowedActionTypes],
      allowedOrderTypes: [...input.allowedOrderTypes],
    },
  };

  if (!executionAllowed || !legacyDefinition) {
    return {
      ok: false,
      code: executionCode,
      message: execution.ok ? `Unit ${input.definitionId} has no legacy definition.` : execution.message,
      authority,
    };
  }
  return { ok: true, authority, legacyDefinition };
}

export function resolveEquipmentRulesAuthority(
  input: D1EquipmentRulesInput,
  environment: string | undefined,
): EquipmentRulesHydrationResult {
  if (input.rulesetId !== LEGACY_RULESET_ID) {
    return {
      ok: false,
      code: "RULESET_ADAPTER_UNSUPPORTED",
      message: `Ruleset ${input.rulesetId} has no server hydration adapter.`,
      authority: null,
    };
  }
  const definition = serverRulesCatalogueRuntime.lookupDefinition("EQUIPMENT", input.definitionId);
  const decision = serverRulesCatalogueRuntime.decide("EQUIPMENT", input.definitionId, modeForEnvironment(environment));
  if (!definition.found || !decision.overlay) {
    return {
      ok: false,
      code: decision.executability.code,
      message: `Equipment ${input.definitionId} is absent from the governed generated catalogue.`,
      authority: null,
    };
  }
  const authority: EquipmentRulesAuthoritySnapshotV1 = {
    schemaVersion: RULES_AUTHORITY_SNAPSHOT_VERSION,
    kind: "EQUIPMENT",
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    definitionId: input.definitionId,
    sourcedNumbers: {
      requisitionCost: requiredSourcedNumber(definition.value.sourcedNumbers, "requisitionCost", input.definitionId),
    },
    status: statusSnapshot(definition.value.definitionStatus, decision.overlay),
    decision: {
      availabilityCode: decision.availability.code,
      executabilityCode: decision.executability.code,
      available: decision.availability.allowed,
      executable: decision.executability.allowed,
    },
    legacyD1: { ...input },
  };
  if (!decision.availability.allowed || !decision.executability.allowed) {
    return {
      ok: false,
      code: decision.executability.code,
      message: `Equipment ${input.definitionId} is ${decision.executability.code.toLowerCase().replaceAll("_", " ")}.`,
      authority,
    };
  }
  return { ok: true, authority };
}

export function rehydratePinnedUnitRulesAuthority(
  value: unknown,
  definitionId: string,
  environment: string | undefined,
): UnitRulesHydrationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "RULES_AUTHORITY_MISSING", message: "Deployment has no pinned rules authority.", authority: null };
  }
  const authority = value as Partial<UnitRulesAuthoritySnapshotV1>;
  if (
    authority.schemaVersion !== RULES_AUTHORITY_SNAPSHOT_VERSION ||
    authority.kind !== "UNIT" ||
    authority.catalogueContentHash !== V5_CORE_CURATED_2_CONTENT_HASH ||
    authority.catalogueRulesetVersion !== V5_CORE_CURATED_2_RULESET_VERSION ||
    authority.definitionId !== definitionId ||
    !authority.legacyD1
  ) {
    return { ok: false, code: "RULES_AUTHORITY_INVALID", message: "Deployment rules authority is stale or malformed.", authority: null };
  }
  return resolveUnitRulesAuthority(authority.legacyD1, environment);
}

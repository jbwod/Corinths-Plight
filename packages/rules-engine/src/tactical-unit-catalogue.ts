import type {
  ActionType,
  DefinitionStatus,
  OrderType,
  SubsystemDamageProfile,
  SubsystemDefinition,
  UnitClassDefinition,
  WeaponProfile,
  CargoProfile,
} from "../../domain/src";
import type { RuleDefinitionRecordV1, RuleNullableNumberV1 } from "../../domain/src/rules-catalogue-contract";
import { V5_CORE_CURATED_2_RULESET_VERSION } from "./generated/v5-core-curated-2";
import { getTacticalActionRule, getTacticalOrderRule, tacticalRulesCatalogueRuntime } from "./tactical-grammar";
import { hydrateGovernedCargoProfile, projectGovernedCargoProfile } from "./cargo-hydration";

interface FoundationExecutionProjection {
  capacity: number;
  tags: string[];
  allowedOrders: OrderType[];
  allowedActions: ActionType[];
}

const classesWithRejectedCompanionSlots = new Set([
  "unit-infantry-fighting-vehicle",
  "unit-light-mech",
  "unit-light-vehicle",
  "unit-main-battle-tank",
]);

export interface TacticalSubsystemRules {
  profile: SubsystemDamageProfile;
  definitions: SubsystemDefinition[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${path}`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${path}`);
  }
  return [...value];
}

function publishedNumber(
  numbers: Readonly<Record<string, Readonly<RuleNullableNumberV1>>>,
  key: string,
  id: string,
): number {
  const value = numbers[key];
  if (!value || value.status !== "PUBLISHED" || value.value === null || !Number.isFinite(value.value)) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_NUMBER_UNAVAILABLE:${id}:${key}`);
  }
  return value.value;
}

function optionalPublishedNumber(value: Readonly<RuleNullableNumberV1> | undefined): number | undefined {
  return value?.status === "PUBLISHED" && value.value !== null ? value.value : undefined;
}

function executionProjection(definition: RuleDefinitionRecordV1): FoundationExecutionProjection {
  const parameters = record(definition.parameters, `${definition.id}:parameters`);
  const execution = record(parameters.execution, `${definition.id}:execution`);
  const capacity = execution.capacity;
  if (!Number.isInteger(capacity) || (capacity as number) < 1) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${definition.id}:execution.capacity`);
  }
  return {
    capacity: capacity as number,
    tags: stringArray(execution.tags, `${definition.id}:execution.tags`),
    allowedOrders: stringArray(execution.allowedOrders, `${definition.id}:execution.allowedOrders`) as OrderType[],
    allowedActions: stringArray(execution.allowedActions, `${definition.id}:execution.allowedActions`) as ActionType[],
  };
}

function weaponProfile(id: string): WeaponProfile {
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("WEAPON", id);
  if (!lookup.found) throw new Error(`TACTICAL_UNIT_WEAPON_MISSING:${id}`);
  const definition = lookup.value;
  const parameters = record(definition.parameters, `${id}:parameters`);
  const details = record(parameters.definition, `${id}:definition`);
  return {
    id,
    name: definition.name,
    damage: {
      count: publishedNumber(definition.sourcedNumbers, "damageDiceCount", id),
      sides: publishedNumber(definition.sourcedNumbers, "damageDieSides", id),
      modifier: publishedNumber(definition.sourcedNumbers, "damageModifier", id),
    },
    range: publishedNumber(definition.sourcedNumbers, "rangeHexes", id),
    armorPiercing: publishedNumber(definition.sourcedNumbers, "armorPiercing", id),
    indirect: parameters.indirect === true,
    ammoCapacity: optionalPublishedNumber(definition.sourcedNumbers.ammoCapacity),
    cooldownRounds: optionalPublishedNumber(definition.sourcedNumbers.cooldownRounds),
    tags: stringArray(details.tags ?? [], `${id}:definition.tags`),
  };
}

function sourceLabel(definition: RuleDefinitionRecordV1): string {
  return [definition.sourcePath ?? definition.sourceId, definition.sourceLocator]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" — ");
}

export function getTacticalUnitClass(
  id: string,
  options: { scenarioSensorRange?: number } = {},
): UnitClassDefinition {
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition("UNIT", id);
  if (!lookup.found) throw new Error(`Unknown unit class: ${id}`);
  const definition = lookup.value as RuleDefinitionRecordV1;
  const decision = tacticalRulesCatalogueRuntime.decide("UNIT", id, "PRODUCTION");
  if (
    decision.overlay?.implementationStatus === "CATALOGUE_ONLY" ||
    decision.overlay?.executable !== true ||
    decision.overlay.handlerId !== "foundation-generated-unit-class"
  ) {
    throw new Error(`Unit class is not executable: ${id}`);
  }
  const parameters = record(definition.parameters, `${id}:parameters`);
  const execution = executionProjection(definition);
  const healthModel = parameters.healthModel;
  if (healthModel !== "FORCE_STRENGTH" && healthModel !== "HITS") {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${id}:healthModel`);
  }
  const category = parameters.category;
  if (!["INFANTRY", "ARMOUR", "ARTILLERY", "ENGINEER", "AEROSPACE", "MECH", "SUPPORT", "ENEMY"].includes(String(category))) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${id}:category`);
  }
  const legacySensor = parameters.legacyProjectionSensorRange;
  const sensors = options.scenarioSensorRange ?? legacySensor;
  if (!Number.isInteger(sensors) || (sensors as number) < 0) {
    throw new Error(`TACTICAL_UNIT_CATALOGUE_SENSOR_REQUIRED:${id}`);
  }
  const weaponIds = tacticalRulesCatalogueRuntime
    .relationsFrom({ definitionKind: "UNIT", definitionId: id })
    .filter((relation) => relation.kind === "UNIT_WEAPON" && relation.to?.definitionKind === "WEAPON")
    .sort((left, right) => (left.ordinal ?? 0) - (right.ordinal ?? 0))
    .map((relation) => relation.to!.definitionId);
  const slots = Object.fromEntries(tacticalRulesCatalogueRuntime
    .relationsFrom({ definitionKind: "UNIT", definitionId: id })
    .filter((relation) => {
      if (relation.kind !== "UNIT_EQUIPMENT_SLOT") return false;
      const eligibility = record(relation.parameters, `${relation.id}:parameters`).eligibility;
      if (eligibility === undefined || !classesWithRejectedCompanionSlots.has(id)) return true;
      return record(eligibility, `${relation.id}:eligibility`).canonicalActivation !== "CATALOGUED";
    })
    .map((relation) => {
      const slotType = record(relation.parameters, `${relation.id}:parameters`).slotType;
      if (typeof slotType !== "string") throw new Error(`TACTICAL_UNIT_CATALOGUE_INVALID:${relation.id}:slotType`);
      return [slotType.toLowerCase(), publishedNumber(relation.sourcedNumbers, "slotCount", relation.id)];
    }));
  const allowedOrders = execution.allowedOrders.filter((type) => getTacticalOrderRule(type).executable);
  const allowedActions = execution.allowedActions.filter((type) => getTacticalActionRule(type).executable);
  return {
    id,
    kind: "unit-class",
    name: definition.name,
    description: definition.notes || definition.name,
    category: category as UnitClassDefinition["category"],
    tags: [...execution.tags],
    stats: {
      healthModel,
      maxHealth: publishedNumber(definition.sourcedNumbers, "maxHealth", id),
      armor: publishedNumber(definition.sourcedNumbers, "armor", id),
      defense: publishedNumber(definition.sourcedNumbers, "defense", id),
      speed: publishedNumber(definition.sourcedNumbers, "speedQuarters", id) / 4,
      sensors: sensors as number,
      capacity: execution.capacity,
    },
    weapons: weaponIds.map(weaponProfile),
    requisitionCost: optionalPublishedNumber(definition.sourcedNumbers.requisitionCost) ?? null,
    slots,
    allowedOrders,
    allowedActions,
    rulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    source: sourceLabel(definition),
    status: definition.definitionStatus as DefinitionStatus,
    notes: definition.notes,
  };
}

export function getTacticalCargoProfile(unitId: string): CargoProfile | undefined {
  const relation = tacticalRulesCatalogueRuntime
    .relationsFrom({ definitionKind: "UNIT", definitionId: unitId })
    .find((candidate) =>
      candidate.kind === "UNIT_PROFILE" &&
      candidate.to?.definitionKind === "CARGO_PROFILE" &&
      record(candidate.parameters, `${candidate.id}:parameters`).profileRole === "cargo"
    );
  if (!relation?.to) return undefined;
  const definition = tacticalRulesCatalogueRuntime.lookupDefinition("CARGO_PROFILE", relation.to.definitionId);
  if (!definition.found) throw new Error(`TACTICAL_CARGO_PROFILE_MISSING:${relation.to.definitionId}`);
  const hydrated = hydrateGovernedCargoProfile({ id: definition.value.id, parameters: definition.value.parameters });
  if (!hydrated.ok) throw new Error(`TACTICAL_CARGO_PROFILE_INVALID:${definition.value.id}:${hydrated.issues[0]?.code ?? "UNKNOWN"}`);
  return projectGovernedCargoProfile(hydrated.profile);
}

export function getTacticalSubsystemRules(unitId: string): TacticalSubsystemRules | undefined {
  const durabilityRelation = tacticalRulesCatalogueRuntime
    .relationsFrom({ definitionKind: "UNIT", definitionId: unitId })
    .find((relation) => {
      if (relation.kind !== "UNIT_PROFILE" || relation.to?.definitionKind !== "DURABILITY_PROFILE") return false;
      return record(relation.parameters, `${relation.id}:parameters`).profileRole === "durability";
    });
  if (!durabilityRelation?.to) return undefined;
  const lookup = tacticalRulesCatalogueRuntime.lookupDefinition(
    "DURABILITY_PROFILE",
    durabilityRelation.to.definitionId,
  );
  if (!lookup.found) throw new Error(`TACTICAL_DURABILITY_PROFILE_MISSING:${unitId}`);
  const parameters = record(lookup.value.parameters, `${lookup.value.id}:parameters`);
  if (parameters.supportsSubsystems !== true) return undefined;
  const definition = record(parameters.definition, `${lookup.value.id}:parameters.definition`);
  const naturalRolls = record(
    definition.subsystemNaturalRolls,
    `${lookup.value.id}:parameters.definition.subsystemNaturalRolls`,
  );
  const configured = Object.entries(naturalRolls)
    .map(([naturalRoll, target]) => ({ naturalRoll: Number(naturalRoll), target }))
    .sort((left, right) => left.naturalRoll - right.naturalRoll);
  if (
    configured.length === 0 ||
    configured.some(({ naturalRoll, target }) =>
      !Number.isInteger(naturalRoll) || naturalRoll < 2 || (target !== "WEAPONS" && target !== "MOBILITY")
    )
  ) {
    throw new Error(`TACTICAL_SUBSYSTEM_PROFILE_INVALID:${lookup.value.id}`);
  }
  const definitions = [...new Set(configured.map(({ target }) => target as "WEAPONS" | "MOBILITY"))]
    .map((target): SubsystemDefinition => ({
      id: target,
      name: target === "WEAPONS" ? "Weapon systems" : "Mobility",
      kind: target === "WEAPONS" ? "WEAPON" : "MOBILITY",
      tags: [],
    }));
  return {
    profile: {
      id: lookup.value.id,
      requiresPenetration: true,
      triggers: configured.map(({ naturalRoll, target }) => ({
        naturalRolls: [naturalRoll],
        targetKind: target === "WEAPONS" ? "WEAPON" : "MOBILITY",
        resultingState: "DISABLED",
        selection: "ALL",
        requiresAttackerHealthAtLeastRoll: true,
      })),
    },
    definitions,
  };
}

import type {
  ActionType,
  CargoProfile,
  DeploymentValidationIssue,
  EffectiveUnit,
  EffectiveUnitBuildInput,
  EffectiveUnitBuildResult,
  EquipmentEffect,
  OrderType,
  UnitStats,
  WeaponProfile,
} from "../../domain/src";
import { hashSeed } from "./rng";

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function canonicalJson(value: unknown): string {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, child]) => child !== undefined)
          .sort(([left], [right]) => compareCodePoints(left, right))
          .map(([key, child]) => [key, visit(child)]),
      );
    }
    if (typeof item === "number" && !Number.isFinite(item)) throw new TypeError("Effective unit values must be finite.");
    return item;
  };
  return JSON.stringify(visit(value));
}

function issue(code: string, message: string, entityId?: string): DeploymentValidationIssue {
  return { code, severity: "ERROR", entityId, message };
}

function applyEffect(
  effect: EquipmentEffect,
  state: {
    stats: UnitStats;
    tags: Set<string>;
    weapons: Map<string, WeaponProfile>;
    actions: Set<ActionType>;
    orders: Set<OrderType>;
    abilities: Map<string, EffectiveUnit["abilities"][number]>;
    deploymentMethods: Set<EffectiveUnit["deploymentMethods"][number]>;
    cargoProfile?: CargoProfile;
    ammoCapacities: Map<string, number>;
  },
): void {
  switch (effect.type) {
    case "STAT_ADD":
      state.stats[effect.stat] += effect.amount;
      return;
    case "STAT_SET_IF":
      if (state.stats[effect.stat] === effect.whenEquals) state.stats[effect.stat] = effect.value;
      return;
    case "TAG_GRANT": state.tags.add(effect.tag); return;
    case "TAG_REMOVE": state.tags.delete(effect.tag); return;
    case "WEAPON_GRANT": state.weapons.set(effect.weapon.id, structuredClone(effect.weapon)); return;
    case "WEAPON_MODIFIER":
      for (const [id, weapon] of state.weapons) {
        if (effect.weaponId && id !== effect.weaponId) continue;
        if (effect.tag && !weapon.tags.includes(effect.tag)) continue;
        state.weapons.set(id, {
          ...weapon,
          armorPiercing: weapon.armorPiercing + (effect.armorPiercing ?? 0),
          range: weapon.range + (effect.range ?? 0),
          damage: { ...weapon.damage, modifier: (weapon.damage.modifier ?? 0) + (effect.damageModifier ?? 0) },
        });
      }
      return;
    case "ACTION_GRANT": state.actions.add(effect.action); return;
    case "ORDER_GRANT": state.orders.add(effect.order); return;
    case "ABILITY_GRANT": state.abilities.set(effect.ability.abilityId, structuredClone(effect.ability)); return;
    case "CARGO_CAPACITY_ADD":
      if (state.cargoProfile) {
        state.cargoProfile = {
          ...state.cargoProfile,
          capacitySlotsQuarters: state.cargoProfile.capacitySlotsQuarters + effect.slotsQuarters,
        };
      }
      return;
    case "DEPLOYMENT_GRANT": state.deploymentMethods.add(effect.method); return;
    case "AMMO_GRANT": state.ammoCapacities.set(effect.weaponId, effect.capacity); return;
    case "COOLDOWN_GRANT": {
      const weapon = state.weapons.get(effect.abilityOrWeaponId);
      if (weapon) state.weapons.set(weapon.id, { ...weapon, cooldownRounds: effect.rounds });
      return;
    }
  }
}

export function buildEffectiveUnit(input: EffectiveUnitBuildInput): EffectiveUnitBuildResult {
  const errors: DeploymentValidationIssue[] = [];
  const warnings: DeploymentValidationIssue[] = [];
  if (input.rulesetVersion !== input.unitDefinition.rulesetVersion) {
    errors.push(issue("RULESET_MISMATCH", "Unit definition does not belong to the pinned ruleset."));
  }
  if (input.playerUnit && input.playerUnit.definitionId !== input.unitDefinition.id) {
    errors.push(issue("UNIT_DEFINITION_MISMATCH", "Persistent unit does not match the supplied class definition.", input.playerUnit.id));
  }
  const slots = new Map(Object.entries(input.unitDefinition.slots).map(([slot, count]) => [slot.toUpperCase(), count]));
  const occupied = new Set<string>();
  const equipmentIds = new Set<string>();
  for (const selected of input.equipment) {
    const slotType = selected.slotType.toUpperCase();
    const slotKey = `${slotType}:${selected.slotIndex}`;
    if (selected.state === "DAMAGED" || selected.state === "EXPENDED") {
      errors.push(issue("EQUIPMENT_UNAVAILABLE", `${selected.definition.name} is not operational.`, selected.instanceId));
    }
    if ((slots.get(slotType) ?? 0) <= selected.slotIndex || selected.slotIndex < 0) {
      errors.push(issue("SLOT_UNAVAILABLE", `${selected.definition.name} does not fit ${slotKey}.`, selected.instanceId));
    }
    if (occupied.has(slotKey)) errors.push(issue("SLOT_OCCUPIED", `${slotKey} is assigned more than once.`, selected.instanceId));
    occupied.add(slotKey);
    if (equipmentIds.has(selected.definition.id)) {
      errors.push(issue("EQUIPMENT_DUPLICATE", `${selected.definition.name} is selected more than once.`, selected.instanceId));
    }
    equipmentIds.add(selected.definition.id);
    if (selected.definition.allowedClasses.length > 0 && !selected.definition.allowedClasses.includes(input.unitDefinition.id)) {
      errors.push(issue("EQUIPMENT_INELIGIBLE", `${selected.definition.name} is unavailable to this class.`, selected.instanceId));
    }
    for (const required of selected.definition.requiredEquipment) {
      if (!input.equipment.some((candidate) => candidate.definition.id === required)) {
        errors.push(issue("EQUIPMENT_PREREQUISITE_MISSING", `${selected.definition.name} requires ${required}.`, selected.instanceId));
      }
    }
    for (const incompatible of selected.definition.incompatibleEquipment) {
      if (input.equipment.some((candidate) => candidate.definition.id === incompatible)) {
        errors.push(issue("EQUIPMENT_INCOMPATIBLE", `${selected.definition.name} conflicts with ${incompatible}.`, selected.instanceId));
      }
    }
  }

  const state = {
    stats: structuredClone(input.unitDefinition.stats),
    tags: new Set(input.unitDefinition.tags),
    weapons: new Map(input.unitDefinition.weapons.map((weapon) => [weapon.id, structuredClone(weapon)])),
    actions: new Set(input.unitDefinition.allowedActions as ActionType[]),
    orders: new Set(input.unitDefinition.allowedOrders as OrderType[]),
    abilities: new Map(input.unitDefinition.abilities.map((ability) => [ability.abilityId, structuredClone(ability)])),
    deploymentMethods: new Set<EffectiveUnit["deploymentMethods"][number]>(["STANDARD_GROUND"]),
    cargoProfile: input.unitDefinition.cargoProfile ? structuredClone(input.unitDefinition.cargoProfile) : undefined,
    ammoCapacities: new Map<string, number>(),
  };
  const refits = [...input.refits].sort((left, right) => compareCodePoints(left.instanceId, right.instanceId));
  for (const refit of refits) {
    if (refit.definition.implementationStatus === "CATALOGUE_ONLY") {
      errors.push(issue("REFIT_NOT_EXECUTABLE", `${refit.definition.name} is catalogue-only.`, refit.instanceId));
      continue;
    }
    if (refit.definition.allowedUnitDefinitionIds.length > 0 && !refit.definition.allowedUnitDefinitionIds.includes(input.unitDefinition.id)) {
      errors.push(issue("REFIT_INELIGIBLE", `${refit.definition.name} is unavailable to this class.`, refit.instanceId));
      continue;
    }
    refit.definition.effects.forEach((effect) => applyEffect(effect, state));
  }
  for (const selected of [...input.equipment].sort((left, right) => compareCodePoints(left.instanceId, right.instanceId))) {
    if (selected.definition.status !== "active") {
      errors.push(issue("EQUIPMENT_NOT_EXECUTABLE", `${selected.definition.name} is not active in the pinned ruleset.`, selected.instanceId));
      continue;
    }
    selected.effects.forEach((effect) => applyEffect(effect, state));
  }
  for (const [stat, value] of Object.entries(state.stats).filter(([, candidate]) => typeof candidate === "number")) {
    if (!Number.isFinite(value) || value < 0) errors.push(issue("EFFECTIVE_STAT_INVALID", `${stat} resolved to an invalid value.`));
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const ammunition: Record<string, number> = {};
  for (const weapon of state.weapons.values()) {
    const capacity = state.ammoCapacities.get(weapon.id) ?? weapon.ammoCapacity;
    if (capacity !== undefined) {
      weapon.ammoCapacity = capacity;
      ammunition[weapon.id] = Math.min(capacity, input.ammunition?.[weapon.id] ?? capacity);
    }
  }
  const source = {
    rulesetVersion: input.rulesetVersion,
    definitionId: input.unitDefinition.id,
    persistentUnitId: input.playerUnit?.id,
    stats: state.stats,
    tags: [...state.tags].sort(compareCodePoints),
    weapons: [...state.weapons.values()].sort((left, right) => compareCodePoints(left.id, right.id)),
    allowedActions: [...state.actions].sort(compareCodePoints),
    allowedOrders: [...state.orders].sort(compareCodePoints),
    abilities: [...state.abilities.values()].sort((left, right) => compareCodePoints(left.abilityId, right.abilityId)),
    deploymentMethods: [...state.deploymentMethods].sort(compareCodePoints),
    cargoProfile: state.cargoProfile,
    equipmentInstanceIds: input.equipment.map((item) => item.instanceId).sort(compareCodePoints),
    refitInstanceIds: refits.map((item) => item.instanceId),
    ammunition,
    cooldowns: Object.fromEntries(Object.entries(input.cooldowns ?? {}).sort(([left], [right]) => compareCodePoints(left, right))),
    subsystems: input.playerUnit?.subsystems?.map((subsystem) => ({ ...subsystem }))
      .sort((left, right) => compareCodePoints(left.subsystemId, right.subsystemId)),
  };
  const sourceHash = hashSeed(canonicalJson(source)).toString(16).padStart(8, "0");
  return { valid: true, errors, warnings, unit: { ...source, sourceHash } };
}

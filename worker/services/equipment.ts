import type {
  AbilityRef,
  EffectiveUnitBuildResult,
  EquipmentDefinition,
  EquipmentEffect,
  MovementDomain,
  SelectedEquipment,
  UnitDefinition,
  WeaponProfile,
} from "../../packages/domain/src";
import { RULESET_VERSION } from "../../packages/domain/src";
import { buildEffectiveUnit, normalizeTacticalSupplyInventory } from "../../packages/rules-engine/src";
import type { Env } from "../env";
import type { LoadoutChangeCommand, PurchaseEquipmentCommand } from "../equipment-validation";
import { commandHash } from "../forces-validation";
import {
  getLoadoutContext,
  getUnitSupplies,
  hasLoadoutFacility,
  listInventoryEffects,
  listLoadoutItems,
  listRulesetWeapons,
  listUnitAbilities,
  listUnitSlots,
  listUnitTags,
  listUnitWeapons,
  type InventoryEffectRow,
  type LoadoutContextRow,
  type UnitWeaponRow,
} from "../repositories/equipment";
import { getMutationReceipt, getRequisitionBalance } from "../repositories/forces";
import { ForceServiceError } from "./forces";
import {
  resolveEquipmentRulesAuthority,
  resolveUnitRulesAuthority,
  type D1EquipmentRulesInput,
  type EquipmentRulesAuthoritySnapshotV1,
  type UnitRulesAuthoritySnapshotV1,
} from "./rules-hydration";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function semantic(value: string): string {
  return value.replace(/^tag-/, "").replaceAll("-", "_").toUpperCase();
}

function weapon(row: UnitWeaponRow): WeaponProfile {
  const definition = parseJson<Record<string, unknown>>(row.definition_json, {});
  return {
    id: row.weapon_id,
    name: row.name,
    damage: { count: row.damage_dice_count, sides: row.damage_die_sides, modifier: row.damage_modifier || undefined },
    range: row.range_hexes,
    armorPiercing: row.armor_piercing,
    ammoCapacity: row.ammo_capacity ?? undefined,
    cooldownRounds: row.cooldown_rounds ?? undefined,
    indirect: row.indirect === 1,
    tags: Array.isArray(definition.tags) ? definition.tags.filter((item): item is string => typeof item === "string") : [],
  };
}

function effectsFor(rowGroup: InventoryEffectRow[], weapons: Map<string, WeaponProfile>): EquipmentEffect[] {
  return rowGroup.flatMap((row): EquipmentEffect[] => {
    const raw = parseJson<Record<string, unknown>>(row.effect_json, {});
    if (!row.effect_type) return [];
    if (row.effect_type === "WEAPON_GRANT" && typeof raw.weaponId === "string") {
      const granted = weapons.get(raw.weaponId);
      return granted ? [{ type: "WEAPON_GRANT", weapon: structuredClone(granted) }] : [];
    }
    if (row.effect_type === "ABILITY_GRANT" && typeof raw.abilityId === "string") {
      return [{ type: "ABILITY_GRANT", ability: { abilityId: raw.abilityId, handlerId: typeof raw.handlerId === "string" ? raw.handlerId : undefined, parameters: typeof raw.parameters === "object" && raw.parameters ? raw.parameters as Record<string, unknown> : undefined } }];
    }
    return [raw as unknown as EquipmentEffect];
  });
}

function equipmentRulesInput(row: InventoryEffectRow, rulesetId: string): D1EquipmentRulesInput {
  return {
    rulesetId,
    definitionId: row.equipment_definition_id,
    definitionStatus: row.definition_status,
    requisitionCost: row.requisition_cost,
    implementationStatus: row.implementation_status,
    requisitionStatus: row.requisition_status,
    availabilityStatus: row.availability_status,
    executable: row.executable === 1,
    purchasable: row.purchasable === 1,
    reasonCode: row.reason_code,
  };
}

function equipmentDefinition(
  rows: InventoryEffectRow[],
  authority: EquipmentRulesAuthoritySnapshotV1,
): EquipmentDefinition {
  const row = rows[0];
  const definition = parseJson<Record<string, unknown>>(row.definition_json, {});
  const allowedFromDefinition = Array.isArray(definition.allowedClasses) ? definition.allowedClasses.filter((item): item is string => typeof item === "string") : [];
  return {
    id: row.equipment_definition_id,
    kind: "equipment",
    name: row.name,
    description: row.name,
    category: row.category,
    slotType: row.canonical_slot_type,
    cost: authority.sourcedNumbers.requisitionCost.value,
    allowedClasses: parseJson<string[]>(row.allowed_unit_definitions_json, allowedFromDefinition),
    requiredEquipment: [],
    incompatibleEquipment: [],
    statModifiers: {},
    abilityGrants: [],
    consumable: row.consumable === 1,
    rulesText: "",
    tags: [],
    rulesetVersion: RULESET_VERSION,
    source: row.definition_source,
    status: row.definition_status as EquipmentDefinition["status"],
    notes: row.definition_notes,
  };
}

export async function buildStoredEffectiveUnit(
  env: Env,
  ownerId: string,
  unitId: string,
  selectedItems?: LoadoutChangeCommand["items"],
): Promise<{
  context: LoadoutContextRow;
  result: EffectiveUnitBuildResult;
  selected: SelectedEquipment[];
  inventoryRows: InventoryEffectRow[];
  baseWeaponIds: string[];
  supplies: Record<string, number>;
  slots: Record<string, number>;
  rulesAuthority: UnitRulesAuthoritySnapshotV1;
  equipmentRulesAuthorities: EquipmentRulesAuthoritySnapshotV1[];
}> {
  const context = await getLoadoutContext(env.DB, ownerId, unitId);
  if (!context) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit or active default loadout was not found.");
  const [inventoryRows, currentItems, slots, tags, abilities, baseWeaponRows, allWeaponRows, storedSupplies] = await Promise.all([
    listInventoryEffects(env.DB, ownerId),
    listLoadoutItems(env.DB, context.loadout_id, unitId),
    listUnitSlots(env.DB, context.definition_id, context.ruleset_id),
    listUnitTags(env.DB, context.definition_id, context.ruleset_id),
    listUnitAbilities(env.DB, context.definition_id, context.ruleset_id),
    listUnitWeapons(env.DB, context.definition_id, context.ruleset_id),
    listRulesetWeapons(env.DB, context.ruleset_id),
    getUnitSupplies(env.DB, unitId),
  ]);
  const supplies = normalizeTacticalSupplyInventory(storedSupplies, `player_units.${unitId}.supplies`);
  const definitionJson = parseJson<Record<string, unknown>>(context.definition_json, {});
  const rulesResolution = resolveUnitRulesAuthority({
    rulesetId: context.ruleset_id,
    definitionId: context.definition_id,
    definitionStatus: context.definition_status,
    sensorRange: context.sensor_range,
    requisitionCost: context.requisition_cost,
    implementationStatus: context.implementation_status,
    requisitionStatus: context.requisition_status,
    availabilityStatus: context.availability_status,
    executable: context.executable === 1,
    purchasable: context.purchasable === 1,
    reasonCode: context.reason_code,
    actionDefinitionIds: abilities.flatMap((ability) => ability.action_definition_id ? [ability.action_definition_id] : []),
    allowedActionTypes: Array.isArray(definitionJson.allowedActions)
      ? definitionJson.allowedActions.filter((item): item is string => typeof item === "string")
      : [],
    allowedOrderTypes: Array.isArray(definitionJson.allowedOrders)
      ? definitionJson.allowedOrders.filter((item): item is string => typeof item === "string")
      : [],
    movementProfileId: context.movement_profile_id,
    durabilityProfileId: context.durability_profile_id,
    cargoProfileId: context.cargo_profile_id,
    supplyProfileId: context.supply_profile_id,
    deploymentProfileId: context.deployment_profile_id,
  }, env.ENVIRONMENT);
  if (!rulesResolution.ok) {
    throw new ForceServiceError(422, "UNIT_DEFINITION_NOT_EXECUTABLE", rulesResolution.message, {
      rulesDecisionCode: rulesResolution.code,
      rulesAuthority: rulesResolution.authority,
    });
  }
  const weaponMap = new Map(allWeaponRows.map((row) => [row.weapon_id, weapon(row)]));
  const grouped = new Map<string, InventoryEffectRow[]>();
  for (const row of inventoryRows) grouped.set(row.inventory_id, [...(grouped.get(row.inventory_id) ?? []), row]);
  const requested = selectedItems ?? currentItems.map((item) => ({ inventoryId: item.inventory_id, slotType: item.slot_type, slotIndex: item.slot_index }));
  const equipmentRulesAuthorities: EquipmentRulesAuthoritySnapshotV1[] = [];
  const selected = requested.flatMap((item): SelectedEquipment[] => {
    const rows = grouped.get(item.inventoryId);
    if (!rows) return [];
    const first = rows[0];
    const equipmentResolution = resolveEquipmentRulesAuthority(
      equipmentRulesInput(first, context.ruleset_id),
      env.ENVIRONMENT,
    );
    if (!equipmentResolution.ok) {
      throw new ForceServiceError(422, "EQUIPMENT_NOT_EXECUTABLE", equipmentResolution.message, {
        rulesDecisionCode: equipmentResolution.code,
        rulesAuthority: equipmentResolution.authority,
      });
    }
    equipmentRulesAuthorities.push(equipmentResolution.authority);
    return [{
      instanceId: first.inventory_id,
      definition: equipmentDefinition(rows, equipmentResolution.authority),
      effects: effectsFor(rows, weaponMap),
      slotType: item.slotType,
      slotIndex: item.slotIndex,
      state: first.inventory_state === "AVAILABLE" ? "AVAILABLE" : "INSTALLED",
    }];
  });
  if (selected.length !== requested.length) throw new ForceServiceError(422, "EQUIPMENT_NOT_OWNED", "One or more selected equipment instances are not owned.");
  const unitTags = new Set(tags.flatMap((tag) => [tag.tag_id, semantic(tag.tag_id)]));
  const selectedCounts = new Map<string, number>();
  for (const item of selected) {
    const rows = grouped.get(item.instanceId)!;
    const row = rows[0];
    if (row.assigned_unit_id && row.assigned_unit_id !== unitId) throw new ForceServiceError(409, "EQUIPMENT_ASSIGNED_ELSEWHERE", `${row.name} is assigned to another unit.`);
    if (row.implementation_status === "CATALOGUE_ONLY" || row.executable !== 1) throw new ForceServiceError(422, "EQUIPMENT_NOT_EXECUTABLE", `${row.name} is not executable in the active ruleset.`);
    const allowedSlots = parseJson<string[]>(row.slot_types_json, [row.canonical_slot_type]).map((slot) => slot.toUpperCase());
    if (!allowedSlots.includes(item.slotType.toUpperCase())) throw new ForceServiceError(422, "EQUIPMENT_SLOT_INVALID", `${row.name} cannot use ${item.slotType}.`);
    const requiredAll = parseJson<string[]>(row.required_tags_all_json, []);
    const requiredAny = parseJson<string[]>(row.required_tags_any_json, []);
    const forbidden = parseJson<string[]>(row.forbidden_tags_json, []);
    if (requiredAll.some((tag) => !unitTags.has(tag) && !unitTags.has(semantic(tag))) ||
        (requiredAny.length > 0 && !requiredAny.some((tag) => unitTags.has(tag) || unitTags.has(semantic(tag)))) ||
        forbidden.some((tag) => unitTags.has(tag) || unitTags.has(semantic(tag)))) {
      throw new ForceServiceError(422, "EQUIPMENT_INELIGIBLE", `${row.name} does not match the unit's authoritative tags.`);
    }
    const count = (selectedCounts.get(row.equipment_definition_id) ?? 0) + 1;
    selectedCounts.set(row.equipment_definition_id, count);
    if (row.maximum_equipped !== null && count > row.maximum_equipped) {
      throw new ForceServiceError(422, "EQUIPMENT_LIMIT_EXCEEDED", `${row.name} exceeds its duplicate limit.`);
    }
  }
  const abilityRefs: AbilityRef[] = abilities.map((ability) => ({
    abilityId: ability.ability_id,
    handlerId: parseJson<{ handlerId?: string }>(ability.effect_json, {}).handlerId,
  }));
  const mode: MovementDomain = context.movement_domain;
  if (
    (context.durability_model === "FORCE_STRENGTH" && context.durability_output_scales_with_current !== 1) ||
    (context.durability_model === "HITS" && context.durability_output_scales_with_current !== 0)
  ) {
    throw new ForceServiceError(422, "DURABILITY_PROFILE_INVALID", `${context.definition_name} has an inconsistent durability profile.`);
  }
  const durabilityProfile: UnitDefinition["durabilityProfile"] = context.durability_model === "FORCE_STRENGTH"
    ? {
      id: context.durability_profile_id, model: "FORCE_STRENGTH", maximumHealth: context.max_health,
      outputScaling: "CURRENT_HEALTH", penetrationLoss: "RESIDUAL",
      supportsSubsystems: context.durability_supports_subsystems === 1, healable: true,
    }
    : {
      id: context.durability_profile_id, model: "HITS", maximumHealth: context.max_health,
      outputScaling: "NONE", penetrationLoss: "ONE_HIT",
      supportsSubsystems: context.durability_supports_subsystems === 1, healable: false,
    };
  const unitDefinition: UnitDefinition = {
    id: context.definition_id,
    kind: "unit-class",
    name: context.definition_name,
    description: context.definition_name,
    category: context.category as UnitDefinition["category"],
    tags: [...new Set(tags.map((tag) => semantic(tag.tag_id)))],
    stats: {
      healthModel: context.health_model,
      maxHealth: context.max_health,
      armor: context.armor,
      defense: context.defense,
      speed: context.speed_quarters / 4,
      sensors: rulesResolution.authority.sourcedNumbers.sensorRange.value
        ?? rulesResolution.legacyDefinition.stats.sensors,
      capacity: typeof definitionJson.capacity === "number"
        ? definitionJson.capacity
        : rulesResolution.legacyDefinition.stats.capacity,
    },
    weapons: baseWeaponRows.map(weapon),
    requisitionCost: rulesResolution.authority.sourcedNumbers.requisitionCost.value,
    slots: Object.fromEntries(slots.map((slot) => [slot.slot_type, slot.slot_count])),
    allowedOrders: rulesResolution.authority.links.allowedOrderTypes,
    allowedActions: rulesResolution.authority.links.allowedActionTypes,
    rulesetVersion: RULESET_VERSION,
    source: context.definition_source,
    status: context.definition_status as UnitDefinition["status"],
    notes: context.definition_notes,
    implementationStatus: rulesResolution.authority.status.implementationStatus as UnitDefinition["implementationStatus"],
    requisitionStatus: rulesResolution.authority.status.requisitionStatus as UnitDefinition["requisitionStatus"],
    availabilityStatus: rulesResolution.authority.status.availabilityStatus as UnitDefinition["availabilityStatus"],
    availabilityReasonCode: rulesResolution.authority.status.reasonCode ?? undefined,
    movementProfile: {
      id: context.movement_profile_id,
      mode,
      baseSpeed: context.speed_quarters / 4,
      usesFacing: context.movement_uses_facing === 1,
      allowsHostilePassage: context.movement_allows_hostile_passage === 1,
      requiresFlightPath: context.movement_requires_flight_path === 1,
      terrainCostMode: mode === "GROUND" ? "BATTLEFIELD" : "FLAT",
    },
    durabilityProfile,
    abilities: abilityRefs,
    deploymentProfile: context.deployment_profile_id ? { id: context.deployment_profile_id, allowedLocationStates: ["RESERVE", "ON_SHIP"], requiredTags: [], prohibitedStatuses: ["DESTROYED"] } : undefined,
  };
  const ammunition = parseJson<Record<string, number>>(context.ammunition_json, {});
  const result = buildEffectiveUnit({
    rulesetVersion: RULESET_VERSION,
    unitDefinition,
    playerUnit: {
      id: context.unit_id, version: context.unit_version, ownerId, definitionId: context.definition_id,
      callsign: "", name: "", status: context.unit_status as "ACTIVE", currentHealth: context.current_health,
      equipmentIds: [], ammunition, cooldowns: {}, damage: [], requisitionValue: context.requisition_value, campaignHistory: [],
    },
    refits: [],
    equipment: selected,
    ammunition,
    cooldowns: {},
  });
  return {
    context, result, selected, inventoryRows,
    baseWeaponIds: baseWeaponRows.map((row) => row.weapon_id), supplies,
    slots: Object.fromEntries(slots.map((slot) => [slot.slot_type, slot.slot_count])),
    rulesAuthority: rulesResolution.authority,
    equipmentRulesAuthorities,
  };
}

export async function getUnitLoadout(env: Env, ownerId: string, unitId: string): Promise<unknown> {
  const hydrated = await buildStoredEffectiveUnit(env, ownerId, unitId);
  return {
    unitId,
    unitVersion: hydrated.context.unit_version,
    loadout: {
      id: hydrated.context.loadout_id,
      revision: hydrated.context.loadout_revision,
      status: hydrated.context.loadout_status,
      lockedAt: hydrated.context.locked_at,
      items: hydrated.selected.map((item) => ({ inventoryId: item.instanceId, definitionId: item.definition.id, name: item.definition.name, slotType: item.slotType, slotIndex: item.slotIndex })),
    },
    effectiveUnit: hydrated.result.unit ?? null,
    slots: hydrated.slots,
    validation: { valid: hydrated.result.valid, errors: hydrated.result.errors, warnings: hydrated.result.warnings },
    ownedEquipment: [...new Map(hydrated.inventoryRows.map((row) => [row.inventory_id, row])).values()].map((row) => ({
      inventoryId: row.inventory_id,
      definitionId: row.equipment_definition_id,
      name: row.name,
      assignedUnitId: row.assigned_unit_id,
      state: row.inventory_state,
      implementationStatus: row.implementation_status,
      executable: row.executable === 1,
      allowedSlots: parseJson<string[]>(row.slot_types_json, [row.canonical_slot_type]),
    })),
  };
}

function replay(receipt: Awaited<ReturnType<typeof getMutationReceipt>>, ownerId: string, operation: string, hash: string): unknown | undefined {
  if (!receipt) return undefined;
  if (receipt.owner_id !== ownerId || receipt.operation !== operation || receipt.request_hash !== hash) {
    throw new ForceServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return parseJson(receipt.response_json, {});
}

export async function changeUnitLoadout(
  env: Env,
  ownerId: string,
  unitId: string,
  command: LoadoutChangeCommand,
): Promise<unknown> {
  const requestHash = await commandHash({ ownerId, unitId, ...command });
  const previousReceipt = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "SET_LOADOUT", requestHash);
  if (previousReceipt) return previousReceipt;
  const hydrated = await buildStoredEffectiveUnit(env, ownerId, unitId, command.items);
  const { context, result, selected } = hydrated;
  if (context.unit_version !== command.expectedVersion || context.loadout_revision !== command.expectedLoadoutRevision) {
    throw new ForceServiceError(409, "LOADOUT_VERSION_CONFLICT", "Unit or loadout changed since it was opened.", {
      currentUnitVersion: context.unit_version,
      currentLoadoutRevision: context.loadout_revision,
    });
  }
  if (context.locked_at !== null || context.loadout_kind === "CAMPAIGN" || context.unit_status === "DEPLOYED") {
    throw new ForceServiceError(409, "LOADOUT_LOCKED", "Campaign loadouts cannot be changed outside an authorised re-equipment transition.");
  }
  if (!(await hasLoadoutFacility(env.DB, ownerId, context, command.campaignId))) {
    throw new ForceServiceError(422, "REFIT_FACILITY_REQUIRED", "Unit is not at an eligible re-equipment facility or pre-campaign muster.");
  }
  if (!result.valid || !result.unit) {
    throw new ForceServiceError(422, "LOADOUT_INVALID", "Requested loadout is invalid.", { errors: result.errors });
  }
  const response = {
    unitId,
    unitVersion: context.unit_version + 1,
    loadoutId: context.loadout_id,
    loadoutRevision: context.loadout_revision + 1,
    effectiveUnit: result.unit,
  };
  const ownerNamespace = (await commandHash({ ownerId })).slice(0, 16);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM player_unit_loadout_items WHERE loadout_id = ?1 AND player_unit_id = ?2`)
      .bind(context.loadout_id, unitId),
    env.DB.prepare(`DELETE FROM player_unit_equipment WHERE player_unit_id = ?1`).bind(unitId),
    env.DB.prepare(`DELETE FROM player_unit_weapon_mounts WHERE player_unit_id = ?1 AND source_kind = 'EQUIPMENT'`).bind(unitId),
    env.DB.prepare(`UPDATE player_equipment_inventory
      SET assigned_unit_id = NULL, source_unit_slot_type = NULL, source_unit_slot_index = NULL,
          state = 'AVAILABLE', revision = revision + 1
      WHERE owner_id = ?1 AND assigned_unit_id = ?2 AND state = 'ASSIGNED'`).bind(ownerId, unitId),
  ];
  for (const item of selected) {
    statements.push(
      env.DB.prepare(`UPDATE player_equipment_inventory
        SET assigned_unit_id = ?1, source_unit_slot_type = ?2, source_unit_slot_index = ?3,
            state = 'ASSIGNED', revision = revision + 1
        WHERE id = ?4 AND owner_id = ?5 AND state IN ('AVAILABLE','ASSIGNED')
          AND (assigned_unit_id IS NULL OR assigned_unit_id = ?1)`)
        .bind(unitId, item.slotType, item.slotIndex, item.instanceId, ownerId),
      env.DB.prepare(`INSERT INTO player_unit_equipment (
          player_unit_id, ruleset_id, equipment_definition_id, slot_type, slot_index, state_json
        ) SELECT ?1, ruleset_id, equipment_definition_id, ?2, ?3, json_object('inventoryId', id)
          FROM player_equipment_inventory WHERE id = ?4 AND owner_id = ?5 AND assigned_unit_id = ?1`)
        .bind(unitId, item.slotType, item.slotIndex, item.instanceId, ownerId),
      env.DB.prepare(`INSERT INTO player_unit_loadout_items (
          loadout_id, player_unit_id, owned_slot_type, owned_slot_index, mount_role, quantity, state_json
        ) SELECT ?1, ?2, ?3, ?4,
            CASE ?3 WHEN 'PRIMARY' THEN 'PRIMARY' WHEN 'SECONDARY' THEN 'SECONDARY'
              WHEN 'INTERNAL' THEN 'INTERNAL' WHEN 'EXTERNAL' THEN 'EXTERNAL' ELSE 'OTHER' END,
            1, json_object('inventoryId', ?5)
          FROM player_unit_equipment
          WHERE player_unit_id = ?2 AND slot_type = ?3 AND slot_index = ?4`)
        .bind(context.loadout_id, unitId, item.slotType, item.slotIndex, item.instanceId),
    );
  }
  const grantedWeapons = result.unit.weapons.filter((candidate) => !hydrated.baseWeaponIds.includes(candidate.id));
  for (const [index, granted] of grantedWeapons.entries()) {
    statements.push(env.DB.prepare(`INSERT INTO player_unit_weapon_mounts (
      id,player_unit_id,ruleset_id,weapon_definition_id,source_kind,mount_role,
      mount_index,current_ammo,cooldown_remaining,state,state_json
    ) VALUES (?1,?2,?3,?4,'EQUIPMENT','DISPOSABLE',?5,?6,0,'OPERATIONAL','{}')`)
      .bind(`mount:${unitId}:equipment:${granted.id}`, unitId, context.ruleset_id, granted.id,
        index, granted.ammoCapacity === undefined ? null : result.unit.ammunition[granted.id] ?? granted.ammoCapacity));
  }
  statements.push(
    env.DB.prepare(`UPDATE player_unit_loadouts SET revision = revision + 1,
        effective_state_hash = ?1, updated_at = unixepoch()
      WHERE id = ?2 AND player_unit_id = ?3 AND revision = ?4 AND locked_at IS NULL`)
      .bind(result.unit.sourceHash, context.loadout_id, unitId, command.expectedLoadoutRevision),
    env.DB.prepare(`UPDATE player_units SET version = version + 1, ammunition_json = ?1, updated_at = unixepoch()
      WHERE id = ?2 AND owner_id = ?3 AND version = ?4`)
      .bind(JSON.stringify(result.unit.ammunition), unitId, ownerId, command.expectedVersion),
    env.DB.prepare(`INSERT INTO unit_history (
        id, player_unit_id, event_type, summary, payload_json, occurred_at,
        idempotency_key, actor_user_id, visibility
      ) SELECT ?1, units.id, 'EQUIPMENT_ASSIGNED', 'Persistent loadout updated.', ?2,
          unixepoch(), ?3, ?4, 'OWNER'
        FROM player_units AS units JOIN player_unit_loadouts AS loadouts ON loadouts.player_unit_id = units.id
        WHERE units.id = ?5 AND units.owner_id = ?4 AND units.version = ?6
          AND loadouts.id = ?7 AND loadouts.revision = ?8`)
      .bind(
        `history:${ownerNamespace}:${command.commandId}`,
        JSON.stringify({ equipmentInstanceIds: result.unit.equipmentInstanceIds, effectiveStateHash: result.unit.sourceHash }),
        `loadout:${ownerNamespace}:${command.commandId}`,
        ownerId,
        unitId,
        context.unit_version + 1,
        context.loadout_id,
        context.loadout_revision + 1,
      ),
    env.DB.prepare(`INSERT INTO force_mutation_receipts (
        idempotency_key, owner_id, operation, request_hash, response_json
      ) SELECT ?1, units.owner_id, 'SET_LOADOUT', ?2, ?3
        FROM player_units AS units JOIN player_unit_loadouts AS loadouts ON loadouts.player_unit_id = units.id
        WHERE units.id = ?4 AND units.owner_id = ?5 AND units.version = ?6
          AND loadouts.id = ?7 AND loadouts.revision = ?8
          AND (SELECT COUNT(*) FROM player_unit_loadout_items WHERE loadout_id = ?7) = ?9`)
      .bind(command.commandId, requestHash, JSON.stringify(response), unitId, ownerId, context.unit_version + 1, context.loadout_id, context.loadout_revision + 1, selected.length),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const afterRace = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "SET_LOADOUT", requestHash);
    if (afterRace) return afterRace;
    throw error;
  }
  const committed = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "SET_LOADOUT", requestHash);
  if (!committed) throw new ForceServiceError(409, "LOADOUT_VERSION_CONFLICT", "Loadout changed while the command was committed.");
  return committed;
}

interface EquipmentPurchaseRow {
  id: string;
  ruleset_id: string;
  name: string;
  requisition_cost: number | null;
  definition_status: string;
  implementation_status: string | null;
  requisition_status: string | null;
  availability_status: string | null;
  executable: number | null;
  purchasable: number | null;
  reason_code: string | null;
}

export async function purchaseEquipment(
  env: Env,
  ownerId: string,
  command: PurchaseEquipmentCommand,
): Promise<unknown> {
  const requestHash = await commandHash({ ownerId, operation: "PURCHASE_EQUIPMENT", ...command });
  const prior = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_EQUIPMENT", requestHash);
  if (prior) return prior;
  const definition = await env.DB.prepare(`SELECT equipment.id, equipment.ruleset_id,
      equipment.name, equipment.requisition_cost, equipment.definition_status,
      overlays.implementation_status, overlays.requisition_status,
      overlays.availability_status, overlays.executable, overlays.purchasable, overlays.reason_code
    FROM equipment_definitions AS equipment
    LEFT JOIN ruleset_implementation_overlays AS overlays
      ON overlays.definition_kind = 'EQUIPMENT' AND overlays.definition_id = equipment.id
     AND overlays.ruleset_id = equipment.ruleset_id
    WHERE equipment.id = ?1 AND equipment.definition_status = 'active' LIMIT 1`)
    .bind(command.definitionId).first<EquipmentPurchaseRow>();
  if (!definition) throw new ForceServiceError(404, "DEFINITION_NOT_FOUND", "Equipment definition was not found.");
  const rulesResolution = resolveEquipmentRulesAuthority({
    rulesetId: definition.ruleset_id,
    definitionId: definition.id,
    definitionStatus: definition.definition_status,
    requisitionCost: definition.requisition_cost,
    implementationStatus: definition.implementation_status,
    requisitionStatus: definition.requisition_status,
    availabilityStatus: definition.availability_status,
    executable: definition.executable === 1,
    purchasable: definition.purchasable === 1,
    reasonCode: definition.reason_code,
  }, env.ENVIRONMENT);
  if (!rulesResolution.ok) {
    throw new ForceServiceError(422, "DEFINITION_NOT_PURCHASABLE", rulesResolution.message, {
      rulesDecisionCode: rulesResolution.code,
      rulesAuthority: rulesResolution.authority,
    });
  }
  const normal = rulesResolution.authority.status.implementationStatus === "IMPLEMENTED" &&
    rulesResolution.authority.status.executable && rulesResolution.authority.status.purchasable &&
    rulesResolution.authority.status.requisitionStatus === "PUBLISHED" &&
    rulesResolution.authority.status.availabilityStatus === "AVAILABLE" &&
    rulesResolution.authority.sourcedNumbers.requisitionCost.value !== null;
  const developmentOverride = env.ENVIRONMENT === "development" && command.developerOverride &&
    rulesResolution.authority.status.implementationStatus !== "CATALOGUE_ONLY" &&
    rulesResolution.authority.status.executable;
  if (!normal && !developmentOverride) {
    throw new ForceServiceError(422, "DEFINITION_NOT_PURCHASABLE", "This equipment cannot be requisitioned in the active ruleset.");
  }
  const price = normal ? rulesResolution.authority.sourcedNumbers.requisitionCost.value : null;
  if (price !== null && await getRequisitionBalance(env.DB, ownerId) < price) {
    throw new ForceServiceError(422, "REQUISITION_INSUFFICIENT", "Insufficient requisition balance.");
  }
  const namespace = (await commandHash({ ownerId })).slice(0, 16);
  const inventoryId = `inventory:${namespace}:${command.commandId}`;
  const response = { inventoryId, definitionId: definition.id, name: definition.name, requisitionSpent: price, state: "AVAILABLE" };
  const statements: D1PreparedStatement[] = [];
  if (price !== null) {
    statements.push(env.DB.prepare(`INSERT INTO requisition_transactions (
      id,user_id,amount,reason_code,description,related_entity_type,related_entity_id,idempotency_key
    ) SELECT ?1,?2,-?3,'EQUIPMENT_PURCHASE',?4,'EQUIPMENT_INVENTORY',?5,?6
      WHERE (SELECT COALESCE(SUM(amount),0) FROM requisition_transactions WHERE user_id = ?2) >= ?3`)
      .bind(`req:${namespace}:${command.commandId}`, ownerId, price, `Requisitioned ${definition.name}.`, inventoryId,
        `equipment-requisition:${namespace}:${command.commandId}`));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO player_equipment_inventory (
      id,owner_id,ruleset_id,equipment_definition_id,state,state_json
    ) SELECT ?1,?2,?3,?4,'AVAILABLE',?5
      WHERE ?6 = 1 OR EXISTS (SELECT 1 FROM requisition_transactions WHERE id = ?7 AND user_id = ?2)`)
      .bind(inventoryId, ownerId, definition.ruleset_id, definition.id,
        JSON.stringify({ acquisition: price === null ? "DEVELOPMENT_OVERRIDE" : "REQUISITION" }), price === null ? 1 : 0,
        `req:${namespace}:${command.commandId}`),
    env.DB.prepare(`INSERT INTO force_mutation_receipts (
      idempotency_key,owner_id,operation,request_hash,response_json
    ) SELECT ?1,?2,'PURCHASE_EQUIPMENT',?3,?4 FROM player_equipment_inventory
      WHERE id = ?5 AND owner_id = ?2`)
      .bind(command.commandId, ownerId, requestHash, JSON.stringify(response), inventoryId),
  );
  try { await env.DB.batch(statements); } catch (error) {
    const raced = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_EQUIPMENT", requestHash);
    if (raced) return raced;
    throw error;
  }
  const committed = replay(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_EQUIPMENT", requestHash);
  if (!committed) throw new ForceServiceError(409, "REQUISITION_CONFLICT", "Equipment purchase could not be committed.");
  return committed;
}

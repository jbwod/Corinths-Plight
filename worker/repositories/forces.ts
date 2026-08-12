import type { Env } from "../env";

export interface ForceRow {
  id: string;
  owner_id: string;
  ruleset_id: string;
  definition_id: string;
  callsign: string;
  name: string;
  description: string;
  status: string;
  location_kind: string;
  location_id: string | null;
  location_state: string;
  current_health: number;
  maximum_health: number;
  health_model: string;
  definition_name: string;
  category: string;
  armor: number;
  defense: number;
  speed_quarters: number;
  sensor_range: number;
  requisition_cost: number | null;
  implementation_status: string | null;
  requisition_status: string | null;
  availability_status: string | null;
  executable: number | null;
  purchasable: number | null;
  reason_code: string | null;
  movement_profile_id: string | null;
  movement_profile_name: string | null;
  movement_domain: string | null;
  durability_profile_id: string | null;
  durability_profile_name: string | null;
  cargo_profile_id: string | null;
  cargo_profile_name: string | null;
  cargo_capacity_json: string | null;
  cargo_loading_rules_json: string | null;
  supply_profile_id: string | null;
  deployment_requirements_json: string | null;
  deployment_drop_modes_json: string | null;
  base_stats_json: string;
  ammunition_json: string;
  damage_json: string;
  requisition_value: number;
  requisition_value_status: string;
  service_campaigns: number;
  service_rounds: number;
  version: number;
  created_at: number;
  updated_at: number;
  destroyed_at: number | null;
  destroyed_campaign_id: string | null;
  destroyed_round: number | null;
  destroyed_cause: string | null;
  battlegroups_json: string;
}

export interface DefinitionTagRow {
  unit_id?: string;
  definition_id: string;
  tag_id: string;
  tag_name: string;
}

export interface DefinitionAbilityRow {
  unit_id?: string;
  definition_id: string;
  ability_id: string;
  name: string;
  action_definition_id: string | null;
  target_selector_json: string;
  effect_json: string;
  definition_json: string;
}

export interface EquipmentRow {
  equipment_definition_id: string;
  name: string;
  category: string;
  slot_type: string;
  slot_index: number;
  requisition_cost: number | null;
  definition_status: string;
  definition_json: string;
  state_json: string;
  lost_at: number | null;
}

export interface WeaponMountRow {
  id: string;
  weapon_definition_id: string;
  name: string;
  source_kind: string;
  mount_role: string;
  mount_index: number;
  current_ammo: number | null;
  ammo_capacity: number | null;
  cooldown_rounds: number | null;
  cooldown_remaining: number;
  state: string;
  damage_dice_count: number;
  damage_die_sides: number;
  damage_modifier: number;
  armor_piercing: number;
  range_hexes: number;
  indirect: number;
  definition_json: string;
  state_json: string;
}

export interface SupplyRow {
  resource_type: string;
  current_quantity: number;
  maximum_quantity: number;
  revision: number;
}

export interface SubsystemRow {
  subsystem_type: string;
  state: string;
  revision: number;
  state_json: string;
}

export interface CargoRow {
  id: string;
  item_kind: string;
  carried_unit_id: string | null;
  carried_callsign: string | null;
  carried_category: string | null;
  carried_health_model: string | null;
  reference_id: string | null;
  resource_type: string | null;
  quantity: number;
  transport_mode: string;
  cargo_slots_quarters: number;
  state: string;
  state_json: string;
}

export interface UnitHistoryRow {
  id: string;
  event_type: string;
  summary: string;
  campaign_id: string | null;
  round_number: number | null;
  payload_json: string;
  occurred_at: number;
  visibility: string;
}

export interface StatusEffectRow {
  id: string;
  status_effect_id: string;
  applied_round: number | null;
  expires_round: number | null;
  source_unit_id: string | null;
  state_json: string;
}

export interface UnitServiceSummaryRow {
  campaigns_completed: number;
  rounds_served: number;
  damage_sustained: number;
  objectives_completed: number;
  units_destroyed: number;
  commendations: number;
}

export interface CatalogueUnitRow {
  id: string;
  ruleset_id: string;
  name: string;
  category: string;
  health_model: string;
  max_health: number;
  armor: number;
  defense: number;
  speed_quarters: number;
  sensor_range: number;
  requisition_cost: number | null;
  definition_status: string;
  source: string;
  notes: string;
  definition_json: string;
  implementation_status: string | null;
  requisition_status: string | null;
  availability_status: string | null;
  executable: number | null;
  purchasable: number | null;
  reason_code: string | null;
  overlay_json: string | null;
  movement_profile_id: string | null;
  movement_profile_name: string | null;
  movement_domain: string | null;
  movement_definition_json: string | null;
  durability_profile_id: string | null;
  durability_profile_name: string | null;
  durability_definition_json: string | null;
  cargo_profile_id: string | null;
  cargo_profile_name: string | null;
  cargo_capacity_json: string | null;
  cargo_loading_rules_json: string | null;
  supply_profile_id: string | null;
  deployment_profile_id: string | null;
  deployment_requirements_json: string | null;
}

export interface CatalogueWeaponRow {
  definition_id: string;
  mount_role: string;
  mount_index: number;
  id: string;
  name: string;
  damage_dice_count: number;
  damage_die_sides: number;
  damage_modifier: number;
  armor_piercing: number;
  range_hexes: number;
  ammo_capacity: number | null;
  cooldown_rounds: number | null;
  indirect: number;
  definition_json: string;
}

export interface CatalogueSlotRow {
  definition_id: string;
  slot_type: string;
  slot_count: number;
  eligibility_json: string;
}

export interface RequisitionLedgerRow {
  id: string;
  amount: number;
  reason_code: string;
  description: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: number;
}

export interface MutationReceiptRow {
  idempotency_key: string;
  owner_id: string;
  operation: string;
  request_hash: string;
  response_json: string;
  created_at: number;
}

export interface ShipCapabilityRow {
  ship_id: string;
  battalion_id: string;
  capability_id: string | null;
  capacity: number | null;
}

export interface ShipCarryRuleRow {
  capability_id: string;
  definition_json: string;
}

export interface ShipOccupantRow {
  unit_id: string;
  definition_id: string;
}

export interface CampaignDeploymentAccessRow {
  campaign_id: string;
  status: string;
  role: string;
  side: string;
  battalion_id: string | null;
  force_policy_json: string;
}

const forceSelect = `
  SELECT pu.id, pu.owner_id, pu.ruleset_id, pu.definition_id, pu.callsign,
         pu.name, pu.description, pu.status, pu.location_kind,
         pu.location_id, pu.location_state,
         pu.current_health, pu.base_stats_json, pu.ammunition_json,
         pu.damage_json, pu.requisition_value, pu.requisition_value_status,
         pu.service_campaigns,
         pu.service_rounds, pu.version, pu.created_at, pu.updated_at,
         pu.destroyed_at, pu.destroyed_campaign_id, pu.destroyed_round,
         pu.destroyed_cause,
         COALESCE((
           SELECT json_group_array(json_object(
             'id', memberships.id,
             'name', memberships.name,
             'objective', memberships.objective
           ))
             FROM (
               SELECT battlegroups.id, battlegroups.name, battlegroups.objective
                 FROM battlegroup_units AS membership
                 JOIN battlegroups ON battlegroups.id = membership.battlegroup_id
                WHERE membership.player_unit_id = pu.id
                ORDER BY battlegroups.id
             ) AS memberships
         ), '[]') AS battlegroups_json,
         definitions.name AS definition_name,
         definitions.category, definitions.health_model,
         definitions.max_health AS maximum_health,
         definitions.armor, definitions.defense,
         definitions.speed_quarters, definitions.sensor_range,
         definitions.requisition_cost,
         overlay.implementation_status, overlay.requisition_status,
         overlay.availability_status, overlay.executable,
         overlay.purchasable, overlay.reason_code,
         profiles.movement_profile_id, movement.name AS movement_profile_name,
         movement.domain AS movement_domain,
         profiles.durability_profile_id,
         durability.name AS durability_profile_name,
         profiles.cargo_profile_id,
         cargo.name AS cargo_profile_name,
         cargo.capacity_json AS cargo_capacity_json,
         cargo.loading_rules_json AS cargo_loading_rules_json,
         profiles.supply_profile_id,
         deployment.requirements_json AS deployment_requirements_json,
         deployment.drop_modes_json AS deployment_drop_modes_json
    FROM player_units AS pu
    JOIN unit_class_definitions AS definitions
      ON definitions.id = pu.definition_id
     AND definitions.ruleset_id = pu.ruleset_id
    LEFT JOIN ruleset_implementation_overlays AS overlay
      ON overlay.definition_kind = 'UNIT'
     AND overlay.definition_id = definitions.id
     AND overlay.ruleset_id = definitions.ruleset_id
    LEFT JOIN unit_definition_profiles AS profiles
      ON profiles.unit_definition_id = definitions.id
     AND profiles.ruleset_id = definitions.ruleset_id
    LEFT JOIN movement_profile_definitions AS movement
      ON movement.id = profiles.movement_profile_id
     AND movement.ruleset_id = profiles.ruleset_id
    LEFT JOIN durability_profile_definitions AS durability
      ON durability.id = profiles.durability_profile_id
     AND durability.ruleset_id = profiles.ruleset_id
    LEFT JOIN cargo_profile_definitions AS cargo
      ON cargo.id = profiles.cargo_profile_id
     AND cargo.ruleset_id = profiles.ruleset_id
    LEFT JOIN deployment_profile_definitions AS deployment
      ON deployment.id = profiles.deployment_profile_id
     AND deployment.ruleset_id = profiles.ruleset_id`;

export interface ForceListFilters {
  category?: string;
  status?: string;
  locationState?: string;
  cursor?: string;
  limit: number;
}

export async function listForces(
  db: Env["DB"],
  ownerId: string,
  filters: ForceListFilters,
): Promise<ForceRow[]> {
  const result = await db
    .prepare(`${forceSelect}
      WHERE pu.owner_id = ?1
        AND (?2 IS NULL OR definitions.category = ?2)
        AND (?3 IS NULL OR pu.status = ?3)
        AND (?4 IS NULL OR pu.location_state = ?4)
        AND (?5 IS NULL OR pu.id > ?5)
      ORDER BY pu.id
      LIMIT ?6`)
    .bind(
      ownerId,
      filters.category ?? null,
      filters.status ?? null,
      filters.locationState ?? null,
      filters.cursor ?? null,
      filters.limit,
    )
    .all<ForceRow>();
  return result.results;
}

export async function getForce(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<ForceRow | null> {
  return db
    .prepare(`${forceSelect} WHERE pu.owner_id = ?1 AND pu.id = ?2 LIMIT 1`)
    .bind(ownerId, unitId)
    .first<ForceRow>();
}

export async function listUnitTags(
  db: Env["DB"],
  ownerId: string,
  unitId?: string,
): Promise<DefinitionTagRow[]> {
  const result = await db
    .prepare(`SELECT pu.id AS unit_id, tags.unit_definition_id AS definition_id,
                    tags.tag_id, definitions.name AS tag_name
               FROM player_units AS pu
               JOIN unit_definition_tags AS tags
                 ON tags.unit_definition_id = pu.definition_id
                AND tags.ruleset_id = pu.ruleset_id
               JOIN tag_definitions AS definitions
                 ON definitions.id = tags.tag_id
                AND definitions.ruleset_id = tags.ruleset_id
              WHERE pu.owner_id = ?1 AND (?2 IS NULL OR pu.id = ?2)
              ORDER BY pu.id, tags.tag_id`)
    .bind(ownerId, unitId ?? null)
    .all<DefinitionTagRow>();
  return result.results;
}

export async function listUnitAbilities(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<DefinitionAbilityRow[]> {
  const result = await db
    .prepare(`SELECT pu.id AS unit_id, links.unit_definition_id AS definition_id,
                    links.ability_id, abilities.name,
                    abilities.action_definition_id,
                    abilities.target_selector_json, abilities.effect_json,
                    abilities.definition_json
               FROM player_units AS pu
               JOIN unit_definition_abilities AS links
                 ON links.unit_definition_id = pu.definition_id
                AND links.ruleset_id = pu.ruleset_id
               JOIN ability_definitions AS abilities
                 ON abilities.id = links.ability_id
                AND abilities.ruleset_id = links.ruleset_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              ORDER BY links.ability_id`)
    .bind(ownerId, unitId)
    .all<DefinitionAbilityRow>();
  return result.results;
}

export async function getForceEquipment(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<EquipmentRow[]> {
  const result = await db
    .prepare(`SELECT owned.equipment_definition_id, definitions.name,
                    definitions.category, owned.slot_type, owned.slot_index,
                    definitions.requisition_cost, definitions.definition_status,
                    definitions.definition_json, owned.state_json, owned.lost_at
               FROM player_unit_equipment AS owned
               JOIN player_units AS pu ON pu.id = owned.player_unit_id
               JOIN equipment_definitions AS definitions
                 ON definitions.id = owned.equipment_definition_id
                AND definitions.ruleset_id = owned.ruleset_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              ORDER BY owned.slot_type, owned.slot_index`)
    .bind(ownerId, unitId)
    .all<EquipmentRow>();
  return result.results;
}

export async function getForceWeaponMounts(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<WeaponMountRow[]> {
  const result = await db
    .prepare(`SELECT mounts.id, mounts.weapon_definition_id, weapons.name,
                    mounts.source_kind, mounts.mount_role, mounts.mount_index,
                    mounts.current_ammo, weapons.ammo_capacity,
                    weapons.cooldown_rounds,
                    mounts.cooldown_remaining, mounts.state,
                    weapons.damage_dice_count, weapons.damage_die_sides,
                    weapons.damage_modifier, weapons.armor_piercing,
                    weapons.range_hexes, weapons.indirect,
                    weapons.definition_json, mounts.state_json
               FROM player_unit_weapon_mounts AS mounts
               JOIN player_units AS pu ON pu.id = mounts.player_unit_id
               JOIN weapon_definitions AS weapons
                 ON weapons.id = mounts.weapon_definition_id
                AND weapons.ruleset_id = mounts.ruleset_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              ORDER BY mounts.mount_role, mounts.mount_index`)
    .bind(ownerId, unitId)
    .all<WeaponMountRow>();
  return result.results;
}

export async function getForceSupplies(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<SupplyRow[]> {
  const result = await db
    .prepare(`SELECT supplies.resource_type, supplies.current_quantity,
                    supplies.maximum_quantity, supplies.revision
               FROM player_unit_supplies AS supplies
               JOIN player_units AS pu ON pu.id = supplies.player_unit_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              ORDER BY supplies.resource_type`)
    .bind(ownerId, unitId)
    .all<SupplyRow>();
  return result.results;
}

export async function getForceSubsystems(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<SubsystemRow[]> {
  const result = await db
    .prepare(`SELECT subsystems.subsystem_type, subsystems.state,
                    subsystems.revision, subsystems.state_json
               FROM player_unit_subsystems AS subsystems
               JOIN player_units AS pu ON pu.id = subsystems.player_unit_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              ORDER BY subsystems.subsystem_type`)
    .bind(ownerId, unitId)
    .all<SubsystemRow>();
  return result.results;
}

export async function getForceCargo(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<CargoRow[]> {
  const result = await db
    .prepare(`SELECT items.id, items.item_kind, items.carried_unit_id,
                    carried.callsign AS carried_callsign,
                    carried_definitions.category AS carried_category,
                    carried_definitions.health_model AS carried_health_model,
                    items.reference_id,
                    items.resource_type, items.quantity, items.transport_mode,
                    items.cargo_slots_quarters, items.state, items.state_json
               FROM unit_cargo_items AS items
               JOIN player_units AS carrier ON carrier.id = items.carrier_unit_id
               LEFT JOIN player_units AS carried ON carried.id = items.carried_unit_id
               LEFT JOIN unit_class_definitions AS carried_definitions
                 ON carried_definitions.id = carried.definition_id
                AND carried_definitions.ruleset_id = carried.ruleset_id
              WHERE carrier.owner_id = ?1 AND carrier.id = ?2
              ORDER BY items.state, items.id`)
    .bind(ownerId, unitId)
    .all<CargoRow>();
  return result.results;
}

export async function getForceHistory(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
  limit = 100,
): Promise<UnitHistoryRow[]> {
  const result = await db
    .prepare(`SELECT history.id, history.event_type, history.summary,
                    history.campaign_id, history.round_number,
                    history.payload_json, history.occurred_at,
                    history.visibility
               FROM unit_history AS history
               JOIN player_units AS pu ON pu.id = history.player_unit_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
                AND history.visibility IN ('OWNER', 'BATTALION', 'PUBLIC')
              ORDER BY history.occurred_at DESC, history.id DESC
              LIMIT ?3`)
    .bind(ownerId, unitId, limit)
    .all<UnitHistoryRow>();
  return result.results;
}

export async function getForceStatusEffects(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<StatusEffectRow[]> {
  const result = await db
    .prepare(`SELECT effects.id, effects.status_effect_id,
                    effects.applied_round, effects.expires_round,
                    effects.source_unit_id, effects.state_json
               FROM player_unit_status_effects AS effects
               JOIN player_units AS pu ON pu.id = effects.player_unit_id
               JOIN status_effect_definitions AS definitions
                 ON definitions.id = effects.status_effect_id
                AND definitions.ruleset_id = effects.ruleset_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
                AND effects.removed_at IS NULL
                AND definitions.visibility <> 'SERVER_ONLY'
              ORDER BY effects.applied_at, effects.id`)
    .bind(ownerId, unitId)
    .all<StatusEffectRow>();
  return result.results;
}

export async function getForceServiceSummary(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
): Promise<UnitServiceSummaryRow | null> {
  return db
    .prepare(`SELECT service.campaigns_completed, service.rounds_served,
                    service.damage_sustained, service.objectives_completed,
                    service.units_destroyed, service.commendations
               FROM unit_service_summaries AS service
               JOIN player_units AS pu ON pu.id = service.player_unit_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
              LIMIT 1`)
    .bind(ownerId, unitId)
    .first<UnitServiceSummaryRow>();
}

export async function listCatalogueUnits(
  db: Env["DB"],
  includeDevelopment: boolean,
): Promise<CatalogueUnitRow[]> {
  const result = await db
    .prepare(`SELECT definitions.id, definitions.ruleset_id, definitions.name,
                    definitions.category, definitions.health_model,
                    definitions.max_health, definitions.armor,
                    definitions.defense, definitions.speed_quarters,
                    definitions.sensor_range, definitions.requisition_cost,
                    definitions.definition_status, definitions.source,
                    definitions.notes, definitions.definition_json,
                    overlay.implementation_status, overlay.requisition_status,
                    overlay.availability_status, overlay.executable,
                    overlay.purchasable, overlay.reason_code,
                    overlay.overlay_json,
                    profiles.movement_profile_id,
                    movement.name AS movement_profile_name,
                    movement.domain AS movement_domain,
                    movement.definition_json AS movement_definition_json,
                    profiles.durability_profile_id,
                    durability.name AS durability_profile_name,
                    durability.definition_json AS durability_definition_json,
                    profiles.cargo_profile_id,
                    cargo.name AS cargo_profile_name,
                    cargo.capacity_json AS cargo_capacity_json,
                    cargo.loading_rules_json AS cargo_loading_rules_json,
                    profiles.supply_profile_id,
                    profiles.deployment_profile_id,
                    deployment.requirements_json AS deployment_requirements_json
               FROM unit_class_definitions AS definitions
               JOIN rulesets ON rulesets.id = definitions.ruleset_id
               JOIN ruleset_implementation_overlays AS overlay
                 ON overlay.definition_kind = 'UNIT'
                AND overlay.definition_id = definitions.id
                AND overlay.ruleset_id = definitions.ruleset_id
               LEFT JOIN unit_definition_profiles AS profiles
                 ON profiles.unit_definition_id = definitions.id
                AND profiles.ruleset_id = definitions.ruleset_id
               LEFT JOIN movement_profile_definitions AS movement
                 ON movement.id = profiles.movement_profile_id
                AND movement.ruleset_id = profiles.ruleset_id
               LEFT JOIN durability_profile_definitions AS durability
                 ON durability.id = profiles.durability_profile_id
                AND durability.ruleset_id = profiles.ruleset_id
               LEFT JOIN cargo_profile_definitions AS cargo
                 ON cargo.id = profiles.cargo_profile_id
                AND cargo.ruleset_id = profiles.ruleset_id
               LEFT JOIN deployment_profile_definitions AS deployment
                 ON deployment.id = profiles.deployment_profile_id
                AND deployment.ruleset_id = profiles.ruleset_id
              WHERE rulesets.status = 'ACTIVE'
                AND (overlay.availability_status IS NULL
                     OR overlay.availability_status <> 'HIDDEN')
                AND (?1 = 1 OR overlay.availability_status <> 'DEV_ONLY')
              ORDER BY definitions.category, definitions.name`)
    .bind(includeDevelopment ? 1 : 0)
    .all<CatalogueUnitRow>();
  return result.results;
}

export async function listDefinitionTags(
  db: Env["DB"],
  definitionIds?: string[],
): Promise<DefinitionTagRow[]> {
  const result = await db
    .prepare(`SELECT tags.unit_definition_id AS definition_id,
                    tags.tag_id, definitions.name AS tag_name
               FROM unit_definition_tags AS tags
               JOIN rulesets ON rulesets.id = tags.ruleset_id AND rulesets.status = 'ACTIVE'
               JOIN tag_definitions AS definitions
                 ON definitions.id = tags.tag_id
                AND definitions.ruleset_id = tags.ruleset_id
              ORDER BY tags.unit_definition_id, tags.tag_id`)
    .all<DefinitionTagRow>();
  if (!definitionIds) return result.results;
  const allowed = new Set(definitionIds);
  return result.results.filter((row) => allowed.has(row.definition_id));
}

export async function listCatalogueAbilities(db: Env["DB"]): Promise<DefinitionAbilityRow[]> {
  const result = await db
    .prepare(`SELECT links.unit_definition_id AS definition_id,
                    links.ability_id, abilities.name,
                    abilities.action_definition_id,
                    abilities.target_selector_json, abilities.effect_json,
                    abilities.definition_json
               FROM unit_definition_abilities AS links
               JOIN rulesets
                 ON rulesets.id = links.ruleset_id
                AND rulesets.status = 'ACTIVE'
               JOIN ability_definitions AS abilities
                 ON abilities.id = links.ability_id
                AND abilities.ruleset_id = links.ruleset_id
              ORDER BY links.unit_definition_id, links.ability_id`)
    .all<DefinitionAbilityRow>();
  return result.results;
}

export async function listCatalogueWeapons(db: Env["DB"]): Promise<CatalogueWeaponRow[]> {
  const result = await db
    .prepare(`SELECT links.unit_definition_id AS definition_id,
                    links.mount_role, links.mount_index,
                    weapons.id, weapons.name, weapons.damage_dice_count,
                    weapons.damage_die_sides, weapons.damage_modifier,
                    weapons.armor_piercing, weapons.range_hexes,
                    weapons.ammo_capacity, weapons.cooldown_rounds,
                    weapons.indirect, weapons.definition_json
               FROM unit_definition_weapons AS links
               JOIN rulesets
                 ON rulesets.id = links.ruleset_id
                AND rulesets.status = 'ACTIVE'
               JOIN weapon_definitions AS weapons
                 ON weapons.id = links.weapon_definition_id
                AND weapons.ruleset_id = links.ruleset_id
              ORDER BY links.unit_definition_id, links.mount_role, links.mount_index`)
    .all<CatalogueWeaponRow>();
  return result.results;
}

export async function listCatalogueSlots(db: Env["DB"]): Promise<CatalogueSlotRow[]> {
  const result = await db
    .prepare(`SELECT slots.unit_definition_id AS definition_id,
                    slots.slot_type, slots.slot_count, slots.eligibility_json
               FROM unit_equipment_slot_definitions AS slots
               JOIN rulesets
                 ON rulesets.id = slots.ruleset_id
                AND rulesets.status = 'ACTIVE'
              WHERE COALESCE(json_extract(slots.eligibility_json, '$.canonicalActivation'), 'ACTIVE') <> 'CATALOGUED'
              ORDER BY slots.unit_definition_id, slots.slot_type`)
    .all<CatalogueSlotRow>();
  return result.results;
}

export async function getEligibleEquipment(
  db: Env["DB"],
  ownerId: string,
  unitId: string,
  includeDevelopment: boolean,
): Promise<Array<Record<string, unknown>>> {
  const result = await db
    .prepare(`SELECT equipment.id, equipment.name, equipment.category,
                    equipment.slot_type, equipment.requisition_cost,
                    equipment.definition_status, equipment.source,
                    equipment.notes, equipment.definition_json,
                    overlay.implementation_status, overlay.requisition_status,
                    overlay.availability_status, overlay.executable, overlay.purchasable,
                    overlay.reason_code, eligibility.maximum_equipped,
                    eligibility.rule_json AS eligibility_json
               FROM player_units AS pu
               JOIN equipment_definitions AS equipment
                 ON equipment.ruleset_id = pu.ruleset_id
               JOIN equipment_eligibility_rules AS eligibility
                 ON eligibility.equipment_definition_id = equipment.id
                AND eligibility.ruleset_id = equipment.ruleset_id
               JOIN ruleset_implementation_overlays AS overlay
                 ON overlay.definition_kind = 'EQUIPMENT'
                AND overlay.definition_id = equipment.id
                AND overlay.ruleset_id = equipment.ruleset_id
              WHERE pu.owner_id = ?1 AND pu.id = ?2
                AND equipment.definition_status NOT IN ('legacy')
                AND equipment.category <> 'SHIP_MODULE'
                AND (
                  overlay.availability_status IN ('AVAILABLE', 'BLOCKED')
                  OR (?3 = 1 AND overlay.availability_status = 'DEV_ONLY')
                )
                AND NOT EXISTS (
                  SELECT 1
                    FROM json_each(eligibility.required_tags_all_json) AS required
                   WHERE NOT EXISTS (
                     SELECT 1 FROM unit_definition_tags AS tags
                      WHERE tags.unit_definition_id = pu.definition_id
                        AND tags.ruleset_id = pu.ruleset_id
                        AND tags.tag_id = required.value
                   )
                )
                AND (
                  json_array_length(eligibility.required_tags_any_json) = 0
                  OR EXISTS (
                    SELECT 1
                      FROM json_each(eligibility.required_tags_any_json) AS required
                      JOIN unit_definition_tags AS tags
                        ON tags.unit_definition_id = pu.definition_id
                       AND tags.ruleset_id = pu.ruleset_id
                       AND tags.tag_id = required.value
                  )
                )
                AND NOT EXISTS (
                  SELECT 1
                    FROM json_each(eligibility.forbidden_tags_json) AS forbidden
                    JOIN unit_definition_tags AS tags
                      ON tags.unit_definition_id = pu.definition_id
                     AND tags.ruleset_id = pu.ruleset_id
                     AND tags.tag_id = forbidden.value
                )
                AND (
                  json_array_length(eligibility.allowed_unit_definitions_json) = 0
                  OR EXISTS (
                    SELECT 1 FROM json_each(eligibility.allowed_unit_definitions_json)
                     WHERE value = pu.definition_id
                  )
                )
                AND EXISTS (
                  SELECT 1
                    FROM unit_equipment_slot_definitions AS slots
                    JOIN json_each(eligibility.slot_types_json) AS permitted
                      ON UPPER(permitted.value) = UPPER(slots.slot_type)
                   WHERE slots.unit_definition_id = pu.definition_id
                     AND slots.ruleset_id = pu.ruleset_id
                     AND slots.slot_count > 0
                     AND COALESCE(json_extract(slots.eligibility_json, '$.canonicalActivation'), 'ACTIVE') <> 'CATALOGUED'
                )
                AND (
                  eligibility.maximum_equipped IS NULL
                  OR (
                    SELECT COUNT(*)
                      FROM player_unit_equipment AS owned
                     WHERE owned.player_unit_id = pu.id
                       AND owned.equipment_definition_id = equipment.id
                       AND owned.lost_at IS NULL
                  ) < eligibility.maximum_equipped
                )
              ORDER BY equipment.slot_type, equipment.name`)
    .bind(ownerId, unitId, includeDevelopment ? 1 : 0)
    .all<Record<string, unknown>>();
  return result.results;
}

export async function getRequisitionBalance(db: Env["DB"], ownerId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS balance
               FROM requisition_transactions
              WHERE user_id = ?1`)
    .bind(ownerId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

export async function getRequisitionLedger(
  db: Env["DB"],
  ownerId: string,
  limit = 50,
): Promise<RequisitionLedgerRow[]> {
  const result = await db
    .prepare(`SELECT id, amount, reason_code, description,
                    related_entity_type, related_entity_id, created_at
               FROM requisition_transactions
              WHERE user_id = ?1
              ORDER BY created_at DESC, id DESC
              LIMIT ?2`)
    .bind(ownerId, limit)
    .all<RequisitionLedgerRow>();
  return result.results;
}

export async function getMutationReceipt(
  db: Env["DB"],
  ownerId: string,
  idempotencyKey: string,
): Promise<MutationReceiptRow | null> {
  return db
    .prepare(`SELECT idempotency_key, owner_id, operation,
                    request_hash, response_json, created_at
               FROM force_mutation_receipts
              WHERE owner_id = ?1 AND idempotency_key = ?2
              LIMIT 1`)
    .bind(ownerId, idempotencyKey)
    .first<MutationReceiptRow>();
}

export async function getPurchasableDefinition(
  db: Env["DB"],
  definitionId: string,
): Promise<CatalogueUnitRow | null> {
  const result = await listCatalogueUnits(db, true);
  return result.find((definition) => definition.id === definitionId) ?? null;
}

export async function getAccessibleShipCapabilities(
  db: Env["DB"],
  ownerId: string,
  shipId: string,
): Promise<ShipCapabilityRow[] | null> {
  const result = await db
    .prepare(`SELECT ships.id AS ship_id, ships.battalion_id,
                    capabilities.capability_id,
                    capabilities.capacity
               FROM ships
               JOIN battalion_memberships AS memberships
                 ON memberships.battalion_id = ships.battalion_id
                AND memberships.user_id = ?1
                AND memberships.status = 'ACTIVE'
               LEFT JOIN ship_effective_capabilities AS capabilities
                 ON capabilities.ship_id = ships.id
                AND capabilities.ruleset_id = ships.ruleset_id
              WHERE ships.id = ?2
              ORDER BY capabilities.capability_id`)
    .bind(ownerId, shipId)
    .all<ShipCapabilityRow>();
  return result.results.length > 0 ? result.results : null;
}

export async function listShipCarryRules(db: Env["DB"]): Promise<ShipCarryRuleRow[]> {
  const result = await db
    .prepare(`SELECT capabilities.id AS capability_id,
                    capabilities.definition_json
               FROM ship_capability_definitions AS capabilities
               JOIN rulesets
                 ON rulesets.id = capabilities.ruleset_id
                AND rulesets.status = 'ACTIVE'
              WHERE capabilities.value_kind = 'CAPACITY'
                AND capabilities.id LIKE 'capability-carry-%'
              ORDER BY capabilities.id`)
    .all<ShipCarryRuleRow>();
  return result.results;
}

export async function listShipOccupants(
  db: Env["DB"],
  shipId: string,
): Promise<ShipOccupantRow[]> {
  const result = await db
    .prepare(`SELECT units.id AS unit_id, units.definition_id
               FROM player_units AS units
              WHERE units.location_state = 'ON_SHIP'
                AND units.location_id = ?1
                AND units.status NOT IN ('DESTROYED', 'RETIRED')
              ORDER BY units.id`)
    .bind(shipId)
    .all<ShipOccupantRow>();
  return result.results;
}

export async function getCampaignDeploymentAccess(
  db: Env["DB"],
  ownerId: string,
  campaignId: string,
): Promise<CampaignDeploymentAccessRow | null> {
  return db
    .prepare(`SELECT campaigns.id AS campaign_id, campaigns.status,
                    campaigns.force_policy_json,
                    memberships.role, memberships.side,
                    memberships.battalion_id
               FROM campaigns
               JOIN campaign_memberships AS memberships
                 ON memberships.campaign_id = campaigns.id
                AND memberships.user_id = ?1
              WHERE campaigns.id = ?2
                AND campaigns.status IN ('DRAFT', 'RECRUITING', 'ACTIVE', 'PAUSED')
                AND memberships.role IN ('PLAYER', 'BATTALION_COMMAND', 'GM')
                AND (memberships.side = 'ALLIED' OR memberships.role = 'GM')
              LIMIT 1`)
    .bind(ownerId, campaignId)
    .first<CampaignDeploymentAccessRow>();
}

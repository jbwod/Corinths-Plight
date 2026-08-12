export interface LoadoutContextRow {
  unit_id: string;
  owner_id: string;
  ruleset_id: string;
  definition_id: string;
  unit_version: number;
  unit_status: string;
  current_health: number;
  requisition_value: number;
  ammunition_json: string;
  location_state: string;
  location_id: string | null;
  loadout_id: string;
  loadout_revision: number;
  loadout_status: string;
  loadout_kind: string;
  locked_at: number | null;
  definition_name: string;
  category: string;
  health_model: "FORCE_STRENGTH" | "HITS";
  max_health: number;
  armor: number;
  defense: number;
  speed_quarters: number;
  sensor_range: number;
  requisition_cost: number | null;
  definition_status: string;
  definition_source: string;
  definition_notes: string;
  definition_json: string;
  implementation_status: string | null;
  requisition_status: string | null;
  availability_status: string | null;
  executable: number | null;
  purchasable: number | null;
  reason_code: string | null;
  movement_profile_id: string;
  durability_profile_id: string;
  cargo_profile_id: string | null;
  supply_profile_id: string | null;
  deployment_profile_id: string | null;
  profile_json: string;
  movement_domain: "GROUND" | "VTOL" | "AEROSPACE" | "ORBITAL";
  movement_uses_facing: number;
  movement_allows_hostile_passage: number;
  movement_requires_flight_path: number;
  movement_definition_json: string;
  durability_model: "FORCE_STRENGTH" | "HITS";
  durability_output_scales_with_current: number;
  durability_supports_subsystems: number;
  durability_definition_json: string;
}

export interface InventoryEffectRow {
  inventory_id: string;
  owner_id: string;
  assigned_unit_id: string | null;
  inventory_state: string;
  inventory_revision: number;
  equipment_definition_id: string;
  name: string;
  category: string;
  canonical_slot_type: string;
  definition_status: string;
  requisition_cost: number | null;
  consumable: number;
  definition_source: string;
  definition_notes: string;
  definition_json: string;
  effect_index: number | null;
  effect_type: string | null;
  effect_json: string | null;
  implementation_status: string | null;
  requisition_status: string | null;
  availability_status: string | null;
  executable: number | null;
  purchasable: number | null;
  reason_code: string | null;
  required_tags_all_json: string | null;
  required_tags_any_json: string | null;
  forbidden_tags_json: string | null;
  allowed_unit_definitions_json: string | null;
  slot_types_json: string | null;
  maximum_equipped: number | null;
}

export interface UnitSlotRow { slot_type: string; slot_count: number }
export interface UnitTagRow { tag_id: string; name: string }
export interface UnitAbilityRow { ability_id: string; name: string; action_definition_id: string | null; effect_json: string }
export interface UnitWeaponRow {
  weapon_id: string;
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
export interface LoadoutItemRow { inventory_id: string; slot_type: string; slot_index: number; equipment_definition_id: string }

export async function getLoadoutContext(db: D1Database, ownerId: string, unitId: string): Promise<LoadoutContextRow | null> {
  return db.prepare(`SELECT
      units.id AS unit_id, units.owner_id, units.ruleset_id, units.definition_id,
      units.version AS unit_version, units.status AS unit_status, units.current_health,
      units.requisition_value,
      units.ammunition_json, units.location_state, units.location_id,
      loadouts.id AS loadout_id, loadouts.revision AS loadout_revision,
      loadouts.status AS loadout_status, loadouts.loadout_kind, loadouts.locked_at,
      definitions.name AS definition_name, definitions.category, definitions.health_model,
      definitions.max_health,
      definitions.armor, definitions.defense, definitions.speed_quarters, definitions.sensor_range,
      definitions.requisition_cost, definitions.definition_status,
      definitions.source AS definition_source, definitions.notes AS definition_notes,
      definitions.definition_json, overlays.implementation_status, overlays.requisition_status,
      overlays.availability_status, overlays.executable, overlays.purchasable, overlays.reason_code,
      profiles.movement_profile_id, profiles.durability_profile_id, profiles.cargo_profile_id,
      profiles.supply_profile_id,
      profiles.deployment_profile_id, profiles.profile_json,
      movement.domain AS movement_domain, movement.uses_facing AS movement_uses_facing,
      movement.allows_hostile_passage AS movement_allows_hostile_passage,
      movement.requires_flight_path AS movement_requires_flight_path,
      movement.definition_json AS movement_definition_json,
      durability.model AS durability_model,
      durability.output_scales_with_current AS durability_output_scales_with_current,
      durability.supports_subsystems AS durability_supports_subsystems,
      durability.definition_json AS durability_definition_json
    FROM player_units AS units
    JOIN unit_class_definitions AS definitions
      ON definitions.id = units.definition_id AND definitions.ruleset_id = units.ruleset_id
    LEFT JOIN ruleset_implementation_overlays AS overlays
      ON overlays.definition_kind = 'UNIT' AND overlays.definition_id = definitions.id
     AND overlays.ruleset_id = definitions.ruleset_id
    JOIN unit_definition_profiles AS profiles
      ON profiles.unit_definition_id = units.definition_id AND profiles.ruleset_id = units.ruleset_id
    JOIN movement_profile_definitions AS movement
      ON movement.id = profiles.movement_profile_id AND movement.ruleset_id = profiles.ruleset_id
    JOIN durability_profile_definitions AS durability
      ON durability.id = profiles.durability_profile_id AND durability.ruleset_id = profiles.ruleset_id
    JOIN player_unit_loadouts AS loadouts
      ON loadouts.player_unit_id = units.id AND loadouts.loadout_kind = 'OWNED_DEFAULT' AND loadouts.status = 'ACTIVE'
    WHERE units.id = ?1 AND units.owner_id = ?2
    LIMIT 1`).bind(unitId, ownerId).first<LoadoutContextRow>();
}

export async function listInventoryEffects(db: D1Database, ownerId: string): Promise<InventoryEffectRow[]> {
  const result = await db.prepare(`SELECT
      inventory.id AS inventory_id, inventory.owner_id, inventory.assigned_unit_id,
      inventory.state AS inventory_state, inventory.revision AS inventory_revision,
      equipment.id AS equipment_definition_id, equipment.name, equipment.category,
      UPPER(equipment.slot_type) AS canonical_slot_type, equipment.definition_status,
      equipment.requisition_cost, equipment.consumable,
      equipment.source AS definition_source, equipment.notes AS definition_notes,
      equipment.definition_json, effects.effect_index, effects.effect_type, effects.effect_json,
      overlays.implementation_status, overlays.requisition_status, overlays.availability_status,
      overlays.executable, overlays.purchasable, overlays.reason_code,
      eligibility.required_tags_all_json, eligibility.required_tags_any_json,
      eligibility.forbidden_tags_json, eligibility.allowed_unit_definitions_json,
      eligibility.slot_types_json, eligibility.maximum_equipped
    FROM player_equipment_inventory AS inventory
    JOIN equipment_definitions AS equipment
      ON equipment.id = inventory.equipment_definition_id AND equipment.ruleset_id = inventory.ruleset_id
    LEFT JOIN equipment_effect_definitions AS effects
      ON effects.equipment_definition_id = equipment.id AND effects.ruleset_id = equipment.ruleset_id
    LEFT JOIN ruleset_implementation_overlays AS overlays
      ON overlays.definition_kind = 'EQUIPMENT' AND overlays.definition_id = equipment.id AND overlays.ruleset_id = equipment.ruleset_id
    LEFT JOIN equipment_eligibility_rules AS eligibility
      ON eligibility.equipment_definition_id = equipment.id AND eligibility.ruleset_id = equipment.ruleset_id
    WHERE inventory.owner_id = ?1 AND inventory.state IN ('AVAILABLE', 'ASSIGNED')
    ORDER BY inventory.id, effects.effect_index`).bind(ownerId).all<InventoryEffectRow>();
  return result.results;
}

export async function listUnitSlots(db: D1Database, definitionId: string, rulesetId: string): Promise<UnitSlotRow[]> {
  const result = await db.prepare(`SELECT UPPER(slot_type) AS slot_type, slot_count
      FROM unit_equipment_slot_definitions
      WHERE unit_definition_id = ?1 AND ruleset_id = ?2
        AND COALESCE(json_extract(eligibility_json, '$.canonicalActivation'), 'ACTIVE') <> 'CATALOGUED'
      ORDER BY slot_type`)
    .bind(definitionId, rulesetId).all<UnitSlotRow>();
  return result.results;
}

export async function listUnitTags(db: D1Database, definitionId: string, rulesetId: string): Promise<UnitTagRow[]> {
  const result = await db.prepare(`SELECT tags.id AS tag_id, tags.name
      FROM unit_definition_tags AS assigned
      JOIN tag_definitions AS tags ON tags.id = assigned.tag_id AND tags.ruleset_id = assigned.ruleset_id
      WHERE assigned.unit_definition_id = ?1 AND assigned.ruleset_id = ?2 ORDER BY tags.id`)
    .bind(definitionId, rulesetId).all<UnitTagRow>();
  return result.results;
}

export async function listUnitAbilities(db: D1Database, definitionId: string, rulesetId: string): Promise<UnitAbilityRow[]> {
  const result = await db.prepare(`SELECT abilities.id AS ability_id, abilities.name,
      abilities.action_definition_id, abilities.effect_json
      FROM unit_definition_abilities AS assigned
      JOIN ability_definitions AS abilities ON abilities.id = assigned.ability_id AND abilities.ruleset_id = assigned.ruleset_id
      WHERE assigned.unit_definition_id = ?1 AND assigned.ruleset_id = ?2 ORDER BY abilities.id`)
    .bind(definitionId, rulesetId).all<UnitAbilityRow>();
  return result.results;
}

export async function listUnitWeapons(db: D1Database, definitionId: string, rulesetId: string): Promise<UnitWeaponRow[]> {
  const result = await db.prepare(`SELECT weapons.id AS weapon_id, weapons.name,
      weapons.damage_dice_count, weapons.damage_die_sides, weapons.damage_modifier,
      weapons.armor_piercing, weapons.range_hexes, weapons.ammo_capacity,
      weapons.cooldown_rounds, weapons.indirect, weapons.definition_json
    FROM unit_definition_weapons AS assigned
    JOIN weapon_definitions AS weapons ON weapons.id = assigned.weapon_definition_id AND weapons.ruleset_id = assigned.ruleset_id
    WHERE assigned.unit_definition_id = ?1 AND assigned.ruleset_id = ?2 ORDER BY assigned.mount_role, assigned.mount_index`)
    .bind(definitionId, rulesetId).all<UnitWeaponRow>();
  return result.results;
}

export async function listRulesetWeapons(db: D1Database, rulesetId: string): Promise<UnitWeaponRow[]> {
  const result = await db.prepare(`SELECT id AS weapon_id, name,
      damage_dice_count, damage_die_sides, damage_modifier,
      armor_piercing, range_hexes, ammo_capacity, cooldown_rounds,
      indirect, definition_json
    FROM weapon_definitions WHERE ruleset_id = ?1 AND definition_status = 'active' ORDER BY id`)
    .bind(rulesetId).all<UnitWeaponRow>();
  return result.results;
}

export async function getUnitSupplies(db: D1Database, unitId: string): Promise<Record<string, number>> {
  const result = await db.prepare(`SELECT resource_type, current_quantity FROM player_unit_supplies
    WHERE player_unit_id = ?1 ORDER BY resource_type`).bind(unitId)
    .all<{ resource_type: string; current_quantity: number }>();
  return Object.fromEntries(result.results.map((row) => [row.resource_type, row.current_quantity]));
}

export async function listLoadoutItems(db: D1Database, loadoutId: string, unitId: string): Promise<LoadoutItemRow[]> {
  const result = await db.prepare(`SELECT inventory.id AS inventory_id,
      UPPER(items.owned_slot_type) AS slot_type, items.owned_slot_index AS slot_index,
      equipment.equipment_definition_id
    FROM player_unit_loadout_items AS items
    JOIN player_equipment_inventory AS inventory
      ON inventory.assigned_unit_id = items.player_unit_id
     AND inventory.source_unit_slot_type = items.owned_slot_type
     AND inventory.source_unit_slot_index = items.owned_slot_index
    JOIN player_unit_equipment AS equipment
      ON equipment.player_unit_id = items.player_unit_id
     AND equipment.slot_type = items.owned_slot_type
     AND equipment.slot_index = items.owned_slot_index
    WHERE items.loadout_id = ?1 AND items.player_unit_id = ?2
    ORDER BY items.owned_slot_type, items.owned_slot_index`).bind(loadoutId, unitId).all<LoadoutItemRow>();
  return result.results;
}

export async function hasLoadoutFacility(
  db: D1Database,
  ownerId: string,
  context: LoadoutContextRow,
  campaignId?: string,
): Promise<boolean> {
  // Reserve is the normal pre-campaign refit context. Campaign authority is
  // checked when the resulting immutable deployment snapshot is committed.
  if (context.location_state === 'RESERVE' && !campaignId) return true;
  if (context.location_state === 'ON_SHIP' && context.location_id) {
    const capability = await db.prepare(`SELECT 1
      FROM ship_effective_capabilities AS capabilities
      JOIN ships ON ships.id = capabilities.ship_id
      JOIN battalion_memberships AS memberships ON memberships.battalion_id = ships.battalion_id
      WHERE capabilities.ship_id = ?1 AND capabilities.capability_id = 'capability-change-infantry-loadout'
        AND capabilities.capacity > 0 AND memberships.user_id = ?2 AND memberships.status = 'ACTIVE'
      LIMIT 1`).bind(context.location_id, ownerId).first();
    if (capability) return true;
  }
  if (context.location_state === 'RESERVE' && campaignId) {
    const campaign = await db.prepare(`SELECT 1 FROM campaigns
      JOIN campaign_memberships ON campaign_memberships.campaign_id = campaigns.id
      WHERE campaigns.id = ?1 AND campaigns.status IN ('DRAFT','RECRUITING')
        AND campaign_memberships.user_id = ?2 AND campaign_memberships.side = 'ALLIED'
      LIMIT 1`).bind(campaignId, ownerId).first();
    return Boolean(campaign);
  }
  return false;
}

export interface DeploymentPlanRow {
  id: string; campaign_id: string; battalion_id: string; battlegroup_id: string | null;
  created_by: string; ruleset_id: string; status: string; deployment_method_id: string;
  insertion_zone_id: string | null; route_json: string; validation_json: string;
  revision: number; committed_at: number | null; created_at: number; updated_at: number;
}

export async function getDeploymentPlan(db: D1Database, userId: string, planId: string): Promise<DeploymentPlanRow | null> {
  return db.prepare(`SELECT plans.* FROM deployment_plans AS plans
    JOIN battalion_memberships AS memberships ON memberships.battalion_id = plans.battalion_id
    WHERE plans.id = ?1 AND memberships.user_id = ?2 AND memberships.status = 'ACTIVE'
    LIMIT 1`).bind(planId, userId).first<DeploymentPlanRow>();
}

export async function listDeploymentPlans(db: D1Database, userId: string): Promise<DeploymentPlanRow[]> {
  const result = await db.prepare(`SELECT plans.* FROM deployment_plans AS plans
    JOIN battalion_memberships AS memberships ON memberships.battalion_id = plans.battalion_id
    WHERE memberships.user_id = ?1 AND memberships.status = 'ACTIVE'
    ORDER BY plans.updated_at DESC, plans.id`).bind(userId).all<DeploymentPlanRow>();
  return result.results;
}

export interface DeploymentAuthorityRow {
  battalion_id: string;
  command_role: string;
  campaign_id: string;
  campaign_status: string;
  campaign_ruleset_id: string;
  side: string;
  campaign_role: string;
  operation_id: string | null;
  operation_node_id: string | null;
  operation_status: string | null;
  campaign_node_id: string | null;
  force_policy_json: string;
  reinforcement_policy_json: string | null;
  current_round: number;
}

export async function getDeploymentAuthority(
  db: D1Database,
  userId: string,
  campaignId: string,
): Promise<DeploymentAuthorityRow | null> {
  return db.prepare(`SELECT battalion_memberships.battalion_id, battalion_memberships.command_role,
      campaigns.id AS campaign_id, campaigns.status AS campaign_status,
      campaigns.ruleset_id AS campaign_ruleset_id,
      campaign_memberships.side, campaign_memberships.role AS campaign_role,
      operations.id AS operation_id, operations.node_id AS operation_node_id,
      operations.status AS operation_status, campaigns.strategic_node_id AS campaign_node_id
      ,campaigns.force_policy_json,operations.reinforcement_policy_json,
      COALESCE((SELECT MAX(round_number) + 1 FROM round_metadata WHERE campaign_id=campaigns.id),1) AS current_round
    FROM campaign_memberships
    JOIN campaigns ON campaigns.id = campaign_memberships.campaign_id
    LEFT JOIN strategic_operations AS operations ON operations.campaign_id = campaigns.id
    JOIN battalion_memberships
      ON battalion_memberships.battalion_id = campaign_memberships.battalion_id
     AND battalion_memberships.user_id = campaign_memberships.user_id
    WHERE campaign_memberships.campaign_id = ?1 AND campaign_memberships.user_id = ?2
      AND campaign_memberships.side = 'ALLIED' AND battalion_memberships.status = 'ACTIVE'
    LIMIT 1`).bind(campaignId, userId).first<DeploymentAuthorityRow>();
}

export interface DeploymentFormationRow {
  id: string;
  battalion_id: string;
  status: string;
  current_node_id: string | null;
  current_operation_id: string | null;
  current_carrier_task_force_id: string | null;
  revision: number;
  carrier_node_id: string | null;
  carrier_link_status: string | null;
}

export async function getDeploymentFormation(
  db: D1Database,
  battalionId: string,
  battlegroupId: string,
): Promise<DeploymentFormationRow | null> {
  return db.prepare(`SELECT groups.id,groups.battalion_id,groups.status,groups.current_node_id,
      groups.current_operation_id,groups.current_carrier_task_force_id,groups.revision,
      carriers.current_node_id AS carrier_node_id,links.status AS carrier_link_status
    FROM battlegroups AS groups
    LEFT JOIN task_forces AS carriers ON carriers.id=groups.current_carrier_task_force_id
    LEFT JOIN task_force_battlegroups AS links
      ON links.task_force_id=groups.current_carrier_task_force_id
     AND links.battlegroup_id=groups.id
     AND links.status IN ('EMBARKING','EMBARKED','DISEMBARKING')
    WHERE groups.id=?1 AND groups.battalion_id=?2 LIMIT 1`)
    .bind(battlegroupId, battalionId).first<DeploymentFormationRow>();
}

export async function getStrategicNodePlanetLocation(
  db: D1Database,
  nodeId: string,
): Promise<string | null> {
  const row = await db.prepare(`WITH RECURSIVE location_tree(id,parent_location_id,location_type) AS (
      SELECT locations.id,locations.parent_location_id,locations.location_type
      FROM strategic_nodes AS nodes
      JOIN strategic_locations AS locations ON locations.id=nodes.location_id
      WHERE nodes.id=?1
      UNION ALL
      SELECT parent.id,parent.parent_location_id,parent.location_type
      FROM strategic_locations AS parent
      JOIN location_tree AS child ON child.parent_location_id=parent.id
    )
    SELECT id FROM location_tree WHERE location_type='PLANET' LIMIT 1`)
    .bind(nodeId).first<{ id: string }>();
  return row?.id ?? null;
}

export interface InsertionZoneRow {
  id: string; campaign_id: string; hex_q: number; hex_r: number;
  allowed_methods_json: string; status: string; environment_json: string;
}

export async function listInsertionZones(db: D1Database, campaignId: string): Promise<InsertionZoneRow[]> {
  const result = await db.prepare(`SELECT * FROM campaign_insertion_zones
    WHERE campaign_id = ?1 AND status = 'OPEN' ORDER BY id`).bind(campaignId).all<InsertionZoneRow>();
  return result.results;
}

export interface DeploymentUnitRow {
  unit_id: string;
  owner_id: string;
  definition_id: string;
  loadout_id: string;
  unit_version: number;
  loadout_revision: number;
  battlegroup_id: string | null;
  unit_status: string;
  location_state: string;
  location_id: string | null;
  authority: "OWNER" | "DELEGATED" | "COMMAND" | "NONE";
}

export async function getDeploymentUnit(
  db: D1Database,
  actorUserId: string,
  battalionId: string,
  campaignId: string,
  unitId: string,
): Promise<DeploymentUnitRow | null> {
  return db.prepare(`SELECT units.id AS unit_id, units.owner_id, units.definition_id,
      loadouts.id AS loadout_id, units.version AS unit_version,
      loadouts.revision AS loadout_revision, links.battlegroup_id,
      units.status AS unit_status,units.location_state,units.location_id,
      CASE
        WHEN units.owner_id = ?1 THEN 'OWNER'
        WHEN memberships.command_role IN ('ADMIN','BATTALION_COMMAND') THEN 'COMMAND'
        WHEN EXISTS (
          SELECT 1 FROM unit_order_delegations AS delegations
          WHERE delegations.player_unit_id = units.id
            AND delegations.delegate_user_id = ?1
            AND delegations.battalion_id = ?2
            AND delegations.revoked_at IS NULL
            AND delegations.starts_at <= unixepoch()
            AND (delegations.ends_at IS NULL OR delegations.ends_at > unixepoch())
            AND ((delegations.scope_type = 'CAMPAIGN' AND delegations.campaign_id = ?3)
              OR (delegations.scope_type = 'BATTLEGROUP' AND delegations.battlegroup_id = links.battlegroup_id)
              OR delegations.scope_type = 'TIME_WINDOW')
        ) THEN 'DELEGATED'
        ELSE 'NONE'
      END AS authority
    FROM player_units AS units
    JOIN battlegroup_units AS links ON links.player_unit_id = units.id
    JOIN battlegroups AS groups ON groups.id = links.battlegroup_id AND groups.battalion_id = ?2
    JOIN battalion_memberships AS memberships
      ON memberships.battalion_id = groups.battalion_id AND memberships.user_id = ?1 AND memberships.status = 'ACTIVE'
    JOIN player_unit_loadouts AS loadouts
      ON loadouts.player_unit_id = units.id AND loadouts.loadout_kind = 'OWNED_DEFAULT' AND loadouts.status = 'ACTIVE'
    WHERE units.id = ?4 LIMIT 1`).bind(actorUserId, battalionId, campaignId, unitId).first<DeploymentUnitRow>();
}

export interface DeploymentMethodRow {
  id: string;
  ruleset_id: string;
  implementation_status: string;
  requirements_json: string;
}

export async function getDeploymentMethod(
  db: D1Database,
  rulesetId: string,
  methodId: string,
): Promise<DeploymentMethodRow | null> {
  return db.prepare(`SELECT id, ruleset_id, implementation_status, requirements_json
    FROM deployment_method_definitions WHERE id = ?1 AND ruleset_id = ?2 LIMIT 1`)
    .bind(methodId, rulesetId).first<DeploymentMethodRow>();
}

export interface StoredPlanUnitRow {
  player_unit_id: string;
  owner_id: string;
  loadout_id: string;
  owner_approval: string;
  command_approval: string;
  expected_unit_version: number;
  expected_loadout_revision: number;
}

export async function listDeploymentPlanUnits(db: D1Database, planId: string): Promise<StoredPlanUnitRow[]> {
  const result = await db.prepare(`SELECT * FROM deployment_plan_units
    WHERE deployment_plan_id = ?1 ORDER BY player_unit_id`).bind(planId).all<StoredPlanUnitRow>();
  return result.results;
}

export interface StoredTransportRow {
  carrier_unit_id: string;
  cargo_profile_id: string;
  ruleset_id: string;
  manifest_json: string;
  used_slots_quarters: number;
  capacity_slots_quarters: number;
}

export async function listDeploymentTransports(db: D1Database, planId: string): Promise<StoredTransportRow[]> {
  const result = await db.prepare(`SELECT * FROM deployment_transport_assignments
    WHERE deployment_plan_id = ?1 ORDER BY carrier_unit_id`).bind(planId).all<StoredTransportRow>();
  return result.results;
}

export async function getDeploymentReceipt(
  db: D1Database,
  actorUserId: string,
  commandId: string,
): Promise<{ operation: string; request_hash: string; response_json: string } | null> {
  return db.prepare(`SELECT operation, request_hash, response_json FROM deployment_mutation_receipts
    WHERE actor_user_id = ?1 AND command_id = ?2 LIMIT 1`).bind(actorUserId, commandId)
    .first<{ operation: string; request_hash: string; response_json: string }>();
}

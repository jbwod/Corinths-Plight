import type { Env } from "../env";

export interface CommandContextRow {
  user_id: string;
  username: string;
  user_status: string;
  user_created_at: number;
  last_active_at: number | null;
  display_name: string | null;
  profile_callsign: string | null;
  image_key: string | null;
  biography: string | null;
  timezone: string | null;
  battalion_id: string | null;
  battalion_name: string | null;
  short_name: string | null;
  battalion_description: string | null;
  insignia_key: string | null;
  motto: string | null;
  battalion_status: string | null;
  primary_ship_id: string | null;
  battalion_created_by: string | null;
  battalion_created_at: number | null;
  battalion_revision: number | null;
  rank_id: string | null;
  rank_name: string | null;
  member_count: number;
}

export interface PermissionRow {
  permission: string;
}

export interface RankRow {
  id: string;
  battalion_id: string;
  name: string;
  precedence: number;
  revision: number;
}

export interface RankPermissionRow extends PermissionRow {
  rank_id: string;
}

export interface BattalionMemberRow {
  battalion_id: string;
  user_id: string;
  display_name: string;
  callsign: string | null;
  rank_id: string;
  rank_name: string;
  status: string;
  joined_at: number;
  left_at: number | null;
  revision: number;
}

export interface BattlegroupRow {
  id: string;
  battalion_id: string;
  name: string;
  callsign: string | null;
  objective: string;
  leader_user_id: string | null;
  status: string;
  current_node_id: string | null;
  current_operation_id: string | null;
  current_carrier_task_force_id: string | null;
  revision: number;
  unit_count: number;
}

export interface BattlegroupUnitRow {
  battlegroup_id: string;
  unit_id: string;
  owner_id: string;
  definition_id: string;
  callsign: string;
  category: string;
  movement_domain: string | null;
  tags_json: string;
}

export interface ShipRow {
  id: string;
  battalion_id: string;
  ruleset_id: string;
  class_definition_id: string;
  class_name: string;
  name: string;
  registry: string | null;
  status: string;
  current_health: number;
  maximum_health: number;
  armor: number;
  external_slots: number;
  internal_slots: number;
  cargo_capacity: number;
  atmo_fuel: number | null;
  current_location_id: string | null;
  revision: number;
}

export interface ShipModuleRow {
  ship_id: string;
  definition_id: string;
  name: string;
  slot_type: string;
  slot_index: number;
  installation_status: string;
  revision: number;
  implementation_status: string | null;
  capability_id: string | null;
  capacity_delta: number | null;
}

export interface ShipCapabilityRow {
  ship_id: string;
  capability_id: string;
  capacity: number;
}

export interface ShipCargoRow {
  id: string;
  ship_id: string;
  resource_type: string;
  quantity: number;
  location_slot: string | null;
  state_json: string;
}

export interface ShipUnitCargoRow {
  unit_id: string;
  ship_id: string;
  definition_id: string;
  callsign: string;
}

export interface SupplyBalanceRow {
  store_id: string;
  holder_type: string;
  ship_id: string | null;
  task_force_id: string | null;
  location_id: string | null;
  player_unit_id: string | null;
  status: string;
  supply_size: string;
  quantity: number;
  capacity: number | null;
  revision: number;
}

export interface StrategicShipStateRow {
  id: string;
  battalion_id: string;
  current_node_id: string | null;
  revision: number;
}

export interface TaskForceRow {
  id: string;
  battalion_id: string;
  map_id: string;
  name: string;
  callsign: string;
  commander_user_id: string | null;
  current_node_id: string | null;
  status: string;
  supply_state: string;
  supplied_until_round: number | null;
  revision: number;
  state_json: string;
}

export interface TaskForceMemberRow {
  task_force_id: string;
  member_id: string;
}

export interface StrategicMapRow {
  id: string;
  name: string;
  scope: string;
  root_location_id: string;
  ruleset_id: string;
  coordinator_key: string;
  status: string;
  clock_mode: string;
  tick_interval_seconds: number | null;
  current_round: number;
  paused: number;
  revision: number;
  configuration_json: string;
}

export interface StrategicRoundRow {
  map_id: string;
  round_number: number;
  status: string;
  ruleset_id: string;
  resolver_version: string;
  opens_at: number;
  lock_at: number | null;
  resolves_at: number | null;
  locked_at: number | null;
  resolved_at: number | null;
  resolution_key: string | null;
  input_hash: string | null;
  result_hash: string | null;
  revision: number;
  state_json: string;
}

export interface StrategicNodeRow {
  id: string;
  map_id: string;
  location_id: string;
  node_type: string;
  name: string;
  control_status: string;
  status: string;
  position_json: string;
  visibility_json: string;
  revision: number;
}

export interface StrategicRouteRow {
  id: string;
  map_id: string;
  from_node_id: string;
  to_node_id: string;
  route_type: string;
  bidirectional: number;
  base_travel_rounds: number | null;
  travel_cost_status: string;
  allowed_profiles_json: string;
  status: string;
  revision: number;
}

export interface OperationRow {
  id: string;
  map_id: string;
  node_id: string;
  campaign_id: string | null;
  ruleset_id: string;
  code: string;
  name: string;
  role_summary: string;
  status: string;
  threat_level: string;
  objectives_json: string;
  recommended_capabilities_json: string;
  deployment_rules_json: string;
  reinforcement_policy_json: string;
  known_enemy_json: string;
  outcome_json: string | null;
  starts_at: number | null;
  ends_at: number | null;
  revision: number;
  deployed_battlegroup_ids_json: string;
}

export interface StrategicEventRow {
  event_id: string;
  map_id: string | null;
  round_number: number | null;
  sequence: number | null;
  event_type: string;
  battalion_id: string | null;
  actor_user_id: string | null;
  audience: string;
  subject_type: string | null;
  subject_id: string | null;
  summary: string;
  payload_json: string;
  occurred_at: number;
}

export interface FormationAuthorityRow {
  formation_id: string;
  formation_kind: "TASK_FORCE" | "BATTLEGROUP";
  battalion_id: string;
  map_id: string | null;
  current_node_id: string | null;
  carrier_task_force_id: string | null;
  revision: number;
  commander_user_id: string | null;
  total_units: number;
  owned_units: number;
  delegated_units: number;
}

export interface StrategicOrderRow {
  id: string;
  map_id: string;
  round_number: number;
  battalion_id: string;
  actor_user_id: string;
  order_type: string;
  subject_type: string;
  task_force_id: string | null;
  battlegroup_id: string | null;
  destination_node_id: string | null;
  operation_id: string | null;
  lifecycle: string;
  route_json: string;
  intent_json: string;
  command_id: string;
  request_hash: string;
  expected_subject_revision: number;
  revision: number;
  submitted_at: number | null;
  failure_code: string | null;
}


export async function listStrategicOrders(
  db: Env["DB"],
  mapId: string,
  round: number,
): Promise<StrategicOrderRow[]> {
  const result = await db
    .prepare(`SELECT id, map_id, round_number, battalion_id, actor_user_id,
                    order_type, subject_type, task_force_id, battlegroup_id,
                    destination_node_id, operation_id, lifecycle, route_json,
                    intent_json, command_id, request_hash,
                    expected_subject_revision, revision, submitted_at, failure_code
               FROM strategic_orders
              WHERE map_id = ?1 AND round_number = ?2
              ORDER BY id`)
    .bind(mapId, round)
    .all<StrategicOrderRow>();
  return result.results;
}

export async function listStrategicRoundEvents(
  db: Env["DB"],
  mapId: string,
  round: number,
): Promise<StrategicEventRow[]> {
  const result = await db
    .prepare(`SELECT event_id, map_id, round_number, sequence, event_type,
                    battalion_id, actor_user_id, audience, subject_type, subject_id,
                    summary, payload_json, occurred_at
               FROM strategic_events
              WHERE map_id = ?1 AND round_number = ?2
              ORDER BY sequence, event_id`)
    .bind(mapId, round)
    .all<StrategicEventRow>();
  return result.results;
}

export async function listStrategicShipStates(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  mapId: string,
): Promise<StrategicShipStateRow[]> {
  const result = await db
    .prepare(`SELECT ships.id, ships.battalion_id, forces.current_node_id, ships.revision
               FROM task_force_ships AS links
               JOIN task_forces AS forces
                 ON forces.id = links.task_force_id
                AND forces.battalion_id = links.battalion_id
               JOIN ships
                 ON ships.id = links.ship_id
                AND ships.battalion_id = links.battalion_id
              WHERE forces.map_id = ?3
                AND links.status = 'ACTIVE'
                AND forces.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = forces.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY ships.id`)
    .bind(userId, battalionId, mapId)
    .all<StrategicShipStateRow>();
  return result.results;
}

export async function getCommandContext(db: Env["DB"], userId: string): Promise<CommandContextRow | null> {
  return db
    .prepare(`SELECT users.id AS user_id, users.username, users.status AS user_status,
                    users.created_at AS user_created_at, users.last_active_at,
                    profiles.display_name, profiles.callsign AS profile_callsign,
                    profiles.image_key, profiles.biography, profiles.timezone,
                    active.battalion_id, battalions.name AS battalion_name,
                    battalions.short_name, battalions.description AS battalion_description,
                    battalions.insignia_key, battalions.motto,
                    battalions.status AS battalion_status,
                    battalions.primary_ship_id,
                    battalions.created_by AS battalion_created_by,
                    battalions.created_at AS battalion_created_at,
                    battalions.revision AS battalion_revision,
                    memberships.rank_id, ranks.name AS rank_name,
                    COALESCE((SELECT COUNT(*) FROM battalion_memberships AS counted
                               WHERE counted.battalion_id = active.battalion_id
                                 AND counted.status = 'ACTIVE'), 0) AS member_count
               FROM users
               LEFT JOIN profiles ON profiles.user_id = users.id
               LEFT JOIN user_active_battalions AS active ON active.user_id = users.id
               LEFT JOIN battalion_memberships AS memberships
                 ON memberships.battalion_id = active.battalion_id
                AND memberships.user_id = users.id
                AND memberships.status = 'ACTIVE'
               LEFT JOIN battalions
                 ON battalions.id = active.battalion_id
                AND battalions.status = 'ACTIVE'
               LEFT JOIN battalion_ranks AS ranks ON ranks.id = memberships.rank_id
              WHERE users.id = ?1 AND users.status = 'ACTIVE'
              LIMIT 1`)
    .bind(userId)
    .first<CommandContextRow>();
}

export async function listActivePermissions(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<PermissionRow[]> {
  const result = await db
    .prepare(`SELECT permissions.permission
               FROM battalion_memberships AS memberships
               JOIN rank_permissions AS permissions ON permissions.rank_id = memberships.rank_id
               JOIN battalion_permission_definitions AS definitions
                 ON definitions.permission = permissions.permission
                AND definitions.implementation_status = 'ACTIVE'
              WHERE memberships.user_id = ?1
                AND memberships.battalion_id = ?2
                AND memberships.status = 'ACTIVE'
              ORDER BY permissions.permission`)
    .bind(userId, battalionId)
    .all<PermissionRow>();
  return result.results;
}

export async function listBattalionRanks(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<RankRow[]> {
  const result = await db
    .prepare(`SELECT ranks.id, ranks.battalion_id, ranks.name,
                    ranks.precedence, ranks.revision
               FROM battalion_ranks AS ranks
              WHERE ranks.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ranks.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY ranks.precedence, ranks.id`)
    .bind(userId, battalionId)
    .all<RankRow>();
  return result.results;
}

export async function listRankPermissions(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<RankPermissionRow[]> {
  const result = await db
    .prepare(`SELECT permissions.rank_id, permissions.permission
               FROM rank_permissions AS permissions
               JOIN battalion_ranks AS ranks ON ranks.id = permissions.rank_id
              WHERE ranks.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ranks.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY permissions.rank_id, permissions.permission`)
    .bind(userId, battalionId)
    .all<RankPermissionRow>();
  return result.results;
}

export async function listBattalionMembers(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<BattalionMemberRow[]> {
  const result = await db
    .prepare(`SELECT memberships.battalion_id, memberships.user_id,
                    COALESCE(profiles.display_name, users.username) AS display_name,
                    profiles.callsign, memberships.rank_id, ranks.name AS rank_name,
                    memberships.status, memberships.joined_at, memberships.left_at,
                    memberships.revision
               FROM battalion_memberships AS memberships
               JOIN users ON users.id = memberships.user_id
               LEFT JOIN profiles ON profiles.user_id = memberships.user_id
               JOIN battalion_ranks AS ranks ON ranks.id = memberships.rank_id
              WHERE memberships.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = memberships.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY ranks.precedence, display_name, memberships.user_id`)
    .bind(userId, battalionId)
    .all<BattalionMemberRow>();
  return result.results;
}

export async function listBattlegroups(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<BattlegroupRow[]> {
  const result = await db
    .prepare(`SELECT groups.id, groups.battalion_id, groups.name, groups.callsign,
                    groups.objective, groups.leader_user_id, groups.status,
                    groups.current_node_id, groups.current_operation_id,
                    groups.current_carrier_task_force_id, groups.revision,
                    COUNT(units.player_unit_id) AS unit_count
               FROM battlegroups AS groups
               LEFT JOIN battlegroup_units AS units ON units.battlegroup_id = groups.id
              WHERE groups.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = groups.battalion_id
                               AND viewer.status = 'ACTIVE')
              GROUP BY groups.id
              ORDER BY groups.name, groups.id`)
    .bind(userId, battalionId)
    .all<BattlegroupRow>();
  return result.results;
}

export async function listBattlegroupUnits(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<BattlegroupUnitRow[]> {
  const result = await db
    .prepare(`SELECT links.battlegroup_id, units.id AS unit_id, units.owner_id,
                    units.definition_id, units.callsign, definitions.category,
                    movement.domain AS movement_domain,
                    COALESCE((SELECT json_group_array(tags.name)
                                FROM unit_definition_tags AS links_tags
                                JOIN tag_definitions AS tags
                                  ON tags.id = links_tags.tag_id
                                 AND tags.ruleset_id = links_tags.ruleset_id
                               WHERE links_tags.unit_definition_id = units.definition_id
                                 AND links_tags.ruleset_id = units.ruleset_id), '[]') AS tags_json
               FROM battlegroup_units AS links
               JOIN battlegroups AS groups ON groups.id = links.battlegroup_id
               JOIN player_units AS units ON units.id = links.player_unit_id
               JOIN unit_class_definitions AS definitions
                 ON definitions.id = units.definition_id AND definitions.ruleset_id = units.ruleset_id
               LEFT JOIN unit_definition_profiles AS profiles
                 ON profiles.unit_definition_id = units.definition_id AND profiles.ruleset_id = units.ruleset_id
               LEFT JOIN movement_profile_definitions AS movement
                 ON movement.id = profiles.movement_profile_id AND movement.ruleset_id = units.ruleset_id
              WHERE groups.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = groups.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY links.battlegroup_id, units.id`)
    .bind(userId, battalionId)
    .all<BattlegroupUnitRow>();
  return result.results;
}

export async function getPrimaryShip(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<ShipRow | null> {
  return db
    .prepare(`SELECT ships.id, ships.battalion_id, ships.ruleset_id,
                    ships.class_definition_id, classes.name AS class_name,
                    ships.name, ships.registry, ships.status, ships.current_health,
                    classes.health AS maximum_health, classes.armor,
                    classes.external_slots, classes.internal_slots,
                    classes.cargo_capacity, classes.atmo_fuel,
                    ships.current_location_id, ships.revision
               FROM battalions
               JOIN ships ON ships.id = battalions.primary_ship_id
                        AND ships.battalion_id = battalions.id
               JOIN ship_class_definitions AS classes
                 ON classes.id = ships.class_definition_id AND classes.ruleset_id = ships.ruleset_id
              WHERE battalions.id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = battalions.id
                               AND viewer.status = 'ACTIVE')
              LIMIT 1`)
    .bind(userId, battalionId)
    .first<ShipRow>();
}

export async function listShipModules(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  shipId: string,
): Promise<ShipModuleRow[]> {
  const result = await db
    .prepare(`SELECT equipment.ship_id, equipment.equipment_definition_id AS definition_id,
                    definitions.name, equipment.slot_type, equipment.slot_index,
                    equipment.installation_status, equipment.revision,
                    overlays.implementation_status,
                    grants.capability_id, grants.capacity_delta
               FROM ship_equipment AS equipment
               JOIN ships ON ships.id = equipment.ship_id
               JOIN equipment_definitions AS definitions
                 ON definitions.id = equipment.equipment_definition_id
                AND definitions.ruleset_id = equipment.ruleset_id
               LEFT JOIN ruleset_implementation_overlays AS overlays
                 ON overlays.definition_kind = 'SHIP_MODULE'
                AND overlays.definition_id = definitions.id
                AND overlays.ruleset_id = definitions.ruleset_id
               LEFT JOIN ship_module_capability_grants AS grants
                 ON grants.equipment_definition_id = definitions.id
                AND grants.ruleset_id = definitions.ruleset_id
              WHERE equipment.ship_id = ?3
                AND ships.battalion_id = ?2
                AND equipment.installation_status <> 'REMOVED'
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ships.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY equipment.slot_type, equipment.slot_index, grants.capability_id`)
    .bind(userId, battalionId, shipId)
    .all<ShipModuleRow>();
  return result.results;
}

export async function listShipCapabilities(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  shipId: string,
): Promise<ShipCapabilityRow[]> {
  const result = await db
    .prepare(`SELECT capabilities.ship_id, capabilities.capability_id, capabilities.capacity
               FROM ship_effective_capabilities AS capabilities
               JOIN ships ON ships.id = capabilities.ship_id
              WHERE capabilities.ship_id = ?3 AND ships.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ships.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY capabilities.capability_id`)
    .bind(userId, battalionId, shipId)
    .all<ShipCapabilityRow>();
  return result.results;
}

export async function listShipCargo(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  shipId: string,
): Promise<ShipCargoRow[]> {
  const result = await db
    .prepare(`SELECT cargo.id, cargo.ship_id, cargo.resource_type, cargo.quantity,
                    cargo.location_slot, cargo.state_json
               FROM ship_cargo AS cargo
               JOIN ships ON ships.id = cargo.ship_id
              WHERE cargo.ship_id = ?3 AND ships.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ships.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY cargo.resource_type, cargo.id`)
    .bind(userId, battalionId, shipId)
    .all<ShipCargoRow>();
  return result.results;
}

export async function listShipUnitCargo(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  shipId: string,
): Promise<ShipUnitCargoRow[]> {
  const result = await db
    .prepare(`SELECT units.id AS unit_id, units.location_id AS ship_id,
                    units.definition_id, units.callsign
               FROM player_units AS units
               JOIN ships ON ships.id = units.location_id
              WHERE units.location_state = 'ON_SHIP'
                AND units.location_id = ?3
                AND ships.battalion_id = ?2
                AND units.status NOT IN ('DESTROYED', 'RETIRED')
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ships.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY units.id`)
    .bind(userId, battalionId, shipId)
    .all<ShipUnitCargoRow>();
  return result.results;
}

export async function listSupplyBalances(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<SupplyBalanceRow[]> {
  const result = await db
    .prepare(`SELECT stores.id AS store_id, stores.holder_type, stores.ship_id,
                    stores.task_force_id, stores.location_id, stores.player_unit_id,
                    stores.status, balances.supply_size, balances.quantity, balances.capacity,
                    balances.revision
               FROM strategic_supply_stores AS stores
               JOIN strategic_supply_balances AS balances ON balances.store_id = stores.id
              WHERE stores.battalion_id = ?2
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = stores.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY stores.id, balances.supply_size`)
    .bind(userId, battalionId)
    .all<SupplyBalanceRow>();
  return result.results;
}

export async function listTaskForces(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  mapId?: string,
): Promise<TaskForceRow[]> {
  const result = await db
    .prepare(`SELECT forces.id, forces.battalion_id, forces.map_id, forces.name,
                    forces.callsign, forces.commander_user_id, forces.current_node_id,
                    forces.status, forces.supply_state, forces.supplied_until_round,
                    forces.revision, forces.state_json
               FROM task_forces AS forces
              WHERE forces.battalion_id = ?2
                AND (?3 IS NULL OR forces.map_id = ?3)
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = forces.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY forces.name, forces.id`)
    .bind(userId, battalionId, mapId ?? null)
    .all<TaskForceRow>();
  return result.results;
}

export async function listTaskForceShips(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<TaskForceMemberRow[]> {
  const result = await db
    .prepare(`SELECT links.task_force_id, links.ship_id AS member_id
               FROM task_force_ships AS links
              WHERE links.battalion_id = ?2 AND links.status = 'ACTIVE'
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = links.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY links.task_force_id, links.ship_id`)
    .bind(userId, battalionId)
    .all<TaskForceMemberRow>();
  return result.results;
}

export async function listTaskForceBattlegroups(
  db: Env["DB"],
  userId: string,
  battalionId: string,
): Promise<TaskForceMemberRow[]> {
  const result = await db
    .prepare(`SELECT links.task_force_id, links.battlegroup_id AS member_id
               FROM task_force_battlegroups AS links
              WHERE links.battalion_id = ?2
                AND links.status IN ('EMBARKING', 'EMBARKED', 'DISEMBARKING')
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = links.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY links.task_force_id, links.battlegroup_id`)
    .bind(userId, battalionId)
    .all<TaskForceMemberRow>();
  return result.results;
}

export async function getStrategicMap(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  mapId: string,
): Promise<StrategicMapRow | null> {
  return db
    .prepare(`SELECT maps.id, maps.name, maps.scope, maps.root_location_id,
                    maps.ruleset_id, maps.coordinator_key, maps.status,
                    maps.clock_mode, maps.tick_interval_seconds,
                    maps.current_round, maps.paused, maps.revision,
                    maps.configuration_json
               FROM strategic_maps AS maps
              WHERE maps.id = ?3 AND maps.status IN ('ACTIVE', 'PAUSED')
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ?2
                               AND viewer.status = 'ACTIVE')
              LIMIT 1`)
    .bind(userId, battalionId, mapId)
    .first<StrategicMapRow>();
}

export async function getStrategicRound(
  db: Env["DB"],
  mapId: string,
  round: number,
): Promise<StrategicRoundRow | null> {
  return db
    .prepare(`SELECT map_id, round_number, status, ruleset_id, resolver_version,
                    opens_at, lock_at, resolves_at, locked_at, resolved_at,
                    resolution_key, input_hash, result_hash, revision, state_json
               FROM strategic_rounds
              WHERE map_id = ?1 AND round_number = ?2
              LIMIT 1`)
    .bind(mapId, round)
    .first<StrategicRoundRow>();
}

export async function listStrategicNodes(db: Env["DB"], mapId: string): Promise<StrategicNodeRow[]> {
  const result = await db
    .prepare(`SELECT id, map_id, location_id, node_type, name, control_status,
                    status, position_json, visibility_json, revision
               FROM strategic_nodes
              WHERE map_id = ?1
              ORDER BY name, id`)
    .bind(mapId)
    .all<StrategicNodeRow>();
  return result.results;
}

export async function listStrategicRoutes(db: Env["DB"], mapId: string): Promise<StrategicRouteRow[]> {
  const result = await db
    .prepare(`SELECT id, map_id, from_node_id, to_node_id, route_type,
                    bidirectional, base_travel_rounds, travel_cost_status,
                    allowed_profiles_json, status, revision
               FROM strategic_routes
              WHERE map_id = ?1
              ORDER BY id`)
    .bind(mapId)
    .all<StrategicRouteRow>();
  return result.results;
}

export async function listOperations(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  mapId?: string,
): Promise<OperationRow[]> {
  const result = await db
    .prepare(`SELECT operations.id, operations.map_id, operations.node_id,
                    operations.campaign_id, operations.ruleset_id, operations.code,
                    operations.name, operations.role_summary, operations.status,
                    operations.threat_level, operations.objectives_json,
                    operations.recommended_capabilities_json,
                    operations.deployment_rules_json,
                    operations.reinforcement_policy_json,
                    operations.known_enemy_json, operations.outcome_json,
                    operations.starts_at, operations.ends_at, operations.revision,
                    COALESCE((SELECT json_group_array(groups.id)
                                FROM battlegroups AS groups
                               WHERE groups.battalion_id = ?2
                                 AND groups.current_operation_id = operations.id), '[]')
                      AS deployed_battlegroup_ids_json
               FROM strategic_operations AS operations
               JOIN strategic_nodes AS operation_node
                 ON operation_node.id = operations.node_id
                AND operation_node.map_id = operations.map_id
              WHERE (?3 IS NULL OR operations.map_id = ?3)
                AND operations.status <> 'CANCELLED'
                AND (
                  COALESCE(json_extract(operation_node.visibility_json, '$.public'), 1) = 1
                  OR EXISTS (
                    SELECT 1
                      FROM json_each(json_extract(operation_node.visibility_json, '$.battalionIds')) AS visible
                     WHERE visible.value = ?2
                  )
                )
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = ?2
                               AND viewer.status = 'ACTIVE')
              ORDER BY CASE operations.status
                         WHEN 'ACTIVE' THEN 0 WHEN 'MUSTERING' THEN 1
                         WHEN 'ANNOUNCED' THEN 2 ELSE 3 END,
                       operations.name, operations.id`)
    .bind(userId, battalionId, mapId ?? null)
    .all<OperationRow>();
  return result.results;
}

export async function getOperation(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  operationId: string,
): Promise<OperationRow | null> {
  const operations = await listOperations(db, userId, battalionId);
  return operations.find((operation) => operation.id === operationId) ?? null;
}

export async function listBattalionActivity(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  before: number | null,
  limit: number,
): Promise<StrategicEventRow[]> {
  const result = await db
    .prepare(`SELECT event_id, map_id, round_number, sequence, event_type,
                    battalion_id, actor_user_id, audience, subject_type, subject_id,
                    summary, payload_json, occurred_at
               FROM strategic_events AS events
              WHERE events.battalion_id = ?2
                AND events.audience IN ('BATTALION', 'PUBLIC')
                AND (?3 IS NULL OR events.occurred_at < ?3)
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = events.battalion_id
                               AND viewer.status = 'ACTIVE')
              ORDER BY events.occurred_at DESC, events.event_id DESC
              LIMIT ?4`)
    .bind(userId, battalionId, before, limit)
    .all<StrategicEventRow>();
  return result.results;
}

export async function getFormationAuthority(
  db: Env["DB"],
  userId: string,
  battalionId: string,
  mapId: string,
  formationKind: "TASK_FORCE" | "BATTLEGROUP",
  formationId: string,
): Promise<FormationAuthorityRow | null> {
  if (formationKind === "TASK_FORCE") {
    return db
      .prepare(`SELECT forces.id AS formation_id, 'TASK_FORCE' AS formation_kind,
                      forces.battalion_id, forces.map_id, forces.current_node_id,
                      forces.revision, forces.commander_user_id,
                      NULL AS carrier_task_force_id,
                      0 AS total_units, 0 AS owned_units, 0 AS delegated_units
                 FROM task_forces AS forces
                WHERE forces.id = ?5 AND forces.battalion_id = ?2 AND forces.map_id = ?3
                  AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                               WHERE viewer.user_id = ?1
                                 AND viewer.battalion_id = forces.battalion_id
                                 AND viewer.status = 'ACTIVE')
                LIMIT 1`)
      .bind(userId, battalionId, mapId, formationKind, formationId)
      .first<FormationAuthorityRow>();
  }
  return db
    .prepare(`SELECT groups.id AS formation_id, 'BATTLEGROUP' AS formation_kind,
                    groups.battalion_id,
                    COALESCE(forces.map_id, ?3) AS map_id,
                    COALESCE(groups.current_node_id, forces.current_node_id) AS current_node_id,
                    groups.revision, groups.leader_user_id AS commander_user_id,
                    groups.current_carrier_task_force_id AS carrier_task_force_id,
                    COUNT(units.id) AS total_units,
                    SUM(CASE WHEN units.owner_id = ?1 THEN 1 ELSE 0 END) AS owned_units,
                    SUM(CASE WHEN EXISTS (
                          SELECT 1 FROM unit_order_delegations AS delegations
                           WHERE delegations.player_unit_id = units.id
                             AND delegations.delegate_user_id = ?1
                             AND delegations.battalion_id = groups.battalion_id
                             AND delegations.revoked_at IS NULL
                             AND delegations.starts_at <= unixepoch()
                             AND (delegations.ends_at IS NULL OR delegations.ends_at > unixepoch())
                             AND delegations.scope_type = 'BATTLEGROUP'
                             AND delegations.battlegroup_id = groups.id
                        ) THEN 1 ELSE 0 END) AS delegated_units
               FROM battlegroups AS groups
               LEFT JOIN task_forces AS forces ON forces.id = groups.current_carrier_task_force_id
               LEFT JOIN battlegroup_units AS links ON links.battlegroup_id = groups.id
               LEFT JOIN player_units AS units ON units.id = links.player_unit_id
              WHERE groups.id = ?5 AND groups.battalion_id = ?2
                AND (groups.current_node_id IS NULL OR EXISTS (
                  SELECT 1 FROM strategic_nodes AS nodes
                   WHERE nodes.id = groups.current_node_id AND nodes.map_id = ?3
                ))
                AND (forces.id IS NULL OR forces.map_id = ?3)
                AND EXISTS (SELECT 1 FROM battalion_memberships AS viewer
                             WHERE viewer.user_id = ?1
                               AND viewer.battalion_id = groups.battalion_id
                               AND viewer.status = 'ACTIVE')
              GROUP BY groups.id
              LIMIT 1`)
    .bind(userId, battalionId, mapId, formationKind, formationId)
    .first<FormationAuthorityRow>();
}

export async function getStrategicOrderByCommand(
  db: Env["DB"],
  actorUserId: string,
  commandId: string,
): Promise<StrategicOrderRow | null> {
  return db
    .prepare(`SELECT id, map_id, round_number, battalion_id, actor_user_id,
                    order_type, subject_type, task_force_id, battlegroup_id,
                    destination_node_id, operation_id, lifecycle, route_json,
                    intent_json, command_id, request_hash,
                    expected_subject_revision, revision, submitted_at, failure_code
               FROM strategic_orders
              WHERE actor_user_id = ?1 AND command_id = ?2
              LIMIT 1`)
    .bind(actorUserId, commandId)
    .first<StrategicOrderRow>();
}

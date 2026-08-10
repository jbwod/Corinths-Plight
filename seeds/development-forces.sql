PRAGMA foreign_keys = ON;

-- Explicit local-development fixture. Never run this file against production.
INSERT INTO users (id, email, username, status)
VALUES ('demo-user', 'demo@local.corinth.invalid', 'demo-user', 'ACTIVE')
ON CONFLICT(id) DO UPDATE SET status = 'ACTIVE';

INSERT INTO profiles (user_id, display_name, callsign, biography)
VALUES (
  'demo-user',
  '33rd Expeditionary Commander',
  'CORINTH',
  'Development-only persistent-force identity for Operation Iron Rain exercises.'
)
ON CONFLICT(user_id) DO UPDATE SET
  display_name = excluded.display_name,
  callsign = excluded.callsign,
  biography = excluded.biography;

INSERT INTO requisition_transactions (
  id, user_id, amount, reason_code, description, idempotency_key
) VALUES (
  'demo-requisition-opening',
  'demo-user',
  30,
  'DEVELOPMENT_OPENING_BALANCE',
  'Development-only requisition balance.',
  'demo:requisition:opening'
)
ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, description = excluded.description;

INSERT INTO battalions (id, name, description, created_by)
VALUES (
  'battalion-33rd-expeditionary',
  '33rd Expeditionary Battalion',
  'Development combined-arms formation assigned to Operation Iron Rain.',
  'demo-user'
)
ON CONFLICT(id) DO UPDATE SET description = excluded.description;

INSERT INTO battalion_ranks (id, battalion_id, name, precedence)
VALUES ('rank-33rd-commander', 'battalion-33rd-expeditionary', 'Battalion Commander', 1)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, precedence = excluded.precedence;

INSERT INTO battalion_memberships (
  battalion_id, user_id, rank_id, status, command_role
) VALUES (
  'battalion-33rd-expeditionary', 'demo-user', 'rank-33rd-commander', 'ACTIVE', 'BATTALION_COMMAND'
)
ON CONFLICT(battalion_id, user_id) DO UPDATE SET
  rank_id = excluded.rank_id,
  status = excluded.status,
  command_role = excluded.command_role;

INSERT INTO planets (
  id, name, strategic_coord_json, environment_json, war_state_json
) VALUES (
  'planet-corinth',
  'Corinth',
  '{"q":17,"r":-8}',
  '{"biome":"TEMPERATE_FRONTIER","developmentFixture":true}',
  '{"contested":true,"primaryThreat":"BUG_SWARM"}'
)
ON CONFLICT(id) DO UPDATE SET
  environment_json = excluded.environment_json,
  war_state_json = excluded.war_state_json;

INSERT INTO campaigns (
  id, planet_id, ruleset_id, name, status, round_duration_ms,
  map_source_key, minimum_players, maximum_players, created_by,
  started_at, completed_at, force_policy_json
) VALUES
  (
    'outpost-k17', 'planet-corinth', 'ruleset-v5-core-curated-1',
    'Outpost K-17', 'COMPLETE', 300000, 'fixture/outpost-k17',
    1, 8, 'demo-user', 1778500000, 1786270000, '{}'
  ),
  (
    'operation-iron-rain', 'planet-corinth', 'ruleset-v5-core-curated-1',
    'Operation Iron Rain', 'RECRUITING', 300000, 'fixture/operation-iron-rain',
    2, 8, 'demo-user', NULL, NULL,
    '{"allowedCategories":["INFANTRY","SUPPORT","ENGINEER","ARTILLERY","ARMOUR","MECH","AEROSPACE"],"requiresShip":true}'
  )
ON CONFLICT(id) DO UPDATE SET
  status = excluded.status,
  round_duration_ms = excluded.round_duration_ms,
  map_source_key = excluded.map_source_key,
  minimum_players = excluded.minimum_players,
  maximum_players = excluded.maximum_players,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  force_policy_json = excluded.force_policy_json;

INSERT INTO campaign_memberships (
  campaign_id, user_id, battalion_id, side, role
) VALUES
  ('outpost-k17', 'demo-user', 'battalion-33rd-expeditionary', 'ALLIED', 'BATTALION_COMMAND'),
  ('operation-iron-rain', 'demo-user', 'battalion-33rd-expeditionary', 'ALLIED', 'BATTALION_COMMAND')
ON CONFLICT(campaign_id, user_id) DO UPDATE SET
  battalion_id = excluded.battalion_id,
  side = excluded.side,
  role = excluded.role;

INSERT INTO ships (
  id, battalion_id, ruleset_id, class_definition_id, name,
  status, current_health, location_planet_id, state_json
) VALUES (
  'ship-corinth-ward',
  'battalion-33rd-expeditionary',
  'ruleset-v5-core-curated-1',
  'ship-destroyer',
  'Corinth Ward',
  'ORBIT',
  10,
  'planet-corinth',
  '{"fixture":"OPERATION_IRON_RAIN","developmentOnly":true}'
)
ON CONFLICT(id) DO UPDATE SET
  status = excluded.status,
  current_health = excluded.current_health,
  state_json = excluded.state_json;

UPDATE battalions
SET primary_ship_id = 'ship-corinth-ward'
WHERE id = 'battalion-33rd-expeditionary';

DELETE FROM ship_equipment
 WHERE ship_id = 'ship-corinth-ward'
   AND equipment_definition_id = 'equipment-mobile-infantry'
   AND NOT (slot_type = 'EXTERNAL_INTERNAL' AND slot_index = 0);

INSERT INTO ship_equipment (
  ship_id, equipment_definition_id, ruleset_id, slot_type, slot_index, state_json
) VALUES
  ('ship-corinth-ward', 'equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'EXTERNAL', 0, '{}'),
  ('ship-corinth-ward', 'equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'EXTERNAL', 1, '{}'),
  ('ship-corinth-ward', 'equipment-mech-bay', 'ruleset-v5-core-curated-1', 'EXTERNAL', 2, '{}'),
  ('ship-corinth-ward', 'equipment-armory', 'ruleset-v5-core-curated-1', 'INTERNAL', 0, '{}'),
  ('ship-corinth-ward', 'equipment-mobile-infantry', 'ruleset-v5-core-curated-1', 'EXTERNAL_INTERNAL', 0, '{"reservesSlots":["EXTERNAL","INTERNAL"]}'),
  ('ship-corinth-ward', 'equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'INTERNAL', 2, '{}')
ON CONFLICT(ship_id, slot_type, slot_index) DO UPDATE SET
  equipment_definition_id = excluded.equipment_definition_id,
  ruleset_id = excluded.ruleset_id,
  state_json = excluded.state_json;

INSERT INTO battlegroups (
  id, battalion_id, name, objective, leader_user_id, persistent
) VALUES (
  'battlegroup-hammer',
  'battalion-33rd-expeditionary',
  'Hammer',
  'Combined-arms field group for Operation Iron Rain.',
  'demo-user',
  1
)
ON CONFLICT(id) DO UPDATE SET objective = excluded.objective, leader_user_id = excluded.leader_user_id;

WITH roster(
  id, definition_id, callsign, name, description, service_campaigns, service_rounds
) AS (
  VALUES
    ('force-raven-2', 'unit-infantry-squad', 'RAVEN-2', '2nd Corinth Line Section', 'Flexible line infantry configured for prepared defence.', 2, 18),
    ('force-spectre', 'unit-special-forces', 'SPECTRE', 'Spectre Special Operations Section', 'Development-only stealth and sabotage test formation.', 1, 8),
    ('force-doc-7', 'unit-combat-medic', 'DOC-7', '7th Combat Medical Detachment', 'Forward medical support for infantry formations.', 1, 11),
    ('force-anvil', 'unit-engineers', 'ANVIL', '4th Combat Engineer Troop', 'Construction and vehicle-repair specialists.', 2, 16),
    ('force-longbow', 'unit-artillery', 'LONGBOW', 'Longbow Field Battery', 'Deployable indirect-fire battery requiring a friendly spotter.', 2, 15),
    ('force-mule-3', 'unit-logi-truck', 'MULE-3', '3rd Field Logistics Section', 'Cargo, towing, and ammunition-transfer platform.', 1, 9),
    ('force-nomad', 'unit-light-vehicle', 'NOMAD', 'Nomad Recon Vehicle', 'Fast reconnaissance and rapid-fire support vehicle.', 2, 14),
    ('force-carrier-6', 'unit-infantry-fighting-vehicle', 'CARR-6', '6th Mechanised Infantry Carrier', 'Armoured infantry carrier with a snub autocannon.', 1, 12),
    ('force-bellator', 'unit-main-battle-tank', 'BELLATR', '14th Armoured Platoon', 'Heavy line-breaker undergoing mobility repair.', 3, 24),
    ('force-strider', 'unit-light-mech', 'STRIDER', 'Strider Light Mech Lance', 'Mobile weapons platform with hostile-passage movement.', 1, 8),
    ('force-vulture-1', 'unit-aerospace-fighter', 'VULT-1', '1st Vulture Interceptor', 'Forward-arc interceptor with limited ammunition.', 1, 7),
    ('force-hammer-2', 'unit-aerospace-bomber', 'HAMMR-2', '2nd Hammer Bomber', 'Path-bombardment aircraft carrying limited ordnance.', 1, 6),
    ('force-kestrel', 'unit-vtol', 'KESTREL', 'Kestrel VTOL Flight', 'Air-mobile fire support and personnel transport.', 1, 10),
    ('force-atlas', 'unit-heavy-air-transport', 'ATLAS', 'Atlas Heavy Lift Wing', 'Strategic airlifter for units and supply.', 1, 5)
)
INSERT INTO player_units (
  id, owner_id, ruleset_id, definition_id, callsign, name, description,
  status, current_health, base_stats_json, requisition_value,
  requisition_value_status, location_kind, location_id, location_state,
  service_campaigns, service_rounds, version
)
SELECT roster.id, 'demo-user', definitions.ruleset_id, definitions.id,
       roster.callsign, roster.name, roster.description,
       'ACTIVE', definitions.max_health,
       json_object(
         'healthModel', definitions.health_model,
         'maxHealth', definitions.max_health,
         'armor', definitions.armor,
         'defense', definitions.defense,
         'speed', definitions.speed_quarters / 4.0,
         'sensors', definitions.sensor_range,
         'capacity', 0
       ),
       0, 'DEV_OVERRIDE', 'SHIP', 'ship-corinth-ward', 'ON_SHIP',
       roster.service_campaigns, roster.service_rounds, 1
  FROM roster
  JOIN unit_class_definitions AS definitions
    ON definitions.id = roster.definition_id
   AND definitions.ruleset_id = 'ruleset-v5-core-curated-1'
ON CONFLICT(id) DO UPDATE SET
  owner_id = excluded.owner_id,
  definition_id = excluded.definition_id,
  callsign = excluded.callsign,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  current_health = excluded.current_health,
  base_stats_json = excluded.base_stats_json,
  location_kind = excluded.location_kind,
  location_id = excluded.location_id,
  location_state = excluded.location_state,
  service_campaigns = excluded.service_campaigns,
  service_rounds = excluded.service_rounds,
  version = excluded.version;

UPDATE player_units
SET status = 'DAMAGED', current_health = 2,
    damage_json = '[{"subsystem":"MOBILITY","state":"DAMAGED"}]'
WHERE id = 'force-bellator';

INSERT INTO player_units (
  id, owner_id, ruleset_id, definition_id, callsign, name, description,
  status, current_health, base_stats_json, requisition_value,
  requisition_value_status, location_kind, location_state,
  destroyed_at, destroyed_campaign_id, destroyed_round, destroyed_cause,
  service_campaigns, service_rounds, version
)
SELECT
  'force-castellan', 'demo-user', definitions.ruleset_id, definitions.id,
  'CASTELL', 'Castellan Armoured Troop',
  'Memorial record from the defence of Outpost K-17.',
  'DESTROYED', 0,
  json_object(
    'healthModel', definitions.health_model,
    'maxHealth', definitions.max_health,
    'armor', definitions.armor,
    'defense', definitions.defense,
    'speed', definitions.speed_quarters / 4.0,
    'sensors', definitions.sensor_range,
    'capacity', 0
  ),
  0, 'DEV_OVERRIDE', 'DESTROYED', 'DESTROYED', 1786270000,
  'outpost-k17', 32,
  'Destroyed holding the western approach to Outpost K-17.',
  3, 18, 1
FROM unit_class_definitions AS definitions
WHERE definitions.id = 'unit-main-battle-tank'
  AND definitions.ruleset_id = 'ruleset-v5-core-curated-1'
ON CONFLICT(id) DO UPDATE SET
  status = 'DESTROYED', current_health = 0,
  location_kind = 'DESTROYED', location_state = 'DESTROYED',
  destroyed_at = excluded.destroyed_at,
  destroyed_campaign_id = excluded.destroyed_campaign_id,
  destroyed_round = excluded.destroyed_round,
  destroyed_cause = excluded.destroyed_cause;

INSERT INTO player_unit_equipment (
  player_unit_id, ruleset_id, equipment_definition_id,
  slot_type, slot_index, state_json
) VALUES
  ('force-raven-2', 'ruleset-v5-core-curated-1', 'equipment-flak-vests', 'SECONDARY', 0, '{}'),
  ('force-raven-2', 'ruleset-v5-core-curated-1', 'equipment-light-at', 'PRIMARY', 0, '{"ammunition":2}'),
  ('force-nomad', 'ruleset-v5-core-curated-1', 'equipment-vehicle-optics', 'INTERNAL', 0, '{}'),
  ('force-bellator', 'ruleset-v5-core-curated-1', 'equipment-vehicle-optics', 'INTERNAL', 0, '{}')
ON CONFLICT(player_unit_id, slot_type, slot_index) DO UPDATE SET
  equipment_definition_id = excluded.equipment_definition_id,
  ruleset_id = excluded.ruleset_id,
  state_json = excluded.state_json,
  lost_at = NULL;

INSERT INTO player_unit_weapon_mounts (
  id, player_unit_id, ruleset_id, weapon_definition_id,
  source_kind, mount_role, mount_index, current_ammo
)
SELECT units.id || ':weapon:' || links.mount_role || ':' || links.mount_index,
       units.id, units.ruleset_id, links.weapon_definition_id,
       'BASE', links.mount_role, links.mount_index, weapons.ammo_capacity
  FROM player_units AS units
  JOIN unit_definition_weapons AS links
    ON links.unit_definition_id = units.definition_id
   AND links.ruleset_id = units.ruleset_id
  JOIN weapon_definitions AS weapons
    ON weapons.id = links.weapon_definition_id
   AND weapons.ruleset_id = links.ruleset_id
 WHERE units.owner_id = 'demo-user'
ON CONFLICT(id) DO UPDATE SET
  weapon_definition_id = excluded.weapon_definition_id,
  current_ammo = excluded.current_ammo,
  cooldown_remaining = 0,
  state = 'OPERATIONAL';

INSERT INTO player_unit_supplies (
  player_unit_id, resource_type, current_quantity, maximum_quantity
) VALUES
  ('force-doc-7', 'MEDICAL_SUPPLY', 4, 4),
  ('force-anvil', 'SMALL_SUPPLY', 4, 4),
  ('force-longbow', 'SMALL_SUPPLY', 2, 2),
  ('force-vulture-1', 'MAIN_AMMUNITION', 1, 1),
  ('force-hammer-2', 'MAIN_AMMUNITION', 1, 1)
ON CONFLICT(player_unit_id, resource_type) DO UPDATE SET
  current_quantity = excluded.current_quantity,
  maximum_quantity = excluded.maximum_quantity,
  revision = 1;

INSERT INTO player_unit_subsystems (player_unit_id, subsystem_type, state)
SELECT units.id, subsystem_type,
       CASE
         WHEN units.id = 'force-bellator' AND subsystem_type = 'MOBILITY' THEN 'DAMAGED'
         ELSE 'OPERATIONAL'
       END
  FROM player_units AS units
  JOIN unit_definition_profiles AS profiles
    ON profiles.unit_definition_id = units.definition_id
   AND profiles.ruleset_id = units.ruleset_id
  JOIN durability_profile_definitions AS durability
    ON durability.id = profiles.durability_profile_id
   AND durability.ruleset_id = profiles.ruleset_id
  CROSS JOIN (
    SELECT 'WEAPONS' AS subsystem_type
    UNION ALL SELECT 'MOBILITY'
  )
 WHERE units.owner_id = 'demo-user'
   AND durability.supports_subsystems = 1
ON CONFLICT(player_unit_id, subsystem_type) DO UPDATE SET
  state = excluded.state,
  revision = 1;

DELETE FROM player_unit_subsystems
 WHERE player_unit_id IN (SELECT id FROM player_units WHERE owner_id = 'demo-user')
   AND subsystem_type NOT IN ('WEAPONS', 'MOBILITY');

INSERT INTO unit_cargo_manifests (carrier_unit_id, ruleset_id, cargo_profile_id)
SELECT units.id, units.ruleset_id, profiles.cargo_profile_id
  FROM player_units AS units
  JOIN unit_definition_profiles AS profiles
    ON profiles.unit_definition_id = units.definition_id
   AND profiles.ruleset_id = units.ruleset_id
 WHERE units.owner_id = 'demo-user'
   AND profiles.cargo_profile_id IS NOT NULL
ON CONFLICT(carrier_unit_id) DO UPDATE SET
  cargo_profile_id = excluded.cargo_profile_id,
  revision = 1;

INSERT INTO unit_cargo_items (
  id, carrier_unit_id, item_kind, resource_type,
  quantity, cargo_slots_quarters, state, state_json
) VALUES
  ('cargo-mule-small-supply', 'force-mule-3', 'SUPPLY', 'SMALL_SUPPLY', 5, 4, 'LOADED', '{}'),
  ('cargo-atlas-small-supply', 'force-atlas', 'SUPPLY', 'SMALL_SUPPLY', 5, 4, 'LOADED', '{}')
ON CONFLICT(id) DO UPDATE SET
  quantity = excluded.quantity,
  state = 'LOADED',
  unloaded_at = NULL;

INSERT INTO unit_service_summaries (
  player_unit_id, campaigns_completed, rounds_served,
  objectives_completed, units_destroyed
)
SELECT id, service_campaigns, service_rounds,
       CASE WHEN service_campaigns > 1 THEN 2 ELSE 1 END,
       CASE WHEN definition_id IN ('unit-main-battle-tank', 'unit-light-mech') THEN 3 ELSE 0 END
  FROM player_units
 WHERE owner_id = 'demo-user'
ON CONFLICT(player_unit_id) DO UPDATE SET
  campaigns_completed = excluded.campaigns_completed,
  rounds_served = excluded.rounds_served,
  objectives_completed = excluded.objectives_completed,
  units_destroyed = excluded.units_destroyed,
  revision = 1;

INSERT INTO unit_history (
  id, player_unit_id, event_type, summary, payload_json,
  occurred_at, idempotency_key, actor_user_id, visibility
)
SELECT 'history:' || id || ':muster', id, 'PURCHASED',
       callsign || ' mustered into the 33rd Expeditionary Battalion.',
       json_object('fixture', 'OPERATION_IRON_RAIN'),
       1778500000,
       'demo:history:' || id || ':muster',
       'demo-user', 'OWNER'
  FROM player_units
 WHERE owner_id = 'demo-user'
ON CONFLICT(id) DO UPDATE SET
  campaign_id = excluded.campaign_id,
  round_number = excluded.round_number,
  summary = excluded.summary,
  payload_json = excluded.payload_json,
  occurred_at = excluded.occurred_at;

INSERT INTO unit_history (
  id, player_unit_id, event_type, campaign_id, round_number,
  summary, payload_json,
  occurred_at, idempotency_key, actor_user_id, visibility
) VALUES (
  'history:force-castellan:lost',
  'force-castellan',
  'UNIT_DESTROYED',
  'outpost-k17',
  32,
  'Destroyed holding the western approach to Outpost K-17.',
  '{"memorial":true,"cause":"BUG_ASSAULT"}',
  1786270000,
  'demo:history:force-castellan:lost',
  'demo-user',
  'OWNER'
)
ON CONFLICT(id) DO UPDATE SET
  campaign_id = excluded.campaign_id,
  round_number = excluded.round_number,
  summary = excluded.summary,
  payload_json = excluded.payload_json,
  occurred_at = excluded.occurred_at;

INSERT INTO battlegroup_units (battlegroup_id, player_unit_id, delegated_command)
SELECT 'battlegroup-hammer', id, 0
  FROM player_units
 WHERE owner_id = 'demo-user'
   AND id IN ('force-raven-2', 'force-anvil', 'force-longbow', 'force-nomad', 'force-carrier-6', 'force-bellator')
ON CONFLICT(battlegroup_id, player_unit_id) DO UPDATE SET delegated_command = 0;

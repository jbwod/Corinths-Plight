PRAGMA foreign_keys = ON;

-- Explicit local-development fixture for the Phase 3 vertical slice.
-- It is not canonical lore and must never be applied to production.

INSERT INTO strategic_content_sources (
  id, source_path, source_locator, source_sha256, source_kind, notes
) VALUES
  (
    'source-meta-v5-strategic',
    'rules/Meta - Core Rules (V5).md',
    'LARGE GAMES; TAC-COMs & Battlegroups; Strategic Level Campaigns; Cargo Supply by Size',
    '9076241b32332743307a1bbcdfac8becf44bbff371e4945a31af78a914d39345',
    'PRIMARY_RULES',
    'Authoritative strategic movement, formation distinction, and Large/Medium/Small supply source.'
  ),
  (
    'source-phase3-brief-2026-08-09',
    'attachment:corinths-plight-phase-3-2026-08-09',
    'Initial World; Corinth Planetary Map; Initial Battalion; Initial Strategic Scenario',
    '0ebe472aa5bc16e551e2fd5e2b3d16f78a4c4e016cbe954f8a4687f72c2b5b01',
    'PRODUCT_BRIEF',
    'Product brief supplied for Phase 3. Fixture choices remain development-only until adopted as lore.'
  )
ON CONFLICT(id) DO UPDATE SET
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  source_sha256 = excluded.source_sha256,
  source_kind = excluded.source_kind,
  notes = excluded.notes;

INSERT INTO battalion_permission_definitions (
  permission, description, implementation_status
) VALUES
  ('BATTALION_EDIT', 'Edit Battalion public identity and configuration.', 'SCHEMA_ONLY'),
  ('MEMBER_INVITE', 'Invite a player to the Battalion.', 'SCHEMA_ONLY'),
  ('MEMBER_REMOVE', 'Remove or suspend a Battalion member.', 'SCHEMA_ONLY'),
  ('RANK_MANAGE', 'Create ranks and assign rank permissions.', 'SCHEMA_ONLY'),
  ('BATTLEGROUP_CREATE', 'Create a persistent Battlegroup.', 'SCHEMA_ONLY'),
  ('BATTLEGROUP_EDIT', 'Edit a Battlegroup identity and objective.', 'SCHEMA_ONLY'),
  ('BATTLEGROUP_ASSIGN', 'Assign eligible units to a Battlegroup.', 'ACTIVE'),
  ('OPERATION_CREATE', 'Create a strategic operation.', 'SCHEMA_ONLY'),
  ('OPERATION_COMMAND', 'Coordinate and command an operation.', 'ACTIVE'),
  ('SHIP_VIEW', 'View Battalion ship and module state.', 'ACTIVE'),
  ('SHIP_CONFIGURE', 'Configure installed ship modules.', 'DEFERRED'),
  ('SHIP_UPGRADE', 'Acquire ship hull or module upgrades.', 'DEFERRED'),
  ('SHIP_MOVE', 'Submit movement for a Battalion Task Force.', 'ACTIVE'),
  ('SUPPLY_VIEW', 'View Battalion strategic logistics.', 'ACTIVE'),
  ('SUPPLY_MANAGE', 'Transfer or consume Battalion supply.', 'ACTIVE'),
  ('UNIT_DEPLOY_SELF', 'Deploy units owned by the caller.', 'SCHEMA_ONLY'),
  ('UNIT_DEPLOY_OTHERS', 'Deploy explicitly delegated units.', 'SCHEMA_ONLY'),
  ('STRATEGIC_ORDER_CREATE', 'Create a strategic order.', 'ACTIVE'),
  ('STRATEGIC_ORDER_APPROVE', 'Approve a submitted strategic order.', 'ACTIVE')
ON CONFLICT(permission) DO UPDATE SET
  description = excluded.description,
  implementation_status = excluded.implementation_status;

INSERT INTO users (id, email, username, status, last_active_at)
VALUES (
  'demo-user', 'demo@local.corinth.invalid', 'demo-user', 'ACTIVE', 1786270000
)
ON CONFLICT(id) DO UPDATE SET
  status = 'ACTIVE',
  last_active_at = excluded.last_active_at;

INSERT INTO profiles (
  user_id, display_name, callsign, biography, timezone
) VALUES (
  'demo-user',
  '33rd Expeditionary Commander',
  'CORINTH',
  'Development-only commander for the Corinth Expedition.',
  'Australia/Sydney'
)
ON CONFLICT(user_id) DO UPDATE SET
  display_name = excluded.display_name,
  callsign = excluded.callsign,
  biography = excluded.biography,
  timezone = excluded.timezone;

INSERT INTO battalions (
  id, name, short_name, description, motto, created_by, status, revision
) VALUES (
  'battalion-33rd-expeditionary',
  '33rd Expeditionary Battalion',
  '33EXP',
  'Development combined-arms formation assigned to the Corinth Expedition.',
  'Hold fast beyond the line.',
  'demo-user',
  'ACTIVE',
  1
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  motto = excluded.motto,
  status = excluded.status;

INSERT INTO battalion_ranks (
  id, battalion_id, name, precedence, revision, updated_at
) VALUES
  ('rank-33rd-commander', 'battalion-33rd-expeditionary', 'Battalion Commander', 1, 1, 1786270000),
  ('rank-33rd-operations', 'battalion-33rd-expeditionary', 'Operations Officer', 2, 1, 1786270000),
  ('rank-33rd-trooper', 'battalion-33rd-expeditionary', 'Trooper', 3, 1, 1786270000)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  precedence = excluded.precedence,
  updated_at = excluded.updated_at;

INSERT INTO rank_permissions (rank_id, permission)
SELECT 'rank-33rd-commander', permission
  FROM battalion_permission_definitions
 WHERE 1
ON CONFLICT(rank_id, permission) DO NOTHING;

INSERT INTO rank_permissions (rank_id, permission)
VALUES
  ('rank-33rd-operations', 'BATTLEGROUP_CREATE'),
  ('rank-33rd-operations', 'BATTLEGROUP_EDIT'),
  ('rank-33rd-operations', 'BATTLEGROUP_ASSIGN'),
  ('rank-33rd-operations', 'OPERATION_COMMAND'),
  ('rank-33rd-operations', 'SHIP_VIEW'),
  ('rank-33rd-operations', 'SHIP_MOVE'),
  ('rank-33rd-operations', 'SUPPLY_VIEW'),
  ('rank-33rd-operations', 'STRATEGIC_ORDER_CREATE'),
  ('rank-33rd-trooper', 'SHIP_VIEW'),
  ('rank-33rd-trooper', 'SUPPLY_VIEW'),
  ('rank-33rd-trooper', 'UNIT_DEPLOY_SELF')
ON CONFLICT(rank_id, permission) DO NOTHING;

INSERT INTO battalion_memberships (
  battalion_id, user_id, rank_id, status, command_role,
  joined_at, status_changed_at, revision, updated_at
) VALUES (
  'battalion-33rd-expeditionary', 'demo-user', 'rank-33rd-commander',
  'ACTIVE', 'BATTALION_COMMAND', 1778500000, 1778500000, 1, 1786270000
)
ON CONFLICT(battalion_id, user_id) DO UPDATE SET
  rank_id = excluded.rank_id,
  status = excluded.status,
  command_role = excluded.command_role,
  status_changed_at = excluded.status_changed_at,
  left_at = NULL,
  updated_at = excluded.updated_at;

INSERT INTO user_active_battalions (user_id, battalion_id, selected_at, revision)
VALUES ('demo-user', 'battalion-33rd-expeditionary', 1786270000, 1)
ON CONFLICT(user_id) DO UPDATE SET
  battalion_id = excluded.battalion_id,
  selected_at = excluded.selected_at;

INSERT INTO strategic_locations (
  id, parent_location_id, location_type, name, description, metadata_json
) VALUES
  ('location-helion-system', NULL, 'STAR_SYSTEM', 'Helion System', 'The initial development theatre.', '{"developmentFixture":true}'),
  ('location-corinth', 'location-helion-system', 'PLANET', 'Corinth', 'Primary world of the Corinth Expedition.', '{"developmentFixture":true}'),
  ('location-corinth-high-orbit', 'location-corinth', 'ORBIT', 'Corinth High Orbit', 'High orbital staging location above Corinth.', '{}'),
  ('location-corinth-northern-region', 'location-corinth', 'SURFACE_REGION', 'Northern Theatre', 'Northern operational region of Corinth.', '{}'),
  ('location-corinth-southern-continent', 'location-corinth', 'SURFACE_REGION', 'Southern Continent', 'Southern operational region of Corinth.', '{}'),
  ('location-north-airbase', 'location-corinth-northern-region', 'BASE', 'North Airbase', 'Friendly surface air and logistics base.', '{}'),
  ('location-kestrel-ridge', 'location-corinth-northern-region', 'OBJECTIVE', 'Kestrel Ridge', 'Contested ridge and airfield objective.', '{}'),
  ('location-outpost-k17', 'location-corinth-northern-region', 'BASE', 'Outpost K-17', 'Veteran outpost from the Phase 1 campaign.', '{}'),
  ('location-new-carthage', 'location-corinth-southern-continent', 'CITY', 'New Carthage', 'Contested population centre.', '{}'),
  ('location-hive-basin', 'location-corinth-southern-continent', 'OBJECTIVE', 'Hive Basin', 'Known Bug infestation zone.', '{}'),
  ('location-junction-7', 'location-corinth-southern-continent', 'JUNCTION', 'Junction 7', 'Critical surface logistics junction.', '{}'),
  ('location-corinth-ii', 'location-helion-system', 'PLANET', 'Corinth II', 'Second world in the Helion development theatre.', '{"developmentFixture":true}'),
  ('location-relay-kappa', 'location-helion-system', 'STATION', 'Relay Station Kappa', 'Helion communications and navigation relay.', '{"developmentFixture":true}'),
  ('location-helion-jump-point', 'location-helion-system', 'JUMP_POINT', 'Helion Jump Point', 'Helion system strategic ingress and egress.', '{"developmentFixture":true}')
ON CONFLICT(id) DO UPDATE SET
  parent_location_id = excluded.parent_location_id,
  location_type = excluded.location_type,
  name = excluded.name,
  description = excluded.description,
  metadata_json = excluded.metadata_json;

INSERT INTO planets (
  id, name, strategic_coord_json, environment_json, war_state_json,
  strategic_location_id, revision
) VALUES
  (
    'planet-corinth', 'Corinth', '{"q":17,"r":-8}',
    '{"biome":"TEMPERATE_FRONTIER","developmentFixture":true,"modifiers":[]}',
    '{"control":"CONTESTED","enemyPressure":"HIGH","numericValuesStatus":"BALANCE_REQUIRED"}',
    'location-corinth', 1
  ),
  (
    'planet-corinth-ii', 'Corinth II', '{"q":19,"r":-7}',
    '{"developmentFixture":true,"modifiers":[]}',
    '{"control":"UNKNOWN","numericValuesStatus":"BALANCE_REQUIRED"}',
    'location-corinth-ii', 1
  )
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  strategic_coord_json = excluded.strategic_coord_json,
  environment_json = excluded.environment_json,
  war_state_json = excluded.war_state_json,
  strategic_location_id = excluded.strategic_location_id;

INSERT INTO strategic_maps (
  id, name, scope, root_location_id, ruleset_id, coordinator_key,
  status, clock_mode, tick_interval_seconds, current_round, paused,
  revision, source_id, source_locator, configuration_json
) VALUES (
  'strategic-map-corinth',
  'The Corinth Expedition',
  'THEATRE',
  'location-helion-system',
  'ruleset-v5-core-curated-1',
  'strategic-map-corinth',
  'ACTIVE',
  'MANUAL',
  NULL,
  28,
  0,
  1,
  'source-phase3-brief-2026-08-09',
  'Initial World; Corinth Planetary Map; Initial Strategic Scenario',
  '{"developmentFixture":true,"coordinatorBoundary":"ONE_DURABLE_OBJECT_PER_STRATEGIC_MAP","travelValuesStatus":"SCENARIO_CONFIG","movementPointsPerRound":{"TASK_FORCE":1,"GROUND_BATTLEGROUP":1}}'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  scope = excluded.scope,
  root_location_id = excluded.root_location_id,
  ruleset_id = excluded.ruleset_id,
  coordinator_key = excluded.coordinator_key,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator,
  configuration_json = excluded.configuration_json;

INSERT INTO strategic_nodes (
  id, map_id, location_id, node_type, name, control_status, status,
  position_json, visibility_json, source_id, source_locator, metadata_json
) VALUES
  ('node-corinth-high-orbit', 'strategic-map-corinth', 'location-corinth-high-orbit', 'ORBIT', 'Corinth High Orbit', 'FRIENDLY', 'OPEN', '{"x":48,"y":12}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: CORINTH HIGH ORBIT', '{}'),
  ('node-north-airbase', 'strategic-map-corinth', 'location-north-airbase', 'BASE', 'North Airbase', 'FRIENDLY', 'OPEN', '{"x":38,"y":34}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: NORTH AIRBASE', '{"supplyRole":"HQ_AIRFIELD"}'),
  ('node-kestrel-ridge', 'strategic-map-corinth', 'location-kestrel-ridge', 'OBJECTIVE', 'Kestrel Ridge', 'CONTESTED', 'OPEN', '{"x":27,"y":50}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: KESTREL RIDGE', '{}'),
  ('node-outpost-k17', 'strategic-map-corinth', 'location-outpost-k17', 'BASE', 'Outpost K-17', 'FRIENDLY', 'OPEN', '{"x":17,"y":68}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: OUTPOST K-17', '{}'),
  ('node-new-carthage', 'strategic-map-corinth', 'location-new-carthage', 'CITY', 'New Carthage', 'CONTESTED', 'OPEN', '{"x":62,"y":65}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: NEW CARTHAGE', '{}'),
  ('node-hive-basin', 'strategic-map-corinth', 'location-hive-basin', 'OBJECTIVE', 'Hive Basin', 'ENEMY', 'OPEN', '{"x":81,"y":75}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: HIVE BASIN', '{}'),
  ('node-junction-7', 'strategic-map-corinth', 'location-junction-7', 'JUNCTION', 'Junction 7', 'CONTESTED', 'OPEN', '{"x":52,"y":51}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map: JUNCTION 7', '{}'),
  ('node-corinth-ii', 'strategic-map-corinth', 'location-corinth-ii', 'PLANET', 'Corinth II', 'UNKNOWN', 'OPEN', '{"x":75,"y":18}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Initial World: CORINTH II', '{}'),
  ('node-relay-kappa', 'strategic-map-corinth', 'location-relay-kappa', 'STATION', 'Relay Station Kappa', 'FRIENDLY', 'OPEN', '{"x":62,"y":8}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Initial World: RELAY STATION KAPPA', '{}'),
  ('node-helion-jump-point', 'strategic-map-corinth', 'location-helion-jump-point', 'JUMP_POINT', 'Helion Jump Point', 'NEUTRAL', 'OPEN', '{"x":89,"y":6}', '{"public":true}', 'source-phase3-brief-2026-08-09', 'Initial World: HELION JUMP POINT', '{}')
ON CONFLICT(id) DO UPDATE SET
  map_id = excluded.map_id,
  location_id = excluded.location_id,
  node_type = excluded.node_type,
  name = excluded.name,
  control_status = excluded.control_status,
  status = excluded.status,
  position_json = excluded.position_json,
  visibility_json = excluded.visibility_json,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator,
  metadata_json = excluded.metadata_json;

INSERT INTO strategic_routes (
  id, map_id, from_node_id, to_node_id, route_type, bidirectional,
  base_travel_rounds, travel_cost_status, allowed_profiles_json,
  status, source_id, source_locator, metadata_json
) VALUES
  ('route-corinth-orbit-relay-kappa', 'strategic-map-corinth', 'node-corinth-high-orbit', 'node-relay-kappa', 'ORBITAL', 1, 2, 'SCENARIO_CONFIG', '["TASK_FORCE"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Strategic Graph; Initial World', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-relay-kappa-corinth-ii', 'strategic-map-corinth', 'node-relay-kappa', 'node-corinth-ii', 'INTERPLANETARY', 1, 3, 'SCENARIO_CONFIG', '["TASK_FORCE"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Strategic Graph; Initial World', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-relay-kappa-helion-jump', 'strategic-map-corinth', 'node-relay-kappa', 'node-helion-jump-point', 'JUMP_ROUTE', 1, 2, 'SCENARIO_CONFIG', '["TASK_FORCE"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Strategic Graph; Initial World', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-corinth-orbit-north-airbase', 'strategic-map-corinth', 'node-corinth-high-orbit', 'node-north-airbase', 'AIR_CORRIDOR', 1, 1, 'SCENARIO_CONFIG', '["AIR_MOBILE_BATTLEGROUP"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Surface Deployment Methods; Corinth Planetary Map', '{"requiresDeploymentCapability":true,"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-north-airbase-kestrel-ridge', 'strategic-map-corinth', 'node-north-airbase', 'node-kestrel-ridge', 'SURFACE_ROAD', 1, 1, 'SCENARIO_CONFIG', '["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-kestrel-outpost-k17', 'strategic-map-corinth', 'node-kestrel-ridge', 'node-outpost-k17', 'SURFACE_ROAD', 1, 1, 'SCENARIO_CONFIG', '["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]', 'LOCKED', 'source-phase3-brief-2026-08-09', 'Strategic Consequences; Strategic-to-Tactical Test', '{"unlockEffect":"OPERATION_IRON_RAIN_VICTORY","travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-north-airbase-junction-7', 'strategic-map-corinth', 'node-north-airbase', 'node-junction-7', 'SURFACE_ROAD', 1, 1, 'SCENARIO_CONFIG', '["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-junction-7-new-carthage', 'strategic-map-corinth', 'node-junction-7', 'node-new-carthage', 'SURFACE_ROAD', 1, 1, 'SCENARIO_CONFIG', '["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}'),
  ('route-junction-7-hive-basin', 'strategic-map-corinth', 'node-junction-7', 'node-hive-basin', 'SURFACE_PATH', 1, 2, 'SCENARIO_CONFIG', '["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]', 'OPEN', 'source-phase3-brief-2026-08-09', 'Corinth Planetary Map', '{"travelTiming":"CORINTH_DEVELOPMENT_SCENARIO"}')
ON CONFLICT(id) DO UPDATE SET
  map_id = excluded.map_id,
  from_node_id = excluded.from_node_id,
  to_node_id = excluded.to_node_id,
  route_type = excluded.route_type,
  bidirectional = excluded.bidirectional,
  base_travel_rounds = excluded.base_travel_rounds,
  travel_cost_status = excluded.travel_cost_status,
  allowed_profiles_json = excluded.allowed_profiles_json,
  status = excluded.status,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator,
  metadata_json = excluded.metadata_json;

INSERT INTO campaigns (
  id, planet_id, ruleset_id, name, status, round_duration_ms,
  map_source_key, minimum_players, maximum_players, created_by,
  force_policy_json, strategic_node_id, strategic_status, strategic_revision
) VALUES (
  'operation-iron-rain', 'planet-corinth', 'ruleset-v5-core-curated-1',
  'Operation Iron Rain', 'RECRUITING', 300000,
  'fixture/operation-iron-rain', 2, 8, 'demo-user',
  '{"allowedCategories":["INFANTRY","SUPPORT","ENGINEER","ARTILLERY","ARMOUR","MECH","AEROSPACE"],"requiresShip":true}',
  'node-kestrel-ridge', 'MUSTERING', 1
)
ON CONFLICT(id) DO UPDATE SET
  strategic_node_id = excluded.strategic_node_id,
  strategic_status = excluded.strategic_status,
  force_policy_json = excluded.force_policy_json;

UPDATE campaigns
   SET strategic_node_id = 'node-outpost-k17',
       strategic_status = 'RESOLVED'
 WHERE id = 'outpost-k17';

UPDATE campaigns
   SET strategic_node_id = 'node-outpost-k17'
 WHERE id = 'campaign-k17-relay';

INSERT INTO strategic_operations (
  id, map_id, node_id, campaign_id, ruleset_id, code, name,
  role_summary, status, threat_level, objectives_json,
  recommended_capabilities_json, deployment_rules_json,
  reinforcement_policy_json, known_enemy_json, effect_rules_json,
  outcome_json, revision, source_id, source_locator
) VALUES
  (
    'strategic-operation-iron-rain', 'strategic-map-corinth', 'node-kestrel-ridge',
    'operation-iron-rain', 'ruleset-v5-core-curated-1', 'IRON_RAIN',
    'Operation Iron Rain', 'Front-line assault', 'MUSTERING', 'HIGH',
    '[{"key":"HOLD_AIRFIELD","label":"Hold Airfield"},{"key":"DESTROY_HIVE","label":"Destroy Hive"}]',
    '["GROUND_COMBAT","ARMOURED","ENGINEERING","ARTILLERY"]',
    '{"methods":["STANDARD_LANDING","VTOL_DEPLOYMENT","AEROSPACE_TRANSPORT","ORBITAL_DROP"],"methodAvailability":"CAPABILITY_DERIVED"}',
    '{"mode":"CAMPAIGN_CONFIGURED","status":"OPEN"}',
    '{"faction":"BUG_SWARM","detail":"KNOWN_ONLY"}',
    '[{"when":{"objectiveId":"objective-kestrel-airfield","owner":"ALLIED"},"effects":[{"type":"STRATEGIC_NODE_CAPTURED","nodeId":"node-kestrel-ridge","control":"FRIENDLY"},{"type":"ROUTE_UNLOCKED","routeId":"route-kestrel-outpost-k17"}]}]',
    NULL, 1, 'source-phase3-brief-2026-08-09',
    'Initial Strategic Scenario: OPERATION IRON RAIN; Strategic-to-Tactical Test'
  ),
  (
    'strategic-operation-night-glass', 'strategic-map-corinth', 'node-new-carthage',
    NULL, 'ruleset-v5-core-curated-1', 'NIGHT_GLASS',
    'Operation Night Glass', 'Recon / rapid response', 'ANNOUNCED', 'UNKNOWN',
    '[]', '["RECON","AIR_MOBILE"]',
    '{"methods":[],"methodAvailability":"CAPABILITY_DERIVED"}',
    '{"mode":"CAMPAIGN_CONFIGURED","status":"UNPUBLISHED"}',
    '{"faction":"BUG_SWARM","detail":"KNOWN_ONLY"}', '[]',
    NULL, 1, 'source-phase3-brief-2026-08-09',
    'Initial Strategic Scenario: OPERATION NIGHT GLASS'
  ),
  (
    'strategic-operation-broken-road', 'strategic-map-corinth', 'node-junction-7',
    NULL, 'ruleset-v5-core-curated-1', 'BROKEN_ROAD',
    'Operation Broken Road', 'Logistics defence', 'ANNOUNCED', 'UNKNOWN',
    '[]', '["GROUND_COMBAT","ENGINEERING","LOGISTICS"]',
    '{"methods":[],"methodAvailability":"CAPABILITY_DERIVED"}',
    '{"mode":"CAMPAIGN_CONFIGURED","status":"UNPUBLISHED"}',
    '{"faction":"BUG_SWARM","detail":"KNOWN_ONLY"}', '[]',
    NULL, 1, 'source-phase3-brief-2026-08-09',
    'Initial Strategic Scenario: OPERATION BROKEN ROAD'
  )
ON CONFLICT(id) DO UPDATE SET
  map_id = excluded.map_id,
  node_id = excluded.node_id,
  campaign_id = excluded.campaign_id,
  ruleset_id = excluded.ruleset_id,
  code = excluded.code,
  name = excluded.name,
  role_summary = excluded.role_summary,
  status = excluded.status,
  threat_level = excluded.threat_level,
  objectives_json = excluded.objectives_json,
  recommended_capabilities_json = excluded.recommended_capabilities_json,
  deployment_rules_json = excluded.deployment_rules_json,
  reinforcement_policy_json = excluded.reinforcement_policy_json,
  known_enemy_json = excluded.known_enemy_json,
  effect_rules_json = excluded.effect_rules_json,
  outcome_json = excluded.outcome_json,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator;

INSERT INTO ships (
  id, battalion_id, ruleset_id, class_definition_id, name, registry,
  status, current_health, location_planet_id, current_location_id, state_json, revision
) VALUES (
  'ship-corinth-ward',
  'battalion-33rd-expeditionary',
  'ruleset-v5-core-curated-1',
  'ship-destroyer',
  'CSV Resolute',
  'CSV-RESOLUTE',
  'ORBIT',
  10,
  'planet-corinth',
  'location-corinth-high-orbit',
  '{"fixture":"CORINTH_EXPEDITION","developmentOnly":true,"identityContinuity":"phase2:ship-corinth-ward"}',
  1
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  registry = excluded.registry,
  status = excluded.status,
  current_health = excluded.current_health,
  location_planet_id = excluded.location_planet_id,
  current_location_id = excluded.current_location_id,
  state_json = excluded.state_json;

UPDATE battalions
   SET primary_ship_id = 'ship-corinth-ward'
 WHERE id = 'battalion-33rd-expeditionary';

INSERT INTO ship_equipment (
  ship_id, equipment_definition_id, ruleset_id, slot_type, slot_index,
  state_json, installation_status, installed_at, updated_at, revision
) VALUES
  ('ship-corinth-ward', 'equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'EXTERNAL', 0, '{}', 'INSTALLED', 1778500000, 1786270000, 1),
  ('ship-corinth-ward', 'equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'EXTERNAL', 1, '{}', 'INSTALLED', 1778500000, 1786270000, 1),
  ('ship-corinth-ward', 'equipment-mech-bay', 'ruleset-v5-core-curated-1', 'EXTERNAL', 2, '{}', 'INSTALLED', 1778500000, 1786270000, 1),
  ('ship-corinth-ward', 'equipment-armory', 'ruleset-v5-core-curated-1', 'INTERNAL', 0, '{}', 'INSTALLED', 1778500000, 1786270000, 1),
  ('ship-corinth-ward', 'equipment-mobile-infantry', 'ruleset-v5-core-curated-1', 'EXTERNAL_INTERNAL', 0, '{"reservesSlots":["EXTERNAL","INTERNAL"]}', 'INSTALLED', 1778500000, 1786270000, 1),
  ('ship-corinth-ward', 'equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'INTERNAL', 2, '{}', 'INSTALLED', 1778500000, 1786270000, 1)
ON CONFLICT(ship_id, slot_type, slot_index) DO UPDATE SET
  equipment_definition_id = excluded.equipment_definition_id,
  ruleset_id = excluded.ruleset_id,
  state_json = excluded.state_json,
  installation_status = excluded.installation_status,
  installed_at = excluded.installed_at,
  updated_at = excluded.updated_at;

INSERT INTO battlegroups (
  id, battalion_id, name, callsign, objective, leader_user_id,
  persistent, status, revision, updated_at
) VALUES
  (
    'battlegroup-hammer', 'battalion-33rd-expeditionary', 'Hammer', 'HAMMER',
    'Heavy combined-arms reserve for Operation Iron Rain.', 'demo-user',
    1, 'FORMING', 1, 1786270000
  ),
  (
    'battlegroup-raven', 'battalion-33rd-expeditionary', 'Raven', 'RAVEN',
    'Reconnaissance and rapid-response reserve.', 'demo-user',
    1, 'FORMING', 1, 1786270000
  )
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  callsign = excluded.callsign,
  objective = excluded.objective,
  leader_user_id = excluded.leader_user_id,
  persistent = excluded.persistent,
  updated_at = excluded.updated_at;

INSERT INTO battlegroup_units (battlegroup_id, player_unit_id, delegated_command)
SELECT 'battlegroup-raven', id, 0
  FROM player_units
 WHERE id IN ('force-spectre', 'force-nomad', 'force-kestrel')
ON CONFLICT(battlegroup_id, player_unit_id) DO UPDATE SET delegated_command = 0;

INSERT INTO task_forces (
  id, battalion_id, map_id, name, callsign, commander_user_id,
  current_node_id, status, supply_state, supplied_until_round,
  revision, state_json
) VALUES (
  'task-force-resolute',
  'battalion-33rd-expeditionary',
  'strategic-map-corinth',
  'Resolute Task Force',
  'RESOLUTE',
  'demo-user',
  'node-corinth-high-orbit',
  'READY',
  'SUPPLIED',
  29,
  1,
  '{"developmentFixture":true,"movementProfile":"TASK_FORCE"}'
)
ON CONFLICT(id) DO UPDATE SET
  battalion_id = excluded.battalion_id,
  map_id = excluded.map_id,
  name = excluded.name,
  callsign = excluded.callsign,
  commander_user_id = excluded.commander_user_id,
  current_node_id = excluded.current_node_id,
  status = excluded.status,
  supply_state = excluded.supply_state,
  supplied_until_round = excluded.supplied_until_round,
  state_json = excluded.state_json;

INSERT INTO task_force_ships (
  task_force_id, battalion_id, ship_id, role, status, joined_at, revision
) VALUES (
  'task-force-resolute', 'battalion-33rd-expeditionary',
  'ship-corinth-ward', 'PRIMARY', 'ACTIVE', 1778500000, 1
)
ON CONFLICT(task_force_id, ship_id) DO UPDATE SET
  role = excluded.role,
  status = excluded.status,
  released_at = NULL;

INSERT INTO task_force_battlegroups (
  id, task_force_id, battalion_id, battlegroup_id, status,
  embarked_at, disembarked_at, revision, created_at, updated_at
) VALUES
  (
    'embarkment-resolute-hammer', 'task-force-resolute',
    'battalion-33rd-expeditionary', 'battlegroup-hammer', 'EMBARKED',
    1786270000, NULL, 1, 1786270000, 1786270000
  ),
  (
    'embarkment-resolute-raven', 'task-force-resolute',
    'battalion-33rd-expeditionary', 'battlegroup-raven', 'EMBARKED',
    1786270000, NULL, 1, 1786270000, 1786270000
  )
ON CONFLICT(id) DO UPDATE SET
  task_force_id = excluded.task_force_id,
  battalion_id = excluded.battalion_id,
  battlegroup_id = excluded.battlegroup_id,
  status = excluded.status,
  embarked_at = excluded.embarked_at,
  disembarked_at = excluded.disembarked_at,
  updated_at = excluded.updated_at;

UPDATE battlegroups
   SET status = 'EMBARKED',
       current_node_id = NULL,
       current_operation_id = NULL,
       current_carrier_task_force_id = 'task-force-resolute',
       updated_at = 1786270000
 WHERE id IN ('battlegroup-hammer', 'battlegroup-raven');

INSERT INTO strategic_supply_stores (
  id, battalion_id, holder_type, ship_id, status, revision, metadata_json
) VALUES (
  'supply-store-csv-resolute',
  'battalion-33rd-expeditionary',
  'SHIP',
  'ship-corinth-ward',
  'ACTIVE',
  1,
  '{"source":"ORBITAL_CARGO_CAPACITY","developmentFixture":true}'
)
ON CONFLICT(id) DO UPDATE SET
  battalion_id = excluded.battalion_id,
  holder_type = excluded.holder_type,
  ship_id = excluded.ship_id,
  status = excluded.status,
  metadata_json = excluded.metadata_json;

INSERT INTO strategic_supply_balances (
  store_id, supply_size, quantity, capacity, revision, updated_at
) VALUES (
  'supply-store-csv-resolute', 'LARGE', 3, 4, 1, 1786270000
)
ON CONFLICT(store_id, supply_size) DO UPDATE SET
  quantity = excluded.quantity,
  capacity = excluded.capacity,
  updated_at = excluded.updated_at;

INSERT INTO strategic_rounds (
  map_id, round_number, status, ruleset_id, resolver_version,
  opens_at, revision, state_json
) VALUES (
  'strategic-map-corinth', 28, 'OPEN', 'ruleset-v5-core-curated-1',
  'strategic-foundation@1', 1786270000, 1,
  '{"developmentFixture":true,"travelValuesStatus":"BALANCE_REQUIRED"}'
)
ON CONFLICT(map_id, round_number) DO UPDATE SET
  ruleset_id = excluded.ruleset_id,
  resolver_version = excluded.resolver_version,
  state_json = excluded.state_json;

INSERT INTO strategic_events (
  event_id, map_id, round_number, sequence, event_type, battalion_id,
  actor_user_id, audience, subject_type, subject_id, summary,
  payload_json, event_hash, idempotency_key, occurred_at
) VALUES
  (
    'strategic-event-resolute-arrived-corinth',
    'strategic-map-corinth', 28, 0, 'TASK_FORCE_ARRIVED',
    'battalion-33rd-expeditionary', NULL, 'BATTALION',
    'TASK_FORCE', 'task-force-resolute',
    'CSV Resolute entered Corinth High Orbit.',
    '{"taskForceId":"task-force-resolute","nodeId":"node-corinth-high-orbit"}',
    '2062cbd03c8f5fc9f27f8ec9ef97cd15f955e56d990a768eb455d987cffa2f1b',
    'development:strategic:event:resolute-arrival', 1786270000
  ),
  (
    'strategic-event-resolute-large-supply',
    'strategic-map-corinth', 28, 1, 'SUPPLY_CONSUMED',
    'battalion-33rd-expeditionary', 'demo-user', 'BATTALION',
    'TASK_FORCE', 'task-force-resolute',
    'Resolute Task Force consumed 1 Large Supply and is supplied through round 29.',
    '{"taskForceId":"task-force-resolute","supplySize":"LARGE","quantity":1,"suppliedUntilRound":29}',
    'aa873d6d35252dba3aaae162d85749da7c4632d3b18fe36553253ad111e18d51',
    'development:strategic:event:resolute-large-supply', 1786270001
  ),
  (
    'strategic-event-hammer-embarked',
    'strategic-map-corinth', 28, 2, 'BATTLEGROUP_EMBARKED',
    'battalion-33rd-expeditionary', 'demo-user', 'BATTALION',
    'BATTLEGROUP', 'battlegroup-hammer',
    'Battlegroup Hammer embarked aboard the Resolute Task Force.',
    '{"taskForceId":"task-force-resolute","battlegroupId":"battlegroup-hammer"}',
    'a7871805a28f86b56dae70383e9b9e6d3f9150b3b3ce4e9f0eaf54ce2c2de866',
    'development:strategic:event:hammer-embarked', 1786270002
  ),
  (
    'strategic-event-raven-embarked',
    'strategic-map-corinth', 28, 3, 'BATTLEGROUP_EMBARKED',
    'battalion-33rd-expeditionary', 'demo-user', 'BATTALION',
    'BATTLEGROUP', 'battlegroup-raven',
    'Battlegroup Raven embarked aboard the Resolute Task Force.',
    '{"taskForceId":"task-force-resolute","battlegroupId":"battlegroup-raven"}',
    'ccd8d99624e6729f6a19cff930e202189190400d7b123b7abaa1eca759e89835',
    'development:strategic:event:raven-embarked', 1786270003
  )
ON CONFLICT(event_id) DO UPDATE SET
  summary = excluded.summary,
  payload_json = excluded.payload_json,
  event_hash = excluded.event_hash,
  occurred_at = excluded.occurred_at;

INSERT INTO strategic_war_variables (
  id, map_id, location_id, scope_type, scope_id, variable_key,
  value_json, visibility, revision, last_event_id, updated_at
) VALUES
  (
    'war-variable-corinth-control', 'strategic-map-corinth', 'location-corinth',
    'WORLD', 'WORLD', 'CONTROL',
    '{"state":"CONTESTED","numericValue":null,"status":"CONFIGURED_STATE_ONLY"}',
    'PUBLIC', 1, NULL, 1786270000
  ),
  (
    'war-variable-corinth-bug-pressure', 'strategic-map-corinth', 'location-corinth',
    'WORLD', 'WORLD', 'ENEMY_PRESSURE',
    '{"state":"HIGH","numericValue":null,"status":"BALANCE_REQUIRED"}',
    'PUBLIC', 1, NULL, 1786270000
  ),
  (
    'war-variable-resolute-supply', 'strategic-map-corinth', 'location-corinth-high-orbit',
    'BATTALION', 'battalion-33rd-expeditionary', 'SUPPLY_STATE',
    '{"state":"SUPPLIED","untilRound":29,"largeSupply":3,"capacity":4}',
    'BATTALION', 1, 'strategic-event-resolute-large-supply', 1786270001
  )
ON CONFLICT(id) DO UPDATE SET
  value_json = excluded.value_json,
  visibility = excluded.visibility,
  last_event_id = excluded.last_event_id,
  updated_at = excluded.updated_at;

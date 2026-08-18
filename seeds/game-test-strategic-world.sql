PRAGMA foreign_keys = ON;

-- Owner-approved production game-test strategic foundation. This is an
-- application policy, not a claim that V5 publishes interplanetary timings.
-- It deliberately contains no demo users, Battalions, ships, or task forces.

INSERT INTO strategic_content_sources (
  id, source_path, source_locator, source_kind, notes
) VALUES (
  'source-game-test-strategic-world-v1',
  'owner-decision/game-test-strategic-world@1',
  'Helion system, Corinth, Corinth II, Outpost K-17, Relay Kappa, Helion Jump Point',
  'ADMIN_AUTHORED',
  'Owner-approved game-test world topology. Route durations are scenario configuration under game-test-strategic-world@1.'
)
ON CONFLICT(id) DO UPDATE SET
  source_path=excluded.source_path,
  source_locator=excluded.source_locator,
  source_kind=excluded.source_kind,
  notes=excluded.notes;

INSERT INTO strategic_locations (
  id,parent_location_id,location_type,name,description,metadata_json
) VALUES
  ('location-helion-system',NULL,'STAR_SYSTEM','Helion System','Initial game-test star system.','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('location-corinth','location-helion-system','PLANET','Corinth','Primary contested world of the Corinth expedition.','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('location-corinth-northern-region','location-corinth','SURFACE_REGION','Northern Theatre','Northern operational region of Corinth.','{}'),
  ('location-outpost-k17','location-corinth-northern-region','BASE','Outpost K-17','Relay outpost supporting the public game-test campaign.','{}'),
  ('location-corinth-ii','location-helion-system','PLANET','Corinth II','Second world available for authored campaign placement.','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('location-relay-kappa','location-helion-system','STATION','Relay Station Kappa','Helion communications and navigation relay.','{}'),
  ('location-helion-jump-point','location-helion-system','JUMP_POINT','Helion Jump Point','Strategic ingress and egress marker.','{}')
ON CONFLICT(id) DO UPDATE SET
  parent_location_id=excluded.parent_location_id,
  location_type=excluded.location_type,
  name=excluded.name,
  description=excluded.description,
  metadata_json=excluded.metadata_json;

INSERT INTO planets (
  id,name,strategic_coord_json,environment_json,war_state_json,
  strategic_location_id,revision
) VALUES
  ('planet-corinth','Corinth','{"q":17,"r":-8}',
   '{"biome":"TEMPERATE_FRONTIER","contentPack":"foundation-public-v1"}',
   '{"control":"CONTESTED","primaryThreat":"BUG_SWARM"}',
   'location-corinth',1),
  ('planet-corinth-ii','Corinth II','{"q":19,"r":-7}',
   '{"biome":"MIXED_FRONTIER","contentPack":"game-test-strategic-world@1"}',
   '{"control":"UNKNOWN"}',
   'location-corinth-ii',1)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  strategic_location_id=COALESCE(planets.strategic_location_id,excluded.strategic_location_id);

INSERT INTO strategic_maps (
  id,name,scope,root_location_id,ruleset_id,coordinator_key,
  status,clock_mode,tick_interval_seconds,current_round,paused,
  revision,source_id,source_locator,configuration_json
) VALUES (
  'strategic-map-corinth','Helion Game-Test Theatre','SYSTEM',
  'location-helion-system','ruleset-v5-core-curated-1','strategic-map-corinth',
  'ACTIVE','MANUAL',NULL,1,0,1,
  'source-game-test-strategic-world-v1','game-test-strategic-world@1',
  '{"applicationPolicy":"game-test-strategic-world@1","coordinatorBoundary":"ONE_DURABLE_OBJECT_PER_STRATEGIC_MAP","travelValuesStatus":"SCENARIO_CONFIG"}'
)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name,
  scope=excluded.scope,
  root_location_id=excluded.root_location_id,
  ruleset_id=excluded.ruleset_id,
  coordinator_key=excluded.coordinator_key,
  source_id=excluded.source_id,
  source_locator=excluded.source_locator,
  configuration_json=excluded.configuration_json;

INSERT INTO strategic_nodes (
  id,map_id,location_id,node_type,name,control_status,status,
  position_json,visibility_json,source_id,source_locator,metadata_json
) VALUES
  ('node-corinth','strategic-map-corinth','location-corinth','PLANET','Corinth','CONTESTED','OPEN','{"x":38,"y":45}','{"public":true}','source-game-test-strategic-world-v1','Corinth','{}'),
  ('node-outpost-k17','strategic-map-corinth','location-outpost-k17','BASE','Outpost K-17','CONTESTED','OPEN','{"x":26,"y":69}','{"public":true}','source-game-test-strategic-world-v1','Corinth / Outpost K-17','{}'),
  ('node-corinth-ii','strategic-map-corinth','location-corinth-ii','PLANET','Corinth II','UNKNOWN','OPEN','{"x":72,"y":43}','{"public":true}','source-game-test-strategic-world-v1','Corinth II','{}'),
  ('node-relay-kappa','strategic-map-corinth','location-relay-kappa','STATION','Relay Station Kappa','FRIENDLY','OPEN','{"x":57,"y":23}','{"public":true}','source-game-test-strategic-world-v1','Relay Station Kappa','{}'),
  ('node-helion-jump-point','strategic-map-corinth','location-helion-jump-point','JUMP_POINT','Helion Jump Point','NEUTRAL','OPEN','{"x":88,"y":16}','{"public":true}','source-game-test-strategic-world-v1','Helion Jump Point','{}')
ON CONFLICT(id) DO UPDATE SET
  map_id=excluded.map_id,
  location_id=excluded.location_id,
  node_type=excluded.node_type,
  name=excluded.name,
  position_json=excluded.position_json,
  visibility_json=excluded.visibility_json,
  source_id=excluded.source_id,
  source_locator=excluded.source_locator,
  metadata_json=excluded.metadata_json;

INSERT INTO strategic_routes (
  id,map_id,from_node_id,to_node_id,route_type,bidirectional,
  base_travel_rounds,travel_cost_status,allowed_profiles_json,
  status,source_id,source_locator,metadata_json
) VALUES
  ('route-corinth-outpost-k17','strategic-map-corinth','node-corinth','node-outpost-k17','SURFACE_ROAD',1,1,'SCENARIO_CONFIG','["GROUND_BATTLEGROUP","AIR_MOBILE_BATTLEGROUP"]','OPEN','source-game-test-strategic-world-v1','game-test-strategic-world@1','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('route-corinth-relay-kappa','strategic-map-corinth','node-corinth','node-relay-kappa','INTERPLANETARY',1,2,'SCENARIO_CONFIG','["TASK_FORCE"]','OPEN','source-game-test-strategic-world-v1','game-test-strategic-world@1','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('route-relay-kappa-corinth-ii','strategic-map-corinth','node-relay-kappa','node-corinth-ii','INTERPLANETARY',1,3,'SCENARIO_CONFIG','["TASK_FORCE"]','OPEN','source-game-test-strategic-world-v1','game-test-strategic-world@1','{"applicationPolicy":"game-test-strategic-world@1"}'),
  ('route-relay-kappa-helion-jump','strategic-map-corinth','node-relay-kappa','node-helion-jump-point','JUMP_ROUTE',1,2,'SCENARIO_CONFIG','["TASK_FORCE"]','OPEN','source-game-test-strategic-world-v1','game-test-strategic-world@1','{"applicationPolicy":"game-test-strategic-world@1"}')
ON CONFLICT(id) DO UPDATE SET
  map_id=excluded.map_id,
  from_node_id=excluded.from_node_id,
  to_node_id=excluded.to_node_id,
  route_type=excluded.route_type,
  bidirectional=excluded.bidirectional,
  base_travel_rounds=excluded.base_travel_rounds,
  travel_cost_status=excluded.travel_cost_status,
  allowed_profiles_json=excluded.allowed_profiles_json,
  source_id=excluded.source_id,
  source_locator=excluded.source_locator,
  metadata_json=excluded.metadata_json;

INSERT INTO strategic_rounds (
  map_id,round_number,status,ruleset_id,resolver_version,opens_at,revision,state_json
) VALUES (
  'strategic-map-corinth',1,'OPEN','ruleset-v5-core-curated-1',
  'strategic-foundation@1',unixepoch(),1,
  '{"applicationPolicy":"game-test-strategic-world@1","travelValuesStatus":"SCENARIO_CONFIG"}'
)
ON CONFLICT(map_id,round_number) DO NOTHING;

UPDATE campaigns
   SET strategic_node_id='node-outpost-k17'
 WHERE id='campaign-k17-relay'
   AND (strategic_node_id IS NULL OR strategic_node_id='node-outpost-k17');

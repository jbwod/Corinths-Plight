PRAGMA foreign_keys = ON;

CREATE TABLE player_units (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  definition_id TEXT NOT NULL,
  callsign TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DEPLOYED', 'DAMAGED', 'DESTROYED', 'RETIRED')),
  current_health INTEGER NOT NULL CHECK (current_health >= 0),
  base_stats_json TEXT NOT NULL CHECK (json_valid(base_stats_json)),
  ammunition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(ammunition_json)),
  damage_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(damage_json)),
  requisition_value INTEGER NOT NULL DEFAULT 0 CHECK (requisition_value >= 0),
  location_kind TEXT NOT NULL DEFAULT 'RESERVE' CHECK (location_kind IN ('RESERVE', 'SHIP', 'CAMPAIGN', 'DESTROYED')),
  location_id TEXT,
  destroyed_at INTEGER,
  destroyed_campaign_id TEXT,
  destroyed_round INTEGER,
  destroyed_cause TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (definition_id, ruleset_id) REFERENCES unit_class_definitions(id, ruleset_id),
  CHECK ((status = 'DESTROYED') = (location_kind = 'DESTROYED'))
);

CREATE INDEX idx_player_units_owner_status ON player_units(owner_id, status);
CREATE INDEX idx_player_units_location ON player_units(location_kind, location_id);

CREATE TABLE player_unit_equipment (
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  equipment_definition_id TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  lost_at INTEGER,
  PRIMARY KEY (player_unit_id, slot_type, slot_index),
  FOREIGN KEY (equipment_definition_id, ruleset_id) REFERENCES equipment_definitions(id, ruleset_id)
);

CREATE TABLE unit_history (
  id TEXT PRIMARY KEY,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  campaign_id TEXT,
  round_number INTEGER,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE requisition_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  reason_code TEXT NOT NULL,
  description TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_requisition_ledger_user ON requisition_transactions(user_id, created_at, id);

CREATE TABLE battalions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  insignia_key TEXT,
  primary_ship_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE battalion_ranks (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  precedence INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (battalion_id, name),
  UNIQUE (battalion_id, precedence)
);

CREATE TABLE rank_permissions (
  rank_id TEXT NOT NULL REFERENCES battalion_ranks(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (rank_id, permission)
);

CREATE TABLE battalion_memberships (
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank_id TEXT NOT NULL REFERENCES battalion_ranks(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED')),
  command_role TEXT NOT NULL DEFAULT 'PLAYER' CHECK (command_role IN ('PLAYER', 'BATTALION_COMMAND', 'ADMIN')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (battalion_id, user_id)
);

CREATE TABLE battlegroups (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  leader_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  persistent INTEGER NOT NULL DEFAULT 0 CHECK (persistent IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (battalion_id, name)
);

CREATE TABLE battlegroup_units (
  battlegroup_id TEXT NOT NULL REFERENCES battlegroups(id) ON DELETE CASCADE,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  delegated_command INTEGER NOT NULL DEFAULT 0 CHECK (delegated_command IN (0, 1)),
  PRIMARY KEY (battlegroup_id, player_unit_id)
);

CREATE TABLE ships (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  class_definition_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DOCKED', 'ORBIT', 'IN_TRANSIT', 'ARRIVING', 'DEPLOYING', 'DAMAGED', 'DESTROYED')),
  current_health INTEGER NOT NULL CHECK (current_health >= 0),
  location_planet_id TEXT,
  destination_planet_id TEXT,
  travel_started_at INTEGER,
  travel_arrives_at INTEGER,
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (class_definition_id, ruleset_id) REFERENCES ship_class_definitions(id, ruleset_id),
  UNIQUE (battalion_id, name)
);

CREATE TABLE ship_equipment (
  ship_id TEXT NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  equipment_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  slot_type TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  PRIMARY KEY (ship_id, slot_type, slot_index),
  FOREIGN KEY (equipment_definition_id, ruleset_id) REFERENCES equipment_definitions(id, ruleset_id)
);

CREATE TABLE ship_cargo (
  id TEXT PRIMARY KEY,
  ship_id TEXT NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  location_slot TEXT,
  source TEXT,
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  UNIQUE (ship_id, resource_type, location_slot)
);

CREATE TABLE planets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  strategic_coord_json TEXT NOT NULL CHECK (json_valid(strategic_coord_json)),
  environment_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(environment_json)),
  war_state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(war_state_json))
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES planets(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'RECRUITING', 'ACTIVE', 'PAUSED', 'COMPLETE', 'FAILED')),
  round_duration_ms INTEGER NOT NULL CHECK (round_duration_ms >= 0),
  map_source_key TEXT NOT NULL,
  minimum_players INTEGER NOT NULL DEFAULT 1 CHECK (minimum_players > 0),
  maximum_players INTEGER NOT NULL CHECK (maximum_players >= minimum_players),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  UNIQUE (planet_id, name)
);

CREATE TABLE campaign_memberships (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  battalion_id TEXT REFERENCES battalions(id) ON DELETE SET NULL,
  side TEXT NOT NULL CHECK (side IN ('ALLIED', 'ENEMY', 'NEUTRAL')),
  role TEXT NOT NULL CHECK (role IN ('PLAYER', 'BATTALION_COMMAND', 'GM', 'OBSERVER')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('ALLIED', 'ENEMY', 'NEUTRAL')),
  status TEXT NOT NULL CHECK (status IN ('READY', 'ACTIVE', 'IMMOBILISED', 'DESTROYED', 'WITHDRAWN')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  deployed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  withdrawn_at INTEGER,
  UNIQUE (campaign_id, player_unit_id)
);

CREATE UNIQUE INDEX idx_one_active_deployment_per_unit
  ON deployments(player_unit_id)
  WHERE status IN ('READY', 'ACTIVE', 'IMMOBILISED');

CREATE TABLE round_metadata (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  resolution_key TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL,
  lock_at INTEGER,
  resolves_at INTEGER,
  state_digest TEXT,
  archived_at INTEGER,
  PRIMARY KEY (campaign_id, round_number)
);

CREATE TABLE order_archive (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  unit_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle TEXT NOT NULL,
  order_json TEXT NOT NULL CHECK (json_valid(order_json)),
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (campaign_id, round_number, unit_id, revision)
);

CREATE TABLE campaign_event_archive (
  event_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  visibility TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  occurred_at INTEGER NOT NULL,
  UNIQUE (campaign_id, round_number, sequence)
);

CREATE TABLE persistent_effects (
  idempotency_key TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  effect_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPLIED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  applied_at INTEGER
);

CREATE INDEX idx_campaign_events_round ON campaign_event_archive(campaign_id, round_number, sequence);
CREATE INDEX idx_persistent_effects_pending ON persistent_effects(status, created_at) WHERE status <> 'APPLIED';

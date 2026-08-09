PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  callsign TEXT,
  image_key TEXT,
  biography TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  ip_hash TEXT,
  user_agent_hash TEXT,
  CHECK (expires_at > created_at)
);

CREATE INDEX idx_user_sessions_active ON user_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE rulesets (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  engine_version TEXT NOT NULL,
  authority_notes TEXT NOT NULL,
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_one_active_ruleset_version ON rulesets(version) WHERE status = 'ACTIVE';

CREATE TABLE ruleset_sources (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  source_sha256 TEXT,
  authority_rank INTEGER NOT NULL,
  source_status TEXT NOT NULL CHECK (source_status IN ('PRIMARY', 'ERRATA', 'COMPANION', 'LEGACY')),
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (ruleset_id, source_path)
);

CREATE TABLE rule_conflicts (
  id TEXT PRIMARY KEY,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json)),
  disposition TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESOLVED_FOR_PROFILE', 'OPEN', 'DEFERRED', 'INCOMPLETE_DATA')),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE unit_class_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  health_model TEXT NOT NULL CHECK (health_model IN ('FORCE_STRENGTH', 'HITS')),
  max_health INTEGER NOT NULL CHECK (max_health > 0),
  armor INTEGER NOT NULL DEFAULT 0 CHECK (armor >= 0),
  defense INTEGER NOT NULL DEFAULT 0 CHECK (defense >= 0),
  speed_quarters INTEGER NOT NULL CHECK (speed_quarters >= 0),
  sensor_range INTEGER NOT NULL DEFAULT 0 CHECK (sensor_range >= 0),
  requisition_cost INTEGER CHECK (requisition_cost IS NULL OR requisition_cost >= 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE weapon_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  damage_dice_count INTEGER NOT NULL CHECK (damage_dice_count > 0),
  damage_die_sides INTEGER NOT NULL CHECK (damage_die_sides >= 2),
  damage_modifier INTEGER NOT NULL DEFAULT 0,
  armor_piercing INTEGER NOT NULL DEFAULT 0 CHECK (armor_piercing >= 0),
  range_hexes INTEGER NOT NULL CHECK (range_hexes >= 0),
  ammo_capacity INTEGER CHECK (ammo_capacity IS NULL OR ammo_capacity >= 0),
  cooldown_rounds INTEGER CHECK (cooldown_rounds IS NULL OR cooldown_rounds >= 0),
  indirect INTEGER NOT NULL DEFAULT 0 CHECK (indirect IN (0, 1)),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE equipment_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  requisition_cost INTEGER CHECK (requisition_cost IS NULL OR requisition_cost >= 0),
  consumable INTEGER NOT NULL DEFAULT 0 CHECK (consumable IN (0, 1)),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE action_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  economy TEXT NOT NULL CHECK (economy IN ('STANDARD', 'PRIMARY', 'INCIDENTAL')),
  speed_cost_quarters INTEGER NOT NULL DEFAULT 0 CHECK (speed_cost_quarters >= 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE order_type_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE structure_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  build_cost_json TEXT NOT NULL CHECK (json_valid(build_cost_json)),
  build_points INTEGER CHECK (build_points IS NULL OR build_points >= 0),
  health INTEGER CHECK (health IS NULL OR health > 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE terrain_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  movement_cost_quarters INTEGER NOT NULL CHECK (movement_cost_quarters >= 0),
  capacity INTEGER NOT NULL DEFAULT 3 CHECK (capacity >= 0),
  blocks_los INTEGER NOT NULL DEFAULT 0 CHECK (blocks_los IN (0, 1)),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE ship_class_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  health INTEGER NOT NULL CHECK (health > 0),
  armor INTEGER NOT NULL CHECK (armor >= 0),
  speed INTEGER NOT NULL CHECK (speed >= 0),
  external_slots INTEGER NOT NULL CHECK (external_slots >= 0),
  internal_slots INTEGER NOT NULL CHECK (internal_slots >= 0),
  cargo_capacity INTEGER NOT NULL CHECK (cargo_capacity >= 0),
  atmo_fuel INTEGER CHECK (atmo_fuel IS NULL OR atmo_fuel >= 0),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE enemy_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  faction_id TEXT NOT NULL,
  doctrine_json TEXT NOT NULL CHECK (json_valid(doctrine_json)),
  unit_definition_json TEXT NOT NULL CHECK (json_valid(unit_definition_json)),
  definition_status TEXT NOT NULL CHECK (definition_status IN ('active', 'experimental', 'legacy', 'incomplete')),
  source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id, ruleset_id)
);

CREATE INDEX idx_unit_definitions_ruleset ON unit_class_definitions(ruleset_id, definition_status, category);
CREATE INDEX idx_equipment_ruleset ON equipment_definitions(ruleset_id, definition_status, category);

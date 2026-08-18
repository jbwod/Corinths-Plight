PRAGMA foreign_keys = ON;

-- Phase 3 remains additive. Existing Phase 1/2 identifiers and compatibility
-- columns are retained while structured strategic records become available.

ALTER TABLE users ADD COLUMN last_active_at INTEGER;

ALTER TABLE profiles ADD COLUMN timezone TEXT;

ALTER TABLE battalions ADD COLUMN short_name TEXT;
ALTER TABLE battalions ADD COLUMN motto TEXT NOT NULL DEFAULT '';
ALTER TABLE battalions ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
  CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISBANDED'));
ALTER TABLE battalions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);

CREATE UNIQUE INDEX idx_battalions_short_name
  ON battalions(short_name COLLATE NOCASE)
  WHERE short_name IS NOT NULL;

ALTER TABLE battalion_ranks ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);
ALTER TABLE battalion_ranks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE battalion_ranks SET updated_at = created_at WHERE updated_at = 0;

ALTER TABLE battalion_memberships ADD COLUMN status_changed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battalion_memberships ADD COLUMN left_at INTEGER;
ALTER TABLE battalion_memberships ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);
ALTER TABLE battalion_memberships ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE battalion_memberships
   SET status_changed_at = joined_at,
       updated_at = joined_at
 WHERE status_changed_at = 0 OR updated_at = 0;

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'UNLINKED', 'REVOKED')),
  provider_profile_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(provider_profile_json) AND json_type(provider_profile_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  UNIQUE (provider, provider_subject_hash)
);

CREATE INDEX idx_auth_identities_user ON auth_identities(user_id, status);

CREATE TABLE account_recovery_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  request_ip_hash TEXT,
  CHECK (expires_at > created_at),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL))
);

CREATE INDEX idx_recovery_challenges_pending
  ON account_recovery_challenges(user_id, expires_at)
  WHERE status = 'PENDING';

CREATE TABLE battalion_permission_definitions (
  permission TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  implementation_status TEXT NOT NULL DEFAULT 'SCHEMA_ONLY'
    CHECK (implementation_status IN ('ACTIVE', 'SCHEMA_ONLY', 'DEFERRED')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER validate_rank_permission_insert
BEFORE INSERT ON rank_permissions
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_permission_definitions
   WHERE permission = NEW.permission
)
BEGIN
  SELECT RAISE(ABORT, 'unknown Battalion permission');
END;

CREATE TRIGGER validate_rank_permission_update
BEFORE UPDATE OF permission ON rank_permissions
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_permission_definitions
   WHERE permission = NEW.permission
)
BEGIN
  SELECT RAISE(ABORT, 'unknown Battalion permission');
END;

CREATE TRIGGER validate_membership_rank_insert
BEFORE INSERT ON battalion_memberships
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'membership rank belongs to another Battalion');
END;

CREATE TRIGGER validate_membership_rank_update
BEFORE UPDATE OF battalion_id, rank_id ON battalion_memberships
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'membership rank belongs to another Battalion');
END;

CREATE TABLE battalion_invites (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rank_id TEXT NOT NULL REFERENCES battalion_ranks(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
  message TEXT NOT NULL DEFAULT '',
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  responded_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (invited_by_user_id, command_id),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (
    (status = 'PENDING' AND responded_at IS NULL) OR
    (status <> 'PENDING' AND responded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_one_pending_battalion_invite
  ON battalion_invites(battalion_id, invited_user_id)
  WHERE status = 'PENDING';

CREATE TRIGGER validate_battalion_invite_rank_insert
BEFORE INSERT ON battalion_invites
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'invite rank belongs to another Battalion');
END;

CREATE TRIGGER validate_battalion_invite_rank_update
BEFORE UPDATE OF battalion_id, rank_id ON battalion_invites
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'invite rank belongs to another Battalion');
END;

CREATE TABLE user_active_battalions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  battalion_id TEXT NOT NULL,
  selected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (battalion_id, user_id)
    REFERENCES battalion_memberships(battalion_id, user_id) ON DELETE CASCADE
);

CREATE TRIGGER validate_active_battalion_insert
BEFORE INSERT ON user_active_battalions
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_memberships
   WHERE battalion_id = NEW.battalion_id
     AND user_id = NEW.user_id
     AND status = 'ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT, 'active Battalion selection requires active membership');
END;

CREATE TRIGGER validate_active_battalion_update
BEFORE UPDATE OF user_id, battalion_id ON user_active_battalions
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_memberships
   WHERE battalion_id = NEW.battalion_id
     AND user_id = NEW.user_id
     AND status = 'ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT, 'active Battalion selection requires active membership');
END;

CREATE TRIGGER clear_inactive_battalion_selection
AFTER UPDATE OF status ON battalion_memberships
WHEN OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE'
BEGIN
  DELETE FROM user_active_battalions
   WHERE user_id = NEW.user_id AND battalion_id = NEW.battalion_id;
END;

CREATE TABLE strategic_content_sources (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  source_sha256 TEXT,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('PRIMARY_RULES', 'PRODUCT_BRIEF', 'DEVELOPMENT_FIXTURE', 'ADMIN_AUTHORED')),
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (source_path, source_locator)
);

CREATE TABLE strategic_locations (
  id TEXT PRIMARY KEY,
  parent_location_id TEXT REFERENCES strategic_locations(id) ON DELETE RESTRICT,
  location_type TEXT NOT NULL CHECK (location_type IN (
    'GALAXY', 'STAR_SYSTEM', 'PLANET', 'MOON', 'ORBIT', 'STATION',
    'JUMP_POINT', 'SURFACE_REGION', 'CITY', 'BASE', 'JUNCTION',
    'OBJECTIVE', 'CAMPAIGN'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'DESTROYED', 'HIDDEN')),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (parent_location_id IS NULL OR parent_location_id <> id),
  UNIQUE (parent_location_id, name)
);

CREATE UNIQUE INDEX idx_strategic_location_root_name
  ON strategic_locations(name COLLATE NOCASE)
  WHERE parent_location_id IS NULL;
CREATE INDEX idx_strategic_locations_parent
  ON strategic_locations(parent_location_id, location_type, status);

CREATE TRIGGER reject_strategic_location_cycle
BEFORE UPDATE OF parent_location_id ON strategic_locations
WHEN NEW.parent_location_id IS NOT NULL
BEGIN
  WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_location_id
      FROM strategic_locations
     WHERE id = NEW.parent_location_id
    UNION ALL
    SELECT locations.id, locations.parent_location_id
      FROM strategic_locations AS locations
      JOIN ancestors ON locations.id = ancestors.parent_id
     WHERE ancestors.parent_id IS NOT NULL
  )
  SELECT RAISE(ABORT, 'strategic location hierarchy cycle') WHERE EXISTS (
    SELECT 1 FROM ancestors WHERE id = NEW.id
  );
END;

ALTER TABLE planets ADD COLUMN strategic_location_id TEXT
  REFERENCES strategic_locations(id) ON DELETE RESTRICT;
ALTER TABLE planets ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);

CREATE UNIQUE INDEX idx_planets_strategic_location
  ON planets(strategic_location_id)
  WHERE strategic_location_id IS NOT NULL;

CREATE TRIGGER validate_planet_strategic_location_insert
BEFORE INSERT ON planets
WHEN NEW.strategic_location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM strategic_locations
   WHERE id = NEW.strategic_location_id AND location_type = 'PLANET'
)
BEGIN
  SELECT RAISE(ABORT, 'planet strategic location must have PLANET type');
END;

CREATE TRIGGER validate_planet_strategic_location_update
BEFORE UPDATE OF strategic_location_id ON planets
WHEN NEW.strategic_location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM strategic_locations
   WHERE id = NEW.strategic_location_id AND location_type = 'PLANET'
)
BEGIN
  SELECT RAISE(ABORT, 'planet strategic location must have PLANET type');
END;

CREATE TABLE strategic_maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('GALAXY', 'SYSTEM', 'PLANET', 'THEATRE')),
  root_location_id TEXT NOT NULL REFERENCES strategic_locations(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  coordinator_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  clock_mode TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (clock_mode IN ('MANUAL', 'ACCELERATED', 'SCHEDULED')),
  tick_interval_seconds INTEGER
    CHECK (tick_interval_seconds IS NULL OR tick_interval_seconds > 0),
  current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round > 0),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_id TEXT NOT NULL REFERENCES strategic_content_sources(id) ON DELETE RESTRICT,
  source_locator TEXT NOT NULL,
  configuration_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(configuration_json) AND json_type(configuration_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (clock_mode = 'MANUAL' AND tick_interval_seconds IS NULL) OR
    (clock_mode <> 'MANUAL' AND tick_interval_seconds IS NOT NULL)
  )
);

CREATE TABLE strategic_nodes (
  id TEXT NOT NULL,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES strategic_locations(id) ON DELETE RESTRICT,
  node_type TEXT NOT NULL CHECK (node_type IN (
    'PLANET', 'MOON', 'ORBIT', 'STATION', 'JUMP_POINT', 'CITY', 'BASE',
    'JUNCTION', 'OBJECTIVE', 'CAMPAIGN'
  )),
  name TEXT NOT NULL,
  control_status TEXT NOT NULL DEFAULT 'NEUTRAL'
    CHECK (control_status IN ('FRIENDLY', 'ENEMY', 'CONTESTED', 'NEUTRAL', 'UNKNOWN')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'BLOCKED', 'LOCKED', 'DESTROYED')),
  position_json TEXT NOT NULL CHECK (
    json_valid(position_json) AND json_type(position_json) = 'object'
  ),
  visibility_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(visibility_json) AND json_type(visibility_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_id TEXT NOT NULL REFERENCES strategic_content_sources(id) ON DELETE RESTRICT,
  source_locator TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (id, map_id),
  UNIQUE (map_id, location_id),
  UNIQUE (map_id, name)
);

CREATE INDEX idx_strategic_nodes_map_status
  ON strategic_nodes(map_id, status, control_status);

CREATE TRIGGER validate_strategic_node_location_insert
BEFORE INSERT ON strategic_nodes
WHEN NOT EXISTS (
  SELECT 1 FROM strategic_locations
   WHERE id = NEW.location_id AND location_type = NEW.node_type
)
BEGIN
  SELECT RAISE(ABORT, 'strategic node type must match its location type');
END;

CREATE TRIGGER validate_strategic_node_location_update
BEFORE UPDATE OF location_id, node_type ON strategic_nodes
WHEN NOT EXISTS (
  SELECT 1 FROM strategic_locations
   WHERE id = NEW.location_id AND location_type = NEW.node_type
)
BEGIN
  SELECT RAISE(ABORT, 'strategic node type must match its location type');
END;

CREATE TABLE strategic_routes (
  id TEXT NOT NULL,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  route_type TEXT NOT NULL CHECK (route_type IN (
    'SURFACE_ROAD', 'SURFACE_PATH', 'AIR_CORRIDOR', 'ORBITAL', 'INTERPLANETARY', 'JUMP_ROUTE'
  )),
  bidirectional INTEGER NOT NULL DEFAULT 1 CHECK (bidirectional IN (0, 1)),
  base_travel_rounds INTEGER CHECK (base_travel_rounds IS NULL OR base_travel_rounds > 0),
  travel_cost_status TEXT NOT NULL DEFAULT 'BALANCE_REQUIRED'
    CHECK (travel_cost_status IN ('PUBLISHED', 'SCENARIO_CONFIG', 'BALANCE_REQUIRED')),
  allowed_profiles_json TEXT NOT NULL CHECK (
    json_valid(allowed_profiles_json) AND json_type(allowed_profiles_json) = 'array'
  ),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'BLOCKED', 'LOCKED', 'DESTROYED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_id TEXT NOT NULL REFERENCES strategic_content_sources(id) ON DELETE RESTRICT,
  source_locator TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (id, map_id),
  UNIQUE (map_id, from_node_id, to_node_id),
  FOREIGN KEY (from_node_id, map_id)
    REFERENCES strategic_nodes(id, map_id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id, map_id)
    REFERENCES strategic_nodes(id, map_id) ON DELETE CASCADE,
  CHECK (from_node_id <> to_node_id),
  CHECK (
    (travel_cost_status = 'BALANCE_REQUIRED' AND base_travel_rounds IS NULL) OR
    (travel_cost_status <> 'BALANCE_REQUIRED' AND base_travel_rounds IS NOT NULL)
  ),
  CHECK (json_array_length(allowed_profiles_json) > 0)
);

CREATE INDEX idx_strategic_routes_map_status
  ON strategic_routes(map_id, status, from_node_id, to_node_id);

CREATE TRIGGER reject_reverse_bidirectional_route_insert
BEFORE INSERT ON strategic_routes
WHEN NEW.bidirectional = 1 AND EXISTS (
  SELECT 1 FROM strategic_routes
   WHERE map_id = NEW.map_id
     AND from_node_id = NEW.to_node_id
     AND to_node_id = NEW.from_node_id
     AND bidirectional = 1
)
BEGIN
  SELECT RAISE(ABORT, 'reverse duplicate of bidirectional strategic route');
END;

CREATE TRIGGER reject_reverse_bidirectional_route_update
BEFORE UPDATE OF map_id, from_node_id, to_node_id, bidirectional ON strategic_routes
WHEN NEW.bidirectional = 1 AND EXISTS (
  SELECT 1 FROM strategic_routes
   WHERE id <> NEW.id
     AND map_id = NEW.map_id
     AND from_node_id = NEW.to_node_id
     AND to_node_id = NEW.from_node_id
     AND bidirectional = 1
)
BEGIN
  SELECT RAISE(ABORT, 'reverse duplicate of bidirectional strategic route');
END;

CREATE TABLE strategic_operations (
  id TEXT NOT NULL,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  campaign_id TEXT UNIQUE REFERENCES campaigns(id) ON DELETE SET NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  role_summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'ANNOUNCED', 'MUSTERING', 'ACTIVE', 'RESOLVED', 'FAILED', 'CANCELLED'
  )),
  threat_level TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (threat_level IN ('UNKNOWN', 'LOW', 'MODERATE', 'HIGH', 'EXTREME')),
  objectives_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(objectives_json) AND json_type(objectives_json) = 'array'),
  recommended_capabilities_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(recommended_capabilities_json) AND json_type(recommended_capabilities_json) = 'array'),
  deployment_rules_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(deployment_rules_json) AND json_type(deployment_rules_json) = 'object'),
  reinforcement_policy_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(reinforcement_policy_json) AND json_type(reinforcement_policy_json) = 'object'),
  known_enemy_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(known_enemy_json) AND json_type(known_enemy_json) = 'object'),
  effect_rules_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(effect_rules_json) AND json_type(effect_rules_json) = 'array'),
  outcome_json TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json)),
  starts_at INTEGER,
  ends_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_id TEXT NOT NULL REFERENCES strategic_content_sources(id) ON DELETE RESTRICT,
  source_locator TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (id),
  UNIQUE (id, map_id),
  UNIQUE (map_id, code),
  FOREIGN KEY (node_id, map_id)
    REFERENCES strategic_nodes(id, map_id) ON DELETE RESTRICT,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CHECK ((status IN ('RESOLVED', 'FAILED')) = (outcome_json IS NOT NULL))
);

CREATE INDEX idx_strategic_operations_map_status
  ON strategic_operations(map_id, status, node_id);

ALTER TABLE campaigns ADD COLUMN strategic_node_id TEXT
  REFERENCES strategic_nodes(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN strategic_status TEXT NOT NULL DEFAULT 'ANNOUNCED'
  CHECK (strategic_status IN ('ANNOUNCED', 'MUSTERING', 'ACTIVE', 'RESOLVED', 'FAILED', 'CANCELLED'));
ALTER TABLE campaigns ADD COLUMN strategic_revision INTEGER NOT NULL DEFAULT 1
  CHECK (strategic_revision > 0);

UPDATE campaigns
   SET strategic_status = CASE status
     WHEN 'DRAFT' THEN 'ANNOUNCED'
     WHEN 'RECRUITING' THEN 'MUSTERING'
     WHEN 'ACTIVE' THEN 'ACTIVE'
     WHEN 'PAUSED' THEN 'ACTIVE'
     WHEN 'COMPLETE' THEN 'RESOLVED'
     WHEN 'FAILED' THEN 'FAILED'
     ELSE 'ANNOUNCED'
   END;

CREATE UNIQUE INDEX idx_ships_id_battalion ON ships(id, battalion_id);
CREATE UNIQUE INDEX idx_battlegroups_id_battalion ON battlegroups(id, battalion_id);
CREATE UNIQUE INDEX idx_player_units_id_owner ON player_units(id, owner_id);

CREATE TABLE task_forces (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  callsign TEXT NOT NULL,
  commander_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  current_node_id TEXT,
  status TEXT NOT NULL DEFAULT 'FORMING' CHECK (status IN (
    'FORMING', 'READY', 'IN_TRANSIT', 'ARRIVING', 'DEPLOYING', 'DAMAGED', 'DESTROYED'
  )),
  supply_state TEXT NOT NULL DEFAULT 'UNSUPPLIED'
    CHECK (supply_state IN ('SUPPLIED', 'UNSUPPLIED')),
  supplied_until_round INTEGER CHECK (supplied_until_round IS NULL OR supplied_until_round > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(state_json) AND json_type(state_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (id, battalion_id),
  UNIQUE (battalion_id, name),
  UNIQUE (battalion_id, callsign),
  FOREIGN KEY (current_node_id, map_id)
    REFERENCES strategic_nodes(id, map_id) ON DELETE RESTRICT,
  CHECK (
    (supply_state = 'SUPPLIED' AND supplied_until_round IS NOT NULL) OR
    (supply_state = 'UNSUPPLIED' AND supplied_until_round IS NULL)
  )
);

CREATE INDEX idx_task_forces_map_status
  ON task_forces(map_id, status, current_node_id);

CREATE TABLE task_force_ships (
  task_force_id TEXT NOT NULL,
  battalion_id TEXT NOT NULL,
  ship_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PRIMARY'
    CHECK (role IN ('PRIMARY', 'ESCORT', 'SUPPORT', 'TRANSPORT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DETACHED', 'LOST')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  released_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (task_force_id, ship_id),
  FOREIGN KEY (task_force_id, battalion_id)
    REFERENCES task_forces(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (ship_id, battalion_id)
    REFERENCES ships(id, battalion_id) ON DELETE CASCADE,
  CHECK (
    (status = 'ACTIVE' AND released_at IS NULL) OR
    (status <> 'ACTIVE' AND released_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_one_active_task_force_per_ship
  ON task_force_ships(ship_id)
  WHERE status = 'ACTIVE';

CREATE TABLE task_force_battlegroups (
  id TEXT PRIMARY KEY,
  task_force_id TEXT NOT NULL,
  battalion_id TEXT NOT NULL,
  battlegroup_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EMBARKING'
    CHECK (status IN ('EMBARKING', 'EMBARKED', 'DISEMBARKING', 'DISEMBARKED', 'CANCELLED')),
  embarked_at INTEGER,
  disembarked_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (task_force_id, battlegroup_id),
  FOREIGN KEY (task_force_id, battalion_id)
    REFERENCES task_forces(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (battlegroup_id, battalion_id)
    REFERENCES battlegroups(id, battalion_id) ON DELETE CASCADE,
  CHECK (
    (status = 'EMBARKED' AND embarked_at IS NOT NULL AND disembarked_at IS NULL) OR
    (status = 'DISEMBARKED' AND embarked_at IS NOT NULL AND disembarked_at IS NOT NULL) OR
    (status IN ('EMBARKING', 'DISEMBARKING', 'CANCELLED'))
  )
);

CREATE UNIQUE INDEX idx_one_active_task_force_per_battlegroup
  ON task_force_battlegroups(battlegroup_id)
  WHERE status IN ('EMBARKING', 'EMBARKED', 'DISEMBARKING');

ALTER TABLE battlegroups ADD COLUMN callsign TEXT;
ALTER TABLE battlegroups ADD COLUMN status TEXT NOT NULL DEFAULT 'FORMING'
  CHECK (status IN (
    'FORMING', 'READY', 'EMBARKED', 'DEPLOYING', 'DEPLOYED',
    'IN_TRANSIT', 'WITHDRAWING', 'RECOVERING'
  ));
ALTER TABLE battlegroups ADD COLUMN current_node_id TEXT
  REFERENCES strategic_nodes(id) ON DELETE SET NULL;
ALTER TABLE battlegroups ADD COLUMN current_operation_id TEXT
  REFERENCES strategic_operations(id) ON DELETE SET NULL;
ALTER TABLE battlegroups ADD COLUMN current_carrier_task_force_id TEXT
  REFERENCES task_forces(id) ON DELETE SET NULL;
ALTER TABLE battlegroups ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);
ALTER TABLE battlegroups ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE battlegroups SET updated_at = created_at WHERE updated_at = 0;

CREATE UNIQUE INDEX idx_battlegroups_callsign
  ON battlegroups(battalion_id, callsign COLLATE NOCASE)
  WHERE callsign IS NOT NULL;

CREATE TRIGGER reject_conflicting_battlegroup_location_insert
BEFORE INSERT ON battlegroups
WHEN NEW.current_node_id IS NOT NULL AND NEW.current_carrier_task_force_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'embarked Battlegroup location derives from its Task Force');
END;

CREATE TRIGGER reject_conflicting_battlegroup_location_update
BEFORE UPDATE OF current_node_id, current_carrier_task_force_id ON battlegroups
WHEN NEW.current_node_id IS NOT NULL AND NEW.current_carrier_task_force_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'embarked Battlegroup location derives from its Task Force');
END;

CREATE TABLE unit_order_delegations (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  player_unit_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  delegate_user_id TEXT NOT NULL,
  battlegroup_id TEXT,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('BATTLEGROUP', 'CAMPAIGN', 'TIME_WINDOW')),
  starts_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ends_at INTEGER,
  revoked_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (owner_user_id, command_id),
  FOREIGN KEY (player_unit_id, owner_user_id)
    REFERENCES player_units(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (battlegroup_id, battalion_id)
    REFERENCES battlegroups(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (battalion_id, delegate_user_id)
    REFERENCES battalion_memberships(battalion_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (battalion_id, owner_user_id)
    REFERENCES battalion_memberships(battalion_id, user_id) ON DELETE CASCADE,
  CHECK (owner_user_id <> delegate_user_id),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (
    (scope_type = 'BATTLEGROUP' AND battlegroup_id IS NOT NULL) OR
    (scope_type = 'CAMPAIGN' AND campaign_id IS NOT NULL) OR
    (scope_type = 'TIME_WINDOW' AND ends_at IS NOT NULL)
  )
);

CREATE INDEX idx_active_unit_delegations
  ON unit_order_delegations(player_unit_id, delegate_user_id, starts_at, ends_at)
  WHERE revoked_at IS NULL;

ALTER TABLE ships ADD COLUMN registry TEXT;
ALTER TABLE ships ADD COLUMN current_location_id TEXT
  REFERENCES strategic_locations(id) ON DELETE SET NULL;
ALTER TABLE ships ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);

CREATE UNIQUE INDEX idx_ship_registry
  ON ships(registry COLLATE NOCASE)
  WHERE registry IS NOT NULL;

ALTER TABLE ship_equipment ADD COLUMN installation_status TEXT NOT NULL DEFAULT 'INSTALLED'
  CHECK (installation_status IN ('INSTALLED', 'DAMAGED', 'OFFLINE', 'REMOVED'));
ALTER TABLE ship_equipment ADD COLUMN installed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ship_equipment ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ship_equipment ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision > 0);

UPDATE ship_equipment
   SET installed_at = unixepoch(), updated_at = unixepoch()
 WHERE installed_at = 0 OR updated_at = 0;

DROP VIEW ship_effective_capabilities;

CREATE VIEW ship_effective_capabilities AS
SELECT ship_id, ruleset_id, capability_id, SUM(capacity) AS capacity
FROM (
  SELECT equipment.ship_id, equipment.ruleset_id,
         grants.capability_id, grants.capacity_delta AS capacity
    FROM ship_equipment AS equipment
    JOIN ship_module_capability_grants AS grants
      ON grants.equipment_definition_id = equipment.equipment_definition_id
     AND grants.ruleset_id = equipment.ruleset_id
   WHERE equipment.installation_status = 'INSTALLED'
  UNION ALL
  SELECT ship_id, ruleset_id, capability_id, capacity
    FROM ship_capability_overrides
)
GROUP BY ship_id, ruleset_id, capability_id;

CREATE TRIGGER validate_primary_ship_update
BEFORE UPDATE OF primary_ship_id ON battalions
WHEN NEW.primary_ship_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM ships
   WHERE id = NEW.primary_ship_id AND battalion_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'primary ship belongs to another Battalion');
END;

CREATE TABLE strategic_supply_stores (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  holder_type TEXT NOT NULL CHECK (holder_type IN ('SHIP', 'TASK_FORCE', 'HQ', 'FOB', 'UNIT')),
  ship_id TEXT,
  task_force_id TEXT,
  location_id TEXT REFERENCES strategic_locations(id) ON DELETE CASCADE,
  player_unit_id TEXT REFERENCES player_units(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DEPLETED', 'DESTROYED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (ship_id, battalion_id)
    REFERENCES ships(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (task_force_id, battalion_id)
    REFERENCES task_forces(id, battalion_id) ON DELETE CASCADE,
  CHECK (
    (holder_type = 'SHIP' AND ship_id IS NOT NULL AND task_force_id IS NULL AND location_id IS NULL AND player_unit_id IS NULL) OR
    (holder_type = 'TASK_FORCE' AND ship_id IS NULL AND task_force_id IS NOT NULL AND location_id IS NULL AND player_unit_id IS NULL) OR
    (holder_type IN ('HQ', 'FOB') AND ship_id IS NULL AND task_force_id IS NULL AND location_id IS NOT NULL AND player_unit_id IS NULL) OR
    (holder_type = 'UNIT' AND ship_id IS NULL AND task_force_id IS NULL AND location_id IS NULL AND player_unit_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_one_supply_store_per_ship
  ON strategic_supply_stores(ship_id) WHERE ship_id IS NOT NULL;
CREATE UNIQUE INDEX idx_one_supply_store_per_task_force
  ON strategic_supply_stores(task_force_id) WHERE task_force_id IS NOT NULL;
CREATE UNIQUE INDEX idx_one_supply_store_per_unit
  ON strategic_supply_stores(player_unit_id) WHERE player_unit_id IS NOT NULL;
CREATE UNIQUE INDEX idx_one_supply_store_per_location_kind
  ON strategic_supply_stores(location_id, holder_type) WHERE location_id IS NOT NULL;

CREATE TABLE strategic_supply_balances (
  store_id TEXT NOT NULL REFERENCES strategic_supply_stores(id) ON DELETE CASCADE,
  supply_size TEXT NOT NULL CHECK (supply_size IN ('LARGE', 'MEDIUM', 'SMALL')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (store_id, supply_size),
  CHECK (capacity IS NULL OR quantity <= capacity)
);

CREATE TABLE strategic_rounds (
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'LOCKED', 'RESOLVING', 'RESOLVED', 'FAILED', 'PAUSED')),
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  resolver_version TEXT NOT NULL,
  opens_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lock_at INTEGER,
  resolves_at INTEGER,
  locked_at INTEGER,
  resolved_at INTEGER,
  resolution_key TEXT UNIQUE,
  input_hash TEXT,
  result_hash TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(state_json) AND json_type(state_json) = 'object'),
  PRIMARY KEY (map_id, round_number),
  CHECK (lock_at IS NULL OR lock_at >= opens_at),
  CHECK (resolves_at IS NULL OR lock_at IS NULL OR resolves_at >= lock_at),
  CHECK (locked_at IS NULL OR status IN ('LOCKED', 'RESOLVING', 'RESOLVED', 'FAILED')),
  CHECK (resolved_at IS NULL OR status IN ('RESOLVED', 'FAILED')),
  CHECK (
    status NOT IN ('RESOLVED', 'FAILED') OR
    (resolution_key IS NOT NULL AND input_hash IS NOT NULL AND result_hash IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE TABLE strategic_orders (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_type TEXT NOT NULL CHECK (order_type IN (
    'MOVE_TASK_FORCE', 'MOVE_BATTLEGROUP', 'EMBARK_BATTLEGROUP',
    'DISEMBARK_BATTLEGROUP', 'DEPLOY_TO_CAMPAIGN', 'WITHDRAW_FROM_CAMPAIGN',
    'TRANSFER_SUPPLY', 'RESUPPLY_TASK_FORCE', 'SUPPORT_CAMPAIGN'
  )),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('TASK_FORCE', 'BATTLEGROUP')),
  task_force_id TEXT,
  battlegroup_id TEXT,
  destination_node_id TEXT,
  operation_id TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle IN ('DRAFT', 'SUBMITTED', 'LOCKED', 'RESOLVING', 'RESOLVED', 'FAILED', 'CANCELLED')),
  route_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(route_json) AND json_type(route_json) = 'array'),
  intent_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(intent_json) AND json_type(intent_json) = 'object'),
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  expected_subject_revision INTEGER NOT NULL CHECK (expected_subject_revision > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  submitted_at INTEGER,
  locked_at INTEGER,
  resolved_at INTEGER,
  failure_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (actor_user_id, command_id),
  FOREIGN KEY (map_id, round_number)
    REFERENCES strategic_rounds(map_id, round_number) ON DELETE CASCADE,
  FOREIGN KEY (battalion_id, actor_user_id)
    REFERENCES battalion_memberships(battalion_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (task_force_id, battalion_id)
    REFERENCES task_forces(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (battlegroup_id, battalion_id)
    REFERENCES battlegroups(id, battalion_id) ON DELETE CASCADE,
  FOREIGN KEY (destination_node_id, map_id)
    REFERENCES strategic_nodes(id, map_id) ON DELETE RESTRICT,
  FOREIGN KEY (operation_id, map_id)
    REFERENCES strategic_operations(id, map_id) ON DELETE RESTRICT,
  CHECK (
    (subject_type = 'TASK_FORCE' AND task_force_id IS NOT NULL AND battlegroup_id IS NULL) OR
    (subject_type = 'BATTLEGROUP' AND battlegroup_id IS NOT NULL AND task_force_id IS NULL)
  ),
  CHECK ((lifecycle = 'DRAFT') = (submitted_at IS NULL)),
  CHECK (locked_at IS NULL OR lifecycle IN ('LOCKED', 'RESOLVING', 'RESOLVED', 'FAILED')),
  CHECK (resolved_at IS NULL OR lifecycle IN ('RESOLVED', 'FAILED')),
  CHECK ((lifecycle = 'FAILED') = (failure_code IS NOT NULL))
);

CREATE INDEX idx_strategic_orders_round_lifecycle
  ON strategic_orders(map_id, round_number, lifecycle, created_at);
CREATE INDEX idx_strategic_orders_battalion
  ON strategic_orders(battalion_id, created_at, id);

CREATE TABLE strategic_events (
  event_id TEXT PRIMARY KEY,
  map_id TEXT REFERENCES strategic_maps(id) ON DELETE CASCADE,
  round_number INTEGER,
  sequence INTEGER CHECK (sequence IS NULL OR sequence >= 0),
  event_type TEXT NOT NULL,
  battalion_id TEXT REFERENCES battalions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  audience TEXT NOT NULL DEFAULT 'BATTALION'
    CHECK (audience IN ('OWNER', 'BATTALION', 'PUBLIC', 'ADMIN')),
  subject_type TEXT,
  subject_id TEXT,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  event_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (map_id, round_number)
    REFERENCES strategic_rounds(map_id, round_number) ON DELETE CASCADE,
  CHECK (
    (map_id IS NULL AND round_number IS NULL AND sequence IS NULL) OR
    (map_id IS NOT NULL AND round_number IS NOT NULL AND sequence IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_strategic_event_sequence
  ON strategic_events(map_id, round_number, sequence)
  WHERE map_id IS NOT NULL;
CREATE INDEX idx_strategic_events_battalion_feed
  ON strategic_events(battalion_id, occurred_at DESC, event_id);

CREATE TABLE strategic_effect_receipts (
  idempotency_key TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('STRATEGIC_RESOLUTION', 'CAMPAIGN_RESULT', 'ADMIN')),
  source_id TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  effect_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL
    CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPLIED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  applied_at INTEGER,
  UNIQUE (source_kind, source_id, source_version, effect_type, target_type, target_id),
  CHECK ((status = 'APPLIED') = (applied_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR last_error IS NOT NULL)
);

CREATE INDEX idx_strategic_effects_pending
  ON strategic_effect_receipts(map_id, status, created_at)
  WHERE status <> 'APPLIED';

CREATE TABLE strategic_war_variables (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES strategic_maps(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES strategic_locations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL DEFAULT 'WORLD'
    CHECK (scope_type IN ('WORLD', 'BATTALION', 'FACTION')),
  scope_id TEXT NOT NULL DEFAULT 'WORLD',
  variable_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  visibility TEXT NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'BATTALION', 'ADMIN')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_event_id TEXT REFERENCES strategic_events(event_id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (map_id, location_id, scope_type, scope_id, variable_key)
);

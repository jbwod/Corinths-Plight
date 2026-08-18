PRAGMA foreign_keys = ON;

-- Phase 2 is additive. The legacy columns remain readable while the richer force
-- model is adopted by the application.
ALTER TABLE player_units ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE player_units ADD COLUMN location_state TEXT NOT NULL DEFAULT 'RESERVE'
  CHECK (location_state IN (
    'RESERVE', 'ON_MAP', 'EMBARKED', 'ON_SHIP', 'IN_AIR_TRANSPORT',
    'IN_VEHICLE', 'IN_TRANSIT', 'DESTROYED'
  ));
ALTER TABLE player_units ADD COLUMN service_campaigns INTEGER NOT NULL DEFAULT 0
  CHECK (service_campaigns >= 0);
ALTER TABLE player_units ADD COLUMN service_rounds INTEGER NOT NULL DEFAULT 0
  CHECK (service_rounds >= 0);
ALTER TABLE player_units ADD COLUMN version INTEGER NOT NULL DEFAULT 1
  CHECK (version > 0);
ALTER TABLE player_units ADD COLUMN requisition_value_status TEXT NOT NULL DEFAULT 'PUBLISHED'
  CHECK (requisition_value_status IN ('PUBLISHED', 'BALANCE_REQUIRED', 'DEV_OVERRIDE'));
ALTER TABLE campaigns ADD COLUMN force_policy_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(force_policy_json));

UPDATE player_units
SET location_state = CASE location_kind
  WHEN 'SHIP' THEN 'ON_SHIP'
  WHEN 'CAMPAIGN' THEN 'ON_MAP'
  WHEN 'DESTROYED' THEN 'DESTROYED'
  ELSE 'RESERVE'
END;

UPDATE player_units
SET requisition_value_status = CASE
  WHEN EXISTS (
    SELECT 1
      FROM unit_class_definitions AS definitions
     WHERE definitions.id = player_units.definition_id
       AND definitions.ruleset_id = player_units.ruleset_id
       AND definitions.requisition_cost IS NULL
  ) THEN 'BALANCE_REQUIRED'
  ELSE 'PUBLISHED'
END;

CREATE TRIGGER validate_player_unit_location_insert
BEFORE INSERT ON player_units
WHEN NOT (
  (NEW.location_state = 'RESERVE' AND NEW.location_kind = 'RESERVE') OR
  (NEW.location_state = 'ON_SHIP' AND NEW.location_kind = 'SHIP') OR
  (NEW.location_state = 'DESTROYED' AND NEW.location_kind = 'DESTROYED') OR
  (NEW.location_state IN ('ON_MAP', 'EMBARKED', 'IN_AIR_TRANSPORT', 'IN_VEHICLE', 'IN_TRANSIT')
    AND NEW.location_kind = 'CAMPAIGN')
)
BEGIN
  SELECT RAISE(ABORT, 'player unit location_kind/location_state mismatch');
END;

CREATE TRIGGER validate_player_unit_location_update
BEFORE UPDATE OF location_kind, location_state ON player_units
WHEN NOT (
  (NEW.location_state = 'RESERVE' AND NEW.location_kind = 'RESERVE') OR
  (NEW.location_state = 'ON_SHIP' AND NEW.location_kind = 'SHIP') OR
  (NEW.location_state = 'DESTROYED' AND NEW.location_kind = 'DESTROYED') OR
  (NEW.location_state IN ('ON_MAP', 'EMBARKED', 'IN_AIR_TRANSPORT', 'IN_VEHICLE', 'IN_TRANSIT')
    AND NEW.location_kind = 'CAMPAIGN')
)
BEGIN
  SELECT RAISE(ABORT, 'player unit location_kind/location_state mismatch');
END;

CREATE TRIGGER validate_player_unit_memorial_insert
BEFORE INSERT ON player_units
WHEN NEW.status = 'DESTROYED' AND (
  NEW.destroyed_campaign_id IS NULL OR
  NEW.destroyed_round IS NULL OR NEW.destroyed_round <= 0 OR
  NEW.destroyed_at IS NULL OR
  NOT EXISTS (SELECT 1 FROM campaigns WHERE id = NEW.destroyed_campaign_id)
)
BEGIN
  SELECT RAISE(ABORT, 'destroyed unit requires valid campaign, positive round, and timestamp');
END;

CREATE TRIGGER validate_player_unit_memorial_update
BEFORE UPDATE OF status, destroyed_campaign_id, destroyed_round, destroyed_at ON player_units
WHEN NEW.status = 'DESTROYED' AND (
  NEW.destroyed_campaign_id IS NULL OR
  NEW.destroyed_round IS NULL OR NEW.destroyed_round <= 0 OR
  NEW.destroyed_at IS NULL OR
  NOT EXISTS (SELECT 1 FROM campaigns WHERE id = NEW.destroyed_campaign_id)
)
BEGIN
  SELECT RAISE(ABORT, 'destroyed unit requires valid campaign, positive round, and timestamp');
END;

ALTER TABLE unit_history ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE unit_history ADD COLUMN actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE unit_history ADD COLUMN definition_id TEXT;
ALTER TABLE unit_history ADD COLUMN visibility TEXT NOT NULL DEFAULT 'OWNER'
  CHECK (visibility IN ('OWNER', 'BATTALION', 'PUBLIC', 'ADMIN'));

CREATE TRIGGER validate_unit_history_campaign_insert
BEFORE INSERT ON unit_history
WHEN
  (NEW.campaign_id IS NULL AND NEW.round_number IS NOT NULL) OR
  (NEW.campaign_id IS NOT NULL AND (
    NEW.round_number IS NULL OR NEW.round_number <= 0 OR
    NOT EXISTS (SELECT 1 FROM campaigns WHERE id = NEW.campaign_id)
  ))
BEGIN
  SELECT RAISE(ABORT, 'campaign history requires valid campaign and positive round');
END;

CREATE TRIGGER validate_unit_history_campaign_update
BEFORE UPDATE OF campaign_id, round_number ON unit_history
WHEN
  (NEW.campaign_id IS NULL AND NEW.round_number IS NOT NULL) OR
  (NEW.campaign_id IS NOT NULL AND (
    NEW.round_number IS NULL OR NEW.round_number <= 0 OR
    NOT EXISTS (SELECT 1 FROM campaigns WHERE id = NEW.campaign_id)
  ))
BEGIN
  SELECT RAISE(ABORT, 'campaign history requires valid campaign and positive round');
END;

CREATE UNIQUE INDEX idx_player_units_id_ruleset
  ON player_units(id, ruleset_id);
CREATE UNIQUE INDEX idx_ships_id_ruleset
  ON ships(id, ruleset_id);

CREATE TABLE movement_profile_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('GROUND', 'VTOL', 'AEROSPACE', 'ORBITAL')),
  uses_facing INTEGER NOT NULL DEFAULT 1 CHECK (uses_facing IN (0, 1)),
  allows_hostile_passage INTEGER NOT NULL DEFAULT 0 CHECK (allows_hostile_passage IN (0, 1)),
  requires_flight_path INTEGER NOT NULL DEFAULT 0 CHECK (requires_flight_path IN (0, 1)),
  can_land INTEGER NOT NULL DEFAULT 0 CHECK (can_land IN (0, 1)),
  can_enter_orbit INTEGER NOT NULL DEFAULT 0 CHECK (can_enter_orbit IN (0, 1)),
  terrain_costs_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(terrain_costs_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE durability_profile_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('FORCE_STRENGTH', 'HITS')),
  output_scales_with_current INTEGER NOT NULL DEFAULT 0 CHECK (output_scales_with_current IN (0, 1)),
  supports_subsystems INTEGER NOT NULL DEFAULT 0 CHECK (supports_subsystems IN (0, 1)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE cargo_profile_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity_json TEXT NOT NULL CHECK (json_valid(capacity_json)),
  loading_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(loading_rules_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE supply_profile_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacities_json TEXT NOT NULL CHECK (json_valid(capacities_json)),
  reload_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reload_rules_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE deployment_profile_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  requirements_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(requirements_json)),
  drop_modes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(drop_modes_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE tag_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE ability_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  action_definition_id TEXT,
  target_selector_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(target_selector_json)),
  effect_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(effect_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id),
  FOREIGN KEY (action_definition_id, ruleset_id)
    REFERENCES action_definitions(id, ruleset_id) ON DELETE RESTRICT
);

CREATE TABLE status_effect_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stacking_rule TEXT NOT NULL DEFAULT 'REPLACE'
    CHECK (stacking_rule IN ('REPLACE', 'REFRESH', 'STACK', 'UNIQUE')),
  visibility TEXT NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'OWNER', 'SIDE', 'SERVER_ONLY')),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE unit_definition_profiles (
  unit_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  movement_profile_id TEXT NOT NULL,
  durability_profile_id TEXT NOT NULL,
  cargo_profile_id TEXT,
  supply_profile_id TEXT,
  deployment_profile_id TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(profile_json)),
  PRIMARY KEY (unit_definition_id, ruleset_id),
  FOREIGN KEY (unit_definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (movement_profile_id, ruleset_id)
    REFERENCES movement_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (durability_profile_id, ruleset_id)
    REFERENCES durability_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (cargo_profile_id, ruleset_id)
    REFERENCES cargo_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (supply_profile_id, ruleset_id)
    REFERENCES supply_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (deployment_profile_id, ruleset_id)
    REFERENCES deployment_profile_definitions(id, ruleset_id) ON DELETE RESTRICT
);

CREATE TABLE unit_definition_tags (
  unit_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (unit_definition_id, ruleset_id, tag_id),
  FOREIGN KEY (unit_definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id, ruleset_id)
    REFERENCES tag_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE unit_definition_abilities (
  unit_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  ability_id TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'BASE' CHECK (source_kind IN ('BASE', 'EQUIPMENT', 'REFIT')),
  PRIMARY KEY (unit_definition_id, ruleset_id, ability_id, source_kind),
  FOREIGN KEY (unit_definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (ability_id, ruleset_id)
    REFERENCES ability_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE unit_definition_weapons (
  unit_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  weapon_definition_id TEXT NOT NULL,
  mount_role TEXT NOT NULL CHECK (mount_role IN ('PRIMARY', 'SECONDARY', 'EQUIPMENT', 'DISPOSABLE')),
  mount_index INTEGER NOT NULL DEFAULT 0 CHECK (mount_index >= 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  PRIMARY KEY (unit_definition_id, ruleset_id, mount_role, mount_index),
  FOREIGN KEY (unit_definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (weapon_definition_id, ruleset_id)
    REFERENCES weapon_definitions(id, ruleset_id) ON DELETE RESTRICT
);

CREATE TABLE unit_equipment_slot_definitions (
  unit_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL,
  slot_count INTEGER NOT NULL CHECK (slot_count >= 0),
  eligibility_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(eligibility_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY (unit_definition_id, ruleset_id, slot_type),
  FOREIGN KEY (unit_definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE equipment_eligibility_rules (
  equipment_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  required_tags_all_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(required_tags_all_json)),
  required_tags_any_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(required_tags_any_json)),
  forbidden_tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(forbidden_tags_json)),
  allowed_unit_definitions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_unit_definitions_json)),
  slot_types_json TEXT NOT NULL CHECK (json_valid(slot_types_json)),
  maximum_equipped INTEGER CHECK (maximum_equipped IS NULL OR maximum_equipped > 0),
  rule_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(rule_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY (equipment_definition_id, ruleset_id),
  FOREIGN KEY (equipment_definition_id, ruleset_id)
    REFERENCES equipment_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE ruleset_implementation_overlays (
  definition_kind TEXT NOT NULL CHECK (definition_kind IN (
    'UNIT', 'ENEMY', 'WEAPON', 'EQUIPMENT', 'ACTION', 'ORDER', 'STATUS',
    'ABILITY', 'STRUCTURE', 'SHIP_MODULE'
  )),
  definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  implementation_status TEXT NOT NULL
    CHECK (implementation_status IN ('IMPLEMENTED', 'PARTIAL', 'CATALOGUE_ONLY')),
  requisition_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (requisition_status IN ('PUBLISHED', 'BALANCE_REQUIRED', 'NOT_APPLICABLE')),
  availability_status TEXT NOT NULL DEFAULT 'HIDDEN'
    CHECK (availability_status IN ('AVAILABLE', 'BLOCKED', 'DEV_ONLY', 'HIDDEN')),
  executable INTEGER NOT NULL DEFAULT 0 CHECK (executable IN (0, 1)),
  purchasable INTEGER NOT NULL DEFAULT 0 CHECK (purchasable IN (0, 1)),
  reason_code TEXT,
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  overlay_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overlay_json)),
  PRIMARY KEY (definition_kind, definition_id, ruleset_id),
  CHECK (purchasable = 0 OR requisition_status = 'PUBLISHED'),
  CHECK (purchasable = 0 OR availability_status = 'AVAILABLE'),
  CHECK (executable = 0 OR implementation_status <> 'CATALOGUE_ONLY')
);

CREATE TABLE force_mutation_receipts (
  idempotency_key TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner_id, idempotency_key)
);

CREATE TABLE player_unit_loadouts (
  id TEXT PRIMARY KEY,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  loadout_kind TEXT NOT NULL CHECK (loadout_kind IN ('OWNED_DEFAULT', 'CAMPAIGN')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (id, player_unit_id),
  CHECK (
    (loadout_kind = 'OWNED_DEFAULT' AND campaign_id IS NULL) OR
    (loadout_kind = 'CAMPAIGN' AND campaign_id IS NOT NULL)
  ),
  UNIQUE (player_unit_id, loadout_kind, campaign_id, name)
);

CREATE UNIQUE INDEX idx_one_active_default_loadout
  ON player_unit_loadouts(player_unit_id)
  WHERE status = 'ACTIVE' AND loadout_kind = 'OWNED_DEFAULT';

CREATE TABLE player_unit_loadout_items (
  loadout_id TEXT NOT NULL,
  player_unit_id TEXT NOT NULL,
  owned_slot_type TEXT NOT NULL,
  owned_slot_index INTEGER NOT NULL CHECK (owned_slot_index >= 0),
  mount_role TEXT NOT NULL CHECK (mount_role IN ('PRIMARY', 'SECONDARY', 'INTERNAL', 'EXTERNAL', 'CARGO', 'OTHER')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  PRIMARY KEY (loadout_id, owned_slot_type, owned_slot_index),
  FOREIGN KEY (loadout_id, player_unit_id)
    REFERENCES player_unit_loadouts(id, player_unit_id) ON DELETE CASCADE,
  FOREIGN KEY (player_unit_id, owned_slot_type, owned_slot_index)
    REFERENCES player_unit_equipment(player_unit_id, slot_type, slot_index) ON DELETE RESTRICT
);

CREATE TABLE player_unit_weapon_mounts (
  id TEXT PRIMARY KEY,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  weapon_definition_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('BASE', 'EQUIPMENT', 'REFIT')),
  mount_role TEXT NOT NULL CHECK (mount_role IN ('PRIMARY', 'SECONDARY', 'EQUIPMENT', 'DISPOSABLE')),
  mount_index INTEGER NOT NULL DEFAULT 0 CHECK (mount_index >= 0),
  current_ammo INTEGER CHECK (current_ammo IS NULL OR current_ammo >= 0),
  cooldown_remaining INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_remaining >= 0),
  state TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK (state IN ('OPERATIONAL', 'DAMAGED', 'DISABLED', 'EXPENDED')),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (weapon_definition_id, ruleset_id)
    REFERENCES weapon_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (player_unit_id, ruleset_id)
    REFERENCES player_units(id, ruleset_id) ON DELETE CASCADE,
  UNIQUE (player_unit_id, mount_role, mount_index)
);

CREATE TABLE unit_cargo_manifests (
  carrier_unit_id TEXT PRIMARY KEY REFERENCES player_units(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  cargo_profile_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (cargo_profile_id, ruleset_id)
    REFERENCES cargo_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (carrier_unit_id, ruleset_id)
    REFERENCES player_units(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE unit_cargo_items (
  id TEXT PRIMARY KEY,
  carrier_unit_id TEXT NOT NULL REFERENCES unit_cargo_manifests(carrier_unit_id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('UNIT', 'SUPPLY', 'RESOURCE', 'EQUIPMENT')),
  carried_unit_id TEXT REFERENCES player_units(id) ON DELETE RESTRICT,
  reference_id TEXT,
  resource_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  transport_mode TEXT NOT NULL DEFAULT 'STOWED'
    CHECK (transport_mode IN ('STOWED', 'EMBARKED', 'TOWED', 'AIRLIFTED')),
  cargo_slots_quarters INTEGER NOT NULL CHECK (cargo_slots_quarters >= 0),
  state TEXT NOT NULL DEFAULT 'LOADED' CHECK (state IN ('LOADED', 'UNLOADED', 'LOST', 'DESTROYED')),
  loaded_at INTEGER NOT NULL DEFAULT (unixepoch()),
  unloaded_at INTEGER,
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  CHECK (carried_unit_id IS NULL OR carried_unit_id <> carrier_unit_id),
  CHECK (cargo_slots_quarters > 0 OR transport_mode = 'TOWED'),
  CHECK (
    (item_kind = 'UNIT' AND carried_unit_id IS NOT NULL AND quantity = 1) OR
    (item_kind <> 'UNIT' AND carried_unit_id IS NULL)
  ),
  CHECK (
    (item_kind IN ('SUPPLY', 'RESOURCE') AND resource_type IS NOT NULL) OR
    (item_kind NOT IN ('SUPPLY', 'RESOURCE'))
  ),
  CHECK (state = 'LOADED' OR unloaded_at IS NOT NULL)
);

CREATE UNIQUE INDEX idx_one_active_carrier_per_unit
  ON unit_cargo_items(carried_unit_id)
  WHERE carried_unit_id IS NOT NULL AND state = 'LOADED';
CREATE INDEX idx_cargo_manifest_state ON unit_cargo_items(carrier_unit_id, state);

CREATE TABLE player_unit_supplies (
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  current_quantity INTEGER NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  maximum_quantity INTEGER NOT NULL CHECK (maximum_quantity >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_unit_id, resource_type),
  CHECK (current_quantity <= maximum_quantity)
);

CREATE TABLE player_unit_subsystems (
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  subsystem_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'OPERATIONAL'
    CHECK (state IN ('OPERATIONAL', 'DAMAGED', 'DISABLED')),
  damaged_campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  damaged_round INTEGER CHECK (damaged_round IS NULL OR damaged_round > 0),
  repaired_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_unit_id, subsystem_type)
);

CREATE TABLE player_unit_status_effects (
  id TEXT PRIMARY KEY,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  status_effect_id TEXT NOT NULL,
  source_unit_id TEXT REFERENCES player_units(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  applied_round INTEGER CHECK (applied_round IS NULL OR applied_round > 0),
  expires_round INTEGER CHECK (expires_round IS NULL OR expires_round >= applied_round),
  removed_at INTEGER,
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  applied_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (status_effect_id, ruleset_id)
    REFERENCES status_effect_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (player_unit_id, ruleset_id)
    REFERENCES player_units(id, ruleset_id) ON DELETE CASCADE
);

CREATE INDEX idx_unit_active_status
  ON player_unit_status_effects(player_unit_id, ruleset_id, status_effect_id)
  WHERE removed_at IS NULL;

CREATE TABLE unit_construction_projects (
  id TEXT PRIMARY KEY,
  builder_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  structure_definition_id TEXT NOT NULL,
  hex_q INTEGER NOT NULL,
  hex_r INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED', 'DESTROYED')),
  current_progress INTEGER NOT NULL DEFAULT 0 CHECK (current_progress >= 0),
  required_progress INTEGER NOT NULL CHECK (required_progress > 0),
  supply_spent_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(supply_spent_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (structure_definition_id, ruleset_id)
    REFERENCES structure_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (builder_unit_id, ruleset_id)
    REFERENCES player_units(id, ruleset_id) ON DELETE RESTRICT,
  CHECK (current_progress <= required_progress),
  CHECK ((status = 'COMPLETE') = (completed_at IS NOT NULL))
);

CREATE TABLE unit_project_contributions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES unit_construction_projects(id) ON DELETE CASCADE,
  contributor_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  progress_added INTEGER NOT NULL CHECK (progress_added > 0),
  supply_spent_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(supply_spent_json)),
  idempotency_key TEXT NOT NULL UNIQUE,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE unit_service_summaries (
  player_unit_id TEXT PRIMARY KEY REFERENCES player_units(id) ON DELETE CASCADE,
  campaigns_completed INTEGER NOT NULL DEFAULT 0 CHECK (campaigns_completed >= 0),
  rounds_served INTEGER NOT NULL DEFAULT 0 CHECK (rounds_served >= 0),
  damage_sustained INTEGER NOT NULL DEFAULT 0 CHECK (damage_sustained >= 0),
  objectives_completed INTEGER NOT NULL DEFAULT 0 CHECK (objectives_completed >= 0),
  units_destroyed INTEGER NOT NULL DEFAULT 0 CHECK (units_destroyed >= 0),
  commendations INTEGER NOT NULL DEFAULT 0 CHECK (commendations >= 0),
  last_campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  last_round INTEGER CHECK (last_round IS NULL OR last_round > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE ship_capability_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value_kind TEXT NOT NULL DEFAULT 'CAPACITY'
    CHECK (value_kind IN ('BOOLEAN', 'CAPACITY', 'RATE')),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE ship_module_capability_grants (
  equipment_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  capacity_delta INTEGER NOT NULL DEFAULT 1 CHECK (capacity_delta >= 0),
  grant_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(grant_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY (equipment_definition_id, ruleset_id, capability_id),
  FOREIGN KEY (equipment_definition_id, ruleset_id)
    REFERENCES equipment_definitions(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id, ruleset_id)
    REFERENCES ship_capability_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE ship_capability_overrides (
  ship_id TEXT NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  capability_id TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('HULL', 'SCENARIO', 'ADMIN')),
  reason TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (ship_id, ruleset_id, capability_id, source_kind),
  FOREIGN KEY (capability_id, ruleset_id)
    REFERENCES ship_capability_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (ship_id, ruleset_id)
    REFERENCES ships(id, ruleset_id) ON DELETE CASCADE
);

CREATE VIEW ship_effective_capabilities AS
SELECT ship_id, ruleset_id, capability_id, SUM(capacity) AS capacity
FROM (
  SELECT se.ship_id, se.ruleset_id, grants.capability_id, grants.capacity_delta AS capacity
  FROM ship_equipment AS se
  JOIN ship_module_capability_grants AS grants
    ON grants.equipment_definition_id = se.equipment_definition_id
   AND grants.ruleset_id = se.ruleset_id
  UNION ALL
  SELECT ship_id, ruleset_id, capability_id, capacity
  FROM ship_capability_overrides
)
GROUP BY ship_id, ruleset_id, capability_id;

CREATE INDEX idx_player_units_owner_location_state
  ON player_units(owner_id, location_state, status);
CREATE INDEX idx_unit_history_unit_time
  ON unit_history(player_unit_id, occurred_at, id);
CREATE INDEX idx_projects_campaign_status
  ON unit_construction_projects(campaign_id, status, hex_q, hex_r);

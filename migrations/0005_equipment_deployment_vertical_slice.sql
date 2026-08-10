PRAGMA foreign_keys = ON;

CREATE TABLE equipment_effect_definitions (
  equipment_definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  effect_index INTEGER NOT NULL CHECK (effect_index >= 0),
  effect_type TEXT NOT NULL CHECK (effect_type IN (
    'STAT_ADD', 'STAT_SET_IF', 'TAG_GRANT', 'TAG_REMOVE', 'WEAPON_GRANT',
    'WEAPON_MODIFIER', 'ACTION_GRANT', 'ORDER_GRANT', 'ABILITY_GRANT',
    'CARGO_CAPACITY_ADD', 'DEPLOYMENT_GRANT', 'AMMO_GRANT', 'COOLDOWN_GRANT'
  )),
  effect_json TEXT NOT NULL CHECK (json_valid(effect_json) AND json_type(effect_json) = 'object'),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY (equipment_definition_id, ruleset_id, effect_index),
  FOREIGN KEY (equipment_definition_id, ruleset_id)
    REFERENCES equipment_definitions(id, ruleset_id) ON DELETE CASCADE
);

CREATE TABLE refit_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  implementation_status TEXT NOT NULL CHECK (implementation_status IN ('IMPLEMENTED', 'PARTIAL', 'CATALOGUE_ONLY')),
  allowed_unit_definitions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_unit_definitions_json)),
  required_tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(required_tags_json)),
  effects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(effects_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  definition_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(definition_json)),
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE player_unit_refits (
  id TEXT PRIMARY KEY,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE CASCADE,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  refit_definition_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INSTALLED' CHECK (status IN ('INSTALLED', 'REMOVED', 'LOST')),
  installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  removed_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  FOREIGN KEY (player_unit_id, ruleset_id) REFERENCES player_units(id, ruleset_id) ON DELETE CASCADE,
  FOREIGN KEY (refit_definition_id, ruleset_id) REFERENCES refit_definitions(id, ruleset_id) ON DELETE RESTRICT,
  CHECK ((status = 'INSTALLED') = (removed_at IS NULL))
);

CREATE UNIQUE INDEX idx_one_installed_refit_per_definition
  ON player_unit_refits(player_unit_id, refit_definition_id)
  WHERE status = 'INSTALLED';

CREATE TABLE player_equipment_inventory (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  equipment_definition_id TEXT NOT NULL,
  assigned_unit_id TEXT REFERENCES player_units(id) ON DELETE SET NULL,
  source_unit_slot_type TEXT,
  source_unit_slot_index INTEGER CHECK (source_unit_slot_index IS NULL OR source_unit_slot_index >= 0),
  state TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (state IN ('AVAILABLE', 'ASSIGNED', 'EXPENDED', 'LOST')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  acquired_at INTEGER NOT NULL DEFAULT (unixepoch()),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  FOREIGN KEY (equipment_definition_id, ruleset_id) REFERENCES equipment_definitions(id, ruleset_id) ON DELETE RESTRICT,
  CHECK ((state = 'ASSIGNED') = (assigned_unit_id IS NOT NULL))
);

INSERT INTO player_equipment_inventory (
  id, owner_id, ruleset_id, equipment_definition_id, assigned_unit_id,
  source_unit_slot_type, source_unit_slot_index, state, acquired_at, state_json
)
SELECT
  'inventory:' || equipment.player_unit_id || ':' || equipment.slot_type || ':' || equipment.slot_index,
  units.owner_id,
  equipment.ruleset_id,
  equipment.equipment_definition_id,
  equipment.player_unit_id,
  equipment.slot_type,
  equipment.slot_index,
  'ASSIGNED',
  equipment.installed_at,
  json_object('migratedFrom', 'player_unit_equipment')
FROM player_unit_equipment AS equipment
JOIN player_units AS units ON units.id = equipment.player_unit_id
WHERE equipment.lost_at IS NULL
ON CONFLICT(id) DO NOTHING;

ALTER TABLE player_unit_loadouts ADD COLUMN locked_at INTEGER;
ALTER TABLE player_unit_loadouts ADD COLUMN effective_state_hash TEXT;

INSERT INTO player_unit_loadout_items (
  loadout_id, player_unit_id, owned_slot_type, owned_slot_index, mount_role, quantity, state_json
)
SELECT
  loadouts.id,
  equipment.player_unit_id,
  equipment.slot_type,
  equipment.slot_index,
  CASE UPPER(equipment.slot_type)
    WHEN 'PRIMARY' THEN 'PRIMARY'
    WHEN 'SECONDARY' THEN 'SECONDARY'
    WHEN 'INTERNAL' THEN 'INTERNAL'
    WHEN 'EXTERNAL' THEN 'EXTERNAL'
    ELSE 'OTHER'
  END,
  1,
  json_object('migratedDefault', true)
FROM player_unit_equipment AS equipment
JOIN player_unit_loadouts AS loadouts
  ON loadouts.player_unit_id = equipment.player_unit_id
 AND loadouts.loadout_kind = 'OWNED_DEFAULT'
 AND loadouts.status = 'ACTIVE'
WHERE equipment.lost_at IS NULL
ON CONFLICT(loadout_id, owned_slot_type, owned_slot_index) DO NOTHING;

CREATE TABLE deployment_method_definitions (
  id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  implementation_status TEXT NOT NULL CHECK (implementation_status IN ('IMPLEMENTED', 'PARTIAL', 'CATALOGUE_ONLY')),
  requirements_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(requirements_json)),
  source_path TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  PRIMARY KEY (id, ruleset_id)
);

CREATE TABLE campaign_insertion_zones (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  hex_q INTEGER NOT NULL,
  hex_r INTEGER NOT NULL,
  allowed_methods_json TEXT NOT NULL CHECK (json_valid(allowed_methods_json)),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'BLOCKED', 'CLOSED')),
  environment_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(environment_json)),
  UNIQUE (campaign_id, hex_q, hex_r)
);

CREATE TABLE deployment_plans (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE RESTRICT,
  battlegroup_id TEXT REFERENCES battlegroups(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VALID', 'INVALID', 'COMMITTED', 'DEPLOYING', 'DEPLOYED', 'CANCELLED')),
  deployment_method_id TEXT NOT NULL,
  insertion_zone_id TEXT REFERENCES campaign_insertion_zones(id) ON DELETE RESTRICT,
  route_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(route_json)),
  validation_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(validation_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  committed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (deployment_method_id, ruleset_id)
    REFERENCES deployment_method_definitions(id, ruleset_id) ON DELETE RESTRICT,
  CHECK ((status IN ('COMMITTED', 'DEPLOYING', 'DEPLOYED')) = (committed_at IS NOT NULL))
);

CREATE TABLE deployment_plan_units (
  deployment_plan_id TEXT NOT NULL REFERENCES deployment_plans(id) ON DELETE CASCADE,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  loadout_id TEXT NOT NULL,
  owner_approval TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (owner_approval IN ('PROPOSED', 'APPROVED', 'REJECTED')),
  command_approval TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (command_approval IN ('PROPOSED', 'APPROVED', 'REJECTED')),
  expected_unit_version INTEGER NOT NULL CHECK (expected_unit_version > 0),
  expected_loadout_revision INTEGER NOT NULL CHECK (expected_loadout_revision > 0),
  PRIMARY KEY (deployment_plan_id, player_unit_id),
  FOREIGN KEY (loadout_id, player_unit_id) REFERENCES player_unit_loadouts(id, player_unit_id) ON DELETE RESTRICT
);

CREATE TRIGGER deployment_plan_units_prevent_duplicate_reservation
BEFORE INSERT ON deployment_plan_units
WHEN EXISTS (
  SELECT 1
  FROM deployment_plan_units AS existing
  JOIN deployment_plans AS plan ON plan.id = existing.deployment_plan_id
  WHERE existing.player_unit_id = NEW.player_unit_id
    AND plan.status IN ('COMMITTED', 'DEPLOYING')
)
BEGIN
  SELECT RAISE(ABORT, 'player unit already reserved for deployment');
END;

CREATE TRIGGER deployment_plans_prevent_duplicate_commit
BEFORE UPDATE OF status ON deployment_plans
WHEN NEW.status IN ('COMMITTED', 'DEPLOYING')
BEGIN
  SELECT RAISE(ABORT, 'player unit already reserved for deployment') WHERE EXISTS (
    SELECT 1
    FROM deployment_plan_units AS selected
    JOIN deployment_plan_units AS other ON other.player_unit_id = selected.player_unit_id
    JOIN deployment_plans AS other_plan ON other_plan.id = other.deployment_plan_id
    WHERE selected.deployment_plan_id = NEW.id
      AND other.deployment_plan_id <> NEW.id
      AND other_plan.status IN ('COMMITTED', 'DEPLOYING')
  );
END;

CREATE TABLE deployment_transport_assignments (
  deployment_plan_id TEXT NOT NULL REFERENCES deployment_plans(id) ON DELETE CASCADE,
  carrier_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  cargo_profile_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  manifest_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(manifest_json)),
  used_slots_quarters INTEGER NOT NULL DEFAULT 0 CHECK (used_slots_quarters >= 0),
  capacity_slots_quarters INTEGER NOT NULL CHECK (capacity_slots_quarters >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (deployment_plan_id, carrier_unit_id),
  FOREIGN KEY (cargo_profile_id, ruleset_id) REFERENCES cargo_profile_definitions(id, ruleset_id) ON DELETE RESTRICT,
  CHECK (used_slots_quarters <= capacity_slots_quarters)
);

CREATE TABLE campaign_loadout_snapshots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  deployment_plan_id TEXT NOT NULL REFERENCES deployment_plans(id) ON DELETE RESTRICT,
  player_unit_id TEXT NOT NULL REFERENCES player_units(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  unit_definition_id TEXT NOT NULL,
  unit_definition_version TEXT NOT NULL,
  refits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(refits_json)),
  equipment_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(equipment_json)),
  effective_unit_json TEXT NOT NULL CHECK (json_valid(effective_unit_json)),
  slot_configuration_json TEXT NOT NULL CHECK (json_valid(slot_configuration_json)),
  ammunition_json TEXT NOT NULL CHECK (json_valid(ammunition_json)),
  cooldowns_json TEXT NOT NULL CHECK (json_valid(cooldowns_json)),
  supplies_json TEXT NOT NULL CHECK (json_valid(supplies_json)),
  insertion_method_id TEXT NOT NULL,
  carrier_unit_id TEXT REFERENCES player_units(id) ON DELETE RESTRICT,
  snapshot_hash TEXT NOT NULL,
  locked_at INTEGER NOT NULL,
  UNIQUE (campaign_id, player_unit_id),
  FOREIGN KEY (unit_definition_id, ruleset_id) REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE RESTRICT,
  FOREIGN KEY (insertion_method_id, ruleset_id) REFERENCES deployment_method_definitions(id, ruleset_id) ON DELETE RESTRICT
);

CREATE TABLE campaign_weapon_states (
  snapshot_id TEXT NOT NULL REFERENCES campaign_loadout_snapshots(id) ON DELETE CASCADE,
  weapon_id TEXT NOT NULL,
  ammo_capacity INTEGER CHECK (ammo_capacity IS NULL OR ammo_capacity >= 0),
  ammo_remaining INTEGER CHECK (ammo_remaining IS NULL OR ammo_remaining >= 0),
  ready_at_round INTEGER CHECK (ready_at_round IS NULL OR ready_at_round > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (snapshot_id, weapon_id),
  CHECK (ammo_capacity IS NULL OR ammo_remaining <= ammo_capacity)
);

CREATE TABLE campaign_ability_states (
  snapshot_id TEXT NOT NULL REFERENCES campaign_loadout_snapshots(id) ON DELETE CASCADE,
  ability_id TEXT NOT NULL,
  ready_at_round INTEGER NOT NULL DEFAULT 1 CHECK (ready_at_round > 0),
  state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(state_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (snapshot_id, ability_id)
);

CREATE TABLE deployment_mutation_receipts (
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (actor_user_id, command_id)
);

CREATE TABLE campaign_effect_receipts (
  idempotency_key TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  effect_type TEXT NOT NULL,
  player_unit_id TEXT REFERENCES player_units(id) ON DELETE RESTRICT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

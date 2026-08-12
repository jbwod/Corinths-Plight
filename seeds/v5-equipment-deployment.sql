PRAGMA foreign_keys = ON;

UPDATE equipment_definitions
SET definition_status = 'active',
    notes = CASE id
      WHEN 'equipment-flak-vests' THEN 'Executable conditional armour effect in the equipment/deployment vertical slice.'
      WHEN 'equipment-light-at' THEN 'Executable finite-ammunition weapon grant in the equipment/deployment vertical slice.'
      WHEN 'equipment-vehicle-optics' THEN 'Executable Scan action grant in the equipment/deployment vertical slice.'
      ELSE notes END
WHERE ruleset_id = 'ruleset-v5-core-curated-1'
  AND id IN ('equipment-flak-vests','equipment-light-at','equipment-vehicle-optics');

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES (
  'weapon-light-at', 'ruleset-v5-core-curated-1', 'Lightweight Anti-armour Weapon',
  1, 6, 0, 1, 1, 3, NULL, 0,
  'active', 'The Store row 10',
  'V5 defines a +1 AP disposable infantry weapon with three uses. Damage remains the infantry FS attack die.',
  '{"tags":["ANTI_ARMOUR","EQUIPMENT","FS_CAPPED"],"sourceEquipmentId":"equipment-light-at"}'
)
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  armor_piercing = excluded.armor_piercing,
  range_hexes = excluded.range_hexes,
  ammo_capacity = excluded.ammo_capacity,
  definition_status = excluded.definition_status,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO action_definitions (
  id, ruleset_id, name, economy, speed_cost_quarters, definition_status,
  source, notes, definition_json
) VALUES
  ('action-deploy-drone', 'ruleset-v5-core-curated-1', 'Deploy Drone', 'STANDARD', 2, 'active',
  'The Store row 23', 'Range-five scouting extension with a six-round cooldown.',
  '{"requiredAbility":"ability-deploy-drone","maximumRange":5,"cooldownRounds":6}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  economy = excluded.economy,
  speed_cost_quarters = excluded.speed_cost_quarters,
  definition_status = excluded.definition_status,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO action_definitions (
  id, ruleset_id, name, economy, speed_cost_quarters, definition_status,
  source, notes, definition_json
) VALUES
  ('action-scan', 'ruleset-v5-core-curated-1', 'Scan', 'STANDARD', 2, 'active',
  'The Store row 43', 'Vehicle Optics reveals a selected hex at the edge of line of sight.',
  '{"requiredEquipment":"equipment-vehicle-optics","handlerId":"SCAN"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name, economy = excluded.economy,
  speed_cost_quarters = excluded.speed_cost_quarters,
  definition_status = excluded.definition_status,
  notes = excluded.notes, definition_json = excluded.definition_json;

INSERT INTO ability_definitions (
  id, ruleset_id, name, action_definition_id, target_selector_json, effect_json,
  source_path, source_locator, definition_json
) VALUES (
  'ability-deploy-drone', 'ruleset-v5-core-curated-1', 'Deploy Drone', 'action-deploy-drone',
  '{"target":"HEX","maximumRange":5}',
  '{"handlerId":"DEPLOY_DRONE","cooldownRounds":6,"visibility":"OWNER_SAFE_SCOUT"}',
  'rules/The Store - Equipment List.html', 'Drone Operator / row 23',
  '{"implementation":"representative vertical slice"}'
)
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  action_definition_id = excluded.action_definition_id,
  target_selector_json = excluded.target_selector_json,
  effect_json = excluded.effect_json,
  definition_json = excluded.definition_json;

INSERT INTO equipment_definitions (
  id, ruleset_id, name, category, slot_type, requisition_cost, consumable,
  definition_status, source, notes, definition_json
) VALUES
  ('equipment-drone-operator', 'ruleset-v5-core-curated-1', 'Drone Operator', 'INFANTRY_UTILITY', 'secondary', 2, 0, 'active', 'The Store row 23', 'Deploy Drone is authoritative with range five and six-round cooldown.', '{"allowedClasses":["unit-infantry-squad","unit-engineers","unit-special-forces"],"abilityGrants":["ability-deploy-drone"]}'),
  ('equipment-orbital-drop-training', 'ruleset-v5-core-curated-1', 'Orbital Drop Training', 'INFANTRY_TRAINING', 'upgrade', 1, 0, 'active', 'The Store row 3', 'Grants orbital-drop eligibility and applies the source -1 FS mutation.', '{"allowedClasses":["unit-infantry-squad","unit-engineers","unit-combat-medic","unit-special-forces"],"deploymentGrant":"ORBITAL_DROP","statModifiers":{"maxHealth":-1}}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  slot_type = excluded.slot_type,
  requisition_cost = excluded.requisition_cost,
  definition_status = excluded.definition_status,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO equipment_effect_definitions (
  equipment_definition_id, ruleset_id, effect_index, effect_type, effect_json,
  source_path, source_locator
) VALUES
  ('equipment-flak-vests', 'ruleset-v5-core-curated-1', 0, 'STAT_SET_IF', '{"type":"STAT_SET_IF","stat":"armor","whenEquals":0,"value":1}', 'rules/The Store - Equipment List.html', 'Flack Vests / row 4'),
  ('equipment-light-at', 'ruleset-v5-core-curated-1', 0, 'WEAPON_GRANT', '{"type":"WEAPON_GRANT","weaponId":"weapon-light-at"}', 'rules/The Store - Equipment List.html', 'Lightweight Anti-armor Weapon / row 10'),
  ('equipment-light-at', 'ruleset-v5-core-curated-1', 1, 'AMMO_GRANT', '{"type":"AMMO_GRANT","weaponId":"weapon-light-at","capacity":3}', 'rules/The Store - Equipment List.html', 'Lightweight Anti-armor Weapon / row 10'),
  ('equipment-vehicle-optics', 'ruleset-v5-core-curated-1', 0, 'STAT_ADD', '{"type":"STAT_ADD","stat":"sensors","amount":1}', 'rules/The Store - Equipment List.html', 'Optics / row 43'),
  ('equipment-vehicle-optics', 'ruleset-v5-core-curated-1', 1, 'ACTION_GRANT', '{"type":"ACTION_GRANT","action":"SCAN"}', 'rules/The Store - Equipment List.html', 'Optics / row 43'),
  ('equipment-drone-operator', 'ruleset-v5-core-curated-1', 0, 'ACTION_GRANT', '{"type":"ACTION_GRANT","action":"DEPLOY_DRONE"}', 'rules/The Store - Equipment List.html', 'Drone Operator / row 23'),
  ('equipment-drone-operator', 'ruleset-v5-core-curated-1', 1, 'ABILITY_GRANT', '{"type":"ABILITY_GRANT","abilityId":"ability-deploy-drone","handlerId":"DEPLOY_DRONE","parameters":{"range":5,"cooldownRounds":6}}', 'rules/The Store - Equipment List.html', 'Drone Operator / row 23'),
  ('equipment-orbital-drop-training', 'ruleset-v5-core-curated-1', 0, 'STAT_ADD', '{"type":"STAT_ADD","stat":"maxHealth","amount":-1}', 'rules/The Store - Equipment List.html', 'Orbital Drop Training / row 3'),
  ('equipment-orbital-drop-training', 'ruleset-v5-core-curated-1', 1, 'DEPLOYMENT_GRANT', '{"type":"DEPLOYMENT_GRANT","method":"ORBITAL_DROP"}', 'rules/The Store - Equipment List.html', 'Orbital Drop Training / row 3')
ON CONFLICT(equipment_definition_id, ruleset_id, effect_index) DO UPDATE SET
  effect_type = excluded.effect_type,
  effect_json = excluded.effect_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator;

INSERT INTO equipment_eligibility_rules (
  equipment_definition_id, ruleset_id, required_tags_all_json, required_tags_any_json,
  forbidden_tags_json, allowed_unit_definitions_json, slot_types_json, maximum_equipped,
  rule_json, source_path, source_locator
) VALUES
  ('equipment-drone-operator', 'ruleset-v5-core-curated-1', '["tag-infantry"]', '[]', '[]', '["unit-infantry-squad","unit-engineers","unit-special-forces"]', '["SECONDARY"]', 1, '{}', 'rules/The Store - Equipment List.html', 'Drone Operator / row 23'),
  ('equipment-orbital-drop-training', 'ruleset-v5-core-curated-1', '["tag-infantry"]', '[]', '["tag-irregular"]', '["unit-infantry-squad","unit-engineers","unit-combat-medic","unit-special-forces"]', '["UPGRADE","SECONDARY"]', 1, '{"forceStrengthModifier":-1}', 'rules/The Store - Equipment List.html', 'Orbital Drop Training / row 3')
ON CONFLICT(equipment_definition_id, ruleset_id) DO UPDATE SET
  required_tags_all_json = excluded.required_tags_all_json,
  forbidden_tags_json = excluded.forbidden_tags_json,
  allowed_unit_definitions_json = excluded.allowed_unit_definitions_json,
  slot_types_json = excluded.slot_types_json,
  maximum_equipped = excluded.maximum_equipped,
  rule_json = excluded.rule_json;

INSERT INTO deployment_method_definitions (
  id, ruleset_id, name, implementation_status, requirements_json, source_path, source_locator
) VALUES
  ('STANDARD_GROUND', 'ruleset-v5-core-curated-1', 'Standard Ground', 'IMPLEMENTED', '{"transportRequired":false}', 'rules/Meta - Core Rules (V5).md', 'Playing the Game / deployment'),
  ('VEHICLE_TRANSPORT', 'ruleset-v5-core-curated-1', 'Vehicle Transport', 'IMPLEMENTED', '{"transportRequired":true,"requiresCoLocation":true}', 'rules/Meta - Core Rules (V5).md', 'Actions / loading and unloading'),
  ('VTOL_INSERTION', 'ruleset-v5-core-curated-1', 'VTOL Insertion', 'IMPLEMENTED', '{"transportTagsAny":["VTOL"],"requiresLandingOrRappel":true}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / VTOL'),
  ('HEAVY_AIR_TRANSPORT', 'ruleset-v5-core-curated-1', 'Heavy Air Transport', 'IMPLEMENTED', '{"transportTagsAny":["HEAVY_AIR_TRANSPORT"],"requiresAirfieldForLanding":true}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Heavy Air Transport'),
  ('PARADROP', 'ruleset-v5-core-curated-1', 'Paradrop', 'IMPLEMENTED', '{"transportTagsAny":["HEAVY_AIR_TRANSPORT"],"dropPointMustLieOnRoute":true,"allowedCargoTagsAny":["INFANTRY","LIGHT_VEHICLE"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Heavy Air Transport'),
  ('ORBITAL_DROP', 'ruleset-v5-core-curated-1', 'Orbital Drop', 'PARTIAL', '{"requiredUnitCapability":"ORBITAL_DROP","requiredShipCapability":"DROP_POD_LAUNCH","enabled":false,"reasonCode":"ORBITAL_DEPLOYMENT_COORDINATOR_DEFERRED"}', 'rules/Meta - Core Rules (V5).md', 'Space Combat / high orbit support')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  implementation_status = excluded.implementation_status,
  requirements_json = excluded.requirements_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator;

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable, reason_code,
  source_path, source_locator, overlay_json
) VALUES
  ('EQUIPMENT', 'equipment-flak-vests', 'ruleset-v5-core-curated-1', 'IMPLEMENTED', 'PUBLISHED', 'AVAILABLE', 1, 1, NULL, 'rules/The Store - Equipment List.html', 'row 4', '{"verticalSlice":"equipment-deployment"}'),
  ('EQUIPMENT', 'equipment-light-at', 'ruleset-v5-core-curated-1', 'IMPLEMENTED', 'PUBLISHED', 'AVAILABLE', 1, 1, NULL, 'rules/The Store - Equipment List.html', 'row 10', '{"verticalSlice":"equipment-deployment"}'),
  ('EQUIPMENT', 'equipment-vehicle-optics', 'ruleset-v5-core-curated-1', 'IMPLEMENTED', 'PUBLISHED', 'AVAILABLE', 1, 1, NULL, 'rules/The Store - Equipment List.html', 'row 43', '{"verticalSlice":"equipment-deployment"}'),
  ('EQUIPMENT', 'equipment-drone-operator', 'ruleset-v5-core-curated-1', 'IMPLEMENTED', 'PUBLISHED', 'AVAILABLE', 1, 1, NULL, 'rules/The Store - Equipment List.html', 'row 23', '{"verticalSlice":"equipment-deployment"}'),
  ('EQUIPMENT', 'equipment-orbital-drop-training', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'AVAILABLE', 0, 1, 'ORBITAL_DEPLOYMENT_COORDINATOR_DEFERRED', 'rules/The Store - Equipment List.html', 'row 3', '{"effectiveUnitMutation":true,"deploymentExecution":false}')
ON CONFLICT(definition_kind, definition_id, ruleset_id) DO UPDATE SET
  implementation_status = excluded.implementation_status,
  requisition_status = excluded.requisition_status,
  availability_status = excluded.availability_status,
  executable = excluded.executable,
  purchasable = excluded.purchasable,
  reason_code = excluded.reason_code,
  overlay_json = excluded.overlay_json;

UPDATE ruleset_implementation_overlays
SET implementation_status = 'IMPLEMENTED',
    availability_status = 'AVAILABLE',
    executable = 1,
    purchasable = 1,
    reason_code = NULL,
    overlay_json = '{"verticalSlice":"equipment-deployment","handlers":["LOAD","UNLOAD","AIRDROP"],"economyPolicyId":"public-v1-economy@1"}'
WHERE definition_kind = 'UNIT'
  AND ruleset_id = 'ruleset-v5-core-curated-1'
  AND definition_id IN ('unit-logi-truck','unit-infantry-fighting-vehicle','unit-vtol','unit-heavy-air-transport');

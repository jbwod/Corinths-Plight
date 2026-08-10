PRAGMA foreign_keys = ON;

-- Development-only end-to-end fixture for the equipment/deployment vertical slice.
INSERT INTO campaigns (
  id,planet_id,ruleset_id,name,status,round_duration_ms,map_source_key,
  minimum_players,maximum_players,created_by,force_policy_json,strategic_status
) VALUES (
  'operation-spearhead','planet-corinth','ruleset-v5-core-curated-1',
  'Operation Spearhead','RECRUITING',300000,'fixture/operation-spearhead',
  1,8,'demo-user',
  '{"allowedCategories":["INFANTRY","ENGINEER","SUPPORT","LIGHT_VEHICLE","HEAVY_VEHICLE","LOGISTICS","AEROSPACE"],"maximumUnits":12}',
  'ANNOUNCED'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  status = CASE WHEN campaigns.status IN ('COMPLETE','FAILED') THEN campaigns.status ELSE excluded.status END,
  force_policy_json = excluded.force_policy_json,
  map_source_key = excluded.map_source_key;

INSERT INTO campaign_memberships (campaign_id,user_id,battalion_id,side,role)
VALUES ('operation-spearhead','demo-user','battalion-33rd-expeditionary','ALLIED','BATTALION_COMMAND')
ON CONFLICT(campaign_id,user_id) DO UPDATE SET
  battalion_id = excluded.battalion_id, side = excluded.side, role = excluded.role;

INSERT INTO campaign_insertion_zones (
  id,campaign_id,hex_q,hex_r,allowed_methods_json,status,environment_json
) VALUES
  ('spearhead-zone-landing','operation-spearhead',-4,1,
   '["STANDARD_GROUND","VEHICLE_TRANSPORT","VTOL_INSERTION","HEAVY_AIR_TRANSPORT"]','OPEN','["CLEAR_APPROACH"]'),
  ('spearhead-zone-drop','operation-spearhead',0,0,
   '["PARADROP"]','OPEN','["ASH_STORM_EXPOSED"]')
ON CONFLICT(id) DO UPDATE SET
  hex_q = excluded.hex_q, hex_r = excluded.hex_r,
  allowed_methods_json = excluded.allowed_methods_json,
  status = excluded.status, environment_json = excluded.environment_json;

INSERT INTO battlegroup_units (battlegroup_id,player_unit_id,delegated_command)
SELECT 'battlegroup-hammer','force-atlas',0
WHERE EXISTS (SELECT 1 FROM battlegroups WHERE id = 'battlegroup-hammer')
  AND EXISTS (SELECT 1 FROM player_units WHERE id = 'force-atlas')
ON CONFLICT(battlegroup_id,player_unit_id) DO UPDATE SET delegated_command = excluded.delegated_command;

INSERT INTO player_unit_loadouts (
  id,player_unit_id,name,loadout_kind,status,revision
)
SELECT units.id || ':loadout:default', units.id, 'Owned Default',
       'OWNED_DEFAULT', 'ACTIVE', 1
FROM player_units AS units
WHERE units.owner_id = 'demo-user'
  AND units.status <> 'DESTROYED'
ON CONFLICT(id) DO UPDATE SET
  status = 'ACTIVE',
  updated_at = unixepoch();

-- Converge fixture equipment into the new owner inventory introduced by 0005.
INSERT INTO player_equipment_inventory (
  id,owner_id,ruleset_id,equipment_definition_id,assigned_unit_id,
  source_unit_slot_type,source_unit_slot_index,state,acquired_at,state_json
)
SELECT 'inventory:' || equipment.player_unit_id || ':' || equipment.slot_type || ':' || equipment.slot_index,
       units.owner_id,equipment.ruleset_id,equipment.equipment_definition_id,equipment.player_unit_id,
       equipment.slot_type,equipment.slot_index,'ASSIGNED',equipment.installed_at,
       json_object('fixture','operation-spearhead','migratedFrom','player_unit_equipment')
FROM player_unit_equipment AS equipment
JOIN player_units AS units ON units.id = equipment.player_unit_id
WHERE units.owner_id = 'demo-user' AND equipment.lost_at IS NULL
ON CONFLICT(id) DO UPDATE SET
  assigned_unit_id = excluded.assigned_unit_id,
  source_unit_slot_type = excluded.source_unit_slot_type,
  source_unit_slot_index = excluded.source_unit_slot_index,
  state = 'ASSIGNED';

INSERT INTO player_equipment_inventory (
  id,owner_id,ruleset_id,equipment_definition_id,state,state_json
) VALUES
  ('inventory:spearhead:drone-operator','demo-user','ruleset-v5-core-curated-1','equipment-drone-operator','AVAILABLE','{"fixture":"operation-spearhead"}'),
  ('inventory:spearhead:flak-spare','demo-user','ruleset-v5-core-curated-1','equipment-flak-vests','AVAILABLE','{"fixture":"operation-spearhead"}'),
  ('inventory:spearhead:light-at-spare','demo-user','ruleset-v5-core-curated-1','equipment-light-at','AVAILABLE','{"fixture":"operation-spearhead"}'),
  ('inventory:spearhead:optics','demo-user','ruleset-v5-core-curated-1','equipment-vehicle-optics','AVAILABLE','{"fixture":"operation-spearhead"}')
ON CONFLICT(id) DO UPDATE SET
  ruleset_id = excluded.ruleset_id,
  equipment_definition_id = excluded.equipment_definition_id,
  state_json = excluded.state_json;

INSERT INTO player_unit_loadout_items (
  loadout_id,player_unit_id,owned_slot_type,owned_slot_index,mount_role,quantity,state_json
)
SELECT loadouts.id,equipment.player_unit_id,equipment.slot_type,equipment.slot_index,
       CASE UPPER(equipment.slot_type)
         WHEN 'PRIMARY' THEN 'PRIMARY' WHEN 'SECONDARY' THEN 'SECONDARY'
         WHEN 'INTERNAL' THEN 'INTERNAL' WHEN 'EXTERNAL' THEN 'EXTERNAL' ELSE 'OTHER' END,
       1,json_object('inventoryId',inventory.id)
FROM player_unit_equipment AS equipment
JOIN player_unit_loadouts AS loadouts
  ON loadouts.player_unit_id = equipment.player_unit_id
 AND loadouts.loadout_kind = 'OWNED_DEFAULT' AND loadouts.status = 'ACTIVE'
JOIN player_equipment_inventory AS inventory
  ON inventory.assigned_unit_id = equipment.player_unit_id
 AND inventory.source_unit_slot_type = equipment.slot_type
 AND inventory.source_unit_slot_index = equipment.slot_index
WHERE equipment.lost_at IS NULL
ON CONFLICT(loadout_id,owned_slot_type,owned_slot_index) DO UPDATE SET
  state_json = excluded.state_json;

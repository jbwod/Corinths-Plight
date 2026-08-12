PRAGMA foreign_keys = ON;

INSERT INTO rulesets (id, version, name, status, engine_version, authority_notes, published_at)
VALUES (
  'ruleset-v5-core-curated-1',
  'v5-core-curated@1',
  'V5 Core Curated',
  'ACTIVE',
  'foundation-0.1.0',
  'V5 body, then explicit V5 changelog errata, then non-conflicting companion content. Open conflicts remain data and are never silently discarded.',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  engine_version = excluded.engine_version,
  authority_notes = excluded.authority_notes;

INSERT INTO ruleset_sources (id, ruleset_id, source_path, source_sha256, authority_rank, source_status, notes) VALUES
  ('source-v5-core', 'ruleset-v5-core-curated-1', 'rules/Meta - Core Rules (V5).md', '9076241b32332743307a1bbcdfac8becf44bbff371e4945a31af78a914d39345', 1, 'PRIMARY', 'Explicitly versioned V5 body and changelog.'),
  ('source-actions', 'ruleset-v5-core-curated-1', 'rules/Actions and Rules Work ( For Shack Reference).html', '72d5aeb178d4f0883781461cba4a7f7a9cd20ad881cce790233ad86d2b7ca20e', 4, 'LEGACY', 'Older hex/action reference; only non-conflicting concepts may be curated.'),
  ('source-build', 'ruleset-v5-core-curated-1', 'rules/Build and Supply System.html', '04394bb8dc1c5943e61293b0a96c02b160596aed837157a13b1f07f2868185a3', 3, 'COMPANION', 'Structure catalogue; durability and build conversion incomplete.'),
  ('source-classes', 'ruleset-v5-core-curated-1', 'rules/Classes.html', '6842fe2d7f7472be8e8fb452f68b3c09abca452f12e70bafd12e11b8a396d218', 4, 'LEGACY', 'Expanded older class catalogue with competing FS/action values.'),
  ('source-orders', 'ruleset-v5-core-curated-1', 'rules/Order Formatting - Needs Rework.html', 'cf41d1d43dc5fbcc07072478c0d2f3adbf5027f7493c45f173c540633b0616fa', 5, 'LEGACY', 'Superseded free-text format retained for migration context.'),
  ('source-store', 'ruleset-v5-core-curated-1', 'rules/The Store - Equipment List.html', 'f2ae75a8589edef9bb3633d0a1ce443ba34332a0b80309401f480652b7fabe8a', 3, 'COMPANION', 'Equipment catalogue with mixed-generation mechanics.'),
  ('source-product-brief', 'ruleset-v5-core-curated-1', 'gameplan.md', 'ddee76a1e074e8ef9c94309b9facedc9a65dcccfbe00296ca65476a33d259fac', 2, 'ERRATA', 'Product constraints and MVP scenario; does not override tabletop values silently.')
ON CONFLICT(id) DO UPDATE SET source_sha256 = excluded.source_sha256, notes = excluded.notes;

INSERT INTO rule_conflicts (id, ruleset_id, category, summary, sources_json, disposition, status, notes) VALUES
  ('RC-001', 'ruleset-v5-core-curated-1', 'UNIT', 'Infantry Force Strength', '[{"source":"V5","value":6},{"source":"Classes.html","value":5}]', 'Activate V5 FS 6; preserve FS 5 as legacy.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-002', 'ruleset-v5-core-curated-1', 'UNIT', 'Medic statistics and healing', '[{"source":"V5","value":"FS4,D6 capped,4 supply"},{"source":"Classes.html","value":"FS3,fixed heal 2,MASH"}]', 'Activate V5; keep MASH and fixed healing inactive.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-003', 'ruleset-v5-core-curated-1', 'UNIT', 'Engineer health and construction economy', '[{"source":"V5","value":"FS4,supply capacity=current FS"},{"source":"Classes.html","value":"FS3,9 build points,3 progress/action"}]', 'Activate V5 unit; defer build-point conversion.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-007', 'ruleset-v5-core-curated-1', 'UNIT', 'Artillery role and range', '[{"source":"V5","value":"FS3,range1-4,control"},{"source":"Classes.html","value":"range5/8/4,direct damage,multiple attacks"}]', 'Activate V5 control role; demo barrage is explicitly experimental.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-009', 'ruleset-v5-core-curated-1', 'STRUCTURE', 'Supply costs versus build points', '[{"source":"V5","value":"small supply costs"},{"source":"Build sheet","value":"3-15 build points"}]', 'Catalogue legacy build values; no automatic conversion.', 'DEFERRED', 'Structure health is also absent.'),
  ('RC-014', 'ruleset-v5-core-curated-1', 'COMBAT', 'Armor and Defense combination', '[{"source":"V5","value":"Defense works like armor, AP unaffected"}]', 'Foundation resolver uses effective armor plus defense as a penetration threshold.', 'RESOLVED_FOR_PROFILE', 'Provisional and isolated in pure combat calculation.'),
  ('RC-015', 'ruleset-v5-core-curated-1', 'COMBAT', 'Rush double damage timing', '[{"source":"V5","value":"takes twice as much damage (Hits or FS)"}]', 'Double health loss after penetration; do not double the pre-mitigation roll.', 'RESOLVED_FOR_PROFILE', 'Provisional.'),
  ('RC-016', 'ruleset-v5-core-curated-1', 'COMBAT', 'One attack roll versus multiple weapon dice', '[{"source":"V5","value":"one attack roll"},{"source":"V5 example","value":"one die per weapon system"}]', 'One attack activation; resolve one roll per participating weapon.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-022', 'ruleset-v5-core-curated-1', 'LOS', 'Campaign maximum line of sight', '[{"source":"V5","value":"scenario dependent, unspecified"},{"source":"legacy action sheet","value":"normally 3-4 hexes"}]', 'Make sensor/maximum LOS scenario data; K-17 uses class sensor values.', 'RESOLVED_FOR_PROFILE', ''),
  ('RC-031', 'ruleset-v5-core-curated-1', 'ECONOMY', 'Missing base class requisition costs', '[{"source":"V5","value":"Req defined, most costs absent"},{"source":"Classes.html","value":"mostly blank or formatting marks"}]', 'Store NULL and block purchases until an explicit published cost exists.', 'INCOMPLETE_DATA', ''),
  ('RC-041', 'ruleset-v5-core-curated-1', 'STRUCTURE', 'Missing structure health', '[{"source":"Build sheet","value":"Health column blank"}]', 'Store NULL and keep structures experimental until durability is published.', 'INCOMPLETE_DATA', ''),
  ('RC-052', 'ruleset-v5-core-curated-1', 'ORBITAL', 'Legacy orbital Health versus V5 Hits and Atmo-Fuel', '[{"source":"Classes.html","value":"Health10,cargo2/4/6/8"},{"source":"V5","value":"Hits/customization slots/Atmo-Fuel,values incomplete"}]', 'Seed hulls as experimental; do not activate strategic travel/combat.', 'DEFERRED', '')
ON CONFLICT(id) DO UPDATE SET disposition = excluded.disposition, status = excluded.status, notes = excluded.notes;

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-infantry-rifle', 'ruleset-v5-core-curated-1', 'Squad Small Arms', 1, 6, 0, 0, 1, NULL, NULL, 0, 'active', 'V5 / Infantry Squad', 'Damage is capped by current FS.', '{"tags":["PERSONNEL","FS_CAPPED"]}'),
  ('weapon-light-hmg', 'ruleset-v5-core-curated-1', 'Heavy Machine Gun', 1, 4, 0, 0, 2, NULL, NULL, 0, 'active', 'V5 / Light Vehicle', 'Rapid Fire tag active.', '{"tags":["RAPID_FIRE"]}'),
  ('weapon-mbt-cannon', 'ruleset-v5-core-curated-1', 'Main Cannon', 1, 6, 0, 3, 2, NULL, NULL, 0, 'active', 'V5 / Main Battle Tank', '', '{"tags":["ANTI_ARMOUR"]}'),
  ('weapon-artillery-barrage', 'ruleset-v5-core-curated-1', 'Indirect Barrage', 1, 6, 0, 0, 4, 2, NULL, 1, 'experimental', 'V5 / Artillery plus MVP foundation interpretation', 'V5 active role remains control; direct damage is demo-only.', '{"tags":["INDIRECT","EXPERIMENTAL_DAMAGE_MODE"]}'),
  ('weapon-bug-claws', 'ruleset-v5-core-curated-1', 'Rending Claws', 1, 6, 0, 0, 1, NULL, NULL, 0, 'experimental', 'gameplan.md section 53', 'Foundation Bug doctrine profile.', '{"tags":["MELEE","FS_CAPPED"]}'),
  ('weapon-bug-spines', 'ruleset-v5-core-curated-1', 'Heavy Spine Volley', 1, 6, 0, 2, 2, NULL, NULL, 0, 'experimental', 'gameplan.md section 53', 'Foundation Bug doctrine profile.', '{"tags":["ANTI_ARMOUR"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO unit_class_definitions (
  id, ruleset_id, name, category, health_model, max_health, armor, defense,
  speed_quarters, sensor_range, requisition_cost, definition_status, source, notes, definition_json
) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'Infantry Squad', 'INFANTRY', 'FORCE_STRENGTH', 6, 0, 0, 4, 4, 4, 'active', 'V5 / Starting Unit Classes / Infantry Squad', 'RC-001 selects V5 FS6; public-v1-economy@1 sets the application price.', '{"weaponIds":["weapon-infantry-rifle"],"slots":{"primary":4,"secondary":4},"allowedOrders":["HOLD","ADVANCE","RUSH","MELEE_CHARGE","STEALTH"]}'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'Engineers', 'ENGINEER', 'FORCE_STRENGTH', 4, 0, 0, 4, 4, 4, 'active', 'V5 / Starting Unit Classes / Engineers', 'Non-combat; V5 supply model active. public-v1-economy@1 sets the application price.', '{"weaponIds":[],"supplyCapacity":"CURRENT_FS","allowedActions":["REPAIR","CONSTRUCT","DIG_IN","ARTILLERY_DIG_IN"]}'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'Light Vehicle', 'ARMOUR', 'HITS', 2, 0, 0, 16, 5, 8, 'active', 'V5 / Starting Unit Classes / Light Vehicle', 'public-v1-economy@1 sets the application price.', '{"weaponIds":["weapon-light-hmg"],"tags":["SUB_SYSTEM","EVASIVE"]}'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'Main Battle Tank', 'ARMOUR', 'HITS', 3, 3, 0, 8, 4, 10, 'active', 'V5 / Starting Unit Classes / Main Battle Tank', 'public-v1-economy@1 sets the application price.', '{"weaponIds":["weapon-mbt-cannon"],"tags":["SUB_SYSTEM","REAR_WEAK_SPOT"]}'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'Artillery', 'ARTILLERY', 'FORCE_STRENGTH', 3, 0, 0, 4, 3, 6, 'active', 'V5 / Starting Unit Classes / Artillery', 'Barrage damage profile is experimental; control actions are canonical. public-v1-economy@1 sets the application price.', '{"weaponIds":["weapon-artillery-barrage"],"allowedActions":["DEPLOY","PACK_UP","BOMBARDMENT","RELOAD"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET requisition_cost = excluded.requisition_cost, definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO enemy_definitions (
  id, ruleset_id, name, faction_id, doctrine_json, unit_definition_json,
  definition_status, source, notes
) VALUES
  ('enemy-bug-drone', 'ruleset-v5-core-curated-1', 'Bug Drone', 'bug-swarm', '{"aggression":1,"preferredTargets":["PERSONNEL"],"preferredOrderTypes":["ADVANCE","RUSH","MELEE_CHARGE"]}', '{"healthModel":"FORCE_STRENGTH","maxHealth":3,"speed":2,"weaponIds":["weapon-bug-claws"]}', 'experimental', 'gameplan.md section 53', 'Product-brief name; foundation stats pending balance.'),
  ('enemy-bug-warrior', 'ruleset-v5-core-curated-1', 'Bug Warrior', 'bug-swarm', '{"aggression":1,"preferredTargets":["PERSONNEL","OBJECTIVE"],"preferredOrderTypes":["ADVANCE","MELEE_CHARGE"]}', '{"healthModel":"FORCE_STRENGTH","maxHealth":6,"speed":1,"weaponIds":["weapon-bug-claws"]}', 'experimental', 'gameplan.md section 53', 'Product-brief name; foundation stats pending balance.'),
  ('enemy-bug-heavy', 'ruleset-v5-core-curated-1', 'Bug Heavy', 'bug-swarm', '{"aggression":0.8,"vehiclePriority":1,"preferredTargets":["VEHICLE","OBJECTIVE"],"preferredOrderTypes":["ADVANCE","HOLD"]}', '{"healthModel":"HITS","maxHealth":4,"armor":3,"speed":1,"weaponIds":["weapon-bug-spines"]}', 'experimental', 'gameplan.md section 53', 'Product-brief name; foundation stats pending balance.')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, doctrine_json = excluded.doctrine_json, unit_definition_json = excluded.unit_definition_json;

INSERT INTO order_type_definitions (id, ruleset_id, name, definition_status, source, notes, definition_json) VALUES
  ('order-hold', 'ruleset-v5-core-curated-1', 'Hold', 'active', 'V5 / Standard Order Types', '', '{"movementMultiplier":0,"canAttack":true}'),
  ('order-advance', 'ruleset-v5-core-curated-1', 'Advance', 'active', 'V5 / Standard Order Types', '', '{"movementMultiplier":1,"canAttack":true,"stopsWhenBlocked":true}'),
  ('order-rush', 'ruleset-v5-core-curated-1', 'Rush', 'active', 'V5 / Standard Order Types', 'RC-015 defines damage timing.', '{"groundOnly":true,"movementMultiplier":2,"canAttack":false,"incomingHealthLossMultiplier":2}'),
  ('order-evasive', 'ruleset-v5-core-curated-1', 'Evasive', 'active', 'V5 / Special Order Types', 'Outgoing -2 semantics remain isolated for later activation.', '{"requiredTags":["EVASIVE"],"defenseModifier":3,"minimumDisplacementFraction":0.5}'),
  ('order-melee-charge', 'ruleset-v5-core-curated-1', 'Melee Charge', 'active', 'V5 / Special Order Types', 'Full brawl resolution deferred.', '{"requiredTags":["MELEE"],"canRangedAttack":false}'),
  ('order-stealth', 'ruleset-v5-core-curated-1', 'Stealth', 'active', 'V5 / Special Order Types', 'Server projection enforces hidden state.', '{"requiredTags":["INFANTRY_STEALTH","VEHICLE_STEALTH"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO action_definitions (id, ruleset_id, name, economy, speed_cost_quarters, definition_status, source, notes, definition_json) VALUES
  ('action-attack', 'ruleset-v5-core-curated-1', 'Attack', 'STANDARD', 0, 'active', 'V5 / Combat Round', 'Uses the unit attack activation.', '{"usesAttack":true}'),
  ('action-dig-in', 'ruleset-v5-core-curated-1', 'Dig In', 'STANDARD', 4, 'active', 'V5 / Infantry Squad', 'Consumes Infantry total movement and grants +2 Defense.', '{"defenseModifier":2,"endsOnMove":true}'),
  ('action-artillery-dig-in', 'ruleset-v5-core-curated-1', 'Dig In Artillery', 'STANDARD', 2, 'active', 'V5 / Artillery', 'RC-V5-025: an adjacent Engineer spends one Standard Action; the deployed artillery remains stationary.', '{"actorTag":"ENGINEER","targetTag":"ARTILLERY","requiresTargetState":"DEPLOYED","maximumRange":1,"defenseModifier":2,"smallSupplyCost":0}'),
  ('action-repair', 'ruleset-v5-core-curated-1', 'Repair', 'STANDARD', 2, 'active', 'V5 / Engineers', '', '{"smallSupplyCost":1,"repairsHits":1}'),
  ('action-construct', 'ruleset-v5-core-curated-1', 'Construct', 'STANDARD', 2, 'active', 'V5 / Engineers', 'Structure-specific values may be experimental.', '{"builderTag":"BUILDER"}'),
  ('action-trench-upgrade', 'ruleset-v5-core-curated-1', 'Trench Upgrade', 'PRIMARY', 0, 'active', 'V5 / Engineers / Sandbag Line', 'Infantry convert an existing Sandbag Line; no additional Supply cost is stated.', '{"usesAttack":true,"requiresStructure":"structure-sandbag-line","resultStructure":"structure-trench"}'),
  ('action-bombardment', 'ruleset-v5-core-curated-1', 'Bombardment', 'PRIMARY', 0, 'active', 'V5 / Artillery', 'One Small Supply provisionally consumed per fire mission.', '{"usesAttack":true,"defenseModifier":-1,"areaRadius":1,"smallSupplyCost":1}'),
  ('action-reload', 'ruleset-v5-core-curated-1', 'Reload', 'STANDARD', 2, 'active', 'V5 / Actions and unit descriptions', '', '{"requiresSupply":true}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO equipment_definitions (
  id, ruleset_id, name, category, slot_type, requisition_cost, consumable,
  definition_status, source, notes, definition_json
) VALUES
  ('equipment-flak-vests', 'ruleset-v5-core-curated-1', 'Flak Vests', 'INFANTRY_ARMOUR', 'secondary', 1, 0, 'active', 'The Store row 4', '', '{"allowedClasses":["unit-infantry-squad"],"statModifiers":{"armor":1},"rule":"Add +1 Armor from 0 only"}'),
  ('equipment-light-at', 'ruleset-v5-core-curated-1', 'Lightweight Anti-armour Weapon', 'INFANTRY_WEAPON', 'primary', 1, 1, 'experimental', 'The Store row 10', 'Executable disposable weapon profile pending.', '{"allowedClasses":["unit-infantry-squad"],"ammoCapacity":3,"armorPiercing":1,"range":1}'),
  ('equipment-vehicle-optics', 'ruleset-v5-core-curated-1', 'Vehicle Optics', 'VEHICLE_INTERNAL', 'internal', 1, 0, 'active', 'The Store row 43', '', '{"allowedClasses":["unit-light-vehicle","unit-main-battle-tank"],"statModifiers":{"sensors":1},"abilityGrants":["SCAN"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO terrain_definitions (
  id, ruleset_id, name, movement_cost_quarters, capacity, blocks_los,
  definition_status, source, notes, definition_json
) VALUES
  ('terrain-open', 'ruleset-v5-core-curated-1', 'Open Ground', 4, 3, 0, 'active', 'V5 / terrain scale plus K-17 scenario', '', '{}'),
  ('terrain-forest', 'ruleset-v5-core-curated-1', 'Corinth Pine Forest', 4, 2, 1, 'active', 'V5 / Structures, Cover and Forests', '', '{"infantryArmor":1,"blocksLosThrough":true}'),
  ('terrain-ridge', 'ruleset-v5-core-curated-1', 'Basalt Ridge', 4, 3, 0, 'active', 'V5 / Terrain Advantage', '', '{"elevation":1,"attackModifierFromAbove":1}'),
  ('terrain-marsh', 'ruleset-v5-core-curated-1', 'Ash Marsh', 6, 2, 0, 'active', 'Outpost K-17 scenario data', 'Scenario-specific terrain.', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

INSERT INTO structure_definitions (
  id, ruleset_id, name, build_cost_json, build_points, health,
  definition_status, source, notes, definition_json
) VALUES
  ('structure-sandbag-line', 'ruleset-v5-core-curated-1', 'Sandbag Line', '{"smallSupply":1}', NULL, NULL, 'active', 'V5 / Engineers / Action Construct: Sandbag Line', 'Immediate V5 field construction; other structures remain separately gated.', '{"infantryArmor":1,"capacityInfantrySquads":2,"constructRange":"ADJACENT_OR_CURRENT"}'),
  ('structure-razor-wire', 'ruleset-v5-core-curated-1', 'Razor Wire', '{"smallSupply":1}', NULL, NULL, 'active', 'V5 / Engineers / Action Construct: Razor Wire', 'Source-complete movement fieldwork; durability remains unresolved under RC-BUILD-006.', '{"constructRange":"ADJACENT_OR_CURRENT","movementPenalty":{"unitTag":"INFANTRY","speed":0.5}}'),
  ('structure-tank-traps', 'ruleset-v5-core-curated-1', 'Tank Traps', '{"smallSupply":1}', NULL, NULL, 'active', 'V5 / Engineers / Action Construct: Tank Traps', 'Source-complete movement fieldwork; durability remains unresolved under RC-BUILD-006.', '{"constructRange":"ADJACENT_OR_CURRENT","movementPenalty":{"unitTag":"VEHICLE","speed":1}}'),
  ('structure-trench', 'ruleset-v5-core-curated-1', 'Trench Line', '{}', NULL, NULL, 'active', 'V5 Engineers / Trench Upgrade', 'V5 conversion is active; durability remains unresolved under RC-BUILD-006.', '{"infantryArmor":1,"preservesDigIn":true,"upgradeFrom":"structure-sandbag-line"}'),
  ('structure-supply-depot', 'ruleset-v5-core-curated-1', 'Supply Depot', '{}', 12, NULL, 'experimental', 'Build sheet row 15', 'Health and V5 supply conversion unresolved.', '{"stores":["SMALL_SUPPLY"]}'),
  ('structure-sensor-tower', 'ruleset-v5-core-curated-1', 'Sensor Tower', '{}', 7, NULL, 'experimental', 'Build sheet row 22', 'Reveal radius and health unresolved.', '{"ability":"REVEAL_AREA"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, build_cost_json = excluded.build_cost_json, build_points = excluded.build_points, health = excluded.health, notes = excluded.notes, definition_json = excluded.definition_json;

INSERT INTO ship_class_definitions (
  id, ruleset_id, name, health, armor, speed, external_slots, internal_slots,
  cargo_capacity, atmo_fuel, definition_status, source, notes, definition_json
) VALUES
  ('ship-corvette', 'ruleset-v5-core-curated-1', 'Corvette', 10, 2, 4, 2, 4, 2, NULL, 'experimental', 'Classes.html row 35 plus V5 Orbital framework', 'RC-052: legacy Health provisionally represented as Hits; Atmo-Fuel absent.', '{"canLandWithEquipment":true,"range":6}'),
  ('ship-destroyer', 'ruleset-v5-core-curated-1', 'Destroyer', 10, 3, 3, 3, 4, 4, NULL, 'experimental', 'Classes.html row 36 plus V5 Orbital framework', 'RC-052; Atmo-Fuel absent.', '{"range":6}'),
  ('ship-cruiser', 'ruleset-v5-core-curated-1', 'Cruiser', 10, 4, 2, 4, 4, 6, NULL, 'experimental', 'Classes.html row 37 plus V5 Orbital framework', 'RC-052; Atmo-Fuel absent.', '{"range":6}'),
  ('ship-battleship', 'ruleset-v5-core-curated-1', 'Battleship', 10, 5, 1, 5, 4, 8, NULL, 'experimental', 'Classes.html row 38 plus V5 Orbital framework', 'RC-052; Atmo-Fuel absent.', '{"range":6}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET definition_status = excluded.definition_status, definition_json = excluded.definition_json, notes = excluded.notes;

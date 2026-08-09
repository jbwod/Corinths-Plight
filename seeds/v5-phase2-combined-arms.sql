PRAGMA foreign_keys = ON;

-- Companion seed for the additive Phase 2 catalogue. Canonical ruleset identity
-- remains v5-core-curated@1; implementation/availability is an independent axis.
INSERT INTO ruleset_sources (
  id, ruleset_id, source_path, source_sha256, authority_rank, source_status, notes
) VALUES (
  'source-phase2-forces-plan',
  'ruleset-v5-core-curated-1',
  'phase2-forces.md',
  '57aca68140cfc377850bd37b1c15f20eda612cb5a3f11cfe6b28d4d030ec32db',
  2,
  'ERRATA',
  'Product delivery scope and implementation constraints; does not silently override tabletop values.'
)
ON CONFLICT(id) DO UPDATE SET
  source_sha256 = excluded.source_sha256,
  notes = excluded.notes;

-- The legacy table requires a non-null sensor_range. New ground classes use 0
-- as a non-executable sentinel because RC-V5-014 makes LOS scenario-owned.
INSERT INTO unit_class_definitions (
  id, ruleset_id, name, category, health_model, max_health, armor, defense,
  speed_quarters, sensor_range, requisition_cost, definition_status, source, notes, definition_json
) VALUES
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'Power Armoured Infantry', 'INFANTRY', 'FORCE_STRENGTH', 3, 2, 0, 4, 0, NULL, 'legacy', 'Classes.html row 3 / Power Armored Infantry', 'Companion-only under RC-UNIT-015. Orbital Drop and mech-mount concepts are catalogued; price is absent.', '{"raw":{"fs":3,"armor":2,"speed":1,"range":1},"sensorRange":"SCENARIO_DEFINED","role":"ELITE_INFANTRY","tags":["INFANTRY","ARMOURED","ORBITAL"],"equipmentSlots":{"PRIMARY":2,"MECH_WEAPON":1},"conflictIds":["RC-UNIT-015","RC-V5-014"]}'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'Combat Medical Unit', 'SUPPORT', 'FORCE_STRENGTH', 4, 0, 0, 4, 0, NULL, 'active', 'V5 / Starting Unit Classes / Medics; Classes.html row 4 for non-conflicting Speed', 'V5 FS4/D6-capped heal/base contact/Medical Supply is selected by RC-UNIT-002 and RC-V5-009; companion fixed heal and MASH stay separate.', '{"raw":{"v5":{"fs":4,"medicalSupply":4},"companion":{"fs":3,"armor":0,"speed":1,"range":1,"fixedHeal":2}},"sensorRange":"SCENARIO_DEFINED","role":"MEDICAL_SUPPORT","nonCombat":true,"conflictIds":["RC-UNIT-002","RC-V5-009","RC-V5-014"]}'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'Irregular Unit', 'INFANTRY', 'FORCE_STRENGTH', 10, 0, 0, 4, 0, NULL, 'legacy', 'Classes.html row 5 / Irregular Unit', 'Companion-only under RC-UNIT-015. Training/class evolution is retained as catalogue data; price is absent.', '{"raw":{"fs":10,"armor":0,"speed":1,"range":1,"damageFraction":"1/4_ROUND_UP"},"sensorRange":"SCENARIO_DEFINED","role":"IRREGULAR_MANPOWER","equipmentSlots":{"HIGH_RISK_ARMS":2,"LOW_TECH_MELEE":1},"progressionEligible":true,"conflictIds":["RC-UNIT-015","RC-V5-014"]}'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'Special Forces', 'INFANTRY', 'FORCE_STRENGTH', 3, 0, 0, 8, 0, NULL, 'legacy', 'Classes.html row 6 / Special Forces; phase2-forces.md slice 1', 'Companion-only profile under RC-UNIT-015. Stealth, delayed charges and sabotage need Phase 2 server enforcement.', '{"raw":{"fs":3,"armor":0,"speed":2,"range":1},"sensorRange":"SCENARIO_DEFINED","role":"STEALTH_OPERATIONS","equipmentSlots":{"PRIMARY":2,"SECONDARY":2},"tags":["INFANTRY","INFANTRY_STEALTH"],"conflictIds":["RC-UNIT-015","RC-V5-014"]}'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'Logi Truck', 'SUPPORT', 'HITS', 1, 0, 0, 12, 0, NULL, 'active', 'V5 / Starting Unit Classes / Logi Truck', 'V5 Crew/Hits and cargo-slot conversions selected by RC-UNIT-005. No canonical requisition price.', '{"crew":3,"sensorRange":"SCENARIO_DEFINED","role":"LOGISTICS","weaponIds":[],"cargoProfileId":"cargo-logi-two-slot","tags":["VEHICLE","TRANSPORT","LOGISTICS"],"conflictIds":["RC-V5-014"]}'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'Infantry Fighting Vehicle', 'ARMOUR', 'HITS', 3, 2, 0, 8, 0, NULL, 'active', 'V5 / Starting Unit Classes / Infantry Fighting Vehicle', 'V5 IFV remains distinct from companion Mechanized Infantry under RC-UNIT-007.', '{"crew":3,"sensorRange":"SCENARIO_DEFINED","role":"MECHANISED_TRANSPORT","weaponIds":["weapon-ifv-snub-autocannon"],"tags":["VEHICLE","ARMOURED","SUBSYSTEMS","TRANSPORT"],"conflictIds":["RC-UNIT-007","RC-V5-014"]}'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'Light Mech', 'MECH', 'HITS', 2, 1, 0, 16, 0, NULL, 'active', 'V5 / Starting Unit Classes / Light Mech', 'V5 profile selected by RC-UNIT-009; companion slots/reload restriction remain catalogue-only.', '{"crew":1,"sensorRange":"SCENARIO_DEFINED","role":"MOBILE_MECH","weaponIds":["weapon-light-mech-laser"],"tags":["VEHICLE","ARMOURED","MECH","SUBSYSTEMS","EVASIVE_CAPABLE"],"conflictIds":["RC-UNIT-009","RC-V5-014"]}'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'Aerospace Fighter', 'AEROSPACE', 'HITS', 2, 0, 0, 28, 0, NULL, 'active', 'V5 / Starting Unit Classes / Aerospace Fighter', 'V5 profile selected by RC-UNIT-010; zero sensor range encodes the explicit cannot-spot-ground-units rule, not missing data.', '{"crew":1,"role":"AEROSPACE_INTERCEPTOR","weaponIds":["weapon-fighter-snub-hmg"],"tags":["VEHICLE","AEROSPACE","ATMO_FLIGHT","AEROSPACE_INTERCEPTOR","RAPID_FIRE","EVASIVE_CAPABLE"],"firingArc":{"degrees":180,"relativeTo":"TRAVEL_PATH","direction":"FORWARD"}}'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'Aerospace Bomber', 'AEROSPACE', 'HITS', 2, 0, 0, 24, 0, NULL, 'active', 'V5 / Starting Unit Classes / Aerospace Bomber', 'V5 profile selected by RC-UNIT-011; target must lie on the flight path.', '{"crew":1,"role":"PATH_BOMBARDMENT","weaponIds":["weapon-bomber-ordnance"],"tags":["VEHICLE","AEROSPACE","ATMO_FLIGHT"],"attackGeometry":"FLY_OVER"}'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'VTOL', 'AEROSPACE', 'HITS', 2, 1, 0, 20, 0, NULL, 'active', 'V5 / Starting Unit Classes / VTOL', 'Generic V5 VTOL only; companion variants remain separate catalogue records under RC-UNIT-012. Cargo alternatives follow RC-V5-017.', '{"crew":3,"role":"AIR_MOBILE_SUPPORT","weaponIds":["weapon-vtol-nose-gun"],"tags":["VEHICLE","AEROSPACE","VTOL","ARMOURED","TRANSPORT"]}'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'Heavy Air Transport', 'AEROSPACE', 'HITS', 1, 0, 0, 28, 0, NULL, 'active', 'V5 / Starting Unit Classes / Heavy Air Transport', 'V5 Hits and five-slot conversion table selected by RC-UNIT-013; hazardous drops remain blocked by RC-V5-018.', '{"crew":3,"role":"STRATEGIC_AIRLIFT","weaponIds":[],"tags":["VEHICLE","AEROSPACE","ATMO_FLIGHT","TRANSPORT","LOGISTICS"],"cargoProfileId":"cargo-hat-five-slot"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  health_model = excluded.health_model,
  max_health = excluded.max_health,
  armor = excluded.armor,
  defense = excluded.defense,
  speed_quarters = excluded.speed_quarters,
  sensor_range = excluded.sensor_range,
  requisition_cost = excluded.requisition_cost,
  definition_status = excluded.definition_status,
  source = excluded.source,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-ifv-snub-autocannon', 'ruleset-v5-core-curated-1', 'Snub Auto-Cannon', 1, 4, 0, 1, 1, NULL, NULL, 0, 'active', 'V5 / Infantry Fighting Vehicle', '', '{"tags":["VEHICLE_WEAPON","ANTI_ARMOUR"]}'),
  ('weapon-light-mech-laser', 'ruleset-v5-core-curated-1', 'Light Laser Cannon', 1, 4, 0, 0, 1, NULL, NULL, 0, 'active', 'V5 / Light Mech', '', '{"tags":["MECH_WEAPON","ENERGY"]}'),
  ('weapon-fighter-snub-hmg', 'ruleset-v5-core-curated-1', 'Snub-HMG', 1, 4, 0, 0, 1, 1, NULL, 0, 'active', 'V5 / Aerospace Fighter', 'One attack expends main ammunition; rearm requires landing and a Primary Action.', '{"tags":["AEROSPACE_WEAPON","RAPID_FIRE"],"firingArc":{"degrees":180,"relativeTo":"TRAVEL_PATH","direction":"FORWARD"}}'),
  ('weapon-bomber-ordnance', 'ruleset-v5-core-curated-1', 'Bomber Ordnance', 1, 6, 0, 0, 0, 1, NULL, 0, 'active', 'V5 / Aerospace Bomber', 'Range zero means fly-over geometry, not same-hex stationary fire.', '{"tags":["AEROSPACE_WEAPON","ORDNANCE","FLY_OVER"],"requiresPathIntersection":true}'),
  ('weapon-vtol-nose-gun', 'ruleset-v5-core-curated-1', 'VTOL Nose Gun', 1, 2, 0, 0, 1, NULL, NULL, 0, 'active', 'V5 / VTOL', '', '{"tags":["AEROSPACE_WEAPON","DIRECT"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  damage_dice_count = excluded.damage_dice_count,
  damage_die_sides = excluded.damage_die_sides,
  damage_modifier = excluded.damage_modifier,
  armor_piercing = excluded.armor_piercing,
  range_hexes = excluded.range_hexes,
  ammo_capacity = excluded.ammo_capacity,
  cooldown_rounds = excluded.cooldown_rounds,
  indirect = excluded.indirect,
  definition_status = excluded.definition_status,
  source = excluded.source,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO action_definitions (
  id, ruleset_id, name, economy, speed_cost_quarters, definition_status, source, notes, definition_json
) VALUES
  ('action-first-aid', 'ruleset-v5-core-curated-1', 'First Aid', 'PRIMARY', 0, 'active', 'V5 / Medics; V5 Change Log', 'RC-UNIT-002 selects D6 capped by current medic FS; RC-V5-009 selects base contact.', '{"target":{"side":"FRIENDLY","tagsAny":["INFANTRY"],"range":"BASE_CONTACT"},"heal":{"dice":"D6","cap":"ACTOR_CURRENT_FS","cannotExceedTargetMax":true},"resourceCost":{"MEDICAL_SUPPLY":1},"conflictIds":["RC-UNIT-002","RC-V5-009"]}'),
  ('action-deploy-mash', 'ruleset-v5-core-curated-1', 'Deploy MASH', 'STANDARD', 2, 'legacy', 'Classes.html row 4 / Combat Medical Unit', 'Companion-only MASH setup is catalogue data under RC-UNIT-002; two-action completion is not silently converted into Speed.', '{"requiredAbility":"DEPLOY_MASH","setupActions":2,"packActions":1,"areaHeal":1,"canonicalActivation":"CATALOGUED"}'),
  ('action-deploy-platform', 'ruleset-v5-core-curated-1', 'Deploy Platform', 'STANDARD', 2, 'active', 'V5 / Artillery', 'Deploying includes unhitching and costs one Standard Action.', '{"requiredTagsAny":["INDIRECT_FIRE"],"fromStatus":"PACKED","toStatus":"DEPLOYED"}'),
  ('action-pack-platform', 'ruleset-v5-core-curated-1', 'Pack Up Platform', 'STANDARD', 2, 'active', 'V5 / Artillery', 'Packing includes hitching and costs one Standard Action.', '{"requiredTagsAny":["INDIRECT_FIRE"],"fromStatus":"DEPLOYED","toStatus":"PACKED"}'),
  ('action-funnel', 'ruleset-v5-core-curated-1', 'Funnel', 'PRIMARY', 0, 'active', 'V5 / Artillery', 'Supply consumption follows provisional RC-V5-011.', '{"usesAttack":true,"smallSupplyCost":1,"target":{"side":"HOSTILE","mustBeMoving":true},"forcedDistanceQuarters":2,"conflictIds":["RC-V5-011"]}'),
  ('action-load-cargo', 'ruleset-v5-core-curated-1', 'Load Cargo', 'STANDARD', 2, 'active', 'V5 / Actions and Change Log', 'Transport and passenger normally each pay; HAT slot exception retained by RC-V5-010.', '{"requiredAbility":"TRANSPORT_CARGO","participantsPay":["CARRIER","PASSENGER"],"conflictIds":["RC-V5-010"]}'),
  ('action-unload-cargo', 'ruleset-v5-core-curated-1', 'Unload Cargo', 'STANDARD', 2, 'active', 'V5 / Actions and Change Log', 'Transport and passenger normally each pay; class/equipment overrides must be explicit.', '{"requiredAbility":"TRANSPORT_CARGO","participantsPay":["CARRIER","PASSENGER"],"conflictIds":["RC-V5-010","RC-V5-030"]}'),
  ('action-transfer-supply', 'ruleset-v5-core-curated-1', 'Transfer Supply', 'STANDARD', 2, 'active', 'V5 / Logi Truck and standard action economy', 'Quantity and receiver capacity remain authoritative server state.', '{"requiredAbility":"TRANSFER_SUPPLY","target":{"side":"FRIENDLY"}}'),
  ('action-crew-repair', 'ruleset-v5-core-curated-1', 'Crew Repair', 'PRIMARY', 0, 'active', 'V5 / IFV and Main Battle Tank', 'Full stationary round and loss of Armor benefit follow RC-V5-024.', '{"requiredAbility":"CREW_REPAIR","requiresNoMovement":true,"armorBenefitThisRound":false,"repairsOneSubsystem":true,"conflictIds":["RC-V5-024"]}'),
  ('action-land', 'ruleset-v5-core-curated-1', 'Land', 'STANDARD', 2, 'active', 'V5 / Actions and Atmo Flight tag', 'Fixed-wing atmospheric craft require a runway; landing and takeoff cannot both occur in one round.', '{"requiredTagsAny":["VTOL","ATMO_FLIGHT"],"requiresFacilityCapabilityAny":["LAND_VTOL","LAND_AEROSPACE"]}'),
  ('action-take-off', 'ruleset-v5-core-curated-1', 'Take Off', 'STANDARD', 2, 'active', 'V5 / Actions and Atmo Flight tag', 'Landing and takeoff cannot both occur in one round.', '{"requiredStatuses":["LANDED"],"forbiddenSameRoundActions":["action-land"]}'),
  ('action-rearm-aerospace', 'ruleset-v5-core-curated-1', 'Rearm Aerospace', 'PRIMARY', 0, 'active', 'V5 / Fighter, Bomber and Supply Flow', 'Reload resource quantity remains provisional under RC-V5-023.', '{"requiredStatus":"LANDED","requiresFacilityCapability":"REARM_AEROSPACE","conflictIds":["RC-V5-023"]}'),
  ('action-airdrop', 'ruleset-v5-core-curated-1', 'Airdrop', 'STANDARD', 2, 'experimental', 'V5 / Heavy Air Transport', 'Clear-space path drops only; hazardous outcomes remain blocked by RC-V5-018. HAT slot cost and passenger cost follow RC-V5-010.', '{"requiredAbility":"AIRDROP","targetMustLieOnRoute":true,"clearOpenHexOnly":true,"costPerCargoSlotQuarters":2,"conflictIds":["RC-V5-010","RC-V5-018"]}'),
  ('action-sabotage', 'ruleset-v5-core-curated-1', 'Sabotage', 'STANDARD', 2, 'experimental', 'phase2-forces.md / Persistent force scope', 'Product-required structured interaction; target/effect values are deliberately absent pending an authoritative scenario.', '{"requiredAbility":"SABOTAGE","target":{"types":["OBJECTIVE","STRUCTURE"]},"effect":"SCENARIO_DEFINED"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  economy = excluded.economy,
  speed_cost_quarters = excluded.speed_cost_quarters,
  definition_status = excluded.definition_status,
  source = excluded.source,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO equipment_definitions (
  id, ruleset_id, name, category, slot_type, requisition_cost, consumable,
  definition_status, source, notes, definition_json
) VALUES
  ('equipment-silent-smgs', 'ruleset-v5-core-curated-1', 'Silent SMGs', 'INFANTRY_WEAPON', 'primary', 1, 0, 'experimental', 'The Store row 21', 'Fixed 3 Damage does not fit the current dice-only weapon table and remains an equipment ability.', '{"requiresTags":["INFANTRY_STEALTH"],"ammoCapacity":3,"fixedDamage":3,"range":1,"quietKillRetainsStealth":true}'),
  ('equipment-k9-scouts', 'ruleset-v5-core-curated-1', 'K-9 Scouts', 'INFANTRY_UTILITY', 'primary', 2, 0, 'experimental', 'The Store row 22', 'Scout extension requires fog-safe server projection.', '{"requiresTags":["INFANTRY"],"abilityGrant":"K9_SCOUT","maximumDistance":3,"cooldownRounds":4,"scoutStatus":"PERMANENTLY_STEALTHED"}'),
  ('equipment-smoke-launcher', 'ruleset-v5-core-curated-1', 'Smoke Launcher', 'VEHICLE_UTILITY', 'secondary', 1, 1, 'experimental', 'The Store row 49', 'One use per installed upgrade.', '{"requiresTags":["VEHICLE"],"ammoCapacity":1,"range":{"minimum":0,"maximum":1},"effect":"BLOCK_LOS","indirectUnaffected":true}'),
  ('equipment-ap-ammo', 'ruleset-v5-core-curated-1', 'AP Ammo', 'VEHICLE_AMMUNITION', 'ammo', 1, 1, 'experimental', 'The Store row 50', '', '{"requiresTags":["VEHICLE"],"ammoCapacity":3,"weaponModifier":{"armorPiercing":1}}'),
  ('equipment-mech-light-laser', 'ruleset-v5-core-curated-1', 'Light Laser Setup', 'MECH_WEAPON', 'external', 1, 0, 'experimental', 'The Store row 63', 'Store uses FS-minus-one fixed output and a cooling cadence; no conversion is invented.', '{"requiresTags":["MECH"],"damageFormula":"CURRENT_FS_MINUS_1","armorPiercing":0,"range":1,"shotsBeforeCooling":3,"ammo":"UNLIMITED"}'),
  ('equipment-aerospace-sidewinder', 'ruleset-v5-core-curated-1', 'Sidewinder AA Missile', 'AEROSPACE_WEAPON', 'light', 1, 1, 'experimental', 'The Store row 79', '', '{"requiresTags":["AEROSPACE"],"validTargets":["AEROSPACE","ORBITAL"],"fixedDamage":3,"range":3,"ammoPerMount":1,"crateQuantity":4}'),
  ('equipment-aerospace-afterburner', 'ruleset-v5-core-curated-1', 'Afterburner', 'AEROSPACE_INTERNAL', 'internal', 1, 1, 'experimental', 'The Store row 82', '', '{"requiresTags":["AEROSPACE"],"speedModifier":2,"uses":2,"activationTiming":"ROUND_START"}'),
  ('equipment-cluster-bombs', 'ruleset-v5-core-curated-1', 'Cluster Bombs', 'AEROSPACE_ORDNANCE', 'bomb_bay', 1, 1, 'experimental', 'The Store row 85', '', '{"requiresTags":["AEROSPACE"],"validTargets":["GROUND"],"fixedDamage":3,"hexCount":2,"crateQuantity":4,"requiresFlyOver":true}'),
  ('equipment-simple-med-stimpacks', 'ruleset-v5-core-curated-1', 'Simple Med-Stimpacks', 'MEDICAL', 'medical', 1, 1, 'experimental', 'The Store row 41', '', '{"requiresTags":["MEDICAL"],"fixedHeal":2,"targetTags":["INFANTRY"],"economy":"STANDARD"}'),
  ('equipment-road-building', 'ruleset-v5-core-curated-1', 'Road Building Equipment', 'ENGINEER', 'engineer', NULL, 0, 'incomplete', 'The Store row 29', 'The Store cost cell is blank; requisition remains BALANCE_REQUIRED.', '{"requiresTags":["ENGINEER"],"abilityGrants":["BUILD_ROAD","BUILD_FIELD_RUNWAY"],"roadMinimumHexes":3,"progressPerHexActions":1}'),
  ('equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'VTOL Bay', 'SHIP_MODULE', 'external', 1, 0, 'experimental', 'The Store row 97', '', '{"shipModule":true,"carry":{"VTOL":2,"HEAVY_LIFT_VTOL":1},"repairPerRound":2,"cargoSupplyDelta":2}'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'Carrier Flight Deck', 'SHIP_MODULE', 'external', 1, 0, 'experimental', 'The Store row 98', 'Destroyer-or-larger prerequisite retained.', '{"shipModule":true,"minimumHull":"DESTROYER","carryAerospace":2,"landingsPerRound":1,"repairPerRound":2,"rearm":true}'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'Mech Bay', 'SHIP_MODULE', 'external', 1, 0, 'experimental', 'The Store row 99', '', '{"shipModule":true,"carry":{"MECH_OR_TANK_UP_TO_HEAVY":2},"repairPerRound":1,"refit":true}'),
  ('equipment-mobile-infantry', 'ruleset-v5-core-curated-1', 'Mobile Infantry Upgrade', 'SHIP_MODULE', 'external_internal', 1, 0, 'experimental', 'The Store row 103', 'Requires an attached infantry player declared before campaign start.', '{"shipModule":true,"carryInfantry":2,"deployAllCooldownRounds":6,"recoverAllCooldownRounds":6}'),
  ('equipment-armory', 'ruleset-v5-core-curated-1', 'Armory', 'SHIP_MODULE', 'internal', 1, 0, 'experimental', 'The Store row 104', '', '{"shipModule":true,"rearmInfantry":true,"changeOwnedEquipment":true,"supplyPerWeaponReload":1}'),
  ('equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'Heavy Ground Vehicle Bay', 'SHIP_MODULE', 'internal', 1, 0, 'experimental', 'The Store row 107', '', '{"shipModule":true,"carry":{"ARMOURED":2,"SUPER_HEAVY":1},"repairGroundVehiclePerRound":1,"repairMech":false}'),
  ('equipment-aerospace-storage', 'ruleset-v5-core-curated-1', 'Aerospace Storage Hangar', 'SHIP_MODULE', 'internal', 2, 0, 'experimental', 'The Store row 111', 'Storage is not a landing pad; Destroyer-or-larger prerequisite retained.', '{"shipModule":true,"minimumHull":"DESTROYER","carryAerospace":1,"rearmAerospace":true,"cargoCapacityDelta":4,"requiresLandingCapability":true}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  category = excluded.category,
  slot_type = excluded.slot_type,
  requisition_cost = excluded.requisition_cost,
  consumable = excluded.consumable,
  definition_status = excluded.definition_status,
  source = excluded.source,
  notes = excluded.notes,
  definition_json = excluded.definition_json;

INSERT INTO enemy_definitions (
  id, ruleset_id, name, faction_id, doctrine_json, unit_definition_json,
  definition_status, source, notes
) VALUES
  ('enemy-bug-spitter', 'ruleset-v5-core-curated-1', 'Bug Spitter', 'bug-swarm', '{"role":"RANGED_THREAT","preferredTargets":["PERSONNEL"],"targetingTags":["PERSONNEL"]}', '{"tags":["PERSONNEL","BUG","RANGED"],"abilities":["RANGED_PRESSURE"],"balanceRequired":true}', 'incomplete', 'phase2-forces.md / varied Bug roster', 'Product-defined role only; no authoritative statistics or cost are invented.'),
  ('enemy-bug-burrower', 'ruleset-v5-core-curated-1', 'Bug Burrower', 'bug-swarm', '{"role":"AMBUSH_MOBILITY","preferredTargets":["OBJECTIVE","LOGISTICS"]}', '{"tags":["PERSONNEL","BUG","BURROWER","STEALTH"],"abilities":["BURROW","AMBUSH"],"balanceRequired":true}', 'incomplete', 'phase2-forces.md / varied Bug roster', 'Product-defined role only; no authoritative statistics or cost are invented.'),
  ('enemy-bug-flyer', 'ruleset-v5-core-curated-1', 'Bug Flyer', 'bug-swarm', '{"role":"AIR_THREAT","preferredTargets":["AEROSPACE","LOGISTICS"]}', '{"tags":["VEHICLE","BUG","AEROSPACE"],"abilities":["FLIGHT_PATH"],"balanceRequired":true}', 'incomplete', 'phase2-forces.md / varied Bug roster', 'Product-defined role only; no authoritative statistics or cost are invented.'),
  ('enemy-bug-artillery', 'ruleset-v5-core-curated-1', 'Bug Artillery', 'bug-swarm', '{"role":"INDIRECT_FIRE","preferredTargets":["STRUCTURE","OBJECTIVE","PERSONNEL"]}', '{"tags":["BUG","INDIRECT_FIRE"],"abilities":["INDIRECT_FIRE"],"balanceRequired":true}', 'incomplete', 'phase2-forces.md / varied Bug roster', 'Product-defined role only; no authoritative statistics or cost are invented.')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  doctrine_json = excluded.doctrine_json,
  unit_definition_json = excluded.unit_definition_json,
  definition_status = excluded.definition_status,
  source = excluded.source,
  notes = excluded.notes;

INSERT INTO movement_profile_definitions (
  id, ruleset_id, name, domain, uses_facing, allows_hostile_passage,
  requires_flight_path, can_land, can_enter_orbit, terrain_costs_json,
  source_path, source_locator, definition_json
) VALUES
  ('movement-infantry-ground', 'ruleset-v5-core-curated-1', 'Infantry Ground', 'GROUND', 1, 0, 0, 0, 0, '{}', 'rules/Meta - Core Rules (V5).md', 'Advance; Starting Unit Classes / Infantry Squad', '{"terrainCosts":"SCENARIO_DEFINED","garrisonEligible":true}'),
  ('movement-ground-standard', 'ruleset-v5-core-curated-1', 'Standard Ground Vehicle', 'GROUND', 1, 0, 0, 0, 0, '{}', 'rules/Meta - Core Rules (V5).md', 'Advance; Starting Unit Classes', '{"terrainCosts":"SCENARIO_DEFINED"}'),
  ('movement-tracked-ground', 'ruleset-v5-core-curated-1', 'Tracked Ground', 'GROUND', 1, 0, 0, 0, 0, '{}', 'rules/Classes.html', 'Main Battle Tank / always a Tracked vehicle', '{"terrainCosts":"SCENARIO_DEFINED"}'),
  ('movement-mech', 'ruleset-v5-core-curated-1', 'Ground Mech', 'GROUND', 1, 1, 0, 0, 0, '{}', 'rules/Meta - Core Rules (V5).md', 'Advance; Starting Unit Classes / Light Mech', '{"terrainCosts":"SCENARIO_DEFINED","passesHostileGroundFormations":true}'),
  ('movement-vtol', 'ruleset-v5-core-curated-1', 'VTOL Flight', 'VTOL', 1, 1, 1, 1, 1, '{}', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Aerospace; Starting Unit Classes / VTOL', '{"terrainCosts":"IGNORED_IN_FLIGHT","landingFacilityCapability":"LAND_VTOL"}'),
  ('movement-aerospace', 'ruleset-v5-core-curated-1', 'Fixed-Wing Aerospace', 'AEROSPACE', 1, 1, 1, 1, 1, '{}', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Atmo Flight and Aerospace', '{"terrainCosts":"IGNORED_IN_FLIGHT","atmosphericLandingRequires":"RUNWAY","orbitTransitionSpeedFraction":{"numerator":1,"denominator":2}}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  domain = excluded.domain,
  uses_facing = excluded.uses_facing,
  allows_hostile_passage = excluded.allows_hostile_passage,
  requires_flight_path = excluded.requires_flight_path,
  can_land = excluded.can_land,
  can_enter_orbit = excluded.can_enter_orbit,
  terrain_costs_json = excluded.terrain_costs_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO durability_profile_definitions (
  id, ruleset_id, name, model, output_scales_with_current, supports_subsystems,
  source_path, source_locator, definition_json
) VALUES
  ('durability-personnel-fs', 'ruleset-v5-core-curated-1', 'Personnel Force Strength', 'FORCE_STRENGTH', 1, 0, 'rules/Meta - Core Rules (V5).md', 'Understanding Unit Stats / Force Strength', '{"destroyedAt":0,"basicAttackDie":"D6","damageCap":"CURRENT_FS"}'),
  ('durability-vehicle-hits', 'ruleset-v5-core-curated-1', 'Vehicle Hits', 'HITS', 0, 0, 'rules/Meta - Core Rules (V5).md', 'Understanding Unit Stats / Hits', '{"destroyedAt":0,"penetratingAttackLoss":1}'),
  ('durability-vehicle-hits-subsystems', 'ruleset-v5-core-curated-1', 'Vehicle Hits with Subsystems', 'HITS', 0, 1, 'rules/Meta - Core Rules (V5).md', 'Understanding Unit Stats / Hits; Unit Tags / Sub-System', '{"destroyedAt":0,"penetratingAttackLoss":1,"subsystemNaturalRolls":{"5":"WEAPONS","6":"MOBILITY"}}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  model = excluded.model,
  output_scales_with_current = excluded.output_scales_with_current,
  supports_subsystems = excluded.supports_subsystems,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO cargo_profile_definitions (
  id, ruleset_id, name, capacity_json, loading_rules_json,
  source_path, source_locator, definition_json
) VALUES
  ('cargo-logi-two-slot', 'ruleset-v5-core-curated-1', 'Logi Two-Slot Cargo', '{"slotCapacityQuarters":8,"conversions":[{"itemTagsAny":["INFANTRY"],"maximumFS":6,"slotCostQuarters":4},{"itemTagsAny":["VEHICLE"],"slotCostQuarters":8},{"resourceType":"SMALL_SUPPLY","quantity":5,"slotCostQuarters":4}],"tow":{"itemTagsAny":["ARTILLERY"],"count":1}}', '{"standardAction":true,"requiresPermissionForForeignUnit":true}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Logi Truck', '{}'),
  ('cargo-light-vehicle', 'ruleset-v5-core-curated-1', 'Light Vehicle Cargo', '{"alternativeModes":[{"itemTagsAny":["INFANTRY"],"maximumFS":4},{"resourceType":"SMALL_SUPPLY","quantity":1}]}', '{"standardAction":true}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Light Vehicle', '{}'),
  ('cargo-ifv-infantry', 'ruleset-v5-core-curated-1', 'IFV Infantry Compartment', '{"itemTagsAny":["INFANTRY"],"maximumFS":6}', '{"standardAction":true}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Infantry Fighting Vehicle', '{}'),
  ('cargo-vtol-alternative', 'ruleset-v5-core-curated-1', 'VTOL Alternative Cargo', '{"alternativeModes":[{"itemTagsAny":["INFANTRY"],"maximumFS":6},{"resourceType":"SMALL_SUPPLY","quantity":2}]}', '{"standardAction":true,"conflictIds":["RC-V5-017"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / VTOL', '{}'),
  ('cargo-hat-five-slot', 'ruleset-v5-core-curated-1', 'Heavy Air Transport Five-Slot Cargo', '{"slotCapacityQuarters":20,"conversions":[{"itemTagsAny":["INFANTRY"],"maximumFS":6,"slotCostQuarters":4},{"itemTagsAny":["VEHICLE"],"slotCostQuarters":8},{"resourceType":"SMALL_SUPPLY","quantity":5,"slotCostQuarters":4},{"resourceType":"MEDIUM_SUPPLY","quantity":1,"slotCostQuarters":8},{"resourceType":"LARGE_SUPPLY","quantity":1,"slotCostQuarters":20}]}', '{"standardActionCostPerSlotQuarters":2,"clearAirdropAlongRoute":true,"conflictIds":["RC-V5-010","RC-V5-018"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Heavy Air Transport', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  capacity_json = excluded.capacity_json,
  loading_rules_json = excluded.loading_rules_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO supply_profile_definitions (
  id, ruleset_id, name, capacities_json, reload_rules_json,
  source_path, source_locator, definition_json
) VALUES
  ('supply-medical-current-fs', 'ruleset-v5-core-curated-1', 'Medical Supply by Current FS', '{"MEDICAL_SUPPLY":{"maximum":4,"capacityFormula":"CURRENT_FS"}}', '{"sourceResource":"SMALL_SUPPLY","sourceQuantity":1,"refillToMaximum":true,"overCapacityPolicy":"RETAIN_AND_BLOCK_LOADING","conflictIds":["RC-V5-029"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Medics', '{}'),
  ('supply-engineer-current-fs', 'ruleset-v5-core-curated-1', 'Engineer Supply by Current FS', '{"SMALL_SUPPLY":{"maximum":4,"capacityFormula":"CURRENT_FS"}}', '{"overCapacityPolicy":"RETAIN_AND_BLOCK_LOADING","conflictIds":["RC-V5-029"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Engineers', '{}'),
  ('supply-artillery-small-two', 'ruleset-v5-core-curated-1', 'Artillery Small Supply', '{"SMALL_SUPPLY":{"maximum":2}}', '{"costPerRoundOfFire":1,"conflictIds":["RC-V5-011"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Artillery', '{}'),
  ('supply-aerospace-main-ammo', 'ruleset-v5-core-curated-1', 'Aerospace Main Ammunition', '{"MAIN_AMMUNITION":{"maximum":1}}', '{"requiresLanded":true,"economy":"PRIMARY","facilityCapability":"REARM_AEROSPACE","resourceQuantity":"SCENARIO_DEFINED","conflictIds":["RC-V5-023"]}', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Aerospace Fighter and Bomber', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  capacities_json = excluded.capacities_json,
  reload_rules_json = excluded.reload_rules_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO deployment_profile_definitions (
  id, ruleset_id, name, requirements_json, drop_modes_json,
  source_path, source_locator, definition_json
) VALUES
  ('deployment-ground', 'ruleset-v5-core-curated-1', 'Ground Deployment', '{"locationStatesAny":["RESERVE","ON_SHIP"],"campaignPermissionRequired":true}', '[]', 'phase2-forces.md', 'Persistent force deployment slice', '{}'),
  ('deployment-infantry-paradrop', 'ruleset-v5-core-curated-1', 'Infantry Paradrop', '{"carrierAbility":"AIRDROP","clearLandingRequired":true}', '["GROUND","HAT_PARADROP"]', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Infantry Squad', '{"hazardousDropBlockedBy":"RC-V5-018"}'),
  ('deployment-power-armour-orbital', 'ruleset-v5-core-curated-1', 'Power Armour Orbital Drop', '{"carrierCapabilityAny":["HEAVY_DROP_POD","AIRDROP"]}', '["GROUND","ORBITAL_DROP"]', 'rules/Classes.html', 'Power Armored Infantry', '{"canonicalActivation":"CATALOGUED"}'),
  ('deployment-light-vehicle-paradrop', 'ruleset-v5-core-curated-1', 'Light Vehicle Paradrop', '{"carrierAbility":"AIRDROP","clearLandingRequired":true}', '["GROUND","HAT_PARADROP"]', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Light Vehicle', '{"hazardousDropBlockedBy":"RC-V5-018"}'),
  ('deployment-aerospace-fixed-wing', 'ruleset-v5-core-curated-1', 'Fixed-Wing Aerospace Deployment', '{"facilityCapability":"LAND_AEROSPACE","atmosphericRunwayRequired":true}', '["AIRFIELD","FLIGHT_DECK","ORBIT"]', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Atmo Flight; Aerospace', '{}'),
  ('deployment-vtol', 'ruleset-v5-core-curated-1', 'VTOL Deployment', '{"facilityCapability":"LAND_VTOL"}', '["VTOL_PAD","FLIGHT_DECK","ORBIT"]', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / VTOL', '{}'),
  ('deployment-hat', 'ruleset-v5-core-curated-1', 'Heavy Air Transport Deployment', '{"facilityCapability":"LAND_AEROSPACE","atmosphericRunwayRequired":true}', '["AIRFIELD","FLIGHT_DECK","ORBIT"]', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Heavy Air Transport', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  requirements_json = excluded.requirements_json,
  drop_modes_json = excluded.drop_modes_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO tag_definitions (
  id, ruleset_id, name, source_path, source_locator, definition_json
) VALUES
  ('tag-infantry', 'ruleset-v5-core-curated-1', 'Infantry', 'rules/Meta - Core Rules (V5).md', 'Force Strength; Infantry Squad', '{"targetGroup":"PERSONNEL"}'),
  ('tag-vehicle', 'ruleset-v5-core-curated-1', 'Vehicle', 'rules/Meta - Core Rules (V5).md', 'Hits', '{"durability":"HITS"}'),
  ('tag-armoured', 'ruleset-v5-core-curated-1', 'Armoured', 'rules/Meta - Core Rules (V5).md', 'Armor', '{}'),
  ('tag-light', 'ruleset-v5-core-curated-1', 'Light', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Light Vehicle', '{"capabilityClassification":true}'),
  ('tag-heavy', 'ruleset-v5-core-curated-1', 'Heavy', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Main Battle Tank; Infantry Fighting Vehicle', '{"capabilityClassification":true}'),
  ('tag-mech', 'ruleset-v5-core-curated-1', 'Mech', 'rules/Meta - Core Rules (V5).md', 'Advance; Light Mech', '{"passesHostileGroundFormations":true}'),
  ('tag-aerospace', 'ruleset-v5-core-curated-1', 'Aerospace', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Aerospace', '{}'),
  ('tag-vtol', 'ruleset-v5-core-curated-1', 'VTOL', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / VTOL', '{}'),
  ('tag-orbital', 'ruleset-v5-core-curated-1', 'Orbital', 'rules/Meta - Core Rules (V5).md', 'Space Combat / Orbitals', '{}'),
  ('tag-atmo-flight', 'ruleset-v5-core-curated-1', 'Atmo Flight', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Atmo Flight', '{}'),
  ('tag-infantry-stealth', 'ruleset-v5-core-curated-1', 'Infantry Stealth', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Infantry Stealth', '{}'),
  ('tag-vehicle-stealth', 'ruleset-v5-core-curated-1', 'Vehicle Stealth', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Vehicle Stealth', '{}'),
  ('tag-subsystems', 'ruleset-v5-core-curated-1', 'Subsystems', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Sub-System', '{}'),
  ('tag-indirect-fire', 'ruleset-v5-core-curated-1', 'Indirect Fire', 'rules/Meta - Core Rules (V5).md', 'Line of Sight; Artillery', '{}'),
  ('tag-rapid-fire', 'ruleset-v5-core-curated-1', 'Rapid Fire', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Rapid Fire', '{"conflictIds":["RC-V5-027"]}'),
  ('tag-aerospace-interceptor', 'ruleset-v5-core-curated-1', 'Aerospace Interceptor', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Aerospace Interceptor', '{"conflictIds":["RC-V5-028"]}'),
  ('tag-bomber', 'ruleset-v5-core-curated-1', 'Bomber', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Aerospace Bomber', '{"attackGeometry":"FLY_OVER"}'),
  ('tag-ponderous', 'ruleset-v5-core-curated-1', 'Ponderous', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Ponderous', '{}'),
  ('tag-transport', 'ruleset-v5-core-curated-1', 'Transport', 'phase2-forces.md', 'Persistent force schema / cargo', '{}'),
  ('tag-logistics', 'ruleset-v5-core-curated-1', 'Logistics', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Logi Truck', '{}'),
  ('tag-engineer', 'ruleset-v5-core-curated-1', 'Engineer', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Engineers', '{}'),
  ('tag-medical', 'ruleset-v5-core-curated-1', 'Medical', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Medics', '{}'),
  ('tag-artillery', 'ruleset-v5-core-curated-1', 'Artillery', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Artillery', '{}'),
  ('tag-evasive-capable', 'ruleset-v5-core-curated-1', 'Evasive Capable', 'rules/Meta - Core Rules (V5).md', 'Special Order Types / Evasive; class descriptions', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO status_effect_definitions (
  id, ruleset_id, name, stacking_rule, visibility, source_path, source_locator, definition_json
) VALUES
  ('status-stealthed', 'ruleset-v5-core-curated-1', 'Stealthed', 'REFRESH', 'OWNER', 'rules/Meta - Core Rules (V5).md', 'Special Order Types / Stealth; Unit Tags', '{"revealedBy":["ATTACK","REVEALING_INTERACTION"],"serverProjected":true}'),
  ('status-packed', 'ruleset-v5-core-curated-1', 'Packed', 'UNIQUE', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Artillery', '{"canMove":true,"canFire":false}'),
  ('status-deployed', 'ruleset-v5-core-curated-1', 'Deployed', 'UNIQUE', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Starting Unit Classes / Artillery', '{"canMove":false,"canFire":true}'),
  ('status-dug-in', 'ruleset-v5-core-curated-1', 'Dug In', 'REFRESH', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Infantry Squad / Dig In', '{"defenseModifier":2,"endsOnMove":true,"conflictIds":["RC-V5-019"]}'),
  ('status-evasive', 'ruleset-v5-core-curated-1', 'Evasive', 'REFRESH', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Special Order Types / Evasive', '{"attackModifier":-2,"defenseModifier":3,"minimumDisplacementFraction":{"numerator":1,"denominator":2},"conflictIds":["RC-V5-004"]}'),
  ('status-airborne', 'ruleset-v5-core-curated-1', 'Airborne', 'UNIQUE', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Atmo Flight; Aerospace', '{}'),
  ('status-landed', 'ruleset-v5-core-curated-1', 'Landed', 'UNIQUE', 'PUBLIC', 'rules/Meta - Core Rules (V5).md', 'Atmo Flight; Aerospace class descriptions', '{}'),
  ('status-rearm-required', 'ruleset-v5-core-curated-1', 'Rearm Required', 'UNIQUE', 'SIDE', 'rules/Meta - Core Rules (V5).md', 'Aerospace Fighter and Bomber', '{}'),
  ('status-mash-deployed', 'ruleset-v5-core-curated-1', 'MASH Deployed', 'UNIQUE', 'PUBLIC', 'rules/Classes.html', 'Combat Medical Unit', '{"canonicalActivation":"CATALOGUED"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  stacking_rule = excluded.stacking_rule,
  visibility = excluded.visibility,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO ability_definitions (
  id, ruleset_id, name, action_definition_id, target_selector_json, effect_json,
  source_path, source_locator, definition_json
) VALUES
  ('ability-dig-in', 'ruleset-v5-core-curated-1', 'Dig In', 'action-dig-in', '{"self":true}', '{"applyStatus":"status-dug-in"}', 'rules/Meta - Core Rules (V5).md', 'Infantry Squad / Dig In', '{}'),
  ('ability-heal-infantry', 'ruleset-v5-core-curated-1', 'Heal Infantry', 'action-first-aid', '{"side":"FRIENDLY","tagsAny":["INFANTRY"],"range":"BASE_CONTACT","mustBeDamaged":true}', '{"healDice":"D6","cap":"ACTOR_CURRENT_FS","maximum":"TARGET_MAX_FS","resourceCost":{"MEDICAL_SUPPLY":1}}', 'rules/Meta - Core Rules (V5).md', 'Medics; Change Log base-contact errata', '{"conflictIds":["RC-UNIT-002","RC-V5-009"]}'),
  ('ability-deploy-mash', 'ruleset-v5-core-curated-1', 'Deploy MASH', 'action-deploy-mash', '{"self":true}', '{"applyStatus":"status-mash-deployed","setupActions":2,"packActions":1,"areaHeal":1}', 'rules/Classes.html', 'Combat Medical Unit', '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-002"]}'),
  ('ability-construct', 'ruleset-v5-core-curated-1', 'Construct', 'action-construct', '{"hex":"ADJACENT_OR_CURRENT","structureDefinitionRequired":true}', '{"persistentProject":true,"resource":"SMALL_SUPPLY","cost":"STRUCTURE_DEFINED"}', 'rules/Meta - Core Rules (V5).md', 'Engineers', '{}'),
  ('ability-repair-vehicle', 'ruleset-v5-core-curated-1', 'Repair Vehicle', 'action-repair', '{"side":"FRIENDLY","tagsAny":["VEHICLE"],"range":"BASE_CONTACT"}', '{"chooseOne":[{"restoreHits":1},{"repairSubsystem":1}],"resourceCost":{"SMALL_SUPPLY":1}}', 'rules/Meta - Core Rules (V5).md', 'Engineers / Action Repair', '{}'),
  ('ability-build-road', 'ruleset-v5-core-curated-1', 'Build Road', 'action-construct', '{"routeRequired":true}', '{"persistentProject":true,"minimumHexes":3,"progressPerHexActions":1}', 'rules/The Store - Equipment List.html', 'Road Building Equipment / row 29', '{"requisitionStatus":"BALANCE_REQUIRED"}'),
  ('ability-infantry-stealth', 'ruleset-v5-core-curated-1', 'Infantry Stealth', NULL, '{"self":true}', '{"applyStatus":"status-stealthed","detectionRoll":"D6_MEET_OR_BEAT_OBSERVERS","revealedBy":["ATTACK","REVEALING_INTERACTION"]}', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Infantry Stealth', '{}'),
  ('ability-sabotage', 'ruleset-v5-core-curated-1', 'Sabotage', 'action-sabotage', '{"side":"HOSTILE_OR_NEUTRAL","types":["OBJECTIVE","STRUCTURE"]}', '{"effect":"SCENARIO_DEFINED","supportsDelayedCharge":true}', 'phase2-forces.md', 'Combined-arms force scope / Special Forces', '{}'),
  ('ability-deploy-platform', 'ruleset-v5-core-curated-1', 'Deploy or Pack Platform', 'action-deploy-platform', '{"self":true}', '{"statuses":["status-packed","status-deployed"],"packAction":"action-pack-platform"}', 'rules/Meta - Core Rules (V5).md', 'Artillery', '{}'),
  ('ability-indirect-fire', 'ruleset-v5-core-curated-1', 'Indirect Fire', 'action-attack', '{"side":"HOSTILE","weaponTag":"INDIRECT","friendlySpotterRequired":true}', '{"ignoresInterveningLosBlockers":true,"stillRequiresRange":true}', 'rules/Meta - Core Rules (V5).md', 'Line of Sight', '{}'),
  ('ability-funnel', 'ruleset-v5-core-curated-1', 'Funnel', 'action-funnel', '{"side":"HOSTILE","mustBeMoving":true}', '{"forcedDistanceQuarters":2,"direction":"PLAYER_CHOSEN","timing":"AFTER_MOVE_BEFORE_CONFLICT"}', 'rules/Meta - Core Rules (V5).md', 'Artillery / Funnel', '{}'),
  ('ability-transport-cargo', 'ruleset-v5-core-curated-1', 'Transport Cargo', 'action-load-cargo', '{"cargoProfileRequired":true}', '{"manifestBacked":true,"unloadAction":"action-unload-cargo"}', 'rules/Meta - Core Rules (V5).md', 'Actions; transport class descriptions', '{"conflictIds":["RC-V5-010","RC-V5-030"]}'),
  ('ability-tow-artillery', 'ruleset-v5-core-curated-1', 'Tow Artillery', 'action-load-cargo', '{"side":"FRIENDLY","tagsAny":["ARTILLERY"]}', '{"cargoKind":"TOWED","deployPackIntegration":true}', 'rules/Meta - Core Rules (V5).md', 'Logi Truck; Artillery deploy/pack', '{}'),
  ('ability-transfer-supply', 'ruleset-v5-core-curated-1', 'Transfer Supply', 'action-transfer-supply', '{"side":"FRIENDLY","hasSupplyCapacity":true}', '{"manifestBacked":true,"serverClampsToCapacity":true}', 'rules/Meta - Core Rules (V5).md', 'Logi Truck; Supply Flow', '{}'),
  ('ability-evasive', 'ruleset-v5-core-curated-1', 'Evasive', NULL, '{"self":true}', '{"orderType":"EVASIVE","applyStatus":"status-evasive"}', 'rules/Meta - Core Rules (V5).md', 'Special Order Types / Evasive', '{"conflictIds":["RC-V5-004"]}'),
  ('ability-crew-repair', 'ruleset-v5-core-curated-1', 'Crew Repair', 'action-crew-repair', '{"self":true,"subsystemStateAny":["DAMAGED","DISABLED"]}', '{"requiresNoMovement":true,"armorBenefitThisRound":false,"repairSubsystem":1}', 'rules/Meta - Core Rules (V5).md', 'IFV and Main Battle Tank', '{"conflictIds":["RC-V5-024"]}'),
  ('ability-pass-hostile-ground', 'ruleset-v5-core-curated-1', 'Pass Through Hostile Ground Formations', NULL, '{"self":true}', '{"movementProfileFlag":"allowsHostilePassage"}', 'rules/Meta - Core Rules (V5).md', 'Advance; Light Mech', '{}'),
  ('ability-flight-path', 'ruleset-v5-core-curated-1', 'Flight Path', NULL, '{"routeRequired":true}', '{"movementProfileFlag":"requiresFlightPath"}', 'phase2-forces.md', 'Aerospace movement profile', '{}'),
  ('ability-aerospace-intercept', 'ruleset-v5-core-curated-1', 'Aerospace Intercept', 'action-attack', '{"side":"HOSTILE","tagsAny":["AEROSPACE"]}', '{"constrainsTargetAttack":true,"conflictIds":["RC-V5-028"]}', 'rules/Meta - Core Rules (V5).md', 'Unit Tags / Aerospace Interceptor', '{}'),
  ('ability-bomb-run', 'ruleset-v5-core-curated-1', 'Bomb Run', 'action-attack', '{"side":"HOSTILE","targetHexMustLieOnRoute":true}', '{"weaponTag":"FLY_OVER","expendsMainAmmunition":true}', 'rules/Meta - Core Rules (V5).md', 'Aerospace Bomber', '{}'),
  ('ability-land', 'ruleset-v5-core-curated-1', 'Land and Take Off', 'action-land', '{"self":true}', '{"landStatus":"status-landed","takeOffAction":"action-take-off","mutuallyExclusiveSameRound":true}', 'rules/Meta - Core Rules (V5).md', 'Atmo Flight; Actions', '{}'),
  ('ability-rearm-aerospace', 'ruleset-v5-core-curated-1', 'Rearm Aerospace', 'action-rearm-aerospace', '{"self":true,"requiredStatus":"LANDED"}', '{"restoreWeaponAmmoToCapacity":true,"removeStatus":"status-rearm-required"}', 'rules/Meta - Core Rules (V5).md', 'Aerospace Fighter and Bomber', '{"conflictIds":["RC-V5-023"]}'),
  ('ability-airdrop', 'ruleset-v5-core-curated-1', 'Airdrop', 'action-airdrop', '{"cargoRequired":true,"targetHexMustLieOnRoute":true}', '{"clearOpenHexOnly":true,"manifestBacked":true}', 'rules/Meta - Core Rules (V5).md', 'Heavy Air Transport', '{"conflictIds":["RC-V5-010","RC-V5-018"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  action_definition_id = excluded.action_definition_id,
  target_selector_json = excluded.target_selector_json,
  effect_json = excluded.effect_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO unit_definition_profiles (
  unit_definition_id, ruleset_id, movement_profile_id, durability_profile_id,
  cargo_profile_id, supply_profile_id, deployment_profile_id, profile_json
) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, NULL, 'deployment-infantry-paradrop', '{}'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, NULL, 'deployment-power-armour-orbital', '{"canonicalActivation":"CATALOGUED"}'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, 'supply-medical-current-fs', 'deployment-ground', '{}'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, NULL, 'deployment-ground', '{"canonicalActivation":"CATALOGUED"}'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, NULL, 'deployment-ground', '{"canonicalActivation":"CATALOGUED"}'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'movement-infantry-ground', 'durability-personnel-fs', NULL, 'supply-engineer-current-fs', 'deployment-ground', '{}'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'movement-ground-standard', 'durability-personnel-fs', NULL, 'supply-artillery-small-two', 'deployment-ground', '{}'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'movement-ground-standard', 'durability-vehicle-hits', 'cargo-logi-two-slot', NULL, 'deployment-ground', '{}'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'movement-ground-standard', 'durability-vehicle-hits-subsystems', 'cargo-light-vehicle', NULL, 'deployment-light-vehicle-paradrop', '{}'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'movement-ground-standard', 'durability-vehicle-hits-subsystems', 'cargo-ifv-infantry', NULL, 'deployment-ground', '{}'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'movement-tracked-ground', 'durability-vehicle-hits-subsystems', NULL, NULL, 'deployment-ground', '{}'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'movement-mech', 'durability-vehicle-hits-subsystems', NULL, NULL, 'deployment-ground', '{}'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'movement-aerospace', 'durability-vehicle-hits', NULL, 'supply-aerospace-main-ammo', 'deployment-aerospace-fixed-wing', '{}'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'movement-aerospace', 'durability-vehicle-hits', NULL, 'supply-aerospace-main-ammo', 'deployment-aerospace-fixed-wing', '{}'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'movement-vtol', 'durability-vehicle-hits', 'cargo-vtol-alternative', NULL, 'deployment-vtol', '{}'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'movement-aerospace', 'durability-vehicle-hits', 'cargo-hat-five-slot', NULL, 'deployment-hat', '{}')
ON CONFLICT(unit_definition_id, ruleset_id) DO UPDATE SET
  movement_profile_id = excluded.movement_profile_id,
  durability_profile_id = excluded.durability_profile_id,
  cargo_profile_id = excluded.cargo_profile_id,
  supply_profile_id = excluded.supply_profile_id,
  deployment_profile_id = excluded.deployment_profile_id,
  profile_json = excluded.profile_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'weapon-infantry-rifle', 'PRIMARY', 0, '{}'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'weapon-infantry-rifle', 'PRIMARY', 0, '{"canonicalActivation":"CATALOGUED"}'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'weapon-infantry-rifle', 'PRIMARY', 0, '{"outputFormula":"ONE_QUARTER_ROUND_UP","canonicalActivation":"CATALOGUED"}'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'weapon-infantry-rifle', 'PRIMARY', 0, '{"canonicalActivation":"CATALOGUED"}'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'weapon-light-hmg', 'PRIMARY', 0, '{}'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'weapon-ifv-snub-autocannon', 'PRIMARY', 0, '{}'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'weapon-mbt-cannon', 'PRIMARY', 0, '{}'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'weapon-artillery-barrage', 'PRIMARY', 0, '{"groundDamageMode":"EXPERIMENTAL","canonicalActions":["BOMBARDMENT","FUNNEL"]}'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'weapon-light-mech-laser', 'PRIMARY', 0, '{}'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'weapon-fighter-snub-hmg', 'PRIMARY', 0, '{}'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'weapon-bomber-ordnance', 'PRIMARY', 0, '{}'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'weapon-vtol-nose-gun', 'PRIMARY', 0, '{}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id = excluded.weapon_definition_id,
  state_json = excluded.state_json;

INSERT INTO unit_definition_tags (unit_definition_id, ruleset_id, tag_id) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'tag-armoured'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'tag-orbital'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'tag-medical'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'tag-infantry-stealth'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'tag-infantry'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'tag-engineer'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'tag-artillery'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'tag-indirect-fire'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'tag-light'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'tag-transport'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'tag-logistics'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-light'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-subsystems'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-rapid-fire'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-transport'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'tag-evasive-capable'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'tag-heavy'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'tag-armoured'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'tag-subsystems'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'tag-transport'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'tag-heavy'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'tag-armoured'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'tag-subsystems'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'tag-armoured'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'tag-mech'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'tag-subsystems'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'tag-evasive-capable'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-aerospace'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-atmo-flight'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-aerospace-interceptor'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-rapid-fire'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'tag-evasive-capable'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'tag-aerospace'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'tag-bomber'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'tag-atmo-flight'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'tag-aerospace'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'tag-vtol'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'tag-armoured'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'tag-transport'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'tag-vehicle'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'tag-aerospace'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'tag-atmo-flight'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'tag-transport'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'tag-logistics')
ON CONFLICT(unit_definition_id, ruleset_id, tag_id) DO NOTHING;

INSERT INTO unit_definition_abilities (
  unit_definition_id, ruleset_id, ability_id, source_kind
) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'ability-dig-in', 'BASE'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'ability-dig-in', 'BASE'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'ability-dig-in', 'BASE'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'ability-heal-infantry', 'BASE'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'ability-deploy-mash', 'BASE'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'ability-infantry-stealth', 'BASE'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'ability-sabotage', 'BASE'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'ability-dig-in', 'BASE'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'ability-construct', 'BASE'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'ability-repair-vehicle', 'BASE'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'ability-build-road', 'BASE'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'ability-deploy-platform', 'BASE'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'ability-indirect-fire', 'BASE'),
  ('unit-artillery', 'ruleset-v5-core-curated-1', 'ability-funnel', 'BASE'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'ability-transport-cargo', 'BASE'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'ability-tow-artillery', 'BASE'),
  ('unit-logi-truck', 'ruleset-v5-core-curated-1', 'ability-transfer-supply', 'BASE'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'ability-transport-cargo', 'BASE'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'ability-evasive', 'BASE'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'ability-airdrop', 'BASE'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'ability-transport-cargo', 'BASE'),
  ('unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'ability-crew-repair', 'BASE'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'ability-crew-repair', 'BASE'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'ability-evasive', 'BASE'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'ability-pass-hostile-ground', 'BASE'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'ability-flight-path', 'BASE'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'ability-evasive', 'BASE'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'ability-aerospace-intercept', 'BASE'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'ability-land', 'BASE'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'ability-rearm-aerospace', 'BASE'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'ability-flight-path', 'BASE'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'ability-bomb-run', 'BASE'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'ability-land', 'BASE'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'ability-rearm-aerospace', 'BASE'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'ability-flight-path', 'BASE'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'ability-transport-cargo', 'BASE'),
  ('unit-vtol', 'ruleset-v5-core-curated-1', 'ability-land', 'BASE'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'ability-flight-path', 'BASE'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'ability-transport-cargo', 'BASE'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'ability-airdrop', 'BASE'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'ability-land', 'BASE')
ON CONFLICT(unit_definition_id, ruleset_id, ability_id, source_kind) DO NOTHING;

INSERT INTO unit_equipment_slot_definitions (
  unit_definition_id, ruleset_id, slot_type, slot_count, eligibility_json, source_path, source_locator
) VALUES
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'PRIMARY', 4, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-001"]}', 'rules/Classes.html', 'Infantry Unit'),
  ('unit-infantry-squad', 'ruleset-v5-core-curated-1', 'SECONDARY', 4, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-001"]}', 'rules/Classes.html', 'Infantry Unit'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'PRIMARY', 2, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Power Armored Infantry'),
  ('unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'MECH_WEAPON', 1, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Power Armored Infantry'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'MEDICAL', 2, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-002"]}', 'rules/Classes.html', 'Combat Medical Unit'),
  ('unit-combat-medic', 'ruleset-v5-core-curated-1', 'SECONDARY', 2, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-002"]}', 'rules/Classes.html', 'Combat Medical Unit'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'HIGH_RISK_ARMS', 2, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Irregular Unit'),
  ('unit-irregular', 'ruleset-v5-core-curated-1', 'LOW_TECH_MELEE', 1, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Irregular Unit'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'PRIMARY', 2, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Special Forces'),
  ('unit-special-forces', 'ruleset-v5-core-curated-1', 'SECONDARY', 2, '{"canonicalActivation":"CATALOGUED"}', 'rules/Classes.html', 'Special Forces'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'SECONDARY', 2, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-003"]}', 'rules/Classes.html', 'Combat Engineers'),
  ('unit-engineers', 'ruleset-v5-core-curated-1', 'ENGINEER', 3, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-003"]}', 'rules/Classes.html', 'Combat Engineers'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'SECONDARY', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-006"]}', 'rules/Classes.html', 'Light Vehicle'),
  ('unit-light-vehicle', 'ruleset-v5-core-curated-1', 'INTERNAL', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-006"]}', 'rules/Classes.html', 'Light Vehicle'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'SECONDARY', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-008"]}', 'rules/Classes.html', 'Main Battle Tank'),
  ('unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'INTERNAL', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-008"]}', 'rules/Classes.html', 'Main Battle Tank'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'EXTERNAL', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-009"]}', 'rules/Classes.html', 'Mech / Light'),
  ('unit-light-mech', 'ruleset-v5-core-curated-1', 'INTERNAL', 4, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-009"]}', 'rules/Classes.html', 'Mech / Light'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'DISPOSABLE', 2, '{"canonicalActivation":"CANONICAL_ACTIVE"}', 'rules/Meta - Core Rules (V5).md', 'Aerospace Fighter'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'LIGHT', 2, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-010"]}', 'rules/Classes.html', 'Fighter'),
  ('unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'INTERNAL', 2, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-010"]}', 'rules/Classes.html', 'Fighter'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'BOMB_BAY', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-011"]}', 'rules/Classes.html', 'Bomber'),
  ('unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'INTERNAL', 1, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-011"]}', 'rules/Classes.html', 'Bomber'),
  ('unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'INTERNAL', 3, '{"canonicalActivation":"CATALOGUED","conflictIds":["RC-UNIT-013"]}', 'rules/Classes.html', 'Heavy Aerospace Transport')
ON CONFLICT(unit_definition_id, ruleset_id, slot_type) DO UPDATE SET
  slot_count = excluded.slot_count,
  eligibility_json = excluded.eligibility_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator;

INSERT INTO equipment_eligibility_rules (
  equipment_definition_id, ruleset_id, required_tags_all_json, required_tags_any_json,
  forbidden_tags_json, allowed_unit_definitions_json, slot_types_json,
  maximum_equipped, rule_json, source_path, source_locator
) VALUES
  ('equipment-flak-vests', 'ruleset-v5-core-curated-1', '["tag-infantry"]', '[]', '[]', '[]', '["UPGRADE","SECONDARY"]', NULL, '{"canonicalSlot":"UPGRADE","legacyNormalizedSlot":"SECONDARY","conflictIds":["RC-EQP-001"]}', 'rules/The Store - Equipment List.html', 'Flack Vests / row 4'),
  ('equipment-light-at', 'ruleset-v5-core-curated-1', '["tag-infantry"]', '[]', '[]', '["unit-infantry-squad","unit-power-armoured-infantry","unit-irregular","unit-special-forces"]', '["PRIMARY"]', NULL, '{"ammoCapacity":3}', 'rules/The Store - Equipment List.html', 'Lightweight Anti-armor Weapon / row 10'),
  ('equipment-vehicle-optics', 'ruleset-v5-core-curated-1', '["tag-vehicle"]', '[]', '[]', '[]', '["INTERNAL"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Optics / row 43'),
  ('equipment-silent-smgs', 'ruleset-v5-core-curated-1', '["tag-infantry-stealth"]', '[]', '[]', '["unit-special-forces"]', '["PRIMARY"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Silent SMGs / row 21'),
  ('equipment-k9-scouts', 'ruleset-v5-core-curated-1', '["tag-infantry"]', '[]', '[]', '[]', '["PRIMARY"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'K-9 Scouts / row 22'),
  ('equipment-smoke-launcher', 'ruleset-v5-core-curated-1', '["tag-vehicle"]', '[]', '[]', '[]', '["SECONDARY"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Smoke Launcher / row 49'),
  ('equipment-ap-ammo', 'ruleset-v5-core-curated-1', '["tag-vehicle"]', '[]', '[]', '[]', '["AMMO"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'AP Ammo / row 50'),
  ('equipment-mech-light-laser', 'ruleset-v5-core-curated-1', '["tag-mech"]', '[]', '[]', '[]', '["EXTERNAL"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Light Laser Setup / row 63'),
  ('equipment-aerospace-sidewinder', 'ruleset-v5-core-curated-1', '["tag-aerospace"]', '[]', '[]', '[]', '["LIGHT","DISPOSABLE"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Sidewinder AA Missile / row 79'),
  ('equipment-aerospace-afterburner', 'ruleset-v5-core-curated-1', '["tag-aerospace"]', '[]', '[]', '[]', '["INTERNAL"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Afterburner / row 82'),
  ('equipment-cluster-bombs', 'ruleset-v5-core-curated-1', '["tag-aerospace"]', '[]', '[]', '["unit-aerospace-bomber"]', '["BOMB_BAY"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Cluster Bombs / row 85'),
  ('equipment-simple-med-stimpacks', 'ruleset-v5-core-curated-1', '["tag-medical"]', '[]', '[]', '["unit-combat-medic"]', '["MEDICAL"]', NULL, '{}', 'rules/The Store - Equipment List.html', 'Simple Med-Stimpacks / row 41'),
  ('equipment-road-building', 'ruleset-v5-core-curated-1', '["tag-engineer"]', '[]', '[]', '["unit-engineers"]', '["ENGINEER"]', NULL, '{"requisitionStatus":"BALANCE_REQUIRED"}', 'rules/The Store - Equipment List.html', 'Road Building Equipment / row 29')
ON CONFLICT(equipment_definition_id, ruleset_id) DO UPDATE SET
  required_tags_all_json = excluded.required_tags_all_json,
  required_tags_any_json = excluded.required_tags_any_json,
  forbidden_tags_json = excluded.forbidden_tags_json,
  allowed_unit_definitions_json = excluded.allowed_unit_definitions_json,
  slot_types_json = excluded.slot_types_json,
  maximum_equipped = excluded.maximum_equipped,
  rule_json = excluded.rule_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator;

INSERT INTO ship_capability_definitions (
  id, ruleset_id, name, value_kind, source_path, source_locator, definition_json
) VALUES
  ('capability-carry-infantry', 'ruleset-v5-core-curated-1', 'Carry Infantry', 'CAPACITY', 'rules/The Store - Equipment List.html', 'Mobile Infantry Upgrade', '{"unitTagsAll":["INFANTRY"],"priority":40,"unit":"UNITS"}'),
  ('capability-carry-light-vehicle', 'ruleset-v5-core-curated-1', 'Carry Light Vehicle', 'CAPACITY', 'rules/The Store - Equipment List.html', 'Mech Bay; Heavy Ground Vehicle Bay', '{"unitTagsAll":["VEHICLE","LIGHT"],"priority":50,"unit":"UNITS"}'),
  ('capability-carry-heavy-vehicle', 'ruleset-v5-core-curated-1', 'Carry Heavy Vehicle', 'CAPACITY', 'rules/The Store - Equipment List.html', 'Mech Bay; Heavy Ground Vehicle Bay', '{"unitTagsAll":["VEHICLE","HEAVY"],"priority":50,"unit":"UNITS"}'),
  ('capability-carry-mech', 'ruleset-v5-core-curated-1', 'Carry Mech', 'CAPACITY', 'rules/The Store - Equipment List.html', 'Mech Bay', '{"unitTagsAll":["MECH"],"priority":100,"unit":"UNITS"}'),
  ('capability-carry-vtol', 'ruleset-v5-core-curated-1', 'Carry VTOL', 'CAPACITY', 'rules/The Store - Equipment List.html', 'VTOL Bay; Carrier Flight Deck', '{"unitTagsAll":["VTOL"],"priority":100,"unit":"UNITS"}'),
  ('capability-carry-aerospace', 'ruleset-v5-core-curated-1', 'Carry Aerospace', 'CAPACITY', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck; Aerospace Storage Hangar', '{"unitTagsAll":["AEROSPACE"],"unitTagsNone":["VTOL"],"priority":80,"unit":"UNITS"}'),
  ('capability-land-vtol', 'ruleset-v5-core-curated-1', 'Land VTOL', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'VTOL Bay; Carrier Flight Deck', '{}'),
  ('capability-land-aerospace', 'ruleset-v5-core-curated-1', 'Land Aerospace', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck', '{}'),
  ('capability-repair-infantry', 'ruleset-v5-core-curated-1', 'Repair Infantry', 'RATE', 'phase2-forces.md', 'Ship capability model', '{"unit":"FS_PER_ROUND","authoritativeRate":null}'),
  ('capability-repair-vehicle', 'ruleset-v5-core-curated-1', 'Repair Vehicle', 'RATE', 'rules/The Store - Equipment List.html', 'Mech Bay; Heavy Ground Vehicle Bay', '{"unit":"HITS_PER_ROUND"}'),
  ('capability-repair-mech', 'ruleset-v5-core-curated-1', 'Repair Mech', 'RATE', 'rules/The Store - Equipment List.html', 'Mech Bay', '{"unit":"HITS_PER_ROUND"}'),
  ('capability-repair-aerospace', 'ruleset-v5-core-curated-1', 'Repair Aerospace', 'RATE', 'rules/The Store - Equipment List.html', 'VTOL Bay; Carrier Flight Deck', '{"unit":"HITS_PER_ROUND"}'),
  ('capability-rearm-infantry', 'ruleset-v5-core-curated-1', 'Rearm Infantry', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'Armory', '{}'),
  ('capability-rearm-aerospace', 'ruleset-v5-core-curated-1', 'Rearm Aerospace', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck; Aerospace Storage Hangar', '{}'),
  ('capability-change-infantry-loadout', 'ruleset-v5-core-curated-1', 'Change Infantry Loadout', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'Armory', '{}'),
  ('capability-refit-mech', 'ruleset-v5-core-curated-1', 'Refit Mech', 'BOOLEAN', 'rules/The Store - Equipment List.html', 'Mech Bay', '{}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name,
  value_kind = excluded.value_kind,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  definition_json = excluded.definition_json;

INSERT INTO ship_module_capability_grants (
  equipment_definition_id, ruleset_id, capability_id, capacity_delta,
  grant_json, source_path, source_locator
) VALUES
  ('equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'capability-carry-vtol', 2, '{"alternativeHeavyLiftCapacity":1}', 'rules/The Store - Equipment List.html', 'VTOL Bay / row 97'),
  ('equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'capability-land-vtol', 1, '{}', 'rules/The Store - Equipment List.html', 'VTOL Bay / row 97'),
  ('equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'capability-repair-aerospace', 2, '{"targetTagsAny":["VTOL"]}', 'rules/The Store - Equipment List.html', 'VTOL Bay / row 97'),
  ('equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'capability-rearm-aerospace', 1, '{"targetTagsAny":["VTOL"]}', 'rules/The Store - Equipment List.html', 'VTOL Bay / row 97'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'capability-carry-aerospace', 2, '{}', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck / row 98'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'capability-land-vtol', 1, '{"landingsPerRound":1}', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck / row 98'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'capability-land-aerospace', 1, '{"landingsPerRound":1}', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck / row 98'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'capability-repair-aerospace', 2, '{}', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck / row 98'),
  ('equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'capability-rearm-aerospace', 1, '{}', 'rules/The Store - Equipment List.html', 'Carrier Flight Deck / row 98'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'capability-carry-mech', 2, '{}', 'rules/The Store - Equipment List.html', 'Mech Bay / row 99'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'capability-carry-heavy-vehicle', 2, '{"maximumClass":"HEAVY"}', 'rules/The Store - Equipment List.html', 'Mech Bay / row 99'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'capability-repair-mech', 1, '{}', 'rules/The Store - Equipment List.html', 'Mech Bay / row 99'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'capability-repair-vehicle', 1, '{"maximumClass":"HEAVY"}', 'rules/The Store - Equipment List.html', 'Mech Bay / row 99'),
  ('equipment-mech-bay', 'ruleset-v5-core-curated-1', 'capability-refit-mech', 1, '{}', 'rules/The Store - Equipment List.html', 'Mech Bay / row 99'),
  ('equipment-mobile-infantry', 'ruleset-v5-core-curated-1', 'capability-carry-infantry', 2, '{}', 'rules/The Store - Equipment List.html', 'Mobile Infantry Upgrade / row 103'),
  ('equipment-armory', 'ruleset-v5-core-curated-1', 'capability-rearm-infantry', 1, '{}', 'rules/The Store - Equipment List.html', 'Armory / row 104'),
  ('equipment-armory', 'ruleset-v5-core-curated-1', 'capability-change-infantry-loadout', 1, '{}', 'rules/The Store - Equipment List.html', 'Armory / row 104'),
  ('equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'capability-carry-light-vehicle', 2, '{}', 'rules/The Store - Equipment List.html', 'Heavy Ground Vehicle Bay / row 107'),
  ('equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'capability-carry-heavy-vehicle', 2, '{"alternativeSuperHeavyCapacity":1}', 'rules/The Store - Equipment List.html', 'Heavy Ground Vehicle Bay / row 107'),
  ('equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'capability-repair-vehicle', 1, '{"excludesTags":["MECH"]}', 'rules/The Store - Equipment List.html', 'Heavy Ground Vehicle Bay / row 107'),
  ('equipment-aerospace-storage', 'ruleset-v5-core-curated-1', 'capability-carry-aerospace', 1, '{"doesNotGrantLanding":true}', 'rules/The Store - Equipment List.html', 'Aerospace Storage Hangar / row 111'),
  ('equipment-aerospace-storage', 'ruleset-v5-core-curated-1', 'capability-rearm-aerospace', 1, '{"requiresSeparateLandingCapability":true}', 'rules/The Store - Equipment List.html', 'Aerospace Storage Hangar / row 111')
ON CONFLICT(equipment_definition_id, ruleset_id, capability_id) DO UPDATE SET
  capacity_delta = excluded.capacity_delta,
  grant_json = excluded.grant_json,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator;

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable,
  reason_code, source_path, source_locator, overlay_json
) VALUES
  ('UNIT', 'unit-infantry-squad', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 1, 0, 'MISSING_CANONICAL_PRICE', 'phase2-forces.md', 'Persistent force catalogue', '{"implementedSubset":["FS","ATTACK","MOVEMENT","FACING"],"missing":["DIG_IN","GARRISON","ACTIVE_EQUIPMENT"]}'),
  ('UNIT', 'unit-power-armoured-infantry', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'RC_UNIT_015', 'phase2-forces.md', 'Persistent force catalogue', '{"conflictIds":["RC-UNIT-015"]}'),
  ('UNIT', 'unit-combat-medic', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["FIRST_AID","MEDICAL_SUPPLY"]}'),
  ('UNIT', 'unit-irregular', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'RC_UNIT_015', 'phase2-forces.md', 'Persistent force catalogue', '{"conflictIds":["RC-UNIT-015"]}'),
  ('UNIT', 'unit-special-forces', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'RC_UNIT_015', 'phase2-forces.md', 'Persistent force catalogue', '{"conflictIds":["RC-UNIT-015"]}'),
  ('UNIT', 'unit-engineers', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 1, 0, 'MISSING_CANONICAL_PRICE', 'phase2-forces.md', 'Persistent force catalogue', '{"implementedSubset":["FS","MOVEMENT"],"missing":["CONSTRUCTION_PROJECTS","REPAIR_ACTION"]}'),
  ('UNIT', 'unit-artillery', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 1, 0, 'MISSING_CANONICAL_PRICE', 'phase2-forces.md', 'Persistent force catalogue', '{"implementedSubset":["INDIRECT_ATTACK_VALIDATION"],"missing":["PACKED_DEPLOYED","CONTROL_ACTIONS"]}'),
  ('UNIT', 'unit-logi-truck', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["CARGO","TOWING","SUPPLY_TRANSFER"]}'),
  ('UNIT', 'unit-light-vehicle', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 1, 0, 'MISSING_CANONICAL_PRICE', 'phase2-forces.md', 'Persistent force catalogue', '{"implementedSubset":["HITS","ATTACK","MOVEMENT"],"missing":["EVASIVE","CARGO","SUBSYSTEMS"]}'),
  ('UNIT', 'unit-infantry-fighting-vehicle', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["HITS","ARMOUR","AP","CARGO","SUBSYSTEMS"]}'),
  ('UNIT', 'unit-main-battle-tank', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 1, 0, 'MISSING_CANONICAL_PRICE', 'phase2-forces.md', 'Persistent force catalogue', '{"implementedSubset":["HITS","ARMOUR","AP","FACING","REAR_ATTACK"],"missing":["SUBSYSTEMS","CREW_REPAIR"]}'),
  ('UNIT', 'unit-light-mech', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["MECH_MOVEMENT","EVASIVE","SUBSYSTEMS"]}'),
  ('UNIT', 'unit-aerospace-fighter', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["FLIGHT_PATH","FORWARD_ARC","AMMUNITION","LAND_REARM"]}'),
  ('UNIT', 'unit-aerospace-bomber', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["FLIGHT_PATH","FLY_OVER_ATTACK","AMMUNITION","LAND_REARM"]}'),
  ('UNIT', 'unit-vtol', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["VTOL_FLIGHT","LANDING","CARGO"]}'),
  ('UNIT', 'unit-heavy-air-transport', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_RESOLVER_HOOK', 'phase2-forces.md', 'Persistent force catalogue', '{"minimumMechanics":["FLIGHT_PATH","CARGO","AIRDROP"]}'),
  ('ENEMY', 'enemy-bug-spitter', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'HIDDEN', 0, 0, 'BALANCE_REQUIRED', 'phase2-forces.md', 'Varied Bug roster', '{}'),
  ('ENEMY', 'enemy-bug-burrower', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'HIDDEN', 0, 0, 'BALANCE_REQUIRED', 'phase2-forces.md', 'Varied Bug roster', '{}'),
  ('ENEMY', 'enemy-bug-flyer', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'HIDDEN', 0, 0, 'BALANCE_REQUIRED', 'phase2-forces.md', 'Varied Bug roster', '{}'),
  ('ENEMY', 'enemy-bug-artillery', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'HIDDEN', 0, 0, 'BALANCE_REQUIRED', 'phase2-forces.md', 'Varied Bug roster', '{}')
ON CONFLICT(definition_kind, definition_id, ruleset_id) DO UPDATE SET
  implementation_status = excluded.implementation_status,
  requisition_status = excluded.requisition_status,
  availability_status = excluded.availability_status,
  executable = excluded.executable,
  purchasable = excluded.purchasable,
  reason_code = excluded.reason_code,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  overlay_json = excluded.overlay_json;

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable,
  reason_code, source_path, source_locator, overlay_json
) VALUES
  ('EQUIPMENT', 'equipment-flak-vests', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_LOADOUT_EFFECT_APPLICATION', 'rules/The Store - Equipment List.html', 'row 4', '{"conflictIds":["RC-EQP-001"]}'),
  ('EQUIPMENT', 'equipment-light-at', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_DISPOSABLE_WEAPON_HOOK', 'rules/The Store - Equipment List.html', 'row 10', '{}'),
  ('EQUIPMENT', 'equipment-vehicle-optics', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_SCAN_ACTION_HOOK', 'rules/The Store - Equipment List.html', 'row 43', '{}'),
  ('EQUIPMENT', 'equipment-silent-smgs', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_FIXED_DAMAGE_HOOK', 'rules/The Store - Equipment List.html', 'row 21', '{}'),
  ('EQUIPMENT', 'equipment-k9-scouts', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_SCOUT_PROJECTION', 'rules/The Store - Equipment List.html', 'row 22', '{}'),
  ('EQUIPMENT', 'equipment-smoke-launcher', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_SMOKE_HAZARD_HOOK', 'rules/The Store - Equipment List.html', 'row 49', '{}'),
  ('EQUIPMENT', 'equipment-ap-ammo', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_AMMO_SELECTION_HOOK', 'rules/The Store - Equipment List.html', 'row 50', '{}'),
  ('EQUIPMENT', 'equipment-mech-light-laser', 'ruleset-v5-core-curated-1', 'CATALOGUE_ONLY', 'PUBLISHED', 'HIDDEN', 0, 0, 'RC_EQP_002', 'rules/The Store - Equipment List.html', 'row 63', '{"conflictIds":["RC-EQP-002"]}'),
  ('EQUIPMENT', 'equipment-aerospace-sidewinder', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_FIXED_DAMAGE_HOOK', 'rules/The Store - Equipment List.html', 'row 79', '{}'),
  ('EQUIPMENT', 'equipment-aerospace-afterburner', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_TEMP_SPEED_HOOK', 'rules/The Store - Equipment List.html', 'row 82', '{}'),
  ('EQUIPMENT', 'equipment-cluster-bombs', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_AREA_DAMAGE_HOOK', 'rules/The Store - Equipment List.html', 'row 85', '{}'),
  ('EQUIPMENT', 'equipment-simple-med-stimpacks', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'MISSING_CONSUMABLE_ACTION_HOOK', 'rules/The Store - Equipment List.html', 'row 41', '{}'),
  ('EQUIPMENT', 'equipment-road-building', 'ruleset-v5-core-curated-1', 'PARTIAL', 'BALANCE_REQUIRED', 'DEV_ONLY', 0, 0, 'MISSING_CANONICAL_PRICE', 'rules/The Store - Equipment List.html', 'row 29', '{}'),
  ('SHIP_MODULE', 'equipment-vtol-bay', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 97', '{}'),
  ('SHIP_MODULE', 'equipment-carrier-flight-deck', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 98', '{}'),
  ('SHIP_MODULE', 'equipment-mech-bay', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 99', '{}'),
  ('SHIP_MODULE', 'equipment-mobile-infantry', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 103', '{}'),
  ('SHIP_MODULE', 'equipment-armory', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 104', '{}'),
  ('SHIP_MODULE', 'equipment-heavy-ground-vehicle-bay', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 107', '{}'),
  ('SHIP_MODULE', 'equipment-aerospace-storage', 'ruleset-v5-core-curated-1', 'PARTIAL', 'PUBLISHED', 'DEV_ONLY', 0, 0, 'SHIP_READINESS_ONLY', 'rules/The Store - Equipment List.html', 'row 111', '{}')
ON CONFLICT(definition_kind, definition_id, ruleset_id) DO UPDATE SET
  implementation_status = excluded.implementation_status,
  requisition_status = excluded.requisition_status,
  availability_status = excluded.availability_status,
  executable = excluded.executable,
  purchasable = excluded.purchasable,
  reason_code = excluded.reason_code,
  source_path = excluded.source_path,
  source_locator = excluded.source_locator,
  overlay_json = excluded.overlay_json;

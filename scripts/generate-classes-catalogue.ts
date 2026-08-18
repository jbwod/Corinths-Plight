import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  COMPANION_CLASS_POLICIES_V1,
  COMPANION_PUBLIC_V1_PROFILE_ID,
} from "../packages/rules-engine/src/companion-class-profile";

const root = resolve(import.meta.dirname, "..");
const sourcePath = "rules/Classes.html";
const destinationPath = "seeds/v5-classes-catalogue.sql";
const rulesetId = "ruleset-v5-core-curated-1";
const companionPolicyById = new Map<string, (typeof COMPANION_CLASS_POLICIES_V1)[number]>(
  COMPANION_CLASS_POLICIES_V1.map((policy) => [policy.id, policy]),
);

const implementedCompanionIds = new Set([
  "unit-power-armoured-infantry",
  "unit-irregular",
  "unit-special-forces",
  "unit-sappers",
  "unit-light-artillery",
  "unit-heavy-artillery",
  "unit-self-propelled-artillery",
  "unit-vtol-troop-airlift",
  "unit-vtol-multipurpose-airlift",
  "unit-vtol-heavy-lift",
  "unit-mechanized-infantry",
  "unit-light-battle-tank",
  "unit-heavy-battle-tank",
  "unit-super-heavy-tank",
  "unit-medium-mech",
  "unit-heavy-mech",
]);

type CompanionVtolTransportDefinitionId =
  | "unit-vtol-troop-airlift"
  | "unit-vtol-multipurpose-airlift"
  | "unit-vtol-heavy-lift";

const companionVtolIds = new Set<CompanionVtolTransportDefinitionId>([
  "unit-vtol-troop-airlift",
  "unit-vtol-multipurpose-airlift",
  "unit-vtol-heavy-lift",
]);

// Kept JSON-only so the seed generator does not import the runtime resolver
// graph while it is bootstrapping a newly declared catalogue handler.
const companionVtolCargoProfiles = {
  "unit-vtol-troop-airlift": {
    id: "cargo-companion-vtol-troop-airlift-public-v1", capacitySlotsQuarters: 8,
    allowMixedLoadGroups: false, embarkFlatSpeedCostQuarters: 2, disembarkFlatSpeedCostQuarters: 2,
    rules: [
      { id: "troop-airlift-infantry-unit", cargoKind: "PERSONNEL", requiredTags: ["INFANTRY", "PERSONNEL", "COMPANION_VTOL_UNIT_CARGO"], prohibitedTags: ["VEHICLE"], slotsPerItemQuarters: 4, loadGroup: "PERSONNEL" },
      { id: "troop-airlift-one-opaque-supply-cargo", cargoKind: "SUPPLY", requiredTags: ["SUPPLY_CARGO"], slotsPerItemQuarters: 8, loadGroup: "SUPPLY" },
    ],
  },
  "unit-vtol-multipurpose-airlift": {
    id: "cargo-companion-vtol-multipurpose-airlift-public-v1", capacitySlotsQuarters: 8,
    allowMixedLoadGroups: true, embarkFlatSpeedCostQuarters: 2, disembarkFlatSpeedCostQuarters: 2,
    rules: [
      { id: "multipurpose-one-infantry-unit", cargoKind: "PERSONNEL", requiredTags: ["INFANTRY", "PERSONNEL", "COMPANION_VTOL_UNIT_CARGO"], prohibitedTags: ["VEHICLE"], slotsPerItemQuarters: 4, loadGroup: "PERSONNEL_OR_SUPPLY" },
      { id: "multipurpose-one-opaque-supply-cargo", cargoKind: "SUPPLY", requiredTags: ["SUPPLY_CARGO"], slotsPerItemQuarters: 4, loadGroup: "PERSONNEL_OR_SUPPLY" },
      { id: "multipurpose-one-light-vehicle", cargoKind: "VEHICLE", requiredTags: ["VEHICLE", "LIGHT_VEHICLE", "COMPANION_VTOL_UNIT_CARGO"], prohibitedTags: ["MECH", "HEAVY", "SUPER_HEAVY"], slotsPerItemQuarters: 4, loadGroup: "LIGHT_VEHICLE" },
    ],
  },
  "unit-vtol-heavy-lift": {
    id: "cargo-companion-vtol-heavy-lift-public-v1", capacitySlotsQuarters: 4,
    allowMixedLoadGroups: false, embarkFlatSpeedCostQuarters: 2, disembarkFlatSpeedCostQuarters: 2,
    rules: [
      { id: "heavy-lift-one-heavy-unit", cargoKind: "VEHICLE", requiredTags: ["COMPANION_VTOL_UNIT_CARGO", "EXTERNAL_HEAVY_LIFT"], slotsPerItemQuarters: 4, loadGroup: "EXTERNAL_LOAD" },
      { id: "heavy-lift-one-objective-cargo", cargoKind: "OTHER", requiredTags: ["OBJECTIVE_CARGO", "EXTERNAL_HEAVY_LIFT"], slotsPerItemQuarters: 4, loadGroup: "EXTERNAL_LOAD" },
      { id: "heavy-lift-one-opaque-supply-cargo", cargoKind: "SUPPLY", requiredTags: ["SUPPLY_CARGO", "EXTERNAL_HEAVY_LIFT"], slotsPerItemQuarters: 4, loadGroup: "EXTERNAL_LOAD" },
    ],
  },
} as const;

function companionVtolCargoProfile(id: CompanionVtolTransportDefinitionId) {
  return companionVtolCargoProfiles[id];
}

interface SourceRow {
  row: number;
  sourceName: string;
  forceStrength: number;
  armor: number;
  speed: number;
  range: number;
  rulesText: string;
  costText: string;
}

interface ClassSpec {
  row: number;
  id: string;
  name: string;
  category: string;
  movementProfileId: string;
  deploymentProfileId: string;
  tags: string[];
  slots: Record<string, number>;
  abilities?: string[];
  gameplayGaps: string[];
}

const specs: ClassSpec[] = [
  { row: 8, id: "unit-sappers", name: "Sappers", category: "SUPPORT", movementProfileId: "movement-infantry-ground", deploymentProfileId: "deployment-ground", tags: ["tag-infantry", "tag-infantry-stealth", "tag-engineer"], slots: { PRIMARY: 1, SECONDARY: 1 }, abilities: ["ability-infantry-stealth", "ability-construct", "ability-repair-vehicle"], gameplayGaps: ["SAPPER_STRUCTURE_LIST", "MINES", "BUILD_SUPPLY", "STEALTH_CONSTRUCTION"] },
  { row: 10, id: "unit-mechanized-infantry", name: "Mechanized Infantry", category: "ARMOUR", movementProfileId: "movement-ground-standard", deploymentProfileId: "deployment-ground", tags: ["tag-infantry", "tag-vehicle", "tag-armoured", "tag-transport"], slots: { PRIMARY: 1, SECONDARY: 1, INTERNAL: 1 }, gameplayGaps: ["FORWARD_LINE_CONTROL", "MIXED_EQUIPMENT_POLICY", "FS_VEHICLE_DAMAGE_MODEL"] },
  { row: 14, id: "unit-light-battle-tank", name: "Light Battle Tank", category: "ARMOUR", movementProfileId: "movement-tracked-ground", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-light"], slots: { SECONDARY: 1, INTERNAL: 1 }, gameplayGaps: ["FS_VEHICLE_DAMAGE_MODEL", "WEAPON_DAMAGE_PROFILE", "HAT_TANK_AIRDROP"] },
  { row: 16, id: "unit-heavy-battle-tank", name: "Heavy Battle Tank", category: "ARMOUR", movementProfileId: "movement-tracked-ground", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-heavy"], slots: { SECONDARY: 1, INTERNAL: 1 }, gameplayGaps: ["FS_VEHICLE_DAMAGE_MODEL", "WEAPON_DAMAGE_PROFILE", "HEAVY_TRANSPORT_POLICY"] },
  { row: 17, id: "unit-super-heavy-tank", name: "Super Heavy Tank", category: "ARMOUR", movementProfileId: "movement-tracked-ground", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-heavy", "tag-ponderous"], slots: { SECONDARY: 2, INTERNAL: 2 }, gameplayGaps: ["FS_VEHICLE_DAMAGE_MODEL", "DUAL_CANNON_ATTACK", "WEAPON_DAMAGE_PROFILE", "SPECIAL_TRANSPORT_POLICY"] },
  { row: 19, id: "unit-light-artillery", name: "Light Artillery", category: "SUPPORT", movementProfileId: "movement-ground-standard", deploymentProfileId: "deployment-ground", tags: ["tag-artillery", "tag-indirect-fire"], slots: { SECONDARY: 1, INTERNAL: 2 }, abilities: ["ability-deploy-platform", "ability-indirect-fire"], gameplayGaps: ["FIXED_DAMAGE", "TWO_ATTACK_SPLIT_FIRE", "AREA_HEX_DAMAGE", "ABANDON_GUNS", "CAMPAIGN_REPLACEMENT"] },
  { row: 20, id: "unit-heavy-artillery", name: "Heavy Artillery", category: "SUPPORT", movementProfileId: "movement-ground-standard", deploymentProfileId: "deployment-ground", tags: ["tag-artillery", "tag-indirect-fire", "tag-ponderous"], slots: { SECONDARY: 1, INTERNAL: 2 }, abilities: ["ability-deploy-platform", "ability-indirect-fire"], gameplayGaps: ["FIXED_DAMAGE", "THREE_ATTACK_SPLIT_FIRE", "AREA_HEX_DAMAGE", "ABANDON_GUNS", "CAMPAIGN_REPLACEMENT"] },
  { row: 21, id: "unit-self-propelled-artillery", name: "Self-Propelled Artillery", category: "SUPPORT", movementProfileId: "movement-tracked-ground", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-artillery", "tag-indirect-fire"], slots: { SECONDARY: 1, INTERNAL: 2 }, abilities: ["ability-indirect-fire"], gameplayGaps: ["FS_VEHICLE_DAMAGE_MODEL", "FIXED_DAMAGE", "MINIMUM_RANGE", "FINITE_AP_ROUNDS", "AREA_HEX_DAMAGE"] },
  { row: 24, id: "unit-vtol-troop-airlift", name: "VTOL Heavy Troop Airlift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-armoured", "tag-aerospace", "tag-vtol", "tag-transport"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "TROOP_OR_SUPPLY_CAPACITY", "RAPPELLING_GARRISON", "FS_BASED_REARM"] },
  { row: 25, id: "unit-vtol-multipurpose-airlift", name: "VTOL Multi-Purpose Airlift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-armoured", "tag-aerospace", "tag-vtol", "tag-transport"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "SIMULTANEOUS_PERSONNEL_AND_VEHICLE_CARGO", "FS_BASED_REARM"] },
  { row: 26, id: "unit-vtol-heavy-lift", name: "VTOL Heavy Lift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-armoured", "tag-aerospace", "tag-vtol", "tag-transport", "tag-heavy", "tag-logistics"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "EXTERNAL_HEAVY_LIFT", "OBJECTIVE_CARGO", "HEAVY_TRANSPORT_CAPACITY"] },
  { row: 31, id: "unit-medium-mech", name: "Medium Mech", category: "MECH", movementProfileId: "movement-mech", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-mech"], slots: { EXTERNAL: 2, INTERNAL: 4 }, gameplayGaps: ["FS_MECH_DAMAGE_MODEL", "MULTIWEAPON_REFIT", "LEG_HEIGHT_LOS", "CROUCH_COVER", "DOTTED_REQUISITION_COST"] },
  { row: 32, id: "unit-heavy-mech", name: "Heavy Mech", category: "MECH", movementProfileId: "movement-mech", deploymentProfileId: "deployment-ground", tags: ["tag-vehicle", "tag-armoured", "tag-mech", "tag-heavy", "tag-ponderous"], slots: { EXTERNAL: 3, INTERNAL: 4 }, gameplayGaps: ["FS_MECH_DAMAGE_MODEL", "MULTIWEAPON_REFIT", "LEG_HEIGHT_LOS", "DOTTED_REQUISITION_COST"] },
];

function decodeHtml(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function sql(value: string): string { return `'${value.replaceAll("'", "''")}'`; }
function json(value: unknown): string { return sql(JSON.stringify(value)); }

function parseRows(html: string): Map<number, SourceRow> {
  const rows = new Map<number, SourceRow>();
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => decodeHtml(cell[1]));
    const row = Number(cells[0]);
    if (!specs.some((spec) => spec.row === row)) continue;
    const values = [cells[2], cells[3], cells[4]].map(Number);
    const range = Number(cells[5]);
    if (values.some((value) => !Number.isFinite(value)) || !Number.isFinite(range)) throw new Error(`Class row ${row} has malformed numeric statistics.`);
    rows.set(row, { row, sourceName: cells[1], forceStrength: values[0], armor: values[1], speed: values[2], range, rulesText: cells[6] ?? "", costText: cells[7] ?? "" });
  }
  if (rows.size !== specs.length) throw new Error(`Expected ${specs.length} new class rows; parsed ${rows.size}.`);
  return rows;
}

function render(rows: Map<number, SourceRow>): string {
  const definitions = specs.map((spec) => {
    const row = rows.get(spec.row)!;
    const policy = companionPolicyById.get(spec.id);
    if (!policy) throw new Error(`Missing ${COMPANION_PUBLIC_V1_PROFILE_ID} conversion for ${spec.id}.`);
    const sourceRecord = {
      sourceRow: row.row,
      description: row.sourceName,
      raw: { forceStrength: row.forceStrength, armor: row.armor, speed: row.speed, range: row.range, cost: row.costText || null },
      specialRules: row.rulesText,
      equipmentSlots: spec.slots,
      gameplayGaps: spec.gameplayGaps,
      canonicalActivation: "CATALOGUED",
      conflictIds: ["RC-UNIT-015", "RC-V5-014"],
      applicationPolicy: policy,
    };
    return `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(spec.name)}, ${sql(spec.category)}, ${sql(policy.healthModel)}, ${policy.maximumHealth}, ${policy.armor}, 0, ${policy.speed * 4}, 0, ${policy.requisitionCost}, 'experimental', ${sql(`Classes.html row ${row.row} / ${spec.name}; ${COMPANION_PUBLIC_V1_PROFILE_ID}`)}, 'Source values are preserved in definition_json; executable durability, attack and Req values come from the named companion application profile.', ${json(sourceRecord)})`;
  });
  const profiles = specs.map((spec) => {
    const policy = companionPolicyById.get(spec.id)!;
    const supplyProfileId = spec.id === "unit-sappers" ? "supply-sapper-public-v1" : null;
    const cargoProfileId = companionVtolIds.has(spec.id as CompanionVtolTransportDefinitionId)
      ? companionVtolCargoProfile(spec.id as CompanionVtolTransportDefinitionId).id
      : null;
    return `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(spec.movementProfileId)}, ${sql(policy.healthModel === "HITS" ? "durability-vehicle-hits" : "durability-personnel-fs")}, ${cargoProfileId ? sql(cargoProfileId) : "NULL"}, ${supplyProfileId ? sql(supplyProfileId) : "NULL"}, ${sql(spec.deploymentProfileId)}, ${json({ canonicalActivation: implementedCompanionIds.has(spec.id) ? "EXECUTABLE" : "CATALOGUED", applicationProfileId: COMPANION_PUBLIC_V1_PROFILE_ID, conflictIds: ["RC-UNIT-015"] })})`;
  });
  const tags = specs.flatMap((spec) => spec.tags.map((tag) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(tag)})`));
  const abilities = specs.flatMap((spec) => (spec.abilities ?? []).map((ability) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(ability)}, 'BASE')`));
  const slots = specs.flatMap((spec) => Object.entries(spec.slots).map(([slot, count]) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(slot)}, ${count}, ${json({ canonicalActivation: "CATALOGUED", conflictIds: ["RC-UNIT-015"] })}, ${sql(sourcePath)}, ${sql(`${spec.name} / row ${spec.row}`)})`));
  const overlays = specs.map((spec) => {
    const implemented = implementedCompanionIds.has(spec.id);
    return `  ('UNIT', ${sql(spec.id)}, ${sql(rulesetId)}, ${sql(implemented ? "IMPLEMENTED" : "CATALOGUE_ONLY")}, 'PUBLISHED', ${sql(implemented ? "AVAILABLE" : "BLOCKED")}, ${implemented ? 1 : 0}, ${implemented ? 1 : 0}, ${implemented ? "NULL" : "'COMPANION_HANDLER_PENDING'"}, ${sql(sourcePath)}, ${sql(`${spec.name} / row ${spec.row}`)}, ${json({ conflictIds: ["RC-UNIT-015"], gameplayGaps: implemented ? [] : spec.gameplayGaps, sourceExact: true, economyPolicyId: COMPANION_PUBLIC_V1_PROFILE_ID })})`;
  });

  return `-- Generated by scripts/generate-classes-catalogue.ts from rules/Classes.html.
-- Do not hand-edit. Companion FS values are preserved as catalogue data and never
-- converted into the active V5 Hits, attack, or requisition models.

INSERT INTO unit_class_definitions (
  id, ruleset_id, name, category, health_model, max_health, armor, defense,
  speed_quarters, sensor_range, requisition_cost, definition_status, source, notes, definition_json
) VALUES
${definitions.join(",\n")}
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, category=excluded.category, health_model=excluded.health_model,
  max_health=excluded.max_health, armor=excluded.armor, defense=excluded.defense,
  speed_quarters=excluded.speed_quarters, sensor_range=excluded.sensor_range,
  requisition_cost=excluded.requisition_cost, definition_status=excluded.definition_status,
  source=excluded.source, notes=excluded.notes, definition_json=excluded.definition_json;

INSERT INTO supply_profile_definitions (
  id, ruleset_id, name, capacities_json, reload_rules_json,
  source_path, source_locator, definition_json
) VALUES
  ('supply-sapper-public-v1', ${sql(rulesetId)}, 'Sapper Build Supply',
   '{"BUILD_SUPPLY":{"maximum":6},"GENERAL_SUPPLY":{"maximum":1}}',
   '{"sourceResource":"GENERAL_SUPPLY","sourceQuantity":1,"refillResource":"BUILD_SUPPLY","refillToMaximum":true,"economy":"PRIMARY"}',
   'rules/Classes.html', 'Sappers / row 8', '{"applicationProfileId":"public-v1-sappers@1","initial":{"BUILD_SUPPLY":6,"GENERAL_SUPPLY":0}}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, capacities_json=excluded.capacities_json,
  reload_rules_json=excluded.reload_rules_json,
  source_path=excluded.source_path, source_locator=excluded.source_locator,
  definition_json=excluded.definition_json;

INSERT INTO cargo_profile_definitions (
  id, ruleset_id, name, capacity_json, loading_rules_json,
  source_path, source_locator, definition_json
) VALUES
  ('cargo-companion-vtol-troop-airlift-public-v1', ${sql(rulesetId)}, 'Companion VTOL Troop Airlift Cargo',
   '{"slotCapacityQuarters":8,"conversions":[{"itemTagsAny":["INFANTRY"],"slotCostQuarters":4},{"itemTagsAny":["SUPPLY_CARGO"],"slotCostQuarters":8}]}',
   '{"standardAction":true,"requiresPermissionForForeignUnit":true,"conflictIds":["RC-UNIT-015","RC-V5-030"]}',
   'rules/Classes.html', 'VTOL Heavy Troop Airlift / row 24',
   ${json({ applicationProfileId: "public-v1-companion-vtol-transports@1", companionTacticalProfile: companionVtolCargoProfile("unit-vtol-troop-airlift") })}),
  ('cargo-companion-vtol-multipurpose-airlift-public-v1', ${sql(rulesetId)}, 'Companion VTOL Multi-Purpose Cargo',
   '{"slotCapacityQuarters":8,"conversions":[{"itemTagsAny":["INFANTRY"],"slotCostQuarters":4},{"itemTagsAny":["SUPPLY_CARGO"],"slotCostQuarters":4},{"itemTagsAny":["LIGHT_VEHICLE"],"slotCostQuarters":4}]}',
   '{"standardAction":true,"requiresPermissionForForeignUnit":true,"conflictIds":["RC-UNIT-015","RC-V5-030"]}',
   'rules/Classes.html', 'VTOL Multi-Purpose Airlift / row 25',
   ${json({ applicationProfileId: "public-v1-companion-vtol-transports@1", companionTacticalProfile: companionVtolCargoProfile("unit-vtol-multipurpose-airlift") })}),
  ('cargo-companion-vtol-heavy-lift-public-v1', ${sql(rulesetId)}, 'Companion VTOL Heavy Lift External Cargo',
   '{"slotCapacityQuarters":4,"conversions":[{"itemTagsAny":["MECH"],"slotCostQuarters":4},{"itemTagsAny":["HEAVY"],"slotCostQuarters":4},{"itemTagsAny":["OBJECTIVE_CARGO"],"slotCostQuarters":4},{"itemTagsAny":["SUPPLY_CARGO"],"slotCostQuarters":4}]}',
   '{"standardAction":true,"requiresPermissionForForeignUnit":true,"conflictIds":["RC-UNIT-015","RC-V5-030"]}',
   'rules/Classes.html', 'VTOL Heavy Lift / row 26',
   ${json({ applicationProfileId: "public-v1-companion-vtol-transports@1", companionTacticalProfile: companionVtolCargoProfile("unit-vtol-heavy-lift") })})
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, capacity_json=excluded.capacity_json,
  loading_rules_json=excluded.loading_rules_json,
  source_path=excluded.source_path, source_locator=excluded.source_locator,
  definition_json=excluded.definition_json;

INSERT INTO unit_definition_profiles (
  unit_definition_id, ruleset_id, movement_profile_id, durability_profile_id,
  cargo_profile_id, supply_profile_id, deployment_profile_id, profile_json
) VALUES
${profiles.join(",\n")}
ON CONFLICT(unit_definition_id, ruleset_id) DO UPDATE SET
  movement_profile_id=excluded.movement_profile_id, durability_profile_id=excluded.durability_profile_id,
  cargo_profile_id=excluded.cargo_profile_id, supply_profile_id=excluded.supply_profile_id,
  deployment_profile_id=excluded.deployment_profile_id, profile_json=excluded.profile_json;

INSERT INTO unit_definition_tags (unit_definition_id, ruleset_id, tag_id) VALUES
${tags.join(",\n")}
ON CONFLICT(unit_definition_id, ruleset_id, tag_id) DO NOTHING;

INSERT INTO unit_definition_abilities (unit_definition_id, ruleset_id, ability_id, source_kind) VALUES
${abilities.join(",\n")}
ON CONFLICT(unit_definition_id, ruleset_id, ability_id, source_kind) DO NOTHING;

INSERT INTO unit_equipment_slot_definitions (
  unit_definition_id, ruleset_id, slot_type, slot_count, eligibility_json, source_path, source_locator
) VALUES
${slots.join(",\n")}
ON CONFLICT(unit_definition_id, ruleset_id, slot_type) DO UPDATE SET
  slot_count=excluded.slot_count, eligibility_json=excluded.eligibility_json,
  source_path=excluded.source_path, source_locator=excluded.source_locator;

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable,
  reason_code, source_path, source_locator, overlay_json
) VALUES
${overlays.join(",\n")}
ON CONFLICT(definition_kind, definition_id, ruleset_id) DO UPDATE SET
  implementation_status=excluded.implementation_status, requisition_status=excluded.requisition_status,
  availability_status=excluded.availability_status, executable=excluded.executable,
  purchasable=excluded.purchasable, reason_code=excluded.reason_code,
  source_path=excluded.source_path, source_locator=excluded.source_locator, overlay_json=excluded.overlay_json;

-- Previously catalogued companion infantry use the same named conversion and
-- economy policy while their signature handlers are completed.
${COMPANION_CLASS_POLICIES_V1.filter((policy) => ["unit-power-armoured-infantry", "unit-irregular", "unit-special-forces"].includes(policy.id)).map((policy) => `UPDATE unit_class_definitions
SET health_model=${sql(policy.healthModel)}, max_health=${policy.maximumHealth}, armor=${policy.armor},
    speed_quarters=${policy.speed * 4}, requisition_cost=${policy.requisitionCost}, definition_status='experimental',
    notes=${sql(`Executable values are supplied by ${COMPANION_PUBLIC_V1_PROFILE_ID}; source values remain in definition_json.`)},
    definition_json=json_patch(definition_json, ${json({ applicationPolicy: policy })})
WHERE id=${sql(policy.id)} AND ruleset_id=${sql(rulesetId)};`).join("\n")}

UPDATE ruleset_implementation_overlays
SET requisition_status='PUBLISHED', availability_status='BLOCKED',
    reason_code='COMPANION_HANDLER_PENDING',
    overlay_json=json_patch(overlay_json, ${json({ economyPolicyId: COMPANION_PUBLIC_V1_PROFILE_ID })})
WHERE ruleset_id=${sql(rulesetId)} AND definition_kind='UNIT'
  AND definition_id IN ('unit-irregular','unit-special-forces');

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-power-armoured-infantry@1"}')
WHERE ruleset_id=${sql(rulesetId)} AND definition_kind='UNIT'
  AND definition_id='unit-power-armoured-infantry';

-- Complete Power Armour base/back weapons and persistent one-mission unlock.
INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-power-armour-back-light-laser-public-v1', ${sql(rulesetId)}, 'Power Armour Back-mounted Light Laser', 1, 4, 0, 0, 1, 3, 1, 0,
   'active', 'Classes.html / Power Armoured Infantry + public-v1 companion policy',
   'Three-shot persisted heat capacity; after the third shot it cools automatically for the next round.',
   '{"tags":["POWER_ARMOUR_BACK_MOUNT","ENERGY"],"heatCapacity":3,"coolingRounds":1}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count, damage_die_sides=excluded.damage_die_sides,
  armor_piercing=excluded.armor_piercing, range_hexes=excluded.range_hexes, ammo_capacity=excluded.ammo_capacity,
  cooldown_rounds=excluded.cooldown_rounds, definition_status=excluded.definition_status,
  notes=excluded.notes, definition_json=excluded.definition_json;

INSERT INTO equipment_definitions (
  id, ruleset_id, name, category, slot_type, requisition_cost, consumable,
  definition_status, source, notes, definition_json
) VALUES
  ('equipment-power-armour-back-light-laser-public-v1', ${sql(rulesetId)}, 'Power Armour Back-mounted Light Laser',
   'MECH_WEAPON', 'mech_weapon', 1, 0, 'active',
   'Classes.html / Power Armoured Infantry + public-v1 companion policy',
   'Unlocks after one completed mission; installs in the dedicated Power Armour mech-weapon slot.',
   '{"unlockCompletedMissions":1,"allowedClasses":["unit-power-armoured-infantry"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, category=excluded.category, slot_type=excluded.slot_type,
  requisition_cost=excluded.requisition_cost, consumable=excluded.consumable,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

INSERT INTO equipment_effect_definitions (
  equipment_definition_id, ruleset_id, effect_index, effect_type, effect_json, source_path, source_locator
) VALUES
  ('equipment-power-armour-back-light-laser-public-v1', ${sql(rulesetId)}, 0, 'WEAPON_GRANT',
   '{"weaponId":"weapon-power-armour-back-light-laser-public-v1"}',
   'packages/rules-engine/src/power-armoured-infantry.ts', 'public-v1 back weapon')
ON CONFLICT(equipment_definition_id, ruleset_id, effect_index) DO UPDATE SET
  effect_type=excluded.effect_type, effect_json=excluded.effect_json,
  source_path=excluded.source_path, source_locator=excluded.source_locator;

INSERT INTO equipment_eligibility_rules (
  equipment_definition_id, ruleset_id, required_tags_all_json, required_tags_any_json,
  forbidden_tags_json, allowed_unit_definitions_json, slot_types_json, maximum_equipped,
  rule_json, source_path, source_locator
) VALUES
  ('equipment-power-armour-back-light-laser-public-v1', ${sql(rulesetId)}, '["tag-infantry"]', '[]', '[]',
   '["unit-power-armoured-infantry"]', '["MECH_WEAPON"]', 1,
   '{"minimumCompletedMissions":1}', 'packages/rules-engine/src/power-armoured-infantry.ts', 'public-v1 back weapon')
ON CONFLICT(equipment_definition_id, ruleset_id) DO UPDATE SET
  required_tags_all_json=excluded.required_tags_all_json,
  allowed_unit_definitions_json=excluded.allowed_unit_definitions_json,
  slot_types_json=excluded.slot_types_json, maximum_equipped=excluded.maximum_equipped,
  rule_json=excluded.rule_json, source_path=excluded.source_path, source_locator=excluded.source_locator;

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable,
  reason_code, source_path, source_locator, overlay_json
) VALUES
  ('EQUIPMENT', 'equipment-power-armour-back-light-laser-public-v1', ${sql(rulesetId)},
   'IMPLEMENTED', 'PUBLISHED', 'AVAILABLE', 1, 1, NULL,
   'packages/rules-engine/src/power-armoured-infantry.ts', 'public-v1 back weapon',
   '{"applicationProfileId":"public-v1-power-armoured-infantry@1","minimumCompletedMissions":1}')
ON CONFLICT(definition_kind, definition_id, ruleset_id) DO UPDATE SET
  implementation_status=excluded.implementation_status, requisition_status=excluded.requisition_status,
  availability_status=excluded.availability_status, executable=excluded.executable,
  purchasable=excluded.purchasable, reason_code=excluded.reason_code,
  source_path=excluded.source_path, source_locator=excluded.source_locator, overlay_json=excluded.overlay_json;

-- Public-v1 Irregular authority. The base class is playable and purchasable;
-- its irreversible veteran tracks are applied by the owned-force progression service.
INSERT INTO status_effect_definitions (
  id, ruleset_id, name, stacking_rule, visibility, source_path, source_locator, definition_json
) VALUES
  ('status-irregular-recruitment-history-public-v1', ${sql(rulesetId)}, 'Irregular Recruitment History', 'STACK', 'OWNER',
   'rules/Classes.html', 'Irregular Unit / Recruiter', '{"permanent":true,"applicationProfileId":"public-v1-irregular@1"}'),
  ('status-irregular-progression-public-v1', ${sql(rulesetId)}, 'Irregular Progression', 'UNIQUE', 'PUBLIC',
   'rules/Classes.html', 'Irregular Unit / Evolution', '{"permanent":true,"tracks":["MILITIA_VETERAN","RAIDER","REVOLUTIONARY_GUARD"],"applicationProfileId":"public-v1-irregular@1"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, stacking_rule=excluded.stacking_rule, visibility=excluded.visibility,
  source_path=excluded.source_path, source_locator=excluded.source_locator,
  definition_json=excluded.definition_json;

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-irregular-small-arms-public-v1', ${sql(rulesetId)}, 'Irregular Small Arms', 1, 6, 0, 0, 1, NULL, NULL, 0,
   'active', 'Classes.html / Irregular Unit + public-v1 companion policy',
   'Rolled damage is quartered and rounded up before the current Force Strength cap.',
   '{"tags":["PERSONNEL","FS_CAPPED","IRREGULAR_DAMAGE_QUARTER"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count,
  damage_die_sides=excluded.damage_die_sides, damage_modifier=excluded.damage_modifier,
  armor_piercing=excluded.armor_piercing, range_hexes=excluded.range_hexes,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-irregular', ${sql(rulesetId)}, 'weapon-irregular-small-arms-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-irregular@1"}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;

-- Public-v1 Special Forces attack and demolition authority. The quiet rifle
-- replaces the older generic rifle projection at the same governed mount.
INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-special-forces-quiet-rifle-public-v1', ${sql(rulesetId)}, 'Special Forces Quiet Rifle', 1, 4, 0, 0, 1, NULL, NULL, 0,
   'active', 'Classes.html / Special Forces + public-v1 companion policy',
   'Damage is capped by current Force Strength and firing reveals the team.',
   '{"tags":["PERSONNEL","FS_CAPPED","QUIET"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count,
  damage_die_sides=excluded.damage_die_sides, damage_modifier=excluded.damage_modifier,
  armor_piercing=excluded.armor_piercing, range_hexes=excluded.range_hexes,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-special-forces', ${sql(rulesetId)}, 'weapon-special-forces-quiet-rifle-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-special-forces@1"}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-sapper-carbine-public-v1', ${sql(rulesetId)}, 'Sapper Carbine', 1, 4, 0, 0, 1, NULL, NULL, 0,
   'active', 'Classes.html / Sappers + public-v1 companion policy',
   'Damage is capped by current Force Strength; firing reveals the team.',
   '{"tags":["PERSONNEL","FS_CAPPED","QUIET"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count,
  damage_die_sides=excluded.damage_die_sides, damage_modifier=excluded.damage_modifier,
  armor_piercing=excluded.armor_piercing, range_hexes=excluded.range_hexes,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-sappers', ${sql(rulesetId)}, 'weapon-sapper-carbine-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-sappers@1"}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;

-- Public-v1 companion armour attack authority. Tank multi-shot count remains
-- server-owned in the resolver; this catalogue stores one fitted cannon mount.
INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-mechanized-autocannon-public-v1', ${sql(rulesetId)}, 'Mechanized Autocannon', 1, 4, 0, 0, 2, NULL, NULL, 0,
   'active', 'Classes.html / Mechanized Infantry + public-v1 companion policy',
   'Vehicle autocannon without tank AP; the formation retains Forward Line control.',
   '{"tags":["DIRECT","AUTOCANNON"]}'),
  ('weapon-light-battle-tank-cannon-public-v1', ${sql(rulesetId)}, 'Light Tank Cannon', 1, 4, 0, 2, 2, NULL, NULL, 0,
   'active', 'Classes.html / Light Battle Tank + owner-approved public-v1 conversion',
   'One governed direct-fire cannon shot per attack activation.',
   '{"tags":["DIRECT","MAIN_WEAPON"]}'),
  ('weapon-heavy-battle-tank-cannon-public-v1', ${sql(rulesetId)}, 'Long Heavy Cannon', 1, 8, 0, 2, 3, NULL, NULL, 0,
   'active', 'Classes.html / Heavy Battle Tank + owner-approved public-v1 conversion',
   'One governed direct-fire cannon shot per attack activation.',
   '{"tags":["DIRECT","MAIN_WEAPON"]}'),
  ('weapon-super-heavy-dual-cannon-public-v1', ${sql(rulesetId)}, 'Dual Super-heavy Cannons', 1, 8, 0, 5, 3, NULL, NULL, 0,
   'active', 'Classes.html / Super Heavy Tank + owner-approved public-v1 conversion',
   'The resolver repeats this fitted cannon twice in one Primary attack activation.',
   '{"tags":["DIRECT","MAIN_WEAPON","SUPER_HEAVY_DUAL_CANNON"],"attacksPerActivation":2}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count,
  damage_die_sides=excluded.damage_die_sides, damage_modifier=excluded.damage_modifier,
  armor_piercing=excluded.armor_piercing, range_hexes=excluded.range_hexes,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-mechanized-infantry', ${sql(rulesetId)}, 'weapon-mechanized-autocannon-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-classes@1"}'),
  ('unit-light-battle-tank', ${sql(rulesetId)}, 'weapon-light-battle-tank-cannon-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-classes@1"}'),
  ('unit-heavy-battle-tank', ${sql(rulesetId)}, 'weapon-heavy-battle-tank-cannon-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-classes@1"}'),
  ('unit-super-heavy-tank', ${sql(rulesetId)}, 'weapon-super-heavy-dual-cannon-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-classes@1","attacksPerActivation":2}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;

INSERT INTO action_definitions (
  id, ruleset_id, name, economy, speed_cost_quarters, definition_status, source, notes, definition_json
) VALUES
  ('action-place-delayed-charge-public-v1', ${sql(rulesetId)}, 'Place Delayed Charge', 'PRIMARY', 0, 'active',
   'Classes.html / Special Forces + public-v1 companion policy',
   'Adjacent hostile unit or attackable structure; one active charge per team; arms next round.',
   '{"usesAttack":true,"maximumRange":1,"revealsActor":true}'),
  ('action-detonate-delayed-charge-public-v1', ${sql(rulesetId)}, 'Detonate Delayed Charge', 'PRIMARY', 0, 'active',
   'Classes.html / Special Forces + public-v1 companion policy',
   'Remote D6 AP2 detonation of the team''s armed charge.',
   '{"usesAttack":true,"damage":"D6","armorPiercing":2,"revealsActor":true}'),
  ('action-sapper-construct-public-v1', ${sql(rulesetId)}, 'Sapper Construct', 'PRIMARY', 0, 'active',
   'Classes.html / Sappers + public-v1 companion policy',
   'Spends 3 Build Supply and adds 3 persistent progress to a bounded Sapper project.',
   '{"usesAttack":true,"resourceCost":{"BUILD_SUPPLY":3},"progress":3,"maximumRange":1}'),
  ('action-reload-build-supply-public-v1', ${sql(rulesetId)}, 'Reload Build Supply', 'PRIMARY', 0, 'active',
   'Classes.html / Sappers + public-v1 companion policy',
   'Consumes one General Supply crate and refills Build Supply to 6.',
   '{"usesAttack":true,"sourceResourceCost":{"GENERAL_SUPPLY":1},"refill":{"BUILD_SUPPLY":6}}'),
  ('action-recruit-irregular-public-v1', ${sql(rulesetId)}, 'Recruit Irregulars', 'PRIMARY', 0, 'active',
   'Classes.html / Irregular Unit + Store Charismatic Commander + public-v1 companion policy',
   'Enter an Allied Population Center with Charismatic Commander to permanently raise maximum FS by 3, capped at 15; each center recruits once per campaign.',
   '{"usesAttack":true,"requiresEquipment":"equipment-charismatic-commander","requiresEnvironment":"POPULATION_CENTER","maximumForceStrengthGain":3,"maximumForceStrengthCap":15}'),
  ('action-shield-wall-public-v1', ${sql(rulesetId)}, 'Shield Wall', 'STANDARD', 4, 'active',
   'The Store / Ballistic Shields + public-v1 Power Armour policy',
   'Consumes the unit''s full Speed; grants non-stacking Cover Armor 1 against direct fire until movement.',
   '{"usesAttack":false,"requiresEquipment":"equipment-ballistic-shields","directFireCoverArmor":1,"clearsOnMovement":true}'),
  ('action-mount-magnetic-clamps-public-v1', ${sql(rulesetId)}, 'Mount Magnetic Clamps', 'PRIMARY', 0, 'active',
   'The Store / Magnetic Clamps + public-v1 Power Armour policy',
   'Matching co-located Primary actions mount one Power Armour rider on a fitted Medium or Heavy Mech.',
   '{"usesAttack":true,"requiresMatchingAction":true,"maximumRiders":1}'),
  ('action-dismount-magnetic-clamps-public-v1', ${sql(rulesetId)}, 'Dismount Magnetic Clamps', 'STANDARD', 2, 'active',
   'The Store / Magnetic Clamps + public-v1 Power Armour policy',
   'Matching Standard actions dismount the Power Armour rider into the mech hex.',
   '{"usesAttack":false,"requiresMatchingAction":true,"destination":"CARRIER_HEX"}'),
  ('action-abandon-guns-public-v1', ${sql(rulesetId)}, 'Abandon Guns', 'PRIMARY', 0, 'active',
   'Classes.html / Light and Heavy Artillery + public-v1 companion policy',
   'Transforms deployed crewed artillery into an unarmed 1FS CREW at the same hex.',
   '{"usesAttack":true,"requiresDeployed":true,"replacementLimit":"ONCE_PER_CAMPAIGN"}'),
  ('action-replace-guns-public-v1', ${sql(rulesetId)}, 'Replace Guns', 'PRIMARY', 0, 'active',
   'Classes.html / Light and Heavy Artillery + public-v1 companion policy',
   'At a friendly Supply Point, restores the original gun class and loadout for half Req rounded up.',
   '{"usesAttack":true,"requiresFriendlySupplyPoint":true,"cost":"HALF_CLASS_REQ_ROUND_UP"}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, economy=excluded.economy, speed_cost_quarters=excluded.speed_cost_quarters,
  definition_status=excluded.definition_status, notes=excluded.notes,
  definition_json=excluded.definition_json;

UPDATE unit_class_definitions
SET definition_status='active'
WHERE id IN ('unit-power-armoured-infantry','unit-irregular','unit-special-forces','unit-sappers','unit-light-artillery','unit-heavy-artillery','unit-self-propelled-artillery','unit-vtol-troop-airlift','unit-vtol-multipurpose-airlift','unit-vtol-heavy-lift','unit-mechanized-infantry','unit-light-battle-tank','unit-heavy-battle-tank','unit-super-heavy-tank','unit-medium-mech','unit-heavy-mech') AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-irregular@1"}')
WHERE definition_kind='UNIT' AND definition_id='unit-irregular' AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-special-forces@1"}')
WHERE definition_kind='UNIT' AND definition_id='unit-special-forces' AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-sappers@1"}')
WHERE definition_kind='UNIT' AND definition_id='unit-sappers' AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-companion-artillery@1"}')
WHERE definition_kind='UNIT'
  AND definition_id IN ('unit-light-artillery','unit-heavy-artillery','unit-self-propelled-artillery')
  AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-companion-vtol-transports@1"}')
WHERE definition_kind='UNIT'
  AND definition_id IN ('unit-vtol-troop-airlift','unit-vtol-multipurpose-airlift','unit-vtol-heavy-lift')
  AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"public-v1-companion-classes@1"}')
WHERE definition_kind='UNIT'
  AND definition_id IN ('unit-mechanized-infantry','unit-light-battle-tank','unit-heavy-battle-tank','unit-super-heavy-tank')
  AND ruleset_id=${sql(rulesetId)};

UPDATE ruleset_implementation_overlays
SET implementation_status='IMPLEMENTED', requisition_status='PUBLISHED', availability_status='AVAILABLE',
    executable=1, purchasable=1, reason_code=NULL,
    overlay_json=json_patch(overlay_json, '{"gameplayGaps":[],"applicationProfileId":"companion-v1-mechs@1"}')
WHERE definition_kind='UNIT'
  AND definition_id IN ('unit-medium-mech','unit-heavy-mech')
  AND ruleset_id=${sql(rulesetId)};

INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-light-artillery-public-v1', ${sql(rulesetId)}, 'Light Artillery Battery', 1, 2, 0, 0, 5, NULL, NULL, 1,
   'active', 'Classes.html / Light Artillery + public-v1 companion policy', 'Two fixed-damage area shots per activation.',
   '{"tags":["INDIRECT","AREA_HEX"],"attacksPerActivation":2,"fixedDamage":2}'),
  ('weapon-heavy-artillery-public-v1', ${sql(rulesetId)}, 'Heavy Artillery Battery', 1, 2, 0, 0, 8, NULL, NULL, 1,
   'active', 'Classes.html / Heavy Artillery + public-v1 companion policy', 'Three fixed-damage area shots per activation.',
   '{"tags":["INDIRECT","AREA_HEX"],"attacksPerActivation":3,"fixedDamage":3}'),
  ('weapon-self-propelled-artillery-public-v1', ${sql(rulesetId)}, 'Self-propelled Howitzer', 1, 6, 0, 0, 4, 5, NULL, 1,
   'active', 'Classes.html / Self-Propelled Artillery + public-v1 companion policy', 'Range 2-4; five finite AP rounds.',
   '{"tags":["INDIRECT","AREA_HEX","MINIMUM_RANGE_2"],"minimumRange":2}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count, damage_die_sides=excluded.damage_die_sides,
  damage_modifier=excluded.damage_modifier, armor_piercing=excluded.armor_piercing,
  range_hexes=excluded.range_hexes, ammo_capacity=excluded.ammo_capacity, indirect=excluded.indirect,
  definition_status=excluded.definition_status, notes=excluded.notes, definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-light-artillery', ${sql(rulesetId)}, 'weapon-light-artillery-public-v1', 'PRIMARY', 0, '{"applicationProfileId":"public-v1-companion-artillery@1"}'),
  ('unit-heavy-artillery', ${sql(rulesetId)}, 'weapon-heavy-artillery-public-v1', 'PRIMARY', 0, '{"applicationProfileId":"public-v1-companion-artillery@1"}'),
  ('unit-self-propelled-artillery', ${sql(rulesetId)}, 'weapon-self-propelled-artillery-public-v1', 'PRIMARY', 0, '{"applicationProfileId":"public-v1-companion-artillery@1","initialAmmunition":5}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;

-- The two armed companion VTOLs share the same one-shot governed nose gun.
INSERT INTO weapon_definitions (
  id, ruleset_id, name, damage_dice_count, damage_die_sides, damage_modifier,
  armor_piercing, range_hexes, ammo_capacity, cooldown_rounds, indirect,
  definition_status, source, notes, definition_json
) VALUES
  ('weapon-vtol-light-gun-public-v1', ${sql(rulesetId)}, 'VTOL Light Gun', 1, 2, 0, 0, 1, 1, NULL, 0,
   'active', 'Classes.html / VTOL Heavy Troop Airlift and Multi-Purpose Airlift + public-v1 companion policy',
   'One-shot nose gun; rearm only while landed at a governed aerospace supply facility.',
   '{"tags":["DIRECT","NOSE_GUN","REARM_REQUIRED"]}')
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name=excluded.name, damage_dice_count=excluded.damage_dice_count, damage_die_sides=excluded.damage_die_sides,
  damage_modifier=excluded.damage_modifier, armor_piercing=excluded.armor_piercing,
  range_hexes=excluded.range_hexes, ammo_capacity=excluded.ammo_capacity, indirect=excluded.indirect,
  definition_status=excluded.definition_status, notes=excluded.notes, definition_json=excluded.definition_json;

INSERT INTO unit_definition_weapons (
  unit_definition_id, ruleset_id, weapon_definition_id, mount_role, mount_index, state_json
) VALUES
  ('unit-vtol-troop-airlift', ${sql(rulesetId)}, 'weapon-vtol-light-gun-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-vtol-transports@1","initialAmmunition":1}'),
  ('unit-vtol-multipurpose-airlift', ${sql(rulesetId)}, 'weapon-vtol-light-gun-public-v1', 'PRIMARY', 0,
   '{"applicationProfileId":"public-v1-companion-vtol-transports@1","initialAmmunition":1}')
ON CONFLICT(unit_definition_id, ruleset_id, mount_role, mount_index) DO UPDATE SET
  weapon_definition_id=excluded.weapon_definition_id, state_json=excluded.state_json;
`;
}

const rows = parseRows(await readFile(resolve(root, sourcePath), "utf8"));
const output = render(rows);
const destination = resolve(root, destinationPath);
if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== output) throw new Error(`${destinationPath} is stale. Run npm run classes:generate.`);
  console.log(`Verified ${specs.length} additional Classes.html unit definitions.`);
} else {
  await writeFile(destination, output, "utf8");
  console.log(`Generated ${destinationPath} with ${specs.length} additional unit definitions.`);
}

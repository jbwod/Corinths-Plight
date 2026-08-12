import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = "rules/Classes.html";
const destinationPath = "seeds/v5-classes-catalogue.sql";
const rulesetId = "ruleset-v5-core-curated-1";

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
  { row: 24, id: "unit-vtol-troop-airlift", name: "VTOL Heavy Troop Airlift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-aerospace", "tag-atmo-flight", "tag-vtol", "tag-transport"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "TROOP_OR_SUPPLY_CAPACITY", "RAPPELLING_GARRISON", "FS_BASED_REARM"] },
  { row: 25, id: "unit-vtol-multipurpose-airlift", name: "VTOL Multi-Purpose Airlift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-aerospace", "tag-atmo-flight", "tag-vtol", "tag-transport"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "SIMULTANEOUS_PERSONNEL_AND_VEHICLE_CARGO", "FS_BASED_REARM"] },
  { row: 26, id: "unit-vtol-heavy-lift", name: "VTOL Heavy Lift", category: "AEROSPACE", movementProfileId: "movement-vtol", deploymentProfileId: "deployment-vtol", tags: ["tag-vehicle", "tag-aerospace", "tag-atmo-flight", "tag-vtol", "tag-transport", "tag-heavy", "tag-logistics"], slots: { LIGHT: 1, INTERNAL: 1 }, abilities: ["ability-flight-path", "ability-transport-cargo"], gameplayGaps: ["FS_AEROSPACE_DAMAGE_MODEL", "EXTERNAL_HEAVY_LIFT", "OBJECTIVE_CARGO", "HEAVY_TRANSPORT_CAPACITY"] },
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
    const sourceRecord = {
      sourceRow: row.row,
      description: row.sourceName,
      raw: { forceStrength: row.forceStrength, armor: row.armor, speed: row.speed, range: row.range, cost: row.costText || null },
      specialRules: row.rulesText,
      equipmentSlots: spec.slots,
      gameplayGaps: spec.gameplayGaps,
      canonicalActivation: "CATALOGUED",
      conflictIds: ["RC-UNIT-015", "RC-V5-014"],
    };
    return `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(spec.name)}, ${sql(spec.category)}, 'FORCE_STRENGTH', ${row.forceStrength}, ${row.armor}, 0, ${row.speed * 4}, 0, NULL, 'legacy', ${sql(`Classes.html row ${row.row} / ${spec.name}`)}, 'Companion class preserved exactly; gameplay and requisition remain blocked by RC-UNIT-015.', ${json(sourceRecord)})`;
  });
  const profiles = specs.map((spec) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(spec.movementProfileId)}, 'durability-personnel-fs', NULL, NULL, ${sql(spec.deploymentProfileId)}, ${json({ canonicalActivation: "CATALOGUED", conflictIds: ["RC-UNIT-015"] })})`);
  const tags = specs.flatMap((spec) => spec.tags.map((tag) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(tag)})`));
  const abilities = specs.flatMap((spec) => (spec.abilities ?? []).map((ability) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(ability)}, 'BASE')`));
  const slots = specs.flatMap((spec) => Object.entries(spec.slots).map(([slot, count]) => `  (${sql(spec.id)}, ${sql(rulesetId)}, ${sql(slot)}, ${count}, ${json({ canonicalActivation: "CATALOGUED", conflictIds: ["RC-UNIT-015"] })}, ${sql(sourcePath)}, ${sql(`${spec.name} / row ${spec.row}`)})`));
  const overlays = specs.map((spec) => `  ('UNIT', ${sql(spec.id)}, ${sql(rulesetId)}, 'CATALOGUE_ONLY', 'BALANCE_REQUIRED', 'BLOCKED', 0, 0, 'RC_UNIT_015', ${sql(sourcePath)}, ${sql(`${spec.name} / row ${spec.row}`)}, ${json({ conflictIds: ["RC-UNIT-015"], gameplayGaps: spec.gameplayGaps, sourceExact: true })})`);

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

-- Previously catalogued companion infantry are public reference entries too.
UPDATE ruleset_implementation_overlays
SET availability_status='BLOCKED', reason_code='RC_UNIT_015'
WHERE ruleset_id=${sql(rulesetId)} AND definition_kind='UNIT'
  AND definition_id IN ('unit-power-armoured-infantry','unit-irregular','unit-special-forces');
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

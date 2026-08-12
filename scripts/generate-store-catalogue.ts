import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = "rules/The Store - Equipment List.html";
const destinationPath = "seeds/v5-store-catalogue.sql";
const rulesetId = "ruleset-v5-core-curated-1";
const sectionRows = new Set([1, 42, 58, 67, 78, 89, 100]);

interface StoreRow {
  row: number;
  sourceName: string;
  name: string;
  slotText: string;
  rulesText: string;
  costText: string;
  accessText: string;
  id: string;
}

interface Restriction {
  requiredTagsAll: string[];
  requiredTagsAny: string[];
  forbiddenTags: string[];
  allowedUnitDefinitions: string[];
  slotTypes: string[];
  maximumEquipped: number | null;
  prerequisites?: string[];
}

const existingIds = new Map<number, string>([
  [3, "equipment-orbital-drop-training"], [4, "equipment-flak-vests"], [10, "equipment-light-at"],
  [21, "equipment-silent-smgs"], [22, "equipment-k9-scouts"], [23, "equipment-drone-operator"],
  [29, "equipment-road-building"], [41, "equipment-simple-med-stimpacks"], [43, "equipment-vehicle-optics"],
  [49, "equipment-smoke-launcher"], [50, "equipment-ap-ammo"], [63, "equipment-mech-light-laser"],
  [79, "equipment-aerospace-sidewinder"], [82, "equipment-aerospace-afterburner"], [85, "equipment-cluster-bombs"],
  [97, "equipment-vtol-bay"], [98, "equipment-carrier-flight-deck"], [99, "equipment-mech-bay"],
  [103, "equipment-mobile-infantry"], [104, "equipment-armory"], [107, "equipment-heavy-ground-vehicle-bay"],
  [111, "equipment-aerospace-storage"],
]);

const names = new Map<number, string>([
  [2, "Standard Melee Weapons"], [4, "Flak Vests"], [5, "Combat Shotguns"], [7, "Anti-tank Mines"],
  [8, "Heavy Machine Gun Team"], [9, "Heavy Machine Gun Ammunition"], [10, "Lightweight Anti-armour Weapon"],
  [11, "Stinger AA Missile"], [12, "Fragmentation Grenades"], [13, "Smoke Grenades"],
  [14, "Squad Automatic Weapon"], [18, "Remote Detonators"], [20, "Anti-material Rifles"],
  [21, "Silent SMGs"], [24, "Deployable Automated Turrets"], [25, "Flamethrower Team"],
  [26, "Heavy Fortification Equipment"], [27, "Weapon Emplacement Equipment"], [28, "Back-line Support Equipment"],
  [31, "Hardened Leadership"], [32, "Charismatic Commander"], [33, "High-risk Flamers"],
  [34, "Powered Chainblades"], [35, "Stick Bombs"], [36, "Rocket Jump Pack"], [37, "Good Ammunition"],
  [38, "Combat Stims"], [39, "MASH Light Emergency Vehicles"], [40, "MASH Defence Teams"],
  [41, "Simple Med-Stimpacks"], [43, "Vehicle Optics"], [45, "Small Surface-to-air Missile"],
  [47, "Sponson Machine-gun Turret"], [48, "Grab Handles and Side Skirts"], [51, "Artillery Smoke Rounds"],
  [52, "Explosive Anchors"], [53, "Bulldozer Attachment"], [54, "Longer Artillery Barrel"],
  [55, "Hellfire Artillery Rounds"], [56, "Artillery Shovels and Sandbags"], [57, "Mini Supply Depot"],
  [59, "Heavy Machine Weapon System"], [60, "Autocannon Weapon System"], [61, "Mech Melee Weapon"],
  [62, "Long-range Missile System"], [63, "Light Laser Setup"], [64, "Medium Laser Setup"],
  [65, "Large Laser Setup"], [66, "Mech Jump Jets"], [71, "Mech Optics"], [72, "Mech Carry Crate"],
  [73, "Mech Back Hitch"], [74, "Mech Fists"], [75, "Neural Interface"], [76, "Mech Smoke Launcher"],
  [77, "Light Mech Internal Jump Jets"], [79, "Sidewinder AA Missile"], [80, "Aerospace Gun Pod"],
  [81, "Light Rocket Pod"], [82, "Afterburner"], [83, "Drop Tank"], [84, "VTOL Smoke Dispenser"],
  [86, "500 kg Bomb"], [87, "Hellfire Bombs"], [88, "Cluster Smoke Bombs"],
  [90, "Orbital Scanning System"], [91, "Rapid-fire Anti-air Cannons"], [92, "Rail Cannon"],
  [93, "Orbital Bombardment Cannons"], [94, "Orbital Laser"], [95, "Broadside Cannons"],
  [96, "Orbital Structure Drop"], [98, "Carrier Flight Deck"], [101, "Massive Cargo Bay"],
  [102, "Drop Pod Launch Bay"], [103, "Mobile Infantry Upgrade"], [105, "Engineering Bay"],
  [106, "Landing Gear"], [108, "Heavy Drop Pod Launch Bay"], [109, "Reinforced Structural Integrity"],
  [110, "Orbital Thrusters Upgrade"], [111, "Aerospace Storage Hangar"], [112, "Through-ship Interior Hangar"],
]);

const explicitIds = new Map<number, string>([
  [7, "equipment-at-mines"], [11, "equipment-stinger-aa"], [12, "equipment-frag-grenades"],
  [13, "equipment-smoke-grenades"], [14, "equipment-squad-automatic-weapon"], [17, "equipment-delayed-explosive-charge"],
  [18, "equipment-remote-detonators"], [20, "equipment-anti-material-rifles"], [24, "equipment-automated-turrets"],
  [31, "equipment-hardened-leadership"], [32, "equipment-charismatic-commander"], [33, "equipment-high-risk-flamers"],
  [34, "equipment-powered-chainblades"], [35, "equipment-stick-bombs"], [36, "equipment-rocket-jump-pack"],
  [37, "equipment-good-ammunition"], [39, "equipment-mash-light-emergency-vehicles"], [40, "equipment-mash-defence-teams"],
  [51, "equipment-artillery-smoke-rounds"], [52, "equipment-explosive-anchors"], [54, "equipment-longer-artillery-barrel"],
  [55, "equipment-hellfire-artillery-rounds"], [56, "equipment-artillery-shovels-sandbags"],
  [59, "equipment-mech-heavy-machine-weapon"], [60, "equipment-mech-autocannon"], [61, "equipment-mech-melee-weapon"],
  [62, "equipment-mech-lrm"], [64, "equipment-mech-medium-laser"], [65, "equipment-mech-large-laser"],
  [66, "equipment-mech-jump-jets"], [68, "equipment-mech-magnetic-clamps"], [69, "equipment-mech-up-armour"],
  [70, "equipment-mech-ammo-box"], [71, "equipment-mech-optics"], [72, "equipment-mech-carry-crate"],
  [73, "equipment-mech-back-hitch"], [74, "equipment-mech-fists"], [75, "equipment-mech-neural-interface"],
  [76, "equipment-mech-smoke-launcher"], [77, "equipment-light-mech-internal-jump-jets"],
  [80, "equipment-aerospace-gun-pod"], [81, "equipment-aerospace-light-rocket-pod"],
  [83, "equipment-aerospace-drop-tank"], [84, "equipment-vtol-smoke-dispenser"],
  [86, "equipment-aerospace-500kg-bomb"], [87, "equipment-aerospace-hellfire-bombs"],
  [88, "equipment-aerospace-cluster-smoke-bombs"], [90, "equipment-orbital-scanning-system"],
  [91, "equipment-orbital-rapid-fire-aa"], [92, "equipment-orbital-rail-cannon"],
  [93, "equipment-orbital-bombardment-cannons"], [94, "equipment-orbital-laser"],
  [95, "equipment-orbital-broadside-cannons"], [96, "equipment-orbital-structure-drop"],
  [101, "equipment-massive-cargo-bay"], [102, "equipment-drop-pod-launch-bay"],
  [105, "equipment-engineering-bay"], [106, "equipment-landing-gear"], [108, "equipment-heavy-drop-pod-launch-bay"],
  [109, "equipment-reinforced-structural-integrity"], [110, "equipment-orbital-thrusters"],
  [112, "equipment-through-ship-interior-hangar"],
]);

const allInfantry = ["unit-infantry-squad", "unit-power-armoured-infantry", "unit-combat-medic", "unit-irregular", "unit-special-forces", "unit-engineers"];
const nonIrregularInfantry = allInfantry.filter((id) => id !== "unit-irregular");
const fieldInfantry = ["unit-infantry-squad", "unit-power-armoured-infantry", "unit-irregular", "unit-special-forces"];
const groundVehicles = ["unit-logi-truck", "unit-light-vehicle", "unit-infantry-fighting-vehicle", "unit-main-battle-tank"];

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown): string {
  return sql(JSON.stringify(value));
}

function category(row: number): string {
  if (row >= 90) return "SHIP_MODULE";
  if (row >= 79) return row >= 85 ? "AEROSPACE_ORDNANCE" : row === 82 || row === 84 ? "AEROSPACE_INTERNAL" : "AEROSPACE_WEAPON";
  if (row >= 68) return "MECH_INTERNAL";
  if (row >= 59) return "MECH_WEAPON";
  if (row >= 51) return "ARTILLERY_EQUIPMENT";
  if (row >= 43) return row === 50 ? "VEHICLE_AMMUNITION" : row === 45 || row === 47 ? "VEHICLE_WEAPON" : "VEHICLE_INTERNAL";
  if (row >= 38) return "MEDICAL";
  if (row >= 24 && row <= 29) return "ENGINEER";
  if ([3, 4, 18, 20, 30, 31, 32, 34].includes(row)) return "INFANTRY_UPGRADE";
  return row === 9 ? "INFANTRY_AMMUNITION" : row >= 2 ? "INFANTRY_WEAPON" : "EQUIPMENT";
}

function slotTypes(row: number): string[] {
  if (row >= 90) return row === 92 || row === 103 ? ["EXTERNAL", "INTERNAL"] : [row <= 99 ? "EXTERNAL" : "INTERNAL"];
  if (row >= 79) return row >= 85 ? ["BOMB_BAY"] : row === 82 || row === 84 ? ["INTERNAL"] : ["LIGHT", "DISPOSABLE"];
  if (row >= 59) return [row <= 66 ? "EXTERNAL" : "INTERNAL"];
  if ([50, 51, 55].includes(row)) return ["AMMO"];
  if (row >= 43) return [row === 45 || row === 47 || row === 49 || row === 54 ? "SECONDARY" : "INTERNAL"];
  if (row >= 38) return ["MEDICAL"];
  if (row >= 24 && row <= 29) return row === 25 ? ["PRIMARY", "ENGINEER"] : ["ENGINEER"];
  if (row === 30) return ["MECH_WEAPON"];
  if ([31, 32, 33, 35, 36, 37].includes(row)) return ["HIGH_RISK_ARMS"];
  if (row === 34) return ["LOW_TECH_MELEE"];
  if ([3, 4, 18, 20].includes(row)) return ["UPGRADE", "SECONDARY"];
  if ([5, 6, 7, 9, 12, 13, 14, 17, 24].includes(row)) return ["SECONDARY"];
  return ["PRIMARY"];
}

function restrictions(row: number): Restriction | null {
  if (row >= 90) return null;
  let allowed: string[] = [];
  let requiredTagsAll: string[] = [];
  const forbiddenTags: string[] = [];
  const prerequisites: string[] = [];
  if (row <= 41) {
    if ([2, 3].includes(row)) allowed = nonIrregularInfantry;
    else if ([4, 5, 9, 12, 13, 14, 22, 23, 32].includes(row)) allowed = allInfantry;
    else if ([6, 7, 24].includes(row)) allowed = ["unit-infantry-squad", "unit-special-forces", "unit-engineers"];
    else if ([8, 10, 11, 15, 17, 18].includes(row)) allowed = fieldInfantry;
    else if ([19, 20, 21].includes(row)) allowed = ["unit-power-armoured-infantry", "unit-special-forces"];
    else if (row === 16 || row === 30) allowed = ["unit-power-armoured-infantry"];
    else if (row >= 25 && row <= 29) allowed = row === 25 ? ["unit-infantry-squad", "unit-power-armoured-infantry", "unit-engineers"] : ["unit-engineers"];
    else if (row >= 31 && row <= 37) allowed = row === 32 ? allInfantry : ["unit-irregular"];
    else if (row >= 38) allowed = ["unit-combat-medic"];
    if (row === 18) prerequisites.push("equipment-delayed-explosive-charge");
    if (row === 20) prerequisites.push("equipment-sniper-rifles");
    if (row === 30) prerequisites.push("equipment-standard-melee-weapons");
  } else if (row <= 57) {
    if ([51, 52, 54, 55, 56, 57].includes(row)) allowed = ["unit-artillery"];
    else if (row === 53) allowed = ["unit-main-battle-tank"];
    else allowed = [...groundVehicles, "unit-artillery"];
  } else if (row <= 77) {
    allowed = row === 68 ? ["unit-power-armoured-infantry", "unit-light-mech"] : ["unit-light-mech"];
  } else {
    if ([79, 80, 81, 83].includes(row)) allowed = ["unit-aerospace-fighter"];
    else if (row === 84) allowed = ["unit-vtol"];
    else if (row >= 85) allowed = ["unit-aerospace-bomber"];
    else requiredTagsAll = ["tag-aerospace"];
  }
  return {
    requiredTagsAll,
    requiredTagsAny: [],
    forbiddenTags,
    allowedUnitDefinitions: allowed,
    slotTypes: slotTypes(row),
    maximumEquipped: [52, 83, 110].includes(row) ? (row === 52 ? 2 : 1) : null,
    ...(prerequisites.length ? { prerequisites } : {}),
  };
}

function parseRows(html: string): StoreRow[] {
  const rows: StoreRow[] = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => decodeHtml(cell[1]));
    const row = Number(cells[0]);
    if (!Number.isInteger(row) || row < 2 || sectionRows.has(row) || !cells[1]) continue;
    const name = names.get(row) ?? cells[1].replace(/^\.*\s*/, "").replace(/\s+requires\s+.+$/i, "").trim();
    rows.push({
      row,
      sourceName: cells[1],
      name,
      slotText: cells[3] ?? "",
      rulesText: cells[4] ?? "",
      costText: cells[5] ?? "",
      accessText: cells[6] ?? "",
      id: existingIds.get(row) ?? explicitIds.get(row) ?? `equipment-${slug(name)}`,
    });
  }
  if (rows.length !== 105) throw new Error(`Expected 105 Store items; parsed ${rows.length}.`);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Generated Store equipment IDs are not unique.");
  return rows;
}

function render(rows: StoreRow[]): string {
  const newRows = rows.filter((row) => !existingIds.has(row.row));
  const definitionTuples = newRows.map((row) => {
    const price = /^\d+$/.test(row.costText) ? row.costText : "NULL";
    const storeCatalogue = {
      storeRow: row.row,
      sourceName: row.sourceName,
      sourceSlot: row.slotText,
      rulesText: row.rulesText,
      unitAccessText: row.accessText,
      effectStatus: "SOURCE_EXACT_HANDLER_DEFERRED",
    };
    return `  (${sql(row.id)}, ${sql(rulesetId)}, ${sql(row.name)}, ${sql(category(row.row))}, ${sql(slotTypes(row.row)[0].toLowerCase())}, ${price}, 0, 'experimental', 'The Store row ${row.row}', 'Source-exact catalogue entry; execution remains gated until its effect handler is implemented.', ${json({ storeCatalogue })})`;
  });
  const cataloguePatches = rows.map((row) => `UPDATE equipment_definitions
SET definition_json = json_patch(definition_json, ${json({ storeCatalogue: { storeRow: row.row, sourceName: row.sourceName, sourceSlot: row.slotText, rulesText: row.rulesText, unitAccessText: row.accessText, effectStatus: existingIds.has(row.row) ? "SEE_IMPLEMENTATION_OVERLAY" : "SOURCE_EXACT_HANDLER_DEFERRED" } })})
WHERE id = ${sql(row.id)} AND ruleset_id = ${sql(rulesetId)};`);
  const eligibility = rows.flatMap((row) => {
    const rule = restrictions(row.row);
    if (!rule) return [];
    return [`  (${sql(row.id)}, ${sql(rulesetId)}, ${json(rule.requiredTagsAll)}, ${json(rule.requiredTagsAny)}, ${json(rule.forbiddenTags)}, ${json(rule.allowedUnitDefinitions)}, ${json(rule.slotTypes)}, ${rule.maximumEquipped ?? "NULL"}, ${json({ sourceAccess: row.accessText, sourceSlot: row.slotText, prerequisites: rule.prerequisites ?? [] })}, ${sql(sourcePath)}, ${sql(`${row.name} / row ${row.row}`)})`];
  });
  const overlays = newRows.map((row) => {
    const priceStatus = /^\d+$/.test(row.costText) ? "PUBLISHED" : "BALANCE_REQUIRED";
    const kind = row.row >= 90 ? "SHIP_MODULE" : "EQUIPMENT";
    const reason = row.row >= 90 ? "SHIP_MODULE_MUTATION_DEFERRED" : "EFFECT_HANDLER_NOT_IMPLEMENTED";
    return `  ('${kind}', ${sql(row.id)}, ${sql(rulesetId)}, 'CATALOGUE_ONLY', '${priceStatus}', 'BLOCKED', 0, 0, '${reason}', ${sql(sourcePath)}, ${sql(`row ${row.row}`)}, ${json({ sourceExact: true, storeRow: row.row })})`;
  });
  return `-- Generated by scripts/generate-store-catalogue.ts from the authoritative Store HTML.
-- Do not hand-edit. Every source row is preserved; unimplemented effects fail closed.

INSERT INTO equipment_definitions (
  id, ruleset_id, name, category, slot_type, requisition_cost, consumable,
  definition_status, source, notes, definition_json
) VALUES
${definitionTuples.join(",\n")}
ON CONFLICT(id, ruleset_id) DO UPDATE SET
  name = excluded.name, category = excluded.category, slot_type = excluded.slot_type,
  requisition_cost = excluded.requisition_cost, consumable = excluded.consumable,
  definition_status = excluded.definition_status, source = excluded.source,
  notes = excluded.notes, definition_json = excluded.definition_json;

${cataloguePatches.join("\n\n")}

-- The Store defines Drone Operator as Primary. This corrects the earlier Secondary normalization.
UPDATE equipment_definitions SET slot_type = 'primary'
WHERE id = 'equipment-drone-operator' AND ruleset_id = '${rulesetId}';
UPDATE equipment_eligibility_rules
SET required_tags_all_json = '["tag-infantry"]', required_tags_any_json = '[]', forbidden_tags_json = '[]',
    allowed_unit_definitions_json = ${sql(JSON.stringify(allInfantry))}, slot_types_json = '["PRIMARY"]',
    rule_json = json_patch(rule_json, '{"sourceCorrection":"STORE_ROW_23_PRIMARY_ALL_INFANTRY"}'),
    source_locator = 'Drone Operator / row 23'
WHERE equipment_definition_id = 'equipment-drone-operator' AND ruleset_id = '${rulesetId}';

INSERT INTO equipment_eligibility_rules (
  equipment_definition_id, ruleset_id, required_tags_all_json, required_tags_any_json,
  forbidden_tags_json, allowed_unit_definitions_json, slot_types_json, maximum_equipped,
  rule_json, source_path, source_locator
) VALUES
${eligibility.join(",\n")}
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

INSERT INTO ruleset_implementation_overlays (
  definition_kind, definition_id, ruleset_id, implementation_status,
  requisition_status, availability_status, executable, purchasable,
  reason_code, source_path, source_locator, overlay_json
) VALUES
${overlays.join(",\n")}
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

-- Store entries are discoverable catalogue content even when their gameplay handler is deferred.
-- This changes only visibility: acquisition/execution remain governed by the existing overlay flags.
UPDATE ruleset_implementation_overlays
SET availability_status = 'BLOCKED'
WHERE definition_kind IN ('EQUIPMENT', 'SHIP_MODULE')
  AND definition_id IN (${rows.map((row) => sql(row.id)).join(", ")})
  AND availability_status IN ('DEV_ONLY', 'HIDDEN')
  AND purchasable = 0;
`;
}

const rows = parseRows(await readFile(resolve(root, sourcePath), "utf8"));
const output = render(rows);
const destination = resolve(root, destinationPath);
if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8").catch(() => "");
  if (current !== output) throw new Error(`${destinationPath} is stale. Run npm run store:generate.`);
  console.log(`Verified ${rows.length} Store items (${rows.length - existingIds.size} generated additions).`);
} else {
  await writeFile(destination, output, "utf8");
  console.log(`Generated ${destinationPath} with ${rows.length} Store items (${rows.length - existingIds.size} additions).`);
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { allDefinitions, unitClasses } from "../packages/rules-engine/src/catalogue";

const sourceHashes: Record<string, string> = {
  "rules/Meta - Core Rules (V5).md": "9076241b32332743307a1bbcdfac8becf44bbff371e4945a31af78a914d39345",
  "rules/Actions and Rules Work ( For Shack Reference).html": "72d5aeb178d4f0883781461cba4a7f7a9cd20ad881cce790233ad86d2b7ca20e",
  "rules/Build and Supply System.html": "04394bb8dc1c5943e61293b0a96c02b160596aed837157a13b1f07f2868185a3",
  "rules/Classes.html": "6842fe2d7f7472be8e8fb452f68b3c09abca452f12e70bafd12e11b8a396d218",
  "rules/Order Formatting - Needs Rework.html": "cf41d1d43dc5fbcc07072478c0d2f3adbf5027f7493c45f173c540633b0616fa",
  "rules/The Store - Equipment List.html": "f2ae75a8589edef9bb3633d0a1ce443ba34332a0b80309401f480652b7fabe8a",
  "gameplan.md": "ddee76a1e074e8ef9c94309b9facedc9a65dcccfbe00296ca65476a33d259fac",
  "phase2-forces.md": "57aca68140cfc377850bd37b1c15f20eda612cb5a3f11cfe6b28d4d030ec32db",
};

const failures: string[] = [];
const ids = new Set<string>();
for (const definition of allDefinitions) {
  if (ids.has(definition.id)) failures.push(`Duplicate definition id: ${definition.id}`);
  ids.add(definition.id);
  if (!definition.rulesetVersion || !definition.source || !definition.status) {
    failures.push(`Missing provenance metadata: ${definition.id}`);
  }
}

for (const definition of unitClasses.filter((candidate) => candidate.status === "active")) {
  if (definition.requisitionCost === 0) {
    failures.push(`Active class ${definition.id} uses a fabricated zero requisition cost; use null until published.`);
  }
}

const kinds = new Set(allDefinitions.map((definition) => definition.kind));
for (const required of ["unit-class", "enemy", "equipment", "action", "order-type", "structure", "terrain"]) {
  if (!kinds.has(required as never)) failures.push(`Catalogue has no ${required} definitions.`);
}

for (const [path, expected] of Object.entries(sourceHashes)) {
  const buffer = await readFile(path);
  const actual = createHash("sha256").update(buffer).digest("hex");
  if (actual !== expected) failures.push(`Source hash changed for ${path}: ${actual}`);
}

const seedSql = await readFile("seeds/v5-core-curated.sql", "utf8");
const phase2SeedSql = await readFile("seeds/v5-phase2-combined-arms.sql", "utf8");
const phase3MigrationSql = await readFile("migrations/0004_phase3_strategic_layer.sql", "utf8");
const phase3SeedSql = await readFile("seeds/development-strategic-world.sql", "utf8");
const combinedSeedSql = `${seedSql}\n${phase2SeedSql}`;

const definitionTables = new Set([
  "unit_class_definitions",
  "weapon_definitions",
  "equipment_definitions",
  "action_definitions",
  "order_type_definitions",
  "structure_definitions",
  "terrain_definitions",
  "ship_class_definitions",
  "enemy_definitions",
]);

function collectDefinitionTupleLines(sql: string): Map<string, string> {
  const tuples = new Map<string, string>();
  let activeTable: string | undefined;
  for (const line of sql.split(/\r?\n/)) {
    const insert = line.match(/^INSERT INTO\s+([a-z_]+)/i);
    if (insert) activeTable = definitionTables.has(insert[1]) ? insert[1] : undefined;
    if (!activeTable) continue;
    const tuple = line.match(/^\s*\('([^']+)'\s*,/);
    if (tuple) {
      const [, id] = tuple;
      if (tuples.has(id)) failures.push(`D1 seeds contain duplicate definition tuple id: ${id}.`);
      tuples.set(id, line);
    }
    if (/^ON CONFLICT|;\s*$/.test(line)) activeTable = undefined;
  }
  return tuples;
}

const seedTupleLines = collectDefinitionTupleLines(combinedSeedSql);

for (const definition of allDefinitions) {
  const tuple = seedTupleLines.get(definition.id);
  if (!tuple) {
    failures.push(`D1 seed is missing ${definition.id}.`);
    continue;
  }
  if (!tuple.includes(`'${definition.status}'`)) {
    failures.push(
      `D1 seed status mismatch for ${definition.id}: runtime catalogue is ${definition.status}.`,
    );
  }
}

for (const [path, expected] of Object.entries(sourceHashes)) {
  if (!combinedSeedSql.includes(`'${path}'`)) {
    failures.push(`D1 seed is missing source provenance for ${path}.`);
  } else if (!combinedSeedSql.includes(`'${expected}'`)) {
    failures.push(`D1 seed source hash mismatch for ${path}.`);
  }
}

const phase2PlayerUnits = [
  "unit-infantry-squad",
  "unit-power-armoured-infantry",
  "unit-combat-medic",
  "unit-irregular",
  "unit-special-forces",
  "unit-engineers",
  "unit-artillery",
  "unit-logi-truck",
  "unit-light-vehicle",
  "unit-infantry-fighting-vehicle",
  "unit-main-battle-tank",
  "unit-light-mech",
  "unit-aerospace-fighter",
  "unit-aerospace-bomber",
  "unit-vtol",
  "unit-heavy-air-transport",
] as const;

const phase2Enemies = [
  "enemy-bug-drone",
  "enemy-bug-warrior",
  "enemy-bug-spitter",
  "enemy-bug-heavy",
  "enemy-bug-burrower",
  "enemy-bug-flyer",
  "enemy-bug-artillery",
] as const;

const phase2RequiredDefinitions = [
  ...phase2PlayerUnits,
  ...phase2Enemies,
  "weapon-ifv-snub-autocannon",
  "weapon-light-mech-laser",
  "weapon-fighter-snub-hmg",
  "weapon-bomber-ordnance",
  "weapon-vtol-nose-gun",
  "action-first-aid",
  "action-deploy-platform",
  "action-pack-platform",
  "action-load-cargo",
  "action-unload-cargo",
  "action-transfer-supply",
  "action-crew-repair",
  "action-land",
  "action-rearm-aerospace",
  "action-airdrop",
  "equipment-silent-smgs",
  "equipment-k9-scouts",
  "equipment-smoke-launcher",
  "equipment-ap-ammo",
  "equipment-mech-light-laser",
  "equipment-aerospace-sidewinder",
  "equipment-aerospace-afterburner",
  "equipment-cluster-bombs",
  "status-stealthed",
  "status-packed",
  "status-deployed",
  "status-dug-in",
  "status-evasive",
  "status-airborne",
  "status-landed",
  "status-rearm-required",
] as const;

for (const id of phase2RequiredDefinitions) {
  if (!combinedSeedSql.includes(`'${id}'`)) failures.push(`Phase 2 D1 seed is missing ${id}.`);
}

for (const unitId of phase2PlayerUnits) {
  const tuple = seedTupleLines.get(unitId);
  if (!tuple) {
    failures.push(`Phase 2 D1 seed is missing unit definition ${unitId}.`);
    continue;
  }
  const costAndStatus = tuple.match(/,\s*(NULL|\d+)\s*,\s*'(active|experimental|legacy|incomplete)'\s*,/);
  if (!costAndStatus) {
    failures.push(`Cannot audit requisition cost for ${unitId}.`);
  } else if (costAndStatus[1] !== "NULL") {
    failures.push(`Phase 2 unit ${unitId} invents requisition cost ${costAndStatus[1]}; use NULL.`);
  }
  const overlayPattern = new RegExp(
    `'UNIT',\\s*'${unitId}',[^\\n]+?'BALANCE_REQUIRED'`,
  );
  if (!overlayPattern.test(phase2SeedSql)) {
    failures.push(`Phase 2 unit ${unitId} is not explicitly marked BALANCE_REQUIRED.`);
  }
}

for (const requiredTable of [
  "movement_profile_definitions",
  "durability_profile_definitions",
  "cargo_profile_definitions",
  "supply_profile_definitions",
  "deployment_profile_definitions",
  "tag_definitions",
  "ability_definitions",
  "status_effect_definitions",
  "equipment_eligibility_rules",
  "ruleset_implementation_overlays",
  "ship_capability_definitions",
  "ship_module_capability_grants",
]) {
  if (!phase2SeedSql.includes(`INSERT INTO ${requiredTable}`)) {
    failures.push(`Phase 2 seed does not populate ${requiredTable}.`);
  }
}

if (!phase2SeedSql.includes("ON CONFLICT")) failures.push("Phase 2 seed is not idempotent.");
if (!phase2SeedSql.includes("equipment-road-building', 'ruleset-v5-core-curated-1', 'Road Building Equipment', 'ENGINEER', 'engineer', NULL")) {
  failures.push("Road Building Equipment must retain its unpublished NULL requisition cost.");
}

const activeRulesetPattern =
  /VALUES\s*\(\s*'ruleset-v5-core-curated-1'\s*,\s*'v5-core-curated@1'\s*,\s*'V5 Core Curated'\s*,\s*'ACTIVE'/m;
if (!activeRulesetPattern.test(seedSql)) {
  failures.push("D1 seed does not select v5-core-curated@1 as the active ruleset explicitly.");
}
if (!seedSql.includes("rule_conflicts")) failures.push("D1 seed does not preserve rule conflicts.");

for (const requiredTable of [
  "strategic_locations",
  "strategic_maps",
  "strategic_nodes",
  "strategic_routes",
  "strategic_operations",
  "task_forces",
  "task_force_ships",
  "task_force_battlegroups",
  "strategic_supply_stores",
  "strategic_supply_balances",
  "strategic_rounds",
  "strategic_orders",
  "strategic_events",
  "strategic_effect_receipts",
  "strategic_war_variables",
]) {
  if (!phase3MigrationSql.includes(`CREATE TABLE ${requiredTable}`)) {
    failures.push(`Phase 3 migration does not create ${requiredTable}.`);
  }
}

for (const requiredId of [
  "strategic-map-corinth",
  "task-force-resolute",
  "ship-corinth-ward",
  "strategic-operation-iron-rain",
  "strategic-operation-night-glass",
  "strategic-operation-broken-road",
  "battlegroup-hammer",
  "battlegroup-raven",
]) {
  if (!phase3SeedSql.includes(`'${requiredId}'`)) {
    failures.push(`Phase 3 development seed is missing ${requiredId}.`);
  }
}

if (!phase3SeedSql.includes("'CSV Resolute'")) {
  failures.push("Phase 3 development seed does not name CSV Resolute.");
}
if (!phase3SeedSql.includes("'supply-store-csv-resolute', 'LARGE', 3, 4")) {
  failures.push("Phase 3 development seed must preserve the explicit CSV Resolute Large Supply fixture of 3 / 4.");
}
if (!phase3SeedSql.includes("0ebe472aa5bc16e551e2fd5e2b3d16f78a4c4e016cbe954f8a4687f72c2b5b01")) {
  failures.push("Phase 3 development seed is missing the supplied brief provenance hash.");
}
if (!phase3SeedSql.includes("ON CONFLICT")) {
  failures.push("Phase 3 development seed is not repeat-idempotent.");
}
if (!phase3SeedSql.includes("NULL, 'BALANCE_REQUIRED'")) {
  failures.push("Phase 3 routes must retain unresolved travel rounds as NULL / BALANCE_REQUIRED.");
}
if (phase3SeedSql.includes("'SCENARIO_CONFIG'")) {
  failures.push("Phase 3 development seed invents scenario travel timing instead of retaining unresolved values.");
}
if (!phase3MigrationSql.includes("UNIQUE (actor_user_id, command_id)")) {
  failures.push("Strategic-order idempotency must be scoped to the authenticated actor.");
}
if (phase3MigrationSql.includes("command_id TEXT NOT NULL UNIQUE")) {
  failures.push("Phase 3 command IDs must not be globally unique across users.");
}
if (phase3MigrationSql.includes("ORBITAL_BOMBARDMENT")) {
  failures.push("Full orbital combat orders are deferred and must fail closed in Phase 3.");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "ok",
        ruleset: "v5-core-curated@1",
        definitions: allDefinitions.length,
        activeDefinitions: allDefinitions.filter((definition) => definition.status === "active").length,
        sqlDefinitions: seedTupleLines.size,
        phase2PlayerUnits: phase2PlayerUnits.length,
        phase2EnemyRoles: phase2Enemies.length,
        phase3Map: "strategic-map-corinth",
        phase3Operations: 3,
        sourceHashes: Object.keys(sourceHashes).length,
      },
      null,
      2,
    ),
  );
}

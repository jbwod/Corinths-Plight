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
const seedTupleLines = new Map<string, string>();
for (const line of seedSql.split(/\r?\n/)) {
  const match = line.match(/^\s*\('([^']+)'\s*,/);
  if (!match) continue;
  const [, id] = match;
  if (seedTupleLines.has(id)) failures.push(`D1 seed contains duplicate definition tuple id: ${id}.`);
  seedTupleLines.set(id, line);
}

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
  const tuple = [...seedTupleLines.values()].find((line) => line.includes(`'${path}'`));
  if (!tuple) {
    failures.push(`D1 seed is missing source provenance for ${path}.`);
  } else if (!tuple.includes(`'${expected}'`)) {
    failures.push(`D1 seed source hash mismatch for ${path}.`);
  }
}

const activeRulesetPattern =
  /VALUES\s*\(\s*'ruleset-v5-core-curated-1'\s*,\s*'v5-core-curated@1'\s*,\s*'V5 Core Curated'\s*,\s*'ACTIVE'/m;
if (!activeRulesetPattern.test(seedSql)) {
  failures.push("D1 seed does not select v5-core-curated@1 as the active ruleset explicitly.");
}
if (!seedSql.includes("rule_conflicts")) failures.push("D1 seed does not preserve rule conflicts.");

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
        sourceHashes: Object.keys(sourceHashes).length,
      },
      null,
      2,
    ),
  );
}

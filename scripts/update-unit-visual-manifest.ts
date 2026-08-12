import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const manifestPath = "src/assets/gameplay-visuals.manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  generatedAt: string;
  assets: Array<Record<string, unknown> & { key: string; path: string; status: string }>;
};
const definitions: Array<[string, string, string]> = [
  ["unit.power-armoured-infantry", "power-armoured-infantry.png", "exec-f5243f87-690e-489e-b908-b50de5b72b38.png"],
  ["unit.irregular", "irregular-infantry.png", "exec-3c1600a0-e90c-471c-802b-0f8aa8bb40f3.png"],
  ["unit.special-forces", "special-forces.png", "exec-b33da7bf-8f8b-40c1-97ea-847be9920370.png"],
  ["unit.sappers", "sappers.png", "exec-9a7f08da-db69-4b2b-815b-639c2c22b7af.png"],
  ["unit.mechanized-infantry", "mechanized-infantry.png", "exec-c47b6174-970e-4860-af3d-d392aaa413a1.png"],
  ["unit.light-battle-tank", "light-battle-tank.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.heavy-battle-tank", "heavy-battle-tank.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.super-heavy-tank", "super-heavy-tank.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.light-artillery", "light-artillery.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.heavy-artillery", "heavy-artillery.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.self-propelled-artillery", "self-propelled-artillery.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.vtol-troop-airlift", "vtol-troop-airlift.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.vtol-multipurpose-airlift", "vtol-multipurpose-airlift.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.vtol-heavy-lift", "vtol-heavy-lift.png", "OpenAI built-in imagegen Classes expansion batch"],
  ["unit.medium-mech", "medium-mech.png", "exec-53079f1d-20ce-40be-9112-1e8c3752802d.png"],
  ["unit.heavy-mech", "heavy-mech.png", "exec-9c7862f8-1ca8-43ba-8d96-70642c8903ca.png"],
];
const existing = new Map(manifest.assets.map((asset) => [asset.key, asset]));
for (const [key, fileName, source] of definitions) {
  const path = `src/assets/unit-art/generated/${fileName}`;
  const digest = createHash("sha256").update(await readFile(path)).digest("hex");
  existing.set(key, { key, path, sha256: digest, source, status: "ACTIVE" });
}
manifest.generatedAt = new Date().toISOString().slice(0, 10);
manifest.assets = [...existing.values()].sort((left, right) => left.key.localeCompare(right.key));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Recorded ${definitions.length} companion unit assets.`);

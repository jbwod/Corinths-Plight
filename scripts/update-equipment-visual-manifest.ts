import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import catalogue from "../rules/catalogue/v5-core-curated@2/catalogue.json" with { type: "json" };

const manifestPath = "src/assets/gameplay-visuals.manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  generatedAt: string;
  assets: Array<Record<string, unknown> & { key: string; path: string; status: string }>;
};
const overrides: Record<string, string> = {
  "equipment-silent-smgs": "silent-smgs-v2",
  "equipment-sponson-machine-gun-turret": "sponson-mg-turret",
  "equipment-grab-handles-and-side-skirts": "grab-handles-side-skirts",
};
const oldByKey = new Map(manifest.assets.map((asset) => [asset.key, asset]));
const nonEquipment = manifest.assets.filter((asset) => !asset.key.startsWith("equipment."));
const equipment = await Promise.all(catalogue.content.equipment.map(async (definition) => {
  const short = definition.id.replace(/^equipment-/, "");
  const fileName = `${overrides[definition.id] ?? short}.png`;
  const path = `src/assets/equipment-art/generated/${fileName}`;
  const digest = createHash("sha256").update(await readFile(path)).digest("hex");
  const key = `equipment.${short}`;
  const previous = oldByKey.get(key);
  return {
    key,
    path,
    sha256: digest,
    source: previous?.source ?? "OpenAI built-in imagegen Store expansion batch",
    status: "ACTIVE",
    ...(previous?.derivativeHistory ? { derivativeHistory: previous.derivativeHistory } : {}),
  };
}));
const alternates = manifest.assets.filter((asset) => asset.key.startsWith("equipment.") && asset.status !== "ACTIVE");
manifest.generatedAt = new Date().toISOString().slice(0, 10);
manifest.assets = [...nonEquipment, ...equipment, ...alternates];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Recorded ${equipment.length} active Store equipment assets.`);

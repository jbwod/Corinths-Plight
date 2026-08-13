import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

interface ProvenanceAsset {
  path: string;
  sha256: string;
  status: "ACTIVE" | "ALTERNATE" | "QUARANTINED";
  chromaPath?: string;
  chromaSha256?: string;
}

const workspace = process.cwd();
const manifestPath = resolve(workspace, "src/tactical-sprite-manifest.ts");
const bundleDirectory = resolve(workspace, "dist/client/assets");
const provenancePath = resolve(
  workspace,
  "src/assets/tactical-sprites/mech-sprite-provenance.json",
);

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const manifestSource = await readFile(manifestPath, "utf8");
const activePaths = [...manifestSource.matchAll(
  /from "\.\/(assets\/tactical-sprites\/generated\/[^"\n]+\.png)";/g,
)].map((match) => `src/${match[1]}`);

if (activePaths.length !== 29 || new Set(activePaths).size !== activePaths.length) {
  throw new Error(
    `Tactical sprite allowlist must contain 29 unique static imports; found ${activePaths.length}.`,
  );
}

const bundleFiles = (await readdir(bundleDirectory))
  .filter((file) => file.endsWith(".png"))
  .sort();
const bundleHashes = new Map<string, string[]>();
for (const file of bundleFiles) {
  const hash = digest(await readFile(resolve(bundleDirectory, file)));
  bundleHashes.set(hash, [...(bundleHashes.get(hash) ?? []), file]);
}

for (const path of activePaths) {
  const hash = digest(await readFile(resolve(workspace, path)));
  if (!bundleHashes.has(hash)) {
    throw new Error(`Allowlisted tactical sprite is absent from the client bundle: ${path}`);
  }
}

const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
  assets: ProvenanceAsset[];
};
for (const asset of provenance.assets) {
  const sourceHash = digest(await readFile(resolve(workspace, asset.path)));
  if (sourceHash !== asset.sha256) {
    throw new Error(`Tactical provenance hash drift: ${asset.path}`);
  }
  const emitted = bundleHashes.get(sourceHash) ?? [];
  if (asset.status === "ACTIVE" && emitted.length === 0) {
    throw new Error(`Active mech is absent from the client bundle: ${asset.path}`);
  }
  if (asset.status !== "ACTIVE" && emitted.length > 0) {
    throw new Error(
      `Inactive mech entered the client bundle: ${asset.path} -> ${emitted.join(", ")}`,
    );
  }
  if (asset.chromaPath && asset.chromaSha256) {
    const chromaHash = digest(await readFile(resolve(workspace, asset.chromaPath)));
    if (chromaHash !== asset.chromaSha256) {
      throw new Error(`Tactical chroma provenance hash drift: ${asset.chromaPath}`);
    }
    const emittedChroma = bundleHashes.get(chromaHash) ?? [];
    if (emittedChroma.length > 0) {
      throw new Error(
        `Chroma source entered the client bundle: ${asset.chromaPath} -> ${emittedChroma.join(", ")}`,
      );
    }
  }
}

const activeNames = activePaths.map((path) => basename(path));
console.log(
  `Verified ${activeNames.length} tactical sprites in the client bundle; inactive mech and chroma hashes are absent.`,
);

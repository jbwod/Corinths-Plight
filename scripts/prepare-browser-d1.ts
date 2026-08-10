import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const statePath = resolve(root, ".wrangler/browser-test-state");
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const database = "corinths-plight";
const seeds = [
  "v5-core-curated.sql",
  "v5-phase2-combined-arms.sql",
  "v5-equipment-deployment.sql",
  "onboarding-foundation.sql",
  "development-forces.sql",
  "development-strategic-world.sql",
  "development-spearhead.sql",
] as const;

function run(arguments_: string[]): void {
  const result = spawnSync(process.execPath, [wrangler, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      WRANGLER_LOG_PATH: resolve(statePath, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Browser D1 preparation failed: ${arguments_.join(" ")}`);
  }
}

await rm(statePath, { recursive: true, force: true });
await mkdir(statePath, { recursive: true });
run(["d1", "migrations", "apply", database, "--local", "--persist-to", statePath]);
for (const seed of seeds) {
  run(["d1", "execute", database, "--local", "--persist-to", statePath, "--file", `seeds/${seed}`]);
}
console.log(`Prepared isolated browser D1 state with ${seeds.length} seeds.`);

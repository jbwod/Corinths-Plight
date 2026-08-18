import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  PUBLIC_V1_ECONOMY_POLICY,
  PUBLIC_V1_UNIT_PRICES,
} from "../packages/domain/src/economy-policy";

const databaseName = "corinths-plight";
const rootDirectory = resolve(import.meta.dirname, "..");
const wranglerPath = resolve(rootDirectory, "node_modules/wrangler/bin/wrangler.js");
const seedDirectory = resolve(rootDirectory, "seeds");
const migrationDirectory = resolve(rootDirectory, "migrations");

// The order is intentional: catalogue/onboarding data must exist before the
// development world fixtures that reference it.
const seedFiles = [
  "v5-core-curated.sql",
  "v5-phase2-combined-arms.sql",
  "v5-classes-catalogue.sql",
  "v5-equipment-deployment.sql",
  "v5-store-catalogue.sql",
  "onboarding-foundation.sql",
  "game-test-strategic-world.sql",
  "development-forces.sql",
  "development-strategic-world.sql",
  "development-spearhead.sql",
] as const;

type StableTableSnapshot = Record<string, { rowCount: number; sha256: string }>;
type SqlValue = null | number | bigint | string | Uint8Array;

function fail(message: string): never {
  throw new Error(message);
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function sqlFileNames(directory: string): Promise<string[]> {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

async function sqliteFiles(directory: string): Promise<string[]> {
  const matches: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...await sqliteFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".sqlite") && entry.name !== "metadata.sqlite") {
      matches.push(path);
    }
  }
  return matches;
}

function runWrangler(stateDirectory: string, description: string, arguments_: string[]): void {
  const result = spawnSync(process.execPath, [wranglerPath, ...arguments_], {
    cwd: rootDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      WRANGLER_LOG_PATH: join(stateDirectory, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout.trim()) console.error(result.stdout.trim());
    if (result.stderr.trim()) console.error(result.stderr.trim());
    fail(`${description} failed with exit code ${String(result.status)}.`);
  }
  console.log(`\u2713 ${description}`);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normaliseValue(value: SqlValue): string {
  if (value === null) return "null:";
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "number") return `number:${value.toString()}`;
  if (typeof value === "string") return `string:${value}`;
  return `blob:${Buffer.from(value).toString("hex")}`;
}

function rows(database: DatabaseSync, sql: string, ...parameters: string[]): SqlValue[][] {
  return database.prepare(sql).all(...parameters) as unknown as SqlValue[][];
}

function verifyDatabase(databasePath: string, expectedMigrations: readonly string[]): StableTableSnapshot {
  const database = new DatabaseSync(databasePath, {
    readOnly: true,
    readBigInts: true,
    returnArrays: true,
  });

  try {
    const integrityResults = rows(database, "PRAGMA integrity_check");
    if (integrityResults.length !== 1 || integrityResults[0][0] !== "ok") {
      fail(`SQLite integrity_check failed: ${JSON.stringify(integrityResults)}`);
    }

    const foreignKeyViolations = rows(database, "PRAGMA foreign_key_check");
    if (foreignKeyViolations.length > 0) {
      fail(`SQLite foreign_key_check found ${foreignKeyViolations.length} violation(s).`);
    }

    const appliedMigrations = rows(database, "SELECT name FROM d1_migrations ORDER BY id")
      .map(([name]) => String(name));
    if (!sameList(appliedMigrations, expectedMigrations)) {
      fail(
        `Applied migrations do not match the migration directory. Expected ${expectedMigrations.join(", ")}; ` +
        `received ${appliedMigrations.join(", ")}.`,
      );
    }

    const policy = rows(database, `SELECT starting_requisition,battalion_charter_cost,
      mission_reward,campaign_victory_reward,passive_income,loss_policy,replacement_policy
      FROM economy_policies WHERE id='public-v1-economy@1' AND status='ACTIVE'`);
    const expectedPolicy: SqlValue[][] = [[
      BigInt(PUBLIC_V1_ECONOMY_POLICY.startingRequisition),
      BigInt(PUBLIC_V1_ECONOMY_POLICY.battalionCharterCost),
      BigInt(PUBLIC_V1_ECONOMY_POLICY.missionReward),
      BigInt(PUBLIC_V1_ECONOMY_POLICY.campaignVictoryReward),
      BigInt(PUBLIC_V1_ECONOMY_POLICY.passiveIncome),
      PUBLIC_V1_ECONOMY_POLICY.lossPolicy,
      PUBLIC_V1_ECONOMY_POLICY.replacementPolicy,
    ]];
    if (JSON.stringify(policy, (_key, value) => typeof value === "bigint" ? value.toString() : value) !==
        JSON.stringify(expectedPolicy, (_key, value) => typeof value === "bigint" ? value.toString() : value)) {
      fail(`Active economy policy drifted: ${JSON.stringify(policy, (_key, value) => typeof value === "bigint" ? value.toString() : value)}.`);
    }
    const publishedPrices = rows(database, `SELECT definition_id,requisition_cost FROM economy_unit_prices
      WHERE policy_id='public-v1-economy@1' AND status='PUBLISHED' ORDER BY definition_id`)
      .map(([definitionId, price]) => [String(definitionId), Number(price)] as const);
    const expectedPrices = Object.entries(PUBLIC_V1_UNIT_PRICES).sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(publishedPrices) !== JSON.stringify(expectedPrices)) {
      fail(`Published unit-price table drifted: ${JSON.stringify(publishedPrices)}.`);
    }

    const tableNames = rows(
      database,
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' " +
        "AND name NOT IN ('_cf_METADATA', 'd1_migrations') ORDER BY name",
    ).map(([name]) => String(name));

    const snapshot: StableTableSnapshot = {};
    for (const tableName of tableNames) {
      const columnNames = rows(
        database,
        "SELECT name FROM pragma_table_info(?) ORDER BY cid",
        tableName,
      ).map(([name]) => String(name));
      const stableColumnNames = columnNames.filter((name) => !name.endsWith("_at"));
      if (stableColumnNames.length === 0) {
        fail(`Cannot fingerprint ${tableName}: it has no non-timestamp columns.`);
      }

      const selectedRows = rows(
        database,
        `SELECT ${stableColumnNames.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(tableName)}`,
      );
      const canonicalRows = selectedRows
        .map((row) => row.map(normaliseValue).join("\u001f"))
        .sort();
      const sha256 = createHash("sha256")
        .update(`${tableName}\n${stableColumnNames.join("\u001f")}\n${canonicalRows.join("\n")}`)
        .digest("hex");
      snapshot[tableName] = { rowCount: selectedRows.length, sha256 };
    }

    return snapshot;
  } finally {
    database.close();
  }
}

function compareSnapshots(first: StableTableSnapshot, second: StableTableSnapshot): void {
  const firstNames = Object.keys(first).sort();
  const secondNames = Object.keys(second).sort();
  if (!sameList(firstNames, secondNames)) {
    fail("The table set changed during the second seed pass.");
  }

  const changed = firstNames.filter((tableName) =>
    first[tableName].rowCount !== second[tableName].rowCount ||
    first[tableName].sha256 !== second[tableName].sha256
  );
  if (changed.length > 0) {
    fail(`Seed replay is not idempotent; stable data changed in: ${changed.join(", ")}.`);
  }
}

async function main(): Promise<void> {
  const actualSeedFiles = await sqlFileNames(seedDirectory);
  const expectedSeedFiles = [...seedFiles].sort();
  if (!sameList(actualSeedFiles, expectedSeedFiles)) {
    fail(
      `The CI seed manifest is incomplete. Expected ${expectedSeedFiles.join(", ")}; ` +
      `found ${actualSeedFiles.join(", ")}.`,
    );
  }

  const expectedMigrations = await sqlFileNames(migrationDirectory);
  if (expectedMigrations.length === 0) fail("No D1 migrations were found.");

  const stateDirectory = await mkdtemp(join(tmpdir(), "corinth-d1-ci-"));
  try {
    runWrangler(stateDirectory, "applied all migrations to an empty local D1", [
      "d1", "migrations", "apply", databaseName, "--local", "--persist-to", stateDirectory,
    ]);

    for (const seedFile of seedFiles) {
      runWrangler(stateDirectory, `seeded ${seedFile} (pass 1)`, [
        "d1", "execute", databaseName, "--local", "--persist-to", stateDirectory,
        "--file", join("seeds", seedFile),
      ]);
    }

    const databasePaths = await sqliteFiles(stateDirectory);
    if (databasePaths.length !== 1) {
      fail(`Expected one local D1 SQLite file, found ${databasePaths.length}: ${databasePaths.join(", ")}`);
    }

    const firstSnapshot = verifyDatabase(databasePaths[0], expectedMigrations);
    console.log(`\u2713 migration list, integrity, and foreign keys verified across ${Object.keys(firstSnapshot).length} tables`);

    for (const seedFile of seedFiles) {
      runWrangler(stateDirectory, `seeded ${seedFile} (pass 2)`, [
        "d1", "execute", databaseName, "--local", "--persist-to", stateDirectory,
        "--file", join("seeds", seedFile),
      ]);
    }

    const secondSnapshot = verifyDatabase(databasePaths[0], expectedMigrations);
    compareSnapshots(firstSnapshot, secondSnapshot);
    console.log(`\u2713 all ${seedFiles.length} seeds are idempotent; integrity and foreign keys remain valid`);
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

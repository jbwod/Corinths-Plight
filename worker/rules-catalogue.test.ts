import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));

import { V5_CORE_CURATED_2_CONTENT_HASH } from "../packages/rules-engine/src/generated/v5-core-curated-2";
import type { Env } from "./env";
import worker from "./index";

const env = {
  ENVIRONMENT: "production",
  ALLOW_DEMO_AUTH: "false",
} as Env;

const context = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

afterEach(() => vi.restoreAllMocks());

describe("public rules catalogue route", () => {
  test("serves the strict generated @2 projection without internal catalogue data", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://game.example/api/rulesets/v5-core-curated"),
      env,
      context,
    );
    const body = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(Object.keys(body)).toEqual([
      "schemaVersion", "contentHash", "ruleset", "canonicalUnitIds", "companionUnitIds",
      "units", "weapons", "equipment", "actions", "orders", "structures", "terrain", "ships", "enemies",
      "movementProfiles", "durabilityProfiles", "cargoProfiles", "supplyProfiles", "deploymentProfiles",
      "deploymentMethods", "tags", "abilities", "statusEffects", "shipCapabilities", "relations",
    ]);
    expect(body.contentHash).toBe(V5_CORE_CURATED_2_CONTENT_HASH);
    expect(body.ruleset).toEqual({
      id: "ruleset-v5-core-curated-2",
      version: "v5-core-curated@2",
      name: "V5 Core Curated",
      engineVersion: "foundation-0.1.0",
    });

    expect(serialized).not.toContain("v5-core-curated@1");
    expect(serialized).not.toContain("foundation-compiled-unit-class");
    expect(serialized).not.toContain("foundation-order-handler");
    expect(serialized).not.toContain("foundation-action-handler");
    expect(serialized).not.toContain("equipment-effect-flak-vests");
    expect(serialized).not.toContain("equipment-effect-light-at");
    expect(serialized).not.toContain("DEV_ONLY");
    expect(serialized).not.toContain("HIDDEN");
    const responseKeys = collectKeys(body);
    for (const internalKey of [
      "handlers", "handlerId", "handlerIds", "evidence", "bodyMarkdown", "sourceId", "sourcePath",
      "sourceLocator", "notes", "authorityNotes", "conflicts", "overlays",
    ]) expect(responseKeys.has(internalKey)).toBe(false);
    expect(body).not.toHaveProperty("definitions");
    expect(body).not.toHaveProperty("summary");
    expect(body).not.toHaveProperty("status");
  });

  test("retains the existing cross-origin guard", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://game.example/api/rulesets/v5-core-curated", {
        headers: { origin: "https://attacker.example" },
      }),
      env,
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CROSS_ORIGIN_FORBIDDEN" } });
  });
});

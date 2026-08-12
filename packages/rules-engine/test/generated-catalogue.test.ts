import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { canonicalJson } from "../../domain/src/json-contract";
import { parseRulesCatalogueEnvelope } from "../../domain/src/rules-catalogue-contract";
import {
  V5_CORE_CURATED_2_CATALOGUE,
  V5_CORE_CURATED_2_CONTENT_HASH,
} from "../src/generated/v5-core-curated-2";
import {
  buildCanonicalCatalogueEnvelope,
  legacyDefinitionCounts,
  legacySourceHashMismatches,
  legacyTopLevelDefinitionCount,
  legacyUnitPublicationSplit,
  readCanonicalConflictRegister,
  readLegacyCatalogueSnapshot,
  referencedConflictIds,
  renderGeneratedCatalogueModule,
} from "../../../scripts/generate-rules-catalogue";

describe("rules catalogue bootstrap", () => {
  test("reads the complete final production seed state", async () => {
    const snapshot = await readLegacyCatalogueSnapshot();

    expect(legacyDefinitionCounts(snapshot)).toEqual({
      units: 16,
      weapons: 12,
      equipment: 105,
      actions: 24,
      orders: 6,
      structures: 6,
      terrain: 4,
      ships: 4,
      enemies: 7,
    });
    expect(legacyTopLevelDefinitionCount(snapshot)).toBe(184);
    expect(await legacySourceHashMismatches(snapshot)).toEqual([]);
    expect(legacyUnitPublicationSplit(snapshot)).toEqual({
      canonicalUnitIds: [
        "unit-aerospace-bomber",
        "unit-aerospace-fighter",
        "unit-artillery",
        "unit-combat-medic",
        "unit-engineers",
        "unit-heavy-air-transport",
        "unit-infantry-fighting-vehicle",
        "unit-infantry-squad",
        "unit-light-mech",
        "unit-light-vehicle",
        "unit-logi-truck",
        "unit-main-battle-tank",
        "unit-vtol",
      ],
      companionUnitIds: [
        "unit-irregular",
        "unit-power-armoured-infantry",
        "unit-special-forces",
      ],
    });
  });

  test("resolves every seeded namespaced conflict reference against the canonical register", async () => {
    const [snapshot, conflicts] = await Promise.all([
      readLegacyCatalogueSnapshot(),
      readCanonicalConflictRegister(),
    ]);
    const canonicalIds = new Set(conflicts.map((conflict) => conflict.id));
    const referencedIds = referencedConflictIds(snapshot);

    expect(conflicts).toHaveLength(72);
    expect(referencedIds).toHaveLength(26);
    expect(referencedIds.filter((id) => !canonicalIds.has(id))).toEqual([]);
  });

  test("publishes one immutable, drift-free v5-core-curated@2 envelope", async () => {
    const canonicalPath = new URL("../../../rules/catalogue/v5-core-curated@2/catalogue.json", import.meta.url);
    const generatedPath = new URL("../src/generated/v5-core-curated-2.ts", import.meta.url);
    const parsed = await parseRulesCatalogueEnvelope(JSON.parse(await readFile(canonicalPath, "utf8")));
    const rebuilt = await buildCanonicalCatalogueEnvelope();
    const content = parsed.content;

    expect(canonicalJson(parsed)).toBe(canonicalJson(rebuilt));
    expect(parsed.contentHash).toBe(V5_CORE_CURATED_2_CONTENT_HASH);
    expect(V5_CORE_CURATED_2_CATALOGUE.contentHash).toBe(parsed.contentHash);
    expect(Object.isFrozen(V5_CORE_CURATED_2_CATALOGUE)).toBe(true);
    expect(Object.isFrozen(V5_CORE_CURATED_2_CATALOGUE.content.units)).toBe(true);
    expect(await readFile(generatedPath, "utf8")).toBe(renderGeneratedCatalogueModule(parsed));

    expect(content.canonicalUnitIds).toHaveLength(13);
    expect(content.companionUnitIds).toHaveLength(3);
    expect([
      ...content.units, ...content.weapons, ...content.equipment, ...content.actions,
      ...content.orders, ...content.structures, ...content.terrain, ...content.ships, ...content.enemies,
    ]).toHaveLength(184);
    expect(content.conflicts).toHaveLength(84);

    const medic = content.units.find((unit) => unit.id === "unit-combat-medic")!;
    const fighter = content.units.find((unit) => unit.id === "unit-aerospace-fighter")!;
    expect(medic.sourcedNumbers.sensorRange).toEqual({ status: "SCENARIO_DEFINED", value: null });
    expect(fighter.sourcedNumbers.sensorRange).toEqual({ status: "SCENARIO_DEFINED", value: null });
    expect(fighter.parameters.legacyProjectionSensorRange).toBe(0);
    expect(content.units.every((unit) => unit.sourcedNumbers.sensorRange.status === "SCENARIO_DEFINED" && unit.sourcedNumbers.sensorRange.value === null)).toBe(true);
    expect(content.movementProfiles.every((profile) => profile.definitionStatus === "unspecified")).toBe(true);

    const overlays = new Map(content.overlays.map((overlay) => [`${overlay.definitionKind}:${overlay.definitionId}`, overlay]));
    expect(overlays.get("UNIT:unit-heavy-air-transport")).toMatchObject({
      implementationStatus: "PARTIAL",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
    });
    expect(overlays.get("UNIT:unit-vtol")).toMatchObject({
      implementationStatus: "PARTIAL",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
    });
    expect(overlays.get("UNIT:unit-logi-truck")).toMatchObject({
      implementationStatus: "PARTIAL",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
    });
    expect(overlays.get("UNIT:unit-infantry-fighting-vehicle")).toMatchObject({
      implementationStatus: "PARTIAL",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
    });
    expect(overlays.get("UNIT:unit-light-mech")).toMatchObject({
      implementationStatus: "PARTIAL",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
    });
    for (const equipmentId of ["equipment-drone-operator", "equipment-vehicle-optics"]) {
      expect(overlays.get(`EQUIPMENT:${equipmentId}`)).toMatchObject({
        implementationStatus: "PARTIAL",
        availabilityStatus: "BLOCKED",
        executable: false,
        purchasable: false,
        handlerId: null,
      });
    }
    expect(content.overlays.filter((overlay) => overlay.executable).map((overlay) => `${overlay.definitionKind}:${overlay.definitionId}`)).toEqual([
      "ACTION:action-airdrop",
      "ACTION:action-artillery-dig-in",
      "ACTION:action-attack",
      "ACTION:action-bombardment",
      "ACTION:action-construct",
      "ACTION:action-crew-repair",
      "ACTION:action-deploy-platform",
      "ACTION:action-dig-in",
      "ACTION:action-first-aid",
      "ACTION:action-land",
      "ACTION:action-load-cargo",
      "ACTION:action-pack-platform",
      "ACTION:action-rearm-aerospace",
      "ACTION:action-reload",
      "ACTION:action-repair",
      "ACTION:action-take-off",
      "ACTION:action-transfer-supply",
      "ACTION:action-trench-upgrade",
      "ACTION:action-unload-cargo",
      "EQUIPMENT:equipment-flak-vests",
      "EQUIPMENT:equipment-light-at",
      "ORDER:order-advance",
      "ORDER:order-evasive",
      "ORDER:order-hold",
      "ORDER:order-rush",
      "STRUCTURE:structure-razor-wire",
      "STRUCTURE:structure-sandbag-line",
      "STRUCTURE:structure-tank-traps",
      "STRUCTURE:structure-trench",
      "UNIT:unit-aerospace-bomber",
      "UNIT:unit-aerospace-fighter",
      "UNIT:unit-artillery",
      "UNIT:unit-combat-medic",
      "UNIT:unit-engineers",
      "UNIT:unit-heavy-air-transport",
      "UNIT:unit-infantry-fighting-vehicle",
      "UNIT:unit-infantry-squad",
      "UNIT:unit-light-mech",
      "UNIT:unit-light-vehicle",
      "UNIT:unit-logi-truck",
      "UNIT:unit-main-battle-tank",
      "UNIT:unit-vtol",
    ]);
    expect(content.handlers.map((handler) => handler.id)).toEqual([
      "foundation-generated-unit-class",
      "foundation-order-handler",
      "foundation-action-handler",
      "foundation-fieldwork-handler",
      "equipment-effect-flak-vests",
      "equipment-effect-light-at",
    ]);
  });
});

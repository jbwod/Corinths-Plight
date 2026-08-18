import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { canonicalJson } from "../../domain/src/json-contract";
import { parseRulesCatalogueEnvelope } from "../../domain/src/rules-catalogue-contract";
import {
  V5_CORE_CURATED_2_CATALOGUE,
  V5_CORE_CURATED_2_CONTENT_HASH,
} from "../src/generated/v5-core-curated-2";
import { getUnitClass } from "../src/catalogue";
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
      units: 29,
      weapons: 29,
      equipment: 106,
      actions: 34,
      orders: 6,
      structures: 7,
      terrain: 4,
      ships: 4,
      enemies: 7,
    });
    expect(legacyTopLevelDefinitionCount(snapshot)).toBe(226);
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
        "unit-heavy-artillery",
        "unit-heavy-battle-tank",
        "unit-heavy-mech",
        "unit-irregular",
        "unit-light-artillery",
        "unit-light-battle-tank",
        "unit-mechanized-infantry",
        "unit-medium-mech",
        "unit-power-armoured-infantry",
        "unit-sappers",
        "unit-self-propelled-artillery",
        "unit-special-forces",
        "unit-super-heavy-tank",
        "unit-vtol-heavy-lift",
        "unit-vtol-multipurpose-airlift",
        "unit-vtol-troop-airlift",
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
    expect(content.companionUnitIds).toHaveLength(16);
    expect([
      ...content.units, ...content.weapons, ...content.equipment, ...content.actions,
      ...content.orders, ...content.structures, ...content.terrain, ...content.ships, ...content.enemies,
    ]).toHaveLength(226);
    expect(content.conflicts).toHaveLength(84);

    const companionIds = new Set(content.companionUnitIds);
    const unitOverlays = content.overlays.filter((overlay) => overlay.definitionKind === "UNIT");
    for (const companionId of companionIds) {
      const overlay = unitOverlays.find((candidate) => candidate.definitionId === companionId)!;
      const definitionStatus = content.units.find((unit) => unit.id === companionId)?.definitionStatus;
      if (overlay.implementationStatus === "CATALOGUE_ONLY") expect(definitionStatus).not.toBe("active");
      else expect(definitionStatus).toBe("active");
      expect(overlay.implementationStatus === "CATALOGUE_ONLY" ? overlay : {
        implementationStatus: overlay.implementationStatus,
        requisitionStatus: overlay.requisitionStatus,
        availabilityStatus: overlay.availabilityStatus,
        executable: overlay.executable,
        purchasable: overlay.purchasable,
        reasonCode: overlay.reasonCode,
      }).toMatchObject(overlay.implementationStatus === "CATALOGUE_ONLY" ? {
        availabilityStatus: "BLOCKED",
        executable: false,
        purchasable: false,
      } : {
        implementationStatus: "IMPLEMENTED",
        requisitionStatus: "PUBLISHED",
        availabilityStatus: "AVAILABLE",
        executable: true,
        purchasable: true,
        reasonCode: null,
      });
    }

    const medic = content.units.find((unit) => unit.id === "unit-combat-medic")!;
    const fighter = content.units.find((unit) => unit.id === "unit-aerospace-fighter")!;
    expect(medic.sourcedNumbers.sensorRange).toEqual({ status: "SCENARIO_DEFINED", value: null });
    expect(fighter.sourcedNumbers.sensorRange).toEqual({ status: "SCENARIO_DEFINED", value: null });
    expect(fighter.parameters.legacyProjectionSensorRange).toBe(0);
    expect(content.units.every((unit) => unit.sourcedNumbers.sensorRange.status === "SCENARIO_DEFINED" && unit.sourcedNumbers.sensorRange.value === null)).toBe(true);
    expect(content.movementProfiles.every((profile) => profile.definitionStatus === "unspecified")).toBe(true);

    const overlays = new Map(content.overlays.map((overlay) => [`${overlay.definitionKind}:${overlay.definitionId}`, overlay]));
    const playerUnitIds = [...content.canonicalUnitIds, ...content.companionUnitIds];
    expect(playerUnitIds).toHaveLength(29);
    for (const definitionId of playerUnitIds) {
      expect(overlays.get(`UNIT:${definitionId}`), definitionId).toMatchObject({
        implementationStatus: "IMPLEMENTED",
        requisitionStatus: "PUBLISHED",
        availabilityStatus: "AVAILABLE",
        executable: true,
        purchasable: true,
        reasonCode: null,
        parameters: { missing: [] },
      });
      expect(getUnitClass(definitionId), definitionId).toMatchObject({
        id: definitionId,
        kind: "unit-class",
        requisitionCost: expect.any(Number),
      });
    }
    expect(overlays.get("UNIT:unit-infantry-squad")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-heavy-air-transport")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-infantry-fighting-vehicle")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-main-battle-tank")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-vtol")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-logi-truck")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    expect(overlays.get("UNIT:unit-light-mech")).toMatchObject({
      implementationStatus: "IMPLEMENTED",
      executable: true,
      handlerId: "foundation-generated-unit-class",
      requisitionStatus: "PUBLISHED",
      availabilityStatus: "AVAILABLE",
      purchasable: true,
      reasonCode: null,
      parameters: { missing: [] },
    });
    for (const aerospaceId of ["unit-aerospace-fighter", "unit-aerospace-bomber"]) {
      expect(overlays.get(`UNIT:${aerospaceId}`)).toMatchObject({
        implementationStatus: "IMPLEMENTED",
        executable: true,
        handlerId: "foundation-generated-unit-class",
        requisitionStatus: "PUBLISHED",
        availabilityStatus: "AVAILABLE",
        purchasable: true,
        reasonCode: null,
        parameters: { missing: [] },
      });
    }
    for (const equipmentId of ["equipment-drone-operator", "equipment-vehicle-optics"]) {
      expect(overlays.get(`EQUIPMENT:${equipmentId}`)).toMatchObject({
        implementationStatus: "PARTIAL",
        availabilityStatus: "BLOCKED",
        executable: false,
        purchasable: false,
        handlerId: null,
      });
    }
    const executableKeys = content.overlays.filter((overlay) => overlay.executable)
      .map((overlay) => `${overlay.definitionKind}:${overlay.definitionId}`);
    expect(executableKeys).toEqual(expect.arrayContaining([
      "UNIT:unit-power-armoured-infantry",
      "ACTION:action-shield-wall-public-v1",
      "ACTION:action-mount-magnetic-clamps-public-v1",
      "ACTION:action-dismount-magnetic-clamps-public-v1",
      "EQUIPMENT:equipment-ballistic-shields",
      "EQUIPMENT:equipment-mech-magnetic-clamps",
      "EQUIPMENT:equipment-power-armour-back-light-laser-public-v1",
    ]));
    expect(new Set(executableKeys).size).toBe(executableKeys.length);
    const handlerIds = content.handlers.map((handler) => handler.id);
    expect(handlerIds).toEqual(expect.arrayContaining([
      "foundation-generated-unit-class",
      "foundation-order-handler",
      "foundation-action-handler",
      "foundation-fieldwork-handler",
      "companion-power-armour-public-v1",
      "equipment-power-armour-public-v1",
    ]));
    expect(new Set(handlerIds).size).toBe(handlerIds.length);
  });
});

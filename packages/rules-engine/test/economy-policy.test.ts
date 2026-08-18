import { describe, expect, it } from "vitest";

import {
  PUBLIC_V1_ECONOMY_POLICY,
  PUBLIC_V1_UNIT_PRICES,
  publicV1CampaignReward,
} from "../../domain/src";
import { V5_CORE_CURATED_2_CATALOGUE } from "../src/generated/v5-core-curated-2";

describe("public-v1 economy policy", () => {
  it("pins the approved opening, charter, reward, and loss values", () => {
    expect(PUBLIC_V1_ECONOMY_POLICY).toMatchObject({
      id: "public-v1-economy@1",
      startingRequisition: 20,
      battalionCharterCost: 20,
      missionReward: 5,
      campaignVictoryReward: 20,
      passiveIncome: 0,
      lossPolicy: "PERMANENT_NO_REFUND",
    });
    expect(publicV1CampaignReward("VICTORY")).toEqual({ mission: 5, campaign: 20, total: 25 });
    expect(publicV1CampaignReward("DEFEAT")).toEqual({ mission: 5, campaign: 0, total: 5 });
  });

  it("prices every canonical and companion public-v1 class", () => {
    expect(Object.keys(PUBLIC_V1_UNIT_PRICES).sort()).toEqual(
      [...V5_CORE_CURATED_2_CATALOGUE.content.canonicalUnitIds, ...V5_CORE_CURATED_2_CATALOGUE.content.companionUnitIds].sort(),
    );
    expect(PUBLIC_V1_UNIT_PRICES).toMatchObject({
      "unit-infantry-squad": 4,
      "unit-artillery": 6,
      "unit-infantry-fighting-vehicle": 8,
      "unit-main-battle-tank": 10,
      "unit-aerospace-fighter": 12,
      "unit-heavy-air-transport": 14,
    });
  });

  it("publishes every priced class through the generated acquisition authority", () => {
    const overlays = new Map<string, (typeof V5_CORE_CURATED_2_CATALOGUE.content.overlays)[number]>(V5_CORE_CURATED_2_CATALOGUE.content.overlays
      .filter((overlay) => overlay.definitionKind === "UNIT")
      .map((overlay) => [overlay.definitionId, overlay]));
    const definitions = new Map<string, (typeof V5_CORE_CURATED_2_CATALOGUE.content.units)[number]>(V5_CORE_CURATED_2_CATALOGUE.content.units
      .map((definition) => [definition.id, definition]));

    for (const [definitionId, price] of Object.entries(PUBLIC_V1_UNIT_PRICES)) {
      expect(definitions.get(definitionId)?.sourcedNumbers.requisitionCost).toEqual({ status: "PUBLISHED", value: price });
      const overlay = overlays.get(definitionId);
      expect(overlay).toMatchObject({ requisitionStatus: "PUBLISHED", availabilityStatus: "AVAILABLE", purchasable: true, executable: true });
    }
  });
});

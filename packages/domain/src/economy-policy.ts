export const PUBLIC_V1_ECONOMY_POLICY_ID = "public-v1-economy@1" as const;

export const PUBLIC_V1_ECONOMY_POLICY = Object.freeze({
  id: PUBLIC_V1_ECONOMY_POLICY_ID,
  startingRequisition: 20,
  battalionCharterCost: 20,
  missionReward: 5,
  campaignVictoryReward: 20,
  lossPolicy: "PERMANENT_NO_REFUND",
  replacementPolicy: "FRESH_PURCHASE_OR_EXPLICIT_GRANT",
  passiveIncome: 0,
} as const);

export const PUBLIC_V1_UNIT_PRICES = Object.freeze({
  "unit-infantry-squad": 4,
  "unit-combat-medic": 4,
  "unit-engineers": 4,
  "unit-artillery": 6,
  "unit-logi-truck": 6,
  "unit-light-vehicle": 8,
  "unit-infantry-fighting-vehicle": 8,
  "unit-main-battle-tank": 10,
  "unit-light-mech": 10,
  "unit-vtol": 10,
  "unit-aerospace-fighter": 12,
  "unit-aerospace-bomber": 12,
  "unit-heavy-air-transport": 14,
} as const);

export type PublicV1UnitDefinitionId = keyof typeof PUBLIC_V1_UNIT_PRICES;

export function publicV1CampaignReward(result: "VICTORY" | "DEFEAT"): {
  mission: number;
  campaign: number;
  total: number;
} {
  const mission = PUBLIC_V1_ECONOMY_POLICY.missionReward;
  const campaign = result === "VICTORY" ? PUBLIC_V1_ECONOMY_POLICY.campaignVictoryReward : 0;
  return { mission, campaign, total: mission + campaign };
}

export interface CompanionArmourUiProfile {
  definitionId: string;
  requisitionCost: number;
  attackLabel: string;
  capabilityLabel: string;
}

const profiles = new Map<string, CompanionArmourUiProfile>([
  ["unit-mechanized-infantry", {
    definitionId: "unit-mechanized-infantry",
    requisitionCost: 10,
    attackLabel: "D4 autocannon · Range 2",
    capabilityLabel: "Forward Line control · Infantry + Vehicle equipment",
  }],
  ["unit-light-battle-tank", {
    definitionId: "unit-light-battle-tank",
    requisitionCost: 10,
    attackLabel: "D4 · AP 2 · Range 2",
    capabilityLabel: "Rear weak spot · HAT clear airdrop",
  }],
  ["unit-heavy-battle-tank", {
    definitionId: "unit-heavy-battle-tank",
    requisitionCost: 14,
    attackLabel: "D8 · AP 2 · Range 3",
    capabilityLabel: "Rear weak spot · Heavy Lift transport",
  }],
  ["unit-super-heavy-tank", {
    definitionId: "unit-super-heavy-tank",
    requisitionCost: 20,
    attackLabel: "2 × D8 · AP 5 · Range 3 · Primary",
    capabilityLabel: "Dual cannon activation · Heavy Lift only",
  }],
  ["unit-medium-mech", {
    definitionId: "unit-medium-mech",
    requisitionCost: 14,
    attackLabel: "select fitted mech weapons · Primary",
    capabilityLabel: "Leg-height LOS · crouch cover · Supply Point reload",
  }],
  ["unit-heavy-mech", {
    definitionId: "unit-heavy-mech",
    requisitionCost: 18,
    attackLabel: "fire any fitted weapon subset · Primary",
    capabilityLabel: "Leg-height LOS · three external mounts · Supply Point reload",
  }],
]);

export function getCompanionArmourUiProfile(definitionId: string): CompanionArmourUiProfile | undefined {
  const profile = profiles.get(definitionId);
  return profile ? { ...profile } : undefined;
}

export function companionArmourIntentSummary(
  definitionId: string,
  targetCallsign: string,
): string | undefined {
  const profile = getCompanionArmourUiProfile(definitionId);
  if (!profile) return undefined;
  return `engage ${targetCallsign} with ${profile.attackLabel}`;
}

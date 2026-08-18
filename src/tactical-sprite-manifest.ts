import aerospaceBomberSprite from "./assets/tactical-sprites/generated/unit-aerospace-bomber.png";
import aerospaceFighterSprite from "./assets/tactical-sprites/generated/unit-aerospace-fighter.png";
import artillerySprite from "./assets/tactical-sprites/generated/unit-artillery.png";
import combatMedicSprite from "./assets/tactical-sprites/generated/unit-combat-medic.png";
import engineersSprite from "./assets/tactical-sprites/generated/unit-engineers.png";
import bugArtillerySprite from "./assets/tactical-sprites/generated/enemy-bug-artillery.png";
import bugBurrowerSprite from "./assets/tactical-sprites/generated/enemy-bug-burrower.png";
import bugDroneSprite from "./assets/tactical-sprites/generated/enemy-bug-drone.png";
import bugFlyerSprite from "./assets/tactical-sprites/generated/enemy-bug-flyer.png";
import bugHeavySprite from "./assets/tactical-sprites/generated/enemy-bug-heavy.png";
import bugSpitterSprite from "./assets/tactical-sprites/generated/enemy-bug-spitter.png";
import bugWarriorSprite from "./assets/tactical-sprites/generated/enemy-bug-warrior.png";
import heavyAirTransportSprite from "./assets/tactical-sprites/generated/unit-heavy-air-transport.png";
import heavyArtillerySprite from "./assets/tactical-sprites/generated/unit-heavy-artillery.png";
import heavyBattleTankSprite from "./assets/tactical-sprites/generated/unit-heavy-battle-tank.png";
import heavyMechSprite from "./assets/tactical-sprites/generated/unit-heavy-mech-v3.png";
import infantryFightingVehicleSprite from "./assets/tactical-sprites/generated/unit-infantry-fighting-vehicle.png";
import infantrySquadSprite from "./assets/tactical-sprites/generated/unit-infantry-squad.png";
import irregularSprite from "./assets/tactical-sprites/generated/unit-irregular.png";
import lightArtillerySprite from "./assets/tactical-sprites/generated/unit-light-artillery.png";
import lightBattleTankSprite from "./assets/tactical-sprites/generated/unit-light-battle-tank.png";
import lightMechSprite from "./assets/tactical-sprites/generated/unit-light-mech-v3.png";
import lightVehicleSprite from "./assets/tactical-sprites/generated/unit-light-vehicle.png";
import logisticsTruckSprite from "./assets/tactical-sprites/generated/unit-logi-truck.png";
import mainBattleTankSprite from "./assets/tactical-sprites/generated/unit-main-battle-tank.png";
import mechanizedInfantrySprite from "./assets/tactical-sprites/generated/unit-mechanized-infantry.png";
import mediumMechSprite from "./assets/tactical-sprites/generated/unit-medium-mech-v4.png";
import powerArmouredInfantrySprite from "./assets/tactical-sprites/generated/unit-power-armoured-infantry.png";
import sappersSprite from "./assets/tactical-sprites/generated/unit-sappers.png";
import selfPropelledArtillerySprite from "./assets/tactical-sprites/generated/unit-self-propelled-artillery.png";
import specialForcesSprite from "./assets/tactical-sprites/generated/unit-special-forces.png";
import superHeavyTankSprite from "./assets/tactical-sprites/generated/unit-super-heavy-tank.png";
import vtolHeavyLiftSprite from "./assets/tactical-sprites/generated/unit-vtol-heavy-lift.png";
import vtolMultipurposeAirliftSprite from "./assets/tactical-sprites/generated/unit-vtol-multipurpose-airlift.png";
import vtolSprite from "./assets/tactical-sprites/generated/unit-vtol.png";
import vtolTroopAirliftSprite from "./assets/tactical-sprites/generated/unit-vtol-troop-airlift.png";

export type TacticalSpriteVisualQaStatus = "PASS" | "PROVISIONAL";

export interface ActiveTacticalSpriteAsset {
  definitionId: string;
  revisionId: string;
  src: string;
  visualQa: TacticalSpriteVisualQaStatus;
}

/**
 * This is the only runtime tactical-sprite allowlist. Keep inactive revisions in
 * the provenance manifest without importing them here so Vite cannot include
 * them in the client asset graph.
 */
export const ACTIVE_TACTICAL_SPRITE_ASSETS = [
  { definitionId: "enemy-bug-artillery", revisionId: "enemy-bug-artillery", src: bugArtillerySprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-burrower", revisionId: "enemy-bug-burrower", src: bugBurrowerSprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-drone", revisionId: "enemy-bug-drone", src: bugDroneSprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-flyer", revisionId: "enemy-bug-flyer", src: bugFlyerSprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-heavy", revisionId: "enemy-bug-heavy", src: bugHeavySprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-spitter", revisionId: "enemy-bug-spitter", src: bugSpitterSprite, visualQa: "PROVISIONAL" },
  { definitionId: "enemy-bug-warrior", revisionId: "enemy-bug-warrior", src: bugWarriorSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-aerospace-bomber", revisionId: "unit-aerospace-bomber", src: aerospaceBomberSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-aerospace-fighter", revisionId: "unit-aerospace-fighter", src: aerospaceFighterSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-artillery", revisionId: "unit-artillery", src: artillerySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-combat-medic", revisionId: "unit-combat-medic", src: combatMedicSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-engineers", revisionId: "unit-engineers", src: engineersSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-heavy-air-transport", revisionId: "unit-heavy-air-transport", src: heavyAirTransportSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-heavy-artillery", revisionId: "unit-heavy-artillery", src: heavyArtillerySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-heavy-battle-tank", revisionId: "unit-heavy-battle-tank", src: heavyBattleTankSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-heavy-mech", revisionId: "unit-heavy-mech-v3", src: heavyMechSprite, visualQa: "PASS" },
  { definitionId: "unit-infantry-fighting-vehicle", revisionId: "unit-infantry-fighting-vehicle", src: infantryFightingVehicleSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-infantry-squad", revisionId: "unit-infantry-squad", src: infantrySquadSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-irregular", revisionId: "unit-irregular", src: irregularSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-light-artillery", revisionId: "unit-light-artillery", src: lightArtillerySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-light-battle-tank", revisionId: "unit-light-battle-tank", src: lightBattleTankSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-light-mech", revisionId: "unit-light-mech-v3", src: lightMechSprite, visualQa: "PASS" },
  { definitionId: "unit-light-vehicle", revisionId: "unit-light-vehicle", src: lightVehicleSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-logi-truck", revisionId: "unit-logi-truck", src: logisticsTruckSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-main-battle-tank", revisionId: "unit-main-battle-tank", src: mainBattleTankSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-mechanized-infantry", revisionId: "unit-mechanized-infantry", src: mechanizedInfantrySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-medium-mech", revisionId: "unit-medium-mech-v4", src: mediumMechSprite, visualQa: "PASS" },
  { definitionId: "unit-power-armoured-infantry", revisionId: "unit-power-armoured-infantry", src: powerArmouredInfantrySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-sappers", revisionId: "unit-sappers", src: sappersSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-self-propelled-artillery", revisionId: "unit-self-propelled-artillery", src: selfPropelledArtillerySprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-special-forces", revisionId: "unit-special-forces", src: specialForcesSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-super-heavy-tank", revisionId: "unit-super-heavy-tank", src: superHeavyTankSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-vtol", revisionId: "unit-vtol", src: vtolSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-vtol-heavy-lift", revisionId: "unit-vtol-heavy-lift", src: vtolHeavyLiftSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-vtol-multipurpose-airlift", revisionId: "unit-vtol-multipurpose-airlift", src: vtolMultipurposeAirliftSprite, visualQa: "PROVISIONAL" },
  { definitionId: "unit-vtol-troop-airlift", revisionId: "unit-vtol-troop-airlift", src: vtolTroopAirliftSprite, visualQa: "PROVISIONAL" },
] as const satisfies readonly ActiveTacticalSpriteAsset[];

const ACTIVE_TACTICAL_SPRITE_BY_DEFINITION = new Map<string, ActiveTacticalSpriteAsset>(
  ACTIVE_TACTICAL_SPRITE_ASSETS.map((asset) => [asset.definitionId, asset] as const),
);

export function findActiveTacticalSpriteAsset(definitionId: string): ActiveTacticalSpriteAsset | undefined {
  return ACTIVE_TACTICAL_SPRITE_BY_DEFINITION.get(definitionId);
}

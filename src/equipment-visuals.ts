import aerospaceAfterburnerArt from "./assets/equipment-art/generated/aerospace-afterburner.png";
import aerospaceSidewinderArt from "./assets/equipment-art/generated/aerospace-sidewinder.png";
import aerospaceStorageArt from "./assets/equipment-art/generated/aerospace-storage.png";
import apAmmoArt from "./assets/equipment-art/generated/ap-ammo.png";
import armoryArt from "./assets/equipment-art/generated/armory.png";
import carrierFlightDeckArt from "./assets/equipment-art/generated/carrier-flight-deck.png";
import clusterBombsArt from "./assets/equipment-art/generated/cluster-bombs.png";
import droneOperatorArt from "./assets/equipment-art/generated/drone-operator.png";
import flakVestsArt from "./assets/equipment-art/generated/flak-vests.png";
import heavyGroundVehicleBayArt from "./assets/equipment-art/generated/heavy-ground-vehicle-bay.png";
import k9ScoutsArt from "./assets/equipment-art/generated/k9-scouts.png";
import lightAtArt from "./assets/equipment-art/generated/light-at.png";
import mechBayArt from "./assets/equipment-art/generated/mech-bay.png";
import mechLightLaserArt from "./assets/equipment-art/generated/mech-light-laser.png";
import mobileInfantryArt from "./assets/equipment-art/generated/mobile-infantry.png";
import orbitalDropTrainingArt from "./assets/equipment-art/generated/orbital-drop-training.png";
import roadBuildingArt from "./assets/equipment-art/generated/road-building.png";
import silentSmgsArt from "./assets/equipment-art/generated/silent-smgs-v2.png";
import simpleMedStimpacksArt from "./assets/equipment-art/generated/simple-med-stimpacks.png";
import smokeLauncherArt from "./assets/equipment-art/generated/smoke-launcher.png";
import vehicleOpticsArt from "./assets/equipment-art/generated/vehicle-optics.png";
import vtolBayArt from "./assets/equipment-art/generated/vtol-bay.png";

export interface EquipmentVisualDefinition {
  assetKey: string;
  definitionId: string;
  label: string;
  slot: string;
  artSrc: string;
}

export const EQUIPMENT_VISUALS = [
  { assetKey: "equipment.aerospace-afterburner", definitionId: "equipment-aerospace-afterburner", label: "Afterburner", slot: "INTERNAL", artSrc: aerospaceAfterburnerArt },
  { assetKey: "equipment.aerospace-sidewinder", definitionId: "equipment-aerospace-sidewinder", label: "Sidewinder AA Missile", slot: "LIGHT", artSrc: aerospaceSidewinderArt },
  { assetKey: "equipment.aerospace-storage", definitionId: "equipment-aerospace-storage", label: "Aerospace Storage Hangar", slot: "INTERNAL", artSrc: aerospaceStorageArt },
  { assetKey: "equipment.ap-ammo", definitionId: "equipment-ap-ammo", label: "AP Ammo", slot: "AMMO", artSrc: apAmmoArt },
  { assetKey: "equipment.armory", definitionId: "equipment-armory", label: "Armory", slot: "INTERNAL", artSrc: armoryArt },
  { assetKey: "equipment.carrier-flight-deck", definitionId: "equipment-carrier-flight-deck", label: "Carrier Flight Deck", slot: "EXTERNAL", artSrc: carrierFlightDeckArt },
  { assetKey: "equipment.cluster-bombs", definitionId: "equipment-cluster-bombs", label: "Cluster Bombs", slot: "BOMB BAY", artSrc: clusterBombsArt },
  { assetKey: "equipment.drone-operator", definitionId: "equipment-drone-operator", label: "Drone Operator", slot: "SECONDARY", artSrc: droneOperatorArt },
  { assetKey: "equipment.flak-vests", definitionId: "equipment-flak-vests", label: "Flak Vests", slot: "SECONDARY", artSrc: flakVestsArt },
  { assetKey: "equipment.heavy-ground-vehicle-bay", definitionId: "equipment-heavy-ground-vehicle-bay", label: "Heavy Ground Vehicle Bay", slot: "INTERNAL", artSrc: heavyGroundVehicleBayArt },
  { assetKey: "equipment.k9-scouts", definitionId: "equipment-k9-scouts", label: "K-9 Scouts", slot: "PRIMARY", artSrc: k9ScoutsArt },
  { assetKey: "equipment.light-at", definitionId: "equipment-light-at", label: "Lightweight Anti-armour Weapon", slot: "PRIMARY", artSrc: lightAtArt },
  { assetKey: "equipment.mech-bay", definitionId: "equipment-mech-bay", label: "Mech Bay", slot: "EXTERNAL", artSrc: mechBayArt },
  { assetKey: "equipment.mech-light-laser", definitionId: "equipment-mech-light-laser", label: "Light Laser Setup", slot: "EXTERNAL", artSrc: mechLightLaserArt },
  { assetKey: "equipment.mobile-infantry", definitionId: "equipment-mobile-infantry", label: "Mobile Infantry Upgrade", slot: "EXTERNAL / INTERNAL", artSrc: mobileInfantryArt },
  { assetKey: "equipment.orbital-drop-training", definitionId: "equipment-orbital-drop-training", label: "Orbital Drop Training", slot: "UPGRADE", artSrc: orbitalDropTrainingArt },
  { assetKey: "equipment.road-building", definitionId: "equipment-road-building", label: "Road Building Equipment", slot: "ENGINEER", artSrc: roadBuildingArt },
  { assetKey: "equipment.silent-smgs", definitionId: "equipment-silent-smgs", label: "Silent SMGs", slot: "PRIMARY", artSrc: silentSmgsArt },
  { assetKey: "equipment.simple-med-stimpacks", definitionId: "equipment-simple-med-stimpacks", label: "Simple Med-Stimpacks", slot: "MEDICAL", artSrc: simpleMedStimpacksArt },
  { assetKey: "equipment.smoke-launcher", definitionId: "equipment-smoke-launcher", label: "Smoke Launcher", slot: "SECONDARY", artSrc: smokeLauncherArt },
  { assetKey: "equipment.vehicle-optics", definitionId: "equipment-vehicle-optics", label: "Vehicle Optics", slot: "INTERNAL", artSrc: vehicleOpticsArt },
  { assetKey: "equipment.vtol-bay", definitionId: "equipment-vtol-bay", label: "VTOL Bay", slot: "EXTERNAL", artSrc: vtolBayArt },
] as const satisfies readonly EquipmentVisualDefinition[];

const EQUIPMENT_VISUAL_BY_ID = new Map<string, EquipmentVisualDefinition>(EQUIPMENT_VISUALS.map((visual) => [visual.definitionId, visual]));

export function findEquipmentVisual(definitionId: string): EquipmentVisualDefinition | undefined {
  return EQUIPMENT_VISUAL_BY_ID.get(definitionId);
}

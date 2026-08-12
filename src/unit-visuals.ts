import aerospaceBomberArt from "./assets/unit-art/generated/aerospace-bomber.png";
import aerospaceFighterArt from "./assets/unit-art/generated/aerospace-fighter.png";
import artilleryArt from "./assets/unit-art/generated/artillery.png";
import combatEngineersArt from "./assets/unit-art/generated/combat-engineers.png";
import combatMedicArt from "./assets/unit-art/generated/combat-medic.png";
import heavyAirTransportArt from "./assets/unit-art/generated/heavy-air-transport.png";
import heavyArtilleryArt from "./assets/unit-art/generated/heavy-artillery.png";
import heavyBattleTankArt from "./assets/unit-art/generated/heavy-battle-tank.png";
import heavyMechArt from "./assets/unit-art/generated/heavy-mech.png";
import infantryFightingVehicleArt from "./assets/unit-art/generated/infantry-fighting-vehicle.png";
import infantryArt from "./assets/unit-art/generated/infantry.png";
import irregularInfantryArt from "./assets/unit-art/generated/irregular-infantry.png";
import lightArtilleryArt from "./assets/unit-art/generated/light-artillery.png";
import lightBattleTankArt from "./assets/unit-art/generated/light-battle-tank.png";
import lightMechArt from "./assets/unit-art/generated/light-mech.png";
import lightVehicleArt from "./assets/unit-art/generated/light-vehicle.png";
import logiTruckArt from "./assets/unit-art/generated/logi-truck.png";
import mainBattleTankArt from "./assets/unit-art/generated/main-battle-tank.png";
import mechanizedInfantryArt from "./assets/unit-art/generated/mechanized-infantry.png";
import mediumMechArt from "./assets/unit-art/generated/medium-mech.png";
import powerArmouredInfantryArt from "./assets/unit-art/generated/power-armoured-infantry.png";
import sappersArt from "./assets/unit-art/generated/sappers.png";
import selfPropelledArtilleryArt from "./assets/unit-art/generated/self-propelled-artillery.png";
import specialForcesArt from "./assets/unit-art/generated/special-forces.png";
import superHeavyTankArt from "./assets/unit-art/generated/super-heavy-tank.png";
import vtolArt from "./assets/unit-art/generated/vtol.png";
import vtolHeavyLiftArt from "./assets/unit-art/generated/vtol-heavy-lift.png";
import vtolMultipurposeAirliftArt from "./assets/unit-art/generated/vtol-multipurpose-airlift.png";
import vtolTroopAirliftArt from "./assets/unit-art/generated/vtol-troop-airlift.png";

export type TacticalUnitGlyphKind =
  | "INFANTRY"
  | "MEDIC"
  | "ENGINEER"
  | "ARTILLERY"
  | "LOGISTICS"
  | "RECON"
  | "IFV"
  | "TANK"
  | "MECH"
  | "VTOL"
  | "FIGHTER"
  | "BOMBER"
  | "TRANSPORT"
  | "BIOLOGICAL"
  | "UNKNOWN";

export interface UnitVisualDefinition {
  assetKey: string;
  definitionId: string;
  aliases: readonly string[];
  label: string;
  shortCode: string;
  tacticalGlyph: TacticalUnitGlyphKind;
  artSrc: string;
}

const CATALOGUED_UNIT_VISUALS = [
  { assetKey: "unit.infantry", definitionId: "unit-infantry-squad", aliases: [], label: "Infantry", shortCode: "INF", tacticalGlyph: "INFANTRY", artSrc: infantryArt },
  { assetKey: "unit.combat-medic", definitionId: "unit-combat-medic", aliases: [], label: "Combat Medic", shortCode: "MED", tacticalGlyph: "MEDIC", artSrc: combatMedicArt },
  { assetKey: "unit.combat-engineers", definitionId: "unit-engineers", aliases: ["unit-combat-engineers"], label: "Combat Engineers", shortCode: "ENG", tacticalGlyph: "ENGINEER", artSrc: combatEngineersArt },
  { assetKey: "unit.artillery", definitionId: "unit-artillery", aliases: ["unit-light-artillery"], label: "Artillery", shortCode: "ART", tacticalGlyph: "ARTILLERY", artSrc: artilleryArt },
  { assetKey: "unit.logi-truck", definitionId: "unit-logi-truck", aliases: ["unit-logistics-vehicle"], label: "Logistics Truck", shortCode: "LOG", tacticalGlyph: "LOGISTICS", artSrc: logiTruckArt },
  { assetKey: "unit.light-vehicle", definitionId: "unit-light-vehicle", aliases: [], label: "Light Vehicle", shortCode: "REC", tacticalGlyph: "RECON", artSrc: lightVehicleArt },
  { assetKey: "unit.infantry-fighting-vehicle", definitionId: "unit-infantry-fighting-vehicle", aliases: [], label: "Infantry Fighting Vehicle", shortCode: "IFV", tacticalGlyph: "IFV", artSrc: infantryFightingVehicleArt },
  { assetKey: "unit.main-battle-tank", definitionId: "unit-main-battle-tank", aliases: [], label: "Main Battle Tank", shortCode: "MBT", tacticalGlyph: "TANK", artSrc: mainBattleTankArt },
  { assetKey: "unit.light-mech", definitionId: "unit-light-mech", aliases: [], label: "Light Mech", shortCode: "MCH", tacticalGlyph: "MECH", artSrc: lightMechArt },
  { assetKey: "unit.vtol", definitionId: "unit-vtol", aliases: [], label: "VTOL", shortCode: "VTL", tacticalGlyph: "VTOL", artSrc: vtolArt },
  { assetKey: "unit.aerospace-fighter", definitionId: "unit-aerospace-fighter", aliases: [], label: "Aerospace Fighter", shortCode: "FTR", tacticalGlyph: "FIGHTER", artSrc: aerospaceFighterArt },
  { assetKey: "unit.aerospace-bomber", definitionId: "unit-aerospace-bomber", aliases: [], label: "Aerospace Bomber", shortCode: "BMB", tacticalGlyph: "BOMBER", artSrc: aerospaceBomberArt },
  { assetKey: "unit.heavy-air-transport", definitionId: "unit-heavy-air-transport", aliases: ["unit-heavy-aerospace-transport"], label: "Heavy Air Transport", shortCode: "HAT", tacticalGlyph: "TRANSPORT", artSrc: heavyAirTransportArt },
  { assetKey: "unit.power-armoured-infantry", definitionId: "unit-power-armoured-infantry", aliases: [], label: "Power Armoured Infantry", shortCode: "PAI", tacticalGlyph: "INFANTRY", artSrc: powerArmouredInfantryArt },
  { assetKey: "unit.irregular", definitionId: "unit-irregular", aliases: [], label: "Irregular Unit", shortCode: "IRR", tacticalGlyph: "INFANTRY", artSrc: irregularInfantryArt },
  { assetKey: "unit.special-forces", definitionId: "unit-special-forces", aliases: [], label: "Special Forces", shortCode: "SFC", tacticalGlyph: "INFANTRY", artSrc: specialForcesArt },
  { assetKey: "unit.sappers", definitionId: "unit-sappers", aliases: [], label: "Sappers", shortCode: "SAP", tacticalGlyph: "ENGINEER", artSrc: sappersArt },
  { assetKey: "unit.mechanized-infantry", definitionId: "unit-mechanized-infantry", aliases: [], label: "Mechanized Infantry", shortCode: "MIF", tacticalGlyph: "IFV", artSrc: mechanizedInfantryArt },
  { assetKey: "unit.light-battle-tank", definitionId: "unit-light-battle-tank", aliases: [], label: "Light Battle Tank", shortCode: "LBT", tacticalGlyph: "TANK", artSrc: lightBattleTankArt },
  { assetKey: "unit.heavy-battle-tank", definitionId: "unit-heavy-battle-tank", aliases: [], label: "Heavy Battle Tank", shortCode: "HBT", tacticalGlyph: "TANK", artSrc: heavyBattleTankArt },
  { assetKey: "unit.super-heavy-tank", definitionId: "unit-super-heavy-tank", aliases: [], label: "Super Heavy Tank", shortCode: "SHT", tacticalGlyph: "TANK", artSrc: superHeavyTankArt },
  { assetKey: "unit.light-artillery", definitionId: "unit-light-artillery", aliases: [], label: "Light Artillery", shortCode: "LAR", tacticalGlyph: "ARTILLERY", artSrc: lightArtilleryArt },
  { assetKey: "unit.heavy-artillery", definitionId: "unit-heavy-artillery", aliases: [], label: "Heavy Artillery", shortCode: "HAR", tacticalGlyph: "ARTILLERY", artSrc: heavyArtilleryArt },
  { assetKey: "unit.self-propelled-artillery", definitionId: "unit-self-propelled-artillery", aliases: [], label: "Self-Propelled Artillery", shortCode: "SPA", tacticalGlyph: "ARTILLERY", artSrc: selfPropelledArtilleryArt },
  { assetKey: "unit.vtol-troop-airlift", definitionId: "unit-vtol-troop-airlift", aliases: [], label: "VTOL Heavy Troop Airlift", shortCode: "VTA", tacticalGlyph: "VTOL", artSrc: vtolTroopAirliftArt },
  { assetKey: "unit.vtol-multipurpose-airlift", definitionId: "unit-vtol-multipurpose-airlift", aliases: [], label: "VTOL Multi-Purpose Airlift", shortCode: "VMP", tacticalGlyph: "VTOL", artSrc: vtolMultipurposeAirliftArt },
  { assetKey: "unit.vtol-heavy-lift", definitionId: "unit-vtol-heavy-lift", aliases: [], label: "VTOL Heavy Lift", shortCode: "VHL", tacticalGlyph: "VTOL", artSrc: vtolHeavyLiftArt },
  { assetKey: "unit.medium-mech", definitionId: "unit-medium-mech", aliases: [], label: "Medium Mech", shortCode: "MMC", tacticalGlyph: "MECH", artSrc: mediumMechArt },
  { assetKey: "unit.heavy-mech", definitionId: "unit-heavy-mech", aliases: [], label: "Heavy Mech", shortCode: "HMC", tacticalGlyph: "MECH", artSrc: heavyMechArt },
] as const satisfies readonly UnitVisualDefinition[];

export const UNIT_VISUALS: readonly UnitVisualDefinition[] = CATALOGUED_UNIT_VISUALS;

const UNIT_VISUAL_BY_ID = new Map<string, UnitVisualDefinition>();
for (const visual of CATALOGUED_UNIT_VISUALS) {
  UNIT_VISUAL_BY_ID.set(visual.definitionId, visual);
  for (const alias of visual.aliases) UNIT_VISUAL_BY_ID.set(alias, visual);
}

export const TACTICAL_UNIT_GLYPH_PATHS: Readonly<Record<TacticalUnitGlyphKind, string>> = {
  INFANTRY: "M8 24v-5l4-3 4 3v5M12 16v-5l4-3 4 3v5M20 24v-5l4-3 4 3v5",
  MEDIC: "M16 6v20M6 16h20",
  ENGINEER: "M7 25L25 7M8 7h7M25 17v8h-8M12 20l-4 4",
  ARTILLERY: "M5 24h22M9 22l5-7h9M16 15l10-9M9 11h8M11 25v2M23 25v2",
  LOGISTICS: "M6 8h9v7H6zM17 8h9v7h-9zM11 17h10v9H11z",
  RECON: "M16 5L27 16 16 27 5 16zM11 16a5 5 0 1 0 10 0 5 5 0 1 0-10 0M16 13v6M13 16h6",
  IFV: "M5 13h21v10H5zM10 9h10v4H10zM20 11h7M9 26h14M10 18h3M16 18h3",
  TANK: "M5 14h22v10H5zM11 10h10v5H11zM20 12h8M9 27h14M9 19h14",
  MECH: "M10 7h12v10H10zM12 17l-3 10M20 17l3 10M9 27h5M18 27h5M7 11h3M22 11h3",
  VTOL: "M4 11a6 6 0 1 0 12 0 6 6 0 1 0-12 0M16 11h4M20 11a6 6 0 1 0 12 0 6 6 0 1 0-12 0M12 17l4 9 4-9M16 8v18",
  FIGHTER: "M16 4l4 9 9 6-10-2-3 11-3-11-10 2 9-6z",
  BOMBER: "M16 5l4 8 11 7-12-2-3 9-3-9-12 2 11-7zM8 15h16",
  TRANSPORT: "M16 4l4 9 11 5-11 1-2 9h-4l-2-9-11-1 11-5zM8 22h16",
  BIOLOGICAL: "M16 5c7 0 11 5 11 11s-4 11-11 11S5 22 5 16 9 5 16 5zM11 14h2M19 14h2M12 21c3-2 5-2 8 0",
  UNKNOWN: "M16 5L27 16 16 27 5 16zM16 10v8M16 23h.01",
};

export interface UnitVisualLookup {
  definitionId: string;
  tags?: readonly string[];
  side?: string;
}

function semanticFallback(input: UnitVisualLookup): Pick<UnitVisualDefinition, "shortCode" | "tacticalGlyph" | "label"> {
  const tags = new Set((input.tags ?? []).map((tag) => tag.toUpperCase()));
  if (tags.has("MEDICAL")) return { shortCode: "MED", tacticalGlyph: "MEDIC", label: "Medical unit" };
  if (tags.has("ENGINEER") || tags.has("BUILDER")) return { shortCode: "ENG", tacticalGlyph: "ENGINEER", label: "Engineer unit" };
  if (tags.has("LOGISTICS")) return { shortCode: "LOG", tacticalGlyph: "LOGISTICS", label: "Logistics unit" };
  if (tags.has("INDIRECT_FIRE") || tags.has("ARTILLERY")) return { shortCode: "ART", tacticalGlyph: "ARTILLERY", label: "Artillery unit" };
  if (tags.has("BOMBER")) return { shortCode: "BMB", tacticalGlyph: "BOMBER", label: "Bomber" };
  if (tags.has("INTERCEPTOR") || tags.has("AEROSPACE_INTERCEPTOR")) return { shortCode: "FTR", tacticalGlyph: "FIGHTER", label: "Aerospace fighter" };
  if (tags.has("VTOL")) return { shortCode: "VTL", tacticalGlyph: "VTOL", label: "VTOL" };
  if (tags.has("AEROSPACE") && tags.has("TRANSPORT")) return { shortCode: "HAT", tacticalGlyph: "TRANSPORT", label: "Aerospace transport" };
  if (tags.has("MECH")) return { shortCode: "MCH", tacticalGlyph: "MECH", label: "Mech" };
  if (tags.has("HEAVY") && (tags.has("VEHICLE") || tags.has("ARMOURED"))) return { shortCode: "MBT", tacticalGlyph: "TANK", label: "Heavy armour" };
  if (tags.has("TRANSPORT") && tags.has("VEHICLE")) return { shortCode: "IFV", tacticalGlyph: "IFV", label: "Armoured transport" };
  if (tags.has("VEHICLE")) return { shortCode: "REC", tacticalGlyph: "RECON", label: "Vehicle" };
  if (tags.has("INFANTRY") || tags.has("PERSONNEL")) return { shortCode: "INF", tacticalGlyph: "INFANTRY", label: "Infantry" };
  if (input.side === "ENEMY") return { shortCode: "BIO", tacticalGlyph: "BIOLOGICAL", label: "Enemy contact" };
  return { shortCode: "UNK", tacticalGlyph: "UNKNOWN", label: "Unknown unit" };
}

export function findUnitVisual(definitionId: string): UnitVisualDefinition | undefined {
  return UNIT_VISUAL_BY_ID.get(definitionId);
}

export function resolveUnitVisual(input: UnitVisualLookup): UnitVisualDefinition | (ReturnType<typeof semanticFallback> & { definitionId: string; assetKey: string; aliases: readonly []; artSrc?: undefined }) {
  const exact = findUnitVisual(input.definitionId);
  if (exact) return exact;
  return {
    assetKey: `unit.fallback.${semanticFallback(input).tacticalGlyph.toLowerCase()}`,
    definitionId: input.definitionId,
    aliases: [],
    artSrc: undefined,
    ...semanticFallback(input),
  };
}

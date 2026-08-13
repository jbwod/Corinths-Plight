import catalogue from "../rules/catalogue/v5-core-curated@2/catalogue.json";

export interface EquipmentVisualDefinition {
  assetKey: string;
  definitionId: string;
  label: string;
  slot: string;
  artSrc: string;
}

const generatedArt = import.meta.glob<string>("./assets/equipment-art/generated/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const assetNameOverrides: Readonly<Record<string, string>> = {
  "equipment-silent-smgs": "silent-smgs-v2",
  "equipment-sponson-machine-gun-turret": "sponson-mg-turret",
  "equipment-grab-handles-and-side-skirts": "grab-handles-side-skirts",
  "equipment-power-armour-back-light-laser-public-v1": "mech-light-laser",
};

function assetName(definitionId: string): string {
  return assetNameOverrides[definitionId] ?? definitionId.replace(/^equipment-/, "");
}

function artFor(definitionId: string): string {
  const name = assetName(definitionId);
  return generatedArt[`./assets/equipment-art/generated/${name}.png`] ?? "";
}

export const EQUIPMENT_VISUALS: readonly EquipmentVisualDefinition[] = catalogue.content.equipment.map((definition) => {
  const parameters = definition.parameters as { slotType?: string; definition?: { storeCatalogue?: { sourceSlot?: string } } };
  const key = definition.id.replace(/^equipment-/, "");
  return {
    assetKey: `equipment.${key}`,
    definitionId: definition.id,
    label: definition.name,
    slot: parameters.definition?.storeCatalogue?.sourceSlot ?? parameters.slotType ?? "EQUIPMENT",
    artSrc: artFor(definition.id),
  };
});

const EQUIPMENT_VISUAL_BY_ID = new Map<string, EquipmentVisualDefinition>(EQUIPMENT_VISUALS.map((visual) => [visual.definitionId, visual]));

export function findEquipmentVisual(definitionId: string): EquipmentVisualDefinition | undefined {
  return EQUIPMENT_VISUAL_BY_ID.get(definitionId);
}

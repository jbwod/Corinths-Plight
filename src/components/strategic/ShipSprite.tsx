import battleshipSprite from "../../../image/units/sprites/orbitals/battleship.png";
import corvetteSprite from "../../../image/units/sprites/orbitals/corvette.png";
import cruiserSprite from "../../../image/units/sprites/orbitals/cruiser.png";
import destroyerSprite from "../../../image/units/sprites/orbitals/destroyer.png";

const SHIP_SPRITES = {
  battleship: battleshipSprite,
  corvette: corvetteSprite,
  cruiser: cruiserSprite,
  destroyer: destroyerSprite,
} as const;

export type ShipSpriteClass = keyof typeof SHIP_SPRITES;

export function shipClassKey(shipClass: string): ShipSpriteClass {
  const normalized = shipClass.toLowerCase();
  if (normalized.includes("battleship")) return "battleship";
  if (normalized.includes("corvette")) return "corvette";
  if (normalized.includes("cruiser")) return "cruiser";
  return "destroyer";
}

interface ShipSpriteProps {
  shipClass: string;
  alt?: string;
  className?: string;
  draggable?: boolean;
}

export function ShipSprite({
  shipClass,
  alt = "",
  className,
  draggable = false,
}: ShipSpriteProps) {
  const classKey = shipClassKey(shipClass);
  return (
    <img
      src={SHIP_SPRITES[classKey]}
      alt={alt}
      className={className}
      data-ship-class={classKey}
      draggable={draggable}
    />
  );
}

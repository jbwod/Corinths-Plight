import { findEquipmentVisual } from "../equipment-visuals";

export function EquipmentIcon({
  definitionId,
  label,
  className,
  decorative = true,
}: {
  definitionId: string;
  label?: string;
  className?: string;
  decorative?: boolean;
}) {
  const visual = findEquipmentVisual(definitionId);
  const accessibleLabel = `${label ?? visual?.label ?? "Unknown equipment"} equipment icon`;
  return (
    <span
      className={`equipment-icon ${className ?? ""}`.trim()}
      data-equipment-visual={visual?.assetKey ?? "equipment.fallback"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      role={decorative ? undefined : "img"}
    >
      {visual
        ? <img src={visual.artSrc} alt="" draggable={false} />
        : <svg className="equipment-icon-fallback" viewBox="0 0 32 32"><path d="M16 4l11 6v12l-11 6-11-6V10zM11 13h10v8H11zM14 10h4" /></svg>}
    </span>
  );
}


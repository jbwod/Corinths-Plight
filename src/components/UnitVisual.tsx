import { resolveUnitVisual, TACTICAL_UNIT_GLYPH_PATHS, type TacticalUnitGlyphKind } from "../unit-visuals";

interface UnitVisualProps {
  definitionId: string;
  label?: string;
  tags?: readonly string[];
  side?: string;
  className?: string;
  decorative?: boolean;
}

export function TacticalUnitGlyph({
  kind,
  label,
  className,
  decorative = true,
}: {
  kind: TacticalUnitGlyphKind;
  label?: string;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      className={className}
      data-tactical-unit-glyph={kind}
      viewBox="0 0 32 32"
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label ?? `${kind.toLowerCase()} tactical unit icon`}
      role={decorative ? undefined : "img"}
    >
      <path d={TACTICAL_UNIT_GLYPH_PATHS[kind]} />
    </svg>
  );
}

export function UnitPortrait({
  definitionId,
  label,
  tags,
  side,
  className,
  decorative = true,
}: UnitVisualProps) {
  const visual = resolveUnitVisual({ definitionId, tags, side });
  const accessibleLabel = `${label ?? visual.label} unit portrait`;
  return (
    <span
      className={`unit-portrait ${className ?? ""}`.trim()}
      data-unit-visual={visual.assetKey}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      role={decorative ? undefined : "img"}
    >
      {visual.artSrc
        ? <img src={visual.artSrc} alt="" draggable={false} />
        : <TacticalUnitGlyph kind={visual.tacticalGlyph} decorative className="unit-portrait-fallback" />}
    </span>
  );
}


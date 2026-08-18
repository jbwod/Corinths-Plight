/**
 * Canonical resource identifiers used by tactical cargo, unit inventories, and
 * action costs. These identifiers are deliberately distinct from the strategic
 * SupplySize vocabulary (SMALL | MEDIUM | LARGE).
 */
export const TACTICAL_SUPPLY_RESOURCE_IDS = [
  "SMALL_SUPPLY",
  "MEDIUM_SUPPLY",
  "LARGE_SUPPLY",
  "MEDICAL_SUPPLY",
  "MAIN_AMMUNITION",
  "BUILD_SUPPLY",
  "GENERAL_SUPPLY",
] as const;

export type TacticalSupplyResourceId = (typeof TACTICAL_SUPPLY_RESOURCE_IDS)[number];

export type TacticalSupplyResourceIdErrorCode =
  | "TACTICAL_SUPPLY_RESOURCE_ID_REQUIRED"
  | "TACTICAL_SUPPLY_RESOURCE_ID_AMBIGUOUS"
  | "TACTICAL_SUPPLY_RESOURCE_ID_NOT_CANONICAL"
  | "TACTICAL_SUPPLY_RESOURCE_ID_UNKNOWN";

const tacticalSupplyResourceIds = new Set<string>(TACTICAL_SUPPLY_RESOURCE_IDS);
const ambiguousStrategicSupplySizes = new Set(["SMALL", "MEDIUM", "LARGE"]);

export class TacticalSupplyResourceIdError extends TypeError {
  readonly code: TacticalSupplyResourceIdErrorCode;
  readonly value: unknown;

  constructor(code: TacticalSupplyResourceIdErrorCode, value: unknown, message: string) {
    super(message);
    this.name = "TacticalSupplyResourceIdError";
    this.code = code;
    this.value = value;
  }
}

export function isTacticalSupplyResourceId(value: unknown): value is TacticalSupplyResourceId {
  return typeof value === "string" && tacticalSupplyResourceIds.has(value);
}

/**
 * Parses a canonical tactical resource identifier without accepting aliases.
 * In particular, strategic SMALL/MEDIUM/LARGE values are ambiguous here and
 * must never be upgraded by silently appending `_SUPPLY`.
 */
export function parseTacticalSupplyResourceId(value: unknown): TacticalSupplyResourceId {
  if (typeof value !== "string" || value.length === 0) {
    throw new TacticalSupplyResourceIdError(
      "TACTICAL_SUPPLY_RESOURCE_ID_REQUIRED",
      value,
      "A tactical supply resource identifier is required.",
    );
  }
  if (isTacticalSupplyResourceId(value)) return value;

  const normalized = value.trim().toUpperCase();
  if (ambiguousStrategicSupplySizes.has(normalized)) {
    throw new TacticalSupplyResourceIdError(
      "TACTICAL_SUPPLY_RESOURCE_ID_AMBIGUOUS",
      value,
      `${JSON.stringify(value)} is a strategic Supply size, not a tactical resource identifier.`,
    );
  }
  if (tacticalSupplyResourceIds.has(normalized)) {
    throw new TacticalSupplyResourceIdError(
      "TACTICAL_SUPPLY_RESOURCE_ID_NOT_CANONICAL",
      value,
      `${JSON.stringify(value)} is not in canonical tactical resource identifier form.`,
    );
  }
  throw new TacticalSupplyResourceIdError(
    "TACTICAL_SUPPLY_RESOURCE_ID_UNKNOWN",
    value,
    `${JSON.stringify(value)} is not a known tactical supply resource identifier.`,
  );
}

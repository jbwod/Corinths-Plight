import {
  TACTICAL_SUPPLY_RESOURCE_IDS,
  parseTacticalSupplyResourceId,
  type SupplyInventory,
} from "../../domain/src";

export class TacticalSupplyInventoryError extends TypeError {
  readonly code:
    | "TACTICAL_SUPPLY_INVENTORY_REQUIRED"
    | "TACTICAL_SUPPLY_QUANTITY_INVALID";
  readonly path: string;

  constructor(
    code: TacticalSupplyInventoryError["code"],
    path: string,
    message: string,
  ) {
    super(`${code} at ${path}: ${message}`);
    this.name = "TacticalSupplyInventoryError";
    this.code = code;
    this.path = path;
  }
}

/**
 * Copies an unknown inventory into canonical resource order. Keys must already
 * be exact tactical IDs; this function deliberately does not translate legacy
 * strategic sizes such as SMALL into SMALL_SUPPLY.
 */
export function normalizeTacticalSupplyInventory(value: unknown, path = "$"): SupplyInventory {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TacticalSupplyInventoryError(
      "TACTICAL_SUPPLY_INVENTORY_REQUIRED",
      path,
      "Expected a tactical supply inventory object.",
    );
  }

  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) parseTacticalSupplyResourceId(key);

  const inventory: SupplyInventory = {};
  for (const resourceId of TACTICAL_SUPPLY_RESOURCE_IDS) {
    if (!(resourceId in source)) continue;
    const quantity = source[resourceId];
    if (!Number.isInteger(quantity) || (quantity as number) < 0) {
      throw new TacticalSupplyInventoryError(
        "TACTICAL_SUPPLY_QUANTITY_INVALID",
        `${path}.${resourceId}`,
        "Supply quantity must be a non-negative integer.",
      );
    }
    inventory[resourceId] = quantity as number;
  }
  return inventory;
}

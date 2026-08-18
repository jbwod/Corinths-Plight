import type { ActionEconomy, ActionType, UnitClassDefinition } from "../../packages/domain/src";
import {
  getPublicV1CompanionTankProfile,
  isCompanionTankDefinitionId,
} from "../../packages/rules-engine/src/companion-tanks";
import { getCompanionMechV1Class } from "../../packages/rules-engine/src/companion-mechs";
import {
  getMechanizedInfantryPublicV1Class,
  MECHANIZED_INFANTRY_DEFINITION_ID,
} from "../../packages/rules-engine/src/mechanized-infantry";

export const COMPANION_TANKS_HANDLER_ID = "companion-tanks-public-v1" as const;
export const COMPANION_MECHANIZED_INFANTRY_HANDLER_ID =
  "companion-mechanized-infantry-public-v1" as const;
export const COMPANION_MECHS_HANDLER_ID = "companion-mechs-public-v1" as const;

/**
 * Server-side projection for the generated catalogue handlers. Sensors remain
 * scenario-owned and are replaced from the D1 authority row after hydration.
 */
export function hydrateCompanionArmourPublicV1(
  handlerId: string,
  definitionId: string,
): UnitClassDefinition {
  if (handlerId === COMPANION_TANKS_HANDLER_ID) {
    if (!isCompanionTankDefinitionId(definitionId)) {
      throw new Error(`Unsupported companion tank definition: ${definitionId}`);
    }
    return getPublicV1CompanionTankProfile(definitionId, 0);
  }
  if (handlerId === COMPANION_MECHANIZED_INFANTRY_HANDLER_ID) {
    if (definitionId !== MECHANIZED_INFANTRY_DEFINITION_ID) {
      throw new Error(`Unsupported Mechanized Infantry definition: ${definitionId}`);
    }
    return getMechanizedInfantryPublicV1Class(0);
  }
  if (handlerId === COMPANION_MECHS_HANDLER_ID) {
    if (definitionId !== "unit-medium-mech" && definitionId !== "unit-heavy-mech") {
      throw new Error(`Unsupported companion mech definition: ${definitionId}`);
    }
    return getCompanionMechV1Class(definitionId, 0);
  }
  throw new Error(`Unsupported companion armour handler: ${handlerId}`);
}

/** Super Heavy dual-cannon fire is one server-owned Primary activation. */
export function companionArmourActionEconomy(
  definitionId: string,
  actionType: ActionType,
  catalogueEconomy: ActionEconomy,
): ActionEconomy {
  return definitionId === "unit-super-heavy-tank" && actionType === "ATTACK"
    ? "PRIMARY"
    : catalogueEconomy;
}

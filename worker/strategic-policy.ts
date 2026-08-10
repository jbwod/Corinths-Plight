import type {
  BattalionPermission,
  StrategicFormationRef,
  StrategicOrderIntent,
} from "../packages/domain/src";

export interface StrategicAuthorityContext {
  userId: string;
  battalionId: string;
  permissions: ReadonlySet<BattalionPermission>;
  formation: StrategicFormationRef;
  formationBelongsToBattalion: boolean;
  isFormationCommander: boolean;
  ownsEveryFormationUnit: boolean;
  hasActiveDelegation: boolean;
}

export type StrategicAuthorityDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

export function requiredPermissionsForStrategicIntent(
  intent: StrategicOrderIntent,
): BattalionPermission[] {
  const required: BattalionPermission[] = ["STRATEGIC_ORDER_CREATE"];
  switch (intent.type) {
    case "MOVE_TASK_FORCE":
      required.push("SHIP_MOVE");
      break;
    case "EMBARK_BATTLEGROUP":
    case "DISEMBARK_BATTLEGROUP":
      required.push("BATTLEGROUP_ASSIGN");
      break;
    case "DEPLOY_TO_CAMPAIGN":
    case "WITHDRAW_FROM_CAMPAIGN":
      required.push("OPERATION_COMMAND");
      break;
    case "TRANSFER_SUPPLY":
    case "RESUPPLY_TASK_FORCE":
      required.push("SUPPLY_MANAGE");
      break;
    case "SUPPORT_CAMPAIGN":
      required.push("OPERATION_COMMAND");
      break;
    case "MOVE_BATTLEGROUP":
    case "ORBITAL_COMBAT":
      break;
  }
  return required;
}

export function authorizeStrategicIntent(
  context: StrategicAuthorityContext,
  intent: StrategicOrderIntent,
): StrategicAuthorityDecision {
  if (!context.formationBelongsToBattalion) {
    return { allowed: false, code: "FORMATION_NOT_FOUND", message: "Formation is not available." };
  }
  for (const permission of requiredPermissionsForStrategicIntent(intent)) {
    if (!context.permissions.has(permission)) {
      return {
        allowed: false,
        code: "BATTALION_PERMISSION_REQUIRED",
        message: `${permission} permission is required.`,
      };
    }
  }
  if (intent.type === "ORBITAL_COMBAT") {
    return {
      allowed: false,
      code: "ORBITAL_COMBAT_DEFERRED",
      message: "Orbital combat is typed for future compatibility but is not executable in Phase 3.",
    };
  }
  if (intent.type === "WITHDRAW_FROM_CAMPAIGN") {
    return {
      allowed: false,
      code: "TACTICAL_WITHDRAWAL_REQUIRED",
      message: "Withdrawal requires the tactical extraction workflow, which is not yet executable.",
    };
  }
  if (intent.type === "DEPLOY_TO_CAMPAIGN") {
    return {
      allowed: false,
      code: "TACTICAL_DEPLOYMENT_DEFERRED",
      message: "Strategic deployment requires the tactical campaign bootstrap workflow, which is not yet executable.",
    };
  }

  if (context.formation.kind === "BATTLEGROUP") {
    const hasFormationAuthority =
      context.isFormationCommander || context.ownsEveryFormationUnit || context.hasActiveDelegation;
    if (!hasFormationAuthority) {
      return {
        allowed: false,
        code: "FORMATION_DELEGATION_REQUIRED",
        message: "Battlegroup command or an explicit active delegation is required.",
      };
    }
  }
  return { allowed: true };
}

export function mayResolveStrategicRound(
  environment: "development" | "preview" | "production",
  permissions: ReadonlySet<BattalionPermission>,
): boolean {
  return environment === "development" && permissions.has("STRATEGIC_ORDER_APPROVE");
}

import type {
  AxialCoord,
  CampaignLoadoutSnapshot,
  CargoManifestItem,
  DeploymentMethodId,
  DeploymentPlanState,
  DeploymentTransportAssignment,
  DeploymentValidationIssue,
  EffectiveUnit,
} from "../../domain/src";
import { cargoSlotsForItem, validateCargoManifest } from "./logistics";
import { hashSeed } from "./rng";

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function coordKey(coord: AxialCoord | undefined): string | undefined {
  return coord ? `${coord.q},${coord.r}` : undefined;
}

function canonical(value: unknown): string {
  const visit = (item: unknown): unknown => Array.isArray(item)
    ? item.map(visit)
    : item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).filter(([, child]) => child !== undefined).sort(([a], [b]) => compareCodePoints(a, b)).map(([key, child]) => [key, visit(child)]))
      : item;
  return JSON.stringify(visit(value));
}

function issue(
  code: string,
  message: string,
  entityId?: string,
  severity: DeploymentValidationIssue["severity"] = "ERROR",
): DeploymentValidationIssue {
  return { code, severity, entityId, message };
}

export interface DeploymentPlanValidationContext {
  actorId: string;
  canCommandBattlegroup: boolean;
  campaignOpen: boolean;
  availableMethods: DeploymentMethodId[];
  campaignInsertionHexes: AxialCoord[];
  occupiedUnitIds: string[];
  operationalCarrierIds: string[];
}

export interface DeploymentPlanValidationResult {
  valid: boolean;
  errors: DeploymentValidationIssue[];
  warnings: DeploymentValidationIssue[];
  assignments: Array<{
    carrierUnitId: string;
    usedSlotsQuarters: number;
    capacitySlotsQuarters: number;
  }>;
}

export function validateDeploymentPlan(
  plan: DeploymentPlanState,
  context: DeploymentPlanValidationContext,
): DeploymentPlanValidationResult {
  const errors: DeploymentValidationIssue[] = [];
  const warnings: DeploymentValidationIssue[] = [];
  if (!context.campaignOpen) errors.push(issue("CAMPAIGN_NOT_ACCEPTING_DEPLOYMENTS", "Campaign is not accepting deployments.", plan.campaignId));
  if (!context.availableMethods.includes(plan.method)) errors.push(issue("INSERTION_METHOD_UNAVAILABLE", `${plan.method} is unavailable in this campaign.`, plan.id));
  if (plan.unitSelections.length === 0) errors.push(issue("DEPLOYMENT_EMPTY", "Select at least one unit.", plan.id));
  if (plan.battlegroupId && !context.canCommandBattlegroup) errors.push(issue("BATTLEGROUP_AUTHORITY_REQUIRED", "Battlegroup command authority is required.", plan.battlegroupId));
  const allowedInsertionHexes = new Set(context.campaignInsertionHexes.map((coord) => coordKey(coord)));
  if (plan.insertionHex && !allowedInsertionHexes.has(coordKey(plan.insertionHex))) {
    errors.push(issue("INSERTION_HEX_INVALID", "Insertion hex is outside the campaign deployment zones.", plan.id));
  }

  const selectedIds = new Set<string>();
  const transportCarrierIds = new Set(plan.transportAssignments.map((assignment) => assignment.carrierUnitId));
  for (const selected of plan.unitSelections) {
    if (selectedIds.has(selected.unitId)) errors.push(issue("UNIT_SELECTED_TWICE", "Unit appears more than once in the plan.", selected.unitId));
    selectedIds.add(selected.unitId);
    if (context.occupiedUnitIds.includes(selected.unitId)) errors.push(issue("UNIT_ALREADY_COMMITTED", "Unit is already deployed or reserved.", selected.unitId));
    if (!selected.ownerApproved) errors.push(issue("OWNER_APPROVAL_REQUIRED", "The unit owner has not approved this deployment.", selected.unitId));
    if (plan.battlegroupId && !selected.commandApproved) errors.push(issue("COMMAND_APPROVAL_REQUIRED", "Battlegroup command has not approved this unit.", selected.unitId));
    if ((plan.method === "STANDARD_GROUND" || plan.method === "ORBITAL_DROP") &&
        !selected.effectiveUnit.deploymentMethods.includes(plan.method)) {
      errors.push(issue("UNIT_INSERTION_INELIGIBLE", `Unit cannot use ${plan.method}.`, selected.unitId));
    }
    if (plan.method === "PARADROP" && !transportCarrierIds.has(selected.unitId) &&
        !selected.effectiveUnit.tags.some((tag) => tag === "INFANTRY" || tag === "LIGHT_VEHICLE")) {
      errors.push(issue("UNIT_INSERTION_INELIGIBLE", "Paradrop cargo must be Infantry or a Light Vehicle.", selected.unitId));
    }
  }

  const manifestedUnits = new Set<string>();
  const assignments = plan.transportAssignments.map((assignment) => {
    if (!context.operationalCarrierIds.includes(assignment.carrierUnitId)) {
      errors.push(issue("TRANSPORT_UNAVAILABLE", "Assigned transport is not operational and co-located.", assignment.carrierUnitId));
    }
    const validation = validateCargoManifest(assignment.profile, assignment.cargo);
    validation.reasons.forEach((message) => errors.push(issue("TRANSPORT_CAPACITY_INVALID", message, assignment.carrierUnitId)));
    for (const cargo of assignment.cargo) {
      if (cargo.unitId) {
        if (manifestedUnits.has(cargo.unitId)) errors.push(issue("UNIT_ASSIGNED_TWICE", "Unit is assigned to more than one carrier.", cargo.unitId));
        manifestedUnits.add(cargo.unitId);
      }
    }
    return {
      carrierUnitId: assignment.carrierUnitId,
      usedSlotsQuarters: validation.slotsUsedQuarters,
      capacitySlotsQuarters: validation.capacitySlotsQuarters,
    };
  });

  if (plan.method !== "STANDARD_GROUND") {
    for (const selected of plan.unitSelections) {
      if (!transportCarrierIds.has(selected.unitId) && !manifestedUnits.has(selected.unitId)) {
        errors.push(issue("TRANSPORT_ASSIGNMENT_REQUIRED", "Unit has no transport assignment.", selected.unitId));
      }
    }
  }
  if (plan.method === "PARADROP") {
    const insertion = coordKey(plan.insertionHex);
    const route = new Set((plan.transportRoute ?? []).map((coord) => coordKey(coord)));
    if (!insertion || !route.has(insertion)) errors.push(issue("DROP_POINT_OFF_ROUTE", "Paradrop point must lie on the carrier flight path.", plan.id));
  }
  const spare = assignments.reduce((total, assignment) => total + assignment.capacitySlotsQuarters - assignment.usedSlotsQuarters, 0);
  if (spare === 0 && plan.transportAssignments.length > 0) {
    warnings.push(issue("NO_SPARE_SUPPLY_CAPACITY", "Deployment is legal but has no spare lift for additional Supply.", plan.id, "WARNING"));
  }
  return { valid: errors.length === 0, errors, warnings, assignments };
}

export interface AutoAssignResult {
  assignments: DeploymentTransportAssignment[];
  unassignedItemIds: string[];
}

export function autoAssignCargo(
  cargo: readonly CargoManifestItem[],
  carriers: readonly DeploymentTransportAssignment[],
): AutoAssignResult {
  const assignments = [...carriers]
    .sort((left, right) => compareCodePoints(left.carrierUnitId, right.carrierUnitId))
    .map((carrier) => ({ ...carrier, cargo: carrier.cargo.map((item) => structuredClone(item)) }));
  const unassignedItemIds: string[] = [];
  for (const item of [...cargo].sort((left, right) => compareCodePoints(left.id, right.id))) {
    const target = assignments.find((assignment) => {
      if (!cargoSlotsForItem(assignment.profile, item).legal) return false;
      return validateCargoManifest(assignment.profile, [...assignment.cargo, item]).legal;
    });
    if (target) target.cargo.push(structuredClone(item));
    else unassignedItemIds.push(item.id);
  }
  return { assignments, unassignedItemIds };
}

export function createCampaignLoadoutSnapshot(input: {
  id: string;
  campaignId: string;
  planId: string;
  unit: EffectiveUnit;
  method: DeploymentMethodId;
  carrierUnitId?: string;
  lockedAt: number;
}): CampaignLoadoutSnapshot {
  if (!input.unit.persistentUnitId) throw new Error("Campaign snapshots require a persistent unit identity.");
  const unsigned = {
    id: input.id,
    campaignId: input.campaignId,
    deploymentPlanId: input.planId,
    playerUnitId: input.unit.persistentUnitId,
    rulesetVersion: input.unit.rulesetVersion,
    unitDefinitionVersion: input.unit.sourceHash,
    effectiveUnit: structuredClone(input.unit),
    insertionMethod: input.method,
    carrierUnitId: input.carrierUnitId,
    lockedAt: input.lockedAt,
  };
  return { ...unsigned, snapshotHash: hashSeed(canonical(unsigned)).toString(16).padStart(8, "0") };
}

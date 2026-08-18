import type {
  AbilityRef,
  AvailabilityStatus,
  DefinitionStatus,
  DeploymentReadinessResult,
  ForceSummaryDto,
  FriendlyUnitInspectionDto,
  HealthModel,
  ImplementationStatus,
  RequisitionStatus,
  RequisitionValueStatus,
  SubsystemOperationalState,
  UnitLocationState,
  UnitClassDefinition,
  UnitStatus,
} from "../../packages/domain/src";
import { getUnitClass, IRREGULAR_PROGRESSION_TRACKS } from "../../packages/rules-engine/src";
import {
  V5_CORE_CURATED_2_CONTENT_HASH,
  V5_CORE_CURATED_2_RULESET_VERSION,
} from "../../packages/rules-engine/src/generated/v5-core-curated-2";
import type { AuthenticatedIdentity } from "../auth";
import type { Env } from "../env";
import type { ProgressIrregularCommand, PurchaseForceCommand, ReadinessCheckCommand, RenameForceCommand } from "../forces-validation";
import { commandHash } from "../forces-validation";
import { resolveEquipmentRulesAuthority, type D1EquipmentRulesInput } from "./rules-hydration";
import {
  getEligibleEquipment,
  getAccessibleShipCapabilities,
  getCampaignDeploymentAccess,
  getForce,
  getForceCargo,
  getForceEquipment,
  getForceHistory,
  getForceServiceSummary,
  getForceStatusEffects,
  getForceSubsystems,
  getForceSupplies,
  getForceWeaponMounts,
  getMutationReceipt,
  getPurchasableDefinition,
  getRequisitionBalance,
  getRequisitionLedger,
  listCatalogueUnits,
  listCatalogueAbilities,
  listCatalogueSlots,
  listCatalogueWeapons,
  listDefinitionTags,
  listForces,
  listShipCarryRules,
  listShipOccupants,
  listUnitAbilities,
  listUnitTags,
  type CatalogueUnitRow,
  type CatalogueSlotRow,
  type CatalogueWeaponRow,
  type DefinitionAbilityRow,
  type DefinitionTagRow,
  type ForceListFilters,
  type ForceRow,
} from "../repositories/forces";

export class ForceServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function semanticTag(tag: Pick<DefinitionTagRow, "tag_id" | "tag_name">): string {
  const named = tag.tag_name.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return named || tag.tag_id.replace(/^tag-/, "").toUpperCase().replaceAll("-", "_");
}

export function identityUserId(identity: AuthenticatedIdentity): string {
  return identity.kind === "SESSION" ? identity.userId : identity.viewer.userId;
}

export function readinessFor(
  row: ForceRow,
  includeDevelopment = false,
  deploymentContextProvided = false,
): DeploymentReadinessResult {
  const blockers: DeploymentReadinessResult["blockers"] = [];
  const warnings: DeploymentReadinessResult["warnings"] = [];
  const requirements: DeploymentReadinessResult["requirements"] = [];

  const operational = row.status !== "DESTROYED" && row.status !== "RETIRED" && row.current_health > 0;
  requirements.push({ id: "operational", label: "Unit is operational", satisfied: operational });
  if (!operational) {
    blockers.push({
      code: row.status === "DESTROYED" ? "UNIT_DESTROYED" : "UNIT_NOT_OPERATIONAL",
      severity: "BLOCKER",
      message: row.status === "DESTROYED" ? "Destroyed units remain in Forces → Lost and cannot deploy." : "Unit is not operational.",
      requirementId: "operational",
    });
  }
  const fieldReady = row.status !== "DAMAGED";
  requirements.push({ id: "field-ready", label: "Unit has no blocking damage", satisfied: fieldReady });
  if (!fieldReady) {
    blockers.push({
      code: "UNIT_DAMAGED",
      severity: "BLOCKER",
      message: "The unit has unresolved damage and must be repaired before deployment.",
      requirementId: "field-ready",
    });
  }

  const available =
    row.availability_status === "AVAILABLE" ||
    (includeDevelopment && row.availability_status === "DEV_ONLY");
  requirements.push({ id: "definition-available", label: "Rules definition is available", satisfied: available });
  if (!available) {
    blockers.push({
      code: "DEFINITION_NOT_AVAILABLE",
      severity: "BLOCKER",
      message: row.reason_code ?? "This definition is not available in the active rules profile.",
      requirementId: "definition-available",
    });
  }

  const executable = row.executable === 1 && row.implementation_status === "IMPLEMENTED";
  requirements.push({ id: "definition-executable", label: "Rules definition is executable", satisfied: executable });
  if (!executable) {
    blockers.push({
      code: "DEFINITION_NOT_EXECUTABLE",
      severity: "BLOCKER",
      message: row.reason_code ?? "This class is catalogued but is not enabled in the campaign resolver.",
      requirementId: "definition-executable",
    });
  }

  const locationReady = ["RESERVE", "ON_SHIP"].includes(row.location_state);
  requirements.push({ id: "location", label: "Unit is in reserve or aboard a ship", satisfied: locationReady });
  if (!locationReady && row.location_state !== "ON_MAP") {
    blockers.push({
      code: "UNIT_LOCATION_UNAVAILABLE",
      severity: "BLOCKER",
      message: `Unit location ${row.location_state} is not available for a new deployment.`,
      requirementId: "location",
    });
  }
  if (row.location_state === "ON_MAP" || row.status === "DEPLOYED") {
    blockers.push({
      code: "UNIT_ALREADY_DEPLOYED",
      severity: "BLOCKER",
      message: "Unit is already deployed to a campaign.",
      requirementId: "location",
    });
  }

  const profileRequirements = parseJson<Record<string, unknown>>(row.deployment_requirements_json, {});
  if (Object.keys(profileRequirements).length > 0) {
    if (deploymentContextProvided) {
      warnings.push({
        code: "DEPLOYMENT_PROFILE_CONTEXT",
        severity: "WARNING",
        message: "Ship and campaign capability checks are evaluated against the selected deployment context.",
        details: profileRequirements,
      });
    } else {
      blockers.push({
        code: "DEPLOYMENT_CONTEXT_REQUIRED",
        severity: "BLOCKER",
        message: "Select a campaign and battalion ship to calculate authoritative deployment readiness.",
        details: profileRequirements,
      });
    }
  }
  return { ready: blockers.length === 0, blockers, warnings, requirements };
}

function forceSummary(row: ForceRow, includeDevelopment = false): ForceSummaryDto & Record<string, unknown> {
  const battlegroups = parseJson<Array<{ id: string; name: string; objective?: string }>>(row.battlegroups_json, []);
  return {
    unitId: row.id,
    definitionId: row.definition_id,
    callsign: row.callsign,
    name: row.name,
    status: row.status as UnitStatus,
    locationState: row.location_state as UnitLocationState,
    currentHealth: row.current_health,
    maximumHealth: row.maximum_health,
    healthModel: row.health_model as HealthModel,
    readiness: readinessFor(row, includeDevelopment),
    description: row.description,
    category: row.category,
    definitionName: row.definition_name,
    armor: row.armor,
    defense: row.defense,
    speed: row.speed_quarters / 4,
    sensors: row.sensor_range,
    implementationStatus: (row.implementation_status ?? "CATALOGUE_ONLY") as ImplementationStatus,
    requisitionStatus: (row.requisition_status ?? "NOT_APPLICABLE") as RequisitionStatus,
    availabilityStatus: (row.availability_status ?? "HIDDEN") as AvailabilityStatus,
    reasonCode: row.reason_code,
    movementProfile: row.movement_profile_id
      ? { id: row.movement_profile_id, name: row.movement_profile_name, domain: row.movement_domain }
      : undefined,
    durabilityProfile: row.durability_profile_id
      ? { id: row.durability_profile_id, name: row.durability_profile_name, model: row.health_model }
      : undefined,
    service: { campaigns: row.service_campaigns, rounds: row.service_rounds },
    requisitionValue: row.requisition_value,
    requisitionValueStatus: row.requisition_value_status as RequisitionValueStatus,
    version: row.version,
    battlegroups,
    battlegroup: battlegroups[0]?.name.toUpperCase(),
    battlegroupName: battlegroups[0]?.name ?? null,
    destroyed: row.destroyed_at
      ? {
          at: row.destroyed_at,
          campaignId: row.destroyed_campaign_id,
          round: row.destroyed_round,
          cause: row.destroyed_cause,
        }
      : undefined,
  };
}

export async function listForceSummaries(
  env: Env,
  ownerId: string,
  filters: ForceListFilters,
): Promise<{ forces: Array<ForceSummaryDto & Record<string, unknown>>; nextCursor?: string }> {
  const rows = await listForces(env.DB, ownerId, filters);
  return {
    forces: rows.map((row) => forceSummary(row, env.ENVIRONMENT === "development")),
    nextCursor: rows.length === filters.limit ? rows.at(-1)?.id : undefined,
  };
}

export async function inspectFriendlyForce(
  env: Env,
  ownerId: string,
  unitId: string,
): Promise<FriendlyUnitInspectionDto & Record<string, unknown>> {
  const row = await getForce(env.DB, ownerId, unitId);
  if (!row) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  const [tags, abilities, equipment, weapons, supplies, subsystems, cargo, history, statusEffects, service] = await Promise.all([
    listUnitTags(env.DB, ownerId, unitId),
    listUnitAbilities(env.DB, ownerId, unitId),
    getForceEquipment(env.DB, ownerId, unitId),
    getForceWeaponMounts(env.DB, ownerId, unitId),
    getForceSupplies(env.DB, ownerId, unitId),
    getForceSubsystems(env.DB, ownerId, unitId),
    getForceCargo(env.DB, ownerId, unitId),
    getForceHistory(env.DB, ownerId, unitId),
    getForceStatusEffects(env.DB, ownerId, unitId),
    getForceServiceSummary(env.DB, ownerId, unitId),
  ]);
  const supplyInventory = Object.fromEntries(supplies.map((item) => [item.resource_type, item.current_quantity]));
  const ammunition = Object.fromEntries(
    weapons.filter((weapon) => weapon.current_ammo !== null).map((weapon) => [weapon.id, weapon.current_ammo!]),
  );
  const cooldowns = Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon.cooldown_remaining]));
  const abilityRefs: AbilityRef[] = abilities.map((ability) => ({
    abilityId: ability.ability_id,
    handlerId: parseJson<{ handlerId?: string }>(ability.definition_json, {}).handlerId,
    parameters: {
      target: parseJson(ability.target_selector_json, {}),
      effect: parseJson(ability.effect_json, {}),
    },
  }));

  const inspection: FriendlyUnitInspectionDto = {
    ...forceSummary(row, env.ENVIRONMENT === "development"),
    ownerId,
    tags: tags.map(semanticTag),
    abilities: abilityRefs,
    equipmentIds: equipment.filter((item) => item.lost_at === null).map((item) => item.equipment_definition_id),
    ammunition,
    cooldowns,
    supplies: supplyInventory,
    cargoProfile: row.cargo_profile_id
      ? {
          id: row.cargo_profile_id,
          name: row.cargo_profile_name,
          capacity: parseJson(row.cargo_capacity_json, {}),
          loadingRules: parseJson(row.cargo_loading_rules_json, {}),
        }
      : undefined,
    cargo: cargo.map((item) => ({
      id: item.id,
      kind:
        item.item_kind === "SUPPLY"
          ? "SUPPLY"
          : item.item_kind === "UNIT" && item.transport_mode === "TOWED"
            ? "OTHER"
            : item.item_kind === "UNIT" && item.carried_health_model === "HITS"
            ? "VEHICLE"
            : item.item_kind === "UNIT"
              ? "PERSONNEL"
              : "OTHER",
      quantity: item.quantity,
      tags: [],
      transportMode: item.transport_mode as "STOWED" | "EMBARKED" | "TOWED" | "AIRLIFTED",
      supplyType: item.resource_type ?? undefined,
      unitId: item.carried_unit_id ?? undefined,
    })),
    subsystems: subsystems.map((item) => ({
      subsystemId: item.subsystem_type,
      state: item.state as SubsystemOperationalState,
    })),
    statusEffects: statusEffects.map((effect) => ({
      id: effect.id,
      definitionId: effect.status_effect_id,
      status: "ACTIVE" as const,
      ...(effect.applied_round === null ? {} : { appliedRound: effect.applied_round }),
      ...(effect.expires_round === null ? {} : { expiresRound: effect.expires_round }),
      parameters: parseJson(effect.state_json, {}),
    })),
    recentHistory: history.map((item) => item.summary || item.event_type),
    equipment: equipment.map((item) => ({
      equipmentId: item.equipment_definition_id,
      name: item.name,
      slotType: item.slot_type,
      status: item.definition_status as DefinitionStatus,
      tags: [],
      abilities: [],
    })),
    weaponMounts: weapons.map((weapon) => ({
      mountId: weapon.id,
      weapon: {
        id: weapon.weapon_definition_id,
        name: weapon.name,
        damage: {
          count: weapon.damage_dice_count,
          sides: weapon.damage_die_sides,
          modifier: weapon.damage_modifier,
        },
        range: weapon.range_hexes,
        armorPiercing: weapon.armor_piercing,
        indirect: weapon.indirect === 1,
        ammoCapacity: weapon.ammo_capacity ?? undefined,
        cooldownRounds: weapon.cooldown_rounds ?? undefined,
        tags: parseJson<{ tags?: string[] }>(weapon.definition_json, {}).tags ?? [],
      },
      ammunition: weapon.current_ammo ?? undefined,
      cooldownRounds: weapon.cooldown_remaining,
      operational: weapon.state === "OPERATIONAL",
    })),
    serviceSummary: {
      campaignsParticipated: service?.campaigns_completed ?? row.service_campaigns,
      roundsDeployed: service?.rounds_served ?? row.service_rounds,
      damageSustained: service?.damage_sustained ?? 0,
      objectivesCompleted: service?.objectives_completed ?? 0,
      unitsDestroyed: service?.units_destroyed ?? 0,
      commendations: service?.commendations ?? 0,
    },
    recentServiceRecords: history.map((item) => ({
      id: item.id,
      type: item.event_type,
      occurredAt: item.occurred_at,
      summary: item.summary,
      campaignId: item.campaign_id ?? undefined,
      round: item.round_number ?? undefined,
    })),
  };

  return {
    ...inspection,
    definition: {
      id: row.definition_id,
      name: row.definition_name,
      category: row.category,
      sourceStats: parseJson(row.base_stats_json, {}),
    },
    cargoProfileId: row.cargo_profile_id,
    supplyProfileId: row.supply_profile_id,
    weapons: weapons.map((weapon) => ({
      id: weapon.id,
      definitionId: weapon.weapon_definition_id,
      name: weapon.name,
      role: weapon.mount_role,
      state: weapon.state,
      damage: { count: weapon.damage_dice_count, sides: weapon.damage_die_sides, modifier: weapon.damage_modifier },
      armorPiercing: weapon.armor_piercing,
      range: weapon.range_hexes,
      indirect: weapon.indirect === 1,
      currentAmmo: weapon.current_ammo,
      ammoCapacity: weapon.ammo_capacity,
      cooldownRemaining: weapon.cooldown_remaining,
      tags: parseJson<{ tags?: string[] }>(weapon.definition_json, {}).tags ?? [],
    })),
    equipmentDetail: equipment.map((item) => ({
      id: item.equipment_definition_id,
      name: item.name,
      category: item.category,
      slotType: item.slot_type,
      slotIndex: item.slot_index,
      state: parseJson(item.state_json, {}),
      lost: item.lost_at !== null,
    })),
    supplyCapacities: Object.fromEntries(supplies.map((item) => [item.resource_type, item.maximum_quantity])),
    cargoDetail: cargo.map((item) => ({
      id: item.id,
      kind: item.item_kind,
      transportMode: item.transport_mode as "STOWED" | "EMBARKED" | "TOWED" | "AIRLIFTED",
      callsign: item.carried_callsign,
      resourceType: item.resource_type,
      quantity: item.quantity,
      slots: item.cargo_slots_quarters / 4,
      state: item.state,
    })),
    history: history.map((item) => ({
      id: item.id,
      type: item.event_type,
      summary: item.summary,
      campaignId: item.campaign_id,
      round: item.round_number,
      occurredAt: item.occurred_at,
      payload: parseJson(item.payload_json, {}),
    })),
  };
}

export async function getFriendlyForceHistory(
  env: Env,
  ownerId: string,
  unitId: string,
): Promise<{ unitId: string; history: Array<Record<string, unknown>> }> {
  const unit = await getForce(env.DB, ownerId, unitId);
  if (!unit) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  const history = await getForceHistory(env.DB, ownerId, unitId);
  return {
    unitId,
    history: history.map((item) => ({
      id: item.id,
      type: item.event_type,
      summary: item.summary,
      campaignId: item.campaign_id,
      round: item.round_number,
      occurredAt: item.occurred_at,
      visibility: item.visibility,
      payload: parseJson(item.payload_json, {}),
    })),
  };
}

function capabilityId(value: string): string {
  return `capability-${value.toLowerCase().replaceAll("_", "-")}`;
}

interface DeploymentRequirementJson {
  locationStatesAny?: string[];
  campaignPermissionRequired?: boolean;
  facilityCapability?: string;
  carrierCapabilityAny?: string[];
  carrierAbility?: string;
}

interface CampaignForcePolicyJson {
  allowedCategories?: string[];
  allowedDefinitionIds?: string[];
  allowedTagsAny?: string[];
  forbiddenTagsAny?: string[];
  requiresShip?: boolean;
}

interface ShipCarryRuleJson {
  unitTagsAll?: string[];
  unitTagsAny?: string[];
  unitTagsNone?: string[];
  priority?: number;
}

function normalizedPolicyValues(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toUpperCase().replaceAll("-", "_")));
}

function campaignPermitsUnit(
  policy: CampaignForcePolicyJson,
  unit: { row: ForceRow; tags: string[]; tagIds: string[] },
): boolean {
  const allowedCategories = normalizedPolicyValues(policy.allowedCategories);
  const allowedDefinitions = new Set(policy.allowedDefinitionIds ?? []);
  const allowedTags = normalizedPolicyValues(policy.allowedTagsAny);
  const forbiddenTags = normalizedPolicyValues(policy.forbiddenTagsAny);
  const unitTags = new Set([
    ...unit.tags.map((tag) => tag.toUpperCase()),
    ...unit.tagIds.map((tag) => tag.replace(/^tag-/, "").toUpperCase().replaceAll("-", "_")),
  ]);
  if (allowedCategories.size > 0 && !allowedCategories.has(unit.row.category.toUpperCase())) return false;
  if (allowedDefinitions.size > 0 && !allowedDefinitions.has(unit.row.definition_id)) return false;
  if (allowedTags.size > 0 && ![...allowedTags].some((tag) => unitTags.has(tag))) return false;
  if ([...forbiddenTags].some((tag) => unitTags.has(tag))) return false;
  return true;
}

function carryRuleMatches(tags: Set<string>, rule: ShipCarryRuleJson): boolean {
  const requiredAll = normalizedPolicyValues(rule.unitTagsAll);
  const requiredAny = normalizedPolicyValues(rule.unitTagsAny);
  const excluded = normalizedPolicyValues(rule.unitTagsNone);
  if ([...requiredAll].some((tag) => !tags.has(tag))) return false;
  if (requiredAny.size > 0 && ![...requiredAny].some((tag) => tags.has(tag))) return false;
  if ([...excluded].some((tag) => tags.has(tag))) return false;
  return requiredAll.size > 0 || requiredAny.size > 0;
}

export async function checkDeploymentReadiness(
  env: Env,
  ownerId: string,
  command: ReadinessCheckCommand,
): Promise<DeploymentReadinessResult & { units: Array<{ unitId: string; readiness: DeploymentReadinessResult }> }> {
  const rows = await Promise.all(command.unitIds.map((unitId) => getForce(env.DB, ownerId, unitId)));
  if (rows.some((row) => row === null)) {
    throw new ForceServiceError(404, "UNIT_NOT_FOUND", "One or more persistent units were not found.");
  }

  const forceRows = rows as ForceRow[];
  const definitionTags = await listDefinitionTags(env.DB, [...new Set(forceRows.map((row) => row.definition_id))]);
  const tagsByDefinition = new Map<string, DefinitionTagRow[]>();
  for (const tag of definitionTags) {
    const current = tagsByDefinition.get(tag.definition_id) ?? [];
    current.push(tag);
    tagsByDefinition.set(tag.definition_id, current);
  }

  const units = forceRows.map((row) => ({
    unitId: row.id,
    row,
    readiness: readinessFor(row, env.ENVIRONMENT === "development", true),
    profile: parseJson<DeploymentRequirementJson>(row.deployment_requirements_json, {}),
    dropModes: parseJson<string[]>(row.deployment_drop_modes_json, []),
    tags: (tagsByDefinition.get(row.definition_id) ?? []).map(semanticTag),
    tagIds: (tagsByDefinition.get(row.definition_id) ?? []).map((tag) => tag.tag_id),
  }));
  const aggregateBlockers: DeploymentReadinessResult["blockers"] = units.flatMap((unit) =>
    unit.readiness.blockers.map((issue) => ({ ...issue, details: { ...issue.details, unitId: unit.unitId } })),
  );
  const aggregateWarnings: DeploymentReadinessResult["warnings"] = units.flatMap((unit) =>
    unit.readiness.warnings.map((issue) => ({ ...issue, details: { ...issue.details, unitId: unit.unitId } })),
  );
  const aggregateRequirements: DeploymentReadinessResult["requirements"] = units.flatMap((unit) =>
    unit.readiness.requirements.map((requirement) => ({
      ...requirement,
      id: `${unit.unitId}:${requirement.id}`,
      details: { ...requirement.details, unitId: unit.unitId },
    })),
  );

  let campaignPolicy: CampaignForcePolicyJson = {};
  const campaignAccess = command.campaignId
    ? await getCampaignDeploymentAccess(env.DB, ownerId, command.campaignId)
    : null;
  if (command.campaignId && !campaignAccess) {
    throw new ForceServiceError(404, "CAMPAIGN_NOT_FOUND", "Campaign deployment access was not found.");
  }
  if (!campaignAccess) {
    aggregateBlockers.push({
      code: "CAMPAIGN_CONTEXT_REQUIRED",
      severity: "BLOCKER",
      message: "Select a campaign in which you have deployment permission.",
      details: { unitIds: units.map((unit) => unit.unitId) },
    });
  } else if (campaignAccess) {
    aggregateRequirements.push({
      id: "campaign-permission",
      label: "Campaign membership permits deployment planning",
      satisfied: true,
      details: { campaignId: campaignAccess.campaign_id, role: campaignAccess.role },
    });
    campaignPolicy = parseJson<CampaignForcePolicyJson>(campaignAccess.force_policy_json, {});
    for (const unit of units) {
      const permitted = campaignPermitsUnit(campaignPolicy, unit);
      aggregateRequirements.push({
        id: `${unit.unitId}:campaign-force-policy`,
        label: "Campaign permits this unit definition",
        satisfied: permitted,
        details: { unitId: unit.unitId, campaignId: campaignAccess.campaign_id },
      });
      if (!permitted) {
        aggregateBlockers.push({
          code: "CAMPAIGN_FORCE_POLICY_BLOCKED",
          severity: "BLOCKER",
          message: `${unit.row.callsign} is not permitted by this campaign's force policy.`,
          requirementId: `${unit.unitId}:campaign-force-policy`,
          details: { unitId: unit.unitId, campaignId: campaignAccess.campaign_id },
        });
      }
    }
  }

  const deploymentMode = command.deploymentMode ?? "GROUND";
  if (deploymentMode !== "GROUND") {
    aggregateBlockers.push({
      code: "DEPLOYMENT_MODE_NOT_EXECUTABLE",
      severity: "BLOCKER",
      message: `${deploymentMode} is catalogued for readiness planning but is not yet connected to the deterministic resolver.`,
      details: { unitIds: units.map((unit) => unit.unitId), deploymentMode },
    });
  }
  for (const unit of units) {
    const permittedLocations = unit.profile.locationStatesAny ?? [];
    if (permittedLocations.length > 0 && !permittedLocations.includes(unit.row.location_state)) {
      aggregateBlockers.push({
        code: "DEPLOYMENT_LOCATION_NOT_PERMITTED",
        severity: "BLOCKER",
        message: `${unit.row.callsign} cannot deploy from ${unit.row.location_state}.`,
        details: { unitId: unit.unitId, permittedLocations },
      });
    }
    if (unit.dropModes.length > 0 && !unit.dropModes.includes(deploymentMode)) {
      aggregateBlockers.push({
        code: "DEPLOYMENT_MODE_UNAVAILABLE",
        severity: "BLOCKER",
        message: `${deploymentMode} is not available to ${unit.row.callsign}.`,
        details: { unitId: unit.unitId, availableModes: unit.dropModes },
      });
    }
  }

  const capabilityOptions = units.flatMap((unit) => {
    const required = unit.profile.facilityCapability ? [[unit.profile.facilityCapability]] : [];
    const alternatives = unit.profile.carrierCapabilityAny ? [unit.profile.carrierCapabilityAny] : [];
    return [...required, ...alternatives].map((options) => ({ unitId: unit.unitId, options }));
  });
  const needsShip =
    campaignPolicy.requiresShip === true ||
    capabilityOptions.length > 0 ||
    units.some((unit) => unit.row.location_state === "ON_SHIP");
  const [capabilityRows, carryRules, shipOccupants] = await Promise.all([
    command.shipId ? getAccessibleShipCapabilities(env.DB, ownerId, command.shipId) : Promise.resolve(null),
    listShipCarryRules(env.DB),
    command.shipId ? listShipOccupants(env.DB, command.shipId) : Promise.resolve([]),
  ]);
  if (command.shipId && !capabilityRows) {
    throw new ForceServiceError(404, "SHIP_NOT_FOUND", "Battalion ship was not found.");
  }
  if (needsShip && !capabilityRows) {
    aggregateBlockers.push({
      code: "SHIP_CONTEXT_REQUIRED",
      severity: "BLOCKER",
      message: "Select the battalion ship from which these units will deploy.",
    });
  }

  const capacities = new Map(
    (capabilityRows ?? [])
      .filter((row): row is typeof row & { capability_id: string; capacity: number } =>
        row.capability_id !== null && row.capacity !== null,
      )
      .map((row) => [row.capability_id, row.capacity]),
  );
  if (capabilityRows && command.shipId) {
    const shipBattalionId = capabilityRows[0].battalion_id;
    if (campaignAccess?.battalion_id && campaignAccess.battalion_id !== shipBattalionId) {
      aggregateBlockers.push({
        code: "SHIP_CAMPAIGN_BATTALION_MISMATCH",
        severity: "BLOCKER",
        message: "The selected ship is not assigned to your campaign battalion.",
        details: { shipId: command.shipId, campaignId: command.campaignId },
      });
    }
    for (const unit of units) {
      const shipMatches = unit.row.location_state === "ON_SHIP" && unit.row.location_id === command.shipId;
      aggregateRequirements.push({
        id: `${unit.unitId}:ship-location`,
        label: "Unit is aboard the selected ship",
        satisfied: shipMatches,
        details: { unitId: unit.unitId, shipId: command.shipId },
      });
      if (!shipMatches) {
        aggregateBlockers.push({
          code: "UNIT_NOT_ON_SELECTED_SHIP",
          severity: "BLOCKER",
          message: `${unit.row.callsign} is not aboard the selected ship.`,
          requirementId: `${unit.unitId}:ship-location`,
          details: { unitId: unit.unitId, shipId: command.shipId },
        });
      }
    }
    for (const requirement of capabilityOptions) {
      const satisfied = requirement.options.some((option) => (capacities.get(capabilityId(option)) ?? 0) > 0);
      aggregateRequirements.push({
        id: `${requirement.unitId}:ship-capability`,
        label: `Ship provides ${requirement.options.join(" or ")}`,
        satisfied,
        details: { unitId: requirement.unitId, shipId: command.shipId },
      });
      if (!satisfied) {
        aggregateBlockers.push({
          code: "SHIP_CAPABILITY_MISSING",
          severity: "BLOCKER",
          message: `The selected ship does not provide ${requirement.options.join(" or ")}.`,
          requirementId: `${requirement.unitId}:ship-capability`,
          details: { unitId: requirement.unitId, shipId: command.shipId },
        });
      }
    }

    const carryRuleForTags = (tags: string[]) => carryRules
        .map((row) => ({ row, rule: parseJson<ShipCarryRuleJson>(row.definition_json, {}) }))
        .filter(({ rule }) => carryRuleMatches(new Set(tags.map((tag) => tag.toUpperCase())), rule))
        .sort((left, right) => (right.rule.priority ?? 0) - (left.rule.priority ?? 0))[0];
    const occupantTags = await listDefinitionTags(
      env.DB,
      [...new Set(shipOccupants.map((occupant) => occupant.definition_id))],
    );
    const occupantTagsByDefinition = new Map<string, string[]>();
    for (const tag of occupantTags) {
      const current = occupantTagsByDefinition.get(tag.definition_id) ?? [];
      current.push(semanticTag(tag));
      occupantTagsByDefinition.set(tag.definition_id, current);
    }
    const demandByCapability = new Map<string, Set<string>>();
    for (const occupant of shipOccupants) {
      const matchingRule = carryRuleForTags(occupantTagsByDefinition.get(occupant.definition_id) ?? []);
      if (!matchingRule) continue;
      const demand = demandByCapability.get(matchingRule.row.capability_id) ?? new Set<string>();
      demand.add(occupant.unit_id);
      demandByCapability.set(matchingRule.row.capability_id, demand);
    }
    const selectedByCapability = new Map<string, string[]>();
    for (const unit of units) {
      const matchingRule = carryRuleForTags(unit.tags);
      if (!matchingRule) {
        aggregateBlockers.push({
          code: "SHIP_CAPACITY_RULE_MISSING",
          severity: "BLOCKER",
          message: `${unit.row.callsign} has no published ship carry-capacity classification.`,
          details: { unitId: unit.unitId, shipId: command.shipId },
        });
        continue;
      }
      const capability = matchingRule.row.capability_id;
      const selected = selectedByCapability.get(capability) ?? [];
      selected.push(unit.unitId);
      selectedByCapability.set(capability, selected);
      const demand = demandByCapability.get(capability) ?? new Set<string>();
      demand.add(unit.unitId);
      demandByCapability.set(capability, demand);
    }
    for (const [requiredCapability, selectedUnitIds] of selectedByCapability) {
      const demand = demandByCapability.get(requiredCapability)?.size ?? selectedUnitIds.length;
      const capacity = capacities.get(requiredCapability) ?? 0;
      const satisfied = demand <= capacity;
      aggregateRequirements.push({
        id: `ship-capacity:${requiredCapability}`,
        label: `Ship capacity ${requiredCapability.replace("capability-carry-", "").replaceAll("-", " ")}`,
        satisfied,
        details: { shipId: command.shipId, capabilityId: requiredCapability, demand, capacity, unitIds: selectedUnitIds },
      });
      if (!satisfied) {
        aggregateBlockers.push({
          code: "SHIP_CAPACITY_EXCEEDED",
          severity: "BLOCKER",
          message: `The ship currently requires ${demand} ${requiredCapability.replace("capability-carry-", "").replaceAll("-", " ")} berths; ${capacity} are available.`,
          requirementId: `ship-capacity:${requiredCapability}`,
          details: { shipId: command.shipId, capabilityId: requiredCapability, demand, capacity, unitIds: selectedUnitIds },
        });
      }
    }
  }

  const needsCarrierAbility = units.filter(
    (unit) => unit.profile.carrierAbility && deploymentMode !== "GROUND",
  );
  if (needsCarrierAbility.length > 0 && !command.carrierUnitId) {
    aggregateBlockers.push({
      code: "CARRIER_CONTEXT_REQUIRED",
      severity: "BLOCKER",
      message: "Select a carrier unit for this deployment mode.",
      details: { unitIds: needsCarrierAbility.map((unit) => unit.unitId) },
    });
  } else if (needsCarrierAbility.length > 0 && command.carrierUnitId) {
    const carrier = await getForce(env.DB, ownerId, command.carrierUnitId);
    if (!carrier) throw new ForceServiceError(404, "CARRIER_NOT_FOUND", "Carrier unit was not found.");
    const carrierReadiness = readinessFor(carrier, env.ENVIRONMENT === "development", true);
    if (!carrierReadiness.ready || needsCarrierAbility.some((unit) => unit.unitId === carrier.id)) {
      aggregateBlockers.push({
        code: "CARRIER_NOT_OPERATIONAL",
        severity: "BLOCKER",
        message: "The selected carrier must be a separate operational unit.",
        details: { carrierUnitId: carrier.id, unitIds: needsCarrierAbility.map((unit) => unit.unitId) },
      });
    }
    const carrierAbilities = await listUnitAbilities(env.DB, ownerId, carrier.id);
    const requiredAbilities = new Set(
      needsCarrierAbility.map((unit) => `ability-${unit.profile.carrierAbility!.toLowerCase().replaceAll("_", "-")}`),
    );
    const actualAbilities = new Set(carrierAbilities.map((ability) => ability.ability_id));
    const carrierReady = [...requiredAbilities].every((ability) => actualAbilities.has(ability));
    aggregateRequirements.push({
      id: "carrier-ability",
      label: "Carrier provides the selected deployment ability",
      satisfied: carrierReady,
      details: { carrierUnitId: carrier.id, requiredAbilities: [...requiredAbilities] },
    });
    if (!carrierReady) {
      aggregateBlockers.push({
        code: "CARRIER_ABILITY_MISSING",
        severity: "BLOCKER",
        message: "The selected carrier lacks the required deployment ability.",
        requirementId: "carrier-ability",
        details: { carrierUnitId: carrier.id },
      });
    }
    if (command.shipId && carrier.location_state === "ON_SHIP" && carrier.location_id !== command.shipId) {
      aggregateBlockers.push({
        code: "CARRIER_NOT_ON_SELECTED_SHIP",
        severity: "BLOCKER",
        message: "The selected carrier is not aboard the selected ship.",
        details: { carrierUnitId: carrier.id, shipId: command.shipId },
      });
    }
  }

  const appliesToUnit = (item: { details?: unknown }, unitId: string): boolean => {
    if (!item.details || typeof item.details !== "object" || Array.isArray(item.details)) return true;
    const details = item.details as Record<string, unknown>;
    if (typeof details.unitId === "string") return details.unitId === unitId;
    if (Array.isArray(details.unitIds)) return details.unitIds.includes(unitId);
    return true;
  };

  return {
    ready: aggregateBlockers.length === 0,
    blockers: aggregateBlockers,
    warnings: aggregateWarnings,
    requirements: aggregateRequirements,
    units: units.map((unit) => {
      const blockers = aggregateBlockers.filter((item) => appliesToUnit(item, unit.unitId));
      return {
        unitId: unit.unitId,
        readiness: {
          ready: blockers.length === 0,
          blockers,
          warnings: aggregateWarnings.filter((item) => appliesToUnit(item, unit.unitId)),
          requirements: aggregateRequirements.filter((item) => appliesToUnit(item, unit.unitId)),
        },
      };
    }),
  };
}

function catalogueItem(
  row: CatalogueUnitRow,
  tags: string[],
  abilities: DefinitionAbilityRow[],
  weapons: CatalogueWeaponRow[],
  slots: CatalogueSlotRow[],
): Record<string, unknown> {
  const definition = parseJson<Record<string, unknown>>(row.definition_json, {});
  const movementRules = parseJson<Record<string, unknown>>(row.movement_definition_json, {});
  const durabilityRules = parseJson<Record<string, unknown>>(row.durability_definition_json, {});
  let governed: UnitClassDefinition | null = null;
  try {
    governed = getUnitClass(row.id);
  } catch {
    // Non-executable catalogue rows remain visible as D1-backed reference data.
  }
  return {
    definitionId: row.id,
    name: row.name,
    description: row.notes || `${row.name} combined-arms definition.`,
    category: row.category,
    definitionStatus: row.definition_status,
    implementationStatus: row.implementation_status ?? "CATALOGUE_ONLY",
    requisitionStatus: row.requisition_status ?? "NOT_APPLICABLE",
    availabilityStatus: row.availability_status ?? "HIDDEN",
    executable: row.executable === 1 && row.implementation_status === "IMPLEMENTED" && governed !== null,
    purchasable: isImplementedUnitDefinition(row),
    reasonCode: row.reason_code,
    requisitionCost: row.requisition_cost,
    durability: {
      model: row.health_model,
      maximum: row.max_health,
      armor: row.armor,
      defense: row.defense,
      profileId: row.durability_profile_id,
      profileName: row.durability_profile_name,
      rules: durabilityRules,
    },
    durabilityProfile: {
      id: row.durability_profile_id,
      name: row.durability_profile_name,
      model: row.health_model,
      maximumHealth: row.max_health,
      rules: durabilityRules,
    },
    movement: {
      speed: row.speed_quarters / 4,
      profileId: row.movement_profile_id,
      profileName: row.movement_profile_name,
      domain: row.movement_domain,
      rules: movementRules,
    },
    movementProfile: {
      id: row.movement_profile_id,
      name: row.movement_profile_name,
      mode: row.movement_domain,
      baseSpeed: row.speed_quarters / 4,
      rules: movementRules,
    },
    stats: {
      healthModel: governed?.stats.healthModel ?? row.health_model,
      maxHealth: governed?.stats.maxHealth ?? row.max_health,
      armor: governed?.stats.armor ?? row.armor,
      defense: governed?.stats.defense ?? row.defense,
      speed: governed?.stats.speed ?? row.speed_quarters / 4,
      sensors: governed?.stats.sensors ?? row.sensor_range,
      capacity: governed?.stats.capacity,
    },
    sensorStatus: governed ? "SCENARIO_DEFINED" : undefined,
    sensors: governed?.stats.sensors ?? row.sensor_range,
    tags: governed?.tags ?? tags,
    allowedActions: governed?.allowedActions ?? [],
    allowedOrders: governed?.allowedOrders ?? [],
    catalogueRulesetVersion: V5_CORE_CURATED_2_RULESET_VERSION,
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
    weaponIds: governed?.weapons.map((weapon) => weapon.id) ?? weapons.map((weapon) => weapon.id),
    weapons: governed?.weapons ?? weapons.map((weapon) => ({
      id: weapon.id,
      name: weapon.name,
      damage: {
        count: weapon.damage_dice_count,
        sides: weapon.damage_die_sides,
        modifier: weapon.damage_modifier,
      },
      range: weapon.range_hexes,
      armorPiercing: weapon.armor_piercing,
      indirect: weapon.indirect === 1,
      ammoCapacity: weapon.ammo_capacity,
      cooldownRounds: weapon.cooldown_rounds,
      tags: parseJson<{ tags?: string[] }>(weapon.definition_json, {}).tags ?? [],
      mountRole: weapon.mount_role,
      mountIndex: weapon.mount_index,
    })),
    slots: governed?.slots ?? Object.fromEntries(slots.map((slot) => [slot.slot_type, slot.slot_count])),
    slotRules: Object.fromEntries(slots.map((slot) => [slot.slot_type, parseJson(slot.eligibility_json, {})])),
    abilities: abilities.map((ability) => ({
      abilityId: ability.ability_id,
      id: ability.ability_id,
      name: ability.name,
      actionDefinitionId: ability.action_definition_id,
      handlerId: parseJson<{ handlerId?: string }>(ability.definition_json, {}).handlerId,
      parameters: {
        target: parseJson(ability.target_selector_json, {}),
        effect: parseJson(ability.effect_json, {}),
      },
    })),
    legacyDefinition: definition,
    cargoProfileId: row.cargo_profile_id,
    cargoProfile: row.cargo_profile_id
      ? {
          id: row.cargo_profile_id,
          name: row.cargo_profile_name,
          capacity: parseJson(row.cargo_capacity_json, {}),
          loadingRules: parseJson(row.cargo_loading_rules_json, {}),
        }
      : undefined,
    cargoSummary: row.cargo_profile_name,
    supplyProfileId: row.supply_profile_id,
    deploymentProfileId: row.deployment_profile_id,
    deploymentRequirements: parseJson(row.deployment_requirements_json, {}),
    source: row.source,
    notes: row.notes,
  };
}

export async function getUnitCatalogue(env: Env): Promise<{ units: Array<Record<string, unknown>> }> {
  const includeDevelopment = env.ENVIRONMENT === "development";
  const [rows, tags, abilities, weapons, slots] = await Promise.all([
    listCatalogueUnits(env.DB, includeDevelopment),
    listDefinitionTags(env.DB),
    listCatalogueAbilities(env.DB),
    listCatalogueWeapons(env.DB),
    listCatalogueSlots(env.DB),
  ]);
  const allowed = new Set(rows.map((row) => row.id));
  const byDefinition = new Map<string, string[]>();
  for (const tag of tags) {
    if (!allowed.has(tag.definition_id)) continue;
    const list = byDefinition.get(tag.definition_id) ?? [];
    list.push(semanticTag(tag));
    byDefinition.set(tag.definition_id, list);
  }
  return {
    units: rows.map((row) =>
      catalogueItem(
        row,
        byDefinition.get(row.id) ?? [],
        abilities.filter((ability) => ability.definition_id === row.id),
        weapons.filter((weapon) => weapon.definition_id === row.id),
        slots.filter((slot) => slot.definition_id === row.id),
      ),
    ),
  };
}

export async function getForceEligibleEquipment(env: Env, ownerId: string, unitId: string): Promise<unknown> {
  const unit = await getForce(env.DB, ownerId, unitId);
  if (!unit) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  const rows = await getEligibleEquipment(env.DB, ownerId, unitId, env.ENVIRONMENT === "development");
  return {
    unitId,
    equipment: rows.map((row) => {
      const input: D1EquipmentRulesInput = {
        rulesetId: unit.ruleset_id,
        definitionId: String(row.id),
        definitionStatus: String(row.definition_status),
        requisitionCost: typeof row.requisition_cost === "number" ? row.requisition_cost : null,
        implementationStatus: typeof row.implementation_status === "string" ? row.implementation_status : null,
        requisitionStatus: typeof row.requisition_status === "string" ? row.requisition_status : null,
        availabilityStatus: typeof row.availability_status === "string" ? row.availability_status : null,
        executable: row.executable === 1,
        purchasable: row.purchasable === 1,
        reasonCode: typeof row.reason_code === "string" ? row.reason_code : null,
      };
      const resolution = resolveEquipmentRulesAuthority(input, env.ENVIRONMENT);
      const authority = resolution.authority;
      return {
        ...row,
        implementation_status: authority?.status.implementationStatus ?? "CATALOGUE_ONLY",
        requisition_status: authority?.status.requisitionStatus ?? "NOT_APPLICABLE",
        availability_status: authority?.status.availabilityStatus ?? "BLOCKED",
        executable: authority?.decision.executable === true,
        purchasable: authority?.decision.available === true && authority.status.purchasable,
        reason_code: authority?.status.reasonCode ?? "RULES_AUTHORITY_UNAVAILABLE",
      };
    }),
  };
}

export async function getRequisition(env: Env, ownerId: string): Promise<unknown> {
  const [balance, ledger] = await Promise.all([
    getRequisitionBalance(env.DB, ownerId),
    getRequisitionLedger(env.DB, ownerId),
  ]);
  return { balance, ledger };
}

export function isImplementedUnitDefinition(
  definition: Pick<
    CatalogueUnitRow,
    | "implementation_status"
    | "executable"
    | "purchasable"
    | "availability_status"
    | "requisition_status"
    | "requisition_cost"
  >,
): boolean {
  return definition.implementation_status === "IMPLEMENTED" &&
    definition.executable === 1 &&
    definition.purchasable === 1 &&
    definition.availability_status === "AVAILABLE" &&
    definition.requisition_status === "PUBLISHED" &&
    definition.requisition_cost !== null;
}

function replayReceipt(
  receipt: Awaited<ReturnType<typeof getMutationReceipt>>,
  ownerId: string,
  operation: string,
  requestHash: string,
): unknown | undefined {
  if (!receipt) return undefined;
  if (receipt.owner_id !== ownerId || receipt.operation !== operation || receipt.request_hash !== requestHash) {
    throw new ForceServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return parseJson(receipt.response_json, {});
}

export async function renameForce(
  env: Env,
  ownerId: string,
  unitId: string,
  command: RenameForceCommand,
): Promise<unknown> {
  const ownerNamespace = (await commandHash({ ownerId })).slice(0, 16);
  const requestHash = await commandHash({ ownerId, unitId, ...command });
  const replay = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "RENAME_UNIT", requestHash);
  if (replay) return replay;
  const current = await getForce(env.DB, ownerId, unitId);
  if (!current) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  if (current.version !== command.expectedVersion) {
    throw new ForceServiceError(409, "UNIT_VERSION_CONFLICT", "Unit changed since it was opened.", {
      expectedVersion: command.expectedVersion,
      currentVersion: current.version,
    });
  }
  if (current.status === "DESTROYED") {
    throw new ForceServiceError(409, "UNIT_DESTROYED", "Destroyed units remain memorial records and cannot be renamed.");
  }
  const response = {
    unitId,
    name: command.name,
    callsign: command.callsign,
    description: command.description ?? current.description,
    version: command.expectedVersion + 1,
  };
  try {
    await env.DB.batch([
      env.DB
        .prepare(`UPDATE player_units
                     SET name = ?1, callsign = ?2,
                         description = COALESCE(?3, description),
                         version = version + 1, updated_at = unixepoch()
                   WHERE id = ?4 AND owner_id = ?5 AND version = ?6`)
        .bind(command.name, command.callsign, command.description ?? null, unitId, ownerId, command.expectedVersion),
      env.DB
        .prepare(`INSERT INTO unit_history (
                    id, player_unit_id, event_type, summary, payload_json,
                    occurred_at, idempotency_key, actor_user_id, visibility
                  )
                  SELECT ?1, id, 'RENAMED', ?2, ?3, unixepoch(), ?4, ?5, 'OWNER'
                   FROM player_units
                   WHERE id = ?6 AND owner_id = ?5 AND version = ?7
                     AND name = ?8 AND callsign = ?9 AND description = ?10`)
        .bind(
          `history:${ownerNamespace}:${command.commandId}`,
          `${command.callsign} received a new persistent identity.`,
          JSON.stringify({ name: command.name, callsign: command.callsign, description: response.description }),
          `force:${ownerNamespace}:${command.commandId}`,
          ownerId,
          unitId,
          command.expectedVersion + 1,
          command.name,
          command.callsign,
          response.description,
        ),
      env.DB
        .prepare(`INSERT INTO force_mutation_receipts (
                    idempotency_key, owner_id, operation, request_hash, response_json
                  )
                  SELECT ?1, owner_id, 'RENAME_UNIT', ?2, ?3
                   FROM player_units
                   WHERE id = ?4 AND owner_id = ?5 AND version = ?6
                     AND name = ?7 AND callsign = ?8 AND description = ?9`)
        .bind(
          command.commandId,
          requestHash,
          JSON.stringify(response),
          unitId,
          ownerId,
          command.expectedVersion + 1,
          command.name,
          command.callsign,
          response.description,
        ),
    ]);
  } catch (error) {
    const afterRace = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "RENAME_UNIT", requestHash);
    if (afterRace) return afterRace;
    throw error;
  }
  const receipt = await getMutationReceipt(env.DB, ownerId, command.commandId);
  const committed = replayReceipt(receipt, ownerId, "RENAME_UNIT", requestHash);
  if (!committed) throw new ForceServiceError(409, "UNIT_VERSION_CONFLICT", "Unit changed while the rename was committed.");
  return committed;
}

export async function progressIrregularForce(
  env: Env,
  ownerId: string,
  unitId: string,
  command: ProgressIrregularCommand,
): Promise<unknown> {
  const operation = "PROGRESS_IRREGULAR";
  const requestHash = await commandHash({ ownerId, unitId, ...command });
  const replay = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, operation, requestHash);
  if (replay) return replay;
  const unit = await getForce(env.DB, ownerId, unitId);
  if (!unit) throw new ForceServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  if (unit.definition_id !== "unit-irregular") throw new ForceServiceError(409, "IRREGULAR_REQUIRED", "Only a base Irregular unit may choose a progression track.");
  if (unit.version !== command.expectedVersion) throw new ForceServiceError(409, "UNIT_VERSION_CONFLICT", "Unit changed since it was opened.");
  if (unit.status === "DESTROYED") throw new ForceServiceError(409, "UNIT_DESTROYED", "Destroyed units cannot progress.");
  if (unit.location_state !== "RESERVE") throw new ForceServiceError(409, "HEADQUARTERS_REQUIRED", "Irregular progression is performed from Reserve at Battalion Headquarters.");
  const service = await getForceServiceSummary(env.DB, ownerId, unitId);
  if ((service?.campaigns_completed ?? 0) < 2 || (service?.objectives_completed ?? 0) < 12) {
    throw new ForceServiceError(409, "PROGRESSION_REQUIREMENTS_NOT_MET", "Irregular progression requires two completed campaigns and 12 recorded objective XP.");
  }
  const alreadyProgressed = (await getForceStatusEffects(env.DB, ownerId, unitId))
    .some((effect) => effect.status_effect_id === "status-irregular-progression-public-v1");
  if (alreadyProgressed) throw new ForceServiceError(409, "PROGRESSION_ALREADY_CHOSEN", "Irregular progression is irreversible.");
  const track = IRREGULAR_PROGRESSION_TRACKS[command.track];
  const cost = track.requisitionValue - 4;
  const balance = await getRequisitionBalance(env.DB, ownerId);
  if (balance < cost) throw new ForceServiceError(409, "REQUISITION_INSUFFICIENT", `This progression requires ${cost} Req.`);
  const response = {
    unitId,
    track: command.track,
    name: track.name,
    requisitionSpent: cost,
    maximumHealth: track.maxHealth,
    armor: track.armor,
    speed: track.speed,
    version: command.expectedVersion + 1,
  };
  const effectId = `irregular-progression:${unitId}:${command.track}`;
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO requisition_transactions (
        id,user_id,amount,reason_code,description,related_entity_type,related_entity_id,idempotency_key
      ) SELECT ?1,?2,?3,'IRREGULAR_PROGRESSION',?4,'PLAYER_UNIT',?5,?1
        WHERE ?3 < 0 AND (SELECT COALESCE(SUM(amount),0) FROM requisition_transactions WHERE user_id=?2) >= -?3`)
        .bind(`req:irregular:${ownerId}:${command.commandId}`, ownerId, -cost, `${unit.callsign} progressed to ${track.name}.`, unitId),
      env.DB.prepare(`UPDATE player_units SET maximum_health=?1, current_health=MIN(current_health,?1),
        base_stats_json=json_set(base_stats_json,'$.maxHealth',?1,'$.armor',?2,'$.speed',?3),
        requisition_value=?4, version=version+1, updated_at=unixepoch()
        WHERE id=?5 AND owner_id=?6 AND definition_id='unit-irregular' AND version=?7
          AND (?8=0 OR EXISTS (SELECT 1 FROM requisition_transactions WHERE id=?9 AND user_id=?6))`)
        .bind(track.maxHealth, track.armor, track.speed, track.requisitionValue, unitId, ownerId, command.expectedVersion,
          cost, `req:irregular:${ownerId}:${command.commandId}`),
      env.DB.prepare(`INSERT INTO player_unit_status_effects (
        id,player_unit_id,ruleset_id,status_effect_id,source_unit_id,state_json
      ) SELECT ?1,id,ruleset_id,'status-irregular-progression-public-v1',id,?2
        FROM player_units WHERE id=?3 AND owner_id=?4 AND version=?5`)
        .bind(effectId, JSON.stringify({ track: command.track, permanent: true, damageDivisor: track.damageDivisor }), unitId, ownerId, command.expectedVersion + 1),
      env.DB.prepare(`INSERT INTO unit_history (
        id,player_unit_id,event_type,summary,payload_json,occurred_at,idempotency_key,actor_user_id,visibility
      ) SELECT ?1,id,'IRREGULAR_PROGRESSED',?2,?3,unixepoch(),?4,owner_id,'OWNER'
        FROM player_units WHERE id=?5 AND owner_id=?6 AND version=?7`)
        .bind(`history:irregular:${ownerId}:${command.commandId}`, `${unit.callsign} became ${track.name}.`, JSON.stringify(response), `force:irregular:${ownerId}:${command.commandId}`, unitId, ownerId, command.expectedVersion + 1),
      env.DB.prepare(`INSERT INTO force_mutation_receipts (idempotency_key,owner_id,operation,request_hash,response_json)
        SELECT ?1,owner_id,?2,?3,?4 FROM player_units WHERE id=?5 AND owner_id=?6 AND version=?7`)
        .bind(command.commandId, operation, requestHash, JSON.stringify(response), unitId, ownerId, command.expectedVersion + 1),
    ]);
  } catch (error) {
    const afterRace = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, operation, requestHash);
    if (afterRace) return afterRace;
    throw error;
  }
  const committed = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, operation, requestHash);
  if (!committed) throw new ForceServiceError(409, "UNIT_VERSION_CONFLICT", "Unit changed while progression was committed.");
  return committed;
}

export async function purchaseForce(
  env: Env,
  ownerId: string,
  command: PurchaseForceCommand,
): Promise<unknown> {
  const ownerNamespace = (await commandHash({ ownerId })).slice(0, 16);
  const requestHash = await commandHash({ ownerId, ...command });
  const replay = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_UNIT", requestHash);
  if (replay) return replay;
  const definition = await getPurchasableDefinition(env.DB, command.definitionId);
  if (!definition) throw new ForceServiceError(404, "DEFINITION_NOT_FOUND", "Unit definition was not found.");

  const normallyPurchasable = isImplementedUnitDefinition(definition);
  if (!normallyPurchasable) {
    throw new ForceServiceError(422, "DEFINITION_NOT_PURCHASABLE", "This class cannot be requisitioned in the active profile.", {
      implementationStatus: definition.implementation_status,
      requisitionStatus: definition.requisition_status,
      availabilityStatus: definition.availability_status,
      reasonCode: definition.reason_code,
    });
  }
  const price = definition.requisition_cost!;
  if ((await getRequisitionBalance(env.DB, ownerId)) < price) {
    throw new ForceServiceError(422, "REQUISITION_INSUFFICIENT", "Insufficient requisition balance.");
  }
  const unitId = `unit-${requestHash.slice(0, 24)}`;
  const response = {
    unitId,
    definitionId: definition.id,
    name: command.desiredName,
    callsign: command.callsign,
    acquisition: "REQUISITION",
    requisitionSpent: price,
    version: 1,
  };
  const baseStats = JSON.stringify({
    healthModel: definition.health_model,
    maxHealth: definition.max_health,
    armor: definition.armor,
    defense: definition.defense,
    speed: definition.speed_quarters / 4,
    sensors: definition.sensor_range,
    capacity: 0,
  });

  const statements: D1PreparedStatement[] = [];
  statements.push(
      env.DB
        .prepare(`INSERT INTO requisition_transactions (
                    id, user_id, amount, reason_code, description,
                    related_entity_type, related_entity_id, idempotency_key
                  )
                  SELECT ?1, ?2, -?3, 'UNIT_PURCHASE', ?4, 'PLAYER_UNIT', ?5, ?6
                   WHERE (SELECT COALESCE(SUM(amount), 0)
                            FROM requisition_transactions
                           WHERE user_id = ?2) >= ?3`)
        .bind(
          `req:${ownerNamespace}:${command.commandId}`,
          ownerId,
          price,
          `Requisitioned ${definition.name} ${command.callsign}.`,
          unitId,
          `requisition:${ownerNamespace}:${command.commandId}`,
        ),
    );
  statements.push(
    env.DB
      .prepare(`INSERT INTO player_units (
                  id, owner_id, ruleset_id, definition_id, callsign, name,
                  status, current_health, base_stats_json, requisition_value,
                  requisition_value_status, location_kind, location_state,
                  description, version
                )
                SELECT ?1, ?2, ?3, ?4, ?5, ?6,
                       'ACTIVE', ?7, ?8, ?9, ?10,
                       'RESERVE', 'RESERVE', '', 1
                 WHERE ?11 = 1
                    OR EXISTS (
                      SELECT 1 FROM requisition_transactions
                       WHERE id = ?12 AND user_id = ?2
                    )`)
      .bind(
        unitId,
        ownerId,
        definition.ruleset_id,
        definition.id,
        command.callsign,
        command.desiredName,
        definition.max_health,
        baseStats,
        price,
        "PUBLISHED",
        0,
        `req:${ownerNamespace}:${command.commandId}`,
      ),
    env.DB
      .prepare(`INSERT INTO player_unit_weapon_mounts (
                  id, player_unit_id, ruleset_id, weapon_definition_id,
                  source_kind, mount_role, mount_index, current_ammo
                )
                SELECT ?1 || ':weapon:' || links.mount_role || ':' || links.mount_index,
                       ?1, links.ruleset_id, links.weapon_definition_id,
                       'BASE', links.mount_role, links.mount_index,
                       weapons.ammo_capacity
                  FROM unit_definition_weapons AS links
                  JOIN weapon_definitions AS weapons
                    ON weapons.id = links.weapon_definition_id
                   AND weapons.ruleset_id = links.ruleset_id
                 WHERE links.unit_definition_id = ?2
                   AND links.ruleset_id = ?3
                   AND EXISTS (SELECT 1 FROM player_units WHERE id = ?1 AND owner_id = ?4)`)
      .bind(unitId, definition.id, definition.ruleset_id, ownerId),
    env.DB
      .prepare(`INSERT INTO player_unit_subsystems (player_unit_id, subsystem_type)
                SELECT ?1, subsystem_type
                  FROM (SELECT 'WEAPONS' AS subsystem_type UNION ALL SELECT 'MOBILITY')
                 WHERE EXISTS (
                   SELECT 1
                     FROM player_units AS pu
                     JOIN unit_definition_profiles AS profiles
                       ON profiles.unit_definition_id = pu.definition_id
                      AND profiles.ruleset_id = pu.ruleset_id
                     JOIN durability_profile_definitions AS durability
                       ON durability.id = profiles.durability_profile_id
                      AND durability.ruleset_id = profiles.ruleset_id
                    WHERE pu.id = ?1 AND pu.owner_id = ?2
                      AND durability.supports_subsystems = 1
                 )`)
      .bind(unitId, ownerId),
    env.DB
      .prepare(`INSERT INTO player_unit_loadouts (
                  id, player_unit_id, name, loadout_kind, status, revision
                )
                SELECT ?1 || ':loadout:default', id, 'Owned Default',
                       'OWNED_DEFAULT', 'ACTIVE', 1
                  FROM player_units WHERE id = ?1 AND owner_id = ?2`)
      .bind(unitId, ownerId),
    env.DB
      .prepare(`INSERT INTO unit_cargo_manifests (
                  carrier_unit_id, ruleset_id, cargo_profile_id, revision
                )
                SELECT units.id, units.ruleset_id, profiles.cargo_profile_id, 1
                  FROM player_units AS units
                  JOIN unit_definition_profiles AS profiles
                    ON profiles.unit_definition_id = units.definition_id
                   AND profiles.ruleset_id = units.ruleset_id
                 WHERE units.id = ?1 AND units.owner_id = ?2
                   AND profiles.cargo_profile_id IS NOT NULL`)
      .bind(unitId, ownerId),
    env.DB
      .prepare(`INSERT INTO player_unit_supplies (
                  player_unit_id, resource_type,
                  current_quantity, maximum_quantity, revision
                )
                SELECT units.id, capacity.key,
                       COALESCE(
                         CAST(json_extract(supplies.definition_json, '$.initial.' || capacity.key) AS INTEGER),
                         0
                       ),
                       CAST(json_extract(capacity.value, '$.maximum') AS INTEGER), 1
                  FROM player_units AS units
                  JOIN unit_definition_profiles AS profiles
                    ON profiles.unit_definition_id = units.definition_id
                   AND profiles.ruleset_id = units.ruleset_id
                  JOIN supply_profile_definitions AS supplies
                    ON supplies.id = profiles.supply_profile_id
                   AND supplies.ruleset_id = profiles.ruleset_id
                  JOIN json_each(supplies.capacities_json) AS capacity
                 WHERE units.id = ?1 AND units.owner_id = ?2
                   AND json_type(capacity.value, '$.maximum') = 'integer'`)
      .bind(unitId, ownerId),
    env.DB
      .prepare(`INSERT INTO unit_service_summaries (
                  player_unit_id, campaigns_completed, rounds_served,
                  objectives_completed, units_destroyed, revision
                )
                SELECT id, 0, 0, 0, 0, 1
                  FROM player_units WHERE id = ?1 AND owner_id = ?2`)
      .bind(unitId, ownerId),
    env.DB
      .prepare(`INSERT INTO unit_history (
                  id, player_unit_id, event_type, summary, definition_id,
                  payload_json, occurred_at, idempotency_key,
                  actor_user_id, visibility
                )
                SELECT ?1, id, 'PURCHASED', ?2, definition_id, ?3,
                       unixepoch(), ?4, owner_id, 'OWNER'
                  FROM player_units WHERE id = ?5 AND owner_id = ?6`)
      .bind(
        `history:${ownerNamespace}:${command.commandId}`,
        `${command.callsign} joined the persistent force.`,
        JSON.stringify({ definitionId: definition.id, acquisition: response.acquisition, requisitionSpent: price }),
        `force:${ownerNamespace}:${command.commandId}`,
        unitId,
        ownerId,
      ),
    env.DB
      .prepare(`INSERT INTO force_mutation_receipts (
                  idempotency_key, owner_id, operation, request_hash, response_json
                )
                SELECT ?1, owner_id, 'PURCHASE_UNIT', ?2, ?3
                  FROM player_units WHERE id = ?4 AND owner_id = ?5`)
      .bind(command.commandId, requestHash, JSON.stringify(response), unitId, ownerId),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const afterRace = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_UNIT", requestHash);
    if (afterRace) return afterRace;
    throw error;
  }
  const committed = replayReceipt(await getMutationReceipt(env.DB, ownerId, command.commandId), ownerId, "PURCHASE_UNIT", requestHash);
  if (!committed) {
    throw new ForceServiceError(422, "REQUISITION_INSUFFICIENT", "Insufficient requisition balance.");
  }
  return committed;
}

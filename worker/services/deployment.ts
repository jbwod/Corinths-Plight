import type {
  CargoManifestItem,
  DeploymentPlanState,
  EffectiveUnit,
} from "../../packages/domain/src";
import {
  createCampaignLoadoutSnapshot,
  validateCargoManifest,
  validateDeploymentPlan,
} from "../../packages/rules-engine/src";
import type { Env } from "../env";
import type { SaveDeploymentPlanCommand } from "../equipment-validation";
import { commandHash } from "../forces-validation";
import {
  getDeploymentAuthority,
  getDeploymentFormation,
  getDeploymentMethod,
  getDeploymentPlan,
  getDeploymentReceipt,
  getDeploymentUnit,
  getStrategicNodePlanetLocation,
  listDeploymentPlans,
  listDeploymentPlanUnits,
  listDeploymentTransports,
  listInsertionZones,
  type DeploymentPlanRow,
} from "../repositories/equipment";
import { buildStoredEffectiveUnit } from "./equipment";
import { ForceServiceError } from "./forces";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function canCommand(role: string, campaignRole: string): boolean {
  return role === "ADMIN" || role === "BATTALION_COMMAND" ||
    campaignRole === "GM" || campaignRole === "BATTALION_COMMAND" || campaignRole === "PLAYER";
}

async function requireStrategicDeploymentOrder(
  db: D1Database,
  operationId: string | null,
  formation: NonNullable<Awaited<ReturnType<typeof getDeploymentFormation>>>,
  deploymentMethod: string,
): Promise<void> {
  if (!operationId) return;
  if (formation.status !== "DEPLOYING" || formation.current_operation_id !== operationId) {
    throw new ForceServiceError(
      409,
      "STRATEGIC_DEPLOYMENT_ORDER_REQUIRED",
      "Authorize this Battlegroup deployment from Galactic Operations and resolve the strategic round first.",
    );
  }
  const authorization = await db.prepare(`SELECT intent_json FROM strategic_orders
    WHERE battlegroup_id=?1 AND operation_id=?2 AND order_type='DEPLOY_TO_CAMPAIGN'
      AND lifecycle='RESOLVED'
    ORDER BY resolved_at DESC,id DESC LIMIT 1`)
    .bind(formation.id, operationId).first<{ intent_json: string }>();
  const intent = parseJson<{ type?: string; deploymentMethod?: string }>(authorization?.intent_json, {});
  const tacticalMethodsByStrategicMethod: Record<string, readonly string[]> = {
    STANDARD_LANDING: ["STANDARD_GROUND"],
    VTOL_DEPLOYMENT: ["VTOL_INSERTION"],
    AEROSPACE_TRANSPORT: ["HEAVY_AIR_TRANSPORT"],
    ORBITAL_DROP: ["ORBITAL_DROP"],
    SHIP_SURFACE_LANDING: ["STANDARD_GROUND"],
  };
  if (
    intent.type !== "DEPLOY_TO_CAMPAIGN" ||
    !intent.deploymentMethod ||
    !tacticalMethodsByStrategicMethod[intent.deploymentMethod]?.includes(deploymentMethod)
  ) {
    throw new ForceServiceError(
      409,
      "STRATEGIC_DEPLOYMENT_METHOD_MISMATCH",
      "The deployment plan must use the insertion method authorised by the resolved strategic order.",
    );
  }
}

async function requireFormationAtOperation(
  db: D1Database,
  formation: Awaited<ReturnType<typeof getDeploymentFormation>>,
  operationNodeId: string | null,
): Promise<void> {
  if (!formation || !operationNodeId) return;
  let available = formation.current_node_id === operationNodeId;
  if (formation.status === "EMBARKED" && formation.carrier_node_id) {
    const [carrierPlanet, operationPlanet] = await Promise.all([
      getStrategicNodePlanetLocation(db, formation.carrier_node_id),
      getStrategicNodePlanetLocation(db, operationNodeId),
    ]);
    available = carrierPlanet !== null && carrierPlanet === operationPlanet;
  }
  if (!available) {
    throw new ForceServiceError(
      409,
      "BATTLEGROUP_OPERATION_LOCATION_MISMATCH",
      "The Battlegroup must reach the operation node, or its carrier must reach that operation's planet, before deployment.",
    );
  }
}

function receiptReplay(
  receipt: Awaited<ReturnType<typeof getDeploymentReceipt>>,
  operation: string,
  requestHash: string,
): unknown | undefined {
  if (!receipt) return undefined;
  if (receipt.operation !== operation || receipt.request_hash !== requestHash) {
    throw new ForceServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different deployment content.");
  }
  return parseJson(receipt.response_json, {});
}

async function planProjection(env: Env, userId: string, row: DeploymentPlanRow): Promise<unknown> {
  const [units, transports, zones] = await Promise.all([
    listDeploymentPlanUnits(env.DB, row.id),
    listDeploymentTransports(env.DB, row.id),
    listInsertionZones(env.DB, row.campaign_id),
  ]);
  const insertion = zones.find((zone) => zone.id === row.insertion_zone_id);
  return {
    id: row.id,
    campaignId: row.campaign_id,
    battalionId: row.battalion_id,
    battlegroupId: row.battlegroup_id,
    createdBy: row.created_by,
    status: row.status,
    method: row.deployment_method_id,
    insertionZone: insertion ? { id: insertion.id, hex: { q: insertion.hex_q, r: insertion.hex_r } } : null,
    route: parseJson(row.route_json, []),
    validation: parseJson(row.validation_json, {}),
    revision: row.revision,
    committedAt: row.committed_at,
    units: units.map((unit) => ({
      unitId: unit.player_unit_id,
      ownerId: unit.owner_id,
      loadoutId: unit.loadout_id,
      ownerApproval: unit.owner_approval,
      commandApproval: unit.command_approval,
      expectedUnitVersion: unit.expected_unit_version,
      expectedLoadoutRevision: unit.expected_loadout_revision,
    })),
    transports: transports.map((transport) => ({
      carrierUnitId: transport.carrier_unit_id,
      cargoProfileId: transport.cargo_profile_id,
      cargo: parseJson(transport.manifest_json, []),
      usedSlotsQuarters: transport.used_slots_quarters,
      capacitySlotsQuarters: transport.capacity_slots_quarters,
    })),
    viewerId: userId,
  };
}

export async function listPlans(env: Env, userId: string): Promise<unknown> {
  const rows = await listDeploymentPlans(env.DB, userId);
  return { plans: await Promise.all(rows.map((row) => planProjection(env, userId, row))) };
}

export async function getPlanningContext(env: Env, userId: string, campaignId: string): Promise<unknown> {
  const authority = await getDeploymentAuthority(env.DB, userId, campaignId);
  if (!authority) throw new ForceServiceError(404, "CAMPAIGN_NOT_FOUND", "Allied campaign deployment authority was not found.");
  const [zones, methods] = await Promise.all([
    listInsertionZones(env.DB, campaignId),
    env.DB.prepare(`SELECT id,name,implementation_status,requirements_json
      FROM deployment_method_definitions WHERE ruleset_id = ?1 ORDER BY id`)
      .bind(authority.campaign_ruleset_id).all<{ id: string; name: string; implementation_status: string; requirements_json: string }>(),
  ]);
  return {
    campaignId,
    battalionId: authority.battalion_id,
    canCommit: canCommand(authority.command_role, authority.campaign_role),
    strategicOperation: authority.operation_id ? {
      id: authority.operation_id,
      nodeId: authority.operation_node_id,
      status: authority.operation_status,
    } : null,
    methods: methods.results.map((method) => ({ ...method, requirements: parseJson(method.requirements_json, {}) })),
    insertionZones: zones.map((zone) => ({ id: zone.id, hex: { q: zone.hex_q, r: zone.hex_r }, allowedMethods: parseJson(zone.allowed_methods_json, []), environment: parseJson(zone.environment_json, []) })),
  };
}

export async function inspectPlan(env: Env, userId: string, planId: string): Promise<unknown> {
  const row = await getDeploymentPlan(env.DB, userId, planId);
  if (!row) throw new ForceServiceError(404, "DEPLOYMENT_PLAN_NOT_FOUND", "Deployment plan was not found.");
  return planProjection(env, userId, row);
}

interface MaterializedPlan {
  plan: DeploymentPlanState;
  validation: ReturnType<typeof validateDeploymentPlan>;
  selected: Array<{
    unitId: string;
    ownerId: string;
    loadoutId: string;
    expectedUnitVersion: number;
    expectedLoadoutRevision: number;
    rulesetId: string;
    effectiveUnit: EffectiveUnit;
    ownerApproved: boolean;
    commandApproved: boolean;
  }>;
  insertionZoneId?: string;
}

async function materialize(
  env: Env,
  actorId: string,
  command: SaveDeploymentPlanCommand,
): Promise<MaterializedPlan> {
  const authority = await getDeploymentAuthority(env.DB, actorId, command.campaignId);
  if (!authority) throw new ForceServiceError(404, "CAMPAIGN_NOT_FOUND", "Allied campaign deployment authority was not found.");
  const method = await getDeploymentMethod(env.DB, authority.campaign_ruleset_id, command.method);
  if (!method || method.implementation_status !== "IMPLEMENTED") {
    throw new ForceServiceError(422, "INSERTION_METHOD_UNAVAILABLE", `${command.method} is not executable in this ruleset.`);
  }
  const zones = await listInsertionZones(env.DB, command.campaignId);
  const zone = command.insertionZoneId ? zones.find((candidate) => candidate.id === command.insertionZoneId) : undefined;
  if (command.insertionZoneId && !zone) throw new ForceServiceError(422, "INSERTION_ZONE_INVALID", "Insertion zone is closed or unavailable.");
  if (zone && !parseJson<string[]>(zone.allowed_methods_json, []).includes(command.method)) {
    throw new ForceServiceError(422, "INSERTION_METHOD_UNAVAILABLE", "The insertion zone does not permit this method.");
  }
  const commandAuthority = canCommand(authority.command_role, authority.campaign_role);
  if (authority.operation_id && !command.battlegroupId) {
    throw new ForceServiceError(422, "BATTLEGROUP_REQUIRED", "A strategic operation deployment must reserve one Battlegroup.");
  }
  if (authority.operation_id && !["MUSTERING", "ACTIVE"].includes(authority.operation_status ?? "")) {
    throw new ForceServiceError(409, "OPERATION_NOT_ACCEPTING_DEPLOYMENTS", "The linked strategic operation is not accepting deployments.");
  }
  if (command.battlegroupId) {
    const formation = await getDeploymentFormation(env.DB, authority.battalion_id, command.battlegroupId);
    if (!formation) throw new ForceServiceError(404, "BATTLEGROUP_NOT_FOUND", "The selected Battlegroup is outside this Battalion.");
    const allowedFormationStatuses = authority.operation_id
      ? ["DEPLOYING"]
      : ["READY", "EMBARKED", "RECOVERING"];
    if (!allowedFormationStatuses.includes(formation.status)) {
      throw new ForceServiceError(409, "BATTLEGROUP_UNAVAILABLE", `Battlegroup ${command.battlegroupId} is ${formation.status.toLowerCase()} and cannot deploy.`);
    }
    await requireStrategicDeploymentOrder(env.DB, authority.operation_id, formation, command.method);
    if (formation.current_operation_id && formation.current_operation_id !== authority.operation_id) {
      throw new ForceServiceError(409, "BATTLEGROUP_ALREADY_ASSIGNED", "The selected Battlegroup is assigned to another operation.");
    }
    if (formation.status === "EMBARKED" &&
        (formation.carrier_link_status !== "EMBARKED" || !formation.current_carrier_task_force_id || !formation.carrier_node_id)) {
      throw new ForceServiceError(409, "BATTLEGROUP_LOCATION_INVALID", "The embarked Battlegroup has no active carrier location.");
    }
    await requireFormationAtOperation(env.DB, formation, authority.operation_node_id);
  }
  const selected: MaterializedPlan["selected"] = [];
  for (const requested of command.units) {
    const unit = await getDeploymentUnit(env.DB, actorId, authority.battalion_id, command.campaignId, requested.unitId);
    if (!unit || unit.authority === "NONE") {
      throw new ForceServiceError(404, "UNIT_NOT_FOUND", "A selected unit is outside the actor's Battalion authority.");
    }
    if (!["ACTIVE", "DAMAGED"].includes(unit.unit_status) || !["RESERVE", "ON_SHIP"].includes(unit.location_state)) {
      throw new ForceServiceError(409, "UNIT_LOCATION_UNAVAILABLE", `Unit ${requested.unitId} is not available from its current persistent location.`);
    }
    if (!authority.operation_id && authority.campaign_node_id && unit.location_state === "RESERVE" &&
        unit.location_id && unit.location_id !== authority.campaign_node_id) {
      throw new ForceServiceError(409, "UNIT_STRATEGIC_LOCATION_MISMATCH", `Unit ${requested.unitId} must travel to the campaign node before deployment.`);
    }
    if (unit.loadout_id !== requested.loadoutId || unit.unit_version !== requested.expectedUnitVersion || unit.loadout_revision !== requested.expectedLoadoutRevision) {
      throw new ForceServiceError(409, "DEPLOYMENT_UNIT_VERSION_CONFLICT", `Unit ${requested.unitId} or its loadout changed.`);
    }
    if (command.battlegroupId && unit.battlegroup_id !== command.battlegroupId) {
      throw new ForceServiceError(422, "BATTLEGROUP_UNIT_MISMATCH", `Unit ${requested.unitId} is not in the selected Battlegroup.`);
    }
    const built = await buildStoredEffectiveUnit(env, unit.owner_id, unit.unit_id);
    if (!built.result.valid || !built.result.unit) {
      throw new ForceServiceError(422, "EFFECTIVE_UNIT_INVALID", `Unit ${requested.unitId} has an invalid authoritative loadout.`, { errors: built.result.errors });
    }
    selected.push({
      unitId: unit.unit_id,
      ownerId: unit.owner_id,
      loadoutId: unit.loadout_id,
      expectedUnitVersion: unit.unit_version,
      expectedLoadoutRevision: unit.loadout_revision,
      rulesetId: built.context.ruleset_id,
      effectiveUnit: built.result.unit,
      ownerApproved: unit.owner_id === actorId,
      commandApproved: !command.battlegroupId || commandAuthority,
    });
  }
  const selectedById = new Map(selected.map((item) => [item.unitId, item]));
  const assignments = command.transports.map((transport) => {
    const carrier = selectedById.get(transport.carrierUnitId);
    if (!carrier?.effectiveUnit.cargoProfile) {
      throw new ForceServiceError(422, "TRANSPORT_UNAVAILABLE", `Carrier ${transport.carrierUnitId} has no executable cargo profile.`);
    }
    if (carrier.effectiveUnit.cargoProfile.id !== transport.cargoProfileId) {
      throw new ForceServiceError(422, "CARGO_PROFILE_MISMATCH", "Cargo profile is server-derived and did not match the carrier.");
    }
    const cargo: CargoManifestItem[] = transport.cargo.map((requested) => {
      if (!requested.unitId) throw new ForceServiceError(422, "SUPPLY_LIFT_DEFERRED", "This checkpoint accepts unit cargo; Supply lift requires an authoritative store selection.");
      const carried = selectedById.get(requested.unitId);
      if (!carried) throw new ForceServiceError(422, "CARGO_UNIT_NOT_SELECTED", "Cargo unit is not part of the deployment plan.");
      return {
        id: `deployment:${command.planId}:${carried.unitId}`,
        kind: carried.effectiveUnit.tags.includes("INFANTRY") ? "PERSONNEL" : "VEHICLE",
        quantity: 1,
        tags: carried.effectiveUnit.tags,
        transportMode: command.method === "PARADROP" ? "AIRLIFTED" : "EMBARKED",
        unitId: carried.unitId,
      };
    });
    const cargoValidation = validateCargoManifest(carrier.effectiveUnit.cargoProfile, cargo);
    if (!cargoValidation.legal) throw new ForceServiceError(422, "TRANSPORT_CAPACITY_INVALID", cargoValidation.reasons[0] ?? "Transport capacity is invalid.");
    return { carrierUnitId: carrier.unitId, cargo, profile: carrier.effectiveUnit.cargoProfile };
  });
  const plan: DeploymentPlanState = {
    id: command.planId,
    campaignId: command.campaignId,
    battalionId: authority.battalion_id,
    battlegroupId: command.battlegroupId,
    createdBy: actorId,
    status: "DRAFT",
    revision: command.expectedRevision,
    method: command.method,
    insertionHex: zone ? { q: zone.hex_q, r: zone.hex_r } : undefined,
    transportRoute: command.route,
    unitSelections: selected.map((item) => ({
      unitId: item.unitId,
      ownerId: item.ownerId,
      effectiveUnit: item.effectiveUnit,
      ownerApproved: item.ownerApproved,
      commandApproved: item.commandApproved,
    })),
    transportAssignments: assignments,
  };
  const validation = validateDeploymentPlan(plan, {
    actorId,
    canCommandBattlegroup: commandAuthority,
    campaignOpen: ["DRAFT", "RECRUITING", "ACTIVE"].includes(authority.campaign_status),
    availableMethods: [command.method],
    campaignInsertionHexes: zones.map((item) => ({ q: item.hex_q, r: item.hex_r })),
    occupiedUnitIds: [],
    operationalCarrierIds: assignments.map((item) => item.carrierUnitId),
  });
  return { plan, validation, selected, insertionZoneId: zone?.id };
}

export async function savePlan(env: Env, actorId: string, command: SaveDeploymentPlanCommand): Promise<unknown> {
  const requestHash = await commandHash({ actorId, operation: "SAVE_DEPLOYMENT_PLAN", ...command });
  const prior = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "SAVE_DEPLOYMENT_PLAN", requestHash);
  if (prior) return prior;
  const existing = await getDeploymentPlan(env.DB, actorId, command.planId);
  if ((existing?.revision ?? 0) !== command.expectedRevision) {
    throw new ForceServiceError(409, "DEPLOYMENT_PLAN_VERSION_CONFLICT", "Deployment plan changed since it was opened.", { currentRevision: existing?.revision ?? 0 });
  }
  if (existing && ["COMMITTED", "DEPLOYING", "DEPLOYED", "CANCELLED"].includes(existing.status)) {
    throw new ForceServiceError(409, "DEPLOYMENT_PLAN_LOCKED", "Committed or cancelled deployment plans cannot be edited.");
  }
  const materialized = await materialize(env, actorId, command);
  const nextRevision = command.expectedRevision + 1;
  const status = materialized.validation.valid ? "VALID" : "INVALID";
  const response = {
    planId: command.planId,
    revision: nextRevision,
    status,
    validation: materialized.validation,
  };
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(env.DB.prepare(`UPDATE deployment_plans SET battlegroup_id = ?1,
      status = ?2, deployment_method_id = ?3, insertion_zone_id = ?4, route_json = ?5,
      validation_json = ?6, revision = revision + 1, updated_at = unixepoch()
      WHERE id = ?7 AND revision = ?8 AND status IN ('DRAFT','VALID','INVALID')`)
      .bind(command.battlegroupId ?? null, status, command.method, materialized.insertionZoneId ?? null,
        JSON.stringify(command.route), JSON.stringify(materialized.validation), command.planId, command.expectedRevision));
    statements.push(
      env.DB.prepare(`DELETE FROM deployment_plan_units WHERE deployment_plan_id = ?1`).bind(command.planId),
      env.DB.prepare(`DELETE FROM deployment_transport_assignments WHERE deployment_plan_id = ?1`).bind(command.planId),
    );
  } else {
    statements.push(env.DB.prepare(`INSERT INTO deployment_plans (
      id, campaign_id, battalion_id, battlegroup_id, created_by, ruleset_id, status,
      deployment_method_id, insertion_zone_id, route_json, validation_json, revision
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1)`)
      .bind(command.planId, command.campaignId, materialized.plan.battalionId,
        command.battlegroupId ?? null, actorId, materialized.selected[0].rulesetId,
        status, command.method, materialized.insertionZoneId ?? null, JSON.stringify(command.route), JSON.stringify(materialized.validation)));
  }
  for (const selected of materialized.selected) {
    statements.push(env.DB.prepare(`INSERT INTO deployment_plan_units (
      deployment_plan_id, player_unit_id, owner_id, loadout_id, owner_approval,
      command_approval, expected_unit_version, expected_loadout_revision
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
      .bind(command.planId, selected.unitId, selected.ownerId, selected.loadoutId,
        selected.ownerApproved ? "APPROVED" : "PROPOSED", selected.commandApproved ? "APPROVED" : "PROPOSED",
        selected.expectedUnitVersion, selected.expectedLoadoutRevision));
  }
  for (const assignment of materialized.plan.transportAssignments) {
    const cargo = validateCargoManifest(assignment.profile, assignment.cargo);
    statements.push(env.DB.prepare(`INSERT INTO deployment_transport_assignments (
      deployment_plan_id, carrier_unit_id, cargo_profile_id, ruleset_id,
      manifest_json, used_slots_quarters, capacity_slots_quarters
    ) VALUES (?1,?2,?3,?4,?5,?6,?7)`)
      .bind(command.planId, assignment.carrierUnitId, assignment.profile.id,
        materialized.selected.find((unit) => unit.unitId === assignment.carrierUnitId)!.rulesetId,
        JSON.stringify(assignment.cargo), cargo.slotsUsedQuarters, cargo.capacitySlotsQuarters));
  }
  statements.push(env.DB.prepare(`INSERT INTO deployment_mutation_receipts (
    actor_user_id, command_id, operation, request_hash, response_json
  ) SELECT ?1,?2,'SAVE_DEPLOYMENT_PLAN',?3,?4 FROM deployment_plans
    WHERE id = ?5 AND revision = ?6`).bind(actorId, command.commandId, requestHash, JSON.stringify(response), command.planId, nextRevision));
  try { await env.DB.batch(statements); } catch (error) {
    const raced = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "SAVE_DEPLOYMENT_PLAN", requestHash);
    if (raced) return raced;
    throw error;
  }
  const committed = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "SAVE_DEPLOYMENT_PLAN", requestHash);
  if (!committed) throw new ForceServiceError(409, "DEPLOYMENT_PLAN_VERSION_CONFLICT", "Deployment plan changed while it was saved.");
  return committed;
}

export async function validateStoredPlan(env: Env, actorId: string, planId: string): Promise<unknown> {
  const row = await getDeploymentPlan(env.DB, actorId, planId);
  if (!row) throw new ForceServiceError(404, "DEPLOYMENT_PLAN_NOT_FOUND", "Deployment plan was not found.");
  const units = await listDeploymentPlanUnits(env.DB, row.id);
  const transports = await listDeploymentTransports(env.DB, row.id);
  const command: SaveDeploymentPlanCommand = {
    commandId: "validation-read-only",
    expectedRevision: row.revision,
    planId: row.id,
    campaignId: row.campaign_id,
    battlegroupId: row.battlegroup_id ?? undefined,
    method: row.deployment_method_id as SaveDeploymentPlanCommand["method"],
    insertionZoneId: row.insertion_zone_id ?? undefined,
    route: parseJson(row.route_json, []),
    units: units.map((unit) => ({ unitId: unit.player_unit_id, loadoutId: unit.loadout_id, expectedUnitVersion: unit.expected_unit_version, expectedLoadoutRevision: unit.expected_loadout_revision })),
    transports: transports.map((transport) => ({ carrierUnitId: transport.carrier_unit_id, cargoProfileId: transport.cargo_profile_id, cargo: parseJson(transport.manifest_json, []) })),
  };
  const result = await materialize(env, actorId, command);
  return { planId, revision: row.revision, status: result.validation.valid ? "VALID" : "INVALID", validation: result.validation };
}

export async function commitPlan(
  env: Env,
  actorId: string,
  planId: string,
  command: { commandId: string; expectedRevision: number },
): Promise<unknown> {
  const requestHash = await commandHash({ actorId, operation: "COMMIT_DEPLOYMENT_PLAN", planId, ...command });
  const prior = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "COMMIT_DEPLOYMENT_PLAN", requestHash);
  if (prior) return prior;
  const row = await getDeploymentPlan(env.DB, actorId, planId);
  if (!row) throw new ForceServiceError(404, "DEPLOYMENT_PLAN_NOT_FOUND", "Deployment plan was not found.");
  if (row.revision !== command.expectedRevision || row.status !== "VALID") {
    throw new ForceServiceError(409, "DEPLOYMENT_PLAN_NOT_COMMITTABLE", "Only the current valid plan revision may be committed.");
  }
  const authority = await getDeploymentAuthority(env.DB, actorId, row.campaign_id);
  if (!authority || !canCommand(authority.command_role, authority.campaign_role)) {
    throw new ForceServiceError(403, "DEPLOYMENT_COMMAND_APPROVAL_REQUIRED", "Battalion Command must commit deployment plans.");
  }
  const formation = row.battlegroup_id
    ? await getDeploymentFormation(env.DB, row.battalion_id, row.battlegroup_id)
    : null;
  if (authority.operation_id && (!formation || !row.battlegroup_id)) {
    throw new ForceServiceError(409, "BATTLEGROUP_REQUIRED", "The linked strategic operation requires a current Battlegroup reservation.");
  }
  const allowedFormationStatuses = authority.operation_id
    ? ["DEPLOYING"]
    : ["READY", "EMBARKED", "RECOVERING"];
  if (formation && !allowedFormationStatuses.includes(formation.status)) {
    throw new ForceServiceError(409, "BATTLEGROUP_UNAVAILABLE", `Battlegroup ${formation.id} is no longer available for deployment.`);
  }
  if (formation) {
    await requireStrategicDeploymentOrder(env.DB, authority.operation_id, formation, row.deployment_method_id);
  }
  await requireFormationAtOperation(env.DB, formation, authority.operation_node_id);
  const units = await listDeploymentPlanUnits(env.DB, planId);
  if (units.some((unit) => unit.owner_approval !== "APPROVED" || unit.command_approval !== "APPROVED")) {
    throw new ForceServiceError(409, "DEPLOYMENT_APPROVAL_REQUIRED", "Every unit requires owner and command approval.");
  }
  const transports = await listDeploymentTransports(env.DB, planId);
  const carrierByUnit = new Map<string, string>();
  for (const transport of transports) {
    for (const cargo of parseJson<CargoManifestItem[]>(transport.manifest_json, [])) {
      if (cargo.unitId) carrierByUnit.set(cargo.unitId, transport.carrier_unit_id);
    }
  }
  const zone = (await listInsertionZones(env.DB, row.campaign_id)).find((candidate) => candidate.id === row.insertion_zone_id);
  if (!zone) throw new ForceServiceError(422, "INSERTION_ZONE_INVALID", "A current open insertion zone is required.");
  const lockedAt = Math.floor(Date.now() / 1000);
  const statements: D1PreparedStatement[] = [];
  const snapshotIds: string[] = [];
  for (const selected of units) {
    const built = await buildStoredEffectiveUnit(env, selected.owner_id, selected.player_unit_id);
    if (!built.result.valid || !built.result.unit || built.context.unit_version !== selected.expected_unit_version || built.context.loadout_revision !== selected.expected_loadout_revision) {
      throw new ForceServiceError(409, "DEPLOYMENT_UNIT_VERSION_CONFLICT", `Unit ${selected.player_unit_id} changed after validation.`);
    }
    const snapshotId = `${row.campaign_id}:${selected.player_unit_id}:loadout`;
    const snapshot = createCampaignLoadoutSnapshot({
      id: snapshotId,
      campaignId: row.campaign_id,
      planId,
      unit: built.result.unit,
      method: row.deployment_method_id as SaveDeploymentPlanCommand["method"],
      carrierUnitId: carrierByUnit.get(selected.player_unit_id),
      lockedAt,
    });
    const governedEffectiveUnit = {
      ...snapshot.effectiveUnit,
      currentHealth: built.context.current_health,
      rulesAuthority: built.rulesAuthority,
      equipmentRulesAuthorities: built.equipmentRulesAuthorities,
    };
    const governedSnapshotHash = await commandHash({
      schemaVersion: 1,
      id: snapshot.id,
      campaignId: snapshot.campaignId,
      deploymentPlanId: snapshot.deploymentPlanId,
      playerUnitId: snapshot.playerUnitId,
      rulesetVersion: snapshot.rulesetVersion,
      unitDefinitionVersion: snapshot.unitDefinitionVersion,
      effectiveUnit: governedEffectiveUnit,
      insertionMethod: snapshot.insertionMethod,
      carrierUnitId: snapshot.carrierUnitId,
      lockedAt: snapshot.lockedAt,
    });
    snapshotIds.push(snapshotId);
    statements.push(
      env.DB.prepare(`UPDATE player_unit_loadouts SET locked_at = ?1, revision = revision + 1,
        updated_at = unixepoch() WHERE id = ?2 AND player_unit_id = ?3 AND revision = ?4 AND locked_at IS NULL`)
        .bind(lockedAt, selected.loadout_id, selected.player_unit_id, selected.expected_loadout_revision),
      env.DB.prepare(`UPDATE player_units SET status = 'DEPLOYED', location_state = ?1,
        location_kind = 'CAMPAIGN', location_id = ?2, version = version + 1, updated_at = unixepoch()
        WHERE id = ?3 AND owner_id = ?4 AND version = ?5 AND status IN ('ACTIVE','DAMAGED')`)
        .bind(carrierByUnit.has(selected.player_unit_id) ? "EMBARKED" : "ON_MAP", row.campaign_id,
          selected.player_unit_id, selected.owner_id, selected.expected_unit_version),
      env.DB.prepare(`INSERT INTO campaign_loadout_snapshots (
        id,campaign_id,deployment_plan_id,player_unit_id,ruleset_id,unit_definition_id,
        unit_definition_version,refits_json,equipment_json,effective_unit_json,
        slot_configuration_json,ammunition_json,cooldowns_json,supplies_json,
        insertion_method_id,carrier_unit_id,snapshot_hash,locked_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,'[]',?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`)
        .bind(snapshotId, row.campaign_id, planId, selected.player_unit_id, built.context.ruleset_id,
          built.context.definition_id, snapshot.unitDefinitionVersion,
          JSON.stringify(snapshot.effectiveUnit.equipmentInstanceIds), JSON.stringify(governedEffectiveUnit),
          JSON.stringify(snapshot.effectiveUnit.equipmentInstanceIds), JSON.stringify(snapshot.effectiveUnit.ammunition),
          JSON.stringify(snapshot.effectiveUnit.cooldowns), JSON.stringify(built.supplies), row.deployment_method_id,
          snapshot.carrierUnitId ?? null, governedSnapshotHash, lockedAt),
      env.DB.prepare(`INSERT INTO deployments (
        id,campaign_id,player_unit_id,owner_id,side,status,snapshot_json
      ) VALUES (?1,?2,?3,?4,'ALLIED','READY',?5)`)
        .bind(`deployment:${row.campaign_id}:${selected.player_unit_id}`, row.campaign_id,
          selected.player_unit_id, selected.owner_id,
          JSON.stringify({ ...governedEffectiveUnit, supplies: built.supplies, position: { q: zone.hex_q, r: zone.hex_r }, insertionMethod: row.deployment_method_id, carrierUnitId: snapshot.carrierUnitId })),
    );
    for (const weapon of snapshot.effectiveUnit.weapons) {
      statements.push(env.DB.prepare(`INSERT INTO campaign_weapon_states (
        snapshot_id,weapon_id,ammo_capacity,ammo_remaining,ready_at_round
      ) VALUES (?1,?2,?3,?4,NULL)`)
        .bind(snapshotId, weapon.id, weapon.ammoCapacity ?? null,
          weapon.ammoCapacity === undefined ? null : snapshot.effectiveUnit.ammunition[weapon.id] ?? weapon.ammoCapacity));
    }
    for (const ability of snapshot.effectiveUnit.abilities) {
      statements.push(env.DB.prepare(`INSERT INTO campaign_ability_states (
        snapshot_id,ability_id,ready_at_round,state_json
      ) VALUES (?1,?2,1,'{}')`).bind(snapshotId, ability.abilityId));
    }
  }
  if (formation && authority.operation_id && authority.operation_node_id) {
    statements.push(
      env.DB.prepare(`UPDATE task_force_battlegroups SET status='CANCELLED',revision=revision+1,updated_at=unixepoch()
        WHERE battlegroup_id=?1 AND status='EMBARKING'`).bind(formation.id),
      env.DB.prepare(`UPDATE task_force_battlegroups SET status='DISEMBARKED',
        disembarked_at=COALESCE(disembarked_at,unixepoch()),revision=revision+1,updated_at=unixepoch()
        WHERE battlegroup_id=?1 AND status IN ('EMBARKED','DISEMBARKING') AND embarked_at IS NOT NULL`)
        .bind(formation.id),
      env.DB.prepare(`UPDATE battlegroups SET status='DEPLOYED',current_node_id=?1,
        current_operation_id=?2,current_carrier_task_force_id=NULL,revision=revision+1,updated_at=unixepoch()
        WHERE id=?3 AND battalion_id=?4 AND revision=?5 AND status='DEPLOYING'`)
        .bind(authority.operation_node_id, authority.operation_id, formation.id, row.battalion_id, formation.revision),
      env.DB.prepare(`UPDATE strategic_operations SET status='ACTIVE',starts_at=COALESCE(starts_at,unixepoch()),
        revision=revision+1,updated_at=unixepoch() WHERE id=?1 AND status='MUSTERING'`)
        .bind(authority.operation_id),
      env.DB.prepare(`UPDATE campaigns SET status='ACTIVE',strategic_status='ACTIVE',
        strategic_revision=strategic_revision+1 WHERE id=?1 AND status IN ('DRAFT','RECRUITING','ACTIVE')`)
        .bind(row.campaign_id),
    );
  }
  const response = {
    planId,
    revision: row.revision + 1,
    status: "COMMITTED",
    campaignId: row.campaign_id,
    battlegroupId: row.battlegroup_id,
    operationId: authority.operation_id,
    snapshotIds,
  };
  statements.push(
    env.DB.prepare(`UPDATE deployment_plans SET status = 'COMMITTED', committed_at = ?1,
      revision = revision + 1, updated_at = unixepoch() WHERE id = ?2 AND revision = ?3 AND status = 'VALID'`)
      .bind(lockedAt, planId, command.expectedRevision),
    env.DB.prepare(`INSERT INTO deployment_mutation_receipts (
      actor_user_id,command_id,operation,request_hash,response_json
    ) SELECT ?1,?2,'COMMIT_DEPLOYMENT_PLAN',?3,?4 FROM deployment_plans
      WHERE id = ?5 AND revision = ?6 AND status = 'COMMITTED'`)
      .bind(actorId, command.commandId, requestHash, JSON.stringify(response), planId, row.revision + 1),
  );
  try { await env.DB.batch(statements); } catch (error) {
    const raced = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "COMMIT_DEPLOYMENT_PLAN", requestHash);
    if (raced) return raced;
    throw error;
  }
  const committed = receiptReplay(await getDeploymentReceipt(env.DB, actorId, command.commandId), "COMMIT_DEPLOYMENT_PLAN", requestHash);
  if (!committed) throw new ForceServiceError(409, "DEPLOYMENT_PLAN_VERSION_CONFLICT", "Deployment plan changed while it was committed.");
  return committed;
}

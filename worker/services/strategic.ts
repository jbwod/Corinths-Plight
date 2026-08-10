import type {
  BattalionDto,
  BattalionMemberDto,
  BattalionPermission,
  BattalionProjectionDto,
  BattalionRankDto,
  BattalionSummaryDto,
  BattlegroupStatus,
  BattlegroupSummaryDto,
  CommandProjectionDto,
  ImplementationStatus,
  OperationSummaryDto,
  PlayerProfileDto,
  ShipCargoDto,
  ShipModuleDto,
  ShipModuleSlotType,
  ShipProjectionDto,
  ShipStatus,
  ShipSummaryDto,
  StrategicCapability,
  StrategicCapabilitySource,
  StrategicCapabilitySummary,
  StrategicClockDto,
  StrategicMapProjectionDto,
  StrategicMovementProfile,
  StrategicNodeDto,
  StrategicOrderIntent,
  StrategicRouteDto,
  StrategicRoundDto,
  StrategicSupplyBalance,
  StrategicSupplyState,
  SupplySize,
  TaskForceStatus,
  TaskForceSummaryDto,
} from "../../packages/domain/src";
import { aggregateStrategicCapabilities, findStrategicRoute } from "../../packages/rules-engine/src";
import { commandHash } from "../forces-validation";
import type { Env } from "../env";
import {
  getCommandContext,
  getFormationAuthority,
  getOperation,
  getPrimaryShip,
  getStrategicMap,
  getStrategicOrderByCommand,
  getStrategicRound,
  listActivePermissions,
  listBattalionActivity,
  listBattalionMembers,
  listBattalionRanks,
  listBattlegroups,
  listBattlegroupUnits,
  listOperations,
  listRankPermissions,
  listShipCapabilities,
  listShipCargo,
  listShipModules,
  listShipUnitCargo,
  listStrategicNodes,
  listStrategicRoutes,
  listSupplyBalances,
  listTaskForceBattlegroups,
  listTaskForces,
  listTaskForceShips,
  type BattlegroupRow,
  type BattlegroupUnitRow,
  type CommandContextRow,
  type OperationRow,
  type ShipCapabilityRow,
  type ShipModuleRow,
  type ShipRow,
  type StrategicMapRow,
  type StrategicNodeRow,
  type StrategicOrderRow,
  type StrategicRouteRow,
  type StrategicRoundRow,
  type SupplyBalanceRow,
  type TaskForceRow,
} from "../repositories/strategic";
import { authorizeStrategicIntent, mayResolveStrategicRound } from "../strategic-policy";
import type { SubmitStrategicOrderCommand } from "../strategic-validation";

export class StrategicServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface ActiveStrategicContext {
  row: CommandContextRow;
  userId: string;
  battalionId: string;
  permissions: Set<BattalionPermission>;
}

const capabilityValues = new Set<StrategicCapability>([
  "GROUND_COMBAT",
  "ARMOURED",
  "RECON",
  "ENGINEERING",
  "LOGISTICS",
  "ANTI_AIR",
  "ARTILLERY",
  "AIR_MOBILE",
  "ORBITAL_DROP",
  "CARRY_INFANTRY",
  "CARRY_LIGHT_VEHICLE",
  "CARRY_HEAVY_VEHICLE",
  "CARRY_MECH",
  "CARRY_VTOL",
  "CARRY_AEROSPACE",
  "LAND_VTOL",
  "LAND_AEROSPACE",
  "REPAIR_INFANTRY",
  "REPAIR_VEHICLE",
  "REPAIR_MECH",
  "REPAIR_AEROSPACE",
  "REARM_INFANTRY",
  "REARM_AEROSPACE",
  "CHANGE_INFANTRY_LOADOUT",
  "REFIT_MECH",
  "GENERATE_SMALL_SUPPLY",
  "GENERATE_MEDIUM_SUPPLY",
  "SURFACE_LANDING",
]);

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function milliseconds(seconds: number | null | undefined): number | null {
  return seconds === null || seconds === undefined ? null : seconds * 1_000;
}

function accountStatus(value: string): PlayerProfileDto["accountStatus"] {
  return value === "SUSPENDED" ? "SUSPENDED" : value === "DELETED" ? "DEACTIVATED" : "ACTIVE";
}

function profile(row: CommandContextRow): PlayerProfileDto {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? row.username,
    callsign: row.profile_callsign ?? row.username.toUpperCase().slice(0, 12),
    avatarUrl: row.image_key,
    bio: row.biography,
    timezone: row.timezone,
    preferredBattalionId: row.battalion_id,
    createdAt: milliseconds(row.user_created_at)!,
    lastActiveAt: milliseconds(row.last_active_at ?? row.user_created_at)!,
    accountStatus: accountStatus(row.user_status),
  };
}

function battalionSummary(row: CommandContextRow): BattalionSummaryDto | null {
  if (!row.battalion_id || !row.battalion_name || !row.battalion_status || row.battalion_revision === null) return null;
  return {
    id: row.battalion_id,
    name: row.battalion_name,
    shortName: row.short_name ?? row.battalion_name.slice(0, 8).toUpperCase(),
    insigniaUrl: row.insignia_key,
    motto: row.motto,
    status: row.battalion_status as BattalionSummaryDto["status"],
    memberCount: row.member_count,
    primaryShipId: row.primary_ship_id,
    version: row.battalion_revision,
  };
}

function battalionDetail(row: CommandContextRow): BattalionDto {
  const summary = battalionSummary(row);
  if (!summary || !row.battalion_created_by || row.battalion_created_at === null) {
    throw new StrategicServiceError(404, "BATTALION_NOT_FOUND", "No active Battalion is selected.");
  }
  return {
    ...summary,
    description: row.battalion_description ?? "",
    createdAt: milliseconds(row.battalion_created_at)!,
    createdBy: row.battalion_created_by,
  };
}

function permission(value: string): value is BattalionPermission {
  return [
    "BATTALION_EDIT",
    "MEMBER_INVITE",
    "MEMBER_REMOVE",
    "RANK_MANAGE",
    "BATTLEGROUP_CREATE",
    "BATTLEGROUP_EDIT",
    "BATTLEGROUP_ASSIGN",
    "OPERATION_CREATE",
    "OPERATION_COMMAND",
    "SHIP_VIEW",
    "SHIP_CONFIGURE",
    "SHIP_UPGRADE",
    "SHIP_MOVE",
    "SUPPLY_VIEW",
    "SUPPLY_MANAGE",
    "UNIT_DEPLOY_SELF",
    "UNIT_DEPLOY_OTHERS",
    "STRATEGIC_ORDER_CREATE",
    "STRATEGIC_ORDER_APPROVE",
  ].includes(value);
}

async function activeContext(env: Env, userId: string): Promise<ActiveStrategicContext> {
  const row = await getCommandContext(env.DB, userId);
  if (!row) throw new StrategicServiceError(404, "PROFILE_NOT_FOUND", "The active player profile was not found.");
  if (!row.battalion_id) {
    throw new StrategicServiceError(409, "ACTIVE_BATTALION_REQUIRED", "Select an active Battalion first.");
  }
  const rows = await listActivePermissions(env.DB, userId, row.battalion_id);
  return {
    row,
    userId,
    battalionId: row.battalion_id,
    permissions: new Set(rows.map((item) => item.permission).filter(permission)),
  };
}

function capabilityFromStorage(value: string): StrategicCapability | undefined {
  const normalized = value.replace(/^capability-/, "").replaceAll("-", "_").toUpperCase();
  return capabilityValues.has(normalized as StrategicCapability) ? (normalized as StrategicCapability) : undefined;
}

const tagCapabilities: Record<string, StrategicCapability[]> = {
  INFANTRY: ["GROUND_COMBAT"],
  ARMOURED: ["ARMOURED"],
  ENGINEER: ["ENGINEERING"],
  LOGISTICS: ["LOGISTICS"],
  ARTILLERY: ["ARTILLERY"],
  INDIRECT_FIRE: ["ARTILLERY"],
  VTOL: ["AIR_MOBILE"],
  INFANTRY_STEALTH: ["RECON"],
  VEHICLE_STEALTH: ["RECON"],
};

function semanticTag(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unitCapabilitySources(units: readonly BattlegroupUnitRow[]): StrategicCapabilitySource[] {
  return units.map((unit) => {
    const tags = parseJson<string[]>(unit.tags_json, []).map(semanticTag);
    const grants = [...new Set(tags.flatMap((tag) => tagCapabilities[tag] ?? []))].map((capability) => ({
      capability,
      value: 1,
    }));
    return { sourceId: unit.unit_id, sourceKind: "UNIT", grants };
  });
}

function battlegroupSummaries(
  groups: readonly BattlegroupRow[],
  units: readonly BattlegroupUnitRow[],
): BattlegroupSummaryDto[] {
  return groups.map((group) => {
    const members = units.filter((unit) => unit.battlegroup_id === group.id);
    const capabilities = aggregateStrategicCapabilities(unitCapabilitySources(members)).capabilities;
    return {
      id: group.id,
      battalionId: group.battalion_id,
      name: group.name,
      callsign: group.callsign ?? group.name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 12),
      commanderMembershipId: group.leader_user_id
        ? `${group.battalion_id}:${group.leader_user_id}`
        : null,
      unitCount: group.unit_count,
      currentNodeId: group.current_node_id,
      currentOperationId: group.current_operation_id,
      currentCarrierTaskForceId: group.current_carrier_task_force_id,
      status: group.status as BattlegroupStatus,
      capabilities,
      version: group.revision,
    };
  });
}

function shipCapabilitySummaries(rows: readonly ShipCapabilityRow[]): StrategicCapabilitySummary[] {
  return rows.flatMap((row) => {
    const capability = capabilityFromStorage(row.capability_id);
    return capability
      ? [{ capability, value: row.capacity, sourceIds: [row.ship_id] }]
      : [];
  });
}

function supplyBalances(rows: readonly SupplyBalanceRow[]): StrategicSupplyBalance[] {
  return rows
    .filter((row) => row.supply_size === "LARGE" || row.supply_size === "MEDIUM" || row.supply_size === "SMALL")
    .map((row) => ({
      size: row.supply_size as SupplySize,
      quantity: row.quantity,
      capacity: row.capacity,
    }));
}

function shipSummary(
  row: ShipRow,
  supply: readonly SupplyBalanceRow[],
  currentNodeId: string | null,
): ShipSummaryDto {
  const large = supply.find((item) => item.ship_id === row.id && item.supply_size === "LARGE");
  return {
    id: row.id,
    battalionId: row.battalion_id,
    name: row.name,
    classDefinitionId: row.class_definition_id,
    className: row.class_name,
    registry: row.registry ?? row.name.toUpperCase().replaceAll(/[^A-Z0-9-]/g, "-").slice(0, 24),
    currentNodeId,
    status: row.status as ShipStatus,
    damage: {
      currentHits: row.current_health,
      maximumHits: row.maximum_health,
      armour: row.armor,
      damagedSubsystemIds: [],
    },
    largeSupply: large?.quantity ?? 0,
    largeSupplyCapacity: large?.capacity ?? 0,
    version: row.revision,
  };
}

function moduleStatus(value: string): ShipModuleDto["status"] {
  return value === "INSTALLED" ? "OPERATIONAL" : value === "DAMAGED" ? "DAMAGED" : "DISABLED";
}

function shipModules(rows: readonly ShipModuleRow[]): ShipModuleDto[] {
  const grouped = new Map<string, ShipModuleDto>();
  for (const row of rows) {
    const id = `${row.ship_id}:${row.slot_type}:${row.slot_index}`;
    const existing = grouped.get(id) ?? {
      id,
      shipId: row.ship_id,
      definitionId: row.definition_id,
      name: row.name,
      slotType: row.slot_type as ShipModuleSlotType,
      slotIndex: row.slot_index,
      status: moduleStatus(row.installation_status),
      capabilities: [],
      implementationStatus: (row.implementation_status ?? "CATALOGUE_ONLY") as ImplementationStatus,
    };
    const capability = row.capability_id ? capabilityFromStorage(row.capability_id) : undefined;
    if (capability && row.capacity_delta !== null) {
      existing.capabilities.push({ capability, value: row.capacity_delta });
    }
    grouped.set(id, existing);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      (left.slotType < right.slotType ? -1 : left.slotType > right.slotType ? 1 : 0) ||
      left.slotIndex - right.slotIndex,
  );
}

function aggregateSupplyForTaskForce(
  taskForce: TaskForceRow,
  shipIds: readonly string[],
  balances: readonly SupplyBalanceRow[],
  facilities: readonly StrategicCapabilitySummary[],
): StrategicSupplyState {
  const relevant = balances.filter(
    (row) =>
      row.status === "ACTIVE" &&
      (row.task_force_id === taskForce.id || (row.ship_id !== null && shipIds.includes(row.ship_id))),
  );
  const aggregated = (["LARGE", "MEDIUM", "SMALL"] as const).flatMap((size) => {
    const rows = relevant.filter((row) => row.supply_size === size);
    if (rows.length === 0) return [];
    return [{
      size,
      quantity: rows.reduce((total, row) => total + row.quantity, 0),
      capacity: rows.some((row) => row.capacity === null)
        ? null
        : rows.reduce((total, row) => total + (row.capacity ?? 0), 0),
    }];
  });
  return {
    location: { kind: "TASK_FORCE", id: taskForce.id },
    balances: aggregated,
    suppliedThroughRound: relevant.length > 0 ? taskForce.supplied_until_round : null,
    facilities: facilities.filter((item) => item.value > 0).map((item) => item.capability),
  };
}

function transitFromState(row: TaskForceRow): TaskForceSummaryDto["transit"] {
  const state = parseJson<{ transit?: TaskForceSummaryDto["transit"] }>(row.state_json, {});
  return state.transit ?? null;
}

async function taskForceSummaries(
  env: Env,
  context: ActiveStrategicContext,
  mapId?: string,
): Promise<TaskForceSummaryDto[]> {
  const [forces, shipLinks, battlegroupLinks, balances] = await Promise.all([
    listTaskForces(env.DB, context.userId, context.battalionId, mapId),
    listTaskForceShips(env.DB, context.userId, context.battalionId),
    listTaskForceBattlegroups(env.DB, context.userId, context.battalionId),
    listSupplyBalances(env.DB, context.userId, context.battalionId),
  ]);
  const shipIds = [...new Set(shipLinks.map((link) => link.member_id))];
  const capabilitiesByShip = new Map<string, StrategicCapabilitySummary[]>();
  await Promise.all(
    shipIds.map(async (shipId) => {
      capabilitiesByShip.set(
        shipId,
        shipCapabilitySummaries(
          await listShipCapabilities(env.DB, context.userId, context.battalionId, shipId),
        ),
      );
    }),
  );
  return forces.map((force) => {
    const forceShipIds = shipLinks.filter((link) => link.task_force_id === force.id).map((link) => link.member_id);
    const capabilities = aggregateStrategicCapabilities(
      forceShipIds.flatMap((shipId) => {
        const shipCapabilities = capabilitiesByShip.get(shipId) ?? [];
        return shipCapabilities.map((entry): StrategicCapabilitySource => ({
          sourceId: `${shipId}:${entry.capability}`,
          sourceKind: "SHIP_MODULE",
          grants: [{ capability: entry.capability, value: entry.value }],
        }));
      }),
    ).capabilities;
    return {
      id: force.id,
      battalionId: force.battalion_id,
      name: force.name,
      commanderMembershipId: force.commander_user_id
        ? `${force.battalion_id}:${force.commander_user_id}`
        : null,
      shipIds: forceShipIds,
      embarkedBattlegroupIds: battlegroupLinks
        .filter((link) => link.task_force_id === force.id)
        .map((link) => link.member_id),
      currentNodeId: force.current_node_id,
      transit: transitFromState(force),
      status: force.status as TaskForceStatus,
      supply: aggregateSupplyForTaskForce(force, forceShipIds, balances, capabilities),
      capabilities,
      version: force.revision,
    };
  });
}

function nodeVisible(row: StrategicNodeRow, battalionId: string): boolean {
  const visibility = parseJson<{ public?: boolean; battalionIds?: string[] }>(row.visibility_json, {});
  return visibility.public !== false || visibility.battalionIds?.includes(battalionId) === true;
}

function projectNode(row: StrategicNodeRow): StrategicNodeDto {
  return {
    id: row.id,
    mapId: row.map_id,
    locationId: row.location_id,
    type: row.node_type as StrategicNodeDto["type"],
    name: row.name,
    control: row.control_status as StrategicNodeDto["control"],
    status: row.status as StrategicNodeDto["status"],
    position: parseJson<{ x: number; y: number } | null>(row.position_json, null),
  };
}

function projectRoute(row: StrategicRouteRow): StrategicRouteDto {
  return {
    id: row.id,
    mapId: row.map_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    direction: row.bidirectional === 1 ? "BIDIRECTIONAL" : "ONE_WAY",
    baseTravelRounds: row.base_travel_rounds,
    travelCostStatus: row.travel_cost_status as StrategicRouteDto["travelCostStatus"],
    allowedMovementProfiles: parseJson<StrategicMovementProfile[]>(row.allowed_profiles_json, []),
    status: row.status as StrategicRouteDto["status"],
  };
}

function reinforcementPolicy(value: string): {
  status: OperationSummaryDto["reinforcementStatus"];
  closesAfter?: number | null;
} {
  const policy = parseJson<{ status?: string; closesAfterTacticalRound?: number }>(value, {});
  if (policy.status === "OPEN") return { status: "OPEN" };
  if (Number.isInteger(policy.closesAfterTacticalRound)) {
    return { status: "CLOSES_AFTER_TACTICAL_ROUND", closesAfter: policy.closesAfterTacticalRound };
  }
  return { status: "CLOSED" };
}

function operationSummary(row: OperationRow): OperationSummaryDto {
  const objectives = parseJson<Array<string | { label?: string; summary?: string; key?: string }>>(row.objectives_json, []);
  const policy = reinforcementPolicy(row.reinforcement_policy_json);
  return {
    id: row.id,
    mapId: row.map_id,
    campaignId: row.campaign_id,
    strategicNodeId: row.node_id,
    name: row.name,
    role: row.role_summary,
    status: row.status as OperationSummaryDto["status"],
    threat: row.threat_level,
    objectiveSummaries: objectives.map((item) =>
      typeof item === "string" ? item : item.label ?? item.summary ?? item.key ?? "Classified objective",
    ),
    recommendedCapabilities: parseJson<string[]>(row.recommended_capabilities_json, []).filter(
      (item): item is StrategicCapability => capabilityValues.has(item as StrategicCapability),
    ),
    deployedBattlegroupIds: parseJson<string[]>(row.deployed_battlegroup_ids_json, []),
    reinforcementStatus: policy.status,
    reinforcementClosesAfterRound: policy.closesAfter,
    version: row.revision,
  };
}

function phase(row: StrategicRoundRow, map: StrategicMapRow): StrategicRoundDto["phase"] {
  if (map.paused === 1 || row.status === "PAUSED") return "PAUSED";
  if (row.status === "OPEN") return "PLANNING";
  if (row.status === "LOCKED") return "LOCKED";
  if (row.status === "RESOLVING") return "RESOLVING";
  if (row.status === "FAILED") return "FAILED";
  return "COMPLETE";
}

function clock(map: StrategicMapRow, round: StrategicRoundRow): StrategicClockDto {
  return {
    mode: map.clock_mode === "MANUAL" ? "MANUAL" : "SCHEDULED",
    durationMs: map.tick_interval_seconds === null ? null : map.tick_interval_seconds * 1_000,
    roundStartedAt: milliseconds(round.opens_at)!,
    locksAt: milliseconds(round.lock_at),
    resolvesAt: milliseconds(round.resolves_at),
    // The schema records whether the map is paused, but not when it paused.
    // Do not fabricate an operator-facing timestamp from the read time.
    pausedAt: null,
  };
}

export async function getCommandProjection(env: Env, userId: string): Promise<CommandProjectionDto> {
  const row = await getCommandContext(env.DB, userId);
  if (!row) throw new StrategicServiceError(404, "PROFILE_NOT_FOUND", "The active player profile was not found.");
  const summary = battalionSummary(row);
  if (!summary || !row.battalion_id) {
    return { profile: profile(row), battalion: null, primaryShip: null, strategic: null, operations: [] };
  }
  const context = await activeContext(env, userId);
  const [supply, ship, forces, forceRows, groups, operations] = await Promise.all([
    listSupplyBalances(env.DB, userId, context.battalionId),
    getPrimaryShip(env.DB, userId, context.battalionId),
    taskForceSummaries(env, context),
    listTaskForces(env.DB, userId, context.battalionId),
    listBattlegroups(env.DB, userId, context.battalionId),
    listOperations(env.DB, userId, context.battalionId),
  ]);
  const currentForce = forces[0];
  let strategic: CommandProjectionDto["strategic"] = null;
  if (currentForce) {
    const currentForceRow = forceRows.find((force) => force.id === currentForce.id);
    const map = currentForceRow
      ? await getStrategicMap(env.DB, userId, context.battalionId, currentForceRow.map_id)
      : null;
    if (map) {
      const [nodes, currentRound] = await Promise.all([
        listStrategicNodes(env.DB, map.id),
        getStrategicRound(env.DB, map.id, map.current_round),
      ]);
      strategic = {
        mapId: map.id,
        mapName: map.name,
        currentNodeId: currentForce.currentNodeId,
        currentNodeName: nodes.find((node) => node.id === currentForce.currentNodeId)?.name ?? null,
        round: map.current_round,
        nextStrategicTick: milliseconds(currentRound?.resolves_at),
        activeOperationCount: operations.filter((operation) =>
          ["ANNOUNCED", "MUSTERING", "ACTIVE"].includes(operation.status),
        ).length,
        deployedBattlegroupCount: groups.filter((group) => group.current_operation_id !== null).length,
      };
    }
  }
  return {
    profile: profile(row),
    battalion: summary,
    primaryShip:
      ship && context.permissions.has("SHIP_VIEW")
        ? shipSummary(
            ship,
            supply,
            forces.find((force) => force.shipIds.includes(ship.id))?.currentNodeId ?? null,
          )
        : null,
    strategic,
    operations: operations.map(operationSummary),
  };
}

export async function getBattalionProjection(env: Env, userId: string): Promise<BattalionProjectionDto> {
  const context = await activeContext(env, userId);
  const [ranks, permissions, groups, units] = await Promise.all([
    listBattalionRanks(env.DB, userId, context.battalionId),
    listRankPermissions(env.DB, userId, context.battalionId),
    listBattlegroups(env.DB, userId, context.battalionId),
    listBattlegroupUnits(env.DB, userId, context.battalionId),
  ]);
  const rankDtos: BattalionRankDto[] = ranks.map((rank) => ({
    id: rank.id,
    battalionId: rank.battalion_id,
    name: rank.name,
    sortOrder: rank.precedence,
    permissions: permissions
      .filter((item) => item.rank_id === rank.id)
      .map((item) => item.permission)
      .filter(permission),
    version: rank.revision,
  }));
  return {
    battalion: battalionDetail(context.row),
    ranks: rankDtos,
    permissions: [...context.permissions].sort(),
    battlegroups: battlegroupSummaries(groups, units),
  };
}

export async function getBattalionMembersProjection(
  env: Env,
  userId: string,
): Promise<{ members: BattalionMemberDto[] }> {
  const context = await activeContext(env, userId);
  const rows = await listBattalionMembers(env.DB, userId, context.battalionId);
  return {
    members: rows.map((row) => ({
      membershipId: `${row.battalion_id}:${row.user_id}`,
      battalionId: row.battalion_id,
      userId: row.user_id,
      displayName: row.display_name,
      callsign: row.callsign ?? row.display_name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 12),
      rankId: row.rank_id,
      status: row.status as BattalionMemberDto["status"],
      joinedAt: milliseconds(row.joined_at),
      leftAt: milliseconds(row.left_at),
    })),
  };
}

export async function getBattalionActivityProjection(
  env: Env,
  userId: string,
  before: number | null,
  limit: number,
): Promise<unknown> {
  const context = await activeContext(env, userId);
  const rows = await listBattalionActivity(
    env.DB,
    userId,
    context.battalionId,
    before === null ? null : Math.floor(before / 1_000),
    limit + 1,
  );
  const page = rows.slice(0, limit);
  return {
    events: page.map((row) => ({
      id: row.event_id,
      mapId: row.map_id,
      round: row.round_number,
      type: row.event_type,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      summary: row.summary,
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
      occurredAt: milliseconds(row.occurred_at),
    })),
    nextCursor: rows.length > limit ? milliseconds(page.at(-1)?.occurred_at ?? null) : null,
  };
}

export async function getShipProjection(env: Env, userId: string): Promise<ShipProjectionDto> {
  const context = await activeContext(env, userId);
  if (!context.permissions.has("SHIP_VIEW")) {
    throw new StrategicServiceError(403, "BATTALION_PERMISSION_REQUIRED", "SHIP_VIEW permission is required.");
  }
  const ship = await getPrimaryShip(env.DB, userId, context.battalionId);
  if (!ship) throw new StrategicServiceError(404, "PRIMARY_SHIP_NOT_FOUND", "The Battalion has no accessible primary ship.");
  const [moduleRows, capabilityRows, cargoRows, unitRows, balances, taskForces] = await Promise.all([
    listShipModules(env.DB, userId, context.battalionId, ship.id),
    listShipCapabilities(env.DB, userId, context.battalionId, ship.id),
    listShipCargo(env.DB, userId, context.battalionId, ship.id),
    listShipUnitCargo(env.DB, userId, context.battalionId, ship.id),
    listSupplyBalances(env.DB, userId, context.battalionId),
    taskForceSummaries(env, context),
  ]);
  const capabilities = shipCapabilitySummaries(capabilityRows);
  const shipSupplyRows = balances.filter((row) => row.ship_id === ship.id && row.status === "ACTIVE");
  const cargo: ShipCargoDto[] = [
    ...unitRows.map((row) => ({
      id: `ship-unit:${row.unit_id}`,
      shipId: ship.id,
      kind: "UNIT" as const,
      unitId: row.unit_id,
      definitionId: row.definition_id,
      quantity: 1,
      capacityUsed: 1,
    })),
    ...cargoRows.map((row) => {
      const normalized = row.resource_type.toUpperCase();
      const size = (["LARGE", "MEDIUM", "SMALL"] as const).find((candidate) => normalized.includes(candidate));
      return {
        id: row.id,
        shipId: ship.id,
        kind: size ? ("SUPPLY" as const) : ("EQUIPMENT" as const),
        definitionId: size ? null : row.resource_type,
        supplySize: size ?? null,
        quantity: row.quantity,
        capacityUsed: row.quantity,
      };
    }),
  ];
  return {
    ship: {
      ...shipSummary(
        ship,
        balances,
        taskForces.find((force) => force.shipIds.includes(ship.id))?.currentNodeId ?? null,
      ),
      primary: true,
      internalSlots: ship.internal_slots,
      externalSlots: ship.external_slots,
      // The ship class supplies a capacity, but Phase 3 has no mutable current
      // atmospheric-fuel store yet. Preserve that distinction in the DTO.
      atmoFuel: null,
      atmoFuelCapacity: ship.atmo_fuel,
    },
    modules: shipModules(moduleRows),
    capabilities,
    cargo,
    supply: {
      location: { kind: "SHIP", id: ship.id },
      balances: supplyBalances(shipSupplyRows),
      suppliedThroughRound: shipSupplyRows.length > 0
        ? taskForces.find((force) => force.shipIds.includes(ship.id))?.supply.suppliedThroughRound ?? null
        : null,
      facilities: capabilities.map((item) => item.capability),
    },
    taskForce: taskForces.find((force) => force.shipIds.includes(ship.id)) ?? null,
  };
}

export async function getOperationsProjection(
  env: Env,
  userId: string,
): Promise<{ operations: OperationSummaryDto[] }> {
  const context = await activeContext(env, userId);
  return {
    operations: (await listOperations(env.DB, userId, context.battalionId)).map(operationSummary),
  };
}

export async function getOperationProjection(env: Env, userId: string, operationId: string): Promise<unknown> {
  const context = await activeContext(env, userId);
  const row = await getOperation(env.DB, userId, context.battalionId, operationId);
  if (!row) throw new StrategicServiceError(404, "OPERATION_NOT_FOUND", "The operation is not available.");
  return {
    operation: operationSummary(row),
    briefing: {
      deploymentRules: parseJson<Record<string, unknown>>(row.deployment_rules_json, {}),
      knownEnemy: parseJson<Record<string, unknown>>(row.known_enemy_json, {}),
      startsAt: milliseconds(row.starts_at),
      endsAt: milliseconds(row.ends_at),
      outcome: parseJson<Record<string, unknown> | null>(row.outcome_json, null),
    },
  };
}

export async function getStrategicMapProjection(
  env: Env,
  userId: string,
  mapId: string,
): Promise<StrategicMapProjectionDto> {
  const context = await activeContext(env, userId);
  const map = await getStrategicMap(env.DB, userId, context.battalionId, mapId);
  if (!map) throw new StrategicServiceError(404, "STRATEGIC_MAP_NOT_FOUND", "The strategic map is not available.");
  const [round, nodeRows, routeRows, groups, units, forces, operations] = await Promise.all([
    getStrategicRound(env.DB, map.id, map.current_round),
    listStrategicNodes(env.DB, map.id),
    listStrategicRoutes(env.DB, map.id),
    listBattlegroups(env.DB, userId, context.battalionId),
    listBattlegroupUnits(env.DB, userId, context.battalionId),
    taskForceSummaries(env, context, map.id),
    listOperations(env.DB, userId, context.battalionId, map.id),
  ]);
  if (!round) throw new StrategicServiceError(409, "STRATEGIC_ROUND_MISSING", "The map has no current strategic round.");
  const visibleNodes = nodeRows.filter((row) => nodeVisible(row, context.battalionId));
  const visibleIds = new Set(visibleNodes.map((row) => row.id));
  return {
    map: {
      id: map.id,
      name: map.name,
      scope: map.scope as StrategicMapProjectionDto["map"]["scope"],
      rootLocationId: map.root_location_id,
      version: map.revision,
    },
    round: { mapId: map.id, round: map.current_round, phase: phase(round, map), version: round.revision },
    clock: clock(map, round),
    nodes: visibleNodes.map(projectNode),
    routes: routeRows
      .filter((route) => visibleIds.has(route.from_node_id) && visibleIds.has(route.to_node_id))
      .map(projectRoute),
    taskForces: forces,
    battlegroups: battlegroupSummaries(groups, units),
    operations: operations.filter((operation) => visibleIds.has(operation.node_id)).map(operationSummary),
    viewerPermissions: [...context.permissions].sort(),
    serverTime: Date.now(),
  };
}

function operationId(intent: StrategicOrderIntent): string | null {
  return "operationId" in intent ? intent.operationId : null;
}

function validateIntentFormation(command: SubmitStrategicOrderCommand): void {
  const intent = command.intent;
  if (
    ("battlegroupId" in intent &&
      (command.formation.kind !== "BATTLEGROUP" || command.formation.id !== intent.battlegroupId)) ||
    (intent.type === "RESUPPLY_TASK_FORCE" &&
      (command.formation.kind !== "TASK_FORCE" || command.formation.id !== intent.taskForceId))
  ) {
    throw new StrategicServiceError(400, "FORMATION_INTENT_MISMATCH", "Intent subject does not match formation.");
  }
  if (intent.type === "TRANSFER_SUPPLY") {
    const match = [intent.source, intent.destination].some(
      (endpoint) =>
        (command.formation.kind === "TASK_FORCE" && endpoint.kind === "TASK_FORCE" && endpoint.id === command.formation.id) ||
        (command.formation.kind === "BATTLEGROUP" && endpoint.id === command.formation.id),
    );
    if (!match) {
      throw new StrategicServiceError(400, "FORMATION_INTENT_MISMATCH", "Supply intent does not involve the ordered formation.");
    }
  }
}

function replayOrder(row: StrategicOrderRow, requestHash: string): unknown {
  if (row.request_hash !== requestHash) {
    throw new StrategicServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return {
    orderId: row.id,
    commandId: row.command_id,
    mapId: row.map_id,
    round: row.round_number,
    formation: {
      kind: row.subject_type,
      id: row.task_force_id ?? row.battlegroup_id,
    },
    intent: parseJson<StrategicOrderIntent>(row.intent_json, { type: "MOVE_BATTLEGROUP" }),
    routeNodeIds: parseJson<string[]>(row.route_json, []),
    destinationNodeId: row.destination_node_id,
    lifecycle: row.lifecycle,
    revision: row.revision,
    submittedAt: milliseconds(row.submitted_at),
    failureCode: row.failure_code,
  };
}

/** Called only from the map-sharded Durable Object; all D1 authority is rechecked here. */
export async function commitStrategicOrder(
  env: Env,
  userId: string,
  coordinatorMapId: string,
  command: SubmitStrategicOrderCommand,
): Promise<unknown> {
  if (command.mapId !== coordinatorMapId) {
    throw new StrategicServiceError(400, "STRATEGIC_COORDINATOR_MISMATCH", "Command targets another map coordinator.");
  }
  validateIntentFormation(command);
  const context = await activeContext(env, userId);
  const requestHash = await commandHash({ userId, battalionId: context.battalionId, command });
  const replay = await getStrategicOrderByCommand(env.DB, userId, command.commandId);
  if (replay) return replayOrder(replay, requestHash);
  const map = await getStrategicMap(env.DB, userId, context.battalionId, command.mapId);
  if (!map) throw new StrategicServiceError(404, "STRATEGIC_MAP_NOT_FOUND", "The strategic map is not available.");
  if (map.revision !== command.expectedMapVersion) {
    throw new StrategicServiceError(409, "STRATEGIC_MAP_VERSION_CONFLICT", "Strategic map changed since it was opened.", {
      expectedVersion: command.expectedMapVersion,
      currentVersion: map.revision,
    });
  }
  const round = await getStrategicRound(env.DB, map.id, map.current_round);
  if (!round || round.status !== "OPEN" || (round.lock_at !== null && round.lock_at * 1_000 <= Date.now())) {
    throw new StrategicServiceError(409, "STRATEGIC_ORDER_WINDOW_CLOSED", "Strategic orders are locked for this round.");
  }
  const authority = await getFormationAuthority(
    env.DB,
    userId,
    context.battalionId,
    map.id,
    command.formation.kind,
    command.formation.id,
  );
  const decision = authorizeStrategicIntent(
    {
      userId,
      battalionId: context.battalionId,
      permissions: context.permissions,
      formation: command.formation,
      formationBelongsToBattalion: authority !== null,
      isFormationCommander: authority?.commander_user_id === userId,
      ownsEveryFormationUnit:
        authority !== null && authority.total_units > 0 && authority.owned_units === authority.total_units,
      hasActiveDelegation:
        authority !== null &&
        authority.total_units > 0 &&
        authority.owned_units + authority.delegated_units >= authority.total_units,
    },
    command.intent,
  );
  if (!decision.allowed) throw new StrategicServiceError(403, decision.code, decision.message);
  if (!authority) throw new StrategicServiceError(404, "FORMATION_NOT_FOUND", "Formation is not available.");
  if (authority.revision !== command.expectedFormationVersion) {
    throw new StrategicServiceError(409, "FORMATION_VERSION_CONFLICT", "Formation changed since it was opened.", {
      expectedVersion: command.expectedFormationVersion,
      currentVersion: authority.revision,
    });
  }
  if (command.intent.type === "MOVE_BATTLEGROUP" && authority.carrier_task_force_id !== null) {
    throw new StrategicServiceError(422, "BATTLEGROUP_EMBARKED", "Disembark the Battlegroup before surface movement.");
  }

  let routeNodeIds: string[] = [];
  if (command.intent.type === "MOVE_TASK_FORCE" || command.intent.type === "MOVE_BATTLEGROUP") {
    if (!authority.current_node_id || !command.destinationNodeId) {
      throw new StrategicServiceError(422, "FORMATION_LOCATION_UNAVAILABLE", "Formation has no valid strategic start node.");
    }
    const [nodeRows, routeRows] = await Promise.all([
      listStrategicNodes(env.DB, map.id),
      listStrategicRoutes(env.DB, map.id),
    ]);
    // A VTOL tag alone does not prove enough lift for an entire formation.
    // Until a server-side cargo/capacity aggregation proves every member can
    // embark, Battlegroups use their ground profile and air-mobile routes fail
    // closed. Task Forces have their own orbital movement profile.
    const movementProfile: StrategicMovementProfile = command.formation.kind === "TASK_FORCE"
      ? "TASK_FORCE"
      : "GROUND_BATTLEGROUP";
    const plan = findStrategicRoute({
      nodes: nodeRows.map(projectNode),
      routes: routeRows.map(projectRoute),
      movementProfile,
      startNodeId: authority.current_node_id,
      destinationNodeId: command.destinationNodeId,
    });
    if (!plan.valid) throw new StrategicServiceError(422, plan.code, plan.message);
    routeNodeIds = plan.routeNodeIds;
  }

  const orderId = `strategic-order-${requestHash.slice(0, 24)}`;
  const eventId = `${orderId}:submitted`;
  const eventHash = await commandHash({ eventId, requestHash, round: map.current_round });
  const isTaskForce = command.formation.kind === "TASK_FORCE";
  const subjectExists = isTaskForce
    ? `EXISTS (SELECT 1 FROM task_forces AS subject
                WHERE subject.id = ?10 AND subject.battalion_id = ?4
                  AND subject.map_id = ?2 AND subject.revision = ?11)`
    : `EXISTS (SELECT 1 FROM battlegroups AS subject
                WHERE subject.id = ?10 AND subject.battalion_id = ?4
                  AND subject.revision = ?11)`;
  const subjectColumn = isTaskForce ? "task_force_id" : "battlegroup_id";
  const otherSubject = isTaskForce ? "battlegroup_id" : "task_force_id";
  const orderType = command.intent.type;
  const persistedOperationId = operationId(command.intent);
  await env.DB.batch([
    env.DB
      .prepare(`INSERT INTO strategic_orders (
                  id, map_id, round_number, battalion_id, actor_user_id,
                  order_type, subject_type, ${subjectColumn}, ${otherSubject},
                  destination_node_id, operation_id, lifecycle, route_json,
                  intent_json, command_id, request_hash, expected_subject_revision,
                  revision, submitted_at
                )
                SELECT ?1, ?2, maps.current_round, ?4, ?5,
                       ?6, ?7, ?10, NULL,
                       ?8, ?9, 'SUBMITTED', ?12,
                       ?13, ?14, ?15, ?11, 1, unixepoch()
                  FROM strategic_maps AS maps
                  JOIN strategic_rounds AS rounds
                    ON rounds.map_id = maps.id AND rounds.round_number = maps.current_round
                 WHERE maps.id = ?2 AND maps.revision = ?3
                   AND maps.status = 'ACTIVE' AND maps.paused = 0
                   AND rounds.status = 'OPEN'
                   AND (rounds.lock_at IS NULL OR rounds.lock_at > unixepoch())
                   AND ${subjectExists}
                   AND NOT EXISTS (
                     SELECT 1 FROM strategic_orders AS existing
                      WHERE existing.map_id = maps.id
                        AND existing.round_number = maps.current_round
                        AND existing.subject_type = ?7
                        AND existing.${subjectColumn} = ?10
                        AND existing.lifecycle IN ('SUBMITTED', 'LOCKED', 'RESOLVING')
                   )`)
      .bind(
        orderId,
        map.id,
        command.expectedMapVersion,
        context.battalionId,
        userId,
        orderType,
        command.formation.kind,
        command.destinationNodeId ?? null,
        persistedOperationId,
        command.formation.id,
        command.expectedFormationVersion,
        JSON.stringify(routeNodeIds),
        JSON.stringify(command.intent),
        command.commandId,
        requestHash,
      ),
    env.DB
      .prepare(`INSERT INTO strategic_events (
                  event_id, map_id, round_number, sequence, event_type,
                  battalion_id, actor_user_id, audience, subject_type, subject_id,
                  summary, payload_json, event_hash, idempotency_key, occurred_at
                )
                SELECT ?1, orders.map_id, orders.round_number,
                       COALESCE((SELECT MAX(events.sequence) + 1 FROM strategic_events AS events
                                  WHERE events.map_id = orders.map_id
                                    AND events.round_number = orders.round_number), 0),
                       'STRATEGIC_ORDER_SUBMITTED', orders.battalion_id, orders.actor_user_id,
                       'BATTALION', orders.subject_type, COALESCE(orders.task_force_id, orders.battlegroup_id),
                       ?2, ?3, ?4, ?5, unixepoch()
                  FROM strategic_orders AS orders
                 WHERE orders.id = ?6 AND orders.actor_user_id = ?7`)
      .bind(
        eventId,
        `${command.formation.kind === "TASK_FORCE" ? "Task Force" : "Battlegroup"} strategic order submitted.`,
        JSON.stringify({ orderId, commandId: command.commandId, intentType: orderType }),
        eventHash,
        `strategic:event:${requestHash}`,
        orderId,
        userId,
      ),
  ]);
  const committed = await getStrategicOrderByCommand(env.DB, userId, command.commandId);
  if (!committed) {
    throw new StrategicServiceError(
      409,
      "STRATEGIC_ORDER_CONFLICT",
      "The map, formation, or order window changed while the order was submitted.",
    );
  }
  return replayOrder(committed, requestHash);
}

export async function strategicCoordinator(
  env: Env,
  userId: string,
  mapId: string,
): Promise<{ coordinatorKey: string; permissions: Set<BattalionPermission> }> {
  const context = await activeContext(env, userId);
  const map = await getStrategicMap(env.DB, userId, context.battalionId, mapId);
  if (!map) throw new StrategicServiceError(404, "STRATEGIC_MAP_NOT_FOUND", "The strategic map is not available.");
  return { coordinatorKey: map.coordinator_key, permissions: context.permissions };
}

export async function mayManuallyResolveStrategicMap(env: Env, userId: string, mapId: string): Promise<boolean> {
  const context = await activeContext(env, userId);
  const map = await getStrategicMap(env.DB, userId, context.battalionId, mapId);
  return map !== null && mayResolveStrategicRound(env.ENVIRONMENT, context.permissions);
}

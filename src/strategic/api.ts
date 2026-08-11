import {
  SHOWCASE_STRATEGIC_SNAPSHOT,
  type ActivityView,
  type BattalionMemberView,
  type BattlegroupView,
  type ImplementationStatus,
  type MapFormationView,
  type ModuleView,
  type OperationView,
  type RankView,
  type ShipCapacityView,
  type ShipCargoView,
  type StrategicMapView,
  type StrategicNodeControl,
  type StrategicNodeView,
  type StrategicRouteView,
  type StrategicSnapshot,
} from "./model";

const DEMO_USER = "demo-user";
const DEMO_HEADERS = import.meta.env.DEV ? { "x-demo-user": DEMO_USER } : undefined;
const JSON_HEADERS = { "content-type": "application/json", ...(DEMO_HEADERS ?? {}) };
const FALLBACK_MAP_ID = "strategic-map-corinth";

type JsonRecord = Record<string, unknown>;

export interface StrategicLoadResult {
  mode: "LIVE" | "SHOWCASE" | "ERROR" | "AUTH_REQUIRED" | "NO_BATTALION";
  snapshot: StrategicSnapshot;
  issues: string[];
}

export interface StrategicApiPayloads {
  command: unknown;
  battalion: unknown;
  members: unknown;
  activity: unknown;
  ship: unknown;
  operations: unknown;
  map: unknown;
  forces?: unknown;
}

interface EndpointResult {
  ok: boolean;
  status: number;
  payload?: unknown;
  message?: string;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function firstRecord(record: JsonRecord | undefined, ...keys: string[]): JsonRecord {
  for (const key of keys) {
    const candidate = asRecord(record?.[key]);
    if (candidate) return candidate;
  }
  return record ?? {};
}

function firstArray(record: JsonRecord | undefined, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const candidate = record?.[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function identifier(record: JsonRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return "";
}

function stringValues(value: unknown): string[] {
  return asArray(value).flatMap((entry): string[] => {
    if (typeof entry === "string" && entry.trim()) return [entry];
    const record = asRecord(entry);
    const candidate = identifier(record ?? {}, "permission", "permissionKey", "capability", "capabilityKey", "code", "name", "id");
    return candidate ? [candidate] : [];
  });
}

function summaryText(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["summary", "description", "label", "name", "status"]) {
    const candidate = asString(record[key]);
    if (candidate) return candidate;
  }
  return "";
}

function normalizedStatus(value: unknown, fallback = "UNKNOWN"): string {
  return asString(value, fallback).toUpperCase().replaceAll(" ", "_");
}

function implementationStatus(value: unknown): ImplementationStatus {
  const normalized = normalizedStatus(value, "PARTIAL");
  return ["IMPLEMENTED", "PARTIAL", "CATALOGUE_ONLY", "DEFERRED"].includes(normalized)
    ? normalized as ImplementationStatus
    : "PARTIAL";
}

function normalizeRanks(payload: JsonRecord): RankView[] {
  return firstArray(payload, "ranks").flatMap((value, index): RankView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const id = identifier(record, "id", "rankId") || `rank-${index + 1}`;
    return [{
      id,
      name: asString(record.name, "Unnamed rank"),
      precedence: asNumber(record.precedence, asNumber(record.sortOrder, index + 1)),
      memberCount: asNumber(record.memberCount),
      permissions: stringValues(record.permissions),
      version: asNumber(record.version ?? record.revision, 1),
    }];
  }).sort((left, right) => left.precedence - right.precedence);
}

function normalizeMembers(payload: JsonRecord): BattalionMemberView[] {
  return firstArray(payload, "members", "memberships").flatMap((value, index): BattalionMemberView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const profile = firstRecord(record, "profile", "user");
    const rank = firstRecord(record, "rank");
    const userId = identifier(record, "userId", "user_id") || identifier(profile, "id", "userId") || `member-user-${index + 1}`;
    const callsign = asString(record.callsign, asString(profile.callsign, "UNKNOWN"));
    return [{
      id: identifier(record, "id", "membershipId") || `membership-${userId}`,
      userId,
      callsign,
      displayName: asString(record.displayName, asString(profile.displayName, callsign)),
      rankId: identifier(record, "rankId", "rank_id") || identifier(rank, "id") || "rank-unknown",
      rankName: asString(record.rankName, asString(rank.name, "Unassigned")),
      commandRole: normalizedStatus(record.commandRole ?? record.command_role, "PLAYER") as BattalionMemberView["commandRole"],
      status: normalizedStatus(record.status, "ACTIVE"),
      membershipRevision: asNumber(record.membershipRevision ?? record.revision, 1),
      battlegroupIds: stringValues(record.battlegroupIds ?? record.battlegroups),
      lastActiveAt: asTimestamp(record.lastActiveAt ?? profile.lastActiveAt),
    }];
  });
}

function normalizeBattlegroups(payload: JsonRecord): BattlegroupView[] {
  return firstArray(payload, "battlegroups").flatMap((value, index): BattlegroupView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const commander = firstRecord(record, "commander");
    const location = firstRecord(record, "currentLocation", "location");
    const operation = firstRecord(record, "currentOperation", "operation");
    const id = identifier(record, "id", "battlegroupId") || `battlegroup-${index + 1}`;
    const name = asString(record.name, `Battlegroup ${index + 1}`);
    return [{
      id,
      name,
      callsign: asString(record.callsign, name.replace(/^Battlegroup\s+/i, "").toUpperCase()),
      commanderCallsign: asString(record.commanderCallsign, asString(commander.callsign)) || undefined,
      status: normalizedStatus(record.status, "FORMING"),
      currentLocation: asString(record.currentLocationName, asString(location.name, "Location not assigned")),
      currentOperation: asString(record.currentOperationName, asString(operation.name)) || undefined,
      unitCount: asNumber(record.unitCount, asArray(record.units).length),
      memberCount: asNumber(record.memberCount, asArray(record.members).length),
      capabilities: stringValues(record.capabilities),
      intention: asString(record.intention, asString(record.currentIntention)) || undefined,
    }];
  });
}

function normalizeActivity(payload: JsonRecord): ActivityView[] {
  return firstArray(payload, "events", "activity").flatMap((value, index): ActivityView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const actor = firstRecord(record, "actor");
    return [{
      id: identifier(record, "id", "eventId") || `activity-${index + 1}`,
      type: normalizedStatus(record.type, "STRATEGIC_EVENT"),
      summary: asString(record.summary, asString(record.message, "Strategic activity recorded.")),
      occurredAt: asTimestamp(record.occurredAt ?? record.timestamp ?? record.createdAt) ?? 0,
      actorCallsign: asString(record.actorCallsign, asString(actor.callsign)) || undefined,
    }];
  }).sort((left, right) => right.occurredAt - left.occurredAt);
}

function normalizeModules(payload: JsonRecord): ModuleView[] {
  return firstArray(payload, "modules").flatMap((value, index): ModuleView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const definition = firstRecord(record, "definition", "moduleDefinition");
    const rawSlotType = normalizedStatus(record.slotType ?? definition.slotType, "INTERNAL");
    const id = identifier(record, "id", "moduleId", "shipModuleId") || `ship-module-${index + 1}`;
    return [{
      id,
      definitionId: identifier(record, "definitionId", "equipmentDefinitionId") || identifier(definition, "id", "definitionId") || id,
      name: asString(record.name, asString(definition.name, "Installed module")),
      slotType:
        rawSlotType === "EXTERNAL_INTERNAL"
          ? "EXTERNAL_INTERNAL"
          : rawSlotType === "EXTERNAL"
            ? "EXTERNAL"
            : "INTERNAL",
      slotIndex: asNumber(record.slotIndex, index),
      state: normalizedStatus(record.state ?? record.status, "OPERATIONAL"),
      implementationStatus: implementationStatus(record.implementationStatus ?? definition.implementationStatus),
      capabilities: stringValues(record.capabilities ?? definition.capabilities),
    }];
  });
}

function normalizeCapacities(payload: JsonRecord, capabilities: string[]): ShipCapacityView[] {
  const explicit = firstArray(payload, "capacities", "capacity").flatMap((value, index): ShipCapacityView[] => {
    const record = asRecord(value);
    if (!record) return [];
    return [{
      id: identifier(record, "id", "capacityId", "capabilityKey") || `capacity-${index + 1}`,
      label: asString(record.label, asString(record.name, asString(record.capabilityKey, "Capacity"))),
      used: asNullableNumber(record.used ?? record.current),
      total: asNullableNumber(record.total ?? record.capacity),
      status: ["AVAILABLE", "FULL", "UNAVAILABLE", "UNKNOWN"].includes(normalizedStatus(record.status))
        ? normalizedStatus(record.status) as ShipCapacityView["status"]
        : "UNKNOWN",
      source: asString(record.source, asString(record.sourceModuleName, "Server-derived ship capability")),
    }];
  });
  if (explicit.length) return explicit;
  const summaries = firstArray(payload, "capabilities").flatMap((value): Array<{ capability: string; value: number | null }> => {
    if (typeof value === "string") return [{ capability: value, value: null }];
    const record = asRecord(value);
    const capability = identifier(record ?? {}, "capability", "capabilityKey", "code", "id");
    return capability ? [{ capability, value: asNullableNumber(record?.value ?? record?.capacity) }] : [];
  });
  const source = summaries.length ? summaries : capabilities.map((capability) => ({ capability, value: null }));
  return source
    .filter(({ capability }) => capability.startsWith("CARRY_") || capability.startsWith("LAND_"))
    .map(({ capability, value }) => ({
      id: `capacity-${capability.toLowerCase()}`,
      label: capability.replaceAll("_", " ").toLowerCase(),
      used: null,
      total: value,
      status: "AVAILABLE",
      source: "Server-projected installed module capability",
    }));
}

function normalizeCargo(payload: JsonRecord): ShipCargoView[] {
  return firstArray(payload, "cargo").flatMap((value, index): ShipCargoView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const size = normalizedStatus(record.supplySize ?? record.size, "");
    const kind = normalizedStatus(record.kind, "CARGO");
    const definition = asString(record.definitionId);
    const label = kind === "SUPPLY" && size
      ? `${size.slice(0, 1)}${size.slice(1).toLowerCase()} Supply`
      : kind === "UNIT"
        ? asString(record.callsign, definition || asString(record.unitId, "Embarked unit"))
        : asString(record.label, asString(record.resourceType, asString(record.name, definition || "Cargo")));
    return [{
      id: identifier(record, "id", "cargoId") || `cargo-${index + 1}`,
      label,
      quantity: asNullableNumber(record.quantity),
      supplySize: ["LARGE", "MEDIUM", "SMALL"].includes(size) ? size as ShipCargoView["supplySize"] : undefined,
      location: asString(record.locationName, asString(record.location, "Primary ship cargo")),
    }];
  });
}

function normalizeOperations(payload: JsonRecord): OperationView[] {
  return firstArray(payload, "operations").flatMap((value, index): OperationView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const location = firstRecord(record, "location", "node");
    const campaign = firstRecord(record, "campaign");
    return [{
      id: identifier(record, "id", "operationId") || `operation-${index + 1}`,
      campaignId: identifier(record, "campaignId") || undefined,
      name: asString(record.name, `Operation ${index + 1}`),
      location: asString(record.locationName, asString(location.name, "Location pending")),
      nodeId: identifier(record, "nodeId", "strategicNodeId") || identifier(location, "id", "nodeId"),
      status: normalizedStatus(record.status, "ANNOUNCED"),
      role: asString(record.role, asString(record.operationRole, "Strategic operation")),
      threat: asString(record.threat, asString(record.threatLevel)) || undefined,
      strategicImportance: asString(record.strategicImportance, asString(record.description, "Strategic briefing pending.")),
      objectives: stringValues(record.objectives ?? record.objectiveSummaries),
      recommendedCapabilities: stringValues(record.recommendedCapabilities ?? record.recommended),
      assignedBattlegroups: stringValues(record.assignedBattlegroups ?? record.battlegroups ?? record.deployedBattlegroupIds),
      reinforcementState: normalizedStatus(record.reinforcementState ?? record.reinforcementStatus ?? campaign.reinforcementState, "NOT_CONFIGURED"),
      knownEnemy: summaryText(record.knownEnemy) || undefined,
      environment: stringValues(record.environment ?? record.environmentModifiers),
      tacticalRound: asNullableNumber(record.tacticalRound ?? campaign.round),
      implementationStatus: implementationStatus(record.implementationStatus),
    }];
  });
}

function nodeControl(value: unknown): StrategicNodeControl {
  const normalized = normalizedStatus(value, "UNKNOWN");
  if (normalized === "ENEMY") return "HOSTILE";
  return ["FRIENDLY", "CONTESTED", "HOSTILE", "NEUTRAL", "UNKNOWN"].includes(normalized)
    ? normalized as StrategicNodeControl
    : "UNKNOWN";
}

function layoutFor(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 50, y: 50 };
  const angle = -Math.PI / 2 + index / count * Math.PI * 2;
  return { x: 50 + Math.cos(angle) * 34, y: 50 + Math.sin(angle) * 34 };
}

function normalizeNodes(payload: JsonRecord): StrategicNodeView[] {
  const values = firstArray(payload, "nodes");
  return values.flatMap((value, index): StrategicNodeView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const location = firstRecord(record, "location");
    const visual = firstRecord(record, "visual", "position", "visualMetadata");
    const fallbackPosition = layoutFor(index, values.length);
    return [{
      id: identifier(record, "id", "nodeId") || `strategic-node-${index + 1}`,
      name: asString(record.name, asString(location.name, `Strategic node ${index + 1}`)),
      type: normalizedStatus(record.type ?? record.nodeType ?? location.type, "LOCATION"),
      locationId: identifier(record, "locationId") || identifier(location, "id"),
      planetLocationId: identifier(record, "planetLocationId") || undefined,
      parentName: asString(record.parentName, asString(location.parentName)) || undefined,
      control: nodeControl(record.control ?? record.controlState),
      x: Math.min(94, Math.max(6, asNumber(record.x, asNumber(visual.x, fallbackPosition.x)))),
      y: Math.min(92, Math.max(8, asNumber(record.y, asNumber(visual.y, fallbackPosition.y)))),
      operationIds: stringValues(record.operationIds ?? record.operations),
      forceIds: stringValues(record.forceIds ?? record.formations),
      supplyAvailable: record.supplyAvailable === true,
    }];
  });
}

function normalizeRoutes(payload: JsonRecord): StrategicRouteView[] {
  return firstArray(payload, "routes").flatMap((value, index): StrategicRouteView[] => {
    const record = asRecord(value);
    if (!record) return [];
    const from = firstRecord(record, "from", "fromNode");
    const to = firstRecord(record, "to", "toNode");
    return [{
      id: identifier(record, "id", "routeId") || `strategic-route-${index + 1}`,
      fromNodeId: identifier(record, "fromNodeId", "from_node_id") || identifier(from, "id", "nodeId"),
      toNodeId: identifier(record, "toNodeId", "to_node_id") || identifier(to, "id", "nodeId"),
      status: normalizedStatus(record.status, "OPEN"),
      movementProfiles: stringValues(record.movementProfiles ?? record.allowedMovementProfiles),
      travelRounds: asNullableNumber(record.travelRounds ?? record.travelCost ?? record.baseTravelRounds),
    }];
  }).filter((route) => Boolean(route.fromNodeId && route.toNodeId));
}

function normalizeFormation(value: unknown, kind: MapFormationView["kind"], index: number): MapFormationView | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const location = asRecord(record.currentNode) ?? asRecord(record.location) ?? {};
  const transit = asRecord(record.transit) ?? {};
  const supply = asRecord(record.supply) ?? {};
  const largeSupply = firstArray(supply, "balances")
    .map((balance) => asRecord(balance))
    .find((balance) => normalizedStatus(balance?.size, "") === "LARGE");
  const id = identifier(record, "id", kind === "TASK_FORCE" ? "taskForceId" : "battlegroupId");
  if (!id) return undefined;
  return {
    id,
    kind,
    name: asString(record.name, `${kind === "TASK_FORCE" ? "Task Force" : "Battlegroup"} ${index + 1}`),
    status: normalizedStatus(record.status, "UNKNOWN"),
    nodeId: identifier(record, "currentNodeId", "nodeId") || identifier(location, "id", "nodeId"),
    intention: asString(record.intention, asString(record.currentIntention)) || undefined,
    routeNodeIds: stringValues(record.routeNodeIds ?? record.currentRoute ?? transit.routeNodeIds),
    version: asNumber(record.version, 1),
    carrierTaskForceId: identifier(record, "currentCarrierTaskForceId", "carrierTaskForceId") || undefined,
    capabilities: stringValues(record.capabilities),
    supply: kind === "TASK_FORCE" ? {
      largeCurrent: asNullableNumber(supply.largeCurrent ?? largeSupply?.quantity),
      largeCapacity: asNullableNumber(supply.largeCapacity ?? largeSupply?.capacity),
      suppliedThroughRound: asNullableNumber(supply.suppliedThroughRound ?? supply.suppliedUntilRound),
    } : undefined,
  };
}

function normalizeMap(payload: JsonRecord): StrategicMapView {
  const map = firstRecord(payload, "map");
  const nodes = normalizeNodes(payload);
  const taskForces = firstArray(payload, "taskForces").map((value, index) => normalizeFormation(value, "TASK_FORCE", index)).filter((value): value is MapFormationView => Boolean(value));
  const taskForceNodeById = new Map(taskForces.map((formation) => [formation.id, formation.nodeId]));
  const battlegroups = firstArray(payload, "battlegroups")
    .map((value, index) => {
      const formation = normalizeFormation(value, "BATTLEGROUP", index);
      if (!formation || formation.nodeId) return formation;
      const record = asRecord(value) ?? {};
      const carrierId = identifier(record, "currentCarrierTaskForceId", "carrierTaskForceId");
      return carrierId ? { ...formation, nodeId: taskForceNodeById.get(carrierId) ?? "" } : formation;
    })
    .filter((value): value is MapFormationView => Boolean(value));
  return {
    id: identifier(map, "id", "mapId") || identifier(payload, "mapId") || FALLBACK_MAP_ID,
    name: asString(map.name, "Strategic theatre"),
    scope: normalizedStatus(map.scope ?? map.mapType, "THEATRE"),
    version: asNumber(map.version, asNumber(payload.version, 1)),
    nodes,
    routes: normalizeRoutes(payload),
    formations: [...taskForces, ...battlegroups],
    viewerPermissions: stringValues(payload.viewerPermissions),
  };
}

export function normalizeStrategicPayloads(payloads: StrategicApiPayloads): StrategicSnapshot {
  const commandPayload = asRecord(payloads.command) ?? {};
  const battalionPayload = asRecord(payloads.battalion) ?? {};
  const membersPayload = asRecord(payloads.members) ?? {};
  const activityPayload = asRecord(payloads.activity) ?? {};
  const shipPayload = asRecord(payloads.ship) ?? {};
  const operationsPayload = asRecord(payloads.operations) ?? {};
  const mapPayload = asRecord(payloads.map) ?? {};
  const forcesPayload = asRecord(payloads.forces) ?? {};

  const profile = firstRecord(commandPayload, "profile");
  const commandBattalion = firstRecord(commandPayload, "battalion");
  const battalion = firstRecord(battalionPayload, "battalion");
  const activeBattalion = Object.keys(battalion).length ? battalion : commandBattalion;
  const strategic = firstRecord(commandPayload, "strategic");
  const forceTotals = firstRecord(commandPayload, "forces", "forceTotals");
  const primaryShip = firstRecord(commandPayload, "primaryShip");
  const ship = firstRecord(shipPayload, "ship");
  const taskForce = firstRecord(shipPayload, "taskForce");
  const supply = firstRecord(shipPayload, "supply");
  const slots = firstRecord(ship, "slots");
  const map = normalizeMap(mapPayload);
  const permissions = stringValues(battalionPayload.permissions ?? activeBattalion.permissions);
  const modules = normalizeModules(shipPayload);
  const capabilities = stringValues(shipPayload.capabilities ?? ship.capabilities);
  const round = firstRecord(mapPayload, "round");
  const clock = firstRecord(mapPayload, "clock");
  const ranks = normalizeRanks(battalionPayload);
  const permissionDefinitions = firstArray(battalionPayload, "permissionDefinitions").flatMap((value) => {
    const record = asRecord(value);
    if (!record) return [];
    const permission = asString(record.permission);
    return permission ? [{ permission, description: asString(record.description, permission.replaceAll("_", " ")) }] : [];
  });
  const rankById = new Map(ranks.map((rank) => [rank.id, rank]));
  const rawMembers = normalizeMembers(membersPayload);
  const profileUserId = identifier(profile, "userId", "id") || "current-user";
  const activeMembership = rawMembers.find((member) => member.userId === profileUserId);
  const activeRankName = activeMembership ? rankById.get(activeMembership.rankId)?.name ?? activeMembership.rankName : undefined;
  const rawBattlegroups = firstArray(battalionPayload, "battlegroups");
  const memberBattlegroups = new Map<string, string[]>();
  rawBattlegroups.forEach((value) => {
    const group = asRecord(value) ?? {};
    const groupId = identifier(group, "id", "battlegroupId");
    const commanderMembershipId = identifier(group, "commanderMembershipId");
    if (groupId && commanderMembershipId) {
      memberBattlegroups.set(commanderMembershipId, [...(memberBattlegroups.get(commanderMembershipId) ?? []), groupId]);
    }
  });
  const members = rawMembers.map((member) => ({
    ...member,
    rankName: rankById.get(member.rankId)?.name ?? member.rankName,
    battlegroupIds: [...new Set([...member.battlegroupIds, ...(memberBattlegroups.get(member.id) ?? [])])],
  }));
  const enrichedRanks = ranks.map((rank) => ({
    ...rank,
    memberCount: members.filter((member) => member.rankId === rank.id && member.status === "ACTIVE").length,
  }));
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const mapFormationById = new Map(map.formations.map((formation) => [formation.id, formation]));
  const operations = normalizeOperations(
    firstArray(operationsPayload, "operations").length ? operationsPayload : mapPayload,
  ).map((operation) => ({
    ...operation,
    location: nodeById.get(operation.nodeId)?.name ?? operation.location,
  }));
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const battlegroups = normalizeBattlegroups(battalionPayload).map((group, index) => {
    const raw = asRecord(rawBattlegroups[index]) ?? {};
    const currentNodeId =
      identifier(raw, "currentNodeId", "nodeId") ||
      mapFormationById.get(group.id)?.nodeId ||
      "";
    const currentOperationId = identifier(raw, "currentOperationId", "operationId");
    const commanderMembershipId = identifier(raw, "commanderMembershipId");
    return {
      ...group,
      commanderCallsign: members.find((member) => member.id === commanderMembershipId)?.callsign ?? group.commanderCallsign,
      currentLocation: nodeById.get(currentNodeId)?.name ?? (currentNodeId || group.currentLocation),
      currentOperation: operationById.get(currentOperationId)?.name ?? (currentOperationId || group.currentOperation),
    };
  });
  const battlegroupNameById = new Map(battlegroups.map((group) => [group.id, group.name]));
  const namedOperations = operations.map((operation) => ({
    ...operation,
    assignedBattlegroups: operation.assignedBattlegroups.map((id) => battlegroupNameById.get(id) ?? id),
  }));
  const forceRecords = firstArray(forcesPayload, "forces", "units", "items").flatMap((value): JsonRecord[] => {
    const record = asRecord(value);
    return record ? [record] : [];
  });
  const forceStatus = (record: JsonRecord) => normalizedStatus(record.status, "ACTIVE");
  const forceLocation = (record: JsonRecord) => normalizedStatus(record.locationState, "RESERVE");
  const forceTotalsFromRegistry = {
    active: forceRecords.filter((record) => !["DESTROYED", "RETIRED"].includes(forceStatus(record))).length,
    deployed: forceRecords.filter((record) => forceStatus(record) === "DEPLOYED" || forceLocation(record) === "ON_MAP").length,
    aboard: forceRecords.filter((record) => ["ON_SHIP", "EMBARKED"].includes(forceLocation(record))).length,
    available: forceRecords.filter((record) => firstRecord(record, "readiness").ready === true).length,
    lost: forceRecords.filter((record) => ["DESTROYED", "RETIRED"].includes(forceStatus(record))).length,
  };
  const supplyBalances = firstArray(supply, "balances").flatMap((value): JsonRecord[] => {
    const record = asRecord(value);
    return record ? [record] : [];
  });
  const largeSupply = supplyBalances.find((balance) => normalizedStatus(balance.size, "") === "LARGE");
  const taskForceSupply = firstRecord(taskForce, "supply");
  const strategicRound = asNumber(round.number, asNumber(round.round, asNumber(strategic.round)));
  const suppliedThroughRound = asNullableNumber(
    supply.suppliedUntilRound ?? supply.suppliedThroughRound ?? taskForceSupply.suppliedThroughRound,
  );
  const suppliedTaskForceAccess = suppliedThroughRound === null
    ? null
    : suppliedThroughRound >= strategicRound;
  const shipNodeId = identifier(ship, "currentNodeId", "currentLocationId");
  const taskForceNodeId = identifier(taskForce, "currentNodeId", "nodeId");
  const cargoRecords = firstArray(shipPayload, "cargo");
  const embarkedUnits = cargoRecords.flatMap((value, index) => {
    const record = asRecord(value);
    if (!record || normalizedStatus(record.kind, "") !== "UNIT") return [];
    const unitId = identifier(record, "unitId", "id") || `embarked-unit-${index + 1}`;
    return [{
      id: unitId,
      callsign: asString(record.callsign, unitId.replace(/^force-/, "").toUpperCase()),
      className: asString(record.className, asString(record.definitionId, "Unit")),
      battlegroupName: undefined,
      state: "EMBARKED",
    }];
  });

  return {
    profile: {
      userId: profileUserId,
      callsign: asString(profile.callsign, "UNSET"),
      displayName: asString(profile.displayName, asString(profile.callsign, "Player")),
      rankName: activeRankName ?? asString(profile.rankName, asString(activeBattalion.currentUserRank, "Member")),
      battalionName: asString(activeBattalion.name, "No active Battalion"),
      timezone: asString(profile.timezone) || undefined,
    },
    clock: {
      round: strategicRound,
      mode: asTimestamp(clock.pausedAt) ? "PAUSED" : normalizedStatus(clock.mode, "MANUAL") === "MANUAL" ? "MANUAL" : "SCHEDULED",
      nextTickAt: asTimestamp(clock.nextTickAt ?? clock.resolvesAt ?? strategic.nextStrategicTick ?? strategic.nextTickAt),
      ordersLockAt: asTimestamp(clock.ordersLockAt ?? clock.locksAt ?? clock.lockAt ?? strategic.ordersLockAt),
    },
    forces: {
      active: asNumber(forceTotals.active, forceTotalsFromRegistry.active),
      deployed: asNumber(forceTotals.deployed, forceTotalsFromRegistry.deployed),
      aboard: asNumber(forceTotals.aboard ?? forceTotals.embarked, forceTotalsFromRegistry.aboard),
      available: asNumber(forceTotals.available, forceTotalsFromRegistry.available),
      lost: asNumber(forceTotals.lost, forceTotalsFromRegistry.lost),
    },
    battalion: {
      id: identifier(activeBattalion, "id", "battalionId") || "active-battalion",
      name: asString(activeBattalion.name, "Active Battalion"),
      shortName: asString(activeBattalion.shortName, asString(activeBattalion.tag, "BATTALION")),
      description: asString(activeBattalion.description, "Persistent cooperative organisation."),
      motto: asString(activeBattalion.motto) || undefined,
      status: normalizedStatus(activeBattalion.status, "ACTIVE"),
      currentUserRank: activeRankName ?? asString(activeBattalion.currentUserRank, asString(profile.rankName, "Member")),
      permissions,
      createdBy: identifier(activeBattalion, "createdBy", "created_by"),
      version: asNumber(activeBattalion.version ?? activeBattalion.revision, 1),
    },
    ranks: enrichedRanks,
    permissionDefinitions,
    members,
    battlegroups,
    activity: normalizeActivity(activityPayload),
    ship: {
      id: identifier(ship, "id", "shipId") || identifier(primaryShip, "id", "shipId") || "primary-ship",
      name: asString(ship.name, asString(primaryShip.name, "Primary Battalion ship")),
      className: asString(ship.className, asString(ship.class, asString(primaryShip.className, "Class unavailable"))),
      registry: asString(ship.registry, asString(ship.callsign, "Registry unavailable")),
      location: nodeById.get(shipNodeId)?.name ?? asString(ship.locationName, asString(firstRecord(ship, "location").name, asString(primaryShip.location, shipNodeId || "Location unavailable"))),
      status: normalizedStatus(ship.status, "UNKNOWN"),
      version: asNumber(ship.version, 1),
      internalSlots: asNumber(ship.internalSlots, asNumber(slots.internal)),
      externalSlots: asNumber(ship.externalSlots, asNumber(slots.external)),
      modules,
      capabilities,
      capacities: normalizeCapacities(shipPayload, capabilities),
      cargo: normalizeCargo(shipPayload),
      embarkedUnits: firstArray(shipPayload, "embarkedUnits", "embarked").flatMap((value, index) => {
        const record = asRecord(value);
        if (!record) return [];
        const battlegroup = firstRecord(record, "battlegroup");
        return [{
          id: identifier(record, "id", "unitId") || `embarked-unit-${index + 1}`,
          callsign: asString(record.callsign, "UNNAMED"),
          className: asString(record.className, asString(record.definitionName, "Unit")),
          battlegroupName: asString(record.battlegroupName, asString(battlegroup.name)) || undefined,
          state: normalizedStatus(record.state ?? record.locationState, "EMBARKED"),
        }];
      }).concat(embarkedUnits),
      supply: {
        largeCurrent: asNullableNumber(supply.largeCurrent ?? supply.largeSupply ?? largeSupply?.quantity),
        largeCapacity: asNullableNumber(supply.largeCapacity ?? supply.largeSupplyCapacity ?? largeSupply?.capacity),
        state: normalizedStatus(supply.state ?? supply.status, asNullableNumber(taskForceSupply.suppliedThroughRound) === null ? "UNCONFIRMED" : "SUPPLIED"),
        suppliedUntilRound: suppliedThroughRound,
        mediumAccess: typeof supply.mediumAccess === "boolean" ? supply.mediumAccess : suppliedTaskForceAccess,
        smallAccess: typeof supply.smallAccess === "boolean" ? supply.smallAccess : suppliedTaskForceAccess,
      },
      taskForce: {
        id: identifier(taskForce, "id", "taskForceId") || "primary-task-force",
        name: asString(taskForce.name, "Primary Task Force"),
        status: normalizedStatus(taskForce.status, "UNKNOWN"),
        location: nodeById.get(taskForceNodeId)?.name ?? asString(taskForce.locationName, asString(firstRecord(taskForce, "location").name, taskForceNodeId || "Location unavailable")),
        intention: asString(taskForce.intention, asString(taskForce.currentIntention)) || undefined,
      },
    },
    operations: namedOperations,
    map: {
      ...map,
      viewerPermissions: map.viewerPermissions.length ? map.viewerPermissions : permissions,
    },
  };
}

async function endpoint(path: string): Promise<EndpointResult> {
  try {
    const response = await fetch(path, { headers: DEMO_HEADERS });
    if (!response.ok) {
      return { ok: false, status: response.status, message: `${path} returned ${response.status}` };
    }
    return { ok: true, status: response.status, payload: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : `${path} is unavailable` };
  }
}

function payloadOrEmpty(result: EndpointResult): unknown {
  return result.ok ? result.payload : {};
}

function mapIdFromCommand(payload: unknown): string {
  const command = asRecord(payload) ?? {};
  const strategic = firstRecord(command, "strategic");
  return identifier(strategic, "mapId", "currentMapId") || FALLBACK_MAP_ID;
}

export async function loadStrategicSnapshot(): Promise<StrategicLoadResult> {
  const [command, battalion, members, activity, ship, operations, forces] = await Promise.all([
    endpoint("/api/command"),
    endpoint("/api/battalions/current"),
    endpoint("/api/battalions/current/members"),
    endpoint("/api/battalions/current/activity"),
    endpoint("/api/ships/primary"),
    endpoint("/api/operations"),
    endpoint("/api/forces"),
  ]);

  const mapId = mapIdFromCommand(command.payload);
  const map = await endpoint(`/api/strategic/maps/${encodeURIComponent(mapId)}`);
  const results = [command, battalion, members, activity, ship, operations, map, forces];
  const issues = results.filter((result) => !result.ok).flatMap((result) => result.message ? [result.message] : []);
  if (results.some((result) => result.status === 401)) {
    return { mode: "AUTH_REQUIRED", snapshot: SHOWCASE_STRATEGIC_SNAPSHOT, issues };
  }

  const commandRecord = asRecord(command.payload);
  if (command.ok && commandRecord && commandRecord.battalion === null) {
    return {
      mode: "NO_BATTALION",
      snapshot: normalizeStrategicPayloads({
        command: command.payload,
        battalion: {},
        members: {},
        activity: {},
        ship: {},
        operations: {},
        map: {},
        forces: payloadOrEmpty(forces),
      }),
      issues,
    };
  }

  const hasStrategicAssignment = Boolean(asRecord(commandRecord?.strategic));
  const required = [command, battalion, operations, ...(hasStrategicAssignment ? [map] : [])];
  if (required.some((result) => !result.ok)) {
    return {
      mode: import.meta.env.DEV ? "SHOWCASE" : "ERROR",
      snapshot: SHOWCASE_STRATEGIC_SNAPSHOT,
      issues,
    };
  }

  return {
    mode: "LIVE",
    snapshot: normalizeStrategicPayloads({
      command: payloadOrEmpty(command),
      battalion: payloadOrEmpty(battalion),
      members: payloadOrEmpty(members),
      activity: payloadOrEmpty(activity),
      ship: payloadOrEmpty(ship),
      operations: payloadOrEmpty(operations),
      map: payloadOrEmpty(map),
      forces: payloadOrEmpty(forces),
    }),
    issues,
  };
}

export async function loadOperationDetail(operationId: string): Promise<OperationView | undefined> {
  const result = await endpoint(`/api/operations/${encodeURIComponent(operationId)}`);
  if (!result.ok) return undefined;
  const payload = asRecord(result.payload) ?? {};
  const operation = asRecord(payload.operation) ?? asRecord(result.payload) ?? {};
  const briefing = firstRecord(payload, "briefing");
  const deploymentRules = firstRecord(briefing, "deploymentRules");
  const normalized = normalizeOperations({
    operations: [{
      ...operation,
      knownEnemy: briefing.knownEnemy,
      environment: deploymentRules.environmentModifiers ?? deploymentRules.environment,
    }],
  });
  return normalized[0];
}

export interface StrategicMutationResult {
  ok: boolean;
  status: number;
  payload?: JsonRecord;
  message: string;
}

async function strategicMutation(path: string, value: unknown): Promise<StrategicMutationResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(value),
    });
    const payload = asRecord(await response.json().catch(() => ({}))) ?? {};
    const error = asRecord(payload.error);
    return {
      ok: response.ok,
      status: response.status,
      payload,
      message: response.ok
        ? asString(payload.message, "Strategic command accepted.")
        : asString(error?.message, `Strategic command failed (${response.status}).`),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Strategic command service is unavailable.",
    };
  }
}

export function submitStrategicOrder(value: unknown): Promise<StrategicMutationResult> {
  return strategicMutation("/api/strategic/orders", value);
}

export function resolveStrategicMap(mapId: string, value: unknown): Promise<StrategicMutationResult> {
  return strategicMutation(`/api/strategic/maps/${encodeURIComponent(mapId)}/resolve`, value);
}

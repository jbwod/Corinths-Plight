import type {
  AssignBattlegroupUnitCommand,
  BattlegroupMutationResultDto,
  BattlegroupManagementProjectionDto,
  CreateBattlegroupCommand,
  RemoveBattlegroupUnitCommand,
  SetBattlegroupDelegationCommand,
  UpdateBattlegroupCommand,
} from "../../packages/domain/src";
import { commandHash } from "../forces-validation";
import type { Env } from "../env";
import {
  activeBattalionMemberExists,
  activeBattlegroupDelegationExists,
  getBattlegroupActor,
  getBattlegroupReceipt,
  getManagedBattlegroup,
  getManagedUnit,
  listManagedBattlegroups,
  listManagedBattlegroupUnits,
  type BattlegroupActorRow,
  type ManagedBattlegroupRow,
} from "../repositories/battlegroups";

export class BattlegroupServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

type Operation = BattlegroupMutationResultDto["operation"];

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function permissions(row: BattlegroupActorRow): Set<string> {
  return new Set(parseJson<string[]>(row.permissions_json, []));
}

async function actor(env: Env, userId: string, required: string): Promise<BattlegroupActorRow> {
  const row = await getBattlegroupActor(env.DB, userId);
  if (!row) throw new BattlegroupServiceError(409, "ACTIVE_BATTALION_REQUIRED", "Select an active Battalion first.");
  if (!permissions(row).has(required)) {
    throw new BattlegroupServiceError(403, "BATTALION_PERMISSION_REQUIRED", `${required} permission is required.`);
  }
  return row;
}

function elevated(row: BattlegroupActorRow): boolean {
  return row.command_role === "ADMIN" || row.command_role === "BATTALION_COMMAND";
}

function mutable(group: ManagedBattlegroupRow): void {
  if (!["FORMING", "READY", "RECOVERING"].includes(group.status)) {
    throw new BattlegroupServiceError(409, "BATTLEGROUP_OPERATIONAL", "A deployed, embarked, or moving Battlegroup cannot be reorganised.");
  }
}

function mayLead(row: BattlegroupActorRow, group: ManagedBattlegroupRow, userId: string): void {
  if (!elevated(row) && group.leader_user_id !== userId) {
    throw new BattlegroupServiceError(403, "BATTLEGROUP_COMMAND_REQUIRED", "Only the formation leader or Battalion command may edit this Battlegroup.");
  }
}

async function group(env: Env, context: BattlegroupActorRow, battlegroupId: string): Promise<ManagedBattlegroupRow> {
  const row = await getManagedBattlegroup(env.DB, context.battalion_id, battlegroupId);
  if (!row) throw new BattlegroupServiceError(404, "BATTLEGROUP_NOT_FOUND", "Battlegroup was not found in the active Battalion.");
  return row;
}

async function replay(
  env: Env, actorUserId: string, commandId: string, operation: Operation, requestHash: string,
): Promise<BattlegroupMutationResultDto | undefined> {
  const row = await getBattlegroupReceipt(env.DB, actorUserId, commandId);
  if (!row) return undefined;
  if (row.operation !== operation || row.request_hash !== requestHash) {
    throw new BattlegroupServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return parseJson<BattlegroupMutationResultDto>(row.response_json, {
    operation, battlegroupId: "unknown", revision: 0,
  });
}

async function committed(
  env: Env, actorUserId: string, commandId: string, operation: Operation, requestHash: string,
): Promise<BattlegroupMutationResultDto> {
  const result = await replay(env, actorUserId, commandId, operation, requestHash);
  if (!result) throw new BattlegroupServiceError(409, "BATTLEGROUP_REVISION_CONFLICT", "Battlegroup changed while the command was committed.");
  return result;
}

function token(actorUserId: string, commandId: string): string {
  return `${actorUserId}:${commandId}`;
}

export async function getBattlegroupManagement(
  env: Env, actorUserId: string,
): Promise<BattlegroupManagementProjectionDto> {
  const context = await getBattlegroupActor(env.DB, actorUserId);
  if (!context) throw new BattlegroupServiceError(409, "ACTIVE_BATTALION_REQUIRED", "Select an active Battalion first.");
  const [groups, units] = await Promise.all([
    listManagedBattlegroups(env.DB, actorUserId, context.battalion_id),
    listManagedBattlegroupUnits(env.DB, actorUserId, context.battalion_id),
  ]);
  return {
    battlegroups: groups.map((item) => ({
      id: item.id,
      name: item.name,
      callsign: item.callsign ?? item.name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 16),
      objective: item.objective,
      leaderUserId: item.leader_user_id,
      status: item.status as BattlegroupManagementProjectionDto["battlegroups"][number]["status"],
      revision: item.revision,
    })),
    units: units.map((item) => ({
      battlegroupId: item.battlegroup_id,
      unitId: item.unit_id,
      ownerId: item.owner_id,
      delegatedCommand: item.delegated_command === 1,
    })),
  };
}

export async function createBattlegroup(
  env: Env, actorUserId: string, command: CreateBattlegroupCommand,
): Promise<BattlegroupMutationResultDto> {
  const operation: Operation = "CREATE_BATTLEGROUP";
  const requestHash = await commandHash({ actorUserId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId, "BATTLEGROUP_CREATE");
  const battlegroupId = `battlegroup-${requestHash.slice(0, 24)}`;
  const response: BattlegroupMutationResultDto = { operation, battlegroupId, revision: 1 };
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO battlegroups (
          id,battalion_id,name,callsign,objective,leader_user_id,persistent,status,revision,updated_at,last_mutation_token
        ) VALUES (?1,?2,?3,?4,?5,?6,1,'FORMING',1,unixepoch(),?7)`)
        .bind(battlegroupId, context.battalion_id, command.name, command.callsign, command.objective, actorUserId, token(actorUserId, command.commandId)),
      env.DB.prepare(`INSERT INTO battlegroup_mutation_receipts (
          actor_user_id,command_id,operation,request_hash,response_json
        ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
          SELECT 1 FROM battlegroups WHERE id=?6 AND battalion_id=?7 AND last_mutation_token=?8)`)
        .bind(actorUserId, command.commandId, operation, requestHash, JSON.stringify(response), battlegroupId, context.battalion_id, token(actorUserId, command.commandId)),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (String(error).includes("UNIQUE")) throw new BattlegroupServiceError(409, "BATTLEGROUP_IDENTITY_CONFLICT", "Battlegroup name or callsign is already in use.");
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

export async function updateBattlegroup(
  env: Env, actorUserId: string, battlegroupId: string, command: UpdateBattlegroupCommand,
): Promise<BattlegroupMutationResultDto> {
  const operation: Operation = "UPDATE_BATTLEGROUP";
  const requestHash = await commandHash({ actorUserId, battlegroupId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId, "BATTLEGROUP_EDIT");
  const current = await group(env, context, battlegroupId);
  mutable(current);
  mayLead(context, current, actorUserId);
  if (current.revision !== command.expectedRevision) {
    throw new BattlegroupServiceError(409, "BATTLEGROUP_REVISION_CONFLICT", "Battlegroup changed since it was opened.");
  }
  if (command.leaderUserId && !(await activeBattalionMemberExists(env.DB, context.battalion_id, command.leaderUserId))) {
    throw new BattlegroupServiceError(409, "LEADER_NOT_ACTIVE", "The selected leader is not an active Battalion member.");
  }
  const response: BattlegroupMutationResultDto = { operation, battlegroupId, revision: current.revision + 1 };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE battlegroups SET name=?1,callsign=?2,objective=?3,leader_user_id=?4,
          revision=revision+1,updated_at=unixepoch(),last_mutation_token=?5
        WHERE id=?6 AND battalion_id=?7 AND revision=?8`)
        .bind(command.name, command.callsign, command.objective, command.leaderUserId, token(actorUserId, command.commandId), battlegroupId, context.battalion_id, current.revision),
      env.DB.prepare(`INSERT INTO battlegroup_mutation_receipts (
          actor_user_id,command_id,operation,request_hash,response_json
        ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
          SELECT 1 FROM battlegroups WHERE id=?6 AND last_mutation_token=?7 AND revision=?8)`)
        .bind(actorUserId, command.commandId, operation, requestHash, JSON.stringify(response), battlegroupId, token(actorUserId, command.commandId), response.revision),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (String(error).includes("UNIQUE")) throw new BattlegroupServiceError(409, "BATTLEGROUP_IDENTITY_CONFLICT", "Battlegroup name or callsign is already in use.");
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

async function rosterCommand(
  env: Env,
  actorUserId: string,
  battlegroupId: string,
  command: AssignBattlegroupUnitCommand | RemoveBattlegroupUnitCommand,
  operation: "ASSIGN_BATTLEGROUP_UNIT" | "REMOVE_BATTLEGROUP_UNIT",
): Promise<BattlegroupMutationResultDto> {
  const requestHash = await commandHash({ actorUserId, battlegroupId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId, "BATTLEGROUP_ASSIGN");
  const current = await group(env, context, battlegroupId);
  mutable(current);
  if (current.revision !== command.expectedRevision) {
    throw new BattlegroupServiceError(409, "BATTLEGROUP_REVISION_CONFLICT", "Battlegroup changed since it was opened.");
  }
  const unit = await getManagedUnit(env.DB, command.unitId);
  if (!unit) throw new BattlegroupServiceError(404, "UNIT_NOT_FOUND", "Persistent unit was not found.");
  if (unit.owner_id !== actorUserId && !elevated(context)) {
    throw new BattlegroupServiceError(403, "UNIT_OWNER_REQUIRED", "Only the unit owner or Battalion command may change its formation.");
  }
  if (operation === "ASSIGN_BATTLEGROUP_UNIT") {
    if (!["ACTIVE", "DAMAGED"].includes(unit.status) || !["RESERVE", "ON_SHIP"].includes(unit.location_state)) {
      throw new BattlegroupServiceError(409, "UNIT_NOT_ASSIGNABLE", "Only operational reserve or shipboard units can change formation.");
    }
    if (unit.movement_domain === "ORBITAL") {
      throw new BattlegroupServiceError(409, "ORBITAL_UNIT_IN_BATTLEGROUP", "Orbital units cannot join a ground Battlegroup.");
    }
    if (unit.current_battlegroup_id) {
      throw new BattlegroupServiceError(409, "UNIT_ALREADY_ASSIGNED", "Unit already belongs to a Battlegroup.", { battlegroupId: unit.current_battlegroup_id });
    }
  } else if (unit.current_battlegroup_id !== battlegroupId) {
    throw new BattlegroupServiceError(409, "UNIT_NOT_IN_BATTLEGROUP", "Unit is not assigned to this Battlegroup.");
  }
  const response: BattlegroupMutationResultDto = {
    operation, battlegroupId, revision: current.revision + 1, unitId: command.unitId,
  };
  const mutationToken = token(actorUserId, command.commandId);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE battlegroups SET revision=revision+1,updated_at=unixepoch(),last_mutation_token=?1
      WHERE id=?2 AND battalion_id=?3 AND revision=?4`)
      .bind(mutationToken, battlegroupId, context.battalion_id, current.revision),
  ];
  if (operation === "ASSIGN_BATTLEGROUP_UNIT") {
    statements.push(env.DB.prepare(`INSERT INTO battlegroup_units (battlegroup_id,player_unit_id,delegated_command)
      SELECT ?1,?2,0 WHERE EXISTS (SELECT 1 FROM battlegroups WHERE id=?1 AND last_mutation_token=?3)`)
      .bind(battlegroupId, command.unitId, mutationToken));
    statements.push(env.DB.prepare(`UPDATE battlegroups SET status=CASE WHEN EXISTS (
        SELECT 1 FROM battlegroup_units AS links
        JOIN player_units AS units ON units.id=links.player_unit_id
        JOIN unit_definition_profiles AS profiles
          ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
        JOIN movement_profile_definitions AS movement
          ON movement.id=profiles.movement_profile_id AND movement.ruleset_id=profiles.ruleset_id
        WHERE links.battlegroup_id=?1 AND movement.domain='GROUND'
      ) THEN 'READY' ELSE 'FORMING' END WHERE id=?1 AND last_mutation_token=?2`)
      .bind(battlegroupId, mutationToken));
  } else {
    statements.push(env.DB.prepare(`DELETE FROM battlegroup_units WHERE battlegroup_id=?1 AND player_unit_id=?2
      AND EXISTS (SELECT 1 FROM battlegroups WHERE id=?1 AND last_mutation_token=?3)`)
      .bind(battlegroupId, command.unitId, mutationToken));
    statements.push(env.DB.prepare(`UPDATE unit_order_delegations SET revoked_at=unixepoch(),revision=revision+1,updated_at=unixepoch()
      WHERE battlegroup_id=?1 AND player_unit_id=?2 AND revoked_at IS NULL`).bind(battlegroupId, command.unitId));
    statements.push(env.DB.prepare(`UPDATE battlegroups SET status=CASE WHEN EXISTS (
        SELECT 1 FROM battlegroup_units AS links
        JOIN player_units AS units ON units.id=links.player_unit_id
        JOIN unit_definition_profiles AS profiles
          ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
        JOIN movement_profile_definitions AS movement
          ON movement.id=profiles.movement_profile_id AND movement.ruleset_id=profiles.ruleset_id
        WHERE links.battlegroup_id=?1 AND movement.domain='GROUND'
      ) THEN 'READY' ELSE 'FORMING' END
      WHERE id=?1 AND last_mutation_token=?2`).bind(battlegroupId, mutationToken));
  }
  statements.push(env.DB.prepare(`INSERT INTO unit_history (
      id,player_unit_id,event_type,summary,payload_json,occurred_at,idempotency_key,actor_user_id,visibility
    ) SELECT ?1,id,?2,?3,?4,unixepoch(),?5,?6,'OWNER' FROM player_units
      WHERE id=?7 AND EXISTS (SELECT 1 FROM battlegroups WHERE id=?8 AND last_mutation_token=?9)`)
    .bind(`history:battlegroup:${requestHash.slice(0, 24)}`, operation, operation === "ASSIGN_BATTLEGROUP_UNIT" ? "Unit assigned to a persistent Battlegroup." : "Unit removed from its persistent Battlegroup.", JSON.stringify({ battlegroupId }), `battlegroup:${requestHash}`, actorUserId, command.unitId, battlegroupId, mutationToken));
  statements.push(env.DB.prepare(`INSERT INTO battlegroup_mutation_receipts (
      actor_user_id,command_id,operation,request_hash,response_json
    ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
      SELECT 1 FROM battlegroups WHERE id=?6 AND last_mutation_token=?7 AND revision=?8)`)
    .bind(actorUserId, command.commandId, operation, requestHash, JSON.stringify(response), battlegroupId, mutationToken, response.revision));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (String(error).includes("idx_one_battlegroup_per_player_unit") || String(error).includes("UNIQUE constraint failed: battlegroup_units.player_unit_id")) {
      throw new BattlegroupServiceError(409, "UNIT_ALREADY_ASSIGNED", "Unit already belongs to another Battlegroup.");
    }
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

export function assignBattlegroupUnit(env: Env, actorUserId: string, battlegroupId: string, command: AssignBattlegroupUnitCommand) {
  return rosterCommand(env, actorUserId, battlegroupId, command, "ASSIGN_BATTLEGROUP_UNIT");
}

export function removeBattlegroupUnit(env: Env, actorUserId: string, battlegroupId: string, command: RemoveBattlegroupUnitCommand) {
  return rosterCommand(env, actorUserId, battlegroupId, command, "REMOVE_BATTLEGROUP_UNIT");
}

export async function setBattlegroupDelegation(
  env: Env, actorUserId: string, battlegroupId: string, command: SetBattlegroupDelegationCommand,
): Promise<BattlegroupMutationResultDto> {
  const operation: Operation = "SET_BATTLEGROUP_DELEGATION";
  const requestHash = await commandHash({ actorUserId, battlegroupId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId, "BATTLEGROUP_ASSIGN");
  const current = await group(env, context, battlegroupId);
  mutable(current);
  if (current.revision !== command.expectedRevision) throw new BattlegroupServiceError(409, "BATTLEGROUP_REVISION_CONFLICT", "Battlegroup changed since it was opened.");
  const unit = await getManagedUnit(env.DB, command.unitId);
  if (!unit || unit.current_battlegroup_id !== battlegroupId) throw new BattlegroupServiceError(409, "UNIT_NOT_IN_BATTLEGROUP", "Unit is not assigned to this Battlegroup.");
  if (unit.owner_id !== actorUserId) throw new BattlegroupServiceError(403, "UNIT_OWNER_REQUIRED", "Only the unit owner can grant order authority.");
  if (command.delegateUserId === actorUserId) throw new BattlegroupServiceError(409, "DELEGATION_SELF_INVALID", "Owners already hold authority over their own units.");
  if (!(await activeBattalionMemberExists(env.DB, context.battalion_id, command.delegateUserId))) {
    throw new BattlegroupServiceError(409, "DELEGATE_NOT_ACTIVE", "The delegate is not an active Battalion member.");
  }
  const alreadyActive = await activeBattlegroupDelegationExists(env.DB, actorUserId, command.delegateUserId, battlegroupId, command.unitId);
  if (alreadyActive === command.active) {
    const response: BattlegroupMutationResultDto = { operation, battlegroupId, revision: current.revision, unitId: command.unitId, delegateUserId: command.delegateUserId, delegationActive: command.active };
    await env.DB.prepare(`INSERT INTO battlegroup_mutation_receipts (actor_user_id,command_id,operation,request_hash,response_json)
      VALUES (?1,?2,?3,?4,?5)`).bind(actorUserId, command.commandId, operation, requestHash, JSON.stringify(response)).run();
    return committed(env, actorUserId, command.commandId, operation, requestHash);
  }
  const response: BattlegroupMutationResultDto = { operation, battlegroupId, revision: current.revision + 1, unitId: command.unitId, delegateUserId: command.delegateUserId, delegationActive: command.active };
  const mutationToken = token(actorUserId, command.commandId);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE battlegroups SET revision=revision+1,updated_at=unixepoch(),last_mutation_token=?1
      WHERE id=?2 AND battalion_id=?3 AND revision=?4`).bind(mutationToken, battlegroupId, context.battalion_id, current.revision),
  ];
  if (command.active) {
    statements.push(env.DB.prepare(`INSERT INTO unit_order_delegations (
        id,battalion_id,player_unit_id,owner_user_id,delegate_user_id,battlegroup_id,scope_type,
        starts_at,revision,command_id,request_hash,created_at,updated_at
      ) SELECT ?1,?2,?3,?4,?5,?6,'BATTLEGROUP',unixepoch(),1,?7,?8,unixepoch(),unixepoch()
        WHERE EXISTS (SELECT 1 FROM battlegroups WHERE id=?6 AND last_mutation_token=?9)`)
      .bind(`delegation-${requestHash.slice(0, 24)}`, context.battalion_id, command.unitId, actorUserId, command.delegateUserId, battlegroupId, command.commandId, requestHash, mutationToken));
    statements.push(env.DB.prepare(`UPDATE battlegroup_units SET delegated_command=1 WHERE battlegroup_id=?1 AND player_unit_id=?2`)
      .bind(battlegroupId, command.unitId));
  } else {
    statements.push(env.DB.prepare(`UPDATE unit_order_delegations SET revoked_at=unixepoch(),revision=revision+1,updated_at=unixepoch()
      WHERE owner_user_id=?1 AND delegate_user_id=?2 AND battlegroup_id=?3 AND player_unit_id=?4
        AND scope_type='BATTLEGROUP' AND revoked_at IS NULL`)
      .bind(actorUserId, command.delegateUserId, battlegroupId, command.unitId));
    statements.push(env.DB.prepare(`UPDATE battlegroup_units SET delegated_command=0 WHERE battlegroup_id=?1 AND player_unit_id=?2`)
      .bind(battlegroupId, command.unitId));
  }
  statements.push(env.DB.prepare(`INSERT INTO battlegroup_mutation_receipts (
      actor_user_id,command_id,operation,request_hash,response_json
    ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
      SELECT 1 FROM battlegroups WHERE id=?6 AND last_mutation_token=?7 AND revision=?8)`)
    .bind(actorUserId, command.commandId, operation, requestHash, JSON.stringify(response), battlegroupId, mutationToken, response.revision));
  await env.DB.batch(statements);
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

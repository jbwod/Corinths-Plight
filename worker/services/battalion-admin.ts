import type {
  AssignBattalionMemberRankCommand,
  BattalionAdministrationMutationDto,
  BattalionAdministrationOperation,
  BattalionPermission,
  CreateBattalionRankCommand,
  DeleteBattalionRankCommand,
  UpdateBattalionRankCommand,
} from "../../packages/domain/src";
import { commandHash } from "../forces-validation";
import type { Env } from "../env";
import {
  getBattalionAdminContext,
  getBattalionAdminReceipt,
  getManagedBattalionMember,
  getManagedBattalionRank,
  listActiveBattalionPermissionDefinitions,
  type BattalionAdminContextRow,
  type ManagedBattalionRankRow,
} from "../repositories/battalion-admin";

export class BattalionAdminServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function permissionSet(row: BattalionAdminContextRow): Set<string> {
  return new Set(parseJson<string[]>(row.permissions_json, []));
}

async function actor(env: Env, actorUserId: string): Promise<BattalionAdminContextRow> {
  const row = await getBattalionAdminContext(env.DB, actorUserId);
  if (!row) throw new BattalionAdminServiceError(409, "ACTIVE_BATTALION_REQUIRED", "Select an active Battalion first.");
  if (!permissionSet(row).has("RANK_MANAGE")) {
    throw new BattalionAdminServiceError(403, "BATTALION_PERMISSION_REQUIRED", "RANK_MANAGE permission is required.");
  }
  return row;
}

async function replay(
  env: Env,
  actorUserId: string,
  commandId: string,
  operation: BattalionAdministrationOperation,
  requestHash: string,
): Promise<BattalionAdministrationMutationDto | undefined> {
  const row = await getBattalionAdminReceipt(env.DB, actorUserId, commandId);
  if (!row) return undefined;
  if (row.operation !== operation || row.request_hash !== requestHash) {
    throw new BattalionAdminServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return parseJson<BattalionAdministrationMutationDto>(row.response_json, {
    operation,
    battalionId: "unknown",
    rankId: "unknown",
  });
}

async function committed(
  env: Env,
  actorUserId: string,
  commandId: string,
  operation: BattalionAdministrationOperation,
  requestHash: string,
): Promise<BattalionAdministrationMutationDto> {
  const result = await replay(env, actorUserId, commandId, operation, requestHash);
  if (!result) {
    throw new BattalionAdminServiceError(409, "BATTALION_REVISION_CONFLICT", "Battalion administration changed while the command was committed.");
  }
  return result;
}

async function activePermissions(env: Env, requested: readonly BattalionPermission[]): Promise<void> {
  const allowed = new Set((await listActiveBattalionPermissionDefinitions(env.DB)).map((row) => row.permission));
  const unsupported = requested.filter((item) => !allowed.has(item));
  if (unsupported.length) {
    throw new BattalionAdminServiceError(409, "PERMISSION_NOT_ACTIVE", "One or more selected permissions are not active gameplay capabilities.", { permissions: unsupported });
  }
}

async function managedRank(
  env: Env,
  battalionId: string,
  rankId: string,
): Promise<ManagedBattalionRankRow> {
  const row = await getManagedBattalionRank(env.DB, battalionId, rankId);
  if (!row) throw new BattalionAdminServiceError(404, "RANK_NOT_FOUND", "Rank was not found in the active Battalion.");
  return row;
}

function eventStatement(
  env: Env,
  input: {
    eventType: string;
    battalionId: string;
    actorUserId: string;
    subjectType: "RANK" | "USER";
    subjectId: string;
    summary: string;
    payload: Record<string, unknown>;
    requestHash: string;
    guardSql: string;
    guardBindings: unknown[];
  },
): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO strategic_events (
      event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
      summary,payload_json,event_hash,idempotency_key,occurred_at
    ) SELECT ?1,?2,?3,?4,'BATTALION',?5,?6,?7,?8,?9,?10,unixepoch()
      WHERE ${input.guardSql}`)
    .bind(
      `event:battalion-admin:${input.requestHash}`,
      input.eventType,
      input.battalionId,
      input.actorUserId,
      input.subjectType,
      input.subjectId,
      input.summary,
      JSON.stringify(input.payload),
      input.requestHash,
      `battalion-admin:${input.requestHash}`,
      ...input.guardBindings,
    );
}

function receiptStatement(
  env: Env,
  actorUserId: string,
  commandId: string,
  operation: BattalionAdministrationOperation,
  requestHash: string,
  response: BattalionAdministrationMutationDto,
  guardSql: string,
  guardBindings: unknown[],
): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO battalion_administration_receipts (
      actor_user_id,command_id,operation,request_hash,response_json
    ) SELECT ?1,?2,?3,?4,?5 WHERE ${guardSql}`)
    .bind(actorUserId, commandId, operation, requestHash, JSON.stringify(response), ...guardBindings);
}

function uniqueness(error: unknown): boolean {
  return String(error).includes("UNIQUE constraint failed");
}

export async function createBattalionRank(
  env: Env,
  actorUserId: string,
  command: CreateBattalionRankCommand,
): Promise<BattalionAdministrationMutationDto> {
  const operation = "CREATE_BATTALION_RANK" as const;
  const requestHash = await commandHash({ actorUserId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId);
  await activePermissions(env, command.permissions);
  const rankId = `rank-${requestHash.slice(0, 24)}`;
  const response: BattalionAdministrationMutationDto = {
    operation,
    battalionId: context.battalion_id,
    rankId,
    rankVersion: 1,
  };
  const guardSql = `EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?11 AND battalion_id=?12 AND last_mutation_token=?13)`;
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO battalion_ranks (
          id,battalion_id,name,precedence,revision,updated_at,last_mutation_token
        ) VALUES (?1,?2,?3,?4,1,unixepoch(),?5)`)
        .bind(rankId, context.battalion_id, command.name, command.sortOrder, requestHash),
      ...command.permissions.map((permission) => env.DB.prepare(`INSERT INTO rank_permissions (rank_id,permission)
        SELECT ?1,?2 WHERE EXISTS (
          SELECT 1 FROM battalion_ranks WHERE id=?1 AND battalion_id=?3 AND last_mutation_token=?4)
          AND EXISTS (SELECT 1 FROM battalion_permission_definitions
            WHERE permission=?2 AND implementation_status='ACTIVE')`)
        .bind(rankId, permission, context.battalion_id, requestHash)),
      eventStatement(env, {
        eventType: "BATTALION_RANK_CREATED",
        battalionId: context.battalion_id,
        actorUserId,
        subjectType: "RANK",
        subjectId: rankId,
        summary: "A Battalion rank was created.",
        payload: { rankId, name: command.name, sortOrder: command.sortOrder, permissions: command.permissions },
        requestHash,
        guardSql,
        guardBindings: [rankId, context.battalion_id, requestHash],
      }),
      receiptStatement(env, actorUserId, command.commandId, operation, requestHash, response,
        "EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?6 AND battalion_id=?7 AND last_mutation_token=?8)",
        [rankId, context.battalion_id, requestHash]),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (uniqueness(error)) throw new BattalionAdminServiceError(409, "RANK_IDENTITY_CONFLICT", "Rank name or order is already in use.");
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

export async function updateBattalionRank(
  env: Env,
  actorUserId: string,
  rankId: string,
  command: UpdateBattalionRankCommand,
): Promise<BattalionAdministrationMutationDto> {
  const operation = "UPDATE_BATTALION_RANK" as const;
  const requestHash = await commandHash({ actorUserId, operation, rankId, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId);
  const current = await managedRank(env, context.battalion_id, rankId);
  if (current.revision !== command.expectedVersion) {
    throw new BattalionAdminServiceError(409, "RANK_REVISION_CONFLICT", "Rank changed since it was opened.");
  }
  await activePermissions(env, command.permissions);
  if (current.command_member_count > 0 && !command.permissions.includes("RANK_MANAGE")) {
    throw new BattalionAdminServiceError(409, "COMMAND_RANK_REQUIRED", "A rank assigned to Battalion command must retain RANK_MANAGE.");
  }
  const nextVersion = current.revision + 1;
  const response: BattalionAdministrationMutationDto = {
    operation,
    battalionId: context.battalion_id,
    rankId,
    rankVersion: nextVersion,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE battalion_ranks
        SET name=?1,precedence=?2,revision=revision+1,updated_at=unixepoch(),last_mutation_token=?3
        WHERE id=?4 AND battalion_id=?5 AND revision=?6`)
        .bind(command.name, command.sortOrder, requestHash, rankId, context.battalion_id, current.revision),
      env.DB.prepare(`DELETE FROM rank_permissions WHERE rank_id=?1 AND EXISTS (
        SELECT 1 FROM battalion_ranks WHERE id=?1 AND battalion_id=?2
          AND revision=?3 AND last_mutation_token=?4)`)
        .bind(rankId, context.battalion_id, nextVersion, requestHash),
      ...command.permissions.map((permission) => env.DB.prepare(`INSERT INTO rank_permissions (rank_id,permission)
        SELECT ?1,?2 WHERE EXISTS (
          SELECT 1 FROM battalion_ranks WHERE id=?1 AND battalion_id=?3
            AND revision=?4 AND last_mutation_token=?5)
          AND EXISTS (SELECT 1 FROM battalion_permission_definitions
            WHERE permission=?2 AND implementation_status='ACTIVE')`)
        .bind(rankId, permission, context.battalion_id, nextVersion, requestHash)),
      eventStatement(env, {
        eventType: "BATTALION_RANK_UPDATED",
        battalionId: context.battalion_id,
        actorUserId,
        subjectType: "RANK",
        subjectId: rankId,
        summary: "A Battalion rank was updated.",
        payload: { rankId, name: command.name, sortOrder: command.sortOrder, permissions: command.permissions, version: nextVersion },
        requestHash,
        guardSql: "EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?11 AND battalion_id=?12 AND revision=?13 AND last_mutation_token=?14)",
        guardBindings: [rankId, context.battalion_id, nextVersion, requestHash],
      }),
      receiptStatement(env, actorUserId, command.commandId, operation, requestHash, response,
        "EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?6 AND battalion_id=?7 AND revision=?8 AND last_mutation_token=?9)",
        [rankId, context.battalion_id, nextVersion, requestHash]),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (uniqueness(error)) throw new BattalionAdminServiceError(409, "RANK_IDENTITY_CONFLICT", "Rank name or order is already in use.");
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

export async function deleteBattalionRank(
  env: Env,
  actorUserId: string,
  rankId: string,
  command: DeleteBattalionRankCommand,
): Promise<BattalionAdministrationMutationDto> {
  const operation = "DELETE_BATTALION_RANK" as const;
  const requestHash = await commandHash({ actorUserId, operation, rankId, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId);
  const current = await managedRank(env, context.battalion_id, rankId);
  if (current.revision !== command.expectedVersion) {
    throw new BattalionAdminServiceError(409, "RANK_REVISION_CONFLICT", "Rank changed since it was opened.");
  }
  if (current.member_count || current.recruitment_reference_count || current.invitation_reference_count) {
    throw new BattalionAdminServiceError(409, "RANK_IN_USE", "Reassign members and recruitment or invitation references before deleting this rank.");
  }
  const response: BattalionAdministrationMutationDto = {
    operation,
    battalionId: context.battalion_id,
    rankId,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE battalion_ranks SET last_mutation_token=?1,updated_at=unixepoch()
        WHERE id=?2 AND battalion_id=?3 AND revision=?4`)
        .bind(requestHash, rankId, context.battalion_id, current.revision),
      eventStatement(env, {
        eventType: "BATTALION_RANK_DELETED",
        battalionId: context.battalion_id,
        actorUserId,
        subjectType: "RANK",
        subjectId: rankId,
        summary: "An unused Battalion rank was deleted.",
        payload: { rankId, name: current.name },
        requestHash,
        guardSql: "EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?11 AND battalion_id=?12 AND revision=?13 AND last_mutation_token=?14)",
        guardBindings: [rankId, context.battalion_id, current.revision, requestHash],
      }),
      receiptStatement(env, actorUserId, command.commandId, operation, requestHash, response,
        "EXISTS (SELECT 1 FROM battalion_ranks WHERE id=?6 AND battalion_id=?7 AND revision=?8 AND last_mutation_token=?9)",
        [rankId, context.battalion_id, current.revision, requestHash]),
      env.DB.prepare(`DELETE FROM battalion_ranks
        WHERE id=?1 AND battalion_id=?2 AND revision=?3 AND last_mutation_token=?4`)
        .bind(rankId, context.battalion_id, current.revision, requestHash),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    if (String(error).includes("FOREIGN KEY")) throw new BattalionAdminServiceError(409, "RANK_IN_USE", "Rank is still referenced and cannot be deleted.");
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

export async function assignBattalionMemberRank(
  env: Env,
  actorUserId: string,
  command: AssignBattalionMemberRankCommand,
): Promise<BattalionAdministrationMutationDto> {
  const operation = "ASSIGN_BATTALION_MEMBER_RANK" as const;
  const requestHash = await commandHash({ actorUserId, operation, command });
  const prior = await replay(env, actorUserId, command.commandId, operation, requestHash);
  if (prior) return prior;
  const context = await actor(env, actorUserId);
  const member = await getManagedBattalionMember(env.DB, context.battalion_id, command.targetUserId);
  if (!member || member.status !== "ACTIVE") {
    throw new BattalionAdminServiceError(404, "MEMBER_NOT_FOUND", "Active member was not found in the selected Battalion.");
  }
  if (member.revision !== command.expectedMembershipRevision) {
    throw new BattalionAdminServiceError(409, "MEMBERSHIP_REVISION_CONFLICT", "Membership changed since it was opened.");
  }
  const rank = await managedRank(env, context.battalion_id, command.rankId);
  if (rank.revision !== command.expectedRankVersion) {
    throw new BattalionAdminServiceError(409, "RANK_REVISION_CONFLICT", "Rank changed since it was opened.");
  }
  const rankPermissions = new Set(parseJson<string[]>(rank.permissions_json, []));
  if ((member.command_role !== "PLAYER" || member.user_id === actorUserId) && !rankPermissions.has("RANK_MANAGE")) {
    throw new BattalionAdminServiceError(409, "COMMAND_RANK_REQUIRED", "Battalion command and the acting rank manager must retain RANK_MANAGE.");
  }
  const nextRevision = member.revision + 1;
  const response: BattalionAdministrationMutationDto = {
    operation,
    battalionId: context.battalion_id,
    rankId: rank.id,
    rankVersion: rank.revision,
    targetUserId: member.user_id,
    membershipRevision: nextRevision,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE battalion_memberships
        SET rank_id=?1,revision=revision+1,updated_at=unixepoch(),last_rank_mutation_token=?2
        WHERE battalion_id=?3 AND user_id=?4 AND status='ACTIVE' AND revision=?5
          AND EXISTS (SELECT 1 FROM battalion_ranks
            WHERE id=?1 AND battalion_id=?3 AND revision=?6)`)
        .bind(rank.id, requestHash, context.battalion_id, member.user_id, member.revision, rank.revision),
      eventStatement(env, {
        eventType: "BATTALION_MEMBER_RANK_ASSIGNED",
        battalionId: context.battalion_id,
        actorUserId,
        subjectType: "USER",
        subjectId: member.user_id,
        summary: "A Battalion member rank was assigned.",
        payload: { targetUserId: member.user_id, rankId: rank.id, membershipRevision: nextRevision },
        requestHash,
        guardSql: "EXISTS (SELECT 1 FROM battalion_memberships WHERE battalion_id=?11 AND user_id=?12 AND revision=?13 AND last_rank_mutation_token=?14)",
        guardBindings: [context.battalion_id, member.user_id, nextRevision, requestHash],
      }),
      receiptStatement(env, actorUserId, command.commandId, operation, requestHash, response,
        "EXISTS (SELECT 1 FROM battalion_memberships WHERE battalion_id=?6 AND user_id=?7 AND revision=?8 AND last_rank_mutation_token=?9)",
        [context.battalion_id, member.user_id, nextRevision, requestHash]),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, operation, requestHash);
    if (raced) return raced;
    throw error;
  }
  return committed(env, actorUserId, command.commandId, operation, requestHash);
}

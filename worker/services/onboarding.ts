import type {
  ActiveOnboardingBattalionDto,
  BattalionDirectoryEntryDto,
  BattalionInvitationDto,
  BattalionPermission,
  OnboardingStatusDto,
  StarterUnitOptionDto,
} from "../../packages/domain/src";
import { getTacticalUnitClass } from "../../packages/rules-engine/src";
import { V5_CORE_CURATED_2_CONTENT_HASH } from "../../packages/rules-engine/src/generated/v5-core-curated-2";
import type { Env } from "../env";
import type {
  CompleteOnboardingCommand,
  CreateBattalionCommand,
  GrantStarterUnitCommand,
  InviteBattalionMemberCommand,
  JoinBattalionCommand,
  RespondBattalionInviteCommand,
  UpdateBattalionRecruitmentCommand,
} from "../onboarding-validation";
import { onboardingCommandHash } from "../onboarding-validation";
import {
  getActiveOnboardingBattalion,
  getActorBattalionAuthority,
  getCodeJoinAuthority,
  getInvitationJoinAuthority,
  getInviteTarget,
  getOnboardingPolicy,
  getOnboardingProgress,
  getOnboardingReceipt,
  getPublicJoinAuthority,
  getStarterDefinition,
  getStarterGrant,
  listPendingInvitations,
  listPublicBattalions,
  listStarterDefinitions,
  type ActiveBattalionRow,
  type BattalionRecruitmentRow,
  type InvitationRow,
  type JoinAuthorityRow,
  type OnboardingReceiptRow,
  type StarterDefinitionRow,
} from "../repositories/onboarding";
import { invitationDeliveryJobStatement, type InvitationSource } from "../repositories/security-operations";
import {
  GENERIC_INVITATION_RESPONSE,
  InvitationSecurityError,
  enforceInvitationRateLimit,
  invitationSecurityAuditStatement,
  invitationSecurityContext,
} from "./security-operations";

const POLICY_ID = "production-onboarding-v1";
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class OnboardingServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function randomCode(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function permissions(value: string | null): BattalionPermission[] {
  if (!value) return [];
  return [...new Set(value.split(",").filter(Boolean))] as BattalionPermission[];
}

function directory(row: BattalionRecruitmentRow): BattalionDirectoryEntryDto {
  const memberCount = Number(row.member_count);
  const memberCapacity = Number(row.member_capacity);
  return {
    battalionId: row.battalion_id,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    motto: row.motto,
    recruitmentKind: row.recruitment_kind,
    accessPolicy: row.access_policy,
    engagementSummary: row.engagement_summary,
    memberCount,
    memberCapacity,
    openSpots: Math.max(0, memberCapacity - memberCount),
  };
}

function activeBattalion(row: ActiveBattalionRow | null): ActiveOnboardingBattalionDto | null {
  return row ? {
    ...directory(row),
    settingsRevision: Number(row.revision),
    permissions: permissions(row.permissions),
    joinEnabled: row.join_enabled === 1,
  } : null;
}

function invitation(row: InvitationRow): BattalionInvitationDto {
  return {
    invitationId: row.invitation_id,
    battalionId: row.battalion_id,
    battalionName: row.battalion_name,
    invitedBy: row.invited_by,
    message: row.message,
    expiresAt: row.expires_at,
    source: row.source,
  };
}

function starter(row: StarterDefinitionRow): StarterUnitOptionDto {
  const definition = getTacticalUnitClass(row.id);
  const summaries: Record<string, string> = {
    "unit-infantry-squad": "Flexible personnel formation with direct fire, movement, and facing fully available in the foundation rules.",
    "unit-light-vehicle": "Fast mobile weapons platform with vehicle durability and a base rapid-fire mount.",
    "unit-main-battle-tank": "Armoured direct-fire platform with rear-arc and armour-piercing combat support.",
  };
  return {
    definitionId: row.id,
    name: definition.name,
    category: definition.category,
    healthModel: definition.stats.healthModel,
    maximumHealth: definition.stats.maxHealth,
    armor: definition.stats.armor,
    speed: definition.stats.speed,
    summary: summaries[row.id] ?? "Executable starter formation.",
  };
}

function replayReceipt(row: OnboardingReceiptRow | null, operation: string, requestHash: string): unknown | undefined {
  if (!row) return undefined;
  if (row.operation !== operation || row.request_hash !== requestHash) {
    throw new OnboardingServiceError(409, "COMMAND_ID_REUSED", "commandId was already used for a different onboarding command.");
  }
  return JSON.parse(row.response_json) as unknown;
}

async function committedReceipt(env: Env, userId: string, commandId: string, operation: string, requestHash: string): Promise<unknown | undefined> {
  return replayReceipt(await getOnboardingReceipt(env.DB, userId, commandId), operation, requestHash);
}

export async function getOnboardingStatus(env: Env, userId: string): Promise<OnboardingStatusDto> {
  const [progress, policy, currentBattalion, battalions, invites, definitions, grant] = await Promise.all([
    getOnboardingProgress(env.DB, userId),
    getOnboardingPolicy(env.DB, userId),
    getActiveOnboardingBattalion(env.DB, userId),
    listPublicBattalions(env.DB),
    listPendingInvitations(env.DB, userId),
    listStarterDefinitions(env.DB),
    getStarterGrant(env.DB, userId),
  ]);
  if (!policy) throw new OnboardingServiceError(503, "ONBOARDING_NOT_CONFIGURED", "Onboarding policy is not configured.");
  const balance = Number(policy.balance);
  const alreadyUsed = policy.charter_battalion_id !== null;
  const required = progress?.status === "IN_PROGRESS";
  const step = progress?.current_step ?? "COMPLETE";
  return {
    required,
    status: progress?.status ?? "NOT_ENROLLED",
    step,
    progressRevision: progress?.revision,
    charter: {
      balance,
      grantAmount: Number(policy.starter_charter_grant),
      creationCost: Number(policy.battalion_creation_cost),
      canCreate: !alreadyUsed && balance >= Number(policy.battalion_creation_cost),
      alreadyUsed,
    },
    activeBattalion: activeBattalion(currentBattalion),
    publicBattalions: battalions.map(directory),
    invitations: invites.map(invitation),
    starterUnits: definitions.map(starter),
    firstUnit: grant ? {
      unitId: grant.player_unit_id,
      name: grant.name,
      callsign: grant.callsign,
      definitionId: grant.definition_id,
    } : null,
  };
}

function joinResponse(authority: JoinAuthorityRow): Record<string, unknown> {
  return {
    joined: true,
    battalion: { battalionId: authority.battalion_id, name: authority.battalion_name },
    nextStep: "UNIT",
  };
}

async function joinAuthority(env: Env, userId: string, command: JoinBattalionCommand): Promise<JoinAuthorityRow | null> {
  if (command.battalionId) return getPublicJoinAuthority(env.DB, command.battalionId);
  if (command.invitationId) return getInvitationJoinAuthority(env.DB, userId, command.invitationId);
  return getCodeJoinAuthority(env.DB, userId, await sha256(command.inviteCode ?? ""));
}

export async function joinBattalion(
  env: Env,
  userId: string,
  command: JoinBattalionCommand,
  operation = "JOIN_BATTALION",
): Promise<unknown> {
  const requestHash = await onboardingCommandHash({ userId, ...command, operation });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  const authority = await joinAuthority(env, userId, command);
  if (!authority) throw new OnboardingServiceError(404, "BATTALION_NOT_JOINABLE", "This Battalion or invitation is not available.");
  if (Number(authority.member_count) >= Number(authority.member_capacity)) {
    throw new OnboardingServiceError(409, "BATTALION_FULL", "This Battalion has no open command billets.");
  }
  const response = joinResponse(authority);
  const ownerNamespace = (await onboardingCommandHash(userId)).slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  const statements: D1PreparedStatement[] = [];
  if (authority.source === "ACCOUNT") {
    statements.push(env.DB.prepare(`UPDATE battalion_invites SET status='ACCEPTED',responded_at=?1,revision=revision+1
      WHERE id=?2 AND invited_user_id=?3 AND status='PENDING'
        AND (expires_at IS NULL OR expires_at>?1)`).bind(now, authority.invitation_id, userId));
  } else if (authority.source === "EMAIL") {
    statements.push(env.DB.prepare(`UPDATE battalion_email_invites SET status='ACCEPTED',responded_at=?1,revision=revision+1
      WHERE id=?2 AND recipient_email=(SELECT email FROM users WHERE id=?3) COLLATE NOCASE
        AND status='PENDING' AND expires_at>?1`).bind(now, authority.invitation_id, userId));
  }
  statements.push(
    env.DB.prepare(`INSERT INTO battalion_memberships (
        battalion_id,user_id,rank_id,status,command_role,joined_at,
        status_changed_at,left_at,revision,updated_at
      ) SELECT settings.battalion_id,?1,?2,'ACTIVE','PLAYER',?3,?3,NULL,1,?3
          FROM battalion_recruitment_settings AS settings
         WHERE settings.battalion_id=?4 AND settings.join_enabled=1
           AND ((SELECT COUNT(*) FROM battalion_memberships AS members
                  WHERE members.battalion_id=settings.battalion_id AND members.status='ACTIVE') < settings.member_capacity
                OR EXISTS (SELECT 1 FROM battalion_memberships AS own
                  WHERE own.battalion_id=settings.battalion_id AND own.user_id=?1 AND own.status='ACTIVE'))
           AND (?5='PUBLIC' AND settings.access_policy='PUBLIC'
                OR ?5='CODE' AND settings.invite_code_hash=?6
                OR ?5 IN ('ACCOUNT','EMAIL') AND EXISTS (
                  SELECT 1 FROM battalion_invites AS account_invites
                   WHERE account_invites.id=?7 AND account_invites.invited_user_id=?1 AND account_invites.status='ACCEPTED'
                  UNION ALL
                  SELECT 1 FROM battalion_email_invites AS email_invites
                   WHERE email_invites.id=?7 AND email_invites.recipient_email=(SELECT email FROM users WHERE id=?1) COLLATE NOCASE
                     AND email_invites.status='ACCEPTED'))
      ON CONFLICT(battalion_id,user_id) DO UPDATE SET
        rank_id=excluded.rank_id,status='ACTIVE',command_role='PLAYER',
        status_changed_at=excluded.status_changed_at,left_at=NULL,
        revision=battalion_memberships.revision+1,updated_at=excluded.updated_at`)
      .bind(userId, authority.recruitment_rank_id, now, authority.battalion_id,
        authority.source, authority.source === "CODE" ? await sha256(command.inviteCode ?? "") : "", authority.invitation_id),
    env.DB.prepare(`INSERT INTO user_active_battalions (user_id,battalion_id,selected_at,revision)
      SELECT ?1,?2,?3,1 WHERE EXISTS (
        SELECT 1 FROM battalion_memberships WHERE user_id=?1 AND battalion_id=?2 AND status='ACTIVE')
      ON CONFLICT(user_id) DO UPDATE SET battalion_id=excluded.battalion_id,
        selected_at=excluded.selected_at,revision=user_active_battalions.revision+1`).bind(userId, authority.battalion_id, now),
    env.DB.prepare(`UPDATE onboarding_progress SET current_step='UNIT',revision=revision+1
      WHERE user_id=?1 AND status='IN_PROGRESS' AND current_step='BATTALION'
        AND EXISTS (SELECT 1 FROM battalion_memberships WHERE user_id=?1 AND battalion_id=?2 AND status='ACTIVE')`)
      .bind(userId, authority.battalion_id),
    env.DB.prepare(`INSERT INTO strategic_events (
        event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
        summary,payload_json,event_hash,idempotency_key,occurred_at
      ) SELECT ?1,'BATTALION_MEMBER_JOINED',?2,?3,'BATTALION','USER',?3,
               'A commander joined the Battalion.',?4,?5,?6,?7
          WHERE EXISTS (SELECT 1 FROM battalion_memberships
            WHERE battalion_id=?2 AND user_id=?3 AND status='ACTIVE')`)
      .bind(`event:onboarding:${ownerNamespace}:${command.commandId}`, authority.battalion_id, userId,
        JSON.stringify({ source: authority.source }), requestHash,
        `onboarding:event:${ownerNamespace}:${command.commandId}`, now),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (
        user_id,command_id,operation,request_hash,response_json
      ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM battalion_memberships WHERE user_id=?1 AND battalion_id=?6 AND status='ACTIVE')`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), authority.battalion_id),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await committedReceipt(env, userId, command.commandId, operation, requestHash);
    if (raced) return raced;
    throw error;
  }
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(409, "BATTALION_JOIN_CONFLICT", "Battalion membership changed while joining.");
  return committed;
}

export async function createBattalion(env: Env, userId: string, command: CreateBattalionCommand): Promise<unknown> {
  const operation = "CREATE_BATTALION";
  const requestHash = await onboardingCommandHash({ userId, ...command });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  const policy = await getOnboardingPolicy(env.DB, userId);
  if (!policy) throw new OnboardingServiceError(503, "ONBOARDING_NOT_CONFIGURED", "Onboarding policy is not configured.");
  if (policy.charter_battalion_id) throw new OnboardingServiceError(409, "BATTALION_CHARTER_USED", "This account has already chartered a Battalion.");
  if (Number(policy.balance) < Number(policy.battalion_creation_cost)) throw new OnboardingServiceError(422, "REQUISITION_INSUFFICIENT", "The command charter requires more Requisition.");
  const ownerNamespace = (await onboardingCommandHash(userId)).slice(0, 16);
  const battalionId = `battalion-${requestHash.slice(0, 24)}`;
  const commanderRankId = `rank-${requestHash.slice(0, 20)}-command`;
  const recruitRankId = `rank-${requestHash.slice(0, 20)}-member`;
  const inviteCode = randomCode();
  const inviteCodeHash = await sha256(inviteCode);
  const price = Number(policy.battalion_creation_cost);
  const requisitionId = `req:charter:${ownerNamespace}:${command.commandId}`;
  const response = {
    created: true,
    battalion: { battalionId, name: command.name, accessPolicy: command.accessPolicy },
    inviteCode,
    requisitionSpent: price,
    nextStep: "UNIT",
  };
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    env.DB.prepare(`INSERT INTO requisition_transactions (
        id,user_id,amount,reason_code,description,related_entity_type,related_entity_id,idempotency_key
      ) SELECT ?1,?2,-policies.battalion_creation_cost,'BATTALION_CHARTER',?3,'BATTALION',?4,?5
          FROM onboarding_economy_policies AS policies
         WHERE policies.id=?6
           AND NOT EXISTS (SELECT 1 FROM battalion_creation_charters WHERE user_id=?2)
           AND (SELECT COALESCE(SUM(amount),0) FROM requisition_transactions WHERE user_id=?2) >= policies.battalion_creation_cost`)
      .bind(requisitionId, userId, `Chartered ${command.name}.`, battalionId,
        `battalion-charter:${ownerNamespace}:${command.commandId}`, POLICY_ID),
    env.DB.prepare(`INSERT INTO battalions (
        id,name,short_name,description,motto,created_by,status,revision,created_at,updated_at
      ) SELECT ?1,?2,?3,?4,?5,?6,'ACTIVE',1,?7,?7
          WHERE EXISTS (SELECT 1 FROM requisition_transactions WHERE id=?8 AND user_id=?6)`)
      .bind(battalionId, command.name, command.shortName ?? null, command.description, command.motto, userId, now, requisitionId),
    env.DB.prepare(`INSERT INTO battalion_ranks (id,battalion_id,name,precedence,revision,created_at,updated_at)
      SELECT ?1,?2,'Commanding Officer',1,1,?3,?3 WHERE EXISTS (SELECT 1 FROM battalions WHERE id=?2)
      UNION ALL SELECT ?4,?2,'Commander',100,1,?3,?3 WHERE EXISTS (SELECT 1 FROM battalions WHERE id=?2)`)
      .bind(commanderRankId, battalionId, now, recruitRankId),
    env.DB.prepare(`INSERT INTO rank_permissions (rank_id,permission)
      SELECT ?1,permission FROM battalion_permission_definitions
      WHERE permission IN ('BATTALION_EDIT','MEMBER_INVITE') AND implementation_status='ACTIVE'`)
      .bind(commanderRankId),
    env.DB.prepare(`INSERT INTO battalion_memberships (
        battalion_id,user_id,rank_id,status,command_role,joined_at,status_changed_at,revision,updated_at
      ) SELECT ?1,?2,?3,'ACTIVE','BATTALION_COMMAND',?4,?4,1,?4
          WHERE EXISTS (SELECT 1 FROM battalions WHERE id=?1 AND created_by=?2)`)
      .bind(battalionId, userId, commanderRankId, now),
    env.DB.prepare(`INSERT INTO battalion_recruitment_settings (
        battalion_id,recruitment_kind,access_policy,join_enabled,engagement_summary,
        recruitment_rank_id,invite_code_hash,member_capacity,creation_cost,revision,updated_at
      ) SELECT ?1,'PLAYER',?2,1,?3,?4,?5,64,?6,1,?7
          WHERE EXISTS (SELECT 1 FROM battalions WHERE id=?1 AND created_by=?8)`)
      .bind(battalionId, command.accessPolicy, command.engagementSummary, recruitRankId,
        inviteCodeHash, price, now, userId),
    env.DB.prepare(`INSERT INTO user_active_battalions (user_id,battalion_id,selected_at,revision)
      SELECT ?1,?2,?3,1 WHERE EXISTS (
        SELECT 1 FROM battalion_memberships WHERE user_id=?1 AND battalion_id=?2 AND status='ACTIVE')
      ON CONFLICT(user_id) DO UPDATE SET battalion_id=excluded.battalion_id,
        selected_at=excluded.selected_at,revision=user_active_battalions.revision+1`).bind(userId, battalionId, now),
    env.DB.prepare(`INSERT INTO battalion_creation_charters (
        user_id,battalion_id,requisition_cost,requisition_transaction_id,created_at
      ) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM battalion_recruitment_settings WHERE battalion_id=?2)`)
      .bind(userId, battalionId, price, requisitionId, now),
    env.DB.prepare(`UPDATE onboarding_progress SET current_step='UNIT',revision=revision+1
      WHERE user_id=?1 AND status='IN_PROGRESS' AND current_step='BATTALION'
        AND EXISTS (SELECT 1 FROM battalion_creation_charters WHERE user_id=?1 AND battalion_id=?2)`)
      .bind(userId, battalionId),
    env.DB.prepare(`INSERT INTO strategic_events (
        event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
        summary,payload_json,event_hash,idempotency_key,occurred_at
      ) SELECT ?1,'BATTALION_CHARTERED',?2,?3,'BATTALION','BATTALION',?2,
               'The Battalion charter was commissioned.',?4,?5,?6,?7
          WHERE EXISTS (SELECT 1 FROM battalion_creation_charters WHERE user_id=?3 AND battalion_id=?2)`)
      .bind(`event:onboarding:${ownerNamespace}:${command.commandId}`, battalionId, userId,
        JSON.stringify({ accessPolicy: command.accessPolicy, requisitionSpent: price }), requestHash,
        `onboarding:event:${ownerNamespace}:${command.commandId}`, now),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (user_id,command_id,operation,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM battalion_creation_charters WHERE user_id=?1 AND battalion_id=?6)`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), battalionId),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await committedReceipt(env, userId, command.commandId, operation, requestHash);
    if (raced) return raced;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) throw new OnboardingServiceError(409, "BATTALION_NAME_UNAVAILABLE", "That Battalion name or short name is unavailable.");
    throw error;
  }
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(409, "BATTALION_CREATE_CONFLICT", "Battalion charter could not be committed exactly once.");
  return committed;
}

export async function updateBattalionRecruitment(
  env: Env,
  userId: string,
  command: UpdateBattalionRecruitmentCommand,
): Promise<unknown> {
  const operation = "UPDATE_BATTALION_RECRUITMENT";
  const requestHash = await onboardingCommandHash({ userId, ...command });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  const authority = await getActorBattalionAuthority(env.DB, userId);
  if (!authority || !permissions(authority.permissions).includes("BATTALION_EDIT")) {
    throw new OnboardingServiceError(404, "BATTALION_NOT_FOUND", "Editable Battalion context was not found.");
  }
  const response = {
    updated: true,
    battalionId: authority.battalion_id,
    accessPolicy: command.accessPolicy,
    joinEnabled: command.joinEnabled,
    engagementSummary: command.engagementSummary,
    revision: command.expectedRevision + 1,
  };
  const ownerNamespace = (await onboardingCommandHash(userId)).slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`UPDATE battalion_recruitment_settings SET
        access_policy=?1,join_enabled=?2,engagement_summary=?3,
        revision=revision+1,updated_at=unixepoch()
      WHERE battalion_id=?4 AND revision=?5 AND EXISTS (
        SELECT 1 FROM user_active_battalions AS active
        JOIN battalion_memberships AS membership
          ON membership.user_id=active.user_id AND membership.battalion_id=active.battalion_id AND membership.status='ACTIVE'
        JOIN rank_permissions AS permission ON permission.rank_id=membership.rank_id AND permission.permission='BATTALION_EDIT'
        JOIN battalion_permission_definitions AS definition
          ON definition.permission=permission.permission AND definition.implementation_status='ACTIVE'
        WHERE active.user_id=?6 AND active.battalion_id=?4)`)
      .bind(command.accessPolicy, command.joinEnabled ? 1 : 0, command.engagementSummary,
        authority.battalion_id, command.expectedRevision, userId),
    env.DB.prepare(`INSERT INTO strategic_events (
        event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
        summary,payload_json,event_hash,idempotency_key,occurred_at
      ) SELECT ?1,'BATTALION_RECRUITMENT_UPDATED',?2,?3,'BATTALION','BATTALION',?2,
               'Battalion recruitment settings were updated.',?4,?5,?6,?7
          WHERE EXISTS (SELECT 1 FROM battalion_recruitment_settings
            WHERE battalion_id=?2 AND revision=?8)`)
      .bind(`event:onboarding:${ownerNamespace}:${command.commandId}`, authority.battalion_id, userId,
        JSON.stringify({ accessPolicy: command.accessPolicy, joinEnabled: command.joinEnabled }),
        requestHash, `onboarding:event:${ownerNamespace}:${command.commandId}`, now,
        command.expectedRevision + 1),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (user_id,command_id,operation,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM battalion_recruitment_settings WHERE battalion_id=?6 AND revision=?7)`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), authority.battalion_id, command.expectedRevision + 1),
  ]);
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(409, "BATTALION_REVISION_CONFLICT", "Recruitment settings changed before this update committed.");
  return committed;
}

export async function inviteBattalionMember(
  env: Env,
  userId: string,
  command: InviteBattalionMemberCommand,
  request: Request,
): Promise<{ response: unknown; deliveryQueued: boolean }> {
  const operation = "INVITE_BATTALION_MEMBER";
  const requestHash = await onboardingCommandHash({ userId, ...command });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return { response: replay, deliveryQueued: false };
  const now = Math.floor(Date.now() / 1000);
  let securityContext;
  try {
    securityContext = await invitationSecurityContext(request, env, `${command.targetType}:${command.target}`);
    await enforceInvitationRateLimit(env, {
      actorUserId: userId,
      context: securityContext,
      scopes: ["ACTOR", "IP"],
      now,
    });
  } catch (error) {
    if (error instanceof InvitationSecurityError) throw new OnboardingServiceError(error.status, error.code, error.message);
    throw error;
  }
  const ineligible = async (reasonCode: string, battalionId?: string): Promise<{ response: unknown; deliveryQueued: false }> => {
    await env.DB.batch([
      invitationSecurityAuditStatement(env, {
        actorUserId: userId,
        battalionId,
        context: securityContext,
        outcome: "REJECTED",
        reasonCode,
        metadata: { targetType: command.targetType },
        now,
      }),
      env.DB.prepare(`INSERT INTO onboarding_command_receipts (
          user_id,command_id,operation,request_hash,response_json,created_at
        ) VALUES (?1,?2,?3,?4,?5,?6)
        ON CONFLICT(user_id,command_id) DO NOTHING`)
        .bind(userId, command.commandId, operation, requestHash, JSON.stringify(GENERIC_INVITATION_RESPONSE), now),
    ]);
    const response = (await committedReceipt(env, userId, command.commandId, operation, requestHash))
      ?? GENERIC_INVITATION_RESPONSE;
    return { response, deliveryQueued: false };
  };
  const authority = await getActorBattalionAuthority(env.DB, userId);
  if (!authority || !permissions(authority.permissions).includes("MEMBER_INVITE")) {
    return ineligible("AUTHORITY_UNAVAILABLE");
  }
  try {
    await enforceInvitationRateLimit(env, {
      actorUserId: userId,
      battalionId: authority.battalion_id,
      context: securityContext,
      scopes: ["BATTALION", "RECIPIENT"],
      now,
    });
  } catch (error) {
    if (error instanceof InvitationSecurityError) {
      throw new OnboardingServiceError(error.status, error.code, error.message);
    }
    throw error;
  }
  const target = await getInviteTarget(env.DB, command.targetType, command.target);
  if (!target) return ineligible("TARGET_UNKNOWN", authority.battalion_id);
  if (target.user_id === userId) return ineligible("TARGET_SELF", authority.battalion_id);
  if (target.user_id) {
    const existingMember = await env.DB.prepare(`SELECT 1 FROM battalion_memberships
      WHERE battalion_id=?1 AND user_id=?2 AND status='ACTIVE' LIMIT 1`).bind(authority.battalion_id, target.user_id).first();
    if (existingMember) return ineligible("TARGET_ACTIVE_MEMBER", authority.battalion_id);
  }
  const invitationId = `battalion-invite-${requestHash.slice(0, 24)}`;
  const deliveryJobId = `invitation-delivery-${requestHash.slice(0, 24)}`;
  const expiresAt = now + INVITE_TTL_SECONDS;
  const source: InvitationSource = target.user_id ? "ACCOUNT" : "EMAIL";
  const inviteCode = source === "EMAIL" ? requestHash.slice(0, 16).toUpperCase() : undefined;
  const inviteCodeHash = inviteCode ? await sha256(inviteCode) : undefined;
  try {
    const invitationStatement = target.user_id
      ? env.DB.prepare(`INSERT INTO battalion_invites (
          id,battalion_id,invited_user_id,invited_by_user_id,rank_id,status,message,
          command_id,request_hash,created_at,expires_at,revision,delivery_status
        ) VALUES (?1,?2,?3,?4,?5,'PENDING',?6,?7,?8,?9,?10,1,'PENDING')`)
        .bind(invitationId, authority.battalion_id, target.user_id, userId,
          authority.recruitment_rank_id, command.message, command.commandId, requestHash, now, expiresAt)
      : env.DB.prepare(`INSERT INTO battalion_email_invites (
          id,battalion_id,recipient_email,invited_by_user_id,rank_id,token_hash,status,
          message,command_id,request_hash,created_at,expires_at,revision,delivery_status
        ) VALUES (?1,?2,?3,?4,?5,?6,'PENDING',?7,?8,?9,?10,?11,1,'PENDING')`)
        .bind(invitationId, authority.battalion_id, target.email, userId,
          authority.recruitment_rank_id, inviteCodeHash, command.message,
          command.commandId, requestHash, now, expiresAt);
    await env.DB.batch([
      invitationStatement,
      invitationDeliveryJobStatement(env.DB, {
        jobId: deliveryJobId,
        invitationId,
        invitationSource: source,
        nextAttemptAt: now,
        expiresAt,
        recipientHash: securityContext.recipientHash,
        ipHash: securityContext.ipHash,
        createdAt: now,
      }),
      invitationSecurityAuditStatement(env, {
        actorUserId: userId,
        battalionId: authority.battalion_id,
        context: securityContext,
        outcome: "ACCEPTED",
        reasonCode: "DELIVERY_QUEUED",
        metadata: { targetType: command.targetType, source },
        now,
      }),
      env.DB.prepare(`INSERT INTO onboarding_command_receipts (
          user_id,command_id,operation,request_hash,response_json,created_at
        ) VALUES (?1,?2,?3,?4,?5,?6)`)
        .bind(userId, command.commandId, operation, requestHash, JSON.stringify(GENERIC_INVITATION_RESPONSE), now),
    ]);
  } catch (error) {
    const prior = await env.DB.prepare(`SELECT request_hash FROM ${target.user_id ? "battalion_invites" : "battalion_email_invites"}
      WHERE invited_by_user_id=?1 AND command_id=?2 LIMIT 1`).bind(userId, command.commandId).first<{ request_hash: string }>();
    if (!prior || prior.request_hash !== requestHash) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        return ineligible("TARGET_PENDING_INVITATION", authority.battalion_id);
      }
      throw error;
    }
    const raced = await committedReceipt(env, userId, command.commandId, operation, requestHash);
    if (raced) return { response: raced, deliveryQueued: false };
    throw error;
  }
  const response = (await committedReceipt(env, userId, command.commandId, operation, requestHash))
    ?? GENERIC_INVITATION_RESPONSE;
  return { response, deliveryQueued: true };
}

export async function respondBattalionInvite(
  env: Env,
  userId: string,
  command: RespondBattalionInviteCommand,
): Promise<unknown> {
  if (command.decision === "ACCEPT") {
    return joinBattalion(env, userId, { commandId: command.commandId, invitationId: command.invitationId }, "RESPOND_BATTALION_INVITE");
  }
  const operation = "RESPOND_BATTALION_INVITE";
  const requestHash = await onboardingCommandHash({ userId, ...command, operation });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  const authority = await getInvitationJoinAuthority(env.DB, userId, command.invitationId);
  if (!authority) throw new OnboardingServiceError(404, "INVITATION_NOT_FOUND", "That invitation is no longer available.");
  const response = { declined: true, invitationId: command.invitationId };
  const ownerNamespace = (await onboardingCommandHash(userId)).slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`UPDATE battalion_invites SET status='DECLINED',responded_at=?1,revision=revision+1
      WHERE id=?2 AND invited_user_id=?3 AND status='PENDING'
        AND (expires_at IS NULL OR expires_at>?1)`).bind(now, command.invitationId, userId),
    env.DB.prepare(`UPDATE battalion_email_invites SET status='DECLINED',responded_at=?1,revision=revision+1
      WHERE id=?2 AND recipient_email=(SELECT email FROM users WHERE id=?3) COLLATE NOCASE
        AND status='PENDING' AND expires_at>?1`).bind(now, command.invitationId, userId),
    env.DB.prepare(`INSERT INTO strategic_events (
        event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
        summary,payload_json,event_hash,idempotency_key,occurred_at
      ) SELECT ?1,'BATTALION_INVITATION_DECLINED',?2,?3,'BATTALION','INVITATION',?4,
               'A commander declined a Battalion invitation.','{}',?5,?6,?7
          WHERE EXISTS (
            SELECT 1 FROM battalion_invites WHERE id=?4 AND invited_user_id=?3 AND status='DECLINED'
            UNION ALL SELECT 1 FROM battalion_email_invites
              WHERE id=?4 AND recipient_email=(SELECT email FROM users WHERE id=?3) COLLATE NOCASE
                AND status='DECLINED')`)
      .bind(`event:onboarding:${ownerNamespace}:${command.commandId}`, authority.battalion_id,
        userId, command.invitationId, requestHash,
        `onboarding:event:${ownerNamespace}:${command.commandId}`, now),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (user_id,command_id,operation,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM battalion_invites WHERE id=?6 AND invited_user_id=?1 AND status='DECLINED'
        UNION ALL SELECT 1 FROM battalion_email_invites
          WHERE id=?6 AND recipient_email=(SELECT email FROM users WHERE id=?1) COLLATE NOCASE AND status='DECLINED')`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), command.invitationId),
  ]);
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(404, "INVITATION_NOT_FOUND", "That invitation is no longer available.");
  return committed;
}

export async function grantStarterUnit(env: Env, userId: string, command: GrantStarterUnitCommand): Promise<unknown> {
  const operation = "GRANT_STARTER_UNIT";
  const requestHash = await onboardingCommandHash({ userId, ...command });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  if (await getStarterGrant(env.DB, userId)) throw new OnboardingServiceError(409, "STARTER_ALREADY_GRANTED", "This account already received its starter unit.");
  const active = await getActiveOnboardingBattalion(env.DB, userId);
  if (!active) throw new OnboardingServiceError(422, "BATTALION_REQUIRED", "Join or create a Battalion before creating a starter unit.");
  const definition = await getStarterDefinition(env.DB, command.definitionId);
  if (!definition) throw new OnboardingServiceError(422, "STARTER_CLASS_UNAVAILABLE", "That class is not available for the starter grant.");
  let governedDefinition;
  try {
    governedDefinition = getTacticalUnitClass(definition.id);
  } catch {
    throw new OnboardingServiceError(422, "STARTER_CLASS_UNAVAILABLE", "That class is not executable in the active rules catalogue.");
  }
  const ownerNamespace = (await onboardingCommandHash(userId)).slice(0, 16);
  const unitId = `unit-starter-${requestHash.slice(0, 20)}`;
  const response = {
    granted: true,
    unit: { unitId, definitionId: definition.id, name: command.name, callsign: command.callsign },
    acquisition: "ONBOARDING_STARTER_GRANT",
    requisitionSpent: 0,
    requisitionValueStatus: "BALANCE_REQUIRED",
    nextStep: "TOUR",
  };
  const baseStats = JSON.stringify({
    ...governedDefinition.stats,
    catalogueContentHash: V5_CORE_CURATED_2_CONTENT_HASH,
  });
  const statements = [
    env.DB.prepare(`INSERT INTO player_units (
        id,owner_id,ruleset_id,definition_id,callsign,name,status,current_health,
        base_stats_json,requisition_value,requisition_value_status,location_kind,
        location_state,description,version
      ) SELECT ?1,?2,?3,?4,?5,?6,'ACTIVE',?7,?8,0,'BALANCE_REQUIRED',
               'RESERVE','RESERVE','First command issued through guided enlistment.',1
          WHERE EXISTS (SELECT 1 FROM onboarding_progress
            WHERE user_id=?2 AND status='IN_PROGRESS' AND current_step='UNIT')
            AND EXISTS (SELECT 1 FROM user_active_battalions AS active
              JOIN battalion_memberships AS membership
                ON membership.user_id=active.user_id AND membership.battalion_id=active.battalion_id AND membership.status='ACTIVE'
              WHERE active.user_id=?2)
            AND NOT EXISTS (SELECT 1 FROM onboarding_starter_unit_grants WHERE user_id=?2)`)
      .bind(unitId, userId, definition.ruleset_id, definition.id, command.callsign, command.name,
        definition.max_health, baseStats),
    env.DB.prepare(`INSERT INTO player_unit_weapon_mounts (
        id,player_unit_id,ruleset_id,weapon_definition_id,source_kind,mount_role,mount_index,current_ammo
      ) SELECT ?1 || ':weapon:' || links.mount_role || ':' || links.mount_index,
               ?1,links.ruleset_id,links.weapon_definition_id,'BASE',links.mount_role,
               links.mount_index,weapons.ammo_capacity
          FROM unit_definition_weapons AS links
          JOIN weapon_definitions AS weapons
            ON weapons.id=links.weapon_definition_id AND weapons.ruleset_id=links.ruleset_id
         WHERE links.unit_definition_id=?2 AND links.ruleset_id=?3
           AND EXISTS (SELECT 1 FROM player_units WHERE id=?1 AND owner_id=?4)`)
      .bind(unitId, definition.id, definition.ruleset_id, userId),
    env.DB.prepare(`INSERT INTO player_unit_subsystems (player_unit_id,subsystem_type)
      SELECT ?1,subsystem_type FROM (SELECT 'WEAPONS' AS subsystem_type UNION ALL SELECT 'MOBILITY')
       WHERE EXISTS (SELECT 1 FROM player_units AS units
         JOIN unit_definition_profiles AS profiles
           ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
         JOIN durability_profile_definitions AS durability
           ON durability.id=profiles.durability_profile_id AND durability.ruleset_id=profiles.ruleset_id
         WHERE units.id=?1 AND units.owner_id=?2 AND durability.supports_subsystems=1)`)
      .bind(unitId, userId),
    env.DB.prepare(`INSERT INTO player_unit_loadouts (id,player_unit_id,name,loadout_kind,status,revision)
      SELECT ?1 || ':loadout:default',id,'Owned Default','OWNED_DEFAULT','ACTIVE',1
        FROM player_units WHERE id=?1 AND owner_id=?2`).bind(unitId, userId),
    env.DB.prepare(`INSERT INTO unit_cargo_manifests (carrier_unit_id,ruleset_id,cargo_profile_id,revision)
      SELECT units.id,units.ruleset_id,profiles.cargo_profile_id,1
        FROM player_units AS units JOIN unit_definition_profiles AS profiles
          ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
       WHERE units.id=?1 AND units.owner_id=?2 AND profiles.cargo_profile_id IS NOT NULL`)
      .bind(unitId, userId),
    env.DB.prepare(`INSERT INTO player_unit_supplies (
        player_unit_id,resource_type,current_quantity,maximum_quantity,revision
      ) SELECT units.id,capacity.key,0,CAST(json_extract(capacity.value,'$.maximum') AS INTEGER),1
          FROM player_units AS units JOIN unit_definition_profiles AS profiles
            ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
          JOIN supply_profile_definitions AS supplies
            ON supplies.id=profiles.supply_profile_id AND supplies.ruleset_id=profiles.ruleset_id
          JOIN json_each(supplies.capacities_json) AS capacity
         WHERE units.id=?1 AND units.owner_id=?2 AND json_type(capacity.value,'$.maximum')='integer'`)
      .bind(unitId, userId),
    env.DB.prepare(`INSERT INTO unit_service_summaries (
        player_unit_id,campaigns_completed,rounds_served,objectives_completed,units_destroyed,revision
      ) SELECT id,0,0,0,0,1 FROM player_units WHERE id=?1 AND owner_id=?2`).bind(unitId, userId),
    env.DB.prepare(`INSERT INTO battlegroups (
        id,battalion_id,name,objective,leader_user_id,persistent,status,updated_at
      ) SELECT ?1,active.battalion_id,?2,'First field command.',?3,1,'READY',unixepoch()
          FROM user_active_battalions AS active
         WHERE active.user_id=?3
           AND EXISTS (SELECT 1 FROM player_units WHERE id=?4 AND owner_id=?3)`)
      .bind(`battlegroup-starter:${unitId}`, `Starter Detachment ${unitId.slice(-8)}`, userId, unitId),
    env.DB.prepare(`INSERT INTO battlegroup_units (
        battlegroup_id,player_unit_id,delegated_command
      ) SELECT ?1,id,0 FROM player_units WHERE id=?2 AND owner_id=?3`)
      .bind(`battlegroup-starter:${unitId}`, unitId, userId),
    env.DB.prepare(`INSERT INTO unit_history (
        id,player_unit_id,event_type,summary,definition_id,payload_json,occurred_at,
        idempotency_key,actor_user_id,visibility
      ) SELECT ?1,id,'ONBOARDING_GRANTED',?2,definition_id,?3,unixepoch(),?4,owner_id,'OWNER'
          FROM player_units WHERE id=?5 AND owner_id=?6`)
      .bind(`history:${ownerNamespace}:${command.commandId}`, `${command.callsign} received its first command charter.`,
        JSON.stringify({ definitionId: definition.id, acquisition: "ONBOARDING_STARTER_GRANT", requisitionValueStatus: "BALANCE_REQUIRED" }),
        `starter-unit:${ownerNamespace}:${command.commandId}`, unitId, userId),
    env.DB.prepare(`INSERT INTO onboarding_starter_unit_grants (user_id,player_unit_id,definition_id,ruleset_id)
      SELECT owner_id,id,definition_id,ruleset_id FROM player_units WHERE id=?1 AND owner_id=?2`)
      .bind(unitId, userId),
    env.DB.prepare(`UPDATE onboarding_progress SET current_step='TOUR',revision=revision+1
      WHERE user_id=?1 AND status='IN_PROGRESS' AND current_step='UNIT'
        AND EXISTS (SELECT 1 FROM onboarding_starter_unit_grants WHERE user_id=?1 AND player_unit_id=?2)`)
      .bind(userId, unitId),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (user_id,command_id,operation,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM onboarding_starter_unit_grants WHERE user_id=?1 AND player_unit_id=?6)`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), unitId),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const raced = await committedReceipt(env, userId, command.commandId, operation, requestHash);
    if (raced) return raced;
    throw error;
  }
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(409, "STARTER_GRANT_CONFLICT", "Starter unit could not be granted exactly once.");
  return committed;
}

export async function completeOnboarding(env: Env, userId: string, command: CompleteOnboardingCommand): Promise<unknown> {
  const operation = "COMPLETE_ONBOARDING";
  const requestHash = await onboardingCommandHash({ userId, ...command });
  const replay = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (replay) return replay;
  const response = { complete: true, destination: "/?view=command" };
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`UPDATE onboarding_progress SET status='COMPLETE',current_step='COMPLETE',
        completed_at=?1,revision=revision+1
      WHERE user_id=?2 AND status='IN_PROGRESS' AND current_step='TOUR' AND revision=?3
        AND EXISTS (SELECT 1 FROM user_active_battalions WHERE user_id=?2)
        AND EXISTS (SELECT 1 FROM onboarding_starter_unit_grants WHERE user_id=?2)`)
      .bind(now, userId, command.expectedRevision),
    env.DB.prepare(`INSERT INTO onboarding_command_receipts (user_id,command_id,operation,request_hash,response_json)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
        SELECT 1 FROM onboarding_progress WHERE user_id=?1 AND status='COMPLETE' AND revision=?6)`)
      .bind(userId, command.commandId, operation, requestHash, JSON.stringify(response), command.expectedRevision + 1),
  ]);
  const committed = await committedReceipt(env, userId, command.commandId, operation, requestHash);
  if (!committed) throw new OnboardingServiceError(409, "ONBOARDING_REVISION_CONFLICT", "Onboarding changed before completion committed.");
  return committed;
}

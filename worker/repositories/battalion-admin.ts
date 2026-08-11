import type { Env } from "../env";

export interface BattalionAdminContextRow {
  battalion_id: string;
  actor_user_id: string;
  command_role: "PLAYER" | "BATTALION_COMMAND" | "ADMIN";
  permissions_json: string;
}

export interface ManagedBattalionRankRow {
  id: string;
  battalion_id: string;
  name: string;
  precedence: number;
  revision: number;
  member_count: number;
  command_member_count: number;
  recruitment_reference_count: number;
  invitation_reference_count: number;
  permissions_json: string;
}

export interface ManagedBattalionMemberRow {
  battalion_id: string;
  user_id: string;
  rank_id: string;
  command_role: "PLAYER" | "BATTALION_COMMAND" | "ADMIN";
  status: string;
  revision: number;
}

export interface BattalionPermissionDefinitionRow {
  permission: string;
  description: string;
}

export interface BattalionAdminReceiptRow {
  operation: string;
  request_hash: string;
  response_json: string;
}

export async function getBattalionAdminContext(
  db: Env["DB"],
  actorUserId: string,
): Promise<BattalionAdminContextRow | null> {
  return db.prepare(`SELECT selected.battalion_id, memberships.user_id AS actor_user_id,
      memberships.command_role,
      COALESCE((SELECT json_group_array(permissions.permission)
        FROM rank_permissions AS permissions
        JOIN battalion_permission_definitions AS definitions
          ON definitions.permission=permissions.permission
         AND definitions.implementation_status='ACTIVE'
       WHERE permissions.rank_id=memberships.rank_id), '[]') AS permissions_json
    FROM user_active_battalions AS selected
    JOIN battalion_memberships AS memberships
      ON memberships.battalion_id=selected.battalion_id
     AND memberships.user_id=selected.user_id
     AND memberships.status='ACTIVE'
   WHERE selected.user_id=?1
   LIMIT 1`).bind(actorUserId).first<BattalionAdminContextRow>();
}

export async function getManagedBattalionRank(
  db: Env["DB"],
  battalionId: string,
  rankId: string,
): Promise<ManagedBattalionRankRow | null> {
  return db.prepare(`SELECT ranks.id,ranks.battalion_id,ranks.name,ranks.precedence,ranks.revision,
      (SELECT COUNT(*) FROM battalion_memberships AS memberships WHERE memberships.rank_id=ranks.id) AS member_count,
      (SELECT COUNT(*) FROM battalion_memberships AS memberships
        WHERE memberships.rank_id=ranks.id AND memberships.status='ACTIVE'
          AND memberships.command_role IN ('BATTALION_COMMAND','ADMIN')) AS command_member_count,
      (SELECT COUNT(*) FROM battalion_recruitment_settings AS settings
        WHERE settings.recruitment_rank_id=ranks.id) AS recruitment_reference_count,
      ((SELECT COUNT(*) FROM battalion_invites AS invites WHERE invites.rank_id=ranks.id)
        + (SELECT COUNT(*) FROM battalion_email_invites AS invites WHERE invites.rank_id=ranks.id)) AS invitation_reference_count,
      COALESCE((SELECT json_group_array(permissions.permission)
        FROM rank_permissions AS permissions WHERE permissions.rank_id=ranks.id), '[]') AS permissions_json
    FROM battalion_ranks AS ranks
   WHERE ranks.id=?2 AND ranks.battalion_id=?1
   LIMIT 1`).bind(battalionId, rankId).first<ManagedBattalionRankRow>();
}

export async function getManagedBattalionMember(
  db: Env["DB"],
  battalionId: string,
  targetUserId: string,
): Promise<ManagedBattalionMemberRow | null> {
  return db.prepare(`SELECT battalion_id,user_id,rank_id,command_role,status,revision
    FROM battalion_memberships
   WHERE battalion_id=?1 AND user_id=?2
   LIMIT 1`).bind(battalionId, targetUserId).first<ManagedBattalionMemberRow>();
}

export async function listActiveBattalionPermissionDefinitions(
  db: Env["DB"],
): Promise<BattalionPermissionDefinitionRow[]> {
  const result = await db.prepare(`SELECT permission,description
    FROM battalion_permission_definitions
   WHERE implementation_status='ACTIVE'
   ORDER BY permission`).all<BattalionPermissionDefinitionRow>();
  return result.results;
}

export async function getBattalionAdminReceipt(
  db: Env["DB"],
  actorUserId: string,
  commandId: string,
): Promise<BattalionAdminReceiptRow | null> {
  return db.prepare(`SELECT operation,request_hash,response_json
    FROM battalion_administration_receipts
   WHERE actor_user_id=?1 AND command_id=?2
   LIMIT 1`).bind(actorUserId, commandId).first<BattalionAdminReceiptRow>();
}

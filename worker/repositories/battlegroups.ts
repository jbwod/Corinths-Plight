import type { Env } from "../env";

export interface BattlegroupActorRow {
  battalion_id: string;
  command_role: string;
  permissions_json: string;
}

export interface ManagedBattlegroupRow {
  id: string;
  battalion_id: string;
  name: string;
  callsign: string | null;
  objective: string;
  leader_user_id: string | null;
  status: string;
  revision: number;
}

export interface ManagedUnitRow {
  id: string;
  owner_id: string;
  status: string;
  location_state: string;
  current_battlegroup_id: string | null;
  movement_domain: string | null;
}

export interface BattlegroupReceiptRow {
  operation: string;
  request_hash: string;
  response_json: string;
}

export interface BattlegroupManagementUnitRow {
  battlegroup_id: string;
  unit_id: string;
  owner_id: string;
  delegated_command: number;
}

export async function getBattlegroupActor(db: Env["DB"], userId: string): Promise<BattlegroupActorRow | null> {
  return db.prepare(`SELECT active.battalion_id, memberships.command_role,
      COALESCE((SELECT json_group_array(permissions.permission)
        FROM rank_permissions AS permissions
        JOIN battalion_permission_definitions AS definitions
          ON definitions.permission=permissions.permission AND definitions.implementation_status='ACTIVE'
        WHERE permissions.rank_id=memberships.rank_id), '[]') AS permissions_json
    FROM user_active_battalions AS active
    JOIN battalion_memberships AS memberships
      ON memberships.battalion_id=active.battalion_id
     AND memberships.user_id=active.user_id
     AND memberships.status='ACTIVE'
    JOIN battalions ON battalions.id=active.battalion_id AND battalions.status='ACTIVE'
    WHERE active.user_id=?1 LIMIT 1`).bind(userId).first<BattlegroupActorRow>();
}

export async function getManagedBattlegroup(
  db: Env["DB"], battalionId: string, battlegroupId: string,
): Promise<ManagedBattlegroupRow | null> {
  return db.prepare(`SELECT id,battalion_id,name,callsign,objective,leader_user_id,status,revision
    FROM battlegroups WHERE id=?1 AND battalion_id=?2 LIMIT 1`)
    .bind(battlegroupId, battalionId).first<ManagedBattlegroupRow>();
}

export async function getManagedUnit(db: Env["DB"], unitId: string): Promise<ManagedUnitRow | null> {
  return db.prepare(`SELECT units.id,units.owner_id,units.status,units.location_state,
      links.battlegroup_id AS current_battlegroup_id,movement.domain AS movement_domain
    FROM player_units AS units
    LEFT JOIN battlegroup_units AS links ON links.player_unit_id=units.id
    LEFT JOIN unit_definition_profiles AS profiles
      ON profiles.unit_definition_id=units.definition_id AND profiles.ruleset_id=units.ruleset_id
    LEFT JOIN movement_profile_definitions AS movement
      ON movement.id=profiles.movement_profile_id AND movement.ruleset_id=profiles.ruleset_id
    WHERE units.id=?1 LIMIT 1`).bind(unitId).first<ManagedUnitRow>();
}

export async function activeBattalionMemberExists(
  db: Env["DB"], battalionId: string, userId: string,
): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS present FROM battalion_memberships
    WHERE battalion_id=?1 AND user_id=?2 AND status='ACTIVE' LIMIT 1`)
    .bind(battalionId, userId).first<{ present: number }>();
  return row?.present === 1;
}

export async function getBattlegroupReceipt(
  db: Env["DB"], actorUserId: string, commandId: string,
): Promise<BattlegroupReceiptRow | null> {
  return db.prepare(`SELECT operation,request_hash,response_json
    FROM battlegroup_mutation_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actorUserId, commandId).first<BattlegroupReceiptRow>();
}

export async function listManagedBattlegroups(
  db: Env["DB"], actorUserId: string, battalionId: string,
): Promise<ManagedBattlegroupRow[]> {
  const result = await db.prepare(`SELECT groups.id,groups.battalion_id,groups.name,groups.callsign,
      groups.objective,groups.leader_user_id,groups.status,groups.revision
    FROM battlegroups AS groups
    WHERE groups.battalion_id=?2 AND EXISTS (
      SELECT 1 FROM battalion_memberships WHERE battalion_id=groups.battalion_id
        AND user_id=?1 AND status='ACTIVE')
    ORDER BY groups.name,groups.id`).bind(actorUserId, battalionId).all<ManagedBattlegroupRow>();
  return result.results;
}

export async function listManagedBattlegroupUnits(
  db: Env["DB"], actorUserId: string, battalionId: string,
): Promise<BattlegroupManagementUnitRow[]> {
  const result = await db.prepare(`SELECT links.battlegroup_id,links.player_unit_id AS unit_id,
      units.owner_id,links.delegated_command
    FROM battlegroup_units AS links
    JOIN battlegroups AS groups ON groups.id=links.battlegroup_id
    JOIN player_units AS units ON units.id=links.player_unit_id
    WHERE groups.battalion_id=?2 AND EXISTS (
      SELECT 1 FROM battalion_memberships WHERE battalion_id=groups.battalion_id
        AND user_id=?1 AND status='ACTIVE')
    ORDER BY links.battlegroup_id,links.player_unit_id`).bind(actorUserId, battalionId).all<BattlegroupManagementUnitRow>();
  return result.results;
}

export async function activeBattlegroupDelegationExists(
  db: Env["DB"], ownerUserId: string, delegateUserId: string, battlegroupId: string, unitId: string,
): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS present FROM unit_order_delegations
    WHERE owner_user_id=?1 AND delegate_user_id=?2 AND battlegroup_id=?3
      AND player_unit_id=?4 AND scope_type='BATTLEGROUP' AND revoked_at IS NULL
      AND starts_at<=unixepoch() AND (ends_at IS NULL OR ends_at>unixepoch()) LIMIT 1`)
    .bind(ownerUserId, delegateUserId, battlegroupId, unitId).first<{ present: number }>();
  return row?.present === 1;
}

import type { Env } from "../env";

export interface PrimaryShipMutationRow {
  battalion_id: string;
  ship_id: string;
  name: string;
  registry: string | null;
  revision: number;
  status: string;
  permissions_json: string;
}

export interface ShipMutationReceiptRow {
  operation: string;
  request_hash: string;
  response_json: string;
}

export async function getPrimaryShipForMutation(
  db: Env["DB"],
  actorUserId: string,
): Promise<PrimaryShipMutationRow | null> {
  return db.prepare(`SELECT battalions.id AS battalion_id,ships.id AS ship_id,
      ships.name,ships.registry,ships.revision,ships.status,
      COALESCE((SELECT json_group_array(permissions.permission)
        FROM rank_permissions AS permissions
        JOIN battalion_permission_definitions AS definitions
          ON definitions.permission=permissions.permission
         AND definitions.implementation_status='ACTIVE'
       WHERE permissions.rank_id=memberships.rank_id), '[]') AS permissions_json
    FROM user_active_battalions AS selected
    JOIN battalion_memberships AS memberships
      ON memberships.battalion_id=selected.battalion_id
     AND memberships.user_id=selected.user_id AND memberships.status='ACTIVE'
    JOIN battalions ON battalions.id=selected.battalion_id AND battalions.status='ACTIVE'
    JOIN ships ON ships.id=battalions.primary_ship_id AND ships.battalion_id=battalions.id
   WHERE selected.user_id=?1
   LIMIT 1`).bind(actorUserId).first<PrimaryShipMutationRow>();
}

export async function getShipMutationReceipt(
  db: Env["DB"],
  actorUserId: string,
  commandId: string,
): Promise<ShipMutationReceiptRow | null> {
  return db.prepare(`SELECT operation,request_hash,response_json
    FROM ship_mutation_receipts WHERE actor_user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(actorUserId, commandId).first<ShipMutationReceiptRow>();
}

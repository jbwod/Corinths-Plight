import type { RenamePrimaryShipCommand, ShipIdentityMutationDto } from "../../packages/domain/src";
import { commandHash } from "../forces-validation";
import type { Env } from "../env";
import { getPrimaryShipForMutation, getShipMutationReceipt } from "../repositories/ship-admin";

export class ShipAdminServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function replay(
  env: Env,
  actorUserId: string,
  commandId: string,
  requestHash: string,
): Promise<ShipIdentityMutationDto | undefined> {
  const receipt = await getShipMutationReceipt(env.DB, actorUserId, commandId);
  if (!receipt) return undefined;
  if (receipt.operation !== "RENAME_PRIMARY_SHIP" || receipt.request_hash !== requestHash) {
    throw new ShipAdminServiceError(409, "IDEMPOTENCY_KEY_REUSED", "commandId was already used for different content.");
  }
  return parseJson<ShipIdentityMutationDto>(receipt.response_json, {
    operation: "RENAME_PRIMARY_SHIP",
    shipId: "unknown",
    battalionId: "unknown",
    name: "Unknown ship",
    registry: "UNKNOWN",
    version: 1,
  });
}

export async function renamePrimaryShip(
  env: Env,
  actorUserId: string,
  command: RenamePrimaryShipCommand,
): Promise<ShipIdentityMutationDto> {
  const requestHash = await commandHash({ actorUserId, operation: "RENAME_PRIMARY_SHIP", command });
  const prior = await replay(env, actorUserId, command.commandId, requestHash);
  if (prior) return prior;
  const current = await getPrimaryShipForMutation(env.DB, actorUserId);
  if (!current) throw new ShipAdminServiceError(404, "PRIMARY_SHIP_NOT_FOUND", "The active Battalion has no primary ship.");
  const permissions = new Set(parseJson<string[]>(current.permissions_json, []));
  if (!permissions.has("SHIP_CONFIGURE")) {
    throw new ShipAdminServiceError(403, "BATTALION_PERMISSION_REQUIRED", "SHIP_CONFIGURE permission is required.");
  }
  if (current.status === "DESTROYED") {
    throw new ShipAdminServiceError(409, "SHIP_DESTROYED", "Destroyed ships retain their final identity and cannot be renamed.");
  }
  if (current.revision !== command.expectedVersion) {
    throw new ShipAdminServiceError(409, "SHIP_VERSION_CONFLICT", "Ship identity changed since it was opened.", {
      expectedVersion: command.expectedVersion,
      currentVersion: current.revision,
    });
  }
  const response: ShipIdentityMutationDto = {
    operation: "RENAME_PRIMARY_SHIP",
    shipId: current.ship_id,
    battalionId: current.battalion_id,
    name: command.name,
    registry: command.registry,
    version: current.revision + 1,
  };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE ships SET name=?1,registry=?2,revision=revision+1,
          updated_at=unixepoch(),last_identity_mutation_token=?3
        WHERE id=?4 AND battalion_id=?5 AND revision=?6 AND status<>'DESTROYED'`)
        .bind(command.name, command.registry, requestHash, current.ship_id, current.battalion_id, current.revision),
      env.DB.prepare(`INSERT INTO strategic_events (
          event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
          summary,payload_json,event_hash,idempotency_key,occurred_at
        ) SELECT ?1,'SHIP_IDENTITY_CHANGED',?2,?3,'BATTALION','SHIP',?4,?5,?6,?7,?8,unixepoch()
          WHERE EXISTS (SELECT 1 FROM ships WHERE id=?4 AND battalion_id=?2
            AND revision=?9 AND name=?10 AND registry=?11 AND last_identity_mutation_token=?7)`)
        .bind(
          `event:ship-identity:${requestHash}`,
          current.battalion_id,
          actorUserId,
          current.ship_id,
          `${command.registry} received a new persistent ship identity.`,
          JSON.stringify({ shipId: current.ship_id, name: command.name, registry: command.registry, version: response.version }),
          requestHash,
          `ship-identity:${requestHash}`,
          response.version,
          command.name,
          command.registry,
        ),
      env.DB.prepare(`INSERT INTO ship_mutation_receipts (
          actor_user_id,command_id,operation,request_hash,response_json
        ) SELECT ?1,?2,'RENAME_PRIMARY_SHIP',?3,?4
          WHERE EXISTS (SELECT 1 FROM ships WHERE id=?5 AND battalion_id=?6
            AND revision=?7 AND name=?8 AND registry=?9 AND last_identity_mutation_token=?3)`)
        .bind(actorUserId, command.commandId, requestHash, JSON.stringify(response), current.ship_id,
          current.battalion_id, response.version, command.name, command.registry),
    ]);
  } catch (error) {
    const raced = await replay(env, actorUserId, command.commandId, requestHash);
    if (raced) return raced;
    if (String(error).includes("idx_ship_registry") || String(error).includes("ships.registry")) {
      throw new ShipAdminServiceError(409, "SHIP_REGISTRY_IN_USE", "That registry is already assigned to another ship.");
    }
    if (String(error).includes("battalion_id, name") || String(error).includes("ships.battalion_id")) {
      throw new ShipAdminServiceError(409, "SHIP_NAME_IN_USE", "That ship name is already in use in this Battalion.");
    }
    throw error;
  }
  const committed = await replay(env, actorUserId, command.commandId, requestHash);
  if (!committed) throw new ShipAdminServiceError(409, "SHIP_VERSION_CONFLICT", "Ship identity changed while the command was committed.");
  return committed;
}

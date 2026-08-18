import { authenticate, type AuthenticatedIdentity } from "../auth";
import {
  validateAssignBattlegroupUnit,
  validateCreateBattlegroup,
  validateRemoveBattlegroupUnit,
  validateSetBattlegroupDelegation,
  validateUpdateBattlegroup,
} from "../battlegroup-validation";
import type { Env } from "../env";
import { requestHasJsonContentType } from "../forces-validation";
import { errorResponse, json, readJson } from "../http";
import {
  assignBattlegroupUnit,
  BattlegroupServiceError,
  createBattlegroup,
  getBattlegroupManagement,
  removeBattlegroupUnit,
  setBattlegroupDelegation,
  updateBattlegroup,
} from "../services/battlegroups";
import type { ValidationResult } from "../forces-validation";

const id = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
const updatePath = new RegExp(`^/api/battlegroups/${id}/update$`);
const assignPath = new RegExp(`^/api/battlegroups/${id}/units/assign$`);
const removePath = new RegExp(`^/api/battlegroups/${id}/units/remove$`);
const delegationPath = new RegExp(`^/api/battlegroups/${id}/delegations$`);

function actorUserId(identity: AuthenticatedIdentity): string {
  return identity.kind === "DEMO" ? identity.viewer.userId : identity.userId;
}

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new BattlegroupServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 16_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new BattlegroupServiceError(413, "REQUEST_TOO_LARGE", "Request body exceeds 16 KB.");
    }
    throw new BattlegroupServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function value<T>(result: ValidationResult<T>): T {
  if (!result.valid) throw new BattlegroupServiceError(400, result.code, result.message);
  return result.value;
}

function isBattlegroupPath(pathname: string): boolean {
  return pathname === "/api/battlegroups" || pathname.startsWith("/api/battlegroups/");
}

export async function routeBattlegroupRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isBattlegroupPath(url.pathname)) return null;
  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for Battlegroup operations.");
    const userId = actorUserId(identity);
    if (url.pathname === "/api/battlegroups" && request.method === "GET") {
      return json(await getBattlegroupManagement(env, userId));
    }
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", { allowed: ["POST"] });
    }
    if (url.pathname === "/api/battlegroups") {
      return json(await createBattlegroup(env, userId, value(validateCreateBattlegroup(await body(request)))), { status: 201 });
    }
    const update = url.pathname.match(updatePath);
    if (update) return json(await updateBattlegroup(env, userId, update[1], value(validateUpdateBattlegroup(await body(request)))));
    const assign = url.pathname.match(assignPath);
    if (assign) return json(await assignBattlegroupUnit(env, userId, assign[1], value(validateAssignBattlegroupUnit(await body(request)))));
    const remove = url.pathname.match(removePath);
    if (remove) return json(await removeBattlegroupUnit(env, userId, remove[1], value(validateRemoveBattlegroupUnit(await body(request)))));
    const delegation = url.pathname.match(delegationPath);
    if (delegation) return json(await setBattlegroupDelegation(env, userId, delegation[1], value(validateSetBattlegroupDelegation(await body(request)))));
    return errorResponse(404, "NOT_FOUND", "Battlegroup endpoint not found.");
  } catch (error) {
    if (error instanceof BattlegroupServiceError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

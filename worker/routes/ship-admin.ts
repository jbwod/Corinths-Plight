import { authenticate, type AuthenticatedIdentity } from "../auth";
import type { Env } from "../env";
import { requestHasJsonContentType, type ValidationResult } from "../forces-validation";
import { errorResponse, json, readJson } from "../http";
import { validateRenamePrimaryShip } from "../ship-admin-validation";
import { renamePrimaryShip, ShipAdminServiceError } from "../services/ship-admin";

const path = "/api/ships/primary/identity";

function actorUserId(identity: AuthenticatedIdentity): string {
  return identity.kind === "DEMO" ? identity.viewer.userId : identity.userId;
}

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new ShipAdminServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 8_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new ShipAdminServiceError(413, "REQUEST_TOO_LARGE", "Ship identity command exceeds 8 KB.");
    }
    throw new ShipAdminServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function valid<T>(result: ValidationResult<T>): T {
  if (!result.valid) throw new ShipAdminServiceError(400, result.code, result.message);
  return result.value;
}

export async function routeShipAdminRequest(request: Request, env: Env): Promise<Response | null> {
  if (new URL(request.url).pathname !== path) return null;
  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for ship administration.");
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", { allowed: ["POST"] });
    }
    return json(await renamePrimaryShip(env, actorUserId(identity), valid(validateRenamePrimaryShip(await body(request)))));
  } catch (error) {
    if (error instanceof ShipAdminServiceError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

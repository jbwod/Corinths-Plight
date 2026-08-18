import { authenticate, type AuthenticatedIdentity } from "../auth";
import {
  validateAssignBattalionMemberRank,
  validateCreateBattalionRank,
  validateDeleteBattalionRank,
  validateTransferBattalionCommand,
  validateUpdateBattalionRank,
} from "../battalion-admin-validation";
import type { Env } from "../env";
import { requestHasJsonContentType } from "../forces-validation";
import { errorResponse, json, readJson } from "../http";
import {
  assignBattalionMemberRank,
  BattalionAdminServiceError,
  createBattalionRank,
  deleteBattalionRank,
  updateBattalionRank,
  transferBattalionCommand,
} from "../services/battalion-admin";
import type { ValidationResult } from "../forces-validation";

const id = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
const updatePath = new RegExp(`^/api/battalions/current/ranks/${id}/update$`);
const deletePath = new RegExp(`^/api/battalions/current/ranks/${id}/delete$`);

function actorUserId(identity: AuthenticatedIdentity): string {
  return identity.kind === "DEMO" ? identity.viewer.userId : identity.userId;
}

function isBattalionAdminPath(pathname: string): boolean {
  return pathname === "/api/battalions/current/ranks"
    || pathname === "/api/battalions/current/members/rank"
    || pathname === "/api/battalions/current/command/transfer"
    || updatePath.test(pathname)
    || deletePath.test(pathname);
}

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new BattalionAdminServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 16_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new BattalionAdminServiceError(413, "REQUEST_TOO_LARGE", "Battalion command exceeds 16 KB.");
    }
    throw new BattalionAdminServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function valid<T>(result: ValidationResult<T>): T {
  if (!result.valid) throw new BattalionAdminServiceError(400, result.code, result.message);
  return result.value;
}

export async function routeBattalionAdminRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isBattalionAdminPath(url.pathname)) return null;
  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for Battalion administration.");
    if (request.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.", { allowed: ["POST"] });
    }
    const userId = actorUserId(identity);
    if (url.pathname === "/api/battalions/current/ranks") {
      return json(await createBattalionRank(env, userId, valid(validateCreateBattalionRank(await body(request)))), { status: 201 });
    }
    if (url.pathname === "/api/battalions/current/members/rank") {
      return json(await assignBattalionMemberRank(env, userId, valid(validateAssignBattalionMemberRank(await body(request)))));
    }
    if (url.pathname === "/api/battalions/current/command/transfer") {
      return json(await transferBattalionCommand(env, userId, valid(validateTransferBattalionCommand(await body(request)))));
    }
    const update = url.pathname.match(updatePath);
    if (update) {
      return json(await updateBattalionRank(env, userId, update[1], valid(validateUpdateBattalionRank(await body(request)))));
    }
    const remove = url.pathname.match(deletePath);
    if (remove) {
      return json(await deleteBattalionRank(env, userId, remove[1], valid(validateDeleteBattalionRank(await body(request)))));
    }
    return errorResponse(404, "NOT_FOUND", "Battalion administration endpoint not found.");
  } catch (error) {
    if (error instanceof BattalionAdminServiceError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

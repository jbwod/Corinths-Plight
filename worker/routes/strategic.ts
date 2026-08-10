import { authenticate, type AuthenticatedIdentity } from "../auth";
import type { Env } from "../env";
import { requestHasJsonContentType } from "../forces-validation";
import { errorResponse, json, readJson } from "../http";
import {
  getBattalionActivityProjection,
  getBattalionMembersProjection,
  getBattalionProjection,
  getCommandProjection,
  getOperationProjection,
  getOperationsProjection,
  getShipProjection,
  getStrategicMapProjection,
  mayManuallyResolveStrategicMap,
  strategicCoordinator,
  StrategicServiceError,
} from "../services/strategic";
import {
  validateResolveStrategicMap,
  validateSubmitStrategicOrder,
  type StrategicValidationResult,
} from "../strategic-validation";

const id = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
const operationPath = new RegExp(`^/api/operations/${id}$`);
const strategicMapPath = new RegExp(`^/api/strategic/maps/${id}$`);
const strategicResolvePath = new RegExp(`^/api/strategic/maps/${id}/resolve$`);

function isStrategicPath(pathname: string): boolean {
  return (
    pathname === "/api/command" ||
    pathname === "/api/battalions/current" ||
    pathname === "/api/battalions/current/members" ||
    pathname === "/api/battalions/current/activity" ||
    pathname === "/api/ships/primary" ||
    pathname === "/api/operations" ||
    pathname.startsWith("/api/operations/") ||
    pathname === "/api/strategic/orders" ||
    pathname.startsWith("/api/strategic/maps/")
  );
}

function userId(identity: AuthenticatedIdentity): string {
  return identity.kind === "DEMO" ? identity.viewer.userId : identity.userId;
}

function methodNotAllowed(allowed: string[]): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")} for this endpoint.`, { allowed });
}

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new StrategicServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 32_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new StrategicServiceError(413, "REQUEST_TOO_LARGE", "Request body exceeds 32 KB.");
    }
    throw new StrategicServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function valid<T>(result: StrategicValidationResult<T>): T {
  if (!result.valid) throw new StrategicServiceError(400, result.code, result.message);
  return result.value;
}

function activityQuery(url: URL): { before: number | null; limit: number } {
  const rawBefore = url.searchParams.get("before");
  const rawLimit = url.searchParams.get("limit");
  const before = rawBefore === null ? null : Number(rawBefore);
  const limit = rawLimit === null ? 30 : Number(rawLimit);
  if (before !== null && (!Number.isFinite(before) || before <= 0)) {
    throw new StrategicServiceError(400, "CURSOR_INVALID", "before must be a positive epoch-millisecond cursor.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new StrategicServiceError(400, "LIMIT_INVALID", "limit must be an integer from 1 to 100.");
  }
  return { before, limit };
}

async function forwardToCoordinator(
  env: Env,
  actorUserId: string,
  mapId: string,
  path: "/orders" | "/resolve",
  value: unknown,
): Promise<Response> {
  const coordinator = await strategicCoordinator(env, actorUserId, mapId);
  const headers = new Headers({
    "content-type": "application/json",
    "x-corinth-strategic-user": actorUserId,
    "x-corinth-strategic-map": mapId,
  });
  const request = new Request(`https://strategic.internal${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
  return env.STRATEGIC_MAP.getByName(coordinator.coordinatorKey).fetch(request);
}

export async function routeStrategicRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isStrategicPath(url.pathname)) return null;

  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for strategic operations.");
    const actorUserId = userId(identity);

    if (url.pathname === "/api/command") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getCommandProjection(env, actorUserId));
    }
    if (url.pathname === "/api/battalions/current") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getBattalionProjection(env, actorUserId));
    }
    if (url.pathname === "/api/battalions/current/members") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getBattalionMembersProjection(env, actorUserId));
    }
    if (url.pathname === "/api/battalions/current/activity") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const query = activityQuery(url);
      return json(await getBattalionActivityProjection(env, actorUserId, query.before, query.limit));
    }
    if (url.pathname === "/api/ships/primary") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getShipProjection(env, actorUserId));
    }
    if (url.pathname === "/api/operations") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getOperationsProjection(env, actorUserId));
    }
    if (url.pathname === "/api/strategic/orders") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      valid(validateSubmitStrategicOrder(await body(request)));
      return errorResponse(
        501,
        "STRATEGIC_ORDER_EXECUTION_DEFERRED",
        "Strategic order execution remains unavailable until the authoritative D1 resolution journal is implemented.",
      );
    }

    const resolveMatch = url.pathname.match(strategicResolvePath);
    if (resolveMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      if (env.ENVIRONMENT !== "development") {
        return errorResponse(404, "NOT_FOUND", "Strategic resolve endpoint not found.");
      }
      const command = valid(validateResolveStrategicMap(await body(request)));
      if (!(await mayManuallyResolveStrategicMap(env, actorUserId, resolveMatch[1]))) {
        return errorResponse(403, "STRATEGIC_APPROVAL_REQUIRED", "Strategic round approval is required.");
      }
      return forwardToCoordinator(env, actorUserId, resolveMatch[1], "/resolve", command);
    }

    const mapMatch = url.pathname.match(strategicMapPath);
    if (mapMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getStrategicMapProjection(env, actorUserId, mapMatch[1]));
    }
    const operationMatch = url.pathname.match(operationPath);
    if (operationMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getOperationProjection(env, actorUserId, operationMatch[1]));
    }
    return errorResponse(404, "NOT_FOUND", "Strategic API endpoint not found.");
  } catch (error) {
    if (error instanceof StrategicServiceError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

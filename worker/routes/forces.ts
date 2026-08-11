import { authenticate } from "../auth";
import type { Env } from "../env";
import {
  requestHasJsonContentType,
  validatePurchaseForceCommand,
  validateReadinessCheckCommand,
  validateRenameForceCommand,
} from "../forces-validation";
import { validateLoadoutChangeCommand, validatePurchaseEquipmentCommand } from "../equipment-validation";
import { errorResponse, json, readJson } from "../http";
import type { ForceListFilters } from "../repositories/forces";
import {
  checkDeploymentReadiness,
  ForceServiceError,
  getForceEligibleEquipment,
  getFriendlyForceHistory,
  getRequisition,
  getUnitCatalogue,
  identityUserId,
  inspectFriendlyForce,
  listForceSummaries,
  purchaseForce,
  renameForce,
} from "../services/forces";
import { changeUnitLoadout, getUnitLoadout, previewUnitLoadout, purchaseEquipment } from "../services/equipment";

const forceId = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
const forceDetailPath = new RegExp(`^/api/forces/${forceId}$`);
const forceHistoryPath = new RegExp(`^/api/forces/${forceId}/history$`);
const eligibleEquipmentPath = new RegExp(`^/api/forces/${forceId}/eligible-equipment$`);
const forceRenamePath = new RegExp(`^/api/forces/${forceId}/rename$`);
const forceLoadoutPath = new RegExp(`^/api/forces/${forceId}/loadout$`);
const forceLoadoutPreviewPath = new RegExp(`^/api/forces/${forceId}/loadout-preview$`);
const forceLoadoutChangesPath = new RegExp(`^/api/forces/${forceId}/loadout-changes$`);
const unitStatuses = new Set(["ACTIVE", "DEPLOYED", "DAMAGED", "DESTROYED", "RETIRED"]);
const locationStates = new Set([
  "RESERVE",
  "ON_MAP",
  "EMBARKED",
  "ON_SHIP",
  "IN_AIR_TRANSPORT",
  "IN_VEHICLE",
  "IN_TRANSIT",
  "DESTROYED",
]);

function isForcesApiPath(pathname: string): boolean {
  return (
    pathname === "/api/forces" ||
    pathname.startsWith("/api/forces/") ||
    pathname === "/api/catalogue/units" ||
    pathname === "/api/requisition" ||
    pathname === "/api/requisition/purchases" ||
    pathname === "/api/requisition/equipment-purchases" ||
    pathname === "/api/deployment-readiness/check"
  );
}

function methodNotAllowed(allowed: string[]): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")} for this endpoint.`, { allowed });
}

function listFilters(url: URL): ForceListFilters {
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const locationState = url.searchParams.get("locationState") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (category && !/^[A-Z][A-Z0-9_]{0,31}$/.test(category)) {
    throw new ForceServiceError(400, "FILTER_INVALID", "category is invalid.");
  }
  if (status && !unitStatuses.has(status)) {
    throw new ForceServiceError(400, "FILTER_INVALID", "status is invalid.");
  }
  if (locationState && !locationStates.has(locationState)) {
    throw new ForceServiceError(400, "FILTER_INVALID", "locationState is invalid.");
  }
  if (cursor && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(cursor)) {
    throw new ForceServiceError(400, "FILTER_INVALID", "cursor is invalid.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ForceServiceError(400, "FILTER_INVALID", "limit must be an integer from 1 to 100.");
  }
  return { category, status, locationState, cursor, limit };
}

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new ForceServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 32_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new ForceServiceError(413, "REQUEST_TOO_LARGE", "Request body exceeds 32 KB.");
    }
    throw new ForceServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function validationError(result: { valid: false; code: string; message: string }): never {
  throw new ForceServiceError(400, result.code, result.message);
}

export async function routeForcesRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isForcesApiPath(url.pathname)) return null;

  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for persistent force operations.");
    const ownerId = identityUserId(identity);

    if (url.pathname === "/api/forces") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await listForceSummaries(env, ownerId, listFilters(url)));
    }
    if (url.pathname === "/api/catalogue/units") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getUnitCatalogue(env));
    }
    if (url.pathname === "/api/requisition") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getRequisition(env, ownerId));
    }
    if (url.pathname === "/api/requisition/purchases") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validatePurchaseForceCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await purchaseForce(env, ownerId, parsed.value), { status: 201 });
    }
    if (url.pathname === "/api/requisition/equipment-purchases") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validatePurchaseEquipmentCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await purchaseEquipment(env, ownerId, parsed.value), { status: 201 });
    }
    if (url.pathname === "/api/deployment-readiness/check") {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validateReadinessCheckCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await checkDeploymentReadiness(env, ownerId, parsed.value));
    }

    const historyMatch = url.pathname.match(forceHistoryPath);
    if (historyMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getFriendlyForceHistory(env, ownerId, historyMatch[1]));
    }
    const eligibleMatch = url.pathname.match(eligibleEquipmentPath);
    if (eligibleMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getForceEligibleEquipment(env, ownerId, eligibleMatch[1]));
    }
    const renameMatch = url.pathname.match(forceRenamePath);
    if (renameMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validateRenameForceCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await renameForce(env, ownerId, renameMatch[1], parsed.value));
    }
    const loadoutMatch = url.pathname.match(forceLoadoutPath);
    if (loadoutMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await getUnitLoadout(env, ownerId, loadoutMatch[1]));
    }
    const loadoutPreviewMatch = url.pathname.match(forceLoadoutPreviewPath);
    if (loadoutPreviewMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validateLoadoutChangeCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await previewUnitLoadout(env, ownerId, loadoutPreviewMatch[1], parsed.value));
    }
    const loadoutChangesMatch = url.pathname.match(forceLoadoutChangesPath);
    if (loadoutChangesMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const parsed = validateLoadoutChangeCommand(await body(request));
      if (!parsed.valid) validationError(parsed);
      return json(await changeUnitLoadout(env, ownerId, loadoutChangesMatch[1], parsed.value));
    }
    const detailMatch = url.pathname.match(forceDetailPath);
    if (detailMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await inspectFriendlyForce(env, ownerId, detailMatch[1]));
    }
    return errorResponse(404, "NOT_FOUND", "Forces API endpoint not found.");
  } catch (error) {
    if (error instanceof ForceServiceError) {
      return errorResponse(error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

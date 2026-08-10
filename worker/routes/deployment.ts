import { authenticate } from "../auth";
import type { Env } from "../env";
import { validateSaveDeploymentPlanCommand } from "../equipment-validation";
import { requestHasJsonContentType } from "../forces-validation";
import { errorResponse, json, readJson } from "../http";
import {
  commitPlan,
  getPlanningContext,
  inspectPlan,
  listPlans,
  savePlan,
  validateStoredPlan,
} from "../services/deployment";
import { ForceServiceError, identityUserId } from "../services/forces";

const identifier = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
const detailPath = new RegExp(`^/api/deployment-plans/${identifier}$`);
const validatePath = new RegExp(`^/api/deployment-plans/${identifier}/validate$`);
const commitPath = new RegExp(`^/api/deployment-plans/${identifier}/commit$`);
const commandIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;

async function body(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) throw new ForceServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  try { return await readJson<unknown>(request, 64_000); } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new ForceServiceError(413, "REQUEST_TOO_LARGE", "Request body exceeds 64 KB.");
    }
    throw new ForceServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function methodNotAllowed(allowed: string[]): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")} for this endpoint.`, { allowed });
}

function commitCommand(value: unknown): { commandId: string; expectedRevision: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ForceServiceError(400, "COMMAND_INVALID", "Commit command is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "commandId" && key !== "expectedRevision") ||
      typeof record.commandId !== "string" || !commandIdPattern.test(record.commandId) ||
      !Number.isInteger(record.expectedRevision) || (record.expectedRevision as number) < 1) {
    throw new ForceServiceError(400, "COMMAND_INVALID", "Commit requires commandId and a positive expectedRevision.");
  }
  return { commandId: record.commandId, expectedRevision: record.expectedRevision as number };
}

export async function routeDeploymentRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/deployment-context" && url.pathname !== "/api/deployment-plans" && !url.pathname.startsWith("/api/deployment-plans/")) return null;
  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for deployment planning.");
    const userId = identityUserId(identity);
    if (url.pathname === "/api/deployment-context") {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const campaignId = url.searchParams.get("campaignId");
      if (!campaignId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(campaignId)) {
        throw new ForceServiceError(400, "CAMPAIGN_ID_INVALID", "A valid campaignId is required.");
      }
      return json(await getPlanningContext(env, userId, campaignId));
    }
    if (url.pathname === "/api/deployment-plans") {
      if (request.method === "GET") return json(await listPlans(env, userId));
      if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);
      const parsed = validateSaveDeploymentPlanCommand(await body(request));
      if (!parsed.valid) throw new ForceServiceError(400, parsed.code, parsed.message);
      return json(await savePlan(env, userId, parsed.value), { status: 201 });
    }
    const validateMatch = url.pathname.match(validatePath);
    if (validateMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      return json(await validateStoredPlan(env, userId, validateMatch[1]));
    }
    const commitMatch = url.pathname.match(commitPath);
    if (commitMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      return json(await commitPlan(env, userId, commitMatch[1], commitCommand(await body(request))));
    }
    const detailMatch = url.pathname.match(detailPath);
    if (detailMatch) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      return json(await inspectPlan(env, userId, detailMatch[1]));
    }
    return errorResponse(404, "NOT_FOUND", "Deployment API endpoint not found.");
  } catch (error) {
    if (error instanceof ForceServiceError) return errorResponse(error.status, error.code, error.message, error.details);
    throw error;
  }
}

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { requestHasJsonContentType } from "./forces-validation";
import { errorResponse, json, readJson } from "./http";
import {
  commitStrategicOrder,
  resolveStrategicMapRound,
  StrategicServiceError,
} from "./services/strategic";
import {
  validateResolveStrategicMap,
  validateSubmitStrategicOrder,
  type StrategicValidationResult,
} from "./strategic-validation";

const MAP_ID_STORAGE_KEY = "identity/map-id";
const MAXIMUM_COMMAND_BYTES = 32_000;
const internalIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function methodNotAllowed(allowed: string[]): Response {
  const response = errorResponse(
    405,
    "METHOD_NOT_ALLOWED",
    `Use ${allowed.join(" or ")} for this endpoint.`,
    { allowed },
  );
  response.headers.set("allow", allowed.join(", "));
  return response;
}

function valid<T>(result: StrategicValidationResult<T>): T {
  if (!result.valid) throw new StrategicServiceError(400, result.code, result.message);
  return result.value;
}

async function commandBody(request: Request): Promise<unknown> {
  if (!requestHasJsonContentType(request)) {
    throw new StrategicServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, MAXIMUM_COMMAND_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new StrategicServiceError(413, "REQUEST_TOO_LARGE", "Request body exceeds 32 KB.");
    }
    throw new StrategicServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function internalId(request: Request, header: string, code: string, label: string): string {
  const value = request.headers.get(header);
  if (!value || !internalIdPattern.test(value)) {
    throw new StrategicServiceError(400, code, `${label} internal header is missing or invalid.`);
  }
  return value;
}

/**
 * Serializes strategic commands for one D1-backed map coordinator.
 *
 * Durable Object storage contains identity only. D1 remains authoritative for
 * map state, permissions, optimistic versions, orders, and events.
 */
export class StrategicMapDurableObject extends DurableObject<Env> {
  private async verifiedMapId(request: Request): Promise<string> {
    const requestedMapId = internalId(
      request,
      "x-corinth-strategic-map",
      "STRATEGIC_MAP_HEADER_INVALID",
      "Strategic map",
    );
    const storedMapId = await this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<string>(MAP_ID_STORAGE_KEY);
      if (existing !== undefined) return existing;
      await transaction.put(MAP_ID_STORAGE_KEY, requestedMapId);
      return requestedMapId;
    });
    if (storedMapId !== requestedMapId) {
      throw new StrategicServiceError(
        409,
        "STRATEGIC_COORDINATOR_MISMATCH",
        "This Durable Object is already assigned to another strategic map.",
        { requestedMapId, coordinatorMapId: storedMapId },
      );
    }
    return storedMapId;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/orders") {
        if (request.method !== "POST") return methodNotAllowed(["POST"]);
        return await this.handleOrder(request);
      }
      if (url.pathname === "/resolve") {
        if (request.method !== "POST") return methodNotAllowed(["POST"]);
        return await this.handleResolve(request);
      }
      return errorResponse(404, "NOT_FOUND", "Strategic coordinator endpoint not found.");
    } catch (error) {
      if (error instanceof StrategicServiceError) {
        return errorResponse(error.status, error.code, error.message, error.details);
      }
      console.error(
        JSON.stringify({
          level: "error",
          operation: "strategic.coordinator.failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return errorResponse(500, "STRATEGIC_COORDINATOR_ERROR", "Strategic coordinator request failed.");
    }
  }

  private async handleOrder(request: Request): Promise<Response> {
    const coordinatorMapId = await this.verifiedMapId(request);
    const actorUserId = internalId(
      request,
      "x-corinth-strategic-user",
      "STRATEGIC_USER_HEADER_INVALID",
      "Strategic user",
    );
    const command = valid(validateSubmitStrategicOrder(await commandBody(request)));
    return json(await commitStrategicOrder(this.env, actorUserId, coordinatorMapId, command));
  }

  private async handleResolve(request: Request): Promise<Response> {
    const coordinatorMapId = await this.verifiedMapId(request);
    const actorUserId = internalId(
      request,
      "x-corinth-strategic-user",
      "STRATEGIC_USER_HEADER_INVALID",
      "Strategic user",
    );
    const command = valid(validateResolveStrategicMap(await commandBody(request)));
    return json(await resolveStrategicMapRound(this.env, actorUserId, coordinatorMapId, command));
  }
}

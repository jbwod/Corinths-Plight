import { allDefinitions } from "../packages/rules-engine/src";
import {
  authConfigurationIsSafe,
  authenticate,
  authorizeCampaign,
  internalViewerHeaders,
  requestIsExplicitlyCrossOrigin,
  requestIsSameOrigin,
  requestRequiresSameOrigin,
} from "./auth";
import { CampaignDurableObject } from "./campaign-durable-object";
import type { Env } from "./env";
import { errorResponse, json } from "./http";

export { CampaignDurableObject };

const campaignPath = /^\/api\/campaigns\/([a-z0-9][a-z0-9-]{0,63})(\/.*)?$/;

function withSecurityHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    // Cloudflare's Response extension is required when proxying WebSocket upgrades.
    webSocket: response.webSocket,
  });
}

async function route(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  if (!authConfigurationIsSafe(env)) {
    return errorResponse(503, "AUTH_CONFIGURATION_UNSAFE", "Authentication configuration is not safe to serve requests.");
  }
  if (requestRequiresSameOrigin(request) && !requestIsSameOrigin(request)) {
    return errorResponse(403, "SAME_ORIGIN_REQUIRED", "This operation requires a same-origin request.");
  }
  if (requestIsExplicitlyCrossOrigin(request)) {
    return errorResponse(403, "CROSS_ORIGIN_FORBIDDEN", "Cross-origin API access is not permitted.");
  }
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      status: "ok",
      service: "corinths-plight",
      environment: env.ENVIRONMENT,
      requestId,
      serverTime: Date.now(),
    });
  }
  if (url.pathname === "/api/rulesets/v5-core-curated" && request.method === "GET") {
    return json({
      id: "v5-core-curated",
      version: "v5-core-curated@1",
      status: "active",
      definitions: allDefinitions,
      summary: {
        active: allDefinitions.filter((definition) => definition.status === "active").length,
        experimental: allDefinitions.filter((definition) => definition.status === "experimental").length,
        legacy: allDefinitions.filter((definition) => definition.status === "legacy").length,
      },
    });
  }

  const match = url.pathname.match(campaignPath);
  if (match) {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for campaign operations.");
    const campaignId = match[1];
    const access = await authorizeCampaign(identity, campaignId, env);
    if (!access.allowed) {
      if (access.reason === "NOT_FOUND") {
        return errorResponse(404, "CAMPAIGN_NOT_FOUND", "The campaign is not available.");
      }
      if (access.reason === "ROLE_UNSUPPORTED") {
        return errorResponse(403, "CAMPAIGN_ROLE_UNSUPPORTED", "This campaign role has no safe runtime projection yet.");
      }
      return errorResponse(403, "CAMPAIGN_FORBIDDEN", "Campaign membership is required.");
    }
    const suffix = match[2] || "/state";
    const headers = new Headers(request.headers);
    headers.delete("x-corinth-user");
    headers.delete("x-corinth-side");
    headers.delete("x-corinth-role");
    headers.delete("x-corinth-battalion");
    headers.delete("cookie");
    headers.delete("authorization");
    headers.delete("x-demo-user");
    headers.delete("x-demo-role");
    for (const [name, value] of internalViewerHeaders(access.viewer)) headers.set(name, value);
    const internalSearch = new URLSearchParams(url.search);
    internalSearch.delete("demo_user");
    const internalQuery = internalSearch.toString();
    const internalRequest = new Request(`https://campaign.internal${suffix}${internalQuery ? `?${internalQuery}` : ""}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    const stub = env.CAMPAIGN.getByName(campaignId);
    return stub.fetch(internalRequest);
  }

  if (url.pathname.startsWith("/api/")) return errorResponse(404, "NOT_FOUND", "API endpoint not found.");
  return errorResponse(404, "ASSET_NOT_FOUND", "The requested application asset was not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const url = new URL(request.url);
    const startedAt = Date.now();
    try {
      const response = await route(request, env, requestId);
      console.log(
        JSON.stringify({
          level: "info",
          operation: "http.request",
          requestId,
          method: request.method,
          path: url.pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        }),
      );
      return withSecurityHeaders(response, requestId);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          operation: "http.request.failed",
          requestId,
          method: request.method,
          path: url.pathname,
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return withSecurityHeaders(
        errorResponse(500, "INTERNAL_ERROR", "The request could not be completed."),
        requestId,
      );
    }
  },
} satisfies ExportedHandler<Env>;

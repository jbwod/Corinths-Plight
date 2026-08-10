import {
  authConfigurationIsSafe,
  authenticate,
  authorizeCampaign,
  internalViewerHeaders,
  requestIsEmailVerificationNavigation,
  requestIsExplicitlyCrossOrigin,
  requestIsSameOrigin,
  requestRequiresSameOrigin,
} from "./auth";
import { CampaignDurableObject } from "./campaign-durable-object";
import type { Env } from "./env";
import { errorResponse, json } from "./http";
import { routeForcesRequest } from "./routes/forces";
import { routeBattlegroupRequest } from "./routes/battlegroups";
import { routeAuthRequest } from "./routes/auth";
import { routeDeploymentRequest } from "./routes/deployment";
import { routeCampaignDirectoryRequest } from "./routes/campaigns";
import { routeOnboardingRequest } from "./routes/onboarding";
import { routeStrategicRequest } from "./routes/strategic";
import { rulesCatalogueResponse } from "./rules-catalogue";
import { scheduleSecurityMaintenance } from "./security-maintenance";
import { StrategicMapDurableObject } from "./strategic-map-durable-object";

export { CampaignDurableObject, StrategicMapDurableObject };

const campaignPath = /^\/api\/campaigns\/([a-z0-9][a-z0-9-]{0,63})(\/.*)?$/;

function withSecurityHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("referrer-policy")) headers.set("referrer-policy", "strict-origin-when-cross-origin");
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

async function route(request: Request, env: Env, requestId: string, context: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (!authConfigurationIsSafe(env)) {
    return errorResponse(503, "AUTH_CONFIGURATION_UNSAFE", "Authentication configuration is not safe to serve requests.");
  }
  if (requestRequiresSameOrigin(request) && !requestIsSameOrigin(request)) {
    return errorResponse(403, "SAME_ORIGIN_REQUIRED", "This operation requires a same-origin request.");
  }
  if (requestIsExplicitlyCrossOrigin(request) && !requestIsEmailVerificationNavigation(request)) {
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
    return rulesCatalogueResponse();
  }

  const authResponse = await routeAuthRequest(request, env);
  if (authResponse) return authResponse;

  const onboardingResponse = await routeOnboardingRequest(request, env, context);
  if (onboardingResponse) return onboardingResponse;

  const forcesResponse = await routeForcesRequest(request, env);
  if (forcesResponse) return forcesResponse;

  const battlegroupResponse = await routeBattlegroupRequest(request, env);
  if (battlegroupResponse) return battlegroupResponse;

  const deploymentResponse = await routeDeploymentRequest(request, env);
  if (deploymentResponse) return deploymentResponse;

  const campaignDirectoryResponse = await routeCampaignDirectoryRequest(request, env);
  if (campaignDirectoryResponse) return campaignDirectoryResponse;

  const strategicResponse = await routeStrategicRequest(request, env);
  if (strategicResponse) return strategicResponse;

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
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const url = new URL(request.url);
    const startedAt = Date.now();
    try {
      const response = await route(request, env, requestId, context);
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
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    scheduleSecurityMaintenance(controller, env, context);
  },
} satisfies ExportedHandler<Env>;

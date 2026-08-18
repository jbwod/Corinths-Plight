import type { Env } from "../env";
import { errorResponse, json, readJson } from "../http";
import {
  AuthServiceError,
  clearSessionCookie,
  consumeStagedAuthChallenge,
  currentSession,
  logout,
  requestAuthLink,
  stageAuthChallenge,
  validateLoginInput,
  validateRegistrationInput,
} from "../services/auth";

function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AuthServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  return readJson<unknown>(request, 8_192).catch((error: unknown) => {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new AuthServiceError(413, "REQUEST_TOO_LARGE", "Authentication request exceeds 8 KB.");
    }
    throw new AuthServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  });
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function routeAuthRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  try {
    if (url.pathname === "/api/auth/session") {
      if (request.method !== "GET") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET for this endpoint.");
      return json(await currentSession(request, env));
    }
    if (url.pathname === "/api/auth/register") {
      if (request.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
      const input = validateRegistrationInput(await jsonBody(request));
      return json(await requestAuthLink(request, env, "REGISTER", input), { status: 202 });
    }
    if (url.pathname === "/api/auth/login") {
      if (request.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
      const input = validateLoginInput(await jsonBody(request));
      return json(await requestAuthLink(request, env, "LOGIN", input), { status: 202 });
    }
    if (url.pathname === "/api/auth/verify") {
      if (request.method === "GET") {
        const token = url.searchParams.get("token") ?? "";
        try {
          const stagedCookie = await stageAuthChallenge(env, token);
          return redirect(env.ENVIRONMENT === "development" ? "/?auth=confirm&signedout=1" : "/?auth=confirm", stagedCookie);
        } catch (error) {
          if (error instanceof AuthServiceError) return redirect("/?auth=invalid", clearSessionCookie(env));
          throw error;
        }
      }
      if (request.method === "POST") {
        const result = await consumeStagedAuthChallenge(request, env);
        return json({ verified: true }, { headers: { "set-cookie": result.cookie } });
      }
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Use GET or POST for this endpoint.");
    }
    if (url.pathname === "/api/auth/logout") {
      if (request.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
      await logout(request, env);
      return json({ signedOut: true }, { headers: { "set-cookie": clearSessionCookie(env) } });
    }
    return errorResponse(404, "NOT_FOUND", "Authentication endpoint not found.");
  } catch (error) {
    if (error instanceof AuthServiceError) return errorResponse(error.status, error.code, error.message);
    throw error;
  }
}

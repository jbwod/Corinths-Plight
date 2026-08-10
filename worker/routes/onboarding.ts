import { authenticate } from "../auth";
import type { Env } from "../env";
import { errorResponse, json, readJson } from "../http";
import {
  validateCompleteOnboardingCommand,
  validateCreateBattalionCommand,
  validateGrantStarterUnitCommand,
  validateInviteBattalionMemberCommand,
  validateJoinBattalionCommand,
  validateRespondBattalionInviteCommand,
  validateUpdateBattalionRecruitmentCommand,
  type ValidationResult,
} from "../onboarding-validation";
import {
  completeOnboarding,
  createBattalion,
  getOnboardingStatus,
  grantStarterUnit,
  inviteBattalionMember,
  joinBattalion,
  OnboardingServiceError,
  respondBattalionInvite,
  updateBattalionRecruitment,
} from "../services/onboarding";
import { processInvitationDeliveryJobs } from "../services/security-operations";

function isOnboardingPath(pathname: string): boolean {
  return pathname === "/api/onboarding" || pathname.startsWith("/api/onboarding/");
}
function methodNotAllowed(method: string): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", `Use ${method} for this endpoint.`);
}

async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new OnboardingServiceError(415, "JSON_REQUIRED", "Use application/json for this request.");
  }
  try {
    return await readJson<unknown>(request, 16_384);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      throw new OnboardingServiceError(413, "REQUEST_TOO_LARGE", "Onboarding request exceeds 16 KB.");
    }
    throw new OnboardingServiceError(400, "JSON_INVALID", "Request body must contain valid JSON.");
  }
}

function parsed<T>(result: ValidationResult<T>): T {
  if (!result.valid) throw new OnboardingServiceError(400, result.code, result.message);
  return result.value;
}

export async function routeOnboardingRequest(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isOnboardingPath(url.pathname)) return null;
  try {
    const identity = await authenticate(request, env);
    if (!identity) return errorResponse(401, "AUTH_REQUIRED", "Sign in is required for guided enlistment.");
    const userId = identity.kind === "SESSION" ? identity.userId : identity.viewer.userId;

    if (url.pathname === "/api/onboarding") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return json(await getOnboardingStatus(env, userId));
    }
    if (url.pathname === "/api/onboarding/battalions/join") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await joinBattalion(env, userId, parsed(validateJoinBattalionCommand(await body(request)))));
    }
    if (url.pathname === "/api/onboarding/battalions") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await createBattalion(env, userId, parsed(validateCreateBattalionCommand(await body(request)))), { status: 201 });
    }
    if (url.pathname === "/api/onboarding/battalions/settings") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await updateBattalionRecruitment(env, userId, parsed(validateUpdateBattalionRecruitmentCommand(await body(request)))));
    }
    if (url.pathname === "/api/onboarding/battalions/invites") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const result = await inviteBattalionMember(
        env,
        userId,
        parsed(validateInviteBattalionMemberCommand(await body(request))),
        request,
      );
      if (result.deliveryQueued && context) {
        context.waitUntil(processInvitationDeliveryJobs(env).catch((error) => {
          console.error(JSON.stringify({
            level: "error",
            operation: "invitation.delivery.immediate.failed",
            message: error instanceof Error ? error.message : String(error),
          }));
        }));
      }
      return json(result.response, { status: 202 });
    }
    if (url.pathname === "/api/onboarding/battalions/invites/respond") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await respondBattalionInvite(env, userId, parsed(validateRespondBattalionInviteCommand(await body(request)))));
    }
    if (url.pathname === "/api/onboarding/starter-unit") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await grantStarterUnit(env, userId, parsed(validateGrantStarterUnitCommand(await body(request)))), { status: 201 });
    }
    if (url.pathname === "/api/onboarding/complete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return json(await completeOnboarding(env, userId, parsed(validateCompleteOnboardingCommand(await body(request)))));
    }
    return errorResponse(404, "NOT_FOUND", "Onboarding endpoint not found.");
  } catch (error) {
    if (error instanceof OnboardingServiceError) return errorResponse(error.status, error.code, error.message, error.details);
    throw error;
  }
}

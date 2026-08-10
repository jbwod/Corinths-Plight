export interface Env {
  DB: D1Database;
  CAMPAIGN: DurableObjectNamespace;
  STRATEGIC_MAP: DurableObjectNamespace;
  ENVIRONMENT: "development" | "preview" | "production";
  ALLOW_DEMO_AUTH: string;
  DEFAULT_ROUND_DURATION_MS: string;
  ORDER_LOCK_LEAD_MS: string;
  DEFAULT_STRATEGIC_ROUND_DURATION_MS: string;
  STRATEGIC_ORDER_LOCK_LEAD_MS: string;
  AUTH_BASE_URL?: string;
  AUTH_FROM_EMAIL?: string;
  AUTH_SESSION_TTL_SECONDS?: string;
  AUTH_CHALLENGE_TTL_SECONDS?: string;
  RESEND_API_KEY?: string;
  AUTH_HASH_KEY?: string;
}

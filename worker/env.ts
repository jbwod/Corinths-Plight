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
}

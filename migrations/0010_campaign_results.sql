PRAGMA foreign_keys = ON;

-- Durable tactical outcomes are consumed by the campaign directory, reports,
-- and (when a strategic operation is linked) the strategic war projection.
-- Requisition rewards remain explicitly unpublished under RC-V5-016.
CREATE TABLE campaign_results (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  scenario_id TEXT NOT NULL,
  scenario_version INTEGER NOT NULL CHECK (scenario_version > 0),
  result TEXT NOT NULL CHECK (result IN ('VICTORY', 'DEFEAT')),
  reason TEXT NOT NULL CHECK (reason IN (
    'ALL_ALLIED_DEPLOYMENTS_LOST',
    'PRIMARY_OBJECTIVE_LOST',
    'FINAL_ROUND_PRIMARY_HELD',
    'FINAL_ROUND_CONDITIONS_NOT_MET'
  )),
  objectives_json TEXT NOT NULL
    CHECK (json_valid(objectives_json) AND json_type(objectives_json) = 'array'),
  rewards_json TEXT NOT NULL
    CHECK (json_valid(rewards_json) AND json_type(rewards_json) = 'object'),
  resolution_key TEXT NOT NULL UNIQUE,
  effect_idempotency_key TEXT NOT NULL UNIQUE,
  resolved_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_campaign_results_result_time
  ON campaign_results(result, resolved_at, campaign_id);

PRAGMA foreign_keys = ON;

-- Global Game Master authority is deliberately separate from Battalion and
-- campaign-local roles. Production receives no implicit/default grant.
CREATE TABLE game_master_grants (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  granted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER,
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE TABLE game_master_command_receipts (
  actor_user_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'CLOCK_UPDATE', 'OBJECTIVE_CREATE', 'OBJECTIVE_UPDATE',
    'DEPLOYMENT_REVIVE', 'ENEMY_SPAWN', 'CAMPAIGN_PAUSE',
    'CAMPAIGN_RESUME', 'ROUND_RESOLVE'
  )),
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  reservation_token TEXT NOT NULL CHECK (length(reservation_token) BETWEEN 16 AND 128),
  status_code INTEGER CHECK (status_code BETWEEN 200 AND 599),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  PRIMARY KEY (actor_user_id, command_id),
  CHECK ((status_code IS NULL) = (response_json IS NULL)),
  CHECK ((status_code IS NULL) = (completed_at IS NULL))
);

CREATE INDEX idx_game_master_receipts_campaign
  ON game_master_command_receipts(campaign_id, created_at DESC);
CREATE INDEX idx_game_master_receipts_incomplete
  ON game_master_command_receipts(completed_at, created_at);

CREATE TABLE game_master_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  grant_source TEXT NOT NULL CHECK (grant_source IN ('GLOBAL_GRANT', 'DEVELOPMENT_DEMO')),
  operation TEXT NOT NULL CHECK (operation IN (
    'CLOCK_UPDATE', 'OBJECTIVE_CREATE', 'OBJECTIVE_UPDATE',
    'DEPLOYMENT_REVIVE', 'ENEMY_SPAWN', 'CAMPAIGN_PAUSE',
    'CAMPAIGN_RESUME', 'ROUND_RESOLVE'
  )),
  -- Denormalized target id is retained if campaign lifecycle/archive policy
  -- later removes the registry row; administrative audit must not cascade.
  campaign_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (actor_user_id, command_id)
);

CREATE INDEX idx_game_master_audit_campaign
  ON game_master_audit_events(campaign_id, occurred_at DESC, id DESC);

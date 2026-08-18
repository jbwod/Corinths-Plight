PRAGMA foreign_keys = ON;

-- Immutable scenario bootstrap content for a Game Master campaign. Runtime
-- creation must match this row, the campaign selector, and the exact published
-- map revision/hash before a Durable Object may materialize tactical state.
CREATE TABLE game_master_campaign_scenarios (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL UNIQUE,
  scenario_version INTEGER NOT NULL CHECK (scenario_version = 1),
  scenario_content_key TEXT NOT NULL UNIQUE,
  map_revision_id TEXT NOT NULL REFERENCES game_master_map_revisions(id) ON DELETE RESTRICT,
  map_content_hash TEXT NOT NULL CHECK (
    length(map_content_hash) = 71 AND substr(map_content_hash, 1, 7) = 'sha256:'
    AND substr(map_content_hash, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  objectives_json TEXT NOT NULL CHECK (
    json_valid(objectives_json) AND json_type(objectives_json) = 'array'
    AND json_array_length(objectives_json) BETWEEN 0 AND 32
  ),
  enemy_deployments_json TEXT NOT NULL CHECK (
    json_valid(enemy_deployments_json) AND json_type(enemy_deployments_json) = 'array'
    AND json_array_length(enemy_deployments_json) BETWEEN 0 AND 128
  ),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (scenario_content_key = scenario_id || '@' || scenario_version)
);

CREATE INDEX idx_game_master_campaign_scenarios_map_revision
  ON game_master_campaign_scenarios(map_revision_id, campaign_id);

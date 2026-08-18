PRAGMA foreign_keys = ON;

-- Game Master scenario @2 pins its terminal application policy and reward
-- policy. Existing @1 rows remain intact and explicitly unpinned; they are not
-- upgraded or eligible for @2 runtime materialization.
ALTER TABLE game_master_campaign_scenarios
  RENAME TO game_master_campaign_scenarios_0022_old;

CREATE TABLE game_master_campaign_scenarios (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL UNIQUE,
  scenario_version INTEGER NOT NULL CHECK (scenario_version IN (1, 2)),
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
  application_policy_key TEXT,
  maximum_rounds INTEGER,
  reward_policy_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (scenario_content_key = scenario_id || '@' || scenario_version),
  CHECK (
    (
      scenario_version = 1
      AND application_policy_key IS NULL
      AND maximum_rounds IS NULL
      AND reward_policy_id IS NULL
    ) OR (
      scenario_version = 2
      AND application_policy_key = 'game-master-skirmish@1'
      AND maximum_rounds = 12
      AND reward_policy_id = 'public-v1-economy@1'
    )
  )
);

INSERT INTO game_master_campaign_scenarios (
  campaign_id,scenario_id,scenario_version,scenario_content_key,map_revision_id,
  map_content_hash,objectives_json,enemy_deployments_json,application_policy_key,
  maximum_rounds,reward_policy_id,created_by_user_id,created_at
)
SELECT campaign_id,scenario_id,scenario_version,scenario_content_key,map_revision_id,
       map_content_hash,objectives_json,enemy_deployments_json,NULL,NULL,NULL,
       created_by_user_id,created_at
FROM game_master_campaign_scenarios_0022_old;

DROP TABLE game_master_campaign_scenarios_0022_old;

CREATE INDEX idx_game_master_campaign_scenarios_map_revision
  ON game_master_campaign_scenarios(map_revision_id, campaign_id);

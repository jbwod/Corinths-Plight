PRAGMA foreign_keys = ON;

-- Immutable authored-scenario selector. Existing rows remain NULL so a legacy
-- campaign cannot silently materialize whatever content is latest at runtime.
ALTER TABLE campaigns ADD COLUMN scenario_content_key TEXT;

CREATE INDEX idx_campaigns_scenario_content_key
  ON campaigns(scenario_content_key);

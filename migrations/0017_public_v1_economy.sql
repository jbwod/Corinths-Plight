PRAGMA foreign_keys = ON;

-- Application-owned economy policy. These values are explicitly approved for
-- public-v1 play and do not claim to be numbers supplied by the V5 rules text.
CREATE TABLE economy_policies (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','RETIRED')),
  starting_requisition INTEGER NOT NULL CHECK (starting_requisition >= 0),
  battalion_charter_cost INTEGER NOT NULL CHECK (battalion_charter_cost > 0),
  mission_reward INTEGER NOT NULL CHECK (mission_reward >= 0),
  campaign_victory_reward INTEGER NOT NULL CHECK (campaign_victory_reward >= 0),
  passive_income INTEGER NOT NULL DEFAULT 0 CHECK (passive_income >= 0),
  loss_policy TEXT NOT NULL CHECK (loss_policy = 'PERMANENT_NO_REFUND'),
  replacement_policy TEXT NOT NULL CHECK (replacement_policy = 'FRESH_PURCHASE_OR_EXPLICIT_GRANT'),
  decision_id TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX only_one_active_economy_policy
  ON economy_policies(status) WHERE status = 'ACTIVE';

CREATE TABLE economy_unit_prices (
  policy_id TEXT NOT NULL REFERENCES economy_policies(id) ON DELETE RESTRICT,
  ruleset_id TEXT NOT NULL REFERENCES rulesets(id) ON DELETE RESTRICT,
  definition_id TEXT NOT NULL,
  requisition_cost INTEGER NOT NULL CHECK (requisition_cost > 0),
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','RETIRED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (policy_id, definition_id),
  FOREIGN KEY (definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE RESTRICT
);

CREATE INDEX idx_economy_unit_prices_active
  ON economy_unit_prices(policy_id, status, definition_id);

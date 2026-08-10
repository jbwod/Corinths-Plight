PRAGMA foreign_keys = ON;

ALTER TABLE battlegroups ADD COLUMN last_mutation_token TEXT;

CREATE TABLE battlegroup_mutation_receipts (
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'CREATE_BATTLEGROUP',
    'UPDATE_BATTLEGROUP',
    'ASSIGN_BATTLEGROUP_UNIT',
    'REMOVE_BATTLEGROUP_UNIT',
    'SET_BATTLEGROUP_DELEGATION'
  )),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (actor_user_id, command_id)
);

-- A persistent unit has one current formation. Historical formation membership
-- belongs in unit_history rather than duplicate live roster rows.
CREATE UNIQUE INDEX idx_one_battlegroup_per_player_unit
  ON battlegroup_units(player_unit_id);

-- One active Battlegroup-scoped delegation per unit and delegate. Revoked rows
-- remain as authority history and no longer block a replacement grant.
CREATE UNIQUE INDEX idx_one_active_battlegroup_delegation
  ON unit_order_delegations(player_unit_id, delegate_user_id, battlegroup_id)
  WHERE scope_type = 'BATTLEGROUP' AND revoked_at IS NULL;

CREATE INDEX idx_battlegroup_mutation_receipts_created
  ON battlegroup_mutation_receipts(created_at);

PRAGMA foreign_keys = ON;

ALTER TABLE ships ADD COLUMN last_identity_mutation_token TEXT;

CREATE TABLE ship_mutation_receipts (
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('RENAME_PRIMARY_SHIP')),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
    CHECK (json_valid(response_json) AND json_type(response_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (actor_user_id, command_id)
);

CREATE INDEX idx_ship_mutation_receipts_created
  ON ship_mutation_receipts(created_at, actor_user_id);

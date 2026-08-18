PRAGMA foreign_keys = ON;

ALTER TABLE battalion_ranks ADD COLUMN last_mutation_token TEXT;
ALTER TABLE battalion_memberships ADD COLUMN last_rank_mutation_token TEXT;

CREATE TABLE battalion_administration_receipts (
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'CREATE_BATTALION_RANK',
    'UPDATE_BATTALION_RANK',
    'DELETE_BATTALION_RANK',
    'ASSIGN_BATTALION_MEMBER_RANK'
  )),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
    CHECK (json_valid(response_json) AND json_type(response_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (actor_user_id, command_id)
);

CREATE INDEX idx_battalion_admin_receipts_created
  ON battalion_administration_receipts(created_at, actor_user_id);

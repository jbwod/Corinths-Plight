PRAGMA foreign_keys = ON;

ALTER TABLE onboarding_command_receipts RENAME TO onboarding_command_receipts_0013_old;

CREATE TABLE onboarding_command_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'JOIN_BATTALION', 'SWITCH_ACTIVE_BATTALION', 'LEAVE_BATTALION',
    'REMOVE_BATTALION_MEMBER', 'CREATE_BATTALION',
    'UPDATE_BATTALION_RECRUITMENT', 'INVITE_BATTALION_MEMBER',
    'RESPOND_BATTALION_INVITE', 'GRANT_STARTER_UNIT', 'COMPLETE_ONBOARDING'
  )),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
    CHECK (json_valid(response_json) AND json_type(response_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, command_id)
);

INSERT INTO onboarding_command_receipts (
  user_id,command_id,operation,request_hash,response_json,created_at
)
SELECT user_id,command_id,operation,request_hash,response_json,created_at
FROM onboarding_command_receipts_0013_old;

DROP TABLE onboarding_command_receipts_0013_old;

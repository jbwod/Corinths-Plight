PRAGMA foreign_keys = ON;

-- Guided onboarding is an application workflow layered over the existing
-- identity, Battalion, permission, force, and requisition authorities.

CREATE TABLE onboarding_economy_policies (
  id TEXT PRIMARY KEY,
  starter_charter_grant INTEGER NOT NULL CHECK (starter_charter_grant > 0),
  battalion_creation_cost INTEGER NOT NULL CHECK (battalion_creation_cost > 0),
  maximum_battalions_per_creator INTEGER NOT NULL DEFAULT 1
    CHECK (maximum_battalions_per_creator > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE onboarding_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'COMPLETE', 'SKIPPED')),
  current_step TEXT NOT NULL DEFAULT 'BATTALION'
    CHECK (current_step IN ('BATTALION', 'UNIT', 'TOUR', 'COMPLETE')),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK ((status = 'COMPLETE') = (completed_at IS NOT NULL)),
  CHECK (status <> 'COMPLETE' OR current_step = 'COMPLETE')
);

CREATE TABLE onboarding_command_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'JOIN_BATTALION', 'CREATE_BATTALION', 'UPDATE_BATTALION_RECRUITMENT',
    'INVITE_BATTALION_MEMBER', 'RESPOND_BATTALION_INVITE',
    'GRANT_STARTER_UNIT', 'COMPLETE_ONBOARDING'
  )),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
    CHECK (json_valid(response_json) AND json_type(response_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, command_id)
);

CREATE TABLE battalion_recruitment_settings (
  battalion_id TEXT PRIMARY KEY REFERENCES battalions(id) ON DELETE CASCADE,
  recruitment_kind TEXT NOT NULL DEFAULT 'PLAYER'
    CHECK (recruitment_kind IN ('NPC', 'PLAYER')),
  access_policy TEXT NOT NULL DEFAULT 'PRIVATE'
    CHECK (access_policy IN ('PUBLIC', 'PRIVATE')),
  join_enabled INTEGER NOT NULL DEFAULT 1 CHECK (join_enabled IN (0, 1)),
  engagement_summary TEXT NOT NULL DEFAULT '' CHECK (length(engagement_summary) <= 180),
  recruitment_rank_id TEXT NOT NULL REFERENCES battalion_ranks(id) ON DELETE RESTRICT,
  invite_code_hash TEXT NOT NULL UNIQUE,
  member_capacity INTEGER NOT NULL DEFAULT 64 CHECK (member_capacity BETWEEN 2 AND 500),
  creation_cost INTEGER NOT NULL DEFAULT 0 CHECK (creation_cost >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (access_policy <> 'PUBLIC' OR length(trim(engagement_summary)) > 0)
);

CREATE INDEX idx_battalion_recruitment_directory
  ON battalion_recruitment_settings(access_policy, join_enabled, recruitment_kind, battalion_id);

CREATE TRIGGER validate_battalion_recruitment_rank_insert
BEFORE INSERT ON battalion_recruitment_settings
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.recruitment_rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'recruitment rank belongs to another Battalion');
END;

CREATE TRIGGER validate_battalion_recruitment_rank_update
BEFORE UPDATE OF battalion_id, recruitment_rank_id ON battalion_recruitment_settings
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.recruitment_rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'recruitment rank belongs to another Battalion');
END;

CREATE TABLE battalion_creation_charters (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  battalion_id TEXT NOT NULL UNIQUE REFERENCES battalions(id) ON DELETE RESTRICT,
  requisition_cost INTEGER NOT NULL CHECK (requisition_cost > 0),
  requisition_transaction_id TEXT NOT NULL UNIQUE
    REFERENCES requisition_transactions(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE battalion_email_invites (
  id TEXT PRIMARY KEY,
  battalion_id TEXT NOT NULL REFERENCES battalions(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rank_id TEXT NOT NULL REFERENCES battalion_ranks(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
  message TEXT NOT NULL DEFAULT '' CHECK (length(message) <= 500),
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resend_email_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  responded_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (invited_by_user_id, command_id),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'PENDING' AND responded_at IS NULL) OR
    (status <> 'PENDING' AND responded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_one_pending_battalion_email_invite
  ON battalion_email_invites(battalion_id, recipient_email)
  WHERE status = 'PENDING';

CREATE INDEX idx_battalion_email_invites_recipient
  ON battalion_email_invites(recipient_email, status, expires_at);

CREATE TRIGGER validate_battalion_email_invite_rank_insert
BEFORE INSERT ON battalion_email_invites
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'email invite rank belongs to another Battalion');
END;

CREATE TRIGGER validate_battalion_email_invite_rank_update
BEFORE UPDATE OF battalion_id, rank_id ON battalion_email_invites
WHEN NOT EXISTS (
  SELECT 1 FROM battalion_ranks
   WHERE id = NEW.rank_id AND battalion_id = NEW.battalion_id
)
BEGIN
  SELECT RAISE(ABORT, 'email invite rank belongs to another Battalion');
END;

CREATE TABLE onboarding_starter_unit_grants (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  player_unit_id TEXT NOT NULL UNIQUE REFERENCES player_units(id) ON DELETE RESTRICT,
  definition_id TEXT NOT NULL,
  ruleset_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (definition_id, ruleset_id)
    REFERENCES unit_class_definitions(id, ruleset_id) ON DELETE RESTRICT
);

ALTER TABLE battalion_invites ADD COLUMN resend_email_id TEXT;
ALTER TABLE battalion_invites ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED'));

ALTER TABLE battalion_email_invites ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED'));

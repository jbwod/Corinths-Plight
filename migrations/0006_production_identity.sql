PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE user_sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0;

UPDATE user_sessions SET last_seen_at = created_at WHERE last_seen_at = 0;

CREATE TABLE auth_email_challenges (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('REGISTER', 'LOGIN')),
  email TEXT NOT NULL COLLATE NOCASE,
  email_hash TEXT NOT NULL,
  proposed_user_id TEXT,
  proposed_username TEXT COLLATE NOCASE,
  proposed_display_name TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'CONSUMED', 'EXPIRED', 'SEND_FAILED', 'REVOKED')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  requested_ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  resend_email_id TEXT,
  send_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (send_attempt_count >= 0),
  CHECK (expires_at > created_at),
  CHECK ((status = 'CONSUMED') = (consumed_at IS NOT NULL)),
  CHECK (
    (purpose = 'REGISTER' AND proposed_user_id IS NOT NULL AND proposed_username IS NOT NULL AND proposed_display_name IS NOT NULL)
    OR
    (purpose = 'LOGIN' AND proposed_user_id IS NULL AND proposed_username IS NULL AND proposed_display_name IS NULL)
  )
);

CREATE INDEX idx_auth_email_challenges_lookup
  ON auth_email_challenges(token_hash, status, expires_at);
CREATE INDEX idx_auth_email_challenges_email
  ON auth_email_challenges(email_hash, created_at DESC);

CREATE TABLE auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  blocked_until INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (blocked_until IS NULL OR blocked_until >= window_started_at)
);

CREATE TABLE auth_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'REJECTED', 'FAILED')),
  subject_hash TEXT,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_auth_audit_user_time ON auth_audit_events(user_id, occurred_at DESC);
CREATE INDEX idx_auth_audit_subject_time ON auth_audit_events(subject_hash, occurred_at DESC);

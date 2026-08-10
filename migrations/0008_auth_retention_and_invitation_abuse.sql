PRAGMA foreign_keys = ON;

-- Operational retention, durable invitation delivery, and invitation abuse
-- controls are additive. Existing accounts and onboarding records are not
-- changed by the migration itself.

CREATE TABLE battalion_invitation_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('ACTOR', 'BATTALION', 'RECIPIENT', 'IP')),
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_allowed_at INTEGER NOT NULL,
  last_outcome TEXT NOT NULL DEFAULT 'ALLOWED'
    CHECK (last_outcome IN ('ALLOWED', 'COOLDOWN', 'QUOTA')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_battalion_invitation_rate_cleanup
  ON battalion_invitation_rate_limits(updated_at, bucket_key);

CREATE TABLE battalion_invitation_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  battalion_id TEXT REFERENCES battalions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED', 'FAILED')),
  reason_code TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_battalion_invitation_audit_actor_time
  ON battalion_invitation_audit_events(actor_user_id, occurred_at DESC);
CREATE INDEX idx_battalion_invitation_audit_battalion_time
  ON battalion_invitation_audit_events(battalion_id, occurred_at DESC);
CREATE INDEX idx_battalion_invitation_audit_recipient_time
  ON battalion_invitation_audit_events(recipient_hash, occurred_at DESC);
CREATE INDEX idx_battalion_invitation_audit_retention
  ON battalion_invitation_audit_events(occurred_at, id);

CREATE TABLE battalion_invitation_delivery_jobs (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  invitation_source TEXT NOT NULL CHECK (invitation_source IN ('ACCOUNT', 'EMAIL')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENT', 'ABANDONED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  recipient_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  last_error_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  UNIQUE (invitation_source, invitation_id),
  CHECK (expires_at > created_at),
  CHECK ((status IN ('SENT', 'ABANDONED')) = (completed_at IS NOT NULL)),
  CHECK (status = 'PENDING' OR lease_token IS NULL)
);

CREATE INDEX idx_battalion_invitation_delivery_due
  ON battalion_invitation_delivery_jobs(next_attempt_at, id)
  WHERE status = 'PENDING';
CREATE INDEX idx_battalion_invitation_delivery_expiry
  ON battalion_invitation_delivery_jobs(expires_at, id)
  WHERE status = 'PENDING';
CREATE INDEX idx_battalion_invitation_delivery_lease
  ON battalion_invitation_delivery_jobs(lease_token)
  WHERE lease_token IS NOT NULL;

CREATE TRIGGER validate_account_invitation_delivery_job
BEFORE INSERT ON battalion_invitation_delivery_jobs
WHEN NEW.invitation_source = 'ACCOUNT' AND NOT EXISTS (
  SELECT 1 FROM battalion_invites WHERE id = NEW.invitation_id
)
BEGIN
  SELECT RAISE(ABORT, 'account invitation delivery source is missing');
END;

CREATE TRIGGER validate_email_invitation_delivery_job
BEFORE INSERT ON battalion_invitation_delivery_jobs
WHEN NEW.invitation_source = 'EMAIL' AND NOT EXISTS (
  SELECT 1 FROM battalion_email_invites WHERE id = NEW.invitation_id
)
BEGIN
  SELECT RAISE(ABORT, 'email invitation delivery source is missing');
END;

CREATE TRIGGER delete_account_invitation_delivery_job
AFTER DELETE ON battalion_invites
BEGIN
  DELETE FROM battalion_invitation_delivery_jobs
   WHERE invitation_source = 'ACCOUNT' AND invitation_id = OLD.id;
END;

CREATE TRIGGER delete_email_invitation_delivery_job
AFTER DELETE ON battalion_email_invites
BEGIN
  DELETE FROM battalion_invitation_delivery_jobs
   WHERE invitation_source = 'EMAIL' AND invitation_id = OLD.id;
END;

-- Partial indexes correspond exactly to the bounded maintenance predicates.
-- This avoids OR/COALESCE scans and expression sorts as these tables grow.
CREATE INDEX idx_user_sessions_expired_retention
  ON user_sessions(expires_at, id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_sessions_revoked_retention
  ON user_sessions(revoked_at, id) WHERE revoked_at IS NOT NULL;
CREATE INDEX idx_auth_challenges_pending_expiry
  ON auth_email_challenges(expires_at, id)
  WHERE status IN ('PENDING', 'SENT');
CREATE INDEX idx_auth_challenges_consumed_retention
  ON auth_email_challenges(consumed_at, id)
  WHERE status = 'CONSUMED';
CREATE INDEX idx_auth_challenges_terminal_retention
  ON auth_email_challenges(expires_at, id)
  WHERE status IN ('EXPIRED', 'SEND_FAILED', 'REVOKED');
CREATE INDEX idx_auth_rate_limits_retention
  ON auth_rate_limits(updated_at, bucket_key);
CREATE INDEX idx_auth_audit_events_retention
  ON auth_audit_events(occurred_at, id);
CREATE INDEX idx_battalion_invites_pending_expiry
  ON battalion_invites(expires_at, id)
  WHERE status = 'PENDING' AND expires_at IS NOT NULL;
CREATE INDEX idx_battalion_email_invites_pending_expiry
  ON battalion_email_invites(expires_at, id)
  WHERE status = 'PENDING';
CREATE INDEX idx_battalion_invites_pii_retention
  ON battalion_invites(responded_at, id)
  WHERE status IN ('ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');
CREATE INDEX idx_battalion_email_invites_pii_retention
  ON battalion_email_invites(responded_at, id)
  WHERE status IN ('ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

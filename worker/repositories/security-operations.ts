export type InvitationRateScope = "ACTOR" | "BATTALION" | "RECIPIENT" | "IP";
export type InvitationRateOutcome = "ALLOWED" | "COOLDOWN" | "QUOTA";
export type InvitationSource = "ACCOUNT" | "EMAIL";

export interface InvitationRateBucketInput {
  bucketKey: string;
  scope: InvitationRateScope;
  cooldownSeconds: number;
  windowSeconds: number;
  maximumAttempts: number;
}

export interface InvitationRateResultRow {
  scope: InvitationRateScope;
  attempt_count: number;
  window_started_at: number;
  next_allowed_at: number;
  last_outcome: InvitationRateOutcome;
}

export interface InvitationAuditInput {
  actorUserId: string;
  battalionId?: string;
  eventType: string;
  outcome: "ACCEPTED" | "REJECTED" | "FAILED";
  reasonCode: string;
  recipientHash: string;
  ipHash: string;
  metadata?: Record<string, unknown>;
  occurredAt: number;
}

export interface InvitationDeliveryJobRow {
  job_id: string;
  invitation_id: string;
  invitation_source: InvitationSource;
  attempt_count: number;
  expires_at: number;
  lease_token: string;
  actor_user_id: string;
  battalion_id: string;
  recipient_email: string;
  recipient_hash: string;
  ip_hash: string;
  battalion_name: string;
  invited_by: string;
  message: string;
  invite_code: string | null;
  command_id: string;
  request_hash: string;
}

export interface SecurityMaintenancePolicy {
  batchLimit: number;
  sessionRetentionSeconds: number;
  challengeRetentionSeconds: number;
  rateBucketRetentionSeconds: number;
  authAuditRetentionSeconds: number;
  invitationAuditRetentionSeconds: number;
  invitationPiiRetentionSeconds: number;
}

export interface SecurityMaintenanceResult {
  abandonedExpiredDeliveryJobs: number;
  expiredAuthChallenges: number;
  expiredAccountInvitations: number;
  expiredEmailInvitations: number;
  deletedExpiredSessions: number;
  deletedRevokedSessions: number;
  deletedConsumedAuthChallenges: number;
  deletedTerminalAuthChallenges: number;
  deletedAuthRateBuckets: number;
  deletedInvitationRateBuckets: number;
  deletedAuthAuditEvents: number;
  deletedInvitationAuditEvents: number;
  deletedAccountInvitationPii: number;
  deletedEmailInvitationPii: number;
}

function affected(result: D1Result<unknown>): number {
  return Number(result.meta.changes ?? result.results.length ?? 0);
}

export async function consumeInvitationRateBuckets(
  db: D1Database,
  buckets: InvitationRateBucketInput[],
  now: number,
): Promise<InvitationRateResultRow[]> {
  const statements = buckets.map((bucket) => db.prepare(`INSERT INTO battalion_invitation_rate_limits (
      bucket_key,scope,window_started_at,attempt_count,next_allowed_at,last_outcome,updated_at
    ) VALUES (?1,?2,?3,1,?3+?4,'ALLOWED',?3)
    ON CONFLICT(bucket_key) DO UPDATE SET
      scope=excluded.scope,
      window_started_at=CASE
        WHEN battalion_invitation_rate_limits.window_started_at<=?3-?5 THEN ?3
        ELSE battalion_invitation_rate_limits.window_started_at END,
      attempt_count=CASE
        WHEN battalion_invitation_rate_limits.window_started_at<=?3-?5 THEN 1
        ELSE battalion_invitation_rate_limits.attempt_count+1 END,
      next_allowed_at=CASE
        WHEN battalion_invitation_rate_limits.window_started_at<=?3-?5 THEN ?3+?4
        WHEN battalion_invitation_rate_limits.attempt_count>=?6 THEN battalion_invitation_rate_limits.next_allowed_at
        WHEN battalion_invitation_rate_limits.next_allowed_at>?3 THEN battalion_invitation_rate_limits.next_allowed_at
        ELSE ?3+?4 END,
      last_outcome=CASE
        WHEN battalion_invitation_rate_limits.window_started_at<=?3-?5 THEN 'ALLOWED'
        WHEN battalion_invitation_rate_limits.attempt_count>=?6 THEN 'QUOTA'
        WHEN battalion_invitation_rate_limits.next_allowed_at>?3 THEN 'COOLDOWN'
        ELSE 'ALLOWED' END,
      updated_at=?3
    RETURNING scope,attempt_count,window_started_at,next_allowed_at,last_outcome`)
    .bind(
      bucket.bucketKey,
      bucket.scope,
      now,
      bucket.cooldownSeconds,
      bucket.windowSeconds,
      bucket.maximumAttempts,
    ));
  const results = await db.batch<InvitationRateResultRow>(statements);
  return results.flatMap((result) => result.results);
}

export function invitationAuditStatement(db: D1Database, input: InvitationAuditInput): D1PreparedStatement {
  return db.prepare(`INSERT INTO battalion_invitation_audit_events (
      id,actor_user_id,battalion_id,event_type,outcome,reason_code,
      recipient_hash,ip_hash,metadata_json,occurred_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
    .bind(
      `invitation-audit-${crypto.randomUUID()}`,
      input.actorUserId,
      input.battalionId ?? null,
      input.eventType,
      input.outcome,
      input.reasonCode,
      input.recipientHash,
      input.ipHash,
      JSON.stringify(input.metadata ?? {}),
      input.occurredAt,
    );
}

export async function recordInvitationAudit(db: D1Database, input: InvitationAuditInput): Promise<void> {
  await invitationAuditStatement(db, input).run();
}

export function invitationDeliveryJobStatement(
  db: D1Database,
  input: {
    jobId: string;
    invitationId: string;
    invitationSource: InvitationSource;
    nextAttemptAt: number;
    expiresAt: number;
    recipientHash: string;
    ipHash: string;
    createdAt: number;
  },
): D1PreparedStatement {
  return db.prepare(`INSERT INTO battalion_invitation_delivery_jobs (
      id,invitation_id,invitation_source,status,attempt_count,next_attempt_at,
      expires_at,lease_until,recipient_hash,ip_hash,created_at,updated_at
    ) VALUES (?1,?2,?3,'PENDING',0,?4,?5,0,?6,?7,?8,?8)`)
    .bind(
      input.jobId,
      input.invitationId,
      input.invitationSource,
      input.nextAttemptAt,
      input.expiresAt,
      input.recipientHash,
      input.ipHash,
      input.createdAt,
    );
}

export async function claimInvitationDeliveryJobs(
  db: D1Database,
  input: { now: number; leaseToken: string; leaseSeconds: number; limit: number },
): Promise<InvitationDeliveryJobRow[]> {
  await db.prepare(`UPDATE battalion_invitation_delivery_jobs
      SET lease_token=?1,lease_until=?2,updated_at=?3
      WHERE id IN (
        SELECT id FROM battalion_invitation_delivery_jobs
        WHERE status='PENDING' AND next_attempt_at<=?3 AND expires_at>?3 AND lease_until<=?3
        ORDER BY next_attempt_at,id LIMIT ?4
      ) AND status='PENDING' AND lease_until<=?3`)
    .bind(input.leaseToken, input.now + input.leaseSeconds, input.now, input.limit)
    .run();
  const result = await db.prepare(`SELECT jobs.id AS job_id,jobs.invitation_id,jobs.invitation_source,
      jobs.attempt_count,jobs.expires_at,jobs.lease_token,
      invites.invited_by_user_id AS actor_user_id,invites.battalion_id,
      users.email AS recipient_email,jobs.recipient_hash,jobs.ip_hash,
      battalions.name AS battalion_name,profiles.display_name AS invited_by,
      invites.message,NULL AS invite_code,invites.command_id,invites.request_hash
    FROM battalion_invitation_delivery_jobs AS jobs
    JOIN battalion_invites AS invites ON jobs.invitation_source='ACCOUNT' AND invites.id=jobs.invitation_id
    JOIN users ON users.id=invites.invited_user_id AND users.status='ACTIVE'
    JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
    JOIN profiles ON profiles.user_id=invites.invited_by_user_id
    WHERE jobs.lease_token=?1 AND jobs.status='PENDING' AND invites.status='PENDING'
    UNION ALL
    SELECT jobs.id,jobs.invitation_id,jobs.invitation_source,jobs.attempt_count,
      jobs.expires_at,jobs.lease_token,invites.invited_by_user_id,invites.battalion_id,
      invites.recipient_email,jobs.recipient_hash,jobs.ip_hash,
      battalions.name,profiles.display_name,invites.message,
      upper(substr(invites.request_hash,1,16)),invites.command_id,invites.request_hash
    FROM battalion_invitation_delivery_jobs AS jobs
    JOIN battalion_email_invites AS invites ON jobs.invitation_source='EMAIL' AND invites.id=jobs.invitation_id
    JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
    JOIN profiles ON profiles.user_id=invites.invited_by_user_id
    WHERE jobs.lease_token=?1 AND jobs.status='PENDING' AND invites.status='PENDING'
    LIMIT ?2`)
    .bind(input.leaseToken, input.limit)
    .all<InvitationDeliveryJobRow>();
  return result.results;
}

export async function markInvitationDeliverySent(
  db: D1Database,
  input: { job: InvitationDeliveryJobRow; resendEmailId: string; now: number; audit: D1PreparedStatement },
): Promise<void> {
  const table = input.job.invitation_source === "ACCOUNT" ? "battalion_invites" : "battalion_email_invites";
  await db.batch([
    db.prepare(`UPDATE battalion_invitation_delivery_jobs
      SET status='SENT',attempt_count=attempt_count+1,lease_token=NULL,lease_until=0,
          last_error_code=NULL,updated_at=?1,completed_at=?1
      WHERE id=?2 AND status='PENDING' AND lease_token=?3`)
      .bind(input.now, input.job.job_id, input.job.lease_token),
    db.prepare(`UPDATE ${table} SET delivery_status='SENT',resend_email_id=?1
      WHERE id=?2 AND status='PENDING'`).bind(input.resendEmailId, input.job.invitation_id),
    db.prepare(`INSERT INTO strategic_events (
        event_id,event_type,battalion_id,actor_user_id,audience,subject_type,subject_id,
        summary,payload_json,event_hash,idempotency_key,occurred_at
      ) SELECT ?1,'BATTALION_INVITATION_SENT',?2,?3,'BATTALION','INVITATION',?4,
               'Battalion command issued a recruitment invitation.','{}',?5,?6,?7
        WHERE EXISTS (SELECT 1 FROM battalion_invitation_delivery_jobs
          WHERE id=?8 AND status='SENT')
      ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(
        `event:invitation-delivery:${input.job.job_id}`,
        input.job.battalion_id,
        input.job.actor_user_id,
        input.job.invitation_id,
        input.job.request_hash,
        `invitation-delivery:${input.job.job_id}`,
        input.now,
        input.job.job_id,
      ),
    input.audit,
  ]);
}

export async function markInvitationDeliveryFailed(
  db: D1Database,
  input: {
    job: InvitationDeliveryJobRow;
    now: number;
    nextAttemptAt: number;
    errorCode: string;
    abandon: boolean;
    audit: D1PreparedStatement;
  },
): Promise<void> {
  const table = input.job.invitation_source === "ACCOUNT" ? "battalion_invites" : "battalion_email_invites";
  const jobUpdate = input.abandon
    ? db.prepare(`UPDATE battalion_invitation_delivery_jobs
        SET status='ABANDONED',attempt_count=attempt_count+1,lease_token=NULL,lease_until=0,
            last_error_code=?1,updated_at=?2,completed_at=?2
        WHERE id=?3 AND status='PENDING' AND lease_token=?4`)
      .bind(input.errorCode, input.now, input.job.job_id, input.job.lease_token)
    : db.prepare(`UPDATE battalion_invitation_delivery_jobs
        SET attempt_count=attempt_count+1,next_attempt_at=?1,lease_token=NULL,lease_until=0,
            last_error_code=?2,updated_at=?3
        WHERE id=?4 AND status='PENDING' AND lease_token=?5`)
      .bind(input.nextAttemptAt, input.errorCode, input.now, input.job.job_id, input.job.lease_token);
  const invitationUpdate = input.abandon
    ? db.prepare(`UPDATE ${table}
        SET status='REVOKED',responded_at=?1,delivery_status='FAILED',revision=revision+1
        WHERE id=?2 AND status='PENDING'`).bind(input.now, input.job.invitation_id)
    : db.prepare(`UPDATE ${table} SET delivery_status='FAILED'
        WHERE id=?1 AND status='PENDING'`).bind(input.job.invitation_id);
  await db.batch([jobUpdate, invitationUpdate, input.audit]);
}

export async function runSecurityMaintenance(
  db: D1Database,
  now: number,
  policy: SecurityMaintenancePolicy,
): Promise<SecurityMaintenanceResult> {
  const limit = policy.batchLimit;
  const results = await db.batch([
    db.prepare(`UPDATE battalion_invitation_delivery_jobs
      SET status='ABANDONED',lease_token=NULL,lease_until=0,last_error_code='INVITATION_EXPIRED',
          updated_at=?1,completed_at=?1
      WHERE id IN (
        SELECT id FROM battalion_invitation_delivery_jobs
        WHERE status='PENDING' AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now, limit),
    db.prepare(`UPDATE auth_email_challenges SET status='EXPIRED'
      WHERE id IN (
        SELECT id FROM auth_email_challenges
        WHERE status IN ('PENDING','SENT') AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now, limit),
    db.prepare(`UPDATE battalion_invites SET status='EXPIRED',responded_at=?1,revision=revision+1
      WHERE id IN (
        SELECT id FROM battalion_invites
        WHERE status='PENDING' AND expires_at IS NOT NULL AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now, limit),
    db.prepare(`UPDATE battalion_email_invites SET status='EXPIRED',responded_at=?1,revision=revision+1
      WHERE id IN (
        SELECT id FROM battalion_email_invites
        WHERE status='PENDING' AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now, limit),
    db.prepare(`DELETE FROM user_sessions WHERE id IN (
        SELECT id FROM user_sessions
        WHERE revoked_at IS NULL AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.sessionRetentionSeconds, limit),
    db.prepare(`DELETE FROM user_sessions WHERE id IN (
        SELECT id FROM user_sessions
        WHERE revoked_at IS NOT NULL AND revoked_at<=?1
        ORDER BY revoked_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.sessionRetentionSeconds, limit),
    db.prepare(`DELETE FROM auth_email_challenges WHERE id IN (
        SELECT id FROM auth_email_challenges
        WHERE status='CONSUMED' AND consumed_at<=?1
        ORDER BY consumed_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.challengeRetentionSeconds, limit),
    db.prepare(`DELETE FROM auth_email_challenges WHERE id IN (
        SELECT id FROM auth_email_challenges
        WHERE status IN ('EXPIRED','SEND_FAILED','REVOKED') AND expires_at<=?1
        ORDER BY expires_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.challengeRetentionSeconds, limit),
    db.prepare(`DELETE FROM auth_rate_limits WHERE bucket_key IN (
        SELECT bucket_key FROM auth_rate_limits WHERE updated_at<=?1
        ORDER BY updated_at,bucket_key LIMIT ?2
      ) RETURNING bucket_key`).bind(now - policy.rateBucketRetentionSeconds, limit),
    db.prepare(`DELETE FROM battalion_invitation_rate_limits WHERE bucket_key IN (
        SELECT bucket_key FROM battalion_invitation_rate_limits WHERE updated_at<=?1
        ORDER BY updated_at,bucket_key LIMIT ?2
      ) RETURNING bucket_key`).bind(now - policy.rateBucketRetentionSeconds, limit),
    db.prepare(`DELETE FROM auth_audit_events WHERE id IN (
        SELECT id FROM auth_audit_events WHERE occurred_at<=?1
        ORDER BY occurred_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.authAuditRetentionSeconds, limit),
    db.prepare(`DELETE FROM battalion_invitation_audit_events WHERE id IN (
        SELECT id FROM battalion_invitation_audit_events WHERE occurred_at<=?1
        ORDER BY occurred_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.invitationAuditRetentionSeconds, limit),
    db.prepare(`DELETE FROM battalion_invites WHERE id IN (
        SELECT id FROM battalion_invites
        WHERE status IN ('ACCEPTED','DECLINED','EXPIRED','REVOKED') AND responded_at<=?1
        ORDER BY responded_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.invitationPiiRetentionSeconds, limit),
    db.prepare(`DELETE FROM battalion_email_invites WHERE id IN (
        SELECT id FROM battalion_email_invites
        WHERE status IN ('ACCEPTED','DECLINED','EXPIRED','REVOKED') AND responded_at<=?1
        ORDER BY responded_at,id LIMIT ?2
      ) RETURNING id`).bind(now - policy.invitationPiiRetentionSeconds, limit),
  ]);
  return {
    abandonedExpiredDeliveryJobs: affected(results[0]),
    expiredAuthChallenges: affected(results[1]),
    expiredAccountInvitations: affected(results[2]),
    expiredEmailInvitations: affected(results[3]),
    deletedExpiredSessions: affected(results[4]),
    deletedRevokedSessions: affected(results[5]),
    deletedConsumedAuthChallenges: affected(results[6]),
    deletedTerminalAuthChallenges: affected(results[7]),
    deletedAuthRateBuckets: affected(results[8]),
    deletedInvitationRateBuckets: affected(results[9]),
    deletedAuthAuditEvents: affected(results[10]),
    deletedInvitationAuditEvents: affected(results[11]),
    deletedAccountInvitationPii: affected(results[12]),
    deletedEmailInvitationPii: affected(results[13]),
  };
}

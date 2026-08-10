export interface OnboardingProgressRow {
  user_id: string;
  status: "IN_PROGRESS" | "COMPLETE" | "SKIPPED";
  current_step: "BATTALION" | "UNIT" | "TOUR" | "COMPLETE";
  revision: number;
}

export interface OnboardingPolicyRow {
  starter_charter_grant: number;
  battalion_creation_cost: number;
  maximum_battalions_per_creator: number;
  balance: number;
  charter_battalion_id: string | null;
}

export interface BattalionRecruitmentRow {
  battalion_id: string;
  name: string;
  short_name: string | null;
  description: string;
  motto: string;
  recruitment_kind: "NPC" | "PLAYER";
  access_policy: "PUBLIC" | "PRIVATE";
  join_enabled: number;
  engagement_summary: string;
  recruitment_rank_id: string;
  member_capacity: number;
  member_count: number;
  revision: number;
}

export interface ActiveBattalionRow extends BattalionRecruitmentRow {
  permissions: string | null;
}

export interface InvitationRow {
  invitation_id: string;
  battalion_id: string;
  battalion_name: string;
  invited_by: string;
  message: string;
  expires_at: number | null;
  source: "ACCOUNT" | "EMAIL";
}

export interface StarterDefinitionRow {
  id: string;
  ruleset_id: string;
  name: string;
  category: string;
  health_model: string;
  max_health: number;
  armor: number;
  defense: number;
  speed_quarters: number;
  sensor_range: number;
  implementation_status: string;
  executable: number;
}

export interface StarterGrantRow {
  player_unit_id: string;
  definition_id: string;
  name: string;
  callsign: string;
}

export interface OnboardingReceiptRow {
  operation: string;
  request_hash: string;
  response_json: string;
}

export interface JoinAuthorityRow {
  battalion_id: string;
  battalion_name: string;
  recruitment_rank_id: string;
  member_capacity: number;
  member_count: number;
  source: "PUBLIC" | "CODE" | "ACCOUNT" | "EMAIL";
  invitation_id: string | null;
}

export interface ActorBattalionAuthorityRow {
  battalion_id: string;
  battalion_name: string;
  recruitment_rank_id: string;
  settings_revision: number;
  permissions: string | null;
}

export interface InviteTargetRow {
  user_id: string | null;
  email: string;
  username: string | null;
  display_name: string | null;
}

export async function getOnboardingProgress(db: D1Database, userId: string): Promise<OnboardingProgressRow | null> {
  return db.prepare(`SELECT user_id,status,current_step,revision
      FROM onboarding_progress WHERE user_id=?1 LIMIT 1`).bind(userId).first<OnboardingProgressRow>();
}

export async function getOnboardingPolicy(db: D1Database, userId: string): Promise<OnboardingPolicyRow | null> {
  return db.prepare(`SELECT policies.starter_charter_grant,policies.battalion_creation_cost,
        policies.maximum_battalions_per_creator,
        COALESCE((SELECT SUM(amount) FROM requisition_transactions WHERE user_id=?1),0) AS balance,
        (SELECT battalion_id FROM battalion_creation_charters WHERE user_id=?1) AS charter_battalion_id
      FROM onboarding_economy_policies AS policies
      WHERE policies.id='production-onboarding-v1' LIMIT 1`).bind(userId).first<OnboardingPolicyRow>();
}

const recruitmentProjection = `battalions.id AS battalion_id,battalions.name,battalions.short_name,
  battalions.description,battalions.motto,settings.recruitment_kind,settings.access_policy,
  settings.join_enabled,settings.engagement_summary,settings.recruitment_rank_id,
  settings.member_capacity,settings.revision,
  (SELECT COUNT(*) FROM battalion_memberships AS members
    WHERE members.battalion_id=battalions.id AND members.status='ACTIVE') AS member_count`;

export async function listPublicBattalions(db: D1Database): Promise<BattalionRecruitmentRow[]> {
  const result = await db.prepare(`SELECT ${recruitmentProjection}
      FROM battalions
      JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id
      WHERE battalions.status='ACTIVE' AND settings.access_policy='PUBLIC'
        AND settings.join_enabled=1 AND length(trim(settings.engagement_summary))>0
        AND (SELECT COUNT(*) FROM battalion_memberships AS members
              WHERE members.battalion_id=battalions.id AND members.status='ACTIVE') < settings.member_capacity
      ORDER BY CASE settings.recruitment_kind WHEN 'NPC' THEN 0 ELSE 1 END,
               battalions.name COLLATE NOCASE,battalions.id
      LIMIT 100`).all<BattalionRecruitmentRow>();
  return result.results;
}

export async function getActiveOnboardingBattalion(db: D1Database, userId: string): Promise<ActiveBattalionRow | null> {
  return db.prepare(`SELECT ${recruitmentProjection},
      GROUP_CONCAT(CASE WHEN definitions.implementation_status='ACTIVE' THEN permissions.permission END) AS permissions
    FROM user_active_battalions AS active
    JOIN battalion_memberships AS membership
      ON membership.battalion_id=active.battalion_id AND membership.user_id=active.user_id
     AND membership.status='ACTIVE'
    JOIN battalions ON battalions.id=active.battalion_id AND battalions.status='ACTIVE'
    JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id
    LEFT JOIN rank_permissions AS permissions ON permissions.rank_id=membership.rank_id
    LEFT JOIN battalion_permission_definitions AS definitions ON definitions.permission=permissions.permission
    WHERE active.user_id=?1
    GROUP BY battalions.id LIMIT 1`).bind(userId).first<ActiveBattalionRow>();
}

export async function listPendingInvitations(db: D1Database, userId: string): Promise<InvitationRow[]> {
  const result = await db.prepare(`SELECT invites.id AS invitation_id,invites.battalion_id,
        battalions.name AS battalion_name,profiles.display_name AS invited_by,
        invites.message,invites.expires_at,'ACCOUNT' AS source
      FROM battalion_invites AS invites
      JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
      JOIN profiles ON profiles.user_id=invites.invited_by_user_id
      WHERE invites.invited_user_id=?1 AND invites.status='PENDING'
        AND (invites.expires_at IS NULL OR invites.expires_at>unixepoch())
      UNION ALL
      SELECT invites.id AS invitation_id,invites.battalion_id,
        battalions.name AS battalion_name,profiles.display_name AS invited_by,
        invites.message,invites.expires_at,'EMAIL' AS source
      FROM battalion_email_invites AS invites
      JOIN users ON users.id=?1 AND users.email=invites.recipient_email COLLATE NOCASE
      JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
      JOIN profiles ON profiles.user_id=invites.invited_by_user_id
      WHERE invites.status='PENDING' AND invites.expires_at>unixepoch()
      ORDER BY expires_at,invitation_id`).bind(userId).all<InvitationRow>();
  return result.results;
}

export async function listStarterDefinitions(db: D1Database): Promise<StarterDefinitionRow[]> {
  const result = await db.prepare(`SELECT definitions.id,definitions.ruleset_id,definitions.name,
      definitions.category,definitions.health_model,definitions.max_health,
      definitions.armor,definitions.defense,definitions.speed_quarters,definitions.sensor_range,
      overlays.implementation_status,overlays.executable
    FROM unit_class_definitions AS definitions
    JOIN rulesets ON rulesets.id=definitions.ruleset_id AND rulesets.status='ACTIVE'
    JOIN ruleset_implementation_overlays AS overlays
      ON overlays.definition_kind='UNIT' AND overlays.definition_id=definitions.id
     AND overlays.ruleset_id=definitions.ruleset_id
    WHERE definitions.id IN ('unit-infantry-squad','unit-light-vehicle','unit-main-battle-tank')
      AND definitions.definition_status='active' AND overlays.executable=1
      AND overlays.implementation_status IN ('IMPLEMENTED','PARTIAL')
    ORDER BY CASE definitions.id
      WHEN 'unit-infantry-squad' THEN 1 WHEN 'unit-light-vehicle' THEN 2 ELSE 3 END`).all<StarterDefinitionRow>();
  return result.results;
}

export async function getStarterGrant(db: D1Database, userId: string): Promise<StarterGrantRow | null> {
  return db.prepare(`SELECT grants.player_unit_id,grants.definition_id,units.name,units.callsign
      FROM onboarding_starter_unit_grants AS grants
      JOIN player_units AS units ON units.id=grants.player_unit_id AND units.owner_id=grants.user_id
      WHERE grants.user_id=?1 LIMIT 1`).bind(userId).first<StarterGrantRow>();
}

export async function getOnboardingReceipt(db: D1Database, userId: string, commandId: string): Promise<OnboardingReceiptRow | null> {
  return db.prepare(`SELECT operation,request_hash,response_json
      FROM onboarding_command_receipts WHERE user_id=?1 AND command_id=?2 LIMIT 1`)
    .bind(userId, commandId).first<OnboardingReceiptRow>();
}

export async function getPublicJoinAuthority(db: D1Database, battalionId: string): Promise<JoinAuthorityRow | null> {
  return db.prepare(`SELECT battalions.id AS battalion_id,battalions.name AS battalion_name,
      settings.recruitment_rank_id,settings.member_capacity,
      (SELECT COUNT(*) FROM battalion_memberships AS members
        WHERE members.battalion_id=battalions.id AND members.status='ACTIVE') AS member_count,
      'PUBLIC' AS source,NULL AS invitation_id
    FROM battalions JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id
    WHERE battalions.id=?1 AND battalions.status='ACTIVE'
      AND settings.access_policy='PUBLIC' AND settings.join_enabled=1
      AND length(trim(settings.engagement_summary))>0 LIMIT 1`).bind(battalionId).first<JoinAuthorityRow>();
}

export async function getCodeJoinAuthority(db: D1Database, userId: string, codeHash: string): Promise<JoinAuthorityRow | null> {
  return db.prepare(`SELECT battalions.id AS battalion_id,battalions.name AS battalion_name,
      settings.recruitment_rank_id,settings.member_capacity,
      (SELECT COUNT(*) FROM battalion_memberships AS members
        WHERE members.battalion_id=battalions.id AND members.status='ACTIVE') AS member_count,
      'CODE' AS source,NULL AS invitation_id
    FROM battalions JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id
    WHERE battalions.status='ACTIVE' AND settings.join_enabled=1 AND settings.invite_code_hash=?2
    UNION ALL
    SELECT battalions.id,battalions.name,invites.rank_id,settings.member_capacity,
      (SELECT COUNT(*) FROM battalion_memberships AS members
        WHERE members.battalion_id=battalions.id AND members.status='ACTIVE'),
      'EMAIL' AS source,invites.id
    FROM battalion_email_invites AS invites
    JOIN users ON users.id=?1 AND users.email=invites.recipient_email COLLATE NOCASE
    JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
    JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id AND settings.join_enabled=1
    WHERE invites.token_hash=?2 AND invites.status='PENDING' AND invites.expires_at>unixepoch()
    LIMIT 1`).bind(userId, codeHash).first<JoinAuthorityRow>();
}

export async function getInvitationJoinAuthority(db: D1Database, userId: string, invitationId: string): Promise<JoinAuthorityRow | null> {
  return db.prepare(`SELECT battalions.id AS battalion_id,battalions.name AS battalion_name,
      invites.rank_id AS recruitment_rank_id,settings.member_capacity,
      (SELECT COUNT(*) FROM battalion_memberships AS members
        WHERE members.battalion_id=battalions.id AND members.status='ACTIVE') AS member_count,
      'ACCOUNT' AS source,invites.id AS invitation_id
    FROM battalion_invites AS invites
    JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
    JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id AND settings.join_enabled=1
    WHERE invites.id=?2 AND invites.invited_user_id=?1 AND invites.status='PENDING'
      AND (invites.expires_at IS NULL OR invites.expires_at>unixepoch())
    UNION ALL
    SELECT battalions.id,battalions.name,invites.rank_id,settings.member_capacity,
      (SELECT COUNT(*) FROM battalion_memberships AS members
        WHERE members.battalion_id=battalions.id AND members.status='ACTIVE'),
      'EMAIL' AS source,invites.id
    FROM battalion_email_invites AS invites
    JOIN users ON users.id=?1 AND users.email=invites.recipient_email COLLATE NOCASE
    JOIN battalions ON battalions.id=invites.battalion_id AND battalions.status='ACTIVE'
    JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id AND settings.join_enabled=1
    WHERE invites.id=?2 AND invites.status='PENDING' AND invites.expires_at>unixepoch()
    LIMIT 1`).bind(userId, invitationId).first<JoinAuthorityRow>();
}

export async function getActorBattalionAuthority(db: D1Database, userId: string): Promise<ActorBattalionAuthorityRow | null> {
  return db.prepare(`SELECT battalions.id AS battalion_id,battalions.name AS battalion_name,
      settings.recruitment_rank_id,settings.revision AS settings_revision,
      GROUP_CONCAT(CASE WHEN definitions.implementation_status='ACTIVE' THEN permissions.permission END) AS permissions
    FROM user_active_battalions AS active
    JOIN battalion_memberships AS membership
      ON membership.battalion_id=active.battalion_id AND membership.user_id=active.user_id AND membership.status='ACTIVE'
    JOIN battalions ON battalions.id=membership.battalion_id AND battalions.status='ACTIVE'
    JOIN battalion_recruitment_settings AS settings ON settings.battalion_id=battalions.id
    LEFT JOIN rank_permissions AS permissions ON permissions.rank_id=membership.rank_id
    LEFT JOIN battalion_permission_definitions AS definitions ON definitions.permission=permissions.permission
    WHERE active.user_id=?1 GROUP BY battalions.id LIMIT 1`).bind(userId).first<ActorBattalionAuthorityRow>();
}

export async function getInviteTarget(db: D1Database, targetType: "USERNAME" | "EMAIL", target: string): Promise<InviteTargetRow | null> {
  if (targetType === "USERNAME") {
    return db.prepare(`SELECT users.id AS user_id,users.email,users.username,profiles.display_name
      FROM users JOIN profiles ON profiles.user_id=users.id
      WHERE users.username=?1 COLLATE NOCASE AND users.status='ACTIVE' LIMIT 1`).bind(target).first<InviteTargetRow>();
  }
  const registered = await db.prepare(`SELECT users.id AS user_id,users.email,users.username,profiles.display_name
      FROM users JOIN profiles ON profiles.user_id=users.id
      WHERE users.email=?1 COLLATE NOCASE AND users.status='ACTIVE' LIMIT 1`).bind(target).first<InviteTargetRow>();
  return registered ?? { user_id: null, email: target, username: null, display_name: null };
}

export async function getStarterDefinition(db: D1Database, definitionId: string): Promise<StarterDefinitionRow | null> {
  return db.prepare(`SELECT definitions.id,definitions.ruleset_id,definitions.name,
      definitions.category,definitions.health_model,definitions.max_health,
      definitions.armor,definitions.defense,definitions.speed_quarters,definitions.sensor_range,
      overlays.implementation_status,overlays.executable
    FROM unit_class_definitions AS definitions
    JOIN rulesets ON rulesets.id=definitions.ruleset_id AND rulesets.status='ACTIVE'
    JOIN ruleset_implementation_overlays AS overlays
      ON overlays.definition_kind='UNIT' AND overlays.definition_id=definitions.id
     AND overlays.ruleset_id=definitions.ruleset_id
    WHERE definitions.id=?1
      AND definitions.id IN ('unit-infantry-squad','unit-light-vehicle','unit-main-battle-tank')
      AND definitions.definition_status='active' AND overlays.executable=1
      AND overlays.implementation_status IN ('IMPLEMENTED','PARTIAL') LIMIT 1`)
    .bind(definitionId).first<StarterDefinitionRow>();
}

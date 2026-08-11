PRAGMA foreign_keys = ON;

INSERT INTO onboarding_economy_policies (
  id, starter_charter_grant, battalion_creation_cost,
  maximum_battalions_per_creator, revision
) VALUES ('production-onboarding-v1', 100, 100, 1, 1)
ON CONFLICT(id) DO UPDATE SET
  starter_charter_grant = excluded.starter_charter_grant,
  battalion_creation_cost = excluded.battalion_creation_cost,
  maximum_battalions_per_creator = excluded.maximum_battalions_per_creator,
  revision = onboarding_economy_policies.revision;

INSERT INTO battalion_permission_definitions (permission, description, implementation_status) VALUES
  ('BATTALION_EDIT', 'Edit Battalion public identity and recruitment configuration.', 'ACTIVE'),
  ('MEMBER_INVITE', 'Invite a player to the Battalion.', 'ACTIVE'),
  ('MEMBER_REMOVE', 'Remove an eligible ordinary member from the Battalion.', 'ACTIVE'),
  ('RANK_MANAGE', 'Create, edit, delete and assign Battalion ranks.', 'ACTIVE'),
  ('BATTLEGROUP_CREATE', 'Create a persistent Battlegroup.', 'ACTIVE'),
  ('BATTLEGROUP_EDIT', 'Edit a Battlegroup identity, objective, and leader.', 'ACTIVE'),
  ('BATTLEGROUP_ASSIGN', 'Assign eligible persistent units to a Battlegroup.', 'ACTIVE'),
  ('SHIP_VIEW', 'View Battalion ship and module state.', 'ACTIVE')
ON CONFLICT(permission) DO UPDATE SET
  description = excluded.description,
  implementation_status = excluded.implementation_status;

INSERT INTO users (id, email, username, status, email_verified_at) VALUES
  ('system-onboarding-director', 'onboarding-director@system.corinth.invalid', 'onboarding-director', 'ACTIVE', unixepoch())
ON CONFLICT(id) DO UPDATE SET status = 'ACTIVE';

INSERT INTO profiles (user_id, display_name, callsign, biography) VALUES
  ('system-onboarding-director', 'Battalion Assignment Directorate', 'BAD', 'System-owned recruitment authority for onboarding Battalions.')
ON CONFLICT(user_id) DO UPDATE SET
  display_name = excluded.display_name,
  callsign = excluded.callsign,
  biography = excluded.biography;

INSERT INTO battalions (
  id, name, short_name, description, motto, insignia_key, created_by, status, revision
) VALUES
  ('battalion-npc-corinth-line', '12th Corinthian Line', '12CL', 'A line formation holding the approaches to Corinth and accepting new commanders.', 'Hold the line. Carry the names.', 'npc-line', 'system-onboarding-director', 'ACTIVE', 1),
  ('battalion-npc-expeditionary-support', '8th Expeditionary Support', '8ES', 'A combined logistics and engineering formation sustaining active expeditionary operations.', 'No force fights alone.', 'npc-support', 'system-onboarding-director', 'ACTIVE', 1),
  ('battalion-npc-nightwatch', 'Nightwatch Reconnaissance', 'NWR', 'A mobile reconnaissance formation screening threatened corridors and reporting enemy movement.', 'See first. Return with truth.', 'npc-recon', 'system-onboarding-director', 'ACTIVE', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  motto = excluded.motto,
  insignia_key = excluded.insignia_key,
  status = 'ACTIVE';

INSERT INTO battalion_ranks (id, battalion_id, name, precedence, revision, updated_at) VALUES
  ('rank-npc-corinth-line-command', 'battalion-npc-corinth-line', 'Director', 1, 1, unixepoch()),
  ('rank-npc-corinth-line-recruit', 'battalion-npc-corinth-line', 'Line Commander', 100, 1, unixepoch()),
  ('rank-npc-support-command', 'battalion-npc-expeditionary-support', 'Director', 1, 1, unixepoch()),
  ('rank-npc-support-recruit', 'battalion-npc-expeditionary-support', 'Support Commander', 100, 1, unixepoch()),
  ('rank-npc-nightwatch-command', 'battalion-npc-nightwatch', 'Director', 1, 1, unixepoch()),
  ('rank-npc-nightwatch-recruit', 'battalion-npc-nightwatch', 'Scout Commander', 100, 1, unixepoch())
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  precedence = excluded.precedence,
  updated_at = battalion_ranks.updated_at;

INSERT INTO rank_permissions (rank_id, permission) VALUES
  ('rank-npc-corinth-line-command', 'BATTALION_EDIT'),
  ('rank-npc-corinth-line-command', 'MEMBER_INVITE'),
  ('rank-npc-corinth-line-command', 'MEMBER_REMOVE'),
  ('rank-npc-corinth-line-command', 'RANK_MANAGE'),
  ('rank-npc-support-command', 'BATTALION_EDIT'),
  ('rank-npc-support-command', 'MEMBER_INVITE'),
  ('rank-npc-support-command', 'MEMBER_REMOVE'),
  ('rank-npc-support-command', 'RANK_MANAGE'),
  ('rank-npc-nightwatch-command', 'BATTALION_EDIT'),
  ('rank-npc-nightwatch-command', 'MEMBER_INVITE'),
  ('rank-npc-nightwatch-command', 'MEMBER_REMOVE'),
  ('rank-npc-nightwatch-command', 'RANK_MANAGE')
ON CONFLICT(rank_id, permission) DO NOTHING;

INSERT INTO rank_permissions (rank_id, permission)
SELECT ranks.id, permissions.permission
  FROM battalion_ranks AS ranks
  CROSS JOIN (
    SELECT 'BATTLEGROUP_CREATE' AS permission
    UNION ALL SELECT 'BATTLEGROUP_EDIT'
    UNION ALL SELECT 'BATTLEGROUP_ASSIGN'
  ) AS permissions
 WHERE ranks.id IN (
   'rank-npc-corinth-line-recruit',
   'rank-npc-support-recruit',
   'rank-npc-nightwatch-recruit'
 )
ON CONFLICT(rank_id, permission) DO NOTHING;

INSERT INTO battalion_memberships (
  battalion_id, user_id, rank_id, status, command_role,
  joined_at, status_changed_at, revision, updated_at
) VALUES
  ('battalion-npc-corinth-line', 'system-onboarding-director', 'rank-npc-corinth-line-command', 'ACTIVE', 'ADMIN', unixepoch(), unixepoch(), 1, unixepoch()),
  ('battalion-npc-expeditionary-support', 'system-onboarding-director', 'rank-npc-support-command', 'ACTIVE', 'ADMIN', unixepoch(), unixepoch(), 1, unixepoch()),
  ('battalion-npc-nightwatch', 'system-onboarding-director', 'rank-npc-nightwatch-command', 'ACTIVE', 'ADMIN', unixepoch(), unixepoch(), 1, unixepoch())
ON CONFLICT(battalion_id, user_id) DO UPDATE SET
  rank_id = excluded.rank_id,
  status = 'ACTIVE',
  command_role = 'ADMIN',
  status_changed_at = battalion_memberships.status_changed_at,
  updated_at = battalion_memberships.updated_at;

INSERT INTO battalion_recruitment_settings (
  battalion_id, recruitment_kind, access_policy, join_enabled,
  engagement_summary, recruitment_rank_id, invite_code_hash,
  member_capacity, creation_cost, revision
) VALUES
  ('battalion-npc-corinth-line', 'NPC', 'PUBLIC', 1, 'Holding the Aster Gate approaches to Corinth.', 'rank-npc-corinth-line-recruit', 'npc-no-public-code-corinth-line', 500, 0, 1),
  ('battalion-npc-expeditionary-support', 'NPC', 'PUBLIC', 1, 'Sustaining the Lacon Relay expeditionary corridor.', 'rank-npc-support-recruit', 'npc-no-public-code-expeditionary-support', 500, 0, 1),
  ('battalion-npc-nightwatch', 'NPC', 'PUBLIC', 1, 'Screening Kestrel Reach for hostile movement.', 'rank-npc-nightwatch-recruit', 'npc-no-public-code-nightwatch', 500, 0, 1)
ON CONFLICT(battalion_id) DO UPDATE SET
  recruitment_kind = 'NPC',
  access_policy = 'PUBLIC',
  join_enabled = 1,
  engagement_summary = excluded.engagement_summary,
  recruitment_rank_id = excluded.recruitment_rank_id,
  member_capacity = excluded.member_capacity,
  creation_cost = 0;

-- Public foundation operation available to newly onboarded commanders. The
-- authored tactical content is versioned in the Worker by this map source key.
INSERT INTO planets (id,name,strategic_coord_json,environment_json,war_state_json)
VALUES (
  'planet-corinth','Corinth','{"q":17,"r":-8}',
  '{"biome":"TEMPERATE_FRONTIER","contentPack":"foundation-public-v1"}',
  '{"contested":true,"primaryThreat":"BUG_SWARM"}'
)
ON CONFLICT(id) DO UPDATE SET
  environment_json = excluded.environment_json,
  war_state_json = excluded.war_state_json;

INSERT INTO campaigns (
  id,planet_id,ruleset_id,name,status,round_duration_ms,map_source_key,
  minimum_players,maximum_players,created_by,force_policy_json,strategic_status
) VALUES (
  'campaign-k17-relay','planet-corinth','ruleset-v5-core-curated-1',
  'K-17: Hold the Relay','RECRUITING',300000,'fixture/outpost-k17',
  1,500,'system-onboarding-director',
  '{"allowedDefinitions":["unit-infantry-squad","unit-light-vehicle","unit-main-battle-tank"],"maximumUnits":8}',
  'MUSTERING'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  status = CASE WHEN campaigns.status IN ('COMPLETE','FAILED') THEN campaigns.status ELSE excluded.status END,
  round_duration_ms = excluded.round_duration_ms,
  map_source_key = excluded.map_source_key,
  force_policy_json = excluded.force_policy_json;

INSERT INTO campaign_insertion_zones (
  id,campaign_id,hex_q,hex_r,allowed_methods_json,status,environment_json
) VALUES (
  'k17-relay-western-approach','campaign-k17-relay',-4,1,
  '["STANDARD_GROUND"]','OPEN','["CLEAR_APPROACH"]'
)
ON CONFLICT(id) DO UPDATE SET
  hex_q = excluded.hex_q,
  hex_r = excluded.hex_r,
  allowed_methods_json = excluded.allowed_methods_json,
  status = excluded.status,
  environment_json = excluded.environment_json;

-- Existing verified human accounts enter the guided flow on rollout. Local
-- fixtures and system identities use the reserved .invalid suffix and remain
-- untouched.
INSERT INTO onboarding_progress (user_id, status, current_step)
SELECT id, 'IN_PROGRESS', 'BATTALION'
  FROM users
 WHERE status = 'ACTIVE'
   AND email_verified_at IS NOT NULL
   AND email NOT LIKE '%.invalid'
ON CONFLICT(user_id) DO NOTHING;

INSERT INTO requisition_transactions (
  id, user_id, amount, reason_code, description,
  related_entity_type, related_entity_id, idempotency_key
)
SELECT 'req:onboarding-charter:' || users.id,
       users.id,
       policies.starter_charter_grant,
       'ONBOARDING_CHARTER_GRANT',
       'One-time command charter grant.',
       'ONBOARDING', users.id,
       'onboarding-charter-grant:' || users.id
  FROM users
 CROSS JOIN onboarding_economy_policies AS policies
 WHERE policies.id = 'production-onboarding-v1'
   AND users.status = 'ACTIVE'
   AND users.email_verified_at IS NOT NULL
   AND users.email NOT LIKE '%.invalid'
ON CONFLICT(idempotency_key) DO NOTHING;

PRAGMA foreign_keys = ON;

-- Campaign entry is a gameplay command, not an onboarding command. Keep its
-- idempotency receipts in a campaign-owned table so the onboarding operation
-- constraint remains narrow and existing deployments can replay safely.
CREATE TABLE campaign_join_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
    CHECK (json_valid(response_json) AND json_type(response_json) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, command_id)
);

CREATE INDEX idx_campaign_join_receipts_campaign
  ON campaign_join_receipts(campaign_id, created_at);

-- Starter units must be deployable without an officer manually repairing the
-- onboarding result. Give every existing starter grant a small persistent
-- formation in the user's active Battalion, then attach the unit to it.
INSERT INTO battlegroups (
  id,battalion_id,name,objective,leader_user_id,persistent,status,updated_at
)
SELECT 'battlegroup-starter:' || grants.player_unit_id,
       active.battalion_id,
       'Starter Detachment ' || substr(grants.player_unit_id, -8),
       'First field command.',grants.user_id,1,'READY',unixepoch()
  FROM onboarding_starter_unit_grants AS grants
  JOIN user_active_battalions AS active ON active.user_id=grants.user_id
 WHERE NOT EXISTS (
   SELECT 1 FROM battlegroups WHERE id='battlegroup-starter:' || grants.player_unit_id
 );

INSERT INTO battlegroup_units (battlegroup_id,player_unit_id,delegated_command)
SELECT 'battlegroup-starter:' || grants.player_unit_id,grants.player_unit_id,0
  FROM onboarding_starter_unit_grants AS grants
 WHERE EXISTS (
   SELECT 1 FROM battlegroups WHERE id='battlegroup-starter:' || grants.player_unit_id
 )
ON CONFLICT(battlegroup_id,player_unit_id) DO NOTHING;

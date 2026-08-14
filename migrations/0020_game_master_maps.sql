PRAGMA foreign_keys = ON;

-- Versioned Game Master-authored tactical map documents. Drafts remain
-- editable; only an exact PUBLISHED revision/hash may become runtime content.
CREATE TABLE game_master_maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  planet_id TEXT REFERENCES planets(id) ON DELETE SET NULL,
  preset TEXT NOT NULL CHECK (preset IN (
    'DESERT_CONTINENT', 'URBAN_CONTINENT', 'ISLANDS', 'MIXED', 'ICY'
  )),
  seed TEXT NOT NULL CHECK (length(seed) BETWEEN 1 AND 128),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  generator_version TEXT NOT NULL,
  vocabulary_version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 71 AND substr(content_hash, 1, 7) = 'sha256:'
    AND substr(content_hash, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  mechanics_mapping_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(mechanics_mapping_json) AND json_type(mechanics_mapping_json) = 'object'),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  last_mutation_token TEXT NOT NULL,
  UNIQUE (created_by_user_id, name),
  CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL)),
  CHECK ((status = 'PUBLISHED') = (published_by_user_id IS NOT NULL))
);

CREATE INDEX idx_game_master_maps_status_updated
  ON game_master_maps(status, updated_at DESC, id DESC);
CREATE INDEX idx_game_master_maps_planet
  ON game_master_maps(planet_id, status, updated_at DESC);

-- Every saved revision remains addressable so a published campaign can pin
-- the exact authoring document it was created from.
CREATE TABLE game_master_map_revisions (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES game_master_maps(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 71 AND substr(content_hash, 1, 7) = 'sha256:'
    AND substr(content_hash, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  generator_version TEXT NOT NULL,
  vocabulary_version TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  mechanics_mapping_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(mechanics_mapping_json) AND json_type(mechanics_mapping_json) = 'object'),
  authored_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (map_id, revision)
);

CREATE INDEX idx_game_master_map_revisions_map
  ON game_master_map_revisions(map_id, revision DESC);

ALTER TABLE campaigns ADD COLUMN game_master_map_revision_id TEXT
  REFERENCES game_master_map_revisions(id) ON DELETE RESTRICT;

-- Authoring receipts are separate from runtime-command receipts because map
-- drafts and campaign creation do not always have a campaign target yet.
CREATE TABLE game_master_authoring_receipts (
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'MAP_SAVE', 'MAP_PUBLISH', 'CAMPAIGN_CREATE'
  )),
  target_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  reservation_token TEXT NOT NULL CHECK (length(reservation_token) BETWEEN 16 AND 128),
  status_code INTEGER CHECK (status_code BETWEEN 200 AND 599),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  CHECK ((status_code IS NULL) = (response_json IS NULL)),
  CHECK ((status_code IS NULL) = (completed_at IS NULL)),
  PRIMARY KEY (actor_user_id, command_id)
);

CREATE INDEX idx_game_master_authoring_receipts_target
  ON game_master_authoring_receipts(target_id, created_at DESC);
CREATE INDEX idx_game_master_authoring_receipts_incomplete
  ON game_master_authoring_receipts(completed_at, created_at);

CREATE TABLE game_master_authoring_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  grant_source TEXT NOT NULL CHECK (grant_source IN ('GLOBAL_GRANT', 'DEVELOPMENT_DEMO')),
  operation TEXT NOT NULL CHECK (operation IN (
    'MAP_SAVE', 'MAP_PUBLISH', 'CAMPAIGN_CREATE'
  )),
  target_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (actor_user_id, command_id)
);

CREATE INDEX idx_game_master_authoring_audit_target
  ON game_master_authoring_audit_events(target_id, occurred_at DESC, id DESC);

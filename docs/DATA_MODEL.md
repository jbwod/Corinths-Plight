# Corinth's Plight Data Model

**Status:** Reconciled implemented schema plus target deltas (2026-08-09)

**Scope:** `migrations/0001_platform_and_rules.sql`, `migrations/0002_persistent_world.sql`, `seeds/v5-core-curated.sql`, and current Campaign Durable Object storage

## 1. Authority and status

| Label | Meaning |
|---|---|
| **Implemented schema** | SQL or DO record shape exists now |
| **Implemented use** | Current Worker/DO code reads or writes it now |
| **Target** | Required by the accepted architecture but not yet implemented |

D1 is intended to own global identity, ownership, economy, organisation, ship, campaign-registry, and archive truth. One named Durable Object owns the mutable state of one active campaign. In the current foundation, most D1 persistent-world tables are schema-first: the Worker actively uses `users`, `user_sessions`, `campaigns`, and `campaign_memberships` for access control, while purchase, deployment, archive, and persistent-effect services remain to be built.

The current K-17 DO is authoritative only for its demo battlefield. It must not be mistaken for completed D1/DO reconciliation.

## 2. Representation conventions

- IDs are `TEXT`; trusted server code is expected to generate opaque stable values. The SQL does not itself prescribe UUID/ULID format.
- D1 timestamp columns are integers; defaulted `created_at`/similar fields use Unix seconds through `unixepoch()`. Explicit fields such as `lock_at`, `resolves_at`, and `occurred_at` do not encode a unit in SQL and are not written by the current runtime. DO/domain timestamps use JavaScript milliseconds through `Date.now()`, so adapters must define and convert units explicitly.
- D1 rules movement/action values use integer quarter-points (`speed_quarters`, `movement_cost_quarters`, `speed_cost_quarters`). Current TypeScript domain/engine values use whole speed units and exact fractional numbers such as `0.5`; a D1 catalogue adapter is not implemented yet.
- Hexes use integer axial coordinates `{q, r}` in JSON/domain state.
- `json_valid(...)` checks JSON syntax in D1; it does not make the payload conform to a TypeScript interface. `packages/domain/src/index.ts` currently contains compile-time interfaces, not runtime validators.
- Definition identity is the composite primary key `(id, ruleset_id)`. There is no separate `slug`, `schema_version`, or `definition_hash` column in the current migrations.
- Archived event order is the unique tuple `(campaign_id, round_number, sequence)`, not timestamp order.

## 3. Implemented D1 schema

The two migrations create the following exact table families. Field lists below reflect the landed SQL, not the richer target protocol.

### 3.1 Identity and sessions

| Table | Implemented fields | Enforced constraints |
|---|---|---|
| `users` | `id`, `email`, `username`, `status`, `created_at`, `updated_at` | PK `id`; case-insensitive unique email/username; status is `ACTIVE`, `SUSPENDED`, or `DELETED`; no password column |
| `profiles` | `user_id`, `display_name`, `callsign`, `image_key`, `biography`, `created_at`, `updated_at` | One row per user; cascade on user delete |
| `user_sessions` | `id`, `user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`, `ip_hash`, `user_agent_hash` | Unique token hash; expiry after creation; active-session partial index |

`worker/auth.ts` hashes the `corinth_session` cookie with SHA-256 and accepts only an unexpired, unrevoked row joined to an `ACTIVE` user. No code currently issues, rotates, revokes, or recovers sessions, and there is no production login/provider flow.

### 3.2 Rulesets, provenance, and conflicts

| Table | Implemented fields | Enforced constraints |
|---|---|---|
| `rulesets` | `id`, `version`, `name`, `status`, `engine_version`, `authority_notes`, `published_at`, `created_at` | Unique version; status `DRAFT`, `ACTIVE`, or `RETIRED` |
| `ruleset_sources` | `id`, `ruleset_id`, `source_path`, `source_sha256`, `authority_rank`, `source_status`, `notes` | Unique `(ruleset_id, source_path)`; source status `PRIMARY`, `ERRATA`, `COMPANION`, or `LEGACY` |
| `rule_conflicts` | `id`, `ruleset_id`, `category`, `summary`, `sources_json`, `disposition`, `status`, `notes` | Valid JSON; status `RESOLVED_FOR_PROFILE`, `OPEN`, `DEFERRED`, or `INCOMPLETE_DATA` |

The index named `idx_one_active_ruleset_version` is unique on `version` only when active. Because `rulesets.version` is already unique, it does **not** enforce a single active ruleset across all versions.

The published catalogue is split between `seeds/v5-core-curated.sql` and `seeds/v5-phase2-combined-arms.sql`; `npm run db:seed:local` executes both with Wrangler. `seeds/development-forces.sql` is an explicit local-only roster fixture. `npm run seed:check` runs `scripts/validate-seed.ts`, which checks source hashes, duplicate/missing IDs, runtime-versus-SQL status, provenance, the active ruleset, and the Phase 2 player/enemy catalogue. It does not compare every definition field or generate the runtime catalogue.

The seed uses `ON CONFLICT ... DO UPDATE`. Therefore “published rules are immutable” is currently application/release policy, not an SQL guarantee: rerunning a changed seed can update selected published fields. A content hash and immutable-publication guard are target work.

### 3.3 Definition tables

Every definition table has composite PK `(id, ruleset_id)` and a foreign key to `rulesets`. Current columns are:

| Table | Implemented definition fields |
|---|---|
| `unit_class_definitions` | `id`, `ruleset_id`, `name`, `category`, `health_model`, `max_health`, `armor`, `defense`, `speed_quarters`, `sensor_range`, `requisition_cost`, `definition_status`, `source`, `notes`, `definition_json` |
| `weapon_definitions` | `id`, `ruleset_id`, `name`, `damage_dice_count`, `damage_die_sides`, `damage_modifier`, `armor_piercing`, `range_hexes`, `ammo_capacity`, `cooldown_rounds`, `indirect`, `definition_status`, `source`, `notes`, `definition_json` |
| `equipment_definitions` | `id`, `ruleset_id`, `name`, `category`, `slot_type`, `requisition_cost`, `consumable`, `definition_status`, `source`, `notes`, `definition_json` |
| `action_definitions` | `id`, `ruleset_id`, `name`, `economy`, `speed_cost_quarters`, `definition_status`, `source`, `notes`, `definition_json` |
| `order_type_definitions` | `id`, `ruleset_id`, `name`, `definition_status`, `source`, `notes`, `definition_json` |
| `structure_definitions` | `id`, `ruleset_id`, `name`, `build_cost_json`, `build_points`, `health`, `definition_status`, `source`, `notes`, `definition_json` |
| `terrain_definitions` | `id`, `ruleset_id`, `name`, `movement_cost_quarters`, `capacity`, `blocks_los`, `definition_status`, `source`, `notes`, `definition_json` |
| `ship_class_definitions` | `id`, `ruleset_id`, `name`, `health`, `armor`, `speed`, `external_slots`, `internal_slots`, `cargo_capacity`, `atmo_fuel`, `definition_status`, `source`, `notes`, `definition_json` |
| `enemy_definitions` | `id`, `ruleset_id`, `name`, `faction_id`, `doctrine_json`, `unit_definition_json`, `definition_status`, `source`, `notes` |

Definition status is lower-case `active`, `experimental`, `legacy`, or `incomplete`. JSON columns have syntax checks; table-specific numeric/boolean checks are in the migration.

The running `/api/rulesets/v5-core-curated` endpoint currently serves compiled `allDefinitions` from `packages/rules-engine/src/catalogue.ts`, not rows loaded from D1. D1 and TypeScript are therefore two representations with partial validator coverage. A generated catalogue or stronger canonical-hash pipeline is required before claiming a single immutable rules authority.

### 3.4 Persistent forces and economy

| Table | Implemented fields and constraints |
|---|---|
| `player_units` | `id`, `owner_id`, `ruleset_id`, `definition_id`, `callsign`, `name`, `status`, `current_health`, `base_stats_json`, `ammunition_json`, `damage_json`, `requisition_value`, `location_kind`, `location_id`, destruction metadata, timestamps. Status is `ACTIVE`, `DEPLOYED`, `DAMAGED`, `DESTROYED`, or `RETIRED`; location is `RESERVE`, `SHIP`, `CAMPAIGN`, or `DESTROYED`; destroyed status and location must agree. Class FK is `(definition_id, ruleset_id)`. |
| `player_unit_equipment` | `player_unit_id`, `ruleset_id`, `equipment_definition_id`, `slot_type`, `slot_index`, `installed_at`, `state_json`, `lost_at`; PK `(player_unit_id, slot_type, slot_index)` and composite equipment FK. There is no separate installed/removed lifecycle column. |
| `unit_history` | `id`, `player_unit_id`, `event_type`, optional `campaign_id`/`round_number`, `payload_json`, `occurred_at`, globally unique `idempotency_key`. |
| `requisition_transactions` | `id`, `user_id`, non-zero signed `amount`, `reason_code`, `description`, optional related entity fields, globally unique `idempotency_key`, `created_at`. The implemented ledger is user-scoped only; no Battalion account field exists. |

These tables are not yet wired into purchase/equip/deploy or round-effect services. Non-negative balances, slot compatibility, location reconciliation, append-only service permissions, and transactional purchase semantics are target service invariants rather than current end-to-end behavior.

### 3.5 Battalions, battlegroups, and ships

| Table | Implemented fields and constraints |
|---|---|
| `battalions` | `id`, unique `name`, `description`, `insignia_key`, nullable `primary_ship_id`, `created_by`, timestamps. `primary_ship_id` currently has no FK or uniqueness constraint. |
| `battalion_ranks` | `id`, `battalion_id`, `name`, `precedence`, `created_at`; unique name and precedence within a Battalion. |
| `rank_permissions` | `rank_id`, `permission`; composite PK. Permission vocabulary is not SQL-constrained. |
| `battalion_memberships` | `battalion_id`, `user_id`, `rank_id`, `status`, `command_role`, `joined_at`; composite PK. Status: `INVITED`, `ACTIVE`, `SUSPENDED`, `LEFT`, `REMOVED`; command role: `PLAYER`, `BATTALION_COMMAND`, `ADMIN`. |
| `battlegroups` | `id`, `battalion_id`, `name`, `objective`, nullable `leader_user_id`, boolean `persistent`, `created_at`; unique name within Battalion. |
| `battlegroup_units` | `battlegroup_id`, `player_unit_id`, boolean `delegated_command`; composite PK. |
| `ships` | `id`, `battalion_id`, `ruleset_id`, `class_definition_id`, `name`, `status`, `current_health`, planet/destination/travel fields, `state_json`, timestamps; unique name within Battalion; composite class FK. |
| `ship_equipment` | `ship_id`, `equipment_definition_id`, `ruleset_id`, `slot_type`, `slot_index`, `state_json`; PK by ship/slot and composite definition FK. |
| `ship_cargo` | `id`, `ship_id`, `resource_type`, `quantity`, `location_slot`, `source`, `state_json`; unique `(ship_id, resource_type, location_slot)`. |

Ship status is exactly `DOCKED`, `ORBIT`, `IN_TRANSIT`, `ARRIVING`, `DEPLOYING`, `DAMAGED`, or `DESTROYED`. There is no implemented primary-ship partial unique index, soft Battalion lifecycle, cargo reservation model, or ship-travel service yet.

### 3.6 Planets, campaigns, deployments, and archives

| Table | Implemented fields and constraints |
|---|---|
| `planets` | `id`, unique `name`, `strategic_coord_json`, `environment_json`, `war_state_json` |
| `campaigns` | `id`, `planet_id`, `ruleset_id`, `name`, `status`, `round_duration_ms`, `map_source_key`, `minimum_players`, `maximum_players`, `created_by`, `created_at`, `started_at`, `completed_at`; unique `(planet_id, name)`. Status: `DRAFT`, `RECRUITING`, `ACTIVE`, `PAUSED`, `COMPLETE`, `FAILED`. There is no engine hash, seed policy, or DO-name column. |
| `campaign_memberships` | `campaign_id`, `user_id`, nullable `battalion_id`, `side`, `role`, `joined_at`; composite PK. Side: `ALLIED`, `ENEMY`, `NEUTRAL`; role: `PLAYER`, `BATTALION_COMMAND`, `GM`, `OBSERVER`. |
| `deployments` | `id`, `campaign_id`, `player_unit_id`, `owner_id`, `side`, `status`, `snapshot_json`, `deployed_at`, `withdrawn_at`; unique campaign/unit and a partial unique index preventing a unit from having more than one `READY`, `ACTIVE`, or `IMMOBILISED` deployment. There is no snapshot hash. |
| `round_metadata` | `campaign_id`, positive `round_number`, globally unique `resolution_key`, `phase`, `lock_at`, `resolves_at`, `state_digest`, `archived_at`; PK campaign/round. No input/output hash, seed commitment, resolver version, effect status, or event range. |
| `order_archive` | `id`, `campaign_id`, `round_number`, `unit_id`, `revision`, `lifecycle`, `order_json`, `archived_at`; unique `(campaign_id, round_number, unit_id, revision)`. There is no separate `order_id` or payload-hash field. |
| `campaign_event_archive` | `event_id`, `campaign_id`, `round_number`, `sequence`, `event_type`, nullable `actor_id`, `visibility`, `payload_json`, `occurred_at`; unique campaign/round/sequence. Visibility/type vocabularies are not SQL checks. |
| `persistent_effects` | PK `idempotency_key`, `campaign_id`, `round_number`, `effect_type`, nullable `entity_id`, `payload_json`, `status`, `attempt_count`, `last_error`, `created_at`, `applied_at`; status `PENDING`, `APPLIED`, or `FAILED`. There is no ordinal, payload hash, claim owner/time, or result field. |

Archive/effect tables are not populated by the current Worker/DO. Their existence is not evidence that D1 effects or archival are implemented.

## 4. Current Campaign Durable Object records

One DO is named by the URL/D1 campaign ID. `worker/campaign-durable-object.ts` currently initialises only the explicit `outpost-k17` name; other names fail with `CAMPAIGN_NOT_INITIALISED` until a real bootstrap workflow is added.

| Storage key | Implemented contents | Current behavior |
|---|---|---|
| `state/current` | Full `CampaignRuntimeState`: campaign/rules/engine identifiers, round/phase, clock including embedded schedule, map, deployments, orders, objectives, a bounded event list, in-state resolution map, pending-effect list, version | Rewritten by serialized commands; version increments on accepted state transitions |
| `snapshot/{round}` | Structured clone of the pre-resolution state after entering `RESOLVING` | Written inside the resolution transaction |
| `resolution/{round}` | Current `ResolutionRecord` | Presence is the current duplicate-resolution guard |
| `event/{round}/{sequence}` | Individual canonical `CampaignEvent`; storage sequence is six-digit padded | Written for order, lock, pause/resume, resolution, and next-round events |
| `pending-effect/{idempotencyKey}` | Current `PendingPersistentEffect` | Written after resolver output; never consumed or acknowledged by D1 code |

There are **no** separate `schedule/{id}` records. `ORDER_LOCK` and `ROUND_RESOLVE` items live only in `state/current.clock.schedule`; consumed items are removed rather than retained with a status. The one DO alarm is set from the earliest embedded `runAt`.

Current record shapes are:

```ts
interface ResolutionRecord {
  key: string;
  campaignId: string;
  round: number;
  seed: string;
  startedAt: number;
  committedAt: number;
  eventIds: string[];
  stateDigest: string;
}

interface PendingPersistentEffect {
  idempotencyKey: string;
  type: "UNIT_DESTROYED" | "UNIT_DAMAGED" | "REQUISITION_AWARDED" | "CAMPAIGN_HISTORY";
  unitId?: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "APPLIED" | "FAILED";
}
```

The resolution seed is currently a predictable string derived from campaign, round, and ruleset. `stateDigest` is an eight-hex-character 32-bit FNV-style digest, not a cryptographic input/output hash. There is no `PREPARED` journal state, attempt counter, payload hash, effect acknowledgement count, or failure state in this record.

## 5. Enforced invariants now

### 5.1 Enforced by D1 schema

- unique case-insensitive user email/username and unique session token hash;
- one profile per user;
- composite definition identity within a ruleset and table-specific checks;
- one Battalion/campaign membership per user within that aggregate;
- one rank permission row per rank/permission pair;
- one active deployment per Player Unit through the partial index;
- unique requisition/unit-history idempotency keys;
- one round metadata row per campaign/round and globally unique resolution key;
- one order archive revision per campaign/round/unit/revision;
- one archive event per event ID and campaign/round/sequence;
- one D1 effect row per idempotency key;
- foreign keys declared by the migrations, when foreign-key enforcement is active.

### 5.2 Enforced in the current Worker/DO/engine subset

- a session identity must be active and a campaign request must resolve an existing supported membership;
- local demo identity is restricted to K-17 and cannot be enabled in production;
- current-milestone orders are owner-only and cannot mutate after the current round locks;
- the server derives start position, revisions, rules costs, fitted weapon/equipment references, and visible target set;
- only executable Hold/Advance/Rush and Attack definitions enter the current resolver;
- routes are adjacent/in-map and fit speed/action budget;
- facing is normalised to six values, final capacity is checked, and destroyed/withdrawn occupants do not consume capacity;
- resolver events are monotonic within the round, and only the exact accepted order ID/revision is marked resolved;
- a committed `resolution/{round}` makes a duplicate resolution call return the existing result.

### 5.3 Target invariants not yet enforced end to end

- non-negative requisition after an atomic purchase and asset creation;
- equipment compatibility/ownership and full unit/ship/location reconciliation;
- immutable published ruleset content and a campaign-bound engine/content hash;
- server-created deployment snapshot/bootstrap for every D1 campaign;
- immutable archival of all order revisions and canonical events into D1;
- cryptographic input/output/effect payload hashes;
- exactly-once D1 damage, death, equipment loss, history, and requisition effects;
- acknowledgement of all required D1 effects before opening the next round;
- stable client command idempotency keys and optimistic expected revisions;
- runtime validation of every bounded JSON/public DTO.

## 6. Target D1/DO effects protocol

This is the accepted design, **not current behavior**:

1. Resolver emits stable ordered effects with an ordinal and canonical payload hash.
2. DO atomically commits result state/events, a hashed resolution record, and `pending-effect/{id}` records without calling D1 inside its storage transaction.
3. A D1 applier claims/inserts the matching `persistent_effects` row and applies the target mutation plus history/ledger/archive rows in a transactional batch.
4. A retry with the same ID/hash returns the existing applied result; a different hash fails closed.
5. DO records acknowledgements and opens the next round only after every required effect is `APPLIED`.

The current `persistent_effects` table needs a follow-up migration or a deliberately documented equivalent to support payload hashes, ordinals, claims/results, and strong collision detection. The current runtime must also stop advancing the round before effect acknowledgement. See [ROUND_RESOLUTION.md](./ROUND_RESOLUTION.md).

## 7. Model evolution priorities

1. Add runtime schemas and explicit D1-to-domain adapters, including seconds/milliseconds and quarter-point conversion.
2. Choose one generated/hashed source of rules truth and enforce published immutability.
3. Implement campaign bootstrap from an authorised D1 deployment snapshot; keep the K-17 fixture local-only.
4. Implement purchase/equip/deploy services against existing constraints before exposing those tables as complete features.
5. Add the PREPARED/hash journal and D1 persistent-effect applier before claiming exact-once cross-store resolution.
6. Add archival workers/effects and reconciliation tooling only after the primary result/effect handshake is proven.
7. Evolve schedules into persisted status-bearing records if alarm crash/retry integration tests demonstrate the target protocol.

Related decisions: [ARCHITECTURE.md](./ARCHITECTURE.md), [ROUND_RESOLUTION.md](./ROUND_RESOLUTION.md), [CLOUDFLARE.md](./CLOUDFLARE.md), and the source dispositions in [RULE_CONFLICTS.md](./RULE_CONFLICTS.md).

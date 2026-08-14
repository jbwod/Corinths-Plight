# Corinth's Plight Data Model

**Status:** Phase-0 reconciled implemented schema/use plus target deltas (2026-08-10)

**Scope:** D1 migrations `0001`–`0022`, all production/development seed files, current Campaign Durable Object storage, the Phase 3 Strategic Map boundary, and local Game Master/map-authoring/runtime records

## 1. Authority and status

| Label | Meaning |
|---|---|
| **Implemented schema** | SQL or DO record shape exists now |
| **Implemented use** | Current Worker/DO code reads or writes it now |
| **Target** | Required by the accepted architecture but not yet implemented |

D1 owns global identity, ownership, economy, organisation, ship, strategic-world, campaign-registry, event, and archive truth. One named Campaign Durable Object owns the mutable tactical state of one active campaign. Phase 3 adds a separate sharded Strategic Map Durable Object boundary, one coordinator per strategic map/theatre. It is never a global-galaxy singleton.

Five authored campaigns load committed D1 force snapshots into exact version-`@3` battlefields: K-17, Iron Rain, Broken Road, Night Glass, and Cold Horizon. Unsupported map/content pairs remain unavailable rather than receiving invented or latest-at-runtime content. Migration `0020` adds persistent custom-map drafts/revisions, `0021` adds the exact custom-scenario bootstrap row, and `0022` pins new custom scenario content `@2` to `game-master-skirmish@1`, round 12, and `public-v1-economy@1`. Current generator/vocabulary/application `@2` documents can publish and create exact-pinned recruiting campaigns that bootstrap through the ordinary committed-deployment path.

## 2. Representation conventions

- IDs are `TEXT`; trusted server code is expected to generate opaque stable values. The SQL does not itself prescribe UUID/ULID format.
- D1 timestamp columns are integers; defaulted `created_at`/similar fields use Unix seconds through `unixepoch()`. Services write and read explicit strategic/history fields such as `lock_at`, `resolves_at`, and `occurred_at` as Unix seconds and convert them at the domain boundary. DO/domain timestamps use JavaScript milliseconds through `Date.now()`, so every adapter must keep that conversion explicit because SQL does not encode the unit.
- D1 rules movement/action values use integer quarter-points (`speed_quarters`, `movement_cost_quarters`, `speed_cost_quarters`). Current TypeScript domain/engine values use whole speed units and exact fractional numbers such as `0.5`; partial D1 adapters exist, but they do not preserve every authority/status field and are not conformant with the compiled catalogue.
- Hexes use integer axial coordinates `{q, r}` in JSON/domain state.
- Phase 3 JSON columns also check top-level object/array shape where applicable. This still does not prove conformance to a full TypeScript/runtime DTO schema.
- Definition identity is the composite primary key `(id, ruleset_id)`. There is no separate `slug`, `schema_version`, or `definition_hash` column in the current migrations.
- Archived event order is the unique tuple `(campaign_id, round_number, sequence)`, not timestamp order.

## 3. Implemented D1 schema

The twenty-two migrations create the following table families. Field lists below reflect landed SQL, not a claim that every service workflow is executable. The latest isolated replay contains 130 application tables. Production remains recorded at `0007` and must be checked separately before any authorized migration.

### 3.1 Identity and sessions

| Table | Implemented fields | Enforced constraints |
|---|---|---|
| `users` | `id`, `email`, `username`, `status`, `email_verified_at`, `created_at`, `updated_at` | PK `id`; case-insensitive unique email/username; status is `ACTIVE`, `SUSPENDED`, or `DELETED`; no password column |
| `profiles` | `user_id`, `display_name`, `callsign`, `image_key`, `biography`, `created_at`, `updated_at` | One row per user; cascade on user delete |
| `user_sessions` | `id`, `user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at`, `ip_hash`, `user_agent_hash`, `last_seen_at` | Unique token hash; expiry after creation; active-session partial index |

`worker/auth.ts` hashes the `corinth_session` cookie with SHA-256 and accepts only an unexpired, unrevoked row joined to an `ACTIVE` user. `worker/services/auth.ts` now issues and revokes opaque sessions through verified single-use Resend links; passwordless email access is also the recovery path for this slice.

Migration `0006_production_identity.sql` adds `auth_email_challenges`, `auth_rate_limits`, and `auth_audit_events`. Challenges store a normalized destination email because a registration User does not exist yet, but store only a SHA-256 token hash and HMAC-pseudonymized email/IP/User-Agent keys for lookup, rate limiting, and audit. See [AUTHENTICATION.md](./AUTHENTICATION.md).

Migration `0008_auth_retention_and_invitation_abuse.sql` adds indexed cleanup paths over sessions, challenges, auth rate/audit rows, and invitations, plus leased invitation-delivery jobs. The invite command commits its source row, job, audit, and generic receipt atomically; an immediate `waitUntil` attempt and the local hourly handler process/recover jobs. The same hourly handler expires pending invitations/challenges and deletes only bounded terminal/aged records under explicit retention constants. The migration itself does not mutate accounts and is not active in the recorded production deployment.

### 3.2 Rulesets, provenance, and conflicts

| Table | Implemented fields | Enforced constraints |
|---|---|---|
| `rulesets` | `id`, `version`, `name`, `status`, `engine_version`, `authority_notes`, `published_at`, `created_at` | Unique version; status `DRAFT`, `ACTIVE`, or `RETIRED` |
| `ruleset_sources` | `id`, `ruleset_id`, `source_path`, `source_sha256`, `authority_rank`, `source_status`, `notes` | Unique `(ruleset_id, source_path)`; source status `PRIMARY`, `ERRATA`, `COMPANION`, or `LEGACY` |
| `rule_conflicts` | `id`, `ruleset_id`, `category`, `summary`, `sources_json`, `disposition`, `status`, `notes` | Valid JSON; status `RESOLVED_FOR_PROFILE`, `OPEN`, `DEFERRED`, or `INCOMPLETE_DATA` |

The index named `idx_one_active_ruleset_version` is unique on `version` only when active. Because `rulesets.version` is already unique, it does **not** enforce a single active ruleset across all versions.

The documentation conflict register contains 72 stable namespaced records, while the current core seed inserts only 12 obsolete short IDs. Phase-2 definitions can therefore cite conflict IDs with no matching D1 row. Until CP-200 reconciles that provenance, `rule_conflicts` is an incomplete database mirror rather than the canonical conflict audit.

The published catalogue is split between `seeds/v5-core-curated.sql`, `seeds/v5-phase2-combined-arms.sql`, and `seeds/v5-equipment-deployment.sql`; `npm run db:seed:local` executes all three with Wrangler. `npm run db:seed:demo:local` then applies the explicit local-only force, strategic-world, and Spearhead fixtures in order. `npm run seed:check` checks source hashes, duplicate/missing IDs, runtime-versus-SQL status, provenance, the active ruleset, Phase 2/3 boundaries, and the equipment/deployment definitions. It does not compare every definition field or generate the runtime catalogue.

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

The running `/api/rulesets/v5-core-curated` endpoint serves the redacted, hash-bearing `v5-core-curated@2` generated catalogue. Nine allied classes currently have registered tactical execution projections; the D1 Phase-2 catalogue still stores all thirteen V5 starting classes plus three companion catalogue classes under the legacy `@1` relational identity. Runtime hydration fails closed when a D1 record lacks the matching generated handler, but D1 publication and instance foreign keys have not yet fully moved to `@2`, so the catalogue cutover remains partial rather than a single storage authority.

### 3.4 Persistent forces and economy

| Table | Implemented fields and constraints |
|---|---|
| `player_units` | `id`, `owner_id`, `ruleset_id`, `definition_id`, `callsign`, `name`, `status`, `current_health`, `base_stats_json`, `ammunition_json`, `damage_json`, `requisition_value`, `location_kind`, `location_id`, destruction metadata, timestamps. Status is `ACTIVE`, `DEPLOYED`, `DAMAGED`, `DESTROYED`, or `RETIRED`; location is `RESERVE`, `SHIP`, `CAMPAIGN`, or `DESTROYED`; destroyed status and location must agree. Class FK is `(definition_id, ruleset_id)`. |
| `player_unit_equipment` | `player_unit_id`, `ruleset_id`, `equipment_definition_id`, `slot_type`, `slot_index`, `installed_at`, `state_json`, `lost_at`; PK `(player_unit_id, slot_type, slot_index)` and composite equipment FK. There is no separate installed/removed lifecycle column. |
| `unit_history` | `id`, `player_unit_id`, `event_type`, optional `campaign_id`/`round_number`, `payload_json`, `occurred_at`, globally unique `idempotency_key`. |
| `requisition_transactions` | `id`, `user_id`, non-zero signed `amount`, `reason_code`, `description`, optional related entity fields, globally unique `idempotency_key`, `created_at`. The implemented ledger is user-scoped only; no Battalion account field exists. |

Force and equipment purchase, loadout mutation, deployment commit, and the narrow post-round effect set are wired through owner-scoped Worker services. The server enforces non-negative balances, inventory ownership, compatible slots/tags/limits, optimistic revisions, idempotency receipts, facility/muster context, and snapshot locking. Broader equipment-loss, recovery, and every optional catalogue effect remain target work.

### 3.5 Battalions, battlegroups, and ships

| Table | Implemented fields and constraints |
|---|---|
| `battalions` | `id`, unique `name`, `description`, `insignia_key`, nullable `primary_ship_id`, `created_by`, timestamps. `primary_ship_id` currently has no FK or uniqueness constraint. |
| `battalion_ranks` | `id`, `battalion_id`, `name`, `precedence`, `created_at`; unique name and precedence within a Battalion. |
| `rank_permissions` | `rank_id`, `permission`; composite PK. Migration 0004 adds definition-table validation triggers for new writes. |
| `battalion_memberships` | `battalion_id`, `user_id`, `rank_id`, `status`, `command_role`, `joined_at`; composite PK. Status: `INVITED`, `ACTIVE`, `SUSPENDED`, `LEFT`, `REMOVED`; command role: `PLAYER`, `BATTALION_COMMAND`, `ADMIN`. |
| `battlegroups` | `id`, `battalion_id`, `name`, `objective`, nullable `leader_user_id`, boolean `persistent`, `created_at`; unique name within Battalion. |
| `battlegroup_units` | `battlegroup_id`, `player_unit_id`, boolean `delegated_command`; composite PK. |
| `ships` | `id`, `battalion_id`, `ruleset_id`, `class_definition_id`, `name`, `registry`, `status`, `current_health`, location/travel fields, revision and last identity-mutation token, `state_json`, timestamps; unique name within Battalion and case-insensitive unique registry; composite class FK. |
| `ship_equipment` | `ship_id`, `equipment_definition_id`, `ruleset_id`, `slot_type`, `slot_index`, `state_json`; PK by ship/slot and composite definition FK. |
| `ship_cargo` | `id`, `ship_id`, `resource_type`, `quantity`, `location_slot`, `source`, `state_json`; unique `(ship_id, resource_type, location_slot)`. |

Ship status is exactly `DOCKED`, `ORBIT`, `IN_TRANSIT`, `ARRIVING`, `DEPLOYING`, `DAMAGED`, or `DESTROYED`. Migration 0004 adds soft Battalion lifecycle and a same-Battalion primary-ship trigger, but there is still no primary-ship uniqueness index, complete cargo reservation model, or arbitrary ship-travel service.

### 3.6 Planets, campaigns, deployments, and archives

| Table | Implemented fields and constraints |
|---|---|
| `planets` | `id`, unique `name`, `strategic_coord_json`, `environment_json`, `war_state_json` |
| `campaigns` | Existing registry fields plus nullable `scenario_content_key` and nullable `game_master_map_revision_id`. Migration `0018` adds the exact immutable `<scenarioId>@<version>` selector without backfilling legacy rows; `0020` permits a `RECRUITING` custom campaign to pin one immutable published Game Master map revision/hash. Status remains `DRAFT`, `RECRUITING`, `ACTIVE`, `PAUSED`, `COMPLETE`, or `FAILED`. The custom terminal policy is stored in the related `game_master_campaign_scenarios` row; there is still no engine hash or DO-name column. |
| `campaign_memberships` | `campaign_id`, `user_id`, nullable `battalion_id`, `side`, `role`, `joined_at`; composite PK. Side: `ALLIED`, `ENEMY`, `NEUTRAL`; role: `PLAYER`, `BATTALION_COMMAND`, `GM`, `OBSERVER`. |
| `deployments` | `id`, `campaign_id`, `player_unit_id`, `owner_id`, `side`, `status`, `snapshot_json`, `deployed_at`, `withdrawn_at`; unique campaign/unit and a partial unique index preventing a unit from having more than one `READY`, `ACTIVE`, or `IMMOBILISED` deployment. There is no snapshot hash. |
| `round_metadata` | `campaign_id`, positive `round_number`, globally unique `resolution_key`, `phase`, `lock_at`, `resolves_at`, `state_digest`, `archived_at`; PK campaign/round. No input/output hash, seed commitment, resolver version, effect status, or event range. |
| `order_archive` | `id`, `campaign_id`, `round_number`, `unit_id`, `revision`, `lifecycle`, `order_json`, `archived_at`; unique `(campaign_id, round_number, unit_id, revision)`. There is no separate `order_id` or payload-hash field. |
| `campaign_event_archive` | `event_id`, `campaign_id`, `round_number`, `sequence`, `event_type`, nullable `actor_id`, `visibility`, `payload_json`, `occurred_at`; unique campaign/round/sequence. Visibility/type vocabularies are not SQL checks. |
| `persistent_effects` | PK `idempotency_key`, `campaign_id`, `round_number`, `effect_type`, nullable `entity_id`, `payload_json`, `status`, `attempt_count`, `last_error`, `created_at`, `applied_at`; status `PENDING`, `APPLIED`, or `FAILED`. There is no ordinal, payload hash, claim owner/time, or result field. |

Archive/effect tables are not populated by the current Worker/DO. Their existence is not evidence that D1 effects or archival are implemented.

### 3.7 Phase 3 identity and Battalion extensions

Migration 0004 adds `users.last_active_at`, `profiles.timezone`, Battalion short name/motto/status/revision, rank and membership revisions/timestamps, Battlegroup strategic state, ship registry/location/revision, ship-module installation state, and campaign strategic-node/status/revision fields.

| Table | Implemented fields and constraints |
|---|---|
| `auth_identities` | Provider-neutral identity link with hashed provider subject, private provider JSON, lifecycle, and unique provider/subject pair. The passwordless service writes `resend_magic_link` identities after verified link consumption. |
| `account_recovery_challenges` | Hashed recovery token, expiry, lifecycle, and consumed time. Delivery/issuance is deferred. |
| `battalion_permission_definitions` | Permission vocabulary plus `ACTIVE`, `SCHEMA_ONLY`, or `DEFERRED` implementation status. Triggers reject unknown new rank permissions. |
| `battalion_invites` | Persistent invitation lifecycle, Battalion-local rank, inviter/invitee, expiry, revision, request hash, inviter-scoped command ID, Resend delivery ID, and delivery status. One pending invite per Battalion/User. |
| `user_active_battalions` | One explicit operational Battalion per User; composite membership FK plus triggers requiring/retaining only an active membership. |
| `unit_order_delegations` | Owner-preserving per-unit order authority scoped to Battlegroup, campaign, or time window; owner/member composite FKs, revision, request hash, and owner-scoped command ID. |
| `battlegroup_mutation_receipts` | Actor-scoped exact-once receipts for formation identity, roster, and delegation commands. Migration `0011` also adds a compare-and-set mutation token, one-current-formation unit uniqueness, and one-active-Battlegroup-delegation uniqueness. |

### 3.8 Guided enlistment and recruitment

Migration 0007 adds the server-authoritative post-verification onboarding aggregate and Battalion recruitment configuration. It does not alter canonical V5 prices: the command-charter amount is product anti-spam policy, while the starter unit remains explicitly `BALANCE_REQUIRED`.

| Table | Implemented fields and constraints |
|---|---|
| `onboarding_economy_policies` | Positive one-time opening grant, positive Battalion creation cost, creator charter limit, revision, and update time. The active public-v1 policy is 20 Req grant / 20 Req cost / one charter. |
| `economy_policies`, `economy_unit_prices` | Versioned application balance policy and explicit per-class prices. `public-v1-economy@1` records the approved opening/charter/reward/loss decisions and the thirteen 4–14 Req class values. |
| `onboarding_progress` | One row per User with `BATTALION`, `UNIT`, `TOUR`, or `COMPLETE` step, lifecycle, completion time, and revision. Complete rows must carry a completion time. |
| `onboarding_command_receipts` | Actor-scoped command ID, operation, canonical request hash, object response JSON, and creation time. Migration `0012` adds active switching; `0013` adds self-departure and authorized member removal. Changed-payload reuse conflicts. |
| `battalion_administration_receipts` | Migration `0014` records actor-scoped rank create/update/delete and member-rank assignment results. Migration `0015` adds command transfer, with Battalion and membership transfer tokens coupling the creator, role/rank handoff, audience event, and stored response to one guarded exact-once transaction. |
| `ship_mutation_receipts` | Migration `0016` stores actor-scoped primary-ship identity mutation responses and request hashes. The ship's identity-mutation token couples the versioned name/registry update, Battalion event, and receipt guard in one batch. |
| `battalion_recruitment_settings` | NPC/player kind, public/private policy, join gate, required public engagement summary, same-Battalion recruitment rank, hashed general invite code, capacity, creation cost, and revision. |
| `battalion_creation_charters` | One charter per creator, one Battalion per charter, exact Req cost, and immutable ledger transaction reference. |
| `battalion_email_invites` | Unregistered-email invitation, same-Battalion rank, single-use token hash, seven-day lifecycle, inviter-scoped command, Resend delivery state/ID, and revision. One pending invite per Battalion/email. |
| `onboarding_starter_unit_grants` | One User-to-Player-Unit grant and pinned class/ruleset identity. Both User and unit are unique. |
| `battalion_invitation_rate_limits` | Fixed-window bucket keyed by actor, Battalion, HMAC-pseudonymized recipient, or HMAC-pseudonymized IP; attempt count, cooldown, last outcome, and update time. Added by local migration `0008`. |
| `battalion_invitation_audit_events` | Private accepted/rejected/failed invitation-security outcome, reason, optional actor/Battalion references, pseudonymized recipient/IP keys, bounded object metadata, and occurrence time. Added by local migration `0008`. |
| `battalion_invitation_delivery_jobs` | Leased `PENDING`/`SENT`/`ABANDONED` Resend outbox keyed uniquely to an account/email invitation, with attempt/backoff/expiry/error state and pseudonymized recipient/IP keys. Added by local migration `0008`; source-validation and source-delete triggers prevent orphaned jobs. |

The production-safe onboarding seed creates three open NPC Battalions and the system recruitment authority. These are product fixtures, not canonical lore. Existing verified human accounts are enrolled and credited once on rollout; reserved `.invalid` development/system identities are excluded.

### 3.9 Strategic world and operations

| Table | Implemented fields and constraints |
|---|---|
| `strategic_content_sources` | Normalized source path/locator, optional SHA-256, source kind, and notes. |
| `strategic_locations` | Typed hierarchy, status, metadata JSON, revision, timestamps; self-parent and recursive-cycle rejection. |
| `strategic_maps` | Scope, root location, pinned ruleset, stable coordinator key, configurable clock, current round, pause/status, revision, source, and configuration JSON. |
| `strategic_nodes` | One map projection per semantic location, typed/control/status state, presentation position, visibility/metadata JSON, revision, and source. Composite `(id,map_id)` supports same-map FKs; triggers require node/location type agreement. |
| `strategic_routes` | Same-map endpoints, route type/direction, nullable positive travel rounds, explicit cost status, allowed-profile array, status, revision, source, and metadata. Self-edges, reverse duplicates of a bidirectional edge, and empty/non-array profiles are rejected. |
| `strategic_operations` | Map/node, optional unique tactical campaign, pinned ruleset, code/name/role/status/threat, structured briefing/rule/effect/outcome JSON, revision, source, and schedule. |
| `strategic_war_variables` | Revisioned JSON by map, semantic location, scope, and key, optionally linked to its last canonical event. |

`campaigns.strategic_node_id` links tactical campaigns to the strategic graph without changing the existing tactical status check. `campaigns.strategic_status` is a separate product lifecycle projection.

### 3.10 Task Forces, embarkation, and strategic supply

| Table | Implemented fields and constraints |
|---|---|
| `task_forces` | Battalion/map, name/callsign, commander, current node, formation status, supplied state/end round, revision, and state JSON. Current node is constrained to the same map. |
| `task_force_ships` | Battalion-consistent Task Force/ship relation, role, lifecycle, timestamps, and revision. A partial index permits one active Task Force per ship. |
| `task_force_battlegroups` | Battalion-consistent embarkation lifecycle and timestamps. A partial index permits one active carrier per Battlegroup. |
| `strategic_supply_stores` | Exactly one physical holder shape: ship, Task Force, HQ/FOB location, or Player Unit. |
| `strategic_supply_balances` | Separate `LARGE`, `MEDIUM`, or `SMALL` quantity/capacity/revision; non-negative and bounded when capacity is known. |

An embarked Battlegroup stores `current_carrier_task_force_id` and no independent node. Its semantic location derives through the Task Force. Player Unit ownership remains `player_units.owner_id`; neither assignment nor embarkation changes it.

### 3.11 Strategic orders and journal

| Table | Implemented fields and constraints |
|---|---|
| `strategic_rounds` | Map/round, lifecycle, pinned ruleset/resolver, schedule/actual timestamps, resolution key, input/result hashes, revision, and state JSON. Resolved/failed rows require complete hash journal fields. |
| `strategic_orders` | Map round and Battalion actor, typed order/subject, exactly one Task Force or Battlegroup, destination/operation, lifecycle, route/intent JSON, request hash, expected subject revision, revision, and failure/timestamps. Command uniqueness is `(actor_user_id,command_id)`, not global. |
| `strategic_events` | Optional map round/sequence, Battalion/audience/subject, summary, object payload, event hash, globally unique idempotency key, and time. Map event sequence is unique per round. |
| `strategic_effect_receipts` | Source kind/ID/version, target, payload hash/data, lifecycle/attempts/result/error, timestamps, and idempotency key. Source/version/effect/target is also unique. |

The development seed uses `strategic-map-corinth`, CSV Resolute, the Resolute Task Force, Hammer/Raven, three operations, strategic round 28, and Large Supply 3/4. All seeded route durations remain `NULL/BALANCE_REQUIRED`; unresolved travel is not free movement.

### 3.12 Tactical campaign results

| Table | Implemented fields and constraints |
|---|---|
| `campaign_results` | One immutable terminal row per campaign: round, pinned scenario ID/version, victory/defeat reason, objective snapshot, reward disposition, unique resolution/effect IDs, and resolution time. Authored campaign terminal effects insert this row, close `campaigns`, project the result to a linked strategic operation when present, and record the same idempotency key in `campaign_effect_receipts` before the DO enters `COMPLETE`. |

New reward JSON records service history plus the published `public-v1-economy@1` breakdown. Terminal mission results grant 5 Req and victories add 20 Req through one ledger idempotency key per Allied commander. Historical pre-policy results retain their original `BALANCE_REQUIRED` projection and are not rewritten as if a reward had been paid.

### 3.13 Global Game Master authority and audit

Migration `0019_game_master_authority.sql` adds:

| Table | Implemented fields and constraints |
|---|---|
| `game_master_grants` | One global grant per User, `ACTIVE`/`REVOKED` lifecycle, grantor, bounded reason, timestamps, and revocation consistency. No default row is inserted. |
| `game_master_command_receipts` | Actor-scoped command ID, bounded operation vocabulary, campaign, canonical SHA-256 request hash and JSON, exact status/response JSON, and completion time. |
| `game_master_audit_events` | Immutable private campaign-command outcome with authority source, actor, command, request hash/JSON, response status/JSON, and occurrence time. |

Global authority is separate from `campaign_memberships.role='GM'` and Battalion command roles. Development demo authority requires explicit development demo authentication plus `ADMIN`; production requires an active grant for an active User. The DO command/state commit and D1 receipt/audit projection are independently durable and retryable, but cannot be one cross-store transaction.

The owner-approved `game-master-recovery@1` exceptional correction reuses this command/audit family and adds no table. A valid command requires a campaign paused from planning and a destroyed deployment at a still-legal battlefield hex. The DO restores the deployment to active/on-map, maximum health and governed ammunition, clears cooldowns, damage and transient tactical state, preserves only explicitly permanent status effects, and returns subsystems to operational. For an Allied persistent deployment, the D1 completion batch reconciles `player_units`, `deployments`, weapon mounts, subsystems and non-permanent status-effect rows and appends an idempotent owner-visible `GAME_MASTER_RECOVERY` `unit_history` row. This is an application-level administrative correction, not a canonical V5 repair rule. The DO commit and D1 reconciliation are retryable/idempotent but not one atomic cross-store transaction.

### 3.14 Versioned Game Master maps

Migration `0020_game_master_maps.sql` adds:

| Table | Implemented fields and constraints |
|---|---|
| `game_master_maps` | Named owner-scoped `DRAFT`/`PUBLISHED` head, optional planet, one of five presets, seed, revision, exact schema/generator/vocabulary versions, constrained `sha256:` content hash, canonical document JSON, explicit mechanics mapping, author/publisher identities, timestamps, and mutation token. |
| `game_master_map_revisions` | Immutable saved revision with exact document/hash/mechanics mapping and author. `(map_id, revision)` is unique and published selections remain addressable by pinned campaigns. |
| `game_master_authoring_receipts` | Actor-scoped exact response receipt for `MAP_SAVE`, `MAP_PUBLISH`, or `CAMPAIGN_CREATE`. |
| `game_master_authoring_audit_events` | Private immutable audit outcome for the same authoring operations, including authority source and request/response evidence. |

The version-1 document is strictly validated and canonicalized before persistence: exact keys and generator/vocabulary `@2`, width 12–96, height 10–96, bounded 16 MiB import, complete cell/topology/boundary validation, stable ordering, and matching SHA-256. Hash verification is an integrity check, not a signature. Every current biome/point/edge ID carries a published profile. Publication revalidates those IDs and campaign creation pins `game_master_map_revision_id`, `map_source_key`, and a scenario key containing the exact published revision/hash; it also creates the first deterministic passable insertion zone.

### 3.15 Exact custom campaign runtime bootstrap

Migration `0021_game_master_campaign_runtime.sql` adds:

| Table | Implemented fields and constraints |
|---|---|
| `game_master_campaign_scenarios` | One immutable scenario bootstrap row per campaign with unique scenario/content keys, exact published map revision and SHA-256 content hash, bounded canonical objective/enemy arrays, optional application-policy/maximum-round/reward-policy fields, creator, and timestamp. The content key is constrained to `scenario_id@scenario_version`; the map revision cannot be deleted while selected. Migration `0022` permits only legacy version 1 with all three policy fields null, or version 2 with the exact `game-master-skirmish@1` / `12` / `public-v1-economy@1` tuple. |

Campaign creation inserts this row, the exact campaign pins, the deterministic ground-passable insertion zone, and the Game Master membership in one D1 batch guarded by the published revision/hash. Directory, join, and DO initialization all re-check the same selection. Existing custom campaign objectives and enemies begin empty and are changed only through audited live commands.

### 3.16 Versioned custom-skirmish terminal policy

Migration `0022_game_master_skirmish_policy.sql` rebuilds `game_master_campaign_scenarios` without adding an application table. Existing version-1 rows are copied unchanged with null policy fields and are not eligible for version-2 runtime materialization. Newly created rows use scenario content `@2` and the exact policy tuple described above.

The policy ends a campaign in defeat when all Allied deployments are destroyed or withdrawn, in victory when at least one enemy has existed and all enemy deployments are destroyed or withdrawn, or in defeat after round 12 while an enemy remains. Allied loss has precedence if both sides are eliminated; enemy elimination has precedence over the round limit on round 12. An empty initial enemy roster therefore cannot resolve as a victory. Result persistence and Req ledger writes reuse the existing receipt-idempotent `CAMPAIGN_RESULT` effect path and `public-v1-economy@1` values.

For a standalone custom campaign, the existing generic recovery path returns surviving units to `RESERVE` with `location_id=NULL` and unlocks their loadouts; it does not synthesize a strategic operation or node. Only a linked strategic operation drives operation-node placement, carrier cleanup, and a Battlegroup `RECOVERING` transition. This is unchanged generic campaign-result behavior, not a new custom-campaign strategic guarantee.

## 4. Current Campaign Durable Object records

One DO is named by the URL/D1 campaign ID. The explicit local `outpost-k17` fixture remains available only in development. A persistent campaign requires committed D1 deployment/loadout snapshots and an exact supported `map_source_key`/`scenario_content_key` pair. K-17, Iron Rain, Broken Road, Night Glass, and Cold Horizon all load their named `@3` content. Iron Rain has 311 land hexes, Broken Road 244, Night Glass 240, and Cold Horizon 298. A published custom-map pair is resolved through `game_master_map_revisions`, revalidates revision/hash/document mechanics, and materializes the battlefield before state creation. Current custom runtime requires scenario content `@2` plus the exact application/reward tuple; a legacy custom `@1`, legacy `NULL` pin, unavailable/draft/hash-mismatched revision, or stored scenario mismatch fails closed without creating, rewriting, or auto-upgrading DO state.

| Storage key | Implemented contents | Current behavior |
|---|---|---|
| `state/current`; `state/chunk/{index}` when large | Inline schema-version-1 envelope, or a small SHA-256 manifest plus fixed 1 MiB chunks containing that exact envelope | Critical nested fields are validated on read and before write; legacy inline state remains readable. Chunk count/length/hash/JSON are checked and corruption fails closed. Fixed slots are replaced atomically and stale tail chunks are deleted. |
| `snapshot/{round}`; `snapshot/{round}/chunk/{index}` when large | Inline pre-resolution envelope or the same verified chunk format after entering `RESOLVING` | Written inside the resolution transaction and validated with the same storage contract. Maximum-size snapshots currently duplicate static map data and therefore have linear per-round storage cost. |
| `resolution/{round}` | Current `ResolutionRecord` | Presence is the current duplicate-resolution guard |
| `event/{round}/{sequence}` | Individual canonical `CampaignEvent`; storage sequence is six-digit padded | Written for order, lock, pause/resume, resolution, and next-round events |
| `pending-effect/{idempotencyKey}` | Current `PendingPersistentEffect` | Written after resolver output; applied through a D1 batch and deleted after a matching `campaign_effect_receipts` row is verified |
| `command/order/{encodedUserId}/{encodedCommandId}` | Schema-version-1 order-upsert receipt with actor, command ID, SHA-256 request hash, HTTP status, exact response, and creation time | Commits atomically with `state/current` and the order event; matching retries replay and changed-payload reuse fails closed |
| `command/clock/{encodedUserId}/{encodedCommandId}` | Schema-version-1 clock-update receipt with actor, command ID, SHA-256 request hash, HTTP status, exact response, and creation time | Commits atomically with `state/current`; matching retries replay and changed-payload reuse fails closed |
| `command/game-master/{encodedUserId}/{encodedCommandId}` | Game Master campaign-command receipt with actor, operation, request hash, status, and exact response | Commits with the DO mutation. The later D1 registry/audit projection is idempotent but not in the DO transaction. |

There are **no** separate `schedule/{id}` records. `ORDER_LOCK` and `ROUND_RESOLVE` items live only in the decoded current state's `clock.schedule`; consumed items are removed rather than retained with a status. The one DO alarm is set from the earliest embedded `runAt`.

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
  type: "UNIT_DESTROYED" | "UNIT_DAMAGED" | "UNIT_STATE_UPDATED" | "REQUISITION_AWARDED" | "CAMPAIGN_HISTORY" | "CAMPAIGN_RESULT";
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
- unique invitation-security bucket keys plus constrained scope/outcome vocabularies and indexed bounded cleanup paths from migration `0008`;
- nullable campaign scenario pins from migration `0018`; runtime requires an exact supported map/content pair, deliberately leaving legacy rows unavailable until an explicit migration decision;
- active global Game Master authority is an explicit grant, while actor-scoped campaign/authoring receipts and audits reject changed-payload command reuse;
- map heads use optimistic revisions and immutable saved revisions; only a published current map revision/hash can create the matching immutable version-2 custom-scenario row, and runtime initialization rechecks that exact pin plus its terminal/reward policy tuple;
- acyclic structured strategic-location hierarchy and same-map, non-self route edges;
- one active operational Battalion selection backed by active membership;
- Battalion-consistent ranks, Task Force ships, Battlegroup embarkations, and strategic-order subjects;
- one active Task Force per ship and one active carrier per Battlegroup;
- non-negative, capacity-bounded Large/Medium/Small strategic supply;
- actor-scoped strategic command uniqueness and complete resolved-round hash journals;
- foreign keys declared by the migrations, when foreign-key enforcement is active.

### 5.2 Enforced in the current Worker/DO/engine subset

- a session identity must be active and a campaign request must resolve an existing supported membership;
- local demo identity is restricted to K-17 and Operation Spearhead and cannot be enabled in production;
- local `0008` code applies fixed-window invitation limits across actor/Battalion/recipient/IP scopes and performs bounded hourly expiry/retention maintenance; these controls are not active in the recorded production version;
- tactical order/clock payloads reject unknown/unbounded fields, bodyless mutations reject payloads, and critical `state/current`/snapshot fields are runtime-validated before read/write through a versioned storage envelope;
- tactical order upsert requires actor-scoped command ID plus expected campaign/order revisions; clock update requires actor-scoped command ID plus expected campaign version; both atomically store hashed request/response receipts with their state changes;
- current-milestone orders are owner-only and cannot mutate after the current round locks;
- the server derives start position, revisions, rules costs, fitted weapon/equipment references, and visible target set;
- Hold/Advance/Rush, basic Attack, and narrow Load/Unload/Reload paths enter the current resolver; Scan and Deploy Drone are mechanically accepted but currently stop at events/cooldowns rather than completing their advertised visibility/state effects, so they are release-blocked;
- routes are adjacent/in-map and fit speed/action budget;
- facing is normalised to six values, final capacity is checked, and destroyed/withdrawn occupants do not consume capacity;
- resolver events are monotonic within the round, and only the exact accepted order ID/revision is marked resolved;
- a committed `resolution/{round}` makes a duplicate resolution call return the existing result.

### 5.3 Target invariants not yet enforced end to end

- complete Req pricing/income/replacement rules beyond the currently published purchases;
- full unit/ship/location reconciliation beyond the implemented loadout/deployment boundary;
- immutable published ruleset content and a campaign-bound engine/content hash;
- versioned custom objective semantics and standalone-custom-campaign strategic placement/recovery; the bounded skirmish terminal/reward policy is pinned, but custom objectives remain Game Master-authored live state and standalone results have no synthesized strategic node;
- immutable archival of all order revisions and canonical events into D1;
- cryptographic input/output/effect payload hashes;
- cryptographically journaled exactly-once D1 damage, death, equipment loss, history, and requisition effects beyond the current receipt-idempotent subset;
- acknowledgement of all required D1 effects before opening the next round;
- complete cross-store reconciliation/diagnostics for Game Master audit projection, grant administration/MFA, and service-level enforcement of every recorded strategic expected revision;
- runtime validation of every bounded JSON/public DTO.

## 6. Target D1/DO effects protocol

This is the accepted design, **not current behavior**:

1. Resolver emits stable ordered effects with an ordinal and canonical payload hash.
2. DO atomically commits result state/events, a hashed resolution record, and `pending-effect/{id}` records without calling D1 inside its storage transaction.
3. A D1 applier claims/inserts the matching `persistent_effects` row and applies the target mutation plus history/ledger/archive rows in a transactional batch.
4. A retry with the same ID/hash returns the existing applied result; a different hash fails closed.
5. DO records acknowledgements and opens the next round only after every required effect is `APPLIED`.

The tactical `persistent_effects` table still needs a follow-up migration or deliberately documented equivalent to support payload hashes, ordinals, claims/results, and strong collision detection. Phase 3's separate `strategic_effect_receipts` covers strategic/campaign-result targets but does not retrofit the Campaign Durable Object handshake. The current tactical runtime must also stop advancing the round before effect acknowledgement. See [ROUND_RESOLUTION.md](./ROUND_RESOLUTION.md).

## 7. Model evolution priorities

1. Add runtime schemas and explicit D1-to-domain adapters, including seconds/milliseconds and quarter-point conversion.
2. Choose one generated/hashed source of rules truth and enforce published immutability.
3. Deploy and monitor the locally implemented `0008` retention/invitation controls only after migration approval, then extend the passwordless boundary with operator account controls and session/device management without exposing auth identities publicly.
4. Evolve the five exact version-pinned authored loaders into hash-pinned scenario publications while retaining fail-closed selection and explicit, separately approved migrations for any legacy campaign upgrade.
5. Complete and reconcile the existing purchase/equip/deploy services, then add withdrawal/recovery before exposing the broader table families as complete features.
6. Add the tactical PREPARED/hash journal and D1 persistent-effect applier before claiming exact-once tactical-to-strategic resolution.
7. Reconcile legacy Player Unit/ship compatibility locations with structured strategic location through one transactional service.
8. Add archival workers/effects and reconciliation tooling only after the primary result/effect handshake is proven.
9. Evolve schedules into persisted status-bearing records if alarm crash/retry integration tests demonstrate the target protocol.

Related decisions: [ARCHITECTURE.md](./ARCHITECTURE.md), [STRATEGIC_LAYER.md](./STRATEGIC_LAYER.md), [BATTALION_MODEL.md](./BATTALION_MODEL.md), [SHIP_SYSTEM.md](./SHIP_SYSTEM.md), [STRATEGIC_RESOLUTION.md](./STRATEGIC_RESOLUTION.md), [ROUND_RESOLUTION.md](./ROUND_RESOLUTION.md), [CLOUDFLARE.md](./CLOUDFLARE.md), and the source dispositions in [RULE_CONFLICTS.md](./RULE_CONFLICTS.md).

## 8. Equipment/deployment vertical slice (migration 0005)

Migration `0005_equipment_deployment_vertical_slice.sql` adds typed equipment effects/refits, owner inventory, loadout locks/effective hashes, deployment methods/zones/plans, transport assignments, immutable campaign snapshots, campaign weapon/ability state, and actor-scoped mutation/effect receipts.

Authoritative mutation flow:

- owned inventory is distinct from installed `player_unit_equipment`;
- one active default loadout is mutable only with expected unit/loadout revisions and an authorised facility/muster context;
- a deployment plan stores owner and command approval separately;
- commit locks the selected loadout, changes the persistent unit to deployed state, creates one immutable `campaign_loadout_snapshot`, and creates the compatible tactical `deployments` row;
- `campaign_weapon_states`, `campaign_ability_states`, and `campaign_effect_receipts` preserve finite resources and idempotent post-round writeback.

The current effect receipt is an exactly-once application key, but it does not yet carry a cryptographic payload hash/attempt journal. The tactical round still opens before D1 acknowledgement; that stronger gate remains open.

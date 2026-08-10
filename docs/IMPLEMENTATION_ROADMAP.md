# Corinth's Plight — Implementation Roadmap

**Snapshot:** 2026-08-10

**Authority:** `docs/GAME_COMPLETION_GOAL.md`

**Release state:** Not release ready

**Estimates:** Indicative engineering effort, not delivery dates. `S` is up to three focused days, `M` is roughly one week, `L` is two to four weeks, and `XL` must be split before implementation.

This is the local issue register for the completion programme. IDs are stable and must be referenced by implementation commits, tests, audit updates, and release evidence. A row may be closed only when the applicable ten-layer definition of implemented in `GAME_COMPLETION_GOAL.md` is satisfied. Schema, catalogue, fixture, read-only UI, or unit-test presence alone is not completion.

## Priorities and state

- `P0` blocks safe public operation or makes an advertised path misleading.
- `P1` is required for the intended public-v1 game loop.
- `P2` is a deliberately unadvertised post-v1 expansion.
- `DECISION` is blocked on an explicit rules or product ruling; unknown values remain null and unavailable.
- States are `READY`, `IN_PROGRESS`, `BLOCKED`, `DEFERRED`, or `DONE`.

## Dependency spine

```text
audited baseline + CI
  -> runtime contracts + one catalogue
  -> preview + operations substrate
  -> persistent force/organisation loop
  -> ship + strategic journal/movement
  -> scenario pipeline + tactical journal
  -> deterministic combined arms/PvE
  -> strategic/tactical living war
  -> reports/collaboration/accessibility
  -> release rehearsal and sign-off
```

## Phase 0 — Reconcile and freeze the baseline

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-000 | P0 | IN_PROGRESS | M | Forensic capability, route, DO, rules, data, V1, and asset audit; maintain the four completion documents. | None | Every advertised surface has a status, evidence reference, confidence, and roadmap ID. |
| CP-001 | P0 | IN_PROGRESS | S | Application CI for clean install, seed validation, migration/seed replay, typecheck, lint, tests, security checks, and production build. | CP-000 | A pull request cannot merge when an enforced gate fails; actions use least privilege and immutable versions. |
| CP-002 | P0 | IN_PROGRESS | M | Browser smoke baseline and test harness. | CP-001 | Seven local Playwright journeys now cover the public auth shell, live local authenticated strategic/tactical services, strategic Disembark submission/resolution, a forged tactical economy field, the executable tactical composer/planning layers, and 390px overflow; remote CI evidence and the full production-like matrix remain open. |
| CP-003 | P0 | IN_PROGRESS | M | Coverage and integration-test policy for routes, real D1, and both Durable Objects. | CP-001 | Campaign command/state tests and auth-operation integration probes have begun; agreed thresholds, Strategic DO coverage, and systematic real-D1/route coverage remain open. |
| CP-004 | P0 | DONE | S | Reconcile stale architecture, Cloudflare, authentication, onboarding, rules, and test-count documentation. | CP-000 | Current docs distinguish deployed production `0007` from local migration head `0008`, the D1/compiled catalogue split, active mechanics, command receipts, and deliberate strategic/tactical deferrals. |
| CP-005 | P0 | DEFERRED | S | Immutable release manifest and health/readiness metadata. Owner explicitly deferred this operational slice while gameplay dependencies are completed. | CP-001 | Build exposes commit, artifact digest, migration head, ruleset/content hashes, environment, and deployment time without secrets. |

**Phase 0 gate:** the application quality workflow is enforced and the audit has no unclassified advertised surface. CP-004 is reconciled locally; CP-001–CP-003 and CP-005 still require their remaining evidence before the gate closes.

## Phase 1 — Make identity, onboarding, and the platform operable

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-100 | P0 | IN_PROGRESS | L | Versioned runtime schemas for requests, responses, stored DO/D1 JSON, rules, scenarios, and audience DTOs; common error/command/receipt envelopes. | CP-001 | Campaign order/clock intents and versioned current/snapshot storage now fail closed with actor-scoped SHA-256 receipts/CAS; other public routes, response/audience DTOs, rules and scenarios remain to be covered. |
| CP-101 | P0 | BLOCKED | M | Provision isolated preview D1/DO resources, secrets, route, migrations, seed policy, smoke scripts, retention, and teardown. | Explicit Cloudflare authorization; CP-001 | Preview contains no production data or demo auth, rejects placeholder IDs, and passes the Phase 1 authenticated E2E flow. |
| CP-102 | P0 | IN_PROGRESS | M | Auth retention: expired challenge/session/rate-bucket cleanup, idle and absolute TTLs, session/device list, revoke-one/revoke-all, and time-travel tests. | CP-100 | Local migration `0008` adds bounded hourly terminal-record maintenance and retention evidence; idle/absolute policy, device/session UI, revoke-one/all, production migration and operational monitoring remain open. |
| CP-103 | P1 | READY | M | Player profile settings, timezone/display identity, export, deletion/anonymisation policy, and returning-account empty states. | CP-100, CP-108 | A user can manage identity and data lifecycle without direct database work. |
| CP-104 | P0 | IN_PROGRESS | S | Invitation abuse controls: actor/Battalion/recipient/IP limits, cooldown, quotas, opt-out, and audit. | CP-100 | Local fixed-window limits, pseudonymized audit and asynchronous delivery recovery are being hardened; opt-out, wide-address/adversarial production evidence, monitoring and production migration remain open. |
| CP-105 | P0 | READY | M | Observability and SLOs for HTTP, auth/email, D1, journal/effects, schedule lag, alarms, and sockets; least-privilege diagnostics. | CP-005 | Preview dashboards/alerts identify a forced fault and diagnostics do not expose private state. |
| CP-106 | P0 | READY | M | Backup, restore, forward-fix/Worker rollback, D1 time-travel/export, DO checkpoint/reconstruction, and reconciliation rehearsal. | CP-101, CP-105 | A recorded preview restore meets approved RPO/RTO and verifies hashes/constraints/journal state. |
| CP-107 | P0 | BLOCKED | M | Privacy, terms, support/security reporting, account-data policy, dependency notices, and asset-rights process. | Owner/legal decisions | Published minimum notices and support route exist before public invitations; unverified assets are quarantined. |
| CP-108 | P0 | DONE | M | Passwordless Resend registration/login/verification/logout and guided join/create Battalion, starter unit, tour. | Migrations 0006–0007 | Production foundation deployed and unit-tested; broader operational gates remain CP-102–CP-107. |
| CP-109 | P0 | READY | M | Durable schedule records and recovery semantics for pending/running/consumed/failed jobs. | CP-100, CP-105 | Duplicate, late, eviction, crash, and stale-running tests pass; new rounds remain gated on effect acknowledgement. |

**CP-100 catalogue sub-gate:** the catalogue-specific portion of CP-100 is now implemented locally: strict JSON/canonicalization utilities, a versioned normalized rules-catalogue envelope, SHA-256 verification, explicit nullable number/status pairs, definition/relation/overlay/handler invariants, canonical-versus-companion unit classification, and a redacted public projection. This unblocks CP-200 without pretending that CP-100's scenario, audience-DTO, and common mutation-envelope work is complete.

**Phase 1 gate:** a new preview user registers, verifies, onboards, returns in a fresh session, and sees only server-backed state. Backup/restore, retention, monitoring, and support evidence are recorded.

## Phase 2 — One catalogue and the persistent force loop

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-200 | P0 | IN_PROGRESS | L | Replace split D1/compiled/adaptor truth with one generated and validated immutable rules catalogue. | CP-100 catalogue sub-gate; rule decisions as activated | The generated immutable `v5-core-curated@2` catalogue accounts for 96 top-level definitions, 104 supporting definitions, 13 canonical and 3 companion classes, 72 canonical conflicts, and the currently proven foundation unit/order/action/equipment handlers; the public rules endpoint serves its hash-verified redacted projection. Starter options/grants, Force catalogue projection, deployment hydration, tactical UI lookups, order submission and resolution now materialize six playable units, weapons and executable grammar from `@2`; unsupported classes and unhandled Scan/Drone requests fail closed. Immutable D1 publication and removal of legacy validation/instance-storage identity remain open. |
| CP-201 | P0 | DONE | M | Repair D1-to-tactical adapters: preserve availability/requisition status, action links, nullable stats, cargo alternatives, supply vocabulary, and executable-handler identity. | CP-200 | Generated authority is pinned into governed deployment snapshots; D1/generated profile bindings are checked; nullable sensor/cost status is retained; all cargo shapes, towing and mutually exclusive modes hydrate without invented slots/action costs; tactical resources use exact `*_SUPPLY`/`MAIN_AMMUNITION` IDs; and unsupported classes/equipment fail before the legacy handler. Cargo actions whose governed shape cannot be represented by the old executor are withheld until CP-503. Removing the five-class `@1` compatibility implementation remains CP-200, not adapter debt. |
| CP-202 | P1 | BLOCKED | L | Approved Req economy: grants/income/rewards, unit/equipment/refit prices, replacement, timing, and exact-once ledger. | DEC-001 through DEC-004 | No zero-price fallback; concurrent/replayed purchases and losses produce one balanced ledger result. |
| CP-203 | P1 | IN_PROGRESS | L | Complete persistent unit lifecycle: obtain/name/inspect, health/ammo/supply, location, recovery/repair, service/history, destruction and memorial. Tactical rounds now append receipt-idempotent owner history and increment participating units' rounds/campaign service summaries; recovery/repair and full lifecycle UX remain open. | CP-200, CP-202 | A unit survives or dies across campaigns with exact persisted consequences and no duplicate location. |
| CP-204 | P1 | READY | L | Inventory versus installed loadout, slots, prerequisites, incompatibilities, duplicates, ammo/cooldowns/consumables, refits, loss, and transaction history. | CP-200, approved equipment decisions | Each activated item has data, pure effect/validation, mutation, receipt, UI, fog projection, and tests. |
| CP-205 | P1 | READY | M | Stable icon/sprite keys and licensed asset pipeline for Forces, deployment, map, reports, and accessible alternatives. | CP-107, CP-200 | Every public class has an optimized visual and semantic fallback; manifest records source/license/hash. |
| CP-206 | P1 | READY | L | Battalion lifecycle: directory, invite/code, join/leave/remove, ranks/permissions, member management, active switching, audit. | CP-100, CP-104 | Two real accounts exercise each authorized transition; IDOR and permission tests cover every mutation. |
| CP-207 | P1 | READY | L | Battlegroup CRUD, unit assignment, leader/delegation, composition validation, and operational filtering. | CP-203, CP-206 | Mixed-owner delegated group passes exact authority rules and cannot place a unit in two active formations. |
| CP-208 | P1 | IN_PROGRESS | M | Generalize Forces and deployment UI; remove `demo-user`, fixed Spearhead/Hammer IDs, and showcase-on-error behavior from production. Deployment planning now discovers the signed-in user's joined authored campaign, uses a per-session plan ID, omits fixed Battlegroup context, and renders an error instead of showcase data; Forces and strategic fallbacks plus broader formation selection remain open. | CP-201, CP-203, CP-207 | API failure renders an explicit recoverable error, never authoritative-looking local data. |

**Phase 2 gate:** a real player can obtain, name, inspect, equip, organize, and persist a mixed force with every cost and eligibility decision enforced by the server.

## Phase 3 — Ship and strategic movement vertical slice

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-300 | P1 | BLOCKED | L | Ship acquisition/naming policy and hull/module inventory, slots, prerequisites, compatibility, costs, refit/removal, history, revisions, and receipts. | CP-202; DEC-010–DEC-013 | Battalion configures one named ship through server mutations; invalid slots/cost/replay fail atomically. |
| CP-301 | P1 | IN_PROGRESS | L | Task Force/Battlegroup embark/disembark, berth/cargo/facility capacity, supply transfers, and location invariants. Authorized Disembark, Task Force resupply and campaign-support orders now submit and resolve through the map coordinator; the development fixture activates the matching Battalion permissions. General embark capacity, multi-store transfers and tactical deployment remain open. | CP-207, CP-300, DEC-008 | Cross-Battalion and over-capacity operations fail; carried forces cannot exist on-map simultaneously. |
| CP-302 | P0 before activation | IN_PROGRESS | XL | Strategic PREPARED/APPLIED/ACK/COMMITTED journal, crypto hashes, alarm coordinator, effects, reconcile/retry and failure injection. Public orders now reach the map-sharded coordinator, and an approved resolve atomically applies the pure resolver output to formations, supply, operations, audience events, applied-effect receipts, the resolved round and its successor. Expected map/formation/round versions and command replay are enforced. A separately staged PREPARED record, cryptographic hashes, alarm scheduling, cross-Battalion map aggregation and forced-crash recovery remain open. | CP-100, CP-105, CP-109 | Public orders and each round resolve exactly once across every forced crash boundary; collision/retry mismatches fail closed. |
| CP-303 | P1 | BLOCKED | L | Public route planning, multi-round travel, arrival, supply use, route state, concurrency, withdrawal and redeployment. | CP-302, DEC-005 | Formation visibly traverses each route step without teleportation or duplication. |
| CP-304 | P1 | READY | M | Production-like two-planet strategic content with multiple concurrent operations; no development seed in production. | CP-101, CP-303 | Preview demonstrates independent operations and audience-safe map projections on at least two planets. |
| CP-305 | P1 | IN_PROGRESS | M | Replace read-only/deferred Ship and Galactic controls with authorized mutations; remove strategic showcase fallback. Galactic Operations now exposes live formation selection, Disembark, consume-Large-Supply, campaign Support and approval-gated round resolution, refreshing the authoritative projection after success. Movement remains unadvertised while route timing is `BALANCE_REQUIRED`; Ship mutation and showcase removal remain open. | CP-300–CP-304 | Every advertised control reaches a tested receipt-backed workflow; unavailable mechanics are unadvertised. |

**Phase 3 gate:** a Battalion configures a ship, embarks a legal force, submits a route, resolves over multiple rounds, and arrives at another planet without teleportation or duplicate state.

## Phase 4 — Scenario pipeline and complete K-17 loop

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-400 | P0 | IN_PROGRESS | L | Versioned scenario/map schemas, content hashes, importer/validator, map/objective/deployment/enemy/victory/reward definitions. Two authored loaders now exist: `scenario-outpost-k17-hold-relay@3` and `scenario-operation-iron-rain@1`. Iron Rain builds a 169-hex Kestrel Ridge battlefield, eight-unit western muster, Hold Airfield/Destroy Hive objectives, six-round policy, four opening enemies and three reserve waves from `campaigns.map_source_key`; unsupported content still fails closed. Terminal outcomes carry a typed reward disposition: service history is recorded while Req remains `BALANCE_REQUIRED` under RC-V5-016. General schema/import and priced rewards remain open. | CP-100, CP-200 | A campaign loads its pinned scenario; no non-K17 campaign calls the demo-state factory. |
| CP-401 | P1 | IN_PROGRESS | M | Campaign browser, discovery/membership/withdraw/reinforce, general campaign navigation, and role policy. The authenticated directory lists the viewer's memberships plus joinable authored recruiting campaigns; an idempotent campaign-owned join receipt binds the active Battalion, starter grants enter a deployable personal Battlegroup, and selected IDs drive deployment, tactical state/WebSocket/order/report URLs. A production-safe K-17 recruiting campaign/insertion zone is seeded. Withdraw, reinforce, richer discovery and membership administration remain open. | CP-206, CP-400 | No production client constant selects campaign or user; unauthorized campaign IDs remain undiscoverable. |
| CP-402 | P0 before live rounds | IN_PROGRESS | XL | Tactical PREPARED/effects/ACK/COMMITTED journal, crypto hashes/seed commitment, D1 archives, retry/reconcile and next-round gate. The playable path now commits result/events/effects into `EFFECTS_PENDING`, retries receipt-idempotent D1 effects by alarm/manual replay, and opens exactly one next planning round only after every pending key acknowledges. PREPARED/input hashing, protected seeds, payload collision checks, attempt diagnostics, full effect coverage and exhaustive crash injection remain open. | CP-100, CP-105, CP-109 | Every forced crash boundary resolves/reconciles exactly once; next planning round opens only after matching effect acknowledgement. |
| CP-403 | P0 | READY | L | Per-audience WebSocket invalidations, monotonic sequence catch-up, event-time intelligence and report redaction. | CP-402 | Enemy viewers never receive allied order/unit identifiers; reconnect fills gaps with the same redacted event history. |
| CP-404 | P1 | IN_PROGRESS | L | Public Outpost K-17: setup, map, membership, deployment, enemy force, objectives, waves, outcomes, rewards and report. Authenticated campaign discovery/join/deployment, authored K-17 content, four assault waves, capture/outcome logic, terminal behavior, round reports, acknowledgement-gated effects and persistent per-unit service/history outcomes are now present. Migration `0010` persists the terminal result, closes the D1 campaign/linked operation idempotently, projects it in the campaign directory, and the after-action view shows service credit plus the deliberately blocked Req award. A local browser journey completes all four rounds and reads the durable result. Req pricing, Allied reinforcement/withdrawal and multi-account preview evidence remain open. | CP-400–CP-403 | Two preview accounts complete multiple rounds and a destroyed equipped unit persists exactly once. |
| CP-405 | P1 | READY | M | Campaign director/GM controls for create/configure, membership, clocks, spawns, objectives, announcements, awards and safe retry/reconcile. | CP-105, CP-400–CP-404 | Least-privilege audited commands recover a deliberately failed round without outcome editing or duplicate effects. |
| CP-406 | P1 | DONE | S | Expose every actually executable order/action in tactical UI and remove notice-only/inert controls. The composer now offers only generated executable Hold/Advance/Rush/Evasive and Attack/Dig In/Reload/Load/Unload/Heal/Repair/Deploy/Pack Up/Bombardment, derives action intent fields, displays authoritative resources and blockers, and omits catalogue-only mechanics. Owned/Allied roster scope and Surface/Intel/Supply map layers now provide real planning views. | CP-200, CP-404 | UI affordance matrix exactly matches server execution matrix and explains blockers. |

**Phase 4 gate:** two or more preview accounts complete the `gameplan.md` introductory scenario, including a persistent death/loss and detailed audience-safe report.

## Phase 5 — Deterministic PvE and combined arms

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-500 | P1 | IN_PROGRESS | L | Movement contention, terrain/elevation/roads/rivers, facing, cover/high ground/smoke, structures and remembered intelligence. Quarter-distance simultaneous routes now implement hostile contests, occupied-hostile stops, legal-prefix persistence and Mech/Aerospace passage. Terrain Advantage, Dig In, and generated/scenario Cover Armor are playable end to end. Directional cover, smoke, destructible structures, unpinned movement-cost defaults and remembered intelligence remain open. | CP-200, CP-400, decisions DEC-006/DEC-007 | Pure permutation/golden tests and event-time projections cover every activated terrain rule. |
| CP-501 | P1 | IN_PROGRESS | L | Multiweapon, Rapid Fire, arcs/domain, rear exclusions, subsystem damage/repair, indirect spotting, ammo/cooldown and simultaneous reports. A single target Attack now fires every server-derived eligible fitted weapon once with per-weapon dice, mitigation, resource updates and skip evidence. Governed tags apply Rapid Fire versus Horde and constrain rear effects to ground vehicles/infantry while excluding air. Persistent natural-5/6 subsystem failures resolve after simultaneous attacks. Split fire, forward firing arcs and expanded calculation provenance remain open; Evasive is tracked under CP-504. | CP-200, applicable decisions | Reports show auditable calculation; no air flank, overfire, hidden-target or cooldown defect. |
| CP-502 | P1 | IN_PROGRESS | L | Support mechanics verticals. Medic support and Engineer vehicle Repair are playable end to end. Artillery starts packed, has playable Deploy/Pack Up, and now performs Primary Bombardment against a known spotted hex: one Small Supply creates capped radius-one Defense suppression, stacks deterministically, affects attacks, and recovers by one in unbombarded rounds. Construction, Funnel, structures, MASH and general tactical supply remain open. | CP-500, DEC-006/DEC-009 | Each activated support action consumes the authoritative actor/resource and persists deterministic progress/effects. |
| CP-503 | P1 | BLOCKED | L | Cargo, towing, transfers, reload, Logi/HAT and transport-destruction consequences. | CP-201, DEC-008 | Occupancy/speed/capacity are checked; destruction follows the approved rule with conflict provenance. |
| CP-504 | P1 | IN_PROGRESS | L | Evasive, melee/brawl, Stealth and selected special orders. Evasive is playable for generated eligible units: endpoint eligibility, actual post-contention displacement, `+3 Defense`, outgoing `-2`, UI guidance and report evidence are connected. Melee/Brawl and Stealth remain deferred. | CP-500–CP-501, activation decisions | Only approved profile mechanics become executable; deterministic target/tie rules have golden tests. |
| CP-505 | P1 | BLOCKED | XL | Fighter, bomber, VTOL and HAT movement/altitude/landing, arcs, intercept, bomb/airdrop, rearm/repair and spotting. | CP-500–CP-503, DEC-009/DEC-013 | Combined-arms scenario exercises legal air paths and rejects unsafe/unknown cases without guessed values. |
| CP-506 | P1 | IN_PROGRESS | L | Data-defined enemy factions, units, doctrine, formation/cohesion, target spreading, objective/supply/retreat/reinforcement and difficulty. Published @2 Bug doctrine now generates the locked round's legal Hold/Advance/Attack intentions, applies AP/personnel target priorities, spreads fire deterministically, advances toward the scenario's authored primary objective, and emits fog-projected intention evidence. Formation cohesion, explicit retreat/supply policies, difficulty profiles and incomplete enemy roles remain open. | CP-400, mechanics as activated | Enemy uses the same order grammar from the locked snapshot; repeated/permuted inputs yield identical intentions. |
| CP-507 | P1 | IN_PROGRESS | M | Operation Iron Rain is now a playable larger combined-arms scenario: the live deployment planner shows its High-threat briefing, commits six supported persistent Hammer units into the western muster, the Campaign DO loads the Kestrel map/objectives/waves, and a real local round advances with durable reporting. It currently exercises the executable foundation set; the remaining public-v1 classes and deferred air/cargo mechanics are not yet part of the replay fixture. | CP-500–CP-506 | All public-v1 classes and activated mechanics appear in replayable, audience-safe tests. |

## Phase 6 — Dynamic multi-planet war

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-600 | P1 | READY | XL | Deterministic campaign director for threat, control, routes, operations, supply, reinforcements, unlocks, consequences and victory/failure. | CP-302, CP-506 | Same strategic snapshot/events yield the same hashed transition; no LLM/network dependency. |
| CP-601 | P1 | READY | L | Strategic deployment bootstraps tactical campaigns with exact unit/loadout/location snapshot. | CP-301, CP-400, CP-402 | Commit creates one tactical presence and reserves the formation atomically. |
| CP-602 | P1 | IN_PROGRESS | L | Terminal tactical results close the campaign and linked operation. Authored victory consequences parse fail-closed and apply in the same D1 batch: Iron Rain changes Kestrel Ridge to `FRIENDLY`, opens the locked K-17 route, increments the strategic map, emits Battalion activity, and stores one `strategic_effect_receipts` row per target. Broader campaign-result ingestion through the pure strategic resolver and payload-collision diagnostics remain open. | CP-302, CP-402, CP-600 | Replayed result changes war state once; mismatched payload/hash fails and alerts. |
| CP-603 | P1 | IN_PROGRESS | L | Terminal campaign effects now close active deployments, preserve destroyed units, return surviving persistent units to `RESERVE` at the operation node with their exact health/ammo/supply state, unlock campaign loadouts, disembark or cancel carrier links, and place participating Battlegroups in `RECOVERING`. Re-embark, resupply, repair and redeployment UX remain open. | CP-301, CP-601–CP-602 | Survivors return with exact damage/ammo/supply/history and later deploy elsewhere. |
| CP-604 | P1 | BLOCKED | M | Season/war archive, reset and historical preservation policy. | DEC-014 | Reset preserves immutable player history and cannot orphan active campaigns/effects. |

## Phase 7 — Reports, collaboration, content and polish

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-700 | P1 | IN_PROGRESS | L | Reports index/detail, deterministic playback, calculations, event-time fog, declassification and export. A tactical round archive/detail UI now groups projected movement/combat/support/objective events and terminal results; index API, event-time fog, playback, export and strategic consequences remain open. | CP-403, CP-501 | A viewer can explain movement, dice, mitigation, casualties, objectives and strategic consequences without hidden-state leakage. |
| CP-701 | P1 | READY | M | Pings, command markers, shared notes, intention filters, readiness/missing-order views and notifications. | CP-206, CP-403 | Collaboration is permissioned, audience-safe, rate-limited and reconnect-safe. |
| CP-702 | P0 release gate | READY | L | WCAG 2.2 AA work: semantic tactical grid/list, keyboard route/target controls, dialogs/focus/live regions/contrast/reduced motion, screen-reader audit. | CP-404, CP-700 | Axe and manual keyboard/screen-reader evidence cover every core workflow on supported viewports. |
| CP-703 | P1 | READY | M | Responsive/error/empty/help/rules/support polish and remove false-front local data. | Earlier UI slices | New users can understand next action, blocker, round result and strategic consequence without source knowledge. |
| CP-704 | P2 | DEFERRED | XL | Orbital combat, boarding, blockade/interception, capture and advanced ship combat. | DEC-010–DEC-013 and post-v1 approval | Unadvertised until a separate end-to-end activation plan passes all implementation layers. |

## Phase 8 — Public release hardening

| ID | Priority | State | Estimate | Slice | Dependencies | Acceptance evidence |
|---|---|---:|---:|---|---|---|
| CP-800 | P0 | READY | L | Browser E2E matrix for auth/onboarding, force/equipment, Battalion/ship, strategic travel/deploy, tactical resolve/report, persistence/reconnect. | Phases 1–7 | Desktop/tablet/mobile production-like preview runs retain traces/screenshots and exercise real APIs. |
| CP-801 | P0 | READY | M | Security matrix: IDOR, permissions, origin/CSRF, enumeration, replay, rate/payload abuse, secrets and admin least privilege. | CP-100 and every mutation | All mutation surfaces have negative tests; high findings are closed or release-blocking. |
| CP-802 | P1 | READY | M | Performance/load/capacity tests for large maps/forces, concurrent submissions, WebSocket fan-out, D1 plans and DO CPU/storage. | Feature-complete preview | Approved p95/p99 and concurrency budgets pass a soak with alerts enabled. |
| CP-803 | P0 | READY | M | Production-like migration, backup/restore, deployment and rollback rehearsal. | CP-101, CP-106 | Signed evidence records release manifest, hashes, RPO/RTO, rollback trigger and successful recovery. |
| CP-804 | P0 | BLOCKED | M | Final legal/privacy/licensing/support closure. | CP-107 and owner/legal approval | All public assets/content have provenance; data rights and support/security routes are live. |
| CP-805 | P0 | BLOCKED | L | Final 14-step public-release acceptance scenario and multi-day accelerated preview soak. | All P0/P1 and decisions | Every step in `GAME_COMPLETION_GOAL.md` is evidenced; no advertised 501, demo/showcase fallback, developer override or unresolved value is reachable. |

## Decision dependencies

Decision IDs live in `RULE_DECISIONS_REQUIRED.md`. The roadmap does not estimate content activation behind an unresolved decision as if the value were known.

| Decision | Blocks |
|---|---|
| DEC-001 through DEC-004 — Req, prices, grants/rewards, replacement/refund | CP-202, CP-203, CP-204, CP-300 |
| DEC-005 — strategic travel time/cost | CP-303, CP-304 |
| DEC-006 — construction/structure values | CP-500, CP-502 |
| DEC-007 — terrain/cover/scenario modifiers | CP-500 |
| DEC-008 — cargo/transport destruction | CP-301, CP-503 |
| DEC-009 — hazardous drops/aerospace details | CP-505 |
| DEC-010 through DEC-013 — ship/orbital/Atmo-Fuel/supply | CP-300, CP-303, CP-505, CP-704 |
| DEC-014 — season/reset/archive | CP-604 |
| DEC-015 — event declassification | CP-700 |
| DEC-016 — privacy/retention/legal | CP-102, CP-103, CP-107, CP-804 |

## Working rules

1. Take the smallest dependency-ready row and deliver it end to end.
2. Start with a failing acceptance test or evidence capture.
3. Preserve campaign/ruleset pinning; never mutate published truth in place.
4. Unknown source values remain blocked, null, and visibly unavailable.
5. Update `COMPLETION_AUDIT.md`, this roadmap, `RULE_DECISIONS_REQUIRED.md`, and `RELEASE_READINESS.md` in the same slice.
6. Do not deploy, migrate production, push, send email, or perform irreversible external actions without explicit authorization.

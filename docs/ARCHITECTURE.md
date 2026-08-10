# Corinth's Plight Architecture

**Status:** Phase-0 reconciled Phase 1–3 foundation decision record (2026-08-10)

**Scope:** The original foundation milestone plus additive Phase 2 persistent forces, Phase 3 strategic war, the equipment/deployment slice, production identity/security operations, and guided enlistment; not the complete Phase 3 success scenario

**V1 baseline:** commit `609ea9f50b4d595cfa07c2677d3eeb681d45d0ce`; see [V1_AUDIT.md](./V1_AUDIT.md)

## 1. Reading this document

This document distinguishes three states:

| Label | Meaning |
|---|---|
| **Implemented** | Present in the repository and exercised by the current TypeScript build or tests |
| **Target** | An accepted architecture decision that still needs implementation before production |
| **Deferred** | Outside the first foundation deliverable |

The current repository is a deployed identity/guided-enlistment foundation with partial force, equipment, deployment, tactical, and strategic read-model work. K-17, the Corinth strategic world, and Spearhead are development fixtures. It is **not** yet the complete production game: production has no world/campaign content, public strategic order submission and resolution are explicitly blocked, non-K-17 tactical state still inherits the K-17 demo map, and the tactical effect journal advances before D1 acknowledgement.

## 2. Exact foundation milestone

`gameplan.md` section 56 requires seven repository documents followed by D1 migrations, ruleset seed data, core TypeScript domain models, a pure rules-engine skeleton, a Campaign Durable Object skeleton, an accelerated local campaign clock, and a basic hex-map prototype. It then requires a successful Cloudflare deployment before gameplay expansion.

| Deliverable | Repository evidence | Status |
|---|---|---|
| Foundation and Phase 3 design/audit documents | Original seven documents plus `STRATEGIC_LAYER.md`, `BATTALION_MODEL.md`, `SHIP_SYSTEM.md`, and `STRATEGIC_RESOLUTION.md` | Implemented |
| D1 migrations | `migrations/0001_platform_and_rules.sql` through `0008_auth_retention_and_invitation_abuse.sql` | Eight additive schema artifacts in the repository; production is recorded only through `0007`, so `0008` is not active there |
| Ruleset seed | `seeds/v5-core-curated.sql`; consistency check in `scripts/validate-seed.ts` | Idempotent SQL artifact exists, but its 12 obsolete conflict IDs and split compiled/D1 catalogue prevent a complete authority claim |
| Domain contracts | `packages/domain/src/index.ts`, `worker/campaign-contracts.ts` | Shared TypeScript interfaces plus bounded tactical request contracts and a versioned, validated Campaign DO state/snapshot envelope; general public DTO/runtime schemas remain incomplete |
| Pure rules engine | `packages/rules-engine/src/` and `packages/rules-engine/test/` | Implemented foundation subset |
| Campaign DO skeleton | `worker/campaign-durable-object.ts` | Implemented for K-17; non-K-17 initialization requires committed deployment snapshots but still derives map/terrain defaults from the K-17 demo factory and is not a general scenario bootstrap |
| Accelerated clock | `worker/campaign-clock.ts` and its tests | Implemented, including manual/1m/5m/30m/24h presets |
| Basic hex-map prototype | `src/App.tsx`, `src/components/HexMap.tsx`, `src/components/Glyph.tsx` | Implemented |
| Phase 2 persistent forces | `0003`, the combined-arms catalogue/fixture, typed force services and UI | Implemented checkpoint; not every catalogue mutation is active |
| Phase 3 strategic schema/world | `0004`, `development-strategic-world.sql`, and the four Phase 3 design documents | Implemented local checkpoint |
| Strategic resolver/API/UI | Domain, pure-engine, Worker, and responsive strategic workspace files | Partial read/prototype checkpoint: read APIs exist, the internal order service is not exposed by the public route, public order submission returns `501`, the coordinator resolver returns `501`, and the UI can fall back to showcase data |
| Equipment/loadout/deployment slice | `0005`, equipment seed, pure engine, Worker services, planner/force UI, and Spearhead fixture | Partial vertical slice; D1/compiled catalogue drift, companion slot authority, Scan/Drone effects, broader Store content, and general campaign bootstrap remain blockers |
| Public home and production identity slice | Public React gateway, Resend passwordless services/routes, opaque sessions, `0006`, and local `0008` retention operations | Passwordless flow implemented/deployed; `0008` cleanup cron is implemented and locally verified but not deployed |
| Guided enlistment and Battalion recruitment | `0007`, `onboarding-foundation.sql`, typed Worker services/UI, and local `0008` invitation controls | Core flow implemented/deployed; `0008` abuse/expiry controls are implemented and locally verified but not deployed |
| Successful remote foundation deployment | Production D1 is migrated through `0007`; Phase 3/equipment/identity/onboarding Worker and UI are available at `corinthplight.qnetica.com.au` | Implemented on 2026-08-10; production scenario data remains open |

The full Phase 3 scenario—production account creation, invitation, purchase, ship travel, deployment into a tactical campaign, exact-once permanent strategic consequences, recovery, and redeployment—is the product definition of success, not a claim about this checkpoint.

## 3. V1 baseline and strangler consequence

V1 is a Flask 3/Jinja/SQLAlchemy application with module-level state, SQLite fallback through `DATABASE_URL`, Flask-Login sessions, Flask-WTF CSRF, and Alembic scaffolding without migration versions. The audited flows work after adding two undeclared packages, but the repository also contains broken entry points, CSRF omissions, plaintext passwords, literal secrets, client-authored equipment JSON, and disconnected ship-builder/world-map prototypes.

Retain as product input:

- visual identity, artwork, portraits, planet imagery, and interaction ideas;
- the `UnitTemplate` versus `UserUnit` distinction;
- explicit Legion membership and the dossier, roster, directory, ship-builder, and map concepts.

Do not retain as authority:

- V1 passwords, secrets, sessions, free-form authorization roles, or client-authored statistics/equipment;
- filesystem/base64 upload storage, `create_all()` schema management, or destructive template reseeding;
- hard-coded Python rules or the Flask/Jinja runtime as the new backend.

The migration is a product-level strangler. `app/`, `shipbuilder/`, and `worldmap/` remain untouched reference implementations until a replacement workflow has authorization, migration reconciliation, and acceptance tests. There is no long-lived dual-write between V1 and D1.

## 4. Modular-monolith boundary

```mermaid
flowchart LR
    Browser["React client: src/"] -->|HTTPS / WebSocket| Worker["Worker: worker/index.ts"]
    Worker --> Auth["Session, Battalion, and campaign policy"]
    Worker --> D1[("D1 global records")]
    Worker -->|named campaign ID| CampaignDO["Campaign Durable Object"]
    Worker -->|stable strategic map ID| StrategicDO["Strategic Map Durable Object"]
    CampaignDO --> Engine["Pure rules engine"]
    StrategicDO --> Engine
    Worker --> Domain["Shared TypeScript contracts"]
    CampaignDO --> Domain
    StrategicDO --> Domain
    Engine --> Domain
    CampaignDO -->|"receipt-idempotent effects"| Applier["D1 persistent-effect applier"]
    StrategicDO -. "canonical strategic effects" .-> Applier
    Applier --> D1
```

There are no independently deployed microservices. The client, Worker entry point, Campaign and Strategic Map Durable Objects, shared contracts, and pure engine are one repository and release train with explicit dependency boundaries.

### 4.1 Actual repository boundaries

| Path | Current responsibility | Boundary |
|---|---|---|
| `src/` | React/Vite command interface and local UI state | May consume public contracts and projections; never authoritative game logic |
| `src/components/` | Hex map and reusable visual components | No D1/DO access |
| `worker/index.ts` | Public API composition, origin policy, authentication, D1 campaign authorization, named-DO forwarding, security headers | Browser never receives a DO stub |
| `worker/auth.ts` | Demo/session authentication, D1 membership lookup, trusted viewer headers | Demo mode is development-only; no V1 credential compatibility |
| `worker/services/security-operations.ts`, `worker/repositories/security-operations.ts`, `worker/services/invitation-delivery.ts` | Bounded retention maintenance, pseudonymized invitation throttling/audit, and a leased Resend delivery outbox | Immediate `waitUntil` attempts plus hourly recovery and migration `0008` exist locally; production remains on the pre-`0008` deployment |
| `worker/campaign-durable-object.ts` | K-17 campaign state, fixture-derived committed-snapshot initialization, orders, alarms, sockets, resolution, projections, and narrow receipt-idempotent D1 writeback | General scenario bootstrap, next-round acknowledgement gate, audience-safe realtime/reporting, and cryptographic effect journal remain open |
| `worker/campaign-clock.ts` | Pure clock/schedule transitions | Schedule is currently embedded in `state/current`, not separate storage records |
| `worker/strategic-*` | Strategic request policy/validation/clock and map coordination as landed | Must remain map-sharded and permission scoped; no global game object |
| `worker/enemy-ai.ts` | Deterministic foundation enemy orders | No LLM or network dependency |
| `worker/http.ts` | JSON/no-store responses, body-size limit, JSON parsing | It does not provide general runtime schema validation or content-type enforcement; campaign-specific parsing lives in `worker/campaign-contracts.ts` |
| `packages/domain/src/` | Shared TypeScript interfaces and constants | Compile-time contracts only; not a runtime schema package yet |
| `packages/rules-engine/src/` | Pure compiled catalogue, hex, mechanics, visibility, RNG, enemy/demo fixtures, and resolver | No storage, network, wall-clock reads, or `Math.random()`; its five allied tactical definitions do not cover all D1 classes marked executable |
| `packages/rules-engine/test/` | Pure engine fixtures and regression tests | No live Cloudflare integration |
| `migrations/` | Eight ordered additive D1 SQL migrations | Production is recorded through `0007`; no new runtime uses the legacy Alembic files also retained in this directory |
| `seeds/v5-core-curated.sql`, `seeds/v5-phase2-combined-arms.sql` | Versioned D1 rules/source/conflict catalogue | Definitions only; availability overlays distinguish executable/catalogue state |
| `seeds/onboarding-foundation.sql` | Production-safe guided-enlistment policy and three NPC recruitment Battalions | Product fixture, not canonical V5 lore; no development User or campaign data |
| `seeds/development-forces.sql`, `seeds/development-strategic-world.sql` | Explicit local-only Phase 2/3 fixtures | Never production data or automatically canonical lore |
| `scripts/validate-seed.ts` | Source-digest, catalogue, Phase 2, and Phase 3 seed-presence checks | It is a validator, not a D1 importer or full content-hash proof |
| `wrangler.jsonc`, `vite.config.ts` | Worker/DO/D1 environments and Vite/Cloudflare composition | Production D1 is provisioned; local/preview placeholder IDs are non-production bindings |
| `app/`, `shipbuilder/`, `worldmap/` | V1 reference during strangler migration | Not imported into the Worker |

Demo authentication lives in `worker/auth.ts`. Wrangler package scripts apply the core/Phase 2/equipment catalogues and production-safe onboarding foundation separately from explicit development fixtures.

### 4.2 Dependency direction

```text
src -----------------------> packages/domain
worker/index --------------> packages/domain, packages/rules-engine
CampaignDurableObject -----> packages/domain, packages/rules-engine
StrategicMapDurableObject -> packages/domain, packages/rules-engine
packages/rules-engine -----> packages/domain
```

Domain and engine packages must not import React, D1, Durable Objects, or Node-only runtime APIs. A client preview may reuse a calculation only with already-visible inputs; the server recalculates authoritatively.

## 5. Implemented request and security flow

For `/api/campaigns/{campaignId}/*` the current Worker:

1. rejects an unsafe production auth configuration;
2. requires an exact same-origin `Origin` for mutations and WebSocket upgrades, and rejects explicitly cross-origin API requests;
3. authenticates either an explicitly enabled development demo identity or a SHA-256-digested `corinth_session` row joined to an `ACTIVE` user;
4. allows the demo identity only when `ENVIRONMENT=development`, `ALLOW_DEMO_AUTH=true`, and the campaign is an explicit local fixture (`outpost-k17` or `operation-spearhead`);
5. for session identities, reads an existing campaign and membership from D1 before resolving a DO name; only `ACTIVE`, `PAUSED`, `COMPLETE`, or `FAILED` campaigns route;
6. maps campaign `PLAYER`, `BATTALION_COMMAND`, and `GM` roles to supported viewer contexts; `OBSERVER` and unsafe neutral projections fail closed;
7. strips cookies, authorization/demo inputs, and client-supplied internal viewer headers before adding server-derived viewer headers;
8. routes to `CAMPAIGN.getByName(campaignId)`.

The DO self-initialises without D1 only for `outpost-k17`. A registered non-K-17 campaign requires committed D1 deployment snapshots for its forces, but it still calls `createDemoCampaignState`, retains the K-17 map/terrain shape, clears objectives, and applies fallback positions. This prevents arbitrary force invention but is not fail-closed scenario initialization.

Current tactical order commands derive start position, class eligibility, executable order/action definitions, action economy/speed cost, fitted weapons/equipment, owner, current visible target IDs, and one-attack limits on the server. Order upsert requires an actor-scoped `commandId`, `expectedCampaignVersion`, and `expectedOrderRevision`; clock update requires `commandId` and `expectedCampaignVersion`. Each stores a SHA-256 request hash and exact response receipt atomically with its state/event changes, matching retries replay, and changed-payload reuse fails. The pure resolver independently rechecks the pinned ruleset, compiled executable definitions, routes, speed/action budget, attack count, targets, weapons, LOS/range, ammo, cooldown, and friendly-fire rules. This boundary is incomplete while D1 can mark a class executable that the compiled catalogue cannot resolve.

Still target rather than implemented:

- general runtime request schemas and versioned public DTO schemas;
- idempotency/expected-version contracts for tactical cancellation and operator pause/resume/resolve commands (order upsert and clock update now have this boundary);
- delegated Battalion command and production-grade admin audit;
- session rotation/device management, operator account controls, and legacy account migration;
- an events-after-sequence reconnect endpoint.

### 5.1 Phase 3 organisation and strategic request flow

Strategic reads use global session identity and explicit current-Battalion context. Read repositories include owner/Battalion predicates. The internal strategic-order service is designed to require exact rank permission, actor-scoped `commandId`, canonical request hash, expected revision, bounded/shape-validated JSON, and same-origin protection, but the public `POST /api/strategic/orders` route validates and then returns `501 STRATEGIC_ORDER_EXECUTION_DEFERRED`. The Strategic Map DO resolver also returns `501 STRATEGIC_RESOLUTION_NOT_IMPLEMENTED`. No public strategic mutation is currently executable.

`user_active_battalions` is navigation context, not an authorization cache: each request rechecks active membership. Where revealing an ID would leak another Battalion's assets, a failed owner predicate returns not found.

Guided enlistment follows the same boundary. Verified accounts receive an actor-scoped onboarding aggregate, a one-time 100 Req command-charter grant, and server-derived public/invitation join choices. Battalion creation spends the full grant and is limited to one charter per creator. The starter unit is a one-time grant from a three-definition executable whitelist; its unpublished requisition value remains `BALANCE_REQUIRED`. Recruitment settings and invitations require active rank permissions and every committed organisation mutation writes both an idempotency receipt and a Battalion-audience strategic event. See [ONBOARDING.md](./ONBOARDING.md).

The stable strategic coordinator name comes from `strategic_maps.coordinator_key`; the development value is `strategic-map-corinth`. No request may derive a singleton `GLOBAL_GAME_DURABLE_OBJECT` name.

## 6. D1 and Campaign DO ownership

| Concern | Implemented owner now | Target owner |
|---|---|---|
| Users, session validation, campaign registry/membership | D1, read by Worker | D1 |
| Rules, source provenance, conflict and persistent-world table shapes | D1 migrations/seed exist; runtime rules are also compiled in `catalogue.ts` | D1-pinned immutable rules plus a verified compiled engine interpretation |
| Player Units, requisition, Battalions, ships, deployments, archives | D1 plus implemented force/loadout/deployment/onboarding subsets; broader lifecycle workflows remain open | D1 transactional global truth |
| Strategic locations/maps/nodes/routes, operations, formations, supply, rounds, orders, events, receipts, war variables | D1 migration and local fixture exist; checkpoint services use only their landed subset | D1 transactional strategic truth |
| K-17 active battlefield, current orders, clock, event log | Campaign DO | One named DO per active campaign |
| Strategic round/order coordination | Phase 3 map-sharded coordinator boundary | One named Strategic Map DO per tightly coordinated map/theatre |
| Round snapshot/result deduplication | `snapshot/{round}` and `resolution/{round}` in DO storage | PREPARED/committed hash journal in DO storage |
| Scheduled lock/resolve items | Embedded in `state/current.clock.schedule`; one DO alarm | Separate durable `schedule/{id}` records with status/history |
| Persistent consequences | Resolver emits/stores `pending-effect/{id}` and applies supported effects with a D1 receipt | Add cryptographic payload journal, automatic reconciliation, and acknowledgement before next round |

The current DO transaction writes the snapshot, result state, resolution record, events, and pending-effect records atomically in DO storage, then attempts an idempotent D1 batch and deletes each pending record after receipt verification. It still opens the next round before that acknowledgement and lacks a payload-hash/attempt journal, so the intended cross-store exactly-once invariant is not yet fully satisfied; see [ROUND_RESOLUTION.md](./ROUND_RESOLUTION.md).

No authoritative state belongs in process globals, browser storage, WebSocket delivery, or KV. R2 and Queues are optional future boundaries described in [CLOUDFLARE.md](./CLOUDFLARE.md).

## 7. Resolver and fog status

The implemented engine foundation now:

- continues event sequence numbers after events already in the round;
- resolves accepted order revisions without marking future/replacement revisions resolved;
- ticks old cooldowns before attacks so a newly assigned cooldown survives the round;
- applies Hold facing even when no movement occurs;
- blocks all simultaneously over-capacity arrivals consistently and ignores destroyed/withdrawn occupants;
- supports deterministic Hold/Advance/Rush, basic Attack, and narrow Load/Unload/Reload action paths; other advanced orders/actions fail closed, while Scan/Deploy Drone remain release-blocked because their advertised effects are incomplete;
- derives indirect-fire legality from an eligible friendly spotter and aggregates combat damage before casualty application.

Projection removes resolution records and pending effects, hides non-visible deployments, keeps other users' drafts private, and redacts dynamic control/objective/structure/environment fields on wholly unknown hexes. Reports pass stored events through the same current projector and do not expose the stored seed.

This is not yet a complete fog/replay security proof. `CampaignView` is still largely the canonical state minus two fields; event filtering uses present-time actor visibility rather than event-time intelligence; public event payloads can contain target IDs; and generic WebSocket broadcasts are not yet separately projected per audience and may include order/unit identifiers. Production acceptance needs explicit safe DTOs, event-field redaction, event-time/declassification policy, report tests, and per-audience socket messages.

## 8. V1 strangler sequence

1. Preserve the audited V1 commit and its smoke evidence.
2. Run the root Vite/Worker system beside `app/`, `shipbuilder/`, and `worldmap/`.
3. Treat V1 prose/data as sourced legacy or experimental catalogue input, not active truth.
4. Replace identity/profile, persistent forces/requisition, Battalion/ship, campaign/deployment, orders, then resolution as tested vertical slices.
5. Use a one-way repeatable importer with legacy-ID mapping; never import plaintext credentials.
6. Cut over each capability only after authorization, data reconciliation, rollback, and acceptance tests.
7. Remove V1 from deployment only when all retained workflows have replacements; retain source/history for audit.

## 9. Architecture decisions

### ADR-A01: Modular monolith

**Status:** Accepted and implemented for the foundation.

**Decision:** One repository/release with client, Worker, campaign DO, domain, and engine boundaries.

**Trade-off:** Boundaries rely on code review/tests rather than network isolation.

**Revisit:** Extract only when a stable module demonstrably needs independent scale or release cadence.

### ADR-A02: Product-level strangler migration

**Status:** Accepted; migration work remains.

**Decision:** Retain V1 as reference and replace tested workflows without dual-writing.

**Trade-off:** Two stacks remain in the repository temporarily.

**Revisit:** Archive V1 outside the deployed tree once every retained workflow is replaced.

### ADR-A03: D1 global truth plus one DO per campaign

**Status:** Boundary implemented; cross-store effect protocol is target.

**Decision:** D1 owns global relationships/economy; one DO serialises active campaign state.

**Trade-off:** Correct permanent consequences require an explicit idempotent journal across stores.

**Revisit:** Only for measured platform limits or a future transactional primitive spanning both resources.

### ADR-A04: Current snapshots plus append-only events

**Status:** Partially implemented.

**Decision:** Current state is authoritative; snapshots/events explain rounds without full event sourcing.

**Trade-off:** Historical reconstruction depends on retained snapshots and mature event schemas.

**Revisit:** If arbitrary temporal queries/reprojection become core product requirements.

### ADR-A05: Rules values in data, mechanics in pure handlers

**Status:** Partially implemented.

**Decision:** D1 seed stores versioned values/provenance; pure code implements named mechanics.

**Trade-off:** New mechanics still require code. The current D1 seed and compiled catalogue are two representations, and `seed:check` does not prove full field equivalence.

**Revisit:** Add a generated single source or stronger hash/schema pipeline before more catalogue breadth creates drift.

### ADR-A06: Replace V1 authentication before real-account migration

**Status:** Production passwordless identity/session boundary implemented and deployed; operational lifecycle incomplete.

**Decision:** V1 credentials never cross into the new authority. Demo auth is explicit local-only. Production uses verified Resend email links and opaque, hashed D1 sessions.

**Trade-off:** Passwordless registration/login/logout exists. Bounded retention cleanup and invitation abuse controls now exist locally but are not deployed; session/device management, operator controls, recovery-challenge delivery, MFA/account linking, and legacy-account migration remain open.

**Revisit:** Before public release, close the retention, abuse, account-management, privacy, and recovery operations listed in `RELEASE_READINESS.md`.

### ADR-A07: D1 strategic truth plus one coordinator per strategic map

**Status:** Accepted; additive schema, development fixture, read models, and internal coordinator shell exist. Public order execution and coordinator resolution are blocked.

**Decision:** D1 owns strategic locations, graph, formations, logistics, operations, events, and outcomes. One Strategic Map Durable Object serialises the clock/orders for one map or tightly coordinated theatre. Tactical campaigns retain separate Campaign Durable Objects.

**Trade-off:** Cross-layer results require explicit idempotent effects between two coordination atoms and D1. A single transaction cannot span D1 and multiple Durable Objects.

**Revisit:** Split a theatre only after measured contention/state-size data. Never replace it with one global galaxy Durable Object.

## 10. Foundation readiness

| Check | Status | Evidence or remaining work |
|---|---|---|
| Package skeleton, TypeScript, lint, unit tests, local production build | Complete | Root package scripts |
| Application browser smoke baseline | Partial/local | Playwright covers public auth, authenticated live navigation without showcase fallback, tactical rejection of client-authored economy, and 390px overflow (4 tests); remote CI evidence, broader browser matrix, accessibility, and performance gates remain open |
| Migrations and idempotent seed artifacts | Local head `0008`; production head `0007` | Fresh empty D1 replay through all eight migrations and all seven seeds twice passes integrity/FK checks; production-approved and development seed families remain separated |
| Deterministic resolver subset and regression coverage | Partial but tested | Narrow Hold/Advance/Rush/Attack/equipment paths have unit coverage; locale ordering, terrain defaults, category-scoped flanking, cargo ledger, and release journal defects remain |
| K-17 state, alarms, clock, pause/resume, sockets | Partial | Unit coverage exists; crash/alarm/WebSocket integration coverage does not |
| Viewer projection | Partial | Basic state/report redaction exists; event-time and socket-field leakage tests remain |
| D1 persistent-effect applier and next-round gate | Partial | Supported effects use D1 receipts; cryptographic journal, automatic reconciliation, and next-round acknowledgement gate remain open |
| PREPARED journal, cryptographic input/output hashes, secret seed commitment | Open | Current record is a committed snapshot with a predictable seed and 32-bit digest |
| Separate persisted schedule records and reconnect catch-up | Open | Schedule lives inside current state; no events-after-sequence API |
| Production passwordless identity/session issuance | Deployed foundation | Resend verified-email links, opaque sessions, logout, auth rate limits, and pseudonymized audit are deployed; `0008` retention schedule is local-only pending migration/deployment |
| Guided enlistment and Battalion recruitment | Deployed foundation | Public/private/code/targeted joins, one-charter economy, starter grant, tour, recruitment settings, and Resend delivery are deployed; `0008` invitation throttling/expiry is local-only |
| Helion/Corinth strategic schema and fixture | Complete as development data only | Fresh 0001–0008 replay and all seven seeds twice passed; production seeds still create no strategic world or campaigns |
| Strategic map sharding, pure resolver, permission-scoped reads, responsive UI | Partial/blocked | Unit tests cover the pure resolver and service shell; public order submission and DO resolution return `501`, route durations are `BALANCE_REQUIRED`, and the UI can use showcase state |
| Strategic-to-tactical deployment/result reconciliation | Partial | Loadout/deployment commit and narrow tactical writeback exist; scenario bootstrap remains K-17-derived, and withdrawal plus the acknowledgement-gated protocol remain deferred |
| Production D1 and custom-domain foundation | Complete | Production binding is migrated through `0007`; `corinthplight.qnetica.com.au` serves the current Worker/UI |
| Phase 3/identity/onboarding code deployment | Recorded foundation deployment | Cloudflare version `f34fa674-b242-4bda-9a7d-dd06cddc7363`; custom-domain health/UI/auth/origin-policy smoke tests passed, but Phase 3 execution is not complete |

Phase 3 should not be described as complete until the open deployment/result, correctness, scenario, and release gates above are closed. See [STRATEGIC_LAYER.md](./STRATEGIC_LAYER.md), [BATTALION_MODEL.md](./BATTALION_MODEL.md), [SHIP_SYSTEM.md](./SHIP_SYSTEM.md), and [STRATEGIC_RESOLUTION.md](./STRATEGIC_RESOLUTION.md).

## 11. Equipment/deployment vertical slice

The landed vertical slice adds three authority boundaries without moving rules decisions into React:

1. D1 repositories load the pinned class, profiles, slots, tags, abilities, weapons, owned inventory, effects, and current resources.
2. `buildEffectiveUnit` and `validateDeploymentPlan` are pure deterministic handlers. The Worker never accepts client-authored stats, eligibility, cargo capacity, ammo, cooldown, or costs.
3. Worker services own actor-scoped idempotency, optimistic revisions, Battalion/campaign permission, atomic inventory/loadout mutation, deployment approval, snapshot locking, and tactical bootstrap.

The Campaign Durable Object can load non-K-17 forces from committed D1 deployments, but still creates their battlefield from the K-17 demo factory and clears its objectives. Load/Unload, Reload, ammo use, cooldowns, Supply, cargo, and location state have narrow resolver/writeback paths. Scan and Deploy Drone currently emit events/cooldowns without completing their advertised visibility/state effects and must remain blocked for release pending the recorded rule decision.

Remaining correctness boundary: the DO persists its result and opens the next round before the D1 application finishes. The applier retries safely by receipt, but a fully compliant `EFFECTS_PENDING`/acknowledgement gate and cryptographic payload journal remain required.

# Corinth's Plight — Phase 3 Strategic War Plan

## Objective

Deliver an additive, locally verified Phase 3 foundation that connects persistent forces to a seeded strategic world without weakening the Phase 1/2 security and rules boundaries.

The first vertical slice covers:

- a Helion/Corinth strategic theatre with hierarchical locations and node-route travel;
- Battalion, rank, Battlegroup, Task Force, ship, operation, and strategic-order read models;
- a deterministic, data-driven strategic resolver for travel, supply, and operation-state transitions;
- permission-scoped Worker APIs and a sharded Strategic Map Durable Object (one object per theatre/map);
- Command, Battalion, Ship, Operations Board, and Galactic Operations interfaces with responsive mobile alternatives;
- an explicit development fixture containing CSV Resolute and Operations Iron Rain, Night Glass, and Broken Road;
- additive D1 migration and idempotent seeds that preserve all Phase 1/2 data.

This checkpoint does **not** claim complete production authentication, full orbital combat, arbitrary ship construction mutations, full campaign deployment/withdrawal integration, or automatic tactical-result persistence. Those remain blocked or visibly labelled until their authoritative services exist.

## Source authority

1. `rules/Meta - Core Rules (V5).md` is the primary rules source.
2. `docs/GAME_SYSTEMS.md` and `docs/RULE_CONFLICTS.md` record the curated activation profile and unresolved values.
3. The Phase 3 brief defines product and architecture requirements but does not invent missing rules values.
4. Existing Phase 1/2 migrations, seeds, DTOs, and security controls remain compatible and authoritative for landed behavior.

Unresolved requisition costs, travel modifiers, orbital combat values, and other balance-sensitive fields remain nullable or catalogue-only. They are never treated as zero/free.

## Architectural boundaries

- D1 remains the durable system of record for identity, organizations, forces, ships, maps, operations, events, and strategic outcomes.
- A `StrategicMap` Durable Object coordinates one strategic map/theatre. There is no singleton galaxy object.
- A Campaign Durable Object remains authoritative only for its tactical campaign.
- Pure rules-engine functions validate and resolve strategic state; Workers and Durable Objects orchestrate persistence and authorization.
- All mutations derive permissions, costs, eligibility, routes, capacity, and supply from server-side pinned data.
- Every mutation uses an idempotency key, canonical request hash, optimistic version/revision, and owner/Battalion scope.
- Strategic events are canonical records; player-facing projections must be audience-safe.

## Delivery lanes and file ownership

### Lane A — strategic schema, seed, and documentation

Owned files:

- `migrations/0004_phase3_strategic_layer.sql`
- `seeds/development-strategic-world.sql`
- seed validation changes coordinated in `scripts/validate-seed.ts` and `package.json`
- `docs/STRATEGIC_LAYER.md`
- `docs/BATTALION_MODEL.md`
- `docs/SHIP_SYSTEM.md`
- `docs/STRATEGIC_RESOLUTION.md`
- coordinated updates to `docs/DATA_MODEL.md` and `docs/ARCHITECTURE.md`

Requirements:

- additive schema only; no destructive rebuilds or data loss;
- preserve distinct definition, implementation, availability, and requisition statuses;
- normalized hierarchical locations, strategic maps/nodes/routes, operations, Task Forces, ship state, strategic rounds/orders/events/effect receipts, and war variables;
- explicit revisions, foreign keys, uniqueness, JSON validation, and idempotency constraints;
- seed exact source values where known and preserve source/provenance hashes;
- development seed is repeat-idempotent and upgrade-convergent.

### Lane B — domain contracts and pure strategic engine

Owned files:

- `packages/domain/src/index.ts`
- new strategic modules and tests under `packages/rules-engine/src/` and `packages/rules-engine/test/`

Requirements:

- typed DTOs for Battalion, ranks/permissions, Battlegroups, Task Forces, ships, locations, operations, strategic orders, events, and projected map state;
- explicit discriminated unions instead of generic action records;
- pure node-route validation and deterministic travel timing;
- capability aggregation from member units, ship modules, and equipment;
- Large/Medium/Small supply hierarchy with no implicit resupply;
- ordered, replay-safe resolution phases with canonical inputs/outputs and stable event ordering;
- aerospace-only Battlegroups rejected; Task Force and Battlegroup remain distinct concepts;
- orbital combat stays a typed, rejected/deferred path.

### Lane C — strategic user interface

Owned files:

- new strategic components and client adapters under `src/`
- coordinated changes to `src/App.tsx` and `src/styles.css`

Requirements:

- Command home, Battalion organization, Ship home/builder read view, Operations Board, and Galactic Operations map/list;
- clear permission, readiness, supply, capacity, travel-time, and implementation-status presentation;
- responsive desktop and mobile layouts, including a non-canvas/list alternative for the strategic map;
- deterministic, clearly labelled local showcase fallback only when the API is unavailable; mutations disabled in fallback;
- no locally invented balance values or client-authoritative eligibility.

### Lane D — Worker services, routes, Durable Object, and integration

Owned by the root implementation lane:

- `worker/repositories/strategic.ts`
- `worker/services/strategic.ts`
- `worker/routes/strategic.ts`
- `worker/strategic-map-durable-object.ts`
- coordinated changes to `worker/index.ts`, `worker/env.ts`, `wrangler.jsonc`, `package.json`, and Worker tests

Requirements:

- authenticated global identity for profile/organization reads; Battalion-scoped authorization for organization and strategic mutations;
- exact permission checks from the caller's active Battalion rank or explicit delegation;
- owner/Battalion predicates in repository queries; unauthorized resources resolve as 404 where enumeration would leak state;
- bounded, schema-validated JSON; exact same-origin/CSRF controls inherited for unsafe requests;
- GET command/Battalion/member/activity/ship/map/operation endpoints;
- idempotent, version-guarded strategic-order submission internals, kept fail-closed at the public route until the D1 resolution journal/effect applier is implemented;
- development-only resolve/fixture controls that fail closed outside development;
- `STRATEGIC_MAP` Durable Object binding sharded by stable map ID;
- canonical event and effect journal that can be replayed safely without duplicate outcomes.

## Vertical-slice API target

Initial read endpoints:

- `GET /api/command`
- `GET /api/battalions/current`
- `GET /api/battalions/current/members`
- `GET /api/battalions/current/activity`
- `GET /api/ships/primary`
- `GET /api/operations`
- `GET /api/operations/:operationId`
- `GET /api/strategic/maps/:mapId`

Mutation contracts/scaffolding:

- `POST /api/strategic/orders` (typed and coordinator-backed internally; public execution currently returns explicit `501`)
- development-only `POST /api/strategic/maps/:mapId/resolve` (currently returns explicit `501` without mutation)

Mutation requests must include `commandId` and the relevant expected version. Strategic orders identify a Task Force or Battlegroup, a destination node, and a typed intent; the server-side scaffold derives the route, eligibility, travel cost, capacity, and supply consequences. The public mutation boundary remains closed in this checkpoint so an order cannot be stranded in `SUBMITTED` before authoritative resolution persistence exists.

## Strategic resolution phases

1. Validate pinned ruleset, map version, round, permissions, and order revisions.
2. Freeze accepted orders and canonical strategic input.
3. Aggregate Task Force/Battlegroup/ship capabilities.
4. Validate route adjacency, mobility, cargo/embarkation, and deployment constraints.
5. Consume Large/Medium/Small supply according to source rules.
6. Advance movement and arrival state deterministically.
7. Evaluate operation availability and non-combat world-state triggers.
8. Emit canonical events and idempotent D1 effects.
9. Commit result hash, acknowledge effects, and advance the strategic round exactly once.

Combat interception and orbital battle are represented as blocked/deferred outcomes in this checkpoint, not silently resolved.

## Verification gates

- migrations 0001–0004 apply to a fresh isolated D1 database;
- existing Phase 1/2 fixture data survives the upgrade;
- core, Phase 2, and Phase 3 seeds can each be reapplied without logical drift;
- `PRAGMA integrity_check` is `ok` and `PRAGMA foreign_key_check` is empty;
- negative probes reject cross-Battalion access, invalid hierarchy/route edges, duplicate active embarkation, capacity overflow, supply underflow, stale versions, and reused idempotency keys with different payloads;
- deterministic resolver replay produces identical events/effects/hashes;
- the map coordinator rejects shard mismatch and repeated internal commands use actor-scoped idempotency; alarm/effect replay becomes a release gate when authoritative resolution persistence is implemented;
- typecheck, lint, full tests, seed validation, production build, and `git diff --check` pass;
- desktop and mobile views are visually inspected;
- no secret, generated state, local database, or Wrangler cache is committed.

## Explicitly deferred gates

- production identity-provider selection, callback/session issuance, recovery, MFA, and account linking;
- complete invite administration and every Battalion configuration mutation;
- arbitrary ship purchase/refit/module mutation and finalized ship prices;
- tactical campaign bootstrap from a strategic deployment;
- the Phase 1 D1 pending-effect applier and automatic tactical-result-to-world reconciliation;
- full withdrawal/extraction workflow and contested deployment windows;
- full fog-safe historical strategic intelligence and per-audience WebSocket broadcasts;
- orbital combat, invasions, and free-form strategic map authoring;
- Cloudflare production deployment of Phase 3.

These items must stay visibly unavailable or catalogue-only until implemented and verified.

## Commit boundary

When all checkpoint gates pass, create one local Phase 3 foundation commit. Do not push and do not deploy Phase 3 without a separate release verification pass.

# Corinth's Plight — Phase 2 Forces Plan

## Objective

Turn the foundation's five-unit tactical fixture into a persistent, data-driven combined-arms force experience without replacing the existing Cloudflare, D1, Durable Object, rules-engine, order, clock, or Canvas map architecture.

## Canonical inputs

- `gameplan.md` and the Phase 2 Combined Arms, Persistent Forces & Unit Identity brief.
- `rules/Meta - Core Rules (V5).md` is the primary rules authority.
- `rules/Classes.html`, `rules/Actions and Rules Work ( For Shack Reference).html`, `rules/Build and Supply System.html`, and `rules/The Store - Equipment List.html` are provenance-bearing companion sources.
- Conflicts remain explicit in `docs/RULE_CONFLICTS.md`; runtime values come only from the pinned ruleset.

## Delivery slices

### 1. Persistent force schema and catalogue

- Add a forward-only D1 migration for unit identity, durability/movement profiles, abilities/tags, equipment/loadouts, cargo/location relationships, supplies, subsystems, construction projects, ship capabilities, and richer unit history.
- Preserve existing `player_units` rows with safe defaults and no destructive rewrite.
- Expand the curated seed to the initial combined-arms player roster and varied Bug roster, reusable weapons/actions/equipment, and implementation statuses.
- Keep unknown requisition values explicitly `BALANCE_REQUIRED`; do not invent authoritative costs.

### 2. Shared domain and pure mechanics

- Model reusable `UnitDefinition`, `WeaponDefinition`, movement/durability/cargo/supply/deployment profiles, abilities, statuses, subsystem states, persistent identity, inspection DTOs, and readiness results.
- Implement deterministic generic mechanics for FS/Hits, healing, construction/build supply, repairs, stealth projection, artillery state/spotting, cargo embark/disembark/towing, supply transfer/reload, subsystem damage, ground/mech/VTOL/aerospace routes, fighter arcs/ammo/rearm, bomber fly-over validation, and HAT drops.
- Drive behavior from definitions, tags, profiles, abilities, and equipment—not class-name switches.

### 3. Forces and requisition API

- Add authenticated, owner-scoped APIs for Forces summaries/detail/history, catalogue/requisition, eligible equipment, purchase/rename/loadout, battlegroups, deployment readiness, and developer fixtures.
- Use D1 transactions/idempotency keys for purchases and mutations.
- Keep production auth fail-closed; local demo data is explicit and isolated.

### 4. Combined-arms campaign integration

- Extend campaign deployment snapshots and structured actions for the implemented Phase 2 mechanics.
- Add Operation Iron Rain as a deterministic developer campaign with the requested player and Bug roles.
- Emit explanatory, unit-specific round events and persistent effects while preserving fog boundaries and retry guards.

### 5. Forces experience

- Make `Forces` a real responsive screen with role/status filters, class-specific unit cards, full friendly inspection, fog-safe enemy inspection, identity/history/memorial views, requisition flow, equipment eligibility, battlegroups, and deployment readiness.
- Upgrade map markers, route previews, and the order builder based on movement profiles and discovered actions.
- Keep tactical DTOs compact; fetch long-term history/details separately.

### 6. Verification and release

- Add the Phase 2 matrix as pure regression tests plus API/authorization/idempotency tests.
- Apply migration and seed twice to an isolated local D1 database and verify integrity/compatibility.
- Run typecheck, lint, full tests, production build, browser checks, remote migration/seed, deployment dry-run, production deployment, and live health/UI smoke checks.
- Create local commits only. Do not push GitHub without separate permission.

## Sequencing and ownership

1. Database/rules specialist: migration, SQL seed, validation, rule-conflict additions.
2. Engine/backend specialist: domain contracts, pure mechanics, resolver/campaign integration and tests.
3. API/frontend specialist: owner-scoped Forces API and UI after schema/contracts stabilize.
4. Root integration: security review, conflict resolution, visual/runtime testing, Cloudflare release, and local commits.

## Completion checkpoint

The current Phase 2 iteration is releasable when a demo player can browse a persistent mixed-role force, inspect distinct unit mechanics, purchase/name a supported unit through server authority, see class-derived equipment/readiness, and use the implemented combined-arms actions in Operation Iron Rain with deterministic tests and explanatory reports. Advanced catalogue-only mechanics remain visibly blocked rather than silently simulated.

## Current checkpoint — Forces foundation

The schema/catalogue, pure mechanics, owner-scoped Forces read APIs, exact-once rename/developer purchase path, ship/campaign readiness gate, local Iron Rain roster, and responsive Forces UI are implemented and locally verified. Initial-equipment/loadout mutation, battlegroup mutation, per-unit mixed-mode deployment planning, cargo-capacity validation for air drops, campaign deployment snapshots, resolver phase integration, persistent effect application, and unit-specific round reports remain open. Consequently this checkpoint is committed locally but is not a Phase 2 production deployment.

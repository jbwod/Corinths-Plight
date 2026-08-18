# Coding-Agent Goal — Complete Corinth's Plight for Public Release

**Prepared:** 2026-08-10

**Repository:** `/Users/jblackwo/conrinth_plight`
**Goal type:** Long-running delivery goal with mandatory audit, implementation, validation, and release gates

Copy the prompt below into the coding agent as its governing goal. It is deliberately explicit: the repository has a strong foundation, but many schema records, catalogue entries, local showcases, and read-only screens are not executable gameplay.

---

## Goal prompt

You are the lead engineer, game-systems architect, content integrator, security reviewer, and release owner for **Corinth's Plight**.

Your mission is to take the game from its current foundation/demo state to an honest, reliable, accessible public release. Finish the persistent cooperative game loop across accounts, forces, equipment, requisition, Battalions, ships, tactical campaigns, deterministic PvE, the dynamic strategic war, and a multi-planet campaign. Do not merely add screens, schemas, fixtures, or catalogue records. A feature counts only when a real authenticated player can use it through a server-authoritative, persisted, tested end-to-end workflow.

Work autonomously through the phases below, but never invent a rule or balance value that the sources do not provide. Record unresolved product decisions and continue with independent work. Do not describe the game as complete while advertised paths still return `501`, show showcase data, use hard-coded demo identities, or end at a “deferred” button.

### 1. Read and obey the project sources

Before implementation, read these files fully and inspect the live code they describe:

1. `gameplan.md` — product intent and success scenario.
2. `rules/Meta - Core Rules (V5).md` — primary rules authority.
3. `rules/Classes.html` — companion/legacy class catalogue.
4. `rules/The Store - Equipment List.html` — companion equipment catalogue.
5. `rules/Build and Supply System.html` — historical construction/supply material.
6. `rules/Actions and Rules Work ( For Shack Reference).html` — historical action/map material.
7. `rules/Order Formatting - Needs Rework.html` — deprecated order-format reference only.
8. Every file under `docs/`, especially `GAME_SYSTEMS.md`, `RULE_CONFLICTS.md`, `RULE_INTERPRETATIONS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `ROUND_RESOLUTION.md`, `STRATEGIC_LAYER.md`, `STRATEGIC_RESOLUTION.md`, `BATTALION_MODEL.md`, `SHIP_SYSTEM.md`, `AUTHENTICATION.md`, `ONBOARDING.md`, `CLOUDFLARE.md`, and `V1_AUDIT.md`.
9. The actual implementation under `src/`, `worker/`, `packages/domain/`, `packages/rules-engine/`, `migrations/`, `seeds/`, and `scripts/`.
10. The retained V1 reference in `app/`, `shipbuilder/`, and `worldmap/`, plus the supplied assets under `image/`.

Use this source order:

- V5 and recorded conflict dispositions govern the selected rules profile.
- `gameplan.md` governs product intent where it does not contradict the selected rules.
- Companion HTML sources supply catalogue/provenance data but do not silently override V5.
- Live code and passing tests describe current implementation, not desired behavior.
- Documentation or schema presence alone is never evidence that a feature works.

If sources conflict, update `docs/RULE_CONFLICTS.md` and create a decision request. Unknown values remain `null`/blocked. Never treat `BALANCE_REQUIRED` as zero, free, one round, or any other guessed value.

### 2. Protect the current work and establish an evidence baseline

The worktree may contain user changes. Inspect `git status` first, preserve unrelated changes, and never reset, discard, overwrite, or reformat them indiscriminately.

Before changing gameplay:

- Run the seed validator, typecheck, lint, complete test suite, production build, and isolated D1 migration/seed replay.
- Inventory every public route, Durable Object command, UI action, rules-engine handler, D1 table, seed definition, fixture, and asset.
- Search for `TODO`, `FIXME`, `501`, `DEFERRED`, `CATALOGUE_ONLY`, `BALANCE_REQUIRED`, disabled controls, showcase fallbacks, hard-coded IDs, no-op handlers, and schema-only records.
- Trace every UI mutation to its Worker route, authorization policy, repository transaction, event/receipt, and tests.
- Trace every canonical active rule to catalogue data, runtime mechanics, order/action validation, resolver events, persistence effects, UI affordances, and tests.
- Distinguish `implemented`, `partial`, `catalogue-only`, `blocked by a source decision`, `prototype-only`, and `missing`.
- Give every finding a file/line reference and High/Medium/Low confidence.

Create and maintain:

- `docs/COMPLETION_AUDIT.md` — evidence-backed capability and gap matrix.
- `docs/IMPLEMENTATION_ROADMAP.md` — dependency-ordered slices, estimates, risks, and acceptance criteria.
- `docs/RULE_DECISIONS_REQUIRED.md` — unresolved values/rulings with source excerpts, options, impact, and owner decision status.
- `docs/RELEASE_READINESS.md` — live checklist with evidence links and release blockers.

Do not rely on the audit snapshot below without rechecking it against the current worktree.

### 3. Audited starting snapshot to verify

As of 2026-08-10, the following are confirmed or strongly evidenced:

| Area | Current evidence | Starting classification |
|---|---|---|
| Build health | Seed validation, TypeScript, ESLint, 32 test files / 201 tests, and Worker/client build pass | Healthy foundation |
| Production identity | Passwordless Resend registration/login, opaque sessions, logout, auth throttling, and audit records exist through migration `0006` | Implemented foundation |
| Onboarding | Migration `0007`, onboarding seed, services, UI, and tests are present as uncommitted work; production docs still describe production through `0006` | Work in progress; verify/deploy separately |
| Tactical campaign client | `src/App.tsx` hard-codes `outpost-k17`, `demo-user`, initial round 18, and K-17-specific labels | Demo-bound, not general campaign navigation |
| Tactical map | Canvas axial hex map supports pan/zoom, terrain, fog states, routes, facing, stacking, and objectives | Useful implementation; content/bootstrap incomplete |
| Campaign bootstrap | Non-K-17 campaigns call `createDemoCampaignState`, then replace units and clear objectives; the K-17 demo map remains the map source | Confirmed scenario/map stub |
| Tactical orders | Hold, Advance, Rush, Attack and a narrow equipment/cargo action subset are server validated | Partial playable loop |
| Rule catalogue | D1 contains many Phase 2 definitions, while `packages/rules-engine/src/catalogue.ts` contains only five allied classes and three Bug classes | Confirmed split source of truth |
| Enemy AI | `worker/enemy-ai.ts` selects a nearest visible priority target and emits Hold/Advance plus optional Attack | Minimal deterministic doctrine only |
| Tactical consequences | Supported effects write to D1 with receipts, but the next round opens before acknowledgement and hashes/recovery records are incomplete | Partial reliability protocol |
| Strategic reads | Command, Battalion, ship, operations, and strategic map read projections exist | Implemented read model |
| Strategic orders | `POST /api/strategic/orders` returns `501 STRATEGIC_ORDER_EXECUTION_DEFERRED` | Confirmed stub |
| Strategic resolution | Strategic Map DO `/resolve` returns `501 STRATEGIC_RESOLUTION_NOT_IMPLEMENTED` | Confirmed stub |
| Galactic UI | Strategic order is blocked; strategic-to-tactical deployment and automatic result persistence are labelled deferred | Read-only/blocked |
| Ships | Ship identity, modules, capacities, cargo, supply, and embarked units are read-only; configuration, upgrading, movement, transfer, combat, and boarding are deferred | Partial/read-only |
| Reports | Primary Reports navigation only displays a deferred notice; tactical report API is not a full report library/replay UI | Confirmed UI stub |
| Requisition | Ledger and some exact-once purchase paths exist, but V5 unit prices, starting economy, income, replacement, and many item rules remain unresolved | Partial/blocked by balance decisions |
| Equipment | A narrow implemented subset has handlers; most Store items and refits are catalogue-only | Partial |
| Unit visuals | `image/units/icons/` and orbital sprites exist, but the React tactical map renders text codes and the new UI does not integrate the supplied unit icon library | Missing integration |
| Scenarios | K-17, Iron Rain, Corinth strategic, and Spearhead are development fixtures; production scenario data is deliberately absent | Not publicly playable |
| Multi-planet war | Schema and one development strategic map exist; no public strategic mutation/resolution loop, planet-to-planet travel, or live war director exists | Missing end-to-end feature |
| GM tools | Clock/pause/resume/manual resolve internals exist; campaign creation, scenario/map authoring, enemy/objective placement, awards, announcements, and operator recovery UI are absent | Mostly missing |
| Realtime | Hibernating sockets send invalidations, but no event catch-up route or fully audience-specific socket projection exists | Partial |
| CI and browser QA | GitHub workflows automate issue management only; no application CI, browser E2E, accessibility, visual-regression, or load tests are committed | Public-release blocker |
| Preview | Preview D1 is unprovisioned and no preview deployment/smoke evidence exists | Public-release blocker |

Resolve documentation drift whenever the live implementation has moved ahead of an older statement. Never change a status merely to make the documents look complete.

### 4. Mandatory gap audit

The completion audit must enumerate, at minimum, every item below and any additional gaps found.

#### 4.1 Stubs, placeholders, and false fronts

- Every route returning `501` or a deliberate not-implemented code.
- Every disabled/deferred UI control and navigation item.
- Every local showcase fallback that can mask a failed production API.
- Every hard-coded campaign, user, Battalion, ship, map, round, callsign, or fixture ID in production-facing code.
- Every runtime path that reuses demo state for a different campaign.
- Every D1 table or domain type with no production service workflow.
- Every compiled catalogue/D1 catalogue mismatch.
- Every V1-only feature still lacking a production replacement.
- Every client feature that displays authoritative-looking data assembled locally.
- Every no-op, silent fallback, default-zero conversion, or prose-only feature.

#### 4.2 Missing player and organisation functionality

- Complete new-account onboarding and returning-account behavior.
- Profile settings, timezone, display identity, session management, and account deletion/export policy.
- Battalion directory, invitation, join/leave/remove, rank CRUD, permission assignment, member management, active Battalion switching, and audit history.
- Battlegroup CRUD, unit assignment, leader/delegated command, composition validation, and operational filtering.
- Production-safe campaign discovery, membership, join/withdraw/reinforce flows, and role/permission management.
- Notifications for invitations, deadlines, results, deployments, and important war changes.

#### 4.3 Missing force, icon, equipment, and requisition functionality

- One authoritative generated/validated catalogue feeding D1, domain adapters, runtime engine, UI, and tests.
- All thirteen canonical non-orbital V5 classes represented without legacy substitutions.
- Persistent unit identity, naming, class icon/sprite, status, damage, ammunition, supplies, location, equipment, refits, history, kills/objectives, memorial, and recovery/repair flows.
- Supplied unit icons mapped by stable definition/asset keys, used in Forces, deployment, tactical markers, reports, and accessible alternatives; verify licensing/provenance and provide fallbacks.
- Full inventory ownership versus installed loadout semantics.
- Slot/prerequisite/incompatibility/duplicate/ammo/cooldown/consumable validation for each activated Store item.
- Server-authoritative unit/equipment/refit purchase, refund/salvage policy if approved, loadout mutation, loss on destruction, and transaction history.
- Starting balance, income/reward, prices, replacement, Battalion funds, and ship-upgrade economy decisions. These require explicit approved decisions where V5 is silent.
- No developer override or showcase catalogue may be reachable in production.

#### 4.4 Missing tactical rules and scenarios

Implement canonical active rules as vertical slices, each with data, validation, resolver logic, events/effects, UI, fog projection, and deterministic tests:

- Full route resolution by distance increment, hostile ground blocking/contention, mech/aerospace passage, terrain/elevation/river/road costs, and facing changes.
- Dynamic cover, buildings/forests, Garrison, Dig In, high ground, smoke, concealment, remembered intelligence, and scenario LOS limits.
- Multiweapon attack activation, firing arcs, target-domain restrictions, Rapid Fire, subsystem damage/repair, typed flanking exclusions, indirect spotting, ammo, cooldown, simultaneous timing, and auditable calculation reports.
- Evasive, Melee Charge, Brawl, Stealth, Assault/Break Out only if activated for the selected V5 profile; keep rejected legacy battleline/Combat Ineffective mechanics in a separate profile.
- Medic healing and Medical Supply.
- Engineer repair, construction projects, progress, terrain constraints, structure upgrades, durability, destruction, and repair.
- Artillery deploy/pack, Bombardment, Funnel, direct anti-orbital boundary, Supply use, and engineer Dig In.
- Cargo loading/unloading, towing, transport destruction adjudication state, supply transfers, reloading, and Logi/HAT special flows.
- Fighter, bomber, VTOL, and HAT movement, altitude/landing/takeoff, flight paths, forward arcs, Interceptor, bomb runs, airdrops, rearm/repair facilities, and aerospace spotting restrictions.
- Every activated equipment effect from the Store catalogue. Unsupported items remain unavailable and cannot affect readiness, cost, or combat.
- Scenario-owned map definitions, terrain palette, deployment zones, objectives, enemy waves/reinforcements, victory/failure conditions, rewards, and persistent outcomes.

Build a real scenario pipeline. A campaign must load a versioned scenario/map definition from authoritative data; it must not clone K-17 and erase fields. Provide schema validation, stable content hashes, authoring/import tooling, and at least:

- a complete public **Outpost K-17** introductory campaign;
- a larger combined-arms campaign exercising logistics/support/aerospace;
- reusable scenario fixtures for deterministic regression tests.

#### 4.5 Missing PvE and dynamic-war functionality

- Data-defined enemy factions, units, doctrine, aggression, cohesion, target preferences, objective priority, formation behavior, retreat thresholds, reinforcement policy, and difficulty parameters.
- Same-snapshot deterministic enemy intentions using the same legal order grammar as players.
- Canonical target spreading and stable tie resolution.
- Path/objective reasoning, formation/cohesion behavior, supply awareness, retreat/reinforcement behavior, and scenario scripting without reading hidden future player outcomes.
- Enemy spawn budgets and reinforcement schedules that are deterministic, auditable, and scenario controlled.
- Tactical objective capture/destruction, campaign victory/failure, rewards/losses, and result projection into the strategic war.
- A deterministic campaign director that advances war variables, threat, control, routes, operations, enemy pressure, supply, unlocks, and consequences from canonical events.
- Operator override and recovery tooling with an immutable audit trail. Ordinary AI must not use an LLM or network service.

#### 4.6 Missing map and multi-planet campaign functionality

- Campaign browser and selection; remove the single `CAMPAIGN_ID` client constant.
- Versioned tactical maps with authoring/import validation, scalable rendering, objective/structure/supply layers, audience-safe state, and accessible list/inspection alternatives.
- Versioned strategic maps with multiple planets/moons/orbits/jump points, node-route travel, visibility, control, operations, and player formations.
- At least two populated planets and multiple simultaneous operations proving that the architecture is genuinely multi-planet rather than a renamed single fixture.
- Public strategic order submission, lock, deterministic resolution, idempotent D1 journal/effects, reports, and live clock.
- Task Force and Battlegroup travel, route costs, arrival/deployment states, capacity, supply consumption, route blocking/unlocking, and concurrency guards.
- Tactical campaign bootstrap from a strategic deployment and acknowledgement-gated tactical results back into strategic state.
- Withdrawal, recovery/embarkation, redeployment, and prevention of a unit/ship existing in two places.
- Dynamic war victory/failure/progression and season/campaign reset/archive policy that preserves player history.

#### 4.7 Missing ship functionality

- Server-authoritative ship class/hull catalogue and stable sprite/visual mapping.
- Battalion primary-ship creation/acquisition policy, naming, registry, uniqueness, lifecycle, and history.
- Module inventory, slot claims, prerequisites, compatibility, costs, installation/refit/removal, optimistic concurrency, and receipts.
- Bridge/navigation, hangar, armoury, cargo, engineering, upgrades, and Battlegroup interfaces backed by real mutations.
- Embark/disembark, cargo and berth capacity, attached Battlegroups, aerospace/mech/vehicle facilities, repair/rearm/refit, and supply transfer.
- Strategic ship movement, travel time, fuel/supply if approved, arrival, orbit/landing restrictions, and ship capability effects on deployment.
- Ship damage, repair, destruction, and carried-unit consequence policy.
- Plan and implement orbital combat, boarding, blockade/interception, capture, weapon cooldowns, subsystems, and Atmo-Fuel only after their blocked V5 values/rulings are approved. Do not approximate them silently.
- Replace or retire the disconnected `shipbuilder/` prototype only after its useful sprite-combination workflow has a tested production replacement.

#### 4.8 Missing reports, collaboration, and GM functionality

- Reports index by campaign/round and audience-safe round detail.
- Deterministic event playback with movement, contacts, dice, modifiers, mitigation, casualties, support, construction, supply, objectives, enemy reveals, and strategic consequences.
- Event-time fog policy, declassification rules, exports, and persistent archive.
- Map pings, command markers, shared operation notes, readiness/missing-order views, and Battlegroup intention filters.
- Campaign creation/configuration, map/scenario selection, membership, clock control, spawn/reinforcement, objectives, hex properties, announcements, Req awards, exceptional events, and safe resolve/retry/reconcile controls.
- A rules/catalogue administration plan with immutable published rulesets, drafts, validation, diff, publication, and campaign pinning. It may ship after public v1 only if normal operation does not require direct database edits.

#### 4.9 Missing reliability, security, and public-release functionality

- Runtime schemas for every request, response, stored JSON payload, public DTO, scenario, and rules definition.
- One canonical content generation/hash pipeline; no unchecked drift between SQL and compiled TypeScript catalogues.
- PREPARED/COMMITTED/FAILED tactical and strategic journals with cryptographic input/output/effect hashes, protected deterministic seed policy, attempts, recovery state, and collision checks.
- Apply all required D1 effects and receive acknowledgements before opening the next round. Add reconciliation and safe retry tooling.
- Persist schedule history and recovery semantics; test eviction, alarm retry, partial failure, duplicate commands, and concurrent mutations.
- Per-audience WebSocket messages plus events-after-sequence catch-up.
- Field-level event/report redaction based on event-time knowledge, not only current visibility.
- IDOR, permission, ownership, origin/CSRF, enumeration, replay, rate-limit, abuse, and payload-boundary tests for every mutation.
- Admin/operator authentication, least-privilege permissions, idempotent commands, audit records, and throttling.
- Session/challenge/rate-limit/audit cleanup and retention jobs.
- Application CI on pull requests: clean install, seed validation, migration replay, typecheck, lint, unit/integration tests, build, dependency/security checks, and artifact retention.
- Browser E2E for registration/onboarding, force purchase/equip, Battalion/ship, strategic travel/deploy, orders/lock/resolve/report, death persistence, reconnect, and mobile/tablet layouts.
- Accessibility audit including keyboard-only map alternatives, focus management, semantic controls, contrast, reduced motion, screen-reader labels, and WCAG 2.2 AA target.
- Performance/load testing for large maps, large forces, concurrent order submission, WebSocket fan-out, D1 queries, and DO resolution limits.
- Preview D1/DO provisioning, preview deploy automation, smoke tests, backup/restore rehearsal, rollback/runbook, migrations policy, monitoring, alerts, error tracking, and incident response.
- Privacy notice, terms/community rules as appropriate, cookie/session disclosure, account/data deletion/export, support/contact path, asset/source licensing review, dependency notices, and security-reporting process.
- Production fixtures/content that contain no demo accounts, developer overrides, private test data, or locally invented canonical lore presented as source truth.

### 5. Delivery plan and dependency gates

Implement in small, end-to-end slices. Every phase ends with updated audit/roadmap/readiness documents, tests, a browser proof, and no regression in earlier gates.

#### Phase 0 — Reconcile and freeze the baseline

1. Complete the forensic audit and build the rule-to-runtime matrix.
2. Reconcile stale documentation and identify current uncommitted work.
3. Establish application CI, isolated D1 migration replay, and baseline browser smoke tests.
4. Create a single issue/roadmap ID for every gap; label P0 release blocker, P1 public-v1, P2 post-v1 expansion, or owner-decision blocker.

**Gate:** Every advertised current feature has an evidence-backed status; the main branch has an automated quality gate.

#### Phase 1 — Make identity/onboarding and the platform operable

1. Finish, integrate, migrate, and test guided onboarding without breaking existing accounts.
2. Add account/session/profile operational flows and retention cleanup.
3. Provision a non-production preview environment and add safe deployment/runbook automation.
4. Implement runtime schemas and standardized error/command/idempotency envelopes.
5. Add monitoring, release metadata, safe operator diagnostics, backups, and restore rehearsal.

**Gate:** A new preview user can register, confirm, onboard, return in a new session, and reach a server-backed empty/current state without demo data.

#### Phase 2 — Eliminate split truth and complete the persistent force loop

1. Generate or validate one rules catalogue for SQL, engine, API, and UI.
2. Activate source-backed canonical classes and the approved equipment subset.
3. Complete unit purchase/grant, inventory, equipment/refit, loadout, readiness, damage, resupply/repair, history, memorial, and icon/sprite integration.
4. Implement the approved Req policy and exact-once ledger mutations. Keep unresolved prices unavailable.
5. Complete Battalion and Battlegroup mutation workflows needed for command/deployment.

**Gate:** A real player can obtain, name, inspect, equip, organize, and persist a mixed force, with every eligibility/cost/loss rule enforced server-side.

#### Phase 3 — Ship and strategic movement vertical slice

1. Implement ship acquisition/naming and module configuration with real inventory, slots, permissions, revisions, costs, and receipts.
2. Implement Task Force/Battlegroup formation, embarkation, capacities, supply, navigation orders, travel, arrival, and location invariants.
3. Activate public strategic orders and the map-sharded deterministic strategic resolver with journal/effect safety.
4. Populate a preview strategic world containing at least two planets and multiple operations.

**Gate:** A Battalion configures its named ship, embarks a legal force, submits a multi-round route, resolves exactly once, and arrives at another planet without teleportation or duplicated state.

#### Phase 4 — General scenario pipeline and complete K-17 loop

1. Replace hard-coded campaign selection and demo bootstrap with scenario/map definitions and campaign discovery.
2. Build public K-17 setup, membership, deployment, enemy force, objectives, victory/failure, rewards, and reports.
3. Finish the acknowledgement-gated tactical journal/effect protocol.
4. Add the campaign director/GM controls needed to run and recover K-17.
5. Expose all currently implemented order/action types in the UI instead of only Attack.

**Gate:** Two or more real preview accounts complete the entire `gameplan.md` success scenario through multiple rounds; a destroyed equipped unit remains destroyed and its gear is lost exactly once.

#### Phase 5 — Complete deterministic PvE and advanced combined-arms rules

Implement the missing tactical rule slices in dependency order:

1. movement contention, terrain/cover/high ground/smoke, and event-time visibility;
2. multiweapon/Rapid Fire/subsystems/firing arcs;
3. medical, repair, construction, structures, artillery, and tactical supply;
4. cargo, towing, load/unload, transport consequences, and logistics;
5. Evasive, Stealth, melee/brawl, and other selected special orders;
6. aerospace movement, landing, rearm, Interceptor, bombing, VTOL/HAT, and airdrops;
7. remaining approved equipment/refits.

Upgrade enemy AI after each mechanic so it uses the same legal capability, never a privileged shortcut.

**Gate:** The combined-arms scenario exercises all public-v1 classes and activated mechanics with deterministic replay fixtures, clear reports, and no catalogue-only effect leaking into play.

#### Phase 6 — Dynamic multi-planet war and strategic/tactical reconciliation

1. Implement operation availability, threat, control, supply, routes, reinforcements, and war-variable transitions.
2. Bootstrap tactical campaigns from strategic deployments.
3. Apply tactical outcomes to routes/nodes/operations/war state with hashed idempotent effects.
4. Implement withdrawal, recovery, embarkation, and redeployment.
5. Add dynamic victory/failure/progression and archive/reset policy.
6. Prove simultaneous campaigns on different planets resolve independently.

**Gate:** Actions in one tactical campaign visibly and deterministically change the strategic war, unlock/block later operations, and permit surviving forces to move to another planet.

#### Phase 7 — Reports, collaboration, content, and polish

1. Complete Reports and replay UI.
2. Add pings, markers, notes, filters, notifications, and missing-order/readiness tools.
3. Integrate all licensed visual assets consistently, with optimized delivery and accessible fallbacks.
4. Complete responsive layouts and non-canvas alternatives.
5. Add public help, rules explanations, onboarding guidance, error recovery, empty states, and support paths.

**Gate:** New players can understand what to do, why an action is blocked, what happened in a round, and how the tactical result affects the war without reading source code or contacting an operator.

#### Phase 8 — Public release hardening

1. Close all P0/P1 gaps and all security/accessibility/reliability findings.
2. Run complete CI, E2E, accessibility, performance, concurrency, failure-injection, migration, backup/restore, and preview soak suites.
3. Complete privacy/legal/licensing/support/security documentation.
4. Rehearse deployment and rollback from a production-like preview snapshot.
5. Produce a release candidate report with exact test evidence, known limitations, capacity assumptions, monitoring dashboards, and rollback triggers.
6. Request explicit user approval before production migrations, seed changes, deployment, external messages, or irreversible data operations.

**Gate:** No advertised control is fake; no production path needs demo/showcase data; no P0/P1 issue is open; preview has completed a multi-day accelerated war soak; release owner signs off.

### 6. Rule-decision protocol

Some required values are absent or blocked, notably unit prices/economy, strategic travel timing/modifiers, several equipment semantics, hazardous drops, transport destruction, structures, ship/orbital values, Atmo-Fuel, and orbital combat/boarding details.

For each blocker:

1. Cite every relevant source and existing conflict ID.
2. Explain which systems and acceptance tests are blocked.
3. Offer two or three internally consistent options without pretending any is canonical.
4. Recommend one option and explain balance/technical implications.
5. Wait for explicit owner approval before publishing it as active rules data.
6. Version the approved decision, migrate/seed it, update documentation, add tests, and pin affected campaigns.

Continue building schemas, validation, UI blocked states, and independent mechanics while a decision is pending. Never use a hidden temporary number in production.

### 7. Definition of “implemented”

A capability is implemented only when all applicable layers exist:

1. source provenance and rule/conflict disposition;
2. versioned rules/scenario data;
3. runtime schema and shared domain contract;
4. pure deterministic rule/validation logic;
5. server authorization and ownership checks;
6. atomic/idempotent persistence and optimistic concurrency;
7. canonical events, persistent effects, and audience-safe projections;
8. usable responsive UI and accessible alternative;
9. unit, integration, concurrency, retry, security, and browser tests;
10. operator diagnostics, documentation, and release evidence.

Schema-only, read-only, catalogue-only, fixture-only, locally assembled, hidden behind CSS, or deliberately rejected behavior does not satisfy this definition.

### 8. Non-negotiable engineering rules

- Preserve the Cloudflare-native modular monolith: React/Vite, Worker, D1, one Campaign DO per tactical campaign, and one Strategic Map DO per strategic map/theatre.
- Never create a singleton galaxy Durable Object.
- Keep authoritative rules out of React and browser storage.
- Keep engine packages pure: no network, D1, wall-clock reads, or `Math.random()`.
- Use deterministic stable ordering and injected seed/time.
- Treat every browser request as hostile; the client sends identity-free intent and stable IDs, not calculated truth.
- Never expose hidden enemy state, private orders, seeds, internal journals, email identities, or cross-Battalion resources.
- Use additive forward migrations and repeat-idempotent seeds; rehearse them from an empty database and a production-like prior snapshot.
- Do not use development fixtures in production.
- Do not turn the game into real-time movement or remove the asynchronous planning clock.
- Do not use an LLM for normal enemy decisions.
- Do not delete destroyed units or restore their lost equipment.
- Do not deploy, push, send messages, or mutate production without explicit authorization.
- Keep commits narrow and reversible; do not mix unrelated cleanup into feature slices.

### 9. Required validation matrix

At every milestone run and record:

```text
npm run seed:check
npm run typecheck
npm run lint
npm test
npm run build
npm run build:production
```

Also run:

- empty and upgrade-path D1 migration/seed replay twice;
- pure replay hash/event equivalence tests;
- tactical and strategic duplicate alarm/command/effect tests;
- forced failure between prepare, commit, D1 effect, acknowledgement, and next-round transition;
- ownership/IDOR/permission/origin/rate/payload tests;
- multi-user browser E2E at desktop, tablet, and mobile sizes;
- keyboard and screen-reader alternatives for all core workflows;
- large-map/large-force performance and concurrent submission tests;
- preview deployment and live read/write smoke tests with throwaway accounts/data;
- backup, restore, rollback, and reconciliation rehearsal.

Record commands, versions, counts, environment, and outcomes in `docs/RELEASE_READINESS.md`. A passing unit suite proves only tested mechanics; it does not activate deferred catalogue content.

### 10. Final public-release acceptance scenario

Do not declare the goal complete until this is proven in a production-like preview with real authenticated accounts:

1. A new player registers, verifies, onboards, joins or creates a Battalion, and returns in a fresh session.
2. The player receives/earns Requisition under the approved policy, purchases a valid unit and equipment, creates a legal loadout, and sees the correct icons, stats, readiness, and ledger entries.
3. Multiple players organize units into a Battlegroup with correct ownership and delegated command.
4. Their Battalion owns and configures a named ship, embarks the force, consumes/retains the correct supply, submits a strategic route, and travels over multiple rounds to another planet.
5. They choose an available operation and deploy legal persistent units into a scenario-specific tactical map.
6. Players see only authorized battlefield intelligence and allied intentions, submit/edit/cancel/schedule legal structured orders, and receive clear blockers for illegal ones.
7. Enemy intentions are generated deterministically from the locked snapshot using data-defined doctrine.
8. The tactical round locks automatically and resolves exactly once through movement, LOS, equipment, dice, mitigation, damage, casualties, support, objectives, and persistent effects.
9. Reconnects and different authorized viewers see consistent, correctly redacted state. A detailed report/replay explains the outcome.
10. Destroyed units stay destroyed, installed gear is lost exactly once, survivors retain damage/ammo/supply/history, and no unit exists in two places.
11. The tactical result changes the strategic war—control, threat, route, operation, supply, or reinforcement state—through an idempotent acknowledged effect.
12. Survivors withdraw/re-embark, travel to another operation/planet, and participate in a later campaign.
13. Operator dashboards show healthy journals, schedules, effects, sockets, migrations, and errors; forced retries do not duplicate or skip anything.
14. Accessibility, security, privacy/licensing, performance, preview soak, backup/restore, deployment, monitoring, support, and rollback gates all pass.

At completion, provide:

- a concise shipped-capability list;
- the final rule activation/execution matrix;
- migration/seed/release versions;
- exact automated and browser test evidence;
- remaining intentionally unadvertised post-v1 items, if any, with reasons;
- operational runbook and rollback instructions;
- confirmation that no showcase fallback, developer override, `501`, or unresolved balance value is reachable through an advertised production workflow.

That complete persistent loop—not the number of files, tables, screens, or tests—is the measure of success.

# Corinth's Plight — Completion Audit

**Audited:** 2026-08-10

**Commit:** `307af23` (`codex/phase0-release-baseline`) plus the local K-17/report foundation described below

**Authority:** `docs/GAME_COMPLETION_GOAL.md`

**Verdict:** **Not release ready**

The repository is a healthy Cloudflare-native foundation with production passwordless identity, guided onboarding, persistent force/loadout services, deployment-plan commits, usable strategic commands, and a deterministic tactical core. It is not yet the advertised living cooperative war. Production-facing clients still contain local showcase fallbacks and several deferred systems. Strategic submission and approved resolution no longer return `501`: supported formation, supply and operation orders now advance D1 state and the round. Persistent tactical campaigns require authored map-source loaders instead of cloning K-17; K-17 and the larger local Operation Iron Rain content now load independently. Rules instance storage and D1 publication still retain legacy identity alongside the generated runtime catalogue.

This document reports evidence, not intent. A capability is `implemented` only when all applicable source/data/schema/engine/auth/persistence/event/UI/test/operations layers exist. The audit uses:

- `implemented` — usable by a real authenticated player through an authoritative persisted workflow;
- `partial` — a meaningful workflow exists, but required layers or cases are missing;
- `catalogue-only` — data/type/UI representation exists without executable gameplay;
- `blocked` — deliberately unavailable or awaiting a source/architecture gate;
- `prototype` — fixture, local showcase, V1 reference, or demo-bound behavior;
- `missing` — no usable workflow exists.

Confidence is `High`, `Medium`, or `Low`. Roadmap IDs refer to `IMPLEMENTATION_ROADMAP.md`; rule decisions refer to `RULE_DECISIONS_REQUIRED.md`.

## Evidence baseline

The audit began with only two unrelated untracked user paths, which were preserved: `docs/GAME_COMPLETION_GOAL.md` and `image/background/`.

| Check | Result | Evidence |
|---|---|---|
| Seed/content validator | Pass | `npm run seed:check`: 46 definitions, 41 active, 100 SQL definitions, 16 Phase-2 allied classes, 7 enemy roles, 4 Phase-3 operations, 9 equipment effects, 6 deployment methods, 8 source hashes. |
| TypeScript | Pass | `npm run typecheck`. |
| ESLint | Pass | `npm run lint`. |
| Unit/contract tests | Pass | `npm test`: 60 files, 482 tests, Vitest 4.1.10. |
| Worker/client build | Pass | `npm run build`; Worker 1,254.61 kB, client JS 777.40 kB, CSS 136.50 kB. Wrangler's sandboxed debug-log write warns but the build exits successfully. |
| Production-mode build | Pass | `WRANGLER_WRITE_LOGS=false npm run build:production`. |
| Empty D1 migration replay | Pass | All eight migrations applied in isolated Wrangler state. |
| Repeat seed replay | Pass | All seven seeds applied twice. |
| D1 integrity | Pass | SQLite `integrity_check=ok`; `foreign_key_check` empty; 10 migration records and 117 application tables. |
| Application CI | Local baseline implemented; remote proof pending | The application workflow now runs locked install, advisory audit, seed validation, typecheck, lint, Vitest, empty-D1 replay, production build and Playwright, then retains bundle/browser evidence. It has not run on GitHub or been made a protected required check. See CP-001. |
| Browser/a11y/performance tests | Browser baseline partial | `npm run test:browser`: 11/11 pass for the signed-out auth/enlist shell, authenticated live local strategic/tactical reads without showcase fallback, an authoritative Reserve loadout preview/commit, strategic Disembark, resolved Large-Supply logistics, strategic deployment authorization through tactical snapshot commit, forged tactical economy rejection, Heavy Air Transport composer, executable-action composer, four-round report playback, planning layers, and 390px document overflow. Full onboarding/game E2E, Axe/manual accessibility, performance and load remain CP-800/CP-702/CP-802. |

The passing unit suite proves the tested helpers and contracts only. It does not activate catalogue-only content, validate real D1/DO crash boundaries, or prove a production browser workflow.

## Executive capability matrix

| Capability | Status | Confidence | Evidence | Gap / roadmap |
|---|---|---:|---|---|
| Passwordless Resend registration, verification, login, logout | implemented foundation | High | `worker/routes/auth.ts:33-73`; `worker/services/auth.ts`; `src/components/AuthGateway.tsx` | Local terminal-record retention exists at migration `0008`; idle/absolute TTL, device/session management, recovery, profile/data rights, production migration and monitoring remain CP-102/CP-103/CP-107. |
| Guided Battalion join/create/invite, starter unit and tour | implemented foundation | High | `worker/routes/onboarding.ts:60-90`; `src/components/GuidedOnboarding.tsx:192-243` | Local invitation limits/audit/outbox hardening exists; opt-out, production abuse evidence and the full organisation lifecycle remain CP-104/CP-206/CP-207. |
| Force list/detail/history, unit/equipment purchase and loadout | partial | High | Force/equipment routes and services | Reserve/ship-facility loadouts now preview and persist an authoritative effective combat package with exact-once receipts; generated availability blocks known non-functional equipment. Economy, item breadth, refits/loss and local fallback removal remain CP-200–CP-208. |
| Deployment planning and commit | partial | High | `worker/routes/deployment.ts:49-86`; `worker/services/deployment.ts:335-445` | Demo IDs, no general scenario bootstrap, incomplete lift: CP-208/CP-400/CP-601. |
| Tactical map and executable composer | partial/playable | High | `src/App.tsx`; `src/components/HexMap.tsx`; generated tactical grammar; Campaign DO/resolver | Authenticated authored campaigns expose generated Hold/Advance/Rush and migrated support actions with server-derived costs/blockers. Routes resolve on quarter-distance simultaneous timing, persist legal prefixes, and report hostile/capacity stops. Attack declares one target and the server fires every eligible fitted weapon with per-weapon report evidence. Cooperative readiness names missing Allied orders; submitted audience-safe Allied intents render as selectable maneuver/assault/support/fortify/hold routes with facing, destination and action-target cues while drafts stay private. Round-scoped, fog-safe Allied tactical markers persist and render with accessible removal controls. Broader combined-arms rules and accessible map alternative remain CP-500–CP-507/CP-701–CP-702. |
| Deterministic enemy orders | partial/playable | High | `worker/enemy-ai.ts`; `packages/rules-engine/src/enemy-doctrine.ts` | Published @2 Drone/Warrior/Heavy doctrine now drives stable legal orders, target preference, AP vehicle priority, fire spreading and scenario-primary-objective movement, with projected intention events. Formation cohesion, retreat, supply awareness, difficulty profiles and the incomplete enemy roster remain CP-506. |
| Tactical persistent effects | partial/gated | High | `worker/campaign-durable-object.ts` effect applier and round finaliser | Supported D1 consequences now acknowledge before the next round opens and retry safely; PREPARED/crypto/collision/attempt coverage remains CP-402. |
| Tactical realtime/report API | partial/playable | High | Campaign DO report endpoint; `src/components/CampaignReports.tsx`; `src/components/CampaignReplay.tsx` | Round detail is visible and grouped. Each detail response now pairs its archived projected events with the audience-projected pre-resolution battlefield snapshot, and the UI reconstructs positions, routes, interactions, health, destruction, support state and objective control through keyboard-operable play/step/scrub controls plus an accessible formation ledger. Terminal reports also project acknowledged Battalion-visible strategic effects and return directly to the Galactic map. Socket invalidations are per-viewer and include bounded catch-up. Per-event knowledge evolution, declassification and export remain CP-403/CP-700. |
| Strategic command/Battalion/ship/map/operation reads | implemented read model | High | `worker/routes/strategic.ts:114-138,162-170` | UI can fabricate showcase/default state; no mutations: CP-305. |
| Strategic order submission | implemented for supported intents | High | `worker/routes/strategic.ts`; `worker/services/strategic.ts`; Strategic Map DO | Strict validation, Battalion/formation authority, actor-scoped replay and server-derived route checks commit orders. `DEPLOY_TO_CAMPAIGN` now authorizes one co-located Battlegroup and pins its insertion method before tactical plan commit. Movement still fails closed on unresolved timing; tactical withdrawal and orbital combat remain deferred: CP-301–CP-303. |
| Strategic resolution | implemented foundation | High | `worker/strategic-map-durable-object.ts`; `resolveStrategicMapRound` | Approval-gated resolution hydrates D1, runs the pure engine and atomically applies formation/supply/operation updates, events, receipts and the next round. PREPARED/crypto/alarm/failure-injection work remains: CP-302. |
| Ship identity/modules/cargo/supply | partial/read-only | High | D1 schema and `GET /api/ships/primary`; `ShipView.tsx` | Acquisition/configuration/movement/transfers/combat deferred: CP-300/CP-301/CP-305. |
| Campaign discovery/join | implemented foundation | High | `GET /api/campaigns` and idempotent `POST /api/campaigns/:id/join` drive the authenticated K-17 entry and deployment flow. Withdrawal, reinforcement administration and general authoring remain open. | CP-401/CP-405. |
| Reports library/replay | partial/playable UI and API | High | Report index/detail DO endpoints; `src/components/CampaignReports.tsx`; `src/components/CampaignReplay.tsx`; `src/campaign/replay.ts` | The archive lists durable rounds, shows grouped detail/terminal results and acknowledged strategic consequences, and replays the audience-projected locked snapshot through every archived event with map and accessible-state views. Per-event knowledge evolution, declassification and export remain CP-403/CP-700. |
| Multi-planet living war | partial/playable development vertical | High | The development theatre contains the three-operation Corinth chain plus independent Cold Horizon on Corinth II. Resolute can traverse the five-round route to Corinth II, then a co-located Raven must receive and resolve a strategic deployment order before its exact persistent snapshots may enter the five-round 127-hex tactical scenario. Assigned Battlegroups persist on the operation projection. A separate round trip proves Disembark → reserve-node persistence → Embark → primary-ship persistence. Production content, travel supply, branching outcomes and additional worlds remain open. | CP-302–CP-305/CP-600–CP-604. |
| CI, preview, recovery, SLOs, legal/a11y/performance | missing release evidence | High | Config/docs/workflow inventory | CP-001–CP-107/CP-702/CP-800–CP-805. |

## Critical findings register

| Finding | Priority | Status | Confidence | Evidence and acceptance boundary | Roadmap |
|---|---|---:|---:|---|---|
| AUD-CAT-001 — split gameplay truth | P0 | partial | High | A generated, hash-verified `v5-core-curated@2` catalogue now materializes playable subsets for all thirteen canonical allied classes and their executable action/order grammar through Force projection, deployment hydration, tactical UI lookup, submission and resolution. Companion-only classes still fail before execution. D1 stores the legacy `@1` relational identity for instance FKs and validation, and immutable `@2` D1 publication remains open. | CP-200/CP-201 |
| AUD-RULE-002 — conflict provenance is internally broken | P0 | open | High | Fresh D1 contains only 12 obsolete short `rule_conflicts` IDs from `seeds/v5-core-curated.sql:28-40`, while the canonical doc has 72 namespaced IDs. Phase-2 definitions reference namespaced IDs with no D1 row; compiled definitions reference old IDs. Published definitions/events cannot form a referential conflict audit. | CP-200 |
| AUD-CAT-003 — adapter invents/loses authority | P0 | resolved | High | CP-201 preserves generated availability/requisition/execution status, action links, profile bindings and nullable sourced values in a separately hashed rules-authority snapshot. Strict governed cargo hydration retains slot conversions, maximum FS, mutually exclusive modes, towing and source action semantics without guessed slots/costs; unsupported legacy cargo execution is withheld. Tactical supplies now use exact `SMALL_SUPPLY`, `MEDIUM_SUPPLY`, `LARGE_SUPPLY`, `MEDICAL_SUPPLY` and `MAIN_AMMUNITION` IDs, including resolver reload and request-boundary rejection of ambiguous strategic sizes. | CP-201 |
| AUD-CAT-004 — blocked companion slots execute | P0 | open | High | RC-EQP-001 marks optional slot budgets blocked, and Phase-2 metadata says companion-only/catalogued; `listUnitSlots` ignores that metadata and the loadout engine enforces every row. Existing purchasable equipment therefore relies on an unapproved slot policy. | DEC-017/CP-200/CP-204 |
| AUD-EQP-001 — Scan/Drone are event-only no-ops | P0 content-integrity | partial | High | The generated grammar now makes Scan/Drone non-executable throughout submission and resolution, preventing their event-only handlers from presenting as gameplay. Visibility state effects remain unimplemented; Optics still has a legacy passive `+1 Sensors`, and Drone Operator is seeded Secondary although its Store row says Primary. Keep both unavailable until DEC-018 is resolved and state/projection is wired. | DEC-018/CP-204/CP-500 |
| AUD-RULE-004 — unknown sensors become a real zero | P0 | open | High | D1's non-null legacy column and Phase-2 0 sentinel turn an unknown sensor value into runtime truth, contrary to `GAME_SYSTEMS.md` unknown-value policy. Migrate a nullable/profile representation and block dependent mechanics until known. | CP-200/CP-201 |
| AUD-SCEN-001 — unauthored tactical campaigns inherited K-17 | P0 | resolved for current content | High | Persistent initialization now requires a supported `map_source_key`; K-17 and Iron Rain load their own authored scenario content and unsupported maps fail closed. A general scenario importer remains CP-400 work, but arbitrary campaigns no longer receive a silent K-17 clone. | CP-400/CP-401 |
| AUD-SCEN-002 — production has only one authored operation | P0 | partial | High | `onboarding-foundation.sql` creates the public K-17 recruiting campaign and insertion zone. The local strategic fixture now chains Iron Rain → Broken Road → Night Glass and independently proves travel/deployment to Cold Horizon on Corinth II, but production still has no wider strategic map/ships or curated operation chain; those remain DEC-020/CP-304/CP-400 work. | DEC-020/CP-304/CP-400/CP-404 |
| AUD-JOURNAL-001 — next round precedes durable acknowledgement | P0 | partial | High | The DO now commits `EFFECTS_PENDING`, retries stable receipt-backed effects, and finalises one next round only after all pending keys acknowledge. Resolution/effect records still lack PREPARED input, protected seed, cryptographic output/payload collision checks and complete attempt diagnostics. | CP-402 |
| AUD-RT-001 — cross-audience socket invalidation | P0 security | partial | High | `broadcast()` now deserializes each trusted viewer attachment and emits only identifier-free invalidation metadata plus that audience's monotonic cursor. Reconnect accepts the last cursor and returns a bounded projected event catch-up; enemy projections exclude Allied order events. Event-time report/intelligence projection and hibernation/browser evidence remain open. | CP-403 |
| AUD-STRAT-001 — internal service unreachable from public order route | P0 when advertised | resolved for supported manual resolution | High | Public POST now forwards to the map coordinator, and approval-gated resolution applies supported pure-engine results to D1 and advances the round. Scheduled alarms, PREPARED/crypto crash recovery, wider map aggregation and still-deferred intent families remain CP-302/CP-303 work. | CP-302/CP-303/CP-305 |
| AUD-DETERMINISM-001 — noncanonical tactical ordering/hash | P0 before durable replay | open | High | Tactical stable digest/order sorts use `localeCompare` and 32-bit FNV (`resolver.ts:91-99,132-135,403`; `rng.ts:8-15`) despite the recorded Unicode code-point rule. Strategic code-point ordering is corrected, but its hash remains noncryptographic. | CP-200/CP-302/CP-402 |
| AUD-RULE-005 — unactivated terrain defaults execute | P1 | open | High | `packages/rules-engine/src/hex.ts:113-146` applies road/elevation/river values that docs say require a scenario profile. Move them into pinned scenario/rules data and test inactive behavior. | CP-400/CP-500 |
| AUD-RULE-006 — rear attack applies outside V5 domain | P1 | closed locally | High | Governed campaign tags now restrict rear Armor bypass to ground vehicles, restrict dug-in Defense loss to ground infantry, and explicitly exclude aerospace/VTOL/orbital targets. | CP-501 |
| AUD-RULE-007 — cargo/action ledger gaps | P1 | partial | Medium | Ground Load/Unload and generic VTOL cargo use governed capacity, paired consent, carrier-position coupling, occupancy-safe unload and persistent manifests. Packed Artillery towing is live. HAT clear-route Infantry/Light Vehicle airdrop now uses the five-slot profile and a zero-Speed class exception; hazardous outcomes and carrier-destruction adjudication remain open. | CP-503/CP-505 |
| AUD-RULE-008 — transport destruction unadjudicated | DECISION/P1 | blocked | High | Destroyed carrier leaves cargo attached; RC-V5-030 has no approved consequence. | DEC-008/CP-503 |
| AUD-UI-001 — authoritative-looking local fallbacks | P0 | open | High | Tactical begins with local demo state; Forces replaces failed APIs with `SHOWCASE_FORCE`; strategic replaces required failures with a full local snapshot (`src/App.tsx:62-151`; `ForcesView.tsx:661-704`; `src/strategic/api.ts:625-703`). | CP-208/CP-305/CP-703 |
| AUD-UI-002 — hard-coded production context | P0 | partial | High | Tactical campaign and deployment selection now come from authenticated directories; demo headers exist only in development. Forces and strategic showcase adapters still contain fixed Resolute/33rd/fixture identities, while the local tactical fixture retains fixed round/unit IDs by design. | CP-208/CP-401/CP-703 |
| AUD-UI-003 — client fabricates tactical events | P0 | open | High | After order save, App creates local event ID/sequence/actor/payload/time/visibility (`src/App.tsx:360-376`) instead of consuming journal truth. | CP-403/CP-406 |
| AUD-UI-004 — equipment selection does not mutate purchase | P1 | open | High | Forces requisition shows equipment checkboxes but omits `equipmentIds` from purchase payload (`ForcesView.tsx:504-550,583,636-644`). | CP-204/CP-208 |
| AUD-AUTH-001 — auth/invitation operations are local-only and incomplete | P0 | partial | High | Local migration `0008` adds bounded hourly terminal-record cleanup, invitation actor/Battalion/recipient/IP limits, pseudonymized audit, a durable immediate-attempt/retry outbox and terminal invite PII retention. It is not deployed; idle/absolute session TTL, device/session controls, opt-out, production timing/abuse monitoring and broader integration evidence remain open. | CP-102/CP-104 |
| AUD-OPS-001 — preview is a placeholder | P0 | blocked | High | Preview D1 ID is `00000000-0000-0000-0000-000000000002`; no preview migration/seed/deploy/smoke workflow. | CP-101 |
| AUD-OPS-002 — no recovery evidence | P0 | open | High | No executable backup/restore/DO reconstruction/RPO/RTO rehearsal; health is shallow; release metadata/SLO dashboards/alerts absent. | CP-005/CP-105/CP-106 |
| AUD-QA-001 — browser baseline is not the release matrix | P0 | partial | High | Four local Playwright canaries and CI artifact wiring now exist, but there is no production-like multi-user/game-loop run, Axe/screen-reader/visual evidence, load or soak suite. Tactical canvas still lacks a semantic route/target alternative. | CP-002/CP-702/CP-800/CP-802 |
| AUD-LEGAL-001 — public policy and asset-rights evidence absent | P0 | blocked | High for missing evidence | No privacy/terms/security/support/data-rights flow or asset provenance manifest. This does not prove assets are unlicensed; it proves clearance evidence is absent. | CP-107/CP-205/CP-804 |

## Public HTTP route inventory

All routes are Worker same-origin routes. `Implemented` here means the route has a handler; its capability can still be partial as shown above.

| Method and path | Route behavior | Status |
|---|---|---:|
| `GET /api/health` | Shallow liveness response | partial |
| `GET /api/rulesets/v5-core-curated` | Returns the strict redacted projection of generated `v5-core-curated@2`, including its content hash; tactical consumers use it while immutable D1 publication remains open | partial |
| `GET /api/auth/session` | Current session | implemented |
| `POST /api/auth/register` | Request registration email link | implemented |
| `POST /api/auth/login` | Request login email link | implemented |
| `GET /api/auth/verify?token=` | Stage one-time email challenge and redirect | implemented |
| `POST /api/auth/verify` | Consume staged challenge and create session | implemented |
| `POST /api/auth/logout` | Revoke and clear session | implemented |
| `GET /api/onboarding` | Onboarding status/directory/invites/starter options | implemented |
| `POST /api/onboarding/battalions/join` | Public/invite-code join | implemented |
| `POST /api/onboarding/battalions` | One-time Req-backed Battalion charter | implemented product policy |
| `POST /api/onboarding/battalions/settings` | Recruitment policy | implemented |
| `POST /api/onboarding/battalions/invites` | Generic accepted invitation command, pre/post-authority limits, durable delivery enqueue and immediate background attempt | local partial; production migration/monitoring and opt-out remain |
| `POST /api/onboarding/battalions/invites/respond` | Accept/decline | implemented |
| `POST /api/onboarding/starter-unit` | Idempotent starter grant | implemented product policy |
| `POST /api/onboarding/complete` | Complete tour/progress | implemented |
| `GET /api/forces` | Owner force summaries/filter/cursor | implemented |
| `GET /api/forces/:id` | Friendly inspection | implemented |
| `GET /api/forces/:id/history` | History | implemented route; incomplete UI |
| `GET /api/forces/:id/eligible-equipment` | Eligibility projection | partial |
| `GET /api/forces/:id/loadout` | Loadout, corrected owned-equipment availability and effective-unit projection | implemented subset |
| `POST /api/forces/:id/loadout-preview` | Non-mutating authoritative proposed effective-unit validation | implemented subset |
| `POST /api/forces/:id/rename` | Versioned rename | implemented route; missing UI |
| `POST /api/forces/:id/loadout-changes` | Versioned exact-once loadout mutation | partial item breadth |
| `GET /api/catalogue/units` | D1 unit catalogue | partial/split truth |
| `GET /api/campaigns` | Authenticated membership-scoped campaign directory with authored-content availability | partial; discovery/join/withdraw/reinforce deferred |
| `GET /api/requisition` | Owner balance/ledger | partial economy |
| `POST /api/requisition/purchases` | Exact-once unit purchase | blocked for unknown prices outside dev policy |
| `POST /api/requisition/equipment-purchases` | Exact-once equipment inventory purchase | partial item breadth |
| `POST /api/deployment-readiness/check` | Server readiness | partial profile breadth |
| `GET /api/deployment-context?campaignId=` | Planning context | partial/demo campaign ecosystem |
| `GET /api/deployment-plans` | Owner plans | implemented |
| `POST /api/deployment-plans` | Save/validate plan | implemented |
| `GET /api/deployment-plans/:id` | Inspect plan | implemented |
| `POST /api/deployment-plans/:id/validate` | Revalidate | implemented |
| `POST /api/deployment-plans/:id/commit` | Commit snapshot/deployments | partial; does not initialize scenario |
| `GET /api/command` | Strategic command projection | implemented read model |
| `GET /api/battalions/current` | Current Battalion projection | implemented read model |
| `GET /api/battalions/current/members` | Members | implemented read model |
| `GET /api/battalions/current/activity` | Activity cursor | implemented read model |
| `GET /api/ships/primary` | Primary ship projection | implemented read model |
| `GET /api/operations` | Visible operations | implemented read model |
| `GET /api/operations/:id` | Operation detail | implemented read model |
| `GET /api/strategic/maps/:id` | Audience-filtered map projection | implemented read model |
| `POST /api/strategic/orders` | Strictly validates and commits an authorized, replay-safe strategic order through the map coordinator | implemented for supported intents |
| `POST /api/strategic/maps/:id/resolve` | Approval-gated deterministic resolution and atomic D1 projection | implemented foundation |
| `GET/PATCH/POST/DELETE /api/campaigns/:id/*` | Authz proxy to Campaign DO paths below | partial/demo-bound |

No public campaign directory/create/join/leave, profile/settings/session-management, rank/member/Battlegroup administration, ship mutation, refit/construction, notification, report-index, rules publication, recovery, or operator diagnostics route exists.

## Durable Object command inventory

### Campaign Durable Object

| Command | Runtime | Status/gap |
|---|---|---|
| `GET /state` | Project viewer campaign state | partial; demo scenario and current-time fog |
| `POST /orders` | Strict current-round draft/submitted intent; actor-scoped SHA-256 receipt and campaign/order revision CAS; server-derived costs/attack audit | partial; broad split catalogue, owner-only authority, no immutable D1 order archive |
| `DELETE /orders/:id` | Cancel current/future unlocked order | implemented backend; no UI |
| `POST /resolve` | Admin manual tactical resolve | partial; unsafe journal boundary |
| `PATCH /clock` | Admin clock preset | partial; generic player UI renders it |
| `POST /pause` | Admin pause | partial |
| `POST /resume` | Admin resume | partial |
| `GET /ws` upgrade | Read-only hibernating per-audience invalidations and bounded reconnect catch-up | partial; event-time fog proof remains |
| `GET /reports` | Viewer-authorized durable round index consumed by the Reports screen | implemented foundation; playback/export absent |
| `GET /reports/:round` | Viewer round detail consumed by the Reports screen | partial; no event-time knowledge, playback or export |
| alarm | Locks/resolves or processes scheduled transition | partial; no durable schedule lifecycle/recovery |

### Strategic Map Durable Object

| Command | Runtime | Status/gap |
|---|---|---|
| `POST /orders` | Internal caller can invoke `commitStrategicOrder` | unreachable from public route |
| `POST /resolve` | Runs the pure strategic resolver and atomically advances D1 state/round | implemented foundation |
| alarm | None | missing |

## UI action and false-front inventory

| UI surface/action family | Status | Evidence summary / required replacement |
|---|---:|---|
| Landing registration/login/verification/logout | implemented foundation | Server-backed auth flow. Marketing copy overstates living-war readiness and must be narrowed until gates pass. |
| Guided Battalion directory/code/create, invites, starter unit, tour | implemented foundation | Product-policy numbers/lore are not canonical rules. |
| Tactical campaign selection | missing | App always uses `outpost-k17`. |
| Tactical unit/route/facing/order/actions | partial/playable | Campaign-selected composer exposes the exact generated executable orders and Attack/Reload/Load/Unload; paired cargo remains a two-order coordination flow and advanced rules are deferred. |
| Tactical order cancel | missing UI | Backend exists. |
| Tactical `MY UNITS/ALLIED`, `SURFACE/INTEL/SUPPLY` | implemented foundation | Roster scope now distinguishes owned orderable units from inspect-only Allied formations. Surface, Intel and Supply layers change battlefield rendering, legends and hover detail without inventing hidden data. |
| Tactical non-foundation order types | catalogue-only | Disabled and marked soon. |
| Tactical operator clock/pause/resume/resolve | misleading | Rendered to normal players; backend correctly requires admin. Hide/role-gate and add audited operator workflow. |
| Tactical Reports | partial/playable | Reports navigation opens the durable round archive/detail view, grouped calculations, terminal result and strategic consequences. A projected locked snapshot now drives browser-proven ordered tactical playback and an accessible formation ledger. Per-event knowledge evolution, declassification and export keep CP-700 open. |
| Tactical Settings | notice-only | Settings does not open an implemented workflow. |
| Forces browse/inspect/readiness/purchase/loadout | partial | Owner-scoped live routes now support Reserve/ship-facility refits without a fixed operation ID and show the server-derived combat delta before commit. Demo headers/showcase fallback, economy and broader item lifecycle remain. |
| Forces initial-equipment checkboxes | false front | Selection is omitted from purchase command. |
| Forces rename/history | missing UI | Backend routes exist. |
| Forces abilities | catalogue-only | Explicitly labels resolver deferred. |
| Deployment selection/method/zone/save/commit | partial | Real authenticated campaign selection, owned-unit validation and commit flow; broader Battlegroup/lift/scenario choices remain incomplete. |
| Command/Battalion/ship/operation/map navigation | implemented read UX | Strategic fallback can replace failure with local fixture. |
| Battalion rank/member/Battlegroup administration | missing/read-only | Organisation UI projects data only. |
| Ship configure/upgrade/movement/transfer/consumption/combat | blocked/notice-only | Explicit deferred controls. |
| Strategic order | functional supported slice | UI submits Disembark, Task Force resupply and campaign Support, and exposes approval-gated round resolution; unresolved movement remains unavailable. |
| Strategic-to-tactical deploy/result reconciliation | blocked/notice-only | No bootstrap/effect flow. |
| Unit/planet/ship imagery | prototype | React uses text markers; supplied unit/sprite library is not integrated or licensed in a manifest. |

## Rule-to-runtime activation matrix

### Canonical V5 roster

All 13 non-orbital classes have null Req prices and remain non-purchasable unless a separate product grant is explicitly allowed. Companion Power Armour, Irregulars and Special Forces remain catalogued/dev-only under RC-UNIT-015.

| Class | D1 | Generated tactical class | End-to-end status | Principal gap |
|---|---:|---:|---:|---|
| Infantry | yes | yes | partial/playable | Attack, movement, facing, persistent Dig In, and generated/scenario-marked Cover Armor are connected through resolver, reports and UI. Directional cover, melee/stealth and price remain open. |
| Medic | yes | yes | partial/playable | First Aid, self Dig In and both self/Logi field resupply are connected through generated catalogue, order contract, resolver, report events and tactical UI. A Logi spends one Small Supply to restore Medical Supply to current Medic FS without consuming the Medic's action; MASH remains deferred. |
| Engineer | yes | yes | partial/playable | Vehicle Repair and self Dig In are connected through generated catalogue, strict order contract, resolver, reports and tactical UI. Repair restores one Hit or one selected subsystem for one Small Supply in base contact. Construct remains deferred. |
| Artillery | yes | yes | partial/playable | Deploy/Pack Up and Bombardment are connected through generated grammar, strict orders, resolver, reports and tactical UI. Bombardment requires deployment, spotting, range and Small Supply, applies capped/recovering Defense stacks, and changes combat calculations. Funnel and anti-orbital paths remain deferred; direct damage remains experimental. |
| Logi Truck | yes, legacy seed marks executable | yes, partial | partial/playable | Ground passenger/Supply cargo, packed-Artillery towing and the narrow Artillery Small Supply transfer are connected; wider Resupply and coordinated airdrop remain deferred. |
| Light Vehicle | yes | yes | partial/playable | HITS combat, Rapid Fire against Horde, persistent natural-5/6 weapon/mobility subsystem malfunctions, Evasive, and mutually-exclusive passenger-or-Small-Supply cargo are active. |
| IFV | yes | yes, partial | playable | Generated attack, AP/Armor, subsystem, six-FS infantry-cargo and stationary Armor-exposed Crew Repair are connected; Req remains unresolved. |
| Main Battle Tank | yes | yes | partial/playable | Armor/AP/facing, ground-only rear Armor bypass, persistent subsystem malfunctions, Engineer repair and stationary Armor-exposed Crew Repair are active. |
| Light Mech | yes | yes, partial | partial/playable | Exact V5 chassis and Light Laser, hostile-ground passage, Evasive, persistent subsystem failures, live Campaign DO hydration, UI order guidance and report evidence are connected; Req remains unresolved. |
| Fighter | yes | yes, partial | partial/playable | Speed-7 Atmo Flight, Evasive hostile-ground passage, D4 Range-1 Rapid Fire attack, one-shot ammunition, no-ground-spotting, the forward travel-path arc, `RC-V5-028` Interceptor restriction, friendly-airfield Land/Take Off, and landed Primary rearm execute through generated authority. |
| Bomber | yes | yes, partial | partial/playable | Speed-6 Atmo Flight, hostile-ground passage, D6 Range-0 one-shot ordnance, no-ground-spotting, route-bound fly-over targeting, friendly-airfield Land/Take Off, and landed Primary rearm execute through generated authority. |
| VTOL | yes | yes, partial | partial/playable | Exact V5 chassis and D2 nose gun, terrain-independent flight, hostile-ground passage, no-ground-spotting tag, mutually-exclusive infantry/Supply cargo, and authored-facility Land/Take Off execute through generated authority; HAT/aerospace extensions remain open. |
| HAT | yes | yes, partial | partial/playable | Speed-7 Atmo Flight, Hits 1, hostile-ground passage, no-ground-spotting, the exact five-slot cargo table, zero-Speed clear straight-route Infantry/Light Vehicle airdrop, and friendly-airfield Land/Take Off execute through generated authority. Hazardous-drop results and coordinated Supply drops remain deferred. |

### Orders, actions, equipment and deployment

- Generated executable orders: Hold, Advance and Rush only.
- Generated executable action grammar and tactical UI: Attack, finite-weapon Reload, Medic field resupply, Load, Unload, First Aid, Engineer Repair, and Artillery Deploy/Pack Up/Bombardment; Scan and Drone are rejected and unadvertised until their visibility state effects exist.
- The active Attack calculation now uses authoritative map elevation for the ground-only Terrain Advantage +1, governed weapon/target tags for Rapid Fire versus Horde, governed target domains for rear effects, and persistent natural-5/6 vehicle subsystem failures. Multiweapon and Evasive are playable; split fire, melee and firing arcs remain incomplete.
- D1 has 22 action definitions. CP-201 preserves their audit links but exposes only action/order types backed by a registered generated foundation handler. Crew Repair is now executable for the governed IFV/MBT subset; MASH, Funnel, general supply transfer, flight operations, airdrop and sabotage remain non-executable end to end.
- The executable equipment subset is narrow: Flak Vests and Light AT currently have proven handlers. Generated corrections fail closed on Optics and Drone Operator because their visibility effects are not implemented; Orbital Drop Training and the remaining items stay partial, blocked or hidden.
- Standard, Vehicle, VTOL, HAT and Paradrop deployment rows are marked implemented, but planner/scenario/aerospace integration is incomplete; Orbital remains partial and unresolved.

## D1 inventory and workflow coverage

Fresh replay produced 117 application tables, excluding SQLite/Cloudflare internals and `d1_migrations`. The grouped names below are the reproducible schema inventory. Group status describes the strongest production workflow touching the family; individual gaps are called out afterward.

| Family | Tables | Strongest status |
|---|---|---:|
| Identity/profile/auth | `users`, `profiles`, `user_sessions`, `auth_identities`, `auth_email_challenges`, `auth_rate_limits`, `auth_audit_events`, `account_recovery_challenges`, `battalion_invitation_rate_limits`, `battalion_invitation_audit_events`, `battalion_invitation_delivery_jobs` | partial; local retention/invite operations, recovery/settings/session controls incomplete |
| Published rules/content | `rulesets`, `ruleset_sources`, `rule_conflicts`, `unit_class_definitions`, `weapon_definitions`, `equipment_definitions`, `action_definitions`, `order_type_definitions`, `structure_definitions`, `terrain_definitions`, `ship_class_definitions`, `enemy_definitions`, `ruleset_implementation_overlays` | catalogue; runtime split/provenance broken |
| Profiles/tags/abilities | `movement_profile_definitions`, `durability_profile_definitions`, `cargo_profile_definitions`, `supply_profile_definitions`, `deployment_profile_definitions`, `tag_definitions`, `ability_definitions`, `status_effect_definitions`, `unit_definition_profiles`, `unit_definition_tags`, `unit_definition_abilities`, `unit_definition_weapons`, `unit_equipment_slot_definitions`, `equipment_eligibility_rules` | partial catalogue/adapters |
| Persistent force | `player_units`, `player_unit_equipment`, `unit_history`, `player_unit_loadouts`, `player_unit_loadout_items`, `player_unit_weapon_mounts`, `player_unit_supplies`, `player_unit_subsystems`, `player_unit_status_effects`, `unit_service_summaries`, `force_mutation_receipts` | partial live workflow |
| Cargo/construction | `unit_cargo_manifests`, `unit_cargo_items`, `unit_construction_projects`, `unit_project_contributions` | cargo partial; construction missing |
| Req/equipment/refit | `requisition_transactions`, `player_equipment_inventory`, `equipment_effect_definitions`, `refit_definitions`, `player_unit_refits` | purchases partial; economy/refits blocked |
| Battalion/formation | `battalions`, `battalion_ranks`, `rank_permissions`, `battalion_permission_definitions`, `battalion_memberships`, `battalion_invites`, `battalion_email_invites`, `battalion_recruitment_settings`, `battalion_creation_charters`, `user_active_battalions`, `battlegroups`, `battlegroup_units`, `unit_order_delegations` | onboarding/read projections; lifecycle partial |
| Onboarding | `onboarding_economy_policies`, `onboarding_progress`, `onboarding_command_receipts`, `onboarding_starter_unit_grants` | implemented product-policy flow |
| Ships/capabilities | `ships`, `ship_equipment`, `ship_cargo`, `ship_capability_definitions`, `ship_module_capability_grants`, `ship_capability_overrides` | read-only/partial |
| Tactical world | `planets`, `campaigns`, `campaign_memberships`, `deployments`, `round_metadata`, `order_archive`, `campaign_event_archive`, `persistent_effects` | campaigns/deployments partial; four journal tables dormant |
| Deployment/equipment state | `deployment_method_definitions`, `campaign_insertion_zones`, `deployment_plans`, `deployment_plan_units`, `deployment_transport_assignments`, `campaign_loadout_snapshots`, `campaign_weapon_states`, `campaign_ability_states`, `deployment_mutation_receipts`, `campaign_effect_receipts` | plan/commit partial; Campaign DO ignores weapon/ability states |
| Strategic content/world | `strategic_content_sources`, `strategic_locations`, `strategic_maps`, `strategic_nodes`, `strategic_routes`, `strategic_operations`, `strategic_war_variables` | read fixtures; content/variables no live workflow |
| Strategic formations/supply | `task_forces`, `task_force_ships`, `task_force_battlegroups`, `strategic_supply_stores`, `strategic_supply_balances` | supported resolver mutations plus broader incomplete systems |
| Strategic journal | `strategic_rounds`, `strategic_orders`, `strategic_events`, `strategic_effect_receipts` | active manual-resolution foundation; PREPARED/crypto/alarm recovery open |

Twenty-one tables fall into groups with no direct non-test runtime reference or no production mutation workflow: rules/content provenance surfaces, the four tactical archive/effect tables, recovery, strategic content/locations/effects/variables, refits, construction, ship overrides, and related admin surfaces. Presence is not implementation.

## Seed and fixture inventory

| Seed | Role | Production policy/status |
|---|---|---|
| `v5-core-curated.sql` | Core ruleset, limited definitions/conflicts | Production source, but conflict register and compiled drift must be repaired. |
| `v5-phase2-combined-arms.sql` | Full class/profile/ability/capability catalogue | Production data with mixed implementation overlays; not proof of mechanics. |
| `v5-equipment-deployment.sql` | Equipment effects, deployment methods and overlays | Production data; narrow activated subset, several overstated statuses. |
| `onboarding-foundation.sql` | Starter/Battalion onboarding policies and NPC Battalions | Product policy, not canonical V5 lore/balance. |
| `development-forces.sql` | Demonstration roster/ship/Battlegroups | Development only; must never be required by production. |
| `development-strategic-world.sql` | Corinth/Corinth II map, scenario-priced routes, ships, Battlegroups and four operations | Development only; never a production grant or canonical travel-time source. |
| `development-spearhead.sql` | Demonstration deployment campaign | Development only; not a public scenario. |

## Asset and retained-prototype inventory

At audit time, `image/` contained 347 files: 257 profile images, 72 unit assets, 13 planet images, one brand icon, one `.DS_Store`, and three untracked background GIFs. `app/static/img/` contained 352 files. `shipbuilder/` contained 32 files and `worldmap/` five. Across `image/` and `app/static/img/`, extensions included 654 PNG, 38 GIF, one JPG, two PDN and four `.DS_Store` files. Counts overlap duplicated legacy/current asset sets; no rights manifest or deduplication record exists.

The audit intentionally does not assert ownership or licensing. CP-205/CP-804 require a per-file manifest with stable asset key, path, content hash, creator/source, licence/permission, derivative history, intended use, accessibility label/fallback, and optimisation status. Untracked `image/background/` remains user-owned and was not changed or staged.

Retained V1 reference findings:

- useful candidates to port deliberately: initial equipment/slot validation, custom unit visual identity, profile avatar workflow, Battalion identity/directory controls, commander/unit progression concepts;
- prototypes, not working requirements: V1 requisition/deploy/order TODO alerts, hard-coded dossier stats, Phaser world map, disconnected PIXI ship builder;
- do not delete the prototypes until their useful assets/workflows have an accepted production replacement and rights decision.

## Documentation reconciliation

CP-004 reconciled the architecture, authentication, Battalion, Cloudflare, data-model, onboarding and rules documents against the local Phase-1 checkpoint. They now distinguish deployed production migration `0007` from local migration head `0008`, the five-class compiled engine from the 16 allied D1 catalogue rows, the 72 canonical Markdown conflicts from 12 obsolete D1 IDs, tactical command receipts/state envelopes from the still-unsafe resolution journal, and implemented reads from strategic/tactical deferrals. Documentation agreement does not close the underlying implementation findings.

## Release decision

Current release decision: **NO-GO**.

The earliest safe public milestone is not “all features complete”; it is the Phase 1 preview gate. Before accepting public players, at minimum close CP-001, CP-002, CP-100–CP-107 and either remove tactical/strategic claims and fixture-backed navigation or close the relevant P0 gameplay gates. Live tactical rounds additionally require CP-400–CP-403. Advertised strategic play requires CP-300–CP-305.

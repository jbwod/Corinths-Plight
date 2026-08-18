# Corinth's Plight — Release Readiness

**Assessment date:** 2026-08-14 (Australia/Sydney)

**Assessed commit:** `d5dc372`

**Target:** Honest public release

**Decision:** **NO-GO**

**Private game-test decision:** **GO**, deployed as Cloudflare version `e88137dd-19ae-4bf5-8050-3accf8f14343` through D1 migration `0022`. This does not change the public-release decision.

This is the live release checklist. A checked local build item is not permission to deploy and is not evidence of a complete player workflow. Production migrations, seed changes, deployment, external email/messages, push, and irreversible data operations require explicit authorization for the specific release operation.

The owner separately authorized the private production game-test operation and explicitly waived preview plus a pre-deployment backup as gates for it. The test-ready product claim is limited to authenticated account/onboarding, Battalion and force management, deployment, tactical campaigns/reports/recovery, the live Galactic campaign map, and explicitly granted Game Master authoring. Command and Ship acquisition/configuration remain outside that scope.

## Current release blockers

| Blocker | Status | Evidence / exit condition |
|---|---:|---|
| Split D1/compiled/adaptor rules truth | partial P0 | CP-200's generated `@2` catalogue now materializes playable starter/Force/unit/weapon/action/order data through tactical resolution; CP-201 preserves D1 profile/status/link data and fails closed before unsupported classes execute. D1 still carries legacy `@1` relational/FK identity and lacks immutable `@2` publication. |
| Conflict provenance mismatch | open P0 | D1 has 12 obsolete conflict IDs instead of the 72-record canonical register. |
| Recorded production game-test content | private-test resolved | K-17 plus the non-demo `game-test-strategic-world@1` Helion/Corinth foundation are seeded; remote queries verified the active map, open round, five nodes, and exact K-17 pin/placement. |
| Production client truth boundary | partial P0 | Demo identities/default campaign IDs and showcase fallback are development-only. Production Forces, Strategic, and tactical campaign loading fail closed without substituting local state; authenticated browser evidence and removal/hardening of retained in-memory development fixtures remain open. Strategic Galactic/Ship surfaces are outside the private production game-test scope and must remain unadvertised there. |
| Strategic product boundary | partial P0 when advertised | Supported strategic orders and approval-gated resolution execute locally; unresolved movement timing/intent families, PREPARED/cryptographic recovery, production world publication, and separate acceptance evidence remain open. |
| Tactical persistent-effect journal | partial P0 | Supported effects now acknowledge before the next planning round opens and retry through stable receipts. PREPARED/input-output hashing, protected seeds, payload-collision detection, attempt diagnostics, full effect coverage, and crash-injection evidence remain open. |
| WebSocket/report fog | partial P0 security | Socket invalidations are viewer-specific, identifier-free and provide bounded projected catch-up; reports still use current-time rather than event-time visibility. |
| Runtime schema/fail-closed authoritative JSON | partial P0 | Campaign order/clock intents and v1 current/snapshot state validate and fail closed. The five authored scenarios now require an exact immutable content key and reject unpinned, unavailable, or stored-state-mismatched campaigns; remaining routes, DTOs, rules and stored documents are not comprehensively versioned. |
| Preview environment | blocked P0 | Preview D1 is a placeholder and has no deploy/migrate/smoke proof. |
| Auth retention/session operations/invite abuse controls | partial P0 | Migration `0008` is deployed with bounded cleanup, invitation limits/audit and a durable background delivery outbox; idle/device/revoke/opt-out/monitoring work remains. |
| Observability, diagnostics, SLOs and release manifest | open P0 | No journal/schedule/effect/socket operational dashboard or alerts. |
| Backup/restore/rollback rehearsal | open P0 | No recorded RPO/RTO or coordinated D1/DO recovery proof. |
| Browser E2E/accessibility/performance/security suites | partial P0 | Twenty local Playwright journeys and CI evidence retention exist; no production-like multi-user scenario, Axe/manual accessibility, performance or load proof. |
| Privacy/terms/support/security/data-rights/asset licensing | blocked P0 | Owner/legal decisions and per-asset evidence absent. |
| Unresolved Req/travel/slots/cargo/ship rules | decision blockers | See `RULE_DECISIONS_REQUIRED.md`; unavailable values must remain blocked. |
| Game Master/map publication completion | partial P1 / release-sensitive | Global-grant-scoped live controls, exact `game-master-recovery@1` exceptional correction, five deterministic `@2` presets, complete biome/feature mechanics, immutable publication, exact-pinned recruiting custom-campaign bootstrap, and the bounded `game-master-skirmish@1` terminal/reward policy are audited locally. Standalone-custom strategic placement/recovery, grant administration/MFA, rate/alert policy, early-rejection auditing, cross-store diagnostics, and recorded production evidence remain blocked. |

## Current local command evidence

| Command | Environment | Outcome | Notes |
|---|---|---:|---|
| `npm run seed:check` | macOS local, Node project toolchain | PASS | 49 definitions; 43 active; 225 SQL definitions; 13 canonical and 16 Phase-2 allied classes; 7 enemy roles; 4 operations; 9 equipment effects; 6 deployment methods; 8 source hashes. |
| `npm run typecheck` | local | PASS | TypeScript 6.0.3. |
| `npm run lint` | local | PASS | ESLint 10.8.1. |
| `npm test` | local | PASS | Vitest 4.1.10; 107 files / 855 tests. |
| `npm run build` | local development config | PASS | Worker 2,053.02 kB; client JS 1,920.16 kB; CSS 218.38 kB. The explicit manifest bundles 29 active tactical sheets (7.77 MiB); only the QA-passed light-v3, medium-v4 and heavy-v3 mech revisions enter the client. The post-build hash verifier confirms inactive revisions and chroma sources are absent. Wrangler emitted only its known sandboxed debug-log warning. Bundle/performance budgets remain open under CP-802. |
| `WRANGLER_WRITE_LOGS=false npm run build:production` | local production config | PASS | Compile/bundle only; no deployment. |
| Empty D1 migrations | isolated Wrangler persist directory | PASS | Migrations 0001–0022 applied; all ten seeds replay twice across 130 application tables with integrity/FK clean. |
| Ten seeds, twice | same isolated D1 | PASS | Core, Phase 2, companion classes, equipment, Store, onboarding, production-safe strategic world and three development fixtures replayed twice. |
| SQLite integrity | isolated D1 database | PASS | `integrity_check=ok`; `foreign_key_check` empty. |
| `npm run ci:verify:d1` | isolated local D1 | PASS | Twenty-two migrations; ten seeds twice; stable table fingerprints/counts; 130 checked application tables. |
| `npm run test:browser` | local Chromium + Cloudflare/Vite dev server | PASS | 20/20 journeys pass: public auth, Battalion/ship/force persistence, exact Game Master map publication/bootstrap, strategic deployment, persisted scenario V3/311-hex tactical play, four-round outcome/replay, forged-action rejection, keyboard traversal/selection, and 390px overflow. |
| `git diff --check` | local Phase-1 tree | PASS | No whitespace errors at final gate. |
| `npm audit --audit-level=high` | npm advisory service | PASS | Zero known vulnerabilities at assessment time; the result is time-sensitive. |

The isolated manual replay contained development fixtures only because Phase 0 was validating every seed's repeat safety. Production must never apply `development-forces.sql`, `development-strategic-world.sql`, or `development-spearhead.sql`.

## CI readiness

| Gate | Local implementation | Remote proof | Release status |
|---|---:|---:|---:|
| Clean dependency install | Workflow uses `npm ci` | Not run on GitHub | pending |
| Seed source validation | Included | Not run on GitHub | pending |
| Empty-D1 migrations | Included via `ci:verify:d1` | Not run on GitHub | pending |
| Repeat seed fingerprint/integrity/FK | Included | Not run on GitHub | pending |
| Prior-release/prod-like upgrade replay | Missing | Missing | blocker |
| Typecheck/lint/unit tests | Included | Not run on GitHub | pending |
| Coverage thresholds | Missing | Missing | blocker before RC |
| Production build | Included | Not run on GitHub | pending |
| Browser smoke/E2E | 20-test Playwright baseline included | Not run on GitHub | partial; production-like multi-account matrix remains a blocker |
| Dependency audit | Included; local audit found zero vulnerabilities | Not run on GitHub | pending |
| Static code/secret scan | Missing | Missing | blocker |
| Production bundle retention | Included for 14 days with action-provided digest | Not run on GitHub | pending |
| Authoritative release manifest | Missing | Missing | blocker |
| Branch protection/required check | External configuration unknown | Missing evidence | blocker |

The workflow is a Phase-0 baseline, not a complete release pipeline. Official actions are pinned and job permissions are read-only; branch protection still requires repository-owner configuration.

## Database and content manifest

### Migrations

| Version | File | Purpose | Replay |
|---:|---|---|---:|
| 0001 | `0001_platform_and_rules.sql` | Identity shell and core rules catalogue | pass |
| 0002 | `0002_persistent_world.sql` | Forces, Battalions, ships, campaigns and tactical archive schema | pass |
| 0003 | `0003_phase2_persistent_forces.sql` | Profiles, loadouts, cargo, supply, service and capabilities | pass |
| 0004 | `0004_phase3_strategic_layer.sql` | Organisations, locations, maps, formations, strategic journal | pass |
| 0005 | `0005_equipment_deployment_vertical_slice.sql` | Equipment effects, refits, deployment plans and campaign snapshots | pass |
| 0006 | `0006_production_identity.sql` | Email challenges, throttling and auth audit | pass |
| 0007 | `0007_guided_onboarding_and_battalions.sql` | Onboarding policies/progress/receipts and recruitment/invites | pass |
| 0008 | `0008_auth_retention_and_invitation_abuse.sql` | Auth/invitation retention, abuse audit/rate state and durable invitation delivery | deployed; local replay pass |
| 0009 | `0009_campaign_join_receipts.sql` | Campaign-owned join receipts and deployable starter-Battlegroup backfill | deployed; local replay pass |
| 0010 | `0010_campaign_results.sql` | Durable tactical results for directory, reports and strategic projection | deployed; local replay pass |
| 0011 | `0011_battlegroup_management.sql` | Battlegroup mutations and idempotent receipts | deployed; local replay pass |
| 0012 | `0012_active_battalion_switching.sql` | Persistent active-Battalion switching receipts | deployed; local replay pass |
| 0013 | `0013_battalion_departures.sql` | Battalion departure and removal receipts | deployed; local replay pass |
| 0014 | `0014_battalion_rank_administration.sql` | Rank administration mutations and receipts | deployed; local replay pass |
| 0015 | `0015_battalion_command_transfer.sql` | Battalion command-transfer mutations and receipts | deployed; local replay pass |
| 0016 | `0016_ship_identity_mutations.sql` | Primary-ship identity mutations and receipts | deployed; local replay pass |
| 0017 | `0017_public_v1_economy.sql` | Approved application economy policy and ledger support | deployed; local replay pass |
| 0018 | `0018_campaign_scenario_content_pins.sql` | Nullable exact authored-scenario content pin; no legacy backfill or automatic upgrade | deployed; local replay pass |
| 0019 | `0019_game_master_authority.sql` | Explicit global grants, campaign command receipts, and private audit; no default production grant | deployed; local replay pass |
| 0020 | `0020_game_master_maps.sql` | Versioned map drafts/revisions/publication, authoring receipts/audit, and exact published custom-campaign pins | deployed; local replay pass |
| 0021 | `0021_game_master_campaign_runtime.sql` | Immutable custom-scenario bootstrap bound to one exact published map revision and hash | deployed; local replay pass |
| 0022 | `0022_game_master_skirmish_policy.sql` | Legacy custom `@1` preservation plus exact version-2 `game-master-skirmish@1`, round-12, and `public-v1-economy@1` pins | deployed; local replay pass |

### Production-approved seed families

- `v5-core-curated.sql` — requires conflict-register/catalogue reconciliation before release candidate.
- `v5-phase2-combined-arms.sql` — broad catalogue; many overlays are non-executable or incorrectly overstated.
- `v5-equipment-deployment.sql` — narrow effect/deployment subset; slot/Optics/Drone decisions remain blockers.
- `onboarding-foundation.sql` — application onboarding policies and NPC Battalions; not canonical V5 balance/lore.

### Development-only seeds

- `development-forces.sql`
- `development-strategic-world.sql`
- `development-spearhead.sql`

Production-like preview needs a separate curated scenario/world content pack. Copying development fixtures into production does not satisfy that requirement.

## Environment readiness

| Environment | D1 | Demo auth | Clock | Route | Status |
|---|---|---:|---:|---|---:|
| local development | placeholder/local binding | explicitly allowed | accelerated/manual | localhost | useful development only |
| preview | placeholder `...0002` | disabled | preview cadence | not provisioned/evidenced | **blocked** |
| production | provisioned D1 ID in `wrangler.jsonc` | disabled | 24 h | `corinthplight.qnetica.com.au` | currently deployed foundation; not approved as complete game |

No external state was changed during this Phase-0 assessment.

## Security and privacy checklist

| Control | Status | Evidence / required work |
|---|---:|---|
| Exact same-origin API/unsafe-method/WS policy | foundation pass | Worker enforcement and tests exist. |
| Secure opaque sessions and one-time email challenges | foundation pass | SHA/HMAC, secure cookies, revoke/consume flows exist. |
| Campaign ownership/membership authorization | foundation pass/partial | Route-level authorization exists; full IDOR matrix still required. |
| Per-route body bounds/manual validation | partial | Tactical order/clock/bodyless mutations and v1 campaign state/snapshots now validate; shared coverage for every route/document remains absent. |
| CSRF/origin browser matrix | partial | Exact-origin checks exist; complete mutation matrix/browser evidence absent. |
| Content Security Policy/HSTS evidence | missing | Add CSP rollout and verify edge HSTS/TLS. |
| WebSocket audience isolation | partial/pass locally | Per-viewer invalidations omit gameplay identifiers and enemy catch-up excludes Allied order events; hibernation/browser evidence remains open. |
| Event/report fog | fail | Current visibility is used instead of event-time knowledge. |
| Admin least privilege/MFA/audit/retry controls | local partial | Explicit global grants, trusted-header stripping, revisioned actor-scoped receipts and private campaign/map audits exist. Grant management, MFA, rate/alert policy, cross-store reconciliation and production evidence remain missing. |
| Auth/invite abuse controls and cleanup | local partial | Migration `0008` adds bounded terminal-record cleanup, four-scope invitation limits, pseudonymized audit and retryable delivery; production migration/monitoring, opt-out and complete session operations remain. |
| Secrets scan/dependency/code scan | missing release evidence | Add CI scanners and triage policy. |
| Data export/delete/anonymisation | missing | Depends on DEC-016. |
| Privacy/terms/support/security route | missing | Depends on DEC-016. |
| Asset provenance/licensing | partial evidence | The 135 active generated portrait/equipment visuals plus one retained alternate have stable keys, hashes, source renders, processing history and fallbacks in `src/assets/gameplay-visuals.manifest.json`. A separate manifest records exact hashes and dispositions for every active/alternate/quarantined mech revision; the three active mechs pass strict nadir QA and inactive revisions are excluded from the client. The other 26 active tactical sheets remain provisional and still need equivalent lineage/QA. Public terms/ownership approval and the remaining legacy assets remain release gates. |

## Reliability and operations checklist

| Control | Status | Required evidence |
|---|---:|---|
| Tactical deterministic pure resolver | partial pass | Golden/permutation tests exist for narrow mechanics; hashes/journal not release grade. |
| Tactical PREPARED→effects→ACK→COMMITTED | partial | The effect→ACK→next-round gate and retry path are implemented for supported effects; PREPARED/crypto/full crash-boundary evidence remains CP-402. |
| Strategic pure resolver | foundation pass | No runtime caller/journal/alarm; public execution blocked. |
| Strategic PREPARED→effects→ACK→COMMITTED | missing | CP-302. |
| Durable schedule lifecycle/recovery | missing | CP-109. |
| Duplicate command/effect protection | partial | Tactical order/clock and Game Master campaign/map commands use actor-scoped SHA-256 receipts and revision CAS. D1/DO Game Master audit projection is retryable but not atomic; the resolution journal and several other mutations remain incomplete. |
| D1 migration/seed repeat safety | empty-DB pass | Add previous-release/prod-like snapshot replay. |
| D1/DO reconciliation | missing | Operator-safe diagnostics/retry and immutable audit. |
| Backup/restore/rollback | missing | Recorded preview rehearsal with approved RPO/RTO. |
| Liveness/readiness/release metadata | liveness only | Add dependency and backlog readiness plus immutable manifest. |
| Alerts/SLOs/capacity | missing | Forced-fault and preview-soak evidence. |

## Gameplay readiness checklist

| Public-v1 loop | Status | Blocking IDs |
|---|---:|---|
| Register, verify, sign in, sign out | foundation implemented | CP-102/CP-103 operational completion |
| Guided join/create Battalion and deployable starter unit | foundation implemented | CP-104/CP-206 for mature operation |
| Obtain/purchase approved mixed force | blocked/partial | CP-200–CP-203; DEC-001–DEC-004 |
| Equip/refit/readiness/history/icons | partial | CP-204/CP-205/DEC-017/DEC-018 |
| Battalion/Battlegroup organise/delegate | partial/read-only | CP-206/CP-207 |
| Own/configure/embark ship | partial/playable local | An authorized Battalion member can edit an existing primary ship's name/registry with revision, receipt and history guarantees; acquisition/modules remain CP-300/DEC-010 and embark breadth remains CP-301. |
| Submit/resolve strategic travel and operation deployment | local partial | Movement, Embark/Disembark, support and `DEPLOY_TO_CAMPAIGN` resolve through the map coordinator; production world publication and full crash-safe journal remain CP-302–CP-304/DEC-005. |
| Choose operation and create scenario campaign | partial | K-17 and local Iron Rain are authored and deployable through the live campaign/planner surfaces; strategic order-to-deployment automation and a production content pack remain CP-601/DEC-020. |
| Administer campaigns and author maps | local partial | An explicitly granted Game Master can inspect live campaigns, adjust clocks, pause/resume/resolve, change objectives, spawn governed enemies, apply the server-authored `game-master-recovery@1` correction to a legal destroyed deployment while paused from planning, edit/save/reopen/export/publish deterministic maps, and create an exact-pinned recruiting campaign that uses normal join/deployment/DO initialization. New custom `@2` content uses the bounded skirmish closure and published Req policy. Recovery remains an exceptional non-V5 admin correction; standalone-custom strategic placement/recovery remains open (CP-405/CP-400/CP-603). |
| Submit/edit/cancel/schedule tactical orders | partial | Current-round generated orders support submit, edit and two-step cancel through actor-scoped hashed receipts and optimistic campaign/order revisions. Cancellation emits an Allied event and supports replacement before lock. Future scheduling remains intentionally unavailable pending reliable semantics. |
| Resolve deterministic PvE combined arms | narrow partial | CP-500–CP-507 |
| Persist effects before next round | narrow pass | Supported tactical effects hold `EFFECTS_PENDING` and acknowledge before one next round; broaden under CP-402. |
| Audience-safe reconnect/report/replay | partial/fail | Projected submitted Allied orders drive readiness and an ownership-aware visual intent layer while drafts remain owner-only. Outlined directional corridors, action targets, labelled reticle markers, numbered operation notes and combined-force owner colours consume only existing projected fields. Shared tactical markers remain side-filtered and known-hex restricted. Report detail consumes the audience-projected locked battlefield snapshot and archived events to provide interactive map reconstruction plus a synchronized accessible ledger. Event payload visibility is conservatively based on the locked snapshot; the deterministic multiplayer screenshot is presentation evidence only. Per-event knowledge evolution, declassification/export and real multi-account evidence remain CP-403/CP-700–CP-701. |
| Apply tactical result to living war | partial/playable local | Authored victories atomically change strategic nodes/routes/follow-on operations, and the terminal report names the acknowledged effects before returning to Galactic Operations. General result ingestion and production content remain CP-600–CP-603. |
| Withdraw/re-embark/redeploy | partial/playable local | Survivors return to reserve with exact state, their Battlegroup enters recovery, and the live strategic UI can re-embark it. Repair/resupply and production evidence remain CP-603. |

## Accessibility and browser matrix

| View/workflow | Desktop | Tablet | 390px mobile | Keyboard | Screen reader | Automated axe |
|---|---:|---:|---:|---:|---:|---:|
| Landing/auth | Playwright smoke | unknown | Playwright overflow canary | partial | unverified | missing |
| Guided onboarding | manual foundation only | unknown | manual foundation only | unverified | unverified | missing |
| Forces/loadout | live browser journeys: owner edits persistent identity/history; unit purchase opens quartermaster; the authoritative combat preview exposes executable actions and rejects a Lightweight Anti-armour fit because Infantry `PRIMARY` slots remain explicitly `CATALOGUED` under RC-UNIT-001 | responsive dialog rules present | Chromium pass with fail-closed unresolved-slot evidence | unverified | unverified | slot activation decision and broader matrix pending |
| Battalion/ship/strategic reads | prior visual inspection only | unknown | prior visual inspection only | partial | unverified | missing |
| Tactical map/order | Playwright live-read/forged-field canary | unknown | Playwright overflow canary | **core route/target unavailable** | **no equivalent workflow** | missing |
| Reports/replay | local interactive reconstruction proven in the four-round browser journey | unknown | responsive map/ledger controls; mobile overflow passes | semantic round/detail/playback controls and synchronized formation ledger | screen-reader audit missing | partial |

Release target is WCAG 2.2 AA. The tactical map requires a semantic grid/list that can inspect/select units/hexes, compose a route, choose a target and review fog-safe information without the canvas.

## Required production-like acceptance run

All 14 steps in `GAME_COMPLETION_GOAL.md` remain unproven as one preview run. Evidence must include:

- release manifest and preview resource IDs;
- throwaway account IDs (redacted in public artifacts), test roles and timestamps;
- browser traces/screenshots at supported viewports;
- D1/DO journal/effect/schedule identifiers and hashes;
- audience comparisons for state/socket/report redaction;
- ledger, loadout, cargo, unit-history and memorial queries;
- strategic route/round/effect records across two planets;
- forced retry/failure/reconnect results;
- accessibility/security/performance reports;
- backup/restore/rollback and multi-day soak records.

## Next release checkpoint

1. Commit and run the application CI workflow on GitHub; make it required.
2. Finish CP-001–CP-003 and CP-005 evidence; CP-004 documentation reconciliation is locally complete.
3. Close the P0 split-catalogue/conflict/slot/no-op defects before activating more content.
4. Provision preview only with explicit Cloudflare authorization.
5. Deliver the Phase-1 preview identity/operations gate before inviting additional users.

This checklist still forbids describing the build as a public release. For the separately authorized private game-test operation, the permitted external sequence is authenticated remote inventory, guarded dry-run, exact pending-migration review, production-safe seed review, migrate/seed/deploy, and read-only smoke evidence. The owner has waived preview and a pre-deployment backup only for that operation; all other release controls remain open.

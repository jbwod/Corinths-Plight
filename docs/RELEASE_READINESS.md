# Corinth's Plight — Release Readiness

**Assessment date:** 2026-08-10 (Australia/Sydney)

**Assessed commit:** `3d7e091` plus the local Phase-1 checkpoint changes

**Target:** Honest public release

**Decision:** **NO-GO**

This is the live release checklist. A checked local build item is not permission to deploy and is not evidence of a complete player workflow. Production migrations, seed changes, deployment, external email/messages, push, and irreversible data operations require explicit authorization for the specific release operation.

## Current release blockers

| Blocker | Status | Evidence / exit condition |
|---|---:|---|
| Split D1/compiled/adaptor rules truth | partial P0 | CP-200's generated `@2` catalogue now materializes playable starter/Force/unit/weapon/action/order data through tactical resolution; CP-201 preserves D1 profile/status/link data and fails closed before unsupported classes execute. D1 still carries legacy `@1` relational/FK identity and lacks immutable `@2` publication. |
| Conflict provenance mismatch | open P0 | D1 has 12 obsolete conflict IDs instead of the 72-record canonical register. |
| No production world/campaign content | open P0 | Production seeds create zero campaigns, insertion zones, strategic maps/nodes and ships. |
| Demo/showcase/hard-coded production client paths | open P0 | App, Forces, Deployment and Strategic surfaces use fixed IDs or local fallback data. |
| Strategic order and resolution `501` | open P0 when advertised | `POST /api/strategic/orders`; Strategic Map DO `/resolve`. |
| Tactical next-round/effect acknowledgement ordering | open P0 | Next PLANNING state is committed before D1 effect ACK. |
| WebSocket/report fog | partial P0 security | Socket invalidations are viewer-specific, identifier-free and provide bounded projected catch-up; reports still use current-time rather than event-time visibility. |
| Runtime schema/fail-closed authoritative JSON | partial P0 | Campaign order/clock intents and v1 current/snapshot state now validate and fail closed; remaining routes, DTOs, rules/scenarios and stored documents are not comprehensively versioned. |
| Preview environment | blocked P0 | Preview D1 is a placeholder and has no deploy/migrate/smoke proof. |
| Auth retention/session operations/invite abuse controls | partial P0 | Local migration `0008` adds bounded cleanup, invitation limits/audit and a durable background delivery outbox; it is not deployed, and idle/device/revoke/opt-out/monitoring work remains. |
| Observability, diagnostics, SLOs and release manifest | open P0 | No journal/schedule/effect/socket operational dashboard or alerts. |
| Backup/restore/rollback rehearsal | open P0 | No recorded RPO/RTO or coordinated D1/DO recovery proof. |
| Browser E2E/accessibility/performance/security suites | partial P0 | Four local Playwright canaries and CI evidence retention exist; no production-like multi-user scenario, Axe/manual accessibility, performance or load proof. |
| Privacy/terms/support/security/data-rights/asset licensing | blocked P0 | Owner/legal decisions and per-asset evidence absent. |
| Unresolved Req/travel/slots/cargo/ship rules | decision blockers | See `RULE_DECISIONS_REQUIRED.md`; unavailable values must remain blocked. |

## Current local command evidence

| Command | Environment | Outcome | Notes |
|---|---|---:|---|
| `npm run seed:check` | macOS local, Node project toolchain | PASS | 42 definitions; 37 active; 100 SQL definitions; 16 allied classes; 7 enemy roles; 4 operations; 9 equipment effects; 6 deployment methods; 8 source hashes. |
| `npm run typecheck` | local | PASS | TypeScript 6.0.3. |
| `npm run lint` | local | PASS | ESLint 10.8.1. |
| `npm test` | local | PASS | Vitest 4.1.10; 59 files / 474 tests. |
| `npm run build` | local development config | PASS | Worker 1,254.61 kB; client JS 777.40 kB; CSS 136.50 kB; Wrangler emitted only its known sandboxed debug-log warning. |
| `WRANGLER_WRITE_LOGS=false npm run build:production` | local production config | PASS | Compile/bundle only; no deployment. |
| Empty D1 migrations | isolated Wrangler persist directory | PASS | Migrations 0001–0010 applied. |
| Seven seeds, twice | same isolated D1 | PASS | Core, Phase 2, equipment, onboarding and three development fixtures replayed twice. |
| SQLite integrity | isolated D1 database | PASS | `integrity_check=ok`; `foreign_key_check` empty. |
| `npm run ci:verify:d1` | isolated local D1 | PASS | Ten migrations; seven seeds twice; stable table fingerprints/counts; 117 checked application tables. |
| `CI=1 npm run test:browser` | local Chromium + Cloudflare/Vite dev server | PASS | 8/8 canaries pass, including live four-round K-17 support/combat/victory resolution, the Heavy Air Transport manifested-drop composer, generated Logi/Artillery cargo controls, the Logi's live `5 Small Supply = 1/2 cargo slots` readout, and 390px overflow coverage. |
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
| Browser smoke/E2E | Four-test Playwright baseline included | Not run on GitHub | partial; full game-loop matrix remains a blocker |
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
| 0008 | `0008_auth_retention_and_invitation_abuse.sql` | Auth/invitation retention, abuse audit/rate state and durable invitation delivery | local pass; not deployed |
| 0009 | `0009_campaign_join_receipts.sql` | Campaign-owned join receipts and deployable starter-Battlegroup backfill | local pass; not deployed |

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
| Admin least privilege/MFA/audit/retry controls | missing | Backend admin check alone is insufficient. |
| Auth/invite abuse controls and cleanup | local partial | Migration `0008` adds bounded terminal-record cleanup, four-scope invitation limits, pseudonymized audit and retryable delivery; production migration/monitoring, opt-out and complete session operations remain. |
| Secrets scan/dependency/code scan | missing release evidence | Add CI scanners and triage policy. |
| Data export/delete/anonymisation | missing | Depends on DEC-016. |
| Privacy/terms/support/security route | missing | Depends on DEC-016. |
| Asset provenance/licensing | missing evidence | 699+ legacy/current files need per-file manifest or quarantine. |

## Reliability and operations checklist

| Control | Status | Required evidence |
|---|---:|---|
| Tactical deterministic pure resolver | partial pass | Golden/permutation tests exist for narrow mechanics; hashes/journal not release grade. |
| Tactical PREPARED→effects→ACK→COMMITTED | partial | The effect→ACK→next-round gate and retry path are implemented for supported effects; PREPARED/crypto/full crash-boundary evidence remains CP-402. |
| Strategic pure resolver | foundation pass | No runtime caller/journal/alarm; public execution blocked. |
| Strategic PREPARED→effects→ACK→COMMITTED | missing | CP-302. |
| Durable schedule lifecycle/recovery | missing | CP-109. |
| Duplicate command/effect protection | partial | Tactical order/clock now use actor-scoped SHA-256 receipts and revision CAS; cancel/pause/resume/resolve, the resolution journal and several other mutations remain incomplete. |
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
| Own/configure/embark ship | read-only/blocked | CP-300/CP-301/DEC-010 |
| Submit/resolve strategic travel to another planet | blocked/501 | CP-302–CP-304/DEC-005 |
| Choose operation and create scenario campaign | partial | K-17 and local Iron Rain are authored and deployable through the live campaign/planner surfaces; strategic order-to-deployment automation and a production content pack remain CP-601/DEC-020. |
| Submit/edit/cancel/schedule tactical orders | partial | Current-round generated order/action composer and cancel path exist; future scheduling remains intentionally unavailable pending its reliable semantics. |
| Resolve deterministic PvE combined arms | narrow partial | CP-500–CP-507 |
| Persist effects before next round | narrow pass | Supported tactical effects hold `EFFECTS_PENDING` and acknowledge before one next round; broaden under CP-402. |
| Audience-safe reconnect/report/replay | partial/fail | A local report-detail UI consumes projected round events, but event-time redaction, reconnect catch-up, index/playback/export and browser evidence remain CP-403/CP-700. |
| Apply tactical result to living war | missing | CP-600–CP-603 |
| Withdraw/re-embark/redeploy | missing | CP-603 |

## Accessibility and browser matrix

| View/workflow | Desktop | Tablet | 390px mobile | Keyboard | Screen reader | Automated axe |
|---|---:|---:|---:|---:|---:|---:|
| Landing/auth | Playwright smoke | unknown | Playwright overflow canary | partial | unverified | missing |
| Guided onboarding | manual foundation only | unknown | manual foundation only | unverified | unverified | missing |
| Forces/loadout | prior visual inspection only | unknown | prior visual inspection only | unverified | unverified | missing |
| Battalion/ship/strategic reads | prior visual inspection only | unknown | prior visual inspection only | partial | unverified | missing |
| Tactical map/order | Playwright live-read/forged-field canary | unknown | Playwright overflow canary | **core route/target unavailable** | **no equivalent workflow** | missing |
| Reports/replay | local component; browser proof pending | unknown | responsive CSS; browser proof pending | semantic round/detail controls | screen-reader audit missing | missing |

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

Production deployment is not the next safe action. The next safe external action is a reviewed Phase-0 commit/push followed by a CI run; push still requires explicit authorization under the completion goal.

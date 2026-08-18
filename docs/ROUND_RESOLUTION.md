# Corinth's Plight Round Resolution

**Status:** Reconciled implemented foundation and target retry protocol (2026-08-10)

**Implemented subset:** deterministic Hold, Advance, Rush, Attack, Load/Unload, Reload and constrained airdrop; strict current-round order/clock command envelopes; SHA-256 command receipts with optimistic concurrency; versioned DO state/snapshots; clock/alarm coordination; DO-local result deduplication; idempotent D1 effect receipts; and an `EFFECTS_PENDING` retry gate before the next planning round

**Not yet implemented:** PREPARED/input-hash journal, server-secret seed commitment, cryptographic output/effect payload hashes and collision handling, durable attempt diagnostics, separate persisted schedule records, and complete effect-type coverage

## 1. Guarantees: current versus target

| Property | Current foundation | Production target |
|---|---|---|
| Pure deterministic computation | Fixed `RoundInput` uses seeded RNG and ordered processing; regression tests cover the implemented subset | Version/hash-pinned engine and byte/canonical replay evidence |
| One DO result per round | `resolution/{round}` prevents a second committed result | PREPARED input hash, cryptographic output hash, attempts/statuses, mismatch incident handling |
| Order/clock command retry | Actor-scoped command receipt, canonical SHA-256 request hash, campaign/order revision compare-and-swap, and replay of the original response | Extend the same versioned command protocol to cancel, pause, resume, resolve and every later tactical mutation; retain immutable order revisions |
| Permanent consequences exactly once | Resolver emits effects; the DO applies supported unit/resource effects in D1 with an idempotency receipt, removes acknowledged pending records and retries failed batches by alarm | Add payload-hash collision detection, full status/attempt journal and operator reconciliation |
| Next round waits for effects | Yes for the supported tactical effects: result commit enters `EFFECTS_PENDING`; only a fully acknowledged set creates the next `ROUND_STARTED` | Extend the gate to every future effect type and forced crash boundary |
| Scheduling survives eviction | Clock and pending items are inside `state/current`; next DO alarm is derived from them | Separate status-bearing `schedule/{id}` records and consumed/recovery history |
| Reports/fog | Current state and report events use the projector; seed is removed | Event-time field-level projections and per-audience socket/report/replay DTOs |

The current code establishes a deterministic engine skeleton, DO-local duplicate guard, receipt-idempotent D1 application, and the critical next-round acknowledgement gate for the narrow effect set. It does not yet prove the full cryptographically bound exactly-once protocol across every crash boundary.

## 2. Current pure contract

The landed types in `packages/domain/src/index.ts` are:

```ts
interface RoundInput {
  previousState: CampaignRuntimeState;
  rulesetVersion: string;
  playerOrders: UnitOrder[];
  enemyOrders: UnitOrder[];
  seed: string;
  resolutionTime: number;
}

interface RoundOutput {
  state: CampaignRuntimeState;
  events: CampaignEvent[];
  persistentEffects: PendingPersistentEffect[];
  digest: string;
}
```

`resolveRound` has no storage/network calls, wall-clock read, or `Math.random()`. The caller supplies logical time and seed. It clones prior state and returns new state/events/effects. `digest` is currently an eight-character hexadecimal 32-bit FNV-style digest over selected result fields; it is useful for foundation regression comparison, not a collision-resistant audit hash.

The runtime catalogue and D1 seed both identify `v5-core-curated@1`; `ENGINE_VERSION` is `foundation-0.1.0`. The resolver verifies the ruleset version string, but the current round input does not carry a ruleset content hash or engine artifact hash.

## 3. Current order protocol

### 3.1 Submission

The public request is parsed as a strict, unknown-field-rejecting intent envelope. It supplies `commandId`, `expectedCampaignVersion`, `expectedOrderRevision`, current-round unit/order/facing/route intent, and narrowly typed action fields. It cannot supply action economy, speed cost or audited ammunition use. The DO constructs the authoritative `UnitOrder`:

- stable ID `order:{campaignId}:{round}:{deploymentId}`;
- server-incremented revision;
- owner, current start position, end position, submitted time, fitted equipment/weapons, and rules-derived action cost;
- `DRAFT` or `SUBMITTED` lifecycle;
- the current round only.

Before accepting a submitted order, the Worker/DO path checks owner, deployed/not-destroyed state, class `allowedOrders`/`allowedActions`, executable catalogue flags, fitted weapon/equipment IDs, current projected target visibility, authoritative targeting/range/LOS/ammo/cooldown/spotter rules, action economy/speed, and the one-attack limit. The pure resolver rechecks ruleset, executable order/action definitions, start/route/end, speed/action budget, Rush restrictions, attack count, target/weapon, range/LOS, friendly fire, ammo, and cooldown.

Only `HOLD`, `ADVANCE`, and `RUSH` order types are executable. The narrow executable action set is described in `GAME_SYSTEMS.md`; other names remain catalogued and fail closed. There is currently no executable Incidental action, and the Incidental ledger rejects Standard/Primary actions rather than silently accepting them.

For order upsert, cancellation and clock writes, the DO canonicalises the validated intent with Unicode code-point key ordering, hashes it with SHA-256, and stores the actor-scoped receipt in the same DO transaction as the new state and event where applicable. An exact retry returns the original status/body. Reusing a command ID with different intent returns `409`; a stale campaign or order revision also returns `409`. Cancellation increments the order revision and emits an Allied event. A replacement current-round order then replaces the cancelled aggregate at its deterministic ID, preventing a duplicate order from corrupting stored state.

Current limitations:

- replacing an order overwrites the current in-state revision instead of retaining every immutable revision in the DO;
- D1 `order_archive` is not populated;
- current command authority is owner-only; delegated command is not wired;
- pause, resume and manual resolve do not yet use the command-receipt/CAS protocol;
- the runtime accepts current-round orders only; future-round scheduling is deliberately disabled until it can validate against projected positions and preserve revisions safely.

### 3.2 Lifecycle

```text
DRAFT -> SUBMITTED -> LOCKED -> RESOLVING -> RESOLVED | FAILED
   \-----------> CANCELLED       (before lock only)
```

The DO locks current submitted orders at the lock alarm/manual resolve. The resolver marks only the exact accepted `(order.id, order.revision)` resolved. The completed current-round aggregate is removed after resolution.

The landed order/clock command protocol supplies idempotency, compare-and-swap and exact semantic replay. The remaining target work is immutable revision/archive retention and applying the same contract to every tactical mutation.

### 3.3 Request and stored-state boundaries

Order and clock JSON are parsed before authority-dependent game mutation. Unknown fields, malformed coordinates/identifiers/facing, oversized routes/action lists/text, client-authored economy/cost/ammunition, and action-inappropriate target/payload fields fail closed. Cancel, pause, resume and resolve require an empty body; manual resolve also requires a positive `x-expected-round`, so replaying a lost response cannot accidentally resolve the next round.

`state/current` and `snapshot/{round}` now use a versioned `{ schemaVersion: 1, state }` envelope. Reads validate campaign identity, clock/deadline/schedule coherence, map edges, deployments/weapons, order/action IDs and routes, events, resolution keys, objectives and pending-effect types. A valid legacy raw state is wrapped on read. New writes are validated before persistence. This is a compatibility and corruption boundary, not yet a general schema-migration registry or proof against every semantically impossible nested state.

## 4. Implemented resolver pipeline

`packages/rules-engine/src/resolver.ts` currently performs this deterministic subset:

1. **Bind input:** reject a ruleset-version mismatch; short-circuit an already-resolved exact supplied order set.
2. **Order and validate:** combine player/enemy orders, select submitted/locked orders, sort by unit ID then revision, and emit deterministic rejections.
3. **Tick prior cooldowns:** decrement cooldowns before combat so a cooldown assigned by this round's attack persists into the next round.
4. **Resolve movement/facing:** apply requested facing even for Hold; group simultaneous final destinations; if arrivals plus occupants exceed capacity, consistently block every arrival in that contest; ignore destroyed/withdrawn occupants.
5. **Build attacks:** use the post-movement state, seeded dice, current ammo/cooldown, LOS/range, rear-facing armour, defence, and friendly-fire checks. Indirect fire requires a non-destroyed/non-withdrawn friendly spotter with LOS.
6. **Apply simultaneous casualties:** accumulate legal attack damage by target before changing health, then apply targets in stable ID order. An attacker is not removed merely because another attack in the same group destroys it.
7. **Emit permanent intents:** create stable per-round damage/death `PendingPersistentEffect` values for linked persistent units.
8. **Finalise output:** mark exact accepted revisions resolved, append `ROUND_FINISHED`, retain the most recent 1,000 events in current state, increment state version, and calculate the foundation digest.

Event sequence begins after the highest event sequence already present for that round, preventing resolver output from overwriting prior lock/order events.

This is not the full 17-phase game pipeline. Interception/contact, advanced actions, structures, logistics beyond attack ammo, status systems, objectives/victory, advanced PvE, Meta rules, and strategic consequences remain explicit future phases. `docs/GAME_SYSTEMS.md` and `docs/RULE_CONFLICTS.md` define the active profile and unresolved interpretations.

## 5. Implemented clock and alarm flow

Clock presets in `worker/campaign-clock.ts` are:

| Preset | Duration |
|---|---:|
| `manual` | `0` (no deadline or alarm) |
| `1m` | 60 seconds |
| `5m` | 5 minutes |
| `30m` | 30 minutes |
| `24h` | 24 hours |

A timed clock embeds `ORDER_LOCK` and `ROUND_RESOLVE` items in `state/current.clock.schedule`. The DO sets its one alarm to the earliest `runAt`. `ORDER_LOCK` is removed when consumed; after resolution the entire clock is replaced with the next round's schedule. There are no `schedule/{id}` storage records or consumed schedule history yet.

Clock replacement uses the same actor-scoped command ID, SHA-256 request hash and expected campaign-version transaction as orders. Exact retries replay the original clock response and re-arm the derived alarm if necessary. Custom timed durations are bounded from five seconds through 24 hours; manual mode is exactly zero.

Manual duration `0` has `lockAt=0`, `resolvesAt=0`, an empty schedule, and accepts current-round orders while phase is `PLANNING`. Manual resolve uses the same lock/resolve functions as an alarm.

Pause/resume is implemented as a real state transition:

- `phaseBeforePause` records the prior phase;
- canonical public `CAMPAIGN_PAUSED`/`CAMPAIGN_RESUMED` events and state version changes are committed with state;
- the alarm is cleared while paused;
- resume shifts deadlines and scheduled `runAt` values by the paused duration and restores `PLANNING` or `LOCKED`, rather than reopening a locked order window;
- repeated pause/resume calls are semantic no-ops.

Alarms may be delivered late or more than once. The current guard is round/phase plus `resolution/{round}` existence. Alarm crash/retry behavior has unit-level clock tests but no workerd integration suite with injected failures.

## 6. Current DO result transaction

For the small K-17 scenario, `resolveCurrentRound` currently:

1. returns an existing `resolution/{round}` when present;
2. enters `RESOLVING`, records a versioned and validated `snapshot/{round}`, selects current locked orders, and generates deterministic enemy orders;
3. derives the predictable seed `${campaignId}:${round}:${rulesetVersion}:foundation-seed-commit`;
4. calls the pure resolver inside the DO storage transaction;
5. creates this landed record:

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
  status?: "EFFECTS_PENDING" | "RESOLVED" | "FAILED";
  effectCount?: number;
  appliedEffectCount?: number;
  resolvedAt?: number;
}
```

6. atomically stores the result state in `EFFECTS_PENDING`, `resolution/{round}`, result events, and `pending-effect/{idempotencyKey}` records without opening the next round;
7. applies each supported effect through its D1 receipt-backed batch, deleting the DO pending key only after confirmation;
8. after all keys acknowledge, atomically marks the resolution `RESOLVED`; a non-terminal result increments exactly one round, creates `ROUND_STARTED`, installs the next clock, and arms its alarm, while a terminal result stays on its completed round with no schedule;
9. on D1 failure, retains the same round and pending keys and arms a short retry alarm; duplicate manual resolution and alarm delivery resume rather than recompute.

This transaction avoids a partial DO result. A repeated call for a completed round returns the stored record and does not rerun effects. However:

- there is no pre-compute `PREPARED` record or canonical input hash;
- there is no attempt count/status machine or cryptographic output hash;
- the seed is predictable and stored in plaintext (although report responses remove it);
- a determinism mismatch cannot be detected against a committed output hash;
- supported pending effects are applied to D1 with `campaign_effect_receipts`, but receipts do not yet bind a cryptographic payload hash or attempt state;
- failure-at-every-instruction-boundary coverage, attempt diagnostics and operator reconciliation are incomplete.

The shipped gate prevents a successful result commit from exposing the next planning round before D1 application completes. A failed batch leaves the campaign visibly in `EFFECTS_PENDING`; the alarm and duplicate resolution path retry stable effect IDs. Full PREPARED/hash/collision semantics and operator-facing reconciliation remain open.

For K-17, the terminal resolver output includes one `CAMPAIGN_RESULT` effect. Migration `0010` applies it transactionally to `campaign_results`, closes the D1 campaign (and a linked strategic operation when present), and writes the existing effect receipt. The campaign directory and after-action report then expose the persisted outcome, per-unit service credit, and the explicitly unpublished Req reward disposition.

## 7. Target resolution journal

The accepted production protocol adds a status-bearing `resolution/{round}` record with at least:

```text
status: PREPARED | RESOLVING | RESULT_COMMITTED |
        EFFECTS_PENDING | EFFECTS_APPLIED | RESOLVED | FAILED
attemptCount
canonicalInputHash (cryptographic)
canonicalOutputHash (cryptographic)
rulesetContentHash
engineArtifactVersionOrHash
seedCommitment + protected seed reference/reveal policy
event range/count
pending/acknowledged effect counts
diagnostic code
```

Target steps:

1. **Prepare transaction:** lock the exact round, persist immutable input/snapshot, hashes/pins, protected seed commitment, and `PREPARED`.
2. **Compute:** call the pure engine from the immutable input. A crash safely recomputes the same output.
3. **Commit result transaction:** verify input hash; atomically store result state/events/output hash and pending effects. A different output hash for the same input pauses/fails closed.
4. **Apply D1 effects:** retry stable effect commands until the D1 journal returns matching acknowledgements.
5. **Finalise:** record all acknowledgements, publish the report, increment/open one next round, persist its schedule, and arm its alarm.

This target must be implemented and crash-tested; describing the design in this document does not supply the guarantee.

## 8. Target D1 persistent-effect protocol

Current resolver effect IDs use stable strings such as:

```text
campaignId:round:destroy:persistentUnitId
campaignId:round:damage:persistentUnitId
```

Current DO records contain an ID, type, optional unit ID, payload, and status. The landed campaign applier records `campaign_effect_receipts`, applies its supported unit/resource/cargo/history consequences transactionally, and gates/finalises the next round only after acknowledgement. It does not yet provide cryptographic payload binding, a complete attempt journal, a mismatch incident path, or complete effect-type coverage. The older generic `persistent_effects` table is not the authoritative landed campaign applier.

The target applier must:

1. emit an ordered effect ID/ordinal and canonical payload hash;
2. claim or read the D1 journal row without an unsafe read-then-unconditional-write race;
3. reject the same ID with a different payload hash;
4. apply the unit/equipment/history/ledger/archive mutation and mark the effect `APPLIED` in one D1 transactional batch;
5. return an existing matching `APPLIED` result as success after lost acknowledgement;
6. retain visible `PENDING`/`FAILED` recovery work and operator diagnostics;
7. let the DO remove/acknowledge its pending record only after D1 confirmation.

This requires implementation plus likely a follow-up D1 migration; it is not present in `worker/` today.

## 9. Events, reports, and fog

The actual event contract is:

```ts
interface CampaignEvent {
  eventId: string;
  campaignId: string;
  round: number;
  sequence: number;
  type: CampaignEventType;
  actor?: string;
  payload: Record<string, unknown>;
  timestamp: number;
  visibility: "PUBLIC" | "ALLIED" | "ENEMY" | "ADMIN";
}
```

There is no `phase` or `subjectIds` field in the landed contract. Calculation payloads include raw/modified/capped dice and armour/defence/penetration outcomes for the implemented attacks.

Current projection:

- filters event visibility classification and present-time actor visibility;
- hides non-visible deployments and other users' drafts;
- removes resolution records and pending effects from state;
- redacts dynamic fields on wholly unknown hexes;
- runs stored report events through the same projector;
- removes the seed from public resolution responses.

Remaining security work:

- event payload fields such as `targetId` are not independently projected, so a public event with a visible actor can identify a hidden target;
- report projection uses current state/visibility, not the viewer's event-time intelligence;
- `CampaignView` is not a narrow versioned safe DTO;
- live broadcasts are derived from each socket's authenticated viewer attachment and contain no unit/order/resolution identifiers;
- reconnect carries a bounded audience-projected `events-after-sequence` catch-up, but event-time historical intelligence is not yet preserved.

Sockets are read-only for commands; gameplay correctness does not depend on receiving a broadcast.

## 10. Failure status

| Failure point | Current outcome | Target closure |
|---|---|---|
| Before DO result transaction commits | No result should persist; retry re-enters current round | PREPARED input makes recovery explicit |
| During pure compute | DO transaction fails/retries; no attempt journal exists | Recompute immutable prepared input and count attempts |
| After DO result commit | Existing `resolution/{round}` returns duplicate; result/events are not duplicated | Also verify input/output hashes |
| Before/during D1 effects | Supported effects use receipt-idempotent D1 batches; failure leaves the round in `EFFECTS_PENDING`, retains unapplied keys and arms a retry; confirmed receipts are safe after lost acknowledgement | Add cryptographic payload collision checks, complete attempt journal and operator reconciliation |
| Duplicate/late alarm | Round/phase/journal generally makes it a no-op | Persist consumed schedule record and integration-test all crash points |
| WebSocket disconnect | Authoritative DO state remains | Filtered snapshot plus events-after-sequence catch-up |

## 11. Verification status

Implemented tests cover pure RNG, hex geometry/routes/LOS/capacity, mechanics, fog projection, deterministic resolver fixtures, event sequence continuation, exact revision handling, cooldown timing, Hold facing, simultaneous capacity contests, attack/action legality, request/state contract rejection, command replay/reuse/CAS behavior, cancel-and-resubmit persistence across a DO restart, and clock/auth policy including pause/resume and manual mode. A local browser canary has also read an aged pre-envelope K-17 state successfully through the migration path.

Still required before production:

- workerd integration tests for duplicate/late alarms and broader DO eviction/restart failures;
- crash injection before/after PREPARED, result commit, every D1 effect batch, acknowledgement, and next-round finalisation;
- D1 applier tests proving one death/damage/history/ledger/archive mutation;
- mismatched input/output/effect hash fail-closed tests;
- WebSocket hibernation/reconnect and events-after-sequence tests;
- event-time snapshot/report/socket leakage tests for opposing viewers.

## 12. Resolution decisions

### ADR-R01: Pure deterministic resolver stages

**Status:** Implemented for the foundation subset; full phase catalogue deferred.

**Decision:** Rules computation is pure and receives time/seed explicitly.

**Trade-off:** More explicit state/contracts; advanced mechanics require named handlers and fixtures.

**Revisit:** Optimise representations only after profiling, without reintroducing hidden state or randomness.

### ADR-R02: Snapshot plus events, not full event sourcing

**Status:** Partially implemented.

**Decision:** Current DO state is authoritative; snapshots/events provide explanation and bounded replay.

**Trade-off:** Historical reconstruction depends on retained snapshots and schema governance.

**Revisit:** If arbitrary temporal reprojection becomes a core requirement.

### ADR-R03: Gate the next round on required D1 effects

**Status:** Accepted target, **not implemented**.

**Decision:** DO result first, idempotent D1 effects second, next round only after acknowledgement.

**Trade-off:** D1 outage pauses progress in `EFFECTS_PENDING`, but cannot silently diverge permanent state.

**Revisit:** Only after a rigorously tested model lets planning safely coexist with unapplied consequences.

### ADR-R04: Server-secret deterministic seed and cryptographic evidence

**Status:** Accepted target, **not implemented**.

**Decision:** Protect deterministic seed material and expose commitment/reveal or equivalent audit evidence with cryptographic input/output hashes.

**Trade-off:** Requires secret management and repair/audit tooling.

**Revisit:** If a verifiable public randomness protocol provides equivalent replay and anti-prediction properties.

See [DATA_MODEL.md](./DATA_MODEL.md) for current record/table shapes and [CLOUDFLARE.md](./CLOUDFLARE.md) for alarm/environment/deployment boundaries.

## 13. Equipment/cargo action phase

The resolver now executes a narrow server-authoritative action phase before attacks:

- paired Load/Unload actions validate co-location, carrier profile, manifest eligibility, capacity, speed cost, and legal destination;
- Paradrop requires the target hex on the carrier path and emits an explicit success/failure event;
- Reload consumes one Small Supply and restores finite ammunition to capacity;
- Scan and Deploy Drone validate target range and emit events; Drone starts a six-round ability cooldown. Neither action currently changes the visibility projection, so both remain semantically incomplete and must not be advertised as a reveal mechanic;
- Attack ammunition and all new cooldown/supply/cargo/location consequences are included in stable `UNIT_STATE_UPDATED` effects.

The Campaign Durable Object applies these effects to D1 in transactional batches keyed by `campaign_effect_receipts`, updates weapon mounts/Supply/cargo/persistent locations, and appends owner-visible unit history. Duplicate effects return the existing receipt.

ADR-R03's gameplay gate is now implemented for the supported effects: a D1 outage holds the current round in `EFFECTS_PENDING`, automatic alarm/manual replay retries the stable keys, and planning opens once after all receipts confirm. PREPARED input hashing, protected seed policy, cryptographic output/effect binding, comprehensive crash injection and operator reconciliation remain CP-402 work.

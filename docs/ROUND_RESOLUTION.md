# Corinth's Plight Round Resolution

**Status:** Reconciled implemented foundation and target retry protocol (2026-08-09)

**Implemented subset:** deterministic Hold, Advance, Rush, Attack, K-17 enemy intentions, clock/alarm coordination, DO-local result deduplication

**Not yet implemented:** PREPARED/hash journal, server-secret seed commitment, D1 persistent-effect applier/acknowledgement, next-round effect gate, separate persisted schedule records

## 1. Guarantees: current versus target

| Property | Current foundation | Production target |
|---|---|---|
| Pure deterministic computation | Fixed `RoundInput` uses seeded RNG and ordered processing; regression tests cover the implemented subset | Version/hash-pinned engine and byte/canonical replay evidence |
| One DO result per round | `resolution/{round}` prevents a second committed result | PREPARED input hash, cryptographic output hash, attempts/statuses, mismatch incident handling |
| Permanent consequences exactly once | Resolver emits effects and DO stores them only | Idempotent D1 applier, payload-hash collision check, acknowledgements, reconciliation |
| Next round waits for effects | No; the DO increments/open the next round in the result transaction | Remain `EFFECTS_PENDING` until every required D1 effect is applied |
| Scheduling survives eviction | Clock and pending items are inside `state/current`; next DO alarm is derived from them | Separate status-bearing `schedule/{id}` records and consumed/recovery history |
| Reports/fog | Current state and report events use the projector; seed is removed | Event-time field-level projections and per-audience socket/report/replay DTOs |

The current code establishes a deterministic engine skeleton and DO-local duplicate guard. It does not yet prove exact-once resolution across Durable Object storage and D1.

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

The public request supplies intent. The DO constructs the authoritative `UnitOrder`:

- stable ID `order:{campaignId}:{round}:{deploymentId}`;
- server-incremented revision;
- owner, current start position, end position, submitted time, fitted equipment/weapons, and rules-derived action cost;
- `DRAFT` or `SUBMITTED` lifecycle;
- current or up to eight future rounds.

Before accepting a current submitted order, the Worker/DO path checks owner, deployed/not-destroyed state, class `allowedOrders`/`allowedActions`, executable catalogue flags, fitted weapon/equipment IDs, current projected target visibility, action economy/speed, and the one-attack limit. The pure resolver rechecks ruleset, executable order/action definitions, start/route/end, speed/action budget, Rush restrictions, attack count, target/weapon, range/LOS, friendly fire, ammo, and cooldown.

Only `HOLD`, `ADVANCE`, `RUSH`, and `ATTACK` are executable. Other order/action names remain catalogued but fail closed.

Current limitations:

- the client does not send a stable command idempotency key or expected revision;
- replacing an order overwrites the current in-state revision instead of retaining every immutable revision in the DO;
- D1 `order_archive` is not populated;
- current command authority is owner-only; delegated command is not wired;
- compile-time interfaces plus manual sanitisation are used instead of general runtime request schemas.

### 3.2 Lifecycle

```text
DRAFT -> SUBMITTED -> LOCKED -> RESOLVING -> RESOLVED | FAILED
   \-----------> CANCELLED       (before lock only)
```

The DO locks current submitted orders at the lock alarm/manual resolve. The resolver marks only the exact accepted `(order.id, order.revision)` resolved. Future orders are preserved when the completed round is removed; a replacement/future revision is not accidentally marked resolved.

The target command protocol adds a client idempotency key and expected revision, retains immutable revisions, and returns the original semantic result for duplicate delivery.

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
2. enters `RESOLVING`, records `snapshot/{round}`, selects current locked orders, and generates deterministic enemy orders;
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
}
```

6. atomically stores next state, `resolution/{round}`, result events, `pending-effect/{idempotencyKey}`, and the next round's `ROUND_STARTED` event;
7. increments the round, sets phase back to `PLANNING`, installs the next clock, and arms the next alarm.

This transaction avoids a partial DO result. A repeated call for a completed round returns the stored record and does not rerun effects. However:

- there is no pre-compute `PREPARED` record or canonical input hash;
- there is no attempt count/status machine or cryptographic output hash;
- the seed is predictable and stored in plaintext (although report responses remove it);
- a determinism mismatch cannot be detected against a committed output hash;
- pending effects are never sent to/applied in D1;
- the next round opens before permanent consequences acknowledge.

Consequently a successful DO commit can show a destroyed battlefield unit while the D1 `player_units` row remains unchanged indefinitely.

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

Current DO records contain an ID, type, optional unit ID, payload, and status. Current D1 `persistent_effects` has an idempotency-key PK and status/attempt/error fields, but no runtime applier and no payload hash/ordinal/result fields.

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
- live broadcasts are generic rather than derived for each viewer audience and can include unit/order identifiers;
- there is no `events-after-sequence` catch-up endpoint.

Sockets are read-only for commands; gameplay correctness does not depend on receiving a broadcast.

## 10. Failure status

| Failure point | Current outcome | Target closure |
|---|---|---|
| Before DO result transaction commits | No result should persist; retry re-enters current round | PREPARED input makes recovery explicit |
| During pure compute | DO transaction fails/retries; no attempt journal exists | Recompute immutable prepared input and count attempts |
| After DO result commit | Existing `resolution/{round}` returns duplicate; result/events are not duplicated | Also verify input/output hashes |
| Before/during D1 effects | No applier exists; pending record remains forever while next round is open | Transactional applier plus `EFFECTS_PENDING` gate |
| Duplicate/late alarm | Round/phase/journal generally makes it a no-op | Persist consumed schedule record and integration-test all crash points |
| WebSocket disconnect | Authoritative DO state remains | Filtered snapshot plus events-after-sequence catch-up |

## 11. Verification status

Implemented tests cover pure RNG, hex geometry/routes/LOS/capacity, mechanics, fog projection, deterministic resolver fixtures, event sequence continuation, exact revision handling, cooldown timing, Hold facing, simultaneous capacity contests, attack/action legality, and clock/auth policy including pause/resume and manual mode.

Still required before production:

- workerd integration tests for duplicate/late alarms and DO eviction/restart;
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

# Corinth's Plight Round Resolution

**Status:** Foundation protocol  
**Implementation:** `packages/rules-engine/src/` and `worker/campaign-durable-object.ts`  
**Tests:** `packages/rules-engine/test/`

## 1. Guarantees

For one campaign and round, the system guarantees:

- submitted orders remain editable only until the round lock;
- a fixed, immutable input produces one deterministic output and ordered event sequence;
- combat correctness does not depend on a browser or WebSocket connection;
- an alarm, HTTP command, or internal retry may run more than once but the round result and every permanent D1 effect apply once;
- a failed attempt resumes from a persisted protocol state rather than guessing how far it reached;
- clients receive only their authorized battlefield/event projection;
- the next round starts only after required persistent effects are acknowledged.

Exactly-once here is an application invariant built from deterministic recomputation, immutable hashes, unique IDs, Durable Object serialization, storage transactions, and a D1 effects journal. It is not an assumption that Cloudflare invokes a handler once.

## 2. Pure resolver contract

The rules engine has no React, network, D1, Durable Object, current-time, or environment dependency.

```ts
type ResolveRoundInput = {
  campaignId: CampaignId;
  roundNumber: number;
  logicalResolutionTime: number; // UTC epoch milliseconds, fixed before resolution
  ruleset: ResolvedRuleset;
  rulesetHash: string;
  engineVersion: string;
  previousState: BattlefieldState;
  playerOrders: LockedOrder[];
  enemyOrders: LockedOrder[];
  seed: SeedMaterial;
};

type ResolveRoundOutput = {
  nextState: BattlefieldState;
  events: CanonicalCampaignEvent[];
  persistentEffects: PersistentEffect[];
  report: CanonicalRoundReport;
  outputHash: string;
};

resolveRound(input: ResolveRoundInput): ResolveRoundOutput;
```

The same canonical input bytes must produce the same canonical output bytes. The engine may return validation failures and partial-execution events defined by the pinned ruleset; it never silently repairs an order.

## 3. Determinism rules

### 3.1 Canonical input

Before resolution, the campaign DO creates `snapshot/{round}` and computes an input hash over:

```text
campaign ID
round number
logical resolution instant
ruleset ID and content hash
engine version/hash
canonical battlefield snapshot
accepted player order IDs + revisions + payloads
accepted enemy order IDs + revisions + payloads
seed material/commitment policy
```

Objects use stable key ordering. Collections are sorted by explicit keys, never database iteration order: orders by phase priority then unit ID then order ID; deployments by deployment ID; weapons/actions by declared index; hexes by `(q, r)`; events by generated sequence.

Changing locked input after `PREPARED` is a fatal protocol conflict. It must pause the campaign for operator inspection rather than create a second result.

### 3.2 Randomness

- `Math.random()` is forbidden in the resolver.
- Production seed material is derived or selected server-side, stored before computation, and hidden until policy permits disclosure. A predictable public `campaignId + round` seed is not sufficient.
- A suitable production derivation is a secret HMAC over campaign ID, round, ruleset hash, and committed snapshot hash. The pure engine receives only the resulting bytes/string.
- A seed commitment may be published before resolution and the seed revealed in the completed report for audit, without exposing the server secret.
- Each meaningful die result records stream/key, sides, raw result, modifiers and final value in an event.
- Prefer phase/entity-labelled random streams so adding an unrelated roll does not perturb every later result. Any stream scheme is part of `engineVersion`.

### 3.3 Time, IDs and arithmetic

- The engine receives `logicalResolutionTime` as fixed UTC epoch milliseconds; it does not call `Date.now()`.
- Event IDs are deterministic from campaign, round and sequence (or a hash of those values and type), not random UUIDs.
- Events use logical time supplied in the input. Storage ingestion time may be logged separately outside the output hash.
- Hex coordinates and combat values are integers. Fractional movement/action costs use quarter-points, not binary floating point.
- Ties use documented stable keys or a logged seeded choice.

## 4. Campaign and order state machines

### 4.1 Round protocol state

```text
OPEN
  -> LOCKED
  -> PREPARED
  -> RESOLVING
  -> RESULT_COMMITTED
  -> EFFECTS_PENDING
  -> EFFECTS_APPLIED
  -> RESOLVED
  -> next round OPEN
```

`FAILED` is diagnostic, not a rollback to `OPEN`. A transient failure remains at the last committed state and retries. An input/hash conflict or invalid rules/engine pin pauses the campaign and requires an administrator.

### 4.2 Order lifecycle

```text
DRAFT -> SUBMITTED -> LOCKED -> RESOLVING -> RESOLVED | FAILED
   |          |
   +------> CANCELLED      (only before lock)
```

- Replacing an order creates a higher immutable revision under the same stable order ID or supersedes it with an explicit link.
- A command includes a client idempotency key and expected revision. A duplicate returns the first result; a stale revision returns a conflict.
- Submission validation checks identity, authority, current ownership/deployment, structure and obvious legality.
- Lock-time/resolution validation checks the authoritative snapshot. Future orders can become impossible and then fail or partially execute according to the pinned rule definition, with a clear event.
- A submitted `startHex`, statistic, ammo count, or equipment rule is never accepted as truth.

## 5. Persisted schedule and clocks

The campaign DO owns time. It stores schedule records before setting an alarm and sets its single alarm to the earliest pending due event.

Foundation clock presets are:

| Preset | Use | Alarm behavior |
|---|---|---|
| `MANUAL` | deterministic tests and administrator-controlled local games | no automatic round alarm; manual command enters the same lock/resolve path |
| `ONE_MINUTE` | fast local smoke tests | automatic deadline after 60 seconds |
| `FIVE_MINUTES` | collaborative development | automatic deadline after 5 minutes |
| `THIRTY_MINUTES` | preview/staging playtests | automatic deadline after 30 minutes |
| `DAILY` | production default | automatic deadline after 24 hours |
| custom duration | campaign configuration | validated minimum/maximum and explicit policy |

The displayed countdown is derived from the persisted deadline and current server time; countdown messages are advisory. The persisted schedule/alarm decides when a round locks.

The foundation clock stores both `lockAt` and `resolvesAt`. `lockAt = resolvesAt - lockLeadMs`; root development configuration currently uses a five-minute round and a 30-second lock lead. A campaign may set `lockLeadMs` to zero, in which case lock and resolution share one deadline. Locking persists all accepted revisions, and `ROUND_RESOLVE` runs at the separately persisted resolution time. Pause cancels/invalidates the current active alarm record while retaining its schedule history; resume computes and persists new lock/resolve times according to policy.

Alarm handlers may wake late and may be retried. They process all due schedule items in deterministic due-time/ID order, mark each consumed idempotently, and finally set an alarm only for the next pending item.

## 6. Phase pipeline

Every phase is a pure handler with an explicit input/output type. Foundation-only unsupported systems remain named no-op phases rather than disappearing into a later reordering.

### Phase 1: Lock round

- Atomically change `OPEN` to `LOCKED` if the expected round/deadline matches.
- Reject further edits/cancellations for that round.
- Select the latest valid submitted revision for each unit/order slot.
- Record lock event and logical lock time.

### Phase 2: Snapshot battlefield

- Persist immutable `snapshot/{round}`.
- Include map, units, current status/resources, structures/objectives, visibility memory and accepted revisions.
- Bind ruleset ID/hash and engine version/hash.

### Phase 3: Validate locked orders

- Revalidate actor authority as recorded at lock, unit operational/deployed state, route continuity/cost, equipment/ammo/cooldown, action/target legality and order-type eligibility.
- Produce deterministic rejection or permitted partial-execution events.
- Never delete the submitted order that failed.

### Phase 4: Generate/accept enemy intentions

- In the foundation, consume supplied deterministic enemy orders or an explicit no-enemy fixture.
- Later PvE doctrine receives only its permitted pre-resolution knowledge projection and seeded inputs.
- Enemy intent cannot inspect resolved player outcomes.

### Phase 5: Resolve movement

- Process explicit routes with terrain, elevation, river/road, action-cost and facing rules.
- Emit each meaningful movement segment or final movement event according to report granularity.
- Stop/adjust only through named rules such as blocking, capacity, interception or a ruleset-defined partial move.

### Phase 6: Resolve interception, blocking and contact

- Determine route contacts, hostile blocks and hex capacity from the post-movement-intent geometry.
- Use standard axial neighbours and deterministic tie-breaking.
- Emit why a unit stopped or made contact.

### Phase 7: Resolve non-combat actions

- Execute eligible standard/primary/incidental actions in declared deterministic order.
- Foundation implements only actions required by Hold/Advance/Attack; unsupported advanced hooks produce an explicit unsupported/invalid event.

### Phase 8: Resolve combat simultaneously

- Build all legal attack intents from the same pre-casualty combat snapshot.
- Resolve LOS, visibility permission for target acquisition, range, facing/flanking, weapon/ammo and rolls.
- Record raw dice and the complete calculation.
- Do not remove an attacker merely because another attack in the same simultaneous group would destroy it.

### Phase 9: Apply casualties and damage

- Aggregate combat consequences in stable target/effect order.
- Apply infantry FS caps, vehicle Hits, armour/AP/defence interpretation and destruction from the pinned ruleset.
- Emit damage and destruction events and stable D1 persistent effects.

### Phase 10: Structures, building and repair

- Explicit no-op in the first Hold/Advance/Attack slice except any minimal fixture behavior.
- Later handlers consume versioned structure/action definitions.

### Phase 11: Logistics, ammunition and supply

- Consume ammo already required by the minimal Attack implementation.
- Full transfers, reload, supply and repair logistics remain a later vertical slice.

### Phase 12: Cooldowns and status effects

- Advance any foundation statuses deterministically; later definitions register named hooks.

### Phase 13: Objectives and control

- Explicit no-op or minimal fixture scoring in the foundation. Full campaign victory/failure is Phase 7 product work.

### Phase 14: Persist authoritative campaign result

- Atomically commit the new active DO state, canonical events, report/result hash, resolution journal and pending D1 effects.
- Never perform a network/D1 call inside the DO storage transaction.

### Phase 15: Apply persistent D1 consequences

- Use the idempotent effects protocol in section 8.
- Examples: Player Unit damage/status/death, equipment loss, unit history, ammunition if globally persistent, requisition reward/debit and immutable archive metadata.

### Phase 16: Generate/publish round report

- The canonical report is already deterministic engine output.
- After required effects acknowledge, mark it publishable and derive viewer-specific event/report projections.

### Phase 17: Advance campaign clock

- Mark the old round `RESOLVED`, increment exactly once, create the next `OPEN` state/deadline, persist its schedule, then set the next alarm.
- Do not advance while required D1 effects remain unresolved.

## 7. Durable Object resolution journal

`resolution/{round}` is the protocol authority for retries:

```ts
type ResolutionJournal = {
  campaignId: string;
  roundNumber: number;
  status:
    | "PREPARED"
    | "RESOLVING"
    | "RESULT_COMMITTED"
    | "EFFECTS_PENDING"
    | "EFFECTS_APPLIED"
    | "RESOLVED"
    | "FAILED";
  attemptCount: number;
  inputHash: string;
  outputHash?: string;
  rulesetHash: string;
  engineVersion: string;
  seedCommitment: string;
  seedCiphertextOrReference: string;
  eventCount?: number;
  pendingEffectCount?: number;
  acknowledgedEffectCount?: number;
  errorCode?: string;
};
```

Protocol:

1. **Prepare transaction:** verify `OPEN/LOCKED`, persist lock/snapshot, canonical input hash, seed commitment and `PREPARED` journal.
2. **Compute:** mark/increment attempt, load the immutable input, and call the pure engine. A crash here safely recomputes.
3. **Commit result transaction:** if no result exists, verify the input hash and atomically store next battlefield state, events, output hash, report and pending effects. If a matching output already exists, return it. A different output for the same input is a determinism incident.
4. **Apply D1 effects:** retry until the D1 journal confirms every stable effect.
5. **Finalize transaction:** acknowledge effects, publish report, advance round once, and schedule the next deadline.

The DO is the per-campaign serialization boundary, but code still checks expected round/status/version. Durable Object single-threaded execution does not remove reentrancy around `await`, duplicate deliveries, or crash recovery concerns.

## 8. D1 persistent-effects protocol

Each effect has a stable ID, ordinal, type, target, canonical payload and payload hash:

```text
campaignId:roundNumber:effectIndex:effectType:targetId
```

The D1 effect applier is shared Worker runtime code callable from an HTTP/admin path or directly by the alarm-driven campaign DO. D1 exposes transactional prepared-statement batches rather than an interactive transaction callback, so the protocol does not rely on a race-prone application read followed by an unconditional write:

1. Claim an absent effect with `INSERT ... ON CONFLICT DO NOTHING` as `PENDING`, then read the canonical journal row.
2. If it is `APPLIED` with the same payload hash, return its recorded result without mutating again.
3. If its payload hash differs, fail closed and pause the campaign.
4. A matching `PENDING` row is new or recovery work. Build prepared statements whose target mutation and stable history/ledger inserts are conditional on that exact row/hash remaining `PENDING`; finish by changing it to `APPLIED`.
5. Execute the bounded round statements as one D1 transactional batch and return acknowledgements.

A crash after the claim leaves visible `PENDING` recovery work. If the application batch rolls back, target mutations and `APPLIED` transitions roll back together. If it commits and the DO crashes before acknowledging, a retry sees `APPLIED` and is a no-op. Stable IDs on history/ledger rows are a second guard. The DO retains `pending-effect/{id}` until acknowledgement.

Large future rounds may chunk effects only after effect-level ordering, inter-chunk dependencies and finalization semantics have tests. The foundation favors one bounded batch.

## 9. Events and reports

A canonical event contains:

```ts
type CanonicalCampaignEvent = {
  eventId: string;
  campaignId: string;
  roundNumber: number;
  sequence: number;
  phase: ResolutionPhase;
  type: string;
  actorId?: string;
  subjectIds: string[];
  payload: unknown;
  logicalTime: number;
  visibility: VisibilityClassification;
};
```

Events explain decisions, not just final values. A rejected move includes the failed segment and rule; an attack includes weapon, target, LOS/range/facing, roll, modifiers, effective armour/defence and outcome; a scheduled order failure includes the changed precondition.

The engine produces the canonical stream. The campaign DO then updates intelligence state and projects each event for a viewer. Projection may omit the event, redact fields, replace an exact enemy with an unknown contact, or disclose a last-known observation. Raw events never travel to a normal client before projection.

The active DO log supports reconnect/replay. D1 `campaign_event_archive`, `order_archive` and `round_metadata` receive idempotent archival effects. R2 may later hold immutable large snapshots/replay exports, but R2 is not required to determine the result.

## 10. Failure and retry matrix

| Failure point | Persisted state | Retry behavior | Required outcome |
|---|---|---|---|
| Before prepare commit | old round remains `OPEN/LOCKED` | repeat lock/prepare command | one snapshot/input |
| After prepare, before/during compute | `PREPARED` with immutable input hash | recompute with same seed/input | identical output |
| During result storage transaction | transaction rolls back | recompute or reuse journal input | no partial state/events |
| After result commit, before D1 | `RESULT_COMMITTED`/pending effects | skip compute; apply effects | no duplicate event/result |
| During D1 transaction | D1 rolls back batch | retry same effects | no partial permanent consequences |
| D1 commits, acknowledgement lost | D1 effect rows exist; DO still pending | matching IDs/hashes return success | no double death/spend/history |
| After effects ack, before round advance commit | effects acknowledged | finalize transaction again | one next round |
| Duplicate/late alarm | consumed schedule/journal state exists | semantic no-op; arm next event | no round skip or duplicate |
| WebSocket disconnect | authoritative state unchanged | reconnect and request filtered snapshot/events | no gameplay impact |

An input-hash mismatch, output-hash mismatch, effect-hash collision, missing pinned ruleset/engine, or impossible persistent transition is not blindly retried. Pause the campaign, retain evidence, emit structured diagnostics, and expose an admin repair decision.

## 11. Security and authorization during resolution

- Order commands require authenticated campaign membership and ownership or explicit delegated command permission.
- The actor/permission decision is recorded with the accepted revision for audit, but lock-time validation still confirms the unit/deployment relationship.
- Admin manual lock/resolve invokes the same state machine and records the admin principal; it is not an alternate resolver.
- Enemy AI receives a rules-defined knowledge projection, not canonical omniscient state unless a campaign explicitly defines omniscience.
- Viewer report projection is evaluated at read/broadcast time using event disclosure and intelligence history.
- A client cannot choose seed, ruleset, engine version, final statistics, resolved target legality, or event result.

## 12. Observability

Every protocol log record includes as applicable:

```text
requestId, commandId, campaignId, roundNumber, scheduleId,
resolutionAttempt, inputHash, outputHash, effectId,
userId, unitId, orderId, orderRevision, phase, durationMs, errorCode
```

Do not log credentials, full session tokens, hidden battlefield payloads, or secret seed material. Admin diagnostics expose hashes, phase/rejection reasons and authorized state inspection sufficient to answer why movement, targeting, visibility or clock advancement behaved as it did.

## 13. Required tests

### Pure engine

- axial neighbours/distance and route continuity/cost;
- elevation, rivers/roads, capacity and facing/flanking;
- LOS and fog/intelligence primitives;
- speed/action cost and authoritative order validation;
- range, FS cap, Hits, armour, AP, defence, ammo and death;
- simultaneous attack eligibility and casualty application;
- fixed seed/input produces byte-equivalent state and event sequence;
- meaningful dice calculations are present in events;
- input collection permutations do not change output.

### Campaign protocol

- submit/edit/replace/cancel before lock and rejection after lock;
- manual plus 1/5/30-minute clock behavior using controllable time;
- pause/resume and duplicate/late alarm;
- crash injection at every row in the failure matrix;
- repeated resolve returns one result/event range;
- repeated D1 effects yield one mutation/history/ledger row;
- a mismatched input/output/effect hash pauses rather than corrupts;
- reconnect catches up from a filtered snapshot/event sequence;
- different viewers cannot infer hidden enemy state from snapshots, events or report payload size/fields.

## 14. Resolution decision records

### ADR-R01: Explicit pure phase pipeline

**Status:** Accepted  
**Decision:** Use typed phases with immutable input/output rather than a giant stateful `resolveRound`.  
**Trade-off:** More intermediate types and fixtures; sequencing is visible and independently testable.  
**Revisit trigger:** Phase overhead is measured as a material bottleneck after correctness, at which point internal representations may optimize without erasing phase contracts.

### ADR-R02: Snapshot plus events, not full event sourcing

**Status:** Accepted  
**Decision:** Current state is authoritative; immutable snapshots/events provide replay and audit.  
**Trade-off:** Arbitrary state reconstruction depends on retained snapshots.  
**Revisit trigger:** Temporal queries/reprojection become core requirements and event evolution tooling exists.

### ADR-R03: Gate next round on required D1 effects

**Status:** Accepted for correctness-first foundation  
**Decision:** Commit the DO result first, retry D1 effects idempotently, and open the next round only after acknowledgement.  
**Trade-off:** A D1 outage can leave a campaign in `EFFECTS_PENDING`, though no result is lost or duplicated.  
**Revisit trigger:** Availability requirements demand planning the next round while persistence catches up; only adopt after commands can safely respect pending consequences.

### ADR-R04: Server-secret deterministic seed

**Status:** Accepted  
**Decision:** Derive/store seed material server-side and expose commitment/reveal evidence rather than use an easily predicted public seed.  
**Trade-off:** Secret management and audit tooling are required.  
**Revisit trigger:** The game adopts a verifiable public randomness or commit/reveal protocol with equivalent replay and anti-prediction properties.

# Corinth's Plight Strategic Resolution

**Status:** Phase 3 deterministic protocol and persistence journal foundation (2026-08-10)

## 1. Separate coordination clock

Strategic rounds are independent of tactical campaign rounds. `strategic_maps` configures a manual, accelerated, or scheduled clock; `strategic_rounds` records one map round. Production duration is configuration, never an assumed 24-hour constant.

The Strategic Map coordinator is sharded by stable map ID. `strategic-map-corinth` addresses one development theatre. Campaign Durable Objects continue to coordinate their own tactical campaigns. Neither coordinator owns the whole galaxy.

## 2. Pure resolver boundary

The strategic resolver must be a deterministic pure function:

```text
previous strategic state
+ locked strategic orders
+ acknowledged campaign results
+ pinned ruleset/world configuration
────────────────────────────────────
next strategic state
+ ordered canonical events
+ ordered persistent effects
+ result hash
```

It must not read D1, Durable Object storage, wall-clock time, network state, environment variables, or `Math.random()`. The Worker and Strategic Map Durable Object orchestrate authorization, persistence, alarms, and projection.

## 3. Canonical resolution phases

The Phase 3 foundation uses this stable order:

1. Validate pinned ruleset, resolver version, map revision, round, and input hash.
2. Freeze accepted strategic orders in canonical order.
3. Aggregate Task Force, Battlegroup, ship, unit, equipment, and module capabilities.
4. Validate subject location, route adjacency/status/profile, positive travel timing, carrier/cargo capacity, and deployment constraints.
5. Validate and consume Large, Medium, and Small Supply from explicit holders.
6. Advance travel progress and arrivals deterministically.
7. Resolve embark/disembark and non-combat deployment state transitions.
8. Apply acknowledged tactical campaign outcomes once.
9. Evaluate configured control, route, operation-availability, and war-variable effects.
10. Emit canonical events and idempotent D1 effects in stable order.
11. Commit the result hash, acknowledge required effects, and advance the map round once.

Full orbital combat, interception, blockade, and boarding are typed rejected/deferred outcomes. They are never approximated inside this pipeline.

## 4. Strategic order contract

`strategic_orders` supports:

```text
MOVE_TASK_FORCE
MOVE_BATTLEGROUP
EMBARK_BATTLEGROUP
DISEMBARK_BATTLEGROUP
DEPLOY_TO_CAMPAIGN
WITHDRAW_FROM_CAMPAIGN
TRANSFER_SUPPLY
RESUPPLY_TASK_FORCE
SUPPORT_CAMPAIGN
```

Lifecycle is `DRAFT → SUBMITTED → LOCKED → RESOLVING → RESOLVED|FAILED`, with cancellation before the applicable lock. A record has exactly one Task Force or Battlegroup subject. Destination and operation are separate optional relationships because not every order uses both.

The client submits an intent, destination, `commandId`, and expected subject revision. The server derives and pins route, capability eligibility, capacity, cost, and supply consequences. Client-authored route cost, supply spend, permissions, owner, or revision result is ignored.

## 5. Idempotency and optimistic concurrency

Client command IDs are unique per authenticated actor:

```sql
UNIQUE (actor_user_id, command_id)
```

On retry the service loads the row by authenticated actor and command ID and compares the canonical request hash:

- same hash: return the existing result;
- different hash: fail with an idempotency collision;
- no row: continue with the mutation.

The actor scope matters. A global command-ID constraint would let one User reserve another User's key.

Every subject mutation also compares `expected_subject_revision` to the current Task Force or Battlegroup revision inside the same D1 transaction/batch. A mismatch is stale and must not create an order or event. The SQL records the expected revision; the service performs the compare-and-set.

## 6. Route and travel handling

Movement is node-to-node along `strategic_routes`. Each pinned route step must:

- exist on the same strategic map;
- connect the prior node (respecting directionality);
- be open for the resolved round;
- permit the subject's aggregated movement profile;
- have a positive published or explicitly configured duration;
- satisfy any capability/deployment metadata.

The initial Corinth graph deliberately has `NULL` travel rounds with `BALANCE_REQUIRED`. This means movement orders using those routes must remain unavailable/fail closed until authoritative timing is pinned. It does not mean one round or zero rounds.

Composition may affect strategic mobility only through data-driven aggregation. The engine must not invent a speed conversion from tactical hex speed where the source is nonspecific.

## 7. Supply resolution

Supply phases preserve the V5 hierarchy:

- one Large Supply marks a Task Force or HQ supplied for two strategic rounds;
- one Medium Supply maintains an FOB for one round;
- Small Supply is unit-level expenditure;
- Small/Medium pulls require an online source and appropriate logistics/facilities;
- no tier silently converts into another stored balance.

The resolver must validate quantity and capacity before emitting a spend. `strategic_supply_balances` rejects underflow and capacity overflow, but that database check is a last line of defence; concurrent spends still require expected revision and transactional compare-and-set.

## 8. Round journal

`strategic_rounds` stores:

- map/round identity and lifecycle;
- pinned ruleset and resolver version;
- open/lock/resolve schedule and actual timestamps;
- optimistic revision;
- unique resolution key;
- canonical input and result hashes;
- bounded state metadata.

A `RESOLVED` or `FAILED` row cannot omit its resolution key, input hash, result hash, or resolved time. A duplicate resolve/alarm first loads the existing journal. If the hashes match it returns the existing result; a mismatch fails closed.

The pure runtime also stores a retry-input fingerprint over the map/round identity, pinned ruleset, canonically ordered locked orders, campaign results, and explicit resolution time. A retry against an already committed runtime resolution must match that fingerprint before the prior hashes may be returned.

The Durable Object may keep active coordination state, but D1 remains the relational system of record for resolved orders, canonical events, receipts, formations, supply, and world variables.

**Current checkpoint boundary:** the pure resolver and persistence schema are implemented, but the authoritative D1 snapshot/journal/effect applier is not. Both public strategic-order execution and the development resolve control therefore return explicit `501` responses without mutation. The internal coordinator and compare-and-set submission service are scaffolded and tested, but are not a claim that end-to-end resolution is active.

## 9. Events and effects

`strategic_events` is append-only history. Map events have a stable sequence within a round, a canonical payload, an event hash, and an idempotency key. Events are projected by audience; technical payloads and hidden enemy information are not automatically Battalion-visible.

`strategic_effect_receipts` handles mutations crossing a resolution or tactical boundary. It records source kind, source ID and version, target, payload/hash, state, attempts, result, and error. Its unique source/version/effect/target tuple prevents the same campaign result from capturing a node twice even if a handler retries.

For a tactical campaign result, the stable source should include at least:

```text
campaignId + campaignResultVersion
```

Applying a result follows:

1. canonicalise and hash the effect payload;
2. insert/load the matching receipt;
3. reject an existing receipt with another hash;
4. transactionally mutate the target and append its strategic event;
5. mark the receipt applied with the result;
6. acknowledge the Strategic Map coordinator.

The existing Phase 1 `persistent_effects` applier is still incomplete. The Phase 3 receipt schema does not itself make tactical reconciliation executable.

## 10. Stable ordering and hashes

Canonical inputs must sort maps, orders, subjects, route steps, effects, and object keys explicitly. Database return order, insertion timing, locale comparison, and JavaScript object construction order are not accepted as implicit ordering rules.

Hashes are over versioned canonical encodings. They must include ruleset/resolver/map/round identity and the complete authoritative input relevant to the result. The event/effect ordinal is part of the stable ID derivation.

## 11. Failure handling

The resolver fails closed on:

- unknown or deferred order type;
- inactive membership or missing permission;
- stale map/round/subject revision;
- unpinned rules or unresolved travel time;
- missing, blocked, cross-map, or profile-incompatible route;
- aerospace-only Battlegroup;
- carrier or facility mismatch;
- duplicate operational location;
- capacity or supply failure;
- campaign result hash/idempotency collision;
- orbital combat requirement in this checkpoint.

A failed order produces an audience-safe failure record. It must not partially advance travel, spend supply, or apply world effects.

## 12. Verification

The schema/seed lane verifies fresh migrations 0001–0004, all rules/development seeds twice with an identical database dump, `integrity_check`, `foreign_key_check`, hierarchy cycles, self-routes, duplicate embarkation, supply overflow/underflow, inactive Battalion selection, cross-Battalion subjects, actor command reuse, and invalid JSON.

Pure resolver tests must separately prove replay-stable events/effects/hashes, phase ordering, travel timing, capability aggregation, aerospace-only rejection, supply duration, stale revisions, and deferred orbital paths. Durable Object tests must prove duplicate alarms and commands do not duplicate effects.

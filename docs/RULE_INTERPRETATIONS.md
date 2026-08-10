# Equipment and Deployment Rule Interpretations

This document records the narrow decisions used by the equipment/loadout/deployment vertical slice. It does not silently activate the wider companion catalogue.

## Active interpretations

1. Effective units are rebuilt from the pinned unit definition, installed refits, selected owned equipment, and current campaign resources. Refits apply before equipment; definitions and instances use Unicode code-point ordering.
2. Equipment and refits remain distinct. Equipment occupies an owned slot and can be reassigned only at an authorised facility or pre-campaign muster. Campaign snapshots are immutable.
3. Transport capacity uses nominal unit size, not current casualties or damage. Six Force Strength of Infantry consumes one slot; a vehicle consumes two slots where the carrier profile says so. This avoids damage creating free lift capacity.
4. Loading and unloading require a matching Standard Action from both carrier and cargo. Normal unloading uses the carrier hex. Heavy Air Transport uses its rules-data per-slot action cost.
5. Paradrop accepts Infantry and Light Vehicle cargo only, and the drop hex must occur on the submitted carrier route. Blocked/invalid drops fail closed. The source does not define deterministic hazardous scatter or damage, so hazardous-drop resolution is not invented.
6. Lightweight Anti-armour is a fitted, finite-ammunition weapon: Range 1, AP +1, three uses. It is not automatically reloadable unless a rules-defined reload source is present.
7. The current data maps Drone Operator to a Range-5 Deploy Drone action with a six-round cooldown and Vehicle Optics to Scan. That source-facing mapping does not activate either item: the current resolver stops at events/cooldowns, visibility consumes neither result, and the Optics passive sensor mutation is not source-approved. Both remain release-blocked pending the explicit equipment-effect decision.
8. Field Reload consumes one Small Supply and restores a finite weapon to its published capacity. Supported campaign ammo, cooldown, supply, location, and cargo consequences use receipt-idempotent D1 writeback after DO result commit; the next round currently opens before that acknowledgement, so this is not the release-grade exactly-once protocol.
9. Orbital Drop Training applies its published effective-unit mutation and records eligibility, but orbital deployment remains disabled because the coordinator/hazard rules are incomplete.
10. Engineer vehicle Repair resolves after simultaneous movement and before attacks, in the same support-action phase as First Aid. The Engineer and friendly living vehicle must be in base contact at that post-movement position. The player selects either one missing Hit or one damaged subsystem; the server spends exactly one Small Supply and derives the resulting state. This timing orders already-published effects without adding a new balance value.
11. Artillery starts a tactical deployment `PACKED`. Deploy and Pack Up are Standard Actions costing `0.5` Speed and include hitching/unhitching exactly as V5 states. A packed platform may move and then deploy; a deployed platform cannot move until it packs, with movement available from the following round. Support actions resolve before attacks, so a platform may deploy and fire in the same order. Bombardment is an activated Primary Action; Funnel remains deferred.
12. Primary Bombardment targets a known battlefield hex at Range 1–4 and uses the ordinary indirect-fire friendly-spotter rule. It spends one Small Supply under `RC-V5-011`, then adds one suppression stack to each living hostile within radius one up to that unit's base Defense under `RC-V5-012`. Attacks subtract active stacks from Defense. A unit not inside any Bombardment area in a round recovers one stack before attacks. Zero-Defense targets are still inside the mission area but do not accumulate meaningless stacks. Funnel remains deferred.

## Explicitly unresolved

- hazardous airdrop deviation, damage, and cargo-destruction consequences;
- whether campaign-end ammunition is restored, retained, or replenished through a separate logistics process;
- exact facility coverage for every vehicle/aerospace refit category;
- authoritative state, duration, projection, action-slot, and visibility semantics for Vehicle Optics/Scan and Drone Operator/Deploy Drone (`DEC-018`);
- strategic Supply lift from a selected store in the planner (unit cargo is executable; store-backed Supply lift remains blocked);
- tactical cryptographic PREPARED/result journal and acknowledgement-gated next-round transition.

These items must remain visible blockers or catalogue-only states until a source-backed deterministic rule is adopted.

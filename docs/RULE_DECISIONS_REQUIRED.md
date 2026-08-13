# Corinth's Plight — Rules and Product Decisions Required

**Snapshot:** 2026-08-12

**Rules profile:** V5-first curated profile

**Decision owner:** Project owner unless delegated explicitly

**Default while unresolved:** Keep the value null, the capability unavailable, and the UI blocker explicit.

This register does not turn recommendations into rules. A decision becomes active only after explicit owner approval, a stable decision/conflict ID, versioned source/provenance, an additive migration or repeat-idempotent seed update, campaign/ruleset pinning, implementation, and tests.

The local Phase-1 security checkpoint adds provisional operational retention periods, invitation quotas and delivery retry limits. Those are abuse/reliability defaults, not game rules or a legal retention decision, and they do **not** resolve DEC-016. No rules or balance decision was activated by that checkpoint.

The 2026-08-13 tactical presentation pass changes only formation layout, sprite scale/animation, commander colour, intent-arrow grammar, marker callouts and operation-note styling. It consumes authoritative positions, facings, orders, marker kinds and note text without changing movement, stacking/capacity, targeting, visibility, action economy or balance. It therefore activates no rules decision; unresolved values below remain blocked.

The 2026-08-14 V3 theatre expansion is versioned scenario content, not a presentation-only change. It preserves each operation's complete former map as an inner core and uses that operation's existing terrain authoring function for deterministic connected outer coordinates. The extra playable space can affect scenario balance, so existing campaigns are not silently migrated and public publication still requires scenario playtest/content approval. It does not approve a reusable terrain profile or resolve DEC-007.

## Decision protocol

For every `PENDING` row:

1. confirm the cited source and existing conflict disposition;
2. select or amend an option explicitly;
3. record approver, date, rationale, scope, and effective ruleset/content version;
4. keep previously published campaigns pinned unless an explicit migration policy says otherwise;
5. add negative tests proving null/blocked values cannot become zero, free, one round, or another fallback;
6. update `RULE_CONFLICTS.md`, `GAME_SYSTEMS.md`, generated catalogue data, the implementation roadmap, and release evidence together.

## Decision summary

| ID | Decision | Existing authority | Status | Blocks |
|---|---|---|---:|---|
| DEC-001 | Starting Req and normal income | RC-V5-016 | APPROVED — PUBLIC V1 | General economy and acquisition |
| DEC-002 | Unit prices and purchase timing | RC-V5-016 | APPROVED — PUBLIC V1 | Unit catalogue purchases/replacement |
| DEC-003 | Equipment/refit/module prices and mutation timing | RC-V5-016, RC-EQP-* | PARTIAL — STORE EQUIPMENT ONLY | Loadout/refit/ship economy |
| DEC-004 | Rewards, loss, replacement, salvage/refund and Battalion funds | RC-V5-016 | APPROVED — PUBLIC V1 | Campaign outcome/economy loop |
| DEC-005 | Strategic route travel time/cost/supply model | No stable conflict ID yet | PENDING | Public strategic movement |
| DEC-006 | Structure/build/repair values | RC-BUILD-002/004/005/006/007 | PENDING | Construction/attackable structures |
| DEC-007 | Scenario terrain/cover/high-ground/LOS profile | RC-V5-005/014/021 plus road/river conflict | PENDING | General tactical maps |
| DEC-008 | Carrier destruction and excess FS-linked Supply | RC-V5-030, RC-V5-029 | PENDING | Carrier-loss adjudication; ordinary governed loading is not blocked |
| DEC-009 | Hazardous drops and aerospace operational details | RC-V5-018, RC-V5-017/023/028 | PENDING/PARTIAL | HAT/VTOL/fighter/bomber release |
| DEC-010 | Ship acquisition, hull/module catalogue and upgrade economy | RC-UNIT-014, RC-EQP-* | PENDING | Ship mutations |
| DEC-011 | Large Supply and Atmo-Fuel | RC-SUP-004, RC-V5-015 | PENDING | Orbital logistics/travel |
| DEC-012 | Orbital Crew/hulls and Fire Critical | RC-UNIT-014, RC-V5-007 | PENDING | Orbital roster/combat |
| DEC-013 | Boarding/orbital combat/capture | RC-V5-026 | DEFERRED POST-V1 | Advanced ship combat |
| DEC-014 | War season, victory, reset and archive policy | Product decision | PENDING | Living-war lifecycle |
| DEC-015 | Event/report declassification and export | Product/security decision | PENDING | Complete reports/replay |
| DEC-016 | Privacy, retention, account rights, age/audience and asset use | Product/legal decision | PENDING | Public release |
| DEC-017 | Store slot budgets and source mismatches | RC-EQP-001 plus Store rows | URGENT PENDING | Existing equipment must fail closed |
| DEC-018 | Optics and Drone behavior | Store rows 43/23 | URGENT PENDING | Current `IMPLEMENTED` overlays are incorrect/no-op |
| DEC-019 | Campaign-end ammo/supply and facility coverage | `RULE_INTERPRETATIONS.md:17-23` | PENDING | Recovery/rearm/refit loop |
| DEC-020 | Production scenario/world content authority | Product/content decision | PENDING | Any non-demo campaign/strategic play |
| DEC-022 | Standard Melee Weapon attack profile | V5 Melee Charge + Store row 5 | PENDING | Player Melee Charge/Brawl activation |
| DEC-023 | Smoke Grenade duration | Store row 17 + RC-EQP-006 | PENDING | Infantry smoke LOS activation |

## Detailed decisions

### DEC-001 — Starting Req and normal income

**Sources:** V5 requisition references at `Meta - Core Rules (V5).md:193-195,506-508`; RC-V5-016 at `RULE_CONFLICTS.md:463-467`. V5 does not provide starting balances or an ordinary income schedule.

**Current behavior:** the application-owned `public-v1-economy@1` profile is active. It is labelled separately because treating its approved values as source-supplied V5 numbers would be inaccurate.

**Options:**

1. Campaign-reward-only economy: no periodic income; approved scenarios grant explicit Req through idempotent results.
2. Battalion allocation economy: a versioned campaign policy gives Battalion funds and authorised ranks allocate them.
3. Hybrid: a one-time onboarding grant plus scenario rewards, with no passive income until playtest data justifies it.

**Recommendation:** Option 3 as an application policy, not a canonical V5 claim. Keep amounts unset until a small preview economy simulation is approved.

**Approved disposition (project owner, 2026-08-12):** `public-v1-economy@1` grants 20 Req once after verification, charges 20 Req for the one-account Battalion charter, grants 5 Req for completing a mission, grants an additional 20 Req for a campaign victory, and provides no passive income. These are application balance values, not a claim that V5 supplied the numbers.

**Acceptance:** every grant has a source event/receipt; totals balance under replay/concurrency; no client or schema default creates Req.

### DEC-002 — Unit prices and purchase timing

**Sources:** RC-V5-016 plus the owner approval recorded on 2026-08-12. The thirteen canonical class prices are published only by the application policy; companion-only classes remain unpriced.

**Options:**

1. Explicit price table approved per class after scenario playtesting.
2. Grant-only public v1: scenarios/onboarding grant approved units; general purchase stays unadvertised.
3. Relative tier/budget drafting system, requiring a new product rules profile rather than currency prices.

**Recommendation:** Option 2 for the first complete K-17 slice, then approve Option 1 only with recorded balance evidence. Never derive prices from stats or companion prose.

**Approved disposition (project owner, 2026-08-12):** Option 1 is activated for the thirteen canonical non-orbital V5 classes: Infantry/Medic/Engineer 4; Artillery/Logi 6; Light Vehicle/IFV 8; MBT/Light Mech/VTOL 10; Fighter/Bomber 12; Heavy Air Transport 14. Purchases are reserve acquisitions, debit the actor ledger atomically, and require the published executable catalogue row. The onboarding starter remains free and is explicitly recorded as a grant.

**Acceptance:** every public catalogue row has either an approved price/source or an unavailable reason; null never maps to zero.

### DEC-003 — Equipment, refit and ship-module prices

**Sources:** RC-V5-016 and RC-EQP-001–006 (`RULE_CONFLICTS.md:324-362`), Store catalogue rows.

**Options:**

1. Approve a versioned price per activated item/refit/module.
2. Scenario-issued inventory only; purchase endpoints remain unavailable for unresolved items.
3. Separate personal and Battalion inventories/budgets, requiring explicit transfer and loss policy.

**Recommendation:** Option 2 for the narrow activated equipment subset until slot semantics (DEC-017) and economic values are approved; later adopt Option 3 for ship modules.

**Approved partial disposition (project owner, 2026-08-12):** executable equipment with an explicit Store price may be purchased at that published price. Missing-price, blocked, catalogue-only, refit, and ship-module acquisition remains unavailable. Public commands have no developer override.

**Acceptance:** inventory ownership, installation, loss and ledger entries reconcile exactly once; developer overrides are unreachable in production.

### DEC-004 — Rewards, loss, replacement, salvage/refund and Battalion funds

**Sources:** RC-V5-016; V5 persistent-unit intent; product success scenario.

**Options:**

1. Permanent loss with scenario-authored Req rewards; no refunds or salvage.
2. Partial salvage/replacement through explicit result effects and approved percentages/caps.
3. Insurance/reserve-pool policy at Battalion level, a new application rule.

**Recommendation:** Option 1 for public v1 because it introduces no hidden formula. Replacement remains a fresh approved grant/purchase. Revisit after loss-rate playtests.

**Approved disposition (project owner, 2026-08-12):** Option 1. Destruction is permanent, with no refund or salvage. Replacement is a fresh published purchase or an explicit grant. A terminal mission awards 5 Req; a victorious completed campaign adds 20 Req. Each Allied commander receives one actor ledger transaction per campaign result.

**Acceptance:** destroyed units and installed gear are never restored or paid twice; reward/replacement effects are hashed and idempotent.

### DEC-005 — Strategic travel time, route cost and supply

**Sources:** V5 strategic overview `Meta - Core Rules (V5).md:513-523`; development routes `development-strategic-world.sql:258-284` intentionally store null/BALANCE_REQUIRED. No stable conflict ID currently records this gap.

**Options:**

1. Scenario-authored integer rounds per route, with no generic distance formula.
2. Movement-profile speed plus route distance/hazard formula, requiring approved units/scales/modifiers.
3. Route bands (short/medium/long) mapped by each scenario to approved integer rounds.

**Recommendation:** Option 1 for the first two-planet vertical slice. It is explicit, versioned and does not pretend the source specifies a universal scale. Create a stable `RC-STRAT-*` record before seeding values.

**Acceptance:** null routes remain impassable; each travel step consumes only approved supply; replay and arrival timing are deterministic.

### DEC-006 — Structures, construction and repair

**Sources:** RC-BUILD-002 (AA effect), 004 (roads), 005 (sensor radius), 006 (durability), 007 (repair conversion), `Build and Supply System.html` as historical material.

**Options:**

1. Activate only source-complete structures, keeping durability/attack/repair unavailable where unknown.
2. Approve a scenario-owned durability/effect profile per structure.
3. Adopt the historical Build/FS model as a separately named legacy profile, never silently in V5.

**Recommendation:** Option 1 for K-17, Option 2 for later combined arms. Do not mix the historical profile into V5.

**Current bounded activation:** Option 1 is applied only to source-complete Sandbag Lines, Trenches, Razor Wire and Tank Traps. They cannot be attacked or repaired because durability remains unknown. Bridge damage and every historical structure remain separately blocked, so DEC-006 stays pending for the wider construction system.

**Acceptance:** construction progress, placement, effects, damage and repair share one pinned definition and emit provenance-bearing events.

### DEC-007 — Terrain, cover, high ground, roads, rivers and LOS

**Sources:** RC-V5-005 cover, RC-V5-014 scenario LOS, RC-V5-021 high ground, `GAME_SYSTEMS.md:193-203`; historical terrain values are not active automatically.

**Options:**

1. Every scenario defines terrain movement/LOS/cover/capacity values explicitly.
2. Publish a reusable V5 application terrain profile, then scenarios opt in and override only allowed fields.
3. Use historical HTML terrain values in a separate legacy profile.

**Recommendation:** Option 2, with K-17 as the first validated profile. Remove the engine's unconditional road/elevation/river defaults until the profile is pinned.

**Acceptance:** missing terrain data fails validation; no global fallback value changes movement or LOS.

### DEC-008 — Cargo/supply retention and carrier destruction

**Sources:** RC-V5-029 excess FS-linked Supply and RC-V5-030 carrier-destruction outcome (`RULE_CONFLICTS.md:542-552`).

**Options:**

1. Freeze cargo in an `ADJUDICATION_REQUIRED` state; no automatic casualties or escape.
2. Scenario-specific deterministic consequence table by carrier/cargo/environment.
3. Automatic destruction with carrier, which is simple but unsupported by the current source.

**Recommendation:** Option 1 until the owner approves a source-backed consequence policy. It preserves state without inventing outcomes.

**Acceptance:** carrier destruction emits one explicit event/effect, blocks cargo use, and never duplicates or silently deletes units/supply.

### DEC-009 — Hazardous drops and aerospace operations

**Sources:** RC-V5-018 hazardous HAT drops, RC-V5-017 VTOL cargo mode, RC-V5-023 aerospace reload, RC-V5-028 interception; V5 class sections `:432-482`.

**Options:**

1. Public v1 permits clear, validated deployment only; hazardous drops remain blocked.
2. Approve a deterministic hazard table keyed by terrain/altitude/cargo.
3. Scenario scripts define drop outcomes within a validated effect grammar.

**Recommendation:** Option 1 for the first release. Activate flight paths, landing, arcs, facilities and clear drops before adding hazards.

**Acceptance:** server validates entire route, cargo kind/capacity, terrain, facility and exposure; no client-computed risk/result.

### DEC-010 — Ship acquisition, hulls, modules and upgrade economy

**Sources:** RC-UNIT-014 hull/orbital gaps, Store/module catalogue and ship system docs.

**Options:**

1. One scenario/onboarding-issued Battalion hull, with approved modules only.
2. Req-priced hull/module catalogue and Battalion-fund purchase workflow.
3. GM-issued hulls plus earned modules from operations.

**Recommendation:** Option 1 for the strategic vertical slice, without claiming the fixture hull statistics are canonical. Module mutations require DEC-003/DEC-017.

**Acceptance:** unique primary ship, stable registry/history, exact slot claims and receipts; no fixture-only module grants in production.

### DEC-011 — Large Supply and Atmo-Fuel

**Sources:** RC-SUP-004 (`RULE_CONFLICTS.md:315-320`) and RC-V5-015 (`:457-461`).

**Options:**

1. Keep orbital fuel/large supply untracked and prohibit mechanics that require them.
2. Approve finite capacities/consumption/refill per hull/facility.
3. Scenario-defined strategic supply only, without hull fuel for public v1.

**Recommendation:** Option 3 initially. Do not activate low-orbit/Atmo-Fuel actions until Option 2 is fully specified.

**Acceptance:** capacity and consumption are data-defined, non-negative and reconciled under retry; missing values block movement/actions.

### DEC-012 — Orbital Crew, hulls and Fire Critical

**Sources:** RC-UNIT-014 and RC-V5-007.

**Options:**

1. Keep Orbital Crew/hulls catalogue-only and unadvertised.
2. Approve a complete hull/crew/subsystem/weapon/cooldown/critical profile.
3. Introduce a separate playtest profile unavailable to public campaigns.

**Recommendation:** Options 1 and 3 until sufficient playtest data exists. No partial orbital combat in the public rules profile.

### DEC-013 — Boarding and orbital combat

**Sources:** RC-V5-026 and V5 orbital text `:525-538`.

**Status:** deliberately post-v1. Schema/types may be designed, but no public control or advertised capability should appear until movement, shutdown, capture, carried-unit consequences and recovery are approved end to end.

### DEC-014 — War victory, season reset and archive

**Sources:** product intent in `gameplan.md` and the completion goal; V5 does not define an online season policy.

**Options:**

1. Perpetual war with archived completed operations and no global reset.
2. Versioned seasons that archive canonical events/history and reset only strategic world state.
3. Operator-created campaigns with independent win/archive policy.

**Recommendation:** Option 3 for initial public operation, evolving to Option 2 only after a complete restore/reconciliation rehearsal.

**Acceptance:** no active unit/campaign/effect is orphaned; player unit/service/memorial history is immutable across archive/reset.

### DEC-015 — Report declassification and export

**Sources:** V5 fog/intelligence intent, product report requirements, current event visibility model.

**Options:**

1. Preserve event-time audience forever.
2. Scenario-controlled declassification after campaign completion.
3. Role-controlled GM publication of a separately projected public report.

**Recommendation:** Option 1 as the safe default, with Option 2 only through a versioned scenario policy. Raw canonical events/seeds/journals are never direct exports.

**Acceptance:** every projection uses event-time knowledge; export tests cover allied/enemy/observer/admin and post-campaign policy.

### DEC-016 — Privacy, retention, account rights, audience and assets

**Sources:** production stores email, session, IP/UA-derived audit metadata; repository has no privacy/terms/support/security policy or asset-rights manifest.

**Owner/legal decisions required:** jurisdiction, intended age/audience, data categories/purposes, retention durations, account export/delete/anonymisation, historical game records after deletion, moderation/support/security contact, transactional email rules, asset ownership/licensing, and open-source copyright attribution.

**Recommendation:** do not invite the public until minimum privacy/support/security information, session/data controls and asset quarantine/manifest are approved. Legal advice may be required; engineering should not invent legal policy.

### DEC-017 — Optional-equipment slots and class access

**Sources:** RC-EQP-001 is BLOCKED (`RULE_CONFLICTS.md:324-329`). Phase-2 seed marks companion slots catalogue-only, but runtime currently selects and enforces them.

**Options:**

1. Disable all optional equipment installation until canonical slot budgets are approved.
2. Adopt an explicitly named application-defined slot policy, versioned separately from canonical V5.
3. Activate only items whose source specifies an unambiguous class/slot and whose class has an approved budget.

**Recommendation:** immediately fail closed using Option 3; pursue Option 2 only with explicit owner approval. Current runtime violates the recorded blocked disposition.

**Acceptance:** eligibility ignores catalogue-only slots; every equipped item cites the approved slot policy; migrations preserve invalid legacy rows for adjudication rather than silently legitimising them.

### DEC-018 — Vehicle Optics and Drone Operator

**Sources:** Store row 43 says Optics provides a reveal action; it does not say passive `+1 Sensors`. Store row 23 assigns Drone Operator to Primary; D1 assigns Secondary. Current Scan/Drone handlers emit events but do not change visibility.

**Options:**

1. Follow Store literally: remove passive sensor bonus, make Optics a server-resolved edge-of-LOS reveal; move Drone to Primary and implement its reveal state.
2. Approve the existing passive/Secondary adaptations as a new application ruling.
3. Mark both unavailable until a scenario-intelligence model exists.

**Recommendation:** Option 3 immediately, then implement Option 1 with event-time remembered-intelligence tests. Do not preserve unsupported behavior merely because it currently compensates for a no-op action.

### DEC-019 — Campaign-end ammunition, supply and facility coverage

**Sources:** unresolved items recorded in `RULE_INTERPRETATIONS.md:17-23`.

**Options:**

1. Retain exact ammo/supply across campaigns; explicit facility/service actions restore them.
2. Scenario result defines recovery/rearm amounts and facility access.
3. Full automatic restoration, which conflicts with the persistent logistics intent unless explicitly approved.

**Recommendation:** Option 1 with Option 2 for scenario rewards. Facility capability must be server-derived from ship/location state.

### DEC-020 — Production scenario/world content authority

**Sources:** production seed chain creates no campaigns, insertion zones, strategic maps, nodes or ships; all current world content is explicitly development-only.

**Current local experiment:** the development K-17 fixture now exercises a four-round hold-the-primary-objective policy with deterministic capture and terminal outcomes. This is test content only: it does not approve four rounds, the outcome predicates, rewards, waves, force access, or K-17 as production content.

**Options:**

1. Versioned production scenario/content packs, separately seeded from canonical rules and never development fixtures.
2. GM authoring/publishing workflow with immutable content hashes.
3. A curated initial pack plus later GM-authored content.

**Recommendation:** Option 3. Ship public K-17 and a two-planet preview world as curated, versioned product content; add authoring only after validation/publication controls exist.

**Acceptance:** campaigns pin source/version/hash; production never depends on `development-*.sql`; fixture IDs/lore do not leak into unrelated campaigns.

### DEC-021 — Companion class activation model

**Sources:** `RC-UNIT-015` catalogues sixteen non-V5 classes from `Classes.html`. Several vehicles, aerospace craft and mechs use Force Strength where V5 uses Hits; several attack profiles give AP/range or fixed damage without a complete V5-compatible weapon definition; artillery rows display zero cost and mech rows use dotted cost notation.

**Options:**

1. Keep all companion classes as visible catalogue expansions until a separately versioned companion rules profile defines durability, attacks and economy.
2. Convert companion FS chassis to Hits and dotted/zero prices to Req through a new application balance policy.
3. Activate only personnel classes that already fit V5 Force Strength, with each special mechanic independently implemented, while the vehicle/mech/aerospace set remains blocked.

**Recommendation:** Option 3 as the next expansion after the V5 public loop is complete. Start with Sappers and Special Forces; do not infer vehicle Hits, weapon dice, dual-cannon behavior or prices. Record any later conversions in a named profile rather than editing V5 truth.

**Acceptance:** every activated companion class has an explicit durability/attack/economy source, generated handler, persistent state, tactical UI/report coverage and a scenario proving its signature mechanic. Catalogue presence or generated artwork alone never grants execution or purchase.

### DEC-022 — Standard Melee Weapon attack profile

**Sources:** V5 defines Melee Charge timing, contact and Armor/Defense handling, while Store `Standard Melee Weapons` supplies the price, Primary slot and Infantry restrictions. Neither source supplies a player weapon damage die or explicit damage value. The Bug melee profile is enemy-specific and is not authority for player equipment.

**Options:**

1. Approve a single versioned damage die/profile for Standard Melee Weapons.
2. Make the attack scale from current Force Strength using a precisely approved formula.
3. Keep the item purchasable only as catalogue content and leave Melee Charge unavailable.

**Recommendation:** Option 1 after a short playtest against Infantry and armored targets. Do not reuse Bug Claws or infer a value from Req price.

**Acceptance:** the approved profile is published in the catalogue, Melee Charge and Brawl execute and persist end to end, defensive fire follows RC-V5-008, and external ranged attacks cannot target a Brawl.

### DEC-023 — Smoke Grenade duration

**Sources:** Store `Smoke Grenades` supplies price, Secondary slot, Infantry restriction, affected hexes, LOS effect, range-one exception and immunity of indirect fire. It does not state when the smoke clears. RC-EQP-006 already blocks guessed timing values.

**Options:**

1. Smoke lasts through the end of the current round.
2. Smoke persists through the end of the following round.
3. Smoke persists until a separate explicit clear/disperse effect.

**Recommendation:** Option 2 gives opposing commanders one planning window to react and matches the persistence implied by placing smoke as a tactical action, but remains inactive until explicitly approved.

**Acceptance:** a versioned duration is stored on authoritative hex state, LOS and indirect-fire targeting consume it, reports show placement/expiry, and retries cannot extend the effect.

## Provisional V5 rulings requiring owner confirmation

These already have recorded provisional dispositions. Confirming them does not mean their mechanics are implemented.

| Conflict | Provisional ruling | Runtime state |
|---|---|---:|
| RC-V5-001 | Armor and Defense add after AP | basic resolver uses it |
| RC-V5-002 | Rush doubles post-mitigation FS/Hits | resolver uses it; ground-only guard missing |
| RC-V5-003 | One activation, one roll per eligible weapon | runtime supports only one weapon |
| RC-V5-004 | Evasive `-2` is outgoing damage | not executable |
| RC-V5-005 | Cover grants non-stacking `+1 Armor` | implemented for generated terrain/structure cover; directional edges remain open |
| RC-V5-006 | Subsystem trigger requires penetration and natural 5/6 | helper/data only |
| RC-V5-011 | Artillery control/direct fire spends one Small Supply | not end to end |
| RC-V5-012 | Bombardment Defense floor/recovery | not end to end |
| RC-V5-017 | VTOL modes are mutually exclusive infantry or Supply | adapter cannot represent them |
| RC-V5-019 | Dig In duration/preservation/stacking | implemented for Infantry/Medic/Engineer and connected Trenches |
| RC-V5-020 | Enemy split-fire, round-robin and ties | AI incomplete |
| RC-V5-021 | High-ground `+1 attack` modifies Damage | implemented in governed ground attack calculations |
| RC-V5-022 | Any Infantry upgrades trench at no extra Supply | active end to end |
| RC-V5-023 | Aerospace reload at scenario airfield without crate quantity | not implemented |
| RC-V5-025 | Adjacent Engineer pays Standard Action to Dig In deployed stationary Artillery | implemented end to end; no Supply inferred |
| RC-V5-027 | Rapid Fire doubles pre-mitigation Damage | implemented for governed Rapid Fire versus Horde tags |
| RC-V5-028 | Interceptor declaration/timing/multiple interceptors | not implemented |
| RC-V5-029 | Retain excess FS-linked Supply and block further loading | incomplete |
| RC-V5-031 | Distance-increment simultaneous hostile movement | endpoint-only resolver differs |

## Resolved rulings that need implementation, not a new decision

RC-V5-008 melee timing, RC-V5-009 heal contact, RC-V5-010 load/unload payer, RC-V5-013 HAT capacity usage, RC-V5-014 scenario LOS, and RC-V5-024 crew repair already have dispositions. Implementations must cite those IDs and must not reopen them through hidden defaults.

## Product policies already present

The three NPC onboarding Battalions, starter-unit whitelist/grant, and 100-Req Battalion charter are application anti-abuse/onboarding policies, not canonical V5 lore or class prices. They may remain deployed while clearly labelled as product policy, but must be revalidated with DEC-001–DEC-004 before a general Req economy is advertised.

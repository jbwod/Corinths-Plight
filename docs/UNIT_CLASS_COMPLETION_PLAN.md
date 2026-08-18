# Unit Class Completion Plan

## Objective

Move every player unit class from `PARTIAL` or `CATALOGUE_ONLY` to an honest, test-backed `IMPLEMENTED` state without inventing rules that the source material does not define.

The current catalogue contains 29 player classes:

- 13 V5 canonical classes. All thirteen now use bounded, versioned executable profiles and are `IMPLEMENTED`, purchasable, and playable end to end. Features belonging to rejected companion profiles or inactive strategic/orbital domains are explicitly excluded rather than keeping a ground-tactical class falsely partial.
- 16 companion classes from `Classes.html`. All sixteen now use approved, versioned `public-v1` conversion profiles and are `IMPLEMENTED`, purchasable, and executable. Medium and Heavy Mechs use the bounded `companion-v1-mechs@1` fitted-weapon conversion rather than deriving damage from legacy Force Strength prose.

Enemy Bug roles and Orbital Crew/hulls are adjacent programs, not part of this 29-class promotion. They need their own completion plans because they use different AI and strategic/orbital systems.

## What `IMPLEMENTED` must mean

A class may only be promoted when every gate below passes for the active, versioned rules profile.

1. **Rules authority** — health, armour, speed, sensors, attacks, slots, price, restrictions, and each advertised ability have a cited source or an approved application rule decision.
2. **Generated catalogue** — one authoritative generated definition declares the class, its actions/orders, handler, economy policy, availability, and no unresolved `missing` mechanics.
3. **Runtime execution** — every advertised action is validated and resolved on the server; no UI-only or descriptive ability is counted as implemented.
4. **Persistent state** — damage, ammunition, supplies, cargo, stance, facing, projects, facilities, statuses, equipment, and campaign consequences survive save/reload as applicable.
5. **Economy and ownership** — the class has a published requisition cost, can be acquired exactly once per command, appears in the force roster, and obeys equipment slots and restrictions.
6. **Deployment and transport** — deployment eligibility, capacity conversion, embark/disembark, towing, drops, destruction, and recovery rules are enforced where applicable.
7. **Player UI** — force catalogue, unit detail, deployment planner, tactical composer, legal-target previews, disabled-state reasons, event log, replay, and report surfaces all use live rules data.
8. **Scenario and AI interaction** — at least one authored scenario exercises the class's signature mechanic and enemy behavior responds legally to it.
9. **Visual and accessibility coverage** — art, tactical glyph, short code, alt/accessible label, damaged/destroyed presentation, and responsive layouts are present.
10. **Automated proof** — unit, resolver, persistence, route/contract, generated-catalogue, and browser journey tests cover happy paths plus illegal and edge cases.
11. **Release evidence** — generated files and D1 seeds agree; catalogue checks, seed checks, typecheck, tests, and the relevant browser suite pass.

`IMPLEMENTED` is therefore a release claim, not a synonym for “has stats” or “can appear on the map.”

## Current state

### Canonical V5 classes

| Class | Existing executable slice | Work still required | Recommended next state |
|---|---|---|---|
| Infantry Squad | FS, attack, movement, facing, Dig In, trench upgrade | **IMPLEMENTED** — garrison edge cases, hostile trench passage, active Flak/Light AT authority, finite ammunition, persistence and reporting are live | Complete |
| Combat Medic | First Aid; medical-supply reload; Dig In; persistence and reports | **IMPLEMENTED** — MASH belongs to the rejected companion profile under `RC-UNIT-002` and is not part of the selected V5 Medic | Complete |
| Engineers | Movement, repair, artillery dig-in, sandbags, razor wire, tank traps, river-edge Field Bridge | **IMPLEMENTED** — Field Bridge costs two Small Supply, requires an authored adjacent river edge, persists on both edge hexes and opens the crossing; inactive structure attacks/repair remain outside the bounded non-attackable fieldwork profile | Complete |
| Artillery | Movement, deploy/pack, bombardment, towing, spotting, area suppression, Funnel | **IMPLEMENTED** — Funnel consumes one Small Supply and maps V5's half-range control to one legal adjacent displacement before combat; anti-orbital fire is explicitly outside the ground-tactical profile under `DEC-012` | Complete |
| Logistics Truck | Cargo, towing, typed partial same-resource resupply, coordinated HAT drop, carrier-loss adjudication | **IMPLEMENTED** — transfers preserve exact resource vocabulary/capacity and the paired route-bound drop is live | Complete |
| Light Vehicle | Hits, attack, movement, subsystems, Rapid Fire, Evasive, governed passenger/Small Supply cargo, persistence/replay/report/AI/scenario proof | **IMPLEMENTED** — generated authority and D1 agree; rejected companion slots are provenance-only; RC-V5-030 freezes cargo and emits adjudication without inventing casualties | Complete |
| Infantry Fighting Vehicle | Hits, armour/AP, attack, movement, subsystems, governed infantry cargo, crew repair, persistence/replay/report/AI/scenario proof | **IMPLEMENTED** — 8 Req acquisition, generated authority, cargo/destruction rules and `RC-V5-024` Armor-exposed Crew Repair are live and proven end to end | Complete |
| Main Battle Tank | Hits, armour/AP, facing/rear attack, subsystems, crew repair | **IMPLEMENTED** — 10 Req acquisition, rear-arc Armor loss, subsystem persistence, Crew Repair, reports/replay and K-17 proof are live | Complete |
| Light Mech | Hits, armour, attack, movement, hostile passage, subsystems, Evasive | **IMPLEMENTED** — governed V5 profile, hostile passage, Evasive and subsystem/repair lifecycle are live and proven in K-17 | Complete |
| Aerospace Fighter | Flight path, hostile passage, forward arc, ammo, landing/takeoff, rearm, intercept, no ground spotting | **IMPLEMENTED** — 12 Req acquisition, legal interception, finite ammo, airfield cycle, persistence and reporting are live | Complete |
| Aerospace Bomber | Flight path, hostile passage, fly-over attack, ordnance, landing/takeoff, rearm, no ground spotting | **IMPLEMENTED** — 12 Req acquisition, Advance-route ground-only bombing, finite ordnance and airfield cycle are live without inventing blast radius | Complete |
| VTOL | Hits, armour, attack, flight, landing/takeoff, alternate cargo | **IMPLEMENTED** — HAT taxonomy drift removed; hostile passage, VTOL landing and mutually-exclusive Infantry/Small Supply cargo are live | Complete |
| Heavy Air Transport | Flight, five-slot cargo, clear-route airdrop, coordinated Logi supply drop, landing/takeoff, no ground spotting, carrier-loss adjudication | **IMPLEMENTED** — hazardous destinations reject under `RC-V5-018` instead of inventing casualty results | Complete |

All thirteen canonical classes are complete under their selected executable profiles. MASH is not part of the selected V5 Medic, attackable/damageable Bridges are not part of the bounded fieldwork lifecycle, and anti-orbital fire is not part of the ground-tactical Artillery profile. Those are future facility/orbital-domain features, not hidden incomplete actions on the shipped classes.

### Completed class evidence

#### Light Vehicle — `IMPLEMENTED`

- [x] V5 Hits/Speed/HMG/Range/Rapid Fire/Subsystems/Evasive/cargo profile selected by `RC-UNIT-006`; companion Stealth and equipment slots are excluded from executable capacity.
- [x] `public-v1-economy@1` publishes 8 Req; exact-once acquisition and starter ownership are live.
- [x] Generated `v5-core-curated@2` authority binds the generated unit handler, executable orders/actions and an empty `missing` list.
- [x] Rapid Fire, Evasive, subsystem damage, passenger-or-Small-Supply cargo, movement, attacks and destruction execute server-side.
- [x] Health, subsystem, cargo, supply, ammunition, location and destruction consequences persist through the campaign effect journal.
- [x] `RC-V5-030` carrier loss freezes carried records and emits an adjudication event; it does not invent passenger casualties or unload them.
- [x] Force catalogue, loadout/readiness, deployment planner, tactical composer, map glyph, event feed, replay and report use live state; blocked Optics/Scan is not advertised as executable.
- [x] K-17 exercises NOMAD's Evasive movement and Rapid Fire against legal enemy AI, with deterministic resolver/report proof and the existing accessible unit artwork.
- [x] Catalogue, class, Store, seed, typecheck, unit/integration and browser promotion gates pass at the promotion commit.

#### Infantry Fighting Vehicle — `IMPLEMENTED`

- [x] V5 Hits 3, Armor 2, Speed 2, Cannon AP 1/Range 2, subsystem, infantry transport and Crew Repair rules are published without adopting unsourced companion equipment slots.
- [x] `public-v1-economy@1` publishes 8 Req; exact-once purchase, debit, ownership and force-roster projection are live.
- [x] Generated `v5-core-curated@2` authority binds the executable unit handler, Hold/Advance/Rush, Attack/Load/Unload/Crew Repair and an empty `missing` list.
- [x] Movement, attacks, Armor/AP, subsystem damage, governed full-squad embark/disembark and Crew Repair validate and resolve server-side.
- [x] Crew Repair is stationary, Primary, unavailable without a damaged subsystem, restores one subsystem, exposes the crew to Armor 0 for the round and cites `RC-V5-024` in deterministic events.
- [x] Health, subsystem state, cargo, location, ammunition and destruction consequences persist through the effect journal and survive force inspection/reload.
- [x] Carrier destruction uses the common `RC-V5-030` fail-closed adjudication: cargo records freeze without invented passenger casualties or an automatic unload.
- [x] Force catalogue, live readiness, deployment planner, tactical composer, map art/glyph, legal disabled states, event feed, replay and round report expose the same governed behavior.
- [x] K-17 deploys CARR-6, exercises Armor-exposed Crew Repair while legal enemy fire resolves, persists MOBILITY recovery, and proves the result through the report and replay UI.
- [x] Catalogue, class, Store, seed, typecheck, unit/integration and focused browser promotion gates pass at the promotion commit.

There is also catalogue/seed drift to remove. For example, the Heavy Air Transport's generated top-level status is `PARTIAL`, while its nested seed correction says `IMPLEMENTED`. Status must be computed from one source and checked for parity.

The validation toolchain also spans two ruleset identifiers: `catalogue:check` currently validates `v5-core-curated@2`, while `seed:check` reports `v5-core-curated@1`. Both commands can pass without proving that the generated runtime catalogue and seeded D1 authority are the same profile. Wave 0 must align the identifiers or add an explicit, tested migration/binding between them.

### Companion classes

The companion conversion batch is now playable for all 16 classes. Every class has a published requisition price, generated handler, server-side mechanics, persistence hooks, force/tactical UI integration, and an empty generated `missing` list.

| Family | Classes | Current state |
|---|---|---|
| Personnel | Power Armoured Infantry, Irregular, Special Forces, Sappers | **IMPLEMENTED** — Req 10/4/8/6; Shield Wall and clamps, recruitment/progression, stealth/delayed charges, and persistent Sapper construction/mines execute under explicit public-v1 profiles |
| Armour | Light Battle Tank, Heavy Battle Tank, Super Heavy Tank | **IMPLEMENTED** — Req 10/14/20; approved Hits chassis, D4/D8 weapons, server-owned dual Super Heavy shots, subsystems, rear weak spots, and transport restrictions are live |
| Mechanized infantry | Mechanized Infantry | **IMPLEMENTED** — Req 10; armoured Hits chassis, D4 autocannon, mixed equipment rules, subsystems, and Forward Line objective control are live |
| Artillery | Light Artillery, Heavy Artillery, Self-Propelled Artillery | **IMPLEMENTED** — Req 8/12/10; deploy/pack, split area fire, finite SPG ammunition, abandon/replace lifecycle, and transport policy are live |
| Mechs | Medium Mech, Heavy Mech | **IMPLEMENTED** — Req 14/18; approved Hits chassis, five purchasable Store-derived public-v1 weapons, fitted subset/all fire, Supply Point reload, leg-height LOS, Medium crouch cover, subsystems, clamps and Heavy Lift transport are live |
| VTOL transports | Troop Airlift, Multi-Purpose Airlift, Heavy Lift | **IMPLEMENTED** — Req 12/12/14; governed cargo modes, landing/takeoff, rearm, route-bound rappel, external heavy lift, objective cargo, and carrier-loss adjudication are live |

The public-v1 conversions are additive and do not rewrite the V5 source profile. `companion-v1-mechs@1` resolves `RC-EQP-002` for a bounded weapon family: Heavy Machine Weapon D4/Range 1, Autocannon D6/AP2/Range 2, and Light/Medium/Large Lasers D4/D6/D8 at Range 1/2/3. Their finite magazine/heat counters reset only at a friendly governed Supply Point. Exotic melee, missile, jump-jet and internal upgrades remain separate equipment work and are not class capabilities.

### Companion conversion checkpoint — 2026-08-12

- [x] All sixteen companion definitions publish exact Req prices, `AVAILABLE` acquisition, executable handlers, and empty generated `missing` lists.
- [x] Purchase and owner-scoped progression/economy paths debit requisition atomically and preserve unit identity/history.
- [x] Tactical grammar, resolver, persistence events, replay/report descriptions, and live composer metadata cover the activated class actions.
- [x] Generated JSON/TypeScript, class/Store seeds, onboarding economy, catalogue, class, seed, and TypeScript checks agree at catalogue hash `8440564c5b53b682346b0a2afd68d9cb0099070025a6cb45804e558737cfd848`.
- [x] Medium/Heavy Mech fitted weapons, loadout effects, multiweapon intent, Supply Point reload, force UI metadata and Req 14/18 acquisition are integrated under `companion-v1-mechs@1`.

## Cross-class foundations

These should be built once and reused instead of implementing bespoke class code.

### UC-000 — Status truth and catalogue parity

- Define a machine-checkable completion manifest for every class and signature mechanic.
- Make generated catalogue data the only class-status authority; remove or derive duplicated status copy in `src/forces/model.ts` and nested publication corrections.
- Reject `IMPLEMENTED` when a class has missing mechanics, null executable actions, balance-required price, missing handler, missing UI capability metadata, or missing test/scenario evidence.
- Add generated JSON ↔ generated TypeScript ↔ D1 seed parity tests.
- Make catalogue and seed checks fail if they validate different active ruleset versions without an explicit compatibility binding.
- Correct the generic VTOL/HAT missing-mechanic classification.
- Retire or strictly fence the legacy static class definitions in `packages/rules-engine/src/catalogue.ts`.

### UC-010 — Common combat grammar

- Finish directional cover, terrain/high-ground/LOS, remembered intelligence, legal spotting, split fire, area-hex attacks, minimum range, multiple attacks, attack arcs, and melee timing.
- Define reusable ammunition profiles and rearm rules.
- Persist every combat status and emit deterministic events suitable for replay and reports.
- Resolve `DEC-007`, `DEC-022`, and `DEC-023` before dependent classes are promoted.

### UC-020 — Structures, facilities, and fieldwork

- Resolve `DEC-006`: cost, build time, health, armour, footprint, facing, prerequisites, damage, destruction, repair, and abandonment.
- Implement Bridge, MASH, mines, stealth construction, and the sappers' allowed structure list on the same project/facility model.
- Make field projects targetable and persistent, with scenario ownership and campaign-end consequences.

### UC-030 — Logistics, cargo, and recovery

- Implement typed supply transfer, compatible ammunition reload, medical/build supply, capacity conversion, partial transfers, and clear failure reasons.
- Complete carrier destruction, excess FS-linked supply, cargo loss/survival, towing, external lift, objective cargo, and transformation/abandonment rules.
- Implement coordinated supply drops and hazardous airdrop results.
- Resolve `DEC-008`, `DEC-009`, and `DEC-019`.

### UC-040 — Equipment and refit

- Resolve price/mutation timing, slot budgets, class access, optics/drone behavior, and campaign refit facilities.
- Derive unit ability presentation from the equipped, executable rules profile; stop presenting stale hard-coded ability status.
- Cover purchase, assignment, removal, ammunition, damage, replacement, and save/reload.
- Resolve `DEC-003`, `DEC-017`, and `DEC-018`.

### UC-050 — Companion conversion profile

- Create a new versioned profile, such as `v5-companion@1`; do not mutate the curated V5 source profile in place.
- For each companion class, publish an approved conversion sheet containing Hits/FS model, attacks, AP, range, speed, sensors, armour, slots, tags, cargo, abilities, restrictions, requisition cost, and source/decision references.
- Add handler/action/order links only after the profile is complete.
- Keep incomplete classes discoverable but fail closed for purchase, deployment, and tactical commands.

### UC-060 — UI, reports, and scenario proof

- Replace showcase/mock status with hydrated catalogue and campaign state on every real screen.
- Give each class a legal-action preview and a visible reason when an action is unavailable.
- Ensure event log, replay, battle report, veteran history, memorial, and requisition ledger describe class-specific outcomes.
- Add one compact signature scenario per mechanic family, then one combined-arms regression scenario.
- Use the existing distinct art/glyph mappings for all 29 classes; add state variants and accessibility proof rather than commissioning a new base set.

## Delivery waves

### Wave 0 — Make status honest

Deliver UC-000 first. Establish the completion manifest, eliminate status drift, fix the VTOL classification, and record a red/green gate for each of the 29 classes. No class is promoted during this wave unless all evidence already exists.

**Exit gate:** one command reports exactly why every class is `PARTIAL`, `CATALOGUE_ONLY`, or `IMPLEMENTED`, and generated/D1/runtime/UI status cannot disagree.

### Wave 1 — Prove and promote the near-complete canonical classes

Light Vehicle, IFV, MBT, Light Mech, Fighter, and Bomber have passed this wave. Their focused mechanic suites feed one shared combined-arms browser journey so the expensive seeded scenario is not rebuilt and rerun after every individual engine edit.

**Exit gate:** each promoted class has no missing mechanics and passes acquisition → deployment → tactical action → persistence/reload → report/replay browser coverage.

### Wave 2 — Finish shared canonical mechanics — complete

Build common garrison, equipment, structure/facility, logistics, cargo-loss, hazardous-drop, area/spotting, and orbital-target integration primitives. This wave resolves the blockers rather than adding one-off class branches.

**Exit gate:** the shared mechanic suites pass independently of a named class, including illegal commands and destruction/recovery cases.

### Wave 3 — Complete the remaining canonical classes — complete

Completed in dependency order:

1. Infantry Squad — Garrison and active equipment.
2. Logistics Truck — general resupply and coordinated drops.
3. Combat Medic — First Aid profile complete; rejected companion MASH excluded.
4. Engineers — Field Bridge and bounded non-attackable fieldwork lifecycle complete.
5. Heavy Air Transport — clear and coordinated drops complete; hazardous outcomes reject deterministically.
6. Artillery — Funnel complete; anti-orbital capability excluded from the ground-tactical profile pending the orbital combat program.
7. Generic VTOL — **complete** after taxonomy correction and aerospace/cargo audit; it does not inherit HAT airdrop mechanics.

**Exit gate:** achieved — all 13 V5 canonical classes publish `IMPLEMENTED`, executable, purchasable overlays with empty `missing` lists.

### Wave 4 — Activate companion personnel — complete

Create the companion profile and implement:

1. Special Forces — stealth/reveal, sabotage, delayed charges.
2. Sappers — mines, build supply, stealth construction, structure list.
3. Irregular — training/class evolution and campaign persistence.
4. Power Armoured Infantry — mounting/drop/mech interactions after transport/orbital dependencies are available.

**Exit gate:** each class has approved attacks and price, equipment rules, persistent signature mechanics, AI reactions, and an authored scenario.

### Wave 5 — Activate companion chassis families — complete

Implement shared conversion profiles before individual classes:

1. Armour conversion → Light, Heavy, and Super Heavy Battle Tanks.
2. Artillery grammar → Light, Heavy, and Self-Propelled Artillery.
3. Mech conversion → Medium and Heavy Mechs.
4. VTOL transport conversion → Troop, Multi-Purpose, and Heavy Lift variants.
5. Mixed formation model → Mechanized Infantry.

Within each family, implement the simplest chassis first and reuse its durability, movement, subsystem, loadout, reporting, and AI integrations.

**Exit gate:** all 16 companion classes are executable and purchasable only under the versioned companion profile, with no implicit V5 overrides.

### Wave 6 — Balance and public-release hardening

- Run automated matchup matrices and campaign economy simulations using the published requisition costs.
- Playtest combined-arms rosters, transport loops, artillery saturation, stealth objectives, aerospace dominance, and replacement/rearm pressure.
- Validate migration from existing saves and reject incompatible profile changes clearly.
- Finish production scenarios/world authority under `DEC-020`.
- Run accessibility, responsive browser, latency/concurrency, replay determinism, and production D1 verification.

**Exit gate:** all 29 classes pass the release matrix in a production-like environment and no class depends on showcase/mock data.

## Per-class implementation checklist

Use this checklist as the issue template for every class:

- [ ] Source profile and decisions approved
- [ ] Health/armour/speed/sensors/price published
- [ ] Attacks, equipment slots, restrictions, cargo and signature abilities specified
- [ ] Generated definition and handler/action/order links present
- [ ] Purchase, ownership, veteran history and replacement behavior implemented
- [ ] Deployment, embark/drop/tow rules implemented where applicable
- [ ] Resolver validates and executes every advertised action
- [ ] Damage, ammo, supplies, cargo, statuses and projects persist through reload
- [ ] Legal actions and failure reasons appear on real tactical/force screens
- [ ] Deterministic events feed replay, battle reports and campaign history
- [ ] Enemy AI handles the class and its signature effects legally
- [ ] Unit, property/edge, persistence, API/contract and browser tests pass
- [ ] Signature scenario passes from a clean database
- [ ] Art/glyph/accessibility/state presentation verified
- [ ] Catalogue, generated TypeScript and D1 seed parity pass
- [ ] `missing` is empty and completion manifest permits `IMPLEMENTED`

## Required verification commands

The exact suite may grow as the work lands, but a promotion should at minimum run:

```sh
npm run catalogue:check
npm run classes:check
npm run store:check
npm run seed:check
npm run typecheck
npm test
npm run test:browser
```

Family-specific resolver, persistence, route, and scenario tests should be runnable separately during development; the complete suite is the release gate.

## Immediate backlog

1. Implement UC-000 and generate the first 29-row completion report.
2. Audit and either promote or produce precise failing gates for the four remaining near-complete canonical classes: MBT, Light Mech, Fighter, and Bomber.
3. Resolve the VTOL/HAT taxonomy error and Heavy Air Transport seed/status mismatch.
4. Replace the hard-coded ability-status catalogue in `src/forces/model.ts` with generated/hydrated capability status.
5. Approve the shared decision order: structures/LOS → logistics/cargo/drop → equipment/refit → companion conversion.
6. Turn each Wave 2 foundation and each class row into a tracked issue using the per-class checklist.

The shortest credible route is: make status trustworthy, promote what is already complete, finish shared canonical mechanics, complete all 13 canonical classes, then activate the 16 companions under a separate rules profile. Promoting catalogue rows before those gates would make the game look more complete without making it more playable.

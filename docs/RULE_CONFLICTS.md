# Rule Conflict and Ambiguity Register

## Purpose

This register is the audit trail for the `v5_core_curated` profile defined in `docs/GAME_SYSTEMS.md`. It covers all six source files under `rules/`. It records both cross-source contradictions and places where V5 itself does not specify enough to implement deterministic behavior.

No entry in this document deletes or rewrites a source value. A disposition selects behavior for one profile while preserving all competing values as provenance.

This register contains **72 stable conflict records**. Their status and disposition describe canonical source decisions, not implementation completion. In particular, `RESOLVED-MVP` means that the profile has selected a value; it does not mean every system using that value is executable in `foundation-0.1.0`. Current execution is the separate overlay below and in `GAME_SYSTEMS.md` section 1.3.

The current D1 core seed is not a complete mirror of this register: it inserts 12 obsolete short conflict IDs, while Phase-2 definitions can cite the namespaced IDs used here. Until the catalogue/provenance reconciliation closes CP-200, this Markdown register remains the canonical decision audit and D1 conflict references must not be presented as complete or referentially sound.

## Status legend

| Status | Meaning |
|---|---|
| `RESOLVED-MVP` | A source value has been selected for `v5_core_curated`; this is not an implementation-complete marker. |
| `PROVISIONAL-MVP` | The profile has a deterministic interpretation, but designer confirmation may change it. When executable, code and data must retain the conflict ID. |
| `CATALOGUED` | All values are preserved for display/research, but none controls play. |
| `DEFERRED` | The system is outside the MVP and has no runtime behavior. |
| `BLOCKED` | Activation is desired or implied, but missing/conflicting data prevents it. |
| `REJECTED-BY-PROFILE` | A value belongs to the legacy engine and must not affect V5 calculations. |

## Foundation implementation overlay (non-conflict)

This overlay records current capability without adding, deleting, closing, or changing any of the 72 source decisions.

| Capability | Foundation status | Conflict-register relationship |
|---|---|---|
| Hold, Advance, Rush | Partial executable subset | Uses the selected V5 order/action economy and Rush decisions; Hold commits submitted final facing; Advance/Rush resolve routes at quarter-distance increments with symmetric hostile/capacity blocking and partial-route stops. Unpinned terrain defaults remain an implementation defect. |
| Attack | Partial executable subset | Server-derived multiweapon Attack; Range/LOS; indirect fire only with a friendly live spotter that has LOS; ammo/cooldown; ground-only high-ground +1; Evasive outgoing -2/target Defense +3; FS cap; Rapid Fire versus Horde; Armor/AP/Defense; generated/scenario-marked non-stacking personnel Cover Armor; governed rear effects; Hits; Rush multiplier; simultaneous damage; persistent natural-5/6 subsystem malfunctions. Split fire, directional cover, melee, firing arcs, and wider aerospace combat remain deferred. |
| Special orders | Partial executable subset | Evasive is executable for governed capable units and loses its modifiers when simultaneous movement stops the unit below its minimum displacement. Melee Charge and Stealth remain `executable=false`. |
| Special/support actions | Partial/deferred | Dig In, Load/Unload, finite-weapon Reload, Combat Medic First Aid and field resupply, Engineer vehicle Repair, Engineer-assisted Artillery Dig In, Sandbag/Razor Wire/Tank Trap construction and Infantry Trench Upgrade, Artillery Deploy/Pack Up/Bombardment, and class-derived Logi resupply for Medics/Engineers/Artillery have resolver/UI/persistence paths. Each directly built fieldwork costs one Small Supply. Wire charges Infantry +0.5 Speed and Tank Traps charge vehicles +1 Speed on entry. Sandbags/Trenches grant Infantry +1 Armor against outside fire. Scan and Deploy Drone remain release-blocked because their advertised state/visibility effects are incomplete. MASH, Bridge, Funnel, unsupported-recipient resupply, Garrison, Assault, Break Out, and other unmigrated actions remain deferred. |
| Movement simultaneity | Partial executable subset | The selected `RC-V5-031` quarter-distance hostile contention, occupied-hostile stops, partial legal routes, Mech/Aerospace passage, and symmetric capacity contests execute. Melee defensive-fire and advanced domain interactions remain deferred. |
| Server trust boundary | Partial | Tactical submission derives trusted compiled definitions and the resolver revalidates normalized orders, but D1 can mark a class executable that compiled lookup cannot resolve, and the current adapter invents or loses authority fields. Client values are not authority; catalogue convergence remains a P0 gate. |
| Determinism/replay | Partial | The narrow pure resolver's exact accepted-revision behavior, same-round event sequence continuation, simultaneous damage, duplicate-resolution guard, and stable effect keys are tested. Campaign order upsert and clock update now have actor-scoped hashed receipts plus compare-and-set, but cancel/pause/resume/resolve do not. Tactical ordering is locale-sensitive, the digest is non-cryptographic, the seed is predictable, and there is no PREPARED/effect-acknowledgement journal. |
| Seed secrecy and hidden information | Partial/unsafe | Stored seeds are omitted from ordinary views and reports, and state projection redacts unseen deployments. Socket invalidations are per-viewer and identifier-free with bounded projected sequence catch-up. Reports still use present-time rather than event-time visibility. |
| Canonical roster and support/aerospace systems | Partial/catalogued | D1 catalogues all thirteen canonical classes plus three companion-only classes, while the compiled tactical catalogue contains five allied definitions. D1-only executable overlays can fail tactical lookup; no legacy class may fill that gap. |

At the current local reconciliation point, the full root suite passes **59 files / 460 tests** (the committed Phase-0 baseline was 32/201). Those results verify only the covered helpers and contracts, not the unimplemented canonical rules or release boundaries described below.

## Phase 2 catalogue overlay (non-conflict)

Migration `0003_phase2_persistent_forces.sql` and companion seed `v5-phase2-combined-arms.sql` add normalized force data without changing any of the 72 source decisions. Four independent database fields prevent a source record from becoming playable merely because it exists:

| Axis | Values | Meaning in the Phase 2 seed |
|---|---|---|
| Definition status | Existing `active`, `experimental`, `legacy`, `incomplete` | What kind of source definition was imported. |
| Implementation status | `IMPLEMENTED`, `PARTIAL`, `CATALOGUE_ONLY` | Whether the minimum defining mechanics exist in the current server/engine. |
| Requisition status | `PUBLISHED`, `BALANCE_REQUIRED`, `NOT_APPLICABLE` | Whether a source-backed price exists. `BALANCE_REQUIRED` always keeps the price `NULL`. |
| Availability status | `AVAILABLE`, `BLOCKED`, `DEV_ONLY`, `HIDDEN` | Whether production requisition may expose the definition. This is not inferred from implementation status. |

The catalogue contains all thirteen non-orbital V5 starting classes plus Power Armoured Infantry, Irregulars, and Special Forces. The latter three remain `CATALOGUE_ONLY`/`DEV_ONLY` because `RC-UNIT-015` has not been overturned. Combat Medic uses the V5 heal selected by `RC-UNIT-002` and `RC-V5-009`; its companion MASH record remains catalogue-only. No companion FS vehicle value replaces a V5 Hits profile.

The seven Bug role records include Drone, Warrior, Spitter, Heavy, Burrower, Flyer, and Artillery. The four new roles contain tags/doctrine only and remain hidden catalogue entries because the product brief supplies no authoritative durability, weapon dice, range, or price. That is incomplete data, not a new conflicting value.

All player-unit requisition prices remain `NULL`/`BALANCE_REQUIRED` under `RC-V5-016`. Store equipment and ship modules retain published row prices; Road Building Equipment retains a `NULL` price because its Store cost cell is blank. Database checks prohibit `purchasable=1` unless both `requisition_status=PUBLISHED` and `availability_status=AVAILABLE`.

No new conflict ID is introduced by this overlay. Cargo, aerospace, healing, construction, repair, and companion-class decisions all map to existing records (`RC-UNIT-002`–`RC-UNIT-015`, `RC-V5-010`, `RC-V5-017`, `RC-V5-018`, `RC-V5-023`, `RC-V5-024`, `RC-V5-029`, and `RC-V5-030`). A seed row or normalized profile is not evidence that its action resolves.

## Source locator conventions

- `V5 > X` means section `X` in `rules/Meta - Core Rules (V5).md`.
- `Classes > X` means the row beginning `X` in `rules/Classes.html`.
- `Store > X` means the item row `X` in `rules/The Store - Equipment List.html`.
- `Build > X` means the row `X` in `rules/Build and Supply System.html`.
- `Actions > X` means the row `X` in `rules/Actions and Rules Work ( For Shack Reference).html`.
- `Orders > X` means the named row in `rules/Order Formatting - Needs Rework.html`.

## 1. Authority and format conflicts

### RC-AUTH-001 — Versioned core versus unversioned companion mechanics

- **Competing evidence:** `V5 > Core Mechanics`, `Playing the Game`, and `Starting Unit Classes` define the named “V5 War in the Skies” engine. `Classes`, `Store`, `Build`, and `Actions` are unversioned exports with FS vehicle profiles, one-action wording, and Build Points. V5 also links to a “V5 Classes and Equipment” spreadsheet, so the exports cannot simply be assumed unrelated.
- **Disposition:** V5 main text has priority. Companion prose/data is accepted only when it does not contradict V5 or has a separate migration decision.
- **Status:** `RESOLVED-MVP`.
- **Implementation:** every companion record defaults to `catalogued`, never `canonical_active`.

### RC-ORDER-001 — Two order templates

- **V5 value:** `V5 > Order Format` requires Callsign (seven characters or fewer), Unit Type, Carrying, Equipment/Ammo, Order Type, Movement/Action Tracker with costs, Starting/Ending Coords, and optional RP.
- **Legacy value:** `Orders > Order Format` uses unit position/type, cooldowns, equipment, limited ammo, one MOVEMENT, facing, one ACTION, one Incidental Action, stats, and stealth. It omits Order Type and a Speed ledger. The filename says “Needs Rework.”
- **Disposition:** V5 fields are authoritative. Facing and server-owned cooldown/ammo/status fields are retained as additive implementation fields because V5 flanking requires facing; they do not restore the old action model.
- **Status:** `RESOLVED-MVP`.

## 2. Unit profile conflicts

### RC-UNIT-001 — Infantry Squad

- **V5 value:** `V5 > Starting Unit Classes > Infantry Squad`: `FS 6, Range 1, Speed 1, D6 Attack`; Dig In `+2 Defense`.
- **Companion value:** `Classes > Infantry Unit`: `FS 5, Armor 0, Speed 1, Range 1`; starts with two upgrade points, four Primary and four Secondary slots.
- **Disposition:** V5 base statistics and abilities are active. Companion slot and upgrade-point values are catalogue-only pending optional-equipment migration.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-002 — Medic

- **V5 value:** `V5 > Medics`: `FS 4`, non-combat, Medical Supply `4/4`; Primary Heal rolls D6 capped by current medic FS and spends one Medical Supply.
- **Companion value:** `Classes > Combat Medical Unit`: `FS 3, Armor 0, Speed 1, Range 1`; heals `2 FS per turn` and can deploy a MASH with setup/pack actions and area healing.
- **Disposition:** V5 profile/heal is active. MASH and fixed healing are catalogue-only.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-003 — Engineer

- **V5 value:** `V5 > Engineers`: `FS 4`, non-combat, four-Supply maximum at full strength and capacity of one Supply per current FS; direct Supply-costed construction/repair.
- **Companion value:** `Classes > Combat Engineers`: `FS 3`, `9/9 Build Supply`, three Building Progress per action, vehicle repair `2 FS` per action; `Build > Stuff Engineers and Sappers Can Build` also states `9/9 Build Points` and three per action.
- **Disposition:** V5 health, capacity, and direct construction are active. FS repair and Build Points are rejected by this profile.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-004 — Artillery class model

- **V5 value:** `V5 > Artillery`: one class, `FS 3, Range 1–4, Speed 1`; Bombardment/Funnel control abilities, D6 anti-orbital shot, and one Small Supply per round of fire.
- **Companion values:** `Classes > Light Arty`: `FS 2, Speed 1, Range 5`, fixed 2 Damage and two attacks; `Heavy Arty`: `FS 3, Speed 0, Range 8`, fixed 3 Damage and three attacks; `Self-Propelled`: `FS 2, Armor 2, Speed 2, Range 4`, minimum Range 2. The section header says “No Ammo Issues.”
- **Disposition:** only the V5 generic artillery class is active. All three companion variants are catalogued for later conversion.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-005 — Logi Truck

- **V5 value:** `V5 > Logi Truck`: `Crew 3, 1 Hit, Speed 3`, two cargo slots; 6 FS infantry or five Small Supply per slot; one vehicle consumes two slots.
- **Companion value:** `Classes > Logistic Truck`: `FS 1, Armor 0, Speed 3, Range 0`; carries two infantry units or two Supply Crates and tows one artillery.
- **Disposition:** V5 Crew/Hits and slot conversions are active.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-006 — Light Vehicle

- **V5 value:** `V5 > Light Vehicle`: `Crew 3, 2 Hits, Speed 4, D4 HMG, Range 2`, Rapid Fire, Subsystems, Evasive, capacity 4 FS infantry or one Small Supply.
- **Companion value:** `Classes > Light Vehicle`: `FS 2, Armor 0, Speed 4, Range 2`, Stealth and one Secondary/one Internal slot.
- **Disposition:** V5 profile is active. Companion Stealth and slots are not imported.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-007 — IFV versus Mechanized Infantry

- **V5 value:** `V5 > Infantry Fighting Vehicle`: `Crew 3, 3 Hits, Armor 2, Speed 2, D4, Range 1, AP 1`, carries 6 FS.
- **Companion value:** `Classes > Mechanized Infantry`: `FS 3, Armor 2, Speed 3, Range 2`; holds one center hex line and has mixed infantry/vehicle upgrade access.
- **Disposition:** these are separate records. V5 IFV is active; Mechanized Infantry is catalogue-only and receives no alias to IFV.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-008 — Main Battle Tank

- **V5 value:** `V5 > Main Battle Tank`: `Crew 3, 3 Hits, Armor 3, Speed 2, D6, Range 2, AP 3`, Subsystems.
- **Companion value:** `Classes > Main Battle Tank`: `FS 3, Armor 3, Speed 2, Range 2, AP 3`, with one Secondary/one Internal slot and rear weak spot.
- **Disposition:** matching Armor/Speed/Range/AP do not validate the FS health model. V5 Crew/Hits/die profile is active; slots remain catalogue-only. V5 flanking supplies the rear-attack behavior.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-009 — Light Mech

- **V5 value:** `V5 > Light Mech`: `Crew 1, 2 Hits, Armor 1, Speed 4, D4 Light Laser, Range 1`, Subsystems and Evasive.
- **Companion value:** `Classes > Mech > Light`: `FS 3, Armor 1, Speed 4, Range 0`, external/internal `1/4`, starts with one unspecified weapon and cannot reload except at a supply point.
- **Disposition:** V5 profile is active. Companion slots/reload restrictions are catalogue-only.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-010 — Fighter

- **V5 value:** `V5 > Aerospace Fighter`: `Crew 1, Hits 2, Speed 7, D4 Snub-HMG, ammo 1, Range 1`, Atmo Flight/Aerospace/Rapid Fire/Interceptor, Evasive, forward 180° arc.
- **Companion value:** `Classes > Fighter`: `FS 3, Armor 0, Speed 8, Range 1`; three-target Anti-Air Patrol and two Light/two Internal upgrades.
- **Disposition:** V5 profile is active. Anti-Air Patrol and companion slots are catalogued.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-011 — Bomber

- **V5 value:** `V5 > Aerospace Bomber`: `Crew 1, Hits 2, Speed 6, D6 Ordnance, Range 0`, must fly over target.
- **Companion value:** `Classes > Bomber`: `FS 6, Armor 0, Speed 5, Fly Over`; one Bomb Bay/one Internal upgrade.
- **Disposition:** V5 profile is active; companion slot data is catalogued.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-012 — VTOL variants

- **V5 value:** `V5 > VTOL`: one generic class, `Crew 3, Hits 2, Speed 5, Armor 1, D2 Nose Gun, Range 1`, capacity 6 FS and a separately worded two Small Supply capacity.
- **Companion values:** `Classes > VTOL Heavy Troop Airlift`, `VTOL Multi-Purpose Airlift`, and `VTOL Heavy Lift`: each uses `FS 3, Armor 1, Speed 5` but has different weapon, infantry, vehicle, mech/tank, or Supply capacity.
- **Disposition:** only generic V5 VTOL is selectable. Three companion variants are catalogue-only.
- **Status:** `RESOLVED-MVP`; the V5 capacity ambiguity is separately tracked as `RC-V5-017`.

### RC-UNIT-013 — Heavy Air Transport

- **V5 value:** `V5 > Heavy Air Transport`: `Crew 3, Hit 1, Speed 7`, five cargo slots with explicit slot conversions.
- **Companion value:** `Classes > Heavy Aerospace Transport`: `FS 3, Armor 0, Speed 7`; prose says “5 Infantry Capacity or 5 Supply Cargo” and separately “2 Vehicle Units ... or 2 Supply Cargo.”
- **Disposition:** V5 Hits and cargo-slot table are active.
- **Status:** `RESOLVED-MVP`.

### RC-UNIT-014 — Orbital Crew, Light Freighter, and hulls

- **V5 value:** `V5 > Orbital Crew`: `FS 3, Speed 1, No Weapon`, two Req of orbital equipment; may refit to a 1 FS captain “that comes with a Light Freighter.” No Light Freighter or hull stat block is provided.
- **Companion values:** `Classes > Corvette`, `Classes > Destroyer`, `Classes > Cruiser`, and `Classes > Battleship`: each Health 10; Armor `2/3/4/5`; Speed `4/3/2/1`; Range 6; External/Internal slots `2/4`, `3/4`, `4/4`, `5/4`; cargo `2/4/6/8`; costs displayed as `0`, `..1`, `....2`, `......3`.
- **Disposition:** Orbital Crew and all hulls are catalogue-only/blocked. No automatic `Health → Hits`, dotted-cost parse, Light Freighter substitution, or cargo-size assumption is allowed.
- **Status:** `BLOCKED`.

### RC-UNIT-015 — Expanded companion classes absent from V5

- **Companion-only values:** Power Armored Infantry, Irregular Unit, Special Forces, Sappers, Light/Heavy/Super-Heavy Battle Tanks, Light/Heavy/SP Artillery, three VTOL refits, Medium/Heavy Mechs, and `[Redacted]` appear in `Classes.html` but not in V5 starting classes.
- **Disposition:** preserve names, prose, and raw values; none is selectable or inherited by a V5 class.
- **Status:** `CATALOGUED`.

## 3. Action, map, and cover conflicts

### RC-ACT-001 — Action economy

- **V5 value:** `V5 > Speed > Actions`: Standard Actions cost `0.5 Speed`; no hard action-count limit; Primary Action is once per round, costs no Speed, and replaces the attack.
- **Legacy value:** `Actions > Actions` and `Orders > Order Format` present a single ACTION plus Incidental Action after MOVEMENT; several Store entries merely say “Action” without a Speed cost.
- **Disposition:** V5 action economy controls all active systems. Unconverted Store actions have no executable meaning.
- **Status:** `RESOLVED-MVP`.

### RC-ACT-002 — Rush versus Double Time

- **V5 value:** `V5 > Rush`: ground units move at twice distance per Speed, cannot attack, and take twice FS/Hit damage.
- **Legacy value:** `Actions > Double Time`: infantry spends its Action to gain `+1 Movement`, with no attack prohibition or damage penalty.
- **Disposition:** Rush is active; Double Time is rejected.
- **Status:** `RESOLVED-MVP`; doubled damage semantics are in `RC-V5-002`.

### RC-ACT-003 — Assault, battleline, Combat Ineffective, and Break Out

- **Legacy values:** `Actions > Assault` moves into an enemy hex after victory; `Infantry - Holding A Line` blocks passage; a non-battleline assault creates `Combat Ineffective`, disabling attacks until `Break Out` moves at Speed `-1`, minimum 1.
- **V5 value:** `V5 > Advance` stops ordinary ground units at hostile formations, exempts mechs/aerospace, and separately defines Melee Charge/Brawl. It contains no battleline, Combat Ineffective, or Break Out status.
- **Disposition:** all four legacy systems are rejected by `v5_core_curated`. Advance and V5 Melee Charge are the only active engagement movement.
- **Status:** `REJECTED-BY-PROFILE`.

### RC-MAP-001 — Terrain movement and rotation costs

- **Legacy values:** `Actions > Movement`: `+1 Movement` per higher elevation and `+1` for crossing a river; `Actions > Rotate`: one Movement to change facing.
- **V5 value:** Speed and Range share an abstract measurement; V5 specifies high-ground attack benefit but no elevation, river, or rotation cost.
- **Disposition:** no implicit elevation/river surcharge and no rotation cost in the MVP. Scenario profiles may add explicit costs later.
- **Status:** `RESOLVED-MVP`.

### RC-MAP-002 — LOS maximum and forests

- **Legacy value:** `Actions > Line of Sight`: normal maximum LOS 3–4 hexes by planet and two forest hexes block LOS.
- **V5 value:** `V5 > Line of Sight`: obstruction and friendly spotting for indirect fire; no universal maximum. `Structures / Cover and Forests` says cover beyond the near unit blocks LOS.
- **Disposition:** the scenario owns any LOS cap and geometry. No default 3–4 or automatic two-forest rule.
- **Status:** `RESOLVED-MVP`.

### RC-MAP-003 — Hex occupancy and facing model

- **Legacy value:** `Actions > Hex Postion` (source spelling): a hex has three unit sections, normally holds three units, and terrain reduces capacity; first infantry occupies a directed forward position. Infantry battlelines and rear weak-spot hex walls follow.
- **V5 value:** mini/measurement agnostic; only direct rear attacks and submitted facing are mechanically specified.
- **Disposition:** facing is active for flanking, but three-section occupancy, stacking limit, and battleline walls are rejected. Scenario occupancy remains explicit data.
- **Status:** `RESOLVED-MVP`.

### RC-COVER-001 — Garrison/entrenchment value

- **V5 values:** `V5 > Structures / Cover and Forests`: building/woods protection `+1 Armor`; `Infantry Squad > Dig In`: `+2 Defense`; Change Log says Structure and Sandbag `+1 Defense` changed to `+1 Armor` and Dig In changed from `+3` to `+2 Defense`.
- **Legacy values:** `Actions > Garrison Building`: “Entrenchment 2”/`+2 Armor`; `Build > Trenches`: Entrenched 1/`+1 Armor`; `Bunker Network`: Entrenched 2/`+2 Armor`.
- **Disposition:** V5 `+1 Armor` cover and `+2 Defense` Dig In are active. Legacy Entrenchment tiers are not aliases.
- **Status:** `RESOLVED-MVP`.

## 4. Construction and Supply conflicts

### RC-BUILD-001 — Build Points versus direct Supply costs

- **V5 value:** `V5 > Engineers`: Sandbag 1 Supply, Razor Wire 1, Tank Traps 1, Bridge 2; trench is a Primary Action upgrade.
- **Legacy value:** `Build > Stuff Engineers and Sappers Can Build`: engineer pool `9/9`, three Build Points/action, one Supply reloads all points; projects cost 3–15 Build Points. `Classes > Sappers` instead gives Sappers `6/6 Build Supply`.
- **Disposition:** direct V5 Supply costs are active. Build Point pools and progress are rejected by this profile. Sappers are not active.
- **Status:** `RESOLVED-MVP`.

### RC-BUILD-002 — Anti-armor emplacement effect

- **Build value:** `Build > Anti-Armor Emplacements`: `+1 AP at Range 2` to friendly units in the hex; cost 5 Build Points.
- **Store value:** `Store > Weapon Emplacement Equipment`: `FS +1, AP +2, Range 2`; requires an infantry unit in the hex; equipment Req 2.
- **Disposition:** preserve both raw records; no anti-armor emplacement is executable.
- **Status:** `BLOCKED`.

### RC-BUILD-003 — Trench and bunker progression

- **Build values:** Trench cost 3 Build Points for Entrenched 1; Bunker Network separately costs 3 for Entrenched 2.
- **Classes value:** `Classes > Combat Engineers` says Bunker Network “must build trenches first then upgrade them,” implying two stages/six total progress.
- **V5 value:** Sandbag costs one Supply and an infantry Primary Action converts it to a trench; V5 has no Bunker Network.
- **Disposition:** only V5 sandbag-to-trench is active. Legacy trench/bunker records remain catalogued separately.
- **Status:** `RESOLVED-MVP`.

### RC-BUILD-004 — Road construction

- **Build value:** `Build > Roads`: minimum three hexes, `3 Build Points per hex`, grants wheeled vehicles `+1 Speed`.
- **Store value:** `Store > Road Building Equipment`: minimum three hexes, one action per hex; no Req cost is present; also permits simple airfields.
- **V5 value:** no tactical road-construction procedure.
- **Disposition:** road construction/effect is blocked; `Store` cost remains `null`.
- **Status:** `BLOCKED`.

### RC-BUILD-005 — Sensor reveal radius

- **Build value:** `Build > Sensor Tower`: “reveal area around Sensor Tower,” no radius.
- **Store value:** `Store > Back-Line Support Equipment`: same generic reveal wording.
- **Classes value:** `Classes > Sappers`: reveals exactly one hex around the tower.
- **Disposition:** no radius is inferred and the tower is not executable.
- **Status:** `BLOCKED`.

### RC-BUILD-006 — Structure durability

- **Source gap:** `Build` has a “Health of Structure” column, but every structure health cell is blank. V5 gives only a special Bridge damage table; it does not give general wall/sandbag/wire/trap health.
- **Disposition:** only Bridges can be attacked using their special table. Other active V5 constructions provide effects but are not valid attack targets. Legacy structures remain blocked.
- **Status:** `PROVISIONAL-MVP` for V5 constructions; `BLOCKED` for the legacy structure catalogue.

### RC-BUILD-007 — Repair in FS versus Hits

- **V5 value:** `V5 > Engineers > Action Repair`: remove one vehicle Hit or fix one subsystem for one Supply.
- **Legacy values:** `Classes > Combat Engineers` and `Classes > Sappers`: repair vehicles at `2 FS` per action; `Build > Vehicle Repair Center` and `VTOL Maintenance Landing Platform`: repair `2 FS` per turn/round; `Store > Mech Bay` and `Store > Heavy Ground Vehicle Bay` also repair in FS.
- **Disposition:** the V5 engineer repair is active. Every FS-based vehicle repair effect is catalogue-only pending conversion to Hits and an action/Supply cost.
- **Status:** `RESOLVED-MVP`/`BLOCKED` by item.

### RC-SUP-001 — Generic reload unit

- **Legacy value:** `Build` introductory row: one Supply reloads a unit's Primary weapon, one specific Secondary, or all Build Points.
- **V5 values:** class-specific rules use Small Supply: artillery spends one per round of fire; medic reloads all medical supplies for one; engineers spend it directly; Logi reloads others as an action. V5 does not state one universal weapon reload quantity.
- **Disposition:** use only class-specific V5 reload rules. There is no generic “one Supply reloads Primary” rule.
- **Status:** `RESOLVED-MVP`.

### RC-SUP-002 — Artillery ammunition

- **V5 value:** `V5 > Artillery`: must reload with one Small Supply after firing and carries/starts with two.
- **Companion value:** `Classes > Artillery` header says “No Ammo Issues”; legacy weapon profiles otherwise describe attacks without ordinary reloads.
- **Disposition:** V5 Supply consumption is active.
- **Status:** `RESOLVED-MVP`.

### RC-SUP-003 — Cargo quantities and Supply sizes

- **V5 values:** Logi uses two slots/five Small Supply per slot; HAT uses five slots with Small/Medium/Large conversions; V5 defines three Supply sizes.
- **Companion values:** legacy Logi carries “2 Supply Crates”; HAT carries “5 Supply Cargo” with additional ambiguous vehicle/Supply wording; orbital hulls have cargo capacity `2/4/6/8` without a Supply size.
- **Disposition:** V5 tactical slot conversions are active. Unqualified companion “Supply Cargo” remains raw text and must not be converted.
- **Status:** `RESOLVED-MVP`; orbital cargo remains `BLOCKED`.

### RC-SUP-004 — Orbital finite Large Supply versus unlimited cargo bay

- **V5 value:** `V5 > Cargo Supply by Size`: Large Supply comes from Cargo Bays, is a finite strategic war chest, and cannot be recouped during the campaign.
- **Store value:** `Store > Massive Cargo Bay`: an “Unlimited Supply Point,” lets units rearm without using Supply, and applies `-2 Armor, -5 FS` to the orbital.
- **Disposition:** no orbital Supply system is active. The Store effect requires conversion to Hits and reconciliation with finite Large Supply.
- **Status:** `BLOCKED`.

## 5. Equipment catalogue conflicts and gaps

### RC-EQP-001 — Optional slot budgets and class access

- **V5 value:** core starting classes generally do not state Primary/Secondary/Internal/External slot budgets. Fighter says two Disposable Weapon Systems; Bomber says it can mount Bomb-bay Weapons; orbital customization is abstract.
- **Companion values:** `Classes.html` supplies many slot budgets, while Store access names include classes not present in V5, such as Orbital Drop Troopers, Mechanized Infantry, Power Armor, Sappers, and Irregulars.
- **Disposition:** preserve slot/access data but activate no optional Store item. No fuzzy name mapping is allowed.
- **Status:** `BLOCKED`.

### RC-EQP-002 — Mech weapon damage model

- **V5 value:** Light Mech has `2 Hits` and a D4 Light Laser.
- **Store values:** Light/Medium/Large Laser setups deal `FS - 1` damage and use cooling cycles; Melee Weapon uses `FS +1`; Ammo Box lowers `FS -1` per box.
- **Disposition:** all Store mech weapons/internals remain catalogue-only until “FS” is separated into attack value versus vehicle health and converted to weapon dice/Hits.
- **Status:** `BLOCKED`.

### RC-EQP-003 — Orbital equipment still uses FS

- **V5 value:** vehicles/orbitals use Hits; V5 separately defines orbital customization and Atmo-Fuel.
- **Store values:** Massive Cargo Bay applies `-5 FS`; Reinforced Structural Integrity adds `+2 FS`; hangars and bays repair carried vehicles in FS.
- **Disposition:** no automatic FS-to-Hits conversion. Orbital items remain non-executable.
- **Status:** `BLOCKED`.

### RC-EQP-004 — Delayed charge and detonator duplication

- **Store values:** `Delayed Explosive Charge` already says explosives can be detonated remotely with an Action. `Remote Detonators requires Delayed explosive charges` repeats that same remote-detonation effect for another Req.
- **Disposition:** retain dependency and both raw descriptions; neither item is active until the base item and upgrade have distinct effects.
- **Status:** `BLOCKED`.

### RC-EQP-005 — Global orbital cooldown versus Broadside

- **Store section value:** `Orbital External Equipment` header says “EACH OPTION HAS A 3 ROUND COOLDOWN.”
- **Store item value:** `Broadside Cannons` says “Can Fire Every Turn.”
- **Disposition:** Broadside and the global cooldown are both preserved; orbital equipment is blocked, so neither is selected.
- **Status:** `BLOCKED`.

### RC-EQP-006 — Incomplete equipment records

- **Examples:** `Road Building Equipment` has no Cost; `Broadside Cannons` has no Damage/AP/Range; `Scanning System` says “all connecting hex grids” without a bound; Radar uses `X Hex Range`; multiple smoke/fire effects omit exact duration or timing; Drop Pod Launch Bay references dependent pod lists and bay names without complete records.
- **Disposition:** missing numeric fields remain `null`; prose is not parsed into guessed values. These records may be displayed with an “incomplete” marker.
- **Status:** `BLOCKED`.

## 6. Internal V5 ambiguities

### RC-V5-001 — Combining Armor and Defense

- **Evidence A:** `V5 > Armor` subtracts Armor from incoming Damage after AP; equal or greater Armor bounces the attack.
- **Evidence B:** `V5 > Defense` says it “works like armor” but is unaffected by AP. `V5 > Hits` says Damage must be higher than “armor or defense,” without saying whether both add or are checked separately.
- **MVP disposition:** `effective_armor = max(0, Armor - AP)` and total mitigation is `effective_armor + Defense`. Personnel lose positive residual FS; a vehicle loses one Hit per penetrating weapon.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-002 — Rush doubled vehicle damage

- **Evidence:** `V5 > Rush` says a rushing unit takes twice as much damage “(Hits or FS),” while normal vehicle attacks lose one Hit when Damage beats mitigation.
- **MVP disposition:** double the post-mitigation FS loss; a penetrating weapon queues two Hits against a rushing vehicle. Do not double the attack roll before penetration.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-003 — One attack roll versus multiple weapons

- **Evidence:** `V5 > Combat Round` says each unit gets one attack roll, then immediately says a heavy mech with three weapons rolls three dice. `V5 > Damage` says each individual weapon must overcome mitigation.
- **MVP disposition:** one attack activation per unit; roll once for every eligible weapon in that activation. A Primary Action/Rush consumes the whole activation.
- **Implementation note:** the active foundation uses one declared target and derives every eligible fitted weapon server-side. Each fires once in stable identifier order; ammo, cooldown, Range and LOS are rechecked at resolution. Split fire remains inactive because the source does not define its declaration policy.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-004 — Meaning of Evasive “-2 to attacks”

- **Evidence:** `V5 > Evasive` describes lower accuracy as “-2 to attacks +3 to Defense,” but V5 has no separate accuracy/to-hit statistic.
- **MVP disposition:** subtract 2 from each outgoing damage result, minimum zero; add 3 Defense.
- **Implementation note:** a governed capable unit must declare at least half its Speed in axial displacement. The modifiers are active only if its resolved position still meets that displacement after simultaneous blocking.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-005 — Cover's exact benefit

- **Evidence A:** `V5 > Structures / Cover and Forests` explicitly gives `+1 Armor` inside buildings/woods and says multiple cover sources do not stack, but designated cover prose does not repeat a numeric value.
- **Evidence B:** Change Log says Structure and Engineer Sandbag `+1 Defense` changed to `+1 Armor` and “Added /Cover to all mentions ... for the Armor bonus.”
- **MVP disposition:** visible designated cover, buildings, and woods each grant one non-stacking `+1 Armor` source. Fully intervening cover blocks LOS. This Armor may stack with Dig In Defense.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-006 — Subsystem trigger

- **Evidence A:** `V5 > Unit TAGS > Sub-System`: an attack that “rolls a 5 or 6 damage” causes weapon failure on 5 or immobility on 6.
- **Evidence B:** Change Log says “rolls a 5 or 6 on the dice”; Infantry notes “Subsystem Damage on a 5 or 6 pending they have the Force Strength.” It does not say whether the attack must penetrate or whether modifiers count.
- **MVP disposition:** require a penetrating attack and natural die 5/6; infantry current FS must be at least that natural result. D2/D4 cannot trigger without an override. Repeated identical malfunctions do not stack.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-007 — Orbital Fire Critical trigger and effect

- **Evidence:** `V5 > Space Combat > Fire Critical` says “On any attack that rolls a D4 or greater a fire is started” and a random system is shut down or degraded; it does not distinguish a die type from a result of 4+, define degradation, or define random selection. A surviving fire causes one Hit at the end of the next round and a crew Primary Action fights it.
- **Disposition:** orbital combat remains blocked; no Fire Critical is rolled.
- **Status:** `BLOCKED`.

### RC-V5-008 — Melee timing versus simultaneous damage

- **Evidence A:** `V5 > Combat Round` resolves player/enemy attacks and damage simultaneously.
- **Evidence B:** `V5 > Melee Charge` lets an unspent ranged defender fire first and applies that damage before the charger attacks.
- **MVP disposition:** defensive fire is an explicit immediate-damage exception; all other combat remains simultaneous.
- **Status:** `RESOLVED-MVP`.

### RC-V5-009 — Medic heal range

- **Main-text value:** `V5 > Medics` gives no range/base-contact requirement.
- **Change-Log value:** “Added to the medic description: The unit must be able to touch the squad ... Base Contact,” but that sentence is absent from the class body.
- **MVP disposition:** apply Base Contact as explicit V5 errata.
- **Status:** `RESOLVED-MVP`.

### RC-V5-010 — Loading/unloading action payer

- **Main-text value:** Standard Action examples include getting into/out of a vehicle and Heavy Air Transport uses `0.5 Speed per cargo slot`; unit descriptions do not consistently state who pays.
- **Change-Log value:** “Loading and unloading for both the cargo unit and the transport costs an action.”
- **MVP disposition:** transported unit and transport each normally pay one Standard Action (`0.5 Speed`) for load or unload. The main Action rule's explicit HAT exception makes the HAT pay `0.5 Speed` per cargo slot involved, while a transported unit pays `0.5 Speed`. The HAT class's clear-space in-flight paradrop is a further class-specific no-cost unloading exception. Equipment may override later.
- **Status:** `RESOLVED-MVP`.

### RC-V5-011 — Artillery Supply for control actions

- **Evidence:** `V5 > Artillery` says “Must be reloaded ... after firing. 1 Small Supply Per Round of Fire,” but does not explicitly say whether Bombardment and Funnel count as firing.
- **MVP disposition:** Bombardment, Funnel, and the direct anti-orbital shot each spend one Small Supply.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-012 — Bombardment Defense floor

- **Evidence:** `V5 > Artillery > Bombardment` stacks `-1 Defense` each round and across artillery, then recovers `+1` per round after stopping. No minimum is stated.
- **MVP disposition:** clamp Defense at zero; track unrecovered bombardment stacks separately only up to the amount that affected Defense.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-013 — Low-orbit target priority versus infantry prohibition

- **Evidence A:** `V5 > Space Combat` says orbitals are always primary targets for all Range 2+ ground forces able to fire.
- **Evidence B:** `V5 > Infantry Squad` says infantry cannot target low-orbit orbitals with a standard attack and need special equipment.
- **Disposition:** the explicit infantry restriction wins for infantry. Other eligible Range 2+ ground attacks prioritize orbitals. Orbital combat is currently blocked, so this is retained for later.
- **Status:** `RESOLVED-MVP`/`DEFERRED`.

### RC-V5-014 — Default LOS distance

- **Evidence:** V5 defines LOS obstruction and Range but no maximum sight distance. Stealth and scanning mechanics need a visibility distance.
- **MVP disposition:** scenarios must provide `los_max` or explicitly use unlimited geometric LOS. No value is inferred from the legacy 3–4 hex statement.
- **Status:** `RESOLVED-MVP`.

### RC-V5-015 — Atmo-Fuel values and recovery

- **Evidence:** `V5 > Orbital: Atmo-Fuel` defines one fuel spent per low-orbit round and forced return at zero, but supplies no hull values, refill source/action, or interaction with Large Supply.
- **Disposition:** orbital low-orbit play is blocked until hull Atmo-Fuel and refuel data exist.
- **Status:** `BLOCKED`.

### RC-V5-016 — Req economy

- **Evidence:** `V5 > Req Value` defines cost/value and links to a spreadsheet. V5 has no starting budget/income. Most companion class cost cells are blank; some are `0`, `..1`, `....2`, or `......3`; Store gear is mainly cost 1–2, with Road Building Equipment blank.
- **Disposition:** preserve every raw cost string; purchasing/refits are blocked. Do not treat blank as zero or strip dots without migration approval.
- **Status:** `BLOCKED`.

### RC-V5-017 — VTOL infantry and Supply capacity

- **Evidence:** `V5 > VTOL` lists “Carry Capacity 6FS” and then “Can Carry 2 Small Supply” without “or”/“and.” Companion VTOL variants use alternative cargo configurations.
- **MVP disposition:** treat them as alternatives: either 6 FS or two Small Supply. Mixed loads are invalid.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-018 — Hazardous HAT paradrop results

- **Evidence:** `V5 > Heavy Air Transport` says an obstructed drop causes D4 damage; “Vehicles are destroyed on a 4.” It does not define vehicle results 1–3 or how D4 damage maps to Hits.
- **MVP disposition:** allow paradrops only into clear open spaces. Reject hazardous forest/urban vehicle or infantry drops rather than invent outcomes.
- **Status:** `BLOCKED` for hazardous drops; clear drops `RESOLVED-MVP`.

### RC-V5-019 — Dig In duration and stacking

- **Evidence:** Infantry Dig In grants `+2 Defense`, uses all movement, and “stacks with other defense sources.” Trenches preserve the benefit while moving within them; hostile entry voids it. General Dig In does not explicitly say when the status ends. Cover says multiple cover sources do not stack.
- **MVP disposition:** ordinary Dig In ends on movement from the position. Trench movement preserves it only within the trench. Dig In Defense stacks with one Cover Armor source, but multiple Cover Armor sources do not stack.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-020 — Enemy target splitting and ties

- **Evidence:** `V5 > Combat Round` says AP attacks prioritize vehicles, infantry attacks prioritize infantry, and enemies always split fire between units in range. It gives no distribution rule for unequal attackers/targets or exact ties.
- **MVP disposition:** apply stated priorities, distribute attacks round-robin across equally eligible targets, and break remaining ties by scenario AI policy then stable unit ID.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-021 — “+1 attack roll” in a damage-roll system

- **Evidence:** `V5 > Terrain Advantage` gives ground attacks from above `+1 to your attack roll`; V5 otherwise uses the same roll as Damage and has no separate hit/accuracy roll.
- **MVP disposition:** add 1 to the damage result before mitigation; apply the current-FS cap to personnel after modifiers.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-022 — Trench-upgrade actor and cost

- **Evidence:** `V5 > Engineers` says “All Infantry can use their primary action to upgrade this line to a trench,” after a one-Supply Engineer Sandbag action. It states no additional Supply cost and may mean either all infantry units or infantry generically.
- **MVP disposition:** any unit of the Infantry Squad class at the sandbag line may spend its Primary Action; there is no additional Supply cost. Engineers are non-combat personnel, not Infantry Squad, and construct the original sandbags.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-023 — Aerospace reload resource

- **Evidence:** Fighter/Bomber must land and spend a Primary Action to reload; V5 Supply Flow says units rearm from appropriate bays while supplied. No Small Supply quantity is assigned to the base fighter/bomber reload in the class section.
- **MVP disposition:** a friendly scenario airfield may provide the reload after the Primary Action without tracking a crate quantity. Campaign/bay Supply consumption is deferred.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-024 — Crew self-repair versus generic Standard Action

- **Evidence A:** Standard Action examples include repairs at `0.5 Speed`.
- **Evidence B:** IFV/MBT crew repair requires exiting, losing Armor benefit, and a full turn without moving. Engineer repair removes a Hit/subsystem for one Supply.
- **MVP disposition:** class-specific crew self-repair overrides the generic example: full stationary round and no Armor benefit. Engineer repair remains a Standard Action costing one Supply.
- **Status:** `RESOLVED-MVP`.

### RC-V5-025 — Artillery Dig In action payer

- **Evidence:** `V5 > Artillery` says Engineers can Dig Artillery in for `+2 Defense` when deployed, but gives no action or Supply cost.
- **MVP disposition:** an adjacent Engineer spends one Standard Action; no Supply cost is inferred. The artillery must already be deployed and remains stationary.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-026 — Orbital boarding completion details

- **Evidence:** `V5 > Orbital Boarding Parties` limits two units per entry way, permits entry-specific Dig In, subsystem shutdown, and bridge capture, but does not fully define movement between entries/systems, shutdown effects, defender discovery, captain stats, or post-capture ownership.
- **Disposition:** boarding is deferred; source state is catalogued without executable transitions.
- **Status:** `DEFERRED`.

### RC-V5-027 — Rapid Fire doubling point

- **Evidence:** `V5 > Unit TAGS > Rapid Fire` says “Double Damage against Horde” but does not say whether doubling occurs before Armor/Defense, after mitigation, or after vehicle conversion to one Hit.
- **MVP disposition:** double the modified Damage result before mitigation. Do not double the natural die value used for subsystem checks. A penetrating vehicle attack still causes one Hit unless another rule, such as Rush, changes received Hits.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-028 — Interceptor timing and multiple interceptors

- **Evidence:** `V5 > Unit TAGS > Aerospace Interceptor` forces an attacked Aerospace unit to attack the Interceptor or not attack, but intentions are simultaneous and the text does not resolve multiple Interceptors or an Interceptor outside the target's legal arc/range.
- **MVP disposition:** after declarations, an intercepted target may attack only a legal Interceptor that declared an attack against it. Its controller chooses among multiple legal Interceptors; NPC ties use `RC-V5-020`. If none is legal for the target, its attack activation is lost.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-029 — FS-linked Supply capacity after casualties

- **Evidence:** `V5 > Medics` states Medical Supply `4/4`, one per medic FS; `V5 > Engineers` states four Supply capacity, one per current FS. It does not state what happens to carried Supply when damage lowers current FS below the load.
- **MVP disposition:** retain already carried resources, mark the unit over capacity, and prohibit further loading/reloading until current load is at or below capacity. Do not silently delete or drop Supply.
- **Status:** `PROVISIONAL-MVP`.

### RC-V5-030 — Transport destruction with cargo aboard

- **Evidence:** V5 gives transport capacities, loading, paradrop, and vehicle destruction rules but no universal outcome for passengers, carried vehicles, Supply, or mission cargo when a transport is destroyed.
- **MVP disposition:** emit a GM-adjudication event and freeze non-Supply carried records at the destruction position. Do not automatically kill, damage, or deploy them. Ordinary fungible Small Supply may remain attached to that frozen cargo event until adjudicated.
- **Status:** `BLOCKED` at the individual destruction event, without blocking use of transports generally.

### RC-V5-031 — Simultaneous movement into a contested position

- **Evidence:** `V5 > Player Intentions` makes turns simultaneous; `Advance` says hostile forces block the path and exempts mechs/aerospace, but it does not say which unit occupies a position when opposing ground units reach it simultaneously.
- **MVP disposition:** process declared routes in scenario distance increments. Two hostile blocking ground units attempting the same empty position both remain at their prior legal positions; a mover encountering an already occupied hostile position also stops at the prior legal position. They may then engage. Mechs/aerospace may pass as explicitly stated.
- **Status:** `PROVISIONAL-MVP`.

## 7. Change-control requirements

1. Runtime records using a `PROVISIONAL-MVP` rule MUST include its conflict ID in metadata and resolution logs.
2. `BLOCKED`, `CATALOGUED`, `DEFERRED`, and `REJECTED-BY-PROFILE` records MUST NOT contribute modifiers, actions, target eligibility, capacity, or prices.
3. A source correction does not silently close an entry. Update the competing evidence, disposition, status, and `GAME_SYSTEMS.md` together.
4. A designer-confirmed ruling should move from `PROVISIONAL-MVP` to `RESOLVED-MVP`, with the confirmation recorded in the entry.
5. New conflicts receive stable IDs; existing IDs are never reused for another subject.
6. Unknown values remain `null`. Blank, dotted, `X`, “depends on map size,” and prose-only values are not numeric defaults.
7. Conflict status and implementation status are independent. Enabling code requires an explicit `GAME_SYSTEMS.md` execution-overlay change and tests; a `RESOLVED-MVP` label alone is insufficient.
8. Canonical-but-deferred orders/actions MUST be rejected at submission and resolution. They MUST NOT be dropped, rewritten to Hold/Attack, or marked resolved without applying their mechanics.
9. The server derives class eligibility, executable capability, action economy, and Speed cost from the campaign-pinned catalogue. A client-provided value cannot settle or override a conflict.
10. Random seeds and full resolution journals are private server provenance. Public audit data may include event IDs, dice evidence, state digest, ruleset version, and applicable conflict IDs, but MUST NOT reveal a live seed through events or projections.

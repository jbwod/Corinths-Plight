# Corinth's Plight Game Systems

## Document status

- Selected rules profile: `v5_core_curated`
- Canonical status: selected rules and data contract for `v5_core_curated`
- Executable status: foundation resolver `foundation-0.1.0`; deliberately narrower than the canonical profile
- Companion conflict register: `docs/RULE_CONFLICTS.md`
- Audited sources: all six files currently under `rules/`

This document has two independent jobs. It selects the canonical rules for the profile, and it records the smaller subset the current foundation can execute. A rule may therefore be canonical without being executable. A rule being present in a source does not make it canonical, and a record being present in the catalogue does not make it executable.

Every source disagreement or interpretive ruling is recorded in `RULE_CONFLICTS.md`; implementations MUST NOT silently substitute a different value. Likewise, an unsupported canonical order or action MUST be rejected as deferred, not ignored, converted to Hold, or accepted as a mechanical no-op.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

## 1. Selected profile

`v5_core_curated` uses the V5 core engine, explicit V5 errata, and only companion content that can be represented without reviving the older engine.

### 1.1 Source priority

For this profile, source authority is:

1. `rules/Meta - Core Rules (V5).md`, main rules text.
2. The Change Log in that same file when it states an intended V5 change that was plainly omitted from the main text. Such use must have a conflict-register decision ID.
3. Non-conflicting descriptive or catalogue data from `rules/Classes.html` and `rules/The Store - Equipment List.html`.
4. `rules/Build and Supply System.html` and `rules/Actions and Rules Work ( For Shack Reference).html` as historical/reference material only.
5. `rules/Order Formatting - Needs Rework.html` as a deprecated template only.

The unversioned class and equipment exports may be companions to the spreadsheet linked by V5, but their embedded mechanics demonstrably mix rules generations. They therefore do not override V5 merely because V5 links to a spreadsheet.

If two sources at the same priority disagree, the feature remains inactive until `RULE_CONFLICTS.md` records a disposition. If a field is absent, it remains `null`; the implementation MUST NOT invent a value.

### 1.2 Canonical activation and implementation states

Every rule, unit, item, structure, and scenario option has a **canonical activation** state:

| State | Meaning |
|---|---|
| `canonical_active` | Selected as profile truth directly from the controlling source. This does not claim the current resolver implements it. |
| `active_provisional` | Selected profile behavior depends on a documented interpretation identified by a conflict ID. This does not claim the current resolver implements it. |
| `catalogued` | Searchable/displayable source content with no executable effect. |
| `deferred` | Intentionally outside the selected playable scope, even if well described. |
| `blocked` | Intended for later activation but missing data or a ruling. |
| `rejected_by_profile` | Belongs to a different/legacy rules profile and must not affect V5 play. |

Implementation is a separate axis:

| State | Meaning |
|---|---|
| `foundation_executable` | Accepted by the server boundary and resolved deterministically by `foundation-0.1.0`. |
| `foundation_partial` | A bounded subset is executable; the omitted canonical behavior is named explicitly. |
| `foundation_helper` | A deterministic validator/catalogue helper exists, but no round action invokes the system. |
| `foundation_deferred` | Canonical data may exist, but the server rejects the order/action until a resolver hook exists. |
| `not_executable` | Catalogued, blocked, rejected, or otherwise incapable of affecting resolution. |

Canonical status MUST NOT be inferred from an implementation flag, and implementation completion MUST NOT be inferred from `RESOLVED-MVP` in the conflict register.

### 1.3 Canonical profile and foundation execution matrix

| System | Canonical profile | Foundation implementation |
|---|---|---|
| Hold, Advance, Rush | `canonical_active` | `foundation_partial`: explicit axial route, Speed budget, quarter-distance simultaneous movement, hostile blocking/contention, partial-route stops, end position/facing, and Rush attack/damage restrictions resolve; Hold applies final facing. Unpinned terrain defaults still prevent a full implementation claim. |
| Evasive, Melee Charge, Stealth | `canonical_active`/`active_provisional` | `foundation_partial`: Evasive is executable for governed eligible units; Melee Charge and Stealth remain structured definitions with `executable=false`. |
| Attack action | `canonical_active` plus V5 rulings | `foundation_partial`: one server-owned Attack activation per unit fires every eligible fitted weapon once and implements FS cap, Armor/AP/Defense, governed rear effects, range, direct LOS, indirect spotting, ammo, cooldown, Rush damage, and simultaneous commit. Remaining firing-arc/melee/aerospace rules are deferred. |
| Multiweapon attack activation | `active_provisional` (`RC-V5-003`) | `foundation_executable`: the player declares one target; the server deterministically derives and revalidates every participating fitted weapon, then resolves each eligible weapon once in stable identifier order. Ineligible weapons emit an auditable skip event. Split fire is not active. |
| Dig In | `active_provisional` | `foundation_partial`: Infantry, Medics and Engineers can spend their full movement to gain `+2 Defense`; the status persists across rounds and ends after actual movement. |
| Dynamic cover Armor | `active_provisional` | `foundation_partial`: generated forest/trench profiles and explicit scenario building markers grant personnel one non-stacking `+1 Armor` when attacked from outside. Directional freestanding cover remains deferred. |
| Evasive modifiers | Canonical or `active_provisional` | `foundation_executable`: a capable unit must declare an endpoint at least half its Speed from its start. If simultaneous blocking prevents the actual displacement, it gains no modifier; otherwise it receives `+3 Defense` and `-2` to every outgoing weapon result for that round. |
| Terrain Advantage / high ground | `active_provisional` (`RC-V5-021`) | `foundation_executable`: a tagged ground attacker above a tagged ground target adds +1 before the current-FS cap and mitigation; air domains receive no elevation benefit. |
| Rapid Fire versus Horde | `active_provisional` (`RC-V5-027`) | `foundation_executable`: the governed unit tags double the capped modified damage result before mitigation, preserve the natural die for subsystem checks, and retain one-Hit conversion against vehicle targets. |
| Vehicle Subsystems | `active_provisional` | `foundation_executable`: a penetrating single-die natural 5 disables weapons and a natural 6 disables mobility; Infantry must retain at least that much FS. Malfunctions are simultaneous with attacks, persist, gate later orders, and can be restored by Engineer Repair. |
| Simultaneous resolution | `canonical_active` plus `RC-V5-031` | `foundation_partial`: quarter-distance movement resolves hostile route contests symmetrically, partial legal prefixes persist, capacity contests are symmetric, and attacks aggregate before damage commits. Melee defensive-fire timing remains deferred. |
| Hex geometry, pathing, LOS, capacity | Scenario-owned implementation of canonical measurement/LOS | `foundation_partial`: axial distance, adjacency, battlefield bounds, pathfinding, quarter-distance movement cost, hostile formation blocking, LOS blockers, sensors, and per-hex capacity exist. Road/elevation/river defaults still execute without a fully pinned scenario profile. |
| Direct and indirect targeting | `canonical_active` | `foundation_executable`: direct fire needs LOS; indirect fire still needs an active friendly spotter with LOS to the target. The firing unit is not an automatic spotter unless it independently satisfies that friendly-spotter set. |
| Medic, engineer, artillery, cargo, logistics and Small Supply actions | `canonical_active`/`active_provisional` | `foundation_partial`: paired Load/Unload executes governed Logi/Light Vehicle unit and Small Supply capacity plus the IFV's six-FS infantry compartment, follows carrier movement, checks unload occupancy and persists manifests/locations; a Logi may also hitch, tow and unhitch one packed Artillery unit without consuming its cargo slots. Finite-weapon Reload, Combat Medic First Aid and field resupply, Engineer vehicle Repair, IFV/MBT Crew Repair, Engineer-assisted Artillery Dig In, Sandbag/Razor Wire/Tank Trap construction and Infantry Trench Upgrade, Artillery Deploy/Pack Up/Bombardment, and class-derived Logi field resupply have resolver/UI/persistence paths. Logi restores one Artillery/Engineer Small Supply or converts one Small Supply into a Medic refill to current FS; the recipient spends no action. Crew Repair consumes a full stationary Primary Action, restores one subsystem, and removes Armor benefit for the round. Each directly built fieldwork costs one Small Supply. Sandbags/Trenches grant Infantry +1 Armor from outside fire; Wire charges Infantry +0.5 Speed and Tank Traps charge vehicles +1 Speed on entry. Scan and Deploy Drone are rejected because their advertised visibility/state effects are not implemented. Airlift/HAT consequences, MASH, Bridge, Funnel, and Garrison remain deferred. |
| Thirteen non-orbital V5 starting classes | `canonical_active` | `foundation_partial`: D1 catalogues all thirteen plus three companion-only classes, while generated tactical execution currently resolves Infantry Squad, Combat Medic, Engineers, Light Vehicle, Infantry Fighting Vehicle, Main Battle Tank, Light Mech, Artillery, Logi Truck, and the generic VTOL. D1-only classes without a registered generated handler fail closed before campaign execution. |
| Aerospace tactical rules | `canonical_active` | `foundation_deferred`: no landing, takeoff, altitude transition, bombing path, Interceptor, cargo, or reload action is resolved. |
| Optional Store equipment/refits | `catalogued` unless separately migrated | `foundation_partial`: Flak Vests and Lightweight Anti-armour have narrow effective-unit/resolver handling. Vehicle Optics and Drone Operator are release-blocked because their current handlers do not implement the advertised state/visibility effects and depend on unresolved interpretation; Orbital Drop Training records an eligibility mutation while orbital deployment remains disabled. Other Store items remain blocked/catalogue-only. |
| Orbital Crew and hull combat | `catalogued`/`blocked` | `not_executable`: no canonical Light Freighter/hull, Atmo-Fuel, Req, or conversion data. |
| Medium/Large Supply, FOBs, HQs, Tac-Com, strategic movement, boarding | `deferred` | `not_executable`. |
| Req economy/store purchasing | `blocked` for canonical balance | `foundation_partial` product infrastructure: user ledger, published equipment purchases, and the onboarding charter grant/cost exist. All base player-class prices remain `NULL/BALANCE_REQUIRED`, so ordinary production unit purchase is blocked and onboarding policy is not canonical V5 balance. |
| Legacy Build Points, expanded classes, occupancy thirds, battleline, Combat Ineffective | `rejected_by_profile`/`catalogued` | `not_executable`; they require a separate legacy profile or explicit V5 migration. |
| Deterministic replay, event sequencing, and hidden-information projection | Application contract | `foundation_partial`/unsafe for release: the pure resolver is deterministic for its narrow grammar and events continue sequence numbers, but ordering uses locale-sensitive comparison in tactical paths, hashes are non-cryptographic, the seed is predictable, and reports use present-time visibility. Socket invalidations are now per-viewer and identifier-free with bounded projected reconnect catch-up; event-time historical intelligence remains open. |

The mechanically accepted round grammar remains intentionally small: **Hold/Advance/Rush** plus **Attack, Load, Unload, Reload, First Aid, Engineer Repair, and Artillery Deploy/Pack Up**, with a constrained airdrop path at deployment resolution. Repair has an explicit server-validated Hit/subsystem choice; the client cannot author its amount or Supply cost. Artillery platform state is server-owned and gates movement and fire. Scan/Drone and every other special order or action fail validation until their authoritative state effects, rule hooks, and tests exist. The tactical composer mirrors this exact executable set rather than advertising deferred mechanics.

### 1.4 Phase 2 persistent-force catalogue

The additive Phase 2 D1 layer normalizes source material without changing the selected profile or widening the executable grammar by itself. It provides:

- explicit movement, durability, cargo, Supply, and deployment profiles;
- first-class tags, abilities, statuses, weapon mounts, and equipment slots;
- separate source-definition, implementation, requisition, and availability states;
- persistent unit descriptions, location state, optimistic version, loadouts, independent weapon ammo/cooldowns, cargo manifests, Supply, subsystem state, construction projects, service summaries, and history provenance;
- reusable ship capabilities granted by modules rather than module-name conditionals; and
- idempotency receipts plus per-aggregate revisions for force mutations.

The seeded force catalogue contains the thirteen non-orbital V5 starting classes. Power Armoured Infantry, Irregular, and Special Forces are preserved from `Classes.html` but remain catalogue-only under `RC-UNIT-015`; Phase 2 product demand does not silently make legacy values canonical. Seven Bug battlefield roles are catalogued, but roles lacking source statistics are hidden and non-executable until balance data is published.

Production requisition MUST query the implementation overlay. A definition is purchasable only when all of the following hold:

1. its implementation status meets the minimum mechanics for that class;
2. its requisition status is `PUBLISHED` and its numeric cost is non-null;
3. its availability status is `AVAILABLE`; and
4. ownership, equipment-slot, ship-capability, campaign, and readiness checks pass server-side.

`DEV_ONLY` permits an explicitly authenticated developer fixture to exercise a class; it is not a zero-cost purchase rule. All base player-class prices currently remain `NULL`/`BALANCE_REQUIRED` under `RC-V5-016`. The Store's published equipment/module prices are retained exactly, while blank costs such as Road Building Equipment remain `NULL`.

The new `STEALTHED`, `PACKED`, `DEPLOYED`, `DUG_IN`, `EVASIVE`, `AIRBORNE`, `LANDED`, and `REARM_REQUIRED` definitions are server-owned statuses. Their presence in D1 does not authorize a client to set them or claim their effects. First Aid, Medic field resupply, Engineer vehicle Repair, IFV/MBT Crew Repair, Sandbag/Razor Wire/Tank Trap construction, Infantry Trench Upgrade, and Artillery Deploy/Pack Up/Bombardment are activated support actions. MASH, Bridge, Funnel, general Supply transfer, aerospace landing/rearm, airdrop, and sabotage remain disabled until their implementation overlay, server validation, deterministic resolver hook, fog projection, and tests agree.

## 2. Canonical glossary

This glossary states canonical profile meaning. Terms marked as foundation-deferred remain valid catalogue/rules concepts, but cannot yet be selected in an executable order.

### 2.1 Unit and combat terms

- **Personnel unit**: a unit whose health is **Force Strength**.
- **Force Strength (FS)**: personnel health and maximum basic-attack damage. At zero FS, the unit is destroyed.
- **Vehicle unit**: a unit whose health is **Hits**. Aerospace, mechs, and orbitals are vehicles unless a rule explicitly says otherwise.
- **Hits**: number of penetrating weapon attacks a vehicle can sustain. At zero Hits, the vehicle is destroyed.
- **Crew**: descriptive staffing/carrying data on a vehicle, not a second generic health pool. Crew separation exists only where a class-specific rule says it does.
- **Speed**: distance allowance and the resource spent on Standard Actions during the current round.
- **Range**: maximum attack distance, measured in the same distance unit as Speed.
- **Damage result**: a weapon die result, or a personnel D6 result capped by current FS, after applicable attack modifiers.
- **Armor**: mitigation reduced by AP.
- **Armor Piercing (AP)**: reduces Armor, never Defense.
- **Defense**: mitigation unaffected by AP, usually granted by Dig In or Evasive.
- **Attack activation**: the once-per-round opportunity to attack. A multiweapon unit may roll once for each eligible weapon during the activation.
- **Weapon attack**: one weapon's individual roll, penetration check, damage event, and possible subsystem event.
- **Direct fire**: requires both Range and Line of Sight.
- **Indirect fire**: ignores intervening LOS blockers but requires a friendly spotter with LOS to the target.
- **Destroyed**: current FS or Hits is zero. Destroyed units do not act later in the round unless their already-declared attack is preserved by simultaneous resolution.

### 2.2 Action and order terms

- **Standard Action**: costs `0.5 Speed`. A unit may take as many as its remaining Speed permits.
- **Primary Action**: costs no Speed, may occur once per round, and consumes the unit's attack activation.
- **Order Type**: the declared behavior governing movement and engagement for the round.
- **Hold**: do not spend Speed on movement; actions remain available; attack eligible hostiles in range.
- **Advance**: move along the declared route and engage. A hostile ground formation stops an advancing ground unit; mechs and aerospace are exempt.
- **Rush**: ground-only movement at twice normal distance per Speed spent; the unit cannot attack and suffers doubled losses this round.
- **Evasive**: executable special order for governed capable units; outgoing attack result `-2`, Defense `+3`, and the unit must end at least half its base Speed away from its starting point (`RC-V5-004`). A unit stopped short by simultaneous movement gains neither modifier.
- **Melee Charge**: foundation-deferred special order; forgo ranged attacks and attempt to reach base contact with a melee-capable unit.
- **Brawl**: foundation-deferred melee engagement in which normal ranged attacks cannot target participants.
- **Stealth order**: foundation-deferred movement under the applicable infantry- or vehicle-stealth rules.

### 2.3 Map and support terms

- **Line of Sight (LOS)**: an unobstructed center-to-center line. The core has no universal maximum LOS; a scenario may define one.
- **Cover**: a visible solid object, building, or woods between attacker and target that either grants Armor or blocks LOS. Multiple cover Armor bonuses do not stack.
- **Facing**: the direction recorded for a ground unit and used to determine direct rear attacks. Changing facing has no separate Speed cost in this profile.
- **Small Supply**: tactical ammunition, repair, medical, or construction supply.
- **Medium Supply**: FOB construction/operation resource; deferred in the selected profile and not foundation-executable.
- **Large Supply**: strategic orbital/HQ resource; deferred in the selected profile and not foundation-executable.
- **Requisition Value (Req)**: purchase/customization cost. The concept is canonical, but canonical unit budgets/prices remain blocked. The deployed onboarding charter and published-equipment ledger are product infrastructure, not a V5 balance ruling.
- **Cooldown**: whole rounds remaining before an ability can be used again. Weapon cooldowns execute. Deploy Drone currently records a cooldown, but its gameplay effect remains release-blocked; other optional equipment cooldowns remain catalogue data only.

### 2.4 Canonical tags

- **Sub-System**: the vehicle can suffer weapon-disabled or immobilized malfunctions; see the subsystem sequence.
- **Infantry Stealth** and **Vehicle Stealth**: grant their respective detection rules; neither tag is inferred from descriptive prose.
- **Rapid Fire**: double the modified Damage result against a `Horde` target before mitigation; it does not change the natural die value (`RC-V5-027`).
- **Horde**: clustered enemy type vulnerable to Rapid Fire. It has no other automatic stat changes.
- **Atmo Flight**: fixed-wing atmospheric flight requiring a runway to land.
- **Aerospace**: may transition between the tactical map and high orbit using half total Speed.
- **Aerospace Interceptor**: attacking an Aerospace target constrains that target's attack as described under Aerospace (`RC-V5-028`).
- **Ponderous**: direct movement with firing only from the ending position. V5 currently applies it to orbitals, so it is catalogue-only in this profile.
- **Primary**: identifies a Primary Action; it is not an equipment slot.

## 3. Round lifecycle

This section is the canonical lifecycle target. Each subsection states the present foundation boundary; canonical prose beyond that boundary is not a claim of current execution.

### 3.1 Round start

The canonical server snapshot includes each participating unit's current FS/Hits, base Speed, ammunition, Supply, statuses, cargo, position, and facing. The foundation passes an immutable previous-state snapshot into the resolver, validates each order against that authoritative state, and calculates the round's Speed spend rather than trusting a client-owned `speed_remaining` field. Existing cooldowns tick once before attacks; a cooldown created by an attack remains at its full value until the next round.

### 3.2 Player Intentions Phase

All players submit intentions simultaneously. The worker resolves `unit_id` to the server-owned deployment and unit definition, checks class eligibility, rejects definitions not executable in the pinned engine version, and reconstructs action economy and Speed cost from the server catalogue. Client-supplied economy, cost, stats, equipment, ammo, cooldown, eligibility, or visibility claims are not authoritative.

An accepted foundation order identifies Hold/Advance/Rush, route/end position, final facing, at most one Attack, and only those migrated fitted-equipment/cargo actions allowed by the deployment snapshot. Validation checks authoritative position, route/cost, Speed, fitted references, target visibility, paired cargo actions, finite ammo/Supply, cooldowns, and action restrictions. Unmigrated support actions remain deferred.

### 3.3 Enemy Intentions Phase

Enemy intentions use the same generated foundation order grammar and resolver validation as player orders. Each enemy deployment materializes its published @2 faction doctrine. It selects visible legal targets, uses authored target and order preferences, prioritizes vehicles for AP-capable/vehicle-priority profiles, spreads attacks across equally preferred eligible targets before reusing one, then breaks ties by distance and Unicode code-point identifier. If no target is visible, it advances toward the scenario policy's primary objective rather than a hard-coded map ID. The resolver records a fog-projected intention event before movement. The active V5 policy is:

1. AP-capable enemy attacks prefer vehicle targets.
2. Infantry attacks prefer infantry targets, then progressively heavier targets.
3. Enemy attacks are spread across eligible targets rather than stacked where possible.

Ties in the canonical policy are resolved by the target's current allocation count, distance, then stable identifier (`RC-V5-020`). Formation cohesion, retreat, supply-aware choices, difficulty profiles and large-game automatic player targeting are not yet implemented; no unsourced threshold is inferred from the catalogue's descriptive aggression value.

### 3.4 Movement and interactions

Movement follows each declared route. Standard movement costs one Speed per scenario distance unit. A scenario may use hexes, squares, or measured distance, but the unit is the same for Speed and Range.

For simultaneous route contention, blocking ground units move in scenario distance increments. If two hostile blocking ground units attempt to enter the same unoccupied position in the same increment, neither enters; both stop at their prior legal positions and become eligible to engage. A unit entering a position already occupied by a hostile blocking ground unit stops at the prior legal position. Mechs and aerospace retain their explicit ability to pass formations (`RC-V5-031`).

The foundation resolves declared routes at quarter-distance increments derived from the authoritative step costs. Opposing blocking ground formations attempting the same position at the same increment both stop at their prior legal positions. A ground mover encountering an occupied hostile position also stops and persists its legal route prefix. Capacity overflow blocks arrivals symmetrically, while tagged Mech/Aerospace/VTOL movers may pass through hostile formations. Movement events carry the traversed route, declared destination, block reason, and distance increment.

The legacy `+1` elevation/river costs, one-Speed rotation, three-units-per-hex limit, and hex thirds are not active profile rules. The current hex helper nevertheless applies unpinned road/elevation/river defaults; that is a known implementation defect, not canonical activation. A scenario that needs such rules must select a future map profile rather than applying them implicitly.

Standard Actions are resolved at their declared position on the route. Loading or unloading normally consumes `0.5 Speed` from both the transport and transported unit. A HAT instead spends `0.5 Speed` for each cargo slot involved, while a transported unit still spends `0.5 Speed` (`RC-V5-010`).

Load/Unload has a ground resolver path with occupancy, paired-action, governed capacity, Supply-cargo and packed-Artillery towing checks. Specialist airdrop validation and broader route-position interactions remain incomplete. Other unmigrated route interactions are rejected rather than silently moving the unit without the interaction.

### 3.5 Combat resolution

Combat is declared and rolled against the round snapshot, then pending results are committed simultaneously. Melee defensive fire is the canonical explicit exception and is foundation-deferred.

For each weapon attack:

1. Confirm target type, Range, LOS/spotting, firing arc, ammunition, and that the attack activation remains available.
2. Roll the weapon die. Personnel basic attacks roll D6. Preserve the natural die value separately for subsystem checks.
3. Apply attack-result modifiers. Active modifiers are high ground `+1` (`RC-V5-021`) and Evasive outgoing `-2` (`RC-V5-004`). Clamp the modified result to a minimum of zero. Personnel results are then capped at current FS.
4. If the weapon has Rapid Fire and the target has Horde, double the modified Damage result. Preserve the undoubled natural die for subsystem checks (`RC-V5-027`).
5. Calculate `effective_armor = max(0, target_armor - attack_AP)`.
6. Add applicable Defense: `mitigation = effective_armor + target_defense` (`RC-V5-001`).
7. Calculate `penetrating_damage = max(0, damage_result - mitigation)`.
8. If the target uses FS, queue loss of `penetrating_damage` FS. If it uses Hits, queue one lost Hit when `penetrating_damage > 0`, regardless of the residual amount.
9. If the target is Rushing, double the queued FS loss or queue two Hits for a penetrating vehicle weapon (`RC-V5-002`).
10. Check a tagged vehicle for a subsystem malfunction as described below.

Each eligible weapon rolls once during the attack activation. Spending a Primary Action or using Rush removes the entire activation, not merely one weapon roll (`RC-V5-003`).

The foundation implements the target checks (including the friendly-spotter requirement for indirect fire), server-derived multiweapon participation, seeded per-weapon rolls, high-ground +1, Evasive outgoing `-2` and target Defense `+3`, FS cap, Rapid Fire against Horde, Armor/AP/Defense threshold, governed rear effects, one-Hit vehicle penetration, Rush loss multiplier, ammo/cooldown updates, simultaneous damage aggregation, and persistent subsystem malfunctions. Split fire, forward firing arcs, melee, and other special attacks remain deferred even though their canonical decisions are retained below.

### 3.6 Facing and flanking

A direct rear attack against a ground vehicle ignores that vehicle's Armor. A direct rear attack against infantry ignores Defense specifically granted by Dig In when the infantry is not inside a structure. It does not remove structure/cover Armor or unrelated Defense. Air assets neither gain nor suffer flanking benefits.

Facing must therefore be present in tactical orders even though the deprecated order template is not authoritative.

The foundation applies submitted final facing for Hold as well as movement orders and uses governed campaign tags for the axial rear-arc check. Ground vehicles lose Armor from the rear, dug-in ground infantry lose only their Dig In Defense, and aerospace/VTOL/orbital targets receive no flanking effect. Other future cover categories still need equally explicit source tags.

### 3.7 Terrain and cover

- A ground attack from above its target adds `+1` to the attack result (`RC-V5-021`).
- Infantry inside a building or woods, or visibly protected by designated solid cover, gains `+1 Armor` against attacks from outside/across that cover.
- Multiple cover Armor bonuses do not stack.
- Cover between targets may completely block LOS. A unit in the near edge of cover may be targetable; a unit fully behind it is not.
- Dig In grants infantry `+2 Defense`, consumes all of that unit's available movement for the round, and ends when the unit moves from the dug-in position (`RC-V5-019`).
- Cover Armor and Dig In Defense stack because they are different mitigation channels; multiple cover sources do not (`RC-V5-005`, `RC-V5-019`).

Scenario geometry decides whether LOS is blocked. There is no implicit three- or four-hex visibility cap and no implicit “two forest hexes” rule (`RC-V5-014`, `RC-MAP-002`).

The foundation executes geometric LOS blockers, sensor/range limits, the governed ground-only high-ground damage modifier, server-owned Dig In state, and data-driven personnel cover. Generated forest and trench profiles plus explicit scenario `INFANTRY_COVER_ARMOR_1` markers contribute one non-stacking Armor when the attacker is outside the protected hex. A legal Dig In action consumes all Speed, applies `DUG_IN`, contributes `+2 Defense`, survives blocked movement, and is removed after actual movement. Directional freestanding cover and other terrain-derived status remain deferred.

### 3.8 Subsystems

This canonical provisional rule is executable for foundation vehicle profiles using the governed subsystem durability record.

A vehicle with the `Sub-System` tag checks for a malfunction only when a weapon attack penetrates and its natural die result is 5 or 6. An infantry attack can trigger it only if current FS is at least that natural result.

- Natural 5: weapon systems disabled until repaired.
- Natural 6: vehicle immobile until repaired.

D2 and D4 weapons cannot trigger this check without an explicit item override. Reapplying the same malfunction does not create additional copies. Weapon malfunctions stop later firing and mobility malfunctions stop later movement, while attacks already committed in the same simultaneous combat phase still resolve. Both states persist to the owned unit and are valid Engineer Repair targets. This is an `active_provisional` interpretation (`RC-V5-006`).

### 3.9 Melee

This is a canonical rule and is foundation-deferred.

A melee-capable infantry or power-armored unit may declare a charge from at most `1.5` distance units. It forgoes ranged attacks. If caught by the charge, a ranged defender that has not attacked may fire first; this damage is committed before the charging unit attacks. Survivors attack without the target's Defense, although Armor still applies.

The participants then gain `brawl`. Other units may only join with a melee charge or support with an explicitly highly accurate weapon. The optional Store equipment that normally grants melee/highly accurate capability remains catalogue-only. The entire subsystem is foundation-deferred.

### 3.10 Stealth

This is a canonical rule and is foundation-deferred.

- Infantry Stealth: when moving through enemy LOS, count relevant enemy units, roll D6, and remain hidden by meeting or beating that count. Attacking or another revealing interaction ends stealth.
- Vehicle Stealth: the vehicle is spotted at half normal scenario LOS, rounded up.

The scenario must define the set of enemy observers and its LOS limit. More than six observers makes the infantry check impossible. Units without the corresponding tag cannot select Stealth.

## 4. Canonical active unit roster

These V5 values override same-named rows in `Classes.html`.

This is the selected profile roster, not a statement that every row is tactically executable. D1 catalogues all thirteen non-orbital V5 classes plus three companion-only classes. The separate compiled tactical catalogue supplies only five allied definitions: Infantry Squad, Engineers, Light Vehicle, Main Battle Tank, and Artillery. Its Bug Drone/Warrior/Heavy definitions are scenario-specific experimental enemies, not additional V5 source classes. A missing compiled definition MUST NOT be filled by a same-named legacy class or treated as executable merely because D1 says it is.

| Unit | Canonical base profile | Active notes |
|---|---|---|
| Infantry Squad | FS 6; Speed 1; Range 1; D6 | Dig In; paradrop into clear open space; cannot standard-attack low-orbit orbitals (`RC-V5-013`). |
| Medics | FS 4; non-combat; Medical Supply 4/4 | Base-contact Primary Heal (`RC-V5-009`): D6 FS capped by current medic FS; costs one Medical Supply. Reload all Medical Supply for one Small Supply. Can Dig In. |
| Engineers | FS 4; non-combat; Small Supply capacity=current FS | Standard Repair/Construct actions below. Can Dig In. |
| Artillery | FS 3; Speed 1; Range 1–4; starts/carries 2 Small Supply | Deploy/pack including hitch costs 0.5 Speed. Bombardment, Funnel, and direct anti-orbital fire each consume one Small Supply. Dismounted crew is FS 3, Speed 1, Range 1. |
| Logi Truck | Crew 3; Hits 1; Speed 3; 2 cargo slots; no weapon | Six FS infantry or five Small Supply per slot; one vehicle uses both; may tow artillery. Reloading another unit is a Standard Action paid by Logi only. |
| Light Vehicle | Crew 3; Hits 2; Speed 4; D4 HMG; Range 2 | Rapid Fire; Sub-System; Evasive; carries 4 FS infantry or one Small Supply. |
| Infantry Fighting Vehicle | Crew 3; Hits 3; Armor 2; Speed 2; D4; Range 1; AP 1 | Sub-System; carries 6 FS infantry. Class-specific crew repair executes as a full stationary, Armor-exposed round (`RC-V5-024`). |
| Main Battle Tank | Crew 3; Hits 3; Armor 3; Speed 2; D6; Range 2; AP 3 | Sub-System; armor-target priority; class-specific crew repair executes as a full stationary, Armor-exposed round (`RC-V5-024`). |
| Light Mech | Crew 1; Hits 2; Armor 1; Speed 4; D4; Range 1 | Sub-System; Evasive; may pass through enemy ground formations. |
| Aerospace Fighter | Crew 1; Hits 2; Speed 7; D4; Range 1; main ammo 1 | Atmo Flight; Aerospace; Rapid Fire; Interceptor; Evasive; forward 180° firing arc; cannot spot ground units. |
| Aerospace Bomber | Crew 1; Hits 2; Speed 6; D6; Range 0 | Atmo Flight; Aerospace; must fly over target; cannot spot ground units. |
| VTOL | Crew 3; Hits 2; Armor 1; Speed 5; D2; Range 1 | Aerospace; capacity is either 6 FS infantry or 2 Small Supply (`RC-V5-017`); cannot spot ground units. |
| Heavy Air Transport | Crew 3; Hits 1; Speed 7; 5 cargo slots; no weapon | Atmo Flight; Aerospace; cargo conversions below; cannot spot ground units. |
| Orbital Crew | FS 3; Speed 1; no weapon; 2 Req orbital equipment | Catalogue-only until a canonical Light Freighter/orbital hull exists. |

The Infantry Squad through Heavy Air Transport are the thirteen canonical selectable classes targeted by this profile. The generated tactical catalogue currently executes the seven classes named above; D1 can persist/catalogue more classes, which is not proof that they are playable. Power armor, irregulars, special forces, sappers, tank variants, artillery variants, medium/heavy mechs, and orbital hulls are not canonical selectable classes.

## 5. Canonical support systems (foundation-partial)

Most rules below remain selected profile truth but deferred. `transferSupply`, `advanceBuildProgress`, and `canEquip` are deterministic helpers; the separate equipment/deployment slice adds narrow paired-cargo and finite-weapon Reload paths. First Aid, Engineer vehicle Repair, Sandbag/Razor Wire/Tank Trap construction, Trench Upgrade, and Logi-to-Artillery Small Supply transfer are active end-to-end support actions. Scan and Deploy Drone are rejected because their advertised state/visibility effects are incomplete. The slice does not activate MASH, wider Resupply, Bridge, or legacy Build Points.

### 5.1 Medical

`Primary Heal` requires base contact, spends one Medical Supply, and restores D6 FS capped by current medic FS and the target's maximum FS. Medical Supply is distinct from carried Small Supply; the Medic's Reload action spends one Small Supply and restores Medical Supply to the Medic's current FS (normally `4/4`). Existing excess is retained after damage, but cannot be reloaded further.

MASH deployment and legacy fixed `2 FS/turn` healing are not active.

### 5.2 Engineering and construction

All listed construction uses a Standard Action unless identified as Primary:

| Effect | Cost | Canonical profile behavior |
|---|---:|---|
| Repair vehicle | 1 Small Supply | Active: an Engineer in base contact uses its Standard Action (`0.5` Speed) to remove one Hit or one selected subsystem malfunction. Destroyed vehicles cannot be restored. |
| Sandbag line | 1 Small Supply | **Active:** an Engineer uses a Standard Action to place it in its current or an adjacent known hex. It persists in campaign map state and grants Infantry in that hex `+1 Armor` against attacks from outside the hex. Other than Bridges, profile structures cannot be attacked until durability data exists (`RC-BUILD-006`). |
| Trench upgrade | No additional Supply stated | **Active:** an Infantry Squad occupying a Sandbag Line uses a Primary Action to convert it (`RC-V5-022`). Dug In persists while moving between connected Trench hexes and ends when the unit leaves the Trench line. |
| Razor wire | 1 Small Supply | **Active:** an Engineer places it in the current or an adjacent known hex. Infantry pay `0.5` additional Speed on entry. The surcharge is not reduced by Rush. |
| Tank traps | 1 Small Supply | **Active:** an Engineer places them in the current or an adjacent known hex. Vehicles pay `1` additional Speed on entry. The surcharge is not reduced by Rush. |
| Bridge | 2 Small Supply | Opens a river crossing. Uses the V5 special bridge-damage table. |

Bridge attack table: D6 result 1 misses; 2–4 adds one damage step; 5–6 destroys it. At one step tanks cannot cross, at two steps only infantry may cross, and at three it is destroyed.

Build Points, walls, gates, roads, bunkers, emplacements, depots, radar, repair centers, VTOL platforms, airfields, and sensor towers from the build sheet remain catalogued/deferred.

### 5.3 Artillery

- Deploy/Pack Up is active end to end. Artillery starts `PACKED`; either transition is a Standard Action costing `0.5 Speed` and includes hitching/unhitching. `DEPLOYED` artillery cannot move, `PACKED` artillery cannot fire, and a newly deployed platform may fire later in the same resolved order.
- `Primary Bombardment` is active end to end: hostile Defense in a radius of 1 around the known, spotted target hex is reduced by 1. Repeated rounds and multiple artillery stack; the profile clamps total Defense at zero (`RC-V5-012`). The mission consumes one Small Supply (`RC-V5-011`), and one suppression stack recovers in each round the unit is not bombarded.
- `Primary Funnel`: after a moving hostile completes movement but before conflicts resolve, move it `0.5` distance in the player's chosen legal direction.
- Direct anti-orbital attack: D6 against a low-orbit orbital in Range; unavailable while orbital combat is blocked.
- Each Bombardment, Funnel, or direct shot spends one Small Supply (`RC-V5-011`).
- A deployed artillery unit may stockpile and share Small Supply, initially/capacity two.
- An adjacent Engineer may spend one Standard Action, with no Supply cost, to Dig In deployed stationary artillery for `+2 Defense` (`RC-V5-025`).

Legacy fixed-damage, multiple-shot light/heavy/SPG profiles are not active.

### 5.4 Cargo and logistics

Cargo is capacity, not a second movement system.

- Logi: two slots; 6 FS infantry or 5 Small Supply occupies one; one vehicle occupies two.
- HAT: five slots; 6 FS infantry=one, one vehicle=two, 5 Small Supply=one, one Medium Supply=two, one Large Supply=five.
- Light Vehicle: either 4 FS infantry or one Small Supply.
- IFV: 6 FS infantry.
- VTOL: either 6 FS infantry or two Small Supply for this profile.

Loading/unloading normally costs both units a Standard Action. A HAT pays `0.5 Speed` per occupied cargo slot involved; the transported unit pays one Standard Action. A HAT paradrop into clear open space is a class-specific exception: infantry/light vehicles may exit in flight without paying that unloading cost. Logi may reload another unit with its own Standard Action; the recipient pays no action.

The active logistics subset applies that Logi resupply rule to co-located friendly support units. The server spends one Logi Standard Action and one Small Supply, then derives the target effect: Artillery gains one Small Supply up to two, Engineers gain one up to current FS, and Medics refill Medical Supply to current FS. The recipient pays no action and the client cannot select resource or quantity. Onboard Logi/Light Vehicle Small Supply also consumes the exact governed cargo capacity. A Logi and packed Artillery may pay paired Standard Actions to hitch or unhitch; the tow follows carrier movement and consumes no cargo slot. Universal weapon reload, arbitrary unsupported recipients, and coordinated HAT drops remain deferred.

The canonical profile permits HAT paradrops only into clear open spaces and blocks hazardous forest/urban drops until the incomplete vehicle result table is resolved (`RC-V5-018`). The vertical slice executes only that clear-space, route-bound HAT paradrop and fails closed for hazardous drops.

Load/unload and the constrained HAT paradrop now transition cargo state. Destruction of a transport containing units or non-Supply mission cargo remains unresolved: it must emit `cargo_destruction_requires_adjudication` and freeze carried records at the transport position. The sources supply no universal passenger/cargo survival rule, so code must not destroy, deploy, or damage cargo automatically (`RC-V5-030`).

Engineer carried Supply and Medic Medical Supply have capacity tied to current FS. Damage that lowers FS below the current carried amount does not silently delete resources: the unit may retain the excess but cannot load/reload more until its load is within capacity (`RC-V5-029`). Tactical scenarios must seed Supply sources and starting loads; with Medium/Large Supply deferred, the profile does not generate an unlimited stockpile implicitly.

### 5.5 Aerospace

The generic VTOL's on-map tactical subset is active: each adjacent flight hex costs one Speed regardless of ground terrain, roads, elevation, rivers or fieldworks; it passes hostile ground formations, cannot spot ground targets, and uses the governed mutually-exclusive cargo profile. Fixed-wing/HAT mechanics below remain deferred unless separately identified as active.

- Atmo Flight units need a runway to land in atmosphere and can perform at most one of landing or takeoff per round.
- Aerospace units spend half total Speed to move between the tactical map and high orbit and cannot reverse that transition in the same round.
- Fighters and bombers cannot spot ground targets and must land at a friendly airfield/flight deck to repair or rearm. A reload is a Primary Action; profile airfields do not consume a tracked crate for it (`RC-V5-023`).
- Fighter attacks use the forward 180° arc along the travel path.
- When an Aerospace Interceptor declares a legal attack against an Aerospace target, that target may attack only a legal Interceptor that attacked it. If several qualify, the target controller chooses; NPC ties use the standard deterministic target policy. If none is a legal target for the intercepted unit, it loses its attack activation (`RC-V5-028`).
- Bomber attacks require the movement path to pass over the target.
- VTOL does not carry the Atmo Flight tag and does not require a runway.
- In scenarios with an available friendly off-map airfield, that airfield may be used for landing/rearming. Optional ammunition-crate economics are deferred.

The Atmo-Fuel stat applies to orbitals, not these starting aerospace units, and is blocked with orbital play.

## 6. Order contract

The V5 order format is authoritative. The deprecated sheet contributes useful state fields, not rules. The public payload expresses intent; the server constructs the normalized `UnitOrder`. A payload MUST contain or resolve to:

| Field | Requirement |
|---|---|
| `unit_id`, `callsign` | Client sends `unit_id`; the callsign is read from the deployment and is seven characters or fewer. |
| `unit_type_id` | Server-owned canonical class ID from the deployment. |
| `carrying` | Required when transport actions become executable; stable IDs and quantities. |
| `equipment`, `ammo` | Server-authoritative snapshot; clients may reference fitted IDs but cannot set inventory. Only explicitly migrated fitted gear can affect the narrow resolver; unapproved or catalogue-only Store gear remains non-executable. |
| `order_type` | Foundation: Hold, Advance, or Rush, subject to the unit class allowed list. Eligible special orders remain canonical but are rejected while `executable=false`. |
| `start_position`, `end_position`, `route` | Scenario coordinate type plus ordered path. |
| `end_facing` | Required for ground units because rear attacks are active. |
| `actions` | Client sends action type and intent fields. The server supplies canonical economy and Speed cost. Foundation permits at most one Attack in this executable action ledger; Attack is not an incidental action. |
| `attack_targets` | Foundation: target and fitted weapon for the single Attack action. Multiweapon target policy is deferred. |
| `current_state_version` | Optimistic-concurrency token for the server snapshot. |
| `rp` | Optional, non-mechanical text. |

Cooldowns, statuses, stealth state, current FS/Hits, remaining Supply, unit stats, class eligibility, action economy, and action Speed cost are server state. They SHOULD be shown beside the order, but clients MUST NOT be able to overwrite them through prose or forged structured fields.

### 6.1 Server-derived eligibility and action economy

The server boundary MUST:

1. Resolve the deployment's `definition_id` to the ruleset-pinned unit definition.
2. Check `allowedOrders` and `allowedActions` for that class.
3. Reject an otherwise canonical definition when its foundation `executable` flag is false.
4. Rebuild each accepted action's `economy`, `speedCost`, action ID, fitted equipment list, and target reference from trusted definitions and deployment state.
5. Reject weapons not fitted to the unit and targets absent from the player's current battlefield intelligence.
6. Revalidate the normalized order in the resolver against authoritative campaign, round, start hex, route, Speed, action limits, ammo, cooldown, LOS/spotter, and target state.

The worker currently performs steps 1–5 at submission; the resolver repeats the ruleset/executable/economy/cost and tactical legality checks. This defense in depth is why client-supplied action costs are assertions, never authority.

### 6.2 Determinism, replay, and private seeds

- A campaign is pinned to a ruleset version. Resolution rejects a mismatched version.
- Submitted player and enemy orders are sorted by stable unit ID then revision before any random draw.
- Event numbering continues after the highest existing event sequence in the same round. Events from prior rounds do not advance the current round's counter.
- Only the accepted order's exact ID and revision becomes `RESOLVED`; a future order for the same unit is untouched.
- The same immutable snapshot, normalized order set, private seed, and logical resolution time produces the same events, persistent-effect keys, state, and digest. Resolving the exact already-resolved order set again is a semantic no-op.
- The seed is trusted server input and is stored only with the private resolution record. It MUST NOT appear in campaign views, public reports, WebSocket payloads, resolution events, or `ROUND_FINISHED`. Public records expose the digest and event IDs, not the seed.
- A newly applied cooldown survives the attack round at full duration and first ticks at the start of the next resolution.

The Campaign DO's tactical order upsert now requires an actor-scoped command ID plus expected campaign/order revisions; clock update requires a command ID plus expected campaign version. Both commit SHA-256 request-hash/response receipts atomically with state (and the order event where applicable). Matching retries replay; changed-payload command reuse and stale revisions fail. Orders are current-round-only and replace the same unit/round aggregate, including a cancelled revision. Cancellation and operator pause/resume/resolve commands still lack the same idempotency/compare-and-set contract, so the command lifecycle is partial rather than a general replay guarantee.

The present deterministic seed construction is an implementation replay key, not a published randomness proof or player-verifiable commit/reveal scheme. A future fairness protocol must preserve replay while keeping unrevealed seed material out of live client projections.

### 6.3 Hidden-information boundary

Campaign views include a player's own deployments/orders and only currently observable enemies. Unknown hexes retain public terrain/memory state but redact dynamic control, objectives, structures, and hazards. The current event projector withholds events whose deployment actor is unseen, and resolution journals, seeds, and pending persistent effects are omitted from ordinary views. Socket invalidations use the authenticated viewer attachment, omit gameplay identifiers, and return only that audience's bounded missed-event projection on reconnect. This is not a complete information-security boundary: reports re-evaluate stored events against present-time visibility and public payload fields lack a complete event-time/declassification policy. Administrators may receive the full authorized projection, but projection MUST NOT mutate authoritative state.

## 7. Catalogue and provenance model

Every normalized record must preserve its origin and activation decision. At minimum:

```yaml
id: stable_machine_id
kind: unit | equipment | structure | action | tag | rule | scenario_option
name: source-facing name
profile: v5_core_curated
activation: canonical_active | active_provisional | catalogued | deferred | blocked | rejected_by_profile
execution: foundation_executable | foundation_partial | foundation_helper | foundation_deferred | not_executable
source_refs:
  - file: rules/Meta - Core Rules (V5).md
    locator: Starting Unit Classes > Infantry Squad
    version: V5 War in the Skies
conflict_ids: [RC-UNIT-001]
implementation_refs: []
test_refs: []
normalized: {}
raw_values: {}
notes: []
```

Implementation requirements:

1. Preserve raw source values alongside normalized values; never overwrite source data during conversion.
2. Every normalized value that differs from a source must cite a `RULE_CONFLICTS.md` ID.
3. Unknown numeric values remain `null`, not zero.
4. Text such as `..1` may not be parsed as numeric Req without a recorded migration decision.
5. Canonical activation and current execution are separate fields. Rules are queried by selected profile, activation state, and engine capability; catalogue-only or foundation-deferred content never enters calculations.
6. Item prerequisites, unit access, slots, duplicate limits, ammunition, duration, cooldown, target class, and Supply costs must be structured fields, not parsed at runtime from prose.
7. Scenario-owned facts include coordinate/measurement mode, LOS cap, terrain costs, occupancy, deployment zones, off-map support, and optional system flags.
8. Resolution events should retain `rule_id`, die result, modifiers, mitigation, and source/decision IDs so a GM can audit every outcome. The current foundation emits detailed dice and mitigation evidence but has not completed rule/source IDs on every event.
9. Order/action records need an explicit executable capability flag. A UI may display canonical deferred material, but must disable submission with the same reason the server will return.
10. Runtime definitions and tests should link back to stable catalogue IDs and conflict IDs; source text must never be copied into an undocumented magic constant.

## 8. Deferred catalogue work

Before a deferred system can become active, it needs the following:

- Special orders/actions: resolver hooks and tests for Melee Charge/Brawl, Stealth, Bridge construction, Funnel, wider Resupply, Garrison, Assault, and Break Out/profile rejection behavior. Evasive, Dig In, First Aid, Engineer Repair, Engineer-assisted Artillery Dig In, Sandbag/Trench/Razor Wire/Tank Trap fieldworks, Artillery Deploy/Pack Up/Bombardment, and Logi-to-Artillery Small Supply transfer are active; Load/Unload and finite-weapon Reload are narrow migrated UI/runtime paths; Scan and Deploy Drone still require authoritative effects/projection before activation.
- Tactical completeness: split-fire policy, directional freestanding cover, typed firing-arc exclusions, melee timing, and remembered intelligence.
- Canonical roster: executable generated definitions for Fighter, Bomber, and Heavy Air Transport without importing legacy same-name statistics; Medic, Logi Truck, IFV, Light Mech, and the generic VTOL are now in the playable generated set.
- Optional equipment: V5-compatible unit access and slot budgets, action costs, dice semantics, ammo/reload data, durations, stack limits, and Req economy.
- Expanded classes: conversion from FS vehicle health to Crew/Hits and V5 weapon dice.
- Structures: build costs in Small/Medium Supply, health/Armor, footprints, facing, destruction, repair, and prerequisites.
- Orbitals: hull Hits, Armor, Speed, Range, customization slots, Atmo-Fuel, cargo Supply size, Req, Light Freighter, fire-critical resolution, and equipment conversion.
- Strategic layer: battlegroup/task-force state, Large/Medium Supply generation and consumption, FOB/HQ construction, route movement, and campaign timing.
- Boarding: entry points, defender assignment, subsystem shutdown effects, capture state, and interaction with simultaneous combat.
- Req economy: starting allowance, income, purchase/refit timing, replacement policy, and validated costs for every selectable unit/item.

Activation requires updating this document and the conflict register in the same change.

## 9. Verification baseline

At the current local reconciliation point, the full root suite passes **59 test files / 462 tests** (the committed Phase-0 baseline was 32/201). Coverage includes deterministic tactical and strategic helpers, quarter-distance simultaneous movement, generated terrain/structure cover and fieldwork movement penalties, multiweapon activations, Evasive movement/combat modifiers, generic VTOL flight and alternative cargo, published enemy-doctrine materialization and permutation-stable target spreading, redaction, routes/LOS/capacity, combat/ammo/cooldowns, force/auth APIs, campaign contracts, strategic adapters/coordinator boundaries, effective-unit construction, governed passenger/Supply/IFV cargo, packed-Artillery towing, class-derived Logi field resupply, deployment/cargo validation, and migrated equipment/support-action paths. The current Playwright gameplay baseline passes 7/7 locally, including a four-round K-17 victory, generated Logi/Artillery Load/Unload controls, VTOL authority, the live Logi Supply-to-cargo capacity readout, IFV authority, Light Mech Evasive hostile passage, and the IFV/MBT Crew Repair composer contract.

This passing baseline proves only the foundation capabilities named in section 1.3. It does not make catalogue-only or foundation-deferred canonical systems executable.

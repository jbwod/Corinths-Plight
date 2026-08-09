# Corinth's Plight — Persistent Cooperative Sci-Fi Wargame

You are acting as the lead engineer and game-systems architect for **Corinth's Plight**, an online persistent cooperative science-fiction wargame.

This is **not** a conventional real-time strategy game and it is **not** a short-session turn-based tactics game.

The core experience is an asynchronous, persistent military campaign inspired structurally by games such as:

* **Helldivers** — players collectively contribute to a larger PvE war.
* **Neptune's Pride** — orders take real-world time, players plan ahead, and anticipation between ticks is part of the game.
* **Planetside** — large organisations of players operate simultaneously across a persistent battlefield.

Do not copy the mechanics, presentation, terminology, assets or UI of those games. They are references for scale, persistence and player experience only.

The actual tactical rules are based upon the attached **Meta / Free Company ruleset**.

---

# 0. START BY AUDITING THE EXISTING PROJECT

Existing repository:

`https://github.com/jbwod/Corinths-Plight`

Before changing architecture or writing major new systems:

1. Inspect the entire repository.
2. Identify:

   * frontend framework
   * backend/API architecture
   * authentication system
   * database/storage
   * existing domain models
   * unit creation system
   * battalion creation/membership system
   * existing ship builder
   * existing requisition/economy work
   * existing UI/components worth retaining
3. Run the existing project.
4. Run its build/tests/linter.
5. Document the current architecture in:

`docs/V1_AUDIT.md`

6. Clearly separate:

   * code that should be retained
   * code that should be refactored
   * code that should be replaced
   * functionality that does not yet exist

Do **not** rewrite the application merely because a greenfield architecture would be cleaner.

Prefer an incremental migration unless the existing architecture fundamentally prevents the required Cloudflare deployment model.

---

# 1. READ THE RULES BEFORE IMPLEMENTING GAMEPLAY

Treat these files as primary design material:

* `Meta - Core Rules (V5).md`
* `Actions and Rules Work ( For Shack Reference).html`
* `Build and Supply System.html`
* `Classes.html`
* `Order Formatting - Needs Rework.html`
* `The Store - Equipment List.html`

Read all of them fully.

Create:

`docs/GAME_SYSTEMS.md`

Summarising the rules as implemented by the game.

Do not silently resolve contradictions between documents.

The source material represents several iterations of the Meta ruleset. For example, class statistics and engineer/build mechanics are not completely identical between documents.

Therefore build a **versioned rules catalogue**.

Game mechanics must not depend on values scattered through TypeScript conditionals.

Definitions such as:

* unit classes
* equipment
* weapons
* actions
* order types
* structures
* terrain
* ship classes
* enemy classes
* requisition costs
* ammo
* cooldowns
* build costs
* supply costs

must be represented as game data.

Each definition should support metadata such as:

```ts
rulesetVersion
source
status // active, experimental, legacy
notes
```

If two sources disagree, import the competing values and flag the conflict in the seed/migration documentation.

Select an initial active ruleset explicitly rather than implicitly.

The system must make it possible to balance units later without rewriting the combat engine.

---

# 2. PRODUCT CONCEPT

Build Corinth's Plight as a **persistent asynchronous cooperative galactic war**.

A player has a long-term military force associated with their account.

Their assets survive between campaigns unless destroyed.

A player's collection can contain:

* infantry
* specialist infantry
* engineers
* artillery
* logistics
* vehicles
* tanks
* mechs
* aerospace
* support units
* eventually orbital/space assets where appropriate

Each unit has persistent identity.

A unit is not just:

> "Main Battle Tank"

It should be something closer to:

> 7th Armoured — "Bellator"

with:

* unique ID
* callsign/name
* class
* history
* current status
* base statistics
* modifications
* equipment
* ammunition
* upgrades
* damage
* campaign deployment
* battle record
* requisition value

Players should become attached to surviving units.

Losing an experienced, heavily equipped unit should matter.

The rules explicitly make destruction meaningful: equipment and refits attached to a destroyed unit are lost.

Preserve that consequence.

---

# 3. THE CORE GAME LOOP

The main loop is:

**Prepare → Deploy → Plan → Submit Orders → Wait for Tick → Resolve → Review → Adapt**

This waiting period is intentional gameplay.

Do not turn the game into instant movement simply because it is technically easier.

A campaign has a configurable round duration.

Production should support something such as one resolution every 24 hours, but the duration must be configurable per campaign.

Development campaigns need accelerated clocks such as:

* manual resolve
* 1 minute
* 5 minutes
* 30 minutes

Never make developers wait a day to test the game.

Each campaign displays prominently:

**ROUND 18**

**ORDERS RESOLVE IN 06:14:32**

Orders remain editable until that round locks.

---

# 4. ORDER LIFECYCLE

Orders are first-class persistent objects.

Use states similar to:

```text
DRAFT
SUBMITTED
LOCKED
RESOLVING
RESOLVED
FAILED
CANCELLED
```

A player can:

* draft an order
* edit it
* submit it
* replace it before lock
* cancel it before lock
* schedule an order for a future round

Future orders should be possible.

For example:

```text
Round 31:
Advance along northern ridge.

Round 32:
If still operational, hold position and entrench.

Round 33:
Move toward Objective Echo.
```

Do not initially create a complicated scripting language.

Future orders can begin as simple scheduled structured orders.

If a scheduled order becomes impossible because the unit:

* was destroyed
* moved elsewhere
* ran out of ammunition
* became immobilised
* is no longer deployed
* lacks required equipment

the resolver should reject or partially execute it according to the rules and produce a clear event explaining why.

---

# 5. STRUCTURED ORDERS, NOT FREEFORM TEXT

The existing tabletop order format contains useful information but should become structured game data.

A unit order should be capable of representing:

```ts
{
  unitId,
  campaignId,
  round,
  orderType,
  startHex,
  route,
  endHex,
  facing,
  actions,
  targets,
  equipmentUsed,
  ammoUsed,
  incidentalActions,
  optionalRoleplayText
}
```

The UI should provide a visual order builder.

Example interaction:

1. Select unit.
2. Choose ADVANCE.
3. Click a destination.
4. Display calculated route.
5. Select final facing.
6. Add an ATTACK action.
7. Click enemy/target hex.
8. Select weapon.
9. Submit order.

Then generate a human-readable order card automatically.

The user should never need to manually type statistics already known by the server.

---

# 6. META RULES ENGINE

Implement a pure deterministic rules engine separate from UI and persistence.

Something conceptually similar to:

```text
packages/
    rules-engine/
```

The rules engine should know nothing about React or Cloudflare.

Given:

```text
previous battlefield state
+
ruleset version
+
player orders
+
enemy orders
+
random seed
```

it must produce:

```text
new battlefield state
+
ordered event log
```

The same inputs must always produce the same result.

Never use uncontrolled `Math.random()` during resolution.

Use deterministic seeded random generation.

A seed could derive from:

```text
campaign ID
round number
ruleset version
```

Store every meaningful dice result in the event log.

This makes combat reproducible and debuggable.

---

# 7. ROUND RESOLUTION

Implement resolution explicitly as phases.

Do not build a giant `resolveRound()` containing thousands of lines of interdependent logic.

Use a phase pipeline.

A reasonable initial model is:

```text
1. Lock round
2. Snapshot battlefield
3. Validate submitted orders
4. Generate enemy intentions
5. Resolve movement
6. Resolve interceptions/blocking/contact
7. Resolve actions
8. Resolve combat simultaneously
9. Apply casualties/damage
10. Resolve structures/building/repairs
11. Resolve logistics/ammunition/supply
12. Advance cooldowns/status effects
13. Resolve objectives/control
14. Persist campaign result
15. Apply persistent unit consequences
16. Generate round report
17. Advance campaign clock
```

Where the source rules are ambiguous about sequencing, isolate that interpretation in the rules layer and document it.

Do not bury interpretations inside unrelated implementation code.

---

# 8. HEX WORLD

The campaign battlefield is a proper hex map.

Use axial or cube coordinates internally.

Do not invent a bespoke coordinate system if a standard hex coordinate model solves the problem.

Each hex should support data including:

```text
coordinate
terrain
elevation
movement modifiers
LOS modifiers
river edges
road edges
structures
objectives
control
occupancy
visibility
environment
```

The attached rules include concepts such as:

* movement cost between hexes
* elevation cost
* river crossings
* facing
* line of sight
* terrain obstruction
* forests
* buildings
* terrain advantage
* unit stacking/capacity

Represent these as rules rather than rendering tricks.

A hex can have limited unit capacity.

The supplied Meta reference divides a hex into up to three unit positions and terrain/structures may reduce available capacity.

Model capacity explicitly.

---

# 9. FACING

Ground units can have facing:

```text
N
NE
SE
S
SW
NW
```

or the equivalent numerical hex directions internally.

Facing matters because armour weak spots, infantry battlelines and flanking exist in the rules.

The map must visually communicate facing.

Do not represent a tank as an undirected dot if rear armour matters.

---

# 10. LINE OF SIGHT AND FOG OF WAR

Implement genuine line-of-sight calculation over the hex grid.

LOS can be affected by:

* campaign maximum LOS
* terrain
* elevation
* buildings
* forests
* equipment
* sensors
* smoke
* stealth

Visibility must be server authoritative.

The client must never receive secret enemy data merely hidden with CSS.

Return only information that the requesting player/battalion is permitted to know.

Maintain separate concepts:

```text
currently visible
previously observed
unknown
```

This enables persistent battlefield intelligence.

---

# 11. MOVEMENT

Movement should understand paths rather than only start/end coordinates.

This matters because:

* enemies may intercept along a route
* Advance can encounter hostiles
* air units may attack while passing over locations
* rivers/terrain modify movement
* facing changes
* roads matter
* orbital/air movement behaves differently

An order therefore contains an explicit route.

The UI may pathfind automatically, but players should be able to inspect and adjust the route before submission.

---

# 12. PLAYER INTENTIONS

Cooperation is fundamental.

Players in the same allied force should be able to see each other's submitted intentions before resolution where campaign rules permit it.

Display allied orders as overlays:

* arrows
* destination markers
* attack markers
* hold markers
* construction markers
* support areas
* orbital drops

This should feel like a military operations table.

A player looking at the map before the daily tick should be able to understand:

> "Alpha is holding this bridge."

> "2nd Armour is advancing here."

> "Artillery is bombarding these hexes."

> "Engineers are building a position here."

The website should improve cooperative planning rather than simply digitise a spreadsheet.

---

# 13. STANDARD AND SPECIAL ORDERS

The data model and engine must accommodate the Meta order concepts including:

* Hold
* Advance
* Rush
* Evasive
* Melee Charge
* Stealth

Do not hardcode the UI to exactly those six forever.

Order types should be extensible definitions with:

```text
eligibility
movement modifier
attack restrictions
defence modifiers
required tags
resolution hooks
```

---

# 14. ACTION SYSTEM

Actions should also be extensible.

Examples from the provided material include concepts such as:

* Attack
* Assault
* Melee Charge
* Dig In
* Break Out
* Deploy
* Pack Up
* Repair
* Construct
* Garrison
* Load
* Unload
* Resupply
* Reload
* Scan
* Deploy Drone
* Heal
* Orbital Drop
* Bombardment
* Air support

Represent action costs and restrictions through rules data.

Support:

* standard actions
* primary actions
* incidental actions

as required by the active ruleset.

---

# 15. COMBAT

Combat remains tabletop-like rather than action-game-like.

Important concepts include:

* Force Strength
* Hits
* armour
* defence
* damage
* AP
* range
* facing
* flanking
* line of sight
* simultaneous attacks
* multiple weapon systems
* infantry damage caps
* vehicle subsystem damage
* melee/brawls
* structures/cover
* indirect fire
* cooldowns
* ammunition

Do not calculate final combat values on the browser.

The frontend can preview expected statistics, but the server is authoritative.

Round reports should expose the actual calculations.

Example:

```text
7th Armour fired Main Cannon at Bug Behemoth.

Roll: 5
Damage: 5
AP: 3

Target Armour: 4
Effective Armour: 1

Attack penetrated.

Bug Behemoth suffered 1 Hit.
```

This makes a tabletop rules game understandable and auditable.

---

# 16. PERSISTENT PLAYER UNITS

A player's units exist independently of campaigns.

Conceptually separate:

```text
UnitDefinition
```

from:

```text
PlayerUnit
```

from:

```text
CampaignDeployment
```

A Main Battle Tank definition describes what that class is.

A PlayerUnit represents the actual tank unit the player owns.

A CampaignDeployment represents that unit currently operating on a particular campaign map.

This prevents campaign logic from corrupting persistent collection data.

---

# 17. REQUISITION

Implement requisition as a transaction ledger.

Do not store only:

```text
player.requisition = 65
```

Maintain transactions:

```text
+20 Campaign reward
-8 Purchased unit
-2 Equipment
+5 Mission reward
```

The calculated balance is derived from the ledger or maintained safely as a projection.

Every purchase must be server-side validated.

Prevent double spending.

Requisition can purchase:

* new units
* equipment
* upgrades
* refits
* relevant orbital upgrades

Use the supplied class/store definitions as initial catalogue data.

---

# 18. EQUIPMENT AND UPGRADES

Equipment definitions should support:

```text
name
description
category
slotType
cost
allowedClasses
requiredEquipment
incompatibleEquipment
statModifiers
abilityGrants
ammoCapacity
cooldown
consumable
rulesText
rulesetVersion
```

A unit should expose available slots based upon its class.

Equipment eligibility must be enforced by the server.

Do not allow the frontend to simply submit arbitrary equipment IDs.

Persistent ammunition and consumables should matter where the rules specify them.

---

# 19. UNIT DEATH

Destroyed units remain meaningful historical records.

Do not simply delete database rows.

Use a state such as:

```text
ACTIVE
DEPLOYED
DAMAGED
DESTROYED
RETIRED
```

A destroyed unit should retain:

* name
* class
* campaign history
* equipment at destruction
* date/round destroyed
* cause of destruction if known

But it may no longer be deployed.

Equipment lost with the unit should not magically return to inventory.

---

# 20. BATTALIONS

Players can form persistent organisations called **Battalions**.

A battalion contains:

* name
* insignia
* description
* members
* ranks
* permissions
* battlegroups
* ship
* campaign deployments
* history

Ranks must be data-driven.

Do not hard-code assumptions such as exactly:

```text
Commander
Captain
Lieutenant
Private
```

Instead model rank names plus permissions.

Permissions may include:

```text
invite members
remove members
edit battalion
manage ranks
create battlegroups
assign units
manage ship
issue ship movement
manage battalion requisition
place strategic markers
```

This permits each battalion to define its own organisational structure.

---

# 21. BATTLEGROUPS

Battlegroups are temporary or persistent operational formations.

They group units from multiple players together for a particular objective.

Example:

```text
Battalion: 33rd Expeditionary

Battlegroup Hammer
- Jack: Main Battle Tank
- Alice: Mechanised Infantry
- Sam: Engineers
- Lee: Artillery

Battlegroup Raven
- Scout vehicles
- Special Forces
- VTOL
```

Battlegroups help players coordinate and filter large maps.

They do not automatically transfer ownership of units.

Command permissions should determine whether battlegroup leaders can issue orders for other players' units.

---

# 22. THE BATTALION SHIP

Each battalion has a persistent spacecraft acting as its strategic home and transportation hub.

The ship is a major long-term progression system.

The ship has:

* name
* class
* health
* armour
* speed
* equipment slots
* installed equipment
* internal modules
* external modules
* cargo/supply capacity
* carried units
* embarked battlegroups
* aerospace capacity
* location
* destination
* travel state
* upgrade history

Initial orbital classes and equipment should come from the rules data.

The ship should be visually and mechanically central to the battalion experience.

Think of it as the bridge between the player's persistent collection and active campaigns.

---

# 23. SHIP AS HUB

Create a dedicated battalion ship interface.

Possible sections:

```text
BRIDGE
HANGAR
ARMOURY
CARGO
BATTLEGROUPS
ENGINEERING
UPGRADES
NAVIGATION
```

These should correspond to actual mechanics rather than decorative fake systems.

For example:

**NAVIGATION**

shows current planet, nearby campaigns and transit orders.

**HANGAR**

shows units currently aboard.

**ARMOURY**

allows valid equipment/refit operations.

**ENGINEERING**

shows ship modules and upgrade slots.

**CARGO**

shows relevant supply capacity.

---

# 24. GALACTIC / STRATEGIC LAYER

Campaigns exist on planets.

The application should have two distinct spatial levels.

## Galactic / Operational View

Shows:

* planets
* battalion ships
* campaigns
* campaign status
* travel routes
* major objectives
* war progress

## Campaign View

Shows:

* the actual hex battlefield
* units
* terrain
* enemies
* structures
* objectives
* submitted orders
* supply
* fog of war

Do not attempt to turn the galaxy layer into another giant tactical map.

Its purpose is strategic deployment and context.

---

# 25. TRAVEL

Moving a battalion between planets is itself an order.

Do not teleport the battalion instantly.

A ship should have a strategic travel state:

```text
DOCKED
ORBIT
IN_TRANSIT
ARRIVING
DEPLOYING
```

Travel time should be determined through campaign/strategic rules and ship capabilities.

The implementation must be flexible enough for routes to consume one or more strategic rounds.

Units aboard the ship cannot simultaneously be deployed on another planet.

This invariant must be enforced server-side.

---

# 26. DEPLOYMENT

A player chooses which persistent units to commit to a campaign.

Validate:

* unit belongs to player
* unit is alive
* unit is not already deployed elsewhere
* battalion/ship can transport it
* campaign permits the class
* equipment is valid
* required supplies/cargo are available

Deployment creates a campaign-specific representation of the unit.

Do not move the entire persistent unit record into campaign state.

---

# 27. SUPPLY AND LOGISTICS

Logistics are a meaningful part of the game.

The attached rules distinguish concepts such as:

* Large Supply
* Medium Supply
* Small Supply
* ammunition
* engineer build supply
* orbital cargo
* FOBs
* HQs
* supply depots
* reloading
* repairing

Build a generic inventory/resource model capable of representing these systems.

Do not reduce supply to one global integer.

Supply should have:

```text
type
quantity
location
carrier
source
destination
```

Moving supplies around the battlefield should matter.

---

# 28. ENGINEERING AND STRUCTURES

Structures are persistent campaign entities attached to hexes.

Examples from the supplied material include:

* trenches
* bunker networks
* walls
* gates
* roads
* supply depots
* sensor towers
* radar stations
* repair centres
* VTOL platforms
* rough airfields
* weapon emplacements

A structure definition should specify:

```text
buildCost
buildPoints
health
terrain requirements
effects
allowed builders
upgrade path
```

Construction can take multiple rounds.

Represent construction progress explicitly.

---

# 29. PvE ENEMY SYSTEM

The primary campaign experience is cooperative PvE.

Create enemy factions through data.

Example faction:

```text
INSECTOID / BUG SWARM
```

A faction definition should include behavioural doctrine rather than merely statistics.

Possible doctrine data:

```text
preferredTargets
aggression
cohesion
retreatThreshold
swarmBehaviour
objectivePriority
vehiclePriority
infantryPriority
preferredOrderTypes
```

Enemy forces use the **same fundamental order/resolution system** as players.

Do not cheat by moving enemies after seeing resolved player outcomes.

Enemy intentions should be generated from the locked pre-resolution world state and then resolved alongside player intentions.

Enemy doctrine should initially be deterministic game AI.

Do not use an LLM to decide ordinary enemy moves.

---

# 30. CAMPAIGN DIRECTOR / GM TOOLS

Even though the game is PvE, retain the tabletop heritage by supporting administration/GM control.

Create an admin campaign interface capable of:

* create campaign
* configure round duration
* pause campaign
* resume campaign
* manually lock orders
* manually resolve round
* create/spawn enemies
* place objectives
* edit hex properties
* inspect submitted orders
* inspect resolver output
* award requisition
* inspect persistent units
* mark exceptional events
* create announcements

Do not build a fully featured map editor in the first milestone.

Initially allow maps to be loaded from structured map JSON.

---

# 31. ROUND REPORTS

After a tick, give players an excellent report.

The report should answer:

**What happened?**

rather than simply showing the changed map.

Include:

* movements
* contacts
* attacks
* dice rolls
* casualties
* destroyed units
* construction
* resupply
* objectives captured
* enemy reveals
* important strategic events

Allow playback of a round as an event sequence.

The system does not need animated real-time combat simulation.

A timeline/replay of deterministic events is enough.

---

# 32. CLOUDFLARE ARCHITECTURE

Deployment target is **Cloudflare**.

Prefer a Cloudflare-native architecture.

## Application

Use TypeScript throughout unless the existing repository provides a strong reason not to.

Prefer:

```text
React
Vite
Cloudflare Vite plugin
Cloudflare Workers
```

Keep frontend and Worker/API code in the same project or monorepo where practical.

Do not build a traditional Node/Express server requiring a persistent VM.

---

# 33. D1 — GLOBAL PERSISTENT DATA

Use Cloudflare D1 for relational long-term application data.

Examples:

```text
users
profiles

rulesets
unit_class_definitions
equipment_definitions
action_definitions
order_type_definitions
structure_definitions
ship_class_definitions
enemy_definitions

player_units
player_unit_equipment
unit_history

requisition_transactions

battalions
battalion_memberships
battalion_ranks
battlegroups
battlegroup_units

ships
ship_equipment
ship_cargo

planets
campaigns
campaign_memberships

deployments

round_metadata
campaign_event_archive
```

Use migrations.

Never mutate production schema manually as the normal development workflow.

Create seed tooling for game definitions.

---

# 34. DURABLE OBJECTS — ACTIVE CAMPAIGN STATE

Use **one Durable Object per active battlefield/campaign** as the coordination boundary.

Conceptually:

```text
CampaignDurableObject
```

It is responsible for active mutable battlefield state such as:

* current round
* round deadline
* deployed battlefield state
* active orders
* order lock
* enemy state
* campaign structures
* battlefield resources
* WebSocket clients
* round resolution coordination

Do not create one global Durable Object for the entire game.

Route by campaign ID.

Example concept:

```ts
env.CAMPAIGN.getByName(campaignId)
```

---

# 35. CAMPAIGN CLOCK

The Campaign Durable Object owns the campaign clock.

Use Durable Object alarms to wake campaigns when the next scheduled event occurs.

Maintain a persisted event schedule because a Durable Object only needs to wake for the next event.

Possible events:

```text
ORDER_LOCK
ROUND_RESOLVE
CAMPAIGN_END
```

Resolution must be **idempotent**.

A round may never execute twice because a scheduled handler was retried.

Use identifiers such as:

```text
campaignId + roundNumber
```

and persist resolution status before/while committing results safely.

---

# 36. REAL-TIME CONNECTIONS

Players viewing a campaign should receive live updates for:

* allied order submissions
* order edits
* map pings
* countdown changes
* campaign pause/resume
* round completion
* updated map state

Use Durable Object WebSockets.

Use the hibernation API where suitable rather than assuming the Durable Object remains continuously active.

The game is asynchronous, so do not send high-frequency positional updates.

There are no 60Hz server ticks.

---

# 37. R2

Use R2 only where object storage is genuinely useful.

Potential uses:

* battalion insignia uploads
* campaign artwork
* large map source files
* immutable round snapshots
* exported campaign replays

Do not put ordinary relational game state into R2 merely because it exists.

---

# 38. QUEUES

Queues may be used for asynchronous work that does not need to block campaign resolution, such as:

* notifications
* analytics events
* archival processing
* Discord integration later
* email
* replay generation

Do not make combat correctness depend upon eventually-consistent background consumers.

The authoritative round result must be committed before secondary work is queued.

---

# 39. NO CRITICAL STATE IN KV

Do not use Workers KV for:

* unit ownership
* requisition balance
* active orders
* campaign state
* combat results

Those systems require authoritative state.

KV may be used later for disposable caches if genuinely useful.

---

# 40. ACTIVE CAMPAIGN VS PERSISTENT STATE

Maintain a clear boundary:

```text
D1
    persistent world
    players
    ownership
    battalions
    ships
    requisition
    rules catalogue
    campaign metadata

Campaign Durable Object
    active battlefield
    current round
    units currently deployed
    enemy state
    structures
    submitted orders
    live coordination
```

At deployment:

```text
Persistent Player Unit
        ↓
Campaign Deployment Snapshot
```

At campaign changes/death:

```text
Campaign Result
        ↓
Idempotent Persistent Effect
        ↓
D1 Player Unit
```

Do not allow a reconnect, Worker retry or alarm retry to duplicate permanent effects.

---

# 41. APPEND-ONLY CAMPAIGN EVENTS

Keep an append-only event log.

Do not attempt full event sourcing initially.

Maintain an authoritative current-state snapshot plus events.

Example events:

```text
ROUND_STARTED
ORDER_SUBMITTED
ORDER_LOCKED
UNIT_MOVED
UNIT_ATTACKED
DAMAGE_APPLIED
UNIT_DESTROYED
STRUCTURE_COMPLETED
SUPPLY_TRANSFERRED
OBJECTIVE_CAPTURED
ROUND_FINISHED
```

Every event gets:

```text
eventId
campaignId
round
sequence
type
actor
payload
timestamp
```

This provides:

* debugging
* replay
* auditability
* battle history

---

# 42. FRONTEND INFORMATION ARCHITECTURE

Build these primary areas.

## Command

Player dashboard.

Show:

* next round timer
* currently deployed units
* battalion
* ship location
* current campaign
* requisition
* units awaiting orders
* recent round results

## Forces

Persistent player collection.

Filter by:

* infantry
* armour
* artillery
* aerospace
* mech
* support
* status

## Unit Detail

Show:

* identity
* class
* stats
* equipment
* ammo
* upgrades
* campaign history
* current deployment
* battle record

## Requisitions

Store / equipment catalogue.

Show valid options based upon selected unit.

## Battalion

Show:

* organisation
* members
* ranks
* battlegroups
* current operations

## Ship

Persistent battalion hub.

## Galactic Operations

Planets and available campaigns.

## Campaign

Main hex-map interface.

## Reports

Round history and replay.

---

# 43. CAMPAIGN UI

The hex map is the centrepiece.

Desktop-first is acceptable, but it must remain usable on tablets.

The interface should have three main regions:

```text
LEFT
selected units / battlegroup / filters

CENTRE
interactive hex map

RIGHT
selected unit / order editor / target details
```

Top bar:

```text
campaign
planet
round
clock
battalion
connection state
```

Bottom/timeline area may show:

```text
submitted orders
round events
combat log
```

Do not cover the map with unnecessary panels.

---

# 44. MAP RENDERING

Avoid rendering thousands of hexes as huge trees of expensive React DOM components if map scale makes that unsuitable.

Separate map rendering from React state management.

Use an efficient Canvas/WebGL/SVG strategy appropriate to measured map size.

The map needs:

* pan
* zoom
* selection
* hover
* routes
* facing
* unit stacking
* terrain
* fog
* structures
* intention arrows
* objective markers

Maintain stable performance before adding visual effects.

---

# 45. COLLABORATIVE COMMAND EXPERIENCE

The game's personality should come from planning.

Useful cooperative tools include:

* allied intention overlays
* battlegroup filters
* map pings
* command markers
* objective markers
* submitted/not-submitted status
* unit readiness
* shared operation notes

Do not build a complete Discord replacement.

Communication tools should support the battlefield rather than become a social platform.

---

# 46. SECURITY

Assume every browser request is hostile.

The server must verify:

* user identity
* unit ownership
* battalion permissions
* campaign membership
* equipment eligibility
* requisition balance
* target validity
* movement legality
* action legality

Never trust calculated stats supplied by the client.

Do not allow:

```text
POST /equip
{
  damage: 999
}
```

The client sends IDs and intent.

The server derives rules and statistics.

Prevent IDOR attacks across:

* units
* battalions
* campaigns
* ships
* orders

---

# 47. CONCURRENCY INVARIANTS

Explicitly test these.

A player cannot:

* spend the same requisition twice
* deploy the same unit twice
* equip an item the unit cannot use
* submit an order for someone else's unit
* move a ship they lack permission to command
* edit an order after lock
* resurrect a destroyed unit
* resolve the same round twice

A unit cannot simultaneously be:

```text
aboard a ship on Planet A
and
deployed on Planet B
```

These are server invariants, not UI restrictions.

---

# 48. TESTING

Rules engine testing is critical.

Create tests for:

* hex neighbours
* distance
* route cost
* elevation
* rivers
* capacity
* facing
* flanking
* line of sight
* fog
* speed expenditure
* action legality
* armour
* AP
* defence
* infantry FS damage cap
* vehicle Hits
* melee
* indirect fire
* ammo
* cooldowns
* supply
* build progress
* equipment restrictions

Add deterministic replay tests.

Given a stored round fixture:

```text
state + orders + seed
```

the engine should always produce the exact same event sequence.

---

# 49. ROUND RETRY TEST

Specifically test Cloudflare retry scenarios.

Simulate:

1. round begins resolving
2. some work completes
3. handler fails
4. handler runs again

Expected:

**one round result**

not:

* duplicated attacks
* duplicated requisition
* double deaths
* duplicate campaign events
* round skipping

Idempotency is a core requirement.

---

# 50. OBSERVABILITY

Add structured logging with identifiers such as:

```text
requestId
campaignId
round
userId
unitId
orderId
```

A failed round must be diagnosable.

An admin should be able to answer:

> Why did this unit not move?

> Why was this attack rejected?

> Why was this unit visible?

> Why did the campaign fail to advance?

without guessing.

---

# 51. RULE ADMINISTRATION

Eventually expose an admin-only rules interface.

Do not make this part of the first UI milestone, but architect for it.

Administrators should eventually be able to edit:

* class stats
* equipment
* costs
* cooldowns
* eligibility
* structures
* enemy templates

and publish a new ruleset version.

An active campaign remains bound to the ruleset version it started with unless explicitly migrated.

This is essential for long campaigns.

---

# 52. DEVELOPMENT APPROACH

Build vertical slices.

Do not spend months creating every Meta rule before anything is playable.

## Phase 1 — Repository + Platform

* audit v1
* migrate/deploy to Cloudflare
* D1
* authentication
* migrations
* core domain types

## Phase 2 — Persistent Forces

* player profile
* requisition ledger
* unit catalogue
* create/buy unit
* equipment
* unit detail
* persistence

## Phase 3 — Battalion + Ship

* battalion creation
* membership
* configurable ranks
* battlegroups
* ship
* ship upgrades
* ship inventory/location

## Phase 4 — Campaign Skeleton

* create/join campaign
* Campaign Durable Object
* hex map
* deployment
* WebSocket sync
* accelerated dev clock

## Phase 5 — Orders

* unit selection
* movement route
* facing
* structured order
* submit/edit/cancel
* allied intention overlays
* order lock

## Phase 6 — Resolution

Implement only enough rules for a complete playable loop:

```text
Hold
Advance
Attack
movement
LOS
range
FS
Hits
armour
AP
damage
death
```

Round can now:

```text
plan
lock
resolve
report
repeat
```

Do not move forward until this works robustly.

## Phase 7 — PvE

* enemy templates
* basic bug doctrine
* enemy intentions
* objectives
* fog of war
* campaign victory/failure

## Phase 8 — Advanced Meta Rules

Add incrementally:

* artillery
* engineers
* supply
* structures
* stealth
* aerospace
* transports
* melee
* cooldowns
* specialised equipment

## Phase 9 — Strategic War

* planets
* ship travel
* multiple simultaneous campaigns
* battlegroup deployment
* galactic progress

---

# 53. MVP SCENARIO

The first complete playable test should be deliberately small.

Create:

**Planet:** Corinth

**Campaign:** Outpost K-17

**Players:** 2–8

Available forces:

```text
Infantry
Engineers
Light Vehicle
Main Battle Tank
Artillery
```

Enemy:

```text
Bug Drone
Bug Warrior
Bug Heavy
```

Map:

approximately 20–40 hexes across.

Objectives:

```text
Hold Outpost K-17
Destroy Bug Nest
Keep Supply Route Open
```

Players deploy persistent units.

They submit orders.

The clock locks.

Bugs generate intentions.

The round resolves.

Players receive a report.

Units retain damage/casualties.

The next round begins.

That complete loop is more important than implementing fifty incomplete unit classes.

---

# 54. DESIGN PRINCIPLES

Follow these throughout development.

### Persistence over sessions

Closing the website changes nothing about the war.

### Planning over clicking

The interesting decision is the order, not mouse dexterity.

### Cooperation over competition

Players are fighting the campaign, not primarily each other.

### Consequences matter

Units, equipment, ammunition, logistics and positioning persist.

### Rules are transparent

Players should understand why something happened.

### Rules are data

Balance changes must not require rewriting systems.

### Server authority

Never trust the client with game truth.

### Determinism

A round should be replayable.

### Idempotency

A round should resolve exactly once.

### Build vertically

Playable systems before giant feature inventories.

---

# 55. DO NOT DO THESE THINGS

Do not:

* turn this into a real-time RTS
* make units teleport instantly between campaigns
* make units disposable per-match entities
* hard-code unit statistics throughout components
* duplicate rules logic between client and server
* trust client calculations
* make combat depend on WebSocket connectivity
* make all state one giant JSON document
* create one global Durable Object
* store authoritative game state in KV
* use an LLM for normal enemy movement
* hide unknown enemy information only in frontend CSS
* silently choose between contradictory source rules
* build every advanced rule before establishing a working daily round
* replace existing v1 functionality simply for architectural purity

---

# 56. FIRST IMPLEMENTATION DELIVERABLE

Before implementing the complete game, produce these documents in the repository:

```text
docs/
    V1_AUDIT.md
    ARCHITECTURE.md
    GAME_SYSTEMS.md
    RULE_CONFLICTS.md
    DATA_MODEL.md
    ROUND_RESOLUTION.md
    CLOUDFLARE.md
```

Then produce:

```text
D1 migrations
ruleset seed data
core TypeScript domain models
pure rules-engine skeleton
Campaign Durable Object skeleton
accelerated local campaign clock
basic hex-map prototype
```

The project must deploy successfully to Cloudflare at this point.

Only then begin expanding gameplay.

---

# 57. DEFINITION OF SUCCESS

The architecture is successful when this scenario works:

A player logs in.

They own several persistent units.

They spend requisition to buy and equip another unit.

They belong to a battalion.

The battalion has a named and upgradeable spacecraft.

The ship travels to a planet containing an active campaign.

The player deploys selected units from the ship.

They open the campaign's hex map.

They see allied units and the battlefield intelligence available to them.

They give one infantry unit an Advance order.

They give a tank an Attack order.

They schedule another unit to Hold next round.

Other battalion members submit their own intentions.

At the campaign deadline, orders lock automatically.

The server generates enemy intentions.

The round resolves exactly once.

Movement, LOS, equipment, dice, armour, damage and casualties are resolved deterministically.

Everyone reconnecting sees the same resulting battlefield.

A round report explains exactly what happened.

A destroyed unit remains destroyed on the player's persistent roster and its equipment is lost.

Surviving units remain available for subsequent rounds and campaigns.

The next campaign round has already begun.

That is the game.

# Corinth's Plight Strategic Layer

**Status:** Phase 3 additive schema and development-world foundation (2026-08-10)

**Authority:** `rules/Meta - Core Rules (V5).md` is authoritative for strategic movement, Task Force/Battlegroup separation, and supply. The Phase 3 product brief defines the digital world and interface. Unpublished balance values stay unresolved.

## 1. Delivered boundary

Migration `0004_phase3_strategic_layer.sql` adds a persistent strategic model without replacing Phase 1 tactical campaigns or Phase 2 persistent forces. D1 owns relational world truth. One named Strategic Map Durable Object may coordinate one theatre/map; one Campaign Durable Object continues to coordinate one tactical battlefield.

The schema and `development-strategic-world.sql` are implemented. Runtime endpoints and the Strategic Map coordinator may use these records, but schema presence alone does not claim complete deployment, withdrawal, tactical-result reconciliation, production authentication, or orbital combat.

## 2. Three persistent scales

```text
GALACTIC / THEATRE
    strategic_locations, strategic_maps, strategic_nodes, strategic_routes

BATTALION / STRATEGIC
    Battalions, Battlegroups, Task Forces, ships, supply, strategic orders

CAMPAIGN / TACTICAL
    campaigns, deployments, one Campaign Durable Object per campaign
```

The layers link through stable IDs. They are not merged into one global state object.

## 3. Structured locations

`strategic_locations` is the semantic location hierarchy. A row has a typed location, optional parent, name, status, metadata, and revision. The accepted types cover galaxies, systems, planets, moons, orbits, stations, jump points, surface regions, cities, bases, junctions, objectives, and campaign locations.

Foreign keys reject missing parents. A recursive update trigger rejects hierarchy cycles. Self-parenting is also a table check. The seed uses this hierarchy:

```text
Helion System
├── Corinth
│   ├── Corinth High Orbit
│   ├── Northern Theatre
│   │   ├── North Airbase
│   │   ├── Kestrel Ridge
│   │   └── Outpost K-17
│   └── Southern Continent
│       ├── New Carthage
│       ├── Hive Basin
│       └── Junction 7
├── Corinth II
│   └── Operation Cold Horizon
├── Relay Station Kappa
└── Helion Jump Point
```

`planets.strategic_location_id` connects the Phase 2 planet record to this hierarchy. Existing `ships.location_planet_id` and Player Unit location columns remain compatibility fields; they were not destructively rebuilt.

## 4. Node-and-route maps

`strategic_maps` defines a coordination shard and presentation scope. Its `coordinator_key` is the stable name used to address the corresponding Strategic Map Durable Object. The development theatre uses the stable ID and coordinator key `strategic-map-corinth`.

`strategic_nodes` projects selected semantic locations onto a map. Triggers require the node type to match its semantic location type. Node position JSON is presentation metadata only. Pixel distance never determines travel time.

`strategic_routes` connects two nodes in the same map through composite foreign keys. Each route records:

- type and directionality;
- an explicit array of allowed movement profiles;
- status such as open, blocked, locked, or destroyed;
- nullable `base_travel_rounds` and a separate travel-cost status;
- source and revision metadata.

The V5 rules establish point-to-point movement but do not publish universal travel timing. The Corinth development scenario supplies one strategic movement point per round for Task Forces and ground Battlegroups plus positive route costs with `travel_cost_status = SCENARIO_CONFIG` and explicit `CORINTH_DEVELOPMENT_SCENARIO` metadata: one cost unit between adjacent surface objectives and the airbase, two for rough surface/orbital hops, and three between Relay Kappa and Corinth II. These are authored scenario values, not canonical V5 defaults. Any route or formation outside this scenario still fails closed unless its own content publishes positive timing.

## 5. Formations

`task_forces` is the orbital/aerospace strategic formation. It owns a map/node position, commander, status, supply state, and optimistic revision. `task_force_ships` supports one or more ships later while the current fixture has one primary ship.

`battlegroups` remains the ground formation. Phase 3 adds a callsign, strategic status, current node, current operation, carrier Task Force, revision, and update time. A Battlegroup with a carrier cannot simultaneously store its own node: its location derives from the carrier. A trigger rejects both location fields being populated.

`task_force_battlegroups` is the embarkation lifecycle. A partial unique index prevents one Battlegroup from being actively embarked in two Task Forces. Unit ownership remains in `player_units.owner_id`; neither assignment nor embarkation transfers it.

## 6. Operations and tactical campaigns

`strategic_operations` describes a strategic opportunity or active operation. It links a map node and may link one tactical `campaigns` row. A campaign is optional so an announced operation can exist before tactical bootstrap. Operation DTO inputs are structured JSON for objectives, recommended capabilities, deployment rules, reinforcement policy, known enemy information, and configured world effects.

The seeded operations are:

| Operation | Node | Strategic status | Tactical campaign |
|---|---|---|---|
| Iron Rain | Kestrel Ridge | `MUSTERING` | Existing `operation-iron-rain` campaign |
| Night Glass | New Carthage | `ANNOUNCED` → `MUSTERING` | Authored campaign activates after Broken Road victory |
| Broken Road | Junction 7 | `ANNOUNCED` → `MUSTERING` | Authored campaign begins locked and activates after Iron Rain victory |
| Cold Horizon | Corinth II | `MUSTERING` | Independent authored interplanetary relief campaign |

Iron Rain contains an authored victory rule keyed to the tactical `objective-kestrel-airfield` result. When a terminal campaign result reports Allied control, the campaign effect batch changes Kestrel Ridge to `FRIENDLY`, opens `route-kestrel-outpost-k17`, changes Broken Road and its linked campaign to `MUSTERING`/`RECRUITING`, increments the map, appends Battalion activity, and records all three targets in `strategic_effect_receipts`. A failed or unmet objective applies no consequence; unknown configured effect types fail closed. Broken Road then uses the ordinary strategic move, campaign join and deployment-plan flows before loading its own Junction 7 map, objectives and waves.

Broken Road continues the same deterministic chain. Holding `objective-junction-7` to victory changes Junction 7 to `FRIENDLY` and activates Night Glass and its linked campaign. The recovered Battlegroup can travel from Junction 7 to New Carthage, join and deploy through the normal APIs, then loads Night Glass's own 331-hex night battlefield, Hold Sensor Array/Clear Forward Burrow objectives and two reserve waves. No network or generative director is involved in either transition.

The Operation briefing links directly to its campaign deployment planner. A linked operation plan must contain units from one Battalion Battlegroup. Commit locks the exact persistent loadout revisions, inserts the campaign snapshots and deployments, closes any active carrier link, places the Battlegroup at the operation node as `DEPLOYED`, and changes the campaign and operation to `ACTIVE` in the same D1 batch. The local Iron Rain verification commits Hammer's six executable foundation units and the Campaign Durable Object then loads those exact callsigns rather than a substitute fixture roster.

Cold Horizon exercises the same path on a second planet. CSV Resolute carries the distinct Raven Battlegroup from Corinth High Orbit through Relay Kappa to Corinth II over five resolved strategic rounds. An embarked formation may deploy only when its carrier is within the operation's Planet hierarchy; the server rejects the same plan while Resolute is still at Corinth. Arrival updates both the Task Force node and the ship's semantic location/planet. The committed Raven snapshots then start a five-round, 397-hex tactical campaign with the `AURORA-4` and `POLAR-1` persistent loaners, Hold Colony Beacon/Secure Landing Field objectives, and authored enemy waves. The loaners and operation are development content, not canonical balance or production grants.

The same terminal effect batch now performs the first recovery handoff. It closes every active campaign deployment, leaves destroyed persistent units destroyed, returns survivors to `RESERVE` at the operation node with their resolved health, ammunition and tactical supplies intact, unlocks their campaign loadouts, closes any active carrier assignment, and marks participating Battlegroups `RECOVERING`. Survivors are deliberately not teleported back aboard CSV Resolute. Once carrier and Battlegroup are stationary at the same node, Galactic Operations can submit an authorized Embark order; resolution validates ship capacity, restores the carrier link, and moves each active/damaged member from its reserve node to the primary ship's `ON_SHIP` location. Resupply, repair and onward movement remain separate strategic choices.

When a ground Battlegroup subsequently arrives at another strategic node, its active/damaged reserve members move to that same persistent node in the strategic resolution batch. Campaign deployment accepts an unlocated first-muster reserve, but a reserve unit with a known node must match the campaign's strategic node. This lets newly onboarded commanders enter their first campaign while preventing recovered veterans from teleporting between Kestrel Ridge and K-17.

## 7. Strategic clock, orders, and events

`strategic_rounds` is separate from tactical `round_metadata`. It pins a ruleset and resolver version and records open/lock/resolve timestamps, hashes, a resolution key, lifecycle, and revision. A resolved or failed row cannot omit its journal hashes.

`strategic_orders` supports only the Phase 3 non-orbital-combat order vocabulary. An order is scoped to one map round and Battalion, has exactly one Task Force or Battlegroup subject, stores the server-derived route and typed intent JSON, and carries an expected subject revision. Idempotency is scoped by `UNIQUE(actor_user_id, command_id)`; a globally unique client command would allow one user to reserve another user's key.

`strategic_events` is the append-only history/activity source. Map events have a unique `(map_id, round_number, sequence)` and every event has a globally unique idempotency key and event hash. Organisation-only events may omit map/round/sequence. Public projections must filter payloads by audience.

`strategic_effect_receipts` deduplicates strategic resolution, campaign-result, and admin effects by a caller-defined idempotency key plus a unique source/version/target tuple. Reusing an ID with a different payload hash must fail closed.

## 8. War variables

`strategic_war_variables` stores event-linked, revisioned JSON values by map, semantic location, and world/Battalion/faction scope. The model does not assume every planet has identical numeric metrics.

The seed records Corinth as contested and Bug pressure as high, but deliberately leaves numeric pressure/control values null with an explicit unresolved status. Future campaign outcomes must mutate variables through canonical events and effect receipts, never by unexplained direct writes.

## 9. Initial development world

`development-strategic-world.sql` is local-only and repeat-idempotent. It seeds:

- the Helion/Corinth hierarchy and `strategic-map-corinth`;
- CSV Resolute and the Resolute Task Force at Corinth High Orbit;
- Hammer and Raven embarked as distinct ground Battlegroups;
- three of four Large Supply remaining, with the Task Force supplied through round 29;
- strategic round 28, four activity events, four operations across Corinth and Corinth II, and lightweight war variables.

The seed carries the SHA-256 of the supplied Phase 3 brief and references exact source locators. Running all catalogue and development seeds twice produces an identical logical database dump.

## 10. Enforced and service-level invariants

The D1 schema enforces hierarchy acyclicity, typed planet/node locations, same-map route endpoints, route non-self/reverse-duplicate edges, JSON syntax/shape, actor-scoped command uniqueness, active current-Battalion selection, cross-Battalion formation/supply foreign keys, one active embarkation, supply non-negativity/capacity, and result-journal completeness.

The service and pure resolver must additionally enforce:

- active membership and exact rank permission for every request;
- expected-revision compare-and-set;
- capability aggregation and the prohibition on aerospace-only Battlegroups;
- route availability, movement profile, and positive pinned travel timing;
- ship facility and embarkation capacity;
- one operational location for each Player Unit;
- no implicit resupply or supply-tier collapse;
- fog-safe operation and event projections;
- exactly-once tactical-result reconciliation.

## 11. Deferred

Full orbital combat, blockade/interception, arbitrary map authoring, automatic tactical campaign bootstrap, complete withdrawal, the D1 tactical pending-effect applier, production identity-provider/session issuance, and a production Phase 3 deployment remain deferred. Their catalogue or schema shapes are not claims of executable gameplay.

The public strategic order route is active. It performs strict typed validation, authenticated Battalion and formation authorization, optimistic map/formation checks and actor-scoped command replay before the map-sharded coordinator commits `SUBMITTED`. Approval-gated resolution runs the deterministic engine and atomically projects its supported results to D1, so accepted orders leave `SUBMITTED` and the map advances. Galactic Operations exposes Disembark, Task Force resupply, campaign Support and round resolution. Movement, embark-capacity expansion, tactical deployment/withdrawal and orbital combat remain unavailable where their rules/data are unresolved.

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

The V5 rules establish point-to-point movement but do not publish the complete travel timing for this development graph. Every seeded route therefore has `base_travel_rounds = NULL` and `travel_cost_status = BALANCE_REQUIRED`. This is not zero-cost travel. Order validation must fail closed until a pinned ruleset or explicitly authorised scenario supplies a positive duration.

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
| Night Glass | New Carthage | `ANNOUNCED` | Not bootstrapped |
| Broken Road | Junction 7 | `ANNOUNCED` | Not bootstrapped |

Iron Rain contains an admin-authored effect rule describing a successful objective capture and route unlock. It is configuration, not an already-applied result. `strategic_effect_receipts` must record any future application exactly once.

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
- strategic round 28, four activity events, three operations, and lightweight war variables.

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

The current public strategic mutation routes also fail closed with explicit `501` responses. Typed validation, authorization, D1 compare-and-set submission logic, and the map-sharded coordinator are present as integration scaffolding, but no order is accepted publicly until the D1 resolution journal/effect applier can guarantee that it will leave `SUBMITTED` exactly once.

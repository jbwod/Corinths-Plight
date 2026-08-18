# Corinth's Plight Ship System

**Status:** Phase 2 catalogue plus Phase 3 persistent ship/Task Force/logistics foundation; primary-ship identity mutation is live locally (2026-08-12)

## 1. The ship is home

A Battalion ship is a persistent named asset, not a menu or a disposable campaign vehicle. The Phase 3 interface can derive Bridge, Navigation, Hangar, Vehicle Deck, Armoury, Cargo, Engineering, Battlegroup, and Operation views only from real ship, module, cargo, supply, formation, and location records.

Decorative rooms do not grant capabilities.

## 2. Hull definitions remain rules data

`ship_class_definitions` continues to use the active rules catalogue. The current V5-curated source values are:

| Hull | Hits | Armour | Speed | Range | External slots | Internal slots | Cargo/Large Supply capacity | Requisition |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Corvette | 10 | 2 | 4 | 6 | 2 | 4 | 2 | unresolved |
| Destroyer | 10 | 3 | 3 | 6 | 3 | 4 | 4 | unresolved |
| Cruiser | 10 | 4 | 2 | 6 | 4 | 4 | 6 | unresolved |
| Battleship | 10 | 5 | 1 | 6 | 5 | 4 | 8 | unresolved |

These records remain `experimental` where the catalogue says so. Missing requisition and Atmo-Fuel values are `NULL`, not free or unlimited.

## 3. Persistent ship identity

`ships` keeps its Phase 2 identity, Battalion, pinned ruleset/hull, health, status, legacy planet/travel fields, state JSON, and timestamps. Phase 3 adds:

- optional unique registry/callsign;
- a structured semantic `current_location_id`;
- optimistic revision;
- a private last-identity-mutation token used to couple compare-and-set updates to their receipt and history event.

An active Battalion member with the published `SHIP_CONFIGURE` permission can change the primary ship's display name and registry through `POST /api/ships/primary/identity`. The request carries an actor-scoped command ID and expected ship revision. The server derives the current Battalion and primary ship, normalizes the registry to uppercase, rejects destroyed ships and duplicate names/registries, and atomically advances the ship revision, appends a Battalion-audience `SHIP_IDENTITY_CHANGED` event, and stores the exact response in `ship_mutation_receipts`. Same-payload retries return that response; changed-payload command reuse conflicts. The Ship interface refreshes the authoritative projection after success and keeps module upgrades visibly deferred.

This implements identity management for an existing primary ship. It does not grant or price a hull, create a ship for a Battalion without one, or authorize module installation.

The Battalion's `primary_ship_id` selects the initial home ship but does not limit the data model to one ship. A trigger rejects a primary ship owned by another Battalion.

When a ship is an active member of a Task Force, strategic graph position derives from the Task Force's `current_node_id`. `ships.current_location_id` remains the semantic location/read compatibility field and must agree with the Task Force's node location when reconciled by the service.

## 4. Modules and slots

`ship_equipment` remains the installed module table. Phase 3 adds installation status, installation/update times, and revision. Slot type/index remain explicit. Module definition, compatibility, requisition, and implementation availability continue to come from the pinned rules catalogue and `ruleset_implementation_overlays`.

`ship_module_capability_grants`, `ship_capability_overrides`, and `ship_effective_capabilities` aggregate module-granted capabilities. Migration 0004 replaces the view definition so only `INSTALLED` modules contribute; damaged, offline, or removed modules do not silently grant facilities. The runtime should ask for capabilities such as `CARRY_HEAVY_VEHICLE`, `LAND_AEROSPACE`, or `REPAIR_MECH`, never compare a display name such as “Mech Bay.”

The existing Phase 2 catalogue preserves module provenance and unresolved conflicts. Several ship modules are catalogue/readiness only; schema presence is not authority to purchase or install them. Arbitrary ship purchase, refit, slot-claim concurrency, and final module prices remain deferred.

## 5. Task Force membership

`task_forces` represents the orbital/aerospace strategic formation. `task_force_ships` relates ships to it with primary, escort, support, or transport roles. A partial unique index prevents one ship from being active in two Task Forces.

The initial UI may expose the Battalion's primary ship, but all queries should follow relational Task Force membership rather than assume a permanent one-ship fleet.

## 6. Embarkation and capacity

`task_force_battlegroups` records Battlegroup embarkation lifecycle. A partial unique index prevents duplicate active embarkation. An embarked Battlegroup's location derives from its carrier Task Force; the Battlegroup cannot simultaneously store a surface node.

Capacity is server-derived from:

1. the Battlegroup's current, owner-preserving unit assignments;
2. each unit's class, tags, equipment, and cargo state;
3. installed and operational ship modules;
4. pinned capability grants and overrides;
5. any active reservations and already embarked formations.

The UI may preview requirements, but the server makes the decision. A ship without the appropriate vehicle, mech, VTOL, aerospace, infantry, landing, repair, or rearm capability must reject the action.

The database foundation prevents duplicate active carriers. Full transactional capacity reservation and arbitrary embark/disembark mutation routes are still service work.

## 7. Supply hierarchy

Supply is not one generic point total.

| Size | Rules owner/use | Exact V5 duration |
|---|---|---|
| Large | Orbital/Task Force war chest; supplies Task Forces and HQ-level bases | 1 Large Supply marks a Task Force/HQ supplied for 2 rounds |
| Medium | Engineers and selected transports; keeps an FOB online | 1 Medium Supply keeps one FOB online for 1 round |
| Small | Unit-level ammunition, repair, medical, and construction use | Pulled from an online supplied source |

`strategic_supply_stores` gives each resource a physical holder: ship, Task Force, HQ, FOB, or Player Unit. Its holder-shape check requires exactly the matching foreign key. `strategic_supply_balances` stores separate `LARGE`, `MEDIUM`, and `SMALL` rows with non-negative quantity, nullable capacity, and revision. A check rejects quantity above a known capacity.

`task_forces.supply_state` and `supplied_until_round` record the time-bound strategic state. `SUPPLIED` requires a positive end round; `UNSUPPLIED` requires no end round.

A supplied Task Force may enable Small/Medium pulls and compatible reload/rearm/repair. It does not create stored Medium or Small Supply automatically. Facilities and logistics units still govern what can be pulled and used.

## 8. CSV Resolute fixture

The strategic development seed evolves the existing Phase 2 ship identity `ship-corinth-ward` into:

```text
CSV Resolute
Destroyer-class Orbital
Registry CSV-RESOLUTE
Corinth High Orbit
Resolute Task Force
Large Supply 3 / 4
Supplied through strategic round 29
```

Reusing the Phase 2 ID preserves references and history. The name change is a development fixture evolution, not destructive replacement.

The installed fixture modules demonstrate:

- Carrier Flight Deck: aerospace carriage/landing/repair/rearm;
- VTOL Bay: VTOL carriage/landing/repair/rearm;
- Mech Bay: mech/heavy-vehicle carriage and compatible repair;
- Mobile Infantry Upgrade: infantry carriage;
- Heavy Ground Vehicle Bay: light/heavy vehicle carriage and repair;
- Armoury: infantry rearm/loadout support.

The fixture is deliberately local-only. Module implementation overlays still control which mutation paths are executable.

## 9. Concurrency and security

Ship and supply mutations require authenticated active Battalion membership, the exact rank permission, actor-scoped command idempotency, and expected revision. The repository query must include the Battalion owner predicate. Primary-ship identity changes currently satisfy this boundary through `SHIP_CONFIGURE`, `ship_mutation_receipts`, the ship mutation token, and one atomic D1 batch.

The service must atomically prevent:

- two module claims for the same effective slot;
- two spends from the same Large Supply balance;
- two incompatible routes for the same Task Force;
- embarkation while deployed or already carried;
- capacity overflow after concurrent changes;
- supply underflow;
- installing catalogue-only, unavailable, incompatible, or unaffordable modules.

The D1 schema directly enforces non-negative/capacity-bounded supply and unique active ship/Battlegroup carrier relations. Remaining invariants require compare-and-set service transactions and pure rules validation.

## 10. Deferred orbital systems

Full ship-vs-ship combat, orbital weapons, boarding, blockade, interception, fleet battle, ship capture, subsystem combat, and arbitrary ship construction are deferred. Hull combat fields and module catalogue rows are future-compatible data, not implemented Phase 3 combat.

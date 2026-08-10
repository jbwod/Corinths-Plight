# Corinth's Plight Battalion Model

**Status:** Phase 3 organisation schema and read/order foundation (2026-08-10)

## 1. Identity is not membership

The persistent relationship is:

```text
User ── public Profile
  │
  ├── AuthIdentity / Session (private authentication data)
  │
  └── BattalionMembership ── Rank ── Permissions
```

`users` is the account root. `profiles` is the player-facing identity. Provider subjects live only in `auth_identities` as hashes; public Battalion responses must never expose email, provider identity, session, recovery, IP-hash, or user-agent-hash fields.

Migration 0004 adds the provider-neutral `auth_identities` and hashed `account_recovery_challenges` tables. Production provider login, session issuance/rotation, recovery delivery, MFA, and account linking are still deferred. Existing production session validation remains fail closed.

## 2. Active Battalion selection

A User does not contain a permanent `battalion_id`. `battalion_memberships` preserves the many-to-many relationship and historical status. `user_active_battalions` makes the current operational Battalion explicit while allowing former or future affiliations to remain represented.

There is at most one current selection per User. A trigger requires an `ACTIVE` membership at selection time, and deactivating that membership clears the selection. Every request must still authenticate the User and recheck membership status; current selection is context, not authority.

## 3. Battalion identity and lifecycle

The existing `battalions` row now includes:

- name and optional unique short name;
- description, insignia key, and motto;
- creator and timestamps;
- active, suspended, or disbanded status;
- optimistic revision;
- the existing nullable primary ship reference.

The migration adds a trigger that rejects assigning a primary ship owned by another Battalion. Disbanding is a lifecycle state; historical rows are not deleted.

## 4. Membership and invites

`battalion_memberships` keeps the existing composite identity `(battalion_id, user_id)` and states `INVITED`, `ACTIVE`, `SUSPENDED`, `LEFT`, and `REMOVED`. Phase 3 adds status-change time, leave time, update time, and revision. The current schema preserves one lifetime relationship row per User/Battalion; detailed transitions belong in the append-only strategic event history.

`battalion_invites` is a persistent invitation record with invitee, inviter, initial rank, lifecycle, optional expiry, response time, request hash, command ID, and revision. Only one pending invitation can exist for the same User/Battalion. A trigger rejects a rank from another Battalion.

Invite command idempotency is scoped to the authenticated inviter by `UNIQUE(invited_by_user_id, command_id)`. A repeat with the same command must compare `request_hash`; a changed hash is a collision, not a retry.

The schema supports invite/accept/decline/leave/remove, but this checkpoint does not claim every mutation route is implemented.

## 5. Configurable ranks and permissions

Rank names are data. Authority must never depend on a comparison such as `rank.name === "Captain"`.

```text
battalion_ranks
    └── rank_permissions
            └── battalion_permission_definitions
```

The Phase 3 permission vocabulary includes Battalion editing, membership, rank, Battlegroup, operation, ship, supply, deployment, and strategic-order permissions. `battalion_permission_definitions.implementation_status` distinguishes executable permissions from schema-only/deferred product surface.

The development fixture marks the landed read/order authority (`SHIP_VIEW`, `SUPPLY_VIEW`, `SHIP_MOVE`, `STRATEGIC_ORDER_CREATE`, and environment-gated `STRATEGIC_ORDER_APPROVE`) as active. Other mutation permissions remain schema-only or deferred until their server workflows are verified.

The 33rd Expeditionary fixture has configurable Commander, Operations Officer, and Trooper ranks. The Commander receives the full defined vocabulary for permission-check exercises; that fixture does not bypass implementation-status or environment gates.

## 6. Battlegroups

A Battlegroup is a persistent deployable ground formation. Its Phase 3 strategic fields are callsign, status, node, operation, carrier Task Force, revision, and update time. Its existing leader is a coordinator, not an owner.

```text
Player Unit owner ── player_units.owner_id
Battlegroup assignment ── battlegroup_units
Strategic carrier ── task_force_battlegroups
```

Assigning a unit does not transfer ownership. `battlegroup_units.delegated_command` is retained for Phase 2 compatibility, but new explicit authority should use `unit_order_delegations`.

Aerospace support may be attached to a Battlegroup, but a Battlegroup composed only of aerospace units is prohibited by the V5 rules. That is a capability/composition validation in the pure engine and service, not a static SQL check.

## 7. Explicit order delegation

`unit_order_delegations` grants a named Battalion member order authority for one owner-controlled Player Unit. It can be scoped to a Battlegroup, campaign, or time window. It records start/end/revocation, optimistic revision, actor-scoped command ID, and request hash.

Composite foreign keys ensure:

- the grantor owns the selected Player Unit;
- both owner and delegate have a membership in the named Battalion;
- a Battlegroup scope belongs to the same Battalion.

The request service must additionally require active memberships, validate that the unit is actually assigned to the scoped Battlegroup/campaign, and check the current time. Rank alone never grants ownership of another player's units.

## 8. Task Forces are not Battlegroups

A Task Force is an orbital/aerospace strategic formation. A Battlegroup is a surface/ground formation. `task_force_ships` and `task_force_battlegroups` preserve this relationship without conflating the terms.

The development fixture uses one Task Force with one primary ship, CSV Resolute, and two embarked ground Battlegroups. The schema permits future escorts and multiple ships without exposing fleet warfare now.

## 9. Permission evaluation

For a Battalion-scoped action the server must evaluate, in order:

1. authenticated server-derived User;
2. selected or route-resolved Battalion;
3. active membership in that Battalion;
4. current rank and exact permission string;
5. permission implementation status and environment gate;
6. owner or explicit delegation where Player Units are involved;
7. command idempotency and expected revision;
8. subject ownership predicates in the persistence query.

An unauthorised subject should resolve as not found where exposing existence would leak another Battalion's state. Client-provided `userId`, rank name, Battalion ID, or permission array is never authority.

## 10. Concurrency and history

All organisation mutations require an expected revision and actor-scoped command ID. The service must perform compare-and-set inside a D1 transaction/batch and emit a canonical `strategic_events` record. Membership is not deleted when a User leaves. Battalion history is assembled from audience-safe events rather than low-level table audit noise.

The schema prevents cross-Battalion ranks, current selection without active membership, cross-Battalion formation joins, duplicate pending invites, and duplicate actor command IDs. It does not by itself decide whether a given active permission is sufficient for a particular API route; that policy belongs in the Worker service and tests.

## 11. Development fixture

The local seed creates the 33rd Expeditionary Battalion, selects it for `demo-user`, configures three ranks, assigns data-driven permissions, and preserves the existing Phase 2 Battalion and ship identities. This data is explicitly local and is not production identity or canonical lore.

# Corinth's Plight Battalion Model

**Status:** organisation, recruitment, command transfer, Battlegroup management, and active Battalion switching are implemented locally; wider invitation/member operations remain deferred (2026-08-12)

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

Migration 0004 adds the provider-neutral `auth_identities` and hashed `account_recovery_challenges` tables. Migration 0006 and the auth service implement verified Resend email identities, opaque D1 session issuance/validation, and logout revocation. Migration 0008 adds bounded retention cleanup locally, but is not deployed. Session rotation/device management, recovery-challenge delivery, MFA, account linking, and legacy-account migration remain deferred. Production session validation fails closed.

## 2. Active Battalion selection

A User does not contain a permanent `battalion_id`. `battalion_memberships` preserves the many-to-many relationship and historical status. `user_active_battalions` makes the current operational Battalion explicit while allowing former or future affiliations to remain represented.

There is at most one current selection per User. A trigger requires an `ACTIVE` membership at selection time, and deactivating that membership clears the selection. Every request must still authenticate the User and recheck membership status; current selection is context, not authority.

The Recruitment surface now lists all of the authenticated User's active memberships and exposes a dedicated context switch. `POST /api/onboarding/battalions/current` requires the target membership, the current selector revision (or `null` when no selector exists), and an actor-scoped command ID. The D1 update is compare-and-set, keeps every other membership intact, stores an exact replay receipt, and emits an owner-audience context event. Joining and switching are therefore separate operations.

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

`battalion_invites` is a persistent invitation record with invitee, inviter, initial rank, lifecycle, optional expiry, response time, request hash, command ID, delivery status, optional Resend ID, and revision. Only one pending invitation can exist for the same User/Battalion. A trigger rejects a rank from another Battalion.

Migration 0007 adds `battalion_email_invites` for a normalized email that does not yet resolve to a User. The raw destination remains private operational data; the join link carries a single-use code while D1 stores only its SHA-256 hash. After registration, acceptance requires the authenticated User email to match. Username and already-registered email targets use `battalion_invites`, so no public endpoint discloses whether an unrelated email has an account.

`battalion_recruitment_settings` owns NPC/player recruitment kind, public/private policy, join gate, engagement summary, capacity, a same-Battalion recruitment rank, and the hash of a general invite code. Public directory rows require an active Battalion, open capacity, enabled joining, and a non-empty engagement. Private Battalions are joinable only by a valid targeted invitation or code.

Invite command idempotency is scoped to the authenticated inviter by `UNIQUE(invited_by_user_id, command_id)`. A repeat with the same command must compare `request_hash`; a changed hash is a collision, not a retry.

Migration 0008 adds fixed-window invitation limits for actor, Battalion, HMAC-pseudonymized recipient, and HMAC-pseudonymized source IP, plus private invitation-security audit rows, a leased delivery outbox, and bounded invitation-expiry/PII maintenance. The invitation command returns a generic accepted response before Resend; `waitUntil` makes the first bounded attempt and the hourly job recovers/retries. Eligibility remains non-enumerating and blocked scopes share one generic response. This code is locally verified but not part of the recorded production `0007` deployment.

Invite/send/accept/decline, public/code joins, active membership switching, self-departure, authorized ordinary-member removal, recruitment settings, rank administration, and creator-command transfer are implemented. Departures preserve the membership row as `LEFT` or `REMOVED`, revoke active order delegations, and fail closed while the member owns assigned formation units, leads a formation, or participates in a live Battalion campaign. Rank mutations are actor-scoped, revisioned and exact-once; permissions must be active server definitions, command ranks retain `RANK_MANAGE`, and referenced ranks cannot be deleted. A transfer is limited to the current creator and one ordinary active member: the aggregate transaction changes `battalions.created_by`, swaps their command/player roles and command/ordinary ranks, advances Battalion and both membership revisions, emits an audience event, and persists an exact replay receipt. Invite revocation remains deferred.

## 5. Configurable ranks and permissions

Rank names are data. Authority must never depend on a comparison such as `rank.name === "Captain"`.

```text
battalion_ranks
    └── rank_permissions
            └── battalion_permission_definitions
```

The Phase 3 permission vocabulary includes Battalion editing, membership, rank, Battlegroup, operation, ship, supply, deployment, and strategic-order permissions. `battalion_permission_definitions.implementation_status` distinguishes executable permissions from schema-only/deferred product surface.

The permission vocabulary distinguishes active gameplay authority from schema-only or deferred product surface. The production-safe onboarding seed activates only permissions consumed by implemented workflows, including `BATTALION_EDIT`, `MEMBER_INVITE`, `MEMBER_REMOVE`, `RANK_MANAGE`, Battlegroup management and `SHIP_VIEW`. The public rank editor exposes only active definitions, so it cannot grant a deferred capability merely because the storage vocabulary contains it.

The 33rd Expeditionary fixture has configurable Commander, Operations Officer, and Trooper ranks. The Commander receives the full defined vocabulary for permission-check exercises; that fixture does not bypass implementation-status or environment gates.

## 6. Battlegroups

A Battlegroup is a persistent deployable ground formation. Its Phase 3 strategic fields are callsign, status, node, operation, carrier Task Force, revision, and update time. Its existing leader is a coordinator, not an owner.

The CP-207 management slice is live through Forces. Active members with the published formation permissions can create a formation, edit its identity/mission/leader, and assign or remove operational reserve/shipboard units. A unit has one current Battlegroup. Aerospace may attach but does not make an otherwise aerospace-only group READY; orbital units fail closed. Deployed, embarked, or moving groups cannot be reorganised.

```text
Player Unit owner ── player_units.owner_id
Battlegroup assignment ── battlegroup_units
Strategic carrier ── task_force_battlegroups
```

Assigning a unit does not transfer ownership. `battlegroup_units.delegated_command` is retained for Phase 2 compatibility, but new explicit authority should use `unit_order_delegations`.

Aerospace support may be attached to a Battlegroup, but a Battlegroup composed only of aerospace units is prohibited by the V5 rules. That is a capability/composition validation in the pure engine and service, not a static SQL check.

## 7. Explicit order delegation

`unit_order_delegations` grants a named Battalion member order authority for one owner-controlled Player Unit. It can be scoped to a Battlegroup, campaign, or time window. It records start/end/revocation, optimistic revision, actor-scoped command ID, and request hash.

Formation assignment never grants that authority. The unit owner must explicitly grant or revoke it in the management view; the UI and API expose the two states separately.

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

The implemented onboarding/recruitment mutations use actor-scoped command receipts and canonical request hashes; revisioned aggregates use compare-and-set and committed organisation mutations emit a Battalion-audience `strategic_events` record. Leave/remove never delete membership history. Migration `0014` gives rank and member-rank mutations their own actor-scoped receipts and aggregate mutation tokens. Migration `0015` extends that receipt vocabulary and adds compare-and-set transfer tokens to Battalion and membership aggregates so a three-record command handoff commits or reports a revision conflict. Invite revocation remains a future organisation mutation. Battalion history is assembled from audience-safe events rather than low-level table audit noise.

The schema prevents cross-Battalion ranks, current selection without active membership, cross-Battalion formation joins, duplicate pending invites, and duplicate actor command IDs. It does not by itself decide whether a given active permission is sufficient for a particular API route; that policy belongs in the Worker service and tests.

## 11. Development fixture

The local seed creates the 33rd Expeditionary Battalion, selects it for `demo-user`, configures three ranks, assigns data-driven permissions, and preserves the existing Phase 2 Battalion and ship identities. Separately, the production-safe onboarding seed creates three system-owned open recruitment Battalions so an empty player directory cannot strand a new account. Neither fixture is canonical V5 lore.

# Corinth's Plight Game Master and Map Authoring

**Status:** Admin-only local vertical slice implemented; not deployed and not a public-release claim (2026-08-14)

**Schema:** migrations `0019_game_master_authority.sql`, `0020_game_master_maps.sql`, and `0021_game_master_campaign_runtime.sql`

## 1. Authority boundary

Game Master authority is global application authority, not a Battalion rank or a campaign-local role. A production session is authorized only when its active User has an active row in `game_master_grants`. Migration `0019` creates no default grant, and there is no public endpoint that can grant or revoke this authority. A privileged operator must manage grants outside the player-facing application until a reviewed grant-administration workflow exists.

The explicit development demo identity may act as Game Master only when demo authentication is enabled for the development environment and that identity has the internal `ADMIN` role. Production rejects demo authentication. A campaign `GM` membership and a Battalion `ADMIN` command role do not imply the global grant.

All Game Master routes require an authenticated identity. Mutations also pass through the Worker's exact same-origin policy. The Worker strips client-supplied trusted headers and adds `x-corinth-global-game-master` only after the global authorization check. The Campaign Durable Object requires both that trusted marker and the internal `ADMIN` viewer projection.

`GET /api/game-master/session` is the capability discovery boundary. The React application exposes Game Master navigation only when this projection says the session is authorized.

## 2. Implemented campaign controls

| Route | Implemented behavior | Important boundary |
|---|---|---|
| `GET /api/game-master/session` | Returns authorization source and capabilities | Does not disclose grant details to an unauthorized caller |
| `GET /api/game-master/campaigns` | Lists active and paused campaigns | Draft authoring campaigns are not live campaigns |
| `GET /api/game-master/campaigns/:id/state` | Returns the authorized full campaign projection | The public campaign path cannot forge this projection |
| `GET /api/game-master/audit` | Reads campaign and authoring audit projections | Supports bounded limits and optional campaign filtering |
| `PATCH /api/game-master/campaigns/:id/clock` | Changes the persisted campaign round duration | Requires campaign-version compare-and-set |
| `POST /api/game-master/campaigns/:id/objectives` | Creates an objective at a valid map coordinate | Structural mutation requires a campaign paused from `PLANNING` |
| `PATCH /api/game-master/campaigns/:id/objectives/:objectiveId` | Changes objective name, description, coordinate, owner, or state | Same pause/version requirements |
| `POST /api/game-master/campaigns/:id/enemy-deployments` | Spawns an enemy from the exact pinned scenario definition | The server derives statistics, weapons, ammunition, side, and occupancy legality |
| `POST /api/game-master/campaigns/:id/pause` | Pauses a live campaign and projects `PAUSED` to D1 | Version-pinned and receipt-idempotent |
| `POST /api/game-master/campaigns/:id/resume` | Resumes the stored pre-pause phase and projects `ACTIVE` to D1 | Version-pinned and receipt-idempotent |
| `POST /api/game-master/campaigns/:id/resolve` | Invokes the ordinary deterministic lock/resolve path | It does not permit editing a combat result |
| `POST /api/game-master/campaigns/:id/deployments/:deploymentId/revive` | Rejects with `REVIVE_RULE_DECISION_REQUIRED` | V5 permanent destruction and restoration state are unresolved; revival is not implemented |

Every accepted command envelope carries an actor-scoped `commandId` and the relevant expected campaign or map revision. The server canonicalizes and SHA-256 hashes the request, stores the exact response receipt, rejects changed-payload command reuse, and writes a private audit event for committed command outcomes, including authoritative rejections such as blocked publication. Request-schema errors can fail before a command receipt exists. Map save, map publication, and campaign creation use a separate authoring receipt/audit family because no live campaign necessarily exists yet. Both command families reserve the actor/command pair before dispatch or mutation. A matching incomplete reservation younger than two minutes fails closed; an older exact-hash reservation is reclaimed by compare-and-set and retried through the Durable Object or D1 idempotency boundary.

Campaign state and the Campaign Durable Object command receipt commit together. The D1 command receipt, registry projection, and audit event are written after the Durable Object response and can be recovered by an exact retry. D1 and Durable Object storage do not share a transaction, so this is an idempotent eventually projected boundary, not an atomic cross-store audit guarantee. Operator diagnostics and reconciliation remain release work.

## 3. Deterministic map documents

The authoring contract is `corinth.admin-map` schema version 1, generator `admin-map-generator@2`, and vocabulary `admin-map-vocabulary@2`. It supports five deterministic presets:

- `DESERT_CONTINENT`
- `URBAN_CONTINENT`
- `ISLANDS`
- `MIXED`
- `ICY`

The same preset, seed, width, and height produce the same canonical document and SHA-256 content hash. Width is constrained to 12–96 hexes and height to 10–96. Serialized import is bounded to 16,777,216 characters, rejects unknown fields, validates exact schema/generator/vocabulary versions, verifies the claimed hash, validates cell and feature identity, enforces canonical topology and boundary-water rules, and normalizes ordering before export. The hash detects content changes relative to the claimed document; it is not a signature and does not confer authority.

The vocabulary includes the requested lowland, forest, wetland, highland, arid, cold, and water visual biomes; City, Airfield, Town, Outpost, RADAR, and Trench points; and Road, Path, River, Wall, and Bridge edges. Visual biome identity is kept separate from mechanics so a texture or label cannot silently invent movement, cover, or line-of-sight rules.

## 4. Saved-map and campaign-authoring workflow

An authorized Game Master can:

1. generate a preset map locally with a chosen seed and dimensions;
2. export or strictly import its canonical JSON;
3. save it as a revision-checked D1 `DRAFT` whose biome, point, and edge IDs carry their pinned `@2` mechanical definitions;
4. reopen and update that draft while every prior revision remains immutable and addressable;
5. publish a fully governed immutable revision;
6. create a recruiting campaign on a planet from that exact revision and hash.

`GET /api/game-master/maps` returns map metadata plus the available planets, enemy definitions, and the complete canonical biome/profile catalogue as locked review metadata. `GET /api/game-master/maps/:id` returns one complete saved document. `POST /api/game-master/maps` creates or revises a draft. `POST /api/game-master/maps/:id/publish` validates publication readiness. `POST /api/game-master/campaigns` creates a D1 campaign pinned to the exact map revision and content hash. A submitted mechanics review mapping is accepted only when every value exactly matches the biome's vocabulary-pinned profile; it cannot override the document.

Campaign creation accepts only a `PUBLISHED` map and the caller's exact expected map revision. It creates a `RECRUITING` campaign, immutable map/content pin, Game Master membership, and deterministic insertion zone on a passable non-water hex. The ordinary campaign join and Battalion deployment workflow supplies Allied units. After at least one committed deployment, the Campaign Durable Object validates the pin and hash, materializes the exact map, and exposes the ordinary authenticated tactical runtime. Objectives and enemies intentionally start empty: the Game Master authors objectives and spawns governed enemies through the audited live controls rather than inheriting showcase fixtures.

Large runtime states use a SHA-256-verified storage manifest and fixed 1 MiB chunks, below the configured SQLite-backed Durable Object key/value ceiling. Reads remain backward-compatible with the earlier inline state envelope; missing, malformed, truncated, or hash-mismatched chunks fail closed. A 96×96 generated battlefield with 9,216 hexes is covered by a storage round-trip test. Current pre-resolution snapshots still duplicate that map each round, so long-running maximum-size campaigns need immutable-map references plus dynamic deltas before cost/retention can be considered release-ready.

Publication still fails closed if a document contains a missing, mismatched, or non-published biome/feature contract. The pinned `@2` vocabulary now provides a published rule for every generator biome and for City, Airfield, Town, Outpost, RADAR, Trench, Road, Path, River, Wall, and Bridge, so a valid current generated document has no balance placeholder. Older `@1` documents are not silently upgraded; they must be regenerated or explicitly migrated and rehashed.

## 5. Custom-map terrain application profile

`corinth-custom-map-terrain-application@2` is a user-approved Corinth application interpretation. It is not claimed to be canonical V5 text and does not retroactively pin every legacy authored scenario default.

| Terrain/edge | Current custom-map rule |
|---|---|
| Open Water, Ocean, Deep Ocean, Sea | Ground traversal is blocked with no ground exception. An Aerospace, Atmo Flight, or VTOL-capable unit may traverse only while actually airborne; `LANDED` units remain ground-bound unless the current Take Off action supplies the airborne override. |
| Shallow/Fresh Water and Rapids | Ground traversal is blocked except for an explicit `AMPHIBIOUS` or `WATER_TRAVERSAL` unit tag. No current unit silently gains either tag. |
| Frozen Lake / Ice Water | Ground-passable at `1.5`; it remains visually and mechanically distinct from liquid water. |
| Coast/Beach | Ground-passable at `1.25`. |
| River edge | Ground crossing adds `+1` Speed cost. Airborne traversal ignores the surcharge. |
| Exact Bridge edge over a River | Keeps the River edge but waives its `+1` crossing surcharge. A Bridge does not create a Road; an independently authored Road retains the established `0.5` road multiplier. |
| Forest / Dense Forest / Jungle | Cost `1.25` / `1.5` / `1.75`, with governed cover, LOS, and capacity. Glades remain open. |
| Wetland / Marsh / Swamp / Bog | Cost `1.25` / `1.5` / `1.75` / `2`; swamps block LOS and wetlands retain lower capacity. |
| Mountain / Peak / Volcano / Cliffs | Ground traversal is blocked unless the unit has the explicit `MOUNTAIN_TRAVERSAL` tag. No current unit is assumed to have that capability. Airborne traversal may pass. |
| Road / Path | Ground cost multipliers are `0.5` and `0.75` respectively. A Road takes precedence when both are authored. |
| Wall edge | Blocks ground movement and line of sight across the exact edge. Airborne movement may cross, but the wall still blocks ordinary LOS. |
| City / Town / Outpost | Materialize stable structures with capacity `8` / `5` / `4`, garrison/cover, and population or supply tags. |
| Airfield | Capacity `6`; enables governed Aerospace/VTOL landing and Aerospace rearm tags. |
| RADAR / Trench | RADAR materializes a minimum-elevation sensor-array structure; Trench materializes the governed trench and infantry cover. |

All requested visual biomes map to one explicit mechanical profile in the immutable vocabulary; the runtime never parses a biome name to decide movement. Arid, cold, rough, ridge, glacier, canyon, crater, dune, badland, and urban variants therefore carry fixed cost/elevation/LOS/capacity values even when the graphic changes. The route finder is deterministic and cost-aware, so it can prefer a legal bridge, road, or path over a slower river crossing. Player validation, resolver movement, simultaneous movement, and deterministic enemy path budgeting consume the same traversal state. Engineer Field Bridge construction marks the exact bidirectional bridge edge without deleting the underlying river; bridge attack/repair/durability lifecycle remains separately unresolved.

## 6. Deployment and release status

The repository head is migration `0021_game_master_campaign_runtime.sql`. A fresh isolated D1 replay through all 21 migrations and all nine seeds twice passed integrity and foreign-key checks across 130 application tables. The recorded production deployment remains at migration `0007`; migrations `0008`–`0021`, the Game Master console, and the custom-map runtime are not active on the public origin.

This slice does not close public-release readiness. Remaining Game Master work includes grant administration and MFA policy, rate limits and operational alerts, full early-rejection security auditing, cross-store reconciliation diagnostics, membership/announcement/award controls, revival rules, a versioned custom-scenario victory/reward/closure policy, bridge attack/repair durability, multi-account browser/security/accessibility evidence, production migration, and preview deployment rehearsal.

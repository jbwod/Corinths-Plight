# Corinth's Plight

Corinth's Plight is a persistent cooperative science-fiction wargame built around structured orders, simultaneous round resolution, shared battlefield intentions, and consequences that survive between sessions.

This repository now contains a Cloudflare-native foundation and one executable vertical slice: **Planet Corinth / Campaign Outpost K-17**. The original Flask/Jinja prototype remains in `app/`, `shipbuilder/`, and `worldmap/` as migration reference; it is not the production architecture.

## Foundation milestone

The current slice includes:

- React 19 + Vite campaign operations interface
- Canvas hex map with pan, zoom, fog, terrain, stacking, routes, facing, objectives, and allied intentions
- visual Hold / Advance / Rush order composer with scheduling, weapon targeting, drafts, and server validation
- pure seeded TypeScript rules engine with replay-stable movement and simultaneous combat
- campaign-scoped Durable Object state, alarms, accelerated clock presets, and hibernating WebSockets
- versioned D1 schema and idempotent `v5-core-curated@1` seed catalogue
- Phase 2 persistent Forces registry with combined-arms profiles, owner-scoped inspection, requisition/rename receipts, ship-aware readiness, and a responsive Forces screen
- viewer-specific battlefield/event projection and local-only demo authentication
- V1 audit, rule conflict catalogue, data model, resolution protocol, and Cloudflare ADRs

The intentionally deferred systems are listed in [`corinth-foundation.md`](corinth-foundation.md). Advanced order hooks, the production account flow, D1 persistent-effect finalisation, complete battalion/ship workflows, and strategic-war phases must be implemented as subsequent vertical slices—not simulated in the UI.

## Run locally

Requirements: a current Node.js release and npm.

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run db:seed:demo:local
npm run dev
```

The development configuration enables the explicit `demo-user` identity and uses a five-minute round with a thirty-second lock lead. The separate demo seed creates the local Operation Iron Rain roster and must never be applied to production. Production configuration disables demo authentication and defaults to a 24-hour round.

## Verify

```bash
npm run seed:check
npm run typecheck
npm run lint
npm test
npm run build
npm run build:production
```

Production is deployed at [corinthplight.qnetica.com.au](https://corinthplight.qnetica.com.au), with the `workers.dev` route retained as a fallback. Later releases should run `npm run deploy:dry` before `npm run deploy`; both scripts select the production Wrangler environment and its provisioned D1 binding.

## Repository map

```text
src/                         React campaign client
worker/                      Worker API + Campaign Durable Object
packages/domain/             shared contracts
packages/rules-engine/       deterministic pure game engine + tests
migrations/                  versioned D1 schema
seeds/                       provenance-bearing rules catalogue
docs/                        audit, rules, architecture, data and operations
rules/                       supplied rule sources
app/, shipbuilder/, worldmap/ retained V1 prototype
```

Start with:

- [`docs/GAME_SYSTEMS.md`](docs/GAME_SYSTEMS.md) — active rules profile and scope
- [`docs/RULE_CONFLICTS.md`](docs/RULE_CONFLICTS.md) — explicit interpretations and unresolved values
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target boundaries and V1 strangler plan
- [`docs/ROUND_RESOLUTION.md`](docs/ROUND_RESOLUTION.md) — deterministic round and retry protocol
- [`docs/V1_AUDIT.md`](docs/V1_AUDIT.md) — evidence-backed legacy assessment

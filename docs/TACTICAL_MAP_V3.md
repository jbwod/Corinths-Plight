# Tactical Map V3 Release Slice

**Implementation date:** 2026-08-14 (Australia/Sydney)

**Status:** implemented and locally verified development slice; **not** a public-release approval

## Outcome

Operation Iron Rain, Broken Road, Night Glass, and Cold Horizon now use versioned, deterministic irregular theatre footprints instead of complete hex discs. The existing authored combat core of each operation is preserved exactly. The additional outer land creates a continent-like tactical silhouette without inventing a fifth terrain type or changing the source-derived movement, line-of-sight, capacity, objective, insertion, or deployment values inside the original core.

| Operation | Preserved core | Outer extent | V3 land hexes |
|---|---:|---:|---:|
| Iron Rain | radius 7 | radius 11 | 311 |
| Broken Road | radius 6 | radius 10 | 244 |
| Night Glass | radius 5 | radius 10 | 240 |
| Cold Horizon | radius 6 | radius 11 | 298 |

The topology helper grows only from connected inner land, uses a stable scenario identity as its seed, guarantees the authored core and required outer extent, and contains no runtime randomness. Tests prove deterministic repetition, one connected landmass, a non-disc boundary, exact core preservation, and retention of every objective and insertion coordinate.

The outer coordinates are playable scenario content, not cosmetic water or background art. Although they reuse existing terrain families and mechanics, the additional maneuver space can affect balance. V3 therefore requires explicit scenario playtest/content approval before public publication and does not rewrite an already-persisted campaign map.

## Rendering contract

The tactical renderer remains React plus Canvas2D. Server-projected `BattlefieldHex[]`, deployments, orders, objectives, structures, visibility, roads, and rivers remain authoritative. Presentation is layered as:

1. deterministic shallow, mid, and deep chart-water rings;
2. one of five coordinate-stable visual palettes within each existing `OPEN`, `FOREST`, `RIDGE`, or `MARSH` family;
3. connected terrain texture, contours, coastline, roads, and rivers;
4. fog, grid, structures, objectives, markers, routes, and Allied intent;
5. deterministic same-hex formations, facing, sprites, labels, and state effects.

Palette variants and water are presentation-only. Water-ring coordinates are not added to the authoritative map and cannot be selected or traversed. Unknown hexes use a neutral fill and suppress terrain detail, structures, edges, objectives, and units; the renderer therefore does not recover redacted information from cosmetic generation.

Animation continues to use native `requestAnimationFrame` with intersection throttling and `prefers-reduced-motion`. Anime.js was evaluated but not added: it does not improve the Canvas2D draw loop and would increase the client dependency and bundle surface. Reduced motion selects stable sprite frames and suppresses pulses and route motion.

## Input and accessibility

The canvas supports pointer pan/zoom and now also exposes a fog-safe keyboard hex cursor:

- Arrow Up/Down: north/south;
- Arrow Right/Left: northeast/southwest;
- Alt + Arrow Right/Left: southeast/northwest;
- Enter/Space: select the focused hex through the same order-planning callback;
- Shift + arrow: pan;
- `F`: fit the complete land-and-water chart.

The current coordinate, terrain family, visibility, and projected unit callsigns are announced through a live status region. Unknown hexes announce only that they are unknown. This materially improves operation, inspection, and focus visibility, but it is not the complete semantic grid/list, target chooser, and route editor required for WCAG 2.2 AA release evidence.

## Persistence and migration

Scenario versions for the four expanded operations are `3`. Migration `0018_campaign_scenario_content_pins.sql` adds the nullable, immutable `campaigns.scenario_content_key`; fresh authored campaign inserts pin an exact `<scenario-id>@<version>` key, while conflict replays never repin an existing campaign. The campaign directory, join route, state creation, and stored Durable Object access all require a supported map/key pair. Stored scenario identity and version must match D1 before the state can be used.

The migration intentionally performs no backfill. A legacy `NULL` pin, an unavailable older version, or a D1/stored-state mismatch fails closed without rewriting Durable Object storage. Existing active campaigns are therefore **not** silently regenerated or upgraded. Any retirement, retention, or migration of those campaigns requires a separately reviewed operator procedure.

## Verification evidence

- Pure topology and scenario tests cover all four maps.
- Full TypeScript and ESLint gates pass locally; Vitest passes 736 tests across 96 files.
- The production bundle compiles locally: Worker 2,053.02 kB, client JavaScript 1,920.16 kB, and CSS 218.38 kB. The post-build verifier finds all 29 allowlisted tactical sheets and rejects inactive mech or chroma hashes. Wrangler emits its known sandbox log-path warning while exiting successfully.
- All 18 migrations apply to an empty isolated D1; all nine seeds replay twice across 122 tables with integrity and foreign keys clean.
- A clean isolated browser workflow passes strategic deployment authorization, strategic round resolution, deployment validation/commit, persisted campaign bootstrap, scenario v3/311-hex API verification, keyboard cursor traversal, and keyboard route selection.
- A 1920×1080 reduced-motion capture of the live authenticated demo workflow is retained at `/private/tmp/corinth-iron-rain-v3.png` for this local review. It is evidence of the renderer, not public multi-account proof.

## Open release gates

- `DEC-007` still blocks a generally published terrain/cover/high-ground/LOS profile. V3 reuses existing authored terrain facts and does not resolve that decision.
- A planet-scale strategic continent remains a separate product surface from a bounded tactical operation. The retained Phaser `worldmap/` prototype remains reference-only.
- Legacy unpinned or older stored campaigns now fail closed; production still needs an explicit operator retention/retirement/migration procedure rather than an automatic upgrade.
- Full semantic route/target alternatives, screen-reader/manual audit, contrast evidence, and automated accessibility coverage remain open.
- Static terrain caching, sprite decode/bundle budgets, visual regression baselines, and load/soak profiling remain open.
- The three active mech revisions now have exact hashes, complete revision disposition, and strict nadir QA; failed renders are quarantined and excluded from the client. The remaining 26 active tactical sheets still require equivalent lineage/visual QA, and all public art still requires rights approval. Reference screenshots 3–5 are style direction only and are not shipped or used as source imagery.
- Production world publication, preview proof, event-time fog policy, observability, rollback rehearsal, legal/privacy decisions, and the wider persistent game-loop blockers in `RELEASE_READINESS.md` remain unresolved. Corinth's Plight must continue to report **NO-GO** for public release.

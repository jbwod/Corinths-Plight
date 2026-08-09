# Corinth's Plight Foundation Plan

## Objective

Deliver the first implementation milestone from the product brief while preserving the useful V1 work: repository audit, versioned rules documentation/catalogue, Cloudflare-native data and runtime skeletons, a deterministic rules-engine slice, an accelerated campaign clock, and an interactive hex-map prototype.

## Work plan

1. Import and audit V1 without overwriting the supplied rules or artwork; run the legacy app and record its build/runtime/security findings.
2. Document the target modular-monolith architecture, D1/Durable Object boundary, rules interpretations/conflicts, data model, round pipeline, and Cloudflare deployment model.
3. Scaffold a TypeScript React/Vite/Worker project that keeps legacy source available for reference while new features migrate vertically.
4. Add D1 migrations and idempotent seed tooling for rulesets, definitions, persistent units, requisition, battalions, ships, campaigns, deployments, orders, and event archives.
5. Implement shared domain contracts plus a pure deterministic rules-engine foundation covering hex math, routes, facing/flanking, LOS, order validation, seeded dice, movement, and a minimal simultaneous combat pipeline.
6. Implement a campaign Durable Object skeleton with persisted state, idempotent round resolution, alarms, development clock presets, filtered player views, and Worker API routes.
7. Build the Campaign Operations prototype: responsive command shell, canvas hex map, unit selection, route/facing order builder, intention overlays, countdown, and round report timeline.
8. Verify formatting, type-checking, unit/replay/idempotency tests, production build, legacy runtime, local Worker behavior, and Cloudflare deployment readiness.

## Scope boundary

This milestone establishes the requested platform and one honest vertical gameplay slice. Advanced rules, full authentication, production asset upload, complete battalion/ship workflows, and all Phase 7–9 systems remain subsequent vertical slices unless already needed for the foundation.

## Delivery status — 2026-08-09

- [x] V1 imported, runtime-smoked, security-audited, and retained as migration reference.
- [x] Seven required foundation documents written and reconciled to the implementation.
- [x] V5-first curated rules profile, source provenance, and 72-item conflict register established.
- [x] D1 migrations and idempotent 30-definition seed validated from an empty database.
- [x] Pure deterministic engine, server projections, clock state machine, and 80-test regression suite passing.
- [x] Campaign Durable Object, alarms, Hibernation WebSockets, authenticated API boundary, and replay guard exercised locally.
- [x] Responsive Canvas campaign prototype visually verified at desktop and tablet widths.
- [x] Type checking, lint, production build, raw production Wrangler dry run, CSP asset policy, and dependency audit passing.
- [ ] Remote production resource/deployment: blocked pending explicit approval to create a potentially billable D1 database in the authenticated Cloudflare account.
- [ ] Post-foundation protocol work: PREPARED/SHA-256 round journal, transactional D1 persistent-effect applier/ack gate, persistent schedule records, and real production login/provider.

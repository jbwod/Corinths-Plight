# Corinth's Plight V1 Audit

**Audit date:** 2026-08-09  
**Audited revision:** `609ea9f50b4d595cfa07c2677d3eeb681d45d0ce` (`main`)  
**Revision date:** 2025-10-05 17:21:15 +08:00  
**Revision subject:** `Revise README.md with new content and images`

## Executive summary

V1 is a working but incomplete Flask prototype. It proves several useful product ideas: persistent user-owned units, a unit builder, player profiles, persistent organisations called Legions, a strong science-fiction visual language, a standalone corvette configurator, and a standalone galactic-map experiment.

It is not an implementation of the persistent asynchronous campaign described by the current Corinth's Plight brief. There is no campaign state, round clock, structured order lifecycle, rules engine, requisition ledger, ship persistence, battlegroup model, hex battlefield state, PvE resolver, fog of war, event log, or Cloudflare infrastructure.

The production target also requires a different runtime. V1 is Python/Flask, uses server-rendered Jinja and SQLite by default, and assumes a writable local filesystem. It cannot be deployed as the intended React/Vite/Cloudflare Workers, D1, and Durable Objects system without replacing the application runtime. That replacement should still be incremental at the product level: retain the useful V1 assets, interaction concepts, domain discoveries, and historical implementation while introducing the Cloudflare application alongside it.

The authenticated happy path can be run locally after supplying two undeclared Python packages. Database initialization succeeded and authenticated profile, unit, and Legion pages returned HTTP 200. The public Legion directory currently returns HTTP 500 for anonymous users. There are no application tests, lint configuration, build configuration, or code-validation CI jobs.

## Audit scope and evidence

The audit covered the complete tracked repository at the revision above:

- Flask application code, templates, static assets, and database scripts under `app/` and the repository root.
- SQLAlchemy models and Alembic/Flask-Migrate scaffolding.
- The standalone `shipbuilder/` prototype.
- The standalone `worldmap/` Phaser prototype.
- GitHub workflow files.
- Dependency, startup, compilation, import, database initialization, and route smoke-test behaviour.
- The separately supplied rules and image inputs were inspected as migration inputs, but they were not part of the audited V1 commit.

The repository contains no TypeScript or package-manager manifest, no React or Vite application, no Wrangler configuration, and no Cloudflare resource bindings.

## Repository layout

| Path | Purpose | Current state |
|---|---|---|
| `app/__init__.py` | Flask, SQLAlchemy, migration, login, and CSRF initialization | Global module-level application; no application factory |
| `app/routes.py` | All HTTP routes and most application behaviour | Monolithic route module, approximately 670 lines |
| `app/models.py` | SQLAlchemy entities plus progression and display logic | Persistence, rules, presentation mapping, and transaction side effects are mixed together |
| `app/unit_templates.py` | Seed definitions for unit classes and test Legion data | Destructive replace-and-reseed workflow; values are Python code |
| `app/templates/` | Jinja pages and large inline JavaScript implementations | Functional authenticated UI, but tightly coupled and difficult to test |
| `app/static/style.css` | Shared visual system | Approximately 6,482 lines in one stylesheet |
| `app/static/img/` | Unit, profile, planet, and interface artwork | Valuable migration asset library; some code references missing paths |
| `migrations/` | Flask-Migrate/Alembic scaffolding | Environment files exist; no committed migration versions exist |
| `init_db.py` | Creates tables and seeds templates, test users, and upgrades | Useful for local demonstration; uses `db.create_all()` rather than migrations |
| `reset_db.py` | Drops and recreates all tables | Development-only destructive utility |
| `shipbuilder/` | Standalone corvette equipment visualizer | Not routed, authenticated, persisted, or connected to application models |
| `worldmap/` | Standalone Phaser map and visual hex-grid experiment | Not routed or persisted; contains a browser runtime error |
| `.github/workflows/` | Issue/project automation | No build, test, lint, security, or deployment workflow |

## Current architecture

### Runtime and request handling

The application is a conventional server-rendered Flask application:

1. `run.py` imports the global `app` object.
2. `app/__init__.py` constructs Flask, SQLAlchemy, Flask-Migrate, Flask-Login, and Flask-WTF CSRF objects at import time.
3. `app/routes.py` registers every page and API endpoint on that global object.
4. Jinja renders HTML pages and embeds most page-specific JavaScript inline.
5. SQLAlchemy reads and writes the configured relational database.

There is no formal service layer, repository layer, domain boundary, command handler, asynchronous job system, or API versioning. Model methods frequently query the database and some commit transactions directly.

`run_flask.py` suggests an application-factory transition, but imports `create_app`, which does not exist. The supported working entry point is currently `run.py`.

### Frontend

The main frontend consists of Jinja templates extending `app/templates/layout.html`. It includes:

- Home/landing page.
- Combined login and signup page.
- Commander dossier/profile.
- Unit builder.
- Persistent unit roster.
- Legion directory.
- Legion creation and dashboard pages.
- Responsive navigation and a coherent cyan/blue science-fiction visual theme.

The UI is not componentized. Individual templates contain hundreds or thousands of lines of HTML, CSS, and JavaScript, and some behaviour is duplicated between templates and Python model methods. Font Awesome is loaded from a CDN. There is no frontend dependency manifest, build step, static type checking, bundling, or browser test setup.

The `shipbuilder/` and `worldmap/` directories are separate static sites rather than sections of the Flask application.

### Authentication and authorization

Authentication uses Flask-Login session cookies:

- `User` mixes in `UserMixin`.
- The login manager reloads a user by integer primary key.
- Signup creates a `User` row.
- Login compares the submitted password directly with the stored value.
- A locally defined `login_required` decorator shadows Flask-Login's imported decorator and redirects unauthenticated users to the login page.
- Flask-WTF `CSRFProtect` is enabled globally.

Authorization exists for a few Legion operations:

- Legion dashboards require membership.
- Name, description, emblem, public-status, and invite-code changes require the hard-coded `leader` role.

Authorization is not represented as reusable permissions. Roles are free-form strings on `UserLegion`; ranks and permissions are not configurable. There is no admin role, campaign membership, unit-command delegation, authentication rate limiting, email verification, password reset, or account recovery.

### Persistence and storage

`config.py` uses `DATABASE_URL` when present and otherwise stores data in a repository-local SQLite database, `app.db`.

V1 uses SQLAlchemy and declares Flask-Migrate, but committed migration history is absent. `init_db.py` and `reset_db.py` call `db.create_all()`, and the reset script calls `db.drop_all()`. This is not a safe production schema workflow.

Unit image customization is stored either as a static path or as base64 text in the relational row. Upload handling assumes local filesystem paths. Neither approach matches the intended split between D1 relational data and R2 object storage.

There is no transaction ledger, immutable campaign-event archive, snapshot model, outbox, idempotency key, or retry-safe persistent-effects mechanism.

## Existing data model

| Model | Existing responsibility | Important limitations |
|---|---|---|
| `User` | Credentials, profile image, XP, level, activity, unit limits, and unit-unlock calculations | Plaintext password; progression and catalogue policy hard-coded in model methods; no requisition or account-security state |
| `UserLegion` | Many-to-many User/Legion membership with role and joined timestamp | Role is a string; no configurable rank, permissions, invitation state, or audit history |
| `Legion` | Organisation identity, emblem string, recruitment flags, progression, statistics, and membership helpers | No battlegroups, ship, treasury, history, permission system, or campaign deployment |
| `UnitTemplate` | Unit-class description and base FS, armour, speed, range, slots, logistics text, and special-rules text | No ruleset version/source/status metadata; effects remain prose; conflicting source values cannot coexist |
| `EquipmentTemplate` | Equipment name, slot, rules text, cost, and one restriction string | Not seeded by initialization; restriction model is insufficient; no stat modifiers, dependencies, incompatibilities, ammo, or versioning |
| `UserUnit` | A player-owned copy of unit statistics, equipment JSON, identity, and image customization | No lifecycle status, damage, ammo, history, battle record, campaign deployment, requisition value, or normalized equipment ownership |
| `Upgrade` | Name, description, and comma-separated compatible unit types | Compatibility is denormalized text; upgrades are associated with unit templates rather than equipped instances |
| `unit_upgrades` | Unit-template/upgrade association | Does not model equipment installed on an individual player unit |

### Useful domain groundwork

Two existing distinctions are worth preserving conceptually:

- `UnitTemplate` is separate from `UserUnit`, anticipating the required distinction between a class definition and a persistent player-owned unit.
- `UserLegion` is a membership entity rather than a bare many-to-many join, providing a place where rank and permission data can eventually live.

Both need redesigned schemas rather than direct reuse.

## Existing user workflows

### Account and profile

Players can sign up, log in, log out, view a dossier, accumulate XP, gain levels, see unlock information, and choose a profile portrait. These screens demonstrate useful presentation ideas but the credential implementation is unsafe.

### Unit creation and roster

The unit builder:

1. Loads unit templates.
2. Checks a level-based unit limit and hard-coded unlock level.
3. Accepts a custom unit name.
4. Accepts client-generated equipment JSON.
5. Counts primary, secondary, and internal selections against slot totals.
6. Copies template statistics into a new `UserUnit`.
7. Stores selected equipment as JSON text in `applied_upgrades`.
8. Stores or embeds the chosen unit image.
9. Awards XP and displays the unit in the roster.

There is no requisition cost, purchase transaction, inventory ownership, authoritative equipment-ID lookup, full eligibility validation, atomic spend, ammunition, damage, status, or unit history. The frontend calls a unit-deletion endpoint that does not exist.

### Legions

Players can browse, create, and join Legions. Members can view a dashboard and leaders can edit selected Legion properties. This is a useful prototype for the Battalion area.

The current implementation lacks configurable ranks, granular permissions, approval workflows, robust private invitations, battlegroups, shared assets, Battalion requisition, ships, deployments, and command delegation.

### Ship builder

`shipbuilder/index.html` lets a player select two pieces of corvette equipment, previews a pre-rendered sprite combination, and exports a local JSON description. Its visual approach and sprite set are useful.

It has no Flask route, account association, server validation, database model, slot rules, costs, persistence, inventory, ship identity, travel state, cargo, health, or upgrades. `shipbuilder/shipBuilder.js` is an unused older PIXI experiment and refers to asset paths that are not present.

### World map

The standalone map loads a bitmap in Phaser, draws a large visual hex grid, and implements camera dragging and zoom. It demonstrates a desired feel but is not game-state architecture.

The map does not use axial or cube coordinates, does not model terrain or occupancy, and is not connected to users, units, campaigns, orders, or a server. `worldmap/js/game.js` also accesses `graphics` and `hexagon` at top level before valid initialization; JavaScript syntax checking succeeds, but browser execution should fail at that statement.

## Runtime audit

### Environment preparation

A temporary isolated Python virtual environment was used so the repository itself was not dependent on globally installed packages.

Installing `requirements.txt` alone was insufficient because `app/routes.py` imports two undeclared dependencies:

- `flask_paginate` from the `Flask-Paginate` package.
- `PIL` from the `Pillow` package.

After installing the declared requirements plus `Flask-Paginate` and `Pillow`:

- Python compilation succeeded.
- Importing the Flask application succeeded.
- Database initialization succeeded.
- The development database contained 28 unit templates, 2 test users, and 5 upgrades.

The seed accounts use known plaintext test passwords and are suitable only for local smoke testing.

### Route smoke tests

| Request/workflow | Authentication | Result | Notes |
|---|---:|---:|---|
| Login flow | No, then establishes session | HTTP 200 | Test user could authenticate |
| `/dossier` | Yes | HTTP 200 | Profile rendered |
| `/create_unit` | Yes | HTTP 200 | Unit-builder page rendered |
| `/my_units` | Yes | HTTP 200 | Persistent roster rendered |
| `/legion_directory` | Yes | HTTP 200 | Directory rendered for authenticated user |
| `/legion_dashboard/<id>` | Yes, member | HTTP 200 | Seed Legion dashboard rendered |
| `/legion_directory` | No | HTTP 500 | Template calls `Legion.can_join(current_user)`; that helper accesses `user.id`, which `AnonymousUserMixin` does not provide |

The smoke run verifies that the authenticated page skeleton is usable. It does not establish correctness, security, concurrency safety, or compatibility with the target Cloudflare deployment.

### Tests, lint, build, and CI

- No Python test files were found.
- No JavaScript test files were found.
- No pytest, unittest, Playwright, or equivalent test configuration exists.
- No Ruff, Flake8, Black, MyPy, ESLint, Biome, Prettier, or equivalent lint/type-check configuration exists.
- There is no frontend or application build configuration.
- There is no `package.json`, lockfile, Vite configuration, or TypeScript configuration.
- The GitHub workflows only support issue/project automation and do not validate application code.
- The standalone JavaScript source files pass syntax checking, which does not catch the world-map runtime error.

## Security, correctness, and quality findings

### Critical

1. **Passwords are stored and compared in plaintext.** A database disclosure exposes every credential immediately, and users may reuse those credentials elsewhere.
2. **Application secrets are committed in source.** `config.py` contains a literal secret and `app/__init__.py` overrides it with the literal `banana`. Session and CSRF integrity cannot rely on these values.
3. **Unit equipment is client-authored.** The server trusts JSON objects supplied by the browser and primarily validates slot counts. It does not resolve authoritative equipment IDs, verify complete eligibility, verify ownership, or charge requisition.

### High

1. **Anonymous public-directory access crashes.** A route advertised as public returns HTTP 500 because an anonymous user is passed into membership logic that assumes `user.id`.
2. **CSRF integration is inconsistent.** CSRF protection is global, but several fetch-based Legion mutations do not send a token. The create-Legion form renders the token value without a named hidden field. These operations are expected to fail or require unsafe exemptions.
3. **The supported dependency list cannot start the app.** `Flask-Paginate` and `Pillow` are imported but absent from `requirements.txt`.
4. **There is no safe schema history.** Production evolution cannot rely on `create_all()` or destructive reset scripts.
5. **There are no tests for ownership or concurrency invariants.** Double deployment, double spending, order locking, idempotent resolution, and cross-user access are not modelled, much less tested.

### Medium

1. `run_flask.py` imports a nonexistent `create_app` function.
2. The roster calls an unimplemented `/delete_unit/<id>` route.
3. The equipment catalogue table is not populated by the seed process, leaving the equipment API empty under normal initialization.
4. Unit unlock rules are repeated in multiple model methods and use names that disagree with seeded unit-template names. Unknown names default to level 1.
5. `Bomber Aircraft` seeds the string `Fly Over` into an integer `range` column.
6. Model methods such as progression updates commit database transactions internally, making larger operations difficult to keep atomic.
7. Template replacement deletes all unit-template rows before reseeding, which is incompatible with versioned long-running campaigns and may threaten references.
8. Several generated image paths do not exist, including portions of the mech, artillery, heavy-transport, and battleship mappings.
9. Uploaded/recoloured image data is stored in relational text fields, increasing database size and bypassing a controlled object-storage lifecycle.
10. The world-map code contains a browser runtime error despite passing syntax validation.

### Positive controls already present

- Flask-WTF CSRF protection is enabled globally, although individual form/fetch integration needs correction.
- Legion dashboard access checks membership.
- Selected Legion mutations check for the leader role.
- Unit creation checks the authenticated owner, unit-count ceiling, unlock requirement, and basic slot totals.
- SQLAlchemy unique constraints protect usernames, emails, Legion names, and upgrade names.
- Image upload code attempts extension validation, resizing, and a nominal 2 MB limit.

These controls are useful evidence of intended policy, but they are not sufficient for the target server-authoritative game.

## Retain, refactor, replace, or add

| Area | Decision | What to do |
|---|---|---|
| Visual identity, colours, artwork, profile portraits, planet imagery | **Retain** | Reuse verified/licensed assets in the new frontend and preserve V1 screenshots as design reference |
| Unit-builder and roster interaction concepts | **Retain and refactor** | Recreate as React components backed by authoritative rules and purchase APIs |
| Legion directory/dashboard concepts | **Retain and refactor** | Rename product-facing domain to Battalion and add data-driven ranks, permissions, battlegroups, history, and ship ownership |
| `UnitTemplate` versus `UserUnit` conceptual distinction | **Retain and refactor** | Implement versioned `UnitDefinition`, persistent `PlayerUnit`, and separate `CampaignDeployment` records |
| Unit seed values and special-rules prose | **Refactor** | Import as versioned catalogue candidates with source/status metadata and explicit conflict records; do not copy silently as active truth |
| Corvette sprite-combination assets and configurator idea | **Retain and refactor** | Integrate into a server-authoritative Battalion ship workflow with class, slots, equipment, inventory, cost, and persistence |
| World-map artwork and pan/zoom feel | **Retain selectively** | Keep as visual reference; implement a measured Canvas/WebGL/SVG campaign map over standard axial/cube coordinates |
| Large Jinja templates, inline scripts, and monolithic stylesheet | **Refactor/replace** | Extract reusable React components and a maintainable design system while preserving recognisable visual language |
| Flask route/runtime architecture | **Replace** | Implement the application and API with TypeScript, React/Vite, and Cloudflare Workers |
| SQLite/local-filesystem persistence | **Replace** | Use D1 for relational persistent state, Durable Objects for active campaign coordination, and R2 only for appropriate objects |
| Plaintext credential flow and literal secrets | **Replace before reuse** | Adopt a Cloudflare-compatible authentication design with hashed credentials or a vetted identity provider and managed secrets |
| Client-authored equipment JSON | **Replace** | Accept IDs and intent only; resolve definitions, permissions, statistics, inventory, compatibility, and price on the server |
| Legion string roles | **Replace** | Create Battalion rank and permission tables with explicit authorization checks |
| XP-based unit unlock logic | **Reassess and refactor** | Treat as a product/rules decision; if retained, move it into versioned game data rather than model conditionals |
| Requisition ledger and atomic purchases | **Missing—add** | Add append-only transactions, safe balance projection, idempotency, and server-side purchase validation |
| Persistent ship, cargo, modules, and travel state | **Missing—add** | Add Battalion ship models and strategic travel orders |
| Campaigns, deployments, rounds, deadlines, and order states | **Missing—add** | Add D1 campaign metadata and one Durable Object per active campaign |
| Deterministic pure rules engine and replay fixtures | **Missing—add** | Build a UI/persistence-independent TypeScript package with seeded randomness and exact event output |
| Hex state, routes, facing, LOS, fog, terrain, occupancy | **Missing—add** | Model explicitly in domain/rules data and keep secret information server-side |
| PvE doctrine and enemy intentions | **Missing—add** | Generate deterministic enemy orders from the same locked pre-resolution state as player orders |
| Append-only campaign events and idempotent persistent effects | **Missing—add** | Record ordered events and protect each round/effect with stable idempotency identifiers |
| Automated tests, lint, type checking, and deployment CI | **Missing—add** | Establish these with the Cloudflare foundation before expanding gameplay |

## Cloudflare migration consequence

The existing architecture fundamentally prevents direct deployment to the requested Cloudflare model:

- Flask cannot run as the intended TypeScript Worker application.
- SQLite on a local writable filesystem is not D1.
- Module-global request/application state is not Durable Object campaign coordination.
- Local uploads are not R2.
- Jinja pages are not the requested React/Vite frontend.
- No retry or idempotency boundaries exist for scheduled round resolution.

The recommended migration is therefore architectural replacement with product-level continuity:

1. Preserve this V1 commit as the historical baseline.
2. Preserve and catalogue useful UI assets and screenshots.
3. Document the target architecture and rule conflicts before implementing gameplay.
4. Introduce the TypeScript Cloudflare application and pure rules-engine package alongside V1.
5. Port one vertical slice at a time: authentication/profile, persistent units/requisition, Battalion/ship, campaign skeleton, orders, then deterministic resolution.
6. Keep V1 available for reference until its useful workflows have migrated and acceptance tests cover the replacements.

## Audit commands and outcomes

| Check | Representative command | Outcome |
|---|---|---|
| Revision identity | `git rev-parse HEAD` | `609ea9f50b4d595cfa07c2677d3eeb681d45d0ce` |
| Working-tree baseline | `git status --short --branch` | Audited tracked V1 on `main`; separately supplied rules/assets remained migration inputs |
| Repository inventory | `rg --files -uu -g '!.git/**'` and scoped `find` | Flask/Jinja application plus standalone ship-builder and world-map prototypes |
| Manifest discovery | Scoped search for package, Vite, Wrangler, TypeScript, Python, and container manifests | Only Python `requirements.txt`; no Cloudflare/frontend build manifests |
| Python source validation | Python compile/AST checks in the temporary environment | Succeeded |
| JavaScript syntax | `node --check` on project JavaScript files | Succeeded; does not catch the world-map runtime error |
| Dependency installation | Install `requirements.txt`, then missing `Flask-Paginate` and `Pillow` | Environment installed; the two additions were required for import |
| Flask import | Import application in the temporary virtual environment | Succeeded after missing dependencies were installed |
| Database initialization | `python init_db.py` in the temporary environment | Succeeded: 28 unit templates, 2 users, 5 upgrades |
| Authenticated route smoke tests | Flask test client/login session against profile, unit, directory, and dashboard routes | Login and authenticated target pages returned HTTP 200 |
| Anonymous route smoke test | GET `/legion_directory` without a session | HTTP 500 due to anonymous user lacking `id` in `Legion.can_join` path |
| Test discovery | Search for Python and JavaScript test naming conventions/configuration | No application tests found |
| Lint/type/build discovery | Search manifests, configuration, scripts, and CI | No lint, type-check, application build, or application CI configuration found |

## Audit conclusion

V1 should not be discarded, but it should not become the production foundation by incremental patching of Flask. Its highest-value contributions are product discovery, visual identity, assets, interaction prototypes, and early domain vocabulary. Its runtime, security model, persistence strategy, hard-coded rules, and lack of campaign architecture need replacement.

The first implementation deliverable should use this document as the V1 baseline, then establish the target architecture, versioned rules catalogue, data model, deterministic round pipeline, and Cloudflare bindings before expanding feature breadth.

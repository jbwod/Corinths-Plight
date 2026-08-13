# Gameplay Visual Asset Provenance

Status: `IN_PROGRESS` for public-release review. The gameplay art is integrated and technically traceable; final public asset/legal approval remains a release gate.

## Generated gameplay pack

The 29 catalogued non-orbital unit portraits and 105 equipment/upgrade illustrations were generated on 2026-08-11–12 with OpenAI's built-in image generation tool under the direction of the Corinth's Plight project owner. No third-party reference image was supplied. The common art direction was:

> Isolated Corinth's Plight sci-fi game inventory icon; bold high-contrast inked graphic-novel linework; cool white and blue-grey hardware with dark navy shadows; clean silhouette; no text, logo, watermark, scenery, hands, people, or additional objects; centred square composition on a flat chroma-magenta background.

Individual prompts replaced the subject with the exact V5 unit or Store equipment identity and only source-supported visual traits. The Silent SMGs item retains two generated compositions; the cleaner single-weapon composition is active and the original dual-weapon version remains an alternate.

Generated sources were resized and converted from the magenta key to transparent RGBA with the bundled image-generation chroma-key helper. Unit portraits are 512×512 PNGs; equipment art is 384×384 PNG. The authoritative per-asset key, path, SHA-256, source render, variant history, and status are recorded in [`src/assets/gameplay-visuals.manifest.json`](../src/assets/gameplay-visuals.manifest.json).

The tactical expansion contains 36 transparent 1536×256 sprite sheets in `src/assets/tactical-sprites/generated/`. The explicit runtime allowlist selects exactly 29 sheets—one for each catalogued definition—and excludes seven superseded mech sheets from the client graph. Every sheet follows the six-frame order idle, move A, move B, attack, support and damaged, but that packing contract is not a camera-angle certification. The active `unit-light-mech-v3`, `unit-medium-mech-v4`, and `unit-heavy-mech-v3` revisions were generated from a reference-free plan-view brief and pass strict roof-only/nadir visual review. The other 26 active sheets remain `PROVISIONAL`, including infantry/medic/engineer families that still need individual plan-view QA.

The active, alternate, and 12 quarantined mech renders have exact packed SHA-256 values, runtime status, and visual-QA disposition in `src/assets/tactical-sprites/mech-sprite-provenance.json`. The three active revisions additionally record their chroma hashes and originating render identifiers; raw render files/hashes and complete generation lineage are not yet retained in the repository. The allowlist, contract tests, and post-build verifier reject wildcard loading, inactive mech imports, undeclared mech revisions, missing quarantined renders, wrong sheet dimensions/format, hash drift, duplicate active identities, missing active bundle assets, and inactive/chroma hashes in the client graph. Equivalent hash/lineage/QA coverage for the other 26 active tactical sheets remains open.

## Runtime usage and fallbacks

- Unit portraits are keyed by stable unit definition ID and used in Forces, deployment, campaign rosters, and other inspection surfaces.
- Tactical maps prefer the six-state allowlisted sheets, apply a subdued side-keyed colour grade, role-aware scale, rules-facing rotation with an explicit facing pointer, and deterministic same-hex placement. The three active mech sheets are QA-passed nadir views; other families remain provisional. They fall back visibly to the code-native high-contrast SVG-path glyphs. Replay maps continue to use semantic glyphs.
- Equipment art is keyed by stable equipment definition ID and used in requisition, loadout, inspection, and ship-module surfaces.
- Unknown or unavailable art fails visibly to a semantic glyph/short code and an accessible text label. Gameplay authority and eligibility never depend on the image.

## Release disposition

These files are original project-generated outputs and have no recorded third-party reference inputs. They are not yet marked legally cleared for public release: final ownership/terms review, visual-content review, and inclusion in the public asset licence register remain `PENDING` under the release-readiness gate. No source-rule or gameplay implementation status is inferred from the presence of an illustration.

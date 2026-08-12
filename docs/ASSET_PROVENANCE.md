# Gameplay Visual Asset Provenance

Status: `IN_PROGRESS` for public-release review. The gameplay art is integrated and technically traceable; final public asset/legal approval remains a release gate.

## Generated gameplay pack

The 29 catalogued non-orbital unit portraits and 105 equipment/upgrade illustrations were generated on 2026-08-11–12 with OpenAI's built-in image generation tool under the direction of the Corinth's Plight project owner. No third-party reference image was supplied. The common art direction was:

> Isolated Corinth's Plight sci-fi game inventory icon; bold high-contrast inked graphic-novel linework; cool white and blue-grey hardware with dark navy shadows; clean silhouette; no text, logo, watermark, scenery, hands, people, or additional objects; centred square composition on a flat chroma-magenta background.

Individual prompts replaced the subject with the exact V5 unit or Store equipment identity and only source-supported visual traits. The Silent SMGs item retains two generated compositions; the cleaner single-weapon composition is active and the original dual-weapon version remains an alternate.

Generated sources were resized and converted from the magenta key to transparent RGBA with the bundled image-generation chroma-key helper. Unit portraits are 512×512 PNGs; equipment art is 384×384 PNG. The authoritative per-asset key, path, SHA-256, source render, variant history, and status are recorded in [`src/assets/gameplay-visuals.manifest.json`](../src/assets/gameplay-visuals.manifest.json).

## Runtime usage and fallbacks

- Unit portraits are keyed by stable unit definition ID and used in Forces, deployment, campaign rosters, and other inspection surfaces.
- Tactical and replay maps use code-native high-contrast SVG-path glyphs rather than raster portraits, preserving legibility at hex-marker scale.
- Equipment art is keyed by stable equipment definition ID and used in requisition, loadout, inspection, and ship-module surfaces.
- Unknown or unavailable art fails visibly to a semantic glyph/short code and an accessible text label. Gameplay authority and eligibility never depend on the image.

## Release disposition

These files are original project-generated outputs and have no recorded third-party reference inputs. They are not yet marked legally cleared for public release: final ownership/terms review, visual-content review, and inclusion in the public asset licence register remain `PENDING` under the release-readiness gate. No source-rule or gameplay implementation status is inferred from the presence of an illustration.

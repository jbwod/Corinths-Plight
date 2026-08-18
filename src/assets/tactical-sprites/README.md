# Tactical unit sprite sheets

Every runtime sheet in `generated/` is a transparent RGBA image measuring
1536 x 256 pixels. The six 256 x 256 frames are ordered as follows:

1. idle
2. move A
3. move B
4. attack
5. support
6. damaged

The runtime contract points every unit north in its source frame, and the
tactical renderer rotates that base orientation to the deployment's facing.
That contract alone does not certify the camera angle of older sheets. Visual
QA is recorded separately; unreviewed legacy sheets remain `PROVISIONAL`.

The sheets were generated from the existing catalogue art with the following
shared art direction: off-white armour, dark navy technical-ink outlines,
restrained cyan equipment lights, readable silhouettes at tactical scale, no
text, and no perspective. Generated chroma-key strips are kept in `chroma/`;
`scripts/pack-tactical-sprite-sheet.py` normalizes their scale and alignment
into the runtime format.

The active mech revisions are `unit-light-mech-v3.png`,
`unit-medium-mech-v4.png`, and `unit-heavy-mech-v3.png`. They were generated
from a reference-free plan-view brief, corrected only for cell spacing and
effect containment, passed strict roof-only/nadir visual review, chroma-keyed,
and packed with `scripts/pack-tactical-sprite-sheet.py`. Their exact source and
packed hashes, QA results, and rejected predecessors are recorded in
`mech-sprite-provenance.json`. Rejected generations are retained in
`quarantine/` and are never imported by the runtime allowlist.

The Bug Swarm expansion adds one active sheet for each of the seven enemy
definitions in the pinned catalogue: Artillery, Burrower, Drone, Flyer, Heavy,
Spitter, and Warrior. Drone, Warrior, and Heavy are the executable experimental
MVP enemies. The other four definitions remain mechanically incomplete; their
artwork is available to the renderer but does not activate, balance, or make
those definitions spawnable. Untouched RGBA source strips and exact source and
packed hashes are retained under `source/swarm/` and recorded in
`swarm-sprite-provenance.json`.

Light Swarm deployments are composed as broods at render time so one
authoritative deployment still feels numerous: Drone uses five visible sprite
instances, while Warrior, Spitter, Burrower, and Flyer use three. Heavy and
Artillery remain singular. This is a presentation rule only and does not alter
model count, health, targeting, or resolution.

`src/tactical-sprite-manifest.ts` is the only runtime sprite allowlist. Do not
replace it with an eager wildcard: wildcard discovery bundles inactive and
quarantined revisions into the client.

Prompt pattern:

> Create a plan-view tactical machine silhouette from a camera exactly overhead
> with its optical axis perpendicular to the ground. Show only roof/top armour
> surfaces, with compact limb footprints tucked under the hull; no face, chest,
> standing pose, or visible vertical front planes. Produce six isolated cells:
> idle, move A, move B, attack, support, and damaged. North points up in every
> cell. Keep a fixed pivot and scale; use a flat chroma-green background; no
> text, shadows, perspective, cropping, or overlapping effects.

Infantry prompts additionally require anatomically coherent shoulders, arms,
hands, weapon grip, torso, hips, and legs in every frame.

Bug Swarm prompts instead require one anatomically coherent insectoid per
frame, an unambiguous role silhouette, consistent dorsal anatomy, and attached
limbs. The shared palette is burnt-coral and bone chitin, dark-navy ink, and
restrained cyan bioluminescence so enemy contacts remain readable against the
cool white/blue-grey player force at tactical scale.

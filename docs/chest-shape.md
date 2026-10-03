# Chest curve refinement — 2026-10-03

## Brief and scope

The user requested a smoother chest silhouette, especially its underside, then
specified shorter straight segments, a gentle upper approach and a tighter,
rounded lower return around the apex. Retain the anime/toon style, existing
size controls, licensed starter, fitted wardrobe and natural rigged movement.
This is a visual shape refinement, not new anatomy detail or motion physics.

Work started from `87c15dce31e9270a6b0abef215343d496e0e24d0` on
`codex/rounded-lower-chest`. No push, PR, merge or deployment was performed.
Previously saved appearance codes intentionally receive the refined surface;
their codes, schema, colours, figure axes and equipment choices are unchanged.

## Decision and implementation

- `chest-surface.ts` locally subdivides the front torso before sculpting, with
  approximately 10 mm target edges and at most six passes. Shared edge splits
  keep the surface conforming. Original vertices remain an unchanged prefix;
  new UVs/normals and normalized, at-most-four bone influences are interpolated.
  Face morphs, rear shape and arm/finger topology are outside the refinement.
- `body-shape.ts` uses a rounded cap with zero slope at the apex and boundary.
  In bind space the approach spans about 123.5 mm above the apex and returns
  over 105 mm below it. The upper support guard matches this longer approach
  instead of prematurely cutting off the curve. Lower vertical displacement
  is restrained so the underside rounds rather than stretching downward.
- Sideways displacement fades to zero at the sternum, avoiding an opened
  centre seam. Normals follow the deformation's inverse-transpose Jacobian
  rather than an artificial outward lean. Edits restart from immutable rest
  geometry, including restoration of the unsculpted male chest.
- Runtime, fitted wardrobe construction and original-outfit VRM/GLB export use
  the same deterministic float32 refinement. Export writes positions, normals,
  UVs, joints, weights and indices consistently. MToon base/outline groups and
  explicit full-primitive draw ranges are updated to the refined index count;
  leaving their old counts would truncate the original tunic.
- New fitted tops use 7 mm front-chest allowance, fading to their existing
  9 mm collar/side allowance. Rear and tucked-shirt fit are preserved. The
  original tunic retains its authored looser fit and embossed details; no
  blanket extra allowance or original-asset rewrite is retained.

## Observable acceptance and executed checks

- The upper curve is gentler than the lower return, both boundary approaches
  tend smoothly to zero, and the centre does not split. Displacement remains
  symmetric and bounded. Surface normals are perpendicular to transformed
  tangents; repeated edits do not accumulate. Local tessellation preserves
  winding, shared interior edges, rest planes, UVs and normalized influences.
- `npm test`: **204 passed**, including four new shape/surface regressions and
  existing avatar, wardrobe, export, replay and gameplay checks.
- `BASE_PATH=/chroma-match/ npm run build`: passed TypeScript checking, service
  worker syntax checking and production bundling. Existing >500 kB lazy-runtime
  chunk advisory remains. `git diff --check` passed. No lint script exists.
- Targeted browser command: **24 passed** in the final, uninterrupted run:

  ```sh
  npm run test:studio -- tests/studio/chest-shape.spec.ts tests/studio/figure.spec.ts tests/studio/wardrobe.spec.ts tests/studio/seat-volume.spec.ts
  ```

- Five tops (original plus four fitted), three size steps (0/3/6), and front,
  three-quarter and side closeups were rendered and inspected. Preview/export
  comparison covered **2,648,245 attribute/index values**, with no mismatch
  under the test's 1e-7 float tolerance and exact integer comparison. Skeleton,
  full draw coverage and strict size ordering also passed.
- Fitted-top clearance passed **72 variant/size/top/gesture combinations**,
  five phases each, with **40,530 radial surface samples**. Measured clearance
  was **5.27–20.60 mm**, inside the existing 2–25 mm gate. This is sampled posed
  mesh clearance, not a uniform fabric offset or a human measurement.
- Existing wardrobe rig verification passed **240 cases / 1,200 phases**.
  Its **18,420 skirt samples**, grounded footwear and shared export stance
  remained within their unchanged gates. Minimum rear volume, original body
  export parity, draft/Undo/cancel/Save/reload, PNG/JSON/VRM/GLB, four locales,
  three themes, 320/390/720/1280 px, keyboard and reduced-motion checks passed.
- `npm run test:release`: **5 passed** against the local production build at
  `/chroma-match/`, including wardrobe and prior guest Save/reload/offline
  flows, pinned-model/notices checks, and Paper lobby drag/focus/hierarchy.
  Production lobby, offline wardrobe editor and downloaded four-view images
  were also inspected. Renderer asset: `anime-renderer-DT5M_zHJ.js`.
- The pinned source VRM is unchanged, SHA-256:
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.

Final generated evidence is under `/tmp/chroma-chest-shape.FvaOhf/final-studio/`
and `/tmp/chroma-chest-shape.FvaOhf/final-production/`. The source tests recreate
the closeups, metrics and downloads. Earlier exploratory/interrupted runs are
not the accepted final verification.

## Review and limits

Direct source/visual self-review resolved a centre seam, excessive fitted-top
clearance, obsolete MToon draw counts and a premature upper-field cutoff. The
old whole-tunic pixel-area assertion required a longer lower tail, contrary to
the revised brief; bounded field/normal tests now assert the requested upper
and lower curvature directly, while the broad-side-silhouette gate remains.

The fitted-top clearance gate does **not** apply to the original tunic's
authored inset/embossed details. Exploratory rays at its upper-front inset
reported small skin overlaps (up to about 2.35 mm at the largest variant).
Those source details are preserved, not claimed universally collision-free;
an attempted blanket tunic allowance was rejected. No sampled penetration
was found in the four new fitted tops under the stated final test conditions.

No independent human/sub-agent review, full studio-suite rerun, CI or live
verification is claimed for this change. Tests use isolated guest contexts;
signed-in cloud writes, physical phones, native Safari, third-party VRM apps,
arbitrary imported rigs/poses and cloth/jiggle simulation were not exercised.
No new UI controls, permissions, dependencies or licensed assets were added.

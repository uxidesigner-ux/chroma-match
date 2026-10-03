# Chest curve refinement — 2026-10-03

## Brief and scope

The user requested a smoother chest silhouette, especially its underside, then
specified shorter straight segments, a gentle upper approach and a tighter,
rounded lower return around the apex. Retain the anime/toon style, existing
size controls, licensed starter, fitted wardrobe and natural rigged movement.
This is a visual shape refinement, not new anatomy detail or motion physics.

Work started from `87c15dce31e9270a6b0abef215343d496e0e24d0` on
`codex/rounded-lower-chest`. No push, PR, merge or deployment was performed.
The attached-image follow-up starts from local commit
`0a90f59e82b29d5407a81cb3220a2a8bd7333545`. The initial 204 unit / 24 browser
checks validated integration but did not directly bound the upper straight
facet or local apex turn. The user's annotated image exposed this acceptance
gap; the following implementation and evidence supersede that first pass.
Previously saved appearance codes intentionally receive the refined surface;
their codes, schema, colours, figure axes and equipment choices are unchanged.

## Decision and implementation

- `chest-surface.ts` locally subdivides the front torso before sculpting, with
  approximately 3 mm apex / 5 mm surrounding target edges and at most seven
  passes. New positions use endpoint tangent-plane interpolation, not linear
  midpoints on the same flat source facets. Shared edge splits keep the surface
  conforming. Original vertices remain an unchanged prefix; new UVs/normals and
  normalized, at-most-four bone influences are interpolated. Face morphs, rear
  shape and arm/finger topology are outside the refinement.
- Upper torso vertices with an 11% shoulder influence were wrongly classified
  as arms, leaving about 61 mm unrefined upper facets. Arm classification now
  requires majority arm/shoulder weight; only wholly arm-majority triangles are
  excluded. Small blends still receive the torso refinement.
- Curved corrections are bounded by the thinnest incident triangle and heavily
  limited at narrow authored details. They fade into the torso interior above
  the waistband. Adjacent conforming splits remain linear outside this region,
  preserving the existing skirt/seat fit rather than moving waist anchors.
- `body-shape.ts` uses a rounded cap with zero slope at the apex and boundary.
  In bind space the approach spans about 123.5 mm above the apex and returns
  over 105 mm below it. The upper support guard matches this longer approach
  instead of prematurely cutting off the curve. Lower vertical displacement
  is restrained so the underside rounds rather than stretching downward.
- Sideways displacement fades to zero at the sternum, avoiding an opened
  centre seam. An 18 mm central quartic join also smooths the nearest-lobe
  transition in depth/direction. Fine tessellation had exposed a steep normal
  change that folded offset shirt faces across the centre: 94 inverted central
  faces in the largest short-sleeve probe became zero. Normals follow the
  deformation's inverse-transpose Jacobian rather than an artificial outward
  lean. Edits restart from immutable rest geometry, including restoration of
  the unsculpted male chest.
- Runtime, fitted wardrobe construction and original-outfit VRM/GLB export use
  the same deterministic float32 refinement. Export writes positions, normals,
  UVs, joints, weights and indices consistently. MToon base/outline groups and
  explicit full-primitive draw ranges are updated to the refined index count;
  leaving their old counts would truncate the original tunic.
- New fitted tops use 6.3 mm front-chest allowance, fading to their existing
  9 mm collar/side allowance. Rear and tucked-shirt fit are preserved. The
  original tunic retains its authored looser fit and embossed details; no
  blanket extra allowance or original-asset rewrite is retained.

## Observable acceptance and executed checks

- The upper curve is gentler than the lower return, both boundary approaches
  tend smoothly to zero, and the centre does not split. Displacement remains
  symmetric and bounded. Surface normals are perpendicular to transformed
  tangents; repeated edits do not accumulate. Local tessellation preserves
  winding, shared interior edges, rest planes, UVs and normalized influences.
- Real front-torso triangle intersections are sampled every 1 mm, clipped to
  the central 280 mm span. Around the apex, forward/back 2 mm tangents must turn
  less than 8 degrees. Upper runs with less than 0.1 degree tangent variation
  must be shorter than 8 mm. All 18 body/original/fitted-top size cases are sampled;
  apex-specific assertions cover steps 3/6, since step 0 has no local mound
  maximum. Its full surface participates in the separate clearance checks.
- With the same measurement on the before/after round-short contours:
  step 3 apex turn **28.49 → 4.70 degrees**, step 6 **55.02 → 7.55 degrees**;
  longest upper straight run **61 → 3 mm** at both steps. The final maximum
  across body/original/four fitted tops is 7.55 degrees / 3 mm. A 720 px side
  pair and the five three-view sheets were inspected, including the corrected
  central shirt surface. These are actual 3D renders, not retouched evidence.
- The pinned body and original tunic have no inverted/collapsed sampled front
  triangles after refinement and largest sculpt. Four fitted tops × steps
  0/3/6 also have no inverted central shirt faces. Thin-detail and central-join
  protection are separate regressions, not a relaxed silhouette/fit gate.
- `npm test`: **207 passed**, including seven shape/surface regressions and
  existing avatar, wardrobe, export, replay and gameplay checks.
- `BASE_PATH=/chroma-match/ npm run build`: passed TypeScript checking, service
  worker syntax checking and production bundling. Existing >500 kB lazy-runtime
  chunk advisory remains. `git diff --check` passed. No lint script exists.
- Targeted browser command: **25 passed** in the final, uninterrupted run:

  ```sh
  npm run test:studio -- tests/studio/chest-contour.spec.ts tests/studio/chest-shape.spec.ts tests/studio/figure.spec.ts tests/studio/seat-volume.spec.ts tests/studio/wardrobe.spec.ts
  ```

- Five tops (original plus four fitted), three size steps (0/3/6), and front,
  three-quarter and side closeups were rendered and inspected. Preview/export
  comparison covered **10,199,007 attribute/index values**, with no mismatch
  under the test's 1e-7 float tolerance and exact integer comparison. Skeleton,
  full draw coverage and strict size ordering also passed.
- Fitted-top clearance passed **72 variant/size/top/gesture combinations**,
  five phases each, with **407,820 radial surface samples**. Measured clearance
  was **4.69–24.39 mm**, inside the unchanged 2–25 mm gate. Height indexing avoids
  scanning unrelated triangles without dropping any prior rays/faces. This is
  sampled posed mesh clearance, not a uniform fabric offset or a human measurement.
- Existing wardrobe rig verification passed **240 cases / 1,200 phases**.
  Its **18,420 skirt samples**, grounded footwear and shared export stance
  remained within their unchanged gates: skirt clearance **3.83–40.21 mm**, sole
  contact gap at most **7.39 mm**. Minimum rear volume, original body
  export parity, draft/Undo/cancel/Save/reload, PNG/JSON/VRM/GLB, four locales,
  three themes, 320/390/720/1280 px, keyboard and reduced-motion checks passed.
- `npm run test:release`: **5 passed** against the local production build at
  `/chroma-match/`, including wardrobe and prior guest Save/reload/offline
  flows, pinned-model/notices checks, and Paper lobby drag/focus/hierarchy.
  Production lobby, offline wardrobe editor and closeup/gesture sheets were
  also inspected. Renderer asset: `anime-renderer-KXumvX8K.js`.
- The pinned source VRM is unchanged, SHA-256:
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.

Final generated evidence is under `/tmp/chroma-chest-rounding.C8FWYZ/accepted-studio/`
and `/tmp/chroma-chest-rounding.C8FWYZ/verified-production/`. Corrected baseline
contours are under its `before-contour/` directory. The source tests recreate
the closeups, metrics and downloads; temporary files may later expire. Earlier
exploratory/interrupted/failed runs are not the accepted final verification.

## Review and limits

Direct source/visual self-review in this follow-up resolved unchanged planar
subdivision, mixed-shoulder torso exclusion, thin-tunic face inversion, curved
waist propagation, fitted-top clearance, and inverted central shirt faces.
The actual-contour regression replaces the assumption that more vertices or
a smooth scalar field alone prove a smooth silhouette. The existing broad
side-silhouette, body-axis, rear-volume and fit gates remain in place.

The fitted-top clearance gate does **not** apply to the original tunic's
authored inset/embossed details. First-pass exploratory rays at its upper-front
inset reported small skin overlaps (up to about 2.35 mm at the largest variant;
not remeasured in this follow-up).
Those source details are preserved, not claimed universally collision-free;
small authored trim/inset artifacts remain visible in its closeups. An attempted
blanket tunic allowance was rejected. No sampled penetration or central face
fold was found in the four new fitted tops under the stated final conditions.

Refined body: 25,144 vertices / 47,810 triangles; original tunic: 31,329 vertices /
58,659 triangles. Refinement is bounded and local, but its added geometry cost
has not been profiled on physical mobile GPUs. CPU-heavy diagnostic sampling
is not a measurement of the live GPU-skinned animation frame rate.

No independent human/sub-agent review, full studio-suite rerun, CI or live
verification is claimed for this change. Tests use isolated guest contexts;
signed-in cloud writes, physical phones, native Safari, third-party VRM apps,
arbitrary imported rigs/poses and cloth/jiggle simulation were not exercised.
No new UI controls, permissions, dependencies or licensed assets were added.

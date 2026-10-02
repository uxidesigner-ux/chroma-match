# Wardrobe implementation checkpoint

## Approved brief

Players choose a top, a bottom and shoes on the existing full-body anime
character, inspect it from any direction, and explicitly save the result. Keep
the existing toon shading, proportions, themes and editor rather than redesign
the game. The first original, unbranded pack has round/V neck × short/long sleeve
tops, trousers/shorts/long skirt/short skirt, and basketball shoes/dress shoes/
heels. Existing saved appearances keep their original clothing until edited.

The character remains the dominant preview. One Wardrobe category contains
labelled top/bottom/shoe choices, each with independent colour; native controls
use the existing tokens, keyboard focus and 44 px targets. Selection is a draft:
undo, cancellation, saved looks, backup and explicit Save retain their meaning.
No new external asset, upload, account schema or production dependency is needed.

## Acceptance gate

- New clothes are actual skinned geometry, not rigid attachments to moving limbs.
- Cloth and covered skin use compatible weights; exposed necklines, sleeve ends,
  hems and shoes have deliberate transitions without holes or visible overlap.
- Female/male variants, four body presets and axis extremes remain supported.
- Rest, breathing, wave, cheer and pose follow the existing anatomical rig.
- Heel stance is grounded and applies equally in preview, lobby and exports.
- Previous appearance codes preserve their look; new codes stay inside the
  existing 80-character profile limit and reject unknown part identifiers.
- Save/reload, undo/redo, cancel, JSON restore, PNG and VRM/GLB agree with preview.
- Check narrow mobile, tablet/desktop, supported themes/locales, keyboard,
  reduced motion, console/network errors and renderer resource cleanup.

## Evidence and limitations

Local implementation and verification completed on 2026-10-02, branch
`codex/avatar-wardrobe`, starting from `8abe5ac`. No remote push, merge, CI run
or live deployment has been performed for this pack.

### Implementation

- `wardrobe.ts` builds real surfaces from the pinned licensed body/arm underlay,
  interpolates up to four bone influences at cut boundaries, makes finished
  collars/cuffs/hems, and uses the same cuts to hide covered skin. The skirt
  waist samples the actual body surface; lower panels blend hip/leg influences.
- `wardrobe-rig.ts` binds these meshes to the existing body's exact skeleton
  and inverses. Material maps from the retired tunic are not reused for new
  garments. Skin retains warm toon shadows and clothes retain the anime style.
- Footwear is authored against the actual rig, not assumed joint axes. SDK
  normalized-to-raw conversion is shared with export, heels counter-rotate the
  toes, and sole/heel support is fitted after body scaling. Barefoot contour
  compensates for the rotated, nonuniform hip chain without changing old looks.
- `studio-export.ts` writes the same surfaces, weights, palettes and stance into
  VRM/GLB while preserving original author, permissions, humanoid and expressions.
- An 8th Wardrobe tab has three semantic fieldsets and independent colours.
  Native keyboard controls, selected states, focus, 44 px targets and draft-only
  edits remain. At 320 px, captions use the existing 12 px token and reduced
  inline padding; measured English captions remain on one line. No new dependency.
- Selecting the first new piece switches the monolithic original outfit to the
  fitted set (round short-sleeve top, trousers, sneakers as initial counterparts).
  Subsequent choices affect only their slot. Original outfit restores the whole
  original set, and Undo restores all draft choices. Explicit Save is unchanged.
- Old 41-character appearances keep their encoding and look. New v7 codes are
  57 alphanumeric characters, inside the existing 80-character profile rule.
  Palettes reuse geometry; body-scale edits refit contact without rebuilding
  the entire tailored cloth. Each source's caches are bounded.

### Executed checks

- `npm test`: **194 passed**, including all 64 top/bottom/footwear combinations
  (48 with shoes plus 16 barefoot), code/backup round trips, finite normalized
  weights, retained hands, immutable source and exact exported attributes.
- `npm run typecheck` and `BASE_PATH=/chroma-match/ npm run build`: passed.
  Vite's >500 kB chunk advisory remains; the VRM/Three runtime is still lazy-loaded.
- Full `npm run test:studio -- --workers=2`: **76 passed, 2 failed**. One test
  still expected 7 tabs; the other exposed wrapping of long English labels at
  320 px. Both were corrected. A final focused run of wardrobe plus the affected
  existing editor test: **8 passed**, covering both failures and all new paths.
  Together these runs cover the 78 distinct studio scenarios; a second complete
  78-test run after the final narrow-screen CSS adjustment was not repeated.
- Real rig check: **240 body/outfit/gesture cases**, five sampled phases each
  (1,200 samples), two figure variants, four presets plus four extreme/mixed
  builds, wave/cheer/pose, sneakers/dress shoes/heels/barefoot. Shared skeleton,
  raw export stance and forward elbow hinges checked. Lowest support was
  -0.00077 m; maximum measured support gap 0.0074 m (including barefoot contour
  and weight shift), within the test's stated 7/8 mm limits. This is not a claim
  of exact zero physical error or universal collision-free motion.
- Save/reload, cancel, Undo, independent colours, JSON restore, 4-view PNG and
  both VRM/GLB downloads/reloads passed. Four locales, three themes, 320/390/
  720/1280 px, keyboard focus and reduced-motion stillness were exercised.
- Final `npm run test:release`: **5 passed** against the local production build
  at `/chroma-match/`, including v7 save/reload/offline recovery, prior guest
  flows, pinned model checksum, notices and Paper pointer/keyboard behaviour.
- `git diff --check` passed. Bundled `seed-san.vrm` remains unchanged with SHA256
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.

The final focused artifacts are in `/tmp/chroma-wardrobe-final-ui/`: a
`wardrobe-fit-gestures.png` contact sheet, `wardrobe-four-views.png`, model
downloads, localized UI screenshots and `wardrobe-fit-results.json`.
Production smoke screenshots are in `test-results/release/`. These are generated
outputs, not canonical sources; repeat the commands above to regenerate them.

### Review and remaining limits

Source and actual rendered screenshots were reviewed and refined. Initial
outline/shading defects, A-pose versus T-pose bindings, hand masking, waist
intersections, heel export stance, body-dependent contact and narrow-screen
caption wrapping were resolved. No independent human/sub-agent review or user
research is claimed.

Tests used isolated guest contexts and blocked Firebase requests. Signed-in
cloud profile writes, physical iPhone/Galaxy GPU/touch behaviour, native Safari,
and third-party VRM applications were not exercised. Existing account schema and
rules were not modified. CI and actual live verification remain deployment gates.

This is a fitted, rigged game wardrobe, not a real-time cloth simulator. Exact
Nike/Jordan products, logos and brand names are excluded. No claim of universal
collision-free compatibility with arbitrary poses or imported models is made.

## Tailoring refinement — 2026-10-02

### User problem and selected solution

The user requested more believable formal shoes and skirts that feel seated
against the body, rather than suspended around it. Keep the existing anime
materials, choices, gestures, draft/save flow and appearance encoding. This is
a geometry refinement, not a new editing mode or garment catalogue.

Inspection of actual close-ups confirmed that dress shoes reused a sneaker-like
oval and thick light outsole. The skirt had a 20 mm normal-offset waist and
quickly blended out to a large flaring ellipse. Hands in the A-pose also cross
waist height in the same source primitive; fitting must explicitly exclude them.

- **Skirts:** true horizontal torso sections through waist/seat, with body
  influences at fitted points and dense waist rows. The outer waist is 12 mm
  from skin (9 mm shirt thickness plus 3 mm clearance), reducing to 5.5 mm over
  bare hips. A radial offset avoids tangential sliding across mesh seams. The
  skirt is a slim silhouette with a small movement allowance below the seat,
  rather than a uniformly flaring cone. Long/short lengths remain unchanged.
- **Formal shoes:** separate almond-toe lasts, narrower collars/heel counters,
  instep lacing on dress shoes, thin colour-matched outsoles, arch clearance and
  a tapered heel. The sole underside is made of ruled strips, not a low central
  fan that visually fills the arch with a hanging wedge. Sneakers retain their
  own last/palette; only fitted lace strips and the underside construction are
  shared.
- **Motion:** new toe support is fitted in the actual scaled/posed foot matrix.
  Initial extreme-figure checks exposed a sinking forefoot; fitting the upper
  and replacing the low underside fan resolved it. Skin masking is in the same
  neutral-to-bind space as the pump, with concealed overlap below its curved
  opening so the foot cannot emerge through the thin sole. Rig/export still
  consume the same generated surfaces, weights, palette and raw heel stance.
- **Compatibility:** earlier appearance codes, selected colours, library/backup
  files and the licensed source asset are unchanged. Saved v7 outfits receive
  the refined geometry when rendered; no re-selection or new schema is needed.

### Refinement verification

Final frozen-source results (the original implementation evidence above remains
historical):

- `npm test`: **196 passed**. New regression coverage measures 65 points on
  each of eight waist/hip sections, for both skirt lengths (1,040 samples):
  radial skin clearance stays between 5.4 and 12.1 mm including float tolerance,
  without arm influences. It also checks formal toe/collar dimensions and the
  colour-matched sole. Existing 64 outfit combinations and exact exported
  geometry/weights still pass.
- `npm run typecheck` and `BASE_PATH=/chroma-match/ npm run build`: passed.
  Only the existing Vite large-chunk advisory remains; no dependency changed.
- `npm run test:studio -- tests/studio/wardrobe.spec.ts`: **8 passed**. Includes
  draft/Undo/cancel, save/reload/lobby/profile, PNG/backup and VRM/GLB download
  reloads, and keyboard/reduced motion in four locales and three themes at
  320/390/720/1280 px. Page-error checks in UI/export flows remained empty.
- The real rig test in that run covers **240 body/outfit/gesture cases / 1,200
  sampled phases**. No separate skeletons, raw export-stance mismatches or hinge
  errors; lowest support -0.000779 m, maximum contact gap 0.007390 m, within the
  existing 7/8 mm tolerance. This is not an exact-zero or universal collision
  claim.
- `npm run test:release`: **5 passed** on the final local production build,
  including wardrobe save/reload/offline recovery and prior guest/Paper flows.
  Final renderer asset: `anime-renderer-BuJU16ER.js`.
- `git diff --check` passed. The pinned model checksum remains the same.

Actual rendered close-ups, gesture contact sheet, four-view PNG, downloaded
models and fit JSON are in `/tmp/chroma-wardrobe-tailoring-final/`. Source and
before/after renders were reviewed; the initial forefoot-contact failure and
pump skin-mask refinement were resolved before the frozen-source pass. No
independent sub-agent/human review is claimed. All earlier physical-device,
native Safari, signed-in cloud-write, third-party VRM and cloth-physics limits
still apply. No push, merge, CI or live deployment was performed for this change.

### Live-release gate — 2026-10-02

The preceding no-deployment statement is the local refinement checkpoint. The
publication is tracked by [PR #60](https://github.com/uxidesigner-ux/chroma-match/pull/60).
Its first full CI run, `36999871440` at `9471cf8`, passed 78 browser checks but
failed the 320px English/Paper caption check; it did not merge or deploy.

Equal-width tab tracks fitted the macOS font but wrapped wider fallback fonts.
The failure was reproduced locally with Verdana (`Equipment`) and monospace
(`Expression`). Narrow screens now allocate tracks from real caption widths,
without smaller type, truncation, hidden tabs or another navigation row. The
regression check keeps its one-line requirement and additionally checks ink
inside the button, two tab rows, 44px targets and viewport containment for four
font families. All four locale/viewport wardrobe-control checks passed after
the correction, as did typecheck, all 196 unit tests and the production build.
The actual 320px render was inspected. Supporting results are in
`/tmp/chroma-wardrobe-live.WKP15f/`. Publication still requires a successful
full CI run, the main Pages deployment, exact artifact/live parity and live
guest save/reload/offline recovery; follow the PR for the final release proof.

## Body-fit skirts — 2026-10-02

### Brief, decision and acceptance

The user requested body-following skirts/miniskirts, with women's fashion as
an optional direction. Actual front/side/back views showed that the seated waist
was already fitted, but a maximum-hip radius was carried down the lower skirt,
making the mini flare and the long skirt look like a suspended cylinder.

Refine the existing two choices, not the editor, garment catalogue or saved
format. The mini follows waist/seat/upper thighs with a restrained, tapered hem.
The long skirt has the same fitted upper section and a smooth pencil panel below
the thigh: it must not trace separate knees/calves or turn into leggings. Recent
[Miu Miu FW26 collection notes](https://www.pradagroup.com/content/dam/pradagroup/documents/2026/Marzo/Inglese/Miu-Miu-FW26-fashion-show-PR.pdf)
describe clothing drawn close to the body. This is one contemporary reference,
not evidence that all women's fashion follows one trend; no branded design,
logo, texture or asset is copied.

- Keep the seated waist's shirt clearance and bare-hip fit unchanged.
- Below the seat, take horizontal sections of the actual body, exclude arm/hand
  influences, and bridge both legs into one convex garment outline. Use the
  sampled body weights, rather than mostly hip weights over the entire hem.
- Give the mini 8 mm radial allowance at its lower section. The long skirt uses
  a ruled pencil envelope which encloses the sampled legs, with convex hem
  fairing and 4 mm extra hem allowance. Finished hems are 4 mm thick; recompute
  normals before making the binding, retaining the existing toon material.
- Both hems must be narrower and shallower than the seat. Every tested lower
  body section must have at least 2 mm perpendicular polygon clearance. The
  long lower panel must remain within 0.41 mm of its ruled radius profile.
- Verify actual posed skirt-to-body clearance on male/female presets and axis
  extremes, after explicitly updating the skeleton's CPU bone matrices. Include
  waist, seat and hem, three gestures and five phases, plus front/side/back
  renders that include the hem (the previous close-up only showed the waist).
- Preserve colours, length choices, v7 codes, independent top/shoe choices,
  draft/Undo/cancel/Save, lobby/profile, PNG/backup and exact VRM/GLB parity.
  No new controls, UI states, animation, dependencies, permissions or asset edits
  are needed. Existing responsive, locale, theme and reduced-motion paths remain
  regression gates. Cloth simulation and arbitrary new poses remain excluded.

### Verification checkpoint

Implementation is on local branch `codex/fitted-skirt-silhouette`, based on the
previous live release `e44aae7`. New regression coverage checks joined lower
sections, seat-to-hem taper and a smooth pencil profile. Render/measurement
artifacts are under `/tmp/chroma-skirt-fit.tUDvUi/`. This section records the
local refinement; it does not publish another release.

- `npm test`: **197 passed**, including the new joined-section/taper/pencil
  regression, retained waist clearance, all 64 outfit combinations and exact
  exported geometry/weights. `npm run typecheck` and
  `BASE_PATH=/chroma-match/ npm run build` passed; only the existing large-chunk
  advisory remains. `git diff --check` passed, and the pinned VRM checksum is
  unchanged.
- `npm run test:studio -- tests/studio/wardrobe.spec.ts`: **8 passed**. Draft,
  Undo/cancel, Save/reload, lobby/profile, PNG/JSON/VRM/GLB downloads and reloads,
  four locales, three themes, 320/390/720/1280 px, keyboard and reduced-motion
  checks passed. Actual waist-to-hem close-ups, gesture sheet, lobby/editor
  screenshots and downloaded four-view sheet were visually reviewed.
- The real-rig check covers **240 cases / 1,200 phases**, including **18,420
  posed skirt/body ray samples**. Measured radial clearances were **3.83–37.77
  mm**; larger values include the joined front/back panels between two legs,
  not a claim of a uniform normal offset. There were no sampled penetrations,
  separate skeletons or export-stance/hinge mismatches. Sole support remains
  within its prior 7/8 mm tolerances. A final targeted rerun also passed after
  tightening the minimum posed skirt-clearance assertion to **2 mm**.
- `npm run test:release`: **5 passed** on the local production build, including
  wardrobe save/reload/offline recovery and prior guest/Paper flows. This is
  not a test of the deployed URL. Renderer asset: `anime-renderer-Dwd3qHOo.js`.

Review resolved the initial long skirt's knee/calf ripples and an inward corner
at its hem by using a convex, ruled pencil panel. The new CPU fit test also
exposed stale `boneMatrices` when inspecting vertices before a render; it now
updates the shared skeleton explicitly before every sampled phase. This was a
measurement-harness issue, not an added production animation workaround.

No independent sub-agent/human review, full 79-test studio rerun, CI, push or
live deployment was performed for this refinement. Tests use isolated guest
contexts with Firebase blocked. Physical phones/native Safari, signed-in cloud
writes, third-party VRM apps, cloth physics and arbitrary poses remain outside
the verified scope. The previous live release is unchanged.

## Rounded minimum-hip foundation — 2026-10-02

### Brief, decision and acceptance

The user reported a rear silhouette that was too flat even at the minimum hip
size. The existing hip axis scales the whole pelvis in width/depth, so reducing
that axis also reduces the already shallow rear of the licensed starter. Keep
the slider's 0–6 values and existing 0.74–1.26 scale rather than widening the
whole pelvis or adding a new control.

Add a restrained, symmetric rear-only foundation with at most 32 mm bind-space
displacement. Its field fades smoothly into the waist, sides and upper thighs;
it does not move the front, x/y positions, head, height or leg length. The same
field applies to both character variants before bone scaling, so minimum,
default and maximum hips remain distinct. Hands overlapping hip height are
excluded by their actual arm/finger influences. Source weights remain intact;
normals follow the deformation Jacobian instead of retaining flat highlights.

- Reapply from immutable rest geometry: repeated edits and switching character
  variants must not accumulate volume or retain the other variant's chest.
- The original outfit, fitted trousers/shorts, and short/long skirts must fit
  the newly shaped body, with the same skeleton and export surfaces. Skirt
  cross-sections must be sampled after sculpting, not from the flatter source.
- Keep the existing tapered mini and smooth pencil panel. Preserve prior body
  clearance, all 64 outfit combinations, colours, independent axes, draft,
  Undo/cancel, Save/reload, PNG/backup and VRM/GLB metadata/geometry parity.
- Inspect minimum hips in side/rear/three-quarter views in four fitted bottoms,
  and compare the mini at minimum/default/maximum. Check both variants, the
  original outfit and actual posed skirt/body clearance during existing gestures.
- Saved codes and schema stay unchanged. This requested visual baseline
  refinement deliberately affects previously saved looks too; it is not a new
  licensed asset or an arbitrary-model anatomy editor. No new UI state,
  permission, dependency, cloth simulation or animation is introduced.

Visual self-review found the newly shaped shirt's concealed rear binding poking
through the skirt waistband at larger hip values. Only the tucked overlap now
tapers from 9 to 2 mm below the visible shirt; the upper shirt's allowance is
unchanged. The corrected side/rear sheets no longer show that overlap. No skirt
clearance tolerance was weakened to conceal the issue.

### Verification checkpoint

This is a local refinement on `codex/fitted-skirt-silhouette`, following local
skirt commit `44b785b`. Artifacts are under `/tmp/chroma-seat-volume.U3QZUy/`.
It does not publish a new release; verification results are recorded below.

- `npm test`: **200 passed**, including three new bounded-field, source
  immutability/idempotence and normal-direction regressions. Existing skirt
  tests now measure against the shaped body, rather than the flatter original.
  Export tests require the new rear in both variants while retaining the
  female-only chest and the palette's actual image accessor association.
- `npm run typecheck`, `BASE_PATH=/chroma-match/ npm run build`, and
  `git diff --check` passed. The existing large-chunk advisory remains. The
  pinned VRM SHA-256 remains
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.
- `npm run test:release`: **5 passed** against the local production build,
  including wardrobe Save/reload/offline recovery, guest flows and Paper lobby
  drag/focus/hierarchy. Renderer asset: `anime-renderer-B51KbTWv.js`. The local
  production lobby and offline wardrobe editor screenshots were inspected.
- The new real-rig rear-volume check passed **30 cases**: both variants,
  minimum/default/maximum hips and original/mini/long/shorts/trousers. At the
  measured rear landmark the foundation adds **22.35 / 30.02 / 37.22 mm** at
  hip steps 0/3/6, respectively. These are posed model-space measurements, not
  human anthropometry. All three steps remain strictly ordered. **10,520 body
  vertices** across both minimum-hip original-outfit exports match the actual
  preview within 0.1 micrometre; x/y values remain unchanged in the rear field.
- The existing real-rig gesture test passed **240 cases / 1,200 phases**,
  including **18,420 posed skirt/body samples**. Radial clearance is
  **3.83–40.21 mm**, with zero sampled penetrations or skeleton/stance mismatches.
  Larger clearances include joined panels between legs, not a uniform offset.
  Side/rear/three-quarter minimum-hip, waist-to-hem, gesture, saved lobby and
  downloaded four-view sheets were visually reviewed, retaining the existing
  anime/toon tone under the impeccable visual-fit review criteria.
- Targeted `test:studio` run over `figure.spec.ts`, `seat-volume.spec.ts` and
  `wardrobe.spec.ts`: **22 passed**. This includes independent body-axis/chest/
  hair checks, draft/Undo/cancel/Save/reload, PNG/JSON/VRM/GLB, four locales,
  three themes, 320/390/720/1280 px, keyboard and reduced-motion controls.

Review was performed directly, not by an independent sub-agent/human. No full
studio-suite rerun, CI, push or live deployment is claimed. Tests use isolated
guest contexts with Firebase blocked; signed-in cloud writes, physical phones,
native Safari, third-party VRM apps, cloth physics and arbitrary poses remain
outside the verified scope. The previous live release is unchanged.

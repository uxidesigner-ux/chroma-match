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

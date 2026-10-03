# Short hair, figure-balanced footwear and clean hand checkpoint

## Approved task and acceptance

Add short taper and side-part pomade in the existing anime character editor.
Balance footwear to the figure and remove the left cyan finger paint. No game
redesign, external model, production dependency, account mutation or live
deployment is part of this task. Work starts at `16db575d6c71a625496ed52cc2b5039924b07501`
on `codex/short-hair-footwear`.

- Five labelled hairstyle choices, native keyboard operation and selected state.
- Both new cuts expose the forehead/eyes, fit head steps 0/3/6 on both sexes,
  follow the existing head rig, and restore the authored hair when switched back.
- Preserve T/B/L codes, old profiles and other customization. F/P round-trip in
  current bounded profile/JSON formats; only explicit Save changes the profile.
- Shoes scale their last modestly, not the ankle opening or leg bones. Both
  sexes use the same rule. Soles/heels remain grounded across body extremes.
- Remove only the cyan finger atlas island, preserve face/other hand/glove and
  skin shading, and export the same cleaned texture and skin tint without
  multiplying the tint a second time.
- Preview, portrait, reload, undo, cancellation, VRM/GLB and colour changes agree.

## Implementation decisions

`hair-strands.ts` adds fitted closed short scalps and rounded combed pomade
locks, combined into one mesh/material. Roots/tips enter the cap and each lock
follows lateral scalp curvature, avoiding disconnected tufts or a flat brush.
Short taper / pomade use 2,342 / 3,990 vertices. Neutral 512×512 carrier textures
retain bright selected pigments; the three cached procedural maps are bounded
and disposed with the character. These are stylized anime cuts, not simulated
individual hairs or a photorealistic skin-fade shader.

The source crown, fringe, tie and ponytail are hidden for the new cuts in both
runtime and export; old cuts restore them. No changes are written into the
pinned licensed VRM. No new controls replace existing editor patterns. Four
locales provide the new labels, and existing thumbnail/draft/history logic is
reused (impeccable product UI guidance).

`shoeBalance` blends shoulder/hip/chest/head steps into last-width ±12% and
length ±9%. Default build remains exactly 1×. The ankle opening and heel height
remain fitted to the source; upper/sole/lacing/heel stem share the same last,
and final contact is fitted against actual posed/scaled bone matrices.

The cyan area was measured in the original 1024×1024 skin atlas: x824–990,
y9–133, 17,611 cyan pixels. `cleanHandPixels` is confined to that atlas island,
preserving alpha, warm skin elsewhere, other hand and dark glove details. Both
skin materials use owned cleaned canvases, and exports append those same PNGs.
Existing maps still referenced by unchanged materials are not prematurely
disposed. Portrait frame 7 regenerates derived images without changing codes.

## Validation record

Local implementation and targeted validation completed on 2026-10-04.
No remote push, PR, CI dispatch or live deployment was performed.

- `npm run typecheck`: passed.
- `npm test`: **220 passed**, no failures/skips. Includes five hairstyle
  round-trips, source immutability, finite normals/UVs, exact exported geometry,
  cyan-island-only pixel edits and single-application skin tint, plus the
  existing 64 fitted wardrobe combinations and gameplay rules.
- `BASE_PATH=/chroma-match/ npm run build`: passed, 124 modules. The existing
  large-chunk advisory remains; no production dependency was added.
- Studio checks cover **14 unique targeted tests** across runs: all 12 existing
  hair-colour/crown-join/wardrobe cases, plus 2 new short-hair/footwear cases.
  The first desktop colour-picker run was interrupted by source-edit HMR; the
  complete colour/short-hair subset passed against stable source afterward.
- The existing **7 production release checks passed**, followed by the added
  **1 production short-hair check**, using the Pages build. Includes save/reload,
  offline editor/portrait recovery, Paper rotation/focus, pinned assets/license
  notices and the real gameplay/fold regression.
- Both cuts × head 0/3/6 × both sexes: all **696 / 696** sampled upper-scalp
  points are enclosed, both iris-centre rays stay unobscured, original crown /
  fringe / tail are hidden, and the new mesh stays attached through a wave.
  Switching back restores the source hair. Live texture samples contain no cyan
  pixels; export appends the cleaned skin maps.
- Sneaker/dress/heel × body step 0/3/6: all nine sole bounds remain within
  floating-point tolerance of **2 mm above ground**; uppers stay above ground.
  Existing full-rig checks also passed rest/breathing/wave/cheer/pose, body
  presets/extremes, skirts, hands and shoe contact.
- Mobile 390 px new-style keyboard selection, undo, draft isolation, save /
  reload, frame-7 portraits and no horizontal overflow passed. Existing wardrobe
  checks passed en/paper 320 px, ko/jewel 390 px, ja/glass 720 px and zh/paper
  1280 px with keyboard/reduced motion. These are browser emulations.
- The pinned VRM SHA-256 remains
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.
- `git diff --check`: passed. The user's existing dev server (PID 11397,
  port 5174) was reused and preserved; owned production preview servers exited.

Reproducible source checks are in `tests/studio/short-hair-footwear.spec.ts` and
`tests/release/short-hair-footwear.spec.ts`. Local screenshots/fit metrics are
under `/tmp/chroma-short-review.vNRL3d/stable-source`, production evidence under
`final-production` and `short-production` in that same directory. The initial
root-base production attempt was rejected (Pages requires `/chroma-match/`),
and a stale v6 test expectation was updated to the actual v7 image-cache URL;
the corrected final checks passed. Rejected prototype images are not final.

Visual review rejected the first shared-cap design (styles too similar), an
over-raised pomade (scalp clipping), and parallel high combed locks (flat-brush
silhouette / exposed ends). The final design keeps a fitted scalp underneath
rounded combed volume and bends each lock around its actual lateral section.

The verification contexts are isolated guests with Firebase requests aborted.
The entire studio suite was not rerun; validation targeted affected behaviour
and existing wardrobe/gameplay regression paths. Real iOS/Android/Safari hardware and
strand/cloth collision physics are outside this checkpoint. No separate reviewer
agent is available; source review and actual screenshot review are performed
directly. The shared experience playbook was not found in the workspace or
ancestor locations; repository PRODUCT and existing acceptance tests are used.

## Live release follow-up — 2026-10-04

The user subsequently requested live publication. Commit `909f657` was
fast-forwarded to main without changing other history. CI run `37134602862`
passed type checking and 220 unit tests, then 117 of 118 studio cases; Pages
publication was correctly skipped when the legacy toolkit export assertion
expected 19 images instead of the now-required 21. The two extra images are
the cleaned `body_bake` / `body_nm` skin palettes, not an export regression.

The toolkit assertion now derives the count from the pinned source plus the
six expected painted materials, preserves every original image descriptor,
requires distinct appended PNGs for each palette, and reloads both VRM / GLB
to verify cleaned finger pixels alongside the existing rig, permissions,
hair geometry and colour checks. No production source or workflow gate changed.
All five toolkit browser checks, type checking and `git diff --check` passed
locally before resubmission. The complete CI and actual-live checks remain
required; this follow-up does not claim successful publication.

Release evidence is preserved under `/tmp/chroma-short-release.X8c3Lv`:
failed CI log/artifacts, the targeted toolkit rerun, a Pages build snapshot,
and an isolated persistent guest browser prepared on the old live version
to verify saved-avatar preservation and frame-6 to frame-7 portrait recovery.

# Continuous crown-to-curtain join — 2026-10-03

## Observed problem and scoped fix

The supplied side-view image marks the transition between the licensed crown
and the generated long-hair curtain. Reproduced under the production lights:
the original crown reaches about 0.248 m in raw head space, but the generated
shell started at 0.170 m. Crown outlines and the curtain's separate, lower
strand roots make the join visibly discontinuous. This is implementation
evidence, not a usability-study result or a perceptual-quality score.

Bob and long now use one closed C-section extending to 0.2598 m, with a rounded
elliptic crown blending smoothly into a gravity-led lower cut. The initial
join pass had a neck pinch where the rounded crown shrank toward the previous
curtain before widening again; the user's second marked image identified it.
The revised profile takes its widest-crown pivot at 0.135 m. Below it, the side
width and rear depth never decrease: a horizontal tangent leads to a very
gentle outward fall, with existing face-framing and gear clearance preserved.
Geometric grooves keep a constant depth below the pivot rather than adding
another inward/outward oscillation. Twelve denser
crown rows join twelve lower rows. A single monotonic root-to-tip UV coordinate
follows the whole surface; no new texture or line geometry is introduced.
The old rear crown/outline lies inside the new surface, so its rim cannot make
a second seam. The original forelock, eye/face geometry and ponytail remain
unchanged. The source VRM bytes and asset permissions are unchanged.

## Acceptance and compatibility

- Front, side and rear views must show a continuous crown/curtain silhouette.
- Adjacent sampled contour segments turn less than 20 degrees; neither UV nor
  surface rows collapse/restart at the former overlap.
- Below the widest crown, every outer side column must keep its width and the
  rear contour must keep its depth, including the backpack-clearance variant.
  This prevents replacing the old seam with an inward neck waist.
- The actual model's original rear crown/outline must be covered at minimum,
  normal and maximum head sizes, while both eyes remain visible.
- Visible iris pixels are compared at the same pose with/without the new shell.
  Referenced eye-primitive vertices bound the search region; within it, the
  actual lit purple iris pixels are counted, excluding dark blue background.
  glTF primitives may share a position accessor, so unused head vertices do not
  define the search region.
- White and bright selected colours, draft/save/reload, head attachment,
  gestures, original ponytail and VRM/GLB parity must remain intact.
- Appearance codes and selected values do not change. Derived portrait revision
  6 regenerates revision-5 images. The unchanged default ponytail portrait also
  uses the render-versioned URL; no unrelated cache/profile clearing occurs.

The shell has 3,250 vertices / 6,496 triangles versus 1,690 / 3,376 previously.
This is a bounded mesh-density increase, not free performance. It retains one
mesh and the same 512x512 shared texture/material, with no added draw calls,
dependencies or per-frame generation. Palette edits still reuse the geometry.
Rig and hair physics/collision behavior are not changed.

## Reproducible evidence and checkpoint

`src/avatar/hair-strands.test.ts` checks closed manifold topology, symmetric
finite geometry, normalized outward normals, rounded contour turns, continuous
UVs, deterministic white-carrier detail and gear clearance.
`tests/studio/hair-join.spec.ts` records front/side/back views, tests original
rear-crown coverage and eye visibility across six cut/head-size combinations,
and compares exported positions/normals/UVs exactly with the preview arrays.
Existing colour, gesture, mobile, save/reload and production tests cover related
paths. Temporary evidence is in `/tmp/chroma-hair-join.oksqV1`.

Final candidate checks completed on 2026-10-03:

- `npm test`: 215 passed, zero failures/skips (69.4 seconds).
- `BASE_PATH=/chroma-match/ npm run build`: passed, including TypeScript and
  service-worker syntax checks. The existing large-chunk advisory remains.
- Focused studio run: 10 passed (3.8 minutes), covering hair join/detail/colour,
  gestures, mobile Paper rotation and bob/long save/reload.
- Portrait regeneration and VRM/GLB re-import: 2 passed (1.3 minutes).
- `npm run test:release`: 7 passed against the local production build
  (2.3 minutes), including offline recovery, versioned portrait cache, keyboard
  focus, Paper rotation and game/fold-layout stability.
- `git diff --check`: passed.

The six cut/head-size cases each covered all 190 sampled original rear-crown
points. Both cuts retained 100% of the sampled visible iris pixels at normal
head size; minimum/maximum sizes passed the ray-based visibility gate. Exported
position, normal and UV arrays matched the preview exactly. Direct visual
review checked front/side/back sheets, enlarged long-hair side/back views,
mobile Paper back views and the reloaded bright-yellow profile. Impeccable's
existing-product review criteria guided preservation of the original visual
tone instead of a broader character or interface redesign.

Reproduce the two browser runs against the configured local dev server:

```sh
npm run test:studio -- tests/studio/hair-join.spec.ts tests/studio/hair-detail.spec.ts tests/studio/hair-colour.spec.ts tests/studio/avatar-anatomy.spec.ts
npm run test:studio -- tests/studio/toolkit.spec.ts tests/studio/experience.spec.ts --grep 'VRM and GLB exports|a pre-fix portrait cache'
```

Second-pass source/test review caught one release assertion still requesting
portrait revision 5; it was aligned with revision 6 before the passing release
run. The symmetry fixture applies the same signed-zero quantization to both
point sets, without changing its existing tolerance. No new controls, unrelated
game behavior, runtime dependencies or authored asset bytes were changed.
This is direct review, not an independent-agent or user-study result.

Source checkpoint: local branch `codex/hair-root-transition`, based on
`dbca981bf2bceb8e4e03c8ac743fd9758fb8b478`, with implementation changes in the
working tree. The built entry is `index-CR2TDZLK.js`, with renderer
`anime-renderer-0cR3yria.js`. No push, PR or live deployment is included in this
implementation request.

### Pre-release coverage correction

After the local checkpoint, the user explicitly requested live deployment.
Pre-release review found that the join fixture sampled head values 0/2/4,
although the actual figure axis spans 0 through 6 and defaults to 3. The fixture
now checks 0/3/6 for both cuts and captures the default-3 views. The corrected
test passed (11.6 seconds): all six cases covered 190/190 rear-crown samples and
matched preview/export geometry, while both default-3 views retained 100% of
visible iris pixels. Geometry, shaders, appearance codes and production assets
are unchanged by this test-only correction. Evidence is in
`/tmp/chroma-hair-release.VhJ3sr/head-extremes`.

Existing full CI and Pages gates remain intact. A release is not complete until
the latest main commit passes them and the deployed hashes/runtime are checked;
the local checkpoints above do not themselves establish live deployment.

## Limits

The full studio suite was not rerun for this scoped geometry change.
Runtime checks use isolated Chromium/SwiftShader guest contexts with cloud
requests blocked. Physical iPhone/Android, Safari/Firefox, real-GPU performance,
calibrated displays and arbitrary third-party VRM viewers are not verified.
Rigid-head hair follows the existing rig; strand/collision simulation remains
out of scope. `docs/hair-detail.md` records the previous revision-5 detail pass,
whose unchanged-geometry statement predates this crown-join refinement.

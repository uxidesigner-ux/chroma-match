# Natural hair strand detail — 2026-10-03

## Request and decision

The supplied phone image shows a nearly uniform white bob back, with fine lines
on the crown/fringe but almost none on the added curtain. Reproduced on the
actual model: under the production lights the white back's 95th-to-2nd-percentile
interior red-channel contrast was 7 for bob and 5 for long hair. This metric is a
regression signal, not user research or a perceptual-quality score.

Keep the licensed crown, fringe and original ponytail; refine the generated
bob/long side/back surfaces with their shared original UV map. Uneven soft clumps
and 18 sparse curved separations use different widths, spacing, lengths and
tapered/faded starts and ends. Avoid black full-length stripes and floating line
geometry. The seed is deterministic: reload/exports never randomize the cut.

The 512×512 opaque grayscale map stays predominantly near-white. Observed mean
is 244.67/255; 94.33% of texels remain at least 232; 4.83% are below 220, confined
to separation detail. Selected white/yellow/magenta/blue retains its hue and
brightness. This deliberately permits darker small cores than the previous
all-near-white map, rather than darkening the entire pigment carrier.

## Compatibility and resource bounds

- Geometry, UV layout, head attachment, rig, gestures and authored asset bytes
  are unchanged. Lines are part of the surface texture, not separately placed
  objects. No added draw calls, per-frame texture generation or dependencies.
- One shared texture per character is reused when changing cut/colour. The
  generation path is bounded; fine detail uses the existing filtered mipmaps.
- VRM/GLB gets the exact same generated PNG and palette as the preview.
- Appearance codes and selected colours stay unchanged. Derived portrait
  revision 5 regenerates older images; the existing bundled starter image is
  unchanged because its original ponytail rendering did not change. Its
  versioned URL advances with the cache revision without clearing other caches.
- No strand physics or new hair/body collision behavior is introduced.

## Evidence

`tests/studio/hair-detail.spec.ts` records white front/side/back views and renders
the actual back hair under the production lights. The accepted contrasts are
18 (bob) and 39 (long), versus 7/5 before; root/tip, nonuniform-line and bounded
white-carrier unit gates prevent replacing the issue with a regular stripe comb
or noisy gray fill. A diagnostic-only unit assertion initially exceeded the
argument limit when spreading the larger map; reduction now handles it safely.
The first visible-detail pass was also refined because bob contrast was only 13.

The same test verifies head world matrices and fixed UV/map identity through
wave/cheer/pose phases, and records both white cuts in a 390×844 Paper lobby after
a real pointer drag to the back. Existing colour tests cover three cuts × four
colours, ten preview/export PNG comparisons, exact selected factors and unchanged
other materials. Desktop/mobile picker tests retain Undo/Redo, keyboard focus,
draft isolation, save/reload and migration from revision 4 with unchanged codes.

Temporary reproducible evidence is under `/tmp/chroma-hair-detail.OUTXun`:
`before`, `after` (initial detail pass), `colour-detail` (accepted pass),
`mobile-paper`, `regressions`, and `production`. The committed tests recreate it.

## Verification checkpoint

- Type check, all 213 unit tests, production build and `git diff --check` passed.
- The colour/detail group passed 4/4; mobile Paper back-view checks passed 2/2.
- The six gesture/save/cache/export regressions passed 6/6, including the
  detail test repeated with world-matrix checks at all gesture phases. Across
  these three groups, 11 distinct targeted studio tests passed.
- All seven local-production checks passed, including regenerated portraits,
  stale starter-image caches, offline editor recovery and unchanged gameplay.
- No push, PR, hosted CI or live deployment is included in this change.

## Limits

Evidence uses isolated Chromium/SwiftShader guests with cloud requests blocked.
The complete studio suite, native Safari/Firefox, physical phones, calibrated
displays, real-GPU frame timing and third-party VRM viewers were not tested.
Fine lines are intentionally subtler in a small portrait than in the rotatable
3D preview. Existing rigid-head hair and outfit/physics limitations remain.

# Hair & representative character

Visual approval is not claimed. Kept 5c is an experimental checkpoint, not an
approved default character.

## Reference (must be opened, not remembered)

See `REFERENCE.md`. The originals are three 1290×2796 stacked pairs (not
1536×1024). Target = **top panel of `sheet-long-wave.jpg`** (long wave, black
knit). Crop 1290×1555; eyes L 604.5,631.8 R 753.3,643.3, sep **149.3 px**.
Retired: 3×2 grid, y0=95, eye sep 153, eye y 635.

Comparison is `tools/figure/review/compare-large.html`. The first row is
original / coloured / clay. `window.__compareReady` is false until that row
exists. Clay-versus-colour is not a reference comparison.

## Attempts (screen, not connectivity)

| # | Method | What the large views showed |
|---|---|---|
| pre | Fused bands | Long leaf plates — rejected |
| 5a–5b | Shell / ribbons | Still plates |
| **5c** | Overlapping ellipsoids | Inflated bulbs; not the long-wave style |
| 5d | Coarser remesh | Helmet — discarded |
| **6** | Open skull wrap + bang + hanging locks | Face opened; bang direction present; hair still two curtains + visor |

Attempt 6 is the current candidate (`checkpoints/2026-09-18-attempt-6/`).
5c is not the proportion source.

Against the original extract: the face is no longer trapped, the neck and crew
knit read, and a right-side part throws a diagonal bang to the left. Hair is
still not the long-wave wrap — skull cap, forehead visor, two hanging masses,
jagged part, temple nicks. Lengths do not carry the original’s S-curve over
the shoulders. The back is designed (not in the crop).

Further automatic ellipsoid / helmet / remesh packs will repeat 5c–5d. The
remaining correction is the wrap itself: smooth the hairline, merge the bang
into the left mass, and give the lengths wave volume beside the shoulders.

## What not to retry

- Fusing bands and calling connectivity a visual fix
- Closed mass + narrow face boolean (hood)
- Continuous curtain sheet (hood)
- Coarser remesh until the silhouette is a helmet (5d)
- Another automatic pack of ellipsoids without a working original comparison
- Closed helmet + face-hole boolean (hood)
- Decimating a remeshed hair volume (holes in the scalp)

## Direction

- Pipeline: `tools/figure/*.py` → `public/figure/character.glb` → Three.js showroom
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit)
- Combination / wardrobe end state: Bondee’s character and assembly model (`docs/wardrobe.md`)
- Do not merge or deploy until visual approval

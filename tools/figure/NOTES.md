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

5c’s remaining gaps, **confirmed against this original extract**: two inflated
side bulbs instead of one wrapping long-wave mass; no diagonal bang; a
trapped remnant face; mushroom silhouette instead of inverted-triangle
shoulder-length waves; neck / crew knit barely readable. Piling large
spheres is not “finding the large form.”

## What not to retry

- Fusing bands and calling connectivity a visual fix
- Closed mass + narrow face boolean (hood)
- Continuous curtain sheet (hood)
- Coarser remesh until the silhouette is a helmet (5d)
- Another automatic pack of ellipsoids without a working original comparison

## Direction

- Pipeline: `tools/figure/*.py` → `public/figure/character.glb` → Three.js showroom
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit)
- Combination / wardrobe end state: Bondee’s character and assembly model (`docs/wardrobe.md`)
- Do not merge or deploy until visual approval

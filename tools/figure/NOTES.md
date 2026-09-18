# Hair & representative character

Visual approval is not claimed. Attempt 7 is the current candidate
(`checkpoints/2026-09-18-attempt-7/`). 5c is not the proportion source.

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
| **6** | Open skull wrap + bang + hanging locks | Face opened; two curtains + visor |
| **7** | Overlapping flowing locks (no whole-hair remesh) | Back/nape/shoulder volume present; bang stays above the eyes; three-state holds as long hair without secondary; front still two curtains; some intersections and a cap rim remain |

Attempt 7 keeps hair as named lock meshes (`scalp_*`, `back_vol_*`, `lock_p_*`,
`lock_s_*`) so the showroom can hide layers. Voxel-fusing the whole head is
not the default. Secondary locks sit inside the same outline.

Moved from 6: the back, nape and shoulders have hanging volume as a base
layer (not a face helmet); the bang stays above the eyes; base+primary
already read as long hair if secondary is hidden. Hanging locks keep
section tilt near 0 so they are not edge-on curtains; `seat_inside` only
lifts vertices that punched *deep* into the skull, so a thick lock can
bury its inner side.

Still wrong: from the front the silhouette is two curtains more than one
wrapping wave; some lock intersections show; the part/crown still sits a
little like a separate cap; the bang is rounder than a visor strip but not
yet the original’s forehead mass. The back is designed (not in the crop).

## What not to retry

- Fusing bands and calling connectivity a visual fix
- Closed mass + narrow face boolean (hood)
- Continuous curtain sheet (hood)
- Coarser remesh until the silhouette is a helmet (5d)
- Another automatic pack of ellipsoids without a working original comparison
- Closed helmet + face-hole boolean (hood)
- Pushing every inside vertex of a thick lock onto the skull (flattens to a visor or cap)

## Direction

- Pipeline: `tools/figure/*.py` → `public/figure/character.glb` → Three.js showroom
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit)
- Combination / wardrobe end state: Bondee’s character and assembly model (`docs/wardrobe.md`)
- Do not merge or deploy until visual approval

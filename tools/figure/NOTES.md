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
| **7** | Overlapping flowing locks, then surface cleanup | Bang saw-tooth from `seat_inside` slam is gone; bang is one diagonal sheet; face size in the original row matches eye spacing; front still two curtains; back still inner mass + hanging pieces |

Attempt 7 keeps hair as named lock meshes (`scalp_*`, `back_vol_*`, `lock_p_*`,
`lock_s_*`) so the showroom can hide layers. Voxel-fusing the whole head is
not the default. Secondary locks sit inside the same outline. No new locks
were added in the cleanup; existing paths and `seat_inside` were changed.

`seat_inside` was measured lock-by-lock. The binary lift (any vert inside
0.86 × skull, scaled out in one step) moved verts 0.3–0.7 head units and
stretched edges up to **3.5×** (`lock_s_part_l`, `lock_s_bang_under`). That
is a saw-tooth hairline, not a seated root. The current function weights
the lift by depth and scalp region, caps it at 0.07, and spreads it to
neighbours. After that, max edge stretch is ~1.00.

Still wrong: from the front the silhouette is two curtains more than one
wrapping wave; the bang is a smoother diagonal, not yet the original’s
forehead mass; the back still shows a round inner volume with hanging
pieces beside it. The back is designed (not in the crop).

Large review: `tools/figure/review/finish.html` (front / 3/4 / back,
secondary hidden vs final). Original row display is 720 px wide, same
eye spacing.

## What not to retry

- Fusing bands and calling connectivity a visual fix
- Closed mass + narrow face boolean (hood)
- Continuous curtain sheet (hood)
- Coarser remesh until the silhouette is a helmet (5d)
- Another automatic pack of ellipsoids without a working original comparison
- Closed helmet + face-hole boolean (hood)
- Pushing every inside vertex of a thick lock onto the skull (flattens to a visor or cap; measured 3.5× edge stretch)

## Direction

- Pipeline: `tools/figure/*.py` → `public/figure/character.glb` → Three.js showroom
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit)
- Combination / wardrobe end state: Bondee’s character and assembly model (`docs/wardrobe.md`)
- Do not merge or deploy until visual approval

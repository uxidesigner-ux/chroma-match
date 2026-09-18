# Hair & representative character

Visual approval is not claimed. Attempt 8 is the current candidate
(`checkpoints/2026-09-18-attempt-8/`). 5c is not the proportion source.

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
| **8** | Bang/eye visibility, then placement | Same-camera vis: bang-only is a wide sheet. Face on + green bang sits on the forehead. Raycaster: forehead hits `lock_p_bang` then `head`. Eyes-only vs eyes+face: the pinprick was burial in the finished skin. |

Attempt 8 keeps the attempt-7 lock list. No new locks. `seat_inside` still
caps at 0.07 — that cap is deformation stability, not placement. The bang
centreline is authored with `bang_pt()` at `head_surface.z + clearance`, and
forehead tilt is **negative** (~−0.85) so width runs down the forehead and
thickness toward the camera. Attempt 7’s +1.15 tilt stood a near-round
section into the skull; flatten 0.94 made a sausage whose inner half was
inside the head. Depth test is still on.

Eyes are placed from `front_z()` on the finished head (after subsurf +
relax), not from the pre-deform superellipsoid. A 0.016 cap sits proud of
that surface; `EYE_D` is unchanged. Width/height went 0.076/0.084 →
0.090/0.098 after the oval was un-buried, to match the visible area on the
original — not a marble, not a pinprick.

Still wrong: the restored bang is a distinct diagonal patch, not yet the
original’s long smooth forehead mass; sides are still two curtains; the
back is still an inner round volume plus hanging pieces. The back is
designed (not in the crop). Visual approval is not claimed.

Diagnosis page: `tools/figure/review/vis.html` (bang-only / green-on-face /
normal; eyes-only vs eyes+face; raycast). Large review:
`tools/figure/review/finish.html` (front / 3/4 / side / back). Original row
display is 720 px wide, same eye spacing.

## What not to retry

- Fusing bands and calling connectivity a visual fix
- Closed mass + narrow face boolean (hood)
- Continuous curtain sheet (hood)
- Coarser remesh until the silhouette is a helmet (5d)
- Another automatic pack of ellipsoids without a working original comparison
- Closed helmet + face-hole boolean (hood)
- Pushing every inside vertex of a thick lock onto the skull (flattens to a visor or cap; measured 3.5× edge stretch)
- Raising or removing the `seat_inside` 0.07 cap to drag a buried bang out
- Turning off depth test, forcing render order, or deleting skin to “show” the bang

## Direction

- Pipeline: `tools/figure/*.py` → `public/figure/character.glb` → Three.js showroom
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit)
- Combination / wardrobe end state: Bondee’s character and assembly model (`docs/wardrobe.md`)
- Do not merge or deploy until visual approval

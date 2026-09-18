# Hair & representative character

Visual approval is not claimed. The long-wave is an independent asset
(`tools/figure/assets/long-wave/`). Attempt 8’s visibility fix (bang in
front of the forehead, eyes on the finished skin) is kept. 5c is not the
proportion source.

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
| **asset** | Tube-clump hair as a separate GLB + .blend | Stage 1: bang is a visible diagonal; scalp rim is a cut opening; sides are hanging tubes; back is a cap plus nape pieces. **Not the original’s one clay hairstyle.** Stage 2–3: attach / orbit / recolour match the Blender form. |
| **paths** | Generate vs export split | `character.py` writes `body.glb` only. `export_hair.py` reads the .blend and writes hair GLB; it fails if the original is missing (does not copy `generated/blockout`). `seed_hair_original.py` is the only command that may create the original from that freeze. |
| **headless attempts** | Cap+skirt grid, then measured clumps | Cap+skirt: bang on the crown, vase skirt. Measured clumps: visor bang, sides still tubes. Not adopted. `generated/sculpt-ops.md` records `brush_stroke` / `mesh_filter` SIGSEGV in bpy 5.0.1 background — a process note, not the quality bar. Original left as the tube-clump starting point. |

The lock generator (`hair.py`) is retired. Do not add more `seat_inside`
passes or disable depth test. This pass ends at path protection and
handoff (`assets/long-wave/README.md`). Operator notes:
`assets/long-wave/generated/sculpt-ops.md`. The next form pass is a
separate assignment.

Review: `review/asset.html` (attach / orbit / colour). Original row:
`review/compare-large.html`.

Visual approval is not claimed.

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
- Cap + one skirt sheet around the body (vase / cloak)
- Another automatic ribbon/clump combo in this headless process as a stand-in for changing the original’s form

## Direction

- Pipeline: shared head (`body.glb`) + hair asset (`hair_long_wave.glb`) → Three.js showroom attach
- Visual bar: top panel of `sheet-long-wave.jpg` (long wave, black knit); private, not in git or live
- This pass: protect original vs export; hand off. No more generator or sculpt-operator trials here
- Next form work: separate assignment, once edit + visual inspection are available
- Do not merge or deploy until visual approval

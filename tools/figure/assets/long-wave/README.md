# Long-wave hair asset

Independent hairstyle on the shared head. **Not visually approved.**

This folder is the handoff for a desktop sculptor. Headless bpy in this
environment can generate meshes and export GLB; it cannot clay-sculpt the
form to the original.

## Paths (do not collapse these)

| file | role | who may write it |
|---|---|---|
| `hair_long_wave.blend` | **Editable original.** Completion candidate. | A person in Blender. Seeded once from `generated/blockout.blend` if missing. |
| `generated/blockout.blend` | Frozen tube-clump starting point | `hair_long_wave.py` only |
| `generated/sculpt_attempt.blend` | Frozen headless attempt (measured clumps) | `sculpt_long_wave.py` only |
| `preview/` | Stage-1 stills of the **editable original** | `preview_blender.py` |
| `../../../public/figure/hair_long_wave.glb` | Shipped hair | `export_hair.py` only (reads the .blend, does not rebuild form) |
| `../../../public/figure/body.glb` | Shared head / body / eyes / knit | `character.py` |
| `../../../public/figure/character.glb` | Assembled preview | `export_hair.py` or `character.py` (import existing GLBs) |

`character.py` rebuilds the body. It must **not** overwrite the .blend or the
hair GLB. `export_hair.py` opens the .blend and writes GLB; it does not run
`build_hair()` or `sculpt()`.

    python3.11 tools/figure/character.py          # body.glb only
    python3.11 tools/figure/export_hair.py        # hair GLB from the .blend
    python3.11 tools/figure/preview_blender.py    # Stage-1 stills from the .blend

## Stage-1 status (Blender)

The editable original is still the **tube-clump blockout**. It is a starting
point, not the finished long-wave.

Kept: bang centreline in front of the forehead; eyes on the finished skin;
depth test on.

Still wrong on screen (same class as the lock generator):

- forehead hairline is a straight cut; temples stair-step
- bang reads as a separate leaf
- sides read as thick hanging tubes
- back is a cap plus nape pieces

Do not fix that in Three.js, and do not re-run `hair.py` / `seat_inside`.

## What was tried here, and what actually blocked sculpting

Verified on bpy 5.0.1, `bpy.app.background == True`, Python 3.11:

| operation | result |
|---|---|
| `object.mode_set(mode='SCULPT')` | succeeds |
| `sculpt.dynamic_topology_toggle` | succeeds |
| `sculpt.brush_stroke.poll()` without View3D | **False** (`context is incorrect`) |
| `sculpt.brush_stroke.poll()` with View3D override | True |
| **invoking** `sculpt.brush_stroke` | **Segmentation fault** |
| **invoking** `sculpt.mesh_filter` (SMOOTH / INFLATE) | **Segmentation fault** |
| `mesh.vertices_smooth` in Edit mode | succeeds (evenes verts; does not reshape locks into the original) |
| modifiers (subsurf, solidify, ribbon) | succeed |

Two headless form attempts were **not** submitted as the original:

1. Cap + skirt grid (`sculpt_long_wave` first pass) — bang sat on the crown; skirt became a vase around the body. Stills were discarded.
2. Measured overlapping clumps (same script, silhouette from the original’s eye spacing) — bang became a visor leaf over the left eye; sides still read as tubes. Frozen at `generated/sculpt_attempt.blend` and `generated/preview-sculpt-attempt/`.

No further auto-combination. The next form change has to be grabbing / clay
strips / retopo on `hair_long_wave.blend` in a desktop Blender that can run
sculpt brushes.

## How to continue (desktop Blender)

Public modelling pattern — not an internal app reverse engineer:

- [ZEPETO 3D Modeling — Hair](https://docs.zepeto.me/studio-guide/3d-modeling-hair): tube/clump forms, not one-sided planes; cover the scalp; do not dig into the face; clumped so the inside is not seen when rotated.
- [ZEPETO Preparing Modeling — Hair, Headwear](https://docs.zepeto.me/studio-guide/preparing-modeling-hair-headwear): model on the guide head (`head` in this .blend).
- [ZEPETO Rigging — Hair](https://docs.zepeto.me/studio-guide/rigging-hair): bones/physics are **out of scope**.
- Silhouette first against the top panel of `sheet-long-wave.jpg` (private `refs/`, not in git).

Open `hair_long_wave.blend`. Named pieces in the blockout:

- `hair_scalp` — open cap. Edit the hairline; do not voxel-remesh this (it closes the face).
- `hair_bang` — diagonal bang. Keep the outer face in front of the forehead; do not leave it as a separate leaf.
- `hair_side_l_*` / `hair_side_r_*` — pull the hanging tubes into the original’s large S-waves.
- `hair_back_*` — crown-to-length volume, not a cap plus leftover nape pieces.

Mesh count / current splits are not the bar. The front and 3/4 at the original’s
face size have to read as one clay long-wave. Then side and back for join and
thickness.

When the .blend is right:

    python3.11 tools/figure/export_hair.py
    # or File → Export → glTF 2.0 → public/figure/hair_long_wave.glb
    # Y up, apply modifiers, visible hair only

Do not re-run `hair_long_wave.py` or `sculpt_long_wave.py` against the
hand-edited original — they write `generated/` only, but replacing the
.blend by hand would still destroy the sculpt.

Showroom (stage 3, only after Stage 1 passes): load `body.glb`, then
`Showroom.attach('/figure/hair_long_wave.glb')`. Review:
`/tools/figure/review/asset.html`. Original row:
`/tools/figure/review/compare-large.html`.

Do not extend `tools/figure/hair.py` or raise the `seat_inside` 0.07 cap.
Do not merge or deploy until visual approval.

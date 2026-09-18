# Long-wave hair asset — handoff (not approved)

This is a **starting point that still needs form work**, not a finished
hairstyle. Visual quality of the hair is rejected. Do not merge or ship it
as the representative character.

The reference stills (`sheet-long-wave.jpg` top panel, long wave / black knit)
are **private**. They are not in this PR, not in `public/`, and not on live.
They are handed over separately (`refs/` is gitignored). Review pages open
them with a local file picker.

## What each file is

| file | kind | status |
|---|---|---|
| `hair_long_wave.blend` | **Editable original** | Tube-clump **starting point**. Not approved. Further form work required. |
| `../../../public/figure/body.glb` | Shared head / body / eyes / ears / knit | No hair. Rebuilt by `character.py`. |
| `../../../public/figure/hair_long_wave.glb` | Hair export of the current original | Same form as the .blend. Not approved. |
| `../../../public/figure/character.glb` | Preview assembly | `body.glb` + `hair_long_wave.glb`. Not a second original. |
| `generated/blockout.blend` | Frozen **generation** of the tube-clump | Seed for `seed_hair_original.py` only. Not the live original. |
| `generated/sculpt_attempt.blend` | Frozen **unadopted** headless attempt | Measured clumps; visor bang. Do not ship. |
| `generated/preview-sculpt-attempt/` | Stills of that unadopted attempt | Evidence of what was not taken. |
| `generated/sculpt-ops.md` | Operator notes from 2026-09-18 | Technical, not a quality pass. |
| `preview/` | Stage-1 stills of the **editable original** | Shows the starting point, not approval. |

`character.py` writes `body.glb` (and may reassemble `character.glb` from
existing GLBs). It does not write the .blend or the hair GLB.

`export_hair.py` reads the .blend and writes the hair GLB. It does **not**
create the .blend. If the original is missing, export **fails**.

    python3.11 tools/figure/seed_hair_original.py   # create original from blockout; fails if original exists
    python3.11 tools/figure/character.py            # body.glb only
    python3.11 tools/figure/export_hair.py          # hair GLB from the .blend; fails if original missing
    python3.11 tools/figure/preview_blender.py      # Stage-1 stills from the .blend

`hair_long_wave.py` and `sculpt_long_wave.py` write **only** `generated/`.

## Current form (why it is still a starting point)

Kept from the visibility pass: bang centreline in front of the forehead;
eyes on the finished skin; depth test on.

Still wrong on screen:

- forehead hairline is a straight cut; temples stair-step
- bang reads as a separate leaf
- sides read as thick hanging tubes
- back is a cap plus nape pieces

That is an asset-quality problem. It is not fixed by export, showroom attach,
or web correction.

Named pieces in the current original (a map, not a required topology):

- `hair_scalp` — open cap. Voxel-remesh of this piece has closed the face before.
- `hair_bang` — diagonal bang. Outer face should stay in front of the forehead.
- `hair_side_l_*` / `hair_side_r_*` — side volume; currently hanging tubes.
- `hair_back_*` — back / nape; currently split from the cap.

Whether the next pass **keeps and reshapes** these meshes or **replaces some
of them** is a quality vs. edit-cost decision for that pass. Mesh count and
the current splits are not the completion bar. Front and 3/4 at the
reference’s face size have to read as one clay long-wave; then side and back
for join and thickness.

Public modelling notes (not an internal-app reverse engineer):
[ZEPETO hair modelling](https://docs.zepeto.me/studio-guide/3d-modeling-hair),
[modelling on the guide head](https://docs.zepeto.me/studio-guide/preparing-modeling-hair-headwear).
Bones/physics are out of scope for this asset.

When the .blend actually changes form:

    python3.11 tools/figure/export_hair.py

Do not extend `tools/figure/hair.py` or raise the `seat_inside` 0.07 cap.
Do not add hair types, clothes, physics, or community features in this folder.

## Technical note (not a quality verdict)

On 2026-09-18 this cloud process ran **bpy 5.0.1** as a Python module
(`bpy.app.background is True`, Python 3.11). In that process:

- `sculpt.brush_stroke.poll()` was false without a View3D (`context is incorrect`)
- with a View3D override, poll was true, then **invoking** `brush_stroke` aborted with SIGSEGV
- invoking `sculpt.mesh_filter` also aborted with SIGSEGV

Details and a minimal reproduction: `generated/sculpt-ops.md`.

Those are operator/context failures in that process. They are **not** a
claim that only a person can make the hair, that scripts cannot produce
form, or that installing a windowed Blender is enough to pass review.

Visual rejection of the current meshes stands on its own.

The next production pass is a **separate assignment**, once an environment
and owner that can edit the form and inspect it against the private
reference are set. This folder is the handoff for that pass.

Draft PR only. No visual approval, merge, or live deploy of this character.

## Checks (2026-09-18)

SHA-256 of `hair_long_wave.blend`:
`a4cdcb0d5a5313cf320a58cc08a218ff62f7c8219ab80ab36111f6a8594b72f2`

Unchanged after `character.py` and after `export_hair.py`. Hair GLB hash
also unchanged on those runs. Re-import of `hair_long_wave.glb` in bpy
yielded nine `hair_*` meshes. `export_hair.py` with the original moved
aside exited 1 and did not create a .blend. `seed_hair_original.py`
refused while the original existed; with it absent, the copy matched
`generated/blockout.blend`.

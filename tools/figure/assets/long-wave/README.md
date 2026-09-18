# Long-wave hair asset

Independent hairstyle on the shared head. Not visually approved.

## What is here

| file | role |
|---|---|
| `hair_long_wave.blend` | Editable original. Guide head + named tube clumps. |
| `preview/` | Stage-1 stills from Blender Workbench (not the showroom). |
| `../../../public/figure/hair_long_wave.glb` | Exported hair asset |
| `../../../public/figure/body.glb` | Shared head / body / eyes / knit (no hair) |
| `../../../public/figure/character.glb` | Assembled, for existing review pages |

Rebuild:

    python3.11 tools/figure/character.py
    python3.11 tools/figure/preview_blender.py

## Stage-1 status (Blender)

The current meshes are a **tube-clump blockout**, not the finished long-wave.

Kept from the visibility pass: the bang centreline sits in front of the forehead;
eyes sit on the finished skin; depth test stays on.

Still wrong on screen: the scalp rim is a cut opening, the sides read as hanging
tubes, the back is a cap plus separate nape pieces. That is the same class of
error as the lock generator (silhouette not one clay hairstyle). Do not fix it
by adding more `seat_inside` logic or by turning off depth test.

## How to continue (another artist)

Public modelling pattern this blockout follows — not an internal app reverse
engineer:

- [ZEPETO 3D Modeling — Hair](https://docs.zepeto.me/studio-guide/3d-modeling-hair): tube/clump forms, not one-sided planes; cover the scalp; do not dig into the face; clumped so the inside is not seen when rotated.
- [ZEPETO Preparing Modeling — Hair, Headwear](https://docs.zepeto.me/studio-guide/preparing-modeling-hair-headwear): model on the guide head (`dummyface` here is our `head`).
- [ZEPETO Rigging — Hair](https://docs.zepeto.me/studio-guide/rigging-hair): bones/physics are **out of scope** for this pass.
- Stylized blockout: silhouette and volume first, then breakup. Do not start from strand simulation.

In Blender, open `hair_long_wave.blend`. Named pieces:

- `hair_scalp` — open cap. Edit the hairline; do not voxel-remesh this (it closes the face).
- `hair_bang` — diagonal bang. Keep the outer face in front of the forehead.
- `hair_side_l_*` / `hair_side_r_*` — side waves.
- `hair_back_*` — back / nape.

Sculpt or retopologise until the part, bang, sides and back read as one
long-wave against the original (top panel of `sheet-long-wave.jpg`). Then:

    # replace the hair objects, keep material name `hair`
    # File → Export → glTF 2.0 → public/figure/hair_long_wave.glb
    # Y up, apply modifiers, selected hair only

Showroom attach (stage 3): `body.glb` then `Showroom.attach('/figure/hair_long_wave.glb')`.
Review page: `/tools/figure/review/asset.html`.

Do not extend `tools/figure/hair.py` (retired lock generator) or raise the
`seat_inside` 0.07 cap to hide placement errors.

# Building the figure

The shared head is scripted. The long-wave hair is an **independent asset**.

    python3.11 tools/figure/character.py
    # public/figure/body.glb              — head, body, eyes, ears, knit
    # public/figure/hair_long_wave.glb    — hair asset
    # public/figure/character.glb         — assembled (existing review pages)
    # tools/figure/assets/long-wave/hair_long_wave.blend — editable original

    python3.11 tools/figure/preview_blender.py
    # Stage-1 stills (Blender Workbench). If these are wrong, do not correct
    # the form in Three.js.

Blender is a Python module here (`pip install bpy`, 5.0.1 on Python 3.11).
There is no interactive sculpt viewport in this environment. The `.blend` is
the file a desktop sculptor opens.

| file | what it holds |
|---|---|
| `lib.py` | mesh helpers |
| `character.py` | shared head / body / eyes; eye seating vs finished skin is kept |
| `hair_long_wave.py` | tube-clump blockout for the long-wave asset |
| `hair.py` | **retired** lock generator. Do not extend `seat_inside` to hide form. |
| `preview_blender.py` | Stage-1 cameras |
| `assets/long-wave/` | `.blend`, README (handoff), Blender stills |
| `NOTES.md` | screen-first log |
| `REFERENCE.md` | how to open and measure the original |
| `review/asset.html` | Stage 2–3: attach hair GLB, orbit, recolour |
| `review/compare-large.html` | original required |

Showroom: load `body.glb`, then `attach('/figure/hair_long_wave.glb')`.
Hair meshes are named `hair_*` so they take the hair colour slot.

Visual approval is not claimed. Stage 1 (Blender form vs the original’s part /
bang / sides / back) has **not** passed. Stage 2–3 check that export and
attach do not change the authored form.

`refs/` is gitignored. Do not merge or deploy until visual approval.

# Building the figure

The shared head is scripted. The long-wave hair is an **independent asset**.
The completion candidate is the editable `.blend`, not a regenerated script.

    python3.11 tools/figure/character.py
    # public/figure/body.glb              — head, body, eyes, ears, knit
    # does not write hair_long_wave.blend or hair_long_wave.glb

    python3.11 tools/figure/export_hair.py
    # reads assets/long-wave/hair_long_wave.blend
    # writes public/figure/hair_long_wave.glb (form unchanged)
    # assembles public/figure/character.glb

    python3.11 tools/figure/preview_blender.py
    # Stage-1 stills from the .blend. If these are wrong, do not correct
    # the form in Three.js.

Blender is a Python module here (`pip install bpy`, 5.0.1 on Python 3.11).
There is no working sculpt brush in this background build: `brush_stroke` and
`mesh_filter` segmentation-fault. Form work that needs grab/clay has to happen
in desktop Blender on `assets/long-wave/hair_long_wave.blend`. Handoff:
`assets/long-wave/README.md`.

| file | what it holds |
|---|---|
| `lib.py` | mesh helpers |
| `character.py` | shared head / body / eyes; never writes the hair original |
| `export_hair.py` | .blend → hair GLB, no regeneration |
| `asset_paths.py` | original vs generated vs public paths |
| `hair_long_wave.py` | tube-clump blockout → `generated/` only |
| `sculpt_long_wave.py` | headless attempts → `generated/` only |
| `hair.py` | **retired** lock generator. Do not extend `seat_inside`. |
| `preview_blender.py` | Stage-1 cameras (opens the .blend) |
| `assets/long-wave/` | editable original, generated freeze, handoff README |
| `NOTES.md` | screen-first log |
| `REFERENCE.md` | how to open and measure the original |
| `review/asset.html` | Stage 2–3: attach hair GLB, orbit, recolour |
| `review/compare-large.html` | original required |

Showroom: load `body.glb`, then `attach('/figure/hair_long_wave.glb')`.
Hair meshes are named `hair_*` so they take the hair colour slot.

Visual approval is not claimed. Stage 1 has **not** passed. Stage 2–3 only
check that export and attach do not change the authored form.

`refs/` is gitignored. Do not merge or deploy until visual approval.

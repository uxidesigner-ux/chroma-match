# Building the figure

The shared head is scripted. The long-wave hair is an **independent asset**.
The editable `.blend` is the original for export. It is **not** visually
approved; it is a starting point. Handoff: `assets/long-wave/README.md`.

    python3.11 tools/figure/seed_hair_original.py
    # creates hair_long_wave.blend from generated/blockout.blend
    # fails if the original already exists

    python3.11 tools/figure/character.py
    # public/figure/body.glb — head, body, eyes, ears, knit
    # does not write hair_long_wave.blend or hair_long_wave.glb

    python3.11 tools/figure/export_hair.py
    # reads assets/long-wave/hair_long_wave.blend
    # writes public/figure/hair_long_wave.glb (form unchanged)
    # fails if the original is missing (does not copy blockout)

    python3.11 tools/figure/preview_blender.py
    # Stage-1 stills from the .blend. If these are wrong, do not correct
    # the form in Three.js.

| file | what it holds |
|---|---|
| `lib.py` | mesh helpers |
| `character.py` | shared head / body / eyes; never writes the hair original |
| `export_hair.py` | .blend → hair GLB; fails if original missing |
| `seed_hair_original.py` | explicit copy of `generated/blockout.blend` → original |
| `asset_paths.py` | original vs generated vs public paths |
| `hair_long_wave.py` | tube-clump generation → `generated/` only |
| `sculpt_long_wave.py` | unadopted headless attempts → `generated/` only |
| `hair.py` | **retired** lock generator. Do not extend `seat_inside`. |
| `preview_blender.py` | Stage-1 cameras (opens the .blend) |
| `assets/long-wave/` | original, generated freeze, unadopted attempts, handoff |
| `NOTES.md` | screen-first log |
| `REFERENCE.md` | how to open and measure the private reference |
| `review/asset.html` | Stage 2–3: attach hair GLB, orbit, recolour |
| `review/compare-large.html` | original required (local file picker) |

Showroom: load `body.glb`, then `attach('/figure/hair_long_wave.glb')`.
Hair meshes are named `hair_*` so they take the hair colour slot.

The private reference sheets are not in git or live (`refs/` gitignored).

Visual approval is not claimed. Stage 1 has **not** passed. Stage 2–3 only
check that export and attach do not change the authored form.

Do not merge or deploy until visual approval.

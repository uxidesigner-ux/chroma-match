# Building the figure

The editable source is this directory. Nothing in `public/figure/` is authored
by hand; it is all output.

    python3.11 tools/figure/character.py   # -> public/figure/character.glb
    python3.11 tools/figure/flows.py       # -> public/figure/flows.glb (legacy flow curves)

Blender is a Python module here (`pip install bpy`, 5.0.1 on Python 3.11), so
there is no application to open and no .blend file. Every surface is scripted,
and re-running a script reproduces its GLB exactly.

| file | what it holds |
|---|---|
| `lib.py` | mesh helpers — sweep, sculpt, join, voxel remesh, boolean, export |
| `character.py` | head, body, top, eyes, ears; calls hair |
| `hair.py` | representative hairstyle (attempt 6 — see NOTES.md) |
| `flows.py` | earlier band-flow curves (kept for history / overlay) |
| `NOTES.md` | screen-first log of attempts; 6 is a candidate, not approved |
| `REFERENCE.md` | how to find, crop and measure the original — not a substitute for opening it |
| `review/` | comparison page; original is a local file, not a public URL |
| `checkpoints/` | editable snapshots of rejected or prior designs |

Required visual check — original is mandatory:

    npx vite --port 5173
    # open /tools/figure/review/compare-large.html and choose refs/sheet-long-wave.jpg

    REF=refs/sheet-long-wave.jpg node tools/figure/review/shot.mjs \
      http://127.0.0.1:5173/tools/figure/review/compare-large.html out.png

`refs/` is gitignored and blocked from the Vite file server. Never put the
original in `public/` or in a comparison still that is committed or deployed.

Do not treat `window.__modelReady` as a finished comparison.

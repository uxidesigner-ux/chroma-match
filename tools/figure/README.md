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
| `hair.py` | representative hairstyle (attempt 5c — see NOTES.md) |
| `flows.py` | earlier band-flow curves (kept for history / overlay) |
| `NOTES.md` | measurements, attempts, what the screen showed, handoff scope |
| `checkpoints/` | editable snapshots of rejected or prior designs |

Large visual check (front + three-quarter first):

    npx vite --port 5173
    node .tmp-d/shot.mjs http://127.0.0.1:5173/.tmp-d/compare-large.html out.png

Drop the clay reference at `public/dev/ref.png` (gitignored) to enable the
matched side-by-side section.

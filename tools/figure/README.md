# Building the figure

The editable source is this directory. Nothing in `public/figure/` is authored
by hand; it is all output.

    python3 tools/figure/character.py   # -> public/figure/character.glb
    python3 tools/figure/flows.py       # -> public/figure/flows.glb

Blender is a Python module here (`pip install bpy`, 5.0.1 on Python 3.11), so
there is no application to open and no .blend file. Every surface is scripted,
and re-running a script reproduces its GLB exactly.

| file | what it holds |
|---|---|
| `lib.py` | mesh helpers — sweep a flat section along a curve, sculpt a sphere, join, voxel remesh, boolean, export |
| `head.py` → in `character.py` | head, eyes, ears, neck, chest, the jumper |
| `flows.py` | the hairstyle's flow, as curves, with the measurements it came from |
| `character.py` | the whole figure, including the hair built from those flows |
| `NOTES.md` | what the reference measures, and every attempt at the hair that was not kept |

`flows.py` renders the flow curves on their own as `flows.glb`, which the
showroom can lay over the figure. That is the check that the design is right
before any surface exists.

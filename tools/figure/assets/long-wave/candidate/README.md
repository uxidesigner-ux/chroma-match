# Long-wave candidate (not approved)

Form pass inside this candidate folder only. Does not replace the protected
original or `public/figure/hair_long_wave.glb`.

Long-length checkpoint (shoulder plate removed): `checkpoint-8fbe93b` / git
`8fbe93b`. Plate checkpoint remains `checkpoint-b5d56d2` / git `b5d56d2`.

Visual quality is not approved.

## This pass

Crown and bang are one wrapped surface: a wide diagonal pad from the part
across the left forehead, thinning at the fringe. Sides are two long S-locks
beside the face (right ear can show). Back is a separate mass that overlaps
the cap, with a softer middle — not a shoulder plate.

Four meshes (`hair_top`, `hair_left`, `hair_right`, `hair_back`). Same save
for `.blend`, GLB, and stills.

## Still wrong on screen

- Bang is closer to a diagonal pad, but the underside crease still reads as a
  visor in 3/4 and side.
- Side locks show a large S, yet they still read as separate hanging straps,
  not one clay volume with the bang.
- Back is no longer a punctured shelf, but it still reads as a thick helmet
  column from behind; side pieces still peel off.

Do not merge. Do not replace `public/figure/hair_long_wave.glb`.

Protected original (untouched): `../hair_long_wave.blend`

```
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --background --gpu-backend opengl \
  candidate/hair_long_wave.blend --python candidate/rebuild_hair.py
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --background --python export_candidate.py
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --background --python render_preview.py
```

Review attach (does not overwrite public hair):

```
http://127.0.0.1:5174/tools/figure/review/asset.html?hair=/dev/hair_long_wave_candidate.glb
```

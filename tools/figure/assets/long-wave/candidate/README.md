# Long-wave candidate (not approved)

Form pass inside this candidate folder only. Does not replace the protected
original or `public/figure/hair_long_wave.glb`.

Long-length checkpoint (shoulder plate removed): `checkpoint-8fbe93b` / git
`8fbe93b`. Plate checkpoint remains `checkpoint-b5d56d2` / git `b5d56d2`.

Visual quality is not approved.

## This pass

Crown and bang are one surface: a wide diagonal from the part, convex on the
left forehead, ending at the temple. Side and back keep the long length and
carry a large lock S; radial size stays near the head. Two meshes (`hair_top`,
`hair_hang`).

## Still wrong on screen

- Front left temple still shows a gap between bang and hang.
- Back is no longer a shelf, but it still reads as a thick column.
- Crown/hang join still shows from behind.
- Large waves are visible in 3/4 and on the right; the left front length is
  still too straight versus the clay reference.

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

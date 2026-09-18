# Long-wave candidate (not approved)

Rebuild of bang, hairline, sides, and back **inside this candidate folder
only**. Does not replace the protected original or `public/figure/hair_long_wave.glb`.

This is **not** the representative hair. Visual quality is not approved.

## What changed vs the Grab / sausage pass

- Bang is a forehead shell whose lower edge is the hairline (part → left temple),
  not an independent round blob and not an elliptical tube along the hairline.
- Sides are rounded-rectangle slabs with front-to-back depth, not circular tubes.
- Back is one wide mass behind the skull, not sausage end-caps.
- Crown stays on top of the head; bang owns the forehead.

## Still wrong on screen

- Bang still reads as a separate leaf / visor from 3/4 and side; it is not yet
  the front of one clay mass.
- Part is a fold, not a groove.
- Left temple still shows a seam / gap between bang and side.
- Sides lack the reference S-wave; they read as columns / curtains.
- Surface lock ridges are missing; back is a smooth volume.

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

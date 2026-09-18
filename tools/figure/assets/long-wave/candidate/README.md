# Long-wave candidate (not approved)

Rebuild of hanging volume **inside this candidate folder only**. Does not
replace the protected original or `public/figure/hair_long_wave.glb`.

The previous plate candidate is kept as checkpoint `b5d56d2` (also copied on
disk at `checkpoint-b5d56d2/`). Visual quality is not approved.

## What changed vs the plate checkpoint

Plate rules are gone: no `sweep_box` y-slices, no `_with_sil` widening to the
clothes/shoulder outline, no no-op `_taper_cap`. Side/back volume is a hanging
mass parameterized along length, radial size capped near the head (~1.16, not
the shoulder cape at ~2.17). Bang is a thick diagonal lock from the part, not
a skull-stuck band. Face-side locks stay beside the cheek down the length.

## Still wrong on screen

- Bang still reads as a separate lock on the forehead, not one clay mass.
- Piece seams (crown / bang / hang / face locks) still show.
- Back is one column from crown to length, but the outline is still too even.
- Not visual-approved. Do not merge. Do not replace the public GLB.

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

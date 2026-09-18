# Long-wave candidate (not approved)

Working copy of the protected original, then vertex deform + GUI Grab/Smooth
on `hair_bang` and a light Grab on the upper side locks.

This is **not** the representative hair. It still reads as a separate bang
blob, hanging side tubes, and a cap-plus-paddle back. Do not merge, do not
replace `public/figure/hair_long_wave.glb`.

Protected original (untouched): `../hair_long_wave.blend`

```
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --gpu-backend opengl \
  candidate/hair_long_wave.blend
python3.11 -c "import runpy"  # or:
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --background --python export_candidate.py
/home/ubuntu/opt/blender-5.0.1-linux-x64/blender --background --python render_preview.py
```

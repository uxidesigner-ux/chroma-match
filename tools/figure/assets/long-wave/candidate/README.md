# Long-wave candidate (not approved)

Form refine of bang root, side/back S-wave, and joins **inside this
candidate folder only**. Does not replace the protected original or
`public/figure/hair_long_wave.glb`.

This is **not** the representative hair. Visual quality is not approved.

## What changed vs the previous saved candidate

- Bang root is on the skull: diagonal kept, crown connection is a band not a
  square sticker, fringe tapers to the temple. Still a separate pad vs one mass.
- Sides keep the connected volume and the length-wise S (neck tuck, shoulder
  flare). Back follows the same flow. Nape mass sits lower under the crown.
- Crown remains a cap on the head (no box lid). Pieces are not fused.

## Still wrong on screen

- Bang still reads as a separate forehead lock, not the front of one clay mass.
- Part corner and bang–crown rim still show.
- Nape shelf (back mass under the cap) still reads from behind.

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

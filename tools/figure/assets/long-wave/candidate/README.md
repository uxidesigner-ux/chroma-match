# Long-wave candidate (not approved)

Form refine of bang root, side/back S-wave, and joins **inside this
candidate folder only**. Does not replace the protected original or
`public/figure/hair_long_wave.glb`.

This is **not** the representative hair. Visual quality is not approved.

## What changed vs the previous slab candidate

- Bang sits on the skull. The part end is a pad on the front of the crown,
  not a folded visor tip in the air. Diagonal hairline is kept. Upper edge
  is wide at the crown; the fringe tapers toward the left temple.
- Sides keep the connected large volume and now have a length-wise S:
  tuck toward the neck below the ear, flare near the shoulders. Readable
  from front and 3/4. Back follows the same flow.
- Crown is a cap on the head (no floating box lid). Inner cavity in
  hair-only view is allowed. Pieces are not fused.

## Still wrong on screen

- Bang still reads as a separate forehead pad, not yet the front of one
  clay mass. The part corner is still a bit square.
- Crown/bang join and the nape shelf (back mass under the cap) still show.
- Surface lock ridges are missing; volumes are smooth.

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

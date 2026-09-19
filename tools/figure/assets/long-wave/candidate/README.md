# Long-wave candidate (not approved)

Whole bust matched to the turnaround sheet by measurement, not by eye:
face width on the sheet's front panel (528 px) is the unit; the egg skull,
eye spacing/height, nose ball, ear discs, pearl size, and the hair
silhouette (half-width per height, top-of-hair above the face) are all set
from those pixel ratios in `character.py` and `rebuild_hair.py`.

Does not replace the protected original or `public/figure/hair_long_wave.glb`.

Visual quality is not approved.

## This pass

- Skull: a gentle egg sphere (`SECTION_K` = 2, no cheek/chin/socket/brow
  blobs). Local blobs had carved a punched valley under the nose and left a
  rounded-square silhouette. Eyes sit in the upper half of the visible face.
  Nose is a modest clay ball on the egg. Ears are small discs with pearls.
- Cap: parametric shell whose front rim *is* the measured hairline (exposed
  forehead right of the part, tucked under the bang left of it). No more
  vertex-culled stair edge.
- Bang: not a separate piece. The cap's rim left of the part is the bang's
  lower edge, and a swell in the cap surface makes the diagonal sweep, so
  crown and bang are one piece of clay. Lobes radiate from a whorl at the
  part.
- Crown flow: lock ridges are the angle around the side-part whorl (`WHORL`,
  `N_LOBE` = 8). The same field is used on the cap and the curtain, so locks
  start at the crown (sheet top + back) and hang as S-waves. The cap is a
  round dome with those sausages on it, not a smooth lid.
- Sides + back (`hair_curtain`): one clay curtain, a partial ring from behind
  one ear around the back to behind the other ear. Its half-width / depth /
  centre per height come from the sheet's back and side panels (`CURTAIN`
  table: narrow at the neck, flaring over the shoulders). Eleven ridges run
  down it with one shared S phase (period 1.15 head units), drift a third of
  a ridge spacing so they read as waves, not chevrons, and split into a
  scalloped hem of tapered lock ends. From y=0.05 up the curtain is blended
  onto the cap surface so the crown dome flows into the ridges, and the
  ridges keep running up over the dome toward the crown. The front
  edge stays behind z=-0.24 at ear height so both pearls read from the front.
- Front layer: a thin flat strand per side beside the jaw, in front of the
  shoulder (the sheet's 전면 레이어), same wave phase as the curtain. Below
  the collar it rests on the knit over the chest (`torso_front_z`).
- Review page: the "sheet five views" row uses the sheet's own framing
  (4.9 head units tall, centred at y=-0.50, 322:416 panels).

- Body (`character.py`): slim short neck straight under the chin, trapezius
  flaring early into a wide soft shoulder, scoop neckline dipping at the
  front (-1.36) and riding higher at the sides (-1.20). The knit opening
  always sits outside the body, so no skin pokes through the collar. A slim
  visible neck sits under the chin; shoulders are narrower and sloped. Bust:
  the front half of the torso comes forward `CHEST` = 0.36 units below the
  collar (`chest_bulge`). Side hair stays behind the ear so the neck reads.
- Colour (`review/asset.html` LOOK): sheet palette adjusted for the showroom
  tone mapping so rendered pixels land on the sheet's skin/hair/knit/backdrop.
- Back locks start inside the cap so they emerge from the crown, not sit on it.

Same save for `.blend`, GLB, and stills. Full sheet lives outside the repo (`refs/` is gitignored).

## Still a candidate

Judge the whole bust against the sheet. Do not merge. Do not replace
`public/figure/hair_long_wave.glb`.

Protected original (untouched): `../hair_long_wave.blend`

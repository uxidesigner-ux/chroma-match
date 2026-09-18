# Long-wave candidate (not approved)

Whole bust matched to the turnaround sheet by measurement, not by eye:
face width on the sheet's front panel (528 px) is the unit; the egg skull,
eye spacing/height, nose ball, ear discs, pearl size, and the hair
silhouette (half-width per height, top-of-hair above the face) are all set
from those pixel ratios in `character.py` and `rebuild_hair.py`.

Does not replace the protected original or `public/figure/hair_long_wave.glb`.

Visual quality is not approved.

## This pass

- Skull: egg profile, widest at the cheek (`EGG_C`), broad rounded chin,
  taller upper half. Nose is a separate clay ball; ears are tall discs stuck
  on at eye-to-nose height with a pearl on the lobe.
- Cap: parametric shell whose front rim *is* the measured hairline (exposed
  forehead right of the part, tucked under the bang left of it). No more
  vertex-culled stair edge.
- Bang: one thick diagonal sweep from the part to the left ear top, top edge
  buried in the cap.
- Sides: one wave bundle per side following the sheet silhouette, behind the
  ear at ear height.
- Back: three S-wave tubes sharing one phase over a flat nape tube.

Same save for `.blend`, GLB, and stills.

## Still a candidate

Judge the whole bust against the sheet. Do not merge. Do not replace
`public/figure/hair_long_wave.glb`.

Protected original (untouched): `../hair_long_wave.blend`

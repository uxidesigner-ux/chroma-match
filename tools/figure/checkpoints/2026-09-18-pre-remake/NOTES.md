# Hair: what has been tried, and what the reference actually measures

A record of the attempts, so that none of them is tried twice. The short
version is in the commit messages; this is the long one.

## What the reference measures

From the reference render, in units of the distance between its eyes (153 px),
converted to head units at this model's scale (eye separation 0.524).

| | eye-separations | head units |
|---|---|---|
| hair rises above the eye line | 3.06 | +1.60 |
| widest across | 6.00 | 3.14 |
| widest at, below the eye line | 0.74 | −0.39 |
| parting, right of face centre | +0.84 | +0.44 |
| hairline peak above the eye line | 1.61 | +0.84 |
| hairline at the temple | −0.15 | −0.08 |

The measured hairline, x across and y above the eye line:

    x   -0.86  -0.55  -0.24   0.00  +0.27  +0.48  +0.58  +0.79
    y   -0.08  +0.16  +0.42  +0.65  +0.85  +0.73  +0.59   0.00

It peaks at +0.27, which is *left* of the parting at +0.44, and falls away
gently to the left temple and steeply to the right. That asymmetry is the
style: the parting is on the viewer's right and the mass is thrown across the
brow to the left.

Two numbers the model was furthest from: the parting was on the wrong side,
and the hair stood 0.06 above the skull where the reference stands 0.6.

## Attempts

**1 — scalp with separate lengths.** A thin cap cut at a hairline, with lofted
lengths hung off it. No mass: the lengths read as sausages beside a swimming
cap and nothing tied the crown to the sides.

**2 — one continuous curtain.** A single sheet from the parting, over the
skull, down to the tips, solidified. Gave a hood. The face opening is fixed by
the sheet's own parametrisation, and opening it wide enough to clear a jaw
tears the flow the sheet exists to carry.

**3 — closed mass, face cut by a boolean.** Gave a hood from the other
direction. Width was not the problem: the mass measured 2.10 across against the
head's 1.58, about the reference ratio. The opening was. The first cutter was
narrower than the face it was meant to clear, and widening it until the jaw was
out in the open left torn edges wherever the cutter met the mass nearly
tangentially.

**4 — bands along designed flows.** The flows are placed from the measurement
above and evaluated as curves first, which does read: the parting sits where the
reference has it and the diagonal sweep across the brow is visible in the curve
itself. Turning them into bands gives the sides real mass. It stops short at the
crown: the bands arc away from the skull near the parting and the patch that
should close between them reads as a separate cap with a seam.

## The deformation bug, for the record

`ribbon()` swept a circular section and then scaled the finished mesh on global
Y to flatten it. Global Y in this frame is front-to-back. Measured on a length
authored to run 0.10 → 0.42 in front of the head, changing only that factor
from 1.0 to 0.3 moved its mean front position from 0.285 to 0.086 and left x
and height unchanged to three decimals. Flattening now lives in the bevel
profile as an ellipse; the same probe gives −0.000.

A second scale error in the same area: the taper value multiplies a profile of
radius 0.5, so a band's half width is half the number written in `BANDS`. The
first set of bands was authored as if the number were the half width and came
out at half size.

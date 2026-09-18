# Hair & representative character — remake round (2026-09-18)

Visual approval is not claimed. This records what was tried, what the screen
actually showed, and what still has to be sculpted by hand or by a different
method.

## Reference

The clay reference (`public/dev/ref.png`) was **not present** in this
environment. Measurements below are carried forward from earlier work (eye
separation 153 px in the reference crop). Side-by-side matching in
`.tmp-d/compare-large.html` section 5 activates only when that file is dropped
back into `public/dev/`.

| | eye-separations | head units |
|---|---|---|
| hair rises above the eye line | 3.06 | +1.60 |
| widest across | 6.00 | 3.14 |
| parting, right of face centre | +0.84 | +0.44 |
| hairline peak (left of parting) | — | see HAIRLINE in `hair.py` |

Target impression (from review, not from a local pixel crop this round):

- large diagonal bang from the parting across the brow
- side/back volume of long hair first, waves inside that volume
- not leaf / plate pieces from the crown
- soft simple face; no bead-eye specular; readable soft nose
- neck → shoulder → crew collar as one join (no triangle of chest skin)

## Attempts this round

| # | Method | What the large front / 3/4 views showed |
|---|---|---|
| pre | Fused bands (PR #28 tip) | Long leaf plates from crown; rejected |
| 5a | Mass shell + bang ribbons, fused | Still plates; jagged crown join |
| 5b | Single open shell + bang lift | Still slabs; flat crown |
| **5c** | **Overlapping ellipsoids → voxel union** | **Diagonal bang readable; volume present; seams between bulbs remain** |
| 5d | Fewer masses, coarser remesh | One helmet / hood; style gone — checkpointed, not kept |

**Kept: 5c** (`tools/figure/hair.py`). Not because it is approved — because of
the kept attempts it is the only one that still shows a diagonal bang and
side/back mass without collapsing into a hood. Seams are an open defect.

**Checkpointed and not kept:**

- `tools/figure/checkpoints/2026-09-18-pre-remake/` — band design before this remake
- `tools/figure/checkpoints/2026-09-18-attempt-5d-helmet/` — helmet dead end

## Face / neck / top (constraint lifted)

Unlocked and changed in `character.py`:

- narrower face, flatter eyes (less protrusion, matte eye material in showroom)
- shorter clearer nose with a soft bridge
- wider neck opening earlier into the shoulder
- higher crew neckline

Remaining on screen: eyes can still read as small beads under key light; nose
is soft but not yet the reference’s simple wedge; collar/neck join is improved
but not clean. These need direct sculpt against the reference, not more
automatic retuning in isolation.

## What not to retry

- Fusing thin bands / ribbons and calling connectivity a visual fix
- Closed mass + face boolean with a narrow cutter (hood / torn rim) — attempt 3
- Continuous curtain sheet (hood) — attempt 2
- Coarsening remesh until the silhouette is a helmet (5d)

## Handoff — sculpt scope still open

1. **Hair large form** against reference: one continuous long-hair volume with
   a diagonal bang ridge that does not read as a separate bulb. Likely needs
   hand-authored cage or sculpt layers, not another ellipsoid pack.
2. **Face** width, cheek/jaw, nose plane, eye embedding — with `ref.png` loaded
   and eye-separation matched (see `.tmp-d/compare-large.html`).
3. **Neck / collar** continuous slope; no skin triangle above the cloth.
4. Match camera / head angle to the reference before judging form.
5. Then side / back / turn for solid consistency (back is designed).

Pipeline to keep: `tools/figure/*.py` → `public/figure/character.glb` →
Three.js showroom. Do not merge or deploy until visual approval.

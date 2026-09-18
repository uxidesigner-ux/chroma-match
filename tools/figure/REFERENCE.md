# Representative reference — opened and measured 2026-09-18

This file records **this session’s decode**. It is not a substitute for opening
the bitmaps next time.

**Do not commit the originals, the extract, or comparison stills that contain
them.** They live in `refs/` (gitignored) and are read with a local file picker.

## What was actually opened

Three JPEGs, each a vertical pair (six characters total). **Not** 1536×1024.

| Private copy | Source attachment | Decoded size | Bytes |
|---|---|---|---|
| `refs/sheet-long-wave.jpg` | `01a0b2e1-958f-76ca-b38a-d2d3eb961416.jpg` | **1290 × 2796** | 361 811 |
| `refs/sheet-short-hair-men.jpg` | `01a0b2e1-95a2-7118-910b-672e0644ff9c.jpg` | **1290 × 2796** | 347 064 |
| `refs/sheet-glasses-bob.jpg` | `01a0b2e1-95bb-7f5f-8e86-b9c74b4a474b.jpg` | **1290 × 2796** | 343 464 |

Target character: **long wave, black knit** = **top panel of `sheet-long-wave.jpg`**.

The other five (glasses + lilac knit; two short-haired men; white shirt + glasses; bob + cream shirt) are the same style family, not this sculpt’s target.

## Crop — measured on this file

`sheet-long-wave.jpg`, row-mean luma > 230:

| | pixels |
|---|---|
| White separator band | **y = 1555 … 1630** (76 px) |
| Top panel (target) | **x = 0 … 1290, y = 0 … 1555** |
| Crop resolution | **1290 × 1555** (copied, not stretched) |
| Aspect | 1290/1555 = **0.830** |
| Mapping | crop `(x, y)` → original `(x, y)` because crop origin is `(0, 0)` |

Other sheets have their own bands (1524–1599 and 1513–1590). Do not reuse this crop on those files.

## Eyes — measured on this crop

Dark pixels in a centre face box, split on the largest x-gap. **Not** the retired 153 px / 635 px notes.

| | crop px | original px |
|---|---|---|
| Left eye | 604.5, 631.8 | 604.5, 631.8 |
| Right eye | 753.3, 643.3 | 753.3, 643.3 |
| Separation | **149.3** | 149.3 |

(Exact values may shift a pixel when the review page re-measures; the method is the same.)

Retired, do not reuse: 1536×1024 grid, 3×2 cells, y0=95, y1=1105, eye sep 153, eye y 635.

## How to compare

    npx vite --port 5173
    # /tools/figure/review/compare-large.html → choose refs/sheet-long-wave.jpg

    REF=refs/sheet-long-wave.jpg node tools/figure/review/shot.mjs \
      http://127.0.0.1:5173/tools/figure/review/compare-large.html out.png

`window.__modelReady` means the GLB loaded. `window.__compareReady` means the
original was read and the first row (original / coloured / clay) exists.
Model-ready is not comparison-ready. Clay-versus-colour is not a reference
comparison.

## Quality standing (attempt 7 candidate)

Attempt 7 is layered flowing locks against this extract, not an approved
character. 5c is not the proportion source. The whole head is not voxel-fused.

`seat_inside` was measured and changed: the binary slam stretched edges up
to 3.5×; the current lift is weighted, capped, and spread. Bang saw-teeth
from that slam are gone. Front still reads as two curtains. Back is designed
(not in the crop).

The clay sheet is the look bar. Bondee’s character/combination model
(`docs/wardrobe.md`) is the wardrobe end-state, not this sculpt pass.

# Representative reference — how to find it, what it is, how to crop it

This file is a locator, not a substitute for opening the bitmap. Every session
must open the original and read its pixels. A note here that the file exists
does not mean it is on this machine.

**Do not commit the original, crops that contain it, or comparison stills that
contain it.** They stay outside `public/` and outside deploy output. The review
page reads them through a local file picker.

## What the original is

| | |
|---|---|
| What | Six-character sheet |
| Expected pixels | **1536 × 1024** |
| Target character | **Top-right**: long wave hair, black knit |
| Job | Visual bar for the representative sculpt (face, hair, material) |
| Not this file’s job | Wardrobe combination rules — that direction is Bondee’s structure (`docs/wardrobe.md`) |

The clay-style sheet and Bondee’s combination model are related references doing
different jobs. Mixing Bondee’s proportions into a rejected sculpt, or treating
kept 5c as the new default character, is out of scope.

## Where it lives

| Place | Allowed? |
|---|---|
| Local file picker on `tools/figure/review/compare-large.html` | yes |
| `refs/` at the repo root (gitignored, Vite `fs.deny`) | yes, private copy for this machine |
| `public/`, GitHub, GitHub Pages, live | **no**, unless explicitly approved |

This environment (2026-09-18, follow-up that asked to restore comparison): the
attached original was **not present** on disk. Paths searched included the
workspace, `refs/`, `public/dev/`, `/tmp`, `/cursor/stores`, and prior review
artifacts. No 1536×1024 image was found. Sculpting was not started.

## Crop — only after the file is open

Do **not** reuse older notes:

- eye separation **153 px**
- eye height **635 px**
- crop `y0=95 … y1=1105`

Those numbers belonged to a previous crop of a different file (or a crop of a
crop). They are not coordinates on the 1536×1024 sheet.

Once the current file is decoded and its size is **exactly** 1536×1024:

| | value |
|---|---|
| Layout assumed | 3 columns × 2 rows |
| Cell size | 1536/3 = **512**, 1024/2 = **512** |
| Top-right cell in original pixels | **x = 1024 … 1536, y = 0 … 512** |
| Crop resolution | **512 × 512** (copied, not stretched) |
| Mapping | crop `(x, y)` → original `(1024 + x, y)` |

If the decoded size is not 1536×1024, **stop**. Do not invent a crop. Do not
fall back to 153 / 635.

Eye landmarks are measured on **that crop**, then mapped back with the row
above. The review page records all four: original size, crop rect, crop
resolution, eye coordinates in both spaces.

## How to run a comparison

    npx vite --port 5173
    # In the browser: open /tools/figure/review/compare-large.html
    # Choose the original with the file picker.

    # Headless, once a private copy exists at refs/six-sheet.png:
    REF=refs/six-sheet.png node tools/figure/review/shot.mjs \
      http://127.0.0.1:5173/tools/figure/review/compare-large.html out.png

`window.__modelReady` means the GLB loaded. `window.__compareReady` means the
original was read and the first row (original / coloured / clay) exists.
Model-ready is not comparison-ready. Clay-versus-colour is not a reference
comparison.

## Quality standing (unchanged)

Kept 5c is an experimental checkpoint, not an approved default character.
Large remaining gaps: inflated crown, round temple masses, a small trapped
face, long hair that does not read as one waving mass. Joining meshes or
piling spheres is not the same as matching the long-wave style.

# Mobile regional map and five-destination hub — 2026-10-06

## Scope / acceptance

- Move Missions and Rankings into the mounted Map / Character / Missions /
  Rankings / Shop icon dock. Retain icon-only original dimensional props,
  programmatic labels, keyboard focus and 44px minimum touch targets.
- All four regions expose thirty numbered native controls along a winding
  terrace/bridge route rather than three regions using a five-column grid.
  Puzzle definitions, mission IDs, saves, rewards and unlock order do not change.
- Finger drags starting on nodes do not select or re-centre under the finger.
  Pinch zoom works in both directions; target size stays 52 screen pixels.
  Keyboard selection and current-stage controls reveal nodes clear of chrome.
- Preserve cached-map fallback, reduced motion, static artwork during drag,
  original whole-world artwork and the existing 2.5D renderer. Character source
  and character rendering tests remain explicitly out of scope.

## Implementation / review

The original source had dedicated Forest artwork, but reused the whole-world
image and six rows of five coordinates for the other three regional views.
Three original regional illustrations now preserve the Forest route composition
while changing biome materials and landmarks. `src/ui/region-routes.ts` owns
normalized route coordinates and versioned regional artwork URLs. Three tight
corners were moved about nine logical pixels to prevent overlapping native touch squares
at the 1.4 minimum regional scale. A geometry unit test covers all 120 nodes.

Five navigation buttons share one fixed dock; landscape puts the Play dock
above navigation and overview markers beside it. Missions open directly rather
than clicking a hidden character-page proxy. Modal close restores the real
opener, and Missions reads current rewards on entry.

Camera framing uses measured header, footer and navigation rectangles. Button
zoom anchors this clear area; wheel and pinch still anchor their input position.
The minimum/maximum zoom buttons disable at their bounds. Mode switches or hidden/
inert map surfaces cancel active pointers. Overview pointerup no longer applies
regional minimum zoom: this was observed to steal a native tap in reduced-motion
mode. Native pointer focus does not move the map; keyboard focus still reveals.

## Asset provenance and prompts

Built-in image generator in edit/style-transfer mode; reference:
`public/chroma-forest-v3.webp`. No franchise images or stock illustrations used.
Native outputs were 1024×1536. ImageMagick conversion exports 2048×3072 WebP at
quality 88 to match existing runtime scene density; this resampling is not new
native detail. Original source files remain in the generated-images directory.

- `public/chroma-volcano-v1.webp` — 788696 bytes
- `public/chroma-prism-v1.webp` — 904108 bytes
- `public/chroma-relay-v1.webp` — 773382 bytes

Shared exact prompt, substituting each theme below for `{theme}`:

Use case: style-transfer. Project asset: full-height portrait casual game regional map. Reference is the existing Gem Forest map; make a {theme}. Preserve exactly the single continuous winding path and every bridge's position, width, shape and perspective of the reference. Preserve the central bottom start plaza at (58% width,82% height), bends up through (44%,65%),(65%,50%),(35%,37%),(59%,13%). Retheme terrain only. The tan path and open ground immediately around it must stay clear, without structures, crystals, trees or water obstructing it, for 30 future numbered buttons. Match the reference's chunky rounded polished toy-like 3D aesthetic, soft sun from upper left, rich casual mobile game colors, crisp readable silhouettes, no realistic textures. One coherent island rising from bottom to top. Keep composition and landscape occupancy matching reference. No buttons, labels, numbers, UI, text, logos or watermark. Output portrait 2:3 image.

Themes:

1. warm orange volcanic island, sculpted dark basalt cliffs, lava rivers and glowing molten waterfalls, red crystals, rounded orange sparse trees and a volcanic summit portal
2. turquoise tropical prism beach island, soft pale sand and limestone cliffs, turquoise lagoons and waterfalls, purple and blue crystals, palms and a crystal sanctuary at the summit
3. whimsical clockwork city island, honey-colored stone and blue-roof towers, oversized brass gears and pipes at the sides, cyan waterways and falls, clipped round bushes, a clockwork archway at the summit

## Verification boundary

Use `npm test`, `npm run typecheck`, `npm run test:game-ui` and a production
`/chroma-match/` build plus release-map flows. Inspect regional middle/summit
screenshots separately: geometry checks alone are not visual acceptance.
Mobile gestures are Chromium touch events, not physical iPhone/Android evidence.
No independent reviewer is available; do not label direct review independent.
This checkpoint does not assert a live deployment.

## Completed checks — 2026-10-06

- `npm test`: 194 passed; avatar tests excluded.
- `npm run typecheck`: passed.
- `npm run test:game-ui`: 30 passed; after the final compact-landscape
  adjustment, the six affected navigation/terrace/overview tests passed again.
- `BASE_PATH=/chroma-match/ npm run build`: passed. Existing large-chunk warning
  remains; no new production dependency was added.
- Five targeted production release-map tests passed on the final build:
  mission entry/clear, locale/theme/fold reflow, offline campaign/utilities,
  all four visited regional assets and five destinations offline, and missing
  art/storage recovery.
- Inspected rendered regional middle/summit/landscape screenshots and final
  production 480×320 overview. Checked the diff and whitespace; no avatar
  source changes. Direct review only, not independent review.

Physical-device touch/GPU performance remains unverified. Changes are local;
publishing this revision to GitHub Pages is not part of this checkpoint.

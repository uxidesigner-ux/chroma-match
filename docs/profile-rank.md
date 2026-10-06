# Growing profile frames

## Scope and acceptance

Original chunky casual-game portrait ornaments, not copies of the supplied reference.
Cached 2D portraits only. The 3D character/model/wardrobe paths and tests remain frozen.
Keep the same equipped cosmetic IDs, XP economy, wallet, replay and saves.
Hub/profile/gameplay show the same tier; legible live level text sits on a navy/gold
plaque. No explanatory lobby copy or perpetual shimmer is added.

| From level | Frame |
| --- | --- |
| 1 | Bronze bevels |
| 3 | Silver / blue corner gems |
| 10 | Gold / laurels |
| 20 | Crystal / white wings |
| 35 | Royal amethyst / crown |
| 50 | Legendary gold / ruby crown / wings |

Thresholds are cosmetic design choices, not player research. Earned frame selections
retain their saved value and become green/blue/gold accent glows rather than replacing
the automatic growing rim. Rank upgrades get one 550ms brightness transition only
when visible and reduced motion is not requested. Initial loading does not celebrate.

## Graphic assets

`public/profile-frames/{bronze,silver,gold,crystal,royal,legend}-v1.webp`: 512px RGBA.
`public/profile-frames/badge-v1.webp`: 512×244 RGBA, resized to the current surface.
Seven original transparent imagegen assets, sized for up to 3× portrait displays.
Original PNGs remain in the generation output directory, not removed or overwritten.
Central portrait windows and outside corners have real zero alpha.

Generation mode: new asset, transparent background. Common prompt: front-on orthographic,
perfectly symmetric chunky hand-painted 3D game ornament, thick metallic bevels, saturated
color, upper-left highlights, deep warm contact shadows, golden-chest material family.
Single centered asset, no text/letters/numerals/logo/watermark/background. Portrait frame
center must be genuinely transparent with a rounded-square 70% window; all ornaments
stay on the outside rim. Subjects follow the tier table. Plaque prompt replaces the
window requirement with a blank solid navy center, thick gold edge, wing flanges and
a small shield tip underneath; text is HTML. Reference screenshots were inspiration,
not input images for editing.

## Behavior and fallbacks

- Missing artwork falls back to an outlined portrait and readable solid level badge.
- Hub portrait action keeps its accessible name and visible keyboard focus.
- Level ≥10000 uses compact visual text; the full number remains its accessible label.
- 320px phones and short landscape remain usable; short landscape uses a smaller rim.
- Portrait frames do not alter the puzzle grid or reserve extra game HUD height.
- Profile sheet reserves enough space under the decorated portrait for its name field.
- Base URLs are derived from Vite, including GitHub Pages `/chroma-match/`.

## Verification checkpoint

Non-character unit tests: 192 passed. Profile UI cases: four passed, including
six thresholds, transparent center/corner pixels, all three portrait surfaces,
large levels, keyboard return, missing-art fallback and short-phone storage errors.
The shared game UI suite passed 25 cases; no character-rendering tests ran.
Type checking and production build passed. Real iPhone Safari and physical foldable
hardware are not available in this run; desktop browser emulation is not a substitute.
No live deployment is part of this request. Generic CSS/layout and missing-art fallback
have direct UI coverage; portrait rendering and 3D character tests are intentionally
excluded. There is no separate reviewer agent available; final diff/runtime review is
performed by the implementing agent and is not claimed as independent review.

# Dimensional casual-game UI checkpoint

## Selected direction

User-provided reference graphics establish chunky tangible casual-game UI:
blue/violet raised panels, gold primary actions, rounded edges and thick
lower bevels. This overrides generic restrained-application visual guidance.
The primary tasks remain play, select a stage, acquire items and inspect rankings.
No reference-game fake hearts, currencies, paid offers or teams are introduced.

## Implementation

- `src/casual-ui.css`: shared material for hub/dock, map controls, tools, shop,
  settings/profile/missions/help/game panels. 4px press translation is composited;
  original hit target boxes and game board height do not change.
- Item-selected, disabled, hover, focus, switch on/off and reduced-motion states
  preserve existing semantics. Character rendering/editor source is untouched.
- Rankings use the existing modal focus/inert ownership in a full-screen view.
  A localized blue banner and explicit close button replace the small sheet.
  Everyone/Friends tabs support arrows/Home/End and retain the original data flow.
  A request-generation guard prevents stale failed loads from clearing newer rows.
  Status is announced, loading is exposed via `aria-busy`, the list fills remaining
  viewport height and scrolls independently. No fixture scores ship in production.
- `public/chroma-{world,world-wide,forest}-v3.webp` are original revised backgrounds.
  Rounded rocks/trees/terraces and smoother materials match the new controls.
  Four region identities, logical coordinates, 30 stages each, native targets,
  terrain clipping and 2.5D ambience remain. Versioned URLs avoid stale artwork in
  the existing cache-first service worker. Old v2 assets are retained recoverably.

## Image generation provenance

Mode: edit existing locally-owned v2 artwork, one image per call. No stock reference
is edited or copied. Prompt: preserve composition/camera/terrain/paths/bridges/rivers
and biome identities; convert materials/forms into chunky rounded casual-mobile-game
3D dioramas with toy-like trees and rocks, green terraces, broad turquoise water,
bevelled buildings, jewel crystals, warm lighting/contact shadows and less texture
noise; no UI/nodes/text/logo/watermark. Original outputs are retained in the generated
image folder. These are 2.5D raster backgrounds, not newly modeled 3D terrains.

Native generated portrait maps are 1024×1536 and wide map 1672×941. Delivery exports
retain established 2048×3072 / 3344×1882 texture dimensions by resizing; this does
not claim additional native detail or true super-resolution. The visual acceptance
is the smoother sculpted style, not a measured gain in native image resolution.
Water/canopy effects continue to sample artwork colors; fixed waterfall anchor
neighborhoods are retained. Physical-device motion/performance needs later checking.

## Verification

Non-character unit suite: 192 passed. Shared game UI suite: 25 passed; three focused
casual UI cases reran after final shop/controls changes and passed. Coverage includes
320/390 phone, wide landscape, square fold and desktop; full-screen list height,
close/focus return, keyboard tabs, press feedback, readable quantity groups,
stale request errors, all four 30-stage regions and native touch gestures.
Production full regression: 16 passed before the final button/shop polish.
The final build passes type checking and production compilation; its core production
regression rerun passed all six cases (320px/DPR3 contact, landscape contact,
responsive game stability, supplied items, offline reload/shop return and
art/storage failure). Existing large-chunk warnings
remain in optional Firebase/character modules; no dependencies were added.
Coverage intentionally excludes
3D character/wardrobe rendering. Browser fixtures run in isolated contexts and are
not user's saved player data. Real iPhone/foldable hardware and online shared-data
availability are not claimed. No live deployment was requested for this batch.

Local preview: `http://127.0.0.1:5174/?seed=7&verify=hub`. Live Pages was not changed.
Self-review caught and fixed the legacy small-sheet height cap, profile-level CSS
name collision with ranking rows, short-landscape target overlap, short-phone
storage-error overlap, game HUD height regression and shop icon/column mismatch.
No independent reviewer agent was available; the review is not represented as one.

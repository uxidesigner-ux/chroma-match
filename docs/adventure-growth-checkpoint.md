# Adventure / player growth implementation checkpoint

Scope: dimensional shared hub, camera-driven world/region map, 30 authored forest stages,
device-local XP/cosmetics and private play statistics. Existing 20 v6 mission identities and
replay encoding remain immutable; new play uses the separate v7 `zt` header.

## Decisions and acceptance

- Native mounted HUD/nav persist in map, character and shop; hidden/inert in games and editing.
- The map is one camera scene, not duplicated art; portrait/landscape overview assets and
  forest detail share the same original visual direction. Pan, pinch, wheel, +/-/arrow keys,
  focus-stage and full-world controls. Fixed controls retain >=44px targets.
- A first clear gives 100 XP, a genuine replay 40 XP, natural failure 0–15 XP, quit 0 partial XP.
  Endless clears checkpoint XP but remain one whole run for statistics. Requirements cap at
  200 XP per level; overflow carries; level rewards are 20 coins and milestone cosmetics.
- IndexedDB read-write transaction commits XP + wallet + unlock + stats together. Stable
  attempt IDs, replay proof and identity binding prevent duplicate/cross-mission claims.
- Legacy clears backfill once, unrelated best scores do not. Legacy data is retained;
  after migration old wallet keys cannot overwrite the authoritative ledger.
- Storage failure never promises persistence. Failed transactions keep the suspended proof
  for retry. Unavailable storage allows session-only supplied-item play without wallet spending.
- Personal metrics use accepted actions only; unknown averages show a dash. Counts are
  separated by mode, with bounded recent-20 samples. Stats reset keeps XP, wallet and avatar.

## Verification in progress

- Initial full unit suite: 261 passed. Targeted new XP/30-stage replay tests passed.
- Production build and type checking pass. Native multi-tab serialization, genuine replay,
  invalid proof rejection, quota retry and stats-only reset have passed targeted browser checks.
- Runtime review found and fixed hidden shared HUD interception and duplicate-map framing.
- Existing regression expectations are being updated for the intentionally changed shared HUD,
  30 forest stages and authoritative IndexedDB wallet. Release is NOT yet verified or deployed.
- Real-device iOS browser chrome/hinge behavior and human difficulty/fatigue remain separate
  playtesting needs; deterministic solvability is not usability research.

## Art provenance

Created with the built-in image generator, reference used for original-game style continuity,
not franchise assets. Native UI and mission markers are separate from raster terrain.

Forest prompt: original Chroma Match Gem Forest region, portrait 2:3, fixed high isometric
camera, rounded dimensional emerald crystals/conifers, turquoise water, stone bridges,
upper-left sunlight. A broad winding path climbs five forest terraces to a crystal gateway;
clearings allow thirty native markers. Full bleed; no text, nodes, controls, characters,
logos, watermarks or other biomes. Source generated image exec-f005ee9b-520e-45b4-9215-b770e86ec7a0.png.
Runtime asset: public/chroma-forest-v1.jpg, JPEG86, 1024x1536.

Wide prompt: same original four-biome world recomposed in landscape 16:9, high isometric
view, no horizon. Emerald forest upper-left, lava crater upper-right, cyan/violet prism coast
lower-left, bronze gear city lower-right, connected stone bridges and turquoise ocean.
Landmarks around 28/73 percent width and 27/58 percent height; bottom22 percent low-detail
shore for a separate native action dock. Rounded rendered terrain, upper-left sunlight;
no characters, text, painted markers, interface, watermark, borders or franchise copying.
Source exec-28eaa1ea-33d7-4125-bdb6-296ee8f1ea04.png.
Runtime asset: public/chroma-world-wide-v1.jpg, JPEG84, 1672x941.

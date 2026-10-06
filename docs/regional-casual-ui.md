# Regional casual-game checkpoint

## Scope and acceptance

- Character model, rig, renderer, wardrobe and textures are unchanged. Character
  rendering regression tests are deliberately paused, not removed.
- Four regions each contain 30 stages. Volcano emphasizes power creation, Prism
  uses three-colour festivals, Relay uses chain turns. Collect/create/score targets
  vary in five-stage arcs with easier stages after finales. This is authored
  difficulty, not proof of human pacing; real-player balance remains to be measured.
- Original v6 missions and the first 45 v7 replay indices remain immutable. Append
  75 stages so existing saves, rewards and player-growth settlement remain valid.
- Fullscreen map and persistent hub are retained. Hide visible region/nav labels
  but preserve localized accessible names, native keyboard controls, progression
  fractions, lock states and contextual errors.
- A terrain-clipped soft shimmer identifies the selected region. Keyboard focus
  remains circular on its landmark; reduced motion gets static feedback.
- Original transparent dimensional icons replace non-character interface glyphs.
  Existing assets, reference watermark and character textures are not edited.
  Failed image loads retain recognizable fallback symbols and accessible names.

## Icon art direction

Single centered prop, transparent square canvas, readable at 48px; chunky beveled
surfaces, rich saturated colour, bright upper-left highlights and warm contact
shadows, thick sculpted gold edges, no lettering, logos or watermark. The supplied
stock chest is a style reference only. Assets are newly generated originals.

The common generation prompt requests a "premium chunky dimensional game prop,
three-quarter view, rich saturated colours, thick beveled surfaces, hand-painted
3D shading" with a clean transparent margin and no scene/platform/UI framing.
Subjects are map, helmet bust, chest, gear, question medallion, quest scroll,
trophy, infinity, play, hammer, rocket, bomb, compass, focus, plus, minus, arrow,
exit, coin, star, check, lock, close, sound, pause, shuffle, pencil and sun.
Runtime assets: `public/ui-icons/*-v1.webp`. Originals remain in the task's
`/Users/nike/.codex/generated_images/01a0c1ac-7615-7f13-b12d-e46995a185ff/` folder.

## Verification policy

`npm test` excludes `src/avatar/`; `test:all` preserves the full suite for a later
explicit character pass. `test:game-ui` selects map/player flows and the new icon
coverage; the character navigation/rendering scenario is excluded. Production
release tests exclude deployment wardrobe and short-hair/footwear suites.
Game tests may use cached profile portraits, but do not load or assess VRM models.
CI uses the same frozen-character scope. No new runtime dependency is introduced.

Live deployment is a separate explicit step; this checkpoint does not claim a release.

## Observed verification (2026-10-06)

- Non-character unit suite: 191 passed. Every one of the 120 stages was cleared
  with finite legal tools/swaps, and its replay restored exact metrics.
- Map/player/icon browser suite: 18 passed after final fixes. Includes touch drag,
  pinch, fixed 52px targets, thirty-stage focus in all regions, missing-icon
  recovery, WebGL fallback, reduced motion and ledger failure/rollback paths.
- Non-character production release suite: 16 passed. Following the final
  map-only focus/clipping fixes, three affected production map checks were re-run
  and passed, including the locale/theme/viewport matrix.
- Typecheck, service-worker syntax check and production build passed. Existing
  large graphics/vendor chunk warnings remain; no runtime dependency was added.
- Generated assets: 28 transparent 192px WebP props, about 340KiB on disk in total;
  original generation files retained. Phone, fold, landscape and desktop captures
  were visually reviewed, not merely accepted from command status.
- Diff inspection confirms no character/renderer/wardrobe source or asset edits.
  Character rendering tests were not run. Shared non-character UI props can also
  appear around the character screen, without modifying the model or its motion.

Review found and fixed camera destination/focus races and native focus scrolling
inside the map viewport. `overflow: clip` prevents the latter from shifting the
surface independently of its nodes; pointer-camera panning is still functional.
Real-device Safari/Android behavior and human difficulty/engagement balance are
not established by the simulated viewport and solver checks. The user-mentioned
shared quality playbook was not present in this checkout; repository product
principles and the supplied accessibility/verification requirements were used.

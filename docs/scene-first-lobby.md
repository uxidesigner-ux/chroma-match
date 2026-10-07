# Scene-first lobby

## Decision and scope

Approved comparison direction: reference 2's world/path/action connection and
reference 1's clear stage action and selected navigation, retaining our original
four-region art and earned portrait frames. This is an interface hierarchy pass,
not a new economy, map asset, game rule or character-model revision.

The working scenario is a mobile player returning to their next stage, choosing
another region, or checking rewards. This is a task hypothesis, not user research.

## Observable acceptance

- Separate portrait/name/XP and coin HUD objects; keep earned frame and level legible.
- Header is at most 100px tall at tested phone/fold/desktop viewports.
- One raised current destination among the persistent five icon-only destinations.
- Play text names the actual selected stage in all four languages and its region
  prop matches the current region. Locked/replay actions keep their real state.
- Overall completion remains accessible in the Map region list rather than mixed
  with the selected-stage reward. No progress or reward data is removed.
- Small overview waypoint medals leave landmarks readable; the existing clipped
  terrain shimmer and region camera remain. No rectangular selection border.
- Controls remain 44px+, regional nodes remain 52px across drag/pinch, and browser
  scroll stays zero. Focus returns after rankings/missions and shop navigation.
- At 480×320, separate action/dock columns retain all five destinations.
- Reduced motion disables new dock transitions and existing decorative shimmer.
- Existing node focus/camera transitions, finite earned frame flashes, coin flights
  and XP fill remain; do not introduce simultaneous endless button animations.

## Implementation

`src/lobby-scene.css` is the scoped final chrome layer after the existing material
styles. `Hub` separates the wallet and relocates overall completion. `WorldMap`
puts a localized stage and region prop on the same action. No production
dependency, character geometry, renderer, wardrobe, appearance code, game state,
reward policy or save format changes.

## Review and limits

Initial visual review caught a 480px landscape dock overflow hiding a destination;
the dock now has a 260px minimum and the action column reserves its own space.
The region-symbol host is separate from the generic icon decorator to prevent two
overlapping icons. Screenshot review is required in addition to passing geometry.
Landscape overview keeps the original landmark anchors and avoids chrome locally;
it no longer collects all four regions in two columns beside the action dock.

Validation uses isolated fixture progress and cached portraits; character rendering
and editor tests are excluded. Actual iPhone Safari hardware behavior is not
established by Chromium touch emulation. Production smoke is a local Pages-path
build, not evidence of a live deployment. No deployment was requested in this turn.

## Verification — 2026-10-07

- Approved `npm test` runner: 204 non-character unit tests passed.
- Targeted studio browser suite: 28 passed (hub-map, world-style, profile-rank,
  casual-ui and the five new lobby-scene cases).
- `BASE_PATH=/chroma-match/ npm run build`: passed, including TypeScript and SW
  syntax checking; existing large Firebase/character chunk warnings remain.
- Local production world-map suite: 9 passed, including 4 locales × 3 themes ×
  7 viewports, real mission settlement, no duplicate rewards, offline restoration,
  missing art/storage, reduced motion and real keyboard item use.
- Manually inspected captured 390×690, 480×320 and 1280×800 scenes. Kept the
  illustrated material family; fixed initial dock overflow and landmark overlap,
  then revised landscape anchors after screenshots showed an unnatural cluster.
- `git diff --check`: passed. Deterministic scan of hub/map/markup: no findings;
  this is not proof of visual quality or accessibility conformance.
- Review was sequential self-review; no independent reviewer agent was available.
  A broad `test:all` invocation was stopped when it included frozen character
  unit cases; completion uses the scoped runner above, not that interrupted run.

# Gameplay stability audit — 2026-10-03

Scope: the gameplay shell, feedback, canvas presentation, input and pause/quit
lifecycle. This continues the locally committed hair palette change; neither
change is deployed by this task. No account writes, scoring-rule changes,
geometry changes, external assets or new production dependencies.

## Observed defects

Read-only isolated guests inspected ten viewport/theme/locale samples on the
live site and the local source. Live geometry matched the local baseline. The
local diagnostic scene also exercised the existing development-only handles;
it did not add a production debug API or alter users' browser storage.

- The combo was absolutely positioned above the board inside a clipped
  scroller. A 35–37px badge plus its 10px gap exceeded the 26px reserved strip.
  In 844×390 landscape its measured top was −3px. Paper showed half the badge.
- The 568×320 layout stayed stacked, leaving only 37px of visible board height;
  740×360 left 80px. Comfortable 44px gems existed below the clipped viewport.
- Item hint visibility changed available board height; a 720×720 sample changed
  canvas height from 429px to 420px. Introducing a separate scroll-control row
  could consume another 44px just when the board needed that space.
- Floating score text was drawn without a bounds check. A diagnostic label at
  (10, 8) had a roughly 64px half-width and 22px half-height, clipping two edges.
- Strong hits translated all board pixels by up to 7px while hit testing used
  unshifted coordinates. Resized effects kept obsolete pixel positions.
- Pause did not pause progression, allowing a result overlay to arrive behind
  a pause sheet. Ending during an accepted move could bank a partial score that
  disagreed with its replay. A gesture begun while busy or retained after window
  blur could be acted on after its original context disappeared.
- Additional content gates found that a five-digit goal count could extend
  beyond its column, and a narrow landscape profile ring did not have room for
  its reaction scale. Full counts now fit their gem-token container, and the
  portrait reserves its circular ring and maximum scale, without cropping it.
- Final production screenshots exposed a clipped keyboard-focus outline: its
  outside offset exceeded the scroller's padding. The established 2px board
  outline now sits inside the canvas, retaining all four edges without adding
  a new layout row, changing target coordinates or intercepting a touch.

An initial capture script raced an automatically disappearing Skip button; that
fixture was corrected before the accepted baseline. Initial regression gates
also caught the new badge animation overriding reduced motion and insufficient
board height in a 480×320 split-window. Both were corrected without lowering the
acceptance thresholds.

## Decisions and acceptance

- A permanent feedback lane lives outside `.stage`; chain/fusion/hint badges
  wrap within its bounds, remain visible after board scrolling and never spend
  a pointer input. Their status region is polite and atomic.
- Three equal HUD regions remain. Goal labels reserve two lines, and item hints
  retain a permanent slot, so feedback/selection cannot change targets. These
  slots also reserve space from the existing type tokens when text is enlarged.
  Goal counts remain unabridged; their size adapts to the token's actual width.
  The ring's actual circular extent, not its transparent rotated-square box,
  is checked at all sampled reaction times.
- Compact landscape switches to a rail at 560px, rather than 760px. A narrower
  window below 400px height uses a compact stacked HUD: secondary level/unit
  and portrait-reaction text remain nonvisual, while the goal name, gem/count,
  portrait, moves, feedback and all controls stay visible. This is an explicit
  space trade-off, not removal of the goal or its quantity.
- Only the board scrolls. Up/down controls share the existing circular footer;
  they never add a separate row. Exit stays last at the lower right. All visible
  footer targets are at least 44px across the checked layouts.
- Grid coordinates never move for a hit. A finite stationary plate highlight,
  local bursts and avatar motion keep impact; reduced motion suppresses them.
  Entire score strings and their halos are fitted inside the canvas.
- Actual size/DPR changes update the backing canvas only when needed and clear
  transient pixel effects, not the game state. Visible viewport height handles
  browser chrome; pinch zoom is not interpreted as a new board layout.
- Pause freezes progression, including nested help. Quit completes only the
  action already accepted, then banks once; its record must verify. Background,
  blur, resize and busy-start gestures cannot become accidental swaps.

## Verification record

Evidence is generated under `/tmp/chroma-game-stability.jRKazw` (temporary).
`scripts/audit-game-screen.mjs` recreates guest baseline captures/measurements.
`tests/studio/game-stability.spec.ts` covers 12 sizes × three themes × four
locales (144 combinations), with all six fusion announcements, five chain
levels and the fusion hint (1,728 message-boundary checks). It also checks real
item consumption, pause/blur, canvas text bounds, impact transforms, resizing,
quit replay consistency, visible-viewport/inset simulation and touch emulation.
Additional gates inspect score/power/all six colour goals and translated item
instructions in four sizes × three themes × four locales, 21 time samples for
each of five profile reactions at seven sizes, and 200-percent text-token
reflow. The text fixture does not claim native browser text-zoom conformance.
The existing feedback/fusion/responsive suites cover real seeded cascades,
keyboard use, old saves, level transitions and physical-hinge simulation.
The production test uses the real keyboard UI for seed 18's 16→22 two-chain;
its score is independently reproduced by the engine, without a debug hook.

Confirmed local checks:

- `npm run typecheck` and `git diff --check`: pass.
- `npm test`: all 212 unit tests pass, none skipped.
- `BASE_PATH=/chroma-match/ npm run build`: pass. Existing lazy Firebase/3D
  chunks still produce the advisory about chunks above 500 kB; no dependency
  was added. Final built entry: `index-CqLo_DHk.js`, CSS: `index-DfIyIOrr.css`.
- New gameplay stability suite: 23/23 pass on the final runtime source,
  including all-theme keyboard-focus visibility.
- Existing feedback/fusion/responsive scenarios: 17 passed together; one
  loadout timed out when a Vite source reload detached its DOM. The trace's
  second document request at 03:40:09 UTC matched the source edit at 03:40:08.
  That unchanged scenario passed on rerun after edits stopped (1/1). This was
  not hidden behind automatic retries or a longer timeout.
- Selected existing experience suite: 3/3 pass (nested help/focus, every short
  board row reachable with keyboard, cached expressions with reduced motion).
- Final isolated diagnostic captures: 10/10 without page errors, document
  overflow or item-hint geometry changes. In 568×320, visible board height is
  now 146px instead of 37px; 740×360 is 186px instead of 80px. At 1280×800 all
  420px of canvas plus 8px stage padding fit without an unnecessary scroll row.
  Strong impact's board-space transform is `[1, 1, 0, 0]`.

- Production-browser suite: 7/7 pass before the final focus-offset-only patch,
  including the actual two-chain keyboard flow, resize/pause focus, cached
  portraits, wardrobe
  save/reload, offline recovery and model/license/entry-asset checks. It targets
  the local `/chroma-match/` build, not the live deployment. After that CSS-only
  patch, the production game scenario passed again (1/1) against the final
  built entry above. Its real-chain and six viewport screenshots were reviewed
  alongside final diagnostic captures and all-theme keyboard-focus captures.

Reproduce the core gates from the repository root:

```sh
npm run typecheck
npm test
BASE_PATH=/chroma-match/ npm run build
npm run test:studio -- tests/studio/game-stability.spec.ts
npm run test:studio -- tests/studio/feedback.spec.ts tests/studio/fusion.spec.ts tests/studio/responsive.spec.ts
npm run test:release
node scripts/audit-game-screen.mjs http://127.0.0.1:5174/ test-results/game-audit
```

For development-server gates, finish source edits before starting the tests:
an HMR navigation invalidates the in-flight UI just like a manual reload.

Self-review checked state/replay integrity, scope, CSS specificity, ring/count
bounds, input ownership, fixed feedback slots and real captures. New gates
identified and resolved material defects. No separate independent reviewer was
available; this is a code/runtime cross-check, not an independent audit.

## Boundaries

These are browser and code observations, not user research or retention data.
Chromium and mobile touch/viewport emulation are available. Physical iOS/Android,
native Safari/Android WebView, actual fold sensors/notches, assistive technology
and display calibration are not tested. WebKit/Firefox binaries are not installed;
none were downloaded. Sizes below the inspected 320px-wide / 320px-high range
are not claimed to fit all chrome at once. The board remains 6×9, matching the
existing deterministic saved/replay format. Hosting and full repository-wide
browser suites are separate from these targeted checks.

## Deployment gate correction — 2026-10-03

The first Pages run for merge `9339667` stopped before building or deploying:
104/109 browser tests passed, while five exposed cross-platform issues. The
Linux native scrollbar reduced a 320px phone's gems to 43.67px, and Linux's
system-font advances made a six-character score badge extend beyond its narrow
landscape HUD column. An older lobby test also measured newly added scroll
buttons while they were intentionally hidden on a fitting board.

The correction preserves the original acceptance thresholds. Narrow phones
reserve room for a classic native scrollbar and use the already inset board
focus outline rather than extra scroller padding. Goal-count sizing uses the
actual system font's widest digit advance, not an assumed .62em multiplier.
The lobby test measures all visible footer controls, including scroll controls
when present. A new regression reserves another 17px gutter and uses a wide
monospace digit carrier so both problems are reproducible on overlay-scrollbar
macOS as well as CI. No workflow gates, scoring, model assets or dependencies
were changed.

Confirmed corrected local checks: type checking, all 212 unit tests, 24 gameplay
stability tests, the three previously failing experience/lobby/responsive
scenarios and the production build. Evidence is under
`/tmp/chroma-deploy.yy0Mtu`. The first failed run did not modify the live site;
subsequent CI and live verification must be checked separately before claiming
deployment success.

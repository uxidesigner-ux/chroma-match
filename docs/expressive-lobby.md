# Expressive lobby and square matches

## Accepted scope — 2026-09-21

The user requested broader matches, expressive character feedback, a three-part
game HUD, circular bottom controls and a full-body animated lobby. They explicitly
approved deferring male/female models and new outfit packs until compatible,
licensed assets are available. No placeholder gender selectors or unlicensed
models are included.

## Acceptance criteria

- Same-colour 2×2 squares match and generate a bomb; L/T/+ and straight matches
  still work. Overlapping groups never double-count a cell.
- Adjacent powers of any colours can fuse in one move with the existing six recipes.
- New runs use v3 (`zx`), v2 (`zy`) and v1 records replay without changing their
  original boards, moves, powers, items or scores.
- Goal / large character portrait / moves occupy equal thirds above the board.
  Colour goals use the current skin's shape and colour, with remaining count on
  the lower-right. Score and best readouts are not shown on the game screen.
- Clear, power, fusion, chain and victory events trigger distinct portrait reactions.
  Reduced motion keeps textual feedback without animated scaling or spinning.
- Bottom gameplay controls are circular, with pause/leave at the far right.
  Leaving retains the existing explicit keep/end choice.
- Home displays the saved full-body model with breathing, blinking and subtle
  head movement. Drag, arrow keys and Home control rotation; gesture buttons offer
  wave, cheer and pose. Reduced-motion gestures produce a still pose.
- Settings/help are icon-only with translated accessible names and titles.
- Existing hair, expressions, colour and explorer-equipment options remain real
  model edits. Gesture previews do not mutate the saved appearance.
- Network/WebGL failure is retryable and never blocks Play. Lobby owns one
  renderer and aborts/disposes it when switching to game, shop or editor.
- Small screens can scroll rather than reduce the nine-row board below usable
  size. No horizontal overflow; native keyboard controls and focus indicators.

## Engineering boundaries

No new runtime dependencies or model assets. No cloud profile/rules changes.
The first lobby visit loads the existing approximately 11 MB model; offline 3D
requires it and the lazy renderer chunk to have been cached. Portraits remain
cached images and do not use a renderer every time gems clear.

Rules logic is shared with replay verification. Square matches are merged with
straight runs using the same union-find; fresh v3 boards avoid free squares.
Legacy generation takes the original PRNG path. Unit coverage exercises square
edges, overlaps, legal moves, clean boards, and exact v3 replay/resume.

## Verification commands

```sh
npm run typecheck
npm test
npm run test:studio
BASE_PATH=/chroma-match/ npm run build
npm run test:release
```

Browser coverage includes lobby lifecycle, keyboard rotation, gestures, three-way
HUD geometry, circular buttons, square-only pointer moves, remaining-goal counts,
reduced motion, unavailable-model recovery, saved appearance and offline reopening.
Actual test results and deployment evidence are recorded in the delivery report.

No independent reviewer agent was available; use code review plus automated and
visual runtime checks. Physical-device GPU and full screen-reader audit remain
outside the local-browser verification scope.

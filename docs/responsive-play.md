# Foldable and resizable gameplay

## Decision

Device-independent responsive presentation, not adaptive puzzle geometry.
Keep the existing 6×9 board, RNG, rules, objectives, saves and replay verification.
8×8/new logical sizes are intentionally separate balance/versioning work.
User scenario hypotheses below are inferred from the request, not research.

| Scenario | Behavior |
| --- | --- |
| Cover display / portrait phone | Equal goal/profile/moves HUD above board |
| Continuous unfolded square display | Expand square gem size; use side-by-side layout when room permits |
| Wide unfolded display / tablet / desktop | At least 700px and aspect ≥0.95: HUD rail left, board right, circular controls below; exit at right |
| Physical hinge separating panels | Largest valid viewport segment; tie goes top/left; never straddle gap |
| Fold, rotation, split-window, resize during play | Preserve run; recompute layout; cancel incomplete pointer gesture |
| Short landscape window | Scroll instead of forced rotation or undersized gems |
| Unsupported segment API | Normal responsive full viewport; physical hinge avoidance cannot be guaranteed |
| Keyboard / reduced motion | Existing keyboard controls; no layout animation; preserve focus and selected gem |

Minimum stage height 450px reserves nine 44px cells, board plate and combo
space. Width can still constrain targets below 44px at viewports narrower than
320 CSS px; these are outside the tested width range. Short viewports require
scrolling and may not show HUD, full board and controls simultaneously.

The game shell alone expands beyond the former 620px cap. Editor and lobby
retain their existing layouts. The wide-mode HUD remains three equal columns
within its rail, a deliberate exception to placing it at screen-top center.

Uses `window.viewport.segments` when available, resize and segment media-query
change events. No device name / user-agent assumptions. API documentation:
https://developer.mozilla.org/en-US/docs/Web/API/Viewport/segments

## Acceptance / verification

- 320×568, 390×844, 720×720, 900×720, 844×390, 1280×800, 480×800.
- Same grid, moves, score and goal across every size; no horizontal overflow.
- Gems and circular controls ≥44 CSS px in the above matrix.
- Resize mid-drag cannot spend a move; a subsequent real swap still works.
- Synthetic hinge segments remain outside board bounds.
- Existing saved games/rules remain unchanged (no migration).

Real foldable hardware, Safari/Android WebView posture delivery, browser chrome,
and physical hinge measurements need device testing; synthetic viewport tests
do not establish support on a named device, including any unverified iPhone model.

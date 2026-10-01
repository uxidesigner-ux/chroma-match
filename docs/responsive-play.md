# Foldable and resizable gameplay

## Decision

Device-independent responsive presentation, not adaptive puzzle geometry.
Keep the existing 6×9 board, RNG, rules, objectives, saves and replay verification.
8×8/new logical sizes are intentionally separate balance/versioning work.
User scenario hypotheses below are inferred from the request, not research.

| Scenario | Behavior |
| --- | --- |
| Cover display / portrait phone | Equal goal/profile/moves HUD above board |
| Continuous unfolded square / tablet / desktop | Centred board, equal goal/profile/moves HUD above; no empty rail |
| Short, wide display | Width ≥760px, height <600px and aspect ≥1.45: HUD rail left, board right, tools below |
| Physical hinge separating panels | Largest valid viewport segment; tie goes top/left; never straddle gap |
| Fold, rotation, split-window, resize during play | Preserve run; recompute layout; cancel incomplete pointer gesture |
| Short portrait / landscape window | Scroll only the board; HUD/tools stay visible. Explicit row-view buttons and keyboard auto-scroll |
| Unsupported segment API | Normal responsive full viewport; physical hinge avoidance cannot be guaranteed |
| Keyboard / reduced motion | Existing keyboard controls; no layout animation; preserve focus and selected gem |

Minimum board frame 280×420px reserves nine 44px cells and the plate. The stage
may be shorter and scrolls independently, with controls enabled only when content
overflows. Widths below 320 CSS px remain outside the verified range. A short
viewport cannot show all nine rows at once; target size takes priority.

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

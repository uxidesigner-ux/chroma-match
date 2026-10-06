# Five tools and dimensional gems

## Scope and acceptance

- Primary task: clear the puzzle using five recognizable tools without spending a move.
- First read: visible board, target, moves, five consistent icon/count controls.
- Secondary explanations remain in accessible names, tooltips and the fixed targeting lane.
- Bow is targeting mode: hold/slide to preview a column, release to fire; cancel/Escape costs nothing. Keyboard arrows preview, Enter fires.
- Shuffle is immediate: one press rearranges gems, gives finite motion/sound/portrait feedback; busy input cannot double-spend.
- Reduced motion shows destinations directly. Small windows keep 44px controls, inline scroll controls where they fit, or a separate scroll-control row below 390px and no horizontal page overflow.
- Distinct silhouettes, saturated colours, raised edges and highlights distinguish gems from wells in Jewel, Paper and Glass. Existing themed surfaces remain.

## Compatibility

Free rules v9 use zr; campaign v10 uses zq. Fresh entry uses named constants.
Default low-level Game and bare encode/decode helpers intentionally remain v5
for existing callers. Real records always pass their explicit rule version.
Legacy three-item encoding, inventory and payouts remain immutable. Old ledgers
may omit bow/shuffle: absent means zero, not reset historic statistics.
Both extras are included in shop/loadout/stat totals with finite stock validation.
New rewards rotate through five tools; original v8 rewards retain their rotation.
New shuffle retains anchored crates and holes, and earned powers even on bounded
fresh-deal fallback. Fallback may redeal colours rather than preserve an impossible
colour distribution. No automatic match, score, move or goal credit.

## Graphics and source

Original bow asset: public/ui-icons/bow-v1.webp. Built-in image generation,
transparent output, existing rocket used only as material-family reference.
Prompt: chunky golden archer bow, single upward blue arrow, blue grip and taut
string, polished dimensional casual puzzle-game style, upper-left lighting,
readable at 44px, centred transparent canvas; no text, branding or watermark.
Inspected original output and resized to 192px WebP preserving transparency.
Shuffle uses the existing original dimensional shuffle icon.
Gems are Canvas paths, no sprite dependency or additional per-frame randomness.
Impeccable's restrained-app default is intentionally overridden by the approved
colourful casual-game direction; animation explains firing/rearrangement only.

## Review boundary

3D model, editor and character rendering tests are unchanged/excluded.
Browser touch simulation is not physical iPhone/Fold validation.
Latest request does not authorize live release; no production push in this task.
Validation results are recorded below after actual execution.

## Verified 2026-10-07

- npm test: 204 passed, character suites excluded by the existing game runner.
- npm run typecheck: passed.
- BASE_PATH=/chroma-match/ npm run build: passed; existing optional studio/Firebase large-chunk warnings remain.
- npm run test:game-ui: 42 passed on final source, including browser touch,
  cancel/reduced motion, five-tool keyboard use, actual usage statistics,
  320×568 / 390×650 / 390×690 / 844×390 / 720×720, all three themes.
- npm run test:release: 17 passed against the final production build; verifies
  spent bow/shuffle stock through reload, old v4 restore, fixed board geometry,
  first-clear deduplication and offline map recovery. No production debug API.
- git diff --check: passed; no src/avatar changes.
- Rendered screenshots inspected for Paper/Jewel/Glass, aimed columns and short
  portrait board/tool containment. Final 390×650 displays the full nine-row board.
- Direct code/UX review (no independent reviewer available): fixed the short-phone
  footer-height regression with inline scroll controls at sufficient width and
  removed extra vertical footer padding. Busy tools now disable without moving
  targets. New-item payout labels and totals follow the recorded rules.
- Test harness refinements: await actual asynchronous game entry and settled
  cascades before spending; statistic settlement is checked after real replacement
  start, not before its transaction. Final complete suites rerun successfully.

Internal quality gate: task clarity, hierarchy, graphic meaning, interaction,
contrast/themes, accessibility/resilience and focus each meet the 4/5 internal
review threshold based on source, screenshots and scenarios above; these are
review judgments, not user research or measured engagement. Physical Safari,
iPhone/Fold hardware and real cloud ranking submissions were not tested.
No dependencies added, character implementation untouched, no live deployment.

# Experience quality — 2026-10-01

Implements the approved live/source audit, with the existing expressive game and
licensed character as the design baseline. Scenarios are task hypotheses, not
user research. This document supersedes historical layout/scope descriptions.

## Observable acceptance

- Goal explicitly names what remains and its unit; earned score/best are not
  brought back to gameplay. Four languages cover all new dynamic copy.
- All overlays own focus, isolate the background, trap Tab/Shift+Tab and restore
  the launch control. Escape closes only the top dismissible layer. Result
  dialogs require an explicit action; Escape does not submit or abandon a run.
- Square/desktop layouts retain goal / profile / moves above the centred board.
  A rail is restricted to short wide windows. The 6×9 puzzle, RNG, rules, saved
  runs and scores never change on resizing or scrolling.
- Short windows preserve ≥44px gems, circular tools and exit on-screen. Explicit
  row-view buttons avoid scroll/swap gesture conflict; keyboard reveals its cell.
- Every editor category is visible without horizontal tab discovery. Portrait
  thumbnails preview styles, hair and expressions using the loaded renderer,
  not one model decode per option. Initial sheet height leaves options visible.
- Save/loading/error/local-versus-account sync feedback stays in the screen
  header. Changing a saved draft clears the success marker. Explicit Save alone
  commits; undo/import/library/discard keep their prior semantics.
- Cached happy/surprised/relaxed portraits react to match events. Gameplay does
  not fetch the model or run WebGL. Missing reaction caches fall back to the
  normal face and text, not a blocked game. Reduced motion suppresses movement
  but retains meaningful still expressions and explicit gesture poses.
- Initial 3D loading is optional; retries/errors remain local to the character.
  Lobby standing adds bounded breathing/weight shift without body-offset drift.
- Nav destinations have captions. Settings/help remain icon-only as requested.
  Help starts with three visual examples; detailed recipes/keys are optional.
- Paper muted text is darker and focus rings use ink, not low-contrast yellow.
  Settings choices retain at least a 44×44px target and roving keyboard focus.
  Essential copy is 14px; compact captions/count metadata use a deliberate 12px
  exception. Three game themes and four locales remain intact.
- Dense figure/colour categories intentionally scroll even at the highest stop;
  tools follow their options instead of being pinned to the sheet floor. Gesture
  tests choose their starting stop explicitly, independent of the initial height.
- Editor resize listeners are removed on close. Captured portraits ignore the
  editing sheet's camera offset and restore interactive framing afterwards.

## Verification and boundaries

Run `npm run typecheck`, `npm test`, `npm run test:studio`,
`BASE_PATH=/chroma-match/ npm run build` and `npm run test:release`.
`tests/studio/experience.spec.ts` covers optional boot, nested focus ownership,
short-window access, all tabs/save state and static cached reaction faces.
Existing suites retain save/reload/offline, exports, figure/hair geometry,
resizing, fusion, reduced motion and historical replay checks.

Local verification: typecheck, 186 unit tests and the Pages-path build passed;
the 62-case sweep passed 59 cases and exposed three outdated sheet-layout
assumptions. After adapting those fixtures to the intentional layout, all nine
targeted checks passed, including the new settings target/focus check. Both
production release checks passed again. The complete 63-case suite remains the
CI gate before Pages deployment. Direct browser review covered phone, square
unfolded, desktop and short landscape layouts, nested help and Paper keyboard
focus; the reviewed tab reported no console errors or warnings.

The review is a direct code/runtime review, not independent participant testing.
Real iPhone/Android/foldable GPU and hinge behaviour, VoiceOver/TalkBack and actual
player comprehension still need physical-device and user validation. No 10/10,
universal device support or full WCAG-conformance claim follows from these tests.
No new dependencies, paid services, model assets, cloud schema or game-balance
changes are introduced. Existing bundle-size warnings remain a known limitation.

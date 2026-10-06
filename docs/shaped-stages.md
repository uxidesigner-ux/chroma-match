# Shaped stages and earned victory — 2026-10-06

## Scope and observable acceptance

- New campaign runs use v8 (`zs`); saved v1–v7 runs replay their original rules.
- Every region uses a full board at stages 1–5, trimmed corners at 6–12,
  a narrow central waist at 13–20, and a cross-shaped silhouette at 21–30.
- Stages 4–9 contain two anchored blocks, 10–19 three, and 20–30 four.
  Blocks require two hits before stage 16, then three. Pips show remaining hits.
  Neighboring match clears, powers and items damage them once per resolved wave;
  overlapping blast targets do not multiply one wave's damage. Cascades may
  legitimately hit a block multiple times in a single player action.
- Blocks cannot swap or match as a gem colour. Blank terrain never refills.
  Each uninterrupted column segment falls/refills independently. Dead-board
  shuffles and capped cascades preserve surviving blocks and terrain.
- All 120 authored missions retain their goals, move budgets and original seeds.
  This is deterministic stage variation, not a claim of user-tested difficulty.
- A successful verified campaign result opens the existing accessible modal,
  with decorative, finite fireworks and icon/label/value reward groups for
  score, actual coins, XP and any actually paid stash item. Existing next/map
  actions, focus trapping/return and storage-error retry remain intact.
- Each first v8 mission clear pays one rotating hammer/rocket/bomb to the
  persistent stash in the same IndexedDB transaction as XP, coins and progress.
  Same-attempt retry and genuine replay do not pay this first-clear item again.
  Old mission clears are not retroactively rewarded; session-only play does
  not promise persisted rewards. Ordinary in-run item supply remains unchanged.
- Empty cells and layered blocks have localized keyboard announcements.
  Arrow navigation skips blank terrain. Targets retain the existing 44px floor.
  Reduced motion removes fireworks rather than hiding earned result information.

## Design decisions and boundary

References are composition/gameplay examples, not copied assets. Existing
original 3D-style prop icons and blue/gold/violet materials are reused. The
metal blocks are procedural Canvas drawings, independent of character WebGL.
Celebration has no flashing full-screen layer, countdown, extra purchase or
new dependency. The Impeccable product register informs readable hierarchy,
contrast and motion alternatives; expressive game materials deliberately retain
the established product direction instead of adopting restrained app styling.

3D character source and rendering tests remain frozen. No independent agent
reviewer is available; direct source and rendered-screen review is distinct from
an independent review. Physical iPhone/Android touch and GPU performance remain
unverified. Automated Chromium mobile checks are not physical-device evidence.

## Verification checkpoint

Unit coverage checks all 120 initial deals, masks, fixed blocks, segmented
gravity, shuffle invariants and v8 replay/restore. An automated best-move player
with three starting bombs found a clear for each of the 120 authored seeds;
this is a solvability smoke check, not engagement analytics or a win-rate study.
Browser checks exercise real map → loadout → shaped-game entry and atomic
first-clear item payment, plus existing release save/recovery paths. Final
command outcomes and deployment evidence are recorded after execution.

Completed locally:

- `npm test`: 199 passed, including all 120 authored v8 clear/replay proofs.
- `npm run test:game-ui`: 35 passed. Added stronger HUD/text bounds checks to
  the terrain cases and reran the affected cases afterward.
- `BASE_PATH=/chroma-match/ npm run build`: passed (existing large chunk warning).
- `npm run test:release`: 17 passed, excluding frozen character rendering tests.
- After the final landscape result-panel refinement, rebuilt and reran the
  production real first-clear/reward/motion/responsive case: passed.
- Inspected mobile shaped-board screenshots and portrait/landscape result
  screenshots. The final landscape panel fits title, rewards and both actions
  at 844×390 without requiring a vertical scroll.
- Direct diff review and whitespace checks passed. No avatar source changes or
  production dependencies. The references informed composition without asset reuse.

The release commit will publish through the existing GitHub Pages workflow,
which gates deployment on unit, production and four sharded UI jobs. Live
asset hashes and browser mission/recovery flows must be checked after that job;
a queued workflow is not a successful deployment.

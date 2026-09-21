# Power fusion

Player outcome: deliberately combine two adjacent power gems without needing a
three-colour match, spending one move for a larger, readable detonation.

Working hypothesis: planning a pair is a more interesting decision than using
every power immediately. Engagement and difficulty effects are not user-research findings.

## Rules (new runs only)

The destination of the dragged gem is the fusion centre. Either tap order is
valid; the preview identifies the destination. Both ingredients are consumed.

| Pair | Effect |
| --- | --- |
| Stripe + stripe | One row and one column through the destination |
| Stripe + bomb | Three rows and three columns through the destination |
| Bomb + bomb | 5×5 area centred on the destination, clipped at board edges |
| Prism + stripe | All gems of the stripe's colour fire in its stripe direction |
| Prism + bomb | All gems of the bomb's colour fire a 3×3 blast |
| Prism + prism | Whole board |

Other powers caught in the effect detonate once. Ingredients do not also fire
their old individual blast. No extra fusion bonus: unique cleared gems use the
existing points-per-gem / cascade multiplier. Transformed gems are not newly
earned powers and do not increment power-creation goals.

## Presentation and acceptance

- Selecting a power highlights adjacent eligible partners, plus a short hint.
- During a fusion, a 300ms convergence connects the two actual cells before the
  existing strike/clear/fall phases. Only actual targets are illuminated.
- A named fusion callout remains briefly; no modal, new controls or board resizing.
- Reduced motion shows stationary connectors/target emphasis and the same text.
- Four languages, three skins, existing pointer navigation retained. The board
  additionally supports arrow keys, Enter/Space selection, Escape cancellation
  and Tab exit, with cell/power descriptions and visible focus.
- Busy or non-adjacent input cannot spend moves; each fusion records one swap.
- Tests cover all pairs, edges, deterministic replay, old runs, save/resume,
  chain reactions, unique scoring, reduced motion and browser play.

## Compatibility

Rules v1 remain available for every unversioned record. New v2 records have a
reserved `zy` two-character header in `moves`; the remaining two-character action
encoding is unchanged. Header code 1294 is outside the action range for every
board accepted by the existing packing bound. A header elsewhere is invalid.
No Firestore schema/rules change is needed: the existing base36 string transports
the marker. The 8000-character wire cap still applies (3999 actions in v2).
Old clients cannot verify v2 rows and must refresh; new clients verify both.
Existing best scores are not reset. Legacy saved games continue with legacy rules.

Non-goals: new economy/unlocks, full-body avatar motion, server-side verification,
production deployment. The existing rules only validate storage shape; client
replay remains the score check, not a newly claimed trusted server verifier.

## Verification checkpoint — 2026-09-21

- `npm test`: 146 passed, including all ordered power pairs, legacy golden
  replay, v2 replay/restore, scoring and encoding bounds.
- `npm run test:studio`: 22 passed, including nine fusion cases, existing avatar
  editor flows, four locales, small viewports and live reduced-motion changes.
- `BASE_PATH=/chroma-match/ npm run build`: passed TypeScript, service-worker
  syntax and production bundling. Existing large dependency chunk warnings remain.
- `npm run test:release`: two passed against the production-path build, including
  pinned model integrity, guest avatar persistence and offline reopening.
- Recorded real pointer play with seed 3: `zy3s50`, two moves, 2,290 points.
  No page errors; the saved avatar portrait was ready and no VRM loaded during play.
- Self-review checked target/animation alignment and legacy-rule propagation;
  no separate reviewer agent was available. Physical-device performance,
  screen-reader usability and gameplay balance remain unvalidated.
- No dependency additions, remote score writes or production deployment.

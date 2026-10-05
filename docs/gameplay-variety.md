# Gameplay variety — rules v4

The repeated score ladder is the reported problem. These are design hypotheses,
not researched retention or dopamine claims. Existing board geometry, HUD thirds,
fixed feedback lane, themes, controls, character assets and purchasing stay intact.

## Design brief

1. Help a player who reports repetitive score chasing enjoy varied decisions and clears; this is a task-based hypothesis, not a demographic persona.
2. Keep goal, character and moves as the first three readouts; the existing profile is also the earned fever control.
3. Do not add a fourth HUD region, mid-cascade interruptions or new shop/navigation tasks.
4. Play stays a play mode; upgrades are a single choice at the existing stage-complete boundary.
5. Charge, activation, supplied powers, selected upgrade and bonus rules have explicit feedback; invalid/unearned actions cannot pay rewards.
6. Retain time-free play, pause, exact save/reload, original replay generations, keyboard focus, reduced motion and enlarged-text reflow.
7. Reuse the three established themes, current portrait and fixed feedback lane; shapes and text still communicate state without colour alone.

## Observable contract

- Only new runs use v4 (`zw`). v1–v3 records replay under their original rules.
- Clears charge the profile to 100. One action earns at most 35; active fever
  earns none. The ring never decays with time. Activate only on a settled playing
  board; activation costs no move. The next three accepted swaps each leave a
  bomb or stripe. Invalid swaps and items don't consume a fever turn. A bonus
  power is supplied once after the cascade, not on every cascade link.
  Fever and factory rewards stack: each supplies its own power gem.
- At stages 3, 6, … choose one eligible run-long upgrade before proceeding.
  Bombs gain a 5×5 then 7×7 blast; stripes gain one then two adjacent lines;
  colour echo clears up to two then four additional goal-colour gems on the
  first power hit of an action (origin colour on non-colour goals). Each caps
  at tier 2; after all six upgrades there is no further mandatory choice.
- Stages 5, 10, 15, … rotate bomb factory, three-colour festival, fusion relay.
  All award five extra moves and have a score goal at 80% of the usual target.
  Factory starts with three bombs and supplies one after each accepted swap.
  Festival uses a fresh, match-free three-colour board and three-colour refills.
  Relay starts with three adjacent power pairs and replaces an accepted fusion
  with one adjacent pair. Outside those rounds normal colour count is restored.
- Stage entry changes the deal only on entering/leaving a bonus round; never
  changes geometry. No free points/instant matches are awarded on entry.
- New-rule cascades end at eight links. If refill still matches, a match-free
  deal finishes the action with surviving power gems preserved at their cells,
  no free points, and a visible finish message. This replaces observed 38-second
  bonus cascades with a bounded action duration; old replay phases stay unchanged.
- Fever activation, upgrade choices and stage continuations are ordered, bounded replay actions.
  Restore reproduces charge, turns, upgrades, pending choices and bonus boards.
  An unpaid activation, unavailable choice or skipped required choice is rejected.
- Profile activation is a named keyboard button. Choices use native radios and
  a disabled-until-selected confirmation. Ready/active/charging are legible without
  colour. Reduced motion removes decorative pulses without hiding state.
- New copy covers Korean, English, Japanese and Simplified Chinese. In the three
  themes, phone/short phone/fold/desktop keep the same board size and hit targets.

## Deliberately excluded

Micro-challenges, new cosmetic rewards, time pressure, new models/dependencies,
paid engagement mechanics, live deployment and a leaderboard backend migration.
Existing ranking already mixes replay rule generations; v4 rows must identify
their rules rather than imply an identical scoring opportunity. Strict versioned
competitive ladders require a separate backend/query decision.

## Validation checkpoint

Verified locally on 2026-10-05. No production deployment is included.

- `npm test`: **236 passed**, including the 13 new engine/replay/restore/eligibility/cascade/synergy tests and existing avatar/wardrobe regressions.
- `BASE_PATH=/chroma-match/ npm run build`: passed TypeScript, service-worker syntax and production build. The existing large Three/VRM and Firebase chunk warning remains; no dependency was added.
- `node scripts/check-variety.ts`: **100 seeds × up to 200 actions** passed, all three bonus types visited, every resulting record verified. Maximum 439 frames (**7.32 simulated seconds**), 193 cascade caps, highest stage 28. This is a declared animation-budget check, not a physical-device performance or retention benchmark.
- Targeted stability/fusion/variety browser run: **39 passed**, including legacy-to-v4 restart, all supported viewport/theme/locale matrices, pause, scrolled targeting and profile reaction peaks.
- Final new-feature/enlarged-text/space-allocation browser run: **12 passed** (all eight new variety scenarios and all four existing game-space regressions).
- Existing keyboard/gesture lobby rotation, 3D resource release and safe game/lobby return: passed in the separate 12-test regression run.
- Final production-build browser run: **5 passed** — pinned model/license/built assets, two DPR3 scrolled-input/effect cases, real keyboard cascade across seven viewport sizes, and v4 pending choice/upgrade/active-fever save/reload without development APIs. No page errors in the verified gameplay flows.
- Local release-candidate entry: `/chroma-match/assets/index-BCe6OyPX.js`, stylesheet `index-6OwG6LDp.css`. These identify the tested local build, not the current live site.
- Visual inspection: actual mobile fever, opaque keyboard-selected upgrade card, bomb factory and built active-fever screenshots; enlarged text preserves full copy through wrapping/scrolling. Local evidence: `/tmp/chroma-variety-evidence.WmnDV8` (temporary, not a permanent asset).

Refinement resolved a 38-second three-colour cascade, historical effects/mission payouts during restore, immediately-after-continuation save ambiguity, transient upgrade-card transparency, repeated ready notices, enlarged bonus-label overflow and fever/factory rewards incorrectly merging into one. A global line-height experiment caused a 1.5px short-phone board overflow and was reverted; the existing compact line box is preserved and the final production regression passes.

Separate critical self-review covered deterministic state, bounded/forged actions, old-rule parity, modal ownership, enlarged copy, theme tokens and fixed hit geometry. No independent reviewer agent was available. Internal playbook gate (not a research score): task clarity 4/5, hierarchy 4/5, graphic meaning 4/5, interaction trust 4/5, themes 4/5, accessibility/resilience 4/5, task focus 5/5.

Remaining limits: Chromium automation and local screenshots are not physical iOS Safari/Android WebView or screen-reader verification. Sustained enjoyment and difficulty after upgrades cap need actual play feedback. Rankings are labelled, not isolated into separate competitive ladders. Existing complete 3D browser suite was not rerun wholesale; full unit and targeted lobby/production regressions cover the unchanged integration.

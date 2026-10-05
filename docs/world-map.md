# Chroma Isles — regional campaign

Approved request on 2026-10-05: implement the map proposal and deploy it, including
the previously implemented automatic starting items. This is product scope,
not retention research or a measured dopamine claim.

## Experience and acceptance gate

- Four original-art landmarks: Gem Forest, Blast Volcano, Prism Coast and
  Relay City. Each has five authored, numbered, replayable missions.
- Forest 1 opens all four regions. Inside each region, completing the previous
  mission opens the next. Available/selected/locked/complete use words and icons.
- Locked regions remain inspectable. Preview the rule, goal, move budget and
  first-clear reward; Start is disabled only for unavailable missions.
- Phone content scrolls independently of the fixed current mission/goal/Start
  footer and labelled navigation. Short landscape has adjacent map/detail
  columns and compact actions. Native region-list buttons support keyboard use.
- Fresh installations open Map; remember the last Map/Character destination.
  Character preserves the rotatable full-body lobby, editor, gestures, same-
  direction drag and refresh prevention. Campaign returns to Map. Keep Free play.
- Map does not initialize the 11 MB full-body VRM. Character starts its renderer
  on entry and disposes it on exit. Cached portraits keep their existing
  independent custom-portrait recovery path.
- Continue is visible on both destinations and names the saved mission. It
  restores exact spent stock. Starting another mission asks before replacement;
  cancelling item preparation still preserves the old run.

## Actual rules

| Region | Rule from the first board | Goal mix |
| --- | --- | --- |
| Gem Forest | Normal matching, squares and fusion | Score, blue/red collection, power creation |
| Blast Volcano | Three initial bombs; valid swaps supply bombs | Score, collection, bomb creation |
| Prism Coast | Three-colour deal and refill | Score, green/yellow collection, power creation |
| Relay City | Three power pairs; fusion replenishes a pair | Score, collection, power creation |

Every new mission receives three hammers/rockets/bombs without buying or picking
them. Two optional stash extras fit under the five-held cap. Items cost no moves.
Fever and eight-link cascade bounds remain. Each mission ends at its one clear;
no endless stage continuation or upgrade choice is inserted.

## State, proof, rewards and rankings

v6 encodes `zu` plus a stable two-character mission index, then existing actions.
Goal, moves and regional policy come from the authored mission; seed and actions
reconstruct all remaining state. Never reorder or edit the shipped v6 mission
table: future retuning needs a new rules version. Endless stays v5 (`zv`);
v1-v5 saved rules and stock remain unchanged.

The separate `chroma-match:campaign-v1` completion/best-score ledger does not
infer campaign progress from old best scores. A result must replay to
`levelComplete` with matching score/level before it unlocks or credits coins.
First-clear coins pay once across replay/reload. Re-read the persisted ledger
before claiming, so a stale second-tab instance does not pay an existing claim.

This is user-editable, device-local progress, not cloud sync or a server economy.
Write the claim before the existing separate wallet credit: a crash/quota failure
between writes may lose coins, never duplicate them. Blocked storage is explained:
progress lasts this visit and no first-clear coins pay. Simultaneous cross-tab
transactions are not an atomic backend ledger; cloud economy needs authenticated
transactions. Failed/retried missions preserve past clears and pay no campaign
coins. Both leaderboard adapters reject v6; mission scores never update endless
best/level or offer score posting.

## Original map art

Final workspace asset: `public/chroma-world-v1.jpg`, 1024x1536, about 671 KiB.
Built-in Imagegen generated the image; JPEG compression reduces web download size.
No Warcraft screenshot, character, logo or environment asset is embedded.
Existing external avatar/license notices remain unchanged.

Final generation prompt:

```text
Use case: stylized-concept
Asset type: original mobile match-3 adventure world map background, portrait 1024x1536.
Primary request: polished vibrant high-quality isometric 3D fantasy island world map for Chroma Match, four clearly different regions on one connected floating island in a calm dark-blue sea. No UI.
Composition: entire island inside frame with comfortable sea margins, bird's-eye isometric viewpoint. Four landmark zones at approximately (27%,28%) emerald gem forest with faceted crystals and trees; (73%,28%) red-orange volcano with a modest lava crater; (27%,70%) cyan-purple prism coast with luminous quartz and bright blue pools; (73%,70%) brass-and-slate mechanical city with round gears and a small industrial tower. Natural stone pathways connect all four, central crossroads. Large readable silhouettes at phone scale. Landmark shapes invite exploring but no characters.
Style: premium stylized 3D game environment, crisp clean modelling, softly bevelled geometry, clear coherent lighting, tactile glossy gems, lush forest, warm lava, crystal water and clockwork metal. Imaginative original design, not any existing franchise.
Constraints: no text, no labels, no lettering, no buttons, no pins, no badges, no UI frames, no logos, no watermark. No Warcraft assets, no copied screenshot. Keep focal landmarks away from outer edges. Balanced saturated colour regions with quiet sea background.
```

## Validation/release checkpoint

Initial evidence: seven new campaign tests passed, including exact restore for
20 contexts, live regional rules, forged contexts, finite-item solutions for all
20 authored missions, sequential unlocks and reward/storage failure boundaries.
Full units passed at 252. Five targeted Character/legacy browser checks passed.
Phone inspection found off-screen Start; the fixed action/mission footer fixed
it without changing gameplay geometry.

Local release acceptance on 2026-10-05:

- Full units: 252 passed. After final review, 16 campaign/supply cases passed
  again (including immutable authored seeds and stale-tab claims), and the new
  ranking-adapter test passed for both local and Firebase refusal before writes.
- Type checking and `/chroma-match/` production build passed. Existing large
  vendor-chunk warning remains; no new runtime dependencies were introduced.
- Full production suite: 20 passed. Final seed/utility-label/style adjustments
  were followed by six relevant production checks on the rebuilt artifact.
- Map matrix: 5 viewports × 3 themes × 4 locales (60 combinations), native
  list keyboard selection, fixed Start/navigation, 44px nav targets, no horizontal
  overflow, and enlarged text at 320x568. Actual screenshots reviewed at phone,
  short landscape and desktop, including enlarged text.
- Real keyboard item play cleared Forest 1 and opened every region. Spent stock
  restored exactly, cancelling preparation preserved the old mission, repeated
  verified-result reload paid no duplicate reward, and warmed offline reload
  retained map art and a playable mission. No development API was used.
- Character regression checks covered rotation/gestures/disposal/retry, loading
  skip, legacy saves, modal focus, hierarchy, localized captions, touch rotation
  without page scrolling and visible profile decoration. A new quiet Map button
  initially exposed a utility-border style assertion; aligned it with transparent
  utility borders and reran all three hierarchy cases successfully.
- Continue initially replaced its button subtree to show Loading, destroying
  labels needed during refresh. It now keeps those nodes mounted, disables the
  action with `aria-busy`, and restores state in `finally`; both mission recovery
  and terminal-result regression cases now pass without page errors.
- Diff review performed directly; no independent reviewer agent was available.
- Additional acceptance: played all 20 missions through the production screen
  using keyboard swaps/items, following a source-side deterministic policy (not
  a development browser API). Every clear's score, remaining inventory and the
  legitimate progress ledger matched; all four regions reached 5/5, exactly
  1,700 first-clear coins were credited, and no page errors occurred. Long Prism
  cascades settled in roughly 5.4–5.9 seconds under the normal 30s release
  assertion budget. This is functional proof, not human difficulty/retention research.

Release is gated by the GitHub workflow: full units, all four studio shards,
production build and full production suite, then Pages deployment. The existing
139 studio cases are partitioned across four independent runners, with one
worker per runner and no omitted cases. Deploy explicitly needs both the
production job and the complete studio matrix. Push does
not itself prove deployment. Check the exact commit, successful deployment job,
served asset bytes and fresh-browser live mission flow before reporting live.
Local shard inventory validation found 42/46/23/28 cases respectively: their
disjoint union is exactly the full 139-case suite. YAML parsing and deployment
dependency checks passed. No timeout, assertion or test coverage was removed.

The first parallel CI pass exposed two legacy test assumptions, not a map
geometry failure: fresh supplied stock deliberately gives first-use item guidance
priority over the idle fusion hint, and three enabled items add keyboard stops.
The returning-player geometry matrix now declares `used-item`; fresh guidance
retains its separate shared-lane priority test. Reverse tab traversal counts the
actual visible enabled tray controls instead of assuming empty inventory. All
13 affected cases and the fresh guidance test passed locally after this fixture
update. A new full CI pass remains required before release.

Dependency audit still reports four transitive high warnings inherited from
Firebase's Node-only `@grpc/grpc-js` dependency. The browser Firestore export is
used by this static build, and the served bundle does not contain the affected
server credential/auth-context path. This is a scope assessment, not a clean
security audit or permission to deploy a Node gRPC server. Track a separate
compatible dependency update before using that server path; do not force the
audit's proposed Firebase downgrade. Primary advisory:
https://github.com/advisories/GHSA-m9gg-hp2v-232j.

Deliberate exclusions: boss phases, terrain/obstacles, cloud progress, regional
rankings, timers, paid gates and external model packs. Balance playtests and
physical iOS/Android/screen-reader checks remain distinct from deterministic
solutions and Chromium acceptance.

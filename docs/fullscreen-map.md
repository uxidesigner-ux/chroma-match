# Fullscreen game-map lobby

## Product decision — 2026-10-05

User screenshot showed a small framed map above repeated rule/goal paragraphs
and a large preview card. The requested task is choosing a region, playing,
collecting and shopping, not reading a map explanation. This is an observed
layout problem and a user-specified direction, not new user research or a
measured retention claim. Reference games inform the action-led hierarchy only;
no franchise art or UI assets were copied.

The existing original island art now fills the viewport background. Remove the
visible map title, subtitle, repeated rules/goals/supply text, large region cards
and separate detail panel. Keep four compact labelled landmarks, five numbered
mission nodes, state badges, an earned route, upcoming/claimed reward, one Play
action and three bottom destinations. Wallet/+ opens the existing shop; daily
rewards, rankings and free play are secondary icon actions. The Map destination
opens a native region list for keyboard use, rather than a redundant page.

Rules, goals, supply and full mission names remain in accessible Play context
and game preparation. Only real blocked-action prerequisites and storage errors
occupy a visible status lane. Hiding these failures would break recovery/trust.
The image is decorative; native labelled controls hold the entire task.

## Interaction and invariants

- A region chooses its first available incomplete mission. Locked regions can
  still be inspected; Play is disabled and a compact prerequisite appears.
- New verified clears select the next available node in that region. Explicit
  replay selection survives refresh/language changes; loading old progress does
  not falsely animate an acquisition.
- Coin flights start at the cleared mission node (or its region marker), never
  the next mission's unearned reward. They reflect an actual campaign-wallet
  increase, never grant coins, and their DOM is cleaned up after completion.
- Region selection uses a small camera shift and short node response; current
  playable node has a beacon. Reduced motion disables camera/coin flight/beacon
  motion while retaining selected, completed and balance feedback. No timer,
  random reward, artificial notification dot or forced transition is introduced.
- Native region list closes on selection, outside pointer action or Escape;
  keyboard selection/Escape return focus to its summary. Existing sheets retain
  modal focus ownership and Escape does not dismiss background menus first.
- All 20 v6 mission definitions/seeds, reward ledger, 3-each starting inventory,
  save/Continue replacement confirmation, endless v1-v5 compatibility, rankings,
  shop and Character rendering lifecycle remain unchanged. No dependencies added.

## Responsive contract

- Portrait uses full-bleed cover art, content-aware marker/route lanes and compact
  bottom actions. Under 700px usable height, regions become a compact row.
- Short landscape (480px+ wide, <=480px high) separates landmarks and route into
  columns, with navigation and Play side by side. Keep spacing between controls.
- Square/fold and wide surfaces show the entire island using contained art with
  matching ocean margins; filling width by cropping would hide its landmarks.
  Background itself is full-viewport, with safe-area padding only on controls.
- Controls are native, labelled and at least 44px; locked/completed/selected are
  not colour-only. Region list is scrollable if needed, but no scrolling is needed
  to reach Play, navigation or the main mission nodes at accepted viewports.

## Acceptance and release gate

Validate 320x568, 390x690 (browser-chrome reduced usable height), 390x844,
480x320, 844x390, 720x720 and 1280x800, each in all three themes and four locales
(84 combinations). Check all primary/secondary button bounds, target size,
centre-point hit testing, pairwise overlaps, horizontal overflow and full art
bounds. Also inspect actual screenshots, enlarged text, native list keyboard
recovery, image/storage failures, normal/reduced motion, real keyboard mission
clear, next-node selection, explicit replay, exact Continue stock, no duplicate
reward, wallet/shop return and warmed offline reload. Functional automated
checks are not physical iOS/Android, hinge or screen-reader acceptance.

Run full units, typecheck, production build/release suite and Character/game
regressions. Direct diff review is separate from independent review; no reviewer
agent was available. Do not claim a live release from a push: deployment requires
the existing full CI gate, exact source SHA, matching Pages artifact/live bytes,
and fresh-browser live checks. Historical campaign evidence remains in
`world-map.md`; this document supersedes its old map/detail scrolling layout.

Local checkpoint:

- 253 unit tests passed; typecheck and `/chroma-match/` production build passed.
  Existing vendor-chunk size warning remains; no dependencies were changed.
- All 15 pre-existing production cases passed. Final map implementation passed
  all eight map cases, including the 84-combination matrix and enlarged text.
- Seven targeted Character/modal/loading/rotation/hierarchy regressions passed.
- Direct review corrected short-landscape overlaps, enlarged CJK-label/utility
  overlaps, an initial-image-error timing race, and a transformed SVG dash that
  overstated earned route length. No assertion or timeout was removed/increased.
- Coin-origin checks use 0.001px precision to tolerate CSS pixel serialization,
  not an exact floating-point string comparison. Actual reward origin, five
  flights, cleanup, no extra credit and reduced-motion suppression are checked.
- Actual screenshots inspected at phones, small landscape, square/fold,
  desktop, first clear and enlarged text; structural checks alone were not used
  as visual acceptance. Independent review and physical devices remain unverified.

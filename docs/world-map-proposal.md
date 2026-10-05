# World-map lobby and regional play — proposal, not a released feature

Historical proposal: approved for implementation and deployment on 2026-10-05.
The implemented scope and actual verification/release checkpoint are now in
`world-map.md`. Statements below describe the earlier proposal boundary, not
the current implementation status.

## Evidence and scope

The player reported repetitive score chasing and supplied a Warcraft Rumble map
as a reference. They requested usable items at game entry and asked whether a
map with different regional rules would be suitable. This is a product proposal,
not user research or a measured retention/dopamine claim. The map, mission
progression and regional selection are not implemented or deployed in this turn.

The existing product has a personalized, rotatable 3D character lobby, exact
save/replay verification, three-part gameplay HUD, four locales, three themes,
earned fever, upgrades and three rotating bonus rules. Preserve these valid
requirements rather than replacing their underlying game with a new engine.

## Recommended mental model

Map = choose what to play. Character = customize and inspect the avatar.
The world map becomes the default home only after approval; the existing 3D
lobby remains the Character destination. Do not shrink its full-body preview
into a decorative map icon or run its WebGL renderer behind gameplay.

Region -> mission -> one-line rule and goal preview -> Play -> existing game
HUD -> clear/result -> map progress and next destination. Keep the existing
Continue action prominent; starting another mission must ask before replacing
a saved run. An old endless run is not a completed regional campaign.

## Initial content: four meaningful rule families

| Working name | Primary rule | Goal / player's decision | Existing basis |
| --- | --- | --- | --- |
| Gem Forest | Normal matching, square bombs and power fusion | Reach score or collect a stated colour; learn where to swap | Standard engine and goal cycle |
| Blast Volcano | Extra bombs supplied after accepted swaps | Plan a large connected explosion / clear a target colour | Factory bonus |
| Prism Coast | Three-colour deal and refill | Find long cascades and charge fever; keep the eight-link action bound | Festival bonus |
| Relay City | Adjacent power pairs replenished after fusion | Choose which two powers to combine and where | Relay bonus |

These are proposed explicit region modes, not renamed level numbers. Current
bonus rules activate by stage number, so region selection still requires an
explicit engine policy, versioned run context and corresponding replay tests.
Within a region, keep its core mechanic consistent; vary authored goals and
board conditions rather than introducing an unrelated new rule every mission.

Begin with five authored missions per region, not a large empty continent.
Teach the basic interaction in the first Forest mission, then allow early
choice among the other rule families. Preview locked regions and name their
unlock condition. Future boss phases, obstacles and new terrain are a second
scope, not promised existing capabilities.

## Layout and interaction gate

- Header: current avatar, currency and quiet settings/help utilities.
- Middle: one readable chapter map, region names and distinct landmarks; use
  original Chroma art rather than republishing the supplied game's graphics.
- Selected region: a compact mission/goal/rule preview and one Play action.
  Do not hide mandatory rule information behind unlabeled map pins.
- Bottom: labeled Map / Character / Shop destinations. Integrate mission
  progress into the map; keep rankings available without covering its paths.
- Show current, available, complete and locked states with labels/icons as well
  as colour. Completed regions remain replayable.
- Phone: selected-mission preview at the bottom; larger/folded-out landscape:
  preview alongside the map. Board geometry never changes because a region
  icon or label is long.
- Prefer a bounded first chapter over compulsory pinch/zoom. If the map grows,
  distinguish native scrolling from node activation; preserve the lobby's
  pull-to-refresh prevention. Regions must also be keyboard-operable buttons,
  with a readable list alternative and visible focus.
- Progress animations convey a newly completed node/path, do not block Play,
  and have a reduced-motion equivalent.

## Progress, rewards and data boundaries

Define stable region/mission identifiers, rules version and seed in the run
context before implementation; replay must reconstruct a selected region's
rules, not infer them from an untrusted visual selection. Save mode, mission,
upgrades, inventory and current stage exactly. Existing v1-v5 saves remain valid.

First-clear rewards are granted once, distinct from ordinary run payouts.
Store authored-mission completion and reward claims separately from a best
score. Current coins/stash are per-device; account-wide campaign progress is
a separate backend decision, not automatically provided by this proposal.
Regional rankings must not imply that Factory and normal matching offer equal
scoring opportunities; separate by mode/mission before adding competitive UI.

The new starting supply makes basic consumables less scarce. Review the shop's
role when the map is built; cosmetic progression is a candidate, not a silent
price or purchase-policy change in this item update.

## Why this addresses repetition

The proposed loop offers a destination choice, an explicit change of mechanic
and visible completion beyond a higher score. A map alone would be decoration;
the regional rule and goal must change the useful move the player makes.
Measure completion, retries and regional choices only if suitable telemetry is
approved; small play sessions must establish whether the variants are actually
enjoyable. Do not introduce countdown pressure or punitive engagement gates.

Official reference: [Blizzard gameplay overview](https://news.blizzard.com/en-us/article/23785121/warcraft-rumbletm-gameplay-overview)
describes map-based campaign zones and additional mission types. This proposal
adapts that selection/progression pattern to match-3; it is not an imitation of
Warcraft's combat, characters, assets or current release schedule.

## Implementation order after approval

1. Original four-region map, mission previews and Map/Character navigation.
2. Versioned regional rules and exact save/restore/replay; retain stable board.
3. Authored missions, local clear/reward tracking and explicit unlocks.
4. Difficulty/play-session review, then optional boss/obstacle content.

Completion requires rendered phone/fold/desktop checks, complete mission flows,
old-save recovery, keyboard/reduced-motion checks and all affected tests. No
live release is included in this proposal.

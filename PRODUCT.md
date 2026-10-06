# Product

## Register

product

## Users

Browser puzzle players personalizing their game profile. Mobile use and choosing
an anime-style appearance are explicit requirements; audience demographics and
engagement effects have not been researched.

## Product Purpose

Create a character, preview it, save it and recognize the same appearance on the
profile and friends board without interrupting the match-3 game.

## Brand Personality

Expressive, playful, clear. The supplied CharacterStudio reference establishes
anime proportions, stylized hair, bright palettes and toon shading as one style.

## Anti-references

The technical trait metadata and culling controls in the reference are not part
of the player's task. The product has one anime character editor and one profile format.

## Design Principles

- One editor with a persistent preview and a clear Apply action.
- Preserve anime appearances until an explicitly chosen replacement is saved.
- Retired or invalid appearance formats display the anime starter; never reintroduce removed renderers.
- Offer only customization actually supported by the licensed starter model.
- The default home is a four-region adventure map. Character remains the
  rotatable full-body 3D lobby; release its renderer when leaving Character.
  Remember the last Map/Character destination. Map never waits for a VRM load.
- Profile and icon-only utilities own the lobby header. Ranks/missions/shop use
  a separate footer row, above Play. Play remains primary, labeled customization secondary,
  gestures a quiet grouped toolbar, and help/settings unframed utility icons.
  Portrait badges and keyboard focus rings are never clipped to the profile row;
  dragging a 3D preview hides pointer focus only, with keyboard focus restored
  on key input or the next keyboard entry.
  Model drags turn in the finger's direction
  without handing vertical panning to browser refresh; rotation help is nonvisual.
- Use cached still portraits in lists and the event-reactive game HUD; release editor resources.
- Gameplay HUD has three equal regions: goal, character reaction, remaining moves.
- Gameplay feedback and item guidance share one fixed lane outside the board
  scroller: targeting/nudges outrank idle fusion hints, earned celebrations
  briefly outrank guidance. Stage and progress share one compact row. Goal
  labels identify the unit without a repeated subtitle; accessible counts keep
  the full unit. Size the nine-row board to the largest complete rectangle in
  the remaining viewport, with a 44px minimum cell/toolbar target. Narrow phone
  portraits remain 80px (64px below 700px usable height); wider surfaces retain
  112px. Preserve headroom for peak portrait motion and OS safe areas.
  Scroll controls share the footer without taking board
  height. Hits never translate the grid; floating scores stay inside the visible
  board slice, including scroll and text-halo bounds. Pointer focus never moves
  that slice under a finger; keyboard arrows still reveal the chosen cell.
  Celebrations outrank contextual hints and animated decoration stays in its lane.
  Pause/background freeze a cascade; ending finishes its accepted action before
  banking. Fresh/restored runs reset view/input focus, not saved puzzle rules.
- New runs support 2×2 squares as bomb matches, alongside lines, L/T/+ and power fusion.
- Preserve previous rules when resuming/replaying saved games.
- New v4 runs add an earned, manually activated three-swap character fever,
  capped run-long upgrades chosen at every third completed stage, and three
  beneficial bonus-round types rotating every fifth stage. Cascade links cap
  at eight while retaining surviving powers. All choices and continuations are
  replay actions. No timer, geometry changes, gameplay WebGL or paid gates.
  See `docs/gameplay-variety.md` for the state, accessibility and validation gate.
- Keep stable, versioned choices independent of rendering implementation.
- New v5 runs supply three of every item without a stash purchase. Two optional
  carried extras still fit, with five held per kind; v1-v4 stock stays unchanged.
  Continue restores stock exactly and never grants a second supply. Preparation
  distinguishes base supply from optional extras. See `docs/starting-items.md`.
  Approved v6 campaign missions add four distinct rules and five authored
  missions per region. Clearing Forest 1 opens all regions; each region's
  missions then open in order. First-clear rewards are device-local and paid
  once after replay verification. Keep mission goals/moves/rules in the record,
  retain v1-v5 saves and do not post campaign scores to endless rankings.
  Map is a full-viewport game scene, not an explanatory page. Compact landmark
  markers, numbered mission nodes, earned path, reward and Play/Continue
  are the visible hierarchy. Rules/goals stay in accessible action context and
  actual game preparation; only a lock prerequisite or storage failure adds a
  visible note. Native Map-tab region list, Character and Shop remain reachable.
  First clears select the next node; coins travel from the cleared node to the
  wallet once, with static feedback for reduced motion. No timers, paid unlocks,
  boss phases or cloud-progress claim. See `docs/world-map.md` for rules and
  `docs/fullscreen-map.md` for the current lobby; original proposal is preserved.
- The expanded campaign is v7 (`zt`): 30 authored stages in each of four regions (120 total), with breathers and
  alternating collect/create/factory/festival/relay goals; preserve the immutable
  original v6 table for old saves. The shared dimensional HUD and dock persist in
  Map, Character and Shop, but are truly hidden in games and editing. A bounded
  world/region camera moves one artwork/route scene while native 52px targets and
  HUD remain readable. Keyboard focus reveals offscreen stages without browser
  scrolling; minimum regional zoom prevents neighboring targets overlapping.
- Current visual direction explicitly favors colorful, tangible casual-game props
  over restrained application glyphs. Original transparent 3D-style raster icons
  share gold bevels, readable silhouettes and dimensional shading. Navigation is
  icon-only with accessible names; region titles are nonvisual. Terrain selection
  uses a soft clipped luminance shimmer, never a rectangular frame. Keep progress,
  lock state and primary Play readable. The 3D character implementation is frozen;
  character rendering tests are paused while map/game coverage remains active.
- Controls and panels share chunky blue/violet/gold bevels, raised lower edges
  and a short 4px press response without moving hit-target layout. Map landmarks,
  52px mission discs and in-game tools use the same physical material family.
  Original v3 map artwork favors rounded toy-like dioramas over dense painted
  detail, while the 2.5D interaction and region/mission identities stay intact.
  Rankings open full-screen with a visible localized banner, close button,
  Everyone/Friends keyboard tabs and a list using the full remaining height.
  Real local/shared statuses, empty/error cases and focus return are preserved;
  do not fabricate lives, currencies or production leaderboard rows from references.
- Player growth is device-local, separate from score and puzzle stage. First clears
  give 100 XP, genuine replays 40, natural failures 0–15, quits zero partial XP.
  Requirements plateau at 200; overflow carries; rewards are 20 coins per level and
  cosmetics, not stronger boards or locked existing features. Atomic IndexedDB
  settlement proves the replay and commits wallet/XP/unlocks/statistics together.
  Preserve legacy data, pending results on write failure and basic session play
  when storage is unavailable. My Play presents icon/title/number groups, mode
  and recent-20 filters, real sample sizes and a statistics-only reset. Do not
  fabricate historic metrics or promise account/cloud persistence. See
  `docs/adventure-growth-checkpoint.md` and the growth/statistics design plans.
- Cached profile portraits use original dimensional metal frames that grow at
  levels 1/3/10/20/35/50. Level numbers are large HTML text inside a heavy navy/gold
  plaque, not baked into artwork. Hub, profile sheet and gameplay share the same
  earned tier. Existing equipped cosmetics remain stored and add an accent glow;
  no new XP requirement, paid gate or character-model change is introduced.
  Compact landscape prioritizes reachable map targets, and game chrome preserves
  the board's available height. See `docs/profile-rank.md`.
- Library, undo and file restore edit a draft; only explicit Apply changes the profile.

## Current scope decision

This release uses one licensed Seed-san asset, with male/female figure variants,
five independently adjustable body axes, five hairstyles, skin/palette choices,
six expressions and independently mixed backpack/arm/visor options. Figure and
hair variants modify this model; they are not additional licensed model packs.
New external models and outfit packs still require separately checked permissions
and a compatible rig. The first original wardrobe is fitted to this licensed
body: four round/V-neck short/long-sleeve tops, trousers/shorts/long/short skirts,
unbranded high-top sneakers/dress shoes/heels and barefoot. Pieces and colours
are independent; compatible skin masks, finished openings and shared bone
weights keep the body/cloth together. Heel stance and sole contact are fitted
against the actual reshaped rig, and use the same geometry in VRM/GLB exports.
Even the minimum hip setting retains a modest rounded rear foundation, shared
by the body, original outfit, fitted wardrobe and exports. Hip size still scales
independently; this requested baseline refinement also applies to saved looks
without changing their codes or the face, belly, height and leg length.
The female chest retains its existing size range, with a gentle upper approach,
a shorter, firmer rounded lower pole and smooth ribcage transition. Curved local
torso interpolation uses about 3 mm apex / 5 mm surrounding edges, including
torso vertices with minor shoulder blends. A smooth central join prevents the
fitted shell folding across the sternum. Actual posed contour checks bound the
apex turn and upper straight facets, not just the vertex count or a scalar field.
The fitted tops and original-outfit exports share the same sculpt and rig.
See `docs/chest-shape.md` for the fit gate and original-tunic limitations.
Previous appearances retain the original outfit until a new piece is selected;
new wardrobe profiles use a bounded v7 code. This is skinned game clothing, not
cloth simulation or a claim of fit on arbitrary models/animations. See
`docs/wardrobe.md` for acceptance evidence and limits.
Bob and mid-back long hair use dedicated closed meshes and an original neutral
strand texture over the licensed crown/fringe, not repeated ponytail ribbons.
All cuts use a bleached near-white pigment carrier, preserving neutral strand
detail rather than multiplying bright selections by the source's mid-gray.
Bob/long side and back surfaces add sparse curved separation lines with uneven
spacing, width and length, softly tapered roots/tips, and gentle clump shading.
The authored asset and original fringe/ponytail stay intact. Bob/long use one
rounded crown-to-curtain shell over the rear crown, rather than a second root
rim midway down the head. Denser curved-crown rows and one continuous root-to-tip
UV flow join the silhouette and strand paths. Original rear outline layers stay
inside this shell; the front opening preserves the original eyes and fringe.
Below the widest crown, a horizontal tangent joins a gravity-led curtain with
nondecreasing side width and rear depth, avoiding a neck pinch followed by flare.
The shell is bounded to 3,250 vertices with no additional meshes/draw calls or
per-frame rebuilding. See `docs/hair-join.md` for fit and verification evidence.
Most of the generated map stays
near-white; only narrow neutral separation cores are darker, so bright pigment
is not washed out. A single bounded UV texture follows the existing head shell,
with no extra line meshes, draw calls, runtime noise or per-frame texture work.
Selected colour codes stay unchanged. Derived portraits regenerate, and the
bundled starter portrait uses a render-versioned URL to bypass stale image caches.
The same geometry and texture are written into VRM/GLB exports; B/L appearance
codes remain stable and derived portrait caches regenerate. These cuts follow
the head rigidly; strand physics and cloth/hair collision simulation are excluded.
Short taper and side-part pomade replace the authored crown/fringe with a fitted
closed scalp. Pomade's softly rounded combed locks conform to each lateral scalp
section and enter the cap at both ends, merged into one head-attached mesh.
These original styles use 2,342 / 3,990 vertices, neutral strand carriers and no
per-frame generation. T/B/L saved codes stay unchanged; F/P add the new cuts.
Footwear last width/length follows bounded shoulder/hip/chest/head balance,
remaining within ±12% / ±9%; ankle openings, leg bones and heel height are not
scaled. Both sexes use the same sizing rule, and sole contact is re-fitted on
the posed rig. The left cyan finger paint is removed only from its pinned skin
atlas island, retaining skin shading, glove/palm, other hand and face pixels.
Cleaned atlas pixels and skin tint are shared with VRM/GLB downloads; tint must
not be applied twice. Derived portrait cache frame 7 refreshes images only.
See `docs/short-hair-footwear.md` for the implementation and validation record.
Gestures separate shoulder swing/axial rotation, mirrored forward elbow hinges,
and wrist movement. Elbows never switch to side-flexion or hyperextend; ease-in
and ease-out return both arms to the same rest without accumulating transforms.
The lobby adds breathing, weight shift, gaze, blinking and three gestures.
Game-specific celebratory motion is intentional; reduced-motion users receive
text feedback and explicitly requested still poses instead of animation.
Gameplay swaps pre-rendered expression portraits; it never keeps a WebGL scene
alive. Players can bypass the first 3D load and enter the lobby immediately.

The studio toolkit adds six expressions, pointer gaze, pause, 12 named local
looks, undo/redo, JSON backup/restore and PNG/VRM/GLB downloads. The upstream
capability mapping and authoring-tool boundaries are in `docs/studio-toolkit.md`.
MIT code reuse does not replace per-asset permissions. No unlicensed models,
arbitrary uploads, account storage or paid authoring services are introduced.

## Accessibility & Inclusion

Keyboard-operable native controls, visible focus, text labels, responsive reflow,
reduced motion, and recoverable network/WebGL errors. Preserve four locales and
the existing game themes. Verify rather than assert WCAG conformance.

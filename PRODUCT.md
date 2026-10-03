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
- Home is a rotatable full-body 3D lobby; release its renderer when leaving home.
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
- Gameplay feedback owns a fixed lane outside the board scroller. Item guidance
  reserves its slot, and scroll controls share the footer without taking board
  height. Hits never translate the grid; floating scores stay inside the canvas.
  Pause freezes a cascade; ending finishes its accepted action before banking.
- New runs support 2×2 squares as bomb matches, alongside lines, L/T/+ and power fusion.
- Preserve previous rules when resuming/replaying saved games.
- Keep stable, versioned choices independent of rendering implementation.
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

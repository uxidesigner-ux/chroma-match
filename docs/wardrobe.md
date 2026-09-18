# Wardrobe: how parts combine

Design, not implementation. Nothing here is built yet; it is the standard the
parts will be built to once the representative character is approved.

Two references, doing different jobs. The clay render stays the bar for the
face, the hair and the material — how good one character has to look. The
second reference, Bondee, is used only for what a wardrobe has to do: full
figures that read as an outfit, garments that differ in cut rather than colour,
layering, and editing a part at a time. Its proportions are not mixed into
ours, and it is not a reason to aim lower.

Only its public screens and how people describe using it were looked at. How it
is actually built or rigged is not known here and is not assumed; the rules
below are ours.

## 1. A garment is a silhouette, not a colour

A category earns its place by changing the outline. Recolouring one torso is
not a second garment.

| Category | What makes it that garment |
|---|---|
| Tee | Set-in short sleeve, plain crew, hem at the hip |
| Sweatshirt | Dropped shoulder, ribbed cuff and hem, fuller body |
| Shirt | Collar and placket, straighter body, cuff at the wrist |
| Outerwear | Its own shoulder over the top's, open front, longer hem |
| Straight trousers | Constant leg from knee to ankle |
| Wide trousers | Leg widening below the knee, hem breaking on the shoe |
| Shorts | Hem above the knee, wider opening than the leg above it |

Each is its own mesh. Where two share a construction they may share a builder,
but they may not share an outline.

## 2. Colour changes colour

The rule already in the showroom: a part is tintable when its exported material
is named for a slot — `skin`, `hair`, `cloth`, `eye`. A part exported with any
other material keeps what it was authored with and is not tintable. That is how
an authored fabric with maps on it opts out.

A colour change sets base colour only. Roughness, sheen and clearcoat belong to
the garment, not to the swatch, so a knit stays a knit in every colour. The
sheen is tinted towards the garment's own colour rather than white, because a
white sheen over a dark colour lifts the whole thing to grey.

## 3. Layering

Draw order, and more importantly cover order:

    body < socks < bottom < top < outer < shoes < bag < hair

Three rules do the work:

**Thickness, not sorting.** Each layer's section is the section of the layer
under it pushed out by a cloth thickness. This is the one thing that makes skin
coming through impossible rather than unlikely, and it is already proven on the
current top. Outer clears top clears body.

**Cover, don't overlap.** A garment declares the regions it covers. A long
sleeved outer covers `sleeve`, so the top's sleeve is *hidden*, not drawn inside
it. That is what stops two cuffs appearing at one wrist. Tucking is the same
mechanism: a tucked top hides the bottom's waistband region rather than fighting
it.

**Collisions are the wardrobe's problem, not the wearer's.** A bag strap and
long hair both want the shoulder. The strap is drawn over the hair, as it would
be if it were put on after, and the hair bands that cross the strap are offset
inward where it lies. The user is never asked to pick a different bag.

## 4. Compatibility

Some combinations are refused, and the refusals are declared rather than
emergent. A hood over a tall gathered hairstyle is the clear case: the hood
wins, and the hair switches to its tucked variant for as long as the hood is
worn. The switch is announced in the picker, it is reversible, and the original
choice is remembered.

The default is to allow. A rule has to earn itself by naming a specific pair
that cannot be made to look right, and it has to have a defined result — never
a silent failure and never a surprise.

## 5. Editing

Style and colour live together inside a category. `Hair` holds both the cut and
its colour; there is no separate `Hair colour` at the top level. Top-level
categories are body regions — face, hair, top, outerwear, bottom, shoes,
accessories — and they do not multiply.

Each category frames what is being chosen. `Showroom.FOCUS` holds a centre and
a height per category, in head units, so choosing hair shows the head and
choosing shoes shows the feet. A grid of identical small full-body thumbnails
is what this exists to avoid: the part being chosen would be a dozen pixels of
it.

Turning and zooming belong to the viewer. Changing a category moves the camera
target and distance and leaves the angle alone; changing a part moves nothing.
Someone who turned to three-quarters to judge a collar is still there
afterwards.

## What is approved and what is not

Adding this reference does not approve building the wardrobe, rooms, spaces or
anything social. The order stands: the representative character's quality is
approved first, then a few real hair and garment swaps on that same face and
body are used to check the combination rules — not three separate finished
characters.

# Wardrobe: how parts combine

Design, not implementation. Nothing here is built yet; it is the standard the
parts will be built to once the representative character is approved.

Two references, doing different jobs — both still apply.

**Look.** The visual bar for one character (face, hair, material) is the
top-right figure on the six-person original sheet: long wave, black knit. That
file is private; see `tools/figure/REFERENCE.md`. Nothing in the current GLB
is that character yet.

**Assembly.** Bondee’s character and combination structure is the intended end
state for how a figure is put together: full figures that read as an outfit,
garments that differ in cut rather than colour, layering, and editing a part at
a time. How Bondee is actually built or rigged is not known here and is not
copied; the combination *rules* below are ours, pointed at that structure.

The representative look is approved first. Combination rules are checked on
that same face and body with a few real swaps — not by shipping three finished
characters, and not by treating an unapproved sculpt as the default.

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

## 2. Colour without losing the material

Keeping what a garment was authored with and being able to recolour it are not
alternatives. The end state is both: a garment keeps its own roughness, sheen
and any maps it ships with, and a named region of it can still be recoloured.

That means the recolourable part of a garment is a declared region — a tint
mask or a named material slot within the garment — not the whole thing and not
nothing. A knit's weave, a shirt's weft, a shoe's sole all stay put; the panel
the swatch applies to changes hue.

A colour change sets base colour only. Roughness, sheen and clearcoat belong to
the garment, not to the swatch. The sheen is tinted towards the garment's own
colour rather than white, because a white sheen over a dark colour lifts the
whole thing to grey.

**What exists today is a prototype, not this.** The showroom currently replaces
a part's material outright whenever the GLB names it `skin`, `hair`, `cloth` or
`eye`, and a part named anything else is left alone and cannot be tinted. That
is four shared materials standing in for per-garment ones, and it is an
either/or of exactly the kind this section rules out. It is adequate for judging
one character and has to be replaced before any authored fabric arrives.

## 3. Layering

Draw order, and more importantly cover order:

    body < socks < bottom < top < outer < shoes < bag < hair

Three rules do the work:

**Thickness, and then checking.** Each layer's section is the section of the
layer under it pushed out by a cloth thickness. That removes the common case,
and it is what the current top does. It does not prove anything: an offset holds
where the garment follows the body it was derived from, and stops holding at a
shoulder that rotates, at a build the garment was not derived for, at a hem that
gathers, and wherever two garments were authored against different body
versions. So the guarantee is not "thickness, therefore never" — it is a matrix.
Every supported build and pose, crossed with the combinations the rules allow,
rendered against a contrasting skin and checked. Penetration found there is
fixed by cover rules or by a compatibility rule, not by adding thickness until
it goes away.

**Cover, don't overlap.** A garment declares the regions it covers. A long
sleeved outer covers `sleeve`, so the top's sleeve is *hidden*, not drawn inside
it. That is what stops two cuffs appearing at one wrist. Tucking is the same
mechanism: a tucked top hides the bottom's waistband region rather than fighting
it.

**Collisions are resolved in space, not in draw order.** A bag strap and long
hair both want the shoulder. Drawing one over the other does not resolve it —
it hides it from one angle and shows it from the next, which is worse than
leaving it alone. The strap has a real path over the shoulder, the hair has a
deformation that gives way along that path, and the pair is checked all the way
round rather than from the front. Where a deformation cannot be made to work,
the combination becomes a declared compatibility rule with a defined result.
Either way the wearer is never asked to pick a different bag.

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

Camera framing, colour changes and showing or hiding a part are working in the
showroom. None of them is evidence that the character looks right, and none of
them is a test of swapping in a different part: there is only one hair and one
top to swap between.

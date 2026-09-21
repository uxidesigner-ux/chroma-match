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
- Load 3D on demand; use still portraits in lists and release editor resources.
- Keep stable, versioned choices independent of rendering implementation.

## Accessibility & Inclusion

Keyboard-operable native controls, visible focus, text labels, responsive reflow,
reduced motion, and recoverable network/WebGL errors. Preserve four locales and
the existing game themes. Verify rather than assert WCAG conformance.

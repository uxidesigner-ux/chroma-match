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
- Use cached still portraits in lists and the event-reactive game HUD; release editor resources.
- Gameplay HUD has three equal regions: goal, character reaction, remaining moves.
- New runs support 2×2 squares as bomb matches, alongside lines, L/T/+ and power fusion.
- Preserve previous rules when resuming/replaying saved games.
- Keep stable, versioned choices independent of rendering implementation.
- Library, undo and file restore edit a draft; only explicit Apply changes the profile.

## Current scope decision

The user approved deferring male/female model selection and new outfit packs until
licensed, compatible assets are available. This release uses Seed-san's real hair,
expression, palette and explorer-equipment options, plus breathing and gestures.
Game-specific celebratory motion is intentional; reduced-motion users receive
text feedback and explicitly requested still poses instead of animation.

The studio toolkit adds six expressions, pointer gaze, pause, 12 named local
looks, undo/redo, JSON backup/restore and PNG/VRM/GLB downloads. The upstream
capability mapping and authoring-tool boundaries are in `docs/studio-toolkit.md`.
MIT code reuse does not replace per-asset permissions. No unlicensed models,
arbitrary uploads, account storage or paid authoring services are introduced.

## Accessibility & Inclusion

Keyboard-operable native controls, visible focus, text labels, responsive reflow,
reduced motion, and recoverable network/WebGL errors. Preserve four locales and
the existing game themes. Verify rather than assert WCAG conformance.

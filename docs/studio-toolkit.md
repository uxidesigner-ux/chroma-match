# CharacterStudio capability mapping and game toolkit

## Outcome and scope

The player can experiment with a licensed full-body character without losing a
saved profile, keep multiple looks locally, transfer a look between devices and
download images or reusable 3D models. This is a game profile editor, not a clone
of the entire upstream authoring application.

Evidence: CharacterStudio `293182bf4a6087f4a4a7fd00e4fbdfb590029da7`
(`LICENSE`, `docs/docs/about.md`, CharacterManager, LookAtManager,
ScreenshotManager and SpriteAtlasGenerator docs). MIT covers its code, with the
copyright and permission notice retained. The documentation explicitly describes
using one's own assets. Asset permissions remain separate; this change adds no
third-party character or clothing files.

## Capability mapping

| Upstream capability | Game implementation / boundary |
| --- | --- |
| Point-and-click trait editing, palettes | Existing hair/gear/color controls retained; independent palette, hair, gear and expression randomization |
| Expressions and programmable animation | Six actual Seed expressions, blink/breathing, three gestures, bounded canvas-local gaze, pause and OS reduced motion |
| Save and restore selections | 64-step undo/redo; default reset; 12 named local looks; strict versioned JSON backup/restore |
| Screenshot export | Face 512×512, full body 512×768, four-view 2×2 sheet 1024×1536; each adds a 36px attribution footer; optional transparent background |
| VRM / GLB export | Both export the same valid GLB/VRM1 container with modified palette/visibility and original rig, permissions and expressions; neutral/rest pose, not a baked animation |
| Sprite atlas | Four-view still sheet only; animated multi-clip sprite atlas is not implemented |
| Arbitrary local VRM / texture upload | Not implemented: needs a separate model storage/schema, metadata handling, performance limits and cross-device profile design; JSON import is explicitly NOT a model upload |
| Mesh merging / texture atlas optimizer | Not ported; exports retain original buffers and append recoloured textures, so they are not smaller or single-draw-call models |
| Manifest trait catalogues, male/female models, new garments | Existing fixed, versioned Seed adapter only; requires licensed compatible assets and per-model bindings |
| Batch randomized 3D export / LoRA data generation | Authoring pipeline, not included in the player profile flow |
| AI personality, lip sync, wallet, NFT minting | Not game-profile requirements; no paid service, microphone permission, wallet or blockchain dependencies added |

## Acceptance criteria

- Existing v3/v4 profiles load unchanged. New expressions use a 29-character v5
  code within deployed alphanumeric profile limits; old expression codes remain v4.
  Independently mixed explorer pieces use v6 of the same length.
- Changes, undo, redo, reset, library load and JSON restore affect the draft only.
  The existing explicit Apply action is still required for local/cloud profile changes.
- Library stores at most 12 validated `{id,name,code}` rows. Names are plain text,
  maximum 32 characters. Delete is confirmed inline; it never deletes the profile.
- A malformed/oversized/unknown-version JSON does not replace a draft. No imported
  URLs, scripts, HTML or user-controlled model fetches are accepted. Maximum file 16 KB.
- Storage failure reports failure and leaves current state intact. Local library
  storage is browser-specific, not account-synced. JSON is the portable backup.
- Exports include author attribution; models preserve original permission metadata,
  all bone/node indices and expression definitions. Only visible equipment primitives
  are retained on active meshes. Shared source textures are not overwritten.
- VRM/GLB exports are reloadable using GLTFLoader + VRMLoaderPlugin. Generic GLB
  viewers may differ when they do not implement MToon. Preview expression/gesture
  is not baked into the exported rest-pose model; appearance code is in asset extras.
- Camera, dimensions, background and pixel ratio are restored after PNG capture.
- Full-body capture fits the actual held pose, including raised hands. Explicit
  reduced-motion/paused gestures also expand their preview bounds to remain visible.
- Keyboard tabs, focus, mobile reflow, four languages, pause, reduced motion,
  load/retry/context-loss handling and prior game rules remain supported.

## Validation

`npm run typecheck`, `npm test`, `npm run test:studio`,
`BASE_PATH=/chroma-match/ npm run build`, `npm run test:release`.
Tests added for six-expression round trips, history bounds, library validation,
quota failures, malformed JSON, metadata/visibility export, aligned binary buffers,
actual downloadable PNG dimensions/alpha, both model formats reloaded in a browser,
mobile keyboard flow and explicit profile application/reload.

No new dependencies. A retained ~11 MB source buffer per active renderer supports
offline export without a second fetch. Downloads are user-triggered and exports
are bounded; there is no background batch export. Physical mobile GPU testing and
third-party VRM applications remain outside the automated Chromium check.

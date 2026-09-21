# Single character system

The supported product has one anime editor. Entry goes straight from Edit
character to the full-body studio, preserving draft confirmation, model retry,
four languages, keyboard controls and face-focused profile rendering.

Removed from the current tree: the procedural 2D and ray-marched character
renderers, shader scene, part catalogue and its four-language labels, part-slot
codec, swatch editor, style selector, obsolete CSS and obsolete feature tests.
Git history is retained for recovery; no history rewrite or branch deletion.

## Saved data

V4 is `4` plus the existing 28-character anime payload. Existing v3 anime saves
retain that payload and discard unused fields. Other/invalid profile strings
display the starter. Local saves are normalized when read; cloud profile reads
use the same decoder without batch writes. Scores, currency, friends and run
records are unaffected. Existing clients must refresh to read the new format.

A 256px bundled starter portrait is generated from the same licensed Seed-san
model and default palette. It keeps initial/default profiles independent of WebGL
and the 11 MB model. Customized cached portraits remain reusable. Model loading
continues on demand for editing or missing custom portraits; failure is explicit,
with no retired renderer fallback.

The service-worker cache revision changes from v1 to v2. Activation removes only
this application's old path-scoped caches, not caches owned by other apps.

## Verification

Coverage checks codec migration and bounds, starter display without WebGL/storage
writes, preserved saved anime appearance, scores and names, direct editor entry,
save/cancel/retry, full-body views, zoomed portraits, mobile reflow, reduced motion,
gameplay and deterministic replay. Production checks also require no removed UI
or CSS in the built assets, the starter PNG, offline recovery and scoped cache cleanup.

No dependencies or database rules were changed. Google cross-device restoration,
physical-device GPU performance and new model/garment assets are outside scope.

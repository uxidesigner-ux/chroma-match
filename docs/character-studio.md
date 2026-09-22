# Anime character studio

## Scope

For the expanded game editor (six expressions, library/history, file backup and
PNG/VRM/GLB export), see [Studio toolkit](studio-toolkit.md). Its capability table
distinguishes shipped player features from upstream authoring features not ported.

One licensed Seed-san starter model, reproportioned rather than swapped: five
figure axes (shoulders, chest, waist, hips, head size) at seven steps each, four
builds as starting points, two hair silhouettes (tails shown/hidden), eight
starting palettes, independently mixed backpack / arm gear / visor,
hair/eye/skin/outfit/background colours, six expressions,
rotation, face/full-body framing, idle breathing and blinking. Apply commits a
draft; leaving a changed draft asks before discarding it. This is the only
character editor. This is not the DropHunter outfit catalogue.

## Provenance

`src/avatar/character-studio/` adapts CharacterStudio's VRM loading/material
handling and BlinkManager from commit 293182b. MIT notice ships in
`public/licenses/character-studio.txt`. It intentionally has no React, wallet,
NFT, speech, or model export dependencies.

Seed-san is by VirtualCast, Inc., from vrm-c/vrm-specification at
821c11b250d8c70d5804ee13431e42bee56ea9c0. Embedded VRM 1.0 settings permit everyone,
corporate use, redistribution and modified redistribution, with attribution.
`node scripts/fetch-anime-assets.mjs` checks those settings and records the source
and SHA-256. The binary is unmodified; palette/hair/pose changes happen at runtime.
Attribution and the license link are visible in the editor and distributed build.

DropHunter and Anata were inspected but not included: embedded metadata restricts
use/modification/redistribution. No permission was provided for those assets.
Re-checked against `M3-org/loot-assets` at `anata/{female,male}/Body`, `0N1/Body`
and `tubbycats/Body`: every body but one reads `licenseName:
Redistribution_Prohibited`, `allowedUserName: OnlyAuthor` and
`commercialUssageName: Disallow` in its own VRM 0.x metadata, the female Anata
body naming Rhinox 3D as its author. Publishing this repository redistributes
whatever `public/` holds, so those files stay out of it. Character variety comes
from reproportioning the one model that permits it.

## Data and rendering

V4 code: `4` + 39-character anime choices = 40 alphanumeric characters. This fits
existing Firestore validation without relaxing rules or adding user-controlled
URLs. The model and choices are allowlisted. Existing v3 anime payloads are read
from their prior envelope and rewritten without unused fields. Mixed explorer
pieces (backpack, arms and visor independently) use a v6 prefix of the same
length. The figure and the skin are appended rather than woven in, and each
earlier code is a prefix of a later one: a code that stops after the colours,
after three axes, or after five decodes to the model as it ships for everything
it does not state, so no saved appearance changes shape when the studio grows. Other or malformed formats display the starter; no retired rendering or catalogue code is retained.

The editor and Three.js/three-vrm runtime load dynamically. The starter uses a
bundled PNG generated with `node scripts/capture-default-portrait.mjs`; it does
not load a model or require WebGL. Customized profiles use a generated
256px PNG; the local player's last image is cached in localStorage, with bounded
in-memory caching for others. Missing portraits are rendered serially so a list
does not create one WebGL context per row. Editor exit aborts loading, removes
listeners, disconnects resize observation, and disposes GPU resources.

The same-origin versioned model is cached by the existing production service
worker on demand. A cold offline visit cannot use 3D before its first successful
load. The editor displays an error and retry, leaving the stored avatar unchanged.
The existing worker also needs an online reload after its first installation to
cache the document and initial application assets before an offline reload.

Profile publishing uses the existing players document and reports cloud failures
separately from local save success. No image-upload service is introduced.
Automatic restoration from a Google account onto a different device is not
implemented by the existing account flow and is not added in this increment.

The starter asset is 10,917,800 bytes with 45,058 triangles and 17 materials.
It is loaded only when needed; it is not yet a mobile-optimized production pack.
No physical-device frame-rate target has been verified.

## Adding assets

Do not change an existing model/version or reuse saved option codes. Add a new
version, an explicit decode path, source/permission evidence, and adapter binding
for each model's meshes/materials/expressions. New garments must have compatible
rigging and pass pose/intersection checks before exposing them as options. VRoid
preset assets require separate consideration for character-creation applications;
do not assume ordinary commercial-use permission covers an avatar editor.

## Verification targets

Test v3 anime migration, v4 round trips, retired/invalid data; loading/retry and context loss;
draft cancellation; reload persistence; mobile 375px and narrow/landscape reflow;
keyboard tabs/rotation; reduced motion; original gameplay; Pages subpath build.
Live account synchronization requires a signed-in test account. Do not report it
as validated solely because the payload fits the rules.

## Verified checkpoint — 2026-09-21

- `npm test`: 117 tests passed, including v3 appearance round trips.
- `npm run test:studio`: all six Chromium scenarios passed: lazy loading and
  save/reload, discard and gameplay, network/context-loss retry, keyboard/reduced
  motion/reflow, storage failure and missing-portrait regeneration.
- `BASE_PATH=/chroma-match/ npm run build`: TypeScript, service-worker syntax and
  production build passed. Existing Firebase and new lazy 3D chunks trigger the
  bundle-size advisory; the new renderer is approximately 187 kB gzip.
- Production preview at `/chroma-match/`: Korean desktop/mobile visual checks,
  model caching, offline reload and editor reopening after an online controlled
  reload passed, with no uncaught page errors.
- `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities.
- `git diff --check`: passed.

Review was performed directly, not by an independent reviewer. It caught and
resolved canvas reuse after context loss, stale save completion after editor
exit, unbounded explicit portrait caching and misleading hairstyle labels.
Live Google publishing, cross-device restoration, Safari/Firefox and physical
mobile GPU performance remain unverified. Cross-device restoration is not part
of this feature. Model/garment expansion requires licensed compatible assets.

## Full-body follow-up — 2026-09-21

Full body is now the initial view on desktop and mobile, with explicit Full body
and Face buttons and Front/Side/Rear direction shortcuts. Camera fitting uses
the visible, posed model bounds (including enabled equipment) and screen aspect,
with margin for all eight corners at every yaw. Hidden equipment does not inflate
the frame. Switching views is preview-only: profile images remain front-facing
portraits, and the saved appearance format has not changed.

On narrow screens the full-body stage is taller and the editor scrolls vertically;
the Face mode provides a compact stage for colour/expression editing. The apply
action remains reachable at 320px, 375px and landscape sizes. This is an explicit
mobile tradeoff: the full-body preview is not sticky while editing below it.

Acceptance checks: 119 unit tests, seven browser scenarios, TypeScript and the
Pages-subpath production build pass. Added camera geometry tests cover wide and
narrow screens, asymmetric equipment and 16 view angles. Added browser coverage
checks the direction buttons, full/face state, retained equipment and identical
saved profile portraits after changing the camera. Korean front/rear/mobile
renders were visually inspected with no uncaught browser errors. The design
review used Impeccable's product accessibility and responsive criteria without
changing the existing theme. Review remains direct, not independent.

## Release gates — 2026-09-21

CI now runs the seven editor/gameplay browser scenarios and two production smoke
checks before uploading a Pages artifact. The production checks verify the
pinned VRM checksum, license notices, JavaScript content type, full-body editor,
local profile save/reload, mobile reflow and warmed offline recovery.

The service-worker cache is namespaced to the application path. Activation no
longer deletes caches owned by other projects sharing the GitHub Pages origin.
The old unscoped cache is deliberately preserved instead of risking another
app's data. Cache write quota failures do not prevent network responses.

Run `BASE_PATH=/chroma-match/ npm run build` then `npm run test:release` locally.
For the deployed site, set `STUDIO_BASE_URL=https://uxidesigner-ux.github.io/chroma-match/`
when running `npm run test:release`. These checks use isolated guest browser
contexts and block Firebase requests, so they do not create production accounts,
scores or cloud profiles. They do not validate Google account synchronization.

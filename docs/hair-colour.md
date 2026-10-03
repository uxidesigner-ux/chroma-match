# White-based hair colour — 2026-10-03

## Decision and scope

The player requested a bleached white base so yellow and high-chroma choices
do not become muddy. The previous implementation already removed the green
source hue, but multiplied colour by mid-gray maps. The issue was brightness,
not a missing colour picker or a need to reset saved hair colours to white.

`hair-palette.ts` normalizes the licensed crown/fringe/ponytail texture's visible
highlight and remaps its neutral detail into a near-white carrier. Alpha and
texture coordinates remain unchanged. Bob and long hair use the same white
range in their original generated strand map. MToon shading, lights, outline,
geometry, head attachment and motion are unchanged. Other palette groups keep
their existing textures; no production dependency or external asset was added.

| Carrier, sRGB bytes | Before | After |
| --- | --- | --- |
| Crown/fringe/ponytail, actual opaque texture pixels | 152–173 | 234–255 |
| Generated bob/long strands | 144–166 | 232–255 |

These are the bleaching-baseline measurements. The subsequent
[strand-detail refinement](hair-detail.md) keeps the bright carrier but adds
sparse darker neutral separation cores to the generated bob/long map. The
licensed crown/fringe/ponytail range remains unchanged.

The selected colour remains the material's sRGB input, converted to linear
factors by Three.js. A neutral map cannot inject an old green/brown hue. Actual
lit pixels still vary with toon shading and lights; this is not a promise that
every point on a three-dimensional head equals the picker hex exactly.

Saved appearance codes, hair choices and colours are retained. Derived portrait
cache revision 4 regenerates old images. The bundled default portrait is
regenerated with the existing capture script and requested with `?v=4`: changing
only the stored portrait revision would leave the unversioned starter PNG in
the cache-first service worker. The scoped worker and unrelated caches are not
reset. Original source VRM bytes and author/permission notices remain unchanged.

## Evidence and regression coverage

The actual pre-fix colour regression failed at the white-base gate (152 rather
than at least 232). A production regression also reproduced the unversioned
starter-image path with an old one-pixel gray PNG in the real scoped worker cache.
An initial diagnostic-only relative-path fixture error was corrected before the
accepted baseline; it is not a product failure or colour-quality result.

`tests/studio/hair-colour.spec.ts` renders three cuts × white, yellow, magenta
and blue under the production ambient/key/fill light setup. It measures only
opaque actual hair, excluding skin, background and dark outline pixels. The
sampled white median became RGB 255/255/255, from about 174–176 previously.
Yellow's median changed from approximately 174–176/159–161/0 to
255/242–245/0. Maximum measured chromatic hue error is about 2.59 degrees under
these lights; all saturated samples retained saturation 1. Neutral strand
variation remains in the source maps, and cut-to-cut peak brightness is bounded.

The test compares ten white/yellow crown/shell PNG maps byte-for-byte with the
actual exported files and checks that exported linear colour factors convert
back to the selected hex. Existing toolkit tests also reload VRM and GLB,
preserving rig, expressions, head attachment, visibility and license metadata.
Desktop/mobile picker paths check draft isolation, Undo/Redo, keyboard focus,
Save/reload and migration from a valid revision-3 portrait without changing the
appearance code. The production worker-cache case verifies a fresh versioned
starter image against the bundled PNG, preserves the old cached response and
reopens offline successfully.

- Type check, 210 unit tests and the production build passed.
- Twenty targeted studio checks passed across colour, gestures, export,
  portrait migration, mobile controls and responsive gameplay. After the final
  starter-URL correction, the four relevant colour/portrait checks passed again,
  and all six local-production checks passed, including the stale starter-image
  cache and offline recovery regression.
- Pinned source SHA-256 is unchanged:
  `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23`.

Generated before/after grids, metrics, UI captures and production evidence are
under `/tmp/chroma-hair-palette.YLe8xT` (temporary). The committed tests recreate
them. No push, PR, main merge, CI run or live deployment is part of this change.

## Limits

Validation uses isolated Chromium/SwiftShader guests with cloud requests
blocked. Physical-device/display colour calibration, native Safari and external
VRM viewers were not tested. The full browser suite and hosted CI were not run;
the targeted suites above cover this change. No hair physics or new hair geometry is introduced.
The original-tunic and physical-GPU limits documented previously remain unchanged.

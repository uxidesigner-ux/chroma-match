# Living map checkpoint — 2026-10-06

## Scope and evidence

The user reports difficult touch dragging after entering a region and requests
sharper artwork, wind, flowing water, birds and butterflies. They selected the
existing-art 2.5D approach, not a replacement 3D world. No analytics or physical
device usability result is inferred from this report.

Source inspection found two gesture weaknesses: transform transitions retain
their target in the camera state while the visible scene is still between
positions; movement stops being applied if a dragged finger returns within the
initial 6px dead zone. Browser image dragging/callouts are also inappropriate
for a draggable map. Live Chrome desktop panning worked; that is not proof of
the reported iOS touch failure or its complete resolution.

## Changes

- Pick up the rendered camera at pointerdown, track reversals after the drag
  threshold, capture background pointers immediately and suppress native image
  dragging/selection. Node taps and keyboard selection remain separate from pans.
  If a transition was interrupted below regional minimum zoom, settle to that
  minimum after release, not under the moving finger.
- Add one pointer-transparent native WebGL surface behind the scene controls.
  Image-space colour masks approximate water ripple, falling-water highlights
  and slight canopy wind. Authored waterfall zones differ for forest, portrait
  world and wide world. This is texture displacement, not skeletal tree motion,
  fluid simulation or individually extracted 3D terrain.
- Add two small original transparent sprite assets for swallows and butterflies.
  Flight layers share the camera's coordinate space. Texture-size limits, shader
  errors or context loss retain the original image and native map controls.
- Render the visible crop at display density (up to DPR 3), capped at 30fps and
  3.2 million drawing-buffer pixels, instead of downsampling the entire source.
  Keep the high-resolution original visible during touch drag for compositor
  panning; resume surface motion after release. Stop the
  loop when the map is hidden, document is backgrounded or modal makes the app
  inert. Reduced-motion mode uses the static original and hides flight layers.
- Preserve campaign rules, mission coordinates, rewards, account settings, UI
  hierarchy and original v1 artwork. Versioned v2 assets avoid cache-first stale
  replacements. No production package dependencies added.

## Resolution boundary

The original forest/portrait source is 1024×1536; wide source is 1672×941. An
image-generator edit requested 2048×3072 and exact layout preservation, but its
actual output remained 1024×1536. It was rejected as a resolution upgrade and is
not referenced by runtime code. No resized file is described as recovered detail.
The user subsequently approved continuing with the separately proposed local
AI upscaler/model download. Real-ESRGAN NCNN Vulkan v0.2.5.0 macOS
(`realesrgan-ncnn-vulkan-20220424-macos.zip`) was downloaded from the official
release and executed locally on Apple M4, using `realesr-animevideov3`, scale 2,
tile 256, thread tuple `1:1:1`. No OpenAI API call, remote image upload or
runtime/model production dependency was added. Output detail is AI inferred,
not recovered original source detail. All camera/route coordinates remain at
their original logical dimensions.

Official source: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan
Release: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0

Runtime outputs (ImageMagick WebP quality 88):

| Asset | Dimensions | Bytes | SHA-256 |
| --- | --- | --- | --- |
| chroma-forest-v2.webp | 2048×3072 | 1426330 | e4126779420fe173ee40e56010deff68fa1b098dc1947224794c750b8f3c9caf |
| chroma-world-v2.webp | 2048×3072 | 993204 | ffec22861d09ab9ddd739e81ac226bfaa4bb7d53a8279b60d338fe8548d26588 |
| chroma-world-wide-v2.webp | 3344×1882 | 1419928 | f9c403bb0371685037d36b9c70085f92ea2e9ee71a6554fb63f339b69f85444b |

Model binary SHA-256: `548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d`.
The upscaler and model remain outside the repository. JPEG candidates were moved
to temporary storage, not shipped, after WebP reduced total transfer size from
about 7.73MB to 3.84MB. Original v1 files remain unchanged.

Reproduction pattern (repeat for forest, world and world-wide):

```sh
realesrgan-ncnn-vulkan -i public/chroma-forest-v1.jpg -o forest-2x.png \
  -n realesr-animevideov3 -s 2 -t 256 -m /path/to/models -j 1:1:1
magick forest-2x.png -quality 88 public/chroma-forest-v2.webp
```

## Asset provenance

Built-in image generator; original assets, no franchise material. Generated
transparent PNGs were resized only for their small runtime display footprints:
`public/map-life-bird-v1.png` (256×170),
`public/map-life-butterfly-v1.png` (192×128). Original generated files remain
outside the repository. Both runtime files were inspected and transparency
checked. Prompts:

Bird: Use case: stylized-concept. Asset: single small swallow sprite for a 2.5D
isometric fantasy casual game map. One swallow seen from overhead slightly
isometric, flying to the right, open curved wings, elegant dark navy wings and
warm white belly, dimensional polished 3D rendered style, sunlight upper left.
Centered alone with ample transparent padding, natural proportions, crisp
silhouette. Truly transparent background, no scene, no ground shadow, no text,
no UI, no watermark. The sprite will be animated at 20-30px screen size.

Butterfly: Use case: stylized-concept. Single butterfly sprite for a polished
dimensional casual fantasy game map. Top-down view, wings spread symmetrically,
luminous pale turquoise and softly golden wing edges, slim small dark body.
Subtle sculpted 3D shading, no excessive detail, sunlight upper-left matching
emerald crystal forest. Centered with transparent padding. Genuine transparent
background, one butterfly only, no shadows, no plants, no words, no watermark.

## Verification / handoff

Use `tests/studio/hub-map.spec.ts` for camera targets, phone/fold/desktop bounds,
pinch/cancel, drag reversal, node taps, decorative lifecycle, reduced motion and
WebGL fallback/context loss. Inspect actual screenshots separately. Physical
iOS/Android gestures, GPU energy/fps and screen readers remain unverified. This
checkpoint does not claim deployment or physical-device acceptance.

Earlier local implementation validation (before the high-resolution follow-up):

- Typecheck and production build passed; existing >500kB vendor warnings remain.
- All 263 unit tests passed.
- Six targeted studio map cases passed, including reverse touch movement,
  pinch/cancellation, GPU loss/unavailability and reduced motion. The final
  bird heading/butterfly wing-axis refinement re-ran the two lifecycle/fallback
  cases successfully; it did not change puzzle, camera or mission geometry.
- Eight production map cases passed against a `/chroma-match/` build, including
  the locale/theme/fold matrix, real mission clear, Continue, reward integrity,
  offline reload and image/storage failure. An earlier attempt used the wrong
  root build base, failed at splash and was interrupted; rebuilding with
  `BASE_PATH=/chroma-match/` fixed the harness mismatch without weakening tests.
- Inspected generated sprite images, their alpha pixels, actual mobile forest
  screenshot and live Chrome regional map. Live inspection was of the previous
  deployed version; these local changes have not been published.
- Direct review added context-loss recovery guards, source-change invalidation,
  browser fallback and corrected sprite heading/wing axis. No independent agent
  reviewer was available. Physical-device gesture/performance testing remains.

## High-resolution follow-up validation — 2026-10-06

- All three final WebP dimensions, sizes and SHA-256 hashes above were measured;
  production `dist` copies match those source hashes exactly.
- Typecheck, `git diff --check` and `BASE_PATH=/chroma-match/ npm run build`
  passed. Existing large-vendor-chunk warnings remain.
- Eight targeted studio map cases passed with final WebP URLs. Coverage adds
  source dimensions, viewport-space canvas, drag-time static fallback, retina
  390×844 at DPR 3 (1170×2532 drawing buffer), and large-display pixel budget.
- Seven production map cases passed, including the 84 locale/theme/viewport
  matrix, genuine mission clear, reward integrity, offline reload and both
  reduced/normal-motion earned feedback. The eighth case initially failed
  because its fault injection still blocked the old JPG URL, not the new WebP.
  Updated the interception to version-independent world JPG/WebP URLs; its
  isolated rerun passed with real artwork failure and storage failure injected.
  No application assertion was removed or weakened.
- Inspected source/upscale aligned crops, all three whole-map previews and
  actual animated/static mobile, wide and retina screenshots. Layout/route
  geometry remains aligned; no obvious tile seams observed in inspected images.
  This is sampled visual review, not proof of every pixel being artifact-free.
- Direct code/diff review found the stale failure-test URL and corrected it.
  No independent agent reviewer was available. Full core/avatar unit suite was
  not rerun for this asset/render-only follow-up (263 passed earlier).
- No Git push or live deployment performed. Physical iOS/Android touch,
  browser-specific GPU performance, energy use and screen readers are still
  unverified. This is a local implementation/validation checkpoint.

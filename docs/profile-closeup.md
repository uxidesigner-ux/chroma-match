# Profile face close-up

The anime profile portrait now displays a 1.65× crop of its existing 256px bust
capture, centred horizontally and at 43% of its height. This prioritizes the
eyes and expression while retaining hair above the forehead in a circular mask.

The crop is applied by the shared profile painter, so the home profile, profile
sheet, friends/leaderboard rows and game reaction portraits use the same framing.
Full-body editing, face preview, saved character codes, Classic avatars and the
source portrait cache are unchanged. Existing cached portraits immediately use
the new crop without downloading the VRM again. A missing cache still follows
the existing regeneration path.

Acceptance: newly applied and already cached anime avatars render the same
close-up; saved appearance survives reload; the profile sheet matches the home
portrait; no extra model request on a cached reload; full-body controls still
work. Unit coverage checks crop bounds and magnification; the editor browser
test compares the actual profile pixels with the expected circular close-up
before and after reload and in the profile sheet.

Release scope also includes the preceding game-feedback and power-fusion
commits. Deployment remains the repository's GitHub Actions → GitHub Pages
pipeline, with unit, editor/game, build and production-path checks as gates.

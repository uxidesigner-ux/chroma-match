# Lobby touch and placement — 2026-10-02

The user reported accidental mobile pull-to-refresh while turning the character,
opposite-feeling drag rotation and destinations crowding the profile.

## Acceptance

- In the lobby the document root cannot pan/bounce into pull-to-refresh. The character canvas
  owns touch drags in both axes; diagonal movement still rotates by horizontal
  distance. Short-screen lobby content and sheets keep their own scroll owners.
  Leaving the lobby removes the document lock, preserving long shop screens.
- Right drags turn the character's front toward screen-right. Left drags reverse
  it; arrow keys use the same convention and Home resets to front. One primary
  pointer owns a drag, with cleanup on up/cancel/lost capture.
- Header: profile/name/coins on the left, icon-only help/settings on the right.
  Ranks/missions/shop occupy three equal footer destinations above Play, never
  overlaying the figure or the identity row. Targets remain at least 44px.
- No visible rotation sentence. Localized keyboard/screen-reader guidance stays
  associated with the focusable canvas, without consuming screen space.
- Preserve profile data, games, renderer lifecycle, all locales/themes and
  modal focus restoration. No dependencies or assets are added.

## Validation

`npm run typecheck`, `npm test`, focused lobby/touch/icon/experience checks,
`BASE_PATH=/chroma-match/ npm run build`, and `npm run test:release`.
CI continues to require the complete studio and production checks before Pages.

Touch QA sends real Chromium touch input, including diagonal movement and
cancel/restart; source tests verify projected direction. 320px phone, 430px
phone, square, desktop and short landscape layouts include a long profile name.
Production smoke also checks the actual lobby's root/touch policy and separated
profile/footer geometry, then captures a mobile lobby before the saved-editor flow.
Physical iOS/Android browser-chrome refresh and pinch/hinge behavior still require
device testing; emulation is not a universal pull-to-refresh guarantee.

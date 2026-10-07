# Profile destination and identity HUD

## Scope and acceptance

- Keep the existing earned metal portrait frames and actual progression data.
- Name is above a 24px dimensional XP gauge beside the lobby portrait.
- Settings/help move off the map into Profile; gameplay pause help remains.
- Profile is a registered screen, not a modal/dialog or a bottom sheet. The map
  is hidden, not inert under a profile overlay. Its camera/selection survive.
- A visible dimensional back arrow restores the prior destination and opener
  focus. Browser Back/Forward work for the profile entry. Choosing another dock
  destination exits Profile without reopening it on a stale history entry.
- The shared five-destination dock remains available outside gameplay.
- A sticky header keeps Back and utilities reachable while the profile scrolls.
- Identity, level/XP, cosmetics, actual statistics and sign-in are roomy cards;
  statistics preserve the real sample, filters, and statistics-only reset.
- No new account/cloud persistence promise, dependency, character-model edit,
  character rendering test, paid gate or invented statistics.

## Verification

`profile-page.spec.ts` is included in non-character game UI CI. It checks name/
gauge hierarchy, mobile/fold/desktop reflow, nested utility focus, keyboard and
browser Back/Forward, camera preservation, shared navigation, no VRM request,
no horizontal overflow and no uncaught runtime error. Existing growth, earned
frame, map and settings regressions use the new Profile entry point.

Production release tests exercise settings/theme/locale switching through
Profile before returning to map geometry checks. Physical iPhone Safari and
assistive-technology sessions still require device verification; Chromium
viewport checks are not presented as a substitute for those.

# Chroma Match analytics — 2026-10-27

## Decision and scope

Use the existing, game-specific Google Analytics 4 property, not Umami or a new
custom telemetry backend. Umami Cloud refused an additional website with
`Website limit reached`; no subscription or billing change was made. The user
subsequently chose Google Analytics instead. No Umami script is installed.

- Property: `chroma-match-49906`, property ID `554719139`, account `408515605`.
- Existing web stream: `chroma-match-web`, ID `15791702153`.
- Public measurement ID: `G-QH5S96E4FK` (not an API secret).
- Stream URL: `https://uxidesigner-ux.github.io/chroma-match/`.
- [Dashboard](https://analytics.google.com/analytics/web/#/a408515605p554719139/reports/intelligenthome).

The web stream URL was empty and is now set to the live game URL. Enhanced
measurement was already OFF and remains OFF: history changes, search forms,
downloads and outbound links must not generate uncontrolled duplicate/private
events. No new account, API key, permissions, paid service or dependency.

This change starts at live `714ba55`, in `codex/ga4-analytics`. The still-local
`bb22c98` explorer/whole-island redesign is preserved and is NOT part of this
analytics-only release. The live character renderer and its paused tests remain
unchanged.

## Experience brief

Visitors make one optional analytics decision after existing onboarding. The
question names Google Analytics and cookies; equally styled Allow/Decline
controls preserve all gameplay either way. No identity fields or technical
dashboard settings enter the player's task. First visit is a focused consent
dialog, subsequent choices use the existing Settings switch. Escape declines;
keyboard focus is contained and returned. The choice is localized in the game's
four languages, with narrow/landscape layouts and existing dimensional materials.

## Collection contract

| Event | Meaning | Allowed data |
| --- | --- | --- |
| `page_view` | One document visit after consent | Constant canonical game URL/title; referrer origin only |
| `screen_view` | Actual Map/Character/Shop/Game/Creator/Profile change | Fixed `screen_name` |
| `game_start`, `game_resume` | Successfully started/restored run | Mode, authored region/stage, level, level name, rules version |
| `level_start` | New actual puzzle stage | Same bounded game context |
| `level_end` | Verified new clear/failure/quit result | Context, outcome, success, score, action/item counts |
| `game_end` | Verified terminal result | Context, outcome and counts |
| `item_use` | Accepted item use, not targeting/cancellation | Context and one of the five known item IDs |
| `character_save` | Explicit locally applied character | No appearance/account data |
| `menu_open` | Missions/Leaderboard/Settings/Help opened | Fixed menu name |

The schema strips all other properties. No user IDs, names, email addresses,
photos, avatar codes, replay records, seeds, cell coordinates or input text.
URLs never contain query/hash data. Result UUIDs are used only in a bounded,
in-memory duplicate guard and are not transmitted. Restoring replays mutes engine
hooks; the ledger's prior finished/paid-clear state prevents result resubmission
from counting as a new completion. Aggregated analytics are not financial proof.

## Consent, failure and privacy controls

- Basic consent mode: no Google tag request or telemetry before an explicit
  Allow. Pre-consent interactions are dropped, never backfilled.
- Ads storage, ads user data and personalization remain denied. Google Signals
  and advertising personalization are disabled. No `user_id` or user properties.
- `chroma-match:analytics-consent-v1` stores only `granted`/`denied`. Storage
  failure keeps a session-only choice. Browser DNT/GPC override a stored Allow.
- The Settings switch can withdraw consent. It sets GA's disable flag, drops
  pending events, updates consent and deletes only the game's prefixed,
  `/chroma-match/`-scoped analytics cookies. Other projects' cookies are untouched.
- Consent changes in another tab are respected. Cookies use a game-specific
  prefix and host/path scope, with a 90-day configured lifetime.
- Only the production build on the game's real origin/path collects data. Local
  development, CI and other GitHub Pages projects cannot pollute production stats.
- Delayed scripts have a bounded 40-event queue and a 10-second timeout. Blockers,
  unavailable Google services and tracking exceptions must not prevent play.
- This is an implementation description, not a blanket legal-compliance claim.
  Google still processes its normal browser/network analytics metadata; a GA
  client identifier is not the game's account identifier.

## Verification and operation

`src/analytics/model.test.ts` covers opt-in parsing, origin/path exclusion,
referrer redaction, bounded metrics and rejecting private properties.
`tests/release/analytics.spec.ts` serves the production build at a mocked live
origin and intercepts Google collection: opt-in, decline/reload, DNT/GPC,
blockers, actual gameplay counts, withdrawal/cookie isolation, welcome-modal
ordering, all four locales, portrait/landscape and keyboard focus. The real-tag
case is opt-in with `GA_REAL_TAG_TEST=1` and loads Google's actual library while
intercepting every analytics collection request, so QA visits are not written to
the production dashboard. This machine resolves the Google tag host to
`0.0.0.0` / `::`; the vendor-network check is explicitly skipped rather than
bypassing its privacy/DNS configuration or claiming a verified receipt.

Official references: [pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views),
[game events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events),
[privacy controls](https://developers.google.com/tag-platform/security/guides/privacy).

Existing lockfile audits report Firebase/gRPC high-severity advisories and two
additional dev advisories. No dependency change is made here; do not apply the
suggested breaking Firebase downgrade as an analytics side effect. Large lazy
Firebase/character chunks are also pre-existing and are not performance claims.

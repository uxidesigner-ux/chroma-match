# Starting items — rules v5

Historical item-only checkpoint. The subsequently approved map and combined
release are documented in `world-map.md`; the evidence below records the earlier
local implementation stage, not the final deployment status.

Confirmed request: all three item kinds are usable at game entry. Implementation
choice: every genuinely new run receives three hammers, three rockets and three
bombs. This is a finite supply, not unlimited inventory. No stash purchase,
selection or first-run gift is required for the base supply.

## Observable contract

- New v5 runs use `zv`; v1-v4 keep their original starting stock, capacity and
  exact replay rules. Board generation and all v4 fever/upgrade/bonus rules are
  otherwise unchanged.
- The supply is deterministic engine state, with no extra claimed booster
  actions, no historical rewards and no account/stash withdrawal.
- Existing optional boosters remain bounded to two at the record's head.
  v5 holds up to five of each item, making room for three supplied plus two
  carried items. Older rules retain their capacity of three.
- Item targeting spends one item but no move, as before. Empty stock remains
  unusable; forged surplus or mid-run booster actions fail verification.
- Continue restores exact spent/earned stock. Opening, keeping, reloading or
  repeatedly continuing a run does not top up its items. Only a new run gets
  a fresh supply.
- The preparation dialog states the free supply separately from optional
  stash extras. No-extra states never imply an empty-handed start. Cancelling
  does not spend a held item. Copy and rule/ranking labels cover four locales.
- The gameplay board, hit targets, themes, portrait animation and controls
  retain their existing geometry and motion policies.

## Scope and verification

This is a local item implementation, not the proposed world-map lobby. See
`world-map-proposal.md` for the separate design proposal and approval boundary.
No new dependencies, external asset/model changes, shop-price changes, backend
ranking migration or live deployment are part of this turn.

Nine new engine tests cover the base supply, immediate use, optional capacity,
empty-stock rejection, repeated restore, real reward capacity, v1-v4 parity,
forged records and twelve real v5 runs with upgrades/fever/bonus entry.

Validation on 2026-10-05:

- `npm test`: 245 passed, zero failed/skipped.
- `npm run typecheck` and `BASE_PATH=/chroma-match/ npm run build`: passed.
  The existing large vendor-bundle warning remains; no dependency was added.
- Targeted studio suite: 14 passed. Checked item aiming/board stability, old-save
  recovery, current run rules, full-body lobby rotation/gestures/return, loading
  recovery, modal focus, theme contrast and utility hierarchy.
- Targeted production suite: 9 passed without development APIs. Checked empty
  stash supply, keyboard aiming/save/reload, optional-extra cancellation/spend,
  v4 continue/new game, pinned release assets, board/feedback stability and the
  existing v4 upgrade/fever boundary.
- Preparation-dialog matrix: four viewports (320x568, 390x844, 844x390, 720x720)
  by three themes by four locales. All 48 combinations retained visible title
  and Start action without horizontal overflow. Enlarged text at 320x568 kept
  those controls visible and allowed keyboard scrolling of the content.
- Actual screenshots reviewed: supplied item tray, short-landscape Paper
  preparation dialog and enlarged-text preparation dialog. The added guidance
  initially exposed landscape title clipping; the scoped fixed header/footer
  and scrollable content resolved it. Game-board geometry was not changed.
- `git diff --check`: passed. Review was performed directly, not by a separate
  reviewer agent. No live release or remote write was performed.

Remaining limits: Chromium automation is not physical iOS Safari/Android or
screen-reader testing. The full studio suite was not rerun, only the 14 targeted
cases. Three free items per kind and the five-item capacity are product choices,
not playtested balance findings. Existing rankings still mix labelled rule
versions; a separate regional ladder is future scope, not implemented here.

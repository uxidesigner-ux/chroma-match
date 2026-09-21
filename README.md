# Chroma Match

A match-3 puzzle that runs in the browser. No game engine, no sprite sheets, no
audio files — every gem is drawn from canvas path primitives and every sound is
synthesised from a couple of oscillators. The character lobby separately loads
a licensed 11 MB VRM model; its renderer is released when gameplay starts.

**[Play it →](https://uxidesigner-ux.github.io/chroma-match/)**

It installs as a PWA and runs with no network once it has loaded, so "add to
home screen" gives you a full-screen game with no browser chrome around it.

## How it plays

Swap two neighbouring gems to line up three or more of a colour. Clear enough
points before you run out of moves and the next level opens up.

| Match | What you get |
| --- | --- |
| Three in a line | The gems clear |
| Four in a row | A striped gem that clears its whole row |
| Four in a column | A striped gem that clears its whole column |
| An L, T or + | A bomb that clears the surrounding 3×3 |
| A 2×2 square (new runs) | A bomb that can chain with neighbouring powers |
| Five in a line | A prism — swap it onto any colour to wipe that colour off the board |

Gems that fall into a new match keep the chain going, and each step of a cascade
multiplies the score, up to ×8. Power gems caught in someone else's blast go off
too, so a well-placed bomb can unzip half the board.

Adjacent power gems fuse even without matching colours. New runs use rules v3
(`zx`); saved v1/v2 runs retain their original board and scoring. The game HUD
shows the goal, an event-reactive profile and remaining moves. Home is a rotatable
full-body lobby with breathing, blinking, wave, cheer and pose gestures.
See [the implementation checkpoint](docs/expressive-lobby.md).

## A few decisions worth explaining

**Colour is never the only signal.** Each gem colour also has its own silhouette
— circle, triangle, rounded square, diamond, flower. Roughly one player in twelve
cannot separate the red from the green at a glance, and a puzzle that depends
entirely on hue is unplayable for them. The shapes carry the same information
independently, which also makes the board easier to read at speed for everyone
else. The palette holds a sixth colour, a second blue, which sits out for the
same reason: next to the existing blue it is the hardest pair to tell apart.

**The board's shape was measured, not chosen.** `npm run tune` plays every
candidate board — 6 to 8 columns, 7 to 10 rows, 5 or 6 colours — with a
mid-strength policy and reports the tap-target size, how much of the screen the
board covers, how many legal moves it offers per turn, how often it deadlocks
and the spread of what it scores. An 8-wide board cannot clear the 44px minimum
touch target on a 375pt phone — it lands at 43px even after the page gutters
were tightened — and the square board covered a little over half the stage. The
6×9 board it ships with gives 57px cells and covers 85%.

The same harness drove the difficulty retune. The original curve started at 1200
and climbed 900 a level against a fixed 25 moves, which ended runs at level 4.3
on average. Starting at 1800 and climbing 200, with two extra moves every third
level, takes that to 7.9.

**The harness was wrong once, which is worth recording.** Its first version
derived a "wall" — the level a target becomes unclearable — from the *mean*
points per move, and reported that the old curve made level 4 arithmetically
impossible. A mean is not a ceiling; half of all runs beat it, and level 4 was
in fact cleared by a good share of seeds. Worse, the measurement stopped each
run the moment it crossed the level-1 target, so it was averaging truncated
level openings against the very curve it was evaluating. The sweep now plays a
full move budget with the target lifted out of the way and reports the median
and p90 of whole runs; the only line it calls a wall is one a p90 run still
falls short of. The retune survived the correction — the old curve was steep
rather than impossible — but the reasoning that justified it did not.

**Boards are seeded and reproducible.** The URL takes a `?seed=` parameter that
pins every run in the tab, and
the current seed is printed under the board. `?seed=1A2B` always deals the same
opening position, so a bug report can name the board it happened on.

**The board can never deadlock.** After every settle the game checks whether a
legal swap still exists and reshuffles the gems in place if it doesn't. The
opening deal is built constructively — no colour is placed where it would
complete a run — so a new game never starts with points it didn't earn.

**Nothing is a binary, including the icons.** `npm run icons` rasterises the
app icons from the same palette the board uses and encodes the PNGs against
Node's zlib, so changing a colour is a one-line edit rather than a round trip
through a design tool. No dependency does the drawing.

**The phone is a first-class target, not a narrow desktop.** Portrait uses the
full dynamic viewport so the footer never hides behind the browser's chrome.
Landscape moves the readouts into a side rail rather than squeezing the board
into a letterbox — and on a phone lying down, where nine rows cannot fit above a
44&nbsp;px tap target at any padding, it asks to be turned upright instead of
silently shrinking the gems, with an escape for anyone who means it. Buttons get 44&nbsp;px targets on touch devices, a swipe
commits at a third of a cell, and matches carry a short vibration where the
platform supports one.

**Logic and rendering stay apart.** `src/game/` is pure data: a flat array of
gems, match detection, gravity, a phase machine. It has no reference to a canvas
or a DOM node, which is why the whole thing can be tested headlessly — including
playing complete games and asserting the board is whole, matchless and playable
after every single move. Board size is a value rather than a constant, so the
tuning harness can play a shape the game does not ship, and the rules tests pin
their own board instead of breaking every time the shipping one is retuned.

## Layout

```
src/
  game/          rules and state, no rendering
    types.ts     grid shape and the Gem record
    rng.ts       seedable PRNG
    board.ts     match detection, power gems, gravity, shuffling
    game.ts      phase machine, scoring, levels
    *.test.ts    headless tests, run by node --test
  render/
    theme.ts     palette and shape assignment
    shapes.ts    gem silhouettes as canvas paths
    renderer.ts  the board, drawn every frame
    particles.ts confetti and floating score labels
  ui/hud.ts      every DOM node outside the canvas
  audio.ts       oscillator sound kit
  haptics.ts     vibration patterns, inert where unsupported
  input.ts       tap and drag-to-swap
  main.ts        wiring and the frame loop
public/
  manifest.webmanifest
  sw.js          offline cache: network-first page, cache-first assets
  icons/         generated by scripts/make-icons.mjs — do not hand-edit
scripts/
  make-icons.mjs draws the icons and encodes the PNGs
  tune-board.ts  plays candidate boards and prints what each one does
```

## Development

```bash
npm install
npm run dev        # vite dev server
npm test           # headless rules tests, no browser needed
npm run typecheck  # tsc --noEmit
npm run icons      # regenerate public/icons from scripts/make-icons.mjs
npm run tune       # replay the board-shape and difficulty sweep
npm run build      # typecheck, parse the service worker, then bundle to dist/
```

The tests run straight off the TypeScript sources through Node's built-in type
stripping, so there is no separate test build to keep in sync. Node 22.18 or
newer is required for that.

Pushes to `main` typecheck, test, build, and deploy to GitHub Pages.

### Levels

A level used to ask one question — reach a score — with the number going up.
That is a difficulty curve, not variety: the best way to play level twelve was
the best way to play level one, only for longer. Levels now rotate through
three goals, each rewarding a different read of the board:

| Goal | What it rewards |
| --- | --- |
| **Score** | cascades — the biggest number comes from the deepest chain |
| **Colour** | turning down a good match in the wrong colour |
| **Power gems** | building fours and fives instead of taking every three |

The counts are measured rather than argued. `npm run tune` plays every goal on
its own move budget and reports what share of seeds clear it: the first guesses
finished a colour level in 13 of its 25 moves and a power level in 8.5, against
19 for the score level next to them — they were not variety, they were a rest
stop that still paid out an item. Both curves now aim at about three quarters of
the budget, which puts them at 83–90% cleared alongside the score levels' 78–95%.

The cycle opens with two score levels so a new player learns the board first,
and every goal is a pure function of the level number — a goal decided by a dice
roll would have to be recorded and trusted, while one derived from the level is
recomputed by anyone replaying the run.

### Putting a run down and picking it back up

A run can be paused from the one control left on the board, and paused offers
two genuinely different ways out. **Keep for later** puts the run down where it
stands; **End run now** finishes it, which banks the score, pays the coins and
lets it be posted. The old footer's "Home" did neither — it walked away from the
board, and a long run left that way earned nothing at all.

Keeping costs almost nothing to store, because a run is already fully described
by its seed and its actions: a level-3 run 38 moves deep saves as 76 characters,
and resuming is replaying them. Nothing else is written down — not the board,
the score, the level, the moves left or the tray — so nothing else can drift out
of step with the rest. It is the same record the leaderboard verifies, so a
resumed run is still a postable one.

Replaying is not instant at length: roughly six milliseconds an action, so a
couple of hundred moves is over a second of work. The Continue button says it is
restoring and gives the browser a frame to paint that before it starts. A run is
also kept automatically when the tab goes away, because phones evict
backgrounded pages without warning and a run is the one thing here that cannot
be rebuilt from anything else.

A save that will not replay — one written by an older version of the rules, or
edited — is refused rather than half-applied, and says so. Losing a kept run is
bad; being dropped onto a board that is not the one you left is worse.

### The first session

A new player used to meet every part of the meta as an absence: three greyed-out
item buttons, a shop they could afford nothing in, and a loadout screen whose
whole content was an apology. None of it turned on until they cleared a level.

So a first visit hands out a starter kit — 150 coins, a hammer and a bomb — and
says so on a card, because an inventory that fills itself silently reads as a
bug. The kit is deliberately enough to use an item on the first board and to
afford one hammer in the shop, and nowhere near enough to skip earning the rest.
It is granted once per device against a flag, not against an empty stash: a
player who spends everything and comes back is not a new player.

Arming an item is the one interaction here that cannot be discovered by trying —
the tray reads as a readout until you press it, and pressing it only pays off if
you press the board next. So the tray says what to do while a run holds an item
and nothing has ever been spent, and stops for good the first time one is.

### Coins, the shop, and what you carry in

A finished run pays coins for the score it reached and the levels it cleared.
Coins buy items in the shop, and items bought there are kept between runs; when
you press **Play** you choose up to two to carry in, and they start in the tray.

Prices are set in runs rather than in coins. The sweep puts a median run at
around 130 coins, and the ladder is built on it: a hammer is about one run, a
rocket two, a bomb three and a half. The first attempt priced a bomb at 1.4 runs,
which made carrying two boosters the default state rather than a decision —
`meta.test.ts` now holds the ladder to those run-counts so neither side can move
without the other noticing.

This is the one place where something outside a run touches a run, so the seam
is drawn explicitly:

- **What a run earns stays inside it.** Items earned by clearing levels or
  landing chains die with the run, as before.
- **What you carry in is recorded, and capped at two.** A booster is bought
  with coins on your own device, so no replay can confirm the purchase — the
  record simply asserts it. What the verifier can do is bound the assertion:
  at most two, only at the head of the record, never more than the inventory
  cap. A forged record therefore claims exactly what a few runs' coins buy
  legitimately, and nothing beyond it. Everything after those first two codes
  is proved by replay as before.

The coin balance and the stash live in `localStorage` and are not defended:
editing your own balance only cheats a shop you own. The thing worth defending
is the leaderboard, and that is defended by the replay.

### Items

Three things a player holds and spends, as opposed to the power gems the board
hands them: a **hammer** takes one gem, a **rocket** takes a row, a **bomb**
takes the square around a cell. They are aimed anywhere and cost no move, which
is the whole appeal — so the supply is earned, not bought:

- finishing a level pays one, on a fixed rotation a player can plan around;
- landing a &times;5 chain pays a bomb.

**They are earned inside a run and die with it**, and that is a requirement
rather than a scope cut. A posted run is verified by replaying its seed and its
actions, so everything a run depends on has to be inside that record — an
inventory carried between sessions would make two players with the same seed
and the same moves score differently, and the top of the board would belong to
whoever hoarded longest.

An item use is written into the run record in the same two base36 characters a
swap uses: swaps occupy `cell * 4 + direction`, which leaves the rest of the
range free. So a run that spent items is the same length, the same alphabet and
the same security rules as one that did not. The verifier keeps no inventory of
its own — it earns items by replaying the same levels and chains the run did, so
a submission that spends a bomb it never earned fails on that action.

### Feedback

**A detonation is telegraphed before it lands.** A power gem used to take its
row on the same frame it went off, which reads as the board losing a row rather
than as the player firing something. There is a 150ms strike phase first, during
which nothing is removed — the gems are all still there to be hit, because a
wind-up against an empty row is not a wind-up. Only detonations get one: a plain
three already pops well, and a wind-up on every match would slow the whole game
down to dress up its most ordinary event.

**Every blast fires at the cells it is about to take, one bolt each, all at
once.** The first version drew an expanding ring for anything that was not a
line, which was a picture of a blast rather than the blast: it swept over gems
that were not going anywhere and said nothing about which ones were. The bolts
cannot be wrong about that, because the rules hand the renderer the same list
they are about to clear. They all leave at one speed, so near cells are hit
first and far ones a moment later — that stagger is what separates a volley
from a starburst.

A bolt is three passes: a wide soft field, a heavy body in the gem's own colour
so the board says which gem fired, and a hot core taken from the skin so it
reads on a cream sheet as well as on black. Thick on purpose — a hairline is a
laser pointer, and what this wants is mass.

Three more things carry the feel of a run, and all three are deliberately placed:

- **The chain badge** sits above the board, not in the readouts, and climbs
  through four colour rungs. A cascade used to be reported only by a number
  that faded in under a second — by the time the player looked, the chain had
  ended.
- **The board takes a hit** in proportion to what landed: how much of it went
  at once, and how deep into a chain it was. The travel is capped at a few
  pixels, because a shake big enough to read as movement costs the player track
  of their own board.
- **The end-of-run card leads with the score,** and the heaviest thing on it is
  the button that starts the next run.

A player who has asked their platform for reduced motion keeps all of it except
the camera and the badge's pop.

### Skins

The look is a swap-in layer. `src/render/skins/` holds one file per skin — its
palette, the board furniture, the CSS custom properties it sets on `:root`, and
three painting passes the renderer calls for every gem. Three ship: **Jewel**, the
original cut stones; **Glass**, translucent panes over a frosted, blurred
interface; and **Paper**, flat shapes cut from coloured stock on a cream sheet,
with hard offset shadows and no gradient anywhere. The launch screen has a
toggle, `?skin=paper` selects one from a link, and the choice is remembered per
device.

A skin owns colour, silhouette and finish. It cannot change the board's shape or
how many kinds are in play: a leaderboard row carries the board it was played on
and every client replays that run before believing the score, so moving those
numbers would invalidate every record posted under the previous skin. The tests
in `src/render/skins/skins.test.ts` pin what a new skin must not break —
including that every kind keeps its own silhouette, which is what makes the
board readable without relying on hue.

### Firestore rules

`firestore.rules` is deployed by its own workflow rather than pasted into the
Firebase console, so the file in this repository is the live ruleset — a rule
edited in the console is overwritten by the next push that touches it. Pull
requests compile the rules without deploying them, because a broken rule is
discovered by locking every player out of the board.

The workflow needs one repository secret, `FIREBASE_SERVICE_ACCOUNT`: the JSON
key of a service account in the `chroma-match-49906` project holding the
Firebase Rules Admin role. Without that secret the job skips instead of
failing, so a fork still gets a green CI.

## Anime profile studio

Profile → Edit character opens the VRM editor adapted from
M3-org/CharacterStudio. One licensed Seed-san model offers ponytail/bob visibility,
four palettes, editable colours, expressions and an equipment toggle. Apply saves
the character on this device and uses the existing signed-in profile publishing
path. Existing anime appearances migrate to the compact v4 code; retired or
invalid profile formats display the anime starter. There is no second character style.

The approximately 11 MB model and 3D runtime load on demand. A generated portrait
is cached for profile display; a bundled starter portrait keeps the first screen
independent of WebGL. This is a starter integration, not the DropHunter
asset catalogue or an arbitrary garment/model importer. See
[architecture, licensing and limits](docs/character-studio.md).

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:studio`.
The browser suite requires `npx playwright install chromium` once.
The deployment workflow also runs the browser suite and `npm run test:release`
against the production build before publishing. To run release checks locally,
first build with `BASE_PATH=/chroma-match/ npm run build`.

## License

Code: MIT — see [LICENSE](LICENSE). The Seed-san model has separate VRM license
settings and attribution requirements; see [asset credits](public/licenses/anime-assets.html).

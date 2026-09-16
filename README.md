# Chroma Match

A match-3 puzzle that runs in the browser. No game engine, no sprite sheets, no
audio files — every gem is drawn from canvas path primitives and every sound is
synthesised from a couple of oscillators. The whole thing ships as ~9 kB gzipped.

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
| An L or a T | A bomb that clears the surrounding 3×3 |
| Five in a line | A prism — swap it onto any colour to wipe that colour off the board |

Gems that fall into a new match keep the chain going, and each step of a cascade
multiplies the score, up to ×8. Power gems caught in someone else's blast go off
too, so a well-placed bomb can unzip half the board.

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

**Boards are seeded and reproducible.** The URL takes a `?seed=` parameter, and
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

### Skins

The look is a swap-in layer. `src/render/skins/` holds one file per skin — its
palette, the board furniture, the CSS custom properties it sets on `:root`, and
three painting passes the renderer calls for every gem. Two ship: **Jewel**, the
original cut stones, and **Glass**, translucent panes over a frosted, blurred
interface. The launch screen has a toggle, `?skin=glass` selects one from a
link, and the choice is remembered per device.

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

## License

MIT — see [LICENSE](LICENSE).

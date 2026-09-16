# Chroma Match

A match-3 puzzle that runs in the browser. No game engine, no sprite sheets, no
audio files — every gem is drawn from canvas path primitives and every sound is
synthesised from a couple of oscillators. The whole thing ships as ~9 kB gzipped.

**[Play it →](https://uxidesigner-ux.github.io/chroma-match/)**

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

**Colour is never the only signal.** Each of the six gem colours also has its own
silhouette — circle, triangle, rounded square, diamond, hexagon, flower. Roughly
one player in twelve cannot separate the red from the green at a glance, and a
puzzle that depends entirely on hue is unplayable for them. The shapes carry the
same information independently, which also makes the board easier to read at
speed for everyone else.

**Boards are seeded and reproducible.** The URL takes a `?seed=` parameter, and
the current seed is printed under the board. `?seed=1A2B` always deals the same
opening position, so a bug report can name the board it happened on.

**The board can never deadlock.** After every settle the game checks whether a
legal swap still exists and reshuffles the gems in place if it doesn't. The
opening deal is built constructively — no colour is placed where it would
complete a run — so a new game never starts with points it didn't earn.

**Logic and rendering stay apart.** `src/game/` is pure data: a flat array of
gems, match detection, gravity, a phase machine. It has no reference to a canvas
or a DOM node, which is why the whole thing can be tested headlessly — including
playing 25 complete games and asserting the board is whole, matchless and
playable after every single move.

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
  input.ts       tap and drag-to-swap
  main.ts        wiring and the frame loop
```

## Development

```bash
npm install
npm run dev        # vite dev server
npm test           # headless rules tests, no browser needed
npm run typecheck  # tsc --noEmit
npm run build      # typecheck, then a production bundle in dist/
```

The tests run straight off the TypeScript sources through Node's built-in type
stripping, so there is no separate test build to keep in sync. Node 22.18 or
newer is required for that.

Pushes to `main` typecheck, test, build, and deploy to GitHub Pages.

## License

MIT — see [LICENSE](LICENSE).

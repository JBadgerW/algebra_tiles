# Match the Tiles

A drag-and-drop matching game, a companion to *Order the Tiles*. Students pick a question bank from the
menu. Questions sit in a column on the left and their answers are shuffled into a column on the right.
Students drag each answer across from its question. When every answer in the set lines up, the set
clears and a new one is dealt. Once the whole bank is done they see **"You did it!"** with their
time, correct tiles per minute, and incorrect tiles per minute.

It's a static site: plain HTML, CSS and JavaScript, with no build step and no server code.

## Run it locally

The page loads its banks with `fetch`, so it must be served over HTTP.
Opening `index.html` straight from disk won't work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000 (or http://<this-computer's-IP>:8000 from another machine on the LAN)
```

## Hosting

- **GitHub Pages:** push the repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**.
- **Your own network:** copy the folder to any web server, or run `python3 -m http.server 8000`
  on a machine students can reach.

You can link students straight to a bank: `…/#/play/one-step-equations`.

Math is drawn by [KaTeX](https://katex.org) 0.16.11, bundled in `vendor/katex/` (MIT license), so
the game works on a LAN with no internet. Only the `.woff2` fonts are included, which every current
browser uses; `katex.min.css` was trimmed to match.

## How it plays

- **Rounds:** each round deals up to 6 random pairs from the bank (or the bank's `roundSize`). Every
  pair is served exactly once per game. The last round gets whatever is left. If that would leave a
  single pair (which can't be shuffled), the round before it is dealt one fewer.
- **Shuffling:** no answer ever starts across from its own question.
- **Layout:** the side with longer text gets more of the width (e.g. long descriptions beside short
  names), and no column gets narrower than its longest word.
- **Moving:** drag an answer onto any part of another row (its question or its answer), and the two
  answers trade places.
- **Easy / Hard:** chosen on the menu (the browser remembers the choice). In Easy mode a row whose
  answer is right gets a green edge, and a wrong drop gives a little shake. Hard mode shows nothing
  until the whole set is right.
- **Correct:** every answer tile a move puts across from its question. A swap can put two answers in
  place at once, which counts as 2.
- **Incorrect:** a move that leaves the dragged answer across from the wrong question.
- **Rates:** correct (or incorrect) placements ÷ minutes taken for the whole bank.
- **Devices:** mouse, touch screen and keyboard all work. With the keyboard, Tab moves to an answer,
  the arrow keys move between answers, Space picks one up, the arrows choose a row, Space swaps, and
  Escape puts it back.

## Adding question banks

All banks live in `banks/`. After adding, removing, or renaming one, rebuild the menu list:

```sh
python3 tools/build_index.py
```

The script also checks each bank and warns about answers that appear twice. A repeated answer still
works: either copy counts as right in either row.

`banks/<id>.json`:

```json
{
  "title": "One-Step Equations",
  "description": "Match each equation with its solution.",
  "pairs": [
    { "q": "$x + 5 = 12$", "a": "$x = 7$" },
    { "q": "$\\dfrac{x}{5} = 4$", "a": "$x = 20$" },
    { "q": "Variable", "a": "A letter that stands for an *unknown* number" }
  ]
}
```

**Text:** `$…$` is inline math and `$$…$$` is math on its own line (KaTeX/LaTeX syntax). Because this is
JSON, every backslash is doubled: write `\\frac`, not `\frac`. For a literal dollar sign, write `\\$`.
Outside math, `*bold*` and `_italic_` work.

### Optional fields

| Field | Effect |
|---|---|
| `description` | A line under the title on the menu card |
| `roundSize` | How many pairs per round (default 6, at least 2) |
| `include` | A list of other bank ids whose pairs this bank also plays, e.g. `["iliad-achaians", "iliad-trojans", "iliad-immortals"]`. Use it for a cumulative test built from slices of the material, so each pair is written only once. A bank can have both its own `pairs` and an `include` |
| `order` | A number that sets the menu position (lower comes first); otherwise banks are listed alphabetically |
| `hidden` | `true` leaves the bank off the menu; it still plays from a direct link (`#/play/<id>`) |

## Files

```
index.html            page shell (loads KaTeX)
css/style.css         all styling (light and dark themes)
js/app.js             menu, game screen and rounds, "You did it!" message, routing
js/board.js           one round: shuffling, dragging, keyboard moves, scoring, win check
js/util.js            shared helpers (math/text rendering, shuffles)
banks/                question bank JSON files and index.json
tools/build_index.py  rebuilds banks/index.json and checks the banks
vendor/katex/         KaTeX math rendering (JS, CSS, woff2 fonts, license)
```

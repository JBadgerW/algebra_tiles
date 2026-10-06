// Screens and routing. URLs:
//   #/            the menu
//   #/play/<id>   a question bank (banks/<id>.json)
import { createRound } from './board.js';
import { el, fetchJSON, formatTime, shuffle, store, BANK_DIR } from './util.js';

const TITLE = 'Match the Tiles';
const MODE_KEY = 'match-the-tiles:mode';
const DEFAULT_ROUND = 6;
const app = document.getElementById('app');

let indexPromise = null;
const loadIndex = () => (indexPromise ??= fetchJSON(BANK_DIR + 'index.json'));

const getMode = () => (store.get(MODE_KEY, 'easy') === 'hard' ? 'hard' : 'easy');

// Whatever the current screen needs undone when we leave it (the game's clock).
let cleanup = () => {};

function show(...nodes) {
  document.querySelector('.overlay')?.remove();
  app.replaceChildren(...nodes);
  scrollTo(0, 0);
}

function showError(err) {
  const onFile = location.protocol === 'file:';
  show(el('main', { class: 'screen error' },
    el('h1', {}, 'Something went wrong'),
    el('p', {}, onFile
      ? 'This page has to be opened through a web server, not straight from the file. In this folder, run "python3 -m http.server" and open http://localhost:8000.'
      : String(err.message || err)),
    el('p', {}, el('a', { class: 'btn', href: '#/' }, 'Back to menu')),
  ));
  console.error(err);
}

// ---------- Menu ----------

function modeToggle() {
  const hint = el('p', { class: 'mode-hint' });
  const buttons = ['easy', 'hard'].map(mode => el('button', {
    type: 'button', class: 'seg', 'data-mode': mode,
    onclick: () => { store.set(MODE_KEY, mode); update(); },
  }, mode === 'easy' ? 'Easy' : 'Hard'));

  function update() {
    const mode = getMode();
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    hint.textContent = mode === 'easy'
      ? 'An answer across from its question gets a green edge.'
      : 'No hints: you won’t know an answer is right until the whole set is.';
  }
  update();

  return el('div', { class: 'mode' },
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Difficulty' }, buttons),
    hint,
  );
}

function bankCard(b) {
  return el('a', { class: 'card', href: `#/play/${encodeURIComponent(b.id)}` },
    el('div', { class: 'card-art' },
      el('div', { class: 'art-count-box' },
        el('span', { class: 'art-count' }, String(b.count)),
        el('span', { class: 'art-label' }, 'pairs'))),
    el('div', { class: 'card-text' },
      el('h2', {}, b.title),
      b.description && el('p', {}, b.description),
      el('span', { class: 'card-meta' }, `${b.count} questions`),
    ),
  );
}

async function showMenu() {
  document.title = TITLE;
  const banks = await loadIndex();
  show(el('main', { class: 'screen menu' },
    el('header', { class: 'menu-head' },
      el('div', {},
        el('h1', {}, TITLE),
        el('p', { class: 'lede' }, 'Pick a set, then drag each answer across from its question.'),
      ),
      modeToggle(),
    ),
    banks.length
      ? el('div', { class: 'cards' }, banks.map(bankCard))
      : el('p', {}, 'No question banks yet. Add one to the banks folder and run tools/build_index.py.'),
  ));
}

// ---------- Game ----------

// How many pairs the next round gets: up to `size`, but never leave a lone
// pair for the last round (one pair can't be shuffled, so it would be a freebie).
function nextRoundSize(remaining, size) {
  const take = Math.min(size, remaining);
  return remaining - take === 1 && take > 2 ? take - 1 : take;
}

const perMinute = (count, ms) => {
  const rate = count / (ms / 60000);
  return rate >= 10 ? String(Math.round(rate)) : rate.toFixed(1);
};

async function showGame(id) {
  const bank = await fetchJSON(`${BANK_DIR}${encodeURIComponent(id)}.json`);
  const pairs = (bank.pairs ?? []).filter(p => p?.q != null && p?.a != null)
    .map(p => ({ q: String(p.q), a: String(p.a) }));
  if (!pairs.length) throw new Error(`${id}.json has no "pairs" with both a "q" and an "a"`);
  document.title = `${bank.title} · ${TITLE}`;

  const easy = getMode() === 'easy';
  const size = Math.max(2, Number(bank.roundSize) || DEFAULT_ROUND);
  const queue = shuffle(pairs);
  let next = 0;          // index in `queue` of the first pair not yet served
  let correct = 0;
  let incorrect = 0;
  let started = 0;
  let over = false;

  const clock = el('b', {}, '0:00');
  const rightCount = el('b', {}, '0');
  const wrongCount = el('b', {}, '0');
  const progress = el('span', { class: 'progress-text' });
  const bar = el('span', { class: 'progress-fill' });
  const stage = el('div', { class: 'stage' });

  function setProgress(done) {
    progress.textContent = `${done} of ${queue.length} matched`;
    bar.style.width = `${(100 * done) / queue.length}%`;
  }

  const tick = () => { clock.textContent = formatTime(performance.now() - started); };
  const timer = setInterval(tick, 1000);
  cleanup = () => { over = true; clearInterval(timer); };

  function startRound() {
    const round = queue.slice(next, next + nextRoundSize(queue.length - next, size));
    const board = createRound({
      pairs: round,
      easy,
      onPlace(right, wrong) {
        correct += right;
        incorrect += wrong;
        rightCount.textContent = String(correct);
        wrongCount.textContent = String(incorrect);
      },
      onSolved() {
        next += round.length;
        setProgress(next);
        if (next >= queue.length) {
          const ms = performance.now() - started;
          cleanup();
          tick();
          setTimeout(() => celebrate({ ms, correct, incorrect, easy }), 600);
          return;
        }
        // Let the green set sit for a moment, then clear it and deal the next one.
        setTimeout(() => {
          if (over) return;
          board.element.classList.add('leaving');
          setTimeout(() => { if (!over) startRound(); }, 300);
        }, 700);
      },
    });
    stage.replaceChildren(board.element);
  }

  const stat = (cls, label, value) =>
    el('span', { class: `stat-chip ${cls}`, title: label }, el('span', { class: 'sr-only' }, `${label} `), value);

  show(el('main', { class: 'screen play' },
    el('header', { class: 'play-bar' },
      el('a', { class: 'btn quiet', href: '#/' }, '← Menu'),
      el('h1', {}, bank.title),
      el('div', { class: 'stats' },
        el('span', { class: `badge badge-${easy ? 'easy' : 'hard'}` }, easy ? 'Easy' : 'Hard'),
        stat('chip-time', 'Time', clock),
        stat('chip-right', 'Correct', rightCount),
        stat('chip-wrong', 'Incorrect', wrongCount),
      ),
    ),
    el('div', { class: 'progress' },
      el('span', { class: 'progress-track' }, bar),
      progress,
    ),
    el('p', { class: 'instructions' }, 'Drag each answer onto the row of its question. The two answers trade places.'),
    stage,
  ));
  setProgress(0);
  started = performance.now();
  startRound();
}

function celebrate({ ms, correct, incorrect, easy }) {
  const stat = (value, label) =>
    el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, String(value)), el('span', { class: 'stat-label' }, label));

  const playAgain = () => { document.removeEventListener('keydown', onKey); route(); };
  const onKey = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); location.hash = '#/'; } };

  const overlay = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'win-title' },
    el('div', { class: 'win' },
      el('h2', { id: 'win-title' }, 'You did it!'),
      el('div', { class: 'win-stats' },
        stat(formatTime(ms), 'time'),
        stat(perMinute(correct, ms), 'correct / min'),
        stat(perMinute(incorrect, ms), 'incorrect / min'),
      ),
      el('p', { class: 'win-mode' },
        `${correct} correct · ${incorrect} incorrect · ${easy ? 'Easy' : 'Hard'} mode`),
      el('div', { class: 'win-actions' },
        // Same URL, so re-run the route: a fresh, reshuffled game (show() drops this overlay).
        el('button', { type: 'button', class: 'btn primary', onclick: playAgain }, 'Play again'),
        el('a', { class: 'btn', href: '#/' }, 'Back to menu'),
      ),
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector('.btn.primary').focus();
}

// ---------- Routing ----------

async function route() {
  cleanup();
  cleanup = () => {};
  const [, id] = location.hash.match(/^#\/play\/(.+)$/) ?? [];
  app.setAttribute('aria-busy', 'true');
  try {
    if (id) await showGame(decodeURIComponent(id));
    else await showMenu();
  } catch (err) {
    showError(err);
  } finally {
    app.removeAttribute('aria-busy');
  }
}

addEventListener('hashchange', route);
route();

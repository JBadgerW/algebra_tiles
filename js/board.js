// One round of matching: questions sit in a column on the left, their answers
// are shuffled into a column on the right. Students drag an answer onto a row
// (mouse or touch), or use the keyboard, and the two answers trade places.
//
// Every answer tile a move puts across from its question counts as correct;
// a move that leaves the dragged answer in the wrong row counts as incorrect.
import { el, richText, shuffledOrder } from './util.js';

const DRAG_THRESHOLD = 6;   // px of movement before a press becomes a drag
const EDGE = 70;            // px from the window edge where auto-scroll starts
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const keyOf = text => text.replace(/\s+/g, ' ').trim();

// Give the side with longer text more of the width, so long descriptions
// beside one-word answers don't wrap into tall, narrow tiles.
function columnWidths(pairs) {
  const avg = side => pairs.reduce((sum, p) => sum + p[side].length, 0) / pairs.length;
  const ratio = Math.min(2.2, Math.max(1 / 2.2, Math.sqrt(avg('q') / avg('a'))));
  return `--q-fr: ${ratio.toFixed(2)}fr; --a-fr: 1fr`;
}

export function createRound({ pairs, easy, onPlace, onSolved }) {
  const n = pairs.length;
  const board = el('div', { class: 'match-board', role: 'list' });
  const live = el('div', { class: 'sr-only', 'aria-live': 'polite' });
  const wrapper = el('div', { class: 'board-wrap', style: columnWidths(pairs) }, board, live);
  // Row 1 holds the column headings; pair i sits in grid row i + 2.
  board.append(
    el('span', { class: 'match-head', style: 'grid-column: 1', 'aria-hidden': 'true' }, 'Questions'),
    el('span', { class: 'match-head', style: 'grid-column: 3', 'aria-hidden': 'true' }, 'Answers'),
  );

  // What belongs in each row: the key of that row's answer.
  const expected = pairs.map(p => keyOf(p.a));
  const questions = pairs.map((p, row) => el('div', {
    class: 'tile question', style: `grid-row: ${row + 2}`,
  }, el('div', { class: 'tile-body', html: richText(p.q) })));
  const links = pairs.map((_, row) => el('div', {
    class: 'link', style: `grid-row: ${row + 2}`, 'aria-hidden': 'true',
  }));

  // slots[row] is the answer tile currently in that row.
  const slots = shuffledOrder(expected).map(i => el('div', {
    class: 'tile answer', tabindex: '0', role: 'listitem', 'data-key': expected[i],
  }, el('div', { class: 'tile-body', html: richText(pairs[i].a) })));
  const rowOf = tile => slots.indexOf(tile);
  const isRight = tile => tile.dataset.key === expected[rowOf(tile)];

  function layout() {
    slots.forEach((tile, row) => {
      tile.style.gridRow = String(row + 2);
      tile.setAttribute('aria-label', `Answer in row ${row + 1}: ${tile.textContent}`);
    });
  }
  for (let row = 0; row < n; row++) board.append(questions[row], links[row], slots[row]);
  layout();

  let locked = false;
  const announce = msg => { live.textContent = msg; };

  // Mark rows that are right (shown only in Easy mode) and report whether solved.
  function refresh() {
    let solved = true;
    slots.forEach((tile, row) => {
      const ok = isRight(tile);
      if (!ok) solved = false;
      for (const e of [questions[row], links[row], tile]) e.classList.toggle('correct', easy && ok);
    });
    return solved;
  }

  // FLIP animation: measure, swap the rows, then animate each answer from
  // where it was to where it now is.
  function swap(a, b) {
    const first = new Map(slots.map(e => [e, e.getBoundingClientRect()]));
    slots.forEach(e => e.getAnimations().forEach(x => x.cancel()));
    const ra = rowOf(a), rb = rowOf(b);
    slots[ra] = b;
    slots[rb] = a;
    layout();
    if (reduceMotion.matches) return;
    for (const e of [a, b]) {
      const p = first.get(e);
      const q = e.getBoundingClientRect();
      e.animate(
        [{ transform: `translate(${p.left - q.left}px, ${p.top - q.top}px)` }, { transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(.2, .7, .3, 1)' },
      );
    }
  }

  // `tile` was moved into `target`'s row; score it, then check for a win.
  function place(tile, target) {
    swap(tile, target);
    const correct = [tile, target].filter(isRight).length;
    const incorrect = isRight(tile) ? 0 : 1;
    onPlace(correct, incorrect);
    if (!isRight(tile)) nope(tile);
    if (refresh()) {
      locked = true;
      board.classList.add('solved');
      [...questions, ...links, ...slots].forEach(t => t.classList.add('correct'));
      announce('All matched!');
      onSolved();
    } else {
      announce(`Moved to row ${rowOf(tile) + 1}.`);
    }
  }

  // A wrong placement gets a small shake in Easy mode; Hard mode gives nothing away.
  function nope(tile) {
    if (!easy || reduceMotion.matches) return;
    tile.classList.remove('missed');
    void tile.offsetWidth;
    tile.classList.add('missed');
  }

  // ---- Pointer dragging (mouse, pen, touch) ----
  let drag = null;

  board.addEventListener('pointerdown', e => {
    if (locked || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const tile = e.target.closest('.answer');
    if (!tile || tile.parentNode !== board || tile.classList.contains('placeholder')) return;
    e.preventDefault();
    if (held) dropHeld(false);
    drag = {
      tile, id: e.pointerId, x: e.clientX, y: e.clientY,
      startX: e.clientX, startY: e.clientY, active: false, target: null,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  function startDrag() {
    const { tile } = drag;
    const r = tile.getBoundingClientRect();
    drag.offsetX = drag.startX - r.left;
    drag.offsetY = drag.startY - r.top;
    const ghost = tile.cloneNode(true);
    ghost.classList.remove('correct', 'missed');
    ghost.classList.add('ghost');
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.append(ghost);
    drag.ghost = ghost;
    drag.active = true;
    tile.classList.add('placeholder');
    board.classList.add('dragging');
    document.body.classList.add('is-dragging');
    autoScroll();
  }

  function onPointerMove(e) {
    if (e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return;
      startDrag();
    }
    drag.ghost.style.transform =
      `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`;
    updateTarget();
  }

  // Which row is under the point? Anywhere across the row counts, so an answer
  // can be dropped on the question itself. Uses layout positions (offset*),
  // which ignore the slide animations.
  function answerAt(x, y) {
    const b = board.getBoundingClientRect();
    if (x < b.left - 40 || x > b.right + 40) return null;
    const py = y - b.top;
    return slots.find(t => py >= t.offsetTop && py < t.offsetTop + t.offsetHeight) ?? null;
  }

  function setTarget(target) {
    const row = r => (r ? rowOf(r) : -1);
    const old = row(drag?.target ?? held?.target);
    if (old >= 0) [questions[old], slots[old]].forEach(t => t.classList.remove('swap-target'));
    const now = row(target);
    if (now >= 0) [questions[now], slots[now]].forEach(t => t.classList.add('swap-target'));
  }

  function updateTarget() {
    const under = answerAt(drag.x, drag.y);
    const target = under !== drag.tile ? under : null;
    if (target !== drag.target) {
      setTarget(target);
      drag.target = target;
    }
  }

  function autoScroll() {
    if (!drag?.active) return;
    const { y } = drag;
    let dy = 0;
    if (y < EDGE) dy = -Math.ceil((EDGE - y) / 5);
    else if (y > innerHeight - EDGE) dy = Math.ceil((y - (innerHeight - EDGE)) / 5);
    if (dy) {
      const before = scrollY;
      scrollBy(0, dy);
      if (scrollY !== before) updateTarget();
    }
    requestAnimationFrame(autoScroll);
  }

  function onPointerUp(e) {
    if (e.pointerId !== drag.id) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    const { tile, ghost, target, active } = drag;
    if (target) setTarget(null);
    drag = null;
    if (!active) return;

    board.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    const dropped = target && e.type === 'pointerup';
    if (dropped) swapNow();
    else land();

    function swapNow() {
      // Fly the ghost into the new row, then reveal the tile and score the move.
      const r = target.getBoundingClientRect();
      flyGhost(r, () => place(tile, target));
    }
    function land() {
      flyGhost(tile.getBoundingClientRect(), () => {});
    }
    function flyGhost(r, then) {
      const reveal = () => { ghost.remove(); tile.classList.remove('placeholder'); then(); };
      if (reduceMotion.matches) { reveal(); return; }
      ghost.animate(
        [{ transform: ghost.style.transform }, { transform: `translate(${r.left}px, ${r.top}px)` }],
        { duration: 160, easing: 'ease-out', fill: 'forwards' },
      ).finished.then(reveal, reveal);
    }
  }

  // ---- Keyboard: Space/Enter picks up and drops, Up/Down choose a row, Escape cancels ----
  let held = null;

  function dropHeld(refocus = true, cancel = false) {
    const { tile, target } = held;
    tile.classList.remove('held');
    setTarget(null);
    held = null;
    if (target && !cancel) place(tile, target);
    else announce('Put back.');
    if (refocus && !locked) tile.focus();
  }

  board.addEventListener('keydown', e => {
    const tile = e.target.closest('.answer');
    if (!tile || locked) return;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (held) { dropHeld(); return; }
      held = { tile, target: null };
      tile.classList.add('held');
      announce('Picked up. Use the up and down arrows to choose a row, then Space to swap.');
      return;
    }
    if (e.key === 'Escape' && held) { dropHeld(true, true); return; }

    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    if (!held) {
      slots[Math.max(0, Math.min(n - 1, rowOf(tile) + step))].focus();
      return;
    }
    const from = rowOf(held.target ?? held.tile);
    const next = slots[Math.max(0, Math.min(n - 1, from + step))];
    setTarget(next === held.tile ? null : next);
    held.target = next === held.tile ? null : next;
    announce(`Row ${rowOf(next) + 1}: ${questions[rowOf(next)].textContent}`);
  });

  board.addEventListener('focusout', e => {
    if (held && e.relatedTarget !== held.tile) dropHeld(false, true);
  });

  // A round of one can't be shuffled, so it starts (and ends) solved.
  if (refresh()) {
    locked = true;
    board.classList.add('solved');
    [...questions, ...links, ...slots].forEach(t => t.classList.add('correct'));
    queueMicrotask(onSolved);
  }

  return { element: wrapper };
}

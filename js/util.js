// Small helpers shared by the menu and the matching board.

export const BANK_DIR = 'banks/';

export async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fisher–Yates shuffle, repeated until no item sits in its solved position
// (a "derangement"), so no answer starts across from its own question.
// `keys[i]` is what belongs at position i; equal keys are interchangeable.
export function shuffledOrder(keys) {
  const n = keys.length;
  const order = keys.map((_, i) => i);
  if (n < 2 || keys.every(k => k === keys[0])) return order;
  for (let attempt = 0; attempt < 1000; attempt++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.every((tile, pos) => keys[tile] !== keys[pos])) return order;
  }
  return order; // only possible with heavy duplication; still shuffled
}

export function formatTime(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function escapeHTML(text) {
  return text.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// Typst-style markup: *bold* and _italic_. Everything else is plain text.
function markup(text) {
  return escapeHTML(text)
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1<em>$2</em>');
}

function mathHTML(tex, displayMode) {
  if (!window.katex) return `<code>${escapeHTML(tex)}</code>`; // KaTeX didn't load (offline?)
  return window.katex.renderToString(tex, { displayMode, throwOnError: false });
}

// Text with math: $…$ inline, $$…$$ on its own line, \$ for a dollar sign.
// Math is rendered by KaTeX; the text between gets *bold* and _italic_.
export function richText(text) {
  let html = '';
  const re = /\$\$([\s\S]+?)\$\$|(?<!\\)\$((?:\\\$|[^$])+?)\$/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    html += markup(text.slice(last, m.index).replace(/\\\$/g, '$'));
    html += m[1] != null ? mathHTML(m[1], true) : mathHTML(m[2], false);
    last = m.index + m[0].length;
  }
  return html + markup(text.slice(last).replace(/\\\$/g, '$'));
}

// localStorage can throw (private windows, blocked storage); never let it break the app.
export const store = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  },
};

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter(c => c != null));
  return node;
}

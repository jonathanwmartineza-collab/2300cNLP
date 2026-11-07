// Small shared UI helpers.

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el(tag, attrs = {}, ...kids) {
  const isSvg = ['svg', 'g', 'line', 'circle', 'rect', 'path', 'text', 'polygon', 'defs', 'marker', 'title', 'tspan'].includes(tag);
  const n = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

/** Display form of a model token (Google News uses underscores for phrases). */
export const pretty = w => String(w).replace(/_/g, ' ');

export const pct = s => `${Math.round(Math.max(0, s) * 100)}%`;

/**
 * Resolve a typed word. On failure writes a friendly message with "did you mean" buttons
 * into msgEl; clicking one puts it in `input` and calls onRetry().
 * Returns the vocab index or -1.
 */
export function resolveWord(model, input, msgEl, onRetry, { quiet = false } = {}) {
  const raw = input.value;
  const idx = model.find(raw);
  input.classList.toggle('bad', idx < 0 && raw.trim() !== '');
  if (idx >= 0) { input.setAttribute('aria-invalid', 'false'); return idx; }
  input.setAttribute('aria-invalid', 'true');
  if (!quiet && msgEl) showMissing(model, raw, msgEl, s => { input.value = pretty(s); input.classList.remove('bad'); onRetry && onRetry(); });
  return -1;
}

export function showMissing(model, raw, msgEl, pick) {
  msgEl.classList.add('err');
  msgEl.textContent = '';
  const t = String(raw).trim();
  if (!t) { msgEl.textContent = 'Type a word first.'; return; }
  if (STOP.has(t.toLowerCase())) {
    msgEl.append(`“${t}” is one of the very common little words (like “a”, “and”, “of”, “to”) that Google removed from this model. Try a word with more meaning!`);
    return;
  }
  const s = model.suggest(t, 4);
  msgEl.append(`Hmm, “${t}” isn't in our ${model.N.toLocaleString()}-word list.`);
  if (s.length) {
    msgEl.append(' Did you mean:');
    const box = el('span', { class: 'sugg' });
    for (const w of s) box.append(el('button', { type: 'button', text: pretty(w), onpointerdown: e => e.preventDefault(), onclick: () => pick(w) }));
    msgEl.append(box);
  } else msgEl.append(' Try a more common word.');
}

const STOP = new Set('a an and of to or but if so nor the this that these those is am are was were be been being in on at by for with from as it its into than then there their they them we us our you your i me my he him his she her'.split(' '));

export function clearMsg(msgEl) { msgEl.textContent = ''; msgEl.classList.remove('err'); }
export function setMsg(msgEl, text) { msgEl.classList.remove('err'); msgEl.textContent = text; }

// Tooltip shared by barcodes / map
const tip = () => document.getElementById('tip');
export function showTip(text, x, y) { const t = tip(); t.textContent = text; t.hidden = false; t.style.left = `${x}px`; t.style.top = `${y}px`; }
export function hideTip() { tip().hidden = true; }

/** Simple shapes so color is never the only cue. */
export function shapePath(kind, r) {
  switch (kind % 6) {
    case 0: return `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`; // circle
    case 1: return `M${-r * .85},${-r * .85}h${r * 1.7}v${r * 1.7}h${-r * 1.7}z`; // square
    case 2: return `M0,${-r * 1.15}L${r * 1.1},${r * .8}H${-r * 1.1}z`; // triangle
    case 3: return `M0,${-r * 1.2}L${r * 1.1},0L0,${r * 1.2}L${-r * 1.1},0z`; // diamond
    case 4: { // hexagon
      let d = ''; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; d += (i ? 'L' : 'M') + (Math.cos(a) * r * 1.05).toFixed(2) + ',' + (Math.sin(a) * r * 1.05).toFixed(2); } return d + 'z';
    }
    default: return `M${-r},${-r * .35}h${r * .65}v${-r * .65}h${r * .7}v${r * .65}h${r * .65}v${r * .7}h${-r * .65}v${r * .65}h${-r * .7}v${-r * .65}h${-r * .65}z`; // plus
  }
}
export function starPath(r) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r * 1.2; d += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(2) + ',' + (Math.sin(a) * rr).toFixed(2); }
  return d + 'z';
}

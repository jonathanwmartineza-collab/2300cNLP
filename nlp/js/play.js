// Step 6: similarity meter + odd-one-out game.
import { el, pretty, resolveWord, clearMsg } from './ui.js';

const $ = id => document.getElementById(id);

function simLabel(s) {
  if (s >= 0.6) return 'Very similar';
  if (s >= 0.4) return 'Similar';
  if (s >= 0.2) return 'A little related';
  return 'Not really related';
}

export function initPlay(state) {
  const { model, lessons } = state;

  /* ---- Similarity meter ---- */
  const A = $('simA'), B = $('simB'), msg = $('simMsg');
  const pairs = (lessons.pairs || []).filter(p => model.find(p.a) >= 0 && model.find(p.b) >= 0);
  const chips = pairs.map(p => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: `${pretty(p.a)} & ${pretty(p.b)}`,
      onclick: () => { A.value = pretty(p.a); B.value = pretty(p.b); compare(); } });
    $('pairPresets').append(b); return [b, p];
  });
  function compare() {
    clearMsg(msg);
    const ia = resolveWord(model, A, msg, compare);
    const ib = ia < 0 ? -1 : resolveWord(model, B, msg, compare);
    chips.forEach(([b, p]) => b.setAttribute('aria-pressed', String(model.find(p.a) === ia && model.find(p.b) === ib)));
    if (ia < 0 || ib < 0) return;
    const s = model.sim(ia, ib);
    const v = Math.max(0, Math.min(1, s));
    $('gaugeArc').setAttribute('stroke-dasharray', `${(v * 100).toFixed(1)} 100`);
    $('gaugeNeedle').style.transform = `rotate(${-90 + v * 180}deg)`;
    $('gaugeNum').textContent = `${Math.round(v * 100)}%`;
    $('gaugeLabel').textContent = ia === ib ? 'Same word!' : `${simLabel(s)}: “${pretty(model.words[ia])}” and “${pretty(model.words[ib])}” (cosine ${s.toFixed(2)})`;
  }
  $('simForm').addEventListener('submit', e => { e.preventDefault(); compare(); });
  [A, B].forEach(i => i.addEventListener('input', () => i.classList.remove('bad')));
  compare();

  /* ---- Odd one out ---- */
  const puzzles = (lessons.oddOneOut || []).map(p => p.words).filter(ws => ws.every(w => model.find(w) >= 0));
  let pi = 0, cur = [], answered = false, score = 0, total = 0;
  const wordsBox = $('oooWords'), result = $('oooResult'), next = $('oooNext');

  function show(words) {
    cur = words.map(w => model.find(w));
    answered = false;
    result.textContent = '';
    wordsBox.textContent = '';
    next.disabled = true;
    cur.forEach((idx, k) => wordsBox.append(el('button', { type: 'button', class: 'ooo-btn', text: pretty(model.words[idx]), onclick: () => pick(k) })));
  }
  function pick(k) {
    if (answered) return;
    answered = true;
    const { avg, pick: m } = model.oddOneOut(cur);
    total++; if (k === m) score++;
    $('oooScore').textContent = score; $('oooTotal').textContent = total;
    [...wordsBox.children].forEach((b, j) => {
      b.disabled = true;
      const tags = [];
      if (j === k) { b.classList.add('mine'); tags.push('your pick'); }
      if (j === m) { b.classList.add('model'); tags.push('model\'s pick'); }
      if (tags.length) b.append(el('span', { class: 'badge', text: tags.join(' · ') }));
    });
    const w = j => `“${pretty(model.words[cur[j]])}”`;
    result.textContent = '';
    result.append(el('p', { class: `verdict ${k === m ? 'yes' : 'no'}`, text: k === m ? `You agree! The model also picked ${w(m)}.` : `You picked ${w(k)}. The model picked ${w(m)}.` }));
    result.append(el('p', { text: 'How well each word fits with the other three (average similarity):' }));
    const ol = el('ol', { class: 'bars' });
    const max = Math.max(...avg, 0.01);
    avg.map((a, j) => [a, j]).sort((x, y) => x[0] - y[0]).forEach(([a, j]) => {
      const fill = el('span', { class: 'fill', style: { background: j === m ? '#A3461F' : '#1E5A5A' } });
      ol.append(el('li', {}, el('span', { class: 'w', text: pretty(model.words[cur[j]]) }), el('span', { class: 'track' }, fill), el('span', { class: 'n', text: a.toFixed(2) })));
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${Math.max(3, (Math.max(0, a) / max) * 100)}%`; }));
    });
    result.append(ol);
    next.disabled = false;
  }
  next.addEventListener('click', () => { pi = (pi + 1) % Math.max(1, puzzles.length); show(puzzles[pi]); wordsBox.firstElementChild?.focus(); });

  const oooForm = $('oooForm'), oooMsg = $('oooMsg');
  oooForm.addEventListener('submit', e => {
    e.preventDefault();
    clearMsg(oooMsg);
    const inputs = [...oooForm.querySelectorAll('input')];
    const idx = [];
    for (const inp of inputs) {
      const i = resolveWord(model, inp, oooMsg, () => oooForm.requestSubmit());
      if (i < 0) return;
      idx.push(i);
    }
    if (new Set(idx).size < 4) { oooMsg.classList.add('err'); oooMsg.textContent = 'Use four different words.'; return; }
    show(idx.map(i => model.words[i]));
    wordsBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  if (puzzles.length) show(puzzles[0]);
}

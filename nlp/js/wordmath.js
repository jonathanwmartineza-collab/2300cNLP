// Step 5: analogies ("A is to B as C is to ?") computed as B − A + C.
import { pca } from './model.js';
import { el, pretty, resolveWord, clearMsg, reducedMotion } from './ui.js';

const $ = id => document.getElementById(id);

export function initWordMath(state) {
  const { model, lessons } = state;
  const A = $('anA'), B = $('anB'), C = $('anC'), form = $('analogyForm'), msg = $('analogyMsg');
  const presets = (lessons.analogies || []).filter(p => [p.a, p.b, p.c].every(w => model.find(w) >= 0));
  let expected = null;

  const chips = presets.map(p => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: `${pretty(p.a)} : ${pretty(p.b)} :: ${pretty(p.c)} : ?`,
      onclick: () => { A.value = pretty(p.a); B.value = pretty(p.b); C.value = pretty(p.c); expected = p; solve(); } });
    $('analogyPresets').append(b); return [b, p];
  });

  [A, B, C].forEach(inp => inp.addEventListener('input', () => { expected = null; inp.classList.remove('bad'); markChips(); }));
  function markChips() { chips.forEach(([b, p]) => b.setAttribute('aria-pressed', String(p === expected))); }

  function solve() {
    clearMsg(msg); markChips();
    const ia = resolveWord(model, A, msg, solve);
    const ib = ia < 0 ? -1 : resolveWord(model, B, msg, solve);
    const ic = ib < 0 ? -1 : resolveWord(model, C, msg, solve);
    if (ia < 0 || ib < 0 || ic < 0) return;
    if (ia === ib || ia === ic || ib === ic) { msg.classList.add('err'); msg.textContent = 'Use three different words for A, B and C.'; return; }
    const { target, results } = model.analogy(ia, ib, ic, 5);
    const w = i => pretty(model.words[i]);
    $('anFormula').innerHTML = '';
    $('anFormula').append(el('b', { text: w(ib) }), ' − ', el('b', { text: w(ia) }), ' + ', el('b', { text: w(ic) }), ' ≈');
    const win = results[0];
    $('anWinner').textContent = pretty(win.word);
    $('anWinner').append(el('small', { text: `${Math.round(win.sim * 100)}% match · “${w(ia)} is to ${w(ib)} as ${w(ic)} is to ${pretty(win.word)}”` }));
    const bars = $('anBars'); bars.textContent = '';
    const expWord = expected ? model.words[model.find(expected.expected)] : null;
    results.forEach(r => {
      const fill = el('span', { class: 'fill' });
      bars.append(el('li', { class: r.word === expWord ? 'exp' : '' }, el('span', { class: 'w', text: pretty(r.word) }), el('span', { class: 'track' }, fill), el('span', { class: 'n', text: r.sim.toFixed(2) })));
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${Math.max(2, r.sim * 100)}%`; }));
    });
    const note = $('anNote');
    note.textContent = '';
    if (expWord) {
      const rank = results.findIndex(r => r.word === expWord) + 1;
      if (rank === 1) note.textContent = `✓ The model's top guess matches what we expected: “${pretty(expWord)}”.`;
      else if (rank > 1) note.textContent = `Honest moment: we expected “${pretty(expWord)}”, but the model's #1 guess is “${pretty(win.word)}”. Our word came #${rank}. Word math is close, not perfect!`;
      else note.textContent = `Honest moment: we expected “${pretty(expWord)}”, but it isn't in the model's top 5. Word math is close, not perfect!`;
    }
    drawDiagram([ia, ib, ic, win.idx], target, win);
  }

  function drawDiagram([ia, ib, ic, ir], target, win) {
    const svg = $('anSvg');
    const Wd = 400, Hd = 300;
    svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
    svg.textContent = '';
    const p = pca([ia, ib, ic, ir].map(i => model.vec(i)), 2);
    const pts = [...p.coords, p.project(target)]; // A B C R T
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 56, k = Math.min((Wd - 2 * pad) / ((maxX - minX) || 1), (Hd - 2 * pad) / ((maxY - minY) || 1));
    const ox = (Wd - (maxX - minX) * k) / 2, oy = (Hd - (maxY - minY) * k) / 2;
    const S = q => [ox + (q[0] - minX) * k, oy + (maxY - q[1]) * k];
    const [a, b, c, r, t] = pts.map(S);
    svg.append(el('defs', {},
      el('marker', { id: 'ah', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, el('path', { d: 'M0,0L10,5L0,10z', fill: '#1E5A5A' })),
      el('marker', { id: 'ah2', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, el('path', { d: 'M0,0L10,5L0,10z', fill: '#E0A43A' }))));
    const shorten = (p1, p2, d = 12) => { const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1; return [p1[0] + dx / L * d, p1[1] + dy / L * d, p2[0] - dx / L * d, p2[1] - dy / L * d, L]; };
    const arrow = (p1, p2, color, mk, cls) => {
      const [x1, y1, x2, y2, L] = shorten(p1, p2);
      return el('line', { x1, y1, x2, y2, class: `arrow ${cls}`, stroke: color, 'marker-end': `url(#${mk})`, style: `--len:${Math.ceil(L)}` });
    };
    const dash = (p1, p2) => el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: '#D9D0C1', 'stroke-width': 2, 'stroke-dasharray': '5 6' });
    svg.append(dash(a, c), dash(b, t));
    svg.append(arrow(a, b, '#1E5A5A', 'ah', 'draw'), arrow(c, t, '#E0A43A', 'ah2', 'draw d2'));
    // target ring + link to nearest real word
    svg.append(el('g', { class: 'fade' },
      el('line', { x1: t[0], y1: t[1], x2: r[0], y2: r[1], stroke: '#A3461F', 'stroke-width': 2, 'stroke-dasharray': '2 4' }),
      el('circle', { cx: t[0], cy: t[1], r: 14, fill: 'none', stroke: '#A3461F', 'stroke-width': 2, 'stroke-dasharray': '4 3' })));
    const dot = (q, label, fill, big) => {
      const below = q[1] < 40;
      return el('g', { class: `pt${big ? ' fade' : ''}` }, el('circle', { cx: q[0], cy: q[1], r: big ? 10 : 8, fill, stroke: '#fff', 'stroke-width': 3 }),
        el('text', { x: Math.min(Wd - 8, Math.max(8, q[0])), y: below ? q[1] + 30 : q[1] - 16, 'text-anchor': q[0] < 50 ? 'start' : q[0] > Wd - 50 ? 'end' : 'middle', text: label }));
    };
    svg.append(dot(a, `A: ${pretty(model.words[ia])}`, '#4F5A65'), dot(b, `B: ${pretty(model.words[ib])}`, '#1E5A5A'),
      dot(c, `C: ${pretty(model.words[ic])}`, '#4F5A65'), dot(r, `→ ${pretty(win.word)}`, '#A3461F', true));
    if (reducedMotion()) svg.querySelectorAll('.draw,.fade').forEach(n => n.classList.remove('draw', 'fade'));
  }

  form.addEventListener('submit', e => { e.preventDefault(); solve(); });
  if (chips.length) chips[0][0].click(); else solve();
}

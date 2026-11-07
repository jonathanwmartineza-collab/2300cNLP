// Step 3: 2D word map (PCA of the scene's 300-d vectors).
import { pca } from './model.js';
import { el, pretty, resolveWord, clearMsg, setMsg, shapePath, starPath, reducedMotion } from './ui.js';

const $ = id => document.getElementById(id);
const USER_COLOR = '#A3461F';

export function initMap(state) {
  const { model, lessons } = state;
  const svg = $('map2d'), legend = $('mapLegend'), picker = $('scenePicker'), form = $('mapAddForm'), input = $('mapAdd'), msg = $('mapMsg');
  const scenes = (lessons.scenes || []).map(sc => {
    const seen = new Set(), pts = [];
    sc.groups.forEach((g, gi) => g.words.forEach(w => {
      const i = model.find(w);
      if (i >= 0 && !seen.has(i)) { seen.add(i); pts.push({ idx: i, word: model.words[i], group: gi }); }
    }));
    return { ...sc, pts };
  }).filter(sc => sc.pts.length >= 3);
  if (!scenes.length) { setMsg(msg, 'No scenes available.'); return; }

  let scene, basis, user = [], W = 800, H = 500, selected = null;
  const gGrid = el('g', { class: 'grid' }), gNN = el('g', { class: 'nn' }), gPts = el('g', { class: 'pts' });
  svg.append(gGrid, gNN, gPts);

  const chips = scenes.map((sc, i) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: sc.title, onclick: () => choose(i) });
    picker.append(b); return b;
  });

  function choose(i) {
    scene = scenes[i];
    chips.forEach((c, j) => c.setAttribute('aria-pressed', String(i === j)));
    basis = pca(scene.pts.map(p => model.vec(p.idx)), 3);
    scene.pts.forEach(p => { p.xy = basis.coords[scene.pts.indexOf(p)]; });
    user = []; selected = null;
    gPts.textContent = ''; gNN.textContent = '';
    clearMsg(msg);
    renderLegend();
    layout(true);
    state.setScene({ ...scene, basis });
  }

  function renderLegend() {
    legend.textContent = '';
    scene.groups.forEach((g, gi) => {
      if (!scene.pts.some(p => p.group === gi)) return;
      legend.append(el('span', {}, el('svg', { width: 18, height: 18, viewBox: '-9 -9 18 18', 'aria-hidden': 'true' }, el('path', { d: shapePath(gi, 6.5), fill: g.color })), g.name));
    });
    if (user.length) legend.append(el('span', {}, el('svg', { width: 18, height: 18, viewBox: '-9 -9 18 18', 'aria-hidden': 'true' }, el('path', { d: starPath(6.5), fill: USER_COLOR })), 'Your words'));
  }

  const all = () => scene.pts.concat(user);
  let sx, sy;
  function fit() {
    const r = svg.getBoundingClientRect();
    W = Math.max(280, r.width); H = Math.max(260, r.height);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const xs = all().map(p => p.xy[0]), ys = all().map(p => p.xy[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const padL = 30, padR = W < 500 ? 70 : 110, padY = 34;
    const k = Math.min((W - padL - padR) / ((maxX - minX) || 1), (H - 2 * padY) / ((maxY - minY) || 1));
    const ox = padL + (W - padL - padR - (maxX - minX) * k) / 2, oy = padY + (H - 2 * padY - (maxY - minY) * k) / 2;
    sx = x => ox + (x - minX) * k; sy = y => oy + (maxY - y) * k;
    gGrid.textContent = '';
    for (let i = 1; i < 4; i++) {
      gGrid.append(el('line', { x1: (W * i) / 4, x2: (W * i) / 4, y1: 0, y2: H }), el('line', { x1: 0, x2: W, y1: (H * i) / 4, y2: (H * i) / 4 }));
    }
  }

  function layout(fresh) {
    fit();
    const pts = all();
    pts.forEach(p => {
      if (!p.node) {
        const isUser = p.group === -1;
        const color = isUser ? USER_COLOR : scene.groups[p.group].color;
        const label = el('text', { x: 11, y: 5, text: pretty(p.word) });
        p.node = el('g', {
          class: `pt${isUser ? ' user' : ''}`, tabindex: '0', role: 'button',
          'aria-label': `${pretty(p.word)}${isUser ? ' (your word)' : `, ${scene.groups[p.group].name}`}. Show nearest neighbors`,
        }, el('path', { class: 'mk', d: isUser ? starPath(9) : shapePath(p.group, 7), fill: color }), label);
        p.label = label;
        const on = () => select(p);
        p.node.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') on(); });
        p.node.addEventListener('click', on);
        p.node.addEventListener('focus', on);
        p.node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on(); } });
        gPts.append(p.node);
        const startX = fresh ? sx(p.xy[0]) : W / 2, startY = fresh ? sy(p.xy[1]) : H / 2;
        p.node.style.transform = `translate(${startX}px, ${startY}px)${fresh ? '' : ' scale(0.2)'}`;
        if (!fresh) p.node.getBoundingClientRect(); // commit start state for the fly-in
      }
      const x = sx(p.xy[0]), y = sy(p.xy[1]);
      p.sxy = [x, y];
      const flip = x > W - 90;
      p.label.setAttribute('x', flip ? -11 : 11);
      p.label.setAttribute('text-anchor', flip ? 'end' : 'start');
      p.node.style.transform = `translate(${x}px, ${y}px)`;
    });
    if (selected) drawNN(selected);
  }

  function nnOf(p, k = 3) {
    return all().filter(q => q !== p && q.idx !== p.idx).map(q => ({ q, s: model.sim(p.idx, q.idx) })).sort((a, b) => b.s - a.s).slice(0, k);
  }

  function select(p) {
    selected = p;
    drawNN(p);
    const nn = nnOf(p);
    setMsg(msg, `“${pretty(p.word)}” is closest to ${nn.map(n => `${pretty(n.q.word)} (${Math.round(n.s * 100)}%)`).join(', ')}.`);
  }

  function drawNN(p) {
    gNN.textContent = '';
    const nn = nnOf(p);
    const set = new Set([p, ...nn.map(n => n.q)]);
    all().forEach(q => { q.node.classList.toggle('on', q === p); q.node.classList.toggle('dim', !set.has(q)); });
    for (const { q, s } of nn) {
      const [x1, y1] = p.sxy, [x2, y2] = q.sxy;
      gNN.append(el('line', { x1, y1, x2, y2 }), el('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, 'text-anchor': 'middle', text: `${Math.round(s * 100)}%` }));
    }
  }
  function clearSel() { selected = null; gNN.textContent = ''; all().forEach(q => q.node.classList.remove('on', 'dim')); }
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') clearSel(); });
  svg.addEventListener('click', e => { if (e.target === svg) clearSel(); });

  function add() {
    clearMsg(msg);
    const i = resolveWord(model, input, msg, add);
    if (i < 0) return;
    const existing = all().find(p => p.idx === i);
    if (existing) { select(existing); existing.node.focus({ preventScroll: true }); return; }
    const p = { idx: i, word: model.words[i], group: -1, xy: basis.project(model.vec(i)) };
    user.push(p);
    if (user.length > 8) { const old = user.shift(); old.node.remove(); }
    renderLegend();
    document.body.classList.toggle('no-anim', reducedMotion());
    requestAnimationFrame(() => {
      layout(false);
      select(p);
      const nn = nnOf(p);
      setMsg(msg, `“${pretty(p.word)}” landed near ${nn.map(n => pretty(n.q.word)).join(', ')}.`);
      state.setScene({ ...scene, basis, user: user.map(u => ({ ...u })) });
    });
    input.value = '';
  }
  form.addEventListener('submit', e => { e.preventDefault(); add(); });
  input.addEventListener('input', () => input.classList.remove('bad'));

  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => scene && layout(true), 60); }).observe(svg);
  choose(0);
}

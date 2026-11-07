// NLP Lab — boot, navigation, present mode, steps 1 and 2.
import { loadModel } from './model.js';
import { el, pretty, resolveWord, clearMsg, showTip, hideTip, reducedMotion } from './ui.js';
import { initMap } from './map2d.js';
import { initWordMath } from './wordmath.js';
import { initPlay } from './play.js';

const $ = id => document.getElementById(id);
const state = { model: null, lessons: null, scene: null, sceneListeners: [] };
window.__nlp = state; // handy for debugging / tests

/* ---------------- Loading ---------------- */
function fmtMB(b) { return (b / 1048576).toFixed(1); }

async function boot() {
  setupNav();
  setupPresent();
  setupSentence(); // step 2 needs no data
  const fill = $('loaderFill'), text = $('loaderText'), loader = $('loader');
  try {
    const { model, lessons } = await loadModel((loaded, total) => {
      const p = total ? Math.min(1, loaded / total) : 0;
      fill.style.width = `${(p * 100).toFixed(1)}%`;
      text.textContent = total ? `Loading the model… ${fmtMB(loaded)} of ${fmtMB(total)} MB` : `Loading the model… ${fmtMB(loaded)} MB`;
    });
    fill.style.width = '100%';
    state.model = model; state.lessons = lessons;
    $('vocabCount').textContent = model.N.toLocaleString();
    text.textContent = `Model ready: ${model.N.toLocaleString()} words × ${model.D} numbers`;
    loader.classList.add('ok');
    document.querySelectorAll('main [disabled]').forEach(n => { if (n.id !== 'oooNext') n.disabled = false; });
    document.body.classList.add('ready');
    initBarcodes(state);
    initMap(state);
    initWordMath(state);
    initPlay(state);
    setupGalaxyLazy();
  } catch (err) {
    console.warn(err);
    loader.classList.add('err');
    text.textContent = 'Sorry, the model could not load. Check your connection and refresh.';
    document.body.classList.add('failed');
  }
}

/* ---------------- Step nav + progress ---------------- */
function setupNav() {
  const links = [...document.querySelectorAll('.steps a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href')));
  const fillBar = $('stepsFill');
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    let active = -1;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.45) active = i; });
    const recap = $('recap').getBoundingClientRect().top < vh * 0.45;
    links.forEach((a, i) => {
      const on = i === active && !recap;
      a.classList.toggle('active', on);
      a.classList.toggle('done', i < active || recap);
      if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    const max = document.documentElement.scrollHeight - vh;
    fillBar.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
    const act = links[active];
    if (act && act.classList.contains('active')) {
      const ol = act.closest('ol');
      const r = act.getBoundingClientRect(), o = ol.getBoundingClientRect();
      if (r.left < o.left || r.right > o.right) ol.scrollLeft += r.left - o.left - 8;
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------------- Present mode ---------------- */
function setupPresent() {
  const btn = $('presentBtn'), exit = $('presentExit');
  const slides = () => [...document.querySelectorAll('.slide')];
  const set = on => {
    const cur = currentSlide();
    document.body.classList.toggle('present', on);
    document.documentElement.classList.toggle('present-html', on);
    btn.setAttribute('aria-pressed', String(on));
    exit.hidden = !on;
    window.dispatchEvent(new Event('resize'));
    if (cur) cur.scrollIntoView({ behavior: 'auto', block: 'start' });
    if (on) exit.focus({ preventScroll: true });
  };
  const currentSlide = () => {
    const list = slides();
    let best = list[0], bestD = Infinity;
    for (const s of list) { const d = Math.abs(s.getBoundingClientRect().top - (document.body.classList.contains('present') ? 0 : 130)); if (d < bestD) { bestD = d; best = s; } }
    return best;
  };
  const go = dir => {
    const list = slides(), cur = currentSlide();
    const i = Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + dir));
    list[i].scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  btn.addEventListener('click', () => set(!document.body.classList.contains('present')));
  exit.addEventListener('click', () => set(false));
  document.addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const present = document.body.classList.contains('present');
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); set(!present); return; }
    if (!present) return;
    if (e.key === 'Escape') { set(false); return; }
    if (t && t.type === 'range') return;
    if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key) || (e.key === ' ' && t === document.body)) { e.preventDefault(); go(1); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); go(-1); }
  });
}

/* ---------------- Step 1: barcodes ---------------- */
const CLAMP = 0.16;
// Diverging scale: rust/amber (negative) -> cream (0) -> teal (positive)
const STOPS = [[-1, [163, 70, 31]], [-0.45, [224, 164, 58]], [0, [251, 248, 242]], [0.45, [111, 163, 160]], [1, [30, 90, 90]]];
function colorFor(v) {
  const t = Math.max(-1, Math.min(1, v / CLAMP));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
    }
  }
  return 'rgb(30,90,90)';
}

function initBarcodes(state) {
  const { model, lessons } = state;
  const box = $('barcodes'), presets = $('barcodePresets');
  const examples = (lessons.barcodeExamples || []).filter(ex => ex.every(w => model.find(w) >= 0));
  if (!examples.length) examples.push(['king', 'queen', 'banana'].filter(w => model.find(w) >= 0));
  const rows = [], sims = [];
  for (let r = 0; r < 3; r++) {
    const input = el('input', { type: 'text', spellcheck: 'false', autocapitalize: 'off', 'aria-label': `Word ${r + 1}` });
    const canvas = el('canvas', { class: 'bc-canvas', role: 'img', 'aria-label': 'Barcode of the word\'s 300 numbers' });
    const err = el('p', { class: 'msg bc-err', 'aria-live': 'polite' });
    const row = { input, canvas, err, idx: -1 };
    box.append(el('div', { class: 'bc-row' }, input, canvas, err));
    if (r < 2) { const s = el('p', { class: 'bc-sim', 'aria-live': 'polite' }); sims.push(s); box.append(s); }
    const commit = (force) => {
      if (force !== true && input.value === row.last) return;
      row.last = input.value;
      clearMsg(err);
      row.idx = resolveWord(model, input, err, () => commit(true));
      draw(row); updateSims(); markPreset();
    };
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { if (model.find(input.value) >= 0) commit(); }, 250); });
    input.addEventListener('change', () => commit());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(true); } });
    const hover = e => {
      if (row.idx < 0) return;
      const rect = canvas.getBoundingClientRect();
      const d = Math.max(0, Math.min(model.D - 1, Math.floor(((e.clientX - rect.left) / rect.width) * model.D)));
      const v = model.vec(row.idx)[d];
      showTip(`${pretty(model.words[row.idx])} · number #${d + 1}: ${v >= 0 ? '+' : ''}${v.toFixed(3)}`, e.clientX, rect.top);
      row.hoverD = d; draw(row);
    };
    canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerdown', hover);
    canvas.addEventListener('pointerleave', () => { hideTip(); row.hoverD = null; draw(row); });
    rows.push(row);
  }
  function draw(row) {
    const c = row.canvas, dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (row.idx < 0) { ctx.fillStyle = '#EDE6DA'; ctx.fillRect(0, 0, w, h); return; }
    const v = model.vec(row.idx), D = model.D, cw = w / D;
    for (let d = 0; d < D; d++) { ctx.fillStyle = colorFor(v[d]); ctx.fillRect(d * cw, 0, cw + 0.6, h); }
    if (row.hoverD != null) { ctx.strokeStyle = '#1F2A33'; ctx.lineWidth = 2; ctx.strokeRect(row.hoverD * cw, 1, Math.max(cw, 2), h - 2); }
    row.canvas.setAttribute('aria-label', `Barcode of “${pretty(model.words[row.idx])}”: 300 colored stripes, one per number`);
  }
  function updateSims() {
    sims.forEach((s, i) => {
      const a = rows[i], b = rows[i + 1];
      s.textContent = '';
      if (a.idx < 0 || b.idx < 0) return;
      const v = model.sim(a.idx, b.idx);
      const cls = v >= 0.5 ? 'hi' : v < 0.2 ? 'lo' : '';
      s.append(`${pretty(model.words[a.idx])} ↕ ${pretty(model.words[b.idx])}: `, el('span', { class: `pill ${cls}`, text: `${Math.round(Math.max(0, v) * 100)}% similar` }));
    });
  }
  const chips = examples.map(ex => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: ex.map(pretty).join(' · '), onclick: () => load(ex) });
    presets.append(b); return [b, ex];
  });
  function markPreset() {
    const cur = rows.map(r => (r.idx >= 0 ? model.words[r.idx] : '')).join('|');
    chips.forEach(([b, ex]) => b.setAttribute('aria-pressed', String(ex.map(w => model.words[model.find(w)]).join('|') === cur)));
  }
  function load(ex) {
    rows.forEach((r, i) => { r.input.value = pretty(ex[i] || ''); r.last = r.input.value; clearMsg(r.err); r.idx = model.find(r.input.value); r.input.classList.remove('bad'); draw(r); });
    updateSims(); markPreset();
  }
  load(examples[0]);
  new ResizeObserver(() => rows.forEach(draw)).observe(box);
}

/* ---------------- Step 2: sliding window ---------------- */
const SENTENCES = [
  'the quick brown fox jumps over the lazy dog',
  'happy customers leave great reviews for small local shops',
  'the king and the queen walked into the royal palace',
];
function setupSentence() {
  const box = $('sentence'), picker = $('sentencePicker'), list = $('pairs'), countEl = $('pairCount');
  const playBtn = $('winPlay'), stepBtn = $('winStep'), resetBtn = $('winReset'), size = $('winSize'), sizeOut = $('winSizeOut');
  let tokens = [], pos = -1, timer = null, count = 0, si = 0;
  const chips = SENTENCES.map((s, i) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(i === 0), text: `“${s.split(' ').slice(0, 4).join(' ')}…”`, onclick: () => { si = i; chips.forEach((c, j) => c.setAttribute('aria-pressed', String(j === i))); reset(); } });
    picker.append(b); return b;
  });
  function render() {
    box.textContent = '';
    tokens = SENTENCES[si].split(' ').map(w => { const t = el('span', { class: 'tok', 'data-w': w, text: w }); box.append(t); return t; });
  }
  function reset() { stop(); render(); pos = -1; count = 0; countEl.textContent = '0'; list.textContent = ''; }
  function step() {
    pos = (pos + 1) % tokens.length;
    if (pos === 0 && count > 0) { list.textContent = ''; }
    const W = Number(size.value);
    tokens.forEach((t, i) => {
      t.className = 'tok';
      t.querySelector('.lbl')?.remove();
      if (i === pos) { t.classList.add('center'); t.append(el('span', { class: 'lbl', text: 'center' })); }
      else if (Math.abs(i - pos) <= W) { t.classList.add('ctx'); }
    });
    [...list.children].forEach(li => li.classList.add('old'));
    while (list.children.length > 14) list.firstChild.remove();
    const c = tokens[pos].dataset.w;
    for (let i = Math.max(0, pos - W); i <= Math.min(tokens.length - 1, pos + W); i++) {
      if (i === pos) continue;
      list.append(el('li', {}, el('span', { class: 'c', text: c }), '→', el('span', { class: 'x', text: tokens[i].dataset.w })));
      count++;
    }
    countEl.textContent = String(count);
  }
  function play() {
    if (timer) return;
    playBtn.setAttribute('aria-pressed', 'true'); playBtn.firstElementChild.textContent = 'Pause';
    step(); timer = setInterval(step, 1300);
  }
  function stop() {
    clearInterval(timer); timer = null;
    playBtn.setAttribute('aria-pressed', 'false'); playBtn.firstElementChild.textContent = 'Play';
  }
  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  stepBtn.addEventListener('click', () => { stop(); step(); });
  resetBtn.addEventListener('click', reset);
  size.addEventListener('input', () => {
    sizeOut.textContent = `±${size.value}`;
    size.setAttribute('aria-valuetext', `${size.value} words on each side`);
    if (pos >= 0) { pos--; step(); }
  });
  render();
  // Auto-play once when visible (not with reduced motion)
  if (!reducedMotion() && 'IntersectionObserver' in window) {
    let started = false;
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        if (e.isIntersecting && !started) { started = true; play(); }
        if (!e.isIntersecting && timer) stop();
      }
    }, { threshold: 0.4 });
    io.observe(box);
  } else step();
}

/* ---------------- Step 4: lazy galaxy ---------------- */
function setupGalaxyLazy() {
  const section = $('step4');
  let started = false;
  const start = () => {
    if (started) return; started = true;
    import('./galaxy.js').then(m => m.initGalaxy(state)).catch(err => {
      console.warn(err);
      $('galaxyCanvas').innerHTML = '<p class="galaxy-wait">The 3D galaxy could not start on this device. Everything else still works.</p>';
    });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '600px 0px' });
    io.observe(section);
  } else start();
}

/* scene sharing between the 2D map and the 3D view */
state.setScene = scene => { state.scene = scene; state.sceneListeners.forEach(f => f(scene)); };
state.onScene = f => state.sceneListeners.push(f);

boot();

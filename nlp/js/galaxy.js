// Step 4: 3D word galaxy (three.js, lazy-loaded).
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { loadGalaxy, pca } from './model.js';
import { el, pretty, resolveWord, clearMsg, setMsg, reducedMotion } from './ui.js';

const $ = id => document.getElementById(id);
const R = 10; // world radius for coords in [-1, 1]

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}

// Lighten a hex color so it stays visible on the dark background.
function starColor(hex, mix = 0.38) {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color('#ffffff'), mix);
}

const VERT = `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
uniform float uScale; uniform float uMax;
varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, uMax * (aSize > 0.5 ? 1.8 : 1.0));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5 || vAlpha < 0.01) discard;
  float core = smoothstep(0.5, 0.36, d);
  float glow = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vColor, vec3(1.0), smoothstep(0.22, 0.0, d) * 0.55);
  gl_FragColor = vec4(col, vAlpha * (core * 0.9 + glow * 0.25));
}`;

export async function initGalaxy(state) {
  const { model } = state;
  const holder = $('galaxyCanvas'), stage = $('galaxyStage'), labelsBox = $('galaxyLabels'), side = $('galaxySide'),
    legend = $('galaxyLegend'), msg = $('galaxyMsg'), form = $('galaxySearchForm'), input = $('galaxySearch'),
    btnGalaxy = $('viewGalaxy'), btnScene = $('viewScene');

  if (!webglOK()) {
    holder.innerHTML = '<p class="galaxy-wait">Your browser or device doesn\'t support 3D graphics (WebGL), so the galaxy can\'t be shown here. Everything else on the page still works.</p>';
    [input, form.querySelector('button'), btnGalaxy, btnScene].forEach(n => { n.disabled = true; });
    return;
  }
  const data = await loadGalaxy();
  const reduce = reducedMotion();

  /* ---------- three.js setup ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (e) {
    holder.innerHTML = '<p class="galaxy-wait">3D graphics could not start on this device. Everything else on the page still works.</p>';
    return;
  }
  holder.textContent = '';
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  holder.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D galaxy of words. Drag to rotate, scroll or pinch to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 2; controls.maxDistance = 60;
  controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; flight = null; });

  // faint background dust
  {
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = 40 + Math.random() * 60, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene3.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fb3b0, size: 0.25, transparent: true, opacity: 0.5, depthWrite: false })));
  }

  const uniforms = { uScale: { value: 500 }, uMax: { value: 22 } };
  const makeCloud = (positions, colors, sizes) => {
    const n = positions.length / 3, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false });
    return new THREE.Points(g, m);
  };

  /* ---------- galaxy data ---------- */
  const clusters = new Map(data.clusters.map(c => [c.id, c]));
  const P = data.points;
  const galaxyIndex = new Map(P.map((p, i) => [p.w, i]));
  const gPos = new Float32Array(P.length * 3), gCol = new Float32Array(P.length * 3), gSize = new Float32Array(P.length);
  P.forEach((p, i) => {
    gPos.set([p.x * R, p.y * R, p.z * R], i * 3);
    const c = starColor(clusters.get(p.c)?.color || '#E0A43A');
    gCol.set([c.r, c.g, c.b], i * 3);
    gSize[i] = 0.32;
  });
  // frame the camera on the data (it is not centred on the origin)
  const gCenter = new THREE.Vector3();
  P.forEach((p, i) => gCenter.add(new THREE.Vector3(gPos[i * 3], gPos[i * 3 + 1], gPos[i * 3 + 2])));
  gCenter.multiplyScalar(1 / Math.max(1, P.length));
  const dists = P.map((p, i) => gCenter.distanceTo(new THREE.Vector3(gPos[i * 3], gPos[i * 3 + 1], gPos[i * 3 + 2]))).sort((a, b) => a - b);
  const gRadius = Math.max(2, dists[Math.floor(dists.length * 0.96)] || R);
  const home = () => { controls.target.copy(gCenter); camera.position.copy(gCenter).add(new THREE.Vector3(0, gRadius * 0.2, gRadius * 1.55)); };
  home();
  const galaxy = makeCloud(gPos, gCol, gSize);
  scene3.add(galaxy);
  const baseSize = gSize.slice();

  // A few always-on labels: the points nearest each cluster's center
  const defaultLabels = new Set();
  for (const c of data.clusters) {
    const mine = P.map((p, i) => [p, i]).filter(([p]) => p.c === c.id);
    if (!mine.length) continue;
    const cx = mine.reduce((s, [p]) => s + p.x, 0) / mine.length, cy = mine.reduce((s, [p]) => s + p.y, 0) / mine.length, cz = mine.reduce((s, [p]) => s + p.z, 0) / mine.length;
    mine.sort((a, b) => Math.hypot(a[0].x - cx, a[0].y - cy, a[0].z - cz) - Math.hypot(b[0].x - cx, b[0].y - cy, b[0].z - cz));
    defaultLabels.add(mine[0][1]);
  }

  const hidden = new Set();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xE0A43A, transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
  scene3.add(lines);
  // marker for searched words that are not one of the galaxy stars
  const ghost = makeCloud(new Float32Array(3), new Float32Array([1, 0.85, 0.5]), new Float32Array([0.9]));
  ghost.visible = false; scene3.add(ghost);

  let mode = 'galaxy', sceneCloud = null, scenePts = [], hovered = -1, selected = null, flight = null;

  /* ---------- labels (DOM overlay) ---------- */
  const pool = [];
  const labelFor = k => { while (pool.length <= k) { const d = el('div', { class: 'glabel' }); labelsBox.append(d); pool.push(d); } return pool[k]; };
  const v3 = new THREE.Vector3();
  function placeLabels() {
    const w = holder.clientWidth, h = holder.clientHeight;
    const items = [];
    if (mode === 'galaxy') {
      const special = new Map();
      if (selected) {
        if (selected.gi >= 0) special.set(selected.gi, 'hot');
        selected.nb.forEach(i => { if (!special.has(i)) special.set(i, 'nb'); });
      }
      if (hovered >= 0) special.set(hovered, 'hot');
      if (selected && selected.gi < 0) items.push([ghost.geometry.attributes.position.array, 0, 'hot', `${pretty(selected.word)} (approx. spot)`]);
      [...special].sort((a, b) => (a[1] === 'hot' ? -1 : 0) - (b[1] === 'hot' ? -1 : 0)).forEach(([i, cls]) => {
        const p = P[i];
        const text = cls === 'hot' ? `${pretty(p.w)} · ${clusters.get(p.c)?.label || ''}` : pretty(p.w);
        items.push([gPos, i, cls, text]);
      });
      for (const i of defaultLabels) if (!special.has(i) && !hidden.has(P[i].c)) items.push([gPos, i, '', P[i].w]);
    } else if (sceneCloud) {
      const arr = sceneCloud.geometry.attributes.position.array;
      scenePts.forEach((p, i) => items.push([arr, i, i === hovered ? 'hot scene' : 'scene', i === hovered ? `${pretty(p.word)} · ${p.groupName}` : pretty(p.word)]));
    }
    let k = 0;
    const placed = [];
    for (const [arr, i, cls, text] of items) {
      v3.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).project(camera);
      if (v3.z > 1 || v3.z < -1) continue;
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      if (x < -50 || x > w + 50 || y < -20 || y > h + 20) continue;
      // skip labels that would overlap one already placed (important labels go first)
      const bw = text.length * (cls.includes('hot') ? 9 : 7.2) / 2 + 4, by = y - 14;
      if (placed.some(r => Math.abs(r[0] - x) < r[2] + bw && Math.abs(r[1] - by) < 17)) continue;
      placed.push([x, by, bw]);
      const d = labelFor(k++);
      if (d.textContent !== pretty(text)) d.textContent = pretty(text);
      d.className = `glabel ${cls}`;
      d.style.display = '';
      d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -150%)`;
    }
    for (; k < pool.length; k++) pool[k].style.display = 'none';
  }

  /* ---------- legend ---------- */
  function renderLegend() {
    legend.textContent = '';
    if (mode === 'galaxy') {
      for (const c of data.clusters) {
        const b = el('button', { type: 'button', class: 'lg-btn', 'aria-pressed': String(!hidden.has(c.id)), title: 'Show or hide this cluster' },
          el('i', { style: { background: `#${starColor(c.color).getHexString()}` } }), c.label);
        b.addEventListener('click', () => {
          if (hidden.has(c.id)) hidden.delete(c.id); else hidden.add(c.id);
          b.setAttribute('aria-pressed', String(!hidden.has(c.id)));
          applyVisibility();
        });
        legend.append(b);
      }
    } else if (state.scene) {
      state.scene.groups.forEach(g => legend.append(el('span', { class: 'lg-btn', style: { cursor: 'default' } }, el('i', { style: { background: `#${starColor(g.color).getHexString()}` } }), g.name)));
    }
  }
  function applyVisibility() {
    const a = galaxy.geometry.attributes.aAlpha;
    P.forEach((p, i) => { a.array[i] = hidden.has(p.c) ? 0 : 1; });
    a.needsUpdate = true;
  }

  /* ---------- search / select ---------- */
  function setSizes() {
    const s = galaxy.geometry.attributes.aSize;
    s.array.set(baseSize);
    if (selected) {
      if (selected.gi >= 0) s.array[selected.gi] = 0.9;
      selected.nb.forEach(i => { s.array[i] = 0.6; });
    }
    s.needsUpdate = true;
  }
  function select(vocabIdx) {
    let word = model.words[vocabIdx];
    // the galaxy may hold another capitalisation of the same word (e.g. monday / Monday)
    if (!galaxyIndex.has(word)) {
      const alt = [word.toLowerCase(), word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()].find(w => galaxyIndex.has(w) && model.find(w) >= 0 && model.words[model.find(w)] === w);
      if (alt) { word = alt; vocabIdx = model.find(alt); }
    }
    const gi = galaxyIndex.has(word) ? galaxyIndex.get(word) : -1;
    const nn = model.neighbors(vocabIdx, 8);
    const nb = nn.map(n => galaxyIndex.get(n.word)).filter(i => i != null);
    let pos;
    if (gi >= 0) pos = new THREE.Vector3(gPos[gi * 3], gPos[gi * 3 + 1], gPos[gi * 3 + 2]);
    else {
      // estimate a spot from its closest neighbours that are galaxy stars
      const near = model.neighbors(vocabIdx, 40).filter(n => galaxyIndex.has(n.word)).slice(0, 6);
      pos = new THREE.Vector3();
      let ws = 0;
      near.forEach(n => { const i = galaxyIndex.get(n.word), wgt = Math.max(0.01, n.sim); pos.add(new THREE.Vector3(gPos[i * 3], gPos[i * 3 + 1], gPos[i * 3 + 2]).multiplyScalar(wgt)); ws += wgt; });
      if (ws) pos.multiplyScalar(1 / ws);
      if (!near.length) pos.set(0, 0, 0);
    }
    // un-hide clusters involved so the result is visible
    [gi, ...nb].filter(i => i >= 0).forEach(i => hidden.delete(P[i].c));
    applyVisibility(); if (mode === 'galaxy') renderLegend();
    selected = { word, gi, nb, pos };
    ghost.visible = gi < 0;
    if (gi < 0) { ghost.geometry.attributes.position.array.set([pos.x, pos.y, pos.z]); ghost.geometry.attributes.position.needsUpdate = true; ghost.geometry.computeBoundingSphere(); }
    const lp = [];
    nb.forEach(i => lp.push(pos.x, pos.y, pos.z, gPos[i * 3], gPos[i * 3 + 1], gPos[i * 3 + 2]));
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry();
    lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
    lines.visible = true;
    setSizes();
    const spread = Math.max(0, ...nb.map(i => pos.distanceTo(new THREE.Vector3(gPos[i * 3], gPos[i * 3 + 1], gPos[i * 3 + 2]))));
    flyTo(pos, Math.min(9, Math.max(2.5, spread * 2.4 + 1.2)));
    // side list
    side.hidden = false;
    side.textContent = '';
    side.append(el('button', { type: 'button', class: 'close', 'aria-label': 'Close neighbor list', text: '×', onclick: clearSelection }),
      el('h4', { text: pretty(word) }),
      el('p', { class: 'out', text: gi >= 0 ? `${clusters.get(P[gi].c)?.label || ''} · 8 nearest words (all 300 numbers):` : 'Not one of the galaxy stars, so it is shown at an approximate spot. 8 nearest words:' }),
      el('ol', {}, nn.map(n => el('li', {}, `${pretty(n.word)} `, el('span', { class: 'out', text: `${Math.round(n.sim * 100)}%${galaxyIndex.has(n.word) ? '' : ' · not in galaxy'}` })))));
    const outside = nn.length - nb.length;
    setMsg(msg, `Found “${pretty(word)}”. Lines connect it to its ${nb.length} nearest neighbors in the galaxy${outside ? ` (${outside} more are listed but not shown as stars)` : ''}.`);
  }
  function clearSelection() {
    selected = null; side.hidden = true; lines.visible = false; ghost.visible = false; setSizes(); clearMsg(msg);
  }
  function flyTo(pos, dist = 6) {
    controls.autoRotate = false;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const endCam = pos.clone().add(dir.multiplyScalar(dist));
    if (reduce) { controls.target.copy(pos); camera.position.copy(endCam); controls.update(); return; }
    flight = { t0: performance.now(), dur: 1100, fromT: controls.target.clone(), toT: pos.clone(), fromC: camera.position.clone(), toC: endCam };
    wake();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearMsg(msg);
    const i = resolveWord(model, input, msg, () => form.requestSubmit());
    if (i < 0) return;
    if (mode !== 'galaxy') setMode('galaxy');
    select(i);
  });
  input.addEventListener('input', () => input.classList.remove('bad'));

  /* ---------- hover / tap via raycasting ---------- */
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let downAt = null;
  function pickAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const dist = camera.position.distanceTo(controls.target);
    ray.params.Points.threshold = Math.max(0.08, dist * 0.012);
    const obj = mode === 'galaxy' ? galaxy : sceneCloud;
    if (!obj) return -1;
    const hits = ray.intersectObject(obj).filter(h => mode !== 'galaxy' || !hidden.has(P[h.index].c));
    hits.sort((a, b) => a.distanceToRay - b.distanceToRay);
    return hits.length ? hits[0].index : -1;
  }
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const h = pickAt(e);
    if (h !== hovered) { hovered = h; renderer.domElement.style.cursor = h >= 0 ? 'pointer' : 'grab'; wake(); }
  });
  renderer.domElement.addEventListener('pointerleave', () => { hovered = -1; wake(); });
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const h = pickAt(e);
    if (h < 0) return;
    if (mode === 'galaxy') { input.value = pretty(P[h].w); select(model.find(P[h].w)); }
    else { hovered = h; wake(); }
  });

  /* ---------- scene (PCA 3D) mode ---------- */
  function buildScene() {
    if (sceneCloud) { scene3.remove(sceneCloud); sceneCloud.geometry.dispose(); sceneCloud = null; }
    const sc = state.scene;
    if (!sc) return;
    scenePts = sc.pts.map(p => ({ ...p, groupName: sc.groups[p.group].name, color: sc.groups[p.group].color }))
      .concat((sc.user || []).map(u => ({ ...u, groupName: 'Your word', color: '#F4C37A' })));
    const vecs = scenePts.map(p => model.vec(p.idx));
    const p3 = pca(sc.pts.map(p => model.vec(p.idx)), 3);
    const coords = vecs.map(v => p3.project(v));
    const m = Math.max(...coords.flat().map(Math.abs)) || 1;
    const pos = new Float32Array(scenePts.length * 3), col = new Float32Array(scenePts.length * 3), size = new Float32Array(scenePts.length).fill(0.9);
    coords.forEach((c, i) => { pos.set(c.map(x => (x / m) * 8), i * 3); const cc = starColor(scenePts[i].color, 0.45); col.set([cc.r, cc.g, cc.b], i * 3); });
    sceneCloud = makeCloud(pos, col, size);
    sceneCloud.visible = mode === 'scene';
    scene3.add(sceneCloud);
    wake();
  }
  function setMode(m) {
    mode = m;
    btnGalaxy.setAttribute('aria-pressed', String(m === 'galaxy'));
    btnScene.setAttribute('aria-pressed', String(m === 'scene'));
    hovered = -1;
    if (m === 'scene') buildScene();
    galaxy.visible = m === 'galaxy';
    lines.visible = m === 'galaxy' && !!selected;
    ghost.visible = m === 'galaxy' && !!selected && selected.gi < 0;
    side.hidden = m !== 'galaxy' || !selected;
    if (sceneCloud) sceneCloud.visible = m === 'scene';
    renderLegend();
    flight = null;
    if (m === 'scene') { controls.target.set(0, 0, 0); camera.position.set(0, 3, 22); } else home();
    controls.autoRotate = !reduce;
    if (m === 'scene') setMsg(msg, `“${state.scene.title}” from Step 3, now with 3 directions instead of 2. Spin it: groups that overlapped in 2D may separate.`);
    else clearMsg(msg);
    wake();
  }
  btnGalaxy.addEventListener('click', () => setMode('galaxy'));
  btnScene.addEventListener('click', () => setMode('scene'));
  state.onScene(() => { if (mode === 'scene') buildScene(); });

  /* ---------- render loop (only while visible) ---------- */
  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    uniforms.uMax.value = 20 * renderer.getPixelRatio();
    uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    wake();
  }
  new ResizeObserver(resize).observe(stage);
  let visible = true, running = false;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function frame(now) {
    if (flight) {
      const t = Math.min(1, (now - flight.t0) / flight.dur), k = ease(t);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      camera.position.lerpVectors(flight.fromC, flight.toC, k);
      if (t >= 1) flight = null;
    }
    controls.update();
    renderer.render(scene3, camera);
    placeLabels();
  }
  function wake() {
    if (running || !visible) return;
    running = true;
    renderer.setAnimationLoop(frame);
  }
  function sleep() { running = false; renderer.setAnimationLoop(null); }
  new IntersectionObserver(es => { visible = es[0].isIntersecting && !document.hidden; visible ? wake() : sleep(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); else if (visible) wake(); });

  renderLegend();
  resize();
  frame(performance.now());
  wake();
  state.galaxy = { select: w => { const i = model.find(w); if (i >= 0) select(i); }, setMode, get mode() { return mode; } };
}

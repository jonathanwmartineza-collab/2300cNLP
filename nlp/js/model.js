// Data loading + all the vector math for the NLP Lab.
// Everything runs in the browser from data/vectors.bin (int8, N x 300, row-major).

const DATA = './data/';

/** Fetch with a progress callback (uses Content-Length when the server sends it). */
async function fetchWithProgress(url, onProgress, fallbackTotal) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const total = Number(res.headers.get('Content-Length')) || fallbackTotal || 0;
  if (!res.body || !res.body.getReader) {
    const buf = await res.arrayBuffer();
    onProgress && onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress && onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out.buffer;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

export class Model {
  constructor(vocab, int8) {
    this.info = vocab;
    this.words = vocab.words;
    this.D = vocab.dims || 300;
    this.N = this.words.length;
    const D = this.D, N = this.N, scale = vocab.scale || 1;
    const v = new Float32Array(N * D);
    for (let i = 0; i < N; i++) {
      let ss = 0;
      const o = i * D;
      for (let d = 0; d < D; d++) { const x = int8[o + d] / scale; v[o + d] = x; ss += x * x; }
      const inv = ss > 0 ? 1 / Math.sqrt(ss) : 0;
      for (let d = 0; d < D; d++) v[o + d] *= inv;
    }
    this.vecs = v;
    this.index = new Map();
    this.lower = new Map();
    this.words.forEach((w, i) => {
      if (!this.index.has(w)) this.index.set(w, i);
      const l = w.toLowerCase();
      if (!this.lower.has(l)) this.lower.set(l, i);
    });
  }

  vec(i) { return this.vecs.subarray(i * this.D, (i + 1) * this.D); }

  /** Forgiving lookup: trim, exact, lowercase, Capitalized, spaces->underscores, any-case. Returns index or -1. */
  find(raw) {
    if (raw == null) return -1;
    const t = String(raw).trim().replace(/\s+/g, ' ');
    if (!t) return -1;
    const tries = [];
    for (const base of [t, t.replace(/ /g, '_')]) {
      const lo = base.toLowerCase();
      tries.push(base, lo, lo.charAt(0).toUpperCase() + lo.slice(1),
        lo.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('_'), base.toUpperCase());
    }
    for (const w of tries) if (this.index.has(w)) return this.index.get(w);
    const lo = t.replace(/ /g, '_').toLowerCase();
    if (this.lower.has(lo)) return this.lower.get(lo);
    return -1;
  }

  /** "Did you mean" suggestions: prefix matches + smallest edit distance (case-insensitive). */
  suggest(raw, k = 4) {
    const q = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!q) return [];
    const scored = [];
    const maxD = Math.max(1, Math.min(3, Math.floor(q.length / 3) + 1));
    for (let i = 0; i < this.N; i++) {
      const w = this.words[i];
      const l = w.toLowerCase();
      if (Math.abs(l.length - q.length) > maxD + 4) continue;
      let s;
      if (l.startsWith(q) || q.startsWith(l) && l.length >= 3) s = 0.5 + Math.abs(l.length - q.length) * 0.1;
      else {
        if (Math.abs(l.length - q.length) > maxD) continue;
        const d = editDistance(q, l, maxD);
        if (d > maxD) continue;
        s = d;
      }
      scored.push([s + i / (this.N * 10), w]); // earlier rows = more frequent words, tiny tiebreak
    }
    scored.sort((a, b) => a[0] - b[0]);
    const seen = new Set(), out = [];
    for (const [, w] of scored) {
      const l = w.toLowerCase();
      if (seen.has(l)) continue;
      seen.add(l); out.push(w);
      if (out.length >= k) break;
    }
    return out;
  }

  sim(i, j) { return dot(this.vec(i), this.vec(j)); }

  /** k nearest rows to vector v (cosine; v need not be normalized). exclude: Set of row indices. */
  nearest(v, k = 10, exclude = new Set()) {
    const D = this.D, N = this.N, vecs = this.vecs;
    let n = 0; for (let d = 0; d < D; d++) n += v[d] * v[d];
    const inv = n > 0 ? 1 / Math.sqrt(n) : 0;
    const best = []; // [sim, idx] sorted desc, length <= k
    for (let i = 0; i < N; i++) {
      if (exclude.has(i)) continue;
      let s = 0; const o = i * D;
      for (let d = 0; d < D; d++) s += vecs[o + d] * v[d];
      s *= inv;
      if (best.length < k || s > best[best.length - 1][0]) {
        let p = best.length < k ? best.length : k - 1;
        if (best.length < k) best.push(null);
        while (p > 0 && best[p - 1][0] < s) { best[p] = best[p - 1]; p--; }
        best[p] = [s, i];
      }
    }
    return best.map(([s, i]) => ({ word: this.words[i], idx: i, sim: s }));
  }

  neighbors(i, k = 8) { return this.nearest(this.vec(i), k, new Set([i])); }

  /** "a is to b as c is to ?" = b - a + c */
  analogy(a, b, c, k = 5) {
    const D = this.D, t = new Float32Array(D);
    const va = this.vec(a), vb = this.vec(b), vc = this.vec(c);
    for (let d = 0; d < D; d++) t[d] = vb[d] - va[d] + vc[d];
    return { target: t, results: this.nearest(t, k, new Set([a, b, c])) };
  }

  /** Odd one out: the word with the lowest average similarity to the others. */
  oddOneOut(idxs) {
    const avg = idxs.map((i, a) => {
      let s = 0; idxs.forEach((j, b) => { if (a !== b) s += this.sim(i, j); });
      return s / (idxs.length - 1);
    });
    let pick = 0; avg.forEach((v, i) => { if (v < avg[pick]) pick = i; });
    return { avg, pick };
  }
}

export function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

export function editDistance(a, b, cap = 99) {
  const m = a.length, n = b.length;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i; let rowMin = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * PCA via the Gram matrix (cheap when there are few words): returns
 * { mean, comps: [Float32Array(D)...], coords: [[c1,c2..]...], project(v) }.
 */
export function pca(vectors, nComp = 2) {
  const n = vectors.length, D = vectors[0].length;
  const mean = new Float32Array(D);
  for (const v of vectors) for (let d = 0; d < D; d++) mean[d] += v[d] / n;
  const X = vectors.map(v => { const x = new Float32Array(D); for (let d = 0; d < D; d++) x[d] = v[d] - mean[d]; return x; });
  const G = X.map(a => X.map(b => dot(a, b)));
  const comps = [];
  for (let c = 0; c < nComp; c++) {
    let u = new Float64Array(n).map((_, i) => 1 + ((i * 7919 + c * 104729) % 97) / 97);
    let lambda = 0;
    for (let it = 0; it < 200; it++) {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += G[i][j] * u[j]; w[i] = s; }
      const norm = Math.hypot(...w) || 1;
      let diff = 0;
      for (let i = 0; i < n; i++) { const x = w[i] / norm; diff += Math.abs(x - u[i]); u[i] = x; }
      lambda = norm;
      if (diff < 1e-9) break;
    }
    // deflate
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i][j] -= lambda * u[i] * u[j];
    // component in word space: X^T u
    const comp = new Float32Array(D);
    for (let i = 0; i < n; i++) for (let d = 0; d < D; d++) comp[d] += X[i][d] * u[i];
    const cn = Math.hypot(...comp) || 1;
    for (let d = 0; d < D; d++) comp[d] /= cn;
    // deterministic sign: make the skew of projections positive
    let sk = 0; for (const x of X) { const p = dot(x, comp); sk += p * p * p; }
    if (sk < 0) for (let d = 0; d < D; d++) comp[d] = -comp[d];
    comps.push(comp);
  }
  const project = v => comps.map(c => { let s = 0; for (let d = 0; d < D; d++) s += (v[d] - mean[d]) * c[d]; return s; });
  return { mean, comps, project, coords: vectors.map(project) };
}

/** Load everything the page needs up front. Galaxy is loaded lazily by the 3D section. */
export async function loadModel(onProgress) {
  const [vocab, lessons] = await Promise.all([fetchJSON(DATA + 'vocab.json'), fetchJSON(DATA + 'lessons.json')]);
  const expected = (vocab.count || vocab.words.length) * (vocab.dims || 300);
  const buf = await fetchWithProgress(DATA + 'vectors.bin', onProgress, expected);
  const int8 = new Int8Array(buf);
  if (int8.length < vocab.words.length * (vocab.dims || 300)) throw new Error('vectors.bin is smaller than expected');
  return { model: new Model(vocab, int8), lessons };
}

export const loadGalaxy = () => fetchJSON(DATA + 'galaxy.json');

// Builds both arches, seats them into centric occlusion, and creates gum / stone geometry.
import * as THREE from 'three';
import { SPECS, buildCrown, buildLayout, spee, fdi } from './teeth.js';
import { HeightField } from './heightfield.js';

const OVERBITE = { 1: 2.0, 2: 1.1 };          // mm, upper incisal edge below lower incisal edge
const CANINE_OVERLAP = 1.6;    // mm vertical overlap of canines
const ANT_GAP = 0.02;          // anterior teeth seated to light contact in MIP

function frameFor(curve, s, side) {
  const P = curve.at(s), T = curve.tan(s);
  const M = T.clone().multiplyScalar(-side).setY(0).normalize();
  const B = new THREE.Vector3(T.z, 0, -T.x).normalize();
  if (B.dot(new THREE.Vector3(P.x, 0, P.z + 25)) < 0) B.negate();
  return { P, M, B };
}

function placeTooth(t, out = null) {
  const src = t.crown.pos, n = src.length / 3;
  const o = out || new Float32Array(src.length);
  const { P, M, B } = t.frame;
  for (let i = 0; i < n; i++) {
    const m = src[i * 3], y = src[i * 3 + 1], b = src[i * 3 + 2] + t.db;
    o[i * 3] = P.x + M.x * m + B.x * b;
    o[i * 3 + 1] = t.yBase + t.up * y + t.dy;
    o[i * 3 + 2] = P.z + M.z * m + B.z * b;
  }
  return o;
}

function toothIndices(t) {
  const { M, B } = t.frame;
  const det = new THREE.Matrix3().set(M.x, 0, B.x, M.y, t.up, B.y, M.z, 0, B.z).determinant();
  const idx = t.crown.idx.slice();
  if (det < 0) for (let q = 0; q < idx.length; q += 3) { const s = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = s; }
  return idx;
}

// min over the tooth's footprint of (upperY - lowerY) using a sparse raster of the tooth against field L
function verticalGap(t, L) {
  const pos = placeTooth(t);
  let g = Infinity;
  L.raster(pos, t.idx, 0, t.idx.length / 3, (k, y) => {
    const ly = L.data[k];
    if (Number.isFinite(ly)) g = Math.min(g, y - ly);
  });
  return g;
}

export { placeTooth, verticalGap };
export function buildModel(opts = {}) {
  const layout = buildLayout();
  const crowns = {};
  const teeth = { lower: [], upper: [] };
  for (const arch of ['lower', 'upper']) {
    const curve = layout[arch], S = arch === 'lower' ? layout.lowerS : layout.upperS;
    for (const side of [-1, 1]) for (let k = 1; k <= 7; k++) {
      const spec = SPECS[arch][k];
      const key = arch + k;
      const extra = opts.extraCusp && opts.extraCusp.fdi === fdi(arch, side, k);
      crowns[key] ||= buildCrown(spec, {});
      const crown = crowns[key];
      const extraCrown = extra ? buildCrown({ ...spec, bumps: [opts.extraCusp.cusp] }, {}) : null;
      const s = side * S[k];
      const frame = frameFor(curve, s, side);
      const up = arch === 'lower' ? 1 : -1;
      let yBase;
      if (arch === 'lower') yBase = spee(s) - crown.hmax;
      else if (k <= 2) yBase = crown.hmax - OVERBITE[k];
      else if (k === 3) yBase = crown.hmax - CANINE_OVERLAP;
      else yBase = spee(s) + 0.4 + crown.hmax;
      const t = { arch, side, k, fdi: fdi(arch, side, k), spec, crown, frame, up, yBase, dy: 0, db: 0, extraCrown };
      t.idx = toothIndices(t);
      teeth[arch].push(t);
    }
  }
  // Lower field (mandible local frame == world at rest)
  const L = new HeightField('max');
  for (const t of teeth.lower) L.raster(placeTooth(t), t.idx);
  // Seat upper posteriors vertically; anteriors horizontally (keeps the designed overbite)
  for (const t of teeth.upper) {
    if (t.k === 3) t.db = opts.canineDb ?? -0.6;
    if (t.k >= 3) { const g = verticalGap(t, L); if (Number.isFinite(g)) t.dy -= g; if (t.k === 3) t.dy += opts.canineLift ?? 0.8; continue; }
    const f = (db) => { t.db = db; const g = verticalGap(t, L); return (Number.isFinite(g) ? g : 3) - ANT_GAP; };
    let a = 0, fa = f(a), b = -0.6, fb = f(b);
    for (let it = 0; it < 12 && Math.abs(fb) > 0.002; it++) {
      const nb = Math.abs(fb - fa) < 1e-6 ? b - 0.2 : b - (fb * (b - a)) / (fb - fa);
      a = b; fa = fb; b = THREE.MathUtils.clamp(nb, -6, 4); fb = f(b);
    }
    t.db = b;
  }
  // A deliberately high cusp is added after seating, so it shows up as an interference
  for (const t of teeth.upper) if (t.extraCrown) { t.crown = t.extraCrown; t.idx = toothIndices(t); }
  const U = new HeightField('min');
  for (const t of teeth.upper) U.raster(placeTooth(t), t.idx);

  const arches = {};
  for (const arch of ['lower', 'upper']) arches[arch] = mergeArch(teeth[arch]);
  const gums = { lower: buildGum(teeth.lower, layout.lower, 'lower'), upper: buildGum(teeth.upper, layout.upper, 'upper') };

  // reference points
  const lc = teeth.lower.filter((t) => t.k === 1), uc = teeth.upper.filter((t) => t.k === 1);
  let lowTip = -Infinity, lowLabZ = -Infinity, upEdge = Infinity, upLabZ = -Infinity;
  for (const t of lc) { const p = placeTooth(t); for (let i = 1; i < p.length; i += 3) lowTip = Math.max(lowTip, p[i]); }
  for (const t of lc) { const p = placeTooth(t); for (let i = 1; i < p.length; i += 3) if (p[i] > lowTip - 0.5) lowLabZ = Math.max(lowLabZ, p[i + 1]); }
  for (const t of uc) { const p = placeTooth(t); for (let i = 1; i < p.length; i += 3) upEdge = Math.min(upEdge, p[i]); }
  for (const t of uc) { const p = placeTooth(t); for (let i = 1; i < p.length; i += 3) if (p[i] < upEdge + 0.5) upLabZ = Math.max(upLabZ, p[i + 1]); }
  let incisalZ = -Infinity;
  for (const t of lc) { const p = placeTooth(t); for (let i = 1; i < p.length; i += 3) if (p[i] > lowTip - 0.05) incisalZ = Math.max(incisalZ, p[i + 1]); }
  const lcan = teeth.lower.find((t) => t.fdi === 33), ucan = teeth.upper.find((t) => t.fdi === 23);
  let lct = -Infinity, uct = Infinity;
  { const p = placeTooth(lcan); for (let i = 1; i < p.length; i += 3) lct = Math.max(lct, p[i]); }
  { const p = placeTooth(ucan); for (let i = 1; i < p.length; i += 3) uct = Math.min(uct, p[i]); }
  const metrics = { canineOverlap: +(lct - uct).toFixed(2),
    overbite: +(lowTip - upEdge).toFixed(2), overjet: +(upLabZ - lowLabZ).toFixed(2),
    kAnt: +layout.kAnt.toFixed(3), kPm: +layout.kPm.toFixed(3),
    settle: teeth.upper.map((t) => ({ fdi: t.fdi, dy: +t.dy.toFixed(2), db: +t.db.toFixed(2) })),
  };
  const incisalPoint = new THREE.Vector3(0, lowTip, incisalZ - 0.3);
  return { layout, teeth, L, U, arches, gums, metrics, incisalPoint };
}

function mergeArch(list) {
  let nv = 0, ni = 0;
  for (const t of list) { nv += t.crown.pos.length / 3; ni += t.idx.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const index = new Uint32Array(ni), tooth = new Uint8Array(nv), top = [];
  let vo = 0, io = 0;
  list.forEach((t, ti) => {
    const p = placeTooth(t); pos.set(p, vo * 3);
    for (let q = 0; q < t.idx.length; q++) index[io + q] = t.idx[q] + vo;
    const n = p.length / 3;
    for (let i = 0; i < n; i++) { tooth[vo + i] = ti; if (t.crown.top[i]) top.push(vo + i); }
    t.vStart = vo; t.vCount = n;
    vo += n; io += t.idx.length;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  return { geometry: g, tooth, top: Uint32Array.from(top) };
}

// Alveolar ridge + gingiva swept along the arch, and a stone base slab.
function buildGum(list, arch, which) {
  const up = which === 'lower' ? 1 : -1;
  const sEnd = Math.max(...list.filter((t) => t.k === 7).map((t) => {
    const p = t.frame.P; let best = 0, bd = Infinity;
    for (let s = 0; s <= arch.half; s += 0.25) { const d = arch.at(s).distanceToSquared(new THREE.Vector3(Math.abs(p.x), 0, p.z)); if (d < bd) { bd = d; best = s; } }
    return best + t.spec.md / 2 + 1.5;
  }));
  // cervical height and half-width along s: interpolate from teeth
  const byS = list.filter((t) => t.side > 0).map((t) => {
    let best = 0, bd = Infinity;
    for (let s = 0; s <= arch.half; s += 0.25) { const d = arch.at(s).distanceToSquared(t.frame.P); if (d < bd) { bd = d; best = s; } }
    const cerv = t.yBase + t.up * (-t.spec.len) + t.dy; // world y of cervix
    return { s: best, cerv, w: t.spec.bl / 2 + 0.6, db: t.db };
  }).sort((a, b) => a.s - b.s);
  const interp = (s, key) => {
    const a = Math.abs(s);
    if (a <= byS[0].s) return byS[0][key];
    for (let i = 1; i < byS.length; i++) if (a <= byS[i].s) { const t = (a - byS[i - 1].s) / (byS[i].s - byS[i - 1].s); return byS[i - 1][key] * (1 - t) + byS[i][key] * t; }
    return byS[byS.length - 1][key];
  };
  // profile (n = outward offset, h = depth away from occlusal) – closed loop, buccal top -> lingual top
  const prof = [[0.78, 0], [0.98, 1.6], [1.06, 4.5], [1.08, 9], [1.0, 13.5], [0.6, 15.5], [0, 16], [-0.6, 15.5], [-1.0, 13.5], [-1.08, 9], [-1.04, 4.5], [-0.95, 1.6], [-0.75, 0]];
  const NS = 120, NP = prof.length;
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = -sEnd + (2 * sEnd * i) / NS;
    const P = arch.at(s), T = arch.tan(s);
    const B = new THREE.Vector3(T.z, 0, -T.x).normalize();
    if (B.dot(new THREE.Vector3(P.x, 0, P.z + 25)) < 0) B.negate();
    const cerv = interp(s, 'cerv') - up * 1.3, w = interp(s, 'w'), db = interp(s, 'db');
    for (const [n, h] of prof) {
      const off = n * w + db;
      pos.push(P.x + B.x * off, cerv - up * h, P.z + B.z * off);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NP - 1; j++) {
    const a = i * NP + j, b = a + 1, c = a + NP, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // end caps
  for (const i of [0, NS]) {
    const cIdx = pos.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < NP; j++) { cx += pos[(i * NP + j) * 3]; cy += pos[(i * NP + j) * 3 + 1]; cz += pos[(i * NP + j) * 3 + 2]; }
    pos.push(cx / NP, cy / NP, cz / NP);
    for (let j = 0; j < NP; j++) { const a = i * NP + j, b = i * NP + ((j + 1) % NP); if (i === 0) idx.push(cIdx, a, b); else idx.push(cIdx, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // fix winding so normals face outward (test the buccal-most mid vertex)
  g.computeVertexNormals();
  const mid = Math.floor(NS / 2) * NP + 3; const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, mid);
  const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position, mid);
  if (nrm.z * Math.sign(p.z + 25) < 0 && Math.abs(nrm.z) > 0.2) {
    const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  let cervMean = 0; byS.forEach((b) => (cervMean += b.cerv)); cervMean /= byS.length;
  const baseY = cervMean - up * 1.3 - up * 15; // bottom of the ridge
  return { geometry: g, baseY };
}

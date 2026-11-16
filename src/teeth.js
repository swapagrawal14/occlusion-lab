// Procedural tooth forms and arch layout. Units: millimetres.
// World frame: +x = patient's LEFT, +y = up (occlusal of lower teeth), +z = anterior.
import * as THREE from 'three';

// Mesiodistal (md), buccolingual (bl), crown length (len), outline exponent (n),
// cusps: [m/a, b/c, height mm] in a tooth frame where +m = mesial, +b = buccal/labial.
const LOWER = {
  1: { md: 5.3, bl: 5.8, len: 9.0, kind: 'incisor', n: 2.3, tilt: 6, edge: 0.15, lab: 2.6, lin: 1.25 },
  2: { md: 5.8, bl: 6.1, len: 9.5, kind: 'incisor', n: 2.3, tilt: 6, edge: 0.15, lab: 2.6, lin: 1.25 },
  3: { md: 6.9, bl: 7.5, len: 11.0, kind: 'canine', n: 2.2, tilt: 4, tip: 0.25, sm: 0.5, lab: 1.7, lin: 1.25 },
  4: { md: 7.0, bl: 7.6, len: 8.5, kind: 'pm', n: 2.4, sig: 1.25, cusps: [[0, 0.32, 2.3], [0, -0.5, 0.9]] },
  5: { md: 7.1, bl: 8.1, len: 8.0, kind: 'pm', n: 2.6, sig: 1.25, cusps: [[0, 0.32, 2.0], [0.1, -0.45, 1.5]] },
  6: { md: 11.0, bl: 10.3, len: 7.5, kind: 'molar', n: 3.2, sig: 1.45,
       cusps: [[0.56, 0.5, 2.0], [-0.04, 0.55, 1.9], [-0.64, 0.4, 1.5], [0.48, -0.52, 1.75], [-0.42, -0.52, 1.6]] },
  7: { md: 10.5, bl: 10.0, len: 7.0, kind: 'molar', n: 3.2, sig: 1.45,
       cusps: [[0.48, 0.5, 1.9], [-0.46, 0.5, 1.75], [0.48, -0.52, 1.6], [-0.46, -0.52, 1.45]] },
};
const UPPER = {
  1: { md: 8.8, bl: 7.0, len: 10.5, kind: 'incisor', n: 2.5, tilt: 15, edge: 0.3, lab: 2.8, lin: 1.55, corner: 0.55, cornerExp: 4, taper: 0.24 },
  2: { md: 6.8, bl: 6.2, len: 9.0, kind: 'incisor', n: 2.4, tilt: 12, edge: 0.3, lab: 2.8, lin: 1.45, corner: 1.2, cornerExp: 3, taper: 0.26 },
  3: { md: 7.6, bl: 8.0, len: 10.0, kind: 'canine', n: 2.2, tilt: 7, tip: 0.3, sm: 0.75, lab: 2.0, lin: 1.9 },
  4: { md: 6.7, bl: 9.0, len: 8.5, kind: 'pm', n: 2.4, sig: 1.3, cusps: [[0, 0.42, 2.2], [0, -0.42, 1.9]] },
  5: { md: 6.4, bl: 9.0, len: 7.8, kind: 'pm', n: 2.5, sig: 1.3, cusps: [[0, 0.42, 1.95], [0, -0.42, 1.95]] },
  6: { md: 10.2, bl: 11.2, len: 7.5, kind: 'molar', n: 3.0, sig: 1.45,
       cusps: [[0.46, 0.5, 1.5], [-0.46, 0.5, 1.35], [0.3, -0.45, 2.3], [-0.58, -0.48, 1.55]] },
  7: { md: 9.4, bl: 11.0, len: 7.2, kind: 'molar', n: 3.0, sig: 1.45,
       cusps: [[0.46, 0.5, 1.4], [-0.46, 0.5, 1.2], [0.26, -0.45, 2.1], [-0.58, -0.45, 1.3]] },
};
export const SPECS = { upper: UPPER, lower: LOWER };

const smax = (vals, k = 4) => { let s = 0; for (const v of vals) s += Math.exp(k * v); return Math.log(s) / k; };
const sabs = (x, e = 0.08) => Math.sqrt(x * x + e * e) - e;

// Occlusal / incisal surface height as a function of (m, b) in the tooth frame. Peak ~0 for anteriors.
export function occlusalHeight(spec, m, b, opts = {}) {
  const a = spec.md / 2, c = spec.bl / 2;
  if (spec.kind === 'incisor') {
    const be = spec.edge * c;
    const d = b - be;
    const slope = d > 0 ? spec.lab : spec.lin;
    const conc = d < 0 ? 0.06 * d * d : 0; // slightly concave lingual / palatal fossa
    // incisal corners: rounded, the distal (m < 0) more than the mesial, as on upper incisors
    const corner = (spec.corner ?? 0.55) * (m < 0 && spec.corner ? 1.35 : 1);
    return -slope * sabs(d) - conc - corner * Math.pow(Math.abs(m / a), spec.cornerExp ?? 4);
  }
  if (spec.kind === 'canine') {
    const bt = spec.tip * c;
    const d = b - bt;
    const sb = d > 0 ? spec.lab : spec.lin * (opts.wornCanine ? 0.55 : 1);
    const h = -Math.sqrt((spec.sm * m) ** 2 + (sb * d) ** 2 + 0.04) + 0.2;
    return opts.wornCanine ? Math.max(h, -1.2) - 0.9 : h; // worn canine: flattened, shorter tip
  }
  const s = spec.sig;
  const vals = [0];
  for (const [cm, cb, A] of spec.cusps) {
    const dm = m - cm * a, db = b - cb * c;
    vals.push(A * Math.exp(-(dm * dm + db * db) / (2 * s * s)));
  }
  // marginal ridges (mesial & distal)
  for (const sgn of [1, -1]) {
    const dm = m - sgn * 0.8 * a;
    vals.push(1.0 * Math.exp(-(dm * dm) / (2 * 0.55 * 0.55)) * Math.exp(-(b * b) / (2 * (0.5 * c) ** 2)));
  }
  let h = smax(vals, 3.2);
  for (const [cm, cb, A, sg = 1.0] of spec.bumps || []) {
    const dm = m - cm * a, db = b - cb * c;
    h = Math.max(h, A * Math.exp(-(dm * dm + db * db) / (2 * sg * sg)));
  }
  return h;
}

// Build one crown in its local frame (m, y, b). Returns raw arrays.
export function buildCrown(spec, opts = {}, segs = 72, topRings = 18, sideRings = 12) {
  const a = spec.md / 2, c = spec.bl / 2, n = spec.n;
  const pos = [], top = [], idx = [];
  const outline = [];
  for (let i = 0; i < segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    outline.push([a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n), c * Math.sign(st) * Math.pow(Math.abs(st), 2 / n)]);
  }
  const H = (m, b) => occlusalHeight(spec, m, b, opts);
  // centre
  pos.push(0, H(0, 0), 0); top.push(1);
  const RIM = 0.9;
  for (let k = 1; k <= topRings; k++) {
    const r = RIM * (k / topRings);
    for (let i = 0; i < segs; i++) {
      const m = outline[i][0] * r, b = outline[i][1] * r;
      pos.push(m, H(m, b), b); top.push(1);
    }
  }
  const rimH = outline.map(([om, ob]) => H(om * RIM, ob * RIM));
  const len = spec.len;
  for (let j = 1; j <= sideRings; j++) {
    const t = Math.pow(j / sideRings, 1.35);
    const s = t < 0.28 ? RIM + (1.0 - RIM) * Math.sin((Math.PI / 2) * (t / 0.28)) : 1.0 - 0.2 * Math.pow((t - 0.28) / 0.72, 1.4);
    for (let i = 0; i < segs; i++) {
      const y = rimH[i] + (-len - rimH[i]) * t;
      const sm = s * (1 - (spec.taper || 0) * t); // mesiodistal taper toward the cervix (less boxy incisors)
      pos.push(outline[i][0] * sm, y, outline[i][1] * s); top.push(j <= 4 ? 1 : 0);
    }
  }
  pos.push(0, -len - 2, 0); top.push(0);
  const ring = (k, i) => 1 + (k - 1) * segs + (i % segs);
  for (let i = 0; i < segs; i++) idx.push(0, ring(1, i + 1), ring(1, i));
  const totalRings = topRings + sideRings;
  for (let k = 1; k < totalRings; k++) {
    for (let i = 0; i < segs; i++) {
      const p0 = ring(k, i), p1 = ring(k, i + 1), q0 = ring(k + 1, i), q1 = ring(k + 1, i + 1);
      idx.push(p0, p1, q1, p0, q1, q0);
    }
  }
  const last = pos.length / 3 - 1;
  for (let i = 0; i < segs; i++) idx.push(last, ring(totalRings, i), ring(totalRings, i + 1));
  // orientation check: centre fan triangle normal should point +y
  const v = (q) => new THREE.Vector3(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]);
  const A = v(idx[0]), B = v(idx[1]), C = v(idx[2]);
  const nrm = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
  if (nrm.y < 0) for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
  let hmax = -Infinity;
  for (let q = 1; q < pos.length; q += 3) hmax = Math.max(hmax, pos[q]);
  // tilt about the m-axis (positive = crown tips buccally/labially)
  const tau = THREE.MathUtils.degToRad(spec.tilt || 0);
  if (tau) {
    const py = -len * 0.7, cs = Math.cos(tau), sn = Math.sin(tau);
    for (let q = 0; q < pos.length; q += 3) {
      const y = pos[q + 1] - py, b = pos[q + 2];
      pos[q + 2] = b * cs + y * sn;
      pos[q + 1] = py + y * cs - b * sn;
    }
    hmax = -Infinity;
    for (let q = 1; q < pos.length; q += 3) hmax = Math.max(hmax, pos[q]);
  }
  return { pos, top, idx, hmax };
}

// ---------- Arch curves ----------
function makeCurve(half) {
  const pts = [];
  for (let i = half.length - 1; i > 0; i--) pts.push(new THREE.Vector3(-half[i][0], 0, half[i][1]));
  for (const [x, z] of half) pts.push(new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = 2000;
  const L = curve.getLength();
  // s = signed arch length from midline (+ = patient's left)
  return {
    curve, half: L / 2,
    at(s) { const u = THREE.MathUtils.clamp(0.5 + s / L, 0, 1); return curve.getPointAt(u); },
    tan(s) { const u = THREE.MathUtils.clamp(0.5 + s / L, 0, 1); return curve.getTangentAt(u); },
  };
}
// Lower arch: central-fossa line posteriorly, incisal edges anteriorly.
const LOWER_HALF = [[0, 0], [6, -1.1], [11.3, -4.0], [15.7, -8.8], [18.9, -15.2], [20.8, -22.4], [22.0, -30.0], [23.0, -40.0], [24.0, -52.0], [24.6, -60]];
export const UPPER_OFFSET = 2.6; // buccal offset of the upper central-fossa line from the lower one

export function spee(s) { const a = Math.abs(s); return 0.0009 * (a - 28) ** 2 - 0.7056; } // mild curve of Spee (mm)

export function buildLayout() {
  const lower = makeCurve(LOWER_HALF);
  // Upper curve: offset outward by UPPER_OFFSET.
  const samples = [];
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const s = -lower.half + (2 * lower.half * i) / N;
    const p = lower.at(s), t = lower.tan(s);
    const nrm = new THREE.Vector3(t.z, 0, -t.x); // outward for this curve direction
    if (nrm.dot(new THREE.Vector3(p.x, 0, p.z + 25)) < 0) nrm.negate();
    samples.push({ sL: s, p: p.clone().addScaledVector(nrm, UPPER_OFFSET - 1.6 * Math.exp(-((s / 12) ** 2))) });
  }
  const upperHalfPts = samples.filter((q) => q.sL >= 0).filter((_, i) => i % 8 === 0).map((q) => [q.p.x, q.p.z]);
  upperHalfPts[0] = [0, upperHalfPts[0][1]];
  const upper = makeCurve(upperHalfPts);
  // map lower arch-length -> upper arch-length (by projecting the offset point)
  const sUfromL = (sL) => {
    const target = samples.reduce((b, q) => (Math.abs(q.sL - sL) < Math.abs(b.sL - sL) ? q : b)).p;
    let best = 0, bd = Infinity;
    for (let s = 0; s <= upper.half; s += 0.05) {
      const d = upper.at(s).distanceToSquared(target);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  // Lower tooth centres (contiguous from midline)
  const lowerS = {}; let acc = 0;
  for (let k = 1; k <= 7; k++) { lowerS[k] = acc + LOWER[k].md / 2; acc += LOWER[k].md; }
  const upperS = {};
  // Anteriors contiguous from midline, scaled so the upper canine tip lands on the lower 3/4 embrasure (Class I canine)
  const emb34 = sUfromL(lowerS[3] + LOWER[3].md / 2);
  const rawC = UPPER[1].md + UPPER[2].md + UPPER[3].md / 2;
  const kAnt = emb34 / rawC;
  upperS[1] = (UPPER[1].md / 2) * kAnt;
  upperS[2] = (UPPER[1].md + UPPER[2].md / 2) * kAnt;
  upperS[3] = emb34;
  // Class I molar: upper M1 mesiobuccal cusp over the lower M1 buccal groove (between MB and DB cusps)
  const l6 = LOWER[6], u6 = UPPER[6];
  const grooveM = ((l6.cusps[0][0] + l6.cusps[1][0]) / 2) * (l6.md / 2); // mesial offset from centre
  const sGroove = sUfromL(lowerS[6] - grooveM);
  upperS[6] = sGroove + u6.cusps[0][0] * (u6.md / 2);
  upperS[7] = upperS[6] + u6.md / 2 + UPPER[7].md / 2;
  // Premolars fill the space between canine and M1
  const start = upperS[3] + UPPER[3].md / 2, end = upperS[6] - u6.md / 2;
  const kPm = (end - start) / (UPPER[4].md + UPPER[5].md);
  upperS[4] = start + (UPPER[4].md / 2) * kPm;
  upperS[5] = start + (UPPER[4].md + UPPER[5].md / 2) * kPm;
  return { lower, upper, lowerS, upperS, kAnt, kPm, sUfromL };
}

export const fdi = (arch, side, k) => (arch === 'upper' ? (side < 0 ? 10 : 20) : side < 0 ? 40 : 30) + k;
export const toothGroup = (k) => (k <= 2 ? 'incisor' : k === 3 ? 'canine' : k <= 5 ? 'premolar' : 'molar');

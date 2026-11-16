import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildModel } from './model.js';
import { Engine } from './engine.js';
import { buildArticulator, updateArticulatorSettings, outlineUniforms, toon, inked } from './scene.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// ---------- model + engine ----------
const model = buildModel();
const engine = new Engine(model);

// ---------- renderer / scenes ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 90; controls.maxDistance = 700;
function addLights(sc) {
  sc.add(new THREE.AmbientLight(0xffffff, 1.15));
  const d = new THREE.DirectionalLight(0xffffff, 1.55); d.position.set(-60, 140, 110); sc.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.35); d2.position.set(80, -40, -60); sc.add(d2);
}
addLights(scene);

const toothMat = toon(0xffffff, { vertexColors: true });
const art = buildArticulator(model, toothMat);
scene.add(art.upper);
const mandible = art.lower; mandible.matrixAutoUpdate = false; scene.add(mandible);
// whole rig is centred around the arches
const VIEWS = {
  three: { pos: [-260, 95, 300], target: [0, -2, -32] },
  front: { pos: [0, 10, 380], target: [0, -2, -26] },
  right: { pos: [-400, 14, -30], target: [0, -2, -30] },
  left: { pos: [400, 14, -30], target: [0, -2, -30] },
  back: { pos: [0, 95, -330], target: [0, -4, -18] },
};

// Occlusal map scene: same geometry (shares the vertex colours), opened like a book
const mapScene = new THREE.Scene(); addLights(mapScene);
const mapU = new THREE.Group(), mapL = new THREE.Group();
mapU.add(inked(model.arches.upper.geometry, toothMat, 1.2), inked(model.gums.upper.geometry, toon('#f2a2bf'), 1.2));
mapL.add(inked(model.arches.lower.geometry, toothMat, 1.2), inked(model.gums.lower.geometry, toon('#f2a2bf'), 1.2));
mapU.rotation.x = Math.PI; mapU.position.set(0, -5, -84); // flip so occlusal faces up; incisors to the top of the map
mapL.position.set(0, 0, 4);
mapScene.add(mapU, mapL);
const mapCam = new THREE.OrthographicCamera(-40, 40, 40, -40, -200, 200);
const mapBox = new THREE.Box3().setFromObject(mapScene);
const mapC = mapBox.getCenter(new THREE.Vector3()), mapS = mapBox.getSize(new THREE.Vector3());
mapCam.up.set(0, 0, -1); mapCam.position.set(mapC.x, 100, mapC.z); mapCam.lookAt(mapC.x, 0, mapC.z);
function fitMapCam(cam, w, h, margin = 3) {
  const asp = w / Math.max(1, h), needW = mapS.x / 2 + margin, needH = mapS.z / 2 + margin;
  let hw = needW, hh = needW / asp; if (hh < needH) { hh = needH; hw = needH * asp; }
  cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
}
const marksCam = mapCam.clone();

// ---------- colours ----------
const COL = {
  ivory: new THREE.Color('#f6eedc'), blue: new THREE.Color('#2f5fd0'), blueD: new THREE.Color('#1d3b8f'),
  red: new THREE.Color('#e2366f'), redD: new THREE.Color('#a8154c'), ink: new THREE.Color('#221d1f'), live: new THREE.Color('#f3c138'),
  blueL: new THREE.Color('#a9bff0'), redL: new THREE.Color('#f6aac4'), inkL: new THREE.Color('#8a8184'),
};
const arches = { lower: model.arches.lower, upper: model.arches.upper };
const centricGap = {}, trail = {};
for (const k of ['lower', 'upper']) {
  const n = arches[k].geometry.attributes.position.count;
  trail[k] = new Uint8Array(n);
  const c = arches[k].geometry.attributes.color.array;
  for (let i = 0; i < n; i++) { c[i * 3] = COL.ivory.r; c[i * 3 + 1] = COL.ivory.g; c[i * 3 + 2] = COL.ivory.b; }
}
const ui = { showCentric: true, keepMarks: true, point: 'I', plate: false, moving: false, halo: true, pins: true };

function captureCentric() {
  const saved = engine.state ? { ...engine.state.input } : { p: 0, lat: 0, open: 0 };
  engine.solve({ p: 0, lat: 0, open: 0 });
  centricGap.lower = Float32Array.from(engine.gapLow); centricGap.upper = Float32Array.from(engine.gapUp);
  return saved;
}

// Neighbour lists (CSR) over each arch's occlusal vertices, used to draw a pale halo ring around every mark.
// The halo is a display aid only: the saturated core is still exactly the vertices whose gap is under the paper thickness.
function buildNeighbours(A) {
  const n = A.geometry.attributes.position.count, isTop = new Uint8Array(n);
  for (const v of A.top) isTop[v] = 1;
  const ix = A.geometry.index.array, deg = new Uint32Array(n + 1);
  for (let q = 0; q < ix.length; q += 3) for (let e = 0; e < 3; e++) { const a = ix[q + e], b = ix[q + (e + 1) % 3]; if (isTop[a] && isTop[b]) { deg[a + 1]++; deg[b + 1]++; } }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(0, n), nb = new Uint32Array(deg[n]);
  for (let q = 0; q < ix.length; q += 3) for (let e = 0; e < 3; e++) { const a = ix[q + e], b = ix[q + (e + 1) % 3]; if (isTop[a] && isTop[b]) { nb[fill[a]++] = b; nb[fill[b]++] = a; } }
  return { off: deg, nb, lvl: new Uint8Array(n) };
}
const NB = { lower: buildNeighbours(arches.lower), upper: buildNeighbours(arches.upper) };
// mark levels: 1 centric, 2 centric close, 3 excursive, 4 excursive close, 5 overlap
const LVL = [null, COL.blue, COL.blueD, COL.red, COL.redD, COL.ink];
const HALO = [null, COL.blueL, COL.blueL, COL.redL, COL.redL, COL.inkL];
function paint(s) {
  const thr = engine.params.paper;
  const centric = s.analysis.movement === 'centric';
  for (const k of ['lower', 'upper']) {
    const A = arches[k], col = A.geometry.attributes.color.array, gap = k === 'lower' ? engine.gapLow : engine.gapUp, cg = centricGap[k], tr = trail[k];
    const { off, nb, lvl } = NB[k];
    for (const v of A.top) {
      const g = gap[v];
      if (!centric && s.analysis.movement !== 'open' && g < thr && ui.keepMarks) tr[v] = 1;
      let L = 0;
      if (ui.showCentric && cg[v] < thr) L = cg[v] < thr * 0.35 ? 2 : 1;
      if (tr[v]) L = 3;
      if (g < thr) {
        if (g < -0.05) L = 5;
        else if (centric) L = g < thr * 0.35 ? 2 : 1;
        else L = g < thr * 0.35 ? 4 : 3;
      }
      lvl[v] = L;
    }
    for (const v of A.top) {
      let c = COL.ivory;
      if (lvl[v]) c = LVL[lvl[v]];
      else if (ui.halo) { let h = 0; for (let e = off[v]; e < off[v + 1]; e++) h = Math.max(h, lvl[nb[e]]); if (h) c = HALO[h]; }
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    A.geometry.attributes.color.needsUpdate = true;
  }
  updatePins(s);
}

// Live contact pins: one outlined dot per lower tooth that is touching right now, placed at the centroid of that
// tooth's touching vertices (moved with the mandible). Drawn over the casts so contacts hidden between the teeth stay readable.
function pinTexture(fill) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#221d1f'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill();
  c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(32, 32, 24, 0, 7); c.fill();
  c.fillStyle = fill; c.beginPath(); c.arc(32, 32, 18, 0, 7); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PIN_MAT = { c: '#2f5fd0', e: '#e2366f', o: '#221d1f' };
for (const k in PIN_MAT) PIN_MAT[k] = new THREE.SpriteMaterial({ map: pinTexture(PIN_MAT[k]), depthTest: false, depthWrite: false, transparent: true });
const pins = new THREE.Group(); pins.renderOrder = 10; scene.add(pins);
const pinPool = [];
const _pv = new THREE.Vector3();
function updatePins(s) {
  for (const p of pinPool) p.visible = false;
  if (!ui.pins) return;
  const thr = engine.params.paper, centric = s.analysis.movement === 'centric';
  const A = arches.lower, pos = A.geometry.attributes.position.array, gap = engine.gapLow;
  let used = 0;
  for (const t of model.teeth.lower) {
    let sx = 0, sy = 0, sz = 0, n = 0, minG = Infinity;
    for (let v = t.vStart; v < t.vStart + t.vCount; v++) { const g = gap[v]; if (g < thr) { sx += pos[v * 3]; sy += pos[v * 3 + 1]; sz += pos[v * 3 + 2]; n++; minG = Math.min(minG, g); } }
    if (!n) continue;
    if (!pinPool[used]) { const sp = new THREE.Sprite(PIN_MAT.c); sp.renderOrder = 10; sp.scale.setScalar(window.innerWidth <= 820 ? 4.6 : 4); pinPool.push(sp); pins.add(sp); }
    const sp = pinPool[used++];
    sp.material = minG < -0.05 ? PIN_MAT.o : centric ? PIN_MAT.c : PIN_MAT.e;
    sp.position.copy(_pv.set(sx / n, sy / n, sz / n).applyMatrix4(engine.M));
    sp.visible = true;
  }
}
// ---------- pose state ----------
let input = { p: 0, lat: 0, open: 0 };
let state = null;
const trace = [];
function apply(inp, opts = {}) {
  input = { p: inp.p || 0, lat: inp.lat || 0, open: inp.open || 0 };
  state = engine.solve(input);
  mandible.matrix.copy(engine.M); mandible.matrixWorldNeedsUpdate = true;
  paint(state);
  if (!opts.noTrace && input.open < 0.03) { trace.push({ I: state.I.clone(), CB: state.CB.clone(), Ip: state.Ip.clone(), CBp: state.CBp.clone() }); if (trace.length > 3000) trace.shift(); }
  updatePanels();
  drawPad(); drawGothic();
}

// ---------- tweening & chew ----------
let anim = null;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
function tweenTo(target, ms = 650, then) {
  const from = { ...input };
  anim = { t0: performance.now(), ms, step(t) { const e = ease(t); apply({ p: from.p + (target.p - from.p) * e, lat: from.lat + (target.lat - from.lat) * e, open: from.open + (target.open - from.open) * e }); }, then };
}
// Chewing cycle (frontal tear-drop envelope): open slightly to the balancing side, swing to the working side, close into a lateral position, glide back to centric.
function chewKeys(W) {
  return [[0, 0, 0, 0], [0.18, -W * 0.8, 0.6, 0.5], [0.42, W * 3.6, 1.0, 0.32], [0.62, W * 3.4, 0.4, 0.04], [0.72, W * 3.0, 0.2, 0], [0.86, W * 1.4, 0.05, 0], [1, 0, 0, 0]];
}
function startChew() {
  const seq = [-1, -1, 1, 1];
  let i = 0;
  const one = () => {
    if (i >= seq.length) { anim = null; setMove('centric'); return; }
    const keys = chewKeys(seq[i++]);
    anim = { t0: performance.now(), ms: 1500, chew: true, step(t) {
      let a = keys[0], b = keys[keys.length - 1];
      for (let k = 1; k < keys.length; k++) if (t <= keys[k][0]) { a = keys[k - 1]; b = keys[k]; break; }
      const u = ease((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      apply({ lat: a[1] + (b[1] - a[1]) * u, p: a[2] + (b[2] - a[2]) * u, open: a[3] + (b[3] - a[3]) * u });
    }, then: one };
  };
  one();
}

const GO = { centric: { p: 0, lat: 0, open: 0 }, protrusive: { p: 3, lat: 0, open: 0 }, right: { p: 0, lat: -3.5, open: 0 }, left: { p: 0, lat: 3.5, open: 0 }, open: { p: 0, lat: 0, open: 0.85 } };
function setMove(name) { document.querySelectorAll('#moves button').forEach((b) => b.classList.toggle('on', b.dataset.go === name)); }
document.querySelectorAll('#moves button').forEach((b) => b.addEventListener('click', () => {
  setMove(b.dataset.go);
  if (b.dataset.go === 'chew') { startChew(); toast('Chewing cycle: two strokes on the right, two on the left'); return; }
  tweenTo(GO[b.dataset.go]);
}));

// ---------- drag pad ----------
function fitCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  const w = Math.max(60, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, w, h };
}
const pad = $('pad');
const PAD = { latMax: 6, pMax: 5 };
function padMap() { const r = pad.getBoundingClientRect(), w = r.width, h = r.height; return { w, h, cx: w / 2, cy: h - 20, sx: (w / 2 - 14) / PAD.latMax, sy: (h - 40) / PAD.pMax }; }
function drawPad() {
  const { c } = fitCanvas(pad);
  const { w, h, cx, cy, sx, sy } = padMap();
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(34,29,31,0.13)';
  for (let x = 6; x < w; x += 10) for (let y = 6; y < h; y += 10) { c.beginPath(); c.arc(x, y, 1, 0, 7); c.fill(); }
  c.strokeStyle = '#221d1f'; c.lineWidth = 2; c.setLineDash([5, 5]);
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, 18); c.moveTo(cx, cy); c.lineTo(14, cy); c.moveTo(cx, cy); c.lineTo(w - 14, cy); c.stroke(); c.setLineDash([]);
  c.font = '700 10.5px Inter, system-ui, sans-serif'; c.fillStyle = '#6f6466'; c.textAlign = 'center';
  c.fillText('protrusive ↑', cx, 12);
  c.textAlign = 'left'; c.fillText('Pt R', 5, cy + 14); c.textAlign = 'right'; c.fillText('Pt L', w - 5, cy + 14);
  c.textAlign = 'center'; c.fillText('CR', cx, cy + 14);
  const px = cx + input.lat * sx, py = cy - input.p * sy;
  c.strokeStyle = '#f07ab3'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, py); c.stroke();
  c.fillStyle = '#f3c138'; c.lineWidth = 2; c.strokeStyle = '#221d1f'; c.beginPath(); c.arc(px, py, 7, 0, 7); c.fill(); c.stroke();
}
function padEvent(e) {
  const r = pad.getBoundingClientRect(), { cx, cy, sx, sy } = padMap();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const lat = THREE.MathUtils.clamp((x - cx) / sx, -PAD.latMax, PAD.latMax), p = THREE.MathUtils.clamp((cy - y) / sy, 0, PAD.pMax);
  anim = null; setMove(''); apply({ lat, p, open: 0 });
}
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); ui.drag = true; padEvent(e); });
pad.addEventListener('pointermove', (e) => { if (ui.drag) padEvent(e); });
pad.addEventListener('pointerup', () => (ui.drag = false));
pad.addEventListener('pointercancel', () => (ui.drag = false));

// ---------- Gothic arch tracing ----------
const goth = $('gothic');
let refPaths = null, refTimer = 0;
function computeRef() {
  const P = []; const lines = [];
  for (const [lat, p] of [[-1, 0], [1, 0], [0, 1]]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; pts.push(engine.points({ lat: lat * k * 5.5, p: p * k * 4.5 })); }
    lines.push(pts);
  }
  void P; refPaths = lines; drawGothic();
}
function scheduleRef() { clearTimeout(refTimer); refTimer = setTimeout(computeRef, 120); }
function gPoint(q) {
  const key = ui.plate ? (ui.point === 'I' ? 'Ip' : 'CBp') : ui.point;
  const base = ui.point === 'I' ? engine.I0 : engine.CB0;
  return { x: q[key].x - base.x, z: q[key].z - base.z };
}
function drawGothic() {
  const { c, w, h } = fitCanvas(goth);
  c.clearRect(0, 0, w, h);
  const s = w / 12, cx = w / 2, cy = ui.plate ? 24 : h - 24; // s = px per mm
  const X = (d) => cx + d.x * s, Y = (d) => cy - d.z * s;
  c.fillStyle = 'rgba(34,29,31,0.13)';
  for (let x = 4; x < w; x += 7) for (let y = 4; y < h; y += 7) { c.beginPath(); c.arc(x, y, 0.8, 0, 7); c.fill(); }
  c.strokeStyle = 'rgba(34,29,31,0.16)'; c.lineWidth = 1;
  for (let mm = -6; mm <= 6; mm++) { c.beginPath(); c.moveTo(cx + mm * s, 0); c.lineTo(cx + mm * s, h); c.stroke(); }
  if (refPaths) {
    c.strokeStyle = '#221d1f'; c.lineWidth = 1.5; c.setLineDash([4, 4]);
    for (const line of refPaths) { c.beginPath(); line.forEach((q, i) => { const d = gPoint(q); i ? c.lineTo(X(d), Y(d)) : c.moveTo(X(d), Y(d)); }); c.stroke(); }
    c.setLineDash([]);
  }
  if (trace.length > 1) {
    c.strokeStyle = '#f07ab3'; c.lineWidth = 3.2; c.lineJoin = c.lineCap = 'round';
    c.beginPath(); trace.forEach((q, i) => { const d = gPoint(q); i ? c.lineTo(X(d), Y(d)) : c.moveTo(X(d), Y(d)); }); c.stroke();
  }
  c.fillStyle = '#221d1f'; c.beginPath(); c.arc(cx, cy, 3.5, 0, 7); c.fill();
  c.font = '800 10.5px Inter, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('CR', cx + 6, cy + (ui.plate ? -4 : 12));
  if (state) { const d = gPoint(state); c.fillStyle = '#f3c138'; c.strokeStyle = '#221d1f'; c.lineWidth = 2; c.beginPath(); c.arc(X(d), Y(d), 6, 0, 7); c.fill(); c.stroke(); }
  c.font = '700 10.5px Inter, system-ui, sans-serif'; c.fillStyle = '#6f6466';
  c.textAlign = 'left'; c.fillText('Pt R', 5, h / 2); c.textAlign = 'right'; c.fillText('Pt L', w - 5, h / 2);
  c.textAlign = 'center'; c.fillText(ui.plate ? 'plate on lower · ant ↑' : 'point path · ant ↑', cx, ui.plate ? h - 6 : 12);
  c.textAlign = 'right'; c.fillText('1 mm', w - 6, ui.plate ? h - 18 : 27);
  c.strokeStyle = '#6f6466'; c.lineWidth = 2; const by = ui.plate ? h - 14 : 31; c.beginPath(); c.moveTo(w - 6 - s, by); c.lineTo(w - 6, by); c.stroke();
}
document.querySelectorAll('#traceOpts [data-pt]').forEach((b) => b.addEventListener('click', () => {
  ui.point = b.dataset.pt; document.querySelectorAll('#traceOpts [data-pt]').forEach((x) => x.classList.toggle('on', x === b));
  $('gothicCap').textContent = `Gothic arch · ${ui.point === 'I' ? 'incisal point' : 'central bearing pt'}`; drawGothic();
}));
$('flipTrace').addEventListener('click', () => { ui.plate = !ui.plate; $('flipTrace').classList.toggle('on', ui.plate); $('flipTrace').classList.toggle('ghost', !ui.plate); drawGothic(); toast(ui.plate ? 'Stylus on the maxilla, plate on the mandible: apex points forward' : 'Path of the mandibular point: apex (CR) points back'); });
$('clearTrace').addEventListener('click', () => { trace.length = 0; drawGothic(); });

// ---------- panels ----------
const ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' };
function updatePanels() {
  const a = state.analysis;
  const badge = $('badge'); badge.textContent = a.title; badge.className = 'badge' + (a.flags ? ' bad' : a.movement === 'centric' ? '' : ' ok');
  const tags = a.rules.filter((r) => r.cls !== 'info').map((r) => `<span class="tag ${r.cls}">${r.t}</span>`).join('');
  const lat = state.I.x - engine.I0.x, pro = state.I.z - engine.I0.z;
  $('verdict').innerHTML = `<h3>${a.title}</h3>${tags}<p>Incisal point: ${Math.abs(lat).toFixed(1)} mm ${lat < -0.05 ? 'right' : lat > 0.05 ? 'left' : ''} · ${pro.toFixed(1)} mm forward · ${(engine.I0.y - state.I.y).toFixed(1)} mm down${state.lifted ? ` · pin lifted ${state.pinLift.toFixed(2)} mm` : ''}</p>`;
  $('rules').innerHTML = a.rules.map((r) => `<li class="${r.cls}"><span class="ic">${ICON[r.cls]}</span><div><b>${r.t}</b><p>${r.p}</p></div></li>`).join('');
  // dental chart
  const touching = new Set([...engine.contactTeeth.lower, ...engine.contactTeeth.upper].map((t) => t.fdi));
  const over = new Set(); model.teeth.lower.forEach((t, i) => { if (engine.toothRawLow[i] < -0.05) over.add(t.fdi); });
  const cls = (f) => (over.has(f) ? 'o' : touching.has(f) ? (a.movement === 'centric' ? 'c' : 'e') : '');
  const row = (q1, q2) => [7, 6, 5, 4, 3, 2, 1].map((k) => q1 + k).concat([1, 2, 3, 4, 5, 6, 7].map((k) => q2 + k));
  $('chart').innerHTML = row(10, 20).map((f) => `<div class="t ${cls(f)}">${f}</div>`).join('') + '<div class="mid"></div>' + row(40, 30).map((f) => `<div class="t ${cls(f)}">${f}</div>`).join('');
  const m = model.metrics;
  $('stats').innerHTML = `Model: overbite <b>${m.overbite} mm</b>, overjet <b>${m.overjet} mm</b>, canine overlap <b>${m.canineOverlap} mm</b>, Class I molar and canine. Contact = gap under <b>${Math.round(engine.params.paper * 1000)} µm</b>.`;
}

// ---------- settings ----------
function bindSlider(id, out, fmt, key, scale = 1) {
  const el = $(id);
  el.addEventListener('input', () => {
    engine.params[key] = +el.value * scale; $(out).textContent = fmt(+el.value);
    updateArticulatorSettings(art, engine.params);
    if (key === 'paper') { captureCentric(); }
    apply(input, { noTrace: true }); scheduleRef();
  });
}
bindSlider('cond', 'condOut', (v) => `${v}°`, 'condylar');
bindSlider('ben', 'benOut', (v) => `${v}°`, 'bennett');
bindSlider('inc', 'incOut', (v) => `${v}°`, 'incisal');
bindSlider('paper', 'paperOut', (v) => `${v} µm`, 'paper', 0.001);
$('teethGuide').addEventListener('change', (e) => { engine.params.teethGuide = e.target.checked; apply(input, { noTrace: true }); scheduleRef(); });
$('showCentric').addEventListener('change', (e) => { ui.showCentric = e.target.checked; paint(state); });
$('keepMarks').addEventListener('change', (e) => { ui.keepMarks = e.target.checked; if (!ui.keepMarks) clearMarks(); });
$('showPins').addEventListener('change', (e) => { ui.pins = e.target.checked; paint(state); });
$('showHalo').addEventListener('change', (e) => { ui.halo = e.target.checked; paint(state); });
$('showFrame').addEventListener('change', (e) => { art.frameU.visible = art.frameL.visible = e.target.checked; });
function clearMarks() { trail.lower.fill(0); trail.upper.fill(0); paint(state); }
$('clearMarks').addEventListener('click', () => { clearMarks(); toast('Excursive marks wiped'); });
const PRESETS = { average: { cond: 30, ben: 15, inc: 10, guide: true }, flat: { cond: 5, ben: 15, inc: 0, guide: false }, steep: { cond: 50, ben: 10, inc: 10, guide: true } };
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = PRESETS[b.dataset.preset];
  setParams({ condylar: p.cond, bennett: p.ben, incisal: p.inc, teethGuide: p.guide });
  toast(b.dataset.preset === 'flat' ? 'Flat paths, table guided: try R lateral to see the overlaps' : 'Articulator updated');
}));
function setParams(p) {
  Object.assign(engine.params, p);
  $('cond').value = engine.params.condylar; $('condOut').textContent = `${engine.params.condylar}°`;
  $('ben').value = engine.params.bennett; $('benOut').textContent = `${engine.params.bennett}°`;
  $('inc').value = engine.params.incisal; $('incOut').textContent = `${engine.params.incisal}°`;
  $('paper').value = Math.round(engine.params.paper * 1000); $('paperOut').textContent = `${Math.round(engine.params.paper * 1000)} µm`;
  $('teethGuide').checked = engine.params.teethGuide;
  updateArticulatorSettings(art, engine.params);
  if ('paper' in p) captureCentric();
  apply(input, { noTrace: true }); scheduleRef();
}

// tabs, views, toast
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
}));
let camAnim = null;
function setView(name, instant = false) {
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  ui.view = name; document.body.classList.toggle('marks', name === 'marks'); controls.enabled = name !== 'marks';
  if (name === 'marks') return;
  const v = VIEWS[name];
  const fit = window.innerWidth <= 820 ? 1.18 : 1;
  const to = new THREE.Vector3(...v.target).add(new THREE.Vector3(...v.pos).sub(new THREE.Vector3(...v.target)).multiplyScalar(fit));
  if (instant) { camera.position.copy(to); controls.target.set(...v.target); controls.update(); return; }
  camAnim = { t0: performance.now(), fromP: camera.position.clone(), fromT: controls.target.clone(), toP: to, toT: new THREE.Vector3(...v.target) };
}
document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

// ---------- resize & loop ----------
function marksRect(r) { const phone = window.innerWidth <= 820, top = phone ? 96 : 84, bot = phone ? 44 : 72, side = phone ? 30 : 110; return { x: side, y: bot, w: r.width - 2 * side, h: r.height - top - bot }; }
function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  renderer.domElement.style.width = r.width + 'px'; renderer.domElement.style.height = r.height + 'px';
  camera.aspect = r.width / r.height;
  // keep the articulator clear of the paper-marks card: desktop card sits bottom-left, phone card top-right
  if (window.innerWidth <= 820) camera.setViewOffset(r.width, r.height, Math.min(56, r.width * 0.14), -14, r.width, r.height);
  else camera.setViewOffset(r.width, r.height, -Math.min(80, r.width * 0.07), 0, r.width, r.height);
  camera.updateProjectionMatrix();
  // fit the map cameras to the card and to the full stage
  const mv = $('mapview').getBoundingClientRect(); fitMapCam(mapCam, mv.width, mv.height, 2);
  const mr = marksRect(r); fitMapCam(marksCam, mr.w, mr.h, 3);
}
window.addEventListener('resize', () => { resize(); drawPad(); drawGothic(); });

function frame(now) {
  requestAnimationFrame(frame);
  if (anim) { const t = Math.min(1, (now - anim.t0) / anim.ms); const a = anim; a.step(t); if (t >= 1 && anim === a) { anim = null; a.then && a.then(); } }
  if (camAnim) { const t = Math.min(1, (now - camAnim.t0) / 700), e = ease(t); camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e); controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e); if (t >= 1) camAnim = null; }
  controls.update();
  const W = renderer.domElement.width, H = renderer.domElement.height, dpr = renderer.getPixelRatio();
  outlineUniforms.uRes.value.set(W, H);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W / dpr, H / dpr);
  if (ui.view === 'marks') {
    const mr = marksRect(stage.getBoundingClientRect());
    renderer.setViewport(mr.x, mr.y, mr.w, mr.h); outlineUniforms.uRes.value.set(mr.w * dpr, mr.h * dpr);
    renderer.render(mapScene, marksCam); return;
  }
  renderer.render(scene, camera);
  // map inset rendered into the card's rectangle via scissor (the card sits over the canvas)
  const sr = stage.getBoundingClientRect(), mv = $('mapview').getBoundingClientRect();
  const x = mv.left - sr.left, y = sr.bottom - mv.bottom;
  if (mv.width > 10 && x + mv.width <= sr.width + 1 && y >= -1) {
    outlineUniforms.uRes.value.set(mv.width * dpr, mv.height * dpr);
    renderer.setScissorTest(true); renderer.setScissor(x, y, mv.width, mv.height); renderer.setViewport(x, y, mv.width, mv.height);
    renderer.setClearColor(0xf8f2e9, 1); renderer.clear();
    renderer.render(mapScene, mapCam);
    renderer.setClearColor(0x000000, 0); renderer.setScissorTest(false);
  }
}

// ---------- boot ----------
updateArticulatorSettings(art, engine.params);
captureCentric();
resize();
setView('three', true);
apply({ p: 0, lat: 0, open: 0 });
computeRef();
requestAnimationFrame(frame);

// Debug / test hooks
window.__ol = {
  model, engine, metrics: model.metrics,
  pose: (inp, opts) => { anim = null; setMove(''); apply({ ...input, ...inp }, opts); return window.__ol.summary(); },
  go: (name) => { anim = null; if (name === 'chew') { startChew(); return 'chewing'; } setMove(name); apply(GO[name]); return window.__ol.summary(); },
  setParams: (p) => { setParams(p); return { ...engine.params }; },
  view: (name) => setView(name, true),
  tab: (name) => document.querySelector(`#tabs [data-tab="${name}"]`).click(),
  clearMarks, clearTrace: () => { trace.length = 0; drawGothic(); },
  summary: () => ({ input: { ...input }, title: state.analysis.title, movement: state.analysis.movement, flags: state.analysis.flags,
    lifted: state.lifted, pinLift: +state.pinLift.toFixed(3), lowerContacts: engine.contactTeeth.lower.map((t) => t.fdi), upperContacts: engine.contactTeeth.upper.map((t) => t.fdi),
    incisal: { dx: +(state.I.x - engine.I0.x).toFixed(2), dz: +(state.I.z - engine.I0.z).toFixed(2), dy: +(state.I.y - engine.I0.y).toFixed(2) }, rules: state.analysis.rules.map((r) => `${r.cls}: ${r.t}`) }),
  get busy() { return !!anim; },
};

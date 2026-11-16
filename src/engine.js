// Articulator kinematics + occlusal contact engine.
import * as THREE from 'three';
import { toothGroup } from './teeth.js';

const D2R = Math.PI / 180;
export const CONDYLE = { x: 50, y: 22, z: -82 };

export class Engine {
  constructor(model) {
    this.model = model;
    this.params = { condylar: 30, bennett: 15, incisal: 10, paper: 0.1, teethGuide: true };
    this.Cr0 = new THREE.Vector3(-CONDYLE.x, CONDYLE.y, CONDYLE.z);
    this.Cl0 = new THREE.Vector3(CONDYLE.x, CONDYLE.y, CONDYLE.z);
    this.D = this.Cl0.distanceTo(this.Cr0);
    this.I0 = model.incisalPoint.clone();
    this.CB0 = new THREE.Vector3(0, -0.5, -24); // central bearing point (mid-arch, occlusal plane)
    const lo = model.arches.lower, up = model.arches.upper;
    this.lowPos = lo.geometry.attributes.position.array; this.upPos = up.geometry.attributes.position.array;
    this.lowTop = lo.top; this.upTop = up.top;
    const ny = (geo, top) => { const n = geo.attributes.normal.array, out = new Float32Array(top.length); top.forEach((v, i) => (out[i] = Math.max(0.3, Math.abs(n[v * 3 + 1])))); return out; };
    this.lowNy = ny(lo.geometry, lo.top); this.upNy = ny(up.geometry, up.top);
    this.gapLow = new Float32Array(lo.geometry.attributes.position.count).fill(99);
    this.gapUp = new Float32Array(up.geometry.attributes.position.count).fill(99);
    this.M = new THREE.Matrix4(); this.Minv = new THREE.Matrix4();
    this.state = null;
  }

  // Condyle positions for an excursion input {p, lat, open}. lat > 0: mandible moves to the patient's LEFT.
  condyles(input) {
    const { condylar, bennett } = this.params;
    const ta = Math.tan(condylar * D2R), tb = Math.tan(bennett * D2R);
    const p = Math.max(0, input.p || 0) + (input.open || 0) * 6;
    const dP = new THREE.Vector3(0, -ta, 1).normalize();
    const Cr = this.Cr0.clone().addScaledVector(dP, p), Cl = this.Cl0.clone().addScaledVector(dP, p);
    const lat = input.lat || 0;
    let shift = 0;
    if (Math.abs(lat) > 1e-6) {
      const toLeft = lat > 0;
      const orb = toLeft ? Cr : Cl, work = toLeft ? Cl : Cr;
      const medial = toLeft ? 1 : -1; // right condyle moves medially toward +x
      orb.addScaledVector(new THREE.Vector3(medial * tb, -ta, 1).normalize(), Math.abs(lat));
      const e = new THREE.Vector3(toLeft ? 1 : -1, 0, 0); // working condyle laterotrusion (outward)
      const v = work.clone().sub(orb), ve = v.dot(e);
      const disc = ve * ve - v.lengthSq() + this.D * this.D;
      shift = -ve + Math.sqrt(Math.max(0, disc));
      work.addScaledVector(e, shift);
    }
    return { Cr, Cl, shift };
  }

  matrix(c, theta, out = new THREE.Matrix4()) {
    const u0 = new THREE.Vector3(1, 0, 0), u1 = c.Cl.clone().sub(c.Cr).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(u0, u1);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(u1, theta));
    out.makeRotationFromQuaternion(q);
    const t = this.Cr0.clone().applyMatrix4(out);
    out.setPosition(c.Cr.x - t.x, c.Cr.y - t.y, c.Cr.z - t.z);
    return out;
  }

  // Theta at which the incisal point follows the incisal guide table.
  tableTheta(c) {
    const tg = Math.tan(this.params.incisal * D2R), I = new THREE.Vector3(), M = new THREE.Matrix4();
    const f = (th) => { this.matrix(c, th, M); I.copy(this.I0).applyMatrix4(M); const h = Math.hypot(I.x - this.I0.x, I.z - this.I0.z); return I.y - (this.I0.y - h * tg); };
    let lo = -0.35, hi = 0.6;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  minLowerGap(M) {
    const e = M.elements, P = this.lowPos, U = this.model.U; let g = Infinity;
    for (const v of this.lowTop) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const d = U.sample(wx, wz) - wy;
      if (d < g) g = d;
    }
    return g;
  }

  solve(input) {
    const c = this.condyles(input);
    const thT = this.tableTheta(c);
    let th = thT, lifted = false;
    const M = new THREE.Matrix4();
    const open = input.open || 0;
    if (this.params.teethGuide && open < 0.02) {
      const tol = -0.015;
      if (this.minLowerGap(this.matrix(c, th, M)) < tol) {
        let lo = th, hi = th + 0.08;
        while (this.minLowerGap(this.matrix(c, hi, M)) < tol && hi < th + 0.6) hi += 0.08;
        for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (this.minLowerGap(this.matrix(c, mid, M)) < tol) lo = mid; else hi = mid; }
        th = hi; lifted = true;
      }
    }
    th += open * 0.42;
    this.matrix(c, th, this.M);
    this.Minv.copy(this.M).invert();
    const I = this.I0.clone().applyMatrix4(this.M);
    const CB = this.CB0.clone().applyMatrix4(this.M);
    // stylus fixed on the maxilla, as seen on a plate carried by the mandible
    const Ip = this.I0.clone().applyMatrix4(this.Minv), CBp = this.CB0.clone().applyMatrix4(this.Minv);
    this.computeGaps();
    const s = { input: { ...input }, theta: th, thetaTable: thT, lifted, condyles: c, I, CB, Ip, CBp,
      pinLift: this.pinLift(c, th, thT) };
    s.analysis = this.classify(s);
    this.state = s;
    return s;
  }

  // Path points only (no contact painting): used for the reference Gothic arch.
  points(input) {
    const c = this.condyles(input); const thT = this.tableTheta(c); let th = thT; const M = new THREE.Matrix4();
    if (this.params.teethGuide && this.minLowerGap(this.matrix(c, th, M)) < -0.015) {
      let lo = th, hi = th + 0.08;
      while (this.minLowerGap(this.matrix(c, hi, M)) < -0.015 && hi < th + 0.6) hi += 0.08;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (this.minLowerGap(this.matrix(c, mid, M)) < -0.015) lo = mid; else hi = mid; }
      th = hi;
    }
    this.matrix(c, th, M); const Mi = M.clone().invert();
    return { I: this.I0.clone().applyMatrix4(M), CB: this.CB0.clone().applyMatrix4(M), Ip: this.I0.clone().applyMatrix4(Mi), CBp: this.CB0.clone().applyMatrix4(Mi) };
  }

  pinLift(c, th, thT) { // vertical separation at the incisal point between tooth-guided path and table
    const a = this.I0.clone().applyMatrix4(this.matrix(c, thT)), b = this.I0.clone().applyMatrix4(this.matrix(c, th));
    return Math.max(0, a.y - b.y);
  }

  computeGaps() {
    const e = this.M.elements, P = this.lowPos, U = this.model.U, L = this.model.L;
    const teeth = this.model.teeth;
    this.toothMinLow = new Float32Array(14).fill(99); this.toothMinUp = new Float32Array(14).fill(99);
    this.toothRawLow = new Float32Array(14).fill(99);
    const tl = this.model.arches.lower.tooth, tu = this.model.arches.upper.tooth;
    this.lowTop.forEach((v, i) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const raw = U.sample(wx, wz) - wy;
      const g = raw > 0 ? raw * this.lowNy[i] : raw;
      this.gapLow[v] = g;
      const t = tl[v];
      if (g < this.toothMinLow[t]) this.toothMinLow[t] = g;
      if (raw < this.toothRawLow[t]) this.toothRawLow[t] = raw;
    });
    const f = this.Minv.elements, Q = this.upPos;
    this.upTop.forEach((v, i) => {
      const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2];
      const lx = f[0] * x + f[4] * y + f[8] * z + f[12], ly = f[1] * x + f[5] * y + f[9] * z + f[13], lz = f[2] * x + f[6] * y + f[10] * z + f[14];
      const raw = ly - L.sample(lx, lz);
      const g = raw > 0 ? raw * this.upNy[i] : raw;
      this.gapUp[v] = g;
      const t = tu[v];
      if (g < this.toothMinUp[t]) this.toothMinUp[t] = g;
    });
    this.contactTeeth = { lower: [], upper: [] };
    const thr = this.params.paper;
    teeth.lower.forEach((t, i) => { if (this.toothMinLow[i] < thr) this.contactTeeth.lower.push(t); });
    teeth.upper.forEach((t, i) => { if (this.toothMinUp[i] < thr) this.contactTeeth.upper.push(t); });
  }

  classify(s) {
    const I = s.I, dx = I.x - this.I0.x, dz = I.z - this.I0.z;
    const all = [...this.contactTeeth.lower, ...this.contactTeeth.upper];
    const has = (side, groups) => all.some((t) => (side === 0 || t.side === side) && groups.includes(toothGroup(t.k)));
    const list = (side, groups) => [...new Set(all.filter((t) => (side === 0 || t.side === side) && groups.includes(toothGroup(t.k))).map((t) => t.fdi))].sort((a, b) => a - b);
    const post = ['premolar', 'molar'];
    const minPost = (side) => { let g = 99; this.model.teeth.lower.forEach((t, i) => { if ((side === 0 || t.side === side) && t.k >= 4) g = Math.min(g, this.toothMinLow[i]); }); return g; };
    const out = { movement: 'centric', title: '', rules: [], dx, dz, contacts: all.length, flags: 0 };
    const pen = Math.min(...this.toothRawLow);
    if ((s.input.open || 0) > 0.03) {
      out.movement = 'open'; out.title = 'Open — no contacts';
      out.rules.push({ cls: 'info', t: 'Mouth open', p: 'Hinge rotation with condylar translation. Teeth apart.' });
      return out;
    }
    if (Math.abs(dx) < 0.35 && dz < 0.35) {
      out.movement = 'centric';
      const nPost = list(0, post).length, nAnt = list(0, ['incisor', 'canine']).length;
      out.title = `Centric · ${list(0, ['incisor', 'canine', 'premolar', 'molar']).length} teeth marking`;
      out.rules.push({ cls: nPost >= 12 ? 'pass' : 'warn', t: `Posterior stops: ${nPost} teeth`, p: 'Simultaneous, bilateral posterior contacts in maximum intercuspation (MIP).' });
      out.rules.push({ cls: 'info', t: `Anterior teeth marking: ${nAnt}`, p: 'Anteriors seated to light contact in MIP in this model.' });
      return out;
    }
    if (Math.abs(dx) >= Math.max(0.6, 0.6 * dz)) {
      const W = dx < 0 ? -1 : 1, NW = -W;
      const sideName = W < 0 ? 'Right' : 'Left';
      out.movement = W < 0 ? 'right' : 'left';
      const can = has(W, ['canine']), wPost = list(W, post), nwPost = list(NW, post), wInc = has(W, ['incisor']);
      const wColl = this.model.teeth.lower.filter((t, i) => t.side === W && t.k >= 4 && this.toothRawLow[i] < -0.05).map((t) => t.fdi);
      let guide;
      if (wColl.length) { guide = 'Working-side interference'; out.flags++; out.rules.push({ cls: 'fail', t: 'Working-side interference', p: `Posterior teeth ${wColl.join(', ')} collide on the working side.` }); }
      else if (can && !wPost.length) { guide = 'Canine guidance'; out.rules.push({ cls: 'pass', t: 'Canine guidance', p: `Working-side canines (${list(W, ['canine']).join(', ')}) disclude the posterior teeth.` }); }
      else if (can && wPost.length) { guide = 'Group function'; out.rules.push({ cls: 'pass', t: 'Group function', p: `Canine shares the load with working-side posteriors: ${wPost.join(', ')}.` }); }
      else if (wPost.length) { guide = 'Working-side interference'; out.flags++; out.rules.push({ cls: 'fail', t: 'Working-side interference', p: `Posterior teeth ${wPost.join(', ')} guide without the canine.` }); }
      else if (wInc) { guide = 'Incisor guidance'; out.rules.push({ cls: 'info', t: 'Lateral incisors guiding', p: 'Only incisors touch on the working side.' }); }
      else { guide = 'Table guiding'; out.rules.push({ cls: 'info', t: 'No working-side tooth contact', p: 'The incisal guide table is steeper than the teeth, so it carries the movement.' }); }
      if (nwPost.length) { out.flags++; out.rules.push({ cls: 'fail', t: 'Non-working (balancing) interference', p: `Teeth ${nwPost.join(', ')} touch on the non-working side.` }); }
      else out.rules.push({ cls: 'pass', t: 'No non-working contacts', p: `Balancing side clears by ${minPost(NW).toFixed(2)} mm.` });
      out.title = `${sideName} lateral · ${guide}`;
      out.guide = guide;
    } else {
      out.movement = 'protrusive';
      const pPost = list(0, post), ant = list(0, ['incisor', 'canine']);
      if (pPost.length) { out.flags++; out.title = 'Protrusive · posterior interference'; out.rules.push({ cls: 'fail', t: 'Protrusive posterior interference', p: `Posterior teeth ${pPost.join(', ')} touch in protrusion.` }); }
      else { out.title = 'Protrusive · anterior guidance'; out.rules.push({ cls: 'pass', t: 'Anterior guidance', p: ant.length ? `Incisors ${ant.join(', ')} guide; posteriors clear by ${minPost(0).toFixed(2)} mm.` : `Posteriors clear by ${minPost(0).toFixed(2)} mm.` }); }
    }
    if (s.lifted) out.rules.push({ cls: 'info', t: `Incisal pin lifted ${s.pinLift.toFixed(2)} mm`, p: 'Teeth, not the guide table, are steering the mandible here.' });
    else out.rules.push({ cls: 'info', t: 'Incisal pin on the table', p: 'The guide table and condylar paths are steering the mandible.' });
    if (pen < -0.05) out.rules.push({ cls: 'fail', t: `Teeth overlap ${(-pen).toFixed(2)} mm`, p: 'Table-guided mode lets teeth pass through each other: this is how much a cusp would need reducing.' });
    return out;
  }
}

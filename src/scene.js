// Toon materials, ink outlines, casts and a stylised arcon articulator frame.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONDYLE } from './engine.js';

const grad = (() => {
  const d = new Uint8Array([105, 105, 105, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

export const outlineUniforms = { uRes: { value: new THREE.Vector2(1, 1) } };
export function outlineMaterial(widthPx = 2) {
  return new THREE.ShaderMaterial({
    uniforms: { uRes: outlineUniforms.uRes, uWidth: { value: widthPx }, uColor: { value: new THREE.Color('#221d1f') } },
    vertexShader: `uniform vec2 uRes; uniform float uWidth;
      void main(){
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec4 cn = projectionMatrix * vec4(n, 0.0);
        vec2 dir = cn.xy; float l = length(dir); dir = l > 1e-5 ? dir / l : vec2(0.0);
        clip.xy += dir * uWidth * 2.0 * clip.w / uRes;
        gl_Position = clip;
      }`,
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
}
// Mesh + inverted-hull outline. Hard-edged geometry gets averaged normals for its hull.
export function inked(geometry, material, widthPx = 2, smooth = true) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  let hullGeo = geometry;
  if (!smooth) {
    const tmp = geometry.clone(); tmp.deleteAttribute('normal'); tmp.deleteAttribute('uv');
    hullGeo = mergeVertices(tmp, 1e-3); hullGeo.computeVertexNormals();
  }
  const hull = new THREE.Mesh(hullGeo, outlineMaterial(widthPx));
  g.add(mesh, hull); g.userData.mesh = mesh; g.userData.hull = hull;
  return g;
}

const C = { metal: '#bcb7c9', metalD: '#8f8aa0', stone: '#f6d886', gum: '#f2a2bf', pink: '#f07ab3', mustard: '#f3c138', sage: '#c9d3b0' };
export const COLORS = C;

function roundedSlab(w, d, h, r = 6) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); // extrude along +y
  return g;
}
const rod = (a, b, r) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 16, 1);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 0, 1));
  g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2); g.applyMatrix4(m); g.translate(a.x, a.y, a.z);
  return g;
};
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

// Build casts + frame. Returns { upper: Group (fixed), lower: Group (follows the mandible), housings, table }
export function buildArticulator(model, toothMat) {
  const upper = new THREE.Group(), lower = new THREE.Group();
  const teethU = inked(model.arches.upper.geometry, toothMat, 1.6);
  const teethL = inked(model.arches.lower.geometry, toothMat, 1.6);
  const gumMat = toon(C.gum), stoneMat = toon(C.stone), metalMat = toon(C.metal), pinkMat = toon(C.pink), mustardMat = toon(C.mustard), sageMat = toon(C.sage);
  const gumU = inked(model.gums.upper.geometry, gumMat, 2), gumL = inked(model.gums.lower.geometry, gumMat, 2);
  upper.add(teethU, gumU); lower.add(teethL, gumL);
  const frameU = new THREE.Group(), frameL = new THREE.Group();
  // stone bases
  const yLb = model.gums.lower.baseY, yUb = model.gums.upper.baseY;
  const slabL = roundedSlab(62, 74, 9); slabL.translate(0, yLb - 8, -27);
  const slabU = roundedSlab(62, 74, 9); slabU.translate(0, yUb - 1, -27);
  lower.add(inked(slabL, stoneMat, 2, false)); upper.add(inked(slabU, stoneMat, 2, false));
  // members
  const yLm = yLb - 14, yUm = yUb + 13;
  const zPin = 26, cz = CONDYLE.z, cx = CONDYLE.x, cy = CONDYLE.y;
  const plateL = roundedSlab(50, 70, 3, 8); plateL.translate(0, yLm, -22);
  const plateU = roundedSlab(50, 70, 3, 8); plateU.translate(0, yUm, -22);
  frameL.add(inked(plateL, metalMat, 2, false)); frameU.add(inked(plateU, metalMat, 2, false));
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  // lower: arm to the front table, cross bar, condylar posts, condyle balls
  frameL.add(inked(rod(v(0, yLm + 1.5, 10), v(0, yLm + 1.5, zPin + 2), 3.2), metalMat, 2));
  frameL.add(inked(rod(v(0, yLm + 1.5, -55), v(0, yLm + 1.5, cz), 3.4), metalMat, 2));
  frameL.add(inked(rod(v(-cx - 4, yLm + 1.5, cz), v(cx + 4, yLm + 1.5, cz), 3.4), metalMat, 2));
  for (const s of [-1, 1]) {
    frameL.add(inked(rod(v(s * cx, yLm + 1.5, cz), v(s * cx, cy - 4, cz), 2.6), metalMat, 2));
    const ball = new THREE.SphereGeometry(4.6, 24, 16); ball.translate(s * cx, cy, cz);
    frameL.add(inked(ball, pinkMat, 2.2));
  }
  // incisal guide table (tilts with the incisal guidance)
  const table = new THREE.Group(); table.position.set(0, -24, zPin);
  const tg = new THREE.Group();
  tg.add(inked(box(9, 2.4, 16, 0, -1.2, 0), mustardMat, 2, false));
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.add(inked(box(8, 2.4, 16, 4, -1.2, 0), mustardMat, 2, false)); wingR.add(inked(box(8, 2.4, 16, -4, -1.2, 0), mustardMat, 2, false));
  wingL.position.x = 4.5; wingR.position.x = -4.5;
  table.add(tg, wingL, wingR);
  frameL.add(inked(rod(v(0, yLm + 1.5, zPin), v(0, -27, zPin), 2.2), metalMat, 2));
  frameL.add(table);
  table.userData = { tg, wingL, wingR };
  // upper: arms, cross bar, posts to condylar housings, incisal pin
  frameU.add(inked(rod(v(0, yUm + 1.5, 10), v(0, yUm + 1.5, zPin + 2), 3.2), metalMat, 2));
  frameU.add(inked(rod(v(0, yUm + 1.5, -55), v(0, yUm + 1.5, cz), 3.4), metalMat, 2));
  frameU.add(inked(rod(v(-cx - 4, yUm + 1.5, cz), v(cx + 4, yUm + 1.5, cz), 3.4), metalMat, 2));
  const housings = [];
  for (const s of [-1, 1]) {
    frameU.add(inked(rod(v(s * cx, yUm + 1.5, cz), v(s * cx, cy + 9, cz), 2.6), metalMat, 2));
    const h = new THREE.Group(); h.position.set(s * cx, cy, cz); h.rotation.order = 'YXZ';
    h.add(inked(box(11, 3, 24, 0, 4.6 + 1.5, 7), sageMat, 2, false));               // guide roof (condylar path)
    h.add(inked(box(2.4, 9, 24, -s * (5.5 + 1.2), 1.6, 7), sageMat, 2, false));     // medial (Bennett) wall
    h.userData.side = s; housings.push(h); frameU.add(h);
  }
  const pinTop = v(0, yUm + 1.5, zPin), pinTip = v(0, -24, zPin);
  frameU.add(inked(rod(pinTop, pinTip.clone().add(v(0, 1.2, 0)), 1.5), toon(C.metalD), 1.6));
  const tip = new THREE.ConeGeometry(1.5, 2.4, 16); tip.rotateX(Math.PI); tip.translate(0, -24 + 1.2, zPin);
  frameU.add(inked(tip, toon(C.metalD), 1.6));
  upper.add(frameU); lower.add(frameL);
  return { upper, lower, frameU, frameL, housings, table, teethU, teethL, gumU, gumL };
}

export function updateArticulatorSettings(art, params) {
  const a = THREE.MathUtils.degToRad(params.condylar), b = THREE.MathUtils.degToRad(params.bennett), g = THREE.MathUtils.degToRad(params.incisal);
  for (const h of art.housings) { h.rotation.x = a; h.rotation.y = h.userData.side < 0 ? b : -b; }
  const { tg, wingL, wingR } = art.table.userData;
  tg.rotation.x = g; wingL.rotation.z = g; wingR.rotation.z = -g;
}

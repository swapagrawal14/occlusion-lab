// Rasterised height fields used for fast occlusal gap queries.
// 'min' field = lowest surface seen from below (maxillary teeth); 'max' = highest surface seen from above (mandibular teeth).
export class HeightField {
  constructor(mode, x0 = -36, x1 = 36, z0 = -64, z1 = 14, res = 0.1) {
    this.mode = mode; this.x0 = x0; this.z0 = z0; this.res = res;
    this.nx = Math.ceil((x1 - x0) / res) + 1; this.nz = Math.ceil((z1 - z0) / res) + 1;
    this.empty = mode === 'min' ? Infinity : -Infinity;
    this.data = new Float32Array(this.nx * this.nz).fill(this.empty);
  }
  clear() { this.data.fill(this.empty); }
  // Rasterise triangles. pos: flat xyz array, idx: indices. cb(cellIndex, y) optional for sparse use.
  raster(pos, idx, triFrom = 0, triTo = idx.length / 3, cb = null) {
    const { x0, z0, res, nx, nz, data } = this; const isMin = this.mode === 'min';
    for (let t = triFrom; t < triTo; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-7) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / res)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / res));
      const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / res)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / res));
      for (let j = j0; j <= j1; j++) {
        const z = z0 + j * res;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + i * res;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
          const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          const y = l1 * ay + l2 * by + l3 * cy;
          const k = j * nx + i;
          if (cb) { cb(k, y); continue; }
          if (isMin ? y < data[k] : y > data[k]) data[k] = y;
        }
      }
    }
  }
  // Bilinear sample; cells without surface are skipped (average of those present).
  sample(x, z) {
    const fx = (x - this.x0) / this.res, fz = (z - this.z0) / this.res;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.nz - 1) return this.empty;
    const tx = fx - i, tz = fz - j, d = this.data, k = j * this.nx + i;
    const v00 = d[k], v10 = d[k + 1], v01 = d[k + this.nx], v11 = d[k + this.nx + 1];
    if (Number.isFinite(v00) && Number.isFinite(v10) && Number.isFinite(v01) && Number.isFinite(v11))
      return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz;
    let s = 0, n = 0;
    for (const v of [v00, v10, v01, v11]) if (Number.isFinite(v)) { s += v; n++; }
    return n ? s / n : this.empty;
  }
}

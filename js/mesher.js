// Построение мешей чанков: отсечение скрытых граней, AO, затемнение повреждённых блоков.
import * as THREE from './lib/three.module.min.js';
import { BLOCKS, tileUV } from './blocks.js';
import { SX, SY, SZ, CHUNK, CX, CY, CZ } from './world.js';

// грани: нормаль, 4 угла (против часовой снаружи), индекс тайла (0 верх, 1 низ, 2 бок), яркость
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: 2, s: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: 2, s: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: 0, s: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: 1, s: 0.5 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: 2, s: 0.9 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: 2, s: 0.68 },
];
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

// предвычисленные смещения соседей для AO
for (const f of FACES) {
  f.ao = f.c.map(corner => {
    const axes = [0, 1, 2].filter(a => f.n[a] === 0);
    const off = [0, 0, 0];
    const s1 = f.n.slice(), s2 = f.n.slice(), cc = f.n.slice();
    const a0 = axes[0], a1 = axes[1];
    const d0 = corner[a0] ? 1 : -1, d1 = corner[a1] ? 1 : -1;
    s1[a0] += d0; s2[a1] += d1; cc[a0] += d0; cc[a1] += d1;
    void off;
    return [s1, s2, cc];
  });
}

// Буферы растут по необходимости
class Buf {
  constructor() { this.pos = new Float32Array(4096 * 3); this.uv = new Float32Array(4096 * 2); this.col = new Uint8Array(4096 * 3); this.idx = new Uint32Array(4096 * 1.5); this.v = 0; this.i = 0; }
  reset() { this.v = 0; this.i = 0; }
  ensure(nv) {
    if ((this.v + nv) * 3 > this.pos.length) {
      const grow = (a, k) => { const n = new a.constructor(a.length * 2); n.set(a); return n; };
      this.pos = grow(this.pos); this.uv = grow(this.uv); this.col = grow(this.col); this.idx = grow(this.idx);
    }
  }
}

export class Mesher {
  constructor(world, scene, atlasTexture) {
    this.world = world;
    this.scene = scene;
    this.opaqueMat = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true });
    this.glassMat = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.chunks = new Array(CX * CY * CZ).fill(null).map(() => ({ opaque: null, glass: null, dirty: true }));
    this.opaqueBuf = new Buf();
    this.glassBuf = new Buf();
    this.dirtyList = new Set();
    this.lamps = [];
  }
  cidx(cx, cy, cz) { return (cy * CZ + cz) * CX + cx; }

  markAllDirty() {
    for (let cy = 0; cy < CY; cy++) for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) this.dirtyList.add(this.cidx(cx, cy, cz));
  }
  markBlock(x, y, z) {
    const x0 = Math.floor((x - 1) / CHUNK), x1 = Math.floor((x + 1) / CHUNK);
    const y0 = Math.floor((y - 1) / CHUNK), y1 = Math.floor((y + 1) / CHUNK);
    const z0 = Math.floor((z - 1) / CHUNK), z1 = Math.floor((z + 1) / CHUNK);
    for (let cy = Math.max(0, y0); cy <= Math.min(CY - 1, y1); cy++)
      for (let cz = Math.max(0, z0); cz <= Math.min(CZ - 1, z1); cz++)
        for (let cx = Math.max(0, x0); cx <= Math.min(CX - 1, x1); cx++) this.dirtyList.add(this.cidx(cx, cy, cz));
  }

  // перестроить до maxCount грязных чанков (ближайшие к камере — первыми)
  update(maxCount, camPos) {
    if (!this.dirtyList.size) return;
    let list = [...this.dirtyList];
    if (camPos && list.length > maxCount) {
      const d = (i) => {
        const cx = i % CX, cz = Math.floor(i / CX) % CZ, cy = Math.floor(i / (CX * CZ));
        return Math.hypot((cx + 0.5) * CHUNK - camPos.x, (cy + 0.5) * CHUNK - camPos.y, (cz + 0.5) * CHUNK - camPos.z);
      };
      list.sort((a, b) => d(a) - d(b));
    }
    for (let k = 0; k < Math.min(maxCount, list.length); k++) {
      this.dirtyList.delete(list[k]);
      this.build(list[k]);
    }
  }
  rebuildAll() { this.markAllDirty(); this.update(Infinity); }

  build(ci) {
    const cx = ci % CX, cz = Math.floor(ci / CX) % CZ, cy = Math.floor(ci / (CX * CZ));
    const w = this.world, data = w.data, dmg = w.dmg;
    const ob = this.opaqueBuf, gb = this.glassBuf;
    ob.reset(); gb.reset();
    const X0 = cx * CHUNK, Y0 = cy * CHUNK, Z0 = cz * CHUNK;
    const X1 = Math.min(SX, X0 + CHUNK), Y1 = Math.min(SY, Y0 + CHUNK), Z1 = Math.min(SZ, Z0 + CHUNK);
    const getR = (x, y, z) => (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 || y >= SY) ? 0 : data[(y * SZ + z) * SX + x];
    const occ = (x, y, z) => { const id = getR(x, y, z); return id && !BLOCKS[id].glass ? 1 : 0; };

    for (let y = Y0; y < Y1; y++) for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
      const i = (y * SZ + z) * SX + x;
      const id = data[i];
      if (!id) continue;
      const def = BLOCKS[id];
      const isGlass = !!def.glass;
      const dk = 1 - (dmg[i] / 255) * 0.6;
      const glow = def.glow ? 1.25 : 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nid = getR(x + F.n[0], y + F.n[1], z + F.n[2]);
        if (nid) {
          const nd = BLOCKS[nid];
          if (!nd.glass) continue;           // сосед непрозрачный
          if (isGlass) continue;             // стекло к стеклу
        }
        if (y === 0 && F.n[1] === -1) continue;
        const buf = isGlass ? gb : ob;
        buf.ensure(4);
        const uv = tileUV(def.tiles[F.t]);
        const v0 = buf.v;
        const ao = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          const A = F.ao[k];
          let a = 3;
          if (!def.glow) {
            const s1 = occ(x + A[0][0], y + A[0][1], z + A[0][2]);
            const s2 = occ(x + A[1][0], y + A[1][1], z + A[1][2]);
            const cc = occ(x + A[2][0], y + A[2][1], z + A[2][2]);
            a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
          }
          ao[k] = a;
          const p = (buf.v) * 3;
          buf.pos[p] = x + c[0]; buf.pos[p + 1] = y + c[1]; buf.pos[p + 2] = z + c[2];
          const u = buf.v * 2;
          buf.uv[u] = (k === 0 || k === 3) ? uv[0] : uv[2];
          buf.uv[u + 1] = (k < 2) ? uv[1] : uv[3];
          const fct = F.s * AO_CURVE[a] * dk; // вершинные цвета линейные — возводим в квадрат
          const br = Math.min(255, Math.round(255 * fct * fct * glow));
          // небольшой тёплый оттенок сверху, холодный снизу
          buf.col[p] = Math.min(255, br * (F.n[1] > 0 ? 1.0 : 0.96));
          buf.col[p + 1] = br;
          buf.col[p + 2] = Math.min(255, br * (F.n[1] > 0 ? 0.94 : 1.04));
          buf.v++;
        }
        const ii = buf.i;
        if (ao[0] + ao[2] < ao[1] + ao[3]) {
          buf.idx[ii] = v0 + 1; buf.idx[ii + 1] = v0 + 2; buf.idx[ii + 2] = v0 + 3;
          buf.idx[ii + 3] = v0 + 1; buf.idx[ii + 4] = v0 + 3; buf.idx[ii + 5] = v0;
        } else {
          buf.idx[ii] = v0; buf.idx[ii + 1] = v0 + 1; buf.idx[ii + 2] = v0 + 2;
          buf.idx[ii + 3] = v0; buf.idx[ii + 4] = v0 + 2; buf.idx[ii + 5] = v0 + 3;
        }
        buf.i += 6;
      }
    }
    const ch = this.chunks[ci];
    ch.opaque = this.apply(ch.opaque, ob, this.opaqueMat, 0);
    ch.glass = this.apply(ch.glass, gb, this.glassMat, 1);
  }

  apply(mesh, buf, mat, order) {
    if (buf.i === 0) {
      if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      return null;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf.pos.slice(0, buf.v * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(buf.uv.slice(0, buf.v * 2), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(buf.col.slice(0, buf.v * 3), 3, true));
    geo.setIndex(new THREE.BufferAttribute(buf.v > 65535 ? buf.idx.slice(0, buf.i) : new Uint16Array(buf.idx.subarray(0, buf.i)), 1));
    geo.computeBoundingSphere();
    if (mesh) { mesh.geometry.dispose(); mesh.geometry = geo; return mesh; }
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  dispose() {
    for (const ch of this.chunks) {
      for (const k of ['opaque', 'glass']) if (ch[k]) { this.scene.remove(ch[k]); ch[k].geometry.dispose(); ch[k] = null; }
    }
    this.dirtyList.clear();
  }
}

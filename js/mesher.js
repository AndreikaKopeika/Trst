// Построение мешей чанков: отсечение скрытых граней, AO, затемнение повреждённых блоков.
import * as THREE from './lib/three.module.min.js';
import { BLOCKS, tileUV, T } from './blocks.js';
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
// при солнечном освещении грани и так разной яркости — оставляем лишь лёгкий намёк
const LIT_S = [0.97, 0.97, 1.0, 0.9, 0.97, 0.97];
const PD = CHUNK + 2;
const CHUNK_SPHERE = new THREE.Sphere(new THREE.Vector3(CHUNK / 2, CHUNK / 2, CHUNK / 2), CHUNK * 0.87); // сторона копии чанка с рамкой
// таблицы по id блока: непрозрачный / стекло / светится, UV каждой грани
const OPQ = new Uint8Array(256), GLS = new Uint8Array(256), GLOW = new Uint8Array(256);
const UVT = [];
for (let id = 0; id < 256; id++) {
  const d = BLOCKS[id];
  OPQ[id] = d && !d.glass ? 1 : 0; GLS[id] = d && d.glass ? 1 : 0; GLOW[id] = d && d.glow ? 1 : 0;
}

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

// смещения соседей в копии чанка
const poff = (dx, dy, dz) => (dy * PD + dz) * PD + dx;
const NOFF = FACES.map(f => poff(f.n[0], f.n[1], f.n[2]));
for (const f of FACES) {
  f.aoOff = new Int32Array(12);
  f.ao.forEach((A, k) => A.forEach((o, j) => { f.aoOff[k * 3 + j] = poff(o[0], o[1], o[2]); }));
  f.cr = f.n[1] > 0 ? 1.0 : 0.96; f.cb = f.n[1] > 0 ? 0.94 : 1.04;
}
for (let id = 0; id < 256; id++) for (let f = 0; f < 6; f++) {
  const d = BLOCKS[id];
  UVT[id * 6 + f] = d ? tileUV(d.tiles[FACES[f].t]) : null;
}

// Буферы растут по необходимости
// позиции — байты относительно угла чанка (0..16), нормали — байты: в 4 раза меньше данных для видеокарты
class Buf {
  constructor() { this.pos = new Uint8Array(4096 * 3); this.nrm = new Int8Array(4096 * 3); this.uv = new Float32Array(4096 * 2); this.col = new Uint8Array(4096 * 3); this.idx = new Uint32Array(4096 * 1.5); this.v = 0; this.i = 0; }
  reset() { this.v = 0; this.i = 0; }
  ensure(nv) {
    if ((this.v + nv) * 3 > this.pos.length) {
      const grow = (a, k) => { const n = new a.constructor(a.length * 2); n.set(a); return n; };
      this.pos = grow(this.pos); this.nrm = grow(this.nrm); this.uv = grow(this.uv); this.col = grow(this.col); this.idx = grow(this.idx);
    }
  }
}

export class Mesher {
  constructor(world, scene, atlasTexture) {
    this.world = world;
    this.scene = scene;
    this.atlas = atlasTexture;
    this.lit = false; // true — мир освещается солнцем с тенями (высокая/ультра графика)
    this.basicMat = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true });
    this.litMat = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true });
    this.opaqueMat = this.basicMat;
    this.glassMat = new THREE.MeshBasicMaterial({ map: atlasTexture, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // вода течёт и рябит: сдвигаем текстуру внутри её клетки атласа
    this.time = { value: 0 };
    const wr = tileUV(T.water);
    this.glassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.uniforms.wRect = { value: new THREE.Vector4(wr[0], wr[1], wr[2], wr[3]) };
      sh.fragmentShader = 'uniform float uTime; uniform vec4 wRect;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec2 wuv = vMapUv; float wk = 1.0;
  if (wuv.x > wRect.x && wuv.x < wRect.z && wuv.y > wRect.y && wuv.y < wRect.w) {
    vec2 sz = wRect.zw - wRect.xy, l = (wuv - wRect.xy) / sz;
    l = fract(l + vec2(uTime * 0.05, uTime * 0.03) + 0.05 * sin(l.yx * 6.2832 + uTime * 1.3));
    wuv = wRect.xy + l * sz;
    wk = 0.93 + 0.12 * sin(dot(l, vec2(9.0, 7.0)) + uTime * 2.1);
  }
  vec4 sampledDiffuseColor = texture2D(map, wuv);
  sampledDiffuseColor.rgb *= wk;
  diffuseColor *= sampledDiffuseColor;
#endif`);
    };
    this.chunks = new Array(CX * CY * CZ).fill(null).map(() => ({ opaque: null, glass: null, dirty: true }));
    this.opaqueBuf = new Buf();
    this.glassBuf = new Buf();
    this.dirtyList = new Set();
    this.pad = new Uint8Array(PD * PD * PD);
    this.aoTmp = new Int32Array(4);
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

  // перестраиваем грязные чанки (ближайшие к камере — первыми), не дольше budgetMs за кадр
  update(budgetMs, camPos) {
    if (!this.dirtyList.size) return;
    let list = [...this.dirtyList];
    if (camPos && list.length > 1 && budgetMs !== Infinity) {
      const d = (i) => {
        const cx = i % CX, cz = Math.floor(i / CX) % CZ, cy = Math.floor(i / (CX * CZ));
        return Math.hypot((cx + 0.5) * CHUNK - camPos.x, (cy + 0.5) * CHUNK - camPos.y, (cz + 0.5) * CHUNK - camPos.z);
      };
      list.sort((a, b) => d(a) - d(b));
    }
    const t0 = performance.now();
    for (let k = 0; k < list.length; k++) {
      this.dirtyList.delete(list[k]);
      this.build(list[k]);
      if (performance.now() - t0 > budgetMs) break;
    }
  }
  setLit(on) {
    if (on === this.lit) return;
    this.lit = on; this.opaqueMat = on ? this.litMat : this.basicMat;
    this.rebuildAll();
  }
  rebuildAll() { this.markAllDirty(); this.update(Infinity); }

  build(ci) {
    const cx = ci % CX, cz = Math.floor(ci / CX) % CZ, cy = Math.floor(ci / (CX * CZ));
    const w = this.world, data = w.data, dmg = w.dmg;
    const ob = this.opaqueBuf, gb = this.glassBuf;
    ob.reset(); gb.reset();
    const X0 = cx * CHUNK, Y0 = cy * CHUNK, Z0 = cz * CHUNK;
    const X1 = Math.min(SX, X0 + CHUNK), Y1 = Math.min(SY, Y0 + CHUNK), Z1 = Math.min(SZ, Z0 + CHUNK);
    // копия чанка с рамкой в 1 блок: соседей берём без проверок границ
    const pad = this.pad;
    for (let ly = 0; ly < PD; ly++) {
      const y = Y0 - 1 + ly;
      for (let lz = 0; lz < PD; lz++) {
        const z = Z0 - 1 + lz;
        let o = (ly * PD + lz) * PD;
        if (y < 0 || y >= SY || z < 0 || z >= SZ) { pad.fill(0, o, o + PD); continue; }
        const row = (y * SZ + z) * SX;
        for (let lx = 0; lx < PD; lx++, o++) {
          const x = X0 - 1 + lx;
          pad[o] = (x < 0 || x >= SX) ? 0 : data[row + x];
        }
      }
    }
    const ao = this.aoTmp, lit = this.lit;
    for (let y = Y0; y < Y1; y++) for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
      const pi = ((y - Y0 + 1) * PD + (z - Z0 + 1)) * PD + (x - X0 + 1);
      const id = pad[pi];
      if (!id) continue;
      const isGlass = GLS[id] === 1;
      const glowB = GLOW[id] === 1;
      const i = (y * SZ + z) * SX + x;
      const dk = 1 - (dmg[i] / 255) * 0.6;
      const glow = glowB ? 1.25 : 1;
      for (let f = 0; f < 6; f++) {
        const nid = pad[pi + NOFF[f]];
        if (nid && (OPQ[nid] || isGlass)) continue;   // сосед закрывает грань (или стекло к стеклу)
        if (y === 0 && f === 3) continue;
        const F = FACES[f];
        const buf = isGlass ? gb : ob;
        buf.ensure(4);
        const shade = lit && !isGlass ? LIT_S[f] : F.s;
        const uv = UVT[id * 6 + f];
        const v0 = buf.v;
        const AOO = F.aoOff;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          let a = 3;
          if (!glowB) {
            const s1 = OPQ[pad[pi + AOO[k * 3]]], s2 = OPQ[pad[pi + AOO[k * 3 + 1]]], cc = OPQ[pad[pi + AOO[k * 3 + 2]]];
            a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
          }
          ao[k] = a;
          const p = buf.v * 3;
          buf.pos[p] = x - X0 + c[0]; buf.pos[p + 1] = y - Y0 + c[1]; buf.pos[p + 2] = z - Z0 + c[2];
          buf.nrm[p] = F.n[0] * 127; buf.nrm[p + 1] = F.n[1] * 127; buf.nrm[p + 2] = F.n[2] * 127;
          const u = buf.v * 2;
          buf.uv[u] = (k === 0 || k === 3) ? uv[0] : uv[2];
          buf.uv[u + 1] = (k < 2) ? uv[1] : uv[3];
          const fct = shade * AO_CURVE[a] * dk; // вершинные цвета линейные — возводим в квадрат
          const br = Math.min(255, Math.round(255 * fct * fct * glow));
          buf.col[p] = Math.min(255, br * F.cr);
          buf.col[p + 1] = br;
          buf.col[p + 2] = Math.min(255, br * F.cb);
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
    ch.opaque = this.apply(ch.opaque, ob, this.opaqueMat, 0, X0, Y0, Z0);
    ch.glass = this.apply(ch.glass, gb, this.glassMat, 1, X0, Y0, Z0);
    if (ch.opaque) ch.opaque.castShadow = ch.opaque.receiveShadow = this.lit;
  }

  apply(mesh, buf, mat, order, X0, Y0, Z0) {
    if (buf.i === 0) {
      if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      return null;
    }
    // переиспользуем буферы чанка (с запасом): обновление блока — это bufferSubData, а не новая геометрия
    const nv = buf.v, ni = buf.i, lit = mat === this.litMat;
    let geo = mesh ? mesh.geometry : null;
    const U = geo && geo.userData;
    if (!geo || U.capV < nv || U.capI < ni || (nv > 65535) !== U.big || lit !== U.lit) {
      const capV = Math.ceil(nv * 1.25) + 64, capI = Math.ceil(ni * 1.25) + 96, big = capV > 65535;
      geo = new THREE.BufferGeometry();
      const dyn = (a) => a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', dyn(new THREE.BufferAttribute(new Uint8Array(capV * 3), 3)));
      if (lit) geo.setAttribute('normal', dyn(new THREE.BufferAttribute(new Int8Array(capV * 3), 3, true)));
      geo.setAttribute('uv', dyn(new THREE.BufferAttribute(new Float32Array(capV * 2), 2)));
      geo.setAttribute('color', dyn(new THREE.BufferAttribute(new Uint8Array(capV * 3), 3, true)));
      geo.setIndex(dyn(new THREE.BufferAttribute(big ? new Uint32Array(capI) : new Uint16Array(capI), 1)));
      geo.userData = { capV, capI, big, lit };
      geo.boundingSphere = CHUNK_SPHERE;
      if (mesh) mesh.geometry.dispose();
    }
    const A = geo.attributes;
    const put = (attr, src, n) => {
      attr.array.set(n === src.length ? src : src.subarray(0, n));
      attr.needsUpdate = true;
      if (attr.clearUpdateRanges) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n); }
    };
    put(A.position, buf.pos, nv * 3);
    if (lit) put(A.normal, buf.nrm, nv * 3);
    put(A.uv, buf.uv, nv * 2);
    put(A.color, buf.col, nv * 3);
    put(geo.index, buf.idx, ni);
    geo.setDrawRange(0, ni);
    if (mesh) { mesh.geometry = geo; mesh.material = mat; return mesh; }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(X0, Y0, Z0); m.updateMatrix();
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

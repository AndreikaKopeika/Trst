// Объёмные эффекты: дым, пламя, огненные шары взрывов.
//
// Дым — это поле плотности на сетке 2×2×2 блока, которое живёт само:
//  - горячий дым быстро поднимается, остывая — медленнее;
//  - упёрся в потолок — растекается в стороны (в туннелях и комнатах копится);
//  - на открытом воздухе его сносит ветром и он постепенно тает, в помещениях держится долго;
//  - его добавляют пожары, взрывы, выстрелы (при долгой стрельбе в комнате набирается дымка).
// Рисуется мягкими клубами с шумовой текстурой (один draw call), отсортированными по глубине.
// Пламя — языки огня с бегущим шумом в шейдере. Огненные шары взрывов — те же клубы,
// только горячие: светятся, остывают и превращаются в чёрный дым, который уходит в поле.
import * as THREE from './lib/three.module.min.js';
import { SOLID, LIQUID } from './blocks.js';
import { SX, SY, SZ } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const CS = 2; // размер ячейки дыма (в блоках)
const STEP = 0.1; // шаг симуляции дыма, с

// ---------- тайлящийся шум (генерируется один раз) ----------
let NOISE = null;
function noiseTex() {
  if (NOISE) return NOISE;
  const size = 128;
  const layer = (seed, oct, base) => {
    const out = new Float32Array(size * size);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const cells = base << o;
      const g = new Float32Array(cells * cells);
      let s = (seed * 9301 + o * 49297) >>> 0;
      for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; g[i] = (s >>> 8) / 16777216; }
      for (let y = 0; y < size; y++) {
        const fy = y / size * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % cells;
        for (let x = 0; x < size; x++) {
          const fx = x / size * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % cells;
          const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
          out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
        }
      }
      tot += amp; amp *= 0.55;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  };
  const A = layer(1, 5, 4), Bn = layer(7, 4, 8), C = layer(13, 5, 2);
  const data = new Uint8Array(size * size * 4);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = cl((A[i] - 0.5) * 2.1 * 255 + 128);
    data[i * 4 + 1] = cl((Bn[i] - 0.5) * 2.1 * 255 + 128);
    data[i * 4 + 2] = cl((1 - Math.abs(C[i] - 0.5) * 2) * 255); // «прожилки» для пламени
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  NOISE = t;
  return t;
}

// ---------- пачка billboard-квадов (инстансинг) ----------
class Batch {
  constructor(scene, max, material, order) {
    this.max = max; this.n = 0;
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.raw = new Float32Array(max * 12);
    this.A = new Float32Array(max * 4); this.B = new Float32Array(max * 4); this.C = new Float32Array(max * 4);
    this.aA = new THREE.InstancedBufferAttribute(this.A, 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(this.B, 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iC', this.aC);
    g.instanceCount = 0;
    this.depth = new Float32Array(max); this.ord = new Uint16Array(max);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(x, y, z, s, r, g, b, a, c0, c1, c2, c3) {
    if (this.n >= this.max) return;
    const o = this.n++ * 12, R = this.raw;
    R[o] = x; R[o + 1] = y; R[o + 2] = z; R[o + 3] = s;
    R[o + 4] = r; R[o + 5] = g; R[o + 6] = b; R[o + 7] = a;
    R[o + 8] = c0; R[o + 9] = c1; R[o + 10] = c2; R[o + 11] = c3;
  }
  // сортируем от дальних к ближним — полупрозрачное ложится правильно
  end(cam) {
    const n = this.n, R = this.raw, D = this.depth, O = this.ord;
    for (let i = 0; i < n; i++) {
      const o = i * 12, dx = R[o] - cam.x, dy = R[o + 1] - cam.y, dz = R[o + 2] - cam.z;
      D[i] = dx * dx + dy * dy + dz * dz; O[i] = i;
    }
    const ord = O.subarray(0, n);
    ord.sort((a, b) => D[b] - D[a]);
    const A = this.A, B = this.B, C = this.C;
    for (let k = 0; k < n; k++) {
      const o = ord[k] * 12, j = k * 4;
      A[j] = R[o]; A[j + 1] = R[o + 1]; A[j + 2] = R[o + 2]; A[j + 3] = R[o + 3];
      B[j] = R[o + 4]; B[j + 1] = R[o + 5]; B[j + 2] = R[o + 6]; B[j + 3] = R[o + 7];
      C[j] = R[o + 8]; C[j + 1] = R[o + 9]; C[j + 2] = R[o + 10]; C[j + 3] = R[o + 11];
    }
    for (const at of [this.aA, this.aB, this.aC]) {
      at.needsUpdate = true;
      if (at.clearUpdateRanges) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * 4)); }
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

// premultiplied alpha: клуб может и закрывать (дым), и светиться (огонь) одновременно
const PREMUL = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, transparent: true, depthWrite: false };

// iA: позиция, размер; iB: цвет дыма, непрозрачность; iC: поворот, зерно шума, жар, скорость клубления
const SMOKE_VS = `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
uniform float uFogNear, uFogFar;
varying vec2 vUv; varying vec2 vRuv; varying vec4 vCol; varying vec3 vMisc; varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(iA.xyz, 1.0);
  float s = iA.w, r = iC.x;
  vec2 c = position.xy;
  vec2 rc = vec2(c.x * cos(r) - c.y * sin(r), c.x * sin(r) + c.y * cos(r));
  float dist = -mv.z;
  // клуб чуть выдвигаем к камере — меньше резких срезов о стены
  mv.xyz -= normalize(mv.xyz) * min(s * 0.22, max(0.0, dist - 0.2));
  mv.xy += c * s;
  // вблизи камеры клуб тает: изнутри дыма картинку даёт затемнение экрана, а не сотня слоёв
  float nearK = smoothstep(0.4, 0.4 + s * 0.85, dist);
  vUv = c + 0.5; vRuv = rc + 0.5;
  vCol = vec4(iB.rgb, iB.a * nearK);
  vMisc = iC.yzw;
  vFog = smoothstep(uFogNear, uFogFar, dist);
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FS = `
uniform sampler2D tNoise; uniform float uTime; uniform vec3 uFogColor; uniform vec2 uWind;
varying vec2 vUv; varying vec2 vRuv; varying vec4 vCol; varying vec3 vMisc; varying float vFog;
void main() {
  vec2 p = vRuv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float seed = vMisc.x, heat = vMisc.y, flow = vMisc.z;
  vec2 drift = vec2(-uWind.x * 0.01, -0.03 - flow * 0.05) * uTime;
  float n1 = texture2D(tNoise, vRuv * 0.5 + vec2(seed, seed * 1.37) + drift).r;
  float n2 = texture2D(tNoise, vRuv * 1.15 + vec2(seed * 2.1, seed * 0.7) + drift * 1.9).g;
  float d = 1.0 - r * r;
  d += (n1 - 0.5) * 1.0 + (n2 - 0.5) * 0.5;
  float a = smoothstep(0.0, 0.6, d) * vCol.a;
  if (a < 0.003) discard;
  // освещение: верх светлее, низ и «толща» темнее
  float lit = clamp(0.62 + (vUv.y - 0.5) * 0.65 + (n2 - 0.5) * 0.55 - (1.0 - r) * 0.12, 0.22, 1.2);
  float h = clamp(heat, 0.0, 1.5);
  vec3 col = vCol.rgb * lit * (1.0 - min(h, 1.0) * 0.85);
  // жар: раскалённое ядро (жёлто-белое), края — оранжевые и красные, прожилки темнее
  float core = clamp(h * (0.6 + n1 * 0.8) - (r * 0.55), 0.0, 1.5);
  vec3 fire = mix(vec3(0.75, 0.12, 0.01), vec3(1.0, 0.45, 0.05), smoothstep(0.05, 0.45, core));
  fire = mix(fire, vec3(1.0, 0.86, 0.5), smoothstep(0.5, 0.95, core));
  fire = mix(fire, vec3(1.0, 0.98, 0.9), smoothstep(0.95, 1.3, core));
  col += fire * min(h, 1.0) * (0.5 + core) * (1.2 - vUv.y * 0.4) * 1.8;
  col = mix(col, uFogColor, vFog * (1.0 - min(h, 1.0) * 0.7));
  gl_FragColor = vec4(col * a, a);
}`;

// iA: позиция основания, ширина; iB: высота, яркость, зерно, скорость
const FLAME_VS = `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
uniform float uFogNear, uFogFar;
varying vec2 vUv; varying vec3 vM; varying float vFog;
void main() {
  vec3 c = iA.xyz;
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  // пламя горящего блока выносим из блока к камере — иначе его закрывает сам блок
  vec3 wp = c + right * position.x * iA.w + vec3(0.0, (position.y + 0.5) * iB.x, 0.0) + toCam * iC.x;
  vUv = position.xy + 0.5;
  vM = iB.yzw;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = `
uniform sampler2D tNoise; uniform float uTime; uniform vec3 uFogColor;
varying vec2 vUv; varying vec3 vM; varying float vFog;
void main() {
  float bright = vM.x, seed = vM.y, sp = vM.z;
  float t = uTime * sp;
  vec2 uv = vUv;
  // два слоя шума бегут вверх с разной скоростью — пламя рвётся и пляшет
  float n1 = texture2D(tNoise, vec2(uv.x * 0.6 + seed, uv.y * 0.5 - t * 0.85)).r;
  float n2 = texture2D(tNoise, vec2(uv.x * 1.4 - seed * 1.3, uv.y * 1.1 - t * 1.6)).g;
  float vein = texture2D(tNoise, vec2(uv.x * 0.9 + seed * 0.4, uv.y * 0.7 - t * 1.25)).b;
  float x = (uv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.7 * uv.y + (n2 - 0.5) * 0.25;
  float w = mix(0.9, 0.08, pow(uv.y, 0.75));
  float body = 1.0 - smoothstep(w * 0.15, w, abs(x));
  float top = 1.0 - smoothstep(0.2, 0.95, uv.y + (n2 - 0.5) * 0.7 + (n1 - 0.5) * 0.3);
  float base = smoothstep(0.0, 0.15, uv.y);
  float f = body * top * base * (0.55 + vein * 0.7);
  float heat = clamp(f * (1.25 - uv.y * 0.8), 0.0, 1.0);
  vec3 col = mix(vec3(0.45, 0.04, 0.0), vec3(0.95, 0.28, 0.03), smoothstep(0.05, 0.4, heat));
  col = mix(col, vec3(1.0, 0.62, 0.16), smoothstep(0.4, 0.75, heat));
  col = mix(col, vec3(1.0, 0.9, 0.62), smoothstep(0.8, 1.0, heat));
  float a = smoothstep(0.03, 0.55, f) * bright;
  if (a < 0.004) discard;
  col = mix(col, uFogColor, vFog * 0.6);
  gl_FragColor = vec4(col * a * 1.25, a * 0.22);
}`;

// ---------- поле дыма ----------
class SmokeField {
  constructor(world) { this.w = world; this.reset(); }
  reset() {
    const GX = this.GX = Math.ceil(SX / CS), GY = this.GY = Math.ceil(SY / CS), GZ = this.GZ = Math.ceil(SZ / CS);
    const N = this.N = GX * GY * GZ;
    this.D = new Float32Array(N); this.H = new Float32Array(N); this.P = new Float32Array(N);
    this.dD = new Float32Array(N); this.dH = new Float32Array(N); this.dP = new Float32Array(N);
    this.S = new Float32Array(N);              // сглаженная плотность (для картинки, без ступенек)
    this.occ = new Uint8Array(N).fill(255);    // сколько из 8 блоков ячейки твёрдые (255 — не посчитано)
    this.perm = new Uint8Array(N * 6).fill(255); // проходимость грани к соседу: 0..4 пары пустых блоков
    this.top = new Int16Array(GX * GZ).fill(-2); // самый высокий твёрдый блок над столбом ячеек
    this.act = new Uint8Array(N); this.list = []; this.touched = []; this.cur = 0; this.tmark = null;
    this.own = new Map();
    this.acc = 0;
  }
  ci(x, y, z) {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= this.GX || cy >= this.GY || cz >= this.GZ) return -1;
    return cx + this.GX * (cz + this.GZ * cy);
  }
  occAt(i) {
    let o = this.occ[i];
    if (o !== 255) return o;
    const GX = this.GX, GZ = this.GZ, cx = i % GX, cz = Math.floor(i / GX) % GZ, cy = Math.floor(i / (GX * GZ));
    const w = this.w; o = 0;
    for (let dy = 0; dy < CS; dy++) for (let dz = 0; dz < CS; dz++) for (let dx = 0; dx < CS; dx++) {
      const x = cx * CS + dx, y = cy * CS + dy, z = cz * CS + dz;
      if (x >= SX || y >= SY || z >= SZ) { o++; continue; }
      const id = w.get(x, y, z);
      if (SOLID[id] || LIQUID[id]) o++;
    }
    this.occ[i] = o;
    return o;
  }
  open(i) { return this.occAt(i) <= 6; }
  // сколько пар пустых блоков соединяют ячейку с соседом через общую грань (0 — стена, 4 — свободно)
  // k: 0 +y, 1 -y, 2 +x, 3 -x, 4 +z, 5 -z
  permAt(i, k) {
    const pi = i * 6 + k;
    let v = this.perm[pi];
    if (v !== 255) return v;
    const GX = this.GX, GZ = this.GZ, w = this.w;
    const cx = i % GX, cz = Math.floor(i / GX) % GZ, cy = Math.floor(i / (GX * GZ));
    const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
    const free = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return y >= SY; const id = w.get(x, y, z); return !SOLID[id] && !LIQUID[id]; };
    v = 0;
    for (let a = 0; a < CS; a++) for (let b = 0; b < CS; b++) {
      let p, q;
      if (k === 0) { p = free(x0 + a, y0 + CS - 1, z0 + b); q = free(x0 + a, y0 + CS, z0 + b); }
      else if (k === 1) { p = free(x0 + a, y0, z0 + b); q = free(x0 + a, y0 - 1, z0 + b); }
      else if (k === 2) { p = free(x0 + CS - 1, y0 + a, z0 + b); q = free(x0 + CS, y0 + a, z0 + b); }
      else if (k === 3) { p = free(x0, y0 + a, z0 + b); q = free(x0 - 1, y0 + a, z0 + b); }
      else if (k === 4) { p = free(x0 + a, y0 + b, z0 + CS - 1); q = free(x0 + a, y0 + b, z0 + CS); }
      else { p = free(x0 + a, y0 + b, z0); q = free(x0 + a, y0 + b, z0 - 1); }
      if (p && q) v++;
    }
    this.perm[pi] = v;
    return v;
  }
  // самый высокий твёрдый блок над столбом ячеек: выше него — открытое небо
  colTop(cx, cz) {
    const k = cx + this.GX * cz;
    let t = this.top[k];
    if (t > -2) return t;
    t = -1;
    const w = this.w;
    for (let a = 0; a < CS; a++) for (let b = 0; b < CS; b++) {
      const x = cx * CS + a, z = cz * CS + b;
      if (x >= SX || z >= SZ) continue;
      for (let y = SY - 1; y > t; y--) { const id = w.get(x, y, z); if (SOLID[id] || LIQUID[id]) { t = y; break; } }
    }
    this.top[k] = t;
    return t;
  }
  blockChanged(x, y, z) {
    const i = this.ci(x, y, z);
    if (i < 0) return;
    this.occ[i] = 255;
    this.perm.fill(255, i * 6, i * 6 + 6);
    const GX = this.GX, GXZ = GX * this.GZ;
    for (const o of [1, -1, GX, -GX, GXZ, -GXZ]) { const j = i + o; if (j >= 0 && j < this.N) this.perm.fill(255, j * 6, j * 6 + 6); }
    this.top[Math.floor(x / CS) + GX * Math.floor(z / CS)] = -2;
  }
  activate(i) { if (!this.act[i]) { this.act[i] = 1; this.list.push(i); } }
  // добавить дым: amount — плотность, heat 0..1 — насколько горячий, dark 0..1 — насколько чёрный
  add(x, y, z, amount, heat = 0, dark = 0.5, owner) {
    let i = this.ci(x, y, z);
    if (i < 0) return;
    // источник внутри стены — дым выходит в ближайшую открытую ячейку сверху
    for (let k = 0; k < 2 && !this.open(i); k++) { const j = i + this.GX * this.GZ; if (j >= this.N) return; i = j; }
    if (!this.open(i)) return;
    this.D[i] += amount; this.H[i] += amount * heat; this.P[i] += amount * dark;
    if (this.D[i] > 8) { const k = 8 / this.D[i]; this.D[i] = 8; this.H[i] *= k; this.P[i] *= k; }
    if (owner !== undefined && amount > 0.05) this.own.set(i, owner);
    this.activate(i);
  }
  addSphere(x, y, z, R, total, heat, dark, owner) {
    const cells = [];
    const r = Math.max(CS, R);
    for (let dy = -r; dy <= r; dy += CS) for (let dz = -r; dz <= r; dz += CS) for (let dx = -r; dx <= r; dx += CS) {
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r * r) continue;
      cells.push([x + dx, y + dy, z + dz, 1 - Math.sqrt(d2) / (r + 1)]);
    }
    let sw = 0; for (const c of cells) sw += c[3];
    for (const c of cells) this.add(c[0], c[1], c[2], total * c[3] / sw, heat, dark, owner);
  }
  sample(x, y, z) {
    const i = this.ci(x, y, z);
    if (i < 0) return 0;
    return this.D[i];
  }
  heatAt(x, y, z) { const i = this.ci(x, y, z); return i < 0 || this.D[i] < 0.01 ? 0 : this.H[i] / this.D[i]; }
  // каждый кадр обрабатываем свою долю ячеек (каждая — раз в STEP секунд), чтобы не было рывков
  update(dt, wind) {
    this.acc += this.list.length * Math.min(dt, 0.1) / STEP;
    const cnt = Math.min(Math.floor(this.acc), this.list.length);
    this.acc -= cnt;
    if (cnt > 0) this.step(STEP, wind, cnt);
    // сглаживание для картинки
    const S = this.S, D = this.D, k = Math.min(1, dt * 5);
    for (const i of this.list) S[i] += (D[i] - S[i]) * k;
  }
  step(dt, wind, cnt) {
    const { GX, GY, GZ, D, H, P, dD, dH, dP } = this;
    const L = this.list, T = this.touched, tm = this.tmark || (this.tmark = new Uint8Array(this.N));
    const GXZ = GX * GZ;
    T.length = 0;
    const touch = (j) => { if (!tm[j]) { tm[j] = 1; T.push(j); } };
    const flow = (i, j, f) => {
      const a = D[i] * f, h = H[i] * f, p = P[i] * f;
      dD[i] -= a; dH[i] -= h; dP[i] -= p;
      dD[j] += a; dH[j] += h; dP[j] += p;
      touch(j);
      if (!this.act[j]) { this.act[j] = 1; L.push(j); }
    };
    const decOpen = Math.exp(-dt / 20), decTop = Math.exp(-dt / 4), decIn = Math.exp(-dt / 55), decThin = Math.exp(-dt / 3), cool = 1 - Math.exp(-dt / 1.6);
    let cur = this.cur || 0;
    const thin = L.length > 5000 ? 0.18 : 0.06; // дыма очень много — дымка тает быстрее
    const nb = [0, 0, 0, 0, 0, 0], ok = [false, false, false, false, false, false], pm = [0, 0, 0, 0, 0, 0];
    for (let q = 0; q < cnt; q++) {
      if (cur >= L.length) { cur = 0; this.compact(); if (!L.length) break; }
      const i = L[cur++];
      touch(i);
      const d = D[i];
      if (d < 0.012) continue;
      const cx = i % GX, cz = Math.floor(i / GX) % GZ, cy = Math.floor(i / GXZ);
      const heat = Math.min(1.5, H[i] / d);
      // соседи: +y, -y, +x, -x, +z, -z
      nb[0] = cy + 1 < GY ? i + GXZ : -1; nb[1] = cy > 0 ? i - GXZ : -1;
      nb[2] = cx + 1 < GX ? i + 1 : -1; nb[3] = cx > 0 ? i - 1 : -1;
      nb[4] = cz + 1 < GZ ? i + GX : -1; nb[5] = cz > 0 ? i - GX : -1;
      for (let k = 0; k < 6; k++) { pm[k] = nb[k] >= 0 ? this.permAt(i, k) / (CS * CS) : 0; ok[k] = pm[k] > 0; }
      let budget = 0.82;
      // всплывание: горячий дым летит вверх, остывший едва поднимается
      const up = Math.min(0.5, (0.18 + 3.6 * heat) * dt);
      if (ok[0]) { flow(i, nb[0], up * pm[0]); budget -= up * pm[0]; }
      // что не прошло вверх (потолок) — растекается в стороны
      const blocked = 1 - pm[0];
      if (blocked > 0) {
        let cnt = 0; for (let k = 2; k < 6; k++) cnt += pm[k];
        if (cnt > 0) {
          const f = Math.min(0.4, (0.9 + 2.5 * heat) * dt) * blocked / Math.max(1, cnt);
          for (let k = 2; k < 6; k++) if (ok[k]) flow(i, nb[k], f * pm[k]);
          budget -= f * cnt;
        }
      }
      // диффузия — выравнивается с соседями
      for (let k = 0; k < 6 && budget > 0.05 && d > 0.06; k++) {
        if (!ok[k]) continue;
        const j = nb[k], diff = d - D[j];
        if (diff <= 0.02) continue;
        const f = Math.min(budget * 0.2, 0.3 * dt * diff / d) * pm[k];
        flow(i, j, f); budget -= f;
      }
      // ветер — только на открытом воздухе
      const sky = cy * CS > this.colTop(cx, cz);
      if (sky && budget > 0.05) {
        const wx = wind.x, wz = wind.z;
        const kx = wx > 0 ? 2 : 3, kz = wz > 0 ? 4 : 5;
        const fx = Math.min(0.3, Math.abs(wx) * dt * 0.45), fz = Math.min(0.3, Math.abs(wz) * dt * 0.45);
        if (ok[kx]) flow(i, nb[kx], fx * pm[kx]);
        if (ok[kz]) flow(i, nb[kz], fz * pm[kz]);
      }
      // рассеивание: на открытом месте ~20 с, в помещении почти минута, высоко в небе быстро
      // рассеивание: на открытом месте ~20 с, в помещении почти минута, высоко в небе быстро;
      // еле заметная дымка тает быстро — не расползается на полкарты
      const dec = d < thin ? decThin : sky ? (cy >= GY - 2 ? decTop : decOpen) : decIn;
      dD[i] -= d * (1 - dec); dP[i] -= P[i] * (1 - dec);
      dH[i] -= H[i] * cool; // остывает
    }
    this.cur = cur;
    // применяем
    for (let q = 0; q < T.length; q++) {
      const i = T[q]; tm[i] = 0;
      D[i] = Math.max(0, D[i] + dD[i]); H[i] = Math.max(0, H[i] + dH[i]); P[i] = Math.max(0, P[i] + dP[i]);
      dD[i] = 0; dH[i] = 0; dP[i] = 0;
    }
  }
  // убираем из списка выдохшиеся ячейки
  compact() {
    const L = this.list, D = this.D, S = this.S;
    let w = 0;
    for (let q = 0; q < L.length; q++) {
      const i = L[q];
      if (D[i] > 0.012 || S[i] > 0.02) L[w++] = i;
      else { this.act[i] = 0; D[i] = this.H[i] = this.P[i] = 0; S[i] = 0; this.own.delete(i); }
    }
    L.length = w;
  }
}

// ---------- всё вместе ----------
export class VFX {
  constructor(scene, world, q) {
    this.scene = scene; this.world = world; this.q = q;
    this.time = 0;
    this.field = new SmokeField(world);
    this.wind = { x: 1.2, z: 0.4, a: Math.random() * 6.28 };
    const tex = noiseTex();
    const fog = scene.fog;
    this.U = {
      tNoise: { value: tex }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) },
      uFogColor: { value: fog ? fog.color : new THREE.Color(0x9ec9ff) }, uFogNear: { value: 40 }, uFogFar: { value: 120 },
    };
    this.smokeMat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, uniforms: this.U, ...PREMUL });
    this.flameMat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, uniforms: this.U, ...PREMUL });
    // бюджет клубов по качеству
    this.fieldMax = Math.round(140 + 320 * q);
    this.smoke = new Batch(scene, this.fieldMax + 420, this.smokeMat, 5);
    this.flames = new Batch(scene, 700, this.flameMat, 4);
    this.puffs = [];
    this.puffMax = Math.round(140 + 180 * q);
    this.lights = []; this.flash = []; this.veil = 0; this.veilHeat = 0;
    this._cand = [];
  }
  reset() { this.field.reset(); this.puffs.length = 0; this.flash.length = 0; }
  setQuality(q) { this.q = q; this.fieldMax = Math.round(140 + 320 * q); this.puffMax = Math.round(140 + 180 * q); }

  // точечные огни для освещённого режима (высокая и ультра графика)
  setLights(on) {
    for (const l of this.lights) this.scene.remove(l);
    this.lights = [];
    if (!on) return;
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 14, 1.6);
      l.userData.keep = true;
      this.scene.add(l); this.lights.push(l);
    }
  }

  // клуб: дым или огненный шар (heat > 0), в конце жизни отдаёт часть дыма в поле
  puff(x, y, z, vx, vy, vz, life, s0, s1, gray, alpha, heat = 0, heatEnd = 0.5, opt = {}) {
    if (this.puffs.length >= this.puffMax) {
      // вытесняем самый старый клуб
      let o = 0, best = 1e9;
      for (let i = 0; i < this.puffs.length; i++) if (this.puffs[i].life < best) { best = this.puffs[i].life; o = i; }
      this.puffs.splice(o, 1);
    }
    this.puffs.push({ x, y, z, vx, vy, vz, life, max: life, s0, s1, gray, alpha, heat, heatEnd, rot: Math.random() * 6.28, vr: rnd(-0.4, 0.4), seed: Math.random() * 10,
      drag: opt.drag ?? 1.5, buoy: opt.buoy ?? 0.8, dep: opt.dep ?? 0, dark: opt.dark ?? 0.6, tint: opt.tint || null, flow: opt.flow ?? 0.5 });
  }

  // дымок из ствола; при долгой стрельбе в помещении набирается дымка
  gunSmoke(p, dir, big) {
    const k = big ? 1.6 : 1;
    this.field.add(p.x, p.y, p.z, 0.022 * k, 0.05, 0.25);
    // далёкие выстрелы — только в поле, без отдельного клуба
    const c = this.cam;
    if (c && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2 > 2000) return;
    this.puff(p.x + dir.x * 0.2, p.y + dir.y * 0.2, p.z + dir.z * 0.2, dir.x * 1.6 + rnd(-0.2, 0.2), rnd(0.2, 0.5), dir.z * 1.6 + rnd(-0.2, 0.2),
      rnd(1.4, 2.4), 0.12 * k, rnd(0.7, 1.0) * k, rnd(0.72, 0.82), 0.22 * k, 0, 0, { drag: 2.4, buoy: 0.35, flow: 0.3 });
  }
  backblast(p, d) {
    for (let i = 0; i < 6; i++) this.puff(p.x - d.x * 0.6, p.y - d.y * 0.6, p.z - d.z * 0.6, -d.x * rnd(5, 9) + rnd(-1, 1), rnd(0, 1), -d.z * rnd(5, 9) + rnd(-1, 1),
      rnd(1.6, 2.8), 0.4, rnd(1.6, 2.4), rnd(0.7, 0.8), 0.45, i < 2 ? 0.6 : 0, 0.2, { drag: 3, buoy: 0.4 });
    this.field.add(p.x - d.x * 1.5, p.y, p.z - d.z * 1.5, 0.35, 0.1, 0.3);
  }

  // взрыв: огненный шар клубами, ударная пылевая волна по земле, грибовидный столб дыма
  explosion(p, R, power = 1, owner) {
    const w = this.world, q = this.q;
    const k = Math.max(0.8, R / 3.6) * Math.sqrt(power), kc = Math.sqrt(k);
    // огненный шар
    const nFire = Math.round((10 + 10 * q) * kc);
    for (let i = 0; i < nFire; i++) {
      const u = rnd(-1, 1), a = Math.random() * 6.28, rr = Math.cbrt(Math.random()) * R * 0.35;
      const s = Math.sqrt(1 - u * u);
      const dx = Math.cos(a) * s, dy = Math.abs(u) * 0.7 + 0.15, dz = Math.sin(a) * s;
      const sp = rnd(2.5, 7.5) * kc;
      this.puff(p.x + dx * rr, p.y + dy * rr * 0.6, p.z + dz * rr, dx * sp, dy * sp + 1.5, dz * sp, rnd(1.4, 2.6) * kc, R * rnd(0.22, 0.35), R * rnd(0.7, 1.0),
        rnd(0.12, 0.2), 0.95, rnd(1.1, 1.45), rnd(0.35, 0.55), { drag: 2.6, buoy: 2.8, dep: 0.35 * kc, dark: 0.92, flow: 0.9 });
    }
    // чёрный клубящийся дым над шаром (для крупных — гриб)
    const nSm = Math.round((6 + 8 * q) * kc);
    for (let i = 0; i < nSm; i++) {
      const a = Math.random() * 6.28, rr = Math.random() * R * 0.4;
      this.puff(p.x + Math.cos(a) * rr, p.y + rnd(0, R * 0.4), p.z + Math.sin(a) * rr, Math.cos(a) * rnd(0.5, 2), rnd(3, 7) * kc, Math.sin(a) * rnd(0.5, 2),
        rnd(3.5, 6) * kc, R * 0.35, R * rnd(1.0, 1.5), rnd(0.1, 0.18), 0.85, rnd(0.3, 0.6), 0.15, { drag: 1.1, buoy: 0.6, dep: 0.5 * kc, dark: 0.95, flow: 0.7 });
    }
    // пыль по земле расходится кольцом
    let gy = Math.floor(p.y);
    for (let i = 0; i < 6 && gy > 0 && !w.solid(Math.floor(p.x), gy - 1, Math.floor(p.z)); i++) gy--;
    if (p.y - gy < R * 0.9) {
      const id = w.get(Math.floor(p.x), gy - 1, Math.floor(p.z));
      const tint = DUST_TINT[id] || [0.62, 0.55, 0.45];
      const nD = Math.round((8 + 10 * q) * kc);
      for (let i = 0; i < nD; i++) {
        const a = i / nD * 6.28 + rnd(-0.2, 0.2), sp = rnd(5, 11) * kc;
        this.puff(p.x + Math.cos(a) * 0.6, gy + 0.4, p.z + Math.sin(a) * 0.6, Math.cos(a) * sp, rnd(0.3, 1.2), Math.sin(a) * sp,
          rnd(2.2, 3.8), 0.6, rnd(2.2, 3.4) * kc, 1, 0.6, 0, 0, { drag: 2.2, buoy: 0.15, dep: 0.12, dark: 0.2, tint, flow: 0.4 });
      }
    }
    // плотный дым остаётся висеть: в помещении — надолго
    this.field.addSphere(p.x, p.y, p.z, R * 0.7, 2.2 * R * kc, 1.0, 0.85, owner);
    // вспышка света
    this.flash.push({ x: p.x, y: p.y + 0.5, z: p.z, t: 0, dur: 0.35 + 0.1 * kc, power: 8 * kc });
  }

  // огонь в клетке: языки пламени + горячий дым в поле
  fire(c, dt, visible) {
    const blk = c.blk;
    // дым от пожара копится всегда (от него и урон), рисуем только видимое
    this.field.add(c.x + 0.5, c.y + (blk ? 1.6 : 1.1), c.z + 0.5, (blk ? 0.42 : 0.22) * dt, 1.0, 0.93, c.owner);
    if (!visible) return;
    const t = this.time, s = (c.seed ??= Math.random() * 10);
    const flick = 0.85 + Math.sin(t * 13 + s * 7) * 0.08 + Math.sin(t * 23 + s * 3) * 0.07;
    if (blk) {
      // пламя охватывает блок: с боков и сверху
      for (let k = 0; k < 2; k++) {
        const a = s * 2 + k * 2.6;
        this.flames.push(c.x + 0.5 + Math.cos(a) * 0.2, c.y - 0.05 + k * 0.25, c.z + 0.5 + Math.sin(a) * 0.2, rnd(1.2, 1.4), rnd(1.6, 2.0) * flick, flick, s + k * 3.3, 1.0 + k * 0.2, 0.78, 0, 0, 0);
      }
      // и сверху: если над блоком пусто, огонь рвётся вверх
      if (!this.world.solid(c.x, c.y + 1, c.z)) this.flames.push(c.x + 0.5, c.y + 0.85, c.z + 0.5, 1.25, 1.9 * flick, flick, s + 9.1, 1.25, 0.25, 0, 0, 0);
    } else {
      this.flames.push(c.x + 0.5, c.y, c.z + 0.5, rnd(0.9, 1.05), rnd(0.9, 1.2) * flick, flick * 0.85, s, 1.1, 0.1, 0, 0, 0);
      this.flames.push(c.x + 0.5 + Math.cos(s) * 0.2, c.y, c.z + 0.5 + Math.sin(s) * 0.2, 0.7, 0.7 * flick, flick * 0.7, s + 4.4, 1.4, 0.15, 0, 0, 0);
    }
    // клочья дыма прямо над огнём — видно, как он вырывается
    c.pa = (c.pa || Math.random()) + dt * (blk ? 1.4 : 0.8) * Math.min(1, this.q + 0.3);
    if (c.pa >= 1) {
      c.pa -= 1;
      this.puff(c.x + rnd(0.2, 0.8), c.y + (blk ? 1.4 : 0.9), c.z + rnd(0.2, 0.8), rnd(-0.2, 0.2), rnd(1.5, 2.6), rnd(-0.2, 0.2), rnd(1.6, 2.6), 0.5, rnd(1.4, 2.2), rnd(0.1, 0.16), 0.7, 0.55, 0.25, { drag: 0.8, buoy: 0.9, dep: 0.15, dark: 0.95, flow: 1 });
    }
  }

  update(dt, cam, fires) {
    this.time += dt; this.cam = cam;
    const U = this.U, fog = this.scene.fog;
    U.uTime.value = this.time;
    if (fog) { U.uFogColor.value = fog.color; U.uFogNear.value = fog.near; U.uFogFar.value = fog.far; }
    // ветер медленно меняется
    const W = this.wind;
    W.a += dt * 0.012;
    const ws = 1.3 + Math.sin(this.time * 0.05) * 0.6;
    W.x = Math.cos(W.a) * ws; W.z = Math.sin(W.a) * ws;
    U.uWind.value.set(W.x, W.z);
    this.field.update(dt, W);

    // клубы
    const sm = this.smoke; sm.begin();
    const P = this.puffs;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.dep > 0) this.field.add(p.x, p.y, p.z, p.dep, Math.max(0, p.heat) * 0.3, p.dark); continue; }
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx = p.vx * dr + W.x * 0.12 * dt; p.vz = p.vz * dr + W.z * 0.12 * dt;
      p.vy = p.vy * dr + p.buoy * dt;
      let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // в стену клуб не проходит — расплющивается
      if (this.world.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vx *= -0.2; p.vz *= -0.2; p.vy = Math.abs(p.vy) * 0.3; nx = p.x; nz = p.z; ny = p.y + 0.02;
      }
      p.x = nx; p.y = ny; p.z = nz;
      p.rot += p.vr * dt;
      const t = 1 - p.life / p.max;
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) * (1 - t));
      const ht = p.heat > 0 ? p.heat * Math.max(0, 1 - t / p.heatEnd) ** 1.6 : 0;
      const a = p.alpha * Math.min(1, t * 10) * (t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1);
      const g = p.gray * (p.tint ? 1 : 1);
      const r = p.tint ? p.tint[0] : g, gg = p.tint ? p.tint[1] : g, b = p.tint ? p.tint[2] : g;
      sm.push(p.x, p.y, p.z, size, r, gg, b, a, p.rot, p.seed, ht, p.flow);
      P[w++] = p;
    }
    P.length = w;

    // поле дыма: ближние плотные ячейки
    const F = this.field, S = F.S, GX = F.GX, GZ = F.GZ, GXZ = GX * GZ;
    const cand = this._cand; cand.length = 0;
    const far2 = fog ? fog.far * fog.far : 1e4;
    for (const i of F.list) {
      const d = S[i];
      if (d < 0.05) continue;
      const cx = (i % GX) * CS + 1, cz = (Math.floor(i / GX) % GZ) * CS + 1, cy = Math.floor(i / GXZ) * CS + 1;
      const dx = cx - cam.x, dy = cy - cam.y, dz = cz - cam.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far2) continue;
      cand.push(i, d2);
    }
    let count = cand.length / 2;
    let limit = 1e9;
    if (count > this.fieldMax) {
      // берём ближние
      const ds = []; for (let j = 1; j < cand.length; j += 2) ds.push(cand[j]);
      ds.sort((a, b) => a - b); limit = ds[this.fieldMax - 1];
    }
    const twin = this.q > 1.2;
    for (let j = 0; j < cand.length; j += 2) {
      if (cand[j + 1] > limit) continue;
      const i = cand[j], d = S[i];
      const cx = i % GX, cz = Math.floor(i / GX) % GZ, cy = Math.floor(i / GXZ);
      const hsh = Math.sin(i * 12.9898) * 43758.5453, fr = hsh - Math.floor(hsh);
      const jx = (fr - 0.5) * 0.9 + Math.sin(this.time * 0.31 + fr * 20) * 0.3;
      const jz = (((fr * 7.13) % 1) - 0.5) * 0.9 + Math.cos(this.time * 0.27 + fr * 13) * 0.3;
      const jy = (((fr * 3.71) % 1) - 0.5) * 0.6 + Math.sin(this.time * 0.4 + fr * 9) * 0.2;
      // у стен клуб меньше — не вылезает сквозь блоки
      let tight = false;
      for (let k = 0; k < 6; k++) if (F.permAt(i, k) < 4) { tight = true; break; }
      const base = tight ? 2.3 : 3.5;
      const size = base * (0.85 + Math.min(0.55, d * 0.16));
      const alpha = (1 - Math.exp(-d * 1.8)) * 0.86;
      const dark = F.D[i] > 0.001 ? Math.min(1, F.P[i] / F.D[i]) : 0.5;
      const hr = F.D[i] > 0.001 ? Math.min(1, F.H[i] / F.D[i]) : 0, hk = Math.max(0, (hr - 0.5) * 2), heat = hk * hk * Math.min(1, d) * 0.5;
      const gray = 0.8 - dark * 0.66;
      const x = cx * CS + 1 + jx, y = cy * CS + 1 + jy, z = cz * CS + 1 + jz;
      sm.push(x, y, z, size, gray, gray * 0.98, gray * 0.95, alpha, fr * 6.28 + this.time * (fr - 0.5) * 0.08, fr * 10, heat, 0.4);
      if (twin && d > 0.5 && !tight) sm.push(x + (fr - 0.5) * 1.6, y + 0.5, z - (fr - 0.5) * 1.4, size * 0.8, gray * 1.05, gray, gray * 0.95, alpha * 0.6, fr * 3.1, fr * 10 + 5, heat * 0.5, 0.6);
    }
    sm.end(cam);
    this.flames.end(cam);
    this.flames.begin(); // следующий кадр заполнит огонь заново

    // затемнение экрана, когда сам стоишь в дыму
    const dc = F.sample(cam.x, cam.y, cam.z);
    const target = Math.min(0.88, Math.max(0, (dc - 0.25) * 0.42));
    this.veil += (target - this.veil) * Math.min(1, dt * 3);
    this.veilHeat = F.heatAt(cam.x, cam.y, cam.z);

    // свет от огня и вспышки (только освещённый режим)
    if (this.lights.length) this.updateLights(dt, cam, fires);
    else for (const f of this.flash) f.t += dt;
    this.flash = this.flash.filter(f => f.t < f.dur);
  }

  updateLights(dt, cam, fires) {
    const L = this.lights;
    let li = 0;
    // вспышки взрывов важнее
    for (const f of this.flash) {
      f.t += dt;
      if (li >= L.length) continue;
      const k = Math.max(0, 1 - f.t / f.dur);
      const l = L[li++]; l.position.set(f.x, f.y, f.z); l.color.setHex(0xffb060); l.intensity = f.power * k * k * 6; l.distance = 22;
    }
    // ближайшие пожары
    if (li < L.length && fires && fires.size) {
      const best = [];
      for (const c of fires.values()) {
        const d = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2;
        if (d > 1600) continue;
        best.push([d, c]);
      }
      best.sort((a, b) => a[0] - b[0]);
      const used = [];
      for (const [, c] of best) {
        if (li >= L.length) break;
        if (used.some(u => Math.abs(u.x - c.x) + Math.abs(u.z - c.z) + Math.abs(u.y - c.y) < 6)) continue;
        used.push(c);
        const l = L[li++];
        const fl = 0.8 + Math.sin(this.time * 17 + c.x) * 0.12 + Math.sin(this.time * 29 + c.z) * 0.08;
        l.position.set(c.x + 0.5, c.y + 1.2, c.z + 0.5); l.color.setHex(0xff7a2a); l.intensity = 9 * fl; l.distance = 12;
      }
    }
    for (; li < L.length; li++) L[li].intensity = 0;
  }
}

// цвет пыли от земли под взрывом
const DUST_TINT = { 1: [0.5, 0.46, 0.36], 2: [0.5, 0.4, 0.3], 4: [0.82, 0.76, 0.58], 22: [0.82, 0.74, 0.56], 23: [0.8, 0.72, 0.55], 29: [0.82, 0.74, 0.56], 20: [0.92, 0.94, 0.98], 3: [0.6, 0.6, 0.6], 9: [0.7, 0.7, 0.68] };

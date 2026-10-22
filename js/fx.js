// Эффекты: частицы (один draw call на пул), обломки (InstancedMesh), трассеры, дырки от пуль, вспышки.
import * as THREE from './lib/three.module.min.js';
import { BLOCKS } from './blocks.js';
import { TEAM_COLORS } from './chicken.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1), ZUP = new THREE.Vector3(0, 0, 1);
const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Particles {
  constructor(scene, max, additive, world) {
    this.max = max; this.n = 0; this.world = world;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uHard: { value: additive ? 0.0 : 0.25 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(256.0, aSize*uScale/max(0.1,-mv.z)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; uniform float uHard;
        void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
        float a=vA*smoothstep(0.5, uHard, d); gl_FragColor=vec4(vC, a); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
    // состояние
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max);
    this.drag = new Float32Array(max); this.a0 = new Float32Array(max); this.bounce = new Uint8Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, opt = {}) {
    let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    const e = opt.end || null;
    this.c1[i3] = e ? e[0] : r; this.c1[i3 + 1] = e ? e[1] : g; this.c1[i3 + 2] = e ? e[2] : b;
    this.grav[i] = opt.grav ?? 0; this.drag[i] = opt.drag ?? 0; this.a0[i] = opt.alpha ?? 1; this.bounce[i] = opt.bounce ? 1 : 0;
  }
  update(dt) {
    const P = this.pos, V = this.v, w = this.world;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt; V[i3 + 2] *= dr;
      const nx = P[i3] + V[i3] * dt, ny = P[i3 + 1] + V[i3 + 1] * dt, nz = P[i3 + 2] + V[i3 + 2] * dt;
      if (this.bounce[i] && w.solid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        V[i3 + 1] *= -0.35; V[i3] *= 0.5; V[i3 + 2] *= 0.5;
      } else { P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[j3 + k]; this.v[i3 + k] = this.v[j3 + k];
      this.c0[i3 + k] = this.c0[j3 + k]; this.c1[i3 + k] = this.c1[j3 + k]; this.col[i3 + k] = this.col[j3 + k];
    }
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.a0[i] = this.a0[j]; this.bounce[i] = this.bounce[j];
    this.size[i] = this.size[j]; this.alpha[i] = this.alpha[j];
  }
  clear() { this.n = 0; }
}

class Debris {
  constructor(scene, max, world) {
    this.max = max; this.n = 0; this.world = world;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), rv: new THREE.Vector3(), s: 0.1, life: 0, max: 1, c: new THREE.Color() });
  }
  spawn(x, y, z, vx, vy, vz, size, color, life = 2.5) {
    let it;
    if (this.n < this.max) it = this.items[this.n++];
    else it = this.items[Math.floor(Math.random() * this.max)];
    it.p.set(x, y, z); it.v.set(vx, vy, vz); it.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    it.rv.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)); it.s = size; it.life = life; it.max = life;
    it.c.setHex(color).multiplyScalar(rnd(0.75, 1.1));
  }
  update(dt) {
    const w = this.world;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { const j = --this.n; this.items[i] = this.items[j]; this.items[j] = it; i--; continue; }
      it.v.y -= 25 * dt;
      const nx = it.p.x + it.v.x * dt, ny = it.p.y + it.v.y * dt, nz = it.p.z + it.v.z * dt;
      if (w.solid(Math.floor(it.p.x), Math.floor(ny - it.s * 0.5), Math.floor(it.p.z))) {
        it.v.y = Math.abs(it.v.y) > 2 ? -it.v.y * 0.35 : 0; it.v.x *= 0.6; it.v.z *= 0.6; it.rv.multiplyScalar(0.6);
        if (it.v.y === 0) it.p.y = Math.floor(ny - it.s * 0.5) + 1 + it.s * 0.5;
      } else it.p.y = ny;
      if (w.solid(Math.floor(nx), Math.floor(it.p.y), Math.floor(it.p.z))) it.v.x *= -0.4; else it.p.x = nx;
      if (w.solid(Math.floor(it.p.x), Math.floor(it.p.y), Math.floor(nz))) it.v.z *= -0.4; else it.p.z = nz;
      it.r.addScaledVector(it.rv, dt);
      const k = Math.min(1, it.life / 0.5);
      _e.set(it.r.x, it.r.y, it.r.z); _q.setFromEuler(_e);
      _s.setScalar(it.s * k);
      _m.compose(it.p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, it.c);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}

class Tracers {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.items = []; this.n = 0;
    for (let i = 0; i < max; i++) this.items.push({ a: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, t: 0, speed: 0, seg: 0, w: 0, c: new THREE.Color(), fade: 0, life: 0 });
    this._c = new THREE.Color();
  }
  // a -> b, отрезок длиной seg летит со скоростью speed
  add(a, b, color, w = 0.03, speed = 260, seg = 7) {
    const it = this.n < this.max ? this.items[this.n++] : this.items[Math.floor(Math.random() * this.max)];
    it.a.copy(a); it.d.subVectors(b, a); it.len = it.d.length(); it.d.divideScalar(it.len || 1);
    it.t = 0; it.speed = speed; it.seg = Math.min(seg, it.len); it.w = w; it.c.setHex(color);
    it.life = (it.len + it.seg) / speed + 0.04;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) { const j = --this.n; this.items[i] = this.items[j]; this.items[j] = it; i--; continue; }
      const head = Math.min(it.len, it.t * it.speed);
      const tail = Math.max(0, head - it.seg);
      const L = Math.max(0.01, head - tail);
      _v.copy(it.a).addScaledVector(it.d, head);
      _s.set(it.w, it.w, L);
      // ориентируем: отрезок от головы назад по -d
      _q.setFromUnitVectors(FWD, _neg.copy(it.d).negate());
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      const fade = head >= it.len ? Math.max(0, 1 - (it.t - it.len / it.speed) / 0.04) : 1;
      this._c.copy(it.c).multiplyScalar(fade);
      this.mesh.setColorAt(i, this._c);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}
const _neg = new THREE.Vector3();

class Decals {
  constructor(scene, max, tex) {
    this.max = max; this.i = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.cells = new Int32Array(max).fill(-1);
    scene.add(this.mesh);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  add(p, n, size, cell) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    if (this.mesh.count < this.max) this.mesh.count++;
    _v.copy(p).addScaledVector(n, 0.012);
    _q.setFromUnitVectors(ZUP, n);
    const rq = new THREE.Quaternion().setFromAxisAngle(ZUP, Math.random() * 6.28);
    _q.multiply(rq);
    _s.set(size, size, size);
    _m.compose(_v, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cells[i] = cell;
  }
  removeCell(cell) {
    let ch = false;
    for (let i = 0; i < this.max; i++) if (this.cells[i] === cell) { this.mesh.setMatrixAt(i, this.zero); this.cells[i] = -1; ch = true; }
    if (ch) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.cells.fill(-1); this.mesh.count = 0; this.i = 0; }
}

class Flashes {
  constructor(scene, max, tex) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.visible = false; sp.renderOrder = 6; scene.add(sp);
      this.items.push({ sp, life: 0, max: 1, s0: 1, s1: 1 });
    }
    this.k = 0;
  }
  add(p, size, life, color = 0xffffff, grow = 1) {
    const it = this.items[this.k]; this.k = (this.k + 1) % this.items.length;
    it.sp.position.copy(p); it.sp.visible = true; it.life = life; it.max = life; it.s0 = size; it.s1 = size * grow;
    it.sp.material.color.setHex(color); it.sp.material.rotation = Math.random() * 6.28;
    it.sp.scale.setScalar(size);
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.sp.visible) continue;
      it.life -= dt;
      if (it.life <= 0) { it.sp.visible = false; continue; }
      const t = 1 - it.life / it.max;
      it.sp.scale.setScalar(it.s0 + (it.s1 - it.s0) * t);
      it.sp.material.opacity = 1 - t * t;
    }
  }
}

function hexRGB(h, j = 0) {
  const k = 1 + (Math.random() - 0.5) * j;
  return [((h >> 16) & 255) / 255 * k, ((h >> 8) & 255) / 255 * k, (h & 255) / 255 * k];
}

export class FX {
  constructor(scene, world, quality) {
    this.scene = scene; this.world = world;
    const q = quality === 'low' ? 0.5 : 1;
    this.q = q;
    this.dust = new Particles(scene, Math.floor(2500 * q), false, world);
    this.glow = new Particles(scene, Math.floor(2000 * q), true, world);
    this.debris = new Debris(scene, Math.floor(450 * q), world);
    this.tracers = new Tracers(scene, 96);
    const holeTex = canvasTex(32, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.35, 'rgba(25,20,15,0.85)'); g.addColorStop(0.6, 'rgba(40,35,30,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    });
    this.decals = new Decals(scene, quality === 'low' ? 150 : 320, holeTex);
    const flashTex = canvasTex(64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,210,120,0.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255,230,160,0.9)'; c.lineWidth = 4;
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; c.beginPath(); c.moveTo(s / 2, s / 2); c.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48); c.stroke(); }
    });
    const ringTex = canvasTex(64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,240,200,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    });
    this.flashes = new Flashes(scene, 24, flashTex);
    this.rings = new Flashes(scene, 6, ringTex);
    this.delayed = [];
    this.time = 0;
  }

  setScale(px) { this.dust.mat.uniforms.uScale.value = px; this.glow.mat.uniforms.uScale.value = px; }

  later(delay, fn) { this.delayed.push({ t: this.time + delay, fn }); }

  muzzle(p, dir, w, fp = false) {
    const big = w.key === 'hmg' || w.key === 'sniper' || w.key === 'shotgun' || w.key === 'rpg';
    if (!fp) this.flashes.add(p, big ? rnd(0.7, 1.0) : rnd(0.4, 0.6), 0.05, 0xffffff, 1.4);
    for (let i = 0; i < (big ? 6 : 3); i++) {
      const s = rnd(4, 12);
      this.glow.spawn(p.x, p.y, p.z, dir.x * s + rnd(-1.5, 1.5), dir.y * s + rnd(-1.5, 1.5), dir.z * s + rnd(-1.5, 1.5), rnd(0.04, 0.1), 0.12, 0.02, 1, 0.8, 0.4, { drag: 8 });
    }
    // дымок из ствола
    this.dust.spawn(p.x, p.y, p.z, dir.x * 1.5 + rnd(-0.3, 0.3), 0.6, dir.z * 1.5, rnd(0.4, 0.8), 0.15, big ? 0.8 : 0.45, 0.75, 0.75, 0.75, { drag: 2, alpha: 0.35 });
  }

  // пуля попала в блок
  impact(p, n, id, cell, strength = 1) {
    const def = BLOCKS[id] || BLOCKS[1];
    const c = hexRGB(def.color, 0);
    const cnt = Math.ceil((5 + strength * 4) * this.q);
    for (let i = 0; i < cnt; i++) {
      const s = rnd(1.5, 5);
      this.dust.spawn(p.x, p.y, p.z, n.x * s + rnd(-2, 2), n.y * s + rnd(-1, 3), n.z * s + rnd(-2, 2), rnd(0.3, 0.7), rnd(0.06, 0.12), 0.02, c[0] * rnd(0.8, 1.1), c[1] * rnd(0.8, 1.1), c[2] * rnd(0.8, 1.1), { grav: 14, drag: 1.5, bounce: true });
    }
    // облачко пыли
    this.dust.spawn(p.x + n.x * 0.1, p.y + n.y * 0.1, p.z + n.z * 0.1, n.x, n.y + 0.4, n.z, rnd(0.5, 0.9), 0.2, 0.7 + strength * 0.3, c[0] * 0.9 + 0.1, c[1] * 0.9 + 0.1, c[2] * 0.9 + 0.1, { drag: 3, alpha: 0.5 });
    if (Math.random() < 0.5 * strength) this.debris.spawn(p.x + n.x * 0.1, p.y + n.y * 0.1, p.z + n.z * 0.1, n.x * rnd(2, 4) + rnd(-1.5, 1.5), rnd(2, 5), n.z * rnd(2, 4) + rnd(-1.5, 1.5), rnd(0.06, 0.12), def.color, 1.5);
    if (def.ric || def.hp >= 150) {
      for (let i = 0; i < 4 + strength * 3; i++) {
        const s = rnd(4, 10);
        this.glow.spawn(p.x, p.y, p.z, n.x * s + rnd(-4, 4), n.y * s + rnd(-2, 5), n.z * s + rnd(-4, 4), rnd(0.15, 0.35), 0.06, 0.02, 1, 0.85, 0.45, { grav: 18, bounce: true, end: [1, 0.35, 0.05] });
      }
      this.flashes.add(_v.copy(p).addScaledVector(n, 0.05), 0.25, 0.04, 0xffe0a0);
    }
    if (!def.glass) this.decals.add(p, n, rnd(0.15, 0.22) * (strength > 1.5 ? 1.5 : 1), cell);
  }

  ricochet(p, dir) {
    _v.copy(p).addScaledVector(dir, rnd(6, 14));
    this.tracers.add(p, _v, 0xfff0b0, 0.02, 200, 3);
    for (let i = 0; i < 5; i++) this.glow.spawn(p.x, p.y, p.z, dir.x * 8 + rnd(-3, 3), dir.y * 8 + rnd(-3, 3), dir.z * 8 + rnd(-3, 3), rnd(0.1, 0.25), 0.07, 0.02, 1, 0.9, 0.6, { grav: 10 });
  }

  feathers(p, n = 8, team = 0, blood = true) {
    const tc = hexRGB(TEAM_COLORS[team]);
    for (let i = 0; i < n * this.q + 1; i++) {
      const white = Math.random() < 0.8;
      const c = white ? [0.97, 0.96, 0.92] : tc;
      this.dust.spawn(p.x + rnd(-0.2, 0.2), p.y + rnd(-0.2, 0.2), p.z + rnd(-0.2, 0.2), rnd(-3, 3), rnd(0.5, 4), rnd(-3, 3), rnd(1.2, 2.6), rnd(0.12, 0.2), 0.08, c[0], c[1], c[2], { grav: 1.6, drag: 3.5 });
    }
    if (blood) for (let i = 0; i < n * 0.6; i++) {
      this.dust.spawn(p.x, p.y, p.z, rnd(-3, 3), rnd(0, 4), rnd(-3, 3), rnd(0.3, 0.6), 0.08, 0.03, 0.75, 0.05, 0.05, { grav: 16, bounce: true });
    }
  }

  blockBreak(x, y, z, id, many = true) {
    const def = BLOCKS[id]; if (!def) return;
    const cnt = Math.ceil((many ? 9 : 2) * this.q);
    for (let i = 0; i < cnt; i++) {
      this.debris.spawn(x + rnd(0.15, 0.85), y + rnd(0.15, 0.85), z + rnd(0.15, 0.85), rnd(-4, 4), rnd(2, 7), rnd(-4, 4), rnd(0.12, 0.26), def.color, rnd(1.5, 3));
    }
    const c = hexRGB(def.color);
    for (let i = 0; i < (many ? 6 : 2); i++) {
      this.dust.spawn(x + 0.5, y + 0.5, z + 0.5, rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5), rnd(0.6, 1.2), 0.4, 1.4, c[0] * 0.8 + 0.15, c[1] * 0.8 + 0.15, c[2] * 0.8 + 0.15, { drag: 2.5, alpha: 0.45 });
    }
    if (def.glass) for (let i = 0; i < 12; i++) this.glow.spawn(x + 0.5, y + 0.5, z + 0.5, rnd(-4, 4), rnd(0, 5), rnd(-4, 4), rnd(0.4, 0.8), 0.07, 0.04, 0.6, 0.85, 1.0, { grav: 18, bounce: true });
    this.decals.removeCell(this.world.idx(x, y, z));
  }

  explosion(p, radius) {
    const r = radius;
    this.flashes.add(p, r * 3.2, 0.25, 0xffffff, 1.3);
    this.flashes.add(p, r * 2.0, 0.45, 0xffaa44, 1.8);
    this.rings.add(p, r * 0.8, 0.35, 0xffffff, 5);
    for (let i = 0; i < 40 * this.q + 10; i++) {
      const d = _v.set(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize(), s = rnd(4, 14);
      this.glow.spawn(p.x, p.y, p.z, d.x * s, d.y * s + 2, d.z * s, rnd(0.25, 0.6), rnd(0.5, 1.1), 0.2, 1, rnd(0.6, 0.9), 0.25, { drag: 4, end: [0.6, 0.1, 0.02] });
    }
    for (let i = 0; i < 30 * this.q + 6; i++) {
      const d = _v.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize(), s = rnd(10, 24);
      this.glow.spawn(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.3, 0.9), 0.1, 0.03, 1, 0.8, 0.3, { grav: 20, drag: 1, bounce: true, end: [1, 0.3, 0] });
    }
    for (let i = 0; i < 26 * this.q + 6; i++) {
      const d = _v.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize(), s = rnd(1, 5);
      const g = rnd(0.12, 0.3);
      this.dust.spawn(p.x + d.x * r * 0.4, p.y + d.y * r * 0.3, p.z + d.z * r * 0.4, d.x * s, d.y * s + 1.5, d.z * s, rnd(1.5, 3.5), rnd(0.8, 1.4), rnd(2.5, 4.0), g, g, g, { drag: 1.8, alpha: 0.75, grav: -0.6 });
    }
    // земля разлетается — комья
    for (let i = 0; i < 14 * this.q + 4; i++) {
      const id = this.world.get(Math.floor(p.x), Math.floor(p.y - 1), Math.floor(p.z)) || 2;
      const col = BLOCKS[id] ? BLOCKS[id].color : 0x7a5232;
      this.debris.spawn(p.x + rnd(-0.5, 0.5), p.y + rnd(0, 0.5), p.z + rnd(-0.5, 0.5), rnd(-9, 9), rnd(6, 15), rnd(-9, 9), rnd(0.15, 0.35), col, rnd(2, 3.5));
    }
  }

  rocketTrail(p) {
    this.glow.spawn(p.x, p.y, p.z, rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(0.08, 0.15), 0.35, 0.1, 1, 0.7, 0.2, { end: [1, 0.2, 0] });
    this.dust.spawn(p.x, p.y, p.z, rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4), rnd(0.8, 1.6), 0.25, 1.1, 0.72, 0.72, 0.72, { drag: 1.5, alpha: 0.5 });
  }

  spawnPuff(p, team) {
    const c = hexRGB(TEAM_COLORS[team]);
    for (let i = 0; i < 20; i++) this.glow.spawn(p.x + rnd(-0.4, 0.4), p.y + rnd(0, 1.5), p.z + rnd(-0.4, 0.4), rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(0.4, 0.8), 0.25, 0.05, c[0], c[1], c[2]);
  }

  update(dt) {
    this.time += dt;
    if (this.delayed.length) {
      for (let i = 0; i < this.delayed.length; i++) {
        const d = this.delayed[i];
        if (d.t <= this.time) { d.fn(); this.delayed.splice(i, 1); i--; }
      }
    }
    this.dust.update(dt); this.glow.update(dt); this.debris.update(dt); this.tracers.update(dt);
    this.flashes.update(dt); this.rings.update(dt);
  }

  clear() {
    this.dust.clear(); this.glow.clear(); this.debris.clear(); this.tracers.clear(); this.decals.clear(); this.delayed.length = 0;
  }
}

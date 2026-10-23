// Эффекты кампании: вертолёт, дождь, пепел, ядерный гриб.
import * as THREE from './lib/three.module.min.js';
import { Batch, PREMUL, SMOKE_VS, SMOKE_FS, noiseTex } from './vfx.js';
import { SY } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const BOX = new THREE.BoxGeometry(1, 1, 1);
function bx(g, w, h, d, m, x, y, z) { const b = new THREE.Mesh(BOX, m); b.scale.set(w, h, d); b.position.set(x, y, z); g.add(b); return b; }
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ===================== ВЕРТОЛЁТ =====================
// Нос смотрит в -z (как у кур). Левый борт открыт — дверь, через неё садятся и стреляют.
export class Heli {
  constructor(scene, opts = {}) {
    this.scene = scene;
    const g = this.root = new THREE.Group();
    const body = this.body = new THREE.Group(); g.add(body);
    const olive = lam(opts.color ?? 0x4a5530), dark = lam(0x2c3220), glass = lam(0x1d2a36, { transparent: true, opacity: 0.75 }), red = lam(0xc8302c), metal = lam(0x30343a);
    // корпус из панелей (изнутри тоже видно стены)
    bx(body, 2.8, 0.2, 6.2, dark, 0, 0.1, 0);              // пол
    bx(body, 2.8, 0.25, 6.2, olive, 0, 2.6, 0);             // крыша
    bx(body, 0.15, 2.5, 6.2, olive, 1.35, 1.35, 0);         // правый борт
    bx(body, 0.15, 2.5, 1.6, olive, -1.35, 1.35, 2.3);      // левый борт сзади двери
    bx(body, 0.15, 0.6, 2.6, olive, -1.35, 2.3, -0.4);      // над дверью
    bx(body, 2.8, 2.5, 0.2, olive, 0, 1.35, 3.1);           // задняя стенка
    bx(body, 2.6, 1.6, 1.4, glass, 0, 1.25, -3.6);          // остекление кабины
    bx(body, 2.6, 0.7, 1.6, olive, 0, 0.3, -3.6);           // нос снизу
    bx(body, 2.0, 0.4, 0.6, olive, 0, 2.3, -3.9);
    bx(body, 0.16, 0.6, 1.2, red, 1.44, 1.6, 0.6);          // красная звезда-полоса
    bx(body, 0.16, 0.6, 1.2, red, -1.44, 1.6, 2.3);
    // сиденья и пулемёт в двери
    for (const z of [0.8, 1.9]) bx(body, 2.2, 0.5, 0.6, dark, 0.2, 0.55, z);
    this.gun = new THREE.Group(); this.gun.position.set(-1.2, 1.25, -0.6); body.add(this.gun);
    bx(this.gun, 0.12, 0.12, 1.4, metal, 0, 0, -0.5); bx(this.gun, 0.2, 0.25, 0.5, metal, 0, -0.05, 0.2);
    // хвост
    bx(body, 0.8, 0.8, 6.5, olive, 0, 2.0, 6.4);
    bx(body, 0.2, 2.2, 1.3, olive, 0, 3.0, 9.4);
    bx(body, 2.2, 0.15, 0.9, olive, 0, 2.2, 8.6);
    this.trotor = new THREE.Group(); this.trotor.position.set(0.25, 3.0, 9.5); body.add(this.trotor);
    bx(this.trotor, 0.06, 2.2, 0.22, metal, 0, 0, 0); bx(this.trotor, 0.06, 0.22, 2.2, metal, 0, 0, 0);
    // полозья
    for (const sx of [-1.2, 1.2]) { bx(body, 0.16, 0.16, 6.4, metal, sx, -0.75, -0.2); bx(body, 0.12, 0.7, 0.12, metal, sx, -0.35, -1.8); bx(body, 0.12, 0.7, 0.12, metal, sx, -0.35, 1.5); }
    // несущий винт
    this.rotor = new THREE.Group(); this.rotor.position.set(0, 3.2, 0); body.add(this.rotor);
    bx(body, 0.4, 0.5, 0.4, metal, 0, 2.95, 0);
    for (let k = 0; k < 2; k++) { const b = bx(this.rotor, 14, 0.06, 0.45, metal, 0, 0, 0); b.rotation.y = k * Math.PI / 2; }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    // луч прожектора (для ночи)
    if (opts.light) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      cone.position.set(0, -12.5, -3.5); body.add(cone); this.cone = cone;
      const pl = new THREE.PointLight(0xfff0c8, 0, 30, 1.6); pl.position.set(0, -6, -4); body.add(pl); this.light = pl;
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(g);
    this.pos = g.position; this.yaw = 0; this.pitch = 0; this.roll = 0; this.spin = 0;
    this.path = null; this.arrived = true; this.t = 0; this.bob = 1; this.rotorV = opts.idle ? 0 : 1;
  }
  set(x, y, z, yaw = this.yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.path = null; this.arrived = true; return this; }
  // лететь через точки за dur секунд; face — смотреть по ходу
  fly(points, dur, opts = {}) {
    const pts = [this.pos.clone(), ...points.map(p => new THREE.Vector3(p[0], p[1], p[2]))];
    this.path = { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), t: 0, dur, face: opts.face !== false, yaw: opts.yaw, lin: opts.linear };
    this.arrived = false;
    return this;
  }
  // точка у двери (куда бежать игроку), в мире
  door(out = new THREE.Vector3()) { return this.root.localToWorld(out.set(-2.4, -0.4, -0.4)); }
  seat(out = new THREE.Vector3()) { return this.root.localToWorld(out.set(-0.85, 1.6, -0.3)); }
  // точка снаружи за дверью — куда смотреть из кабины
  out(out = new THREE.Vector3()) { return this.root.localToWorld(out.set(-30, -1.5, -6)); }
  update(dt) {
    this.t += dt;
    const P = this.path;
    if (P) {
      P.t = Math.min(P.dur, P.t + dt);
      const u = P.lin ? P.t / P.dur : ease(P.t / P.dur);
      const p = P.curve.getPointAt(u);
      const tan = P.curve.getTangentAt(Math.min(0.999, u + 0.001));
      const prevYaw = this.yaw;
      if (P.face && Math.hypot(tan.x, tan.z) > 0.2) {
        const ty = Math.atan2(-tan.x, -tan.z);
        let d = ty - this.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        this.yaw += d * Math.min(1, dt * 2.2);
      } else if (P.yaw !== undefined) {
        let d = P.yaw - this.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        this.yaw += d * Math.min(1, dt * 1.5);
      }
      const speed = p.distanceTo(this.pos) / Math.max(dt, 1e-3);
      this.pos.copy(p);
      this.pitch += (Math.min(0.28, speed * 0.012) - this.pitch) * Math.min(1, dt * 2);
      let dy = this.yaw - prevYaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
      this.roll += (Math.max(-0.4, Math.min(0.4, dy / Math.max(dt, 1e-3) * 0.35)) - this.roll) * Math.min(1, dt * 3);
      if (P.t >= P.dur) { this.path = null; this.arrived = true; }
    } else { this.pitch *= 1 - Math.min(1, dt * 1.5); this.roll *= 1 - Math.min(1, dt * 1.5); }
    if (this.spin) this.yaw += this.spin * dt;
    const bob = Math.sin(this.t * 1.7) * 0.12 * this.bob;
    this.root.position.copy(this.pos); this.root.position.y += bob;
    this.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.rotor.rotation.y += dt * 26 * this.rotorV;
    this.trotor.rotation.x += dt * 40 * this.rotorV;
    if (this.light) this.light.intensity = 2.2;
  }
  dispose() { this.scene.remove(this.root); }
}

// ===================== ДОЖДЬ =====================
export class Rain {
  constructor(scene, world, n = 900) {
    this.w = world; this.n = n;
    this.pos = new Float32Array(n * 6);
    this.d = new Float32Array(n * 4); // x, z, y-пол, скорость
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8b8cc, transparent: true, opacity: 0.38, depthWrite: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh); this.scene = scene;
    this.wind = [3, 1]; this.init = false;
  }
  floor(x, z) {
    const w = this.w, xi = Math.floor(x), zi = Math.floor(z);
    for (let y = SY - 1; y > 0; y--) if (w.solid(xi, y, zi) || w.liquid(xi, y, zi)) return y + 1;
    return 0;
  }
  respawn(i, c, top) {
    const R = 22, x = c.x + rnd(-R, R), z = c.z + rnd(-R, R);
    const D = this.d; D[i * 4] = x; D[i * 4 + 1] = z; D[i * 4 + 2] = this.floor(x, z); D[i * 4 + 3] = rnd(20, 26);
    const P = this.pos, o = i * 6;
    P[o] = x; P[o + 1] = top ? c.y + rnd(8, 18) : c.y + rnd(-8, 18); P[o + 2] = z;
    P[o + 3] = x; P[o + 4] = P[o + 1] + 0.6; P[o + 5] = z;
  }
  update(dt, cam) {
    const c = cam.position, P = this.pos, D = this.d;
    if (!this.init) { for (let i = 0; i < this.n; i++) this.respawn(i, c, false); this.init = true; }
    const wx = this.wind[0], wz = this.wind[1];
    for (let i = 0; i < this.n; i++) {
      const o = i * 6, v = D[i * 4 + 3];
      P[o] += wx * dt; P[o + 2] += wz * dt; P[o + 1] -= v * dt;
      const dx = P[o] - c.x, dz = P[o + 2] - c.z;
      if (P[o + 1] < D[i * 4 + 2] || P[o + 1] < c.y - 12 || dx * dx + dz * dz > 700) { this.respawn(i, c, true); continue; }
      P[o + 3] = P[o] - wx * 0.035; P[o + 4] = P[o + 1] + v * 0.035; P[o + 5] = P[o + 2] - wz * 0.035;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); }
}

// ===================== ПЕПЕЛ / СНЕГ / ИСКРЫ =====================
export class Ash {
  constructor(scene, n = 1200, color = 0xd8d0c8, size = 0.09, fall = 0.8) {
    this.n = n; this.fall = fall;
    this.pos = new Float32Array(n * 3); this.ph = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh); this.scene = scene; this.init = false; this.t = 0;
  }
  update(dt, cam) {
    const c = cam.position, P = this.pos, R = 18;
    this.t += dt;
    if (!this.init) { for (let i = 0; i < this.n; i++) { P[i * 3] = c.x + rnd(-R, R); P[i * 3 + 1] = c.y + rnd(-6, 14); P[i * 3 + 2] = c.z + rnd(-R, R); this.ph[i] = Math.random() * 6.28; } this.init = true; }
    for (let i = 0; i < this.n; i++) {
      const o = i * 3, ph = this.ph[i];
      P[o] += Math.sin(this.t * 0.7 + ph) * 0.5 * dt + 0.4 * dt; P[o + 1] -= this.fall * (0.6 + (ph % 1)) * dt; P[o + 2] += Math.cos(this.t * 0.5 + ph * 1.3) * 0.5 * dt;
      if (P[o + 1] < c.y - 6) { P[o + 1] = c.y + 14; P[o] = c.x + rnd(-R, R); P[o + 2] = c.z + rnd(-R, R); }
      if (P[o] - c.x > R) P[o] -= 2 * R; else if (P[o] - c.x < -R) P[o] += 2 * R;
      if (P[o + 2] - c.z > R) P[o + 2] -= 2 * R; else if (P[o + 2] - c.z < -R) P[o + 2] += 2 * R;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); }
}

// ===================== ЯДЕРНЫЙ ГРИБ =====================
// Вспышка → огненный шар → столб поднимается, наверху клубится тор «шляпки» (клубы катятся наружу),
// по земле расходится стена пыли. Клубы — тот же шейдер дыма, но без тумана (видно издалека).
export class Nuke {
  constructor(scene, x, y, z, k = 1) {
    this.scene = scene; this.c = new THREE.Vector3(x, y, z); this.k = k; this.T = 0;
    this.U = { tNoise: { value: noiseTex() }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.3, 0) }, uFogColor: { value: new THREE.Color(0x8a6a50) }, uFogNear: { value: 3000 }, uFogFar: { value: 6000 }, uAmb: { value: new THREE.Color(1, 1, 1) } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, uniforms: this.U, ...PREMUL });
    this.batch = new Batch(scene, 340, this.mat, 6);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flash.position.copy(this.c); scene.add(this.flash);
    const P = this.parts = [];
    for (let i = 0; i < 34; i++) P.push({ k: 'ball', a: Math.random() * 6.28, u: rnd(-1, 1), r: Math.random(), s: rnd(0.8, 1.2), seed: Math.random() * 10 });
    for (let i = 0; i < 90; i++) P.push({ k: 'cap', th: i / 90 * 6.283 + rnd(-0.05, 0.05), ph: Math.random() * 6.28, s: rnd(0.85, 1.25), seed: Math.random() * 10, rr: rnd(0.7, 1.05) });
    for (let i = 0; i < 46; i++) P.push({ k: 'stem', h: i / 46, a: Math.random() * 6.28, r: Math.random(), s: rnd(0.8, 1.2), seed: Math.random() * 10 });
    for (let i = 0; i < 70; i++) P.push({ k: 'base', th: i / 70 * 6.283 + rnd(-0.05, 0.05), s: rnd(0.8, 1.3), seed: Math.random() * 10, rr: rnd(0.85, 1.05) });
    for (let i = 0; i < 24; i++) P.push({ k: 'skirt', th: Math.random() * 6.283, s: rnd(0.8, 1.2), seed: Math.random() * 10, rr: rnd(0.6, 1) });
  }
  update(dt, cam) {
    const T = (this.T += dt), k = this.k, c = this.c, B = this.batch;
    this.U.uTime.value = T;
    // вспышка
    const fl = this.flash;
    if (T < 3) { fl.visible = true; fl.scale.setScalar((8 + Math.min(1, T / 0.6) * 38) * k); fl.material.opacity = Math.max(0, 1 - T / 3); fl.material.color.setRGB(1, 1 - T * 0.15, 0.9 - T * 0.3); }
    else fl.visible = false;
    const H = (12 + Math.min(1, T / 16) * 150) * k;                  // высота шляпки
    const Rm = (14 + Math.min(1, T / 18) * 52) * k, rm = (10 + Math.min(1, T / 18) * 20) * k;
    const heatBall = Math.max(0, 1.45 - T * 0.07), heatCap = Math.max(0, 1.2 - T * 0.055);
    B.begin();
    for (const p of this.parts) {
      let x, y, z, s, gray = 0.32, a = 0.92, heat = 0, flow = 0.6;
      if (p.k === 'ball') {
        // огненный шар поднимается и становится нижней частью шляпки
        const R = (10 + Math.min(1, T / 2.5) * 22) * k * p.r, sp = Math.sqrt(1 - p.u * p.u);
        const lift = Math.min(H * 0.92, T * 18 * k);
        x = c.x + Math.cos(p.a) * sp * R; y = c.y + 14 * k + lift + p.u * R * 0.7; z = c.z + Math.sin(p.a) * sp * R;
        s = (16 + Math.min(1, T / 3) * 18) * k * p.s; heat = heatBall * (1.1 - p.r * 0.3); gray = 0.2;
      } else if (p.k === 'cap') {
        const ph = p.ph + T * 0.45, th = p.th + T * 0.03;
        const R = Rm + Math.cos(ph) * rm * p.rr;
        x = c.x + Math.cos(th) * R; z = c.z + Math.sin(th) * R; y = c.y + H + Math.sin(ph) * rm * 0.8 * p.rr;
        s = rm * 1.45 * p.s; heat = heatCap * (Math.sin(ph) < 0 ? 0.9 : 0.45); gray = 0.4 + Math.sin(ph) * 0.06;
        if (T < 4) a *= T / 4;
      } else if (p.k === 'stem') {
        const hh = p.h * H * 0.95, w = (5 + p.h * 9 + Math.sin(p.h * 9 + T) * 1.5) * k;
        x = c.x + Math.cos(p.a + T * 0.2) * w * p.r * 0.6; z = c.z + Math.sin(p.a + T * 0.2) * w * p.r * 0.6; y = c.y + hh;
        s = w * 1.9 * p.s; heat = Math.max(0, heatBall * (1 - p.h) * 0.8); gray = 0.42; flow = 1.2;
        if (hh < 4 || T < 1.5) a *= Math.min(1, T / 1.5);
      } else if (p.k === 'base') {
        // стена пыли расходится по земле
        const R = Math.min(380, 8 + T * 40) * k * p.rr;
        x = c.x + Math.cos(p.th) * R; z = c.z + Math.sin(p.th) * R; y = c.y + 4 * k + Math.min(14, T * 0.8) * k;
        s = (18 + Math.min(30, T * 2)) * k * p.s; gray = 0.62; a = 0.85 * Math.max(0, 1 - T / 60); heat = Math.max(0, 0.6 - T * 0.2);
      } else {
        // юбка пыли у основания столба
        const R = (10 + Math.min(1, T / 10) * 40) * k * p.rr;
        x = c.x + Math.cos(p.th) * R; z = c.z + Math.sin(p.th) * R; y = c.y + 6 * k;
        s = 26 * k * p.s; gray = 0.5; a = 0.9 * Math.min(1, T / 3);
      }
      const col = gray;
      B.push(x, y, z, s, col * 1.0, col * 0.86, col * 0.72, a, p.seed * 2, p.seed, heat, flow);
    }
    B.end(cam.position);
  }
  dispose() { this.scene.remove(this.batch.mesh); this.scene.remove(this.flash); this.batch.geo.dispose(); }
}

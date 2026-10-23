// Модель курицы из коробок, оружие в крыльях, анимация.
import * as THREE from './lib/three.module.min.js';
import { WEAPONS } from './weapons.js';
import { BLOCKS } from './blocks.js';

const matCache = new Map();
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const _col = new THREE.Color();

// Склеивает все меши-коробки, лежащие прямо в группе, в один меш с вершинными цветами (меньше draw calls)
function mergeGroup(g) {
  const parts = g.children.filter(c => c.isMesh && !c.userData.keep);
  if (parts.length < 2) return;
  let total = 0;
  const geos = parts.map(m => {
    m.updateMatrix();
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    total += geo.attributes.position.count;
    return [geo, m.material.color];
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const [geo, c] of geos) {
    const n = geo.attributes.position.count;
    pos.set(geo.attributes.position.array, o * 3);
    nor.set(geo.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += n;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  for (const m of parts) g.remove(m);
  g.add(new THREE.Mesh(merged, vcMat));
  void _col;
}
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
function box(w, h, d, color, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(boxGeo, mat(color));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function cyl(r, len, color, x, y, z, parent, axis = 'z') {
  const m = new THREE.Mesh(cylGeo, mat(color));
  m.scale.set(r, len, r); m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (parent) parent.add(m);
  return m;
}

export const TEAM_COLORS = [0xe0342c, 0x2f62e8];
export const TEAM_NAMES = ['Красные', 'Синие'];

const METAL = 0x2b2d31, METAL2 = 0x45484e, WOOD = 0x7a4a24, OLIVE = 0x4f5a2a;

function buildGun(key) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let spin = null;
  switch (key) {
    case 'ak':
      box(0.08, 0.1, 0.45, METAL, 0, 0, -0.12, g);
      cyl(0.02, 0.32, METAL2, 0, 0.015, -0.5, g);
      box(0.07, 0.11, 0.24, WOOD, 0, -0.02, 0.2, g);
      box(0.075, 0.06, 0.18, WOOD, 0, -0.03, -0.3, g);
      { const m = box(0.055, 0.2, 0.08, METAL2, 0, -0.13, -0.15, g); m.rotation.x = 0.35; }
      muzzle.position.set(0, 0.015, -0.68);
      break;
    case 'lmg':
      box(0.1, 0.13, 0.55, METAL, 0, 0, -0.1, g);
      cyl(0.028, 0.42, METAL2, 0, 0.02, -0.58, g);
      box(0.13, 0.13, 0.14, OLIVE, 0, -0.12, -0.08, g);
      box(0.08, 0.12, 0.26, METAL2, 0, -0.02, 0.28, g);
      { const l = box(0.015, 0.22, 0.015, METAL2, 0.04, -0.1, -0.62, g); l.rotation.z = 0.3; }
      { const l = box(0.015, 0.22, 0.015, METAL2, -0.04, -0.1, -0.62, g); l.rotation.z = -0.3; }
      muzzle.position.set(0, 0.02, -0.82);
      break;
    case 'sniper':
      box(0.07, 0.09, 0.6, 0x3a3f2a, 0, 0, -0.1, g);
      cyl(0.018, 0.55, METAL, 0, 0.01, -0.66, g);
      cyl(0.038, 0.3, METAL, 0, 0.1, -0.12, g);
      cyl(0.045, 0.04, 0x113355, 0, 0.1, -0.28, g);
      box(0.07, 0.13, 0.25, 0x3a3f2a, 0, -0.03, 0.3, g);
      box(0.05, 0.12, 0.06, METAL2, 0, -0.1, -0.05, g);
      muzzle.position.set(0, 0.01, -0.95);
      break;
    case 'hmg': {
      box(0.17, 0.17, 0.38, METAL, 0, 0, -0.02, g);
      box(0.2, 0.16, 0.2, OLIVE, 0.17, -0.04, 0.02, g);
      box(0.05, 0.14, 0.05, METAL2, 0, 0.13, 0.05, g);
      spin = new THREE.Group(); spin.position.set(0, 0, -0.2);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        cyl(0.016, 0.55, METAL2, Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.3, spin);
      }
      cyl(0.075, 0.05, METAL, 0, 0, -0.5, spin);
      g.add(spin);
      muzzle.position.set(0, 0, -0.8);
      break;
    }
    case 'shotgun':
      box(0.08, 0.1, 0.3, METAL, 0, 0, -0.05, g);
      cyl(0.022, 0.5, METAL2, 0.025, 0.02, -0.45, g);
      cyl(0.022, 0.5, METAL2, -0.025, 0.02, -0.45, g);
      box(0.085, 0.07, 0.22, WOOD, 0, -0.04, -0.35, g);
      box(0.07, 0.12, 0.26, WOOD, 0, -0.03, 0.22, g);
      muzzle.position.set(0, 0.02, -0.72);
      break;
    case 'rpg':
      cyl(0.075, 0.95, OLIVE, 0, 0.03, -0.18, g);
      { const c = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 8), mat(0x6a7a3a)); c.rotation.x = -Math.PI / 2; c.position.set(0, 0.03, -0.75); g.add(c); }
      box(0.05, 0.14, 0.06, METAL, 0, -0.1, -0.05, g);
      box(0.04, 0.06, 0.1, METAL, 0.08, 0.08, -0.15, g);
      muzzle.position.set(0, 0.03, -0.8);
      break;
    case 'build':
    default: {
      const b = box(0.24, 0.24, 0.24, 0xb08850, 0, 0, -0.18, g);
      b.material = b.material.clone();
      b.userData.keep = true;
      g.userData.block = b;
      muzzle.position.set(0, 0, -0.3);
    }
  }
  mergeGroup(g);
  if (spin) mergeGroup(spin);
  mergeGroup(g); // детали ствола — одним мешем
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.spin = spin;
  return g;
}

// головные уборы персонажей кампании
function hat(kind, head, o) {
  if (kind === 'boonie') { // панама с широкими полями и усы — капитан
    box(0.62, 0.05, 0.62, 0x5d6a3a, 0, 0.4, 0, head);
    box(0.44, 0.14, 0.44, 0x6b7844, 0, 0.48, 0, head);
    box(0.46, 0.04, 0.46, 0x3f4a26, 0, 0.43, 0, head);
    box(0.34, 0.06, 0.06, 0x4a3420, 0, 0.04, -0.33, head);
    box(0.08, 0.1, 0.06, 0x4a3420, 0.16, 0.0, -0.33, head); box(0.08, 0.1, 0.06, 0x4a3420, -0.16, 0.0, -0.33, head);
  } else if (kind === 'cap') { // фуражка генерала
    const c = o.capColor ?? 0x223355;
    box(0.5, 0.12, 0.52, c, 0, 0.44, 0.0, head);
    box(0.56, 0.06, 0.58, c, 0, 0.52, 0.0, head);
    box(0.5, 0.04, 0.2, 0x111111, 0, 0.39, -0.3, head);
    box(0.52, 0.04, 0.54, 0xd8b430, 0, 0.405, 0, head);
    box(0.1, 0.08, 0.04, 0xffd84a, 0, 0.47, -0.27, head);
  } else if (kind === 'helmet') { // каска
    const c = o.capColor ?? 0x55613a;
    box(0.54, 0.16, 0.54, c, 0, 0.42, 0, head);
    box(0.44, 0.08, 0.44, c, 0, 0.53, 0, head);
    box(0.6, 0.04, 0.6, c, 0, 0.35, 0, head);
  } else if (kind === 'beanie') { // вязаная шапка спецназа
    box(0.5, 0.2, 0.5, o.capColor ?? 0x222428, 0, 0.42, 0, head);
    box(0.52, 0.06, 0.52, 0x15161a, 0, 0.33, 0, head);
  }
}

function nameTag(name, team, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 34px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,0.8)';
  c.strokeText(name, 128, 34);
  c.fillStyle = color || (team === 0 ? '#ff7a70' : '#79a6ff');
  c.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.position.y = 1.95;
  sp.renderOrder = 5;
  return sp;
}

const shadowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class ChickenModel {
  // opts: vest — свой цвет жилета, hat — головной убор (boonie, cap, helmet, beanie), tag — цвет ника
  constructor(team, name, showTag = true, opts = {}) {
    const root = this.root = new THREE.Group();
    const inner = this.inner = new THREE.Group();
    root.add(inner);
    const WHITE = 0xf4f1ea, RED = 0xd8261e, YEL = 0xf5b21b, ORANGE = 0xf08a1c, TEAM = opts.vest ?? TEAM_COLORS[team];
    // тело
    this.body = new THREE.Group(); inner.add(this.body);
    box(0.64, 0.56, 0.8, WHITE, 0, 0.74, 0, this.body);
    box(0.68, 0.24, 0.84, TEAM, 0, 0.68, 0, this.body);                 // жилет
    box(0.2, 0.12, 0.06, 0xffffff, 0, 0.72, -0.43, this.body);           // нашивка
    { const t = box(0.46, 0.4, 0.22, WHITE, 0, 0.98, 0.44, this.body); t.rotation.x = -0.5; }
    { const t = box(0.34, 0.3, 0.16, 0xe8e2d6, 0, 1.12, 0.52, this.body); t.rotation.x = -0.7; }
    // голова
    this.head = new THREE.Group(); this.head.position.set(0, 1.08, -0.26); this.body.add(this.head);
    box(0.44, 0.46, 0.44, WHITE, 0, 0.17, 0, this.head);
    box(0.47, 0.09, 0.47, TEAM, 0, 0.3, 0, this.head);                 // повязка
    box(0.08, 0.12, 0.2, TEAM, 0, 0.3, 0.28, this.head);
    box(0.1, 0.14, 0.12, RED, 0, 0.46, -0.1, this.head);
    box(0.1, 0.18, 0.12, RED, 0, 0.48, 0.02, this.head);
    box(0.1, 0.12, 0.1, RED, 0, 0.45, 0.13, this.head);
    box(0.2, 0.1, 0.18, YEL, 0, 0.12, -0.3, this.head);                 // клюв
    box(0.16, 0.05, 0.14, 0xd99410, 0, 0.06, -0.28, this.head);
    box(0.08, 0.14, 0.06, RED, 0, -0.02, -0.25, this.head);            // бородка
    if (opts.hat) hat(opts.hat, this.head, opts);
    box(0.06, 0.09, 0.05, 0x111111, 0.15, 0.22, -0.21, this.head);       // глаза
    box(0.06, 0.09, 0.05, 0x111111, -0.15, 0.22, -0.21, this.head);
    box(0.02, 0.03, 0.02, 0xffffff, 0.16, 0.25, -0.24, this.head);
    box(0.02, 0.03, 0.02, 0xffffff, -0.14, 0.25, -0.24, this.head);
    // ноги
    this.legs = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.15, 0.48, 0.02); inner.add(leg);
      box(0.08, 0.46, 0.08, ORANGE, 0, -0.23, 0, leg);
      box(0.2, 0.05, 0.26, ORANGE, 0, -0.46, -0.06, leg);
      this.legs.push(leg);
    }
    // крылья
    this.wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 0.33, 0.96, 0.02); this.body.add(w);
      box(0.1, 0.4, 0.56, 0xe9e4da, sx * 0.04, -0.18, 0, w);
      box(0.06, 0.12, 0.3, TEAM, sx * 0.06, -0.32, 0.05, w);
      this.wings.push(w);
    }
    // оружие
    this.gunPivot = new THREE.Group(); this.gunPivot.position.set(0.24, 0.92, -0.22); this.body.add(this.gunPivot);
    this.gunHolder = new THREE.Group(); this.gunPivot.add(this.gunHolder);
    this.guns = WEAPONS.map(w => { const g = buildGun(w.key); g.visible = false; this.gunHolder.add(g); return g; });
    this.weapon = -1;
    this.setWeapon(0);
    // склейка статичных частей
    mergeGroup(this.body); mergeGroup(this.head);
    for (const l of this.legs) mergeGroup(l);
    for (const w of this.wings) mergeGroup(w);
    this.buildLod();
    // имя и тень
    if (showTag && name) { this.tag = nameTag(name, team, opts.tag); root.add(this.tag); }
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.scale.set(0.95, 1, 0.95);
    this.shadow.renderOrder = 1;
    this.phase = 0; this.flap = 0; this.kick = 0; this.deadT = 0; this.spinV = 0; this.hurtT = 0;
  }
  // упрощённая модель для дальних кур: всё тело одним мешем, без анимации частей
  buildLod() {
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.inner.matrixWorld).invert();
    const parts = [];
    for (const g of [this.body, this.head, ...this.legs, ...this.wings]) for (const c of g.children) if (c.isMesh && c.material === vcMat) parts.push(c);
    let total = 0;
    const geos = parts.map(m => { const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); total += geo.attributes.position.count; return geo; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += n; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    this.lod = new THREE.Mesh(geo, vcMat); this.lod.visible = false;
    this.inner.add(this.lod);
    this.far = false;
  }
  setLod(far) {
    if (far === this.far) return;
    this.far = far;
    this.lod.visible = far;
    this.body.visible = !far; for (const l of this.legs) l.visible = !far;
  }
  setWeapon(i) {
    if (i === this.weapon) return;
    if (this.weapon >= 0) this.guns[this.weapon].visible = false;
    this.weapon = i; this.guns[i].visible = true;
  }
  setBuildBlock(id) {
    const b = this.guns[this.guns.length - 1].userData.block;
    if (b && BLOCKS[id]) b.material.color.setHex(BLOCKS[id].color);
  }
  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.guns[this.weapon].userData.muzzle.getWorldPosition(out);
  }
  addTo(scene) { scene.add(this.root); scene.add(this.shadow); }
  removeFrom(scene) { scene.remove(this.root); scene.remove(this.shadow); }
  fire(power = 1) { this.kick = Math.min(1.2, this.kick + 0.6 * power); }
  hurt() { this.hurtT = 0.12; }

  // s: {speed, onGround, gliding, pitch, dead, firing, groundY}
  animate(dt, s) {
    if (this.far) {
      // далеко: только наклон оружия (для вспышек выстрела) и тень
      this.gunPivot.rotation.x = s.pitch;
      this.deadT = 0; this.inner.rotation.z = 0; this.inner.position.y = 0;
      this.updShadow(s);
      return;
    }
    const k = Math.min(1, s.speed / 5);
    if (s.onGround && s.speed > 0.3) this.phase += dt * (6 + s.speed * 1.6);
    else this.phase *= 0.9;
    const sw = Math.sin(this.phase) * 0.8 * k;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * k;
    this.body.rotation.z = Math.sin(this.phase) * 0.06 * k;
    // крылья
    if (s.gliding) { this.flap += dt * 28; const a = 0.6 + Math.sin(this.flap) * 0.6; this.wings[0].rotation.z = -a; this.wings[1].rotation.z = a; }
    else { this.wings[0].rotation.z = -0.05 - sw * 0.05; this.wings[1].rotation.z = 0.05 + sw * 0.05; }
    if (!s.onGround && !s.gliding) { this.legs[0].rotation.x = 0.5; this.legs[1].rotation.x = 0.3; }
    // голова и оружие по наклону взгляда
    this.head.rotation.x = s.pitch * 0.5;
    this.gunPivot.rotation.x = s.pitch;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.gunHolder.position.z = this.kick * 0.09;
    this.gunHolder.rotation.x = this.kick * 0.12;
    const spin = this.guns[this.weapon].userData.spin;
    if (spin) { this.spinV += ((s.firing ? 30 : 0) - this.spinV) * Math.min(1, dt * 4); spin.rotation.z += this.spinV * dt; }
    // смерть
    if (s.dead) { this.deadT = Math.min(1, this.deadT + dt * 3); }
    else this.deadT = 0;
    this.inner.rotation.z = this.deadT * Math.PI / 2;
    this.inner.position.y = -this.deadT * 0.25;
    // мигание при попадании
    this.hurtT -= dt;
    this.inner.scale.setScalar(this.hurtT > 0 ? 1.08 : 1);
    this.updShadow(s);
  }
  updShadow(s) {
    this.shadow.position.set(this.root.position.x, (s.groundY ?? this.root.position.y) + 0.02, this.root.position.z);
    const hgt = Math.max(0, this.root.position.y - (s.groundY ?? this.root.position.y));
    const sc = Math.max(0.3, 0.95 - hgt * 0.08);
    this.shadow.scale.set(sc, 1, sc);
    this.shadow.visible = this.root.visible && !this.shadowOff;
  }
}

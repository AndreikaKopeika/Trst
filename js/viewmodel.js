// Вид от первого лица: детальные модели оружия, куриные крылья, анимации (отдача, покачивание,
// перезарядка, смена оружия), гильзы, вспышка. Рисуется отдельной сценой поверх мира.
import * as THREE from './lib/three.module.min.js';
import { WEAPONS } from './weapons.js';
import { TEAM_COLORS } from './chicken.js';
import { BLOCKS, tileUV } from './blocks.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => t * t * (3 - 2 * t);

// ---------- процедурные текстуры ----------
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function woodTex(base, dark) {
  return canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = `rgba(${dark},${0.08 + Math.random() * 0.25})`;
      c.lineWidth = 0.5 + Math.random() * 2;
      c.beginPath();
      let x = Math.random() * w;
      c.moveTo(x, 0);
      for (let y = 0; y <= h; y += 8) { x += (Math.random() - 0.5) * 3; c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 3; i++) { // сучки
      const x = Math.random() * w, y = Math.random() * h;
      const g = c.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, `rgba(${dark},0.6)`); g.addColorStop(1, `rgba(${dark},0)`);
      c.fillStyle = g; c.fillRect(x - 8, y - 8, 16, 16);
    }
  });
}
function noiseTex(lo, hi, scratches = true) {
  return canvasTex(128, 128, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = lo + Math.random() * (hi - lo);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    if (scratches) {
      c.strokeStyle = `rgba(${lo},${lo},${lo},0.7)`;
      for (let i = 0; i < 25; i++) { c.lineWidth = Math.random(); c.beginPath(); const x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); c.lineTo(x + rnd(-20, 20), y + rnd(-6, 6)); c.stroke(); }
    }
  }, false);
}

// ---------- материалы ----------
function makeMats() {
  const rough = noiseTex(90, 170);
  const roughFine = noiseTex(60, 120, false);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  return {
    metal: S({ color: 0x2a2c30, metalness: 0.85, roughness: 0.55, roughnessMap: rough }),
    blued: S({ color: 0x1b1e23, metalness: 0.9, roughness: 0.4, roughnessMap: roughFine }),
    worn: S({ color: 0x4a4e55, metalness: 0.85, roughness: 0.35, roughnessMap: rough }),
    poly: S({ color: 0x191a1c, metalness: 0.05, roughness: 0.8 }),
    wood: S({ map: woodTex('#8a4f26', '40,18,6'), roughness: 0.55, metalness: 0.0 }),
    woodLight: S({ map: woodTex('#a8723e', '60,30,10'), roughness: 0.6, metalness: 0.0 }),
    bakelite: S({ color: 0x6e2a12, roughness: 0.32, metalness: 0.05 }),
    olive: S({ color: 0x4c5424, roughness: 0.62, metalness: 0.25, roughnessMap: rough }),
    oliveDark: S({ color: 0x343a18, roughness: 0.7, metalness: 0.2 }),
    brass: S({ color: 0xd4a843, roughness: 0.28, metalness: 1.0 }),
    glass: S({ color: 0x223a66, emissive: 0x0b1a3a, roughness: 0.05, metalness: 0.3 }),
    rubber: S({ color: 0x101010, roughness: 0.95, metalness: 0 }),
    red: S({ color: 0x9a1c14, roughness: 0.5, metalness: 0.1 }),
    feather: S({ color: 0xf2eee6, roughness: 0.92, metalness: 0 }),
    feather2: S({ color: 0xd9d3c7, roughness: 0.95, metalness: 0 }),
    team: S({ color: 0xe0342c, roughness: 0.8, metalness: 0 }),
  };
}

// ---------- геометрия ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function cylGeo(seg) { if (!cylCache.has(seg)) cylCache.set(seg, new THREE.CylinderGeometry(1, 1, 1, seg)); return cylCache.get(seg); }

function B(p, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  p.add(m); return m;
}
// цилиндр вдоль оси Z
function C(p, mat, r, len, x, y, z, seg = 14, rx = 0, ry = 0) {
  const m = new THREE.Mesh(cylGeo(seg), mat);
  m.scale.set(r, len, r); m.position.set(x, y, z);
  m.rotation.set(Math.PI / 2 + rx, ry, 0);
  p.add(m); return m;
}
// цилиндр вдоль оси Y
function CY(p, mat, r, len, x, y, z, seg = 12, rx = 0, rz = 0) {
  const m = new THREE.Mesh(cylGeo(seg), mat);
  m.scale.set(r, len, r); m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
  p.add(m); return m;
}
function cone(p, mat, r0, r1, len, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.set(x, y, z); m.rotation.x = -Math.PI / 2;
  p.add(m); return m;
}

// Склеивает статичные меши группы по материалам: десятки деталей -> несколько draw calls
function mergeStatic(g) {
  const byMat = new Map();
  for (const c of [...g.children]) {
    if (!c.isMesh || c.userData.keep) continue;
    c.updateMatrix();
    const geo = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo);
    g.remove(c);
  }
  for (const [mat, geos] of byMat) {
    let n = 0; for (const q of geos) n += q.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const q of geos) {
      const k = q.attributes.position.count;
      pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3);
      if (q.attributes.uv) uv.set(q.attributes.uv.array, o * 2);
      o += k; q.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    g.add(m);
  }
}
function sub(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function marker(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }

// ---------- модели оружия ----------
// Ствол смотрит в -Z, начало координат — у пистолетной рукоятки.
// sight — высота линии прицеливания, hip/ads — положение в кадре.
function buildAK(M) {
  const g = new THREE.Group(), P = {};
  // ствольная коробка и крышка
  B(g, M.metal, 0.048, 0.062, 0.33, 0, 0.012, -0.06);
  C(g, M.metal, 0.024, 0.3, 0, 0.04, -0.06, 16);
  for (let i = 0; i < 4; i++) B(g, M.worn, 0.05, 0.004, 0.006, 0, 0.066, 0.05 - i * 0.012);
  B(g, M.metal, 0.03, 0.03, 0.05, 0, 0.055, -0.23);                 // целик
  B(g, M.blued, 0.008, 0.012, 0.02, 0, 0.076, -0.23);
  B(g, M.worn, 0.006, 0.012, 0.11, -0.026, 0.0, -0.06);              // заклёпки/рёбра
  // цевьё и газовая трубка
  B(g, M.wood, 0.056, 0.05, 0.19, 0, -0.002, -0.335);
  B(g, M.wood, 0.046, 0.028, 0.16, 0, 0.048, -0.33);
  for (let i = 0; i < 3; i++) B(g, M.blued, 0.058, 0.052, 0.006, 0, 0, -0.25 - i * 0.075);
  C(g, M.metal, 0.012, 0.11, 0, 0.048, -0.465, 12);
  B(g, M.metal, 0.03, 0.055, 0.03, 0, 0.028, -0.52);                 // газоблок
  C(g, M.blued, 0.011, 0.42, 0, 0.015, -0.47, 12);                   // ствол
  B(g, M.metal, 0.024, 0.06, 0.03, 0, 0.04, -0.62);                  // основание мушки
  B(g, M.blued, 0.004, 0.022, 0.004, 0, 0.078, -0.62);               // мушка
  C(g, M.metal, 0.017, 0.075, 0, 0.015, -0.69, 14);                  // ДТК
  B(g, M.poly, 0.012, 0.012, 0.04, 0.012, 0.022, -0.71);
  B(g, M.poly, 0.012, 0.012, 0.04, -0.012, 0.022, -0.71);
  // рукоять, спуск
  B(g, M.bakelite, 0.032, 0.11, 0.045, 0, -0.07, 0.055, 0.3);
  B(g, M.metal, 0.006, 0.006, 0.07, 0, -0.045, -0.005);
  B(g, M.metal, 0.006, 0.03, 0.006, 0, -0.03, -0.04);
  B(g, M.blued, 0.004, 0.022, 0.006, 0, -0.03, 0.0, 0.3);
  B(g, M.metal, 0.004, 0.012, 0.06, 0.026, 0.02, -0.02, 0, 0, -0.1); // переводчик
  // приклад
  B(g, M.wood, 0.042, 0.075, 0.26, 0, -0.025, 0.24, 0.12);
  B(g, M.wood, 0.042, 0.04, 0.1, 0, 0.0, 0.14, 0.05);
  B(g, M.metal, 0.046, 0.1, 0.012, 0, -0.045, 0.37, 0.12);
  // затворная рама (двигается при выстреле)
  P.bolt = sub(g);
  B(P.bolt, M.worn, 0.016, 0.014, 0.03, 0.03, 0.03, -0.12); B(P.bolt, M.worn, 0.01, 0.01, 0.12, 0.022, 0.03, -0.06);
  // магазин (изогнутый, бакелит)
  P.mag = sub(g, 0, -0.025, -0.13);
  for (let i = 0; i < 6; i++) {
    const a = 0.12 + i * 0.09;
    B(P.mag, M.bakelite, 0.028, 0.04, 0.066 - i * 0.002, 0, -0.018 - i * 0.034, -i * 0.012 - i * i * 0.0025, -a);
  }
  B(P.mag, M.metal, 0.03, 0.008, 0.07, 0, -0.215, -0.13, -0.7);
  return { g, P, muzzle: [0, 0.015, -0.73], eject: [0.03, 0.035, -0.05], sight: 0.078, hip: [0.12, -0.125, -0.33], ads: [0, -0.078, -0.4], rh: [0, -0.06, 0.06], lh: [0, -0.02, -0.33], shell: 1, kick: 1 };
}

function buildPKM(M) {
  const g = new THREE.Group(), P = {};
  B(g, M.metal, 0.06, 0.08, 0.36, 0, 0.012, -0.08);
  B(g, M.worn, 0.064, 0.022, 0.24, 0, 0.062, -0.06);                 // крышка ствольной коробки
  B(g, M.metal, 0.03, 0.03, 0.03, 0, 0.08, -0.18);                   // прицел
  B(g, M.blued, 0.01, 0.025, 0.012, 0, 0.1, -0.18);
  C(g, M.blued, 0.014, 0.62, 0, 0.018, -0.57, 14);
  for (let i = 0; i < 5; i++) C(g, M.metal, 0.0155, 0.01, 0, 0.018, -0.33 - i * 0.04, 14);
  C(g, M.metal, 0.012, 0.36, 0, -0.016, -0.42, 10);                  // газовая камера
  C(g, M.metal, 0.019, 0.085, 0, 0.018, -0.92, 14);                  // пламегаситель
  for (let i = 0; i < 4; i++) B(g, M.poly, 0.004, 0.034, 0.05, Math.cos(i) * 0.012, 0.018, -0.92, 0, 0, i * 0.8);
  B(g, M.metal, 0.02, 0.05, 0.02, 0, 0.05, -0.86); B(g, M.blued, 0.004, 0.02, 0.004, 0, 0.085, -0.86);
  // ручка для переноски
  B(g, M.wood, 0.024, 0.024, 0.12, 0, 0.1, -0.46); B(g, M.metal, 0.012, 0.06, 0.012, 0, 0.065, -0.41); B(g, M.metal, 0.012, 0.06, 0.012, 0, 0.065, -0.51);
  // сошки (сложены)
  C(g, M.metal, 0.006, 0.3, 0.012, -0.03, -0.66, 8); C(g, M.metal, 0.006, 0.3, -0.012, -0.03, -0.66, 8);
  // рукоять и скелетный приклад
  B(g, M.poly, 0.032, 0.11, 0.045, 0, -0.07, 0.06, 0.25);
  B(g, M.metal, 0.006, 0.006, 0.07, 0, -0.045, 0.0);
  B(g, M.wood, 0.03, 0.03, 0.25, 0, 0.0, 0.22, 0.05);
  B(g, M.wood, 0.03, 0.03, 0.22, 0, -0.085, 0.24, -0.2);
  B(g, M.wood, 0.034, 0.13, 0.04, 0, -0.04, 0.355, 0.05);
  B(g, M.rubber, 0.036, 0.14, 0.012, 0, -0.04, 0.38, 0.05);
  // короб и лента
  P.mag = sub(g, -0.02, -0.11, -0.06);
  B(P.mag, M.olive, 0.1, 0.12, 0.13, -0.04, 0, 0);
  B(P.mag, M.oliveDark, 0.104, 0.02, 0.134, -0.04, 0.06, 0);
  B(P.mag, M.metal, 0.03, 0.01, 0.04, -0.04, 0.072, 0);
  P.belt = sub(g, 0.0, 0.0, -0.06);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    C(P.belt, M.brass, 0.006, 0.05, -0.035 + t * 0.03, -0.055 + t * 0.06, -0.02 + Math.sin(t * 3) * 0.01, 8, 0, Math.PI / 2);
    B(P.belt, M.blued, 0.05, 0.004, 0.012, -0.035 + t * 0.03, -0.055 + t * 0.06, -0.02 + Math.sin(t * 3) * 0.01);
  }
  return { g, P, muzzle: [0, 0.018, -0.97], eject: [0.035, 0.0, -0.04], sight: 0.1, hip: [0.125, -0.145, -0.36], ads: [0, -0.1, -0.38], rh: [0, -0.06, 0.065], lh: [0, -0.05, -0.3], shell: 1, kick: 1.15 };
}

function buildSVD(M) {
  const g = new THREE.Group(), P = {};
  B(g, M.metal, 0.044, 0.058, 0.3, 0, 0.012, -0.06);
  C(g, M.metal, 0.022, 0.27, 0, 0.036, -0.06, 16);
  // цевьё с прорезями
  B(g, M.woodLight, 0.05, 0.05, 0.28, 0, 0.012, -0.34);
  for (let i = 0; i < 5; i++) B(g, M.poly, 0.052, 0.006, 0.03, 0, 0.012 + (i % 2 ? 0.012 : -0.012), -0.27 - i * 0.04);
  C(g, M.blued, 0.01, 0.6, 0, 0.018, -0.62, 12);
  C(g, M.metal, 0.014, 0.085, 0, 0.018, -0.95, 14);
  for (let i = 0; i < 5; i++) B(g, M.poly, 0.003, 0.026, 0.05, Math.cos(i * 1.25) * 0.01, 0.018 + Math.sin(i * 1.25) * 0.01, -0.95, 0, 0, i * 1.25);
  B(g, M.metal, 0.02, 0.05, 0.02, 0, 0.04, -0.88);
  // скелетный приклад
  B(g, M.woodLight, 0.04, 0.035, 0.27, 0, 0.012, 0.22, 0.04);         // гребень
  B(g, M.woodLight, 0.04, 0.03, 0.18, 0, -0.1, 0.29, -0.05);
  B(g, M.woodLight, 0.04, 0.14, 0.04, 0, -0.04, 0.365);
  B(g, M.woodLight, 0.034, 0.1, 0.035, 0, -0.06, 0.1, 0.35);           // рукоять
  B(g, M.rubber, 0.044, 0.15, 0.014, 0, -0.04, 0.39);
  B(g, M.woodLight, 0.044, 0.025, 0.1, 0, 0.042, 0.22);                // щека
  B(g, M.metal, 0.006, 0.006, 0.06, 0, -0.04, 0.0);
  // магазин
  P.mag = sub(g, 0, -0.025, -0.12);
  B(P.mag, M.metal, 0.026, 0.085, 0.07, 0, -0.04, 0, -0.12);
  // оптика ПСО-1
  B(g, M.metal, 0.012, 0.035, 0.12, -0.026, 0.05, -0.08);             // кронштейн
  const sc = sub(g, 0, 0.09, -0.08);
  C(sc, M.poly, 0.017, 0.26, 0, 0, 0, 16);
  C(sc, M.poly, 0.024, 0.07, 0, 0, -0.16, 16);
  C(sc, M.rubber, 0.022, 0.06, 0, 0, 0.15, 16);
  C(sc, M.glass, 0.02, 0.004, 0, 0, -0.196, 16);
  CY(sc, M.poly, 0.012, 0.03, 0, 0.026, -0.02, 10);
  CY(sc, M.poly, 0.012, 0.03, -0.026, 0, -0.02, 10, 0, Math.PI / 2);
  P.bolt = sub(g);
  B(P.bolt, M.worn, 0.014, 0.012, 0.03, 0.028, 0.03, -0.1);
  return { g, P, muzzle: [0, 0.018, -1.0], eject: [0.03, 0.03, -0.05], sight: 0.09, hip: [0.12, -0.13, -0.32], ads: [0, -0.09, -0.16], rh: [0, -0.06, 0.1], lh: [0, -0.015, -0.34], shell: 1.3, kick: 1.6 };
}

function buildMinigun(M) {
  const g = new THREE.Group(), P = {};
  C(g, M.olive, 0.065, 0.24, 0, 0, -0.02, 18);                         // корпус мотора
  C(g, M.metal, 0.07, 0.02, 0, 0, -0.14, 18);
  C(g, M.metal, 0.07, 0.02, 0, 0, 0.1, 18);
  B(g, M.oliveDark, 0.05, 0.06, 0.14, 0.06, 0.03, 0.0);               // привод
  // рукояти и дуга
  B(g, M.poly, 0.03, 0.12, 0.035, 0.0, -0.11, 0.08, 0.2);
  B(g, M.metal, 0.02, 0.02, 0.24, 0, 0.1, -0.04); B(g, M.metal, 0.02, 0.08, 0.02, 0, 0.065, 0.07); B(g, M.metal, 0.02, 0.08, 0.02, 0, 0.065, -0.15);
  B(g, M.poly, 0.024, 0.07, 0.03, 0, -0.08, -0.12, 0.1);               // передняя рукоять
  // лента в рукаве
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    B(g, M.oliveDark, 0.05, 0.04, 0.05, -0.07 - t * 0.06, -0.03 - t * 0.12, 0.04 + t * 0.03, 0, 0, 0.3 + t * 0.6);
  }
  B(g, M.olive, 0.14, 0.12, 0.16, -0.13, -0.22, 0.06);
  // вращающийся блок стволов
  P.spin = sub(g, 0, 0, -0.14);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    C(P.spin, M.blued, 0.01, 0.6, Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.3, 10);
  }
  C(P.spin, M.metal, 0.052, 0.025, 0, 0, -0.05, 16);
  C(P.spin, M.metal, 0.05, 0.02, 0, 0, -0.32, 16);
  C(P.spin, M.metal, 0.05, 0.03, 0, 0, -0.58, 16);
  C(P.spin, M.poly, 0.02, 0.6, 0, 0, -0.3, 10);
  return { g, P, muzzle: [0, 0, -0.76], eject: [0.0, -0.06, -0.12], sight: 0.12, hip: [0.14, -0.165, -0.42], ads: [0.06, -0.13, -0.4], rh: [0, -0.1, 0.085], lh: [0, -0.08, -0.12], shell: 1.2, kick: 0.8, ejectDown: true };
}

function buildShotgun(M) {
  const g = new THREE.Group(), P = {};
  B(g, M.blued, 0.046, 0.068, 0.22, 0, 0.008, -0.05);
  B(g, M.worn, 0.004, 0.02, 0.06, 0.024, 0.02, -0.06);                 // окно выброса
  C(g, M.blued, 0.013, 0.56, 0, 0.026, -0.44, 14);
  C(g, M.blued, 0.012, 0.44, 0, -0.008, -0.38, 12);                    // подствольный магазин
  C(g, M.metal, 0.014, 0.02, 0, -0.008, -0.6, 12);
  B(g, M.brass, 0.005, 0.005, 0.005, 0, 0.042, -0.715);                // мушка-шарик
  // приклад
  B(g, M.wood, 0.04, 0.05, 0.12, 0, -0.03, 0.11, 0.35);
  B(g, M.wood, 0.042, 0.085, 0.24, 0, -0.04, 0.27, 0.08);
  B(g, M.rubber, 0.046, 0.1, 0.02, 0, -0.06, 0.395, 0.08);
  B(g, M.metal, 0.006, 0.006, 0.07, 0, -0.04, -0.0); B(g, M.blued, 0.004, 0.022, 0.006, 0, -0.03, -0.01, 0.3);
  // цевьё-помпа
  P.pump = sub(g);
  B(P.pump, M.wood, 0.05, 0.046, 0.17, 0, -0.008, -0.31);
  for (let i = 0; i < 6; i++) B(P.pump, M.poly, 0.052, 0.004, 0.006, 0, -0.008 + (i % 2 ? 0.015 : -0.015), -0.25 - i * 0.022);
  return { g, P, muzzle: [0, 0.026, -0.73], eject: [0.03, 0.025, -0.06], sight: 0.045, hip: [0.12, -0.125, -0.32], ads: [0, -0.045, -0.38], rh: [0, -0.05, 0.08], lh: [0, -0.04, -0.31], lhPart: 'pump', shell: 2, kick: 1.5 };
}

function buildRPG(M) {
  const g = new THREE.Group(), P = {};
  C(g, M.oliveDark, 0.036, 0.95, 0, 0, -0.17, 16);
  C(g, M.wood, 0.045, 0.26, 0, 0, -0.05, 16);                          // теплозащитная накладка
  C(g, M.metal, 0.047, 0.012, 0, 0, 0.08, 16); C(g, M.metal, 0.047, 0.012, 0, 0, -0.18, 16);
  cone(g, M.oliveDark, 0.038, 0.06, 0.1, 0, 0, 0.35, 16);              // раструб
  C(g, M.metal, 0.04, 0.02, 0, 0, -0.64, 16);
  // рукояти
  B(g, M.wood, 0.03, 0.11, 0.045, 0, -0.085, -0.09, 0.25);
  B(g, M.metal, 0.008, 0.03, 0.006, 0, -0.045, -0.14);
  B(g, M.wood, 0.03, 0.1, 0.04, 0, -0.08, 0.1, 0.25);
  // оптический прицел ПГО-7 слева
  B(g, M.metal, 0.012, 0.03, 0.1, -0.045, 0.02, -0.05);
  B(g, M.poly, 0.035, 0.05, 0.14, -0.07, 0.045, -0.05);
  C(g, M.rubber, 0.018, 0.05, -0.07, 0.05, 0.04, 12);
  B(g, M.metal, 0.006, 0.035, 0.006, 0, 0.05, -0.55);                  // мушка
  // выстрел ПГ-7 (исчезает после выстрела)
  P.warhead = sub(g, 0, 0, -0.66);
  C(P.warhead, M.olive, 0.042, 0.13, 0, 0, -0.07, 16);
  cone(P.warhead, M.olive, 0.042, 0.012, 0.17, 0, 0, -0.22, 16);
  C(P.warhead, M.metal, 0.008, 0.05, 0, 0, -0.32, 8);
  C(P.warhead, M.metal, 0.022, 0.03, 0, 0, 0.0, 12);
  return { g, P, muzzle: [0, 0, -0.98], eject: null, sight: 0.065, hip: [0.17, -0.085, -0.22], ads: [0.07, -0.05, -0.18], rh: [0, -0.07, -0.08], lh: [0, -0.07, 0.1], shell: 0, kick: 2.2 };
}

function buildBlockTool(M, atlas) {
  const g = new THREE.Group(), P = {};
  const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85, metalness: 0 });
  const m = new THREE.Mesh(geo, mat); m.position.set(0, 0.02, -0.12); m.rotation.y = 0.5; m.userData.keep = true;
  g.add(m); P.block = m;
  return { g, P, muzzle: [0, 0, -0.2], eject: null, sight: 0, hip: [0.2, -0.15, -0.36], ads: [0.2, -0.15, -0.36], rh: [0, -0.03, -0.05], lh: null, shell: 0, kick: 0.5 };
}

// UV блока по атласу (6 граней)
function setBlockUV(geo, id) {
  const def = BLOCKS[id]; if (!def) return;
  const uv = geo.attributes.uv;
  // порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z
  const tiles = [def.tiles[2], def.tiles[2], def.tiles[0], def.tiles[1], def.tiles[2], def.tiles[2]];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(tiles[f]);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const bu = [0, 1, 0, 1][k], bv = [1, 1, 0, 0][k];
      uv.setXY(i, u0 + (u1 - u0) * bu, v0 + (v1 - v0) * bv);
    }
  }
  uv.needsUpdate = true;
}

// ---------- крылья-руки ----------
function buildWing(M, side) {
  const arm = new THREE.Group();
  const inner = new THREE.Group(); arm.add(inner);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
  const main = new THREE.Mesh(geo, M.feather); inner.add(main);
  const layer = new THREE.Mesh(geo, M.feather2); inner.add(layer);
  const cuff = new THREE.Mesh(BOX, M.team); arm.add(cuff);
  return { arm, main, layer, cuff, side };
}
function buildHand(M, parent, pos) {
  const h = sub(parent, pos[0], pos[1], pos[2]);
  // перья "пальцы" обхватывают рукоять
  B(h, M.feather, 0.06, 0.06, 0.07, 0, 0, 0);
  for (let i = 0; i < 3; i++) B(h, M.feather2, 0.065, 0.018, 0.05, 0.004, 0.025 - i * 0.022, -0.035, 0.2, 0, 0);
  B(h, M.feather, 0.05, 0.03, 0.05, -0.02, 0.03, 0.01, 0, 0, 0.4);
  mergeStatic(h);
  return h;
}

export class ViewModel {
  constructor(renderer, atlas) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 5);
    this.M = makeMats();
    this.atlas = atlas;
    // окружение для отражений металла
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols = [];
    const pos = sky.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 5;
      const c = y > 0 ? new THREE.Color(0x9fd0ff).lerp(new THREE.Color(0xe8f4ff), 1 - y) : new THREE.Color(0x6a7a4a).lerp(new THREE.Color(0x3a3020), -y);
      cols.push(c.r, c.g, c.b);
    }
    sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(sky);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sun.position.set(2.5, 3.5, 1.5); sun.material.color.multiplyScalar(6); env.add(sun);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5a4a30, 0.9));
    const dl = new THREE.DirectionalLight(0xfff0dd, 2.2); dl.position.set(0.6, 1, 0.4); this.scene.add(dl);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2); this.scene.add(this.flashLight);

    this.root = new THREE.Group(); this.scene.add(this.root);   // точка покачивания
    this.holder = new THREE.Group(); this.root.add(this.holder);
    const builders = { ak: buildAK, lmg: buildPKM, sniper: buildSVD, hmg: buildMinigun, shotgun: buildShotgun, rpg: buildRPG, build: (M) => buildBlockTool(M, atlas) };
    this.guns = WEAPONS.map(w => {
      const G = builders[w.key](this.M);
      G.base = {};
      for (const k in G.P) { G.base[k] = G.P[k].position.clone(); mergeStatic(G.P[k]); }
      mergeStatic(G.g);
      G.muzzleObj = marker(G.g, ...G.muzzle);
      G.ejectObj = G.eject ? marker(G.g, ...G.eject) : null;
      G.rhObj = buildHand(this.M, G.g, G.rh);
      if (G.lh) G.lhObj = buildHand(this.M, G.lhPart ? G.P[G.lhPart] : G.g, G.lh);
      G.g.visible = false;
      this.holder.add(G.g);
      return G;
    });
    this.wings = [buildWing(this.M, 1), buildWing(this.M, -1)];
    for (const w of this.wings) this.scene.add(w.arm);

    // вспышка
    const ft = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.2, 'rgba(255,220,130,0.95)'); gr.addColorStop(0.55, 'rgba(255,140,30,0.5)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,240,180,0.9)'; c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); c.stroke(); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false; this.scene.add(this.flash);
    this.flash2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
    this.flash2.visible = false; this.scene.add(this.flash2);
    this.flashT = 0;

    // гильзы
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8).rotateX(Math.PI / 2);
    this.shells = new THREE.InstancedMesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.3 }), 40);
    this.shells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3);
    this.shells.count = 0; this.shells.frustumCulled = false;
    this.scene.add(this.shells);
    this.shellList = [];

    // состояние анимаций
    this.cur = -1;
    this.ads = 0; this.phase = 0; this.bobK = 0;
    this.sway = new THREE.Vector2(); this.swayT = new THREE.Vector2();
    this.rec = { z: 0, vz: 0, rx: 0, vrx: 0, ry: 0, vry: 0, rz: 0, vrz: 0 };
    this.switchT = 1; this.landT = 0; this.wasGround = true;
    this.pump = 0; this.bolt = 0; this.spinA = 0; this.spinV = 0; this.swing = 0;
    this.warheadOn = true; this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  raise() { this.switchT = 0; this.warheadOn = true; for (const k in this.rec) this.rec[k] = 0; }
  setTeam(team) { this.M.team.color.setHex(TEAM_COLORS[team]); }
  setBlock(id) {
    const b = this.guns[this.guns.length - 1].P.block;
    if (b && this.blockId !== id) { this.blockId = id; setBlockUV(b.geometry, id); }
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // Выстрел: отдача, вспышка, гильза, движение деталей
  fire(wi) {
    const G = this.guns[wi], w = WEAPONS[wi];
    if (!G) return;
    const k = G.kick * (1 - this.ads * 0.45);
    const r = this.rec;
    r.vz += 1.6 * k; r.vrx += 9 * k * rnd(0.8, 1.2); r.vry += rnd(-2.5, 2.5) * k; r.vrz += rnd(-4, 4) * k;
    if (w.build) { this.swing = 1; return; }
    this.flashT = w.key === 'hmg' ? 0.035 : 0.05;
    this.flashRot = Math.random() * 6.28;
    this.flashScale = (w.key === 'shotgun' || w.key === 'sniper' || w.key === 'rpg' ? 0.32 : w.key === 'hmg' ? 0.26 : 0.22) * rnd(0.8, 1.2);
    if (w.key === 'shotgun') this.pump = 1;
    if (G.P.bolt) this.bolt = 1;
    if (w.key === 'rpg') this.warheadOn = false;
    if (G.ejectObj) this.ejectShell(G, w);
  }

  ejectShell(G, w) {
    G.g.updateMatrixWorld(true);
    const p = G.ejectObj.getWorldPosition(new THREE.Vector3());
    const v = G.ejectDown ? new THREE.Vector3(rnd(-0.2, 0.2), -0.6, rnd(0, 0.3)) : new THREE.Vector3(rnd(1.2, 1.8), rnd(0.8, 1.4), rnd(0.1, 0.5));
    let s;
    if (this.shellList.length < 40) { s = {}; this.shellList.push(s); } else s = this.shellList[Math.floor(Math.random() * 40)];
    s.p = p; s.v = v; s.r = new THREE.Euler(rnd(0, 3), rnd(0, 3), 0); s.rv = new THREE.Vector3(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20));
    s.life = 0.9; s.scale = G.shell; s.color = w.key === 'shotgun' ? new THREE.Color(0xc0281c) : new THREE.Color(0xd4a843);
  }

  // Положение дула в мире (для трассеров из глаз)
  muzzleWorld(mainCam, out) {
    const G = this.guns[this.cur];
    if (!G) return mainCam.getWorldPosition(out);
    this.scene.updateMatrixWorld(true);
    const p = G.muzzleObj.getWorldPosition(this._v).project(this.camera);
    out.set(clamp(p.x, -1, 1), clamp(p.y, -1, 1), 0.5).unproject(mainCam);
    const dir = this._v2.subVectors(out, mainCam.position).normalize();
    return out.copy(mainCam.position).addScaledVector(dir, 0.9);
  }

  // s: {weapon, aiming, speed, onGround, lookX, lookY, firing, reload (0..1 или -1), spin(0..1), alive, vy}
  update(dt, s) {
    this.t += dt;
    const wi = s.weapon;
    if (wi !== this.cur) {
      if (this.cur >= 0) this.guns[this.cur].g.visible = false;
      this.cur = wi; this.guns[wi].g.visible = true; this.switchT = 0;
      this.warheadOn = true;
    }
    const G = this.guns[wi], w = WEAPONS[wi];
    this.switchT = Math.min(1, this.switchT + dt * 3.2);
    this.ads += ((s.aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 11);
    const A = this.ads, free = 1 - A * 0.85;

    // покачивание от поворота камеры (оружие "запаздывает")
    this.swayT.set(clamp(-s.lookX * 0.00035, -0.05, 0.05), clamp(s.lookY * 0.00035, -0.05, 0.05));
    this.sway.lerp(this.swayT, Math.min(1, dt * 9));
    // ходьба
    const moving = s.onGround && s.speed > 0.5;
    this.bobK += ((moving ? Math.min(1, s.speed / 5.4) : 0) - this.bobK) * Math.min(1, dt * 8);
    this.phase += dt * (4 + s.speed * 1.35);
    const bx = Math.sin(this.phase) * 0.011 * this.bobK, by = -Math.abs(Math.cos(this.phase)) * 0.012 * this.bobK;
    const idle = Math.sin(this.t * 1.6) * 0.0025;
    // приземление
    if (!this.wasGround && s.onGround) this.landT = 1;
    this.wasGround = s.onGround;
    this.landT = Math.max(0, this.landT - dt * 5);
    const air = s.onGround ? 0 : clamp(-s.vy * 0.004, -0.02, 0.02);

    // пружины отдачи
    const r = this.rec, k = 170, c = 18;
    r.vz += (-k * r.z - c * r.vz) * dt; r.z += r.vz * dt;
    r.vrx += (-k * r.rx - c * r.vrx) * dt; r.rx += r.vrx * dt;
    r.vry += (-k * r.ry - c * r.vry) * dt; r.ry += r.vry * dt;
    r.vrz += (-k * r.rz - c * r.vrz) * dt; r.rz += r.vrz * dt;

    // перезарядка
    let rlY = 0, rlRz = 0, rlRx = 0;
    const rp = s.reload;
    if (rp >= 0) {
      const inout = rp < 0.15 ? ease(rp / 0.15) : rp > 0.85 ? ease((1 - rp) / 0.15) : 1;
      rlY = -0.05 * inout; rlRz = 0.55 * inout; rlRx = 0.25 * inout;
      if (w.key === 'rpg') { rlRz = -0.2 * inout; rlRx = -0.35 * inout; rlY = -0.1 * inout; }
      if (w.key === 'shotgun') { rlRz = 0.3 * inout; }
    }
    if (G.P.mag) {
      const base = G.base.mag;
      let off = 0, vis = true;
      if (rp >= 0) {
        if (rp > 0.15 && rp < 0.45) off = ease((rp - 0.15) / 0.3);
        else if (rp >= 0.45 && rp < 0.55) { off = 1; vis = rp > 0.5; }
        else if (rp >= 0.55 && rp < 0.8) off = 1 - ease((rp - 0.55) / 0.25);
      }
      G.P.mag.position.set(base.x - off * 0.03, base.y - off * 0.25, base.z + off * 0.05);
      G.P.mag.rotation.x = off * 0.4;
      G.P.mag.visible = vis;
      if (G.P.belt) G.P.belt.visible = !(rp > 0.2 && rp < 0.75);
    }
    if (G.P.warhead) {
      if (rp >= 0 && rp > 0.5) this.warheadOn = true;
      const inn = rp >= 0.5 && rp < 0.8 ? 1 - ease((rp - 0.5) / 0.3) : 0;
      G.P.warhead.visible = this.warheadOn;
      G.P.warhead.position.z = G.base.warhead.z - inn * 0.25;
    }
    // детали
    this.pump = Math.max(0, this.pump - dt * 2.6);
    if (G.P.pump) {
      const ph = this.pump > 0 ? Math.sin((1 - this.pump) * Math.PI) : 0;
      const rpp = rp >= 0 ? Math.max(0, Math.sin(rp * Math.PI * 6)) * 0.5 : 0;
      G.P.pump.position.z = G.base.pump.z + (ph + rpp) * 0.08;
    }
    this.bolt = Math.max(0, this.bolt - dt * 14);
    if (G.P.bolt) G.P.bolt.position.z = G.base.bolt.z + Math.sin(this.bolt * Math.PI) * 0.06;
    if (G.P.spin) {
      this.spinV += ((s.spin > 0 ? 45 * s.spin : 0) - this.spinV) * Math.min(1, dt * 5);
      G.P.spin.rotation.z += this.spinV * dt;
    }
    if (G.P.belt) G.P.belt.position.y = G.base.belt.y + (s.firing ? Math.sin(this.t * 60) * 0.003 : 0);
    this.swing = Math.max(0, this.swing - dt * 5);

    // итоговая поза
    const hip = G.hip, ads = G.ads;
    const sw = this.switchT < 1 ? (1 - ease(this.switchT)) : 0;
    const px = hip[0] + (ads[0] - hip[0]) * A + (bx + this.sway.x) * free;
    const py = hip[1] + (ads[1] - hip[1]) * A + (by + idle + this.sway.y - this.landT * 0.03 + air) * free + rlY - sw * 0.25;
    const pz = hip[2] + (ads[2] - hip[2]) * A + r.z * 0.06;
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(
      r.rx * 0.05 + rlRx + this.sway.y * 1.2 * free - this.swing * 0.6 - sw * 0.6,
      r.ry * 0.03 + this.sway.x * 1.5 * free + (1 - A) * 0.04,
      r.rz * 0.02 + rlRz - this.sway.x * 2 * free + bx * 1.5,
    );

    // крылья тянутся от "плеч" к кистям
    this.scene.updateMatrixWorld(true);
    const shoulders = [new THREE.Vector3(0.3, -0.42, 0.12), new THREE.Vector3(-0.28, -0.46, 0.05)];
    const hands = [G.rhObj, G.lhObj];
    this.wings.forEach((wg, i) => {
      const h = hands[i];
      if (!h || !s.alive) { wg.arm.visible = false; return; }
      wg.arm.visible = true;
      const sp = shoulders[i];
      const hp = h.getWorldPosition(this._v);
      const len = sp.distanceTo(hp);
      wg.arm.position.copy(sp);
      wg.arm.lookAt(hp); // смотрит +Z на цель
      wg.arm.rotateY(Math.PI); // наша геометрия тянется в -Z
      wg.main.scale.set(0.052, 0.058, len + 0.02);
      wg.layer.scale.set(0.056, 0.022, len * 0.7); wg.layer.position.set(0, -0.024, -len * 0.25);
      wg.cuff.scale.set(0.066, 0.07, 0.08); wg.cuff.position.set(0, 0, -0.06);
    });
    this.holder.visible = s.alive;

    // вспышка
    this.flashT -= dt;
    const fl = this.flashT > 0;
    this.flash.visible = this.flash2.visible = fl;
    if (fl) {
      const mp = G.muzzleObj.getWorldPosition(this._v);
      this.flash.position.copy(mp);
      this.flash.scale.setScalar(this.flashScale);
      this.flash.material.rotation = this.flashRot;
      // боковой "язык" пламени вдоль ствола
      const fwd = this._v2.set(0, 0, -1).applyQuaternion(G.g.getWorldQuaternion(this._q));
      this.flash2.position.copy(mp).addScaledVector(fwd, this.flashScale * 0.4);
      this.flash2.scale.set(this.flashScale * 0.6, this.flashScale * 1.6, 1);
      this.flash2.quaternion.copy(G.g.getWorldQuaternion(this._q)); this.flash2.rotateX(Math.PI / 2);
      this.flashLight.position.copy(mp); this.flashLight.intensity = 3.5;
    } else this.flashLight.intensity = 0;

    // гильзы
    let n = 0;
    for (const sh of this.shellList) {
      if (sh.life <= 0) continue;
      sh.life -= dt;
      sh.v.y -= 6 * dt;
      sh.p.addScaledVector(sh.v, dt);
      sh.r.x += sh.rv.x * dt; sh.r.y += sh.rv.y * dt; sh.r.z += sh.rv.z * dt;
      this._q.setFromEuler(sh.r);
      this._s.setScalar(sh.scale);
      this._m.compose(sh.p, this._q, this._s);
      this.shells.setMatrixAt(n, this._m);
      this.shells.setColorAt(n, sh.color);
      n++;
    }
    this.shells.count = n;
    if (n) { this.shells.instanceMatrix.needsUpdate = true; this.shells.instanceColor.needsUpdate = true; }
  }

  render() {
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = ac;
  }
}

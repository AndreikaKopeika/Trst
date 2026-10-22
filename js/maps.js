// Карты по мотивам 2Fort и Dust 2, собранные из блоков.
// Координаты: x — от базы Красных к базе Синих, z — поперёк, y — вверх. Пол на y = 9 (стоим на y = 10).
import { B } from './blocks.js';
import { SX, SY, SZ } from './world.js';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function tools(w) {
  const d = w.data;
  const ok = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  const set = (x, y, z, id) => { if (ok(x, y, z)) d[(y * SZ + z) * SX + x] = id; };
  const get = (x, y, z) => ok(x, y, z) ? d[(y * SZ + z) * SX + x] : 0;
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) set(x, y, z, id);
  };
  return { set, get, fill };
}

// маршруты для ботов: у синих — те же дорожки задом наперёд
function mirrorRoutes(red, redEgg, blueEgg) {
  return [red.map(l => [...l, blueEgg]), red.map(l => [...l.slice().reverse(), redEgg])];
}

// =====================================================================
// 2FORT
// =====================================================================
export function gen2Fort(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill } = tools(w);
  const G = 9;
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, 6, SZ - 1, B.STONE);
  fill(0, 7, 0, SX - 1, 8, SZ - 1, B.DIRT);
  fill(0, G, 0, SX - 1, G, SZ - 1, B.GRASS);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (r() < 0.06) set(x, G, z, B.GRAVEL);

  // стены каньона
  for (let x = 0; x < SX; x++) {
    for (const zz of [[0, 5], [54, 59]]) for (let z = zz[0]; z <= zz[1]; z++) {
      const edge = z === 5 || z === 54;
      const h = 17 + Math.floor(Math.sin(x * 0.21 + z) * 3 + r() * 3) - (edge ? 4 : 0);
      fill(x, G + 1, z, x, h, z, r() < 0.25 ? B.DARKSTONE : B.STONE);
      set(x, h + 1, z, B.GRASS);
    }
  }
  for (let z = 0; z < SZ; z++) for (const x of [0, 1, SX - 2, SX - 1]) fill(x, G + 1, z, x, 24, z, B.STONE);

  // река с песчаными берегами-ступеньками
  // берега спускаются к воде ступеньками по одному блоку
  const bankTop = (x) => { const k = Math.min(x - 47, 64 - x); return Math.max(2, 8 - k); };
  for (let z = 6; z <= 53; z++) {
    for (let x = 47; x <= 64; x++) {
      fill(x, 2, z, x, G, z, 0);
      const top = bankTop(x);
      fill(x, 2, z, x, top, z, B.SAND);
      if (top < 7) fill(x, top + 1, z, x, 7, z, B.WATER);
    }
  }
  for (let z = 6; z <= 53; z++) { set(46, G, z, B.SAND); set(65, G, z, B.SAND); }

  // крытый мост (настил на y = 15, как второй этаж фортов)
  const BR0 = 36, BR1 = 75, Z0 = 27, Z1 = 33;
  fill(BR0, 15, Z0, BR1, 15, Z1, B.PLANKS);
  for (const x of [44, 50, 56, 62, 68]) for (const z of [Z0, Z1]) fill(x, 3, z, x, 14, z, B.LOG);
  for (let x = BR0; x <= BR1; x++) {
    for (const z of [Z0, Z1]) {
      set(x, 16, z, B.PLANKS);
      if (x % 4 === 0) fill(x, 16, z, x, 19, z, B.LOG);
      else if (x % 4 === 2) set(x, 17, z, B.GLASS);
    }
  }
  fill(BR0, 20, Z0, BR1, 20, Z1, B.ROOF);
  fill(BR0, 21, Z0 + 1, BR1, 21, Z1 - 1, B.ROOF);
  fill(BR0, 22, Z0 + 2, BR1, 22, Z1 - 2, B.ROOF);
  for (let x = 40; x <= 72; x += 8) set(x, 19, 30, B.LAMP);

  const info = { spawns: [[], []], eggs: [], bases: [], sky: 0x9cc4ea, space: 'canyon', name: '2Fort' };
  for (const team of [0, 1]) buildFort(team);

  function buildFort(team) {
    const x0 = team === 0 ? 4 : SX - 36, x1 = x0 + 31;
    const X = (u) => team === 0 ? x0 + u : x1 - u;
    const wallM = team === 0 ? B.REDWOOD : B.BLUEMETAL, baseM = team === 0 ? B.BRICK : B.CONCRETE;
    const trim = team === 0 ? B.LOG : B.STEEL, floorM = team === 0 ? B.PLANKS : B.CONCRETE;
    const roofM = team === 0 ? B.ROOF : B.BLUEMETAL, wool = team === 0 ? B.WOOL_RED : B.WOOL_BLUE;
    const zA = 8, zB = 51;
    info.bases.push({ team, x0: Math.min(X(0), X(31)), x1: Math.max(X(0), X(31)), z0: zA, z1: zB });
    for (let u = 0; u <= 31; u++) for (let z = zA; z <= zB; z++) {
      const x = X(u);
      fill(x, G + 1, z, x, 26, z, 0);
      set(x, G, z, floorM);
      const edge = u === 0 || u === 31 || z === zA || z === zB;
      if (edge) {
        const pillar = (z - zA) % 7 === 0 || u % 8 === 0;
        for (let y = 10; y <= 22; y++) set(x, y, z, pillar ? trim : y <= 12 ? baseM : y === 15 ? trim : wallM);
      }
      if (!edge) set(x, 15, z, floorM);         // второй этаж
      set(x, 23, z, roofM);                       // крыша
      if (edge && (u + z) % 2 === 0) set(x, 24, z, (u + z) % 4 === 0 ? wool : wallM); // зубцы
    }
    // большой герб команды на фасаде
    for (let z = 24; z <= 36; z++) for (let y = 19; y <= 22; y++) if ((z === 24 || z === 36 || y === 19 || y === 22)) set(X(31), y, z, wool);
    const F = X(31);
    // главные ворота и вход на мост
    fill(F, 10, 28, F, 12, 32, 0);
    fill(F, 16, 28, F, 19, 32, 0);
    // бойницы второго этажа
    for (let z = zA + 2; z <= zB - 2; z++) if (z < 26 || z > 34) { if (z % 3 !== 0) fill(F, 17, z, F, 18, z, 0); }
    // окна по бокам
    for (let u = 4; u <= 28; u += 4) for (const z of [zA, zB]) { fill(X(u), 17, z, X(u + 1), 18, z, B.GLASS); fill(X(u), 11, z, X(u), 12, z, B.GLASS); }
    // перегородка комнаты возрождения
    for (let z = zA + 1; z <= zB - 1; z++) for (let y = 10; y <= 14; y++) {
      const door = (z >= 16 && z <= 18) || (z >= 29 && z <= 31) || (z >= 41 && z <= 43);
      set(X(8), y, z, door ? 0 : wallM);
    }
    // комната с яйцом
    for (let u = 13; u <= 22; u++) for (let z = 24; z <= 36; z++) {
      const edge = u === 13 || u === 22 || z === 24 || z === 36;
      if (!edge) continue;
      const door = (u === 22 && z >= 29 && z <= 31) || ((z === 24 || z === 36) && (u === 17 || u === 18));
      for (let y = 10; y <= 14; y++) set(X(u), y, z, door ? 0 : y === 14 ? trim : baseM);
    }
    set(X(16), 10, 30, B.STEEL); set(X(16), 10, 31, B.STEEL); set(X(15), 10, 30, B.STEEL); set(X(15), 10, 31, B.STEEL);
    info.eggs.push({ team, x: (team === 0 ? X(16) : X(16)) + 0.5, y: 11, z: 30.5 });
    for (const z of [27, 33]) { set(X(20), 10, z, B.SANDBAG); set(X(20), 11, z, B.SANDBAG); }
    set(X(14), 13, 25, B.LAMP); set(X(21), 13, 35, B.LAMP);
    // лестницы на второй этаж (у обеих боковых стен)
    for (const zz of [[10, 11], [48, 49]]) {
      for (let k = 1; k <= 6; k++) {
        const u = 9 + k;
        fill(X(u), 10, zz[0], X(u), 9 + k, zz[1], floorM);
        fill(X(u), 15, zz[0], X(u), 15, zz[1], k === 6 ? floorM : 0);
      }
      fill(X(9), 15, zz[0], X(9), 15, zz[1], 0);
    }
    // перегородка на втором этаже
    for (let z = zA + 1; z <= zB - 1; z++) for (let y = 16; y <= 22; y++) {
      const door = (z >= 14 && z <= 16) || (z >= 28 && z <= 32) || (z >= 43 && z <= 45);
      set(X(21), y, z, door ? 0 : y === 22 ? trim : wallM);
    }
    // ящики для укрытия на втором этаже у бойниц
    for (const z of [14, 20, 40, 46]) { set(X(27), 16, z, B.CRATE); if (z % 2) set(X(27), 17, z, B.CRATE); }
    for (let k = 0; k < 6; k++) set(X(4 + k * 4), 22, 30, B.LAMP);
    // двор перед фортом
    for (const [du, z, h] of [[34, 15, 2], [35, 16, 1], [36, 40, 2], [34, 44, 1], [38, 22, 1], [38, 38, 1]]) fill(X(du), 10, z, X(du), 9 + h, z, B.CRATE);
    for (let z = 24; z <= 36; z++) if (z < 28 || z > 32) set(X(36), 10, z, B.SANDBAG);
    // канализация: под двором к реке
    const sx0 = X(33), sx1 = team === 0 ? 52 : 59;
    for (let x = Math.min(sx0, sx1); x <= Math.max(sx0, sx1); x++) {
      fill(x, 4, 43, x, 4, 47, B.CONCRETE);
      fill(x, 5, 44, x, 7, 46, 0);
      fill(x, 5, 44, x, 5, 46, B.WATER);
      fill(x, 8, 43, x, 8, 47, B.CONCRETE);
      fill(x, 5, 43, x, 7, 43, B.CONCRETE); fill(x, 5, 47, x, 7, 47, B.CONCRETE);
    }
    fill(X(33), 8, 44, X(35), G, 46, 0);          // открытый люк во дворе
    for (let k = 0; k < 4; k++) fill(X(36 - k), 5, 44, X(36 - k), 5 + k, 46, B.CONCRETE); // ступени из люка
    // точки возрождения
    for (let k = 0; k < 6; k++) info.spawns[team].push([X(3 + (k % 2) * 2) + 0.5, 10, 12 + k * 7 + 0.5]);
  }

  const redEgg = [info.eggs[0].x, info.eggs[0].z], blueEgg = [info.eggs[1].x, info.eggs[1].z];
  // красные: из комнаты возрождения — во двор, через реку/мост/канализацию — к яйцу синих.
  // Карта зеркальна (x -> 112 - x), поэтому маршруты синих — зеркальные копии.
  const red = [
    // главные ворота и через реку
    [[12, 30], [14, 21], [28, 21], [33, 30], [40, 30], [47, 30], [56, 30], [65, 30], [72, 30], [77, 30], [84, 30.5], [88, 30.5]],
    // по лестнице на второй этаж, по мосту, вниз по лестнице синих
    [[12, 17], [13, 12], [15, 10.5], [20, 10.5], [25, 20], [30, 30], [36, 30], [56, 30], [75, 30], [80, 30], [86, 30], [90, 20], [92, 11], [97, 10.5], [98, 13], [93.5, 22], [93.5, 25]],
    // канализация
    [[12, 42], [28, 44], [33, 45], [38, 45], [44, 45], [52, 45], [60, 45], [67, 45], [73, 45], [74, 40], [73, 30], [77, 30], [84, 30.5], [88, 30.5]],
  ];
  const mx = (l) => l.map(([x, z]) => [112 - x, z]);
  info.routes = [red.map(l => [...l, blueEgg]), red.map(l => [...mx(l), redEgg])];
  return info;
}

// =====================================================================
// DUST 2
// =====================================================================
export function genDust2(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill } = tools(w);
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, 8, SZ - 1, B.SANDSTONE);
  fill(0, 9, 0, SX - 1, 9, SZ - 1, B.SAND);
  fill(0, 10, 0, SX - 1, 17, SZ - 1, B.SANDSTONE);   // всё — стены, потом вырезаем улицы
  for (let y = 10; y <= 17; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (y % 4 === 1 && r() < 0.3) set(x, y, z, B.SANDBRICK);
  const open = (x0, z0, x1, z1, y0 = 10, y1 = SY - 1) => fill(x0, y0, z0, x1, y1, z1, 0);
  const tunnel = (x0, z0, x1, z1) => open(x0, z0, x1, z1, 10, 13);

  // респ Т (Красные)
  open(3, 20, 20, 40);
  // выход на Длинную
  open(14, 41, 24, 50); open(21, 46, 33, 54);
  // Длинные двери
  open(33, 48, 34, 50, 10, 13);
  fill(34, 10, 51, 34, 12, 52, B.DOOR); fill(33, 14, 47, 34, 14, 51, B.SANDBRICK);
  // Длинная А
  open(35, 47, 88, 56);
  for (let x = 35; x <= 88; x += 9) set(x, 10, 56, B.CRATE);
  // яма
  for (let x = 80; x <= 87; x++) for (let z = 52; z <= 56; z++) fill(x, 7, z, x, 9, z, 0);
  for (let z = 52; z <= 56; z++) { set(80, 7, z, B.SAND); set(80, 8, z, B.SAND); }
  // точка A
  open(82, 34, 101, 56);
  fill(90, 10, 40, 100, 10, 52, B.SANDBRICK);
  fill(98, 11, 52, 100, 12, 55, B.CRATE); set(99, 13, 54, B.CRATE);  // «гусь»
  for (const [x, z, h] of [[86, 40, 2], [87, 40, 1], [93, 46, 2], [84, 50, 1], [96, 42, 1]]) fill(x, x >= 90 && z >= 40 && z <= 52 ? 11 : 10, z, x, (x >= 90 && z >= 40 && z <= 52 ? 10 : 9) + h, z, B.CRATE);
  // мид и двери мида
  open(20, 26, 57, 33);
  open(58, 29, 60, 30, 10, 13);
  fill(59, 10, 27, 59, 13, 28, B.DOOR); fill(59, 10, 31, 59, 13, 32, B.DOOR);
  fill(58, 14, 26, 60, 14, 33, B.SANDBRICK);
  open(61, 25, 79, 34);
  fill(44, 10, 31, 44, 11, 31, B.CRATE); set(45, 10, 31, B.CRATE);   // «иксбокс»
  // кэтвок (шорт) — приподнятая дорожка к A
  open(42, 34, 50, 37);
  open(50, 36, 82, 40);
  fill(50, 10, 36, 81, 11, 40, B.SANDBRICK);
  fill(46, 10, 34, 47, 10, 37, B.SANDBRICK); fill(48, 10, 34, 49, 11, 37, B.SANDBRICK);
  for (let x = 52; x <= 80; x += 7) set(x, 12, 40, B.SANDBAG);
  // верхние и нижние туннели (с крышей)
  tunnel(6, 8, 14, 19);
  tunnel(14, 6, 42, 11);
  tunnel(36, 11, 40, 25);
  for (const x of [20, 30]) set(x, 13, 8, B.LAMP);
  set(39, 13, 18, B.LAMP);
  // точка B
  open(42, 2, 70, 22);
  fill(55, 10, 16, 58, 10, 18, B.BLUEMETAL); fill(56, 11, 16, 57, 11, 18, B.GLASS);   // машина
  for (const [x, z, h] of [[48, 6, 2], [49, 6, 1], [63, 5, 2], [64, 5, 2], [63, 6, 1], [50, 18, 1], [66, 14, 2], [45, 12, 1]]) fill(x, 10, z, x, 9 + h, z, B.CRATE);
  fill(42, 10, 2, 44, 10, 4, B.SANDBRICK);  // платформа
  // двери B и окно к КТ
  open(71, 10, 73, 13, 10, 13);
  set(72, 10, 10, B.DOOR); set(72, 11, 10, B.DOOR); set(72, 10, 13, B.DOOR); set(72, 11, 13, B.DOOR);
  open(71, 16, 73, 18, 12, 13);
  open(74, 8, 80, 20);
  // респ КТ (Синие) и проход к A
  open(80, 14, 108, 33);
  open(86, 33, 100, 40);
  // зубцы на верху стен вдоль улиц
  for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
    if (get(x, 17, z) !== B.SANDSTONE && get(x, 17, z) !== B.SANDBRICK) continue;
    const nearOpen = !get(x + 1, 17, z) || !get(x - 1, 17, z) || !get(x, 17, z + 1) || !get(x, 17, z - 1);
    if (nearOpen && (x + z) % 2 === 0) set(x, 18, z, B.SANDBRICK);
  }
  // навесы и фонари
  for (const [x0, z0, x1, z1] of [[24, 26, 28, 27], [64, 25, 68, 26], [83, 34, 86, 35]]) fill(x0, 15, z0, x1, 15, z1, B.PLANKS);
  for (const [x, z] of [[11, 21], [100, 15], [96, 54], [52, 21]]) set(x, 13, z, B.LAMP);
  // пальмы у респа Т
  for (const [x, z] of [[5, 22], [18, 38]]) {
    fill(x, 10, z, x, 15, z, B.LOG);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 2) set(x + dx, 16, z + dz, B.LEAVES);
    set(x, 17, z, B.LEAVES);
  }

  // яйца на постаментах, точки возрождения
  const info = { spawns: [[], []], eggs: [], sky: 0xf0d8a8, space: 'desert', name: 'Dust 2' };
  set(6, 10, 30, B.STEEL); set(104, 10, 23, B.STEEL);
  info.eggs.push({ team: 0, x: 6.5, y: 11, z: 30.5 }, { team: 1, x: 104.5, y: 11, z: 23.5 });
  for (let k = 0; k < 6; k++) {
    info.spawns[0].push([10 + (k % 3) * 3 + 0.5, 10, 23 + Math.floor(k / 3) * 12 + 0.5]);
    info.spawns[1].push([94 + (k % 3) * 3 + 0.5, 10, 17 + Math.floor(k / 3) * 12 + 0.5]);
  }
  info.bases = [{ team: 0, x0: 3, x1: 20, z0: 20, z1: 40 }, { team: 1, x0: 80, x1: 108, z0: 14, z1: 33 }];
  const redEgg = [6.5, 30.5], blueEgg = [104.5, 23.5];
  info.routes = mirrorRoutes([
    [[12, 30], [18, 45], [27, 50], [34, 49], [60, 51], [84, 50], [92, 37], [95, 30]],
    [[16, 30], [40, 30], [59, 29.5], [70, 30], [85, 27]],
    [[10, 25], [10, 14], [20, 8.5], [38, 9], [50, 12], [68, 11], [72, 11.5], [77, 14], [90, 20]],
    [[16, 30], [42, 32.5], [48, 35.5], [66, 38], [84, 38], [92, 34]],
  ], redEgg, blueEgg);
  return info;
}

// =====================================================================
// ВЕЛИКИЙ ФРОНТ — огромная карта 224×128 для долгих боёв.
// Крепости с цитаделями, траншеи и доты, передовые форты, деревни у реки,
// каньон с тремя мостами (каменный, крытый, разбитый), остров с руинами,
// сеть туннелей под всей картой с подземным залом под рекой.
// =====================================================================
export function genGiant(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill } = tools(w);
  const MID = (SX - 1) / 2;                  // 111.5 — середина (река)
  const RX0 = 105, RX1 = 118;                // вода
  const CZ_ = 64;                            // центральная линия
  const BASE_G = 19;                         // пол баз
  // плавный шум
  const P = new Float32Array(64 * 64); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((x & 63) << 6) | (y & 63)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const noise = (x, y) => (n2(x, y) + n2(x * 2.1, y * 2.1) * 0.5 + n2(x * 4.3, y * 4.3) * 0.25) / 1.75;
  const mx = (u, team) => team === 0 ? u : SX - 1 - u;    // зеркало для синих
  const smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  // ---------- рельеф ----------
  const H = new Int16Array(SX * SZ);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    let h = 19 + (noise(x * 0.045, z * 0.045) - 0.5) * 9;
    const mount = Math.max(0, 1 - Math.min(z, SZ - 1 - z) / 12);                 // горы по краям
    h += mount * mount * (12 + noise(x * 0.1 + 7, z * 0.1) * 8);
    const u = Math.min(x, SX - 1 - x);
    if (u < 4) h = Math.max(h, 30);                                              // торцевые скалы
    const dBase = Math.max(0, Math.abs(z - CZ_) - 24) + Math.max(0, u - 46);      // ровная площадка базы
    h = h + (BASE_G - h) * (1 - smooth01(dBase / 10));
    const dr = Math.abs(x - MID);                                                 // у реки — ровнее
    if (dr < 22) h = h + (18 - h) * (1 - smooth01((dr - 12) / 10));
    H[z * SX + x] = Math.max(12, Math.min(SY - 10, Math.round(h)));
  }
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const h = H[z * SX + x];
    set(x, 0, z, B.BEDROCK);
    for (let y = 1; y <= h; y++) {
      let id = y < h - 3 ? (noise(x * 0.3 + y * 0.2, z * 0.3) > 0.68 ? B.DARKSTONE : B.STONE) : y < h ? B.DIRT : (h > 27 ? B.SNOW : B.GRASS);
      if (y === h && h <= 27 && r() < 0.04) id = B.GRAVEL;
      set(x, y, z, id);
    }
  }
  const top = (x, z) => H[Math.max(0, Math.min(SZ - 1, z)) * SX + Math.max(0, Math.min(SX - 1, x))];

  // ---------- река в каньоне: вода + берега ступеньками по 1 блоку ----------
  for (let z = 0; z < SZ; z++) for (let x = RX0 - 6; x <= RX1 + 6; x++) {
    const dist = x < RX0 ? RX0 - x : x > RX1 ? x - RX1 : 0;
    const t = dist === 0 ? 9 : Math.min(top(x, z), 11 + dist); // первая ступенька — вровень с водой: легко выплыть
    fill(x, t + 1, z, x, SY - 1, z, 0);
    if (dist === 0) { set(x, 9, z, B.SAND); fill(x, 10, z, x, 12, z, B.WATER); fill(x, 7, z, x, 8, z, B.STONE); }
    else set(x, t, z, dist < 3 ? B.SAND : B.GRAVEL);
    H[z * SX + x] = dist === 0 ? 12 : t;
  }

  // ---------- туннели (уровень ног y=3, потолок y=6) ----------
  const tunnels = [];
  const tunX = (xa, xb, z) => tunnels.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: z - 1, z1: z + 1 });
  const tunZ = (za, zb, x) => tunnels.push({ x0: x - 1, x1: x + 1, z0: Math.min(za, zb), z1: Math.max(za, zb) });
  tunX(47, SX - 48, CZ_);        // главный: от крепости до крепости
  tunX(85, SX - 86, 30);         // северный: между фортами
  tunX(97, SX - 98, 98);         // южный: между деревнями
  tunZ(30, 98, 111); tunZ(30, 98, 112);   // поперечный под рекой
  // обшивка: пол, стены, потолок — сначала у всех, потом вырезаем воздух (перекрёстки остаются открытыми)
  for (const t of tunnels) {
    fill(t.x0 - 1, 2, t.z0 - 1, t.x1 + 1, 2, t.z1 + 1, B.STONE);
    fill(t.x0 - 1, 6, t.z0 - 1, t.x1 + 1, 6, t.z1 + 1, B.CONCRETE);
    fill(t.x0 - 1, 3, t.z0 - 1, t.x1 + 1, 5, t.z1 + 1, B.BRICK);
  }
  // подземный зал под рекой с колоннами
  fill(101, 2, 52, 122, 7, 76, B.BRICK);
  fill(101, 8, 52, 122, 8, 76, B.CONCRETE);
  for (const t of tunnels) fill(t.x0, 3, t.z0, t.x1, 5, t.z1, 0);
  fill(102, 3, 53, 121, 7, 75, 0);
  for (let x = 104; x <= 119; x += 5) for (let z = 56; z <= 72; z += 5) { fill(x, 3, z, x + 1, 7, z + 1, B.CONCRETE); set(x, 5, z, B.LAMP); }
  for (let z = 58; z <= 70; z += 4) { set(106, 3, z, B.SANDBAG); set(117, 3, z, B.SANDBAG); }
  fill(110, 3, 63, 113, 3, 65, B.CRATE);
  // фонари в стенах туннелей и ящики с ТНТ
  for (const t of tunnels) {
    const alongX = t.x1 - t.x0 > t.z1 - t.z0;
    for (let k = 4; k < (alongX ? t.x1 - t.x0 : t.z1 - t.z0); k += 9) {
      if (alongX) { if (get(t.x0 + k, 4, t.z0 - 1) === B.BRICK) set(t.x0 + k, 4, t.z0 - 1, B.LAMP); if (get(t.x0 + k + 4, 4, t.z1 + 1) === B.BRICK) set(t.x0 + k + 4, 4, t.z1 + 1, B.LAMP); }
      else { if (get(t.x0 - 1, 4, t.z0 + k) === B.BRICK) set(t.x0 - 1, 4, t.z0 + k, B.LAMP); }
    }
  }
  for (const [x, z] of [[70, 64], [153, 64], [96, 30], [127, 30], [104, 98], [119, 98]]) { set(x, 3, z - 1, B.TNT); set(x + 1, 3, z - 1, B.CRATE); }

  // спуск-лестница вдоль x: от поверхности (стоим на yTop) вниз до y=3, по блоку на шаг
  const stairs = (xs, z, dir, yTop) => {
    const n = yTop - 3;
    for (let k = 0; k <= n; k++) {
      const x = xs + dir * k, y = yTop - k;
      fill(x, y - 1, z - 2, x, y + 3, z - 2, B.BRICK); fill(x, y - 1, z + 2, x, y + 3, z + 2, B.BRICK);
    }
    for (let k = 0; k <= n; k++) {
      const x = xs + dir * k, y = yTop - k;
      fill(x, y, z - 1, x, y + 3, z + 1, 0);
      fill(x, y - 1, z - 1, x, y - 1, z + 1, B.PLANKS);
      if (k % 6 === 3) set(x, y + 1, z - 2, B.LAMP);
    }
    return xs + dir * n;
  };

  // ---------- крепости ----------
  const info = { spawns: [[], []], eggs: [], bases: [], sky: 0x9fd0ff, space: 'open', name: 'Великий фронт' };
  for (const team of [0, 1]) {
    const X = (u) => mx(u, team), dir = team === 0 ? 1 : -1;
    const wool = team === 0 ? B.WOOL_RED : B.WOOL_BLUE, metal = team === 0 ? B.REDWOOD : B.BLUEMETAL;
    const G = BASE_G;
    // площадка
    for (let u = 4; u <= 46; u++) for (let z = 38; z <= 90; z++) {
      const x = X(u);
      fill(x, G + 1, z, x, SY - 1, z, 0);
      fill(x, 1, z, x, G - 1, z, get(x, 1, z) || B.STONE);
      set(x, G, z, ((u + z) % 9 === 0) ? wool : B.CONCRETE);
      H[z * SX + x] = G;
    }
    // внешняя стена с зубцами, ворота спереди и по бокам
    const U0 = 6, U1 = 42, Z0 = 42, Z1 = 86;
    for (let u = U0; u <= U1; u++) for (let z = Z0; z <= Z1; z++) {
      const edge = u === U0 || u === U1 || z === Z0 || z === Z1;
      if (!edge) continue;
      if (u === U1 && Math.abs(z - CZ_) <= 2) continue;
      if ((z === Z0 || z === Z1) && u >= 22 && u <= 25) continue;
      fill(X(u), G + 1, z, X(u), G + 4, z, u === U1 ? B.CONCRETE : B.BRICK);
      if ((u + z) % 2 === 0) set(X(u), G + 5, z, wool);
    }
    // угловые башни 5×5 высотой 10 с лестницей снаружи
    for (const [cu, cz, su, sz] of [[U0, Z0, 1, 1], [U0, Z1, 1, -1], [U1, Z0, -1, 1], [U1, Z1, -1, -1]]) {
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
        const u = cu + su * a, z = cz + sz * b, edge = a === 0 || b === 0 || a === 4 || b === 4;
        if (edge) fill(X(u), G + 1, z, X(u), G + 9, z, (a + b) % 4 === 0 ? B.LOG : B.BRICK);
        set(X(u), G + 10, z, B.PLANKS);
        if (edge && (a + b) % 2 === 0) set(X(u), G + 11, z, wool);
        if (edge && a === 2) fill(X(u), G + 7, z, X(u), G + 7, z, 0);     // бойницы
      }
      // лестница вдоль стены к площадке башни
      for (let k = 1; k <= 10; k++) {
        const u = cu + su * 2, z = cz + sz * (5 + 10 - k);
        fill(X(u), G + 1, z, X(u), G + k, z, k === 10 ? B.PLANKS : B.LOG);
      }
      fill(X(cu + su * 2), G + 10, cz + sz * 4, X(cu + su * 2), G + 11, cz + sz * 4, 0);
    }
    // цитадель с яйцом
    const K0 = 14, K1 = 27, KZ0 = 55, KZ1 = 73;
    for (let u = K0; u <= K1; u++) for (let z = KZ0; z <= KZ1; z++) {
      const edge = u === K0 || u === K1 || z === KZ0 || z === KZ1;
      if (edge) {
        const door = (u === K1 && Math.abs(z - CZ_) <= 1) || ((z === KZ0 || z === KZ1) && u >= 19 && u <= 21) || (u === K0 && Math.abs(z - CZ_) <= 1);
        if (!door) { fill(X(u), G + 1, z, X(u), G + 5, z, metal); if ((u + z) % 3 === 0) set(X(u), G + 3, z, B.GLASS); }
        else set(X(u), G + 4, z, metal), set(X(u), G + 5, z, metal);
      }
      // крыша с проёмом над яйцом
      if (!(u >= 18 && u <= 22 && z >= 61 && z <= 67)) set(X(u), G + 6, z, B.CONCRETE);
    }
    for (let du = -1; du <= 1; du++) for (let dz = -1; dz <= 1; dz++) set(X(20 + du), G + 1, CZ_ + dz, B.STEEL);
    for (const dz of [-4, 4]) for (let du = -2; du <= 2; du++) set(X(20 + du), G + 1, CZ_ + dz, B.SANDBAG);
    info.eggs.push({ team, x: X(20) + 0.5, y: G + 2, z: CZ_ + 0.5 });
    set(X(16), G + 1, 58, B.LAMP); set(X(16), G + 1, 70, B.LAMP);
    // казармы-респаун у задней стены
    for (let k = 0; k < 8; k++) info.spawns[team].push([X(9 + (k % 2) * 2) + 0.5, G + 1, 47 + k * 5 + 0.5]);
    // мешки и ящики во дворе
    for (const z of [48, 52, 76, 80]) for (let du = 0; du < 3; du++) set(X(32 + du), G + 1, z, B.SANDBAG);
    for (const z of [58, 70]) { set(X(37), G + 1, z, B.CRATE); set(X(37), G + 2, z, B.CRATE); set(X(38), G + 1, z, B.CRATE); }
    // спуск в главный туннель (из двора к воротам)
    fill(X(29), G + 1, CZ_ - 2, X(29), G + 2, CZ_ + 2, B.SANDBAG);
    fill(X(29), G + 1, CZ_ - 1, X(29), G + 2, CZ_ + 1, 0);
    stairs(X(30), CZ_, dir, G + 1);
    info.bases.push({ team, x0: Math.min(X(U0), X(U1)), x1: Math.max(X(U0), X(U1)), z0: Z0, z1: Z1 });

    // ---------- траншеи с бруствером и доты ----------
    for (let z = 12; z <= SZ - 13; z++) {
      const u = 54 + ((Math.floor(z / 9) % 2) ? 2 : 0), x = X(u);
      for (const xx of [x, x + 1]) {
        const h = top(xx, z);
        fill(xx, h, z, xx, h + 3, z, 0); set(xx, h - 1, z, B.DIRT);
      }
      const px = X(u + 2), ph = top(px, z);
      if (z % 4 !== 0) set(px, ph + 1, z, B.SANDBAG);
    }
    for (const cz of [32, CZ_, 96]) {
      const u0 = 60, x0 = X(u0), x1 = X(u0 + 6), g = top(X(u0 + 3), cz);
      fill(x0, g, cz - 3, x1, g, cz + 3, B.CONCRETE);
      for (let u = u0; u <= u0 + 6; u++) for (let z = cz - 3; z <= cz + 3; z++) {
        const edge = u === u0 || u === u0 + 6 || z === cz - 3 || z === cz + 3;
        fill(X(u), g + 1, z, X(u), g + 4, z, 0);
        if (edge) {
          fill(X(u), g + 1, z, X(u), g + 3, z, B.CONCRETE);
          if (u === u0 + 6 && Math.abs(z - cz) <= 2) set(X(u), g + 2, z, 0);     // амбразура к врагу
          if (u === u0 && Math.abs(z - cz) <= 1) fill(X(u), g + 1, z, X(u), g + 2, z, 0); // вход сзади
        }
        set(X(u), g + 4, z, B.CONCRETE);
      }
      set(X(u0 + 3), g + 1, cz, B.SANDBAG);
    }

    // ---------- передовой форт (север) со спуском в северный туннель ----------
    {
      const u0 = 64, u1 = 80, z0 = 21, z1 = 39, g = 19;
      for (let u = u0 - 2; u <= u1 + 2; u++) for (let z = z0 - 2; z <= z1 + 2; z++) { const x = X(u); fill(x, g + 1, z, x, SY - 1, z, 0); fill(x, 1, z, x, g - 1, z, get(x, 1, z) || B.STONE); set(x, g, z, B.GRAVEL); H[z * SX + x] = g; }
      for (let u = u0; u <= u1; u++) for (let z = z0; z <= z1; z++) {
        const edge = u === u0 || u === u1 || z === z0 || z === z1;
        if (!edge) continue;
        if ((u === u1 || u === u0) && Math.abs(z - 30) <= 1) continue;
        const hh = 3 + Math.floor(r() * 3) - (r() < 0.15 ? 3 : 0);            // разрушенные стены
        if (hh > 0) fill(X(u), g + 1, z, X(u), g + hh, z, r() < 0.3 ? B.DARKSTONE : B.STONE);
      }
      for (const [u, z] of [[u0, z0], [u0, z1], [u1, z0], [u1, z1]]) {
        fill(X(u), g + 1, z, X(u), g + 8, z, B.STONE);
        fill(X(u) - 1, g + 8, z - 1, X(u) + 1, g + 8, z + 1, B.PLANKS);
        for (const [a, b] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) set(X(u) + a, g + 9, z + b, B.SANDBAG);
      }
      for (let k = 1; k <= 7; k++) set(X(u0 + 1), g + k, z0 + 1 + k, B.PLANKS), fill(X(u0 + 1), g + 1, z0 + 1 + k, X(u0 + 1), g + k - 1, z0 + 1 + k, B.STONE);
      stairs(X(68), 30, dir, g + 1);
      for (const z of [25, 35]) for (let du = 0; du < 3; du++) set(X(72 + du), g + 1, z, B.SANDBAG);
    }
    // ---------- деревня у реки (юг) со спуском в южный туннель ----------
    {
      const houses = [[84, 72], [90, 78], [84, 86], [92, 88], [86, 108], [93, 112], [84, 46], [91, 42]];
      for (const [hu, hz] of houses) {
        const w0 = 5, d0 = 5, g = top(X(hu + 2), hz + 2);
        for (let u = hu; u < hu + w0; u++) for (let z = hz; z < hz + d0; z++) {
          const x = X(u); fill(x, g + 1, z, x, g + 6, z, 0); set(x, g, z, B.PLANKS); H[z * SX + x] = g;
          const edge = u === hu || u === hu + w0 - 1 || z === hz || z === hz + d0 - 1;
          const ruined = r() < 0.12;
          if (edge && !ruined) {
            const door = z === hz + 2 && u === (team === 0 ? hu + w0 - 1 : hu);
            if (!door) { fill(x, g + 1, z, x, g + 3, z, (u + z) % 5 === 0 ? B.LOG : B.PLANKS); if ((u + z) % 3 === 1) set(x, g + 2, z, B.GLASS); }
          }
          if (r() < 0.8) set(x, g + 4, z, B.ROOF);
        }
        if (r() < 0.5) set(X(hu + 2), g + 1, hz + 1, r() < 0.5 ? B.TNT : B.CRATE);
      }
      const g = top(X(80), 98);
      for (let u = 76; u <= 82; u++) for (let z = 95; z <= 101; z++) { const x = X(u); fill(x, g + 1, z, x, g + 6, z, 0); set(x, g, z, B.GRAVEL); H[z * SX + x] = g; }
      for (let z = 95; z <= 101; z++) if (Math.abs(z - 98) > 1) fill(X(78), g + 1, z, X(78), g + 1, z, B.SANDBAG);
      stairs(X(80), 98, dir, g + 1);
    }
  }

  // ---------- мосты через каньон ----------
  const BX0 = RX0 - 7, BX1 = RX1 + 7;
  const deck = 18;
  const approach = (z0, z1) => { // выравниваем подход к мосту
    for (const [xa, xb] of [[BX0 - 6, BX0], [BX1, BX1 + 6]]) for (let x = xa; x <= xb; x++) for (let z = z0; z <= z1; z++) {
      fill(x, deck + 1, z, x, deck + 6, z, 0); fill(x, deck - 3, z, x, deck, z, B.STONE); set(x, deck, z, B.GRAVEL);
    }
  };
  // северный каменный мост с арками
  approach(21, 26);
  for (let x = BX0; x <= BX1; x++) {
    fill(x, deck, 21, x, deck, 26, B.STONE);
    set(x, deck + 1, 21, x % 2 ? B.STONE : 0); set(x, deck + 1, 26, x % 2 ? B.STONE : 0);
    fill(x, deck + 1, 22, x, deck + 4, 25, 0);
  }
  for (const x of [RX0 + 1, RX0 + 6, RX0 + 7, RX1 - 1]) fill(x, 9, 22, x, deck - 1, 25, B.STONE);
  // центральный крытый мост через остров
  approach(60, 67);
  for (let x = BX0; x <= BX1; x++) {
    fill(x, deck, 60, x, deck, 67, B.PLANKS);
    fill(x, deck + 1, 61, x, deck + 4, 66, 0);
    for (const z of [60, 67]) { fill(x, deck + 1, z, x, deck + 3, z, x % 4 === 0 ? B.LOG : B.PLANKS); if (x % 4 === 2) set(x, deck + 2, z, 0); }
    fill(x, deck + 4, 60, x, deck + 4, 67, B.ROOF);
    if (x % 9 === 0) set(x, deck + 3, 61, B.LAMP);
  }
  for (const x of [RX0 + 2, RX1 - 2]) for (const z of [60, 67]) fill(x, 9, z, x, deck - 1, z, B.LOG);
  // остров с руинами (под мостом — укрытие у воды)
  for (let x = RX0 + 3; x <= RX1 - 3; x++) for (let z = 50; z <= 78; z++) {
    if (z >= 59 && z <= 68) continue;
    const e = Math.min(x - RX0 - 3, RX1 - 3 - x, Math.abs(z - 50), Math.abs(78 - z));
    const t = Math.min(16, 12 + e);
    fill(x, 9, z, x, t, z, B.STONE); set(x, t, z, e > 1 ? B.GRASS : B.SAND);
    fill(x, t + 1, z, x, 15, z, 0);
  }
  for (let x = RX0 + 4; x <= RX1 - 4; x++) for (const z of [52, 76]) if (r() < 0.75) fill(x, 17, z, x, 16 + 1 + Math.floor(r() * 3), z, B.STONE);
  for (let z = 52; z <= 76; z++) if (z < 59 || z > 68) for (const x of [RX0 + 4, RX1 - 4]) if (r() < 0.6) fill(x, 17, z, x, 18, z, B.STONE);
  // южный мост — дощатый, без перил, с провалом посередине
  approach(102, 104);
  for (let x = BX0; x <= BX1; x++) {
    if (Math.abs(x - MID) < 1.6) continue;
    fill(x, deck, 102, x, deck, 104, B.PLANKS);
    fill(x, deck + 1, 102, x, deck + 4, 104, 0);
  }
  for (const x of [RX0 + 3, RX1 - 3]) fill(x, 9, 103, x, deck - 1, 103, B.LOG);

  // ---------- лес и камни на флангах ----------
  for (let i = 0; i < 160; i++) {
    const x = 6 + Math.floor(r() * (SX - 12)), z = 6 + Math.floor(r() * (SZ - 12));
    if (Math.abs(x - MID) < 16 || Math.abs(z - CZ_) < 30 && (x < 50 || x > SX - 51)) continue;
    if ((z > 16 && z < 44) && ((x > 60 && x < 84) || (x > SX - 85 && x < SX - 61))) continue;
    const h = top(x, z);
    if (get(x, h, z) !== B.GRASS || get(x, h + 1, z) !== 0) continue;
    if (r() < 0.25) { // камень
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (r() < 0.7) fill(x + dx, h + 1, z + dz, x + dx, h + 1 + Math.floor(r() * 2), z + dz, B.STONE);
      continue;
    }
    const th = 4 + Math.floor(r() * 3);
    fill(x, h + 1, z, x, h + th, z, B.LOG);
    const t = h + th;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy >= 0 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
        if (!get(x + dx, t + dy, z + dz)) set(x + dx, t + dy, z + dz, B.LEAVES);
      }
    }
    set(x, t + 1, z, B.LEAVES);
  }
  // воронки и укрытия на нейтральной полосе
  for (let i = 0; i < 26; i++) {
    const x = 60 + Math.floor(r() * (SX - 120)), z = 10 + Math.floor(r() * (SZ - 20));
    if (Math.abs(x - MID) < 12) continue;
    const h = top(x, z);
    if (get(x, h + 1, z)) continue;
    if (r() < 0.5) { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx * dx + dz * dz < 2 && get(x + dx, h + 1, z + dz) === 0) set(x + dx, h, z + dz, 0); }
    else for (let k = 0; k < 3; k++) if (!get(x + k, h + 1, z)) set(x + k, h + 1, z, r() < 0.2 ? B.TNT : B.SANDBAG);
  }

  // маршруты для ботов: север (каменный мост), центр (крытый), юг (дощатый)
  const redEgg = [info.eggs[0].x, info.eggs[0].z], blueEgg = [info.eggs[1].x, info.eggs[1].z];
  const lanes = [
    [[44, 64], [62, 50], [80, 30], [96, 24], [111.5, 23.5], [128, 24], [150, 34], [168, 50], [184, 64]],
    [[44, 64], [70, 64], [95, 64], [111.5, 63.5], [128, 64], [153, 64], [184, 64]],
    [[44, 64], [62, 80], [82, 96], [96, 103], [111.5, 103], [128, 103], [150, 94], [168, 78], [184, 64]],
  ];
  info.routes = mirrorRoutes(lanes, redEgg, blueEgg);
  return info;
}

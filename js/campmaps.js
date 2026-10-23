// Карты кампании «Последнее яйцо»: учебный лагерь, сухогруз в шторм, заброшенный город, авиабаза с ракетной шахтой.
// Координаты: x — на восток, z — на юг, y — вверх. Пол «на земле» — y = G, стоим на G + 1.
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
  // пустая коробка: стены, пол и (по желанию) крыша
  const shell = (x0, y0, z0, x1, y1, z1, wall, floor, roof) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const e = x === x0 || x === x1 || z === z0 || z === z1;
      if (y === y0 && floor) set(x, y, z, floor);
      else if (y === y1 && roof) set(x, y, z, roof);
      else set(x, y, z, e ? wall : 0);
    }
  };
  const tree = (r, x, y, z, h = 4 + Math.floor(r() * 3)) => {
    fill(x, y, z, x, y + h - 1, z, B.LOG);
    const t = y + h - 1;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy >= 0 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
        if (!get(x + dx, t + dy, z + dz)) set(x + dx, t + dy, z + dz, B.LEAVES);
      }
    }
    set(x, t + 2, z, B.LEAVES);
  };
  // лестница с поворотом внутри здания: колодец x0..x0+5, z0..z0+3; этажи через h блоков, начиная с пола y0
  // марши по 3 ступени (h = 3) идут поочерёдно вдоль z0..z0+1 (на восток) и z0+2..z0+3 (на запад)
  const stairwell = (x0, z0, y0, floors, h, mat) => {
    for (let f = 0; f < floors; f++) {
      const fy = y0 + f * h;               // пол этажа f
      const east = f % 2 === 0;
      // проём в перекрытии над маршем
      fill(x0, fy + h, z0, x0 + 5, fy + h, z0 + 3, 0);
      // площадки на верхнем этаже марша
      if (east) fill(x0 + 4, fy + h, z0, x0 + 5, fy + h, z0 + 3, mat);
      else fill(x0, fy + h, z0, x0 + 1, fy + h, z0 + 3, mat);
      for (let k = 1; k <= h; k++) {
        const x = east ? x0 + 1 + k : x0 + 4 - k;
        const zz = east ? z0 : z0 + 2;
        fill(x, fy + 1, zz, x, fy + k, zz + 1, mat);
        fill(x, fy + k + 1, zz, x, fy + k + 3, zz + 1, 0);
      }
      // нижняя площадка марша
      if (east) fill(x0, fy, z0, x0 + 1, fy, z0 + 1, mat); else fill(x0 + 4, fy, z0 + 2, x0 + 5, fy, z0 + 3, mat);
    }
  };
  return { set, get, fill, shell, tree, stairwell, ok };
}

function baseInfo(name, sky, space, extra = {}) {
  return { spawns: [[], []], eggs: [], bases: [], sky, space, name, ...extra };
}

// =====================================================================
// УЧЕБНЫЙ ЛАГЕРЬ «КУРЯТНИК» (пролог)
// =====================================================================
function genCamp(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill, shell, tree } = tools(w);
  const G = 9;
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, G - 3, SZ - 1, B.STONE);
  fill(0, G - 2, 0, SX - 1, G - 1, SZ - 1, B.DIRT);
  fill(0, G, 0, SX - 1, G, SZ - 1, B.GRASS);
  // холмики по краям
  for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
    const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
    if (edge < 4) fill(x, G + 1, z, x, G + 4 - edge + Math.floor(r() * 2), z, edge < 2 ? B.STONE : B.DIRT);
    else if (r() < 0.05) set(x, G, z, B.GRAVEL);
  }
  // дорожки из гравия
  fill(4, G, 28, 100, G, 32, B.GRAVEL);
  fill(36, G, 4, 40, G, 56, B.GRAVEL);
  // казармы
  for (const [x0, z0] of [[6, 6], [6, 44]]) {
    shell(x0, G, z0, x0 + 18, G + 5, z0 + 9, B.REDWOOD, B.PLANKS, B.ROOF);
    fill(x0 + 1, G + 6, z0 + 1, x0 + 17, G + 6, z0 + 8, B.ROOF);
    for (let x = x0 + 2; x <= x0 + 16; x += 4) fill(x, G + 2, z0, x + 1, G + 3, z0, B.GLASS), fill(x, G + 2, z0 + 9, x + 1, G + 3, z0 + 9, B.GLASS);
    const dz = z0 === 6 ? z0 + 9 : z0;
    fill(x0 + 8, G + 1, dz, x0 + 10, G + 3, dz, 0);
    for (let x = x0 + 2; x <= x0 + 16; x += 3) { set(x, G + 1, z0 + 2, B.CRATE); set(x, G + 1, z0 + 7, B.CRATE); }
    set(x0 + 9, G + 4, z0 + 4, B.LAMP);
  }
  // гнездо с Золотым Яйцом в центре лагеря: кольцо мешков и вышка
  const EX = 24, EZ = 30;
  set(EX, G + 1, EZ, B.STEEL);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== 3) continue;
    if (dx === 3 && Math.abs(dz) <= 1) continue;
    fill(EX + dx, G + 1, EZ + dz, EX + dx, G + 2, EZ + dz, B.SANDBAG);
  }
  for (const [tx, tz] of [[EX - 6, EZ - 6], [EX - 6, EZ + 6]]) {
    for (const [a, b] of [[0, 0], [2, 0], [0, 2], [2, 2]]) fill(tx + a, G + 1, tz + b, tx + a, G + 6, tz + b, B.LOG);
    fill(tx - 1, G + 7, tz - 1, tx + 3, G + 7, tz + 3, B.PLANKS);
    for (let k = 0; k < 5; k++) set(tx - 1 + k, G + 8, tz - 1, B.SANDBAG), set(tx - 1 + k, G + 8, tz + 3, B.SANDBAG);
    for (let k = 1; k <= 6; k++) set(tx + 1, G + k, tz + 3 + (7 - k), B.PLANKS), fill(tx + 1, G + 1, tz + 3 + (7 - k), tx + 1, G + k - 1, tz + 3 + (7 - k), B.LOG);
  }
  // флагшток
  fill(EX - 2, G + 1, EZ - 9, EX - 2, G + 12, EZ - 9, B.LOG);
  fill(EX - 1, G + 10, EZ - 9, EX + 3, G + 12, EZ - 9, B.WOOL_RED);
  // стрельбище: огневой рубеж, мишени, вал
  fill(44, G + 1, 4, 44, G + 1, 18, B.SANDBAG);
  for (let z = 5; z <= 17; z += 3) set(44, G + 2, z, B.SANDBAG);
  fill(43, G, 4, 43, G, 18, B.PLANKS);
  for (const x of [56, 64, 72]) for (const z of [6, 10, 14]) { set(x, G + 1, z + 2, B.PLANKS); }
  fill(102, G + 1, 2, 104, G + 6, 20, B.DIRT);
  // дальняя дистанция для снайперки: помост
  fill(94, G + 1, 8, 98, G + 3, 12, B.PLANKS); fill(94, G + 1, 8, 98, G + 2, 12, B.LOG);
  fill(94, G + 4, 8, 98, G + 4, 8, B.SANDBAG);
  // таблички-столбы с номерами дистанции
  for (const x of [56, 64, 72, 96]) { set(x, G + 1, 3, B.LOG); set(x, G + 2, 3, B.LAMP); }
  // яма для гранат
  fill(48, G - 2, 24, 56, G, 34, 0);
  fill(48, G - 3, 24, 56, G - 3, 34, B.DIRT);
  for (let x = 48; x <= 56; x++) { set(x, G + 1, 23, B.SANDBAG); set(x, G + 1, 35, B.SANDBAG); }
  for (let z = 24; z <= 34; z++) { set(57, G + 1, z, B.SANDBAG); }
  fill(48, G - 2, 28, 48, G, 30, B.DIRT); // ступеньки из ямы
  set(49, G - 2, 29, B.DIRT); set(49, G - 1, 29, B.DIRT);
  // полоса препятствий: две вышки с пропастью между ними (перелёт планированием)
  fill(60, G - 4, 40, 69, G, 52, 0); fill(60, G - 5, 40, 69, G - 5, 52, B.WATER);
  fill(60, G - 6, 40, 69, G - 6, 52, B.SAND);
  for (const [x0, x1, h] of [[54, 59, 7], [70, 75, 4]]) {
    fill(x0, G + 1, 42, x1, G + h - 1, 50, B.LOG); fill(x0 + 1, G + 1, 43, x1 - 1, G + h - 2, 49, 0);
    fill(x0, G + h, 42, x1, G + h, 50, B.PLANKS);
    for (let x = x0; x <= x1; x++) set(x, G + h + 1, 42, B.SANDBAG);
  }
  // ступени на первую вышку (с запада) и спуск со второй (на восток)
  for (let k = 1; k <= 7; k++) fill(46 + k, G + 1, 45, 46 + k, G + k, 47, B.PLANKS);
  for (let k = 1; k <= 4; k++) fill(75 + k, G + 1, 45, 75 + k, G + 5 - k, 47, B.PLANKS);
  // площадка для стройки (песок)
  fill(36, G, 40, 44, G, 50, B.SAND);
  // ограда лагеря с воротами на восток
  for (let z = 4; z <= 56; z++) { if (Math.abs(z - 30) <= 3) continue; set(88, G + 1, z, B.LOG); if (z % 2) set(88, G + 2, z, B.PLANKS); }
  // лес за оградой (оттуда придут синие)
  for (let i = 0; i < 46; i++) {
    const x = 90 + Math.floor(r() * 18), z = 4 + Math.floor(r() * 52);
    if (Math.abs(z - 30) < 4 || get(x, G + 1, z)) continue;
    tree(r, x, G + 1, z);
  }
  for (let i = 0; i < 18; i++) { const x = 30 + Math.floor(r() * 56), z = 36 + Math.floor(r() * 18); if (x > 52 && x < 92 && z > 36) continue; if (!get(x, G + 1, z)) tree(r, x, G + 1, z); }
  // ящики и мешки — укрытия на подходе
  for (const [x, z] of [[70, 24], [74, 34], [80, 27], [66, 33], [60, 22], [84, 36], [30, 22], [30, 38]]) { fill(x, G + 1, z, x + 1, G + 1, z, r() < 0.5 ? B.CRATE : B.SANDBAG); if (r() < 0.5) set(x, G + 2, z, B.CRATE); }
  for (const [x, z] of [[34, 30], [34, 26], [34, 34]]) fill(x, G + 1, z - 1, x, G + 2, z + 1, B.SANDBAG);
  // фонари вдоль дорожки
  for (let x = 10; x <= 86; x += 12) { set(x, G + 1, 27, B.LOG); set(x, G + 2, 27, B.LAMP); }
  const info = baseInfo('Лагерь «Курятник»', 0xa8d4ff, 'open');
  info.eggs.push({ team: 0, x: EX + 0.5, y: G + 2, z: EZ + 0.5 }, { team: 1, x: 104.5, y: G + 1, z: 30.5, virtual: true });
  info.spawns[0].push([12.5, G + 1, 22.5]); info.spawns[1].push([104.5, G + 1, 30.5]);
  info.bases = [{ team: 0, x0: 4, x1: 40, z0: 4, z1: 56 }, { team: 1, x0: 90, x1: 108, z0: 4, z1: 56 }];
  return info;
}

// =====================================================================
// СУХОГРУЗ «НЕСУШКА-7» В ШТОРМ
// =====================================================================
function genShip(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill, shell } = tools(w);
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, 2, SZ - 1, B.SAND);
  fill(0, 3, 0, SX - 1, 8, SZ - 1, B.WATER);
  const X0 = 10, X1 = 101, Z0 = 22, Z1 = 38, DECK = 13;
  const hullZ = (x) => { // нос сужается
    const k = Math.max(0, x - 92) / 9;
    const half = 8 - Math.round(k * k * 7);
    return [30 - half, 30 + half];
  };
  // корпус: борта и днище
  for (let x = X0; x <= X1; x++) {
    const [za, zb] = hullZ(x);
    for (let z = za; z <= zb; z++) {
      fill(x, 3, z, x, DECK, z, 0);
      set(x, 2, z, B.STEEL);
      const edge = z === za || z === zb || x === X0 || x === X1;
      if (edge) {
        for (let y = 3; y <= DECK; y++) set(x, y, z, y < 9 ? B.BLUEMETAL : y === 9 ? B.WOOL_RED : B.STEEL);
        if ((x + z) % 2 === 0 || x === X0) set(x, DECK + 1, z, B.STEEL); // фальшборт
      } else set(x, DECK, z, B.CONCRETE);
    }
  }
  // палуба: настил железный
  for (let x = X0 + 1; x < X1; x++) { const [za, zb] = hullZ(x); for (let z = za + 1; z < zb; z++) if ((x + z) % 7 === 0) set(x, DECK, z, B.STEEL); }
  // --- надстройка на корме: три яруса и мостик ---
  const SX0 = 12, SX1 = 26, SZ0 = 24, SZ1 = 36;
  for (const [y0, y1] of [[DECK, DECK + 5], [DECK + 5, DECK + 10], [DECK + 10, DECK + 14]]) shell(SX0, y0, SZ0, SX1, y1, SZ1, B.STEEL, B.CONCRETE, null);
  fill(SX0, DECK + 14, SZ0, SX1, DECK + 14, SZ1, B.STEEL);
  // окна мостика по кругу
  for (let x = SX0 + 1; x < SX1; x++) for (const z of [SZ0, SZ1]) fill(x, DECK + 11, z, x, DECK + 12, z, (x % 3) ? B.GLASS : B.STEEL);
  for (let z = SZ0 + 1; z < SZ1; z++) fill(SX1, DECK + 11, z, SX1, DECK + 12, z, (z % 3) ? B.GLASS : B.STEEL);
  // иллюминаторы ниже
  for (let x = SX0 + 2; x < SX1; x += 3) for (const z of [SZ0, SZ1]) { set(x, DECK + 3, z, B.GLASS); set(x, DECK + 8, z, B.GLASS); }
  // двери на палубу (восток) на всех ярусах и снаружи — трап
  fill(SX1, DECK + 1, 29, SX1, DECK + 3, 31, 0);
  fill(SX1, DECK + 6, 29, SX1, DECK + 8, 30, 0);
  // внутренняя лестница: марши вдоль северной стены
  for (let k = 1; k <= 5; k++) { fill(SX0 + 1 + k, DECK + 1, SZ0 + 1, SX0 + 1 + k, DECK + k, SZ0 + 2, B.PLANKS); fill(SX0 + 1 + k, DECK + 5, SZ0 + 1, SX0 + 1 + k, DECK + 5, SZ0 + 2, 0); }
  fill(SX0 + 7, DECK + 5, SZ0 + 1, SX0 + 8, DECK + 5, SZ0 + 2, B.CONCRETE);
  for (let k = 1; k <= 5; k++) { fill(SX0 + 7 + k, DECK + 6, SZ0 + 1, SX0 + 7 + k, DECK + 5 + k, SZ0 + 2, B.PLANKS); fill(SX0 + 7 + k, DECK + 10, SZ0 + 1, SX0 + 7 + k, DECK + 10, SZ0 + 2, 0); }
  fill(SX1 - 1, DECK + 10, SZ0 + 1, SX1 - 1, DECK + 10, SZ0 + 2, B.CONCRETE);
  // мебель: пульт, ящики, койки
  fill(SX0 + 2, DECK + 11, SZ0 + 5, SX0 + 2, DECK + 11, SZ1 - 5, B.BLUEMETAL);
  set(SX0 + 2, DECK + 12, 30, B.LAMP);
  for (const [x, z, y] of [[16, 33, DECK + 1], [20, 34, DECK + 1], [23, 27, DECK + 1], [15, 30, DECK + 6], [21, 34, DECK + 6], [19, 27, DECK + 6]]) { set(x, y, z, B.CRATE); if (r() < 0.5) set(x + 1, y, z, B.CRATE); }
  for (const [x, z, y] of [[18, 30, DECK + 4], [18, 30, DECK + 9], [22, 30, DECK + 13]]) set(x, y, z, B.LAMP);
  // труба
  fill(14, DECK + 15, 28, 18, DECK + 22, 32, B.REDWOOD);
  fill(14, DECK + 19, 28, 18, DECK + 19, 32, B.STEEL);
  fill(15, DECK + 15, 29, 17, DECK + 22, 31, 0);
  // мачты с огнями
  for (const x of [44, 70, 92]) { fill(x, DECK + 1, 30, x, DECK + 9, 30, B.STEEL); set(x, DECK + 10, 30, B.LAMP); }
  // --- контейнеры на палубе ---
  const COLS = [B.WOOL_RED, B.WOOL_BLUE, B.REDWOOD, B.BLUEMETAL, B.STEEL, B.WOOL_RED];
  const container = (x0, y0, z0, len, col, openEnd) => {
    for (let x = x0; x < x0 + len; x++) for (let y = y0; y < y0 + 3; y++) for (let z = z0; z < z0 + 4; z++) {
      const e = z === z0 || z === z0 + 3 || y === y0 || y === y0 + 2 || x === x0 || x === x0 + len - 1;
      if (!e) { set(x, y, z, 0); continue; }
      if (openEnd && (x === x0 || x === x0 + len - 1) && y > y0 && y < y0 + 2 && z > z0 && z < z0 + 3) { set(x, y, z, 0); continue; }
      set(x, y, z, col);
    }
  };
  for (const row of [23, 33]) {
    for (let x = 30; x <= 88; x += 8) {
      if (x >= 48 && x <= 56) continue; // место у люка
      const col = COLS[Math.floor(r() * COLS.length)];
      container(x, DECK + 1, row, 6, col, r() < 0.5);
      if (r() < 0.5) container(x + (r() < 0.5 ? 0 : 1), DECK + 4, row, 6, COLS[Math.floor(r() * COLS.length)], false);
    }
  }
  // ящики в проходе — укрытия
  for (const [x, z] of [[36, 30], [43, 28], [61, 31], [67, 29], [79, 30], [86, 28]]) { set(x, DECK + 1, z, B.CRATE); if (r() < 0.6) set(x, DECK + 1, z + 1, B.CRATE); if (r() < 0.3) set(x, DECK + 2, z, B.CRATE); }
  // --- трюм и коридор ---
  // нижняя палуба (коридор) — пол y=8, стоим на 9, потолок — палуба
  fill(X0 + 1, 8, 24, 58, 8, 36, B.STEEL);
  // коридор посередине, по бокам каюты
  for (let x = 30; x <= 58; x++) for (const z of [28, 32]) fill(x, 9, z, x, 12, z, B.BLUEMETAL);
  for (let x = 34; x <= 58; x += 6) { fill(x, 9, 24, x, 12, 27, B.BLUEMETAL); fill(x, 9, 33, x, 12, 36, B.BLUEMETAL); fill(x + 2, 9, 28, x + 3, 11, 28, 0); fill(x + 2, 9, 32, x + 3, 11, 32, 0); }
  fill(30, 9, 24, 30, 12, 36, B.BLUEMETAL); fill(30, 9, 29, 30, 11, 31, 0);
  for (let x = 32; x <= 58; x += 5) set(x, 12, 30, B.LAMP);
  for (const [x, z] of [[36, 25], [42, 35], [47, 25], [53, 35], [55, 26]]) { set(x, 9, z, B.CRATE); set(x, 10, z, r() < 0.5 ? B.CRATE : 0); }
  // отсек под надстройкой: машинное отделение
  fill(X0 + 1, 3, 23, 29, 7, 37, 0); fill(X0 + 1, 2, 23, 29, 2, 37, B.STEEL);
  fill(X0 + 1, 8, 24, 29, 8, 36, B.STEEL);
  // люк №1 на палубе: x 50..54, z 29..31, лестница вниз к коридору (y 9)
  fill(49, DECK, 29, 55, DECK, 31, 0);
  for (let k = 0; k < 4; k++) { fill(50 + k, 9, 29, 50 + k, 9 + k, 31, B.STEEL); fill(50 + k, 10 + k, 29, 50 + k, 12, 31, 0); }
  fill(54, 9, 29, 55, 12, 31, B.STEEL); fill(54, DECK, 29, 55, DECK, 31, B.STEEL);
  fill(50, 9, 29, 53, 9, 31, B.STEEL);
  // переборка коридор → трюм с дверью
  fill(59, 3, 23, 59, 12, 37, B.STEEL); fill(59, 9, 29, 59, 11, 31, 0);
  // трюм: x 60..94, пол y=3 (стоим на 4), высота до палубы
  fill(60, 3, 23, 94, 12, 37, 0);
  fill(60, 2, 23, 94, 2, 37, B.STEEL);
  fill(60, 3, 23, 94, 3, 37, B.CONCRETE);
  // мостки вдоль бортов на уровне коридора (стоим на 9)
  fill(60, 8, 23, 94, 8, 25, B.STEEL); fill(60, 8, 35, 94, 8, 37, B.STEEL);
  fill(60, 8, 26, 62, 8, 34, B.STEEL);                      // площадка у двери
  for (let x = 60; x <= 94; x += 2) { set(x, 9, 26, B.STEEL); set(x, 9, 34, B.STEEL); }
  fill(61, 9, 26, 62, 9, 34, 0);
  // лестница с площадки вниз на дно трюма
  for (let k = 0; k < 5; k++) fill(63 + k, 4, 29, 63 + k, 8 - k, 31, B.STEEL);
  fill(63, 9, 29, 67, 12, 31, 0);
  // контейнеры в трюме
  for (const [x, z, c] of [[70, 24, B.WOOL_BLUE], [70, 33, B.REDWOOD], [78, 24, B.STEEL], [78, 33, B.WOOL_RED], [70, 28, B.BLUEMETAL]]) container(x, 4, z, 6, c, true);
  // тот самый контейнер: зелёные огни
  container(86, 4, 28, 7, B.STEEL, false);
  fill(86, 5, 29, 86, 5, 30, 0); fill(86, 6, 29, 86, 6, 30, 0);
  for (const [x, z] of [[85, 27], [85, 32], [93, 27], [93, 32]]) set(x, 4, z, B.LAMP);
  for (let x = 62; x <= 92; x += 6) set(x, 12, 30, B.LAMP);
  // люк №2 (трюм открыт сверху — оттуда льётся вода)
  fill(74, DECK, 28, 78, DECK, 32, 0);
  // нос: лебёдки и якорная цепь
  fill(94, DECK + 1, 28, 96, DECK + 2, 32, B.STEEL);
  set(95, DECK + 3, 30, B.LAMP);
  const info = baseInfo('Сухогруз «Несушка-7»', 0x1a2230, 'indoor');
  info.eggs.push({ team: 0, x: 34.5, y: DECK + 1, z: 30.5, virtual: true }, { team: 1, x: 19.5, y: DECK + 11, z: 30.5, virtual: true });
  info.spawns[0].push([34.5, DECK + 1, 30.5]); info.spawns[1].push([20.5, DECK + 1, 30.5]);
  info.bases = [{ team: 0, x0: 28, x1: 40, z0: 24, z1: 36 }, { team: 1, x0: 12, x1: 26, z0: 24, z1: 36 }];
  void get;
  return info;
}

// =====================================================================
// ЧЕРНОБРОЙЛЬ — заброшенный город, туман, колесо обозрения
// =====================================================================
function genTown(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill, tree, stairwell } = tools(w);
  const G = 9;
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, G - 3, SZ - 1, B.STONE);
  fill(0, G - 2, 0, SX - 1, G - 1, SZ - 1, B.DIRT);
  fill(0, G, 0, SX - 1, G, SZ - 1, B.GRASS);
  for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
    const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
    if (edge < 3) fill(x, G + 1, z, x, G + 6, z, B.STONE);
    else if (r() < 0.06) set(x, G, z, B.DIRT);
  }
  // улицы (растрескавшийся асфальт)
  const road = (x0, z0, x1, z1) => { for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) set(x, G, z, r() < 0.12 ? B.GRASS : r() < 0.5 ? B.DARKSTONE : B.GRAVEL); };
  road(3, 68, 140, 72);       // южная дорога (патруль)
  road(60, 3, 64, 108);       // поперечная
  road(96, 3, 100, 72);       // к площади с запада
  road(30, 30, 140, 33);      // центральная
  // площадь (место встречи)
  for (let x = 104; x <= 130; x++) for (let z = 28; z <= 56; z++) set(x, G, z, (x + z) % 2 ? B.CONCRETE : B.GRAVEL);
  fill(115, G + 1, 40, 118, G + 1, 43, B.STONE); fill(116, G + 2, 41, 117, G + 6, 42, B.STONE);
  fill(115, G + 7, 41, 118, G + 7, 42, B.DARKSTONE);
  // машины на площади
  for (const [x, z] of [[108, 34], [124, 48], [110, 50], [126, 31]]) { fill(x, G + 1, z, x + 3, G + 1, z + 1, B.BLUEMETAL); fill(x + 1, G + 2, z, x + 2, G + 2, z + 1, B.GLASS); }
  // панельный дом: этажи через 3 блока, окна выбиты, внутри лестница
  const block = (x0, z0, wx, wz, floors, opts = {}) => {
    const mat = opts.mat || B.CONCRETE, H = floors * 3;
    for (let y = G + 1; y <= G + H; y++) for (let z = z0; z < z0 + wz; z++) for (let x = x0; x < x0 + wx; x++) {
      const e = x === x0 || x === x0 + wx - 1 || z === z0 || z === z0 + wz - 1;
      const fl = (y - G) % 3 === 0;
      if (fl) { set(x, y, z, e ? mat : B.CONCRETE); continue; }
      if (!e) { set(x, y, z, 0); continue; }
      const win = (y - G) % 3 === 2 || (y - G) % 3 === 1 && (x + z) % 4 === 1;
      const col = (x - x0) % 3 === 0 && (z - z0) % 3 === 0;
      set(x, y, z, !col && (y - G) % 3 !== 1 && ((x + z) % 2 === 0) ? (r() < 0.25 ? B.GLASS : 0) : mat);
      void win;
    }
    // разрушения
    if (opts.ruin) for (let i = 0; i < opts.ruin; i++) {
      const cx = x0 + Math.floor(r() * wx), cy = G + 1 + Math.floor(r() * H), cz = z0 + Math.floor(r() * wz), rr = 1.5 + r() * 2.5;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dy * dy + dz * dz < rr * rr && cy + dy > G) set(cx + dx, cy + dy, cz + dz, 0);
    }
    // вход
    const dz = opts.door === 'n' ? z0 : z0 + wz - 1;
    fill(x0 + Math.floor(wx / 2) - 1, G + 1, dz, x0 + Math.floor(wx / 2) + 1, G + 2, dz, 0);
    if (opts.stairs) stairwell(x0 + 1, z0 + 1, G, floors - 1, 3, B.CONCRETE);
    // кусты и мусор вокруг
    for (let i = 0; i < 6; i++) { const x = x0 - 1 + Math.floor(r() * (wx + 2)), z = z0 - 1 + Math.floor(r() * (wz + 2)); if (!get(x, G + 1, z)) set(x, G + 1, z, r() < 0.6 ? B.LEAVES : B.GRAVEL); }
  };
  // жилые кварталы
  const blocks = [
    [70, 10, 14, 10, 5], [70, 40, 12, 10, 4], [70, 76, 14, 10, 5], [84, 88, 10, 12, 3], [104, 76, 14, 10, 5],
    [104, 8, 14, 12, 6], [124, 8, 12, 12, 4], [136, 40, 12, 14, 5], [124, 76, 12, 10, 4], [140, 76, 12, 12, 3],
    [40, 76, 12, 10, 3], [20, 50, 10, 10, 2],
  ];
  for (const [x, z, a, b, f] of blocks) block(x, z, a, b, f, { ruin: 2 + Math.floor(r() * 3), door: z < 30 ? 's' : 'n', stairs: f >= 4 });
  // ГОСТИНИЦА «ПОЛЕСЬЕ»: 9 этажей, лестница внутри, наверху окно на восток к площади
  const HX = 40, HZ = 34, HW = 14, HD = 12, HF = 9;
  block(HX, HZ, HW, HD, HF, { mat: B.SANDBRICK, door: 's', stairs: true });
  for (let y = G + 1; y <= G + HF * 3; y++) set(HX + HW - 1, y, HZ + 6, (y - G) % 3 === 0 ? B.CONCRETE : 0); // восточные окна-щели
  fill(HX + HW - 1, G + HF * 3 - 2, HZ + 3, HX + HW - 1, G + HF * 3 - 1, HZ + 9, 0);                 // большое окно наверху
  fill(HX + 2, G + HF * 3 + 1, HZ + 2, HX + HW - 3, G + HF * 3 + 1, HZ + HD - 3, B.SANDBRICK);         // парапет крыши
  fill(HX + 3, G + HF * 3 + 1, HZ + 3, HX + HW - 4, G + HF * 3 + 1, HZ + HD - 4, 0);
  // буквы вывески на крыше (красные)
  fill(HX + 2, G + HF * 3 + 2, HZ + HD - 2, HX + HW - 3, G + HF * 3 + 3, HZ + HD - 2, B.WOOL_RED);
  for (let x = HX + 3; x < HX + HW - 3; x += 2) set(x, G + HF * 3 + 2, HZ + HD - 2, 0);
  // ПАРК С КОЛЕСОМ ОБОЗРЕНИЯ (северо-запад)
  for (let x = 6; x <= 50; x++) for (let z = 4; z <= 28; z++) if (r() < 0.2) set(x, G, z, B.GRAVEL);
  const WX = 28, WY = G + 16, WZ = 14, WR = 12;
  for (let a = 0; a < 360; a += 2) {
    const t = a * Math.PI / 180;
    const y = Math.round(WY + Math.sin(t) * WR), z = Math.round(WZ + Math.cos(t) * WR);
    set(WX, y, z, B.STEEL); set(WX + 2, y, z, B.STEEL);
    if (a % 30 === 0) {
      for (let k = 0; k <= WR; k++) { set(WX + 1, Math.round(WY + Math.sin(t) * k), Math.round(WZ + Math.cos(t) * k), B.STEEL); }
      // кабинка
      fill(WX - 1, y - 3, z - 1, WX + 3, y - 1, z + 1, a % 60 === 0 ? B.REDWOOD : B.WOOL_BLUE);
      fill(WX, y - 2, z - 1, WX + 2, y - 2, z + 1, 0); set(WX + 1, y - 1, z, B.STEEL);
    }
  }
  fill(WX - 1, WY - 1, WZ - 1, WX + 3, WY + 1, WZ + 1, B.DARKSTONE);
  for (const dz of [-7, 7]) for (let y = G + 1; y < WY; y++) { const k = (WY - y) / (WY - G); set(WX - 2, y, WZ + Math.round(dz * k), B.STEEL); set(WX + 4, y, WZ + Math.round(dz * k), B.STEEL); }
  // карусель и киоски
  fill(40, G + 1, 10, 46, G + 1, 16, B.PLANKS); fill(42, G + 2, 12, 44, G + 5, 14, B.REDWOOD); fill(39, G + 6, 9, 47, G + 6, 17, B.ROOF);
  for (const [x, z] of [[12, 8], [12, 20], [18, 26]]) { fill(x, G + 1, z, x + 2, G + 3, z + 2, B.PLANKS); fill(x, G + 4, z, x + 2, G + 4, z + 2, B.ROOF); fill(x + 1, G + 1, z, x + 1, G + 2, z, 0); }
  // площадка эвакуации у парка
  for (let x = 8; x <= 24; x++) for (let z = 32; z <= 44; z++) set(x, G, z, B.CONCRETE);
  for (const [x, z] of [[10, 34], [10, 42], [22, 34], [22, 42], [16, 33], [16, 43]]) fill(x, G + 1, z, x + 1, G + 1, z, B.SANDBAG);
  // лес и поле на юго-западе (старт)
  for (let i = 0; i < 120; i++) {
    const x = 4 + Math.floor(r() * 54), z = 74 + Math.floor(r() * 34);
    if (get(x, G + 1, z)) continue;
    if (r() < 0.45) tree(r, x, G + 1, z); else set(x, G + 1, z, B.LEAVES);
  }
  // заросли по городу
  for (let i = 0; i < 160; i++) { const x = 4 + Math.floor(r() * (SX - 8)), z = 4 + Math.floor(r() * (SZ - 8)); if (!get(x, G + 1, z) && get(x, G, z) !== B.CONCRETE) { if (r() < 0.18) tree(r, x, G + 1, z); else set(x, G + 1, z, B.LEAVES); } }
  // разбитые машины на дорогах
  for (const [x, z] of [[20, 69], [48, 70], [61, 50], [97, 60], [80, 31], [61, 20]]) { fill(x, G + 1, z, x + 2, G + 1, z + 1, r() < 0.5 ? B.BLUEMETAL : B.REDWOOD); set(x + 1, G + 2, z, B.GLASS); }
  // фонари-столбы (не горят — города больше нет)
  for (let x = 10; x < 140; x += 14) { set(x, G + 1, 67, B.STEEL); set(x, G + 2, 67, B.STEEL); set(x, G + 3, 67, B.STEEL); }
  const info = baseInfo('Чернобройль', 0xb9c4c0, 'open');
  info.eggs.push({ team: 0, x: 16.5, y: G + 1, z: 38.5, virtual: true }, { team: 1, x: 116.5, y: G + 1, z: 46.5, virtual: true });
  info.spawns[0].push([10.5, G + 1, 100.5]); info.spawns[1].push([116.5, G + 1, 46.5]);
  info.bases = [{ team: 0, x0: 4, x1: 30, z0: 30, z1: 46 }, { team: 1, x0: 104, x1: 130, z0: 28, z1: 56 }];
  return info;
}

// =====================================================================
// ОБЪЕКТ «ДУХОВКА» — авиабаза на закате и ракетная шахта
// =====================================================================
function genBase(w, seed) {
  const r = mulberry(seed);
  const { set, get, fill, shell, stairwell } = tools(w);
  const G = 17;
  fill(0, 0, 0, SX - 1, 0, SZ - 1, B.BEDROCK);
  fill(0, 1, 0, SX - 1, G - 3, SZ - 1, B.STONE);
  fill(0, G - 2, 0, SX - 1, G - 1, SZ - 1, B.SAND);
  for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
    set(x, G, z, r() < 0.15 ? B.GRAVEL : r() < 0.4 ? B.DIRT : B.SAND);
    const edge = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
    if (edge < 3) fill(x, G + 1, z, x, G + 5 - edge, z, B.SANDSTONE);
  }
  // взлётная полоса с разметкой
  for (let x = 6; x <= SX - 7; x++) for (let z = 70; z <= 80; z++) set(x, G, z, (z === 75 && x % 6 < 3) ? B.SNOW : (z === 70 || z === 80) ? B.SANDBRICK : B.CONCRETE);
  for (let x = 6; x <= SX - 7; x++) for (const z of [64, 65]) set(x, G, z, B.CONCRETE); // рулёжка
  for (let x = 20; x <= 104; x++) for (let z = 58; z <= 66; z++) set(x, G, z, B.CONCRETE);
  // ангары с полукруглой крышей, открыты к полосе (на юг)
  const hangar = (x0, x1, z0, z1) => {
    const cx = (x0 + x1) / 2, R = (x1 - x0) / 2;
    for (let x = x0; x <= x1; x++) {
      const hh = Math.round(Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx))) * 0.8);
      for (let z = z0; z <= z1; z++) {
        set(x, G, z, B.CONCRETE);
        set(x, G + 3 + hh, z, (z % 4 === 0) ? B.STEEL : B.BLUEMETAL);
        if (x === x0 || x === x1) fill(x, G + 1, z, x, G + 3 + hh, z, B.BLUEMETAL);
        if (z === z0) fill(x, G + 1, z, x, G + 2 + hh, z, B.BLUEMETAL);
      }
    }
    for (let x = x0 + 3; x <= x1 - 3; x += 6) set(x, G + 3, z0 + 1, B.LAMP);
    // самолёт внутри
    const px = Math.round(cx);
    fill(px - 1, G + 1, z0 + 3, px + 1, G + 3, z1 - 2, B.STEEL);          // фюзеляж
    fill(x0 + 2, G + 2, z0 + 9, x1 - 2, G + 2, z0 + 11, B.STEEL);          // крылья
    fill(px, G + 4, z0 + 3, px, G + 6, z0 + 5, B.STEEL);                   // киль
    fill(px - 1, G + 2, z1 - 2, px + 1, G + 3, z1 - 1, B.GLASS);           // фонарь кабины
    for (const [x, z] of [[x0 + 2, z1 - 2], [x1 - 2, z0 + 2], [x0 + 2, z0 + 2]]) { set(x, G + 1, z, B.CRATE); set(x, G + 2, z, B.CRATE); }
  };
  hangar(14, 34, 38, 56); hangar(44, 64, 38, 56); hangar(74, 94, 38, 56);
  // топливные цистерны (ТНТ!) и бочки
  for (const [x, z] of [[100, 26], [104, 26], [100, 30]]) { fill(x, G + 1, z, x + 2, G + 3, z + 2, B.STEEL); set(x + 1, G + 4, z + 1, B.TNT); }
  for (const [x, z] of [[38, 62], [70, 60], [96, 62], [108, 60], [12, 62], [120, 66]]) { set(x, G + 1, z, B.TNT); set(x + 1, G + 1, z, B.CRATE); set(x, G + 1, z + 1, B.CRATE); }
  // укрепления: мешки и ящики на подходах
  for (const [x, z] of [[40, 66], [68, 66], [100, 67], [112, 58], [118, 40], [124, 54], [30, 30], [60, 30], [88, 32]]) { fill(x, G + 1, z, x + 3, G + 1, z, B.SANDBAG); set(x + 1, G + 2, z, B.SANDBAG); }
  // забор с вышками по периметру
  for (let x = 4; x < SX - 4; x++) for (const z of [4]) { set(x, G + 1, z, B.PLANKS); if (x % 3 === 0) set(x, G + 2, z, B.PLANKS); }
  for (const [x, z] of [[8, 8], [70, 8], [150, 8]]) { for (const [a, b] of [[0, 0], [2, 0], [0, 2], [2, 2]]) fill(x + a, G + 1, z + b, x + a, G + 7, z + b, B.LOG); fill(x - 1, G + 8, z - 1, x + 3, G + 8, z + 3, B.PLANKS); for (let k = 0; k < 5; k++) set(x - 1 + k, G + 9, z - 1, B.SANDBAG); set(x + 1, G + 9, z + 1, B.LAMP); }
  // КОМАНДНО-ДИСПЕТЧЕРСКАЯ ВЫШКА: 6 этажей, наверху стеклянный зал управления
  const TX = 110, TZ = 42, TW = 10, TD = 10, TF = 6;
  for (let f = 0; f < TF; f++) shell(TX, G + f * 3, TZ, TX + TW - 1, G + f * 3 + 3, TZ + TD - 1, B.CONCRETE, B.CONCRETE, null);
  stairwell(TX + 1, TZ + 1, G, TF, 3, B.CONCRETE);
  fill(TX + 4, G + 1, TZ + TD - 1, TX + 5, G + 2, TZ + TD - 1, 0);                               // вход с юга
  for (let f = 1; f < TF; f++) for (let x = TX + 6; x < TX + TW - 1; x += 2) set(x, G + f * 3 + 2, TZ, B.GLASS);
  const top = G + TF * 3;
  fill(TX - 1, top, TZ - 1, TX + TW, top, TZ + TD, B.CONCRETE);
  for (let x = TX - 1; x <= TX + TW; x++) for (let z = TZ - 1; z <= TZ + TD; z++) {
    const e = x === TX - 1 || x === TX + TW || z === TZ - 1 || z === TZ + TD;
    if (e) { set(x, top + 1, z, B.STEEL); fill(x, top + 2, z, x, top + 3, z, B.GLASS); set(x, top + 4, z, B.STEEL); }
  }
  fill(TX - 1, top + 5, TZ - 1, TX + TW, top + 5, TZ + TD, B.STEEL);
  fill(TX + 3, top, TZ + 1, TX + 6, top, TZ + 4, 0);   // проём лестницы (площадка у её верха — x TX+1..TX+2)
  fill(TX + 3, top + 1, TZ + 6, TX + 8, top + 1, TZ + 6, B.BLUEMETAL); set(TX + 5, top + 2, TZ + 6, B.LAMP); // пульт пуска
  fill(TX + 4, top + 6, TZ + 4, TX + 4, top + 10, TZ + 4, B.STEEL); set(TX + 4, top + 11, TZ + 4, B.LAMP);
  // БУНКЕР И ШАХТА: вход у вышки, спуск под землю, шахта с ракетой
  const BX = 124, BZ = 34;
  shell(BX, G, BZ, BX + 6, G + 4, BZ + 6, B.CONCRETE, B.CONCRETE, B.CONCRETE);
  fill(BX, G + 1, BZ + 2, BX, G + 3, BZ + 4, 0);                                                  // дверь с запада
  // лестница вниз вдоль z (на север): от G до y = 6
  const yb = 6;
  for (let k = 0; k <= G - yb; k++) {
    const z = BZ + 4 - k, y = G - k;
    if (z < BZ - 10) break;
    fill(BX + 2, y - 1, z, BX + 4, y - 1, z, B.CONCRETE);
    fill(BX + 2, y, z, BX + 4, y + 3, z, 0);
    fill(BX + 1, y - 1, z, BX + 1, y + 3, z, B.CONCRETE); fill(BX + 5, y - 1, z, BX + 5, y + 3, z, B.CONCRETE);
    if (k % 4 === 2) set(BX + 1, y + 2, z, B.LAMP);
  }
  // коридор на нижнем уровне к шахте (на восток)
  const cz0 = BZ - 7, cy = G - 11; // y пола коридора
  fill(BX + 1, cy - 1, cz0 - 2, BX + 20, cy + 4, cz0 + 2, B.CONCRETE);
  fill(BX + 2, cy, cz0 - 1, BX + 20, cy + 3, cz0 + 1, 0);
  for (let x = BX + 4; x <= BX + 18; x += 5) set(x, cy + 3, cz0, B.LAMP);
  // шахта: 9×9 от дна до поверхности, открыта сверху (створки разъехались)
  const SX0 = BX + 16, SZ0 = cz0 - 4;
  fill(SX0 - 1, 1, SZ0 - 1, SX0 + 9, G, SZ0 + 9, B.STEEL);
  fill(SX0, 2, SZ0, SX0 + 8, G + 6, SZ0 + 8, 0);
  fill(SX0 - 3, G, SZ0 - 3, SX0 + 11, G, SZ0 + 11, B.CONCRETE); fill(SX0, G, SZ0, SX0 + 8, G, SZ0 + 8, 0);
  fill(SX0 - 3, G + 1, SZ0 - 2, SX0 - 3, G + 1, SZ0 + 10, B.STEEL); fill(SX0 + 11, G + 1, SZ0 - 2, SX0 + 11, G + 1, SZ0 + 10, B.STEEL); // створки
  // ракета: колонна 3×3 со стабилизаторами; «Яйцо-2» — боеголовка наверху (ставит миссия)
  fill(SX0 + 3, 2, SZ0 + 3, SX0 + 5, cy + 2, SZ0 + 5, B.STEEL);
  for (const [dx, dz] of [[-1, 1], [3, 1], [1, -1], [1, 3]]) fill(SX0 + 3 + dx + (dx < 0 ? 0 : 0), 2, SZ0 + 3 + dz, SX0 + 3 + dx, 6, SZ0 + 3 + dz, B.REDWOOD);
  fill(SX0 + 3, cy + 3, SZ0 + 3, SX0 + 5, cy + 3, SZ0 + 5, B.WOOL_RED);
  // мостки вокруг ракеты на уровне коридора
  fill(SX0, cy - 1, SZ0, SX0 + 8, cy - 1, SZ0 + 8, B.STEEL); fill(SX0 + 2, cy - 1, SZ0 + 2, SX0 + 6, cy - 1, SZ0 + 6, 0);
  fill(SX0 + 3, cy - 1, SZ0 + 3, SX0 + 5, cy - 1, SZ0 + 5, B.STEEL);
  fill(SX0 - 1, cy, cz0 - 1, SX0 - 1, cy + 3, cz0 + 1, 0); // вход в шахту из коридора
  for (const [x, z] of [[SX0, SZ0], [SX0 + 8, SZ0], [SX0, SZ0 + 8], [SX0 + 8, SZ0 + 8]]) set(x, cy + 2, z, B.LAMP);
  // вертолётная площадка Шпоры в конце полосы
  for (let x = 140; x <= 152; x++) for (let z = 82; z <= 92; z++) set(x, G, z, (Math.abs(x - 146) <= 1 && z >= 84 && z <= 90) || ((x === 144 || x === 148) && z >= 84 && z <= 90) || (z === 87 && x >= 144 && x <= 148) ? B.SNOW : B.CONCRETE);
  void get;
  const info = baseInfo('Объект «Духовка»', 0xf0a070, 'desert');
  const egg = { x: SX0 + 4.5, y: cy + 4, z: SZ0 + 4.5 };
  info.eggs.push({ team: 0, x: 12.5, y: G + 1, z: 86.5, virtual: true }, { team: 1, x: egg.x, y: egg.y, z: egg.z, virtual: true });
  info.spawns[0].push([12.5, G + 1, 86.5]); info.spawns[1].push([120.5, G + 1, 50.5]);
  info.bases = [{ team: 0, x0: 6, x1: 30, z0: 80, z1: 92 }, { team: 1, x0: 100, x1: 150, z0: 20, z1: 60 }];
  info.silo = { x0: SX0, z0: SZ0, cy, cz0, egg, bunker: [BX, BZ], tower: [TX, TZ, top] };
  return info;
}

export const CAMP_MAPS = {
  camp: { size: [112, 40, 60], gen: genCamp },
  ship: { size: [112, 40, 60], gen: genShip },
  town: { size: [160, 48, 112], gen: genTown },
  base: { size: [160, 48, 96], gen: genBase },
};

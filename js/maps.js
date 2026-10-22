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

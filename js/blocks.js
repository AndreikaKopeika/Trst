// Типы блоков и процедурный атлас текстур (16x16 пикселей на тайл).
import * as THREE from './lib/three.module.min.js';

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

// Номера тайлов в атласе
const T = {
  grassTop: 0, grassSide: 1, dirt: 2, stone: 3, sand: 4, logSide: 5, logTop: 6, leaves: 7,
  planks: 8, brick: 9, concrete: 10, steel: 11, glass: 12, woolRed: 13, woolBlue: 14, bedrock: 15,
  sandbag: 16, tntSide: 17, tntTop: 18, gravel: 19, darkStone: 20, crate: 21, snow: 22, lamp: 23,
  sandstone: 24, sandstoneTop: 25, sandBrick: 26, water: 27, roof: 28, door: 29, redWood: 30, blueMetal: 31,
};

// hp — прочность; cost — цена постройки; ric — рикошет; tough — множитель урона от взрывов
export const BLOCKS = [
  null, // 0 = воздух
  { id: 1, name: 'Трава', hp: 40, tiles: [T.grassTop, T.dirt, T.grassSide], color: 0x5b9a3c },
  { id: 2, name: 'Земля', hp: 40, tiles: [T.dirt, T.dirt, T.dirt], color: 0x7a5232 },
  { id: 3, name: 'Камень', hp: 160, tiles: [T.stone, T.stone, T.stone], color: 0x8a8a8a, ric: 0.35, cost: 2 },
  { id: 4, name: 'Песок', hp: 30, tiles: [T.sand, T.sand, T.sand], color: 0xd9c98a },
  { id: 5, name: 'Бревно', hp: 90, tiles: [T.logTop, T.logTop, T.logSide], color: 0x6b4a2b },
  { id: 6, name: 'Листва', hp: 10, tiles: [T.leaves, T.leaves, T.leaves], color: 0x3f7f2f },
  { id: 7, name: 'Доски', hp: 70, tiles: [T.planks, T.planks, T.planks], color: 0xb08850, cost: 1 },
  { id: 8, name: 'Кирпич', hp: 150, tiles: [T.brick, T.brick, T.brick], color: 0xa04a3a, ric: 0.1, cost: 2 },
  { id: 9, name: 'Бетон', hp: 260, tiles: [T.concrete, T.concrete, T.concrete], color: 0xb4b4b0, ric: 0.25, cost: 3 },
  { id: 10, name: 'Сталь', hp: 520, tiles: [T.steel, T.steel, T.steel], color: 0x9aa4ad, ric: 0.8, tough: 0.5, cost: 5 },
  { id: 11, name: 'Стекло', hp: 8, tiles: [T.glass, T.glass, T.glass], color: 0xbfe8ff, glass: true, cost: 1 },
  { id: 12, name: 'Красная шерсть', hp: 50, tiles: [T.woolRed, T.woolRed, T.woolRed], color: 0xc8302c, cost: 1 },
  { id: 13, name: 'Синяя шерсть', hp: 50, tiles: [T.woolBlue, T.woolBlue, T.woolBlue], color: 0x2c55c8, cost: 1 },
  { id: 14, name: 'Бедрок', hp: Infinity, tiles: [T.bedrock, T.bedrock, T.bedrock], color: 0x333333, ric: 0.5 },
  { id: 15, name: 'Мешки', hp: 200, tiles: [T.sandbag, T.sandbag, T.sandbag], color: 0xc2a774, tough: 0.25, cost: 2 },
  { id: 16, name: 'ТНТ', hp: 20, tiles: [T.tntTop, T.tntTop, T.tntSide], color: 0xd23a2a, explosive: true, cost: 6 },
  { id: 17, name: 'Гравий', hp: 35, tiles: [T.gravel, T.gravel, T.gravel], color: 0x857d78 },
  { id: 18, name: 'Тёмный камень', hp: 220, tiles: [T.darkStone, T.darkStone, T.darkStone], color: 0x55555c, ric: 0.4 },
  { id: 19, name: 'Ящик', hp: 60, tiles: [T.crate, T.crate, T.crate], color: 0x9c7038, cost: 1 },
  { id: 20, name: 'Снег', hp: 25, tiles: [T.snow, T.dirt, T.snow], color: 0xf2f6ff },
  { id: 21, name: 'Фонарь', hp: 30, tiles: [T.lamp, T.lamp, T.lamp], color: 0xffd36b, glow: true, cost: 2 },
  { id: 22, name: 'Песчаник', hp: 150, tiles: [T.sandstoneTop, T.sandstoneTop, T.sandstone], color: 0xd8c08a, ric: 0.2, mat: 'stone' },
  { id: 23, name: 'Кирпич песчаника', hp: 190, tiles: [T.sandstoneTop, T.sandstoneTop, T.sandBrick], color: 0xc9ad74, ric: 0.25, mat: 'stone' },
  { id: 24, name: 'Вода', hp: Infinity, tiles: [T.water, T.water, T.water], color: 0x3a7bd5, glass: true, liquid: true, mat: 'soft' },
  { id: 25, name: 'Черепица', hp: 90, tiles: [T.roof, T.roof, T.roof], color: 0x8a3a2a, mat: 'stone' },
  { id: 26, name: 'Дверь', hp: 80, tiles: [T.door, T.door, T.door], color: 0x2f5f9a, mat: 'wood' },
  { id: 27, name: 'Красные доски', hp: 90, tiles: [T.planks, T.planks, T.redWood], color: 0xa8442f, mat: 'wood' },
  { id: 28, name: 'Синий металл', hp: 320, tiles: [T.concrete, T.concrete, T.blueMetal], color: 0x46679a, ric: 0.6, mat: 'metal' },
];

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, PLANKS: 7, BRICK: 8, CONCRETE: 9,
  STEEL: 10, GLASS: 11, WOOL_RED: 12, WOOL_BLUE: 13, BEDROCK: 14, SANDBAG: 15, TNT: 16, GRAVEL: 17,
  DARKSTONE: 18, CRATE: 19, SNOW: 20, LAMP: 21,
  SANDSTONE: 22, SANDBRICK: 23, WATER: 24, ROOF: 25, DOOR: 26, REDWOOD: 27, BLUEMETAL: 28,
};
// таблицы свойств по id: твёрдый (для физики), жидкость
export const SOLID = new Uint8Array(256), LIQUID = new Uint8Array(256);
for (let i = 1; i < 256; i++) { const d = BLOCKS[i]; if (d) { SOLID[i] = d.liquid ? 0 : 1; LIQUID[i] = d.liquid ? 1 : 0; } }

// Что можно строить (панель блоков)
export const BUILDABLE = [B.PLANKS, B.BRICK, B.CONCRETE, B.STEEL, B.GLASS, -1 /* шерсть команды */, B.SANDBAG, B.TNT, B.LAMP];

// ---------- генерация атласа ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

function paintTile(ctx, tile, fn) {
  const ox = (tile % ATLAS_COLS) * TILE, oy = Math.floor(tile / ATLAS_COLS) * TILE;
  const img = ctx.createImageData(TILE, TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const c = fn(x, y);
    const i = (y * TILE + x) * 4;
    img.data[i] = Math.max(0, Math.min(255, c[0]));
    img.data[i + 1] = Math.max(0, Math.min(255, c[1]));
    img.data[i + 2] = Math.max(0, Math.min(255, c[2]));
    img.data[i + 3] = c[3] === undefined ? 255 : c[3];
  }
  ctx.putImageData(img, ox, oy);
}

function noisy(base, amt, r) {
  const [R, G, Bc] = hex(base);
  const n = (r() - 0.5) * amt;
  return [R + n, G + n, Bc + n];
}
function mul(c, k) { return [c[0] * k, c[1] * k, c[2] * k, c[3]]; }

export function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = TILE * ATLAS_COLS; cv.height = TILE * ATLAS_ROWS;
  const ctx = cv.getContext('2d');
  const r = rng(1337);

  paintTile(ctx, T.grassTop, () => noisy(r() < 0.1 ? 0x6fb04a : 0x5b9a3c, 36, r));
  paintTile(ctx, T.dirt, () => noisy(r() < 0.12 ? 0x5e3e24 : 0x7a5232, 30, r));
  paintTile(ctx, T.grassSide, (x, y) => {
    const edge = 3 + ((x * 7) % 3 === 0 ? 1 : 0) + (x % 5 === 0 ? 1 : 0);
    if (y < edge) return noisy(0x5b9a3c, 30, r);
    return noisy(r() < 0.12 ? 0x5e3e24 : 0x7a5232, 30, r);
  });
  paintTile(ctx, T.stone, (x, y) => {
    const crack = ((x + y * 3) % 11 === 0 || (x * 5 + y) % 13 === 0) && r() < 0.6;
    return noisy(crack ? 0x6a6a6a : 0x8a8a8a, 26, r);
  });
  paintTile(ctx, T.darkStone, (x, y) => noisy(((x ^ y) & 4) && r() < 0.3 ? 0x45454c : 0x55555c, 22, r));
  paintTile(ctx, T.sand, () => noisy(0xd9c98a, 22, r));
  paintTile(ctx, T.gravel, () => noisy([0x857d78, 0x6d6762, 0x9c958f][Math.floor(r() * 3)], 20, r));
  paintTile(ctx, T.snow, () => noisy(0xf2f6ff, 10, r));
  paintTile(ctx, T.logSide, (x) => noisy((x % 4 === 0) ? 0x4f3620 : 0x6b4a2b, 20, r));
  paintTile(ctx, T.logTop, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7) return noisy(0x4f3620, 15, r);
    return noisy(Math.floor(d) % 2 ? 0xb08850 : 0x9a7444, 14, r);
  });
  paintTile(ctx, T.leaves, () => noisy(r() < 0.25 ? 0x2e6322 : 0x3f7f2f, 30, r));
  paintTile(ctx, T.planks, (x, y) => {
    const seam = y % 4 === 3;
    const nail = (y % 4 === 1) && (x === 2 || x === 13);
    const off = ((Math.floor(y / 4) % 2) ? 8 : 0);
    const vseam = (x + off) % 16 === 0;
    if (seam || vseam) return noisy(0x6e5230, 10, r);
    if (nail) return [80, 70, 60];
    return noisy(0xb08850, 18, r);
  });
  paintTile(ctx, T.crate, (x, y) => {
    const border = x < 2 || y < 2 || x > 13 || y > 13;
    const diag = Math.abs(x - y) < 1.5 || Math.abs(x - (15 - y)) < 1.5;
    if (border || diag) return noisy(0x6e4a24, 14, r);
    return noisy(0x9c7038, 16, r);
  });
  paintTile(ctx, T.brick, (x, y) => {
    const row = Math.floor(y / 4);
    const off = row % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    if (mortar) return noisy(0xc9c1b4, 14, r);
    return noisy(r() < 0.15 ? 0x8a3a2c : 0xa04a3a, 22, r);
  });
  paintTile(ctx, T.concrete, (x, y) => noisy((x % 8 === 0 && y % 8 === 0) ? 0x8c8c88 : 0xb4b4b0, 12, r));
  paintTile(ctx, T.steel, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
    const shine = (x + y) % 9 === 0 ? 18 : 0;
    if (border) return [90, 98, 105];
    if (rivet) return [200, 210, 220];
    const c = noisy(0x9aa4ad, 10, r);
    return [c[0] + shine, c[1] + shine, c[2] + shine];
  });
  paintTile(ctx, T.glass, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const glint = (x - y === 4 || x - y === 5) && x > 3 && x < 12;
    if (border) return [210, 240, 255, 255];
    if (glint) return [255, 255, 255, 200];
    return [190, 230, 255, 70];
  });
  paintTile(ctx, T.woolRed, () => noisy(0xc8302c, 26, r));
  paintTile(ctx, T.woolBlue, () => noisy(0x2c55c8, 26, r));
  paintTile(ctx, T.bedrock, () => noisy(r() < 0.4 ? 0x1c1c1c : 0x444444, 30, r));
  paintTile(ctx, T.sandbag, (x, y) => {
    const row = Math.floor(y / 5);
    const off = row % 2 ? 4 : 0;
    const seam = y % 5 === 4 || (x + off) % 8 === 7;
    if (seam) return noisy(0x8a7550, 12, r);
    return noisy(0xc2a774, 18, r);
  });
  paintTile(ctx, T.tntSide, (x, y) => {
    if (y >= 5 && y <= 10) {
      // Белая лента с буквами
      const letters = [
        '111.1..1.111',
        '.1..11.1..1.',
        '.1..1.11..1.',
        '.1..1..1..1.',
      ];
      const lx = x - 2, ly = y - 6;
      if (ly >= 0 && ly < 4 && lx >= 0 && lx < 12 && letters[ly][lx] === '1') return [20, 20, 20];
      return noisy(0xf0f0f0, 8, r);
    }
    return noisy(x % 4 === 0 ? 0xa82a1e : 0xd23a2a, 16, r);
  });
  paintTile(ctx, T.tntTop, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 2) return [40, 40, 40];
    return noisy(0xd23a2a, 16, r);
  });
  paintTile(ctx, T.lamp, (x, y) => {
    const border = x < 2 || y < 2 || x > 13 || y > 13;
    if (border) return noisy(0x5a4a30, 10, r);
    const d = Math.hypot(x - 7.5, y - 7.5);
    return noisy(d < 4 ? 0xfff2b0 : 0xffc84a, 14, r);
  });

  paintTile(ctx, T.sandstone, (x, y) => {
    const band = (y % 5 === 4) ? -18 : (y % 5 === 0 ? 8 : 0);
    const c = noisy(0xd8c08a, 14, r); return [c[0] + band, c[1] + band, c[2] + band];
  });
  paintTile(ctx, T.sandstoneTop, () => noisy(r() < 0.1 ? 0xcdb57c : 0xdcc690, 12, r));
  paintTile(ctx, T.sandBrick, (x, y) => {
    const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
    if (y % 4 === 3 || (x + off) % 8 === 7) return noisy(0xa88c58, 10, r);
    return noisy(0xc9ad74, 14, r);
  });
  paintTile(ctx, T.water, (x, y) => {
    const w = Math.sin((x + y * 0.5) * 0.8) * 10 + Math.sin(y * 1.3) * 6;
    return [40 + w, 110 + w, 200 + w, 150];
  });
  paintTile(ctx, T.roof, (x, y) => {
    const row = Math.floor(y / 4), off = row % 2 ? 2 : 0;
    if (y % 4 === 3) return noisy(0x5a2418, 10, r);
    if ((x + off) % 4 === 3) return noisy(0x6e2c1e, 10, r);
    return noisy(0x9a4030, 16, r);
  });
  paintTile(ctx, T.door, (x, y) => {
    const frame = x < 1 || x > 14 || y < 1 || y > 14, plank = x % 5 === 0;
    if (frame) return noisy(0x3a2a18, 10, r);
    if (plank) return noisy(0x23476f, 10, r);
    if ((x === 12 || x === 3) && y === 8) return [200, 180, 90];
    return noisy(0x2f5f9a, 14, r);
  });
  paintTile(ctx, T.redWood, (x, y) => {
    if (y % 4 === 3) return noisy(0x5a1e14, 10, r);
    const worn = r() < 0.08 ? 40 : 0;
    const c = noisy(0xa8442f, 16, r); return [c[0] + worn, c[1] + worn, c[2] + worn];
  });
  paintTile(ctx, T.blueMetal, (x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) return [40, 52, 72];
    if ((x === 3 || x === 12) && (y === 3 || y === 12)) return [170, 185, 205];
    if (y === 8) return noisy(0x3a5888, 6, r);
    return noisy(0x46679a, 10, r);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, canvas: cv };
}

// UV-координаты тайла с небольшим отступом от краёв
export function tileUV(tile) {
  const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
  const eps = 0.02;
  const u0 = (col + eps) / ATLAS_COLS, u1 = (col + 1 - eps) / ATLAS_COLS;
  const v1 = 1 - (row + eps) / ATLAS_ROWS, v0 = 1 - (row + 1 - eps) / ATLAS_ROWS;
  return [u0, v0, u1, v1];
}

export function teamWool(team) { return team === 0 ? B.WOOL_RED : B.WOOL_BLUE; }

// Прямоугольник иконки блока на атласе (для панели строительства)
export function blockIconStyle(id, atlasURL) {
  const tile = BLOCKS[id].tiles[2];
  const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
  return `background-image:url(${atlasURL});background-size:${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%;` +
    `background-position:${(col / (ATLAS_COLS - 1)) * 100}% ${(row / (ATLAS_ROWS - 1)) * 100}%;image-rendering:pixelated;`;
}

// Материал блока для звуков шагов и попаданий
const MATS = { 1: 'grass', 2: 'soft', 3: 'stone', 4: 'sand', 5: 'wood', 6: 'grass', 7: 'wood', 8: 'stone', 9: 'stone', 10: 'metal',
  11: 'glass', 12: 'soft', 13: 'soft', 14: 'stone', 15: 'sand', 16: 'wood', 17: 'sand', 18: 'stone', 19: 'wood', 20: 'sand', 21: 'glass' };
export function matOf(id) { return (BLOCKS[id] && BLOCKS[id].mat) || MATS[id] || 'stone'; }
